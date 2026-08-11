[CmdletBinding()]
param(
  [Parameter()]
  [string]$ProjectRoot = (Get-Location).Path,

  [Parameter()]
  [switch]$WhatIf,

  [Parameter()]
  [string]$RollbackManifest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$PackageId = "npm:pi-subagents@0.46.0"
$RoleNames = @("trellis-implement", "trellis-check", "trellis-research")
$TelemetryRelativePath = ".pi/extensions/context-telemetry/index.ts"
$TelemetryExtensionReference = "./.pi/extensions/context-telemetry/index.ts"
$LegacyTaskLine = '1. **Look at the dispatch prompt** you received from the main agent. If its first line is `Active task: <path>` (e.g. `Active task: .trellis/tasks/04-17-foo`), use that path. The main agent is required to include this line on class-2 platforms.'
$MigratedTaskLine = '1. **Look at the dispatch prompt** you received from the main agent. Accept either an exact first line `Active task: <path>` or pi-subagents'' package-owned transport form `Task: Active task: <path>`. For the transport form, strip exactly one leading `Task: ` and require `Active task:` to remain the first line of the underlying task payload. Use that path and stop resolving; reject any other prefix.'
$LegacyResearchTaskLine = '1. Resolve the active task with `python3 ./.trellis/scripts/task.py current --source`.'
$MigratedResearchTaskLines = @'
1. Resolve the active task from the dispatch message before using any fallback. Accept either an exact first line `Active task: <path>` or pi-subagents' package-owned transport form `Task: Active task: <path>`. For the transport form, strip exactly one leading `Task: ` and require `Active task:` to remain the first line of the underlying task payload. Reject any other prefix.
2. Only when the dispatch message has no accepted task identity, run `python3 ./.trellis/scripts/task.py current --source` and read the `Current task:` line. Never let fallback state override explicit dispatch identity.
'@.TrimEnd()

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Get-TextSha256([string]$Text) {
  $bytes = $Utf8NoBom.GetBytes($Text)
  $hash = [System.Security.Cryptography.SHA256]::HashData($bytes)
  return [Convert]::ToHexString($hash)
}

function Read-Utf8Text([string]$Path) {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
  try {
    return $strictUtf8.GetString($bytes)
  } catch {
    throw "File is not valid UTF-8: $Path"
  }
}

function Write-AtomicText([string]$Path, [string]$Content) {
  $directory = [System.IO.Path]::GetDirectoryName($Path)
  [System.IO.Directory]::CreateDirectory($directory) | Out-Null
  $temporary = [System.IO.Path]::Combine($directory, ".trellis-migrate-$([guid]::NewGuid().ToString('N')).tmp")
  try {
    [System.IO.File]::WriteAllText($temporary, $Content, $Utf8NoBom)
    [System.IO.File]::Move($temporary, $Path, $true)
  } finally {
    if ([System.IO.File]::Exists($temporary)) {
      [System.IO.File]::Delete($temporary)
    }
  }
}

function Resolve-InRoot([string]$Root, [string]$RelativePath) {
  if ([System.IO.Path]::IsPathRooted($RelativePath)) {
    throw "Manifest path must be project-relative: $RelativePath"
  }
  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  $candidate = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($rootFull, $RelativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)))
  if (-not $candidate.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path escapes project root: $RelativePath"
  }
  return $candidate
}

function Read-Json([string]$Path) {
  try {
    return Read-Utf8Text $Path | ConvertFrom-Json -Depth 100
  } catch {
    throw "Invalid JSON in ${Path}: $($_.Exception.Message)"
  }
}

function Get-HashMap([string]$Root) {
  $path = Join-Path $Root ".trellis/.template-hashes.json"
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Required template hash file is missing: $path"
  }
  $document = Read-Json $path
  if ($null -eq $document.hashes) {
    throw "Template hash file has no hashes object: $path"
  }
  return $document.hashes
}

function Get-StoredHash($Hashes, [string]$RelativePath) {
  $property = $Hashes.PSObject.Properties[$RelativePath]
  if ($null -eq $property -or $property.Value -notmatch '^[A-Fa-f0-9]{64}$') {
    throw "No valid stored template SHA256 for $RelativePath"
  }
  return ([string]$property.Value).ToUpperInvariant()
}

function Assert-ProjectPreflight([string]$Root) {
  if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
    throw "Project root does not exist: $Root"
  }
  $versionPath = Join-Path $Root ".trellis/.version"
  if (-not (Test-Path -LiteralPath $versionPath -PathType Leaf)) {
    throw "Required Trellis version file is missing: $versionPath"
  }
  $version = (Read-Utf8Text $versionPath).Trim()
  if ($version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') {
    throw "Unrecognized Trellis version '$version'"
  }
  return $version
}

function Get-Frontmatter([string]$Content, [string]$RelativePath) {
  $match = [regex]::Match($Content, '\A(?:\uFEFF)?---\r?\n(?<frontmatter>[\s\S]*?)\r?\n---\r?\n?')
  if (-not $match.Success) {
    throw "Invalid or missing frontmatter in $RelativePath"
  }
  return $match
}

function Set-FrontmatterValue([string]$Frontmatter, [string]$Key, [string]$Value) {
  $pattern = "(?m)^$([regex]::Escape($Key))\s*:.*$"
  if ([regex]::IsMatch($Frontmatter, $pattern)) {
    return [regex]::Replace($Frontmatter, $pattern, "${Key}: $Value", 1)
  }
  return $Frontmatter.TrimEnd("`r", "`n") + "`n${Key}: $Value"
}

function Test-RoleContract([string]$Content, [string]$Name) {
  try {
    $match = Get-Frontmatter $Content ".pi/agents/$Name.md"
  } catch {
    return $false
  }
  $frontmatter = $match.Groups['frontmatter'].Value
  $expectedAcceptance = if ($Name -eq "trellis-research") {
    'acceptance: {"level":"attested","evidence":["changed-files","review-findings","residual-risks"],"review":false}'
  } elseif ($Name -eq "trellis-check") {
    'acceptance: {"level":"checked","evidence":["changed-files","commands-run","validation-output","review-findings","residual-risks"],"review":false}'
  } else {
    'acceptance: {"level":"checked","evidence":["changed-files","commands-run","validation-output","residual-risks"],"review":false}'
  }
  $checks = @(
    "(?m)^name\s*:\s*$([regex]::Escape($Name))\s*$",
    '(?m)^tools\s*:\s*read, write, edit, bash\s*$',
    "(?m)^extensions\s*:\s*$([regex]::Escape($TelemetryExtensionReference))\s*$",
    '(?m)^thinking\s*:\s*medium\s*$',
    '(?m)^defaultContext\s*:\s*fresh\s*$',
    '(?m)^maxSubagentDepth\s*:\s*0\s*$',
    '(?m)^nestedPiBoundary\s*:\s*unenforced\s*$',
    "(?m)^$([regex]::Escape($expectedAcceptance))\s*$",
    '(?m)^acceptanceRole\s*:\s*writer\s*$'
  )
  foreach ($check in $checks) {
    if ($frontmatter -notmatch $check) { return $false }
  }
  return $Content.Contains('Task: Active task: <path>') -and
    $Content.Contains('strip exactly one leading `Task: `') -and
    $Content.Contains('do not create an OS sandbox')
}

function Convert-Role([string]$Content, [string]$Name, [string]$RelativePath) {
  $match = Get-Frontmatter $Content $RelativePath
  $frontmatter = $match.Groups['frontmatter'].Value
  if ($frontmatter -notmatch "(?m)^name\s*:\s*$([regex]::Escape($Name))\s*$") {
    throw "Role identity mismatch in $RelativePath"
  }
  $acceptanceLevel = if ($Name -eq "trellis-research") { "attested" } else { "checked" }
  $acceptanceEvidence = if ($Name -eq "trellis-research") {
    '["changed-files","review-findings","residual-risks"]'
  } elseif ($Name -eq "trellis-check") {
    '["changed-files","commands-run","validation-output","review-findings","residual-risks"]'
  } else {
    '["changed-files","commands-run","validation-output","residual-risks"]'
  }
  $updates = [ordered]@{
    tools = "read, write, edit, bash"
    extensions = $TelemetryExtensionReference
    thinking = "medium"
    defaultContext = "fresh"
    maxSubagentDepth = "0"
    nestedPiBoundary = "unenforced"
    acceptance = "{`"level`":`"$acceptanceLevel`",`"evidence`":$acceptanceEvidence,`"review`":false}"
    acceptanceRole = "writer"
  }
  foreach ($entry in $updates.GetEnumerator()) {
    $frontmatter = Set-FrontmatterValue $frontmatter $entry.Key $entry.Value
  }
  $updated = $Content.Substring(0, $match.Groups['frontmatter'].Index) + $frontmatter + $Content.Substring($match.Groups['frontmatter'].Index + $match.Groups['frontmatter'].Length)
  if ($Name -eq "trellis-research") {
    if ($updated.Contains($LegacyResearchTaskLine)) {
      $updated = $updated.Replace($LegacyResearchTaskLine, $MigratedResearchTaskLines)
      $updated = $updated.Replace("`n" + '2. Create `<task-dir>/research/`', "`n" + '3. Create `<task-dir>/research/`')
      $updated = $updated.Replace("`n" + '3. Search internal code', "`n" + '4. Search internal code')
      $updated = $updated.Replace("`n" + '4. Write each distinct topic', "`n" + '5. Write each distinct topic')
      $updated = $updated.Replace("`n" + '5. Report only file paths', "`n" + '6. Report only file paths')
    }
  } elseif ($updated.Contains($LegacyTaskLine)) {
    $updated = $updated.Replace($LegacyTaskLine, $MigratedTaskLine)
  }
  if (-not $updated.Contains('Task: Active task: <path>')) {
    throw "Recognized legacy task identity line is missing from $RelativePath"
  }
  if (-not $updated.Contains('do not create an OS sandbox')) {
    $updated = $updated.TrimEnd("`r", "`n") + "`n`nPackage-managed depth and tool controls limit normal fanout only. The builtin ``bash`` tool remains available, so ``nestedPiBoundary`` is ``unenforced``; these controls do not create an OS sandbox.`n"
  }
  if (-not (Test-RoleContract $updated $Name)) {
    throw "Generated role contract failed validation for $RelativePath"
  }
  return $updated
}

function Test-ExtensionContract([string]$Content) {
  $required = @(
    'TRELLIS_ENABLE_LEGACY_SUBAGENT',
    'LEGACY_SUBAGENT_ENABLED',
    'Legacy trellis_subagent is explicitly enabled',
    'PI_SUBAGENT_CHILD',
    'name: "trellis_subagent"',
    'pi.on?.("tool_call"',
    '$env:TRELLIS_CONTEXT_ID'
  )
  foreach ($marker in $required) {
    if (-not $Content.Contains($marker)) { return $false }
  }
  $patterns = @(
    'const\s+LEGACY_SUBAGENT_ENABLED\s*=\s*process\.env\.TRELLIS_ENABLE_LEGACY_SUBAGENT\s*===\s*"1"',
    'process\.env\.PI_SUBAGENT_CHILD\s*===\s*"1"[\s\S]*?return\s*;',
    'if\s*\(LEGACY_SUBAGENT_ENABLED\)\s*pi\.registerShortcut',
    'if\s*\(LEGACY_SUBAGENT_ENABLED\)\s*pi\.registerTool',
    'ev\.toolName\s*===\s*"bash"[\s\S]*?!cmdHasTrellisCtx\(ev\.input\.command\)',
    'ev\.toolName\s*===\s*"pwsh"[\s\S]*?!cmdHasTrellisCtx\(ev\.input\.command\)'
  )
  foreach ($pattern in $patterns) {
    if ($Content -notmatch $pattern) { return $false }
  }
  return $true
}

function Test-TelemetryContract([string]$Content) {
  $required = @(
    'PI_SUBAGENT_CHILD',
    'PI_SUBAGENT_RUN_ID',
    'PI_SUBAGENT_CHILD_AGENT',
    'PI_SUBAGENT_CHILD_INDEX',
    'context-telemetry.jsonl',
    'getContextUsage()',
    'sessionPathSha256',
    'registerContextTelemetry'
  )
  foreach ($marker in $required) {
    if (-not $Content.Contains($marker)) { return $false }
  }
  return -not $Content.Contains('PI_SUBAGENT_AGENT')
}

function Test-SettingsContract($Settings) {
  $packagesProperty = $Settings.PSObject.Properties['packages']
  $extensionsProperty = $Settings.PSObject.Properties['extensions']
  if ($null -eq $packagesProperty -or $packagesProperty.Value -isnot [System.Array]) { return $false }
  if ($null -eq $extensionsProperty -or $extensionsProperty.Value -isnot [System.Array]) { return $false }
  if (-not (@($extensionsProperty.Value) -contains './extensions/trellis/index.ts')) { return $false }
  $packages = @($packagesProperty.Value)
  $matches = @($packages | Where-Object { [string]$_ -eq $PackageId })
  $conflicts = @($packages | Where-Object { [string]$_ -match 'pi-subagents' -and [string]$_ -ne $PackageId })
  return $matches.Count -eq 1 -and $conflicts.Count -eq 0
}

function Convert-Settings([string]$Content, [string]$RelativePath) {
  try {
    $settings = $Content | ConvertFrom-Json -Depth 100
  } catch {
    throw "Invalid JSON in ${RelativePath}: $($_.Exception.Message)"
  }
  if ($null -eq $settings.extensions -or -not (@($settings.extensions) -contains './extensions/trellis/index.ts')) {
    throw "Settings do not reference the project Trellis extension: $RelativePath"
  }
  $packagesProperty = $settings.PSObject.Properties['packages']
  $existingPackages = if ($null -eq $packagesProperty) { @() } else { @($packagesProperty.Value) }
  $conflicts = @($existingPackages | Where-Object { [string]$_ -match 'pi-subagents' -and [string]$_ -ne $PackageId })
  if ($conflicts.Count -gt 0) {
    throw "Settings contain a conflicting pi-subagents package: $RelativePath"
  }
  if (-not ($existingPackages -contains $PackageId)) {
    $newPackages = @($existingPackages) + $PackageId
    if ($null -eq $settings.PSObject.Properties['packages']) {
      $settings | Add-Member -NotePropertyName packages -NotePropertyValue $newPackages
    } else {
      $settings.packages = $newPackages
    }
  }
  $json = $settings | ConvertTo-Json -Depth 100
  $updated = $json + "`n"
  $roundTrip = $updated | ConvertFrom-Json -Depth 100
  if (-not (@($roundTrip.packages) -contains $PackageId)) {
    throw "Generated settings contract failed validation for $RelativePath"
  }
  return $updated
}

function Invoke-Rollback([string]$ManifestPath) {
  $resolvedManifest = [System.IO.Path]::GetFullPath($ManifestPath)
  if (-not (Test-Path -LiteralPath $resolvedManifest -PathType Leaf)) {
    throw "Rollback manifest does not exist: $resolvedManifest"
  }
  $manifest = Read-Json $resolvedManifest
  $root = [System.IO.Path]::GetFullPath([string]$manifest.projectRoot)
  $manifestDirectory = [System.IO.Path]::GetDirectoryName($resolvedManifest)
  foreach ($entry in @($manifest.files)) {
    $target = Resolve-InRoot $root ([string]$entry.path)
    $existedBefore = $entry.PSObject.Properties['existedBefore'] -eq $null -or [bool]$entry.existedBefore
    if (-not (Test-Path -LiteralPath $target -PathType Leaf) -or (Get-Sha256 $target) -ne ([string]$entry.afterHash).ToUpperInvariant()) {
      throw "Rollback refused because migrated file changed: $($entry.path)"
    }
    if ($existedBefore) {
      $backup = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($manifestDirectory, ([string]$entry.backupPath).Replace('/', [System.IO.Path]::DirectorySeparatorChar)))
      if (-not $backup.StartsWith($manifestDirectory + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Backup path escapes manifest directory: $($entry.backupPath)"
      }
      if ((Get-Sha256 $backup) -ne ([string]$entry.beforeHash).ToUpperInvariant()) {
        throw "Rollback backup hash mismatch: $($entry.path)"
      }
    }
  }
  if ($WhatIf) {
    Write-Output "WhatIf: rollback validated for $(@($manifest.files).Count) file(s)."
    return
  }
  foreach ($entry in @($manifest.files)) {
    $target = Resolve-InRoot $root ([string]$entry.path)
    $existedBefore = $entry.PSObject.Properties['existedBefore'] -eq $null -or [bool]$entry.existedBefore
    if ($existedBefore) {
      $backup = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($manifestDirectory, ([string]$entry.backupPath).Replace('/', [System.IO.Path]::DirectorySeparatorChar)))
      Write-AtomicText $target (Read-Utf8Text $backup)
      if ((Get-Sha256 $target) -ne ([string]$entry.beforeHash).ToUpperInvariant()) {
        throw "Rollback verification failed: $($entry.path)"
      }
    } else {
      [System.IO.File]::Delete($target)
      if (Test-Path -LiteralPath $target) {
        throw "Rollback verification failed to remove: $($entry.path)"
      }
    }
  }
  Write-Output "Rollback complete and verified: $resolvedManifest"
}

if ($RollbackManifest) {
  Invoke-Rollback $RollbackManifest
  exit 0
}

$root = [System.IO.Path]::GetFullPath($ProjectRoot)
$version = Assert-ProjectPreflight $root
$hashes = Get-HashMap $root
$templateRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../src/templates/pi"))
$extensionTemplatePath = Join-Path $templateRoot "extensions/trellis/index.ts.txt"
if (-not (Test-Path -LiteralPath $extensionTemplatePath -PathType Leaf)) {
  throw "Canonical extension template is missing: $extensionTemplatePath"
}
$extensionTemplate = Read-Utf8Text $extensionTemplatePath
if (-not (Test-ExtensionContract $extensionTemplate)) {
  throw "Canonical extension template failed migration contract validation"
}
$telemetryTemplatePath = Join-Path $templateRoot "extensions/context-telemetry/index.ts.txt"
if (-not (Test-Path -LiteralPath $telemetryTemplatePath -PathType Leaf)) {
  throw "Canonical telemetry template is missing: $telemetryTemplatePath"
}
$telemetryTemplate = Read-Utf8Text $telemetryTemplatePath
if (-not (Test-TelemetryContract $telemetryTemplate)) {
  throw "Canonical telemetry template failed migration contract validation"
}

$plans = [System.Collections.Generic.List[object]]::new()
$managedFinalHashes = [ordered]@{}
$relativePaths = @(".pi/settings.json") + @($RoleNames | ForEach-Object { ".pi/agents/$_.md" }) + ".pi/extensions/trellis/index.ts" + $TelemetryRelativePath
foreach ($relativePath in $relativePaths) {
  $target = Resolve-InRoot $root $relativePath
  $targetExists = Test-Path -LiteralPath $target -PathType Leaf
  if (-not $targetExists -and $relativePath -ne $TelemetryRelativePath) {
    throw "Required project file is missing: $relativePath"
  }

  if (-not $targetExists) {
    $desiredHash = Get-TextSha256 $telemetryTemplate
    $managedFinalHashes[$relativePath] = $desiredHash
    $plans.Add([pscustomobject]@{
      path = $relativePath
      target = $target
      content = $telemetryTemplate
      classification = "managed-new"
      recordedTemplateHash = $null
      existedBefore = $false
      beforeHash = $null
      afterHash = $desiredHash
    })
    Write-Output "managed-new $relativePath -> $desiredHash"
    continue
  }

  $current = Read-Utf8Text $target
  $currentHash = Get-Sha256 $target
  $desired = $null
  $already = $false
  if ($relativePath -eq ".pi/settings.json") {
    $settings = Read-Json $target
    $already = Test-SettingsContract $settings
    if (-not $already) { $desired = Convert-Settings $current $relativePath }
  } elseif ($relativePath -eq ".pi/extensions/trellis/index.ts") {
    $already = Test-ExtensionContract $current
    if (-not $already) { $desired = $extensionTemplate }
  } elseif ($relativePath -eq $TelemetryRelativePath) {
    $already = (Get-TextSha256 $current) -eq (Get-TextSha256 $telemetryTemplate)
    if (-not $already) { $desired = $telemetryTemplate }
  } else {
    $name = [System.IO.Path]::GetFileNameWithoutExtension($relativePath)
    $already = Test-RoleContract $current $name
    if (-not $already) { $desired = Convert-Role $current $name $relativePath }
  }
  if ($already) {
    $managedFinalHashes[$relativePath] = $currentHash
    Write-Output "already-migrated $relativePath $currentHash"
    continue
  }
  $storedHash = Get-StoredHash $hashes $relativePath
  if ($currentHash -ne $storedHash) {
    throw "Unknown customization detected in $relativePath (current $currentHash, recorded template $storedHash). No files were changed."
  }
  $desiredHash = Get-TextSha256 $desired
  $managedFinalHashes[$relativePath] = $desiredHash
  if ($desiredHash -eq $currentHash) {
    Write-Output "already-migrated $relativePath $currentHash"
    continue
  }
  $plans.Add([pscustomobject]@{
    path = $relativePath
    target = $target
    content = $desired
    classification = "recognized-legacy"
    recordedTemplateHash = $storedHash
    existedBefore = $true
    beforeHash = $currentHash
    afterHash = $desiredHash
  })
  Write-Output "recognized-legacy $relativePath $currentHash -> $desiredHash"
}

$hashRelativePath = ".trellis/.template-hashes.json"
$hashTarget = Resolve-InRoot $root $hashRelativePath
$hashContent = Read-Utf8Text $hashTarget
$hashBefore = Get-Sha256 $hashTarget
$hashDocument = Read-Json $hashTarget
$hashChanged = $false
foreach ($relativePath in $relativePaths) {
  $property = $hashDocument.hashes.PSObject.Properties[$relativePath]
  $finalHash = [string]$managedFinalHashes[$relativePath]
  if ($null -eq $property) {
    $hashDocument.hashes | Add-Member -NotePropertyName $relativePath -NotePropertyValue $finalHash
    $hashChanged = $true
  } elseif (([string]$property.Value).ToUpperInvariant() -ne $finalHash) {
    $property.Value = $finalHash
    $hashChanged = $true
  }
}
if ($hashChanged) {
  $hashDesired = ($hashDocument | ConvertTo-Json -Depth 100) + "`n"
  $plans.Add([pscustomobject]@{
    path = $hashRelativePath
    target = $hashTarget
    content = $hashDesired
    classification = "migration-metadata"
    recordedTemplateHash = $null
    existedBefore = $true
    beforeHash = $hashBefore
    afterHash = Get-TextSha256 $hashDesired
  })
}

if ($plans.Count -eq 0) {
  Write-Output "No changes required for Trellis $version."
  exit 0
}
if ($WhatIf) {
  Write-Output "WhatIf: $($plans.Count) targeted file(s) would be migrated; no backup or file was written."
  exit 0
}

$timestamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssfffZ")
$backupRoot = Join-Path $root ".trellis/.migrations/pi-subagents/$timestamp"
[System.IO.Directory]::CreateDirectory($backupRoot) | Out-Null
$entries = [System.Collections.Generic.List[object]]::new()
foreach ($plan in $plans) {
  $backupRelative = if ($plan.existedBefore) { "files/$($plan.path)" } else { $null }
  if ($plan.existedBefore) {
    $backupPath = [System.IO.Path]::Combine($backupRoot, $backupRelative.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($backupPath)) | Out-Null
    [System.IO.File]::Copy($plan.target, $backupPath, $false)
    if ((Get-Sha256 $backupPath) -ne $plan.beforeHash) {
      throw "Backup verification failed: $($plan.path)"
    }
  }
  $entries.Add([pscustomobject]@{
    path = $plan.path
    classification = $plan.classification
    recordedTemplateHash = $plan.recordedTemplateHash
    existedBefore = $plan.existedBefore
    beforeHash = $plan.beforeHash
    afterHash = $plan.afterHash
    backupPath = $backupRelative
  })
}

$manifestPath = Join-Path $backupRoot "manifest.json"
$manifest = [ordered]@{
  schemaVersion = 1
  migration = "trellis-pi-subagents-0.46.0"
  createdAtUtc = [DateTime]::UtcNow.ToString("o")
  projectRoot = $root
  trellisVersion = $version
  files = @($entries)
}
Write-AtomicText $manifestPath (($manifest | ConvertTo-Json -Depth 10) + "`n")

try {
  foreach ($plan in $plans) {
    if ($plan.existedBefore) {
      if ((Get-Sha256 $plan.target) -ne $plan.beforeHash) {
        throw "File changed after preflight: $($plan.path)"
      }
    } elseif (Test-Path -LiteralPath $plan.target) {
      throw "File appeared after preflight: $($plan.path)"
    }
    Write-AtomicText $plan.target $plan.content
    if ((Get-Sha256 $plan.target) -ne $plan.afterHash) {
      throw "Post-write SHA256 verification failed: $($plan.path)"
    }
  }
  $settingsAfter = Read-Json (Join-Path $root ".pi/settings.json")
  if (-not (Test-SettingsContract $settingsAfter)) { throw "Post-validation failed for .pi/settings.json" }
  foreach ($name in $RoleNames) {
    $rolePath = Join-Path $root ".pi/agents/$name.md"
    if (-not (Test-RoleContract (Read-Utf8Text $rolePath) $name)) { throw "Post-validation failed for .pi/agents/$name.md" }
  }
  if (-not (Test-ExtensionContract (Read-Utf8Text (Join-Path $root ".pi/extensions/trellis/index.ts")))) {
    throw "Post-validation failed for .pi/extensions/trellis/index.ts"
  }
  if (-not (Test-TelemetryContract (Read-Utf8Text (Join-Path $root $TelemetryRelativePath)))) {
    throw "Post-validation failed for $TelemetryRelativePath"
  }
  $hashesAfter = Get-HashMap $root
  foreach ($relativePath in $relativePaths) {
    $target = Resolve-InRoot $root $relativePath
    if ((Get-StoredHash $hashesAfter $relativePath) -ne (Get-Sha256 $target)) {
      throw "Post-validation failed for template hash metadata: $relativePath"
    }
  }
} catch {
  foreach ($entry in $entries) {
    $target = Resolve-InRoot $root $entry.path
    if ([bool]$entry.existedBefore) {
      $backupPath = Join-Path $backupRoot $entry.backupPath
      Write-AtomicText $target (Read-Utf8Text $backupPath)
    } elseif (Test-Path -LiteralPath $target) {
      [System.IO.File]::Delete($target)
    }
  }
  throw "Migration failed and targeted files were restored from backup. $($_.Exception.Message)"
}

Write-Output "Migration complete: $($plans.Count) file(s)."
Write-Output "Rollback manifest: $manifestPath"

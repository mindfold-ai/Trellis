import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import chalk from "chalk";
import inquirer from "inquirer";

import { DIR_NAMES, FILE_NAMES, PATHS } from "../constants/paths.js";
import { VERSION } from "../constants/version.js";
import type { TemplateHashes } from "../types/template-hashes.js";
import {
  loadHashes,
  saveHashes,
  computeHash,
  shouldExcludeFromHash,
} from "../utils/template-hash.js";
import { toPosix } from "../utils/posix.js";
import { setupProxy } from "../utils/proxy.js";

// Import templates for comparison
import {
  getAllScripts,
  getAllAgents,
  // Configuration
  configYamlTemplate,
  gitignoreTemplate,
  workflowMdTemplate,
} from "../templates/trellis/index.js";
import { agentsMdContent } from "../templates/markdown/index.js";
import {
  COPILOT_INSTRUCTIONS_BLOCK_END,
  COPILOT_INSTRUCTIONS_BLOCK_START,
  COPILOT_INSTRUCTIONS_PATH,
  getCopilotInstructions,
} from "../templates/copilot/index.js";

import {
  getConfiguredPlatforms,
  collectPlatformTemplates,
} from "../configurators/index.js";
import { replacePythonCommandLiterals } from "../configurators/shared.js";
import { preserveCodexAgentModelKeys } from "../configurators/codex.js";
import { printZcodeSetupHint } from "../configurators/zcode.js";
import { writeFileAtomic } from "../utils/atomic-write.js";
import { assertProjectPath } from "../utils/path-boundary.js";
import {
  fetchRegistrySpecTemplates,
  collectDirectoryFiles,
  removeDirectory,
  parseRegistrySource,
  probeRegistryIndex,
  downloadTemplateById,
  type RegistrySource,
} from "../utils/template-fetcher.js";
import { loadSpecRegistryConfig } from "../utils/registry-config.js";
import {
  TRELLIS_BLOCK_END,
  TRELLIS_BLOCK_START,
} from "../utils/managed-paths.js";

export {
  cleanupEmptyDirs,
  TRELLIS_BLOCK_END,
  TRELLIS_BLOCK_START,
} from "../utils/managed-paths.js";

export interface UpdateOptions {
  dryRun?: boolean;
  force?: boolean;
  skipAll?: boolean;
  createNew?: boolean;
}

interface FileChange {
  path: string;
  relativePath: string;
  newContent: string;
  status: "new" | "unchanged" | "changed";
}

interface ChangeAnalysis {
  newFiles: FileChange[];
  unchangedFiles: FileChange[];
  autoUpdateFiles: FileChange[]; // Template updated, user didn't modify
  changedFiles: FileChange[]; // User modified, needs confirmation
  userDeletedFiles: FileChange[]; // User deleted (hash exists but file missing)
  protectedPaths: string[];
}

type ConflictAction = "overwrite" | "skip" | "create-new";

const CLAUDE_SETTINGS_PATH = ".claude/settings.json";

// Paths that should never be touched (true user data)
// spec/ is user-customized content created during init; update should never modify it
const PROTECTED_PATHS = [
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.TASKS}`, // tasks/
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SPEC}`, // spec/
];

function getManagedBlock(
  content: string,
  startMarker: string,
  endMarker: string,
): string | null {
  const start = content.indexOf(startMarker);
  if (start === -1) {
    return null;
  }

  const end = content.indexOf(endMarker, start);
  if (end === -1) {
    return null;
  }

  return content.slice(start, end + endMarker.length);
}

function replaceManagedBlock(
  existingContent: string,
  templateContent: string,
  startMarker: string,
  endMarker: string,
): string | null {
  const existingStart = existingContent.indexOf(startMarker);
  if (existingStart === -1) {
    return null;
  }

  const existingEnd = existingContent.indexOf(endMarker, existingStart);
  if (existingEnd === -1) {
    return null;
  }

  const templateBlock = getManagedBlock(
    templateContent,
    startMarker,
    endMarker,
  );
  if (!templateBlock) {
    return null;
  }

  return (
    existingContent.slice(0, existingStart) +
    templateBlock +
    existingContent.slice(existingEnd + endMarker.length)
  );
}

function mergeManagedBlockContent(
  existingContent: string,
  templateContent: string,
  startMarker: string,
  endMarker: string,
): string {
  const replaced = replaceManagedBlock(
    existingContent,
    templateContent,
    startMarker,
    endMarker,
  );
  if (replaced !== null) {
    return replaced;
  }

  const templateBlock = getManagedBlock(
    templateContent,
    startMarker,
    endMarker,
  );
  if (!templateBlock) {
    return templateContent;
  }

  const trimmed = existingContent.replace(/\s+$/, "");
  return `${trimmed}\n\n${templateBlock}\n`;
}

function buildManagedBlockTemplate(
  cwd: string,
  relativePath: string,
  templateContent: string,
  startMarker: string,
  endMarker: string,
): string {
  const fullPath = path.join(cwd, ...relativePath.split("/"));
  assertProjectPath(fullPath, cwd);
  if (!fs.existsSync(fullPath)) {
    return templateContent;
  }

  const existingContent = fs.readFileSync(fullPath, "utf-8");
  return mergeManagedBlockContent(
    existingContent,
    templateContent,
    startMarker,
    endMarker,
  );
}

function buildAgentsMdTemplate(cwd: string): string {
  return buildManagedBlockTemplate(
    cwd,
    FILE_NAMES.AGENTS,
    agentsMdContent,
    TRELLIS_BLOCK_START,
    TRELLIS_BLOCK_END,
  );
}

function buildCopilotInstructionsTemplate(cwd: string): string {
  return buildManagedBlockTemplate(
    cwd,
    COPILOT_INSTRUCTIONS_PATH,
    getCopilotInstructions(),
    COPILOT_INSTRUCTIONS_BLOCK_START,
    COPILOT_INSTRUCTIONS_BLOCK_END,
  );
}

/**
 * Check if a path is blocked by PROTECTED_PATHS
 */
function isProtectedPath(filePath: string): boolean {
  return PROTECTED_PATHS.some(
    (pp) =>
      filePath === pp || filePath.startsWith(pp.endsWith("/") ? pp : pp + "/"),
  );
}

export function loadUpdateSkipPaths(cwd: string): string[] {
  const configPath = path.join(cwd, DIR_NAMES.WORKFLOW, "config.yaml");
  assertProjectPath(configPath, cwd);
  if (!fs.existsSync(configPath)) return [];

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const lines = content.split("\n");
    const paths: string[] = [];
    let inUpdate = false;
    let inSkip = false;

    for (const line of lines) {
      const trimmed = line.trimEnd();

      // Check for "update:" section (no indentation or at root level)
      if (/^update:\s*$/.test(trimmed)) {
        inUpdate = true;
        inSkip = false;
        continue;
      }

      // Check for "skip:" under update (indented)
      if (inUpdate && /^\s+skip:\s*$/.test(trimmed)) {
        inSkip = true;
        continue;
      }

      // Collect list items under skip
      if (inSkip) {
        const match = trimmed.match(/^\s+-\s+(.+)$/);
        if (match) {
          paths.push(match[1].trim().replace(/^['"]|['"]$/g, ""));
          continue;
        }
        // If line is non-empty and not a list item, we've left the skip section
        if (trimmed !== "" && !trimmed.startsWith("#")) {
          inSkip = false;
          inUpdate = false;
        }
      }

      // If we're in update but hit a non-indented line, we've left the update section
      if (
        inUpdate &&
        trimmed !== "" &&
        !trimmed.startsWith(" ") &&
        !trimmed.startsWith("#")
      ) {
        inUpdate = false;
        inSkip = false;
      }
    }

    return paths;
  } catch {
    // Config exists but failed to parse — warn user that skip rules won't apply
    console.warn(
      `Warning: failed to parse ${configPath}, update.skip rules will not be applied`,
    );
    return [];
  }
}

function preserveExistingClaudeStatusLine(
  cwd: string,
  templates: Map<string, string>,
): void {
  const newSettingsContent = templates.get(CLAUDE_SETTINGS_PATH);
  if (!newSettingsContent) return;

  const settingsPath = path.join(cwd, CLAUDE_SETTINGS_PATH);
  assertProjectPath(settingsPath, cwd);
  if (!fs.existsSync(settingsPath)) return;

  let existingSettings: Record<string, unknown>;
  try {
    existingSettings = JSON.parse(
      fs.readFileSync(settingsPath, "utf-8"),
    ) as Record<string, unknown>;
  } catch {
    // Invalid local JSON is handled by the normal conflict path.
    return;
  }

  if (!existingSettings || typeof existingSettings !== "object") return;
  try {
    if (!Object.prototype.hasOwnProperty.call(existingSettings, "statusLine")) {
      return;
    }

    const newSettings = JSON.parse(newSettingsContent) as Record<
      string,
      unknown
    >;

    if (Object.prototype.hasOwnProperty.call(newSettings, "statusLine")) {
      return;
    }

    newSettings.statusLine = existingSettings.statusLine;
    templates.set(
      CLAUDE_SETTINGS_PATH,
      `${JSON.stringify(newSettings, null, 2)}\n`,
    );
  } catch {
    // Invalid local JSON is handled by the normal conflict path.
  }
}

function preserveExistingRegistryConfig(cwd: string, template: string): string {
  const registry = loadSpecRegistryConfig(cwd);
  if (!registry) return template;
  return (
    template.trimEnd() +
    "\n\n" +
    "#-------------------------------------------------------------------------------\n" +
    "# Registry\n" +
    "#-------------------------------------------------------------------------------\n\n" +
    "# Source used to install .trellis/spec. trellis update refreshes this\n" +
    "# hash-tracked spec template while preserving local edits through the\n" +
    "# normal update conflict flow.\n" +
    "registry:\n" +
    "  spec:\n" +
    `    source: ${registry.source}\n` +
    (registry.template ? `    template: ${registry.template}\n` : "")
  );
}

async function collectRegistrySpecTemplates(
  cwd: string,
): Promise<Map<string, string>> {
  const config = loadSpecRegistryConfig(cwd);
  if (!config) return new Map();

  let registry: RegistrySource;
  try {
    registry = parseRegistrySource(config.source);
  } catch (error) {
    console.log(
      chalk.yellow(
        `Warning: invalid registry.spec.source in .trellis/config.yaml: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
    return new Map();
  }

  const probe = await probeRegistryIndex(
    `${registry.rawBaseUrl}/index.json`,
    registry,
  );
  if (probe.templates.length > 0) {
    if (!config.template) {
      console.log(
        chalk.gray(
          "Registry spec update skipped: marketplace registries require registry.spec.template.",
        ),
      );
      return new Map();
    }
    const template = probe.templates.find(
      (candidate) => candidate.id === config.template,
    );
    if (!template) {
      console.log(
        chalk.yellow(
          `Warning: registry spec update skipped: template "${config.template}" was not found in registry index.`,
        ),
      );
      return new Map();
    }
    const tempRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "trellis-registry-template-"),
    );
    try {
      const result = await downloadTemplateById(
        tempRoot,
        config.template,
        "overwrite",
        template,
        registry,
        undefined,
        probe.backend,
      );
      if (!result.success) {
        console.log(
          chalk.yellow(
            `Warning: registry spec update skipped: ${result.message}`,
          ),
        );
        return new Map();
      }
      return collectDirectoryFiles(path.join(tempRoot, PATHS.SPEC), PATHS.SPEC);
    } finally {
      await removeDirectory(tempRoot);
    }
  }
  if (!probe.isNotFound) {
    console.log(
      chalk.yellow(
        `Warning: registry spec update skipped: ${
          probe.error?.message ?? "could not reach registry"
        }`,
      ),
    );
    return new Map();
  }

  const result = await fetchRegistrySpecTemplates(registry, probe.backend);
  if (!result.success) {
    console.log(
      chalk.yellow(
        `Warning: registry spec update skipped: ${result.message ?? "download failed"}`,
      ),
    );
    return new Map();
  }
  return result.files;
}

export async function collectTemplateFiles(
  cwd: string,
  options: { registrySpecs?: boolean } = {},
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const platforms = getConfiguredPlatforms(cwd);

  // Python scripts (single source of truth: getAllScripts())
  for (const [scriptPath, content] of getAllScripts()) {
    files.set(`${PATHS.SCRIPTS}/${scriptPath}`, content);
  }

  // Channel runtime agent definitions share the getAllAgents() source.
  for (const [agentFile, content] of getAllAgents()) {
    files.set(`${PATHS.AGENTS}/${agentFile}`, content);
  }

  // Configuration
  files.set(
    `${DIR_NAMES.WORKFLOW}/config.yaml`,
    preserveExistingRegistryConfig(cwd, configYamlTemplate),
  );
  files.set(`${DIR_NAMES.WORKFLOW}/.gitignore`, gitignoreTemplate);
  // workflow.md is included here because it is runtime-parsed by
  // get_context.py and shared hooks. Keep it on the normal template update
  // path: if the installed file still matches the tracked hash, update the
  // whole file. If the user edited it, the standard modified-file prompt /
  // --force behavior applies. Partial tag-block merging is unsafe because
  // platform routing markers outside [workflow-state:*] blocks are also
  // script-consumed.
  files.set(`${DIR_NAMES.WORKFLOW}/workflow.md`, workflowMdTemplate);
  files.set(FILE_NAMES.AGENTS, buildAgentsMdTemplate(cwd));

  // Platform-specific templates (only for configured platforms)
  for (const platformId of platforms) {
    const platformFiles = collectPlatformTemplates(platformId);
    if (platformFiles) {
      for (const [filePath, content] of platformFiles) {
        files.set(filePath, content);
      }
      if (platformId === "copilot") {
        files.set(
          COPILOT_INSTRUCTIONS_PATH,
          buildCopilotInstructionsTemplate(cwd),
        );
      }
    }
  }

  // Users configure sub-agent models by editing `model` /
  // `model_reasoning_effort` directly on the generated agent tomls. Preserve
  // those two keys from the on-disk files into the freshly rendered desired
  // content so a project whose only local edit is these keys is not flagged
  // as a modified-file conflict by the hash comparison below.
  if (platforms.has("codex")) {
    preserveCodexAgentModelKeys(cwd, files);
  }

  preserveExistingClaudeStatusLine(cwd, files);

  if (options.registrySpecs !== false) {
    for (const [filePath, content] of await collectRegistrySpecTemplates(cwd)) {
      files.set(filePath, content);
    }
  }

  const skipPaths = loadUpdateSkipPaths(cwd);
  if (skipPaths.length > 0) {
    for (const [filePath] of [...files]) {
      if (
        skipPaths.some(
          (skip) =>
            filePath === skip ||
            filePath.startsWith(skip.endsWith("/") ? skip : skip + "/"),
        )
      ) {
        files.delete(filePath);
      }
    }
  }

  // Apply python3→python replacement for Windows consistency with init-time writes
  for (const [filePath, content] of files) {
    files.set(filePath, replacePythonCommandLiterals(content));
  }

  return files;
}

/**
 * Analyze changes between current files and templates
 *
 * Uses hash tracking to distinguish between:
 * - User didn't modify + template same = skip (unchangedFiles)
 * - User didn't modify + template updated = auto-update (autoUpdateFiles)
 * - User modified = needs confirmation (changedFiles)
 */
function analyzeChanges(
  cwd: string,
  hashes: TemplateHashes,
  templates: Map<string, string>,
): ChangeAnalysis {
  const result: ChangeAnalysis = {
    newFiles: [],
    unchangedFiles: [],
    autoUpdateFiles: [],
    changedFiles: [],
    userDeletedFiles: [],
    protectedPaths: PROTECTED_PATHS,
  };

  for (const [relativePath, newContent] of templates) {
    const fullPath = path.join(cwd, relativePath);
    assertProjectPath(fullPath, cwd);
    const exists = fs.existsSync(fullPath);

    const change: FileChange = {
      path: fullPath,
      relativePath,
      newContent,
      status: "new",
    };

    if (!exists) {
      const storedHash = hashes[relativePath];
      if (storedHash) {
        // Previously installed but user deleted — respect deletion
        result.userDeletedFiles.push(change);
      } else {
        change.status = "new";
        result.newFiles.push(change);
      }
    } else {
      const existingContent = fs.readFileSync(fullPath, "utf-8");
      if (existingContent === newContent) {
        // Content same as template - already up to date
        change.status = "unchanged";
        result.unchangedFiles.push(change);
      } else {
        // Content differs - check if user modified or template updated
        const storedHash = hashes[relativePath];
        const currentHash = computeHash(existingContent);

        if (storedHash && storedHash === currentHash) {
          // The tracked file is unchanged, so the new template can replace it.
          change.status = "changed";
          result.autoUpdateFiles.push(change);
        } else {
          // Hash differs (or no stored hash) - user modified the file
          // Needs confirmation
          change.status = "changed";
          result.changedFiles.push(change);
        }
      }
    }
  }

  return result;
}

/**
 * Receipt entries that are wrong or missing for a file that is already
 * byte-identical to its template.
 *
 * Nothing else repairs these. `analyzeChanges` classifies such a file
 * `unchanged`, and the write-back draws only from `newFiles`,
 * `autoUpdateFiles` and overwritten `changedFiles` — so a poisoned or absent
 * entry beside a pristine file survives every subsequent `trellis update`,
 * however many times it is run. Identical template content across versions is
 * not what saves such an entry from going stale; it is precisely what freezes
 * it, because the file never leaves the `unchanged` bucket.
 *
 * Recording the template's hash here cannot bless a local edit. Membership in
 * `unchangedFiles` means the file on disk already *is* the template, byte for
 * byte, so the value written is the one a correct receipt would already hold.
 * A genuinely customized file differs from its template, lands in
 * `changedFiles`, and is never seen by this function.
 *
 * That also leaves the mixed-ownership paths — `AGENTS.md`,
 * `.github/copilot-instructions.md`, `.trellis/config.yaml` — free to differ
 * from their recorded hash, which for them is the correct state: once the
 * repository has appended its own content they are no longer `unchanged`.
 */
function collectUnchangedFileHashRepairs(
  changes: ChangeAnalysis,
  hashes: TemplateHashes,
): Map<string, string> {
  const files = new Map<string, string>();

  for (const file of changes.unchangedFiles) {
    const key = toPosix(file.relativePath);
    const recorded = hashes[key];

    if (recorded === undefined) {
      // A missing entry is only an omission for a path the receipt is meant
      // to carry. `EXCLUDE_FROM_HASH` holds paths deliberately left out —
      // `.trellis/.gitignore` among them — and adding those here would put
      // this path in disagreement with `initializeHashes` about what the
      // receipt tracks at all.
      if (!shouldExcludeFromHash(key)) {
        files.set(key, file.newContent);
      }
      continue;
    }

    // An entry that already exists and disagrees with the file is repaired
    // whatever the path: a wrong value is strictly worse than an absent one,
    // because it reads as a real local modification.
    if (recorded !== computeHash(file.newContent)) {
      if (
        [
          FILE_NAMES.AGENTS,
          COPILOT_INSTRUCTIONS_PATH,
          ".trellis/config.yaml",
        ].includes(key)
      )
        continue;
      files.set(key, file.newContent);
    }
  }

  return files;
}

/**
 * Print change summary
 */
function printChangeSummary(changes: ChangeAnalysis): void {
  console.log("\nScanning for changes...\n");

  if (changes.newFiles.length > 0) {
    console.log(chalk.green("  New files (will add):"));
    for (const file of changes.newFiles) {
      console.log(chalk.green(`    + ${file.relativePath}`));
    }
    console.log("");
  }

  if (changes.autoUpdateFiles.length > 0) {
    console.log(chalk.cyan("  Template updated (will auto-update):"));
    for (const file of changes.autoUpdateFiles) {
      console.log(chalk.cyan(`    ↑ ${file.relativePath}`));
    }
    console.log("");
  }

  if (changes.unchangedFiles.length > 0) {
    console.log(chalk.gray("  Unchanged files (will skip):"));
    for (const file of changes.unchangedFiles.slice(0, 5)) {
      console.log(chalk.gray(`    ○ ${file.relativePath}`));
    }
    if (changes.unchangedFiles.length > 5) {
      console.log(
        chalk.gray(`    ... and ${changes.unchangedFiles.length - 5} more`),
      );
    }
    console.log("");
  }

  if (changes.changedFiles.length > 0) {
    console.log(chalk.yellow("  Modified by you (need your decision):"));
    for (const file of changes.changedFiles) {
      console.log(chalk.yellow(`    ? ${file.relativePath}`));
    }
    console.log("");
  }

  if (changes.userDeletedFiles.length > 0) {
    console.log(chalk.gray("  Deleted by you (preserved):"));
    for (const file of changes.userDeletedFiles) {
      console.log(chalk.gray(`    \u2715 ${file.relativePath}`));
    }
    console.log("");
  }

  // Only show protected paths that actually exist
  const existingProtectedPaths = changes.protectedPaths.filter((p) => {
    const fullPath = path.join(process.cwd(), p);
    return fs.existsSync(fullPath);
  });

  if (existingProtectedPaths.length > 0) {
    console.log(chalk.gray("  User data (preserved):"));
    for (const protectedPath of existingProtectedPaths) {
      console.log(chalk.gray(`    ○ ${protectedPath}/`));
    }
    console.log("");
  }
}

/**
 * Prompt user for conflict resolution
 */
async function promptConflictResolution(
  file: FileChange,
  options: UpdateOptions,
  applyToAll: { action: ConflictAction | null },
): Promise<ConflictAction> {
  // If we have a batch action, use it
  if (applyToAll.action) {
    return applyToAll.action;
  }

  // Check command-line options
  if (options.force) {
    return "overwrite";
  }
  if (options.skipAll) {
    return "skip";
  }
  if (options.createNew) {
    return "create-new";
  }

  // Interactive prompt
  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: "list",
      name: "action",
      message: `${file.relativePath} has changes.`,
      choices: [
        {
          name: "[1] Overwrite - Replace with new version",
          value: "overwrite",
        },
        { name: "[2] Skip - Keep your current version", value: "skip" },
        {
          name: "[3] Create copy - Save new version as .new",
          value: "create-new",
        },
        { name: "[a] Apply Overwrite to all", value: "overwrite-all" },
        { name: "[s] Apply Skip to all", value: "skip-all" },
        { name: "[n] Apply Create copy to all", value: "create-new-all" },
      ],
      default: "skip",
    },
  ]);

  if (action === "overwrite-all") {
    applyToAll.action = "overwrite";
    return "overwrite";
  }
  if (action === "skip-all") {
    applyToAll.action = "skip";
    return "skip";
  }
  if (action === "create-new-all") {
    applyToAll.action = "create-new";
    return "create-new";
  }

  return action as ConflictAction;
}

/**
 * Create a timestamped backup directory path
 */
function createBackupDirPath(cwd: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(
    cwd,
    DIR_NAMES.WORKFLOW,
    `.backup-${timestamp}-${randomUUID()}`,
  );
}

/**
 * Backup a single file to the backup directory
 */
function backupFile(
  cwd: string,
  backupDir: string,
  relativePath: string,
): void {
  const srcPath = path.join(cwd, relativePath);
  assertProjectPath(srcPath, cwd);
  const stat = fs.lstatSync(srcPath, { throwIfNoEntry: false });
  if (!stat) return;

  const backupPath = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  if (stat.isSymbolicLink()) {
    fs.symlinkSync(fs.readlinkSync(srcPath), backupPath);
  } else {
    fs.copyFileSync(srcPath, backupPath);
  }
}

/**
 * Patterns to exclude from backup (user data that shouldn't be backed up)
 */
const BACKUP_EXCLUDE_PATTERNS = [
  ".backup-", // Previous backups
  "/node_modules", // Installed dependencies; restore via package manager
  "/tasks/", // Task data (user data)
  "/spec/", // Spec files (user-customized content)
  "/backlog/", // Backlog data (user data)
  // Platform-native worktree dirs — these are full sub-repos the CLI
  // spawns for parallel sessions. Backing them up on every update would
  // snapshot the entire nested working tree. Confirmed conventions:
  //   Claude Code: .claude/worktrees/
  //   Cursor CLI:  .cursor/worktrees/
  //   Gemini CLI:  .gemini/worktrees/
  // Matches any platform using the same convention (future-proof).
  "/worktrees/",
  "/worktree/",
];

/**
 * Check if a path should be excluded from backup
 * @internal Exported for testing only
 */
export function shouldExcludeFromBackup(relativePath: string): boolean {
  // Normalize Windows backslashes to forward slashes so patterns like
  // "/worktrees/" / "/tasks/" match regardless of host OS. Without this,
  // Windows `path.relative` returns `.claude\worktrees\...` and none of
  // the slash-prefixed exclude patterns trigger — which causes
  // `collectAllFiles` to descend into platform worktrees (full nested
  // project copies) and explode the scan. Same normalization pattern
  // used by `isManagedPath` in configurators/index.ts.
  const normalized = relativePath.replace(/\\/g, "/");
  for (const pattern of BACKUP_EXCLUDE_PATTERNS) {
    if (
      normalized.includes(pattern) ||
      (pattern.endsWith("/") && normalized.endsWith(pattern.slice(0, -1)))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Back up only current managed files that this run can overwrite.
 */
function createFullBackup(
  cwd: string,
  managedPaths: Iterable<string>,
): string | null {
  const backupDir = createBackupDirPath(cwd);
  let hasFiles = false;

  for (const relativePath of managedPaths) {
    if (isProtectedPath(relativePath)) continue;
    const fullPath = path.join(cwd, relativePath);
    assertProjectPath(fullPath, cwd);
    if (!fs.existsSync(fullPath)) continue;
    if (fs.lstatSync(fullPath).isDirectory()) continue;

    if (!hasFiles) {
      fs.mkdirSync(backupDir, { recursive: true });
      hasFiles = true;
    }
    backupFile(cwd, backupDir, relativePath);
  }

  return hasFiles ? backupDir : null;
}

/** Scoped backups capture links, never the files beneath a linked directory. */
function assertBackupSupportsPaths(cwd: string, names: Iterable<string>): void {
  for (const name of names) {
    if (isProtectedPath(name)) continue;
    assertProjectPath(path.join(cwd, name), cwd);
    const segments = toPosix(name).split("/");
    for (let index = 1; index < segments.length; index++) {
      const parent = segments.slice(0, index).join("/");
      if (
        fs
          .lstatSync(path.join(cwd, parent), { throwIfNoEntry: false })
          ?.isSymbolicLink()
      ) {
        throw new Error(
          `Unsupported managed symlink parent ${parent} for ${name}; reconcile this path before update. No managed files were changed.`,
        );
      }
    }
  }
}

/**
 * Update version file
 */
function updateVersionFile(cwd: string): void {
  const versionPath = path.join(cwd, DIR_NAMES.WORKFLOW, ".version");
  assertProjectPath(versionPath, cwd);
  writeFileAtomic(versionPath, VERSION);
}

/**
 * Get current installed version
 */
function getInstalledVersion(cwd: string): string {
  const versionPath = path.join(cwd, DIR_NAMES.WORKFLOW, ".version");
  assertProjectPath(versionPath, cwd);
  if (fs.existsSync(versionPath)) {
    return fs.readFileSync(versionPath, "utf-8").trim();
  }
  return "unknown";
}

/** Recursively collect files in a managed backup. */
function collectAllFiles(
  dirPath: string,
  cwd = process.cwd(),
  includeLinks = false,
): string[] {
  if (shouldExcludeFromBackup(path.relative(cwd, dirPath))) return [];
  const rootStat = fs.lstatSync(dirPath, { throwIfNoEntry: false });
  if (!rootStat) return [];
  if (rootStat.isSymbolicLink()) return includeLinks ? [dirPath] : [];
  if (rootStat.isFile()) {
    return [dirPath];
  }
  if (!rootStat.isDirectory()) {
    return [];
  }

  const files: string[] = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) continue;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(cwd, fullPath);

      // Never follow symlinks / Windows directory junctions — a junction
      // pointing at an ancestor would loop the scan forever. Node's
      // `isSymbolicLink()` returns true for NTFS junctions since v12.
      if (shouldExcludeFromBackup(relativePath)) continue;
      if (entry.isSymbolicLink()) {
        if (includeLinks) files.push(fullPath);
        continue;
      }

      if (entry.isDirectory()) {
        if (!shouldExcludeFromBackup(relativePath)) {
          stack.push(fullPath);
        }
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

export async function update(options: UpdateOptions): Promise<void> {
  const cwd = process.cwd();
  if (!fs.existsSync(path.join(cwd, DIR_NAMES.WORKFLOW))) {
    throw new Error("Trellis is not initialized in this directory.");
  }

  const installedVersion = getInstalledVersion(cwd);
  if (installedVersion !== VERSION) {
    throw new Error(
      `Unsupported installed Trellis version ${installedVersion}. Initialize a new project with Trellis ${VERSION}; this version does not upgrade existing installations.`,
    );
  }

  setupProxy();
  const configuredPlatforms = [...getConfiguredPlatforms(cwd)];
  const templates = await collectTemplateFiles(cwd);
  const hashes = loadHashes(cwd);
  const workflowPath = ".trellis/workflow.md";
  const workflowFile = path.join(cwd, workflowPath);
  assertProjectPath(workflowFile, cwd);
  if (fs.existsSync(workflowFile)) {
    const content = fs.readFileSync(workflowFile, "utf8");
    if (hashes[workflowPath] !== computeHash(content)) {
      templates.delete(workflowPath);
    }
  }

  assertBackupSupportsPaths(cwd, [
    ...templates.keys(),
    ".trellis/.version",
    ".trellis/.template-hashes.json",
  ]);
  const changes = analyzeChanges(cwd, hashes, templates);
  const requiredRuntime = (name: string): boolean =>
    !isProtectedPath(name) &&
    name !== ".trellis/config.yaml" &&
    name !== ".trellis/.gitignore";
  changes.newFiles.push(
    ...changes.userDeletedFiles.filter((file) =>
      requiredRuntime(file.relativePath),
    ),
  );

  const conflictActions = new Map<string, ConflictAction>();
  const applyToAll: { action: ConflictAction | null } = { action: null };
  for (const file of changes.changedFiles) {
    const action =
      options.dryRun ||
      (!process.stdin.isTTY &&
        !options.force &&
        !options.skipAll &&
        !options.createNew)
        ? "skip"
        : await promptConflictResolution(file, options, applyToAll);
    conflictActions.set(file.relativePath, action);
    if (action === "create-new") assertProjectPath(file.path + ".new", cwd);
  }

  printChangeSummary(changes);
  if (options.dryRun) {
    console.log(chalk.gray("[Dry run] No changes made."));
    return;
  }
  const hashRepairs = collectUnchangedFileHashRepairs(changes, hashes);
  if (
    changes.newFiles.length === 0 &&
    changes.autoUpdateFiles.length === 0 &&
    changes.changedFiles.length === 0 &&
    hashRepairs.size === 0
  ) {
    console.log(chalk.green("Already up to date."));
    return;
  }

  if (
    process.stdin.isTTY &&
    !options.force &&
    !options.skipAll &&
    !options.createNew
  ) {
    const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
      { type: "confirm", name: "proceed", message: "Proceed?", default: true },
    ]);
    if (!proceed) {
      console.log(chalk.yellow("Update cancelled."));
      return;
    }
  }

  const backupDir = createFullBackup(cwd, [
    ...templates.keys(),
    ".trellis/.version",
    ".trellis/.template-hashes.json",
  ]);
  const originalFiles = new Set(
    backupDir
      ? collectAllFiles(backupDir, backupDir, true).map((name) =>
          toPosix(path.relative(backupDir, name)),
        )
      : [],
  );
  const filesToHash = new Map<string, string>(hashRepairs);
  try {
    for (const file of [...changes.newFiles, ...changes.autoUpdateFiles]) {
      assertProjectPath(file.path, cwd);
      fs.mkdirSync(path.dirname(file.path), { recursive: true });
      writeFileAtomic(file.path, file.newContent);
      if (
        file.relativePath.endsWith(".sh") ||
        file.relativePath.endsWith(".py")
      )
        fs.chmodSync(file.path, "755");
      filesToHash.set(file.relativePath, file.newContent);
    }

    for (const file of changes.changedFiles) {
      const action = conflictActions.get(file.relativePath) ?? "skip";
      if (action === "overwrite") {
        assertProjectPath(file.path, cwd);
        writeFileAtomic(file.path, file.newContent);
        if (
          file.relativePath.endsWith(".sh") ||
          file.relativePath.endsWith(".py")
        )
          fs.chmodSync(file.path, "755");
        filesToHash.set(file.relativePath, file.newContent);
      } else if (action === "create-new") {
        writeFileAtomic(file.path + ".new", file.newContent);
      }
    }

    const completedHashes: TemplateHashes = { ...hashes };
    for (const [name, content] of filesToHash)
      completedHashes[name] = computeHash(content);
    saveHashes(cwd, completedHashes);
    updateVersionFile(cwd);
    if (configuredPlatforms.includes("zcode")) printZcodeSetupHint();
  } catch (error) {
    const failures: string[] = [];
    const affected = new Set([
      ...templates.keys(),
      ...changes.changedFiles
        .filter(
          (file) => conflictActions.get(file.relativePath) === "create-new",
        )
        .map((file) => `${file.relativePath}.new`),
    ]);
    for (const name of affected) {
      if (isProtectedPath(name) || originalFiles.has(name)) continue;
      try {
        const fullPath = path.join(cwd, name);
        if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile())
          fs.unlinkSync(fullPath);
      } catch {
        failures.push(name);
      }
    }
    if (backupDir) {
      for (const name of originalFiles) {
        try {
          const source = path.join(backupDir, name);
          const destination = path.join(cwd, name);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          if (fs.lstatSync(source).isSymbolicLink()) {
            fs.rmSync(destination, { force: true });
            fs.symlinkSync(fs.readlinkSync(source), destination);
          } else {
            fs.copyFileSync(source, destination);
            fs.chmodSync(destination, fs.statSync(source).mode);
          }
        } catch {
          failures.push(name);
        }
      }
    }
    throw new Error(
      `Update incomplete; managed backup restoration ${failures.length ? `failed for ${failures.join(", ")}` : "completed"}. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

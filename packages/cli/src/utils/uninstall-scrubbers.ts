/**
 * Scrubbers for structured config files during `trellis uninstall`.
 *
 * Each scrubber takes the file content (and any context it needs) and returns
 * `{ content, fullyEmpty }`:
 * - `content` is the post-scrub text to write back if the file should remain.
 * - `fullyEmpty` is true when, after stripping every trellis-managed value,
 *   nothing meaningful is left. The caller deletes the file in that case.
 *
 * Manifest path matching (for hooks.json scrubbers) uses substring containment
 * on the resolved `command` string. The leading `python3 ` / `python ` prefix
 * does not matter — we just look for the manifest-relative file path.
 */

export interface ScrubResult {
  content: string;
  fullyEmpty: boolean;
}

/**
 * Test whether a hook command string references any of the given manifest paths.
 *
 * Trellis-emitted hook commands always have the shape
 *   `<python-cmd> <manifest-path>`
 * so the trailing whitespace-delimited token is the script path. We compare
 * that last token (with surrounding quotes stripped) against the manifest
 * delete-set. This is intentionally stricter than substring matching: a
 * user-added hook whose body merely mentions a deleted path inside an `echo`
 * or comment argument (`echo "see .claude/hooks/session-start.py"`) does NOT
 * match, because the trailing token is `inspiration"` (or similar) — not the
 * path. We also accept absolute-path variants like
 * `/Users/me/proj/.claude/hooks/session-start.py` via `endsWith("/" + p)`.
 */
function commandMatchesDeletedPath(
  command: string,
  deletedPaths: readonly string[],
): boolean {
  const trimmed = command.trim();
  if (trimmed.length === 0) return false;

  const tokens = trimmed.split(/\s+/);
  const lastToken = tokens[tokens.length - 1].replace(/^["']|["']$/g, "");
  if (lastToken.length === 0) return false;

  for (const p of deletedPaths) {
    if (lastToken === p || lastToken.endsWith("/" + p)) {
      return true;
    }
  }
  return false;
}

/**
 * Read the `command` (or fallback `bash` / `powershell`) string out of an
 * arbitrary hook entry. Copilot's flat schema uses `bash` + `powershell`
 * instead of `command` for some events.
 */
function getEntryCommand(entry: unknown): string | null {
  if (entry === null || typeof entry !== "object") {
    return null;
  }
  const obj = entry as Record<string, unknown>;
  if (typeof obj.command === "string") return obj.command;
  if (typeof obj.bash === "string") return obj.bash;
  if (typeof obj.powershell === "string") return obj.powershell;
  return null;
}

/**
 * Scrub a hooks-shaped settings JSON file.
 *
 * `mode = "nested"` → `hooks.{Event}.[ {matcher?, hooks: [ {command,...} ]} ]`
 * `mode = "flat"`   → `hooks.{Event}.[ {command,...} ]`
 *
 * Strips every entry whose command references a path in `deletedPaths`,
 * then bottom-up cleans empty containers (matcher block, event array, hooks
 * object). Any user-defined keys outside `hooks` (e.g. `env`, `model`,
 * `permissions`, `version`) are preserved verbatim.
 */
export function scrubHooksJson(
  content: string,
  deletedPaths: readonly string[],
  mode: "nested" | "flat",
): ScrubResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Malformed JSON — leave it untouched, caller will skip.
    return { content, fullyEmpty: false };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { content, fullyEmpty: false };
  }

  const root = parsed as Record<string, unknown>;
  const hooks = root.hooks;

  if (hooks === undefined) {
    // No hooks block — nothing to scrub. Treat as fully empty only if the
    // entire file has no other keys.
    const fullyEmpty = Object.keys(root).length === 0;
    return { content: JSON.stringify(root, null, 2) + "\n", fullyEmpty };
  }

  if (hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) {
    // hooks is some unexpected shape — leave it alone.
    return { content, fullyEmpty: false };
  }

  const hooksObj = hooks as Record<string, unknown>;

  for (const eventName of Object.keys(hooksObj)) {
    const eventArr = hooksObj[eventName];
    if (!Array.isArray(eventArr)) continue;

    const filteredEvent: unknown[] = [];

    for (const entry of eventArr) {
      if (mode === "flat") {
        const cmd = getEntryCommand(entry);
        if (cmd !== null && commandMatchesDeletedPath(cmd, deletedPaths)) {
          continue; // drop trellis entry
        }
        filteredEvent.push(entry);
      } else {
        // nested: entry is { matcher?, hooks: [...] }
        if (entry === null || typeof entry !== "object") {
          filteredEvent.push(entry);
          continue;
        }
        const matcherBlock = entry as Record<string, unknown>;
        const inner = matcherBlock.hooks;
        if (!Array.isArray(inner)) {
          filteredEvent.push(entry);
          continue;
        }

        const filteredInner = inner.filter((sub) => {
          const cmd = getEntryCommand(sub);
          return !(
            cmd !== null && commandMatchesDeletedPath(cmd, deletedPaths)
          );
        });

        if (filteredInner.length === 0) {
          // Whole matcher block is now empty → drop the block.
          continue;
        }

        // Reconstruct the block with the filtered inner list.
        const rebuilt: Record<string, unknown> = { ...matcherBlock };
        rebuilt.hooks = filteredInner;
        filteredEvent.push(rebuilt);
      }
    }

    if (filteredEvent.length === 0) {
      // Drop the whole event array.
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete hooksObj[eventName];
    } else {
      hooksObj[eventName] = filteredEvent;
    }
  }

  // If hooks is empty → drop the key.
  if (Object.keys(hooksObj).length === 0) {
    delete root.hooks;
  } else {
    root.hooks = hooksObj;
  }

  const fullyEmpty = Object.keys(root).length === 0;
  return {
    content: JSON.stringify(root, null, 2) + "\n",
    fullyEmpty,
  };
}

/**
 * Scrub `.opencode/package.json`:
 * - remove `dependencies["@opencode-ai/plugin"]`
 * - if `dependencies` ends up empty → drop the field
 * - fully empty when nothing is left in the object
 */
export function scrubOpencodePackageJson(content: string): ScrubResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { content, fullyEmpty: false };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { content, fullyEmpty: false };
  }

  const root = parsed as Record<string, unknown>;
  const deps = root.dependencies;

  if (deps !== null && typeof deps === "object" && !Array.isArray(deps)) {
    const depsObj = deps as Record<string, unknown>;
    if ("@opencode-ai/plugin" in depsObj) {
      delete depsObj["@opencode-ai/plugin"];
    }
    if (Object.keys(depsObj).length === 0) {
      delete root.dependencies;
    } else {
      root.dependencies = depsObj;
    }
  }

  const fullyEmpty = Object.keys(root).length === 0;
  return {
    content: JSON.stringify(root, null, 2) + "\n",
    fullyEmpty,
  };
}

/**
 * Trellis-specific values written by the Pi configurator.
 *
 * The `extensions`/`skills`/`prompts` arrays are paths relative to `.pi/`. We
 * remove the exact entries that the Pi configurator emits.
 */
const PI_TRELLIS_EXTENSION = "./extensions/trellis/index.ts";
const PI_TRELLIS_SKILLS = "./skills";
const PI_TRELLIS_PROMPTS = "./prompts";
const PI_SUBAGENTS_PACKAGE = "npm:pi-subagents";

function isTrellisPiEntry(value: unknown, target: string): boolean {
  return typeof value === "string" && value === target;
}

/**
 * Scrub `.pi/settings.json`:
 * - drop `enableSkillCommands` (trellis-flagged)
 * - remove trellis entries from `extensions`/`skills`/`prompts` arrays
 * - remove trellis-managed `packages["npm:pi-subagents"]` isolation override
 * - drop arrays that become empty
 */
export function scrubPiSettings(content: string): ScrubResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { content, fullyEmpty: false };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { content, fullyEmpty: false };
  }

  const root = parsed as Record<string, unknown>;

  if ("enableSkillCommands" in root) {
    delete root.enableSkillCommands;
  }

  const arrayCleanups: [string, string][] = [
    ["extensions", PI_TRELLIS_EXTENSION],
    ["skills", PI_TRELLIS_SKILLS],
    ["prompts", PI_TRELLIS_PROMPTS],
  ];
  for (const [key, target] of arrayCleanups) {
    const arr = root[key];
    if (!Array.isArray(arr)) continue;
    const filtered = arr.filter((v) => !isTrellisPiEntry(v, target));
    if (filtered.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete root[key];
    } else {
      root[key] = filtered;
    }
  }

  const packagesValue = root.packages;
  if (
    packagesValue !== null &&
    typeof packagesValue === "object" &&
    !Array.isArray(packagesValue)
  ) {
    const packagesObj = packagesValue as Record<string, unknown>;
    if (PI_SUBAGENTS_PACKAGE in packagesObj) {
      delete packagesObj[PI_SUBAGENTS_PACKAGE];
    }
    if (Object.keys(packagesObj).length === 0) {
      delete root.packages;
    } else {
      root.packages = packagesObj;
    }
  }

  const fullyEmpty = Object.keys(root).length === 0;
  return {
    content: JSON.stringify(root, null, 2) + "\n",
    fullyEmpty,
  };
}

/**
 * Scrub `.codex/config.toml`.
 *
 * The current trellis-emitted file has two distinct chunks:
 * 1. The line `project_doc_fallback_filenames = ["AGENTS.md"]`
 * 2. A multi-line comment block that begins with the marker
 *    `# NOTE: Trellis's SessionStart + UserPromptSubmit hooks require opt-in.`
 *    and continues through `# be injected into Codex sessions.`
 *
 * Plus the leading "Project-scoped Codex defaults" header comments.
 *
 * Strategy: line-based removal. We strip:
 *  - the `project_doc_fallback_filenames = ...` line
 *  - any line that is *only* a comment introduced by trellis (the entire file
 *    as shipped is comments + that one assignment)
 *  - blank lines that surrounded those removals
 *
 * If the user added their own non-trellis lines, they are preserved as-is.
 * "Fully empty" = post-scrub content has no non-whitespace characters.
 */
export function scrubCodexConfigToml(content: string): ScrubResult {
  const trellisCommentMarkers = [
    "Project-scoped Codex defaults for Trellis workflows.",
    "Codex loads this after ~/.codex/config.toml when you work in this project.",
    "Keep AGENTS.md as the primary project instruction file.",
    "NOTE: Trellis's SessionStart + UserPromptSubmit hooks require opt-in.",
    "Add the following to your USER-level config at ~/.codex/config.toml",
    "(not this project file — features.* must be enabled globally):",
    "[features]",
    "codex_hooks = true",
    "Without this flag, hooks.json is ignored and Trellis context won't",
    "be injected into Codex sessions.",
  ];

  // A comment line is "trellis-known" if its content (after `#` and spaces)
  // matches one of the known marker strings exactly OR is an empty `#` line.
  function isTrellisCommentLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed.startsWith("#")) return false;
    const inner = trimmed.replace(/^#+\s?/, "").trim();
    if (inner.length === 0) return true; // bare `#` line inside trellis block
    return trellisCommentMarkers.some((m) => inner === m);
  }

  function isTrellisAssignment(line: string): boolean {
    return /^\s*project_doc_fallback_filenames\s*=/.test(line);
  }

  const out: string[] = [];
  let prevWasBlank = true; // start-of-file counts as blank for collapsing

  for (const rawLine of content.split(/\r?\n/)) {
    if (isTrellisAssignment(rawLine) || isTrellisCommentLine(rawLine)) {
      continue; // drop
    }
    const isBlank = rawLine.trim().length === 0;
    if (isBlank && prevWasBlank) {
      continue; // collapse runs of blanks created by removals
    }
    out.push(rawLine);
    prevWasBlank = isBlank;
  }

  // Trim trailing blank lines.
  while (out.length > 0 && out[out.length - 1].trim().length === 0) {
    out.pop();
  }

  const result = out.length > 0 ? out.join("\n") + "\n" : "";
  const fullyEmpty = result.trim().length === 0;
  return { content: result, fullyEmpty };
}

import fs from "node:fs";
import path from "node:path";
import { assertActiveDataPath } from "../utils/retired-data.js";
import { AI_TOOLS } from "../types/ai-tools.js";
import {
  getAllAgents,
  getAllHooks,
  getConfigTemplate,
  getHooksConfig,
} from "../templates/codex/index.js";
import { ensureDir } from "../utils/file-writer.js";
import {
  resolvePlaceholders,
  resolveAllAsSkillsNeutral,
  resolveBundledSkills,
  collectSkillTemplates,
  collectSharedHooks,
  renderTemplateMap,
  writeTemplateMap,
} from "./shared.js";

/**
 * User-set `model` / `model_reasoning_effort` top-level keys on a generated
 * `trellis-*.toml` agent profile. Users configure sub-agent models by
 * editing these files directly (matches Codex's own docs) — there is no
 * `.trellis/config.yaml` indirection.
 */
export interface CodexAgentModelKeys {
  model?: string;
  model_reasoning_effort?: string;
}

/**
 * Extract user-set `model` / `model_reasoning_effort` top-level keys from an
 * existing `trellis-*.toml` agent profile. Only matches uncommented
 * `key = "value"` lines (the static template's `# model = "..."` hint lines
 * never match). Not a general TOML parser — these files are known-flat with
 * no `[section]` headers.
 */
export function extractCodexAgentModelKeys(
  existingContent: string,
): CodexAgentModelKeys {
  const result: CodexAgentModelKeys = {};
  let inMultilineString = false;
  for (const rawLine of existingContent.split(/\r?\n/)) {
    const trimmed = rawLine.trim();

    if (inMultilineString) {
      // Multi-line basic strings end with a line containing `"""`. Body text
      // (e.g. developer_instructions) may itself contain lines that look
      // like `model = "..."` — never extract from inside the string.
      if (trimmed.includes('"""')) inMultilineString = false;
      continue;
    }

    // Detect the start of a multi-line basic string: `key = """...` where
    // the string isn't also closed on the same line.
    if (/^[A-Za-z_][A-Za-z0-9_-]*\s*=\s*"""/.test(trimmed)) {
      const tripleQuoteCount = (trimmed.match(/"""/g) ?? []).length;
      if (tripleQuoteCount < 2) inMultilineString = true;
      continue;
    }

    const m = trimmed.match(
      /^(model|model_reasoning_effort)\s*=\s*"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/,
    );
    if (!m) continue;
    const key = m[1] as keyof CodexAgentModelKeys;
    result[key] = tomlUnescape(m[2] ?? "");
  }
  return result;
}

/** Escape a value for embedding in a double-quoted TOML string. */
function tomlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Reverse of {@link tomlEscape} for values captured from an existing file. */
function tomlUnescape(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

/**
 * Re-insert preserved `model` / `model_reasoning_effort` keys right after
 * `sandbox_mode = "..."` in a freshly rendered `trellis-*.toml` agent
 * profile. Unset keys omit the corresponding line entirely (Codex falls
 * back through spawn value -> `[agents]` default -> parent). The fresh
 * template content never contains these keys itself (only commented
 * hints), so no de-dup pass is needed before inserting.
 */
export function applyCodexAgentModelKeys(
  freshContent: string,
  preserved: CodexAgentModelKeys,
): string {
  const lines: string[] = [];
  if (preserved.model) {
    lines.push(`model = "${tomlEscape(preserved.model)}"`);
  }
  if (preserved.model_reasoning_effort) {
    lines.push(
      `model_reasoning_effort = "${tomlEscape(preserved.model_reasoning_effort)}"`,
    );
  }
  if (lines.length === 0) {
    return freshContent;
  }

  return freshContent.replace(
    /^(sandbox_mode\s*=\s*".*"\n)/m,
    (matched) => `${matched}${lines.join("\n")}\n`,
  );
}

function isCodexAgentTomlPath(filePath: string): boolean {
  return (
    filePath.startsWith(".codex/agents/trellis-") && filePath.endsWith(".toml")
  );
}

/**
 * Preserve any user-set `model` / `model_reasoning_effort` keys from the
 * on-disk `.codex/agents/trellis-*.toml` files (at `cwd`) into every
 * matching entry of `files` (the freshly rendered desired content). Mutates
 * `files` in place. Must run before hash comparison / write so that a
 * project whose only local edit is these two keys is not flagged as a
 * modified-file conflict.
 */
export function preserveCodexAgentModelKeys(
  cwd: string,
  files: Map<string, string>,
): void {
  for (const [filePath, freshContent] of files) {
    if (!isCodexAgentTomlPath(filePath)) continue;
    assertActiveDataPath(path.join(cwd, filePath), cwd);
    let existingContent = "";
    try {
      existingContent = fs.readFileSync(path.join(cwd, filePath), "utf-8");
    } catch {
      continue;
    }
    const preserved = extractCodexAgentModelKeys(existingContent);
    files.set(filePath, applyCodexAgentModelKeys(freshContent, preserved));
  }
}

/**
 * The Codex file set — written at init and diffed by `trellis update`.
 * - .agents/skills/ — shared skills from common source, rendered with the
 *   neutral placeholder resolver so the auto-triggered skill templates from
 *   `common/skills/` are byte-identical regardless of which platform writes
 *   them (Gemini CLI 0.40+ and Pi target `.agents/skills/` too, and
 *   last-writer-wins is only safe when both writers produce identical output).
 * - .codex/agents/ — custom agent profiles. Native Codex SubagentStart hooks
 *   push role-specific context; each profile also carries a marker-gated pull
 *   fallback for untrusted or unavailable hooks, so no unconditional prelude.
 * - .codex/hooks/, hooks.json — hooks.json registers UserPromptSubmit for the
 *   main session; SubagentStart is registered for role-specific shared context.
 * - .codex/config.toml — platform config.
 */
export function collectCodexTemplates(): Map<string, string> {
  const files = new Map<string, string>();
  const ctx = AI_TOOLS.codex.templateContext;

  for (const [filePath, content] of collectSkillTemplates(
    ".agents/skills",
    resolveAllAsSkillsNeutral(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }
  for (const agent of getAllAgents()) {
    files.set(`.codex/agents/${agent.name}.toml`, agent.content);
  }
  for (const hook of getAllHooks()) {
    files.set(`.codex/hooks/${hook.name}`, hook.content);
  }
  // Shared hooks (inject-workflow-state.py + native SubagentStart context).
  for (const [k, v] of collectSharedHooks(".codex/hooks", "codex")) {
    files.set(k, v);
  }
  files.set(".codex/hooks.json", resolvePlaceholders(getHooksConfig()));
  const config = getConfigTemplate();
  files.set(`.codex/${config.targetPath}`, config.content);

  return files;
}

/**
 * Configure Codex by writing `collectCodexTemplates`, plus the one piece of
 * behavior a `Map<path, content>` cannot carry.
 */
export async function configureCodex(cwd: string): Promise<void> {
  // Build map → post-process map → write. Rendered up front so the preserved
  // user keys are grafted onto exactly the bytes `trellis update` compares
  // against — update.ts runs preserveCodexAgentModelKeys over its already
  // rendered map too, and the two must agree. writeTemplateMap re-renders,
  // which is a no-op (replacePythonCommandLiterals is idempotent).
  const files = renderTemplateMap(collectCodexTemplates());
  preserveCodexAgentModelKeys(cwd, files);
  await writeTemplateMap(cwd, files);

  // RESIDUAL — not expressible as a path→content pair: a directory with no
  // files in it. Trellis ships no Codex-specific skills (the workflow skills
  // all land in .agents/skills/, which Codex reads too), but users need the
  // conventional place for their own, and manifest-prune.ts treats
  // `.codex/skills/<custom>/` as user-owned data the manifest must not claim.
  ensureDir(path.join(cwd, ".codex", "skills"));

  // NOTE: Codex hooks require `features.hooks = true` in the user's
  // ~/.codex/config.toml (Codex 0.129+). The legacy `features.codex_hooks = true`
  // still works on 0.129+ but emits a deprecation warning; pre-0.129 only
  // accepts `codex_hooks`. Without this flag the hooks.json is ignored and
  // inject-workflow-state.py will never fire. Codex 0.129+ also gates each
  // installed hook behind a one-time `/hooks` review — until the user approves
  // it the workflow breadcrumb won't auto-inject (the trellis-bootstrap
  // fallback in inject-workflow-state.py covers this case). Documented in
  // spec/cli/backend/platform-integration.md.
  if (!process.env.VITEST && !process.env.TRELLIS_QUIET) {
    process.stderr.write(
      "⚠️  Codex hooks require `features.hooks = true` in your " +
        "~/.codex/config.toml (Codex 0.129+; older versions: `codex_hooks = true`). " +
        "On Codex 0.129+ also run `/hooks` once to approve the Trellis " +
        "hooks. Without these the Trellis workflow breadcrumb and native " +
        "sub-agent context won't auto-inject (agents retain a pull fallback). " +
        "See Trellis docs for details.\n",
    );
  }
}

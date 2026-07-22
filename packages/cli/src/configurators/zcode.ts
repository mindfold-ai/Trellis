/**
 * ZCode configurator.
 *
 * ZCode (智谱) is an agentCapable class-1 platform. Since ZCode 3.x it exposes
 * a workspace hook config at `.zcode/config.json` (SessionStart,
 * UserPromptSubmit, and PreToolUse for Agent/Task), so `hasHooks` is true.
 * Four output paths:
 * - `.zcode/skills/` — ZCode-private workflow and bundled skills
 * - `.zcode/commands/trellis/` — slash commands (invoked as /trellis:<name>)
 * - `.zcode/agents/` — sub-agent definitions with hook-injection fallback
 * - `.zcode/hooks/` + `.zcode/config.json` — shared Python hook scripts and
 *   the workspace hook registration
 */

import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import { getAllAgents, getHooksConfig } from "../templates/zcode/index.js";
import { getSharedHookScriptsForPlatform } from "../templates/shared-hooks/index.js";
import {
  collectSkillTemplates,
  resolveBundledSkills,
  resolveCommands,
  resolvePlaceholders,
  resolveSkills,
  writeSkills,
  writeAgents,
  writeSharedHooks,
  applyMethodSkillsPreludeMarkdown,
} from "./shared.js";

/** Shared hooks directory written for ZCode (mirrors the configure path). */
const ZCODE_HOOKS_DIR = ".zcode/hooks";

/**
 * Collect all ZCode template files for `trellis update` diff tracking.
 * Must stay in sync with `configureZcode`.
 */
export function collectZcodeTemplates(): Map<string, string> {
  const config = AI_TOOLS.zcode;
  const ctx = config.templateContext;
  const files = new Map<string, string>();

  // 1. ZCode-private workflow and bundled skills → .zcode/skills/.
  for (const [filePath, content] of collectSkillTemplates(
    ".zcode/skills",
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  // 2. Commands → .zcode/commands/trellis/
  for (const cmd of resolveCommands(ctx)) {
    files.set(`.zcode/commands/trellis/${cmd.name}.md`, cmd.content);
  }

  // 3. Sub-agents → .zcode/agents/ (hook-inject; templates carry fallback).
  for (const agent of applyMethodSkillsPreludeMarkdown(getAllAgents())) {
    files.set(`.zcode/agents/${agent.name}.md`, agent.content);
  }

  // 4. Shared hook scripts → .zcode/hooks/.
  //    Content is platform-independent (no placeholders), written as-is so the
  //    hash matches what writeSharedHooks installs.
  for (const hook of getSharedHookScriptsForPlatform("zcode")) {
    files.set(`${ZCODE_HOOKS_DIR}/${hook.name}`, hook.content);
  }

  // 5. Workspace hook registration → .zcode/config.json
  files.set(
    ".zcode/config.json",
    resolvePlaceholders(getHooksConfig().content),
  );

  return files;
}

/**
 * Configure ZCode at init time: write private skills, commands, sub-agents,
 * shared hooks, and the workspace hook config.
 */
export async function configureZcode(cwd: string): Promise<void> {
  const config = AI_TOOLS.zcode;
  const ctx = config.templateContext;
  const zcodeRoot = path.join(cwd, ".zcode");

  // 1. ZCode-private workflow and bundled skills → .zcode/skills/.
  await writeSkills(
    path.join(zcodeRoot, "skills"),
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  );

  // 2. Commands → .zcode/commands/trellis/
  const commandsDir = path.join(zcodeRoot, "commands", "trellis");
  ensureDir(commandsDir);
  for (const cmd of resolveCommands(ctx)) {
    await writeFile(path.join(commandsDir, `${cmd.name}.md`), cmd.content);
  }

  // 3. Sub-agents → .zcode/agents/ (hook-inject; templates carry fallback).
  await writeAgents(
    path.join(zcodeRoot, "agents"),
    applyMethodSkillsPreludeMarkdown(getAllAgents()),
  );

  // 4. Shared hooks → .zcode/hooks/
  await writeSharedHooks(path.join(zcodeRoot, "hooks"), "zcode");

  // 5. Workspace hook config → .zcode/config.json
  await writeFile(
    path.join(zcodeRoot, "config.json"),
    resolvePlaceholders(getHooksConfig().content),
  );

  // ZCode loads hook config at session start and does NOT hot-reload it, so
  // users must open a new session for these hooks to fire. Mirrors the Codex
  // one-shot hint pattern; silent under test/quiet environments.
  if (!process.env.VITEST && !process.env.TRELLIS_QUIET) {
    process.stderr.write(
      "ℹ️  ZCode loads hooks at session start (no hot-reload). " +
        "Open a NEW ZCode session for the Trellis SessionStart / " +
        "UserPromptSubmit / PreToolUse hooks in .zcode/config.json to take effect.\n",
    );
  }
}

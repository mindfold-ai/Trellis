import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { getAllHooks, getHooksConfig } from "../templates/copilot/index.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  resolvePlaceholders,
  resolveCommands,
  resolveSkills,
  resolveBundledSkills,
  applyPullBasedPreludeMarkdown,
  normalizeCopilotMarkdownAgents,
  writeSkills,
  writeSharedHooks,
  replacePythonCommandLiterals,
} from "./shared.js";

/**
 * Configure GitHub Copilot:
 * - prompts/ — start + finish-work as prompt files
 * - skills/trellis-{name}/SKILL.md — other 5 as auto-triggered skills
 * - agents/{name}.agent.md — sub-agent definitions (note .agent.md suffix)
 * - copilot/hooks/ — platform-specific + shared hook scripts
 * - hooks config — hooks.json
 */
export async function configureCopilot(cwd: string): Promise<void> {
  const config = AI_TOOLS.copilot;
  const ctx = config.templateContext;
  const copilotRoot = path.join(cwd, ".github", "copilot");

  const promptsDir = path.join(cwd, ".github", "prompts");
  ensureDir(promptsDir);
  for (const cmd of resolveCommands(ctx)) {
    await writeFile(
      path.join(promptsDir, `${cmd.name}.prompt.md`),
      cmd.content,
    );
  }

  await writeSkills(
    path.join(cwd, ".github", "skills"),
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  );

  const agentsDir = path.join(cwd, ".github", "agents");
  ensureDir(agentsDir);
  // Copilot is a class-2 (pull-based) platform: hook events don't reliably
  // fire for sub-agents (#2392/#2540). Reuse Cursor's agent content and
  // prepend the pull-based prelude so sub-agents Read Trellis context themselves.
  // Cursor uses Claude-style comma-separated tools frontmatter; normalize that
  // to Copilot's YAML tool list format before writing into .github/agents.
  const { getAllAgents: getCursorAgents } =
    await import("../templates/cursor/index.js");
  for (const agent of applyPullBasedPreludeMarkdown(
    normalizeCopilotMarkdownAgents(getCursorAgents()),
  )) {
    await writeFile(
      path.join(agentsDir, `${agent.name}.agent.md`),
      replacePythonCommandLiterals(agent.content),
    );
  }

  // Platform-specific hook scripts (Copilot's own session-start.py)
  const hooksDir = path.join(copilotRoot, "hooks");
  ensureDir(hooksDir);
  for (const hook of getAllHooks()) {
    await writeFile(
      path.join(hooksDir, hook.name),
      replacePythonCommandLiterals(hook.content),
    );
  }

  // Shared hook scripts (inject-workflow-state.py only). Copilot bundles its
  // own session-start.py above; sub-agent context is pull-based (class-2).
  await writeSharedHooks(hooksDir, "copilot");

  // Hooks config
  const resolvedConfig = resolvePlaceholders(getHooksConfig());
  await writeFile(path.join(copilotRoot, "hooks.json"), resolvedConfig);
  const githubHooksDir = path.join(cwd, ".github", "hooks");
  ensureDir(githubHooksDir);
  await writeFile(path.join(githubHooksDir, "trellis.json"), resolvedConfig);
}

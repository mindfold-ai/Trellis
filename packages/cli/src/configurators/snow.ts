/**
 * Snow CLI configurator.
 *
 * Snow CLI is a class-1 platform (agentCapable + auto context inject +
 * project agent discovery + beforeSubAgentStart), same capability class as
 * Claude Code / OMP — host protocol differs, workflow surface matches.
 *
 * Output paths:
 * - `.snow/skills/` — workflow + bundled skills (Claude Code Skills layout)
 * - `.snow/commands/trellis-*.json` — custom prompt slash commands (no trellis-start)
 * - `.snow/agents/` — project sub-agents (auto-discovered by Snow; primary path)
 * - `.snow/hooks/` — inject hooks (session / user / beforeSubAgentStart)
 * - `.snow/SNOW.md` — operator guide
 *
 * Modern Snow does NOT ship `.snow/sub-agents.trellis.json` (legacy merge
 * fragment for older hosts without project-agent discovery).
 *
 * hasHooks=true → filterCommands drops `start`; SessionStart injects context.
 * Agents are written without class-2 pull-based prelude (hook inject is primary).
 */

import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  getAllAgents,
  getAllHooks,
  getSnowGuide,
} from "../templates/snow/index.js";
import {
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolveCommands,
  writeSkills,
  writeAgents,
  replacePythonCommandLiterals,
} from "./shared.js";

function buildSnowCommandJson(name: string, content: string): string {
  const description =
    name === "continue"
      ? "Resume the current Trellis task at the right workflow phase."
      : name === "finish-work"
        ? "Wrap up the current Trellis session: archive tasks and record journal."
        : `Trellis: ${name}`;

  return (
    JSON.stringify(
      {
        type: "prompt",
        description,
        command: content,
        location: "project",
      },
      null,
      2,
    ) + "\n"
  );
}

function collectSnowStaticFiles(): Map<string, string> {
  const files = new Map<string, string>();
  for (const hook of getAllHooks()) {
    files.set(`.snow/hooks/${hook.targetPath}`, hook.content);
  }
  files.set(".snow/SNOW.md", getSnowGuide());
  return files;
}

/**
 * Collect all Snow template files for `trellis update` diff tracking.
 * Must stay in sync with `configureSnow`.
 */
export function collectSnowTemplates(): Map<string, string> {
  const config = AI_TOOLS.snow;
  const ctx = config.templateContext;
  const files = new Map<string, string>();

  // hasHooks=true → resolveAllAsSkills drops trellis-start.
  for (const [filePath, content] of collectSkillTemplates(
    ".snow/skills",
    resolveAllAsSkills(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  for (const cmd of resolveCommands(ctx)) {
    const body = replacePythonCommandLiterals(cmd.content);
    files.set(
      `.snow/commands/trellis-${cmd.name}.json`,
      buildSnowCommandJson(cmd.name, body),
    );
  }

  // class-1: no applyPullBasedPreludeMarkdown (hook inject is primary)
  for (const agent of getAllAgents()) {
    files.set(`.snow/agents/${agent.name}.md`, agent.content);
  }

  for (const [filePath, content] of collectSnowStaticFiles()) {
    files.set(filePath, content);
  }

  return files;
}

/**
 * Configure Snow CLI at init time: write skills, prompt commands, agents,
 * inject hooks, and operator guide.
 */
export async function configureSnow(cwd: string): Promise<void> {
  const config = AI_TOOLS.snow;
  const ctx = config.templateContext;

  await writeSkills(
    path.join(cwd, ".snow", "skills"),
    resolveAllAsSkills(ctx),
    resolveBundledSkills(ctx),
  );

  const commandsDir = path.join(cwd, ".snow", "commands");
  ensureDir(commandsDir);
  for (const cmd of resolveCommands(ctx)) {
    const body = replacePythonCommandLiterals(cmd.content);
    await writeFile(
      path.join(commandsDir, `trellis-${cmd.name}.json`),
      buildSnowCommandJson(cmd.name, body),
    );
  }

  // class-1: no applyPullBasedPreludeMarkdown (hook inject is primary)
  await writeAgents(path.join(cwd, ".snow", "agents"), getAllAgents());

  const hooksDir = path.join(cwd, ".snow", "hooks");
  ensureDir(hooksDir);
  for (const hook of getAllHooks()) {
    await writeFile(
      path.join(hooksDir, hook.targetPath),
      replacePythonCommandLiterals(hook.content),
    );
  }

  await writeFile(path.join(cwd, ".snow", "SNOW.md"), getSnowGuide());
}

import { AI_TOOLS } from "../types/ai-tools.js";
import {
  applyPullBasedPreludeMarkdown,
  collectSkillTemplates,
  resolveCommands,
  resolveBundledSkills,
  resolvePlaceholders,
  resolveSkillsNeutral,
} from "./shared.js";
import {
  getAllAgents,
  getExtensionTemplate,
  getSettingsTemplate,
} from "../templates/pi/index.js";

function resolvePiCommands(): ReturnType<typeof resolveCommands> {
  const ctx = AI_TOOLS.pi.templateContext;
  const commands = resolveCommands(ctx);
  if (commands.some((command) => command.name === "start")) return commands;

  // Pi has extension hooks, so the shared command resolver filters `start`.
  // Keep a manual fallback because Pi's `session_start` event cannot mutate
  // model context; the strong startup injection happens later at agent start.
  const start = resolveCommands({ ...ctx, hasHooks: false }).find(
    (command) => command.name === "start",
  );
  return start ? [start, ...commands] : commands;
}

const PI_ACTIVE_TASK_SOURCE =
  "1. **Look at the dispatch prompt** you received from the main agent. If its first line is `Active task: <path>` (e.g. `Active task: .trellis/tasks/04-17-foo`), use that path. The main agent is required to include this line on class-2 platforms.";
const PI_ACTIVE_TASK_TRANSPORT =
  "1. **Look at the dispatch prompt** you received from the main agent. Accept either an exact first line `Active task: <path>` or pi-subagents' package-owned transport form `Task: Active task: <path>`. For the transport form, strip exactly one leading `Task: ` and require `Active task:` to remain the first line of the underlying task payload. Use that path and stop resolving; reject any other prefix.";

function applyPiSubagentTransport(
  agents: ReturnType<typeof applyPullBasedPreludeMarkdown>,
): ReturnType<typeof applyPullBasedPreludeMarkdown> {
  return agents.map((agent) => {
    if (!["trellis-implement", "trellis-check"].includes(agent.name)) {
      return agent;
    }
    if (!agent.content.includes(PI_ACTIVE_TASK_SOURCE)) {
      throw new Error(`Pi task-identity prelude not found for ${agent.name}`);
    }
    return {
      ...agent,
      content: agent.content.replace(
        PI_ACTIVE_TASK_SOURCE,
        PI_ACTIVE_TASK_TRANSPORT,
      ),
    };
  });
}

/**
 * The Pi file set — written at init and diffed by `trellis update`.
 */
export function collectPiTemplates(): Map<string, string> {
  const files = new Map<string, string>();
  const ctx = AI_TOOLS.pi.templateContext;

  for (const command of resolvePiCommands()) {
    files.set(`.pi/prompts/trellis-${command.name}.md`, command.content);
  }

  // Shared skills go to `.agents/skills/` (Pi discovers this cross-platform
  // workspace alias natively). Neutral resolver keeps content byte-identical
  // to Codex's/Gemini's writes for the same skill names, avoiding the
  // duplicate/conflicting-skill installs reported in #447.
  for (const [filePath, content] of collectSkillTemplates(
    ".agents/skills",
    resolveSkillsNeutral(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  for (const agent of applyPiSubagentTransport(
    applyPullBasedPreludeMarkdown(getAllAgents()),
  )) {
    files.set(`.pi/agents/${agent.name}.md`, agent.content);
  }

  files.set(".pi/extensions/trellis/index.ts", getExtensionTemplate());

  const settings = getSettingsTemplate();
  files.set(
    `.pi/${settings.targetPath}`,
    resolvePlaceholders(settings.content),
  );

  return files;
}

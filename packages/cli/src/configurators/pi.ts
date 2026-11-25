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

/**
 * The file surface PI-Desktop shares with Pi Agent.
 *
 * PI-Desktop reads project slash templates from `.pi/prompts`, turns
 * `.pi/agents/*.md` into sub-agent types, and indexes `.agents/skills/**`, so
 * these files are useful to both hosts and must stay byte-identical when both
 * platforms are configured. They are therefore always rendered from *pi's*
 * template context: `{{CLI_FLAG}}` only appears in
 * `get_context.py --platform …` and both ids resolve to workflow.md's `Pi`
 * marker block (`_PLATFORM_MARKER_LABELS`), so the rendering is correct for
 * either host and identical on disk.
 */
export function collectPiSurface(): Map<string, string> {
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

  for (const agent of applyPullBasedPreludeMarkdown(getAllAgents())) {
    files.set(`.pi/agents/${agent.name}.md`, agent.content);
  }

  return files;
}

/**
 * The Pi Agent file set — written at init and diffed by `trellis update`.
 * Pi additionally loads a project extension and reads `.pi/settings.json`;
 * PI-Desktop does neither, so those two files stay here rather than in
 * {@link collectPiSurface}.
 */
export function collectPiTemplates(): Map<string, string> {
  const files = collectPiSurface();
  const ctx = AI_TOOLS.pi.templateContext;

  files.set(".pi/extensions/trellis/index.ts", getExtensionTemplate());

  const settings = getSettingsTemplate();
  files.set(
    `.pi/${settings.targetPath}`,
    resolvePlaceholders(settings.content, ctx),
  );

  return files;
}

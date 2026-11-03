import { AI_TOOLS } from "../types/ai-tools.js";
import { getHooksConfig } from "../templates/cursor/index.js";
import {
  collectSharedHooks,
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolvePlaceholders,
} from "./shared.js";

const CURSOR_SKILL_NOTE = `

## Cursor

A local sessionStart hook can run without its additional_context reaching the agent prompt. Use the AGENTS.md instructions and \`mini-trellis mem recall\`, then \`mini-trellis mem read\` if the excerpt is not enough. Cloud agents do not run sessionStart. Cursor conversation history is not parsed. After a confirmed decision, use the \`mini-trellis-remember\` skill.
`;

/**
 * Project knowledge plus a local sessionStart entry.
 * No per-turn hook, sub-agent, or conversation-store parser.
 */
export function collectCursorTemplates(): Map<string, string> {
  const ctx = AI_TOOLS.cursor.templateContext;
  const files = collectSkillTemplates(
    ".cursor/skills",
    resolveAllAsSkills(ctx),
    resolveBundledSkills(ctx),
  );
  const skill = ".cursor/skills/mini-trellis-session-insight/SKILL.md";
  const body = files.get(skill);
  if (body) files.set(skill, `${body.trimEnd()}\n${CURSOR_SKILL_NOTE}`);
  for (const [relPath, content] of collectSharedHooks(
    ".cursor/hooks",
    "cursor",
  )) {
    files.set(relPath, content);
  }
  files.set(".cursor/hooks.json", resolvePlaceholders(getHooksConfig(), ctx));
  return files;
}

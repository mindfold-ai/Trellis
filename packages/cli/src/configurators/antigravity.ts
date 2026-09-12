import { AI_TOOLS } from "../types/ai-tools.js";
import {
  collectBothTemplates,
  collectSharedHooks,
  resolvePlaceholders,
} from "./shared.js";
import { getHooksConfig } from "../templates/antigravity/index.js";

/**
 * The Antigravity file set — written at init and diffed by `trellis update`.
 * - workflows/ — start + finish-work as slash commands
 * - skills/trellis-{name}/SKILL.md — auto-triggered skills from `common/skills/`
 * - hooks/*.py — shared hook scripts (inject-workflow-state.py, inject-shell-session-context.py)
 * - hooks.json — Antigravity lifecycle hooks configuration
 */
export function collectAntigravityTemplates(): Map<string, string> {
  const files = collectBothTemplates(
    AI_TOOLS.antigravity.templateContext,
    (n) => `.agent/workflows/${n}.md`,
    ".agent/skills",
  );
  for (const [k, v] of collectSharedHooks(".agent/hooks", "antigravity")) {
    files.set(k, v);
  }
  files.set(".agent/hooks.json", resolvePlaceholders(getHooksConfig()));
  return files;
}

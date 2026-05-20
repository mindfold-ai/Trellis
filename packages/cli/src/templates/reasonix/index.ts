/**
 * Reasonix template module.
 *
 * Reasonix (DeepSeek-Reasonix) is a DeepSeek-native AI coding agent.
 * It stores skills as `.reasonix/skills/*.md` (Markdown + frontmatter).
 *
 * This module is intentionally minimal: Reasonix has no platform-specific
 * agents or settings files. All workflow skills are generated from
 * `templates/common/` via the shared configurator helpers.
 */

import { createTemplateReader, type AgentTemplate } from "../template-utils.js";

const { readTemplate } = createTemplateReader(import.meta.url);

// Placeholder for future platform-specific templates.
// Reasonix currently has no per-platform agents, settings, hooks, or
// extensions — the common workflow skills cover everything needed.

export function getCustomTemplate(_name: string): string {
  return readTemplate(_name);
}

/** No platform agents (Reasonix uses skills-as-subagents via frontmatter `run_as`). */
export function getAllAgents(): AgentTemplate[] {
  return [];
}

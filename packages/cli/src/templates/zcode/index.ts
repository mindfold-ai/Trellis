/**
 * ZCode template module.
 *
 * ZCode (智谱) is an agentic AI coding tool that supports multi-agent
 * collaboration. It stores agents as `.zcode/agents/<name>.md`
 * (Markdown with YAML frontmatter: name, description, color).
 *
 * Sub-agent definitions (trellis-implement, trellis-check, trellis-research) use pull-based
 * context injection — no hooks are available, so agents read their own
 * context files at startup.
 */

import { createTemplateReader, type AgentTemplate } from "../template-utils.js";

const { listMdAgents } = createTemplateReader(import.meta.url);

/** Sub-agent definitions (trellis-implement, trellis-check, trellis-research). */
export function getAllAgents(): AgentTemplate[] {
  return listMdAgents();
}

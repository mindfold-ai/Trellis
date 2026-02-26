/**
 * Antigravity workflow templates
 *
 * Antigravity uses workspace workflows under .agent/workflows/.
 * We reuse Codex skill content as workflow content.
 */

import {
  getAllSkills as getAllCodexSkills,
  type SkillTemplate as CodexSkillTemplate,
} from "../codex/index.js";

export interface WorkflowTemplate {
  name: string;
  content: string;
}

function adaptSkillContentToWorkflow(
  content: string,
  workflowNames: string[],
): string {
  const base = content
    .replaceAll("Codex skills", "Antigravity workflows")
    .replaceAll("Codex skill", "Antigravity workflow")
    .replaceAll("Create New Skill", "Create New Workflow")
    .replaceAll(
      ".agents/skills/<skill-name>/SKILL.md",
      ".agent/workflows/<workflow-name>.md",
    )
    .replace(
      /\.agents\/skills\/([^/\s`]+)\/SKILL\.md/g,
      ".agent/workflows/$1.md",
    )
    .replaceAll(".agents/skills/", ".agent/workflows/")
    .replaceAll("$<skill-name>", "/<workflow-name>")
    .replaceAll("Or open /skills and select it", "Or type / and select it");

  // Antigravity workflows are triggered with slash commands (/start), not "$skill".
  return workflowNames.reduce(
    (adapted, name) => adapted.replaceAll(`$${name}`, `/${name}`),
    base,
  );
}

export function getAllWorkflows(): WorkflowTemplate[] {
  const skills: CodexSkillTemplate[] = getAllCodexSkills();
  const workflowNames = skills.map((skill) => skill.name);
  return skills.map((skill) => ({
    name: skill.name,
    content: adaptSkillContentToWorkflow(skill.content, workflowNames),
  }));
}

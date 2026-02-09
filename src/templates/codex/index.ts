/**
 * Codex skill templates
 *
 * These are GENERIC templates for user projects.
 * Do NOT use Trellis project's own .agents/skills directory (which may be customized).
 *
 * Directory structure:
 *   codex/
 *   └── skills/
 *       └── <skill-name>/
 *           └── SKILL.md
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

function listSkillNames(): string[] {
  try {
    return readdirSync(join(__dirname, "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export interface SkillTemplate {
  name: string;
  content: string;
}

export function getAllSkills(): SkillTemplate[] {
  const skills: SkillTemplate[] = [];

  for (const name of listSkillNames()) {
    const content = readTemplate(`skills/${name}/SKILL.md`);
    skills.push({ name, content });
  }

  return skills;
}

/**
 * Codex templates
 *
 * These are GENERIC templates for user projects.
 * Do NOT use Trellis project's own .agents/skills or .codex directories
 * (which may be customized).
 *
 * Directory structure:
 *   codex/
 *   ├── agents/         # Project-scoped Codex custom agents (.toml)
 *   ├── skills/         # Trellis skills (SKILL.md)
 *   └── config.toml     # Project-scoped Codex config
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

function listDirectories(dir: string): string[] {
  try {
    return readdirSync(join(__dirname, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function listFiles(dir: string): string[] {
  try {
    return readdirSync(join(__dirname, dir)).sort();
  } catch {
    return [];
  }
}

export interface SkillTemplate {
  name: string;
  content: string;
}

export interface AgentTemplate {
  name: string;
  content: string;
}

export interface ConfigTemplate {
  targetPath: string;
  content: string;
}

export function getAllSkills(): SkillTemplate[] {
  const skills: SkillTemplate[] = [];

  for (const name of listDirectories("skills")) {
    const content = readTemplate(`skills/${name}/SKILL.md`);
    skills.push({ name, content });
  }

  return skills;
}

export function getAllAgents(): AgentTemplate[] {
  const agents: AgentTemplate[] = [];

  for (const file of listFiles("agents")) {
    if (!file.endsWith(".toml")) {
      continue;
    }

    const name = file.replace(".toml", "");
    const content = readTemplate(`agents/${file}`);
    agents.push({ name, content });
  }

  return agents;
}

export function getConfigTemplate(): ConfigTemplate {
  return {
    targetPath: "config.toml",
    content: readTemplate("config.toml"),
  };
}

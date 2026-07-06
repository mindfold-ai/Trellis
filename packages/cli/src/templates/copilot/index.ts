/**
 * Copilot templates
 *
 * These are GENERIC templates for user projects.
 *
 * Directory structure:
 *   copilot/
 *   ├── prompts/         # Slash-command prompts → .github/prompts/*.prompt.md
 *   ├── hooks/           # Hook scripts → .github/copilot/hooks/
 *   ├── hooks.json       # Hooks config → .github/hooks/trellis.json
 *   └── copilot-instructions.md → .github/copilot-instructions.md
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const COPILOT_INSTRUCTIONS_PATH = ".github/copilot-instructions.md";
export const COPILOT_INSTRUCTIONS_BLOCK_START =
  "<!-- TRELLIS:COPILOT-GUIDANCE:START -->";
export const COPILOT_INSTRUCTIONS_BLOCK_END =
  "<!-- TRELLIS:COPILOT-GUIDANCE:END -->";

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

function listFiles(dir: string): string[] {
  try {
    return readdirSync(join(__dirname, dir)).sort();
  } catch {
    return [];
  }
}

export interface HookTemplate {
  name: string;
  content: string;
}

export interface PromptTemplate {
  name: string;
  content: string;
}

export function getAllHooks(): HookTemplate[] {
  const hooks: HookTemplate[] = [];

  for (const file of listFiles("hooks")) {
    if (!file.endsWith(".py")) {
      continue;
    }
    hooks.push({ name: file, content: readTemplate(`hooks/${file}`) });
  }

  return hooks;
}

export function getHooksConfig(): string {
  return readTemplate("hooks.json");
}

export function getCopilotInstructions(): string {
  return readTemplate("copilot-instructions.md");
}

export function getAllPrompts(): PromptTemplate[] {
  const prompts: PromptTemplate[] = [];

  for (const file of listFiles("prompts")) {
    if (!file.endsWith(".prompt.md")) {
      continue;
    }
    prompts.push({
      name: file.slice(0, -".prompt.md".length),
      content: readTemplate(`prompts/${file}`),
    });
  }

  return prompts;
}

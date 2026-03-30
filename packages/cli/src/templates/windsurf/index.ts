/**
 * Windsurf workflow templates
 *
 * These are GENERIC templates for user projects.
 * Do NOT use Trellis project's own .windsurf/ directory (which may be customized).
 *
 * Directory structure:
 *   windsurf/
 *   └── workflows/   # Workflow files
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

function listFiles(dir: string): string[] {
  try {
    return readdirSync(join(__dirname, dir));
  } catch {
    return [];
  }
}

export interface WorkflowTemplate {
  name: string;
  content: string;
}

/**
 * Get all workflow templates.
 * Workflow names match their filename stem
 * (e.g. trellis-start.md -> /trellis-start).
 */
export function getAllWorkflows(): WorkflowTemplate[] {
  const workflows: WorkflowTemplate[] = [];

  for (const file of listFiles("workflows")) {
    if (!file.endsWith(".md")) {
      continue;
    }

    const name = file.replace(".md", "");
    const content = readTemplate(`workflows/${file}`);
    workflows.push({ name, content });
  }

  return workflows;
}

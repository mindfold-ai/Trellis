import path from "node:path";
import { getAllSkills } from "../templates/codex/index.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";

/**
 * Configure Codex by writing skill templates.
 *
 * Output:
 * - .agents/skills/<skill-name>/SKILL.md
 */
export async function configureCodex(cwd: string): Promise<void> {
  const skillsRoot = path.join(cwd, ".agents", "skills");
  ensureDir(skillsRoot);

  for (const skill of getAllSkills()) {
    const skillDir = path.join(skillsRoot, skill.name);
    ensureDir(skillDir);
    const targetPath = path.join(skillDir, "SKILL.md");
    await writeFile(targetPath, skill.content);
  }
}

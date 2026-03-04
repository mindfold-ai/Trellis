import path from "node:path";
import { getAllSkills } from "../templates/trae/index.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";

/**
 * Configure Trae by writing skill templates.
 *
 * Output:
 * - .trae/skills/<skill-name>/SKILL.md
 */
export async function configureTrae(cwd: string): Promise<void> {
  const skillsRoot = path.join(cwd, ".trae", "skills");
  ensureDir(skillsRoot);

  for (const skill of getAllSkills()) {
    const skillDir = path.join(skillsRoot, skill.name);
    ensureDir(skillDir);
    const targetPath = path.join(skillDir, "SKILL.md");
    await writeFile(targetPath, skill.content);
  }
}

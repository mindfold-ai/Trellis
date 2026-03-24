import path from "node:path";
import {
  getAllAgents,
  getAllSkills,
  getConfigTemplate,
} from "../templates/codex/index.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";

/**
 * Configure Codex by writing:
 * - .agents/skills/<skill-name>/SKILL.md
 * - .codex/agents/<agent-name>.toml
 * - .codex/config.toml
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

  const codexRoot = path.join(cwd, ".codex");
  const codexAgentsRoot = path.join(codexRoot, "agents");
  ensureDir(codexAgentsRoot);

  for (const agent of getAllAgents()) {
    const targetPath = path.join(codexAgentsRoot, `${agent.name}.toml`);
    await writeFile(targetPath, agent.content);
  }

  const config = getConfigTemplate();
  await writeFile(path.join(codexRoot, config.targetPath), config.content);
}

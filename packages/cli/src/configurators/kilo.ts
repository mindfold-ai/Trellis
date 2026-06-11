import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  resolveBundledSkills,
  resolveCommands,
  resolveSkills,
  writeSkills,
} from "./shared.js";

/**
 * Configure Kilo CLI:
 * - workflows/ — start + finish-work as slash commands
 * - skills/trellis-{name}/SKILL.md — auto-triggered skills from `common/skills/`
 */
export async function configureKilo(cwd: string): Promise<void> {
  const ctx = AI_TOOLS.kilo.templateContext;

  const workflowsDir = path.join(cwd, ".kilocode", "workflows");
  ensureDir(workflowsDir);
  for (const cmd of resolveCommands(ctx)) {
    await writeFile(path.join(workflowsDir, `${cmd.name}.md`), cmd.content);
  }

  await writeSkills(
    path.join(cwd, ".kilocode", "skills"),
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  );
}

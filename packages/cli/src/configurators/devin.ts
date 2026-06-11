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
 * Configure Devin (formerly Windsurf):
 * - workflows/ — start + finish-work as slash commands
 * - skills/trellis-{name}/SKILL.md — auto-triggered skills from `common/skills/`
 */
export async function configureDevin(cwd: string): Promise<void> {
  const ctx = AI_TOOLS.devin.templateContext;

  const workflowsDir = path.join(cwd, ".devin", "workflows");
  ensureDir(workflowsDir);
  for (const cmd of resolveCommands(ctx)) {
    await writeFile(
      path.join(workflowsDir, `trellis-${cmd.name}.md`),
      cmd.content,
    );
  }

  await writeSkills(
    path.join(cwd, ".devin", "skills"),
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  );
}

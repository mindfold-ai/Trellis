import path from "node:path";
import { getAllWorkflows } from "../templates/antigravity/index.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";

/**
 * Configure Antigravity by writing workflow templates.
 *
 * Output:
 * - .agent/workflows/<workflow-name>.md
 */
export async function configureAntigravity(cwd: string): Promise<void> {
  const workflowRoot = path.join(cwd, ".agent", "workflows");
  ensureDir(workflowRoot);

  for (const workflow of getAllWorkflows()) {
    const targetPath = path.join(workflowRoot, `${workflow.name}.md`);
    await writeFile(targetPath, workflow.content);
  }
}

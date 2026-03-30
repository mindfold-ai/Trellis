import path from "node:path";
import { getAllWorkflows } from "../templates/windsurf/index.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";

/**
 * Configure Windsurf by writing workflow templates.
 *
 * Output:
 * - .windsurf/workflows/<workflow-name>.md
 */
export async function configureWindsurf(cwd: string): Promise<void> {
  const workflowRoot = path.join(cwd, ".windsurf", "workflows");
  ensureDir(workflowRoot);

  for (const workflow of getAllWorkflows()) {
    const targetPath = path.join(workflowRoot, `${workflow.name}.md`);
    await writeFile(targetPath, workflow.content);
  }
}

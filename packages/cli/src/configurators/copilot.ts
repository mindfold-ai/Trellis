import path from "node:path";
import { getAllHooks, getHooksConfig } from "../templates/copilot/index.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import { resolvePlaceholders } from "./shared.js";

/**
 * Configure GitHub Copilot by writing:
 * - .github/copilot/hooks/session-start.py   (hook scripts)
 * - .github/copilot/hooks.json               (hooks config, tracked by trellis update)
 * - .github/hooks/trellis.json               (hooks config for VS Code Copilot discovery)
 */
export async function configureCopilot(cwd: string): Promise<void> {
  const copilotRoot = path.join(cwd, ".github", "copilot");

  // Hook scripts → .github/copilot/hooks/
  const hooksDir = path.join(copilotRoot, "hooks");
  ensureDir(hooksDir);

  for (const hook of getAllHooks()) {
    await writeFile(path.join(hooksDir, hook.name), hook.content);
  }

  // Hooks config → .github/copilot/hooks.json (tracked copy)
  const resolvedConfig = resolvePlaceholders(getHooksConfig());
  await writeFile(path.join(copilotRoot, "hooks.json"), resolvedConfig);

  // Hooks config → .github/hooks/trellis.json (VS Code Copilot discovery)
  const githubHooksDir = path.join(cwd, ".github", "hooks");
  ensureDir(githubHooksDir);
  await writeFile(path.join(githubHooksDir, "trellis.json"), resolvedConfig);
}

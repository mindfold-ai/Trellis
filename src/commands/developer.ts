/**
 * trellis developer - Developer identity management
 */

import chalk from "chalk";
import {
  getDeveloper,
  getDeveloperInfo,
  initDeveloper,
  showDeveloperInfo,
} from "../core/developer.js";
import { getRepoRoot, isTrellisInitialized, PATHS } from "../core/paths.js";

export interface DeveloperInitOptions {
  json?: boolean;
}

export interface DeveloperShowOptions {
  json?: boolean;
}

/**
 * Initialize developer identity
 */
export async function developerInit(
  name: string,
  options: DeveloperInitOptions,
): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  if (!name) {
    console.error(chalk.red("Error: Developer name is required"));
    console.error("Usage: trellis developer init <name>");
    process.exit(1);
  }

  try {
    initDeveloper(name, repoRoot);

    if (options.json) {
      const info = getDeveloperInfo(repoRoot);
      console.log(JSON.stringify(info, null, 2));
    } else {
      console.log(chalk.green(`Developer initialized: ${name}`));
      console.log(`  Workspace: ${PATHS.WORKSPACE}/${name}/`);
    }
  } catch (error) {
    console.error(
      chalk.red("Error:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

/**
 * Show developer info
 */
export async function developerShow(options: DeveloperShowOptions): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  const info = showDeveloperInfo(repoRoot);

  if (options.json) {
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  if (!info.name) {
    console.log(chalk.yellow("Developer: (not initialized)"));
    console.log("Run: trellis developer init <name>");
    return;
  }

  console.log(chalk.blue("Developer:"), info.name);
  console.log(chalk.blue("Workspace:"), info.workspacePath);
  if (info.journalFile) {
    console.log(chalk.blue("Journal:"), info.journalFile);
    console.log(chalk.blue("Lines:"), `${info.journalLines} / 2000`);
  }
}

/**
 * Get developer name (for scripting)
 */
export async function developerGet(): Promise<void> {
  const developer = getDeveloper();

  if (developer) {
    console.log(developer);
  } else {
    process.exit(1);
  }
}

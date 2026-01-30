/**
 * trellis task context - Context file management
 */

import chalk from "chalk";
import path from "node:path";
import fs from "node:fs";
import {
  initContext,
  addContext,
  validateContext,
  listContext,
} from "../../core/task.js";
import { getRepoRoot, isTrellisInitialized } from "../../core/paths.js";
import type { DevType } from "../../types/task.js";

export interface TaskContextOptions {
  json?: boolean;
}

/**
 * Resolve task directory path
 */
function resolveTaskDir(taskDir: string, repoRoot: string): string {
  if (path.isAbsolute(taskDir)) {
    return taskDir;
  }
  return path.join(repoRoot, taskDir);
}

/**
 * Initialize context files for a task
 */
export async function taskInitContext(
  taskDir: string,
  devType: string,
  options: TaskContextOptions,
): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  if (!taskDir || !devType) {
    console.error(chalk.red("Error: Missing arguments"));
    console.error("Usage: trellis task context init <task-dir> <dev_type>");
    console.error("  dev_type: backend | frontend | fullstack | test | docs");
    process.exit(1);
  }

  // Validate dev_type
  const validTypes: DevType[] = ["backend", "frontend", "fullstack", "test", "docs"];
  if (!validTypes.includes(devType as DevType)) {
    console.error(
      chalk.red(`Error: Invalid dev_type. Use: ${validTypes.join(", ")}`),
    );
    process.exit(1);
  }

  const fullTaskDir = resolveTaskDir(taskDir, repoRoot);

  if (!fs.existsSync(fullTaskDir)) {
    console.error(chalk.red(`Error: Directory not found: ${taskDir}`));
    process.exit(1);
  }

  try {
    console.log(chalk.blue("=== Initializing Agent Context Files ==="));
    console.log(`Target dir: ${fullTaskDir}`);
    console.log(`Dev type: ${devType}`);
    console.log("");

    initContext(fullTaskDir, devType as DevType);

    // Count entries in each file
    const results = listContext(fullTaskDir);

    for (const { file, entries } of results) {
      console.log(chalk.cyan(`Creating ${file}...`));
      console.log(`  ${chalk.green("✓")} ${entries.length} entries`);
    }

    console.log("");
    console.log(chalk.green("✓ All context files created"));
    console.log("");
    console.log(chalk.blue("Next steps:"));
    console.log(
      `  1. Add task-specific specs: trellis task context add ${taskDir} <jsonl> <path>`,
    );
    console.log(`  2. Set as current: trellis task start ${taskDir}`);
  } catch (error) {
    console.error(
      chalk.red("Error:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

/**
 * Add a context entry to a JSONL file
 */
export async function taskAddContext(
  taskDir: string,
  jsonlName: string,
  filePath: string,
  reason?: string,
): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  if (!taskDir || !jsonlName || !filePath) {
    console.error(chalk.red("Error: Missing arguments"));
    console.error(
      "Usage: trellis task context add <task-dir> <jsonl-file> <path> [reason]",
    );
    console.error("  jsonl-file: implement | check | debug (or full filename)");
    process.exit(1);
  }

  const fullTaskDir = resolveTaskDir(taskDir, repoRoot);

  try {
    addContext(
      fullTaskDir,
      jsonlName,
      filePath,
      reason ?? "Added manually",
      repoRoot,
    );

    console.log(chalk.green(`Added file: ${filePath}`));
  } catch (error) {
    console.error(
      chalk.red("Error:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

/**
 * Validate context files
 */
export async function taskValidate(
  taskDir: string,
  options: TaskContextOptions,
): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  if (!taskDir) {
    console.error(chalk.red("Error: Task directory required"));
    process.exit(1);
  }

  const fullTaskDir = resolveTaskDir(taskDir, repoRoot);

  console.log(chalk.blue("=== Validating Context Files ==="));
  console.log(`Target dir: ${fullTaskDir}`);
  console.log("");

  const results = validateContext(fullTaskDir, repoRoot);

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  let totalErrors = 0;

  for (const { file, errors, entryCount } of results) {
    if (errors.length === 0) {
      console.log(`  ${chalk.green(file)}: ✓ (${entryCount} entries)`);
    } else {
      console.log(`  ${chalk.red(file)}: ✗ (${errors.length} errors)`);
      for (const error of errors) {
        console.log(`    ${chalk.red(error)}`);
      }
      totalErrors += errors.length;
    }
  }

  console.log("");

  if (totalErrors === 0) {
    console.log(chalk.green("✓ All validations passed"));
  } else {
    console.log(chalk.red(`✗ Validation failed (${totalErrors} errors)`));
    process.exit(1);
  }
}

/**
 * List context entries
 */
export async function taskListContext(
  taskDir: string,
  options: TaskContextOptions,
): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  if (!taskDir) {
    console.error(chalk.red("Error: Task directory required"));
    process.exit(1);
  }

  const fullTaskDir = resolveTaskDir(taskDir, repoRoot);

  const results = listContext(fullTaskDir);

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(chalk.blue("=== Context Files ==="));
  console.log("");

  if (results.length === 0) {
    console.log("  (no context files found)");
    return;
  }

  for (const { file, entries } of results) {
    console.log(chalk.cyan(`[${file}]`));

    let count = 0;
    for (const entry of entries) {
      count++;
      const typeMarker = entry.type === "directory" ? "[DIR] " : "";
      console.log(`  ${chalk.green(`${count}.`)} ${typeMarker}${entry.file}`);
      console.log(`     ${chalk.yellow("→")} ${entry.reason}`);
    }

    console.log("");
  }
}

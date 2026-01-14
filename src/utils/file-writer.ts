import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";

export type WriteMode = "ask" | "force" | "skip" | "append";

export interface WriteOptions {
  mode: WriteMode;
}

interface PromptAnswer {
  action: string;
}

// Global write mode (set from CLI options)
let globalWriteMode: WriteMode = "ask";

export function setWriteMode(mode: WriteMode): void {
  globalWriteMode = mode;
}

export function getWriteMode(): WriteMode {
  return globalWriteMode;
}

/**
 * Get relative path from cwd for display
 */
function getRelativePath(filePath: string): string {
  const cwd = process.cwd();
  const relativePath = path.relative(cwd, filePath);
  return relativePath || path.basename(filePath);
}

/**
 * Append content to file
 */
function appendToFile(
  filePath: string,
  content: string,
  options?: { executable?: boolean },
): void {
  const existingContent = fs.readFileSync(filePath, "utf-8");
  const newContent = existingContent.endsWith("\n")
    ? existingContent + content
    : existingContent + "\n" + content;
  fs.writeFileSync(filePath, newContent);
  if (options?.executable) {
    fs.chmodSync(filePath, "755");
  }
}

/**
 * Write file with conflict handling
 * - If file doesn't exist: write directly
 * - If file exists and content is identical: skip silently
 * - If file exists and mode is 'force': overwrite
 * - If file exists and mode is 'skip': skip
 * - If file exists and mode is 'append': append to end
 * - If file exists and mode is 'ask': prompt user
 */
export async function writeFile(
  filePath: string,
  content: string,
  options?: { executable?: boolean },
): Promise<boolean> {
  const exists = fs.existsSync(filePath);
  const displayPath = getRelativePath(filePath);

  if (!exists) {
    // File doesn't exist, write directly
    fs.writeFileSync(filePath, content);
    if (options?.executable) {
      fs.chmodSync(filePath, "755");
    }
    return true;
  }

  // File exists, check if content is identical
  const existingContent = fs.readFileSync(filePath, "utf-8");
  if (existingContent === content) {
    // Content identical, skip silently (no output)
    return false;
  }

  // File exists with different content, handle based on mode
  const mode = globalWriteMode;

  if (mode === "force") {
    fs.writeFileSync(filePath, content);
    if (options?.executable) {
      fs.chmodSync(filePath, "755");
    }
    console.log(chalk.yellow(`  ↻ Overwritten: ${displayPath}`));
    return true;
  }

  if (mode === "skip") {
    console.log(chalk.gray(`  ○ Skipped: ${displayPath} (already exists)`));
    return false;
  }

  if (mode === "append") {
    appendToFile(filePath, content, options);
    console.log(chalk.blue(`  + Appended: ${displayPath}`));
    return true;
  }

  // mode === 'ask': Interactive prompt
  const { action } = await inquirer.prompt<PromptAnswer>([
    {
      type: "list",
      name: "action",
      message: `File "${displayPath}" already exists. What would you like to do?`,
      choices: [
        { name: "Skip (keep existing)", value: "skip" },
        { name: "Overwrite", value: "overwrite" },
        { name: "Append to end", value: "append" },
        { name: "Skip all remaining conflicts", value: "skip-all" },
        { name: "Overwrite all remaining conflicts", value: "overwrite-all" },
        { name: "Append all remaining conflicts", value: "append-all" },
      ],
    },
  ]);

  if (action === "skip") {
    console.log(chalk.gray(`  ○ Skipped: ${displayPath}`));
    return false;
  }

  if (action === "overwrite") {
    fs.writeFileSync(filePath, content);
    if (options?.executable) {
      fs.chmodSync(filePath, "755");
    }
    console.log(chalk.yellow(`  ↻ Overwritten: ${displayPath}`));
    return true;
  }

  if (action === "append") {
    appendToFile(filePath, content, options);
    console.log(chalk.blue(`  + Appended: ${displayPath}`));
    return true;
  }

  if (action === "skip-all") {
    globalWriteMode = "skip";
    console.log(chalk.gray(`  ○ Skipped: ${displayPath}`));
    return false;
  }

  if (action === "overwrite-all") {
    globalWriteMode = "force";
    fs.writeFileSync(filePath, content);
    if (options?.executable) {
      fs.chmodSync(filePath, "755");
    }
    console.log(chalk.yellow(`  ↻ Overwritten: ${displayPath}`));
    return true;
  }

  if (action === "append-all") {
    globalWriteMode = "append";
    appendToFile(filePath, content, options);
    console.log(chalk.blue(`  + Appended: ${displayPath}`));
    return true;
  }

  return false;
}

/**
 * Ensure directory exists
 */
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

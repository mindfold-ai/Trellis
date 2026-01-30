/**
 * trellis session - Session management commands
 */

import chalk from "chalk";
import { getRepoRoot, isTrellisInitialized } from "../core/paths.js";
import { getDeveloper } from "../core/developer/index.js";
import {
  addSession,
  getJournalStatus,
  updateWorkspaceIndex,
} from "../core/session/index.js";

export interface SessionAddOptions {
  commit?: string;
  summary?: string;
  content?: string;
  json?: boolean;
}

export interface SessionAddResult {
  sessionNumber: number;
  journalFile: string;
  lineCount: number;
  indexUpdated: boolean;
}

/**
 * Add a new session to the journal
 *
 * Usage:
 *   trellis session add "Session Title" --commit abc1234 --summary "Brief summary"
 *   echo "content" | trellis session add "Title" --commit abc1234
 */
export async function sessionAdd(
  title: string,
  options: SessionAddOptions,
): Promise<void> {
  const repoRoot = getRepoRoot();

  // Validate initialization
  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  // Validate developer
  const developer = getDeveloper(repoRoot);
  if (!developer) {
    console.error(
      chalk.red("Error: Developer not initialized. Run: trellis developer init <name>"),
    );
    process.exit(1);
  }

  // Validate title
  if (!title) {
    console.error(chalk.red("Error: Title is required"));
    console.error("Usage: trellis session add <title> [--commit hash] [--summary text]");
    process.exit(1);
  }

  try {
    // Read content from stdin if available and not a TTY
    let content = options.content;
    if (!content && !process.stdin.isTTY) {
      content = await readStdin();
    }

    // Add session to journal
    const sessionNumber = addSession(
      {
        title,
        commit: options.commit,
        summary: options.summary,
        content,
        timestamp: new Date().toISOString(),
      },
      repoRoot,
    );

    // Update workspace index.md
    let indexUpdated = false;
    try {
      updateWorkspaceIndex(undefined, repoRoot);
      indexUpdated = true;
    } catch (error) {
      // Non-fatal: index update is optional
      if (!options.json) {
        console.error(
          chalk.yellow("Warning: Could not update index.md:"),
          error instanceof Error ? error.message : error,
        );
      }
    }

    // Get journal status for output
    const status = getJournalStatus(repoRoot);

    const result: SessionAddResult = {
      sessionNumber,
      journalFile: status.activeFile ?? "unknown",
      lineCount: status.lineCount,
      indexUpdated,
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Human-readable output
    console.error(chalk.green(`Session ${sessionNumber} added successfully!`));
    console.error("");
    console.error(chalk.blue("Title:"), title);
    if (options.commit) {
      console.error(chalk.blue("Commit:"), options.commit);
    }
    console.error(chalk.blue("Journal:"), status.activeFile);
    console.error(chalk.blue("Lines:"), `${status.lineCount} / ${status.maxLines}`);
    if (indexUpdated) {
      console.error(chalk.blue("Index:"), "Updated");
    }

    // Output session number to stdout for scripting
    console.log(sessionNumber);
  } catch (error) {
    console.error(
      chalk.red("Error:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

/**
 * Show session/journal status
 */
export async function sessionStatus(options: { json?: boolean }): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  const developer = getDeveloper(repoRoot);
  if (!developer) {
    console.error(
      chalk.red("Error: Developer not initialized. Run: trellis developer init <name>"),
    );
    process.exit(1);
  }

  const status = getJournalStatus(repoRoot);

  if (options.json) {
    console.log(JSON.stringify({ developer, ...status }, null, 2));
    return;
  }

  if (!status.activeFile) {
    console.log(chalk.yellow("No journal files found"));
    console.log("Sessions will be created when you run: trellis session add");
    return;
  }

  console.log(chalk.blue("Developer:"), developer);
  console.log(chalk.blue("Active Journal:"), status.activeFile);
  console.log(chalk.blue("Lines:"), `${status.lineCount} / ${status.maxLines}`);
  console.log(chalk.blue("Total Sessions:"), status.totalSessions);
  console.log(chalk.blue("File Number:"), status.fileNumber);
}

/**
 * Read all input from stdin
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";

    process.stdin.setEncoding("utf-8");

    process.stdin.on("readable", () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });

    process.stdin.on("end", () => {
      resolve(data.trim());
    });

    // Handle case where stdin is empty
    setTimeout(() => {
      if (data === "") {
        resolve("");
      }
    }, 100);
  });
}

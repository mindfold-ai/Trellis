/**
 * Developer management utilities
 */

import fs from "node:fs";
import path from "node:path";
import {
  getDeveloperFilePath,
  getRepoRoot,
  getWorkspaceDir,
  PATHS,
  FILE_NAMES,
} from "./paths.js";
import type { Developer } from "../types/task.js";

/**
 * Get the current developer name
 * Returns null if not initialized
 */
export function getDeveloper(repoRoot?: string): string | null {
  const filePath = getDeveloperFilePath(repoRoot);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const match = content.match(/^name=(.+)$/m);

  return match ? match[1].trim() : null;
}

/**
 * Get full developer info
 */
export function getDeveloperInfo(repoRoot?: string): Developer | null {
  const filePath = getDeveloperFilePath(repoRoot);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const nameMatch = content.match(/^name=(.+)$/m);
  const dateMatch = content.match(/^initialized_at=(.+)$/m);

  if (!nameMatch) {
    return null;
  }

  return {
    name: nameMatch[1].trim(),
    initialized_at: dateMatch ? dateMatch[1].trim() : new Date().toISOString(),
  };
}

/**
 * Check if developer is initialized
 */
export function isDeveloperInitialized(repoRoot?: string): boolean {
  return getDeveloper(repoRoot) !== null;
}

/**
 * Initialize developer identity
 */
export function initDeveloper(name: string, repoRoot?: string): void {
  if (!name) {
    throw new Error("Developer name is required");
  }

  const root = repoRoot ?? getRepoRoot();
  const devFilePath = getDeveloperFilePath(root);
  const workspaceDir = getWorkspaceDir(name, root);

  // Ensure .trellis directory exists
  const trellisDir = path.dirname(devFilePath);
  if (!fs.existsSync(trellisDir)) {
    fs.mkdirSync(trellisDir, { recursive: true });
  }

  // Create .developer file
  const now = new Date().toISOString();
  fs.writeFileSync(devFilePath, `name=${name}\ninitialized_at=${now}\n`);

  // Create workspace directory structure
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }

  // Create initial journal file
  const journalFile = path.join(workspaceDir, `${FILE_NAMES.JOURNAL_PREFIX}1.md`);
  if (!fs.existsSync(journalFile)) {
    const today = new Date().toISOString().split("T")[0];
    fs.writeFileSync(
      journalFile,
      `# Journal - ${name} (Part 1)

> AI development session journal
> Started: ${today}

---

`,
    );
  }

  // Create index.md
  const indexFile = path.join(workspaceDir, "index.md");
  if (!fs.existsSync(indexFile)) {
    fs.writeFileSync(
      indexFile,
      `# Workspace Index - ${name}

> Journal tracking for AI development sessions.

---

## Current Status

<!-- @@@auto:current-status -->
- **Active File**: \`journal-1.md\`
- **Total Sessions**: 0
- **Last Active**: -
<!-- @@@/auto:current-status -->

---

## Active Documents

<!-- @@@auto:active-documents -->
| File | Lines | Status |
|------|-------|--------|
| \`journal-1.md\` | ~0 | Active |
<!-- @@@/auto:active-documents -->

---

## Session History

<!-- @@@auto:session-history -->
| # | Date | Title | Commits |
|---|------|-------|---------|
<!-- @@@/auto:session-history -->

---

## Notes

- Sessions are appended to journal files
- New journal file created when current exceeds 2000 lines
- Use \`trellis session add\` to record sessions
`,
    );
  }
}

/**
 * Ensure developer is initialized, throw error if not
 */
export function ensureDeveloper(repoRoot?: string): string {
  const developer = getDeveloper(repoRoot);

  if (!developer) {
    throw new Error(
      "Developer not initialized. Run: trellis init -u <your-name>",
    );
  }

  return developer;
}

/**
 * Get active journal file path
 */
export function getActiveJournalFile(repoRoot?: string): string | null {
  const developer = getDeveloper(repoRoot);

  if (!developer) {
    return null;
  }

  const root = repoRoot ?? getRepoRoot();
  const workspaceDir = getWorkspaceDir(developer, root);

  if (!fs.existsSync(workspaceDir)) {
    return null;
  }

  // Find the highest numbered journal file
  const files = fs.readdirSync(workspaceDir);
  let highest = 0;
  let latestFile: string | null = null;

  for (const file of files) {
    const match = file.match(new RegExp(`^${FILE_NAMES.JOURNAL_PREFIX}(\\d+)\\.md$`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > highest) {
        highest = num;
        latestFile = path.join(workspaceDir, file);
      }
    }
  }

  return latestFile;
}

/**
 * Count lines in a file
 */
export function countLines(filePath: string): number {
  if (!fs.existsSync(filePath)) {
    return 0;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return content.split("\n").length;
}

/**
 * Get developer info formatted for display
 */
export function showDeveloperInfo(repoRoot?: string): {
  name: string | null;
  workspacePath: string | null;
  journalFile: string | null;
  journalLines: number;
} {
  const developer = getDeveloper(repoRoot);
  const journalFile = getActiveJournalFile(repoRoot);

  return {
    name: developer,
    workspacePath: developer
      ? `${PATHS.WORKSPACE}/${developer}/`
      : null,
    journalFile: journalFile
      ? path.relative(getRepoRoot(repoRoot), journalFile)
      : null,
    journalLines: journalFile ? countLines(journalFile) : 0,
  };
}

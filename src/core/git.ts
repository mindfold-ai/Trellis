/**
 * Git operations wrapper
 *
 * Provides cross-platform git operations without shell dependencies.
 */

import { execSync } from "node:child_process";
import { getRepoRoot } from "./paths.js";

export interface GitCommit {
  hash: string;
  message: string;
}

export interface GitStatus {
  branch: string;
  isClean: boolean;
  uncommittedChanges: number;
  changes: string[];
}

/**
 * Execute a git command and return the output
 */
function execGit(
  args: string[],
  options?: { cwd?: string; silent?: boolean },
): string {
  const cwd = options?.cwd ?? getRepoRoot();

  try {
    return execSync(`git ${args.join(" ")}`, {
      cwd,
      encoding: "utf-8",
      stdio: options?.silent ? "pipe" : undefined,
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Check if the current directory is inside a git repository
 */
export function isGitRepo(cwd?: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: cwd ?? getRepoRoot(),
      encoding: "utf-8",
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current git branch name
 */
export function getCurrentBranch(cwd?: string): string {
  return execGit(["branch", "--show-current"], { cwd, silent: true }) || "unknown";
}

/**
 * Get git status summary
 */
export function getGitStatus(cwd?: string): GitStatus {
  const branch = getCurrentBranch(cwd);
  const statusOutput = execGit(["status", "--porcelain"], { cwd, silent: true });
  const changes = statusOutput ? statusOutput.split("\n").filter(Boolean) : [];

  return {
    branch,
    isClean: changes.length === 0,
    uncommittedChanges: changes.length,
    changes,
  };
}

/**
 * Get recent commits
 */
export function getRecentCommits(count = 5, cwd?: string): GitCommit[] {
  const output = execGit(["log", `--oneline`, `-${count}`], { cwd, silent: true });

  if (!output) {
    return [];
  }

  return output.split("\n").map((line) => {
    const [hash, ...messageParts] = line.split(" ");
    return {
      hash: hash ?? "",
      message: messageParts.join(" "),
    };
  });
}

/**
 * Get the git user name from config
 */
export function getGitUserName(cwd?: string): string | null {
  const name = execGit(["config", "user.name"], { cwd, silent: true });
  return name || null;
}

/**
 * Get the git user email from config
 */
export function getGitUserEmail(cwd?: string): string | null {
  const email = execGit(["config", "user.email"], { cwd, silent: true });
  return email || null;
}

/**
 * Check if a branch exists locally
 */
export function branchExists(branchName: string, cwd?: string): boolean {
  const output = execGit(["branch", "--list", branchName], { cwd, silent: true });
  return output.trim().length > 0;
}

/**
 * Check if a branch exists on remote
 */
export function remoteBranchExists(
  branchName: string,
  remote = "origin",
  cwd?: string,
): boolean {
  const output = execGit(
    ["ls-remote", "--heads", remote, branchName],
    { cwd, silent: true },
  );
  return output.trim().length > 0;
}

/**
 * Get the default branch name (main or master)
 */
export function getDefaultBranch(cwd?: string): string {
  // Try to get from remote
  const remoteHead = execGit(
    ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
    { cwd, silent: true },
  );

  if (remoteHead) {
    return remoteHead.replace("origin/", "");
  }

  // Fallback: check if main or master exists
  if (branchExists("main", cwd)) {
    return "main";
  }

  if (branchExists("master", cwd)) {
    return "master";
  }

  return "main";
}

/**
 * Get short status for display
 */
export function getShortStatus(cwd?: string): string[] {
  const output = execGit(["status", "--short"], { cwd, silent: true });

  if (!output) {
    return [];
  }

  return output.split("\n").slice(0, 10);
}

/**
 * Get diff stat against a base branch
 */
export function getDiffStat(baseBranch: string, cwd?: string): string {
  return execGit(["diff", "--stat", `${baseBranch}...HEAD`], { cwd, silent: true });
}

/**
 * `trellis uninstall` — remove every file written by `trellis init` / `update`
 * from the current project, plus the `.trellis/` directory itself.
 *
 * The single source of truth for "what trellis wrote" is
 * `.trellis/.template-hashes.json`. Files outside that manifest are never
 * touched (e.g. user-added hooks under `.cursor/hooks/`).
 *
 * Manifest-listed files split into two groups:
 *   A. Opaque content files (`.py` / `.md` / `.ts` / etc.) — unlinked outright.
 *   B. Structured config files (settings.json / hooks.json / config.toml /
 *      package.json) — passed through a scrubber that strips just the trellis
 *      fields, leaving user-added neighbors intact. If the scrubber says the
 *      file is fully empty afterwards, we delete it.
 *
 * Whether the user has modified a manifest-listed file or not, it is removed
 * (per the PRD: "全删"). The `.trellis/` tree is removed unconditionally.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import chalk from "chalk";
import inquirer from "inquirer";

import { DIR_NAMES } from "../constants/paths.js";
import { loadHashes } from "../utils/template-hash.js";
import { getConfiguredPlatforms } from "../configurators/index.js";
import { pruneOrphanManifestKeys } from "../utils/manifest-prune.js";
import {
  isCwdHomedir,
  homedirGuardMessage,
  homedirBypassEnabled,
} from "../utils/cwd-guard.js";
import {
  buildManagedRemovalPlan,
  executeManagedRemovalPlan,
  type ManagedRemovalPlan,
} from "../utils/managed-removal.js";

export interface UninstallOptions {
  yes?: boolean;
  dryRun?: boolean;
}

type UninstallPlan = ManagedRemovalPlan;

/**
 * Render the two-column uninstall plan to stdout.
 */
function renderPlan(cwd: string, plan: UninstallPlan): void {
  const trellisDir = path.join(cwd, DIR_NAMES.WORKFLOW);

  console.log(chalk.bold("\nTrellis uninstall plan\n"));

  const deletePaths = plan.deletions
    .filter((d) => !d.missing)
    .map((d) => d.posixPath);

  console.log(
    chalk.red.bold(`Will be deleted (${deletePaths.length + 1} entries):`),
  );
  for (const p of deletePaths) {
    console.log(`  ${chalk.red("-")} ${p}`);
  }
  if (plan.removeTrellisDir && fs.existsSync(trellisDir)) {
    console.log(
      `  ${chalk.red("-")} ${DIR_NAMES.WORKFLOW}/  ${chalk.gray(
        "(entire directory — including your specs, task PRDs, journals, and memory)",
      )}`,
    );
  }

  if (plan.modifications.length > 0) {
    console.log();
    console.log(
      chalk.yellow.bold(
        `Will be modified (${plan.modifications.length} files):`,
      ),
    );
    for (const m of plan.modifications) {
      console.log(
        `  ${chalk.yellow("~")} ${m.posixPath}  ${chalk.gray(`(${m.reason})`)}`,
      );
    }
  }

  const skipped = plan.deletions.filter((d) => d.missing);
  if (skipped.length > 0) {
    console.log();
    console.log(
      chalk.gray(
        `(${skipped.length} manifest entries already missing on disk — skipped.)`,
      ),
    );
  }

  console.log();
}

/**
 * Prompt `Continue? [Y/n]` with default = yes. Returns true if user agrees.
 *
 * We use `inquirer` to match update.ts so the CLI behaves consistently and
 * tests can mock the same library.
 */
async function promptContinue(): Promise<boolean> {
  const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
    {
      type: "confirm",
      name: "proceed",
      message: "Continue?",
      default: true,
    },
  ]);
  return proceed;
}

/**
 * List uncommitted (modified, staged, or untracked) files under the
 * user-data subdirectories of `.trellis/` — spec/, tasks/, workspace/ — which
 * hold user-authored specs, task PRDs, and journals that `update.ts` marks as
 * PROTECTED. Uninstall deletes the whole `.trellis/` tree with no backup, so
 * these are surfaced before the destructive step. Returns `[]` when this is
 * not a git repo or git is unavailable (nothing we can check).
 */
export function collectUncommittedTrellisData(cwd: string): string[] {
  const w = DIR_NAMES.WORKFLOW;
  const userDataDirs = [
    `${w}/${DIR_NAMES.SPEC}`,
    `${w}/${DIR_NAMES.TASKS}`,
    `${w}/${DIR_NAMES.WORKSPACE}`,
  ];
  try {
    const out = execFileSync(
      "git",
      ["-C", cwd, "status", "--porcelain", "--", ...userDataDirs],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return (
      out
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        // Strip the 2-char status code, then keep the post-rename path if any.
        .map((line) => line.replace(/^\S+\s+/, "").replace(/^.*\s->\s/, ""))
    );
  } catch {
    return [];
  }
}

/** Whether the uncommitted-data guard has been explicitly overridden. */
function dirtyUninstallBypassEnabled(): boolean {
  return process.env.TRELLIS_ALLOW_DIRTY_UNINSTALL === "1";
}

/**
 * Entry point.
 */
export async function uninstall(options: UninstallOptions = {}): Promise<void> {
  // Refuse to run in $HOME — same reasoning as init. A manifest poisoned by
  // a prior buggy init would otherwise unlink global platform runtime data
  // (chat history, session JSONLs).
  if (isCwdHomedir() && !homedirBypassEnabled()) {
    console.error(chalk.red(homedirGuardMessage("uninstall")));
    process.exit(1);
  }

  const cwd = process.cwd();
  const trellisDir = path.join(cwd, DIR_NAMES.WORKFLOW);

  // Pre-check 1: must have a `.trellis/` directory.
  if (!fs.existsSync(trellisDir)) {
    console.log(
      chalk.gray(
        "Trellis is not installed in this project (no .trellis/ directory found).",
      ),
    );
    return;
  }

  // Pre-check 2: must have a manifest. Without it we cannot determine which
  // platform files are trellis-owned vs user-owned.
  const hashes = loadHashes(cwd);
  if (Object.keys(hashes).length === 0) {
    console.error(
      chalk.red(
        "Trellis directory found but manifest is missing — cannot determine which platform files to remove. " +
          "You can manually delete .trellis/ if needed.",
      ),
    );
    process.exit(1);
  }

  // Self-heal poisoned manifests from buggy init versions: prune any manifest
  // entry that no current configurator owns. Runs BEFORE buildPlan so the
  // user-owned paths (.codex/sessions/, .claude/projects/, pre-existing
  // AGENTS.md, etc.) never reach the deletion list. See PRD R3.
  //
  // Dry-run: still compute the pruned hashes (so the plan reflects post-prune
  // reality) but pass `persist: false` so no disk write happens. The actual
  // disk write defers to executePlan time, where we'd be rewriting the
  // manifest only to delete the whole .trellis/ dir anyway — but the
  // computation must remain to keep the rendered plan honest.
  const configuredPlatforms = getConfiguredPlatforms(cwd);
  const { pruned, hashes: prunedHashes } = pruneOrphanManifestKeys(
    cwd,
    [...configuredPlatforms],
    hashes,
    { persist: !options.dryRun },
  );
  if (pruned.length > 0) {
    // Surface counts only — listing every poisoned entry would alarm users
    // without giving them an actionable signal.
    console.log(
      chalk.gray(
        `   Pruned ${pruned.length} orphan manifest entries (user-owned files trellis did not write).`,
      ),
    );
  }

  const plan = buildManagedRemovalPlan(cwd, prunedHashes);
  renderPlan(cwd, plan);

  // .trellis/ holds user-authored specs, task PRDs, and journals that have no
  // backup here. Surface any uncommitted such files before deleting the tree,
  // and — for scripted `--yes` runs where nobody reads the warning — fail
  // closed unless explicitly overridden.
  const uncommitted = collectUncommittedTrellisData(cwd);
  if (uncommitted.length > 0) {
    console.warn(
      chalk.red.bold(
        `\n⚠ ${uncommitted.length} uncommitted file(s) under .trellis/ (spec/tasks/workspace) ` +
          `will be permanently deleted with no backup:`,
      ),
    );
    for (const p of uncommitted.slice(0, 20)) {
      console.warn(chalk.red(`    ${p}`));
    }
    if (uncommitted.length > 20) {
      console.warn(chalk.red(`    … and ${uncommitted.length - 20} more`));
    }
    console.warn(
      chalk.yellow("Commit or stash them first if you want to keep them.\n"),
    );
  }

  if (options.dryRun) {
    console.log(chalk.gray("Dry run — no files were modified."));
    return;
  }

  if (uncommitted.length > 0 && options.yes && !dirtyUninstallBypassEnabled()) {
    console.error(
      chalk.red(
        "Refusing to uninstall with --yes while .trellis/ has uncommitted user data " +
          "(spec/tasks/workspace). Commit or stash it, re-run without --yes to confirm " +
          "interactively, or set TRELLIS_ALLOW_DIRTY_UNINSTALL=1 to override.",
      ),
    );
    process.exit(1);
  }

  if (!options.yes) {
    // Make sure stdin is in a usable state for the prompt; in scripted
    // environments that closed stdin, inquirer would otherwise raise. We
    // honor the same UX as `trellis update` (which also fails closed in
    // that case).
    if (!process.stdin.isTTY) {
      console.error(
        chalk.red(
          "Refusing to prompt for confirmation in a non-interactive shell. " +
            "Pass --yes/-y to confirm or --dry-run to preview.",
        ),
      );
      // Try to release the readline ref if anything else opened stdin.
      readline.createInterface({ input: process.stdin }).close();
      process.exit(1);
    }

    const ok = await promptContinue();
    if (!ok) {
      console.log(chalk.yellow("Uninstall cancelled. No files modified."));
      return;
    }
  }

  const summary = executeManagedRemovalPlan(cwd, plan);

  console.log();
  console.log(
    chalk.green(
      `Uninstalled trellis: ${summary.deletedFiles} files deleted, ` +
        `${summary.modifiedFiles} files modified, ` +
        `${summary.deletedDirs} directories removed.`,
    ),
  );
}

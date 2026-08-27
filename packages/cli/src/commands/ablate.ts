/** Full, reversible project-level Trellis ablation and exact restoration. */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import chalk from "chalk";
import inquirer from "inquirer";

import {
  ALL_MANAGED_DIRS,
  getConfiguredPlatforms,
} from "../configurators/index.js";
import { DIR_NAMES } from "../constants/paths.js";
import {
  ABLATION_STATE_ROOT_ENV,
  assertExternalStateRoot,
  canonicalProjectRoot,
  expectedFileFingerprint,
  fingerprintPath,
  getAblationStateRoot,
  getTransactionPaths,
  loadAblationTransaction,
  rollbackAblationTransaction,
  restoreAblationTransaction,
  stageAblationTransaction,
  transitionAblationState,
  verifyAblatedState,
  withAblationProjectLock,
  type AblationEntry,
  type LoadedAblationTransaction,
  type PathFingerprint,
} from "../utils/ablation-store.js";
import { writeFileAtomic } from "../utils/atomic-write.js";
import {
  homedirBypassEnabled,
  homedirGuardMessage,
  isCwdHomedir,
} from "../utils/cwd-guard.js";
import {
  buildManagedRemovalPlan,
  lstatIfPresent,
  type ManagedRemovalPlan,
} from "../utils/managed-removal.js";
import { pruneOrphanManifestKeys } from "../utils/manifest-prune.js";
import { loadHashes } from "../utils/template-hash.js";

export interface AblateOptions {
  yes?: boolean;
  dryRun?: boolean;
}

export interface RestoreOptions {
  yes?: boolean;
  dryRun?: boolean;
}

function isTrellisPath(relativePath: string): boolean {
  return (
    relativePath === DIR_NAMES.WORKFLOW ||
    relativePath.startsWith(`${DIR_NAMES.WORKFLOW}/`)
  );
}

function backupPath(relativePath: string): string {
  return `backup/${relativePath}`;
}

function promptContinue(message: string): Promise<boolean> {
  return inquirer
    .prompt<{
      proceed: boolean;
    }>([{ type: "confirm", name: "proceed", message, default: true }])
    .then(({ proceed }) => proceed);
}

function refuseNonInteractivePrompt(command: "ablate" | "restore"): never {
  console.error(
    chalk.red(
      `Refusing to prompt for ${command} confirmation in a non-interactive shell. ` +
        "Pass --yes/-y to confirm or --dry-run to preview.",
    ),
  );
  readline.createInterface({ input: process.stdin }).close();
  process.exit(1);
}

function assertCommandCwd(command: "ablate" | "restore"): void {
  if (isCwdHomedir() && !homedirBypassEnabled()) {
    console.error(chalk.red(homedirGuardMessage(command)));
    process.exit(1);
  }
}

function renderAblatePlan(
  plan: ManagedRemovalPlan,
  prunableDirectories: readonly string[],
  transactionDir: string,
): void {
  const deletions = plan.deletions.filter(
    (entry) => !entry.missing && !isTrellisPath(entry.posixPath),
  );
  console.log(chalk.bold("\nTrellis full ablation plan\n"));
  console.log(
    chalk.red.bold(
      `Will be removed (${deletions.length + 1} managed entries):`,
    ),
  );
  for (const entry of deletions)
    console.log(`  ${chalk.red("-")} ${entry.posixPath}`);
  console.log(`  ${chalk.red("-")} ${DIR_NAMES.WORKFLOW}/`);
  if (plan.modifications.length > 0) {
    console.log(
      chalk.yellow.bold(
        `\nWill be scrubbed (${plan.modifications.length} mixed files):`,
      ),
    );
    for (const entry of plan.modifications) {
      console.log(`  ${chalk.yellow("~")} ${entry.posixPath}`);
    }
  }
  if (prunableDirectories.length > 0) {
    console.log(
      chalk.gray(
        `\n${prunableDirectories.length} empty managed directories will be pruned.`,
      ),
    );
  }
  console.log(chalk.gray(`\nRecovery transaction: ${transactionDir}`));
  console.log(
    chalk.yellow(
      "Recovery copies exact .trellis task/spec/workspace bytes, which may contain user-authored sensitive text. " +
        "The private transaction is retained until verified restore.\n",
    ),
  );
}

function renderRestorePlan(transaction: LoadedAblationTransaction): void {
  console.log(chalk.bold("\nTrellis restore plan\n"));
  console.log(
    `Will restore ${transaction.state.entries.length} managed path(s) from ${transaction.paths.transactionDir}`,
  );
  console.log(
    chalk.gray(
      `Transaction created with Trellis ${transaction.state.trellisVersion} at ${transaction.state.createdAt}.\n`,
    ),
  );
}

function relativeFromRoot(projectRoot: string, absPath: string): string {
  return path.relative(projectRoot, absPath).split(path.sep).join("/");
}

function isManagedDirectoryTerritory(relativeDir: string): boolean {
  if (relativeDir === DIR_NAMES.WORKFLOW || isTrellisPath(relativeDir)) {
    return false;
  }
  return ALL_MANAGED_DIRS.filter(
    (managedDir) => managedDir !== DIR_NAMES.WORKFLOW,
  ).some(
    (root) =>
      relativeDir === root ||
      relativeDir.startsWith(`${root}/`) ||
      root.startsWith(`${relativeDir}/`),
  );
}

/** Predict directories that become empty after every planned deletion. */
function collectPrunableDirectories(
  projectRoot: string,
  plan: ManagedRemovalPlan,
): string[] {
  const deleted = new Set(
    plan.deletions
      .filter((entry) => !entry.missing && !isTrellisPath(entry.posixPath))
      .map((entry) => path.resolve(entry.absPath)),
  );
  const candidates = new Set<string>();
  for (const deletedPath of deleted) {
    let current = path.dirname(deletedPath);
    while (
      current !== projectRoot &&
      current.startsWith(`${projectRoot}${path.sep}`)
    ) {
      const relative = relativeFromRoot(projectRoot, current);
      if (!isManagedDirectoryTerritory(relative)) break;
      candidates.add(current);
      current = path.dirname(current);
    }
  }

  const memo = new Map<string, boolean>();
  const willBeEmpty = (directory: string): boolean => {
    const cached = memo.get(directory);
    if (cached !== undefined) return cached;
    const stat = lstatIfPresent(directory);
    if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
      memo.set(directory, false);
      return false;
    }
    const empty = fs.readdirSync(directory).every((name) => {
      const child = path.join(directory, name);
      if (deleted.has(path.resolve(child))) return true;
      const childStat = lstatIfPresent(child);
      return Boolean(
        childStat?.isDirectory() &&
        !childStat.isSymbolicLink() &&
        candidates.has(child) &&
        willBeEmpty(child),
      );
    });
    memo.set(directory, empty);
    return empty;
  };

  return [...candidates]
    .filter((directory) => willBeEmpty(directory))
    .map((directory) => relativeFromRoot(projectRoot, directory))
    .sort((left, right) => right.split("/").length - left.split("/").length);
}

function addEntry(
  entries: AblationEntry[],
  seen: Set<string>,
  relativePath: string,
  pre: PathFingerprint,
  expectedAblated: PathFingerprint,
): void {
  if (seen.has(relativePath)) return;
  seen.add(relativePath);
  entries.push({
    relativePath,
    pre,
    expectedAblated,
    ...(pre.kind === "absent" ? {} : { backupPath: backupPath(relativePath) }),
  });
}

function buildAblationEntries(
  projectRoot: string,
  plan: ManagedRemovalPlan,
  prunableDirectories: readonly string[],
): AblationEntry[] {
  const entries: AblationEntry[] = [];
  const seen = new Set<string>();

  for (const deletion of plan.deletions) {
    if (isTrellisPath(deletion.posixPath)) continue;
    const pre = fingerprintPath(deletion.absPath);
    if (pre.kind === "directory") {
      throw new Error(
        `Manifest entry is a directory rather than a managed leaf: ${deletion.posixPath}`,
      );
    }
    addEntry(entries, seen, deletion.posixPath, pre, { kind: "absent" });
  }

  for (const modification of plan.modifications) {
    const pre = fingerprintPath(modification.absPath);
    if (pre.kind !== "file") {
      throw new Error(
        `Mixed managed path is not a regular file: ${modification.posixPath}`,
      );
    }
    addEntry(
      entries,
      seen,
      modification.posixPath,
      pre,
      expectedFileFingerprint(modification.result.content, pre.mode),
    );
  }

  for (const relativeDir of prunableDirectories) {
    addEntry(
      entries,
      seen,
      relativeDir,
      fingerprintPath(path.join(projectRoot, ...relativeDir.split("/"))),
      { kind: "absent" },
    );
  }

  const trellisPath = path.join(projectRoot, DIR_NAMES.WORKFLOW);
  addEntry(entries, seen, DIR_NAMES.WORKFLOW, fingerprintPath(trellisPath), {
    kind: "absent",
  });
  return entries;
}

function applyAblationPlan(
  projectRoot: string,
  plan: ManagedRemovalPlan,
  prunableDirectories: readonly string[],
  transaction: LoadedAblationTransaction,
): void {
  const preByPath = new Map(
    transaction.state.entries.map((entry) => [entry.relativePath, entry.pre]),
  );
  for (const modification of plan.modifications) {
    writeFileAtomic(modification.absPath, modification.result.content);
    const pre = preByPath.get(modification.posixPath);
    if (process.platform !== "win32" && pre?.kind === "file") {
      fs.chmodSync(modification.absPath, pre.mode);
    }
  }

  for (const deletion of plan.deletions) {
    if (deletion.missing || isTrellisPath(deletion.posixPath)) continue;
    const stat = fs.lstatSync(deletion.absPath);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      throw new Error(
        `Refusing to unlink managed directory: ${deletion.posixPath}`,
      );
    }
    fs.unlinkSync(deletion.absPath);
  }

  const trellisPath = path.join(projectRoot, DIR_NAMES.WORKFLOW);
  const trellisStat = lstatIfPresent(trellisPath);
  if (trellisStat?.isSymbolicLink()) {
    fs.unlinkSync(trellisPath);
  } else if (trellisStat) {
    fs.rmSync(trellisPath, { recursive: true, force: false });
  }

  for (const relativeDir of prunableDirectories) {
    const directory = path.join(projectRoot, ...relativeDir.split("/"));
    if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) {
      fs.rmdirSync(directory);
    }
  }
}

function rollbackFailedAblation(
  transaction: LoadedAblationTransaction,
  originalError: unknown,
  lockHeld = false,
): never {
  try {
    rollbackAblationTransaction(transaction, { lockHeld });
  } catch (rollbackError) {
    if (
      transaction.state.status !== "preparing" &&
      transaction.state.status !== "restoring"
    ) {
      transitionAblationState(transaction, "conflict");
    }
    throw new Error(
      `Ablation failed and automatic rollback was incomplete. Recovery state remains at ${transaction.paths.transactionDir}. ` +
        `Original error: ${originalError instanceof Error ? originalError.message : String(originalError)}. ` +
        `Rollback error: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
    );
  }
  throw originalError;
}

export async function ablate(options: AblateOptions = {}): Promise<void> {
  assertCommandCwd("ablate");
  const projectRoot = canonicalProjectRoot(process.cwd());
  const stateRoot = getAblationStateRoot();
  assertExternalStateRoot(projectRoot, stateRoot);
  const transactionPaths = getTransactionPaths(projectRoot, stateRoot);
  if (fs.existsSync(transactionPaths.transactionDir)) {
    throw new Error(
      "This project is already ablated or has an interrupted ablation. Run `trellis restore` first.",
    );
  }

  const trellisPath = path.join(projectRoot, DIR_NAMES.WORKFLOW);
  if (!lstatIfPresent(trellisPath)) {
    console.log(chalk.gray("Trellis is not installed in this project."));
    return;
  }
  const hashes = loadHashes(projectRoot);
  if (Object.keys(hashes).length === 0) {
    throw new Error(
      "Trellis manifest is missing or not v2. Run the current `trellis update` before ablation.",
    );
  }

  const configuredPlatforms = getConfiguredPlatforms(projectRoot);
  const { hashes: prunedManifest, pruned } = pruneOrphanManifestKeys(
    projectRoot,
    [...configuredPlatforms],
    hashes,
    { persist: false },
  );
  if (pruned.length > 0) {
    console.log(
      chalk.gray(`Pruned ${pruned.length} orphan manifest entries in memory.`),
    );
  }
  let plan: ManagedRemovalPlan;
  try {
    plan = buildManagedRemovalPlan(projectRoot, prunedManifest, {
      strictPaths: true,
    });
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} ` +
        "Restore the managed file to its Trellis-generated form or remove its stale manifest entry, then retry.",
      { cause: error },
    );
  }
  const prunableDirectories = collectPrunableDirectories(projectRoot, plan);
  renderAblatePlan(plan, prunableDirectories, transactionPaths.transactionDir);
  if (options.dryRun) {
    console.log(
      chalk.gray("Dry run — no files or recovery state were modified."),
    );
    return;
  }
  if (!options.yes) {
    if (!process.stdin.isTTY) refuseNonInteractivePrompt("ablate");
    if (
      !(await promptContinue(
        "Temporarily remove all project Trellis surfaces?",
      ))
    ) {
      console.log(chalk.yellow("Ablation cancelled. No files modified."));
      return;
    }
  }

  const entries = buildAblationEntries(projectRoot, plan, prunableDirectories);
  withAblationProjectLock(transactionPaths, () => {
    if (lstatIfPresent(transactionPaths.transactionDir)) {
      throw new Error(
        "This project is already ablated or has an interrupted ablation. Run `trellis restore` first.",
      );
    }
    const transaction = stageAblationTransaction(
      {
        projectRoot,
        configuredPlatforms: [...configuredPlatforms],
        manifest: prunedManifest,
        entries,
      },
      { lockHeld: true },
    );
    try {
      applyAblationPlan(projectRoot, plan, prunableDirectories, transaction);
      verifyAblatedState(transaction);
      transitionAblationState(transaction, "applied");
    } catch (error) {
      rollbackFailedAblation(transaction, error, true);
    }
  });

  console.log(chalk.green("Trellis is fully ablated for this project."));
  console.log(
    chalk.yellow("Start a fresh agent session before comparing behavior."),
  );
  console.log(
    chalk.gray(
      "Git may show Trellis-managed deletions. The global CLI, channel logs, and host transcripts were not removed.",
    ),
  );
}

export async function restore(options: RestoreOptions = {}): Promise<void> {
  assertCommandCwd("restore");
  const projectRoot = canonicalProjectRoot(process.cwd());
  const transaction = loadAblationTransaction(projectRoot);
  if (!transaction) {
    console.log(
      chalk.gray("No Trellis ablation transaction exists for this project."),
    );
    return;
  }
  renderRestorePlan(transaction);
  if (!options.dryRun && !options.yes) {
    if (!process.stdin.isTTY) refuseNonInteractivePrompt("restore");
    if (
      !(await promptContinue("Restore the exact pre-ablation Trellis state?"))
    ) {
      console.log(chalk.yellow("Restore cancelled. No files modified."));
      return;
    }
  }

  restoreAblationTransaction(transaction, {
    dryRun: options.dryRun,
    deleteAfterRestore: !options.dryRun,
  });
  if (options.dryRun) {
    console.log(
      chalk.gray(
        "Dry run — restoration is conflict-free; no files were modified.",
      ),
    );
    return;
  }
  console.log(chalk.green("Trellis project state restored exactly."));
  console.log(
    chalk.yellow("Start a fresh agent session to resume with Trellis."),
  );
}

export { ABLATION_STATE_ROOT_ENV };

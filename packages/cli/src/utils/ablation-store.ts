/**
 * External, versioned recovery storage for reversible full Trellis ablation.
 *
 * The store intentionally contains only manifest-owned project paths and the
 * exact `.trellis/` tree. User-authored task/spec/workspace files may contain
 * sensitive text, so the state root is private and retained only until a
 * verified restore. Unrelated application files and global host state are
 * never copied.
 */

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

import { VERSION } from "../constants/version.js";
import { writeFileAtomic } from "./atomic-write.js";
import {
  assertSafeManagedPath,
  lstatIfPresent,
  validateManagedRelativePath,
} from "./managed-removal.js";

export const ABLATION_SCHEMA_VERSION = 1;
export const FULL_ABLATION_CAPABILITY = "trellis.full" as const;
export const ABLATION_STATE_ROOT_ENV = "TRELLIS_ABLATION_STATE_ROOT";

export type AblationStatus = "preparing" | "applied" | "restoring" | "conflict";

export interface AbsentFingerprint {
  kind: "absent";
}

export interface FileFingerprint {
  kind: "file";
  sha256: string;
  size: number;
  mode: number;
}

export interface DirectoryFingerprint {
  kind: "directory";
  sha256: string;
  mode: number;
}

export interface SymlinkFingerprint {
  kind: "symlink";
  target: string;
  mode: number;
}

export type PathFingerprint =
  | AbsentFingerprint
  | FileFingerprint
  | DirectoryFingerprint
  | SymlinkFingerprint;

export interface AblationEntry {
  relativePath: string;
  pre: PathFingerprint;
  expectedAblated: PathFingerprint;
  backupPath?: string;
}

export interface AblationStateV1 {
  schemaVersion: 1;
  status: AblationStatus;
  projectRoot: string;
  projectKey: string;
  trellisVersion: string;
  capabilities: [typeof FULL_ABLATION_CAPABILITY];
  createdAt: string;
  configuredPlatforms: string[];
  manifest: Record<string, string>;
  entries: AblationEntry[];
}

export interface TransactionPaths {
  stateRoot: string;
  transactionDir: string;
  stateFile: string;
  backupDir: string;
  lockFile: string;
}

export interface StagedAblationInput {
  projectRoot: string;
  configuredPlatforms: readonly string[];
  manifest: Record<string, string>;
  entries: AblationEntry[];
}

export interface StageAblationOptions {
  /** The caller already holds this project's ablation-operation lock. */
  lockHeld?: boolean;
}

export interface LoadedAblationTransaction {
  paths: TransactionPaths;
  state: AblationStateV1;
}

export interface RestoreAblationOptions {
  /** Only preflight; do not transition state or restore/delete any path. */
  dryRun?: boolean;
  /** Delete the external transaction after verified restoration. */
  deleteAfterRestore?: boolean;
}

export interface AblationConflict {
  relativePath: string;
  expected: PathFingerprint;
  actual: PathFingerprint;
}

export class AblationConflictError extends Error {
  public readonly conflicts: AblationConflict[];

  public constructor(conflicts: AblationConflict[]) {
    super(
      `Restore refused because ${conflicts.length} Trellis-managed path(s) changed while ablated.`,
    );
    this.name = "AblationConflictError";
    this.conflicts = conflicts;
  }
}

const fingerprintSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("absent") }).strict(),
  z
    .object({
      kind: z.literal("file"),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      size: z.number().int().nonnegative(),
      mode: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("directory"),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      mode: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("symlink"),
      target: z.string(),
      mode: z.number().int().nonnegative(),
    })
    .strict(),
]);

const ablationEntrySchema = z
  .object({
    relativePath: z.string().min(1),
    pre: fingerprintSchema,
    expectedAblated: fingerprintSchema,
    backupPath: z.string().min(1).optional(),
  })
  .strict();

const ablationStateSchema = z
  .object({
    schemaVersion: z.literal(ABLATION_SCHEMA_VERSION),
    status: z.enum(["preparing", "applied", "restoring", "conflict"]),
    projectRoot: z.string().min(1),
    projectKey: z.string().regex(/^[a-f0-9]{64}$/),
    trellisVersion: z.string().min(1),
    capabilities: z.tuple([z.literal(FULL_ABLATION_CAPABILITY)]),
    createdAt: z.iso.datetime(),
    configuredPlatforms: z.array(z.string()),
    manifest: z.record(z.string(), z.string()),
    entries: z.array(ablationEntrySchema).min(1),
  })
  .strict();

function modeBits(stat: fs.Stats): number {
  return process.platform === "win32" ? 0 : stat.mode & 0o7777;
}

function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function hashDirectory(absPath: string): string {
  const hash = createHash("sha256");
  const entries = fs
    .readdirSync(absPath)
    .sort((left, right) => left.localeCompare(right));

  for (const name of entries) {
    const child = path.join(absPath, name);
    const fingerprint = fingerprintPath(child);
    hash.update(name, "utf-8");
    hash.update("\0", "utf-8");
    hash.update(JSON.stringify(fingerprint), "utf-8");
    hash.update("\0", "utf-8");
  }

  return hash.digest("hex");
}

/** Fingerprint one path without dereferencing a symlink leaf. */
export function fingerprintPath(absPath: string): PathFingerprint {
  const stat = lstatIfPresent(absPath);
  if (!stat) return { kind: "absent" };

  if (stat.isSymbolicLink()) {
    return {
      kind: "symlink",
      target: fs.readlinkSync(absPath),
      mode: modeBits(stat),
    };
  }
  if (stat.isFile()) {
    const content = fs.readFileSync(absPath);
    return {
      kind: "file",
      sha256: sha256(content),
      size: content.byteLength,
      mode: modeBits(stat),
    };
  }
  if (stat.isDirectory()) {
    return {
      kind: "directory",
      sha256: hashDirectory(absPath),
      mode: modeBits(stat),
    };
  }

  throw new Error(
    `Unsupported filesystem object in ablation scope: ${absPath}`,
  );
}

export function expectedFileFingerprint(
  content: string | Uint8Array,
  mode: number,
): FileFingerprint {
  const bytes = typeof content === "string" ? Buffer.from(content) : content;
  return {
    kind: "file",
    sha256: sha256(bytes),
    size: bytes.byteLength,
    mode,
  };
}

export function fingerprintsEqual(
  left: PathFingerprint,
  right: PathFingerprint,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "absent" && right.kind === "absent") return true;
  if (left.kind === "symlink" && right.kind === "symlink") {
    return left.target === right.target && left.mode === right.mode;
  }
  if (left.kind === "file" && right.kind === "file") {
    return (
      left.sha256 === right.sha256 &&
      left.size === right.size &&
      left.mode === right.mode
    );
  }
  return (
    left.kind === "directory" &&
    right.kind === "directory" &&
    left.sha256 === right.sha256 &&
    left.mode === right.mode
  );
}

export function canonicalProjectRoot(cwd: string): string {
  return fs.realpathSync(cwd);
}

export function projectKey(projectRoot: string): string {
  return sha256(canonicalProjectRoot(projectRoot));
}

export function getAblationStateRoot(): string {
  const override = process.env[ABLATION_STATE_ROOT_ENV];
  if (override && override.trim().length > 0) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".trellis", "ablations", "v1");
}

export function getTransactionPaths(
  projectRoot: string,
  stateRoot = getAblationStateRoot(),
): TransactionPaths {
  const canonical = canonicalProjectRoot(projectRoot);
  assertExternalStateRoot(canonical, stateRoot);
  const key = projectKey(canonical);
  const transactionDir = path.join(stateRoot, key);
  return {
    stateRoot,
    transactionDir,
    stateFile: path.join(transactionDir, "state.json"),
    backupDir: path.join(transactionDir, "backup"),
    lockFile: path.join(stateRoot, `${key}.lock`),
  };
}

function ensurePrivateDirectory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") fs.chmodSync(dir, 0o700);
}

function writeState(paths: TransactionPaths, state: AblationStateV1): void {
  writeFileAtomic(paths.stateFile, `${JSON.stringify(state, null, 2)}\n`);
  if (process.platform !== "win32") fs.chmodSync(paths.stateFile, 0o600);
}

function projectedCanonicalPath(absPath: string): string {
  let cursor = path.resolve(absPath);
  const missingSegments: string[] = [];

  while (!lstatIfPresent(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    missingSegments.unshift(path.basename(cursor));
    cursor = parent;
  }

  const canonicalAncestor = fs.realpathSync(cursor);
  return path.resolve(canonicalAncestor, ...missingSegments);
}

function isWithinPath(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
}

export function assertExternalStateRoot(
  projectRoot: string,
  stateRoot: string,
): void {
  const projectedStateRoot = projectedCanonicalPath(stateRoot);
  if (isWithinPath(projectRoot, projectedStateRoot)) {
    throw new Error(
      `${ABLATION_STATE_ROOT_ENV} must point outside the project being ablated.`,
    );
  }
}

function validateStoredRelativePath(relativePath: string): void {
  validateManagedRelativePath(relativePath);
}

function copyPath(
  source: string,
  destination: string,
  privateParents: boolean,
): void {
  const stat = fs.lstatSync(source);
  if (privateParents) {
    ensurePrivateDirectory(path.dirname(destination));
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
  }

  if (stat.isSymbolicLink()) {
    fs.symlinkSync(fs.readlinkSync(source), destination);
    return;
  }
  if (stat.isFile()) {
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    if (process.platform !== "win32") fs.chmodSync(destination, modeBits(stat));
    return;
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { mode: 0o700 });
    for (const child of fs.readdirSync(source)) {
      copyPath(
        path.join(source, child),
        path.join(destination, child),
        privateParents,
      );
    }
    if (process.platform !== "win32") fs.chmodSync(destination, modeBits(stat));
    return;
  }

  throw new Error(`Unsupported filesystem object in ablation scope: ${source}`);
}

function removePath(absPath: string): void {
  if (!lstatIfPresent(absPath)) return;
  fs.rmSync(absPath, { recursive: true, force: true });
}

function makeExternalTreeRemovable(absPath: string): void {
  const stat = lstatIfPresent(absPath);
  if (!stat || stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    if (process.platform !== "win32") fs.chmodSync(absPath, 0o700);
    for (const child of fs.readdirSync(absPath)) {
      makeExternalTreeRemovable(path.join(absPath, child));
    }
  } else if (process.platform !== "win32") {
    fs.chmodSync(absPath, 0o600);
  }
}

function removeExternalTransactionDir(transactionDir: string): void {
  makeExternalTreeRemovable(transactionDir);
  fs.rmSync(transactionDir, { recursive: true, force: true });
}

function verifyBackupEntry(transactionDir: string, entry: AblationEntry): void {
  if (!entry.backupPath) return;
  const backupAbs = path.join(transactionDir, ...entry.backupPath.split("/"));
  const actual = fingerprintPath(backupAbs);
  if (!fingerprintsEqual(actual, entry.pre)) {
    throw new Error(`Backup verification failed for ${entry.relativePath}`);
  }
}

function validateStatePaths(state: AblationStateV1): void {
  const seen = new Set<string>();
  for (const key of Object.keys(state.manifest))
    validateManagedRelativePath(key);

  for (const entry of state.entries) {
    validateStoredRelativePath(entry.relativePath);
    if (seen.has(entry.relativePath)) {
      throw new Error(`Duplicate ablation entry: ${entry.relativePath}`);
    }
    seen.add(entry.relativePath);
    if (entry.backupPath) validateStoredRelativePath(entry.backupPath);
    if (entry.pre.kind === "absent" && entry.backupPath) {
      throw new Error(
        `Absent ablation entry has a backup: ${entry.relativePath}`,
      );
    }
    if (entry.pre.kind !== "absent" && !entry.backupPath) {
      throw new Error(
        `Ablation entry is missing its backup: ${entry.relativePath}`,
      );
    }
    if (
      entry.pre.kind !== "absent" &&
      entry.backupPath !== `backup/${entry.relativePath}`
    ) {
      throw new Error(
        `Ablation backup path does not match its project path: ${entry.relativePath}`,
      );
    }
  }
}

/** Parse and validate an external state file. Unknown schemas fail closed. */
export function parseAblationState(value: unknown): AblationStateV1 {
  const parsed = ablationStateSchema.parse(value) as AblationStateV1;
  validateStatePaths(parsed);
  return parsed;
}

/**
 * Stage and verify the complete backup, then atomically publish a `preparing`
 * transaction before the caller mutates the project.
 */
export function stageAblationTransaction(
  input: StagedAblationInput,
  options: StageAblationOptions = {},
): LoadedAblationTransaction {
  const projectRoot = canonicalProjectRoot(input.projectRoot);
  const stateRoot = getAblationStateRoot();
  assertExternalStateRoot(projectRoot, stateRoot);
  const paths = getTransactionPaths(projectRoot, stateRoot);
  const state = parseAblationState({
    schemaVersion: ABLATION_SCHEMA_VERSION,
    status: "preparing",
    projectRoot,
    projectKey: projectKey(projectRoot),
    trellisVersion: VERSION,
    capabilities: [FULL_ABLATION_CAPABILITY],
    createdAt: new Date().toISOString(),
    configuredPlatforms: [...input.configuredPlatforms],
    manifest: { ...input.manifest },
    entries: input.entries
      .map((entry) => ({ ...entry }))
      .sort(
        (left, right) =>
          left.relativePath.split("/").length -
          right.relativePath.split("/").length,
      ),
  });
  if (!options.lockHeld) {
    return withAblationProjectLock(paths, () =>
      stageAblationTransaction(input, { lockHeld: true }),
    );
  }
  if (lstatIfPresent(paths.transactionDir)) {
    throw new Error(
      "An ablation transaction already exists for this project. Run `trellis restore` first.",
    );
  }
  ensurePrivateDirectory(paths.stateRoot);
  assertExternalStateRoot(projectRoot, paths.stateRoot);
  const tempDir = path.join(
    paths.stateRoot,
    `.${projectKey(projectRoot)}.${process.pid}.${Date.now()}.tmp`,
  );
  const tempPaths: TransactionPaths = {
    stateRoot: paths.stateRoot,
    transactionDir: tempDir,
    stateFile: path.join(tempDir, "state.json"),
    backupDir: path.join(tempDir, "backup"),
    lockFile: paths.lockFile,
  };

  ensurePrivateDirectory(tempPaths.transactionDir);
  ensurePrivateDirectory(tempPaths.backupDir);

  try {
    for (const entry of state.entries) {
      const source = assertSafeManagedPath(projectRoot, entry.relativePath);
      const actualPre = fingerprintPath(source);
      if (!fingerprintsEqual(actualPre, entry.pre)) {
        throw new Error(
          `Project path changed during ablation preflight: ${entry.relativePath}`,
        );
      }
      if (!entry.backupPath) continue;
      const destination = path.join(
        tempPaths.transactionDir,
        ...entry.backupPath.split("/"),
      );
      if (!lstatIfPresent(destination)) copyPath(source, destination, true);
      verifyBackupEntry(tempPaths.transactionDir, entry);
    }
    writeState(tempPaths, state);
    fs.renameSync(tempPaths.transactionDir, paths.transactionDir);
  } catch (error) {
    removeExternalTransactionDir(tempPaths.transactionDir);
    throw error;
  }

  return { paths, state };
}

export function loadAblationTransaction(
  projectRoot: string,
  stateRoot = getAblationStateRoot(),
): LoadedAblationTransaction | null {
  const canonical = canonicalProjectRoot(projectRoot);
  assertExternalStateRoot(canonical, stateRoot);
  const paths = getTransactionPaths(canonical, stateRoot);
  if (!lstatIfPresent(paths.stateFile)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(paths.stateFile, "utf-8")) as unknown;
  } catch (error) {
    throw new Error(
      `Ablation state is unreadable; refusing to modify the project: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const state = parseAblationState(raw);
  if (
    state.projectRoot !== canonical ||
    state.projectKey !== projectKey(canonical)
  ) {
    throw new Error("Ablation state does not belong to this project.");
  }
  for (const entry of state.entries)
    verifyBackupEntry(paths.transactionDir, entry);
  return { paths, state };
}

export function transitionAblationState(
  transaction: LoadedAblationTransaction,
  status: AblationStatus,
): AblationStateV1 {
  const next: AblationStateV1 = { ...transaction.state, status };
  writeState(transaction.paths, next);
  transaction.state = next;
  return next;
}

function currentPathForEntry(
  projectRoot: string,
  entry: AblationEntry,
): string {
  return assertSafeManagedPath(projectRoot, entry.relativePath);
}

function mayAlreadyBeRestored(state: AblationStateV1): boolean {
  return state.status === "preparing" || state.status === "restoring";
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireProjectLock(paths: TransactionPaths): void {
  ensurePrivateDirectory(paths.stateRoot);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(paths.lockFile, "wx", 0o600);
      try {
        fs.writeSync(fd, String(process.pid));
      } finally {
        fs.closeSync(fd);
      }
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }

    let holderPid = 0;
    try {
      holderPid = Number(fs.readFileSync(paths.lockFile, "utf-8").trim());
    } catch {
      continue;
    }
    if (holderPid && pidAlive(holderPid)) {
      throw new Error(
        `Another Trellis ablation operation is already in progress for this project (pid ${holderPid}).`,
      );
    }
    try {
      fs.unlinkSync(paths.lockFile);
    } catch {
      // A concurrent process changed the lock; retry the atomic create once.
    }
  }
  throw new Error(
    "Unable to acquire the Trellis ablation-operation lock; retry the command.",
  );
}

function releaseProjectLock(paths: TransactionPaths): void {
  try {
    const holder = fs.readFileSync(paths.lockFile, "utf-8").trim();
    if (holder === String(process.pid)) {
      fs.unlinkSync(paths.lockFile);
    }
  } catch {
    // Already released or replaced by another process.
  }
}

/** Serialize ablate/restore state and project mutations for one project. */
export function withAblationProjectLock<T>(
  paths: TransactionPaths,
  operation: () => T,
): T {
  acquireProjectLock(paths);
  try {
    return operation();
  } finally {
    releaseProjectLock(paths);
  }
}

/** Preflight every affected path before restore writes anything. */
export function collectRestoreConflicts(
  transaction: LoadedAblationTransaction,
): AblationConflict[] {
  const conflicts: AblationConflict[] = [];
  for (const entry of transaction.state.entries) {
    const current = fingerprintPath(
      currentPathForEntry(transaction.state.projectRoot, entry),
    );
    if (fingerprintsEqual(current, entry.expectedAblated)) continue;
    if (
      mayAlreadyBeRestored(transaction.state) &&
      fingerprintsEqual(current, entry.pre)
    ) {
      continue;
    }
    conflicts.push({
      relativePath: entry.relativePath,
      expected: entry.expectedAblated,
      actual: current,
    });
  }
  return conflicts;
}

function restoreEntry(
  transaction: LoadedAblationTransaction,
  entry: AblationEntry,
  verifyExpectedState: boolean,
): void {
  const destination = currentPathForEntry(transaction.state.projectRoot, entry);
  const current = fingerprintPath(destination);
  if (fingerprintsEqual(current, entry.pre)) return;
  if (
    verifyExpectedState &&
    !fingerprintsEqual(current, entry.expectedAblated)
  ) {
    throw new AblationConflictError([
      {
        relativePath: entry.relativePath,
        expected: entry.expectedAblated,
        actual: current,
      },
    ]);
  }
  if (entry.pre.kind === "absent") {
    if (verifyExpectedState) {
      const beforeRemove = fingerprintPath(destination);
      if (!fingerprintsEqual(beforeRemove, entry.expectedAblated)) {
        throw new AblationConflictError([
          {
            relativePath: entry.relativePath,
            expected: entry.expectedAblated,
            actual: beforeRemove,
          },
        ]);
      }
    }
    removePath(destination);
    return;
  }
  if (!entry.backupPath) {
    throw new Error(`Missing backup path for ${entry.relativePath}`);
  }
  const source = path.join(
    transaction.paths.transactionDir,
    ...entry.backupPath.split("/"),
  );

  if (entry.pre.kind === "file") {
    const content = fs.readFileSync(source);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const tempPath = path.join(
      path.dirname(destination),
      `.${path.basename(destination)}.${process.pid}.${randomUUID()}.restore.tmp`,
    );
    try {
      fs.writeFileSync(tempPath, content, { flag: "wx", mode: 0o600 });
      if (process.platform !== "win32") fs.chmodSync(tempPath, entry.pre.mode);

      if (verifyExpectedState) {
        const beforeReplace = fingerprintPath(destination);
        if (!fingerprintsEqual(beforeReplace, entry.expectedAblated)) {
          throw new AblationConflictError([
            {
              relativePath: entry.relativePath,
              expected: entry.expectedAblated,
              actual: beforeReplace,
            },
          ]);
        }
      }
      if (entry.expectedAblated.kind === "absent") {
        if (!verifyExpectedState) removePath(destination);
        try {
          fs.linkSync(tempPath, destination);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            throw new AblationConflictError([
              {
                relativePath: entry.relativePath,
                expected: entry.expectedAblated,
                actual: fingerprintPath(destination),
              },
            ]);
          }
          throw error;
        }
        fs.unlinkSync(tempPath);
      } else {
        fs.renameSync(tempPath, destination);
      }
    } catch (error) {
      try {
        fs.unlinkSync(tempPath);
      } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
          throw new AggregateError(
            [error, cleanupError],
            `Restore failed and temporary-file cleanup also failed: ${entry.relativePath}`,
          );
        }
      }
      throw error;
    }
    return;
  }

  if (entry.pre.kind === "symlink" && entry.expectedAblated.kind === "absent") {
    if (verifyExpectedState) {
      const beforeCreate = fingerprintPath(destination);
      if (!fingerprintsEqual(beforeCreate, entry.expectedAblated)) {
        throw new AblationConflictError([
          {
            relativePath: entry.relativePath,
            expected: entry.expectedAblated,
            actual: beforeCreate,
          },
        ]);
      }
    }
    if (!verifyExpectedState) removePath(destination);
    try {
      fs.symlinkSync(entry.pre.target, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new AblationConflictError([
          {
            relativePath: entry.relativePath,
            expected: entry.expectedAblated,
            actual: fingerprintPath(destination),
          },
        ]);
      }
      throw error;
    }
    return;
  }

  if (verifyExpectedState) {
    const beforeReplace = fingerprintPath(destination);
    if (!fingerprintsEqual(beforeReplace, entry.expectedAblated)) {
      throw new AblationConflictError([
        {
          relativePath: entry.relativePath,
          expected: entry.expectedAblated,
          actual: beforeReplace,
        },
      ]);
    }
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const tempPath = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${process.pid}.${randomUUID()}.restore.tmp`,
  );
  try {
    copyPath(source, tempPath, false);
    if (verifyExpectedState) {
      const beforeReplace = fingerprintPath(destination);
      if (!fingerprintsEqual(beforeReplace, entry.expectedAblated)) {
        throw new AblationConflictError([
          {
            relativePath: entry.relativePath,
            expected: entry.expectedAblated,
            actual: beforeReplace,
          },
        ]);
      }
    }
    if (!verifyExpectedState) removePath(destination);
    fs.renameSync(tempPath, destination);
  } catch (error) {
    removePath(tempPath);
    if (verifyExpectedState) {
      const afterFailure = fingerprintPath(destination);
      if (!fingerprintsEqual(afterFailure, entry.expectedAblated)) {
        throw new AblationConflictError([
          {
            relativePath: entry.relativePath,
            expected: entry.expectedAblated,
            actual: afterFailure,
          },
        ]);
      }
    }
    throw error;
  }
}

/** Restore exact backup bytes/link identity/modes without running preflight. */
export function restoreTransactionFiles(
  transaction: LoadedAblationTransaction,
  options: { verifyExpectedState?: boolean } = {},
): void {
  const ordered = [...transaction.state.entries].sort(
    (left, right) =>
      left.relativePath.split("/").length -
      right.relativePath.split("/").length,
  );
  for (const entry of ordered) {
    restoreEntry(transaction, entry, options.verifyExpectedState ?? false);
  }
}

export function verifyRestoredState(
  transaction: LoadedAblationTransaction,
): void {
  for (const entry of transaction.state.entries) {
    const actual = fingerprintPath(
      currentPathForEntry(transaction.state.projectRoot, entry),
    );
    if (!fingerprintsEqual(actual, entry.pre)) {
      throw new Error(
        `Restored path verification failed: ${entry.relativePath}`,
      );
    }
  }
}

export function verifyAblatedState(
  transaction: LoadedAblationTransaction,
): void {
  for (const entry of transaction.state.entries) {
    const actual = fingerprintPath(
      currentPathForEntry(transaction.state.projectRoot, entry),
    );
    if (!fingerprintsEqual(actual, entry.expectedAblated)) {
      throw new Error(
        `Ablated path verification failed: ${entry.relativePath}`,
      );
    }
  }
}

/** Conflict-safe exact restore. Any mismatch causes zero project writes. */
export function restoreAblationTransaction(
  transaction: LoadedAblationTransaction,
  options: RestoreAblationOptions = {},
): void {
  const projectRoot = canonicalProjectRoot(transaction.state.projectRoot);
  const paths = getTransactionPaths(projectRoot, transaction.paths.stateRoot);
  acquireProjectLock(paths);
  try {
    const reloaded = loadAblationTransaction(projectRoot, paths.stateRoot);
    if (!reloaded) {
      throw new Error(
        "Ablation transaction disappeared before restore could begin.",
      );
    }
    transaction.paths = reloaded.paths;
    transaction.state = reloaded.state;

    const conflicts = collectRestoreConflicts(transaction);
    if (conflicts.length > 0) {
      if (!options.dryRun && !mayAlreadyBeRestored(transaction.state)) {
        transitionAblationState(transaction, "conflict");
      }
      throw new AblationConflictError(conflicts);
    }

    if (options.dryRun) return;

    transitionAblationState(transaction, "restoring");
    restoreTransactionFiles(transaction, { verifyExpectedState: true });
    verifyRestoredState(transaction);
    if (options.deleteAfterRestore) deleteAblationTransaction(transaction);
  } finally {
    releaseProjectLock(paths);
  }
}

/** Roll back this process's partial ablation while holding the project lock. */
export function rollbackAblationTransaction(
  transaction: LoadedAblationTransaction,
  options: { lockHeld?: boolean } = {},
): void {
  const projectRoot = canonicalProjectRoot(transaction.state.projectRoot);
  const paths = getTransactionPaths(projectRoot, transaction.paths.stateRoot);
  const rollback = (): void => {
    const reloaded = loadAblationTransaction(projectRoot, paths.stateRoot);
    if (!reloaded) {
      throw new Error(
        "Ablation transaction disappeared before rollback could begin.",
      );
    }
    transaction.paths = reloaded.paths;
    transaction.state = reloaded.state;

    // This process is unwinding its own partially applied plan. A parent
    // directory can temporarily match neither endpoint fingerprint, so normal
    // user-restore conflict preflight is intentionally not used here.
    restoreTransactionFiles(transaction);
    verifyRestoredState(transaction);
    deleteAblationTransaction(transaction);
  };

  if (options.lockHeld) rollback();
  else withAblationProjectLock(paths, rollback);
}

export function deleteAblationTransaction(
  transaction: LoadedAblationTransaction,
): void {
  removeExternalTransactionDir(transaction.paths.transactionDir);
}

import { classifyFormalArchivePredecessor, validateFormalArchiveSuccessorSource } from "../maintenance.js";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { applyTaskOperation, canonicalJson, parseTaskOperation, same } from "./operations.js";
import { authority, candidate, deliveryFact, fail, parseTaskRecordV2, relativePath, taskArtifactRoot } from "./schema.js";
import { authorityLocator, canonicalTaskOperation, taskArtifactContext, type TaskArtifactContext } from "./artifacts.js";
import type { AuthorityRef, CandidateRef, DeliveryFact, OperationOutput, PublicationFact, TaskRecordV2, WorkflowContract } from "./types.js";

export interface TaskStoreOptions { root: string; taskDir: string }
export interface WriteTaskV2Options extends TaskStoreOptions { record: TaskRecordV2; expected_preimage?: string | null }
export interface ApplyTaskV2Options extends TaskStoreOptions {
  operation: unknown;
  workflow: WorkflowContract;
  expected_preimage: string;
  /** Original producer's read-only objective verification for PR/external historical facts. No remote mutation. */
  verifyFact?: (fact: DeliveryFact | PublicationFact) => boolean;
}
function digest(bytes: string | Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }
function contained(root: string, locator: string, mayNotExist = false, ownedTaskRoots = true): string {
  relativePath(locator); const base = fs.realpathSync(root); const target = path.resolve(base, locator);
  if (!target.startsWith(base + path.sep)) fail("invalid_locator", locator);
  // Validate every existing component; do not follow nested symlinks at write/read boundaries.
  let current = base;
  const parts = locator.split("/");
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    let stat: fs.Stats;
    try { stat = fs.lstatSync(current); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT" && mayNotExist) break; fail("missing_locator", locator); }
    if (stat.isSymbolicLink()) {
      // Preserve established user-selected .trellis/tasks/direct-task roots.
      // Files and nested archive/planning components never become root aliases.
      const ownedRoot = ownedTaskRoots && parts[0] === ".trellis" &&
        (index === 0 || (parts[1] === "tasks" && (index === 1 || (index === 2 && part !== "archive"))));
      if (!ownedRoot) fail("invalid_locator", `symlink ${locator}`);
      try { if (!fs.statSync(fs.realpathSync(current)).isDirectory()) fail("invalid_locator", `not a root directory: ${locator}`); }
      catch { fail("invalid_locator", `dangling root alias ${locator}`); }
    }
  }
  return target;
}
function recordPath(options: TaskStoreOptions, mayNotExist = false): string {
  const taskDir = path.isAbsolute(options.taskDir) ? path.relative(fs.realpathSync(options.root), options.taskDir).split(path.sep).join("/") : options.taskDir;
  if (taskDir === ".trellis/tasks/archive" || !/^\.trellis\/tasks\/(?:archive\/[^/]+\/)?[^/]+$/.test(taskDir)) fail("invalid_locator", "taskDir must be a managed task directory");
  return contained(options.root, `${taskDir}/task.json`, mayNotExist, true);
}
export function serializeTaskRecordV2(input: unknown): string { return JSON.stringify(parseTaskRecordV2(input), null, 2) + "\n"; }
export function loadTaskRecordV2(options: TaskStoreOptions): { record: TaskRecordV2; preimage: string } {
  const preimage = fs.readFileSync(recordPath(options), "utf8"); return { record: parseTaskRecordV2(JSON.parse(preimage)), preimage };
}
function writeAtomic(file: string, bytes: string, mode?: number): void {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  try { fs.writeFileSync(temporary, bytes, { flag: "wx", mode: mode ?? 0o600 }); if (mode !== undefined) fs.chmodSync(temporary, mode); fs.renameSync(temporary, file); }
  catch (error) { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); throw error; }
}
function assertIdentities(previous: TaskRecordV2, next: TaskRecordV2): void {
  if (previous.id !== next.id || !same(previous.source, next.source)) fail("immutable_identity", "Task id/source cannot change");
  for (const d of previous.deliveries) {
    const updated = next.deliveries.find((item) => item.id === d.id);
    if (updated?.lifecycle_generation !== d.lifecycle_generation || updated.planning_root !== d.planning_root || updated.profile !== d.profile) fail("immutable_identity", d.id);
    if (d.delivery_result && !same(d.delivery_result, updated.delivery_result)) fail("immutable_delivery_fact", d.id);
    if (d.stop_result && !same(d.stop_result, updated.stop_result)) fail("immutable_delivery_fact", d.id);
  }
  for (const r of previous.completion_results) if (!next.completion_results.some((item) => same(item, r))) fail("immutable_completion_fact", r.result_id);
  for (const r of previous.closure_results) if (!next.closure_results.some((item) => same(item, r))) fail("immutable_closure_fact", r.result_id);
}
/** Initial creation or metadata-only write. Lifecycle changes must use applyTaskOperationToStore. */
export function writeTaskRecordV2(options: WriteTaskV2Options): void {
  const next = parseTaskRecordV2(options.record); const file = recordPath(options, true);
  let mode: number | undefined;
  if (fs.existsSync(file)) {
    const { record: previous, preimage } = loadTaskRecordV2(options);
    if (previous.artifact_origin !== next.artifact_origin) fail("immutable_artifact_origin", "only explicit relocation initializes origin");
    if (options.expected_preimage !== preimage) fail("stale_preimage", "exact previous task bytes required");
    assertIdentities(previous, next);
    for (const field of ["lifecycle_generation", "accepted_scope", "deliveries", "completion_results", "closure_results"] as const) if (!same(previous[field], next[field])) fail("closed_operation_required", field);
    mode = fs.statSync(file).mode & 0o777;
  } else {
    if (options.expected_preimage !== undefined && options.expected_preimage !== null) fail("stale_preimage", "Task does not exist");
    if (next.artifact_origin !== undefined) fail("closed_operation_required", "new Task has no artifact origin");
    if (next.lifecycle_generation !== 0 || next.deliveries.length || next.completion_results.length || next.closure_results.length || next.accepted_scope !== null) fail("closed_operation_required", "new Task must have empty lifecycle");
    reserveIdentity(options, next.id);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true }); writeAtomic(file, serializeTaskRecordV2(next), mode);
}
/** Identity reservation is intentionally a narrow read, not acceptance of old lifecycle metadata. */
function reserveIdentity(options: TaskStoreOptions, id: string): void { reserveIdentityExcept(options, id); }
function formalPredecessorForRelocation(options: TaskStoreOptions, id: string, excluded?: string): string | null {
  if (!excluded) return null;
  const provenanceFile = path.join(excluded, "migration/formal-archive-reactivation.json");
  if (!fs.existsSync(provenanceFile)) return null;
  const provenance: unknown = JSON.parse(fs.readFileSync(provenanceFile, "utf8"));
  const record = parseTaskRecordV2(JSON.parse(fs.readFileSync(path.join(excluded, "task.json"), "utf8")));
  if (typeof provenance !== "object" || provenance === null || !("key" in provenance) || !("archive_ref" in provenance) || !("archive_commit" in provenance) || !("original_task_ref" in provenance) || !same(Object.keys(provenance).sort(), ["key", "archive_ref", "archive_commit", "original_task_ref"].sort())) fail("formal_archive_provenance_mismatch", "public predecessor relation");
  const key = provenance.key;
  if (typeof key !== "object" || key === null || !("task_id" in key) || !("lifecycle_generation" in key) || !same(Object.keys(key).sort(), ["task_id", "lifecycle_generation"].sort()) || key.task_id !== id || !Number.isSafeInteger(key.lifecycle_generation) || Number(key.lifecycle_generation) < 0 || record.id !== id || record.lifecycle_generation <= Number(key.lifecycle_generation) || typeof provenance.archive_ref !== "string" || !/^\.trellis\/tasks\/archive\/\d{4}-\d{2}\/[^/]+$/.test(provenance.archive_ref) || typeof provenance.original_task_ref !== "string" || !/^\.trellis\/tasks\/(?!archive$)[^/]+$/.test(provenance.original_task_ref) || typeof provenance.archive_commit !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(provenance.archive_commit)) fail("formal_archive_provenance_mismatch", "predecessor identity");
  const predecessor = contained(options.root, provenance.archive_ref, false, true);
  const file = contained(options.root, `${provenance.archive_ref}/task.json`, false, true);
  const source: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  try {
    const identity = classifyFormalArchivePredecessor(source);
    validateFormalArchiveSuccessorSource(source, record.source);
    if (identity.task_id !== id || identity.generation !== key.lifecycle_generation) fail("formal_archive_provenance_mismatch", "retained predecessor identity");
  } catch (error) { fail("formal_archive_provenance_mismatch", `retained predecessor source: ${(error as Error).message}`); }
  if (!fs.readFileSync(file).equals(fs.readFileSync(path.join(excluded, "migration/source-task.json")))) fail("formal_archive_provenance_mismatch", "retained predecessor bytes");
  return fs.realpathSync(predecessor);
}
function reserveIdentityExcept(options: TaskStoreOptions, id: string, excluded?: string): void {
  const predecessor = formalPredecessorForRelocation(options, id, excluded);
  const tasks = contained(options.root, ".trellis/tasks", true, true); if (!fs.existsSync(tasks)) return;
  const inspect = (dir: string, historical = false): void => {
    if ((excluded && fs.realpathSync(dir) === fs.realpathSync(excluded)) || fs.realpathSync(dir) === predecessor) return;
    contained(options.root, path.relative(fs.realpathSync(options.root), dir).split(path.sep).join("/"), false, true);
    const visibleCollision = (): void => {
      const name = path.basename(dir); const candidates = [name, name.replace(/^\d+-\d+-/, "")];
      if (candidates.some((value) => value.toLowerCase() === id.toLowerCase())) fail("task_id_collision", dir);
    };
    const file = path.join(dir, "task.json");
    let stat: fs.Stats;
    try { stat = fs.lstatSync(file); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") { visibleCollision(); return; } throw error; }
    if (stat.isSymbolicLink()) fail("invalid_locator", "symlink task record");
    let parsed: unknown;
    try { parsed = JSON.parse(fs.readFileSync(file, "utf8")); } catch { if (historical) { visibleCollision(); return; } fail("invalid_identity_reservation", file); }
    if (typeof parsed !== "object" || parsed === null || !("id" in parsed) || typeof parsed.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(parsed.id)) { if (historical) { visibleCollision(); return; } fail("invalid_identity_reservation", file); }
    if (parsed.id.toLowerCase() === id.toLowerCase()) fail("task_id_collision", file);
  };
  for (const entry of fs.readdirSync(tasks, { withFileTypes: true })) {
    if (entry.name === "archive") {
      const archive = contained(options.root, ".trellis/tasks/archive", false, true);
      for (const month of fs.readdirSync(archive, { withFileTypes: true })) if (month.isDirectory() || month.isSymbolicLink()) {
        const monthDir = contained(options.root, `.trellis/tasks/archive/${month.name}`, false, true);
        for (const task of fs.readdirSync(monthDir, { withFileTypes: true })) if (task.isDirectory() || task.isSymbolicLink()) inspect(path.join(monthDir, task.name), true);
      }
    } else if (entry.isDirectory() || entry.isSymbolicLink()) inspect(path.join(tasks, entry.name));
  }
}
function reservedCandidatePath(locator: string): boolean {
  return locator === ".git" || locator.startsWith(".git/") || /(?:^|\/)trellis\/sessions(?:\/|$)/.test(locator) || /^\.trellis\/(?:sessions|\.runtime|\.internal|\.delivery-results)(?:\/|$)/.test(locator) || /^\.trellis\/tasks\/(?:archive\/[^/]+\/)?[^/]+\/task\.json$/.test(locator);
}
/** Bound literal path arguments and read only selected parent metadata. */
function* selectedGitRows(root: string, args: string[], paths: string[]): Generator<string> {
  const fixed = ["--literal-pathspecs", ...args, "--"];
  const fixedSize = ["git", ...fixed].reduce((size, arg) => size + Buffer.byteLength(arg) + 1, 0);
  let batch: string[] = []; let size = fixedSize;
  const rows = (selected: string[]): string[] => gitBytes(root, [...fixed, ...selected]).toString("utf8").split("\0");
  for (const locator of paths) {
    const pathSize = Buffer.byteLength(locator) + 1;
    if (fixedSize + pathSize > 64 * 1024) fail("invalid_git_fact", "Git path exceeds argument batch limit");
    if (size + pathSize > 64 * 1024) { yield* rows(batch); batch = []; size = fixedSize; }
    batch.push(locator); size += pathSize;
  }
  if (batch.length) yield* rows(batch);
}

/** Parent metadata only: null denotes a staged deletion of a HEAD gitlink. */
function candidateGitlinks(root: string, paths: string[]): Map<string, string | null> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_")));
  const probe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, env: { ...env, LC_ALL: "C" }, encoding: "utf8" });
  if (probe.status !== 0) {
    if ((probe.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return new Map();
    if (probe.stderr?.includes("not a git repository")) return new Map();
    fail("invalid_git_fact", "cannot detect parent repository");
  }
  if (probe.stdout.trim() !== "true") return new Map();
  const selected = new Set(paths); const indexed = new Set<string>(); const links = new Map<string, string | null>();
  for (const row of selectedGitRows(root, ["ls-files", "--stage", "-z"], paths)) {
    if (!row) continue;
    const tab = row.indexOf("\t"); const locator = row.slice(tab + 1);
    if (!selected.has(locator)) continue;
    const [mode, oid, stage] = row.slice(0, tab).split(" ");
    if (stage !== "0") fail("invalid_candidate", `unmerged index entry: ${locator}`);
    indexed.add(locator);
    if (mode === "160000" && oid) links.set(locator, oid);
  }
  if (paths.some((locator) => !indexed.has(locator))) {
    const head = spawnSync("git", ["rev-parse", "--verify", "--quiet", "HEAD"], { cwd: root, env, encoding: "utf8" });
    if (head.status === 0) {
      for (const row of selectedGitRows(root, ["ls-tree", "-z", head.stdout.trim()], paths.filter((locator) => !indexed.has(locator)))) {
        const tab = row.indexOf("\t"); const locator = row.slice(tab + 1);
        if (row.startsWith("160000 commit ") && selected.has(locator) && !indexed.has(locator)) links.set(locator, null);
      }
    } else if (head.status !== 1) fail("invalid_git_fact", "cannot read parent HEAD");
  }
  return links;
}

/** Git fingerprints retain Git's executable bit; Git-free fingerprints retain full file permissions. */
export function computeCandidateContentRef(root: string, paths: string[], kind?: CandidateRef["kind"]): string {
  const entries: [string, number | null, string | null][] = [];
  if (!paths.length || new Set(paths).size !== paths.length) fail("invalid_candidate", "nonempty unique paths required");
  if (kind === undefined) { try { kind = git(root, ["rev-parse", "--is-inside-work-tree"]) === "true" ? "git" : "git_free"; } catch { kind = "git_free"; } }
  if (kind !== "git" && kind !== "git_free") fail("invalid_candidate", "kind must be git or git_free");
  for (const locator of paths) {
    relativePath(locator);
    if (reservedCandidatePath(locator)) fail("invalid_candidate", `lifecycle/private file ${locator}`);
  }
  const links = kind === "git" ? candidateGitlinks(root, paths) : new Map<string, string | null>();
  for (const locator of [...paths].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))) {
    if (links.has(locator)) {
      const oid = links.get(locator);
      entries.push(oid ? [locator, 0o160000, oid] : [locator, null, null]);
      continue;
    }
    const file = contained(root, locator, true);
    if (!fs.existsSync(file)) { entries.push([locator, null, null]); continue; }
    const stat = fs.statSync(file); if (!stat.isFile()) fail("invalid_candidate", `not a file: ${locator}`);
    const mode = kind === "git" ? (stat.mode & 0o100 ? 0o755 : 0o644) : stat.mode & 0o777;
    entries.push([locator, mode, digest(fs.readFileSync(file))]);
  }
  return `sha256:${digest(JSON.stringify(entries))}`;
}
function gitBytes(root: string, args: string[]): Buffer {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_")));
  try { return execFileSync("git", args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] }); } catch { fail("invalid_git_fact", args.join(" ")); }
}
function git(root: string, args: string[]): string { return gitBytes(root, args).toString("utf8").trim(); }
export function verifyCandidate(root: string, value: CandidateRef): void {
  candidate(value);
  if (computeCandidateContentRef(root, value.paths, value.kind) !== value.content_ref) fail("candidate_mismatch", "content bytes/modes changed");
  if (value.kind === "git") {
    if (value.head_ref !== null && git(root, ["rev-parse", "HEAD"]) !== value.head_ref) fail("candidate_mismatch", "HEAD changed");
    if (value.base_ref !== null && git(root, ["rev-parse", "--verify", `${value.base_ref}^{commit}`]) !== value.base_ref) fail("candidate_mismatch", "base must be an exact commit");
  }
}
/** Read-only local delivery verification against the immutable commit tree,
 * independent of current HEAD/worktree. Other profiles require their own producer.
 */
export function verifyHistoricalCommit(root: string, value: unknown): void {
  deliveryFact(value);
  if (value.profile !== "local_commit") fail("unsupported_fact_profile", "historical commit verification requires a local_commit delivery result");
  const fact = value;
  if (git(root, ["cat-file", "-t", fact.commit]) !== "commit" || git(root, ["rev-parse", "--verify", `${fact.commit}^{commit}`]) !== fact.commit) fail("invalid_git_fact", "local outcome must name a full actual commit object OID");
  const entries: [string, number | null, string | null][] = [];
  for (const locator of [...fact.candidate.paths].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))) {
    if (reservedCandidatePath(locator)) fail("invalid_candidate", locator);
    relativePath(locator);
    const rows = gitBytes(root, ["--literal-pathspecs", "ls-tree", "-z", fact.commit, "--", locator]).toString("utf8").split("\0");
    const tree = rows.find((row) => row.slice(row.indexOf("\t") + 1) === locator);
    if (!tree) { entries.push([locator, null, null]); continue; }
    const matched = /^(100644|100755|160000) (blob|commit) ([a-f0-9]+)\t/.exec(tree);
    if (!matched) fail("invalid_git_fact", locator);
    if (matched[1] === "160000" && matched[2] === "commit") { entries.push([locator, 0o160000, matched[3] ?? ""]); continue; }
    if (matched[2] !== "blob" || matched[1] === "160000") fail("invalid_git_fact", locator);
    const bytes = gitBytes(root, ["cat-file", "blob", matched[3] ?? ""]);
    entries.push([locator, matched[1] === "100755" ? 0o755 : 0o644, digest(bytes)]);
  }
  if (`sha256:${digest(JSON.stringify(entries))}` !== fact.candidate.content_ref) fail("candidate_mismatch", "commit tree differs from delivered content");
}
function verifyFact(options: ApplyTaskV2Options, op: ReturnType<typeof parseTaskOperation>, context: TaskArtifactContext): void {
  if (op.operation !== "record_delivery" && op.operation !== "record_publication") return;
  const fact = op.result;
  if (fact.profile === "pull_request") {
    if (!options.verifyFact?.(fact)) fail("fact_verification_required", "original producer must verify actual PR facts");
  } else if (fact.profile === "local_commit") verifyHistoricalCommit(options.root, fact);
  else {
    const artifact = fact.artifact;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(artifact.locator)) { if (!options.verifyFact?.(fact)) fail("fact_verification_required", "external artifact requires original producer verification"); }
    else { const file = contained(options.root, authorityLocator(artifact, context)); if (`sha256:${digest(fs.readFileSync(file))}` !== artifact.revision) fail("candidate_mismatch", "manual artifact content differs"); }
  }
}
/** Read-only selected-Task locator projection; the caller chooses SHA file,
 * fixed Git object, or opaque external authority reads from ref.revision/kind.
 * Does not verify the referenced content or infer a Task from inventory.
 */
export function resolveTaskArtifactLocator(options: TaskStoreOptions, ref: AuthorityRef): string {
  authority(ref);
  const { record } = loadTaskRecordV2(options);
  const taskRoot = path.relative(fs.realpathSync(options.root), path.dirname(recordPath(options))).split(path.sep).join("/");
  return authorityLocator(ref, taskArtifactContext(taskRoot, record));
}
/** External revisions are authored/verified by their original producer; local refs bind actual bytes or immutable Git objects. */
export function verifyAuthority(root: string, ref: AuthorityRef, context?: TaskArtifactContext): void {
  if (context) {
    taskArtifactRoot(context.task_root);
    const selected = loadTaskRecordV2({ root, taskDir: context.task_root }).record;
    if (selected.id !== context.task_id || (selected.artifact_origin ?? null) !== context.artifact_origin) fail("invalid_artifact_context", "context must match the verified selected Task");
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref.locator)) return;
  relativePath(ref.locator);
  if (/^sha256:[a-f0-9]{64}$/.test(ref.revision)) {
    if (`sha256:${digest(fs.readFileSync(contained(root, authorityLocator(ref, context))))}` !== ref.revision) fail("authority_mismatch", ref.locator);
  } else if (/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(ref.revision)) {
    git(root, ["cat-file", "-e", `${ref.revision}:${ref.locator}`]);
  } else fail("invalid_authority_revision", "local authority requires sha256 content or exact Git revision");
}
export function applyTaskOperationToStore(options: ApplyTaskV2Options): OperationOutput {
  const loaded = loadTaskRecordV2(options);
  const selectedRoot = path.relative(fs.realpathSync(options.root), path.dirname(recordPath(options))).split(path.sep).join("/");
  const context = taskArtifactContext(selectedRoot, loaded.record);
  const op = canonicalTaskOperation(parseTaskOperation(options.operation), context);
  const archived = selectedRoot.startsWith(".trellis/tasks/archive/");
  if (archived && op.operation !== "reopen_task") fail("archived_task", "only explicit history query or formal reopen is legal");
  if (loaded.preimage !== options.expected_preimage) fail("stale_preimage", "Task changed before operation");
  const output = applyTaskOperation(loaded.record, op, options.workflow);
  if (op.operation === "reopen_task") verifyAuthority(options.root, op.authority, context);
  if (!output.changed) return output;
  if (op.operation === "accept_scope") verifyAuthority(options.root, op.authority, context);
  else if (op.operation === "create_delivery") verifyAuthority(options.root, op.scope_ref.authority, context);
  else if (op.operation === "record_gate") { verifyAuthority(options.root, op.result.scope_ref.authority, context); verifyAuthority(options.root, op.result.plan_ref, context); }
  else if (op.operation === "rework" && op.scope_ref !== undefined) verifyAuthority(options.root, op.scope_ref.authority, context);
  else if (op.operation === "complete_task") verifyAuthority(options.root, op.result.accepted_scope, context);
  const historical = (op.operation === "record_delivery" || op.operation === "record_publication") && op.historical_success === true;
  if (!historical) {
    if (op.operation === "begin_check" || op.operation === "record_delivery" || op.operation === "record_publication") {
      const delivery = loaded.record.deliveries.find((item) => item.id === op.key.delivery_id);
      if (!delivery?.plan_ref) fail("gate_not_applicable", "accepted Planning required");
      verifyAuthority(options.root, delivery.scope_ref.authority, context);
      verifyAuthority(options.root, delivery.plan_ref, context);
    }
    if (op.operation === "begin_check") verifyCandidate(options.root, op.candidate);
    else if (op.operation === "record_gate" && op.result.candidate !== null) verifyCandidate(options.root, op.result.candidate);
    else if (op.operation === "record_delivery" || op.operation === "record_publication") verifyCandidate(options.root, op.result.candidate);
  }
  verifyFact(options, op, context); assertIdentities(loaded.record, output.record);
  const file = recordPath(options); const mode = fs.statSync(file).mode & 0o777;
  // A last preimage check covers changes during objective producer verification.
  if (fs.readFileSync(file, "utf8") !== loaded.preimage) fail("stale_preimage", "Task changed during verification");
  if (archived) {
    const destination = `.trellis/tasks/${path.basename(selectedRoot)}`;
    reserveIdentityExcept(options, loaded.record.id, path.dirname(file));
    output.record = relocateVerifiedTask(options, destination, output.record);
  } else writeAtomic(file, serializeTaskRecordV2(output.record), mode);
  return output;
}
/** Read-only digest for callers retaining the exact raw preimage separately. */
export function taskPreimageDigest(preimage: string): string { return `sha256:${digest(preimage)}`; }
export { canonicalJson };

export interface RelocateTaskV2Options extends TaskStoreOptions {
  destination: string;
  expected_preimage: string;
  name?: string;
}
/** Task-local directory/artifact move preserving every retained result/candidate.
 * Callers own cross-Task mutable name/parent/children backrefs and session teardown.
 * Archived execution restoration is available only through the closed reopen operation.
 */
export function relocateTaskRecordV2(options: RelocateTaskV2Options): TaskRecordV2 {
  const { record, preimage } = loadTaskRecordV2(options);
  if (preimage !== options.expected_preimage) fail("stale_preimage", "Task changed before relocation");
  const source = path.dirname(recordPath(options));
  const sourceRoot = path.relative(fs.realpathSync(options.root), source).split(path.sep).join("/");
  if (sourceRoot.startsWith(".trellis/tasks/archive/")) fail("archived_task", "formal reopen is required");
  if (options.destination.startsWith(".trellis/tasks/archive/")) {
    if (fs.lstatSync(source).isSymbolicLink()) fail("invalid_locator", "cannot archive a Task-leaf symlink");
    const completions = record.completion_results.filter((r) => r.lifecycle_generation === record.lifecycle_generation && same(r.accepted_scope, record.accepted_scope));
    const closed = record.closure_results.some((r) => r.lifecycle_generation === record.lifecycle_generation && completions.some((c) => c.result_id === r.completion_result_id));
    if (!completions.length || !closed || record.deliveries.some((d) => d.phase !== "delivered" && d.phase !== "stopped")) fail("completion_and_closure_required", "archive cannot manufacture Task completion");
  }
  reserveIdentityExcept(options, record.id, source);
  const next = structuredClone(record);
  if (options.name !== undefined) next.name = options.name;
  return relocateVerifiedTask(options, options.destination, parseTaskRecordV2(next));
}
/** Caller already validated the closed operation; this function owns the move. */
function relocateVerifiedTask(options: TaskStoreOptions & { expected_preimage: string }, destination: string, record: TaskRecordV2): TaskRecordV2 {
  taskArtifactRoot(destination);
  const file = recordPath(options); const source = path.dirname(file);
  const sourceRoot = path.relative(fs.realpathSync(options.root), source).split(path.sep).join("/");
  const target = contained(options.root, destination, true);
  if (fs.existsSync(target)) fail("task_destination_occupied", destination);
  const loaded = loadTaskRecordV2(options);
  if (loaded.preimage !== options.expected_preimage) fail("stale_preimage", "Task changed before relocation");
  const output = parseTaskRecordV2({ ...record, artifact_origin: loaded.record.artifact_origin ?? sourceRoot });
  const manifests = ["implement.jsonl", "check.jsonl", ...loaded.record.deliveries.flatMap((d) => [`${d.planning_root}/implement.jsonl`, `${d.planning_root}/check.jsonl`])];
  const changes: { file: string; previous: string; next: string; mode: number }[] = [];
  for (const manifest of manifests) {
    const manifestFile = contained(options.root, `${sourceRoot}/${manifest}`, true);
    if (!fs.existsSync(manifestFile)) continue;
    const previous = fs.readFileSync(manifestFile, "utf8");
    const next = previous.split(/(?<=\n)/).map((line) => {
      if (!line.trim()) return line;
      let entry: unknown;
      try { entry = JSON.parse(line); } catch { fail("invalid_manifest", manifestFile); }
      if (typeof entry === "object" && entry !== null && "file" in entry && typeof entry.file === "string" && entry.file.startsWith(sourceRoot + "/")) {
        entry.file = destination + entry.file.slice(sourceRoot.length);
        return JSON.stringify(entry) + (line.endsWith("\n") ? "\n" : "");
      }
      return line;
    }).join("");
    if (next !== previous) changes.push({ file: manifestFile, previous, next, mode: fs.statSync(manifestFile).mode & 0o777 });
  }
  const mode = fs.statSync(file).mode & 0o777;
  if (fs.readFileSync(file, "utf8") !== loaded.preimage) fail("stale_preimage", "Task changed during relocation preflight");
  const missingParents: string[] = [];
  let parent = path.dirname(target);
  while (!fs.existsSync(parent)) { missingParents.push(parent); parent = path.dirname(parent); }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    for (const change of changes) writeAtomic(change.file, change.next, change.mode);
    writeAtomic(file, serializeTaskRecordV2(output), mode);
    fs.renameSync(source, target);
  } catch (error) {
    for (const change of changes) writeAtomic(change.file, change.previous, change.mode);
    writeAtomic(file, loaded.preimage, mode);
    for (const directory of missingParents) { if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory); }
    throw error;
  }
  return output;
}

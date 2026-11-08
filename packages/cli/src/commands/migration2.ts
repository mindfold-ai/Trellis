import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import {
  parseTaskRecordV2,
  serializeTaskRecordV2,
  verifyAuthority,
  verifyHistoricalCommit,
  validateWorkflowContract,
  type TaskRecordV2,
} from "@mindfoldhq/trellis-core/task/v2";
import {
  classifyMaintenanceTask,
  validateSelectedTaskProjection,
} from "@mindfoldhq/trellis-core/task/maintenance";
import {
  taskRecordSchema,
  isKnownLegacyTaskRecord,
} from "@mindfoldhq/trellis-core/task/legacy-migration";
import { VERSION } from "../constants/version.js";
import {
  getAllScripts,
  getAllAgents,
  deliveryWorkflowMdTemplate,
  workflowMdTemplate,
} from "../templates/trellis/index.js";
import {
  isBundledWorkflow,
  DELIVERY_WORKFLOW_ID,
} from "../utils/workflow-resolver.js";
import { replacePythonCommandLiterals } from "../configurators/shared.js";
import { projectWorkflowHashes } from "../utils/workflow-hash-contract.js";
import {
  getConfiguredPlatforms,
  collectPlatformTemplates,
} from "../configurators/index.js";
import {
  preserveCodexAgentModelKeys,
  extractCodexAgentModelKeys,
  applyCodexAgentModelKeys,
} from "../configurators/codex.js";
import { readDeliveryWorkflowContract } from "../utils/delivery-workflow.js";
import { computeHash } from "../utils/template-hash.js";
import { writeFileAtomic } from "../utils/atomic-write.js";
import {
  migrationPlan2Schema,
  type MigrationPlan2,
  type RawSnapshot,
} from "./migration2-schema.js";
import { compareVersions } from "../utils/compare-versions.js";
import { assertProjectPath } from "../utils/path-boundary.js";
import type {
  MigrationResult,
  MigrationAction,
  MigrateOptions,
} from "./migrate.js";

export const rawMigrationDigest = (bytes: string | Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");
function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null)
    throw new Error("Missing preflight dependency");
  return value;
}
const json = (bytes: Buffer): unknown =>
  JSON.parse(bytes.toString("utf8")) as unknown;
function decode(value: string): Buffer {
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value)
    throw new Error("Invalid canonical base64 snapshot");
  return bytes;
}
function snapshotBytes(snapshot: RawSnapshot): Buffer {
  const bytes = decode(snapshot.content_base64);
  if (rawMigrationDigest(bytes) !== snapshot.sha256)
    throw new Error("Snapshot raw SHA mismatch");
  return bytes;
}
/** Validate only the reviewed original; live partial targets are not predecessors. */
function validatePredecessor(
  mode: MigrationPlan2["source"]["task_schema"],
  task: MigrationPlan2["tasks"][number],
  source: unknown,
): TaskRecordV2 | undefined {
  const schema = mode === "mixed" ? required(task.source_task_schema) : mode;
  try {
    if (schema === "2.0") {
      if (task.disposition !== "defer")
        throw new Error("Current Task schema selector is only valid for defer");
      return parseTaskRecordV2(source);
    }
    if (schema === "1.0") {
      taskRecordSchema.parse(source); // Retain canonical field-level diagnostics.
      if (classifyMaintenanceTask(source).kind !== "schema1")
        throw new Error("Source Task is not the declared schema1");
    } else if (
      !isKnownLegacyTaskRecord(source) ||
      classifyMaintenanceTask(source).kind !== "legacy"
    )
      throw new Error(
        task.disposition === "defer"
          ? "Deferred record is not the declared legacy schema"
          : "Source Task is not the declared legacy schema",
      );
  } catch (error) {
    if (mode !== "mixed") throw error;
    throw new Error(
      `${task.workspace}:${task.task_ref} (${task.disposition}, source_task_schema=${schema}): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
interface State {
  sha256: string;
  mode: number;
}
interface Prepared {
  root: string;
  name: string;
  full: string;
  facts: MigrationAction;
  source: State | null;
  target: State | null;
  bytes?: Buffer;
  observed: State | null;
}
interface Repository {
  roots: Set<string>;
  common: string | null;
  suffix: string | null;
}
function gitBytes(root: string, ...args: string[]): Buffer {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)),
  );
  env.LC_ALL = "C";
  return execFileSync("git", ["-C", root, ...args], {
    env,
    timeout: 10_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
function git(root: string, ...args: string[]): string {
  return gitBytes(root, ...args)
    .toString("utf8")
    .trimEnd();
}
function repository(cwd: string): Repository {
  let top: string;
  try {
    top = fs.realpathSync(git(cwd, "rev-parse", "--show-toplevel"));
  } catch (error) {
    let parent = cwd;
    while (true) {
      if (fs.lstatSync(path.join(parent, ".git"), { throwIfNoEntry: false }))
        throw error;
      const next = path.dirname(parent);
      if (next === parent) break;
      parent = next;
    }
    const stderr =
      typeof error === "object" && error !== null && "stderr" in error
        ? String(error.stderr)
        : "";
    if (!stderr.includes("not a git repository")) throw error;
    return { roots: new Set([cwd]), common: null, suffix: null };
  }
  const common = fs.realpathSync(
    path.resolve(cwd, git(cwd, "rev-parse", "--git-common-dir")),
  );
  const roots = new Set<string>();
  // -z terminates each field with NUL and separates complete records with
  // another NUL. Only explicitly prunable siblings with no lexical .git entry
  // are retired registrations. Extant/corrupt/foreign entries remain subject
  // to the complete inventory and repository-identity checks below.
  for (const record of git(cwd, "worktree", "list", "--porcelain", "-z").split(
    "\0\0",
  )) {
    const fields = record.split("\0");
    const first = fields[0];
    if (!first?.startsWith("worktree ")) continue;
    const worktree = path.resolve(first.slice(9));
    const prunable = fields
      .slice(1)
      .some((field) => field === "prunable" || field.startsWith("prunable "));
    if (
      worktree !== top &&
      prunable &&
      !fs.lstatSync(path.join(worktree, ".git"), { throwIfNoEntry: false })
    )
      continue;
    roots.add(fs.realpathSync(worktree));
  }
  const suffix = path.relative(top, cwd) || null;
  return { roots, common, suffix };
}
/** Symlink refusal at every existing component, including dangling links. */
function contained(root: string, relative: string, project = true): string {
  if (
    path.isAbsolute(relative) ||
    relative.includes("\\") ||
    relative.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new Error(`Invalid migration target ${relative}`);
  let full = root,
    allowedRoot = root;
  const parts = relative.split("/");
  for (const [index, part] of parts.entries()) {
    full = path.join(full, part);
    const stat = fs.lstatSync(full, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) {
      const ownedRoot =
        project &&
        parts[0] === ".trellis" &&
        (index === 0 ||
          (parts[1] === "tasks" &&
            (index === 1 || (index === 2 && part !== "archive"))));
      if (!ownedRoot || !fs.statSync(full).isDirectory())
        throw new Error(`Symlink migration target ${full}`);
      allowedRoot = full;
    }
  }
  if (project) assertProjectPath(full, allowedRoot);
  return full;
}
function liveState(full: string): State | null {
  const stat = fs.lstatSync(full, { throwIfNoEntry: false });
  if (!stat) return null;
  if (!stat.isFile()) throw new Error(`Non-file migration target ${full}`);
  return {
    sha256: rawMigrationDigest(fs.readFileSync(full)),
    mode: stat.mode & 0o777,
  };
}
/** Prospective collector: no installed-runtime preflight, download or writes. */
export function collectMigration2Templates(
  root: string,
  reviewedSources?: ReadonlyMap<string, RawSnapshot | null>,
): Map<string, string> {
  const files = new Map<string, string>();
  for (const [name, content] of getAllScripts())
    files.set(`.trellis/scripts/${name}`, content);
  for (const [name, content] of getAllAgents())
    files.set(`.trellis/agents/${name}`, content);
  files.set(
    ".trellis/delivery-contract.md",
    fs.readFileSync(
      fileURLToPath(
        new URL("../templates/trellis/delivery-contract.md", import.meta.url),
      ),
      "utf8",
    ),
  );
  for (const platform of getConfiguredPlatforms(root))
    for (const [name, content] of collectPlatformTemplates(platform) ?? [])
      files.set(name, content);
  if (reviewedSources === undefined) preserveCodexAgentModelKeys(root, files);
  else
    for (const [name, content] of files) {
      if (!/^\.codex\/agents\/trellis-[^/]+\.toml$/.test(name)) continue;
      if (!reviewedSources.has(name))
        throw new Error(`Missing reviewed Codex source ${name}`);
      const source = reviewedSources.get(name);
      files.set(
        name,
        applyCodexAgentModelKeys(
          content,
          extractCodexAgentModelKeys(
            source ? snapshotBytes(source).toString("utf8") : "",
          ),
        ),
      );
    }
  return files;
}
export function migration2TemplateCandidate(files: Map<string, string>): {
  candidate_sha256: string;
  files: { path: string; sha256: string; mode: number }[];
} {
  const entries = [...files]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, content]) => ({
      path: name,
      sha256: rawMigrationDigest(content),
      mode: /\.(py|sh)$/.test(name) ? 0o755 : 0o644,
    }));
  return {
    candidate_sha256: rawMigrationDigest(JSON.stringify(entries)),
    files: entries,
  };
}
function inventoryTasks(root: string): string[] {
  const result: string[] = [];
  function scan(ref: string, depth: number): void {
    const directory = contained(root, ref);
    if (!fs.existsSync(directory)) return;
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const child = `${ref}/${item.name}`;
      if (ref === ".trellis/tasks" && item.name === "archive") continue;
      if (item.isSymbolicLink()) {
        if (
          ref !== ".trellis/tasks" ||
          item.name === "archive" ||
          !fs.statSync(contained(root, child)).isDirectory()
        )
          throw new Error(`Symlink task inventory ${child}`);
      } else if (!item.isDirectory()) continue;
      if (depth === 0 || fs.existsSync(contained(root, `${child}/task.json`)))
        result.push(child);
      else if (depth > 0) scan(child, depth - 1);
    }
  }
  scan(".trellis/tasks", 0);
  scan(".trellis/tasks/archive", 1);
  return result.filter((ref) => ref !== ".trellis/tasks/archive").sort();
}
function inventoryArtifacts(root: string, ref: string): string[] {
  const result: string[] = [];
  function scan(relative: string): void {
    for (const item of fs.readdirSync(contained(root, relative), {
      withFileTypes: true,
    })) {
      const child = `${relative}/${item.name}`;
      if (item.isSymbolicLink())
        throw new Error(`Symlink task artifact ${child}`);
      if (item.isDirectory()) scan(child);
      else if (item.isFile()) result.push(child);
      else throw new Error(`Unsupported task artifact ${child}`);
    }
  }
  scan(ref);
  return result;
}
function sessionRecord(
  value: unknown,
  version: 2 | 3,
): {
  schema_version: number;
  task_id: string;
  lifecycle_generation: number;
  delivery_id?: string | null;
} {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid session record");
  const bag = value as Record<string, unknown>;
  const keys = [
    "schema_version",
    "task_id",
    "lifecycle_generation",
    ...(version === 3 ? ["delivery_id"] : []),
  ];
  if (
    Object.keys(bag).length !== keys.length ||
    keys.some((key) => !(key in bag)) ||
    bag.schema_version !== version ||
    typeof bag.task_id !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(bag.task_id) ||
    !Number.isSafeInteger(bag.lifecycle_generation) ||
    (bag.lifecycle_generation as number) < 0
  )
    throw new Error("Invalid session fields");
  if (
    version === 3 &&
    bag.delivery_id !== null &&
    (typeof bag.delivery_id !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        bag.delivery_id,
      ))
  )
    throw new Error("Invalid session Delivery selection");
  return bag as ReturnType<typeof sessionRecord>;
}

/** Private plan execution; semantic attribution remains the original owner. */
export async function migrate2(
  options: MigrateOptions,
  input: unknown,
): Promise<MigrationResult> {
  const plan = migrationPlan2Schema.parse(input);
  if (options.from !== plan.source.version || plan.target.version !== VERSION)
    throw new Error("Migration source/target version mismatch");
  if (
    !/^(?:0\.6\.(?:0|[1-9]\d*)|0\.7\.0-castbox\.[1-9]\d*)$/.test(
      plan.source.version,
    ) ||
    compareVersions(plan.source.version, VERSION) > 0
  )
    throw new Error("Unsupported migration source version");
  const cwd = fs.realpathSync(process.cwd());
  const repo = repository(cwd);
  const roots = new Map<string, string>();
  for (const workspace of plan.workspaces) {
    if (roots.has(workspace.id) || !path.isAbsolute(workspace.root))
      throw new Error("Duplicate or non-absolute workspace");
    const root = fs.realpathSync(workspace.root);
    if ([...roots.values()].includes(root))
      throw new Error("Duplicate canonical workspace");
    if (workspace.project_relative !== repo.suffix)
      throw new Error("Monorepo suffix mismatch");
    const top = workspace.project_relative
      ? path.resolve(
          root,
          ...workspace.project_relative.split("/").map(() => ".."),
        )
      : root;
    if (
      !repo.roots.has(top) ||
      path.resolve(top, workspace.project_relative ?? "") !== root
    )
      throw new Error(`Unregistered workspace ${root}`);
    if (
      repo.common &&
      fs.realpathSync(
        path.resolve(root, git(root, "rev-parse", "--git-common-dir")),
      ) !== repo.common
    )
      throw new Error("Repository identity mismatch");
    if (!fs.statSync(contained(root, ".trellis")).isDirectory())
      throw new Error("Missing Trellis workspace");
    roots.set(workspace.id, root);
  }
  if (![...roots.values()].includes(cwd))
    throw new Error("Invocation workspace omitted");
  const liveRoots = [...repo.roots]
    .map((top) => path.resolve(top, repo.suffix ?? ""))
    .filter((root) => fs.existsSync(path.join(root, ".trellis")))
    .sort();
  if (!isDeepStrictEqual([...roots.values()].sort(), liveRoots))
    throw new Error("Incomplete registered workspace inventory");
  const rootOf = (id: string): string => {
    const root = roots.get(id);
    if (!root) throw new Error(`Unknown workspace ${id}`);
    return root;
  };
  const pending: Prepared[] = [];
  const byFull = new Map<string, Prepared>();
  const conflicts: string[] = [];
  function prepare(
    root: string,
    name: string,
    action: MigrationAction["action"],
    source: RawSnapshot | null,
    bytes?: Buffer,
    mode?: number,
  ): Prepared {
    const full = contained(root, name, root !== repo.common);
    if (byFull.has(full)) throw new Error(`Duplicate write target ${full}`);
    if (source) snapshotBytes(source);
    const before = source ? { sha256: source.sha256, mode: source.mode } : null;
    const after =
      action === "preserve"
        ? before
        : action === "remove"
          ? null
          : bytes && mode !== undefined
            ? { sha256: rawMigrationDigest(bytes), mode }
            : undefined;
    if (after === undefined)
      throw new Error(`Missing reviewed target bytes/mode ${full}`);
    const live = liveState(full);
    if (
      !isDeepStrictEqual(live, before) &&
      (action === "preserve" || !isDeepStrictEqual(live, after))
    )
      conflicts.push(`third_state: ${full}`);
    const facts = {
      path: full,
      action,
      before_sha256: before?.sha256 ?? null,
      after_sha256: after?.sha256 ?? null,
      before_mode: before?.mode ?? null,
      after_mode: after?.mode ?? null,
    };
    const item = {
      root,
      name,
      full,
      facts,
      source: before,
      target: after,
      bytes,
      observed: live,
    };
    pending.push(item);
    byFull.set(full, item);
    return item;
  }
  const projected = new Map<
    string,
    { record: TaskRecordV2; active: boolean; workspace: string }
  >();
  const refs = new Map<string, Set<string>>();
  interface SourceIdentity {
    id: string;
    generation: unknown;
    provenance: unknown;
    active: boolean;
    disposition: string;
    workspace: string;
    source_task_schema?: MigrationPlan2["tasks"][number]["source_task_schema"];
    record?: TaskRecordV2;
  }
  const identities = new Map<string, SourceIdentity[]>();
  const taskDirectories = new Map<string, string>();
  const unknownArchiveNames = new Set<string>();
  for (const task of plan.tasks) {
    const root = rootOf(task.workspace);
    const taskPath = contained(root, task.task_ref);
    const directory = fs.realpathSync(taskPath);
    if ([...taskDirectories.values()].includes(directory))
      throw new Error("Duplicate canonical Task directory");
    taskDirectories.set(taskPath, directory);
    const archived =
      /^\.trellis\/tasks\/archive\/[0-9]{4}-(?:0[1-9]|1[0-2])\/[^/]+$/.test(
        task.task_ref,
      );
    const active = /^\.trellis\/tasks\/(?!archive$)[^/]+$/.test(task.task_ref);
    const historyPath = /^\.trellis\/tasks\/archive\/[^/]+(?:\/[^/]+)?$/.test(
      task.task_ref,
    );
    if (
      !archived &&
      !active &&
      !(task.disposition === "history_only" && historyPath)
    )
      throw new Error(`Invalid Task root ${task.task_ref}`);
    if (
      ((task.disposition === "convert_active" ||
        task.disposition === "defer") &&
        !active) ||
      (task.disposition === "convert_archive" && !archived) ||
      (task.disposition === "history_only" &&
        !historyPath &&
        !(active && task.source === null))
    )
      throw new Error("Task disposition location mismatch");
    const selected = refs.get(task.workspace) ?? new Set<string>();
    if (selected.has(task.task_ref))
      throw new Error("Duplicate Task disposition");
    selected.add(task.task_ref);
    refs.set(task.workspace, selected);
    let source: unknown;
    if (task.source === null && task.disposition !== "history_only")
      throw new Error("Only history-only roots can lack a Task record");
    try {
      if (task.source !== null) source = json(snapshotBytes(task.source));
    } catch (error) {
      if (task.disposition !== "history_only") throw error;
    }
    const header =
      source !== null && typeof source === "object" && !Array.isArray(source)
        ? (source as Record<string, unknown>)
        : null;
    const validId =
      header &&
      typeof header.id === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(header.id)
        ? header.id
        : null;
    let sourceIdentity: SourceIdentity | undefined;
    if (!validId && task.disposition !== "history_only")
      throw new Error("Invalid source Task identity");
    if (validId) {
      const identity = validId.toLowerCase();
      const members = identities.get(identity) ?? [];
      sourceIdentity = {
        id: validId,
        generation: isKnownLegacyTaskRecord(source)
          ? 0
          : header?.lifecycle_generation,
        provenance: header?.source,
        active,
        disposition: task.disposition,
        workspace: task.workspace,
        source_task_schema: task.source_task_schema,
      };
      members.push(sourceIdentity);
      identities.set(identity, members);
    } else {
      const visible = path.posix.basename(task.task_ref);
      unknownArchiveNames.add(visible.toLowerCase());
      unknownArchiveNames.add(visible.replace(/^\d+-\d+-/, "").toLowerCase());
    }
    const converted =
      task.disposition === "convert_active" ||
      task.disposition === "convert_archive";
    if (converted || task.disposition === "current") {
      const sourceSnapshot = required(task.source);
      if (converted) validatePredecessor(plan.source.task_schema, task, source);
      const record = converted
        ? validateSelectedTaskProjection(
            source,
            task.record,
            (task.legacy_facts ?? []).map((fact) =>
              fact.disposition === "result"
                ? { ...fact, disposition: "delivery_result" as const }
                : fact,
            ),
          )
        : parseTaskRecordV2(source);
      if (sourceIdentity) sourceIdentity.record = record;
      if (!converted && task.record !== undefined)
        throw new Error("Current Task must preserve raw bytes");
      const key = `${record.id}/${record.lifecycle_generation}`;
      if (projected.has(key)) throw new Error(`Ambiguous Task identity ${key}`);
      projected.set(key, { record, active, workspace: task.workspace });
      prepare(
        root,
        `${task.task_ref}/task.json`,
        converted ? "write" : "preserve",
        sourceSnapshot,
        converted ? Buffer.from(serializeTaskRecordV2(record)) : undefined,
        sourceSnapshot.mode,
      );
      if (converted)
        prepare(
          root,
          `${task.task_ref}/migration/source-task.json`,
          "write",
          null,
          snapshotBytes(sourceSnapshot),
          sourceSnapshot.mode,
        );
    } else {
      if (task.record !== undefined)
        throw new Error(
          "Deferred/history Task cannot project execution authority",
        );
      if (task.disposition === "defer") {
        const deferredRecord = validatePredecessor(
          plan.source.task_schema,
          task,
          source,
        );
        if (task.source_task_schema === "2.0" && sourceIdentity)
          sourceIdentity.record = required(deferredRecord);
      }
      prepare(root, `${task.task_ref}/task.json`, "preserve", task.source);
    }
  }
  for (const [id, root] of roots) {
    if (
      !isDeepStrictEqual(inventoryTasks(root), [...(refs.get(id) ?? [])].sort())
    )
      throw new Error(`Incomplete active/archive Task inventory ${id}`);
  }
  for (const identity of identities.keys())
    if (unknownArchiveNames.has(identity))
      throw new Error(`Historical visible-name occupation ${identity}`);

  // Group frozen originals, never live migrated targets: replay must use the
  // same source identity and provenance even after an ordinary partial write.
  const duplicateKeys = new Set<string>();
  for (const members of identities.values()) {
    const currentPeers = members.filter(
      (member) =>
        member.disposition === "defer" && member.source_task_schema === "2.0",
    );
    // Even a lone current-schema peer requires a selected authority.
    if (members.length === 1 && currentPeers.length === 0) continue;
    const first = required(members[0]);
    const authorities = members.filter(
      (member) =>
        member.active &&
        ["convert_active", "current"].includes(member.disposition),
    );
    if (
      !Number.isSafeInteger(first.generation) ||
      Number(first.generation) < 0 ||
      authorities.length !== 1 ||
      new Set(members.map((member) => member.workspace)).size !==
        members.length ||
      members.some(
        (member) =>
          member.id !== first.id ||
          member.generation !== first.generation ||
          !isDeepStrictEqual(member.provenance, first.provenance) ||
          !member.active ||
          !["convert_active", "current", "defer"].includes(member.disposition),
      )
    )
      throw new Error(`Task identity collision ${first.id}`);
    duplicateKeys.add(`${first.id}/${String(first.generation)}`);
    if (currentPeers.length) {
      const authority = required(
        projected.get(`${first.id}/${String(first.generation)}`),
      );
      if (
        currentPeers.some(
          (peer) =>
            !peer.record || !isDeepStrictEqual(authority.record, peer.record),
        )
      )
        throw new Error(`Current-schema Task peer record mismatch ${first.id}`);
    }
  }

  const bindings = new Map<string, { branch: string; workspace: string }>();
  function extensionMarker(root: string): boolean {
    const full = contained(root, ".trellis/guru-team/extension.json");
    return fs.statSync(full, { throwIfNoEntry: false })?.isFile() ?? false;
  }
  const markers = repo.common
    ? new Map([...roots.values()].map((root) => [root, extensionMarker(root)]))
    : new Map<string, boolean>();
  function boundWorkspace(branch: string): string {
    const matches = [...roots].filter(
      ([, root]) => git(root, "branch", "--show-current").trim() === branch,
    );
    if (matches.length !== 1)
      throw new Error("current_task_checkout_unresolved");
    return required(matches[0])[0];
  }
  for (const entry of plan.branch_bindings ?? []) {
    if (!repo.common)
      throw new Error("Git-free migration cannot use branch bindings");
    const key = `${entry.task_id}/${entry.lifecycle_generation}`;
    const task = projected.get(key);
    if (!task?.active)
      throw new Error(`Unknown active binding identity ${key}`);
    if (bindings.has(key)) throw new Error(`Duplicate branch binding ${key}`);
    const value = json(snapshotBytes(entry.source));
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new Error(`invalid_task_branch_binding: ${key}`);
    const binding = value as Record<string, unknown>;
    if (
      !isDeepStrictEqual(
        Object.keys(binding).sort(),
        [
          "schema_version",
          "task_id",
          "lifecycle_generation",
          "binding_revision",
          "branch_name",
        ].sort(),
      ) ||
      binding.schema_version !== "1.0" ||
      binding.task_id !== entry.task_id ||
      binding.lifecycle_generation !== entry.lifecycle_generation ||
      !Number.isSafeInteger(binding.binding_revision) ||
      Number(binding.binding_revision) < 0 ||
      typeof binding.branch_name !== "string" ||
      binding.branch_name.length === 0
    )
      throw new Error(`invalid_task_branch_binding: ${key}`);
    const workspace = boundWorkspace(binding.branch_name);
    if (workspace !== task.workspace)
      throw new Error(
        `Branch binding selects a different Task authority ${key}`,
      );
    const name = `trellis/task-branches/${entry.task_id}/${entry.lifecycle_generation}.json`;
    prepare(repo.common, name, "preserve", entry.source);
    bindings.set(key, { branch: binding.branch_name, workspace });
  }
  const absentBindings: string[] = [];
  for (const [key, task] of projected) {
    if (!task.active || !repo.common) continue;
    const name = `trellis/task-branches/${task.record.id}/${task.record.lifecycle_generation}.json`;
    const full = contained(repo.common, name, false);
    if (bindings.has(key)) continue;
    if (fs.lstatSync(full, { throwIfNoEntry: false }) || duplicateKeys.has(key))
      throw new Error(`Missing reviewed branch binding ${key}`);
    if ([...markers.values()].some(Boolean))
      throw new Error(`binding_required: ${key}`);
    absentBindings.push(full);
  }
  const contracts = new Map<
    string,
    ReturnType<typeof validateWorkflowContract>
  >();
  for (const entry of plan.workflows) {
    rootOf(entry.workspace);
    if (contracts.has(entry.workspace))
      throw new Error("Duplicate workflow contract");
    contracts.set(entry.workspace, validateWorkflowContract(entry.contract));
  }
  if (contracts.size !== roots.size)
    throw new Error("Each workspace needs its prospective workflow contract");
  for (const { record, active, workspace } of projected.values()) {
    if (!active) continue;
    const contract = required(contracts.get(workspace));
    if (
      record.deliveries.some(
        (d) =>
          !["delivered", "stopped"].includes(d.phase) &&
          !contract.profiles.includes(d.profile),
      )
    )
      throw new Error("Unsupported projected Delivery profile");
  }
  const templates = new Map<string, Map<string, string>>();
  for (const entry of plan.templates) {
    if (templates.has(entry.workspace))
      throw new Error("Duplicate template candidate");
    const files = collectMigration2Templates(
      rootOf(entry.workspace),
      new Map(
        plan.files
          .filter((file) => file.target.workspace === entry.workspace)
          .map((file) => [file.target.path, file.source]),
      ),
    );
    if (
      !isDeepStrictEqual(migration2TemplateCandidate(files), {
        candidate_sha256: entry.candidate_sha256,
        files: entry.files,
      })
    )
      throw new Error("Frozen template candidate mismatch");
    templates.set(entry.workspace, files);
  }
  if (templates.size !== roots.size)
    throw new Error("Each workspace needs a frozen template candidate");
  function frozenHashes(snapshot: RawSnapshot | null): Record<string, string> {
    if (snapshot === null) return {};
    const value = json(snapshotBytes(snapshot));
    if (
      value === null ||
      typeof value !== "object" ||
      !("__version" in value) ||
      value.__version !== 2 ||
      !("hashes" in value) ||
      value.hashes === null ||
      typeof value.hashes !== "object" ||
      Array.isArray(value.hashes) ||
      Object.keys(value).length !== 2
    )
      throw new Error("Invalid frozen source receipt");
    const hashes: Record<string, string> = {};
    for (const [name, hash] of Object.entries(value.hashes)) {
      if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))
        throw new Error("Invalid frozen receipt hash");
      Object.assign(hashes, { [name.replace(/\\/g, "/")]: hash });
    }
    return hashes;
  }
  const retiredPlatformPaths = new Set([
    ".agents/skills/trellis-meta/references/local-architecture/workspace-memory.md",
    ".claude/skills/trellis-meta/references/local-architecture/workspace-memory.md",
    ".cursor/skills/trellis-meta/references/local-architecture/workspace-memory.md",
  ]);
  const ownsRetired = (name: string): boolean =>
    name.startsWith(".trellis/scripts/") ||
    name.startsWith(".trellis/agents/") ||
    retiredPlatformPaths.has(name);
  for (const file of plan.files) {
    const root = rootOf(file.target.workspace),
      name = file.target.path;
    const bytes =
      file.target_content_base64 === undefined
        ? undefined
        : decode(file.target_content_base64);
    if (
      file.action !== "write" &&
      (bytes !== undefined || file.target_mode !== undefined)
    )
      throw new Error("Preserve/remove cannot contain target content");
    if (file.owner === "preserve" && file.action !== "preserve")
      throw new Error("Preserve ownership grants no write authority");
    if (file.owner === "template") {
      const expected = required(templates.get(file.target.workspace)).get(name);
      if (file.action === "remove") {
        const installation = plan.installations.find(
          (item) => item.workspace === file.target.workspace,
        );
        const receipt = frozenHashes(required(installation).receipt_source);
        if (
          expected !== undefined ||
          !ownsRetired(name) ||
          !file.source ||
          computeHash(snapshotBytes(file.source).toString("utf8")) !==
            receipt[name]
        )
          throw new Error(`No receipt-owned retirement authority ${name}`);
      } else if (
        expected === undefined ||
        file.action !== "write" ||
        !bytes?.equals(Buffer.from(expected)) ||
        file.target_mode !== (/\.(py|sh)$/.test(name) ? 0o755 : 0o644)
      )
        throw new Error(`Unowned or mismatched template ${name}`);
    } else if (file.owner === "workflow") {
      if (name !== ".trellis/workflow.md" || file.action === "remove")
        throw new Error("Invalid workflow ownership");
      const content =
        file.action === "write"
          ? bytes
          : file.source && snapshotBytes(file.source);
      if (
        !content ||
        !isDeepStrictEqual(
          readDeliveryWorkflowContract(content.toString("utf8")),
          contracts.get(file.target.workspace),
        )
      )
        throw new Error(
          "Prospective workflow declaration mismatch; owner must supply compatible content",
        );
      const templateId = required(
        plan.workflows.find(
          (entry) => entry.workspace === file.target.workspace,
        ),
      ).template_id;
      if (isBundledWorkflow(templateId)) {
        const bundled =
          templateId === DELIVERY_WORKFLOW_ID
            ? deliveryWorkflowMdTemplate
            : workflowMdTemplate;
        if (!content.equals(Buffer.from(replacePythonCommandLiterals(bundled))))
          throw new Error("Bundled workflow identity/content mismatch");
      }
      // Explicit caller choice, never fallback replacement of custom content.
    } else if (file.owner === "artifact") {
      const task = plan.tasks.find(
        (t) =>
          t.workspace === file.target.workspace &&
          name.startsWith(`${t.task_ref}/`),
      );
      if (
        !task ||
        !["convert_active", "convert_archive", "current"].includes(
          task.disposition,
        ) ||
        name === `${task.task_ref}/task.json` ||
        !/^((deliveries\/[a-f0-9-]{36}\/)|(migration\/))/.test(
          name.slice(task.task_ref.length + 1),
        )
      )
        throw new Error(`Unowned Task artifact ${name}`);
      if (file.action === "remove")
        throw new Error("Migration preserves Task artifacts");
      if (name.startsWith(`${task.task_ref}/deliveries/`)) {
        const record = projected.get(
          `${(json(snapshotBytes(required(task.source))) as { id: string }).id}/${(task.record as TaskRecordV2 | undefined)?.lifecycle_generation ?? (json(snapshotBytes(required(task.source))) as { lifecycle_generation?: number }).lifecycle_generation ?? 0}`,
        )?.record;
        if (
          !record?.deliveries.some((delivery) =>
            name.startsWith(`${task.task_ref}/${delivery.planning_root}/`),
          )
        )
          throw new Error("Artifact belongs to no reviewed Delivery");
      }
    }
    if (
      name === ".trellis/.version" ||
      name === ".trellis/.template-hashes.json" ||
      /\/task\.json$/.test(name)
    )
      throw new Error(
        "Fixed installation/Task target cannot be a file decision",
      );
    prepare(root, name, file.action, file.source, bytes, file.target_mode);
  }
  // Root planning and evidence files require exact reviewed preimages too.
  for (const task of plan.tasks)
    for (const name of inventoryArtifacts(
      rootOf(task.workspace),
      task.task_ref,
    )) {
      const root = rootOf(task.workspace),
        full = contained(root, name);
      if (byFull.has(full)) continue;
      throw new Error(`Missing reviewed Task artifact disposition ${name}`);
    }
  for (const [id, root] of roots) {
    for (const [name, content] of required(templates.get(id))) {
      const item = byFull.get(contained(root, name));
      if (!item) throw new Error(`Missing template decision ${id}:${name}`);
      if (
        item.target?.sha256 !== rawMigrationDigest(content) ||
        item.target.mode !== (/\.(py|sh)$/.test(name) ? 0o755 : 0o644)
      )
        throw new Error(`Prospective template/runtime mismatch ${id}:${name}`);
    }
    if (
      !plan.files.some(
        (file) =>
          file.target.workspace === id &&
          file.target.path === ".trellis/workflow.md" &&
          file.owner === "workflow",
      )
    )
      throw new Error(`Missing workflow decision ${id}`);
  }
  const reviewedSessions = new Set<string>();
  for (const session of plan.sessions) {
    const root =
      session.target.kind === "common_session"
        ? repo.common
        : rootOf(session.target.workspace);
    if (
      !root ||
      (session.target.kind === "local_session" &&
        repo.common &&
        session.record !== undefined)
    )
      throw new Error("Session root does not match repository topology");
    const name =
      session.target.kind === "common_session"
        ? `trellis/sessions/${session.target.filename}`
        : `.trellis/.runtime/sessions/${session.target.filename}`;
    reviewedSessions.add(contained(root, name, root !== repo.common));
    const source = json(snapshotBytes(session.source));
    if (session.record === undefined)
      prepare(root, name, "preserve", session.source);
    else {
      const old = sessionRecord(source, 2),
        record = sessionRecord(session.record, 3);
      if (
        old.task_id !== record.task_id ||
        old.lifecycle_generation !== record.lifecycle_generation
      )
        throw new Error("Session Task identity/generation changed");
      const task = projected.get(
        `${record.task_id}/${record.lifecycle_generation}`,
      );
      if (!task?.active)
        throw new Error(
          "Session selected Task is deferred, archived or ambiguous",
        );
      if (record.delivery_id !== null) {
        const delivery = task.record.deliveries.find(
          (d) =>
            d.id === record.delivery_id &&
            d.lifecycle_generation === record.lifecycle_generation &&
            !["delivered", "stopped"].includes(d.phase),
        );
        if (!delivery)
          throw new Error(
            "Session selection is not an eligible current Delivery",
          );
      }
      prepare(
        root,
        name,
        "write",
        session.source,
        Buffer.from(JSON.stringify(record, null, 2) + "\n"),
        session.source.mode,
      );
    }
  }
  const sessionRoots = [
    ...(repo.common ? [[repo.common, "trellis/sessions"]] : []),
    ...[...roots.values()].map((root) => [root, ".trellis/.runtime/sessions"]),
  ];
  for (const [root, ref] of sessionRoots) {
    const directory = contained(root, ref, root !== repo.common);
    if (!fs.existsSync(directory)) continue;
    for (const item of fs.readdirSync(directory, { withFileTypes: true }))
      if (item.name.endsWith(".json")) {
        const full = contained(
          root,
          `${ref}/${item.name}`,
          root !== repo.common,
        );
        if (!item.isFile()) throw new Error("Invalid session inventory entry");
        if (!reviewedSessions.has(full))
          throw new Error(`missing_session_disposition: ${full}`);
      }
  }
  function verifyReason(
    root: string,
    ref: { locator: string; revision: string },
  ): void {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref.locator)) return;
    if (/^sha256:[a-f0-9]{64}$/.test(ref.revision)) {
      const item = byFull.get(contained(root, ref.locator));
      if (!item || `sha256:${item.target?.sha256}` !== ref.revision)
        throw new Error(`Unfrozen/mismatched migration reason ${ref.locator}`);
    } else if (/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(ref.revision))
      verifyAuthority(root, ref);
    else throw new Error(`Invalid migration reason revision ${ref.locator}`);
  }
  function verifyRefs(root: string, record: TaskRecordV2): void {
    const refs = [record.accepted_scope];
    for (const delivery of record.deliveries) {
      refs.push(delivery.scope_ref.authority, delivery.plan_ref);
      for (const gate of Object.values(delivery.results))
        if (gate)
          refs.push(
            gate.scope_ref.authority,
            gate.plan_ref,
            ...gate.obligations,
            ...gate.evidence,
          );
      const publication = delivery.publication_result;
      if (publication)
        refs.push(publication.publication_ref, ...publication.evidence);
      const outcome = delivery.delivery_result;
      if (outcome) {
        refs.push(...outcome.evidence);
        if (outcome.profile === "manual") refs.push(outcome.artifact);
      }
      const stop = delivery.stop_result;
      if (stop) refs.push(stop.reason, stop.scope_decision, ...stop.evidence);
    }
    for (const completion of record.completion_results)
      refs.push(completion.accepted_scope, ...completion.evidence);
    for (const closure of record.closure_results)
      refs.push(closure.source_result, ...closure.evidence);
    for (const ref of refs) if (ref) verifyReason(root, ref);
  }
  for (const task of plan.tasks) {
    if (!["convert_active", "convert_archive"].includes(task.disposition)) {
      if (task.legacy_facts?.length)
        throw new Error("Only converted Task needs legacy fact attribution");
      continue;
    }
    const record = parseTaskRecordV2(task.record);
    for (const delivery of record.deliveries)
      for (const artifact of [
        "prd.md",
        "design.md",
        "implement.md",
        "implement.jsonl",
        "check.jsonl",
      ]) {
        const locator = `${task.task_ref}/${delivery.planning_root}/${artifact}`;
        if (!byFull.get(contained(rootOf(task.workspace), locator))?.target)
          throw new Error(
            `Missing reviewed Delivery planning artifact ${locator}`,
          );
      }
    verifyRefs(rootOf(task.workspace), record);
    const root = rootOf(task.workspace);
    for (const delivery of record.deliveries) {
      if (delivery.delivery_result?.profile === "local_commit")
        verifyHistoricalCommit(root, delivery.delivery_result);
      if (
        delivery.lifecycle_generation !== record.lifecycle_generation ||
        ["delivered", "stopped"].includes(delivery.phase) ||
        !delivery.candidate
      )
        continue;
      const candidate = delivery.candidate;
      const entries = [...candidate.paths]
        .sort((left, right) =>
          Buffer.compare(Buffer.from(left), Buffer.from(right)),
        )
        .map((locator) => {
          if (
            locator === ".git" ||
            locator.startsWith(".git/") ||
            /(?:^|\/)trellis\/sessions(?:\/|$)/.test(locator) ||
            /^\.trellis\/(?:sessions|\.runtime|\.internal|\.delivery-results)(?:\/|$)/.test(
              locator,
            ) ||
            /^\.trellis\/tasks\/(?:archive\/[^/]+\/)?[^/]+\/task\.json$/.test(
              locator,
            )
          )
            throw new Error(
              "Migration candidate contains lifecycle/private state",
            );
          const item = byFull.get(contained(root, locator));
          if (!item)
            throw new Error(`Unfrozen active candidate path ${locator}`);
          if (!item.target) return [locator, null, null];
          const mode =
            candidate.kind === "git"
              ? item.target.mode & 0o100
                ? 0o755
                : 0o644
              : item.target.mode;
          return [locator, mode, item.target.sha256];
        });
      if (
        `sha256:${rawMigrationDigest(JSON.stringify(entries))}` !==
        candidate.content_ref
      )
        throw new Error("Prospective candidate bytes/modes mismatch");
      if (candidate.kind === "git") {
        if (
          candidate.head_ref !== null &&
          git(root, "rev-parse", "HEAD") !== candidate.head_ref
        )
          throw new Error("Active candidate HEAD mismatch");
        if (
          candidate.base_ref !== null &&
          git(
            root,
            "rev-parse",
            "--verify",
            `${candidate.base_ref}^{commit}`,
          ) !== candidate.base_ref
        )
          throw new Error("Active candidate base mismatch");
      }
    }

    for (const fact of task.legacy_facts ?? [])
      verifyReason(rootOf(task.workspace), fact.reason);
  }
  const installationIds = new Set<string>();
  for (const installation of plan.installations) {
    const root = rootOf(installation.workspace);
    if (installationIds.has(installation.workspace))
      throw new Error("Duplicate installation");
    installationIds.add(installation.workspace);
    if (
      snapshotBytes(installation.version_source).toString("utf8").trim() !==
      plan.source.version
    )
      throw new Error("Source installation version mismatch");
    let hashes = frozenHashes(installation.receipt_source);
    for (const name of Object.keys(hashes))
      if (
        ownsRetired(name) &&
        !required(templates.get(installation.workspace)).has(name) &&
        !byFull.has(contained(root, name))
      )
        throw new Error(
          `Missing retired template disposition ${installation.workspace}:${name}`,
        );
    for (const decision of plan.files)
      if (
        decision.target.workspace === installation.workspace &&
        decision.owner === "template" &&
        decision.action === "remove"
      ) {
        const { [decision.target.path]: _removed, ...remaining } = hashes;
        hashes = remaining;
      }
    for (const [name, content] of required(
      templates.get(installation.workspace),
    ))
      Object.assign(hashes, { [name]: computeHash(content) });
    const workflow = required(
      byFull.get(contained(root, ".trellis/workflow.md")),
    );
    const workflowDecision = required(
      plan.files.find(
        (decision) =>
          decision.target.workspace === installation.workspace &&
          decision.owner === "workflow",
      ),
    );
    const workflowContent =
      workflow.facts.action === "write"
        ? required(workflow.bytes)
        : snapshotBytes(required(workflowDecision.source));
    hashes = projectWorkflowHashes(
      hashes,
      required(
        plan.workflows.find(
          (entry) => entry.workspace === installation.workspace,
        ),
      ).template_id,
      workflowContent.toString("utf8"),
    );
    prepare(
      root,
      ".trellis/.template-hashes.json",
      "write",
      installation.receipt_source,
      Buffer.from(JSON.stringify({ __version: 2, hashes }, null, 2)),
      installation.receipt_source?.mode ?? 0o644,
    );
    prepare(
      root,
      ".trellis/.version",
      "write",
      installation.version_source,
      Buffer.from(plan.target.version),
      installation.version_source.mode,
    );
  }
  if (installationIds.size !== roots.size)
    throw new Error("Each workspace needs frozen installation preimages");
  const result: MigrationResult = {
    status: options.dryRun ? "preview" : "migrated",
    source_version: plan.source.version,
    target_version: plan.target.version,
    actions: pending.map((item) => item.facts),
    conflicts,
  };
  // Freeze routing as well as bytes: unchanged binding JSON alone does not
  // prove that its branch is still checked out at the reviewed authority.
  const refreshed = repository(cwd);
  if (
    refreshed.common !== repo.common ||
    refreshed.suffix !== repo.suffix ||
    !isDeepStrictEqual([...refreshed.roots].sort(), [...repo.roots].sort()) ||
    !isDeepStrictEqual(
      [...refreshed.roots]
        .map((top) => path.resolve(top, refreshed.suffix ?? ""))
        .filter((root) => fs.existsSync(path.join(root, ".trellis")))
        .sort(),
      liveRoots,
    )
  )
    throw new Error("Repository topology changed during preflight");
  for (const workspace of plan.workspaces) {
    const root = rootOf(workspace.id);
    if (fs.realpathSync(workspace.root) !== root)
      throw new Error("Workspace path changed during preflight");
    if (repo.common) {
      const top = fs.realpathSync(git(root, "rev-parse", "--show-toplevel"));
      if (
        !refreshed.roots.has(top) ||
        path.resolve(top, workspace.project_relative ?? "") !== root ||
        fs.realpathSync(
          path.resolve(root, git(root, "rev-parse", "--git-common-dir")),
        ) !== repo.common
      )
        throw new Error("Repository identity changed during preflight");
    }
  }
  for (const [full, original] of taskDirectories)
    if (fs.realpathSync(full) !== original)
      throw new Error("Task directory changed during preflight");
  for (const [root, present] of markers)
    if (extensionMarker(root) !== present)
      throw new Error("Extension binding predicate changed during preflight");
  for (const binding of bindings.values())
    if (boundWorkspace(binding.branch) !== binding.workspace)
      throw new Error("Branch checkout changed during preflight");
  for (const full of absentBindings) {
    contained(
      required(repo.common),
      path.relative(required(repo.common), full).split(path.sep).join("/"),
      false,
    );
    if (fs.lstatSync(full, { throwIfNoEntry: false }))
      throw new Error("Branch binding appeared during preflight");
  }
  for (const item of pending)
    contained(item.root, item.name, item.root !== repo.common);
  if (options.dryRun) {
    for (const item of pending)
      if (!isDeepStrictEqual(liveState(item.full), item.observed))
        throw new Error(`Migration changed during preflight: ${item.full}`);
    return result;
  }
  if (conflicts.length)
    throw new Error(`Migration preflight conflicts: ${conflicts.join(", ")}`);
  // Entire-set recheck before first write; no per-file retry can hide third states.
  for (const item of pending)
    if (
      !isDeepStrictEqual(liveState(item.full), item.source) &&
      !isDeepStrictEqual(liveState(item.full), item.target)
    )
      throw new Error(`Migration changed during preflight: ${item.full}`);
  for (const item of pending) {
    if (
      item.facts.action === "preserve" ||
      isDeepStrictEqual(liveState(item.full), item.target)
    )
      continue;
    if (item.facts.action === "remove") {
      if (fs.existsSync(item.full)) fs.unlinkSync(item.full);
    } else {
      fs.mkdirSync(path.dirname(item.full), { recursive: true });
      writeFileAtomic(
        item.full,
        required(item.bytes),
        required(item.target).mode,
      );
    }
  }
  return result;
}

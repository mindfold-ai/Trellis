import { resolveSupportedPython } from "../../utils/python.js";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import {
  classifyBranchBinding,
  classifyMaintenanceTask,
  classifySessionCarrier,
  MaintenanceError,
} from "@mindfoldhq/trellis-core/task/maintenance";
import { getConfiguredPlatforms } from "../../configurators/index.js";
import { assertProjectPath } from "../../utils/path-boundary.js";
import { writeFileAtomic } from "../../utils/atomic-write.js";
import type { RawSnapshot } from "../migration2-schema.js";
export type { RawSnapshot } from "../migration2-schema.js";
export { MaintenanceError } from "@mindfoldhq/trellis-core/task/maintenance";

export interface FileAction {
  kind?: "file";
  root: string;
  path: string;
  source: RawSnapshot | null;
  target: RawSnapshot | null;
}
export interface DirectorySnapshot {
  mode: number;
  symlink_target?: string;
}
export interface DirectoryAction {
  kind: "directory";
  root: string;
  path: string;
  source: DirectorySnapshot | null;
  target: DirectorySnapshot | null;
}
export type MaintenanceAction = FileAction | DirectoryAction;
export interface CandidateIdentity {
  cli_version: string;
  core_version: string;
  cli_digest: string;
  core_digest: string;
}
export interface ToolsGuard {
  source_runtime: "legacy" | "delivery" | "unknown";
  source_version: string;
  target_version: string;
  configured_platforms: string[];
  required_paths: string[];
  custom_agents_content?: string;
  workflow:
    | { action: "preserve" }
    | {
        action: "install";
        template_id: string;
        provider: string;
        ownership: "bundled" | "custom";
      };
}
export interface TaskGuard {
  task_id: string;
  generation: number;
  task_ref: string;
  archive_ref?: string;
  original_task_ref?: string;
  target_branch: string | null;
}
export interface FormalArchiveGuard extends TaskGuard {
  output_generation: number;
  archive_commit: string;
  target_ref: string;
  target_head: string;
  archive_ref: string;
  original_task_ref: string;
}
interface PlanBase {
  schema_version: "1.0";
  operation_id: string;
  target_root: string;
  common_dir: string | null;
  candidate: CandidateIdentity;
  actions: MaintenanceAction[];
}
export type PreparedMaintenancePlan = PlanBase &
  (
    | { kind: "tools_install"; guard: ToolsGuard }
    | { kind: "formal_archive_reactivation"; guard: FormalArchiveGuard }
    | {
        kind: "task_conversion" | "legacy_closeout" | "task_resume";
        guard: TaskGuard;
      }
  );
export type PreparePlanInput = Omit<
  PlanBase,
  "schema_version" | "operation_id" | "candidate"
> &
  (
    | { kind: "tools_install"; guard: ToolsGuard }
    | {
        kind: "formal_archive_reactivation";
        guard: Omit<FormalArchiveGuard, "target_branch">;
      }
    | {
        kind: "task_conversion" | "legacy_closeout" | "task_resume";
        guard: Omit<TaskGuard, "target_branch">;
      }
  );
interface MaintenanceResultBase {
  operation_id: string;
  status: "prepared" | "pending" | "applied" | "rolled_back";
  pending_paths: string[];
  recovery_ref: string | null;
  resumed_task?: {
    key: { task_id: string; lifecycle_generation: number };
    task_ref: string;
  };
}
export type FormalArchiveReactivationResult = MaintenanceResultBase & {
  kind: "formal_archive_reactivation";
} & (
    | {
        status: "applied";
        reactivated_task: {
          key: { task_id: string; lifecycle_generation: number };
          task_ref: string;
        };
      }
    | {
        status: "prepared" | "pending" | "rolled_back";
        reactivated_task?: never;
      }
  );
export type MaintenanceResult =
  | FormalArchiveReactivationResult
  | (MaintenanceResultBase & {
      kind: Exclude<
        PreparedMaintenancePlan["kind"],
        "formal_archive_reactivation"
      >;
      reactivated_task?: never;
    });

interface StoredOperation {
  plan: PreparedMaintenancePlan;
  phase: "applying" | "applied" | "rolling_back" | "rolled_back";
}
const digest = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");
const fail = (code: string, message: string): never => {
  throw new MaintenanceError(code, message);
};
export function contained(root: string, ref: string): string {
  if (
    !path.isAbsolute(root) ||
    !ref ||
    path.isAbsolute(ref) ||
    ref.includes("\\") ||
    ref.split("/").some((p) => !p || p === "." || p === "..")
  )
    return fail("invalid_path", `${root}:${ref}`);
  const full = path.join(root, ref);
  const tasksRoot = path.join(root, ".trellis/tasks");
  const sharedTasks = fs
    .lstatSync(tasksRoot, { throwIfNoEntry: false })
    ?.isSymbolicLink();
  if (
    !(
      sharedTasks &&
      (ref === ".trellis/tasks" || ref.startsWith(".trellis/tasks/"))
    )
  )
    assertProjectPath(full, root);
  let cursor = root;
  const parts = ref.split("/");
  for (const [index, part] of parts.entries()) {
    cursor = path.join(cursor, part);
    const entry = fs.lstatSync(cursor, { throwIfNoEntry: false });
    if (entry?.isSymbolicLink()) {
      const taskAlias =
        parts[0] === ".trellis" &&
        parts[1] === "tasks" &&
        (index === 1 || (index === 2 && part !== "archive"));
      if (!taskAlias || !fs.statSync(cursor).isDirectory())
        fail("unsupported_path", `Symlink action path ${cursor}`);
    }
  }
  return full;
}
export function snapshot(content: string | Buffer, mode = 0o644): RawSnapshot {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return {
    content_base64: bytes.toString("base64"),
    sha256: digest(bytes),
    mode,
  };
}
export function readSnapshot(root: string, ref: string): RawSnapshot | null {
  const full = contained(root, ref);
  if (!fs.existsSync(full)) return null;
  const stat = fs.statSync(full);
  if (!stat.isFile())
    return fail("unsupported_path", `Expected regular file ${full}`);
  return snapshot(fs.readFileSync(full), stat.mode & 0o777);
}
export function readDirectorySnapshot(
  root: string,
  ref: string,
): DirectorySnapshot | null {
  const full = contained(root, ref);
  if (!fs.existsSync(full)) return null;
  const stat = fs.statSync(full);
  if (!stat.isDirectory())
    return fail("unsupported_path", `Expected directory ${full}`);
  return {
    mode: stat.mode & 0o777,
    ...(fs.lstatSync(full).isSymbolicLink()
      ? { symlink_target: fs.readlinkSync(full) }
      : {}),
  };
}
function git(root: string, args: string[]): string {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)),
  );
  env.LC_ALL = "C";
  return execFileSync("git", ["-C", root, ...args], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
export function observeRepository(root: string): {
  root: string;
  common_dir: string | null;
  branch: string;
  worktrees: string[];
} {
  const actual = fs.realpathSync(root);
  if (!fs.statSync(actual).isDirectory()) return fail("invalid_target", actual);
  let top: string;
  try {
    top = fs.realpathSync(git(actual, ["rev-parse", "--show-toplevel"]));
  } catch (error) {
    let parent = actual;
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
    return { root: actual, common_dir: null, branch: "", worktrees: [actual] };
  }
  if (top !== actual)
    return fail("invalid_target", "Target must be an exact checkout root");
  const common = fs.realpathSync(
    path.resolve(actual, git(actual, ["rev-parse", "--git-common-dir"])),
  );
  const worktrees: string[] = [];
  for (const record of git(actual, [
    "worktree",
    "list",
    "--porcelain",
    "-z",
  ]).split("\0\0")) {
    const fields = record.split("\0"),
      first = fields[0];
    if (!first?.startsWith("worktree ")) continue;
    const workspace = path.resolve(first.slice(9));
    const prunable = fields
      .slice(1)
      .some((field) => field === "prunable" || field.startsWith("prunable "));
    if (
      workspace !== top &&
      prunable &&
      !fs.lstatSync(path.join(workspace, ".git"), { throwIfNoEntry: false })
    )
      continue;
    worktrees.push(fs.realpathSync(workspace));
  }
  return {
    root: actual,
    common_dir: common,
    branch: git(actual, ["branch", "--show-current"]),
    worktrees,
  };
}
function packageRoot(start: string): string {
  let cursor = start;
  while (!fs.existsSync(path.join(cursor, "package.json"))) {
    const parent = path.dirname(cursor);
    if (parent === cursor) return fail("candidate_unavailable", start);
    cursor = parent;
  }
  return cursor;
}
function packageDigest(root: string): string {
  const hash = createHash("sha256");
  function walk(ref: string): void {
    const full = path.join(root, ref);
    if (!fs.existsSync(full)) return;
    const stat = fs.statSync(full);
    // Python imports create runtime caches without changing this candidate's
    // source/build content. Keep those disposable files out of its identity.
    if (stat.isDirectory()) {
      if (path.basename(ref) === "__pycache__") return;
      for (const name of fs.readdirSync(full).sort()) walk(`${ref}/${name}`);
    } else if (stat.isFile()) {
      if (/\.py[co]$/.test(ref)) return;
      hash.update(ref);
      hash.update(String(stat.mode & 0o777));
      hash.update(fs.readFileSync(full));
    }
  }
  for (const ref of ["package.json", "bin", "dist", "src"]) walk(ref);
  return hash.digest("hex");
}
export function candidateIdentity(): CandidateIdentity {
  const cli = packageRoot(path.dirname(fileURLToPath(import.meta.url)));
  const core = path.dirname(
    createRequire(import.meta.url).resolve(
      "@mindfoldhq/trellis-core/package.json",
    ),
  );
  const version = (root: string): string =>
    (
      JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
        version: string;
      }
    ).version;
  const identity = {
    cli_version: version(cli),
    core_version: version(core),
    cli_digest: packageDigest(cli),
    core_digest: packageDigest(core),
  };
  if (identity.cli_version !== identity.core_version)
    fail("candidate_mismatch", "CLI and Core versions differ");
  return identity;
}
function live(
  action: MaintenanceAction,
): RawSnapshot | DirectorySnapshot | null {
  return action.kind === "directory"
    ? readDirectorySnapshot(action.root, action.path)
    : readSnapshot(action.root, action.path);
}
function validateSnapshot(value: RawSnapshot | DirectorySnapshot | null): void {
  if (value === null) return;
  if (!Number.isInteger(value.mode) || value.mode < 0 || value.mode > 0o777)
    fail("invalid_snapshot", "Invalid mode");
  if ("content_base64" in value) {
    const bytes = Buffer.from(value.content_base64, "base64");
    if (
      bytes.toString("base64") !== value.content_base64 ||
      digest(bytes) !== value.sha256
    )
      fail("invalid_snapshot", "Raw snapshot digest mismatch");
  }
}
function validatePlan(plan: PreparedMaintenancePlan, candidate = true): void {
  if (
    plan.schema_version !== "1.0" ||
    ![
      "tools_install",
      "task_conversion",
      "legacy_closeout",
      "task_resume",
      "formal_archive_reactivation",
    ].includes(plan.kind) ||
    !/^[a-f0-9-]{36}$/.test(plan.operation_id)
  )
    fail("invalid_plan", "Unknown maintenance plan");
  const repo = observeRepository(plan.target_root);
  if (repo.root !== plan.target_root || repo.common_dir !== plan.common_dir)
    fail("repository_mismatch", "Target/common storage changed");
  if (
    plan.kind === "tools_install" &&
    !isDeepStrictEqual(
      [...getConfiguredPlatforms(plan.target_root)].sort(),
      [...plan.guard.configured_platforms].sort(),
    )
  )
    fail(
      "installation_context_changed",
      "Configured platform set changed since preparation; prepare a new reviewed installation",
    );
  if (plan.kind !== "tools_install") {
    if (plan.common_dir === null) {
      if (plan.guard.target_branch !== null)
        fail(
          "task_authority_changed",
          "Git-free target gained or lost its prepared branch authority",
        );
    } else {
      const owners = repo.worktrees.filter(
        (workspace) =>
          git(workspace, ["branch", "--show-current"]) ===
          plan.guard.target_branch,
      );
      if (
        !plan.guard.target_branch ||
        repo.branch !== plan.guard.target_branch ||
        owners.length !== 1 ||
        owners[0] !== plan.target_root
      )
        fail(
          "task_authority_changed",
          "Prepared Task branch no longer uniquely belongs to the selected checkout; restore its original branch before continuing this operation",
        );
    }
  }
  if (candidate && !isDeepStrictEqual(plan.candidate, candidateIdentity()))
    fail(
      "candidate_mismatch",
      "Prepared CLI/Core content no longer matches executing candidate",
    );
  if (plan.kind === "formal_archive_reactivation") {
    if (
      plan.guard.output_generation !== plan.guard.generation + 1 ||
      !Number.isSafeInteger(plan.guard.output_generation)
    )
      fail("invalid_plan", "Formal archive generation guard mismatch");
    for (const oid of [plan.guard.archive_commit, plan.guard.target_head]) {
      try {
        if (
          git(plan.target_root, [
            "rev-parse",
            "--verify",
            `${oid}^{commit}`,
          ]) !== oid
        )
          fail("invalid_git_fact", "Frozen archive commit mismatch");
        git(plan.target_root, [
          "merge-base",
          "--is-ancestor",
          oid,
          plan.guard.target_ref,
        ]);
      } catch {
        fail(
          "stale_source",
          "Frozen archive/target commits are no longer reachable",
        );
      }
    }
  }
  if (
    plan.kind === "task_resume" ||
    plan.kind === "formal_archive_reactivation"
  ) {
    if (
      !/^\.trellis\/tasks\/[^/]+$/.test(plan.guard.task_ref) ||
      plan.guard.task_ref === ".trellis/tasks/archive" ||
      !plan.guard.archive_ref ||
      !/^\.trellis\/tasks\/archive\/[^/]+\/[^/]+$/.test(
        plan.guard.archive_ref,
      ) ||
      !plan.guard.original_task_ref ||
      !/^\.trellis\/tasks\/[^/]+$/.test(plan.guard.original_task_ref) ||
      plan.guard.original_task_ref === ".trellis/tasks/archive"
    )
      fail(
        "invalid_plan",
        "Archive resume requires exact frozen archive, original and active Task paths",
      );
    for (const action of plan.actions) {
      if (action.root !== plan.target_root) continue;
      if (
        (action.path === plan.guard.archive_ref ||
          action.path.startsWith(`${plan.guard.archive_ref}/`)) &&
        !isDeepStrictEqual(action.source, action.target)
      )
        fail("invalid_scope", "Original archive is read-only");
      if (
        (action.path === plan.guard.task_ref ||
          action.path.startsWith(`${plan.guard.task_ref}/`)) &&
        action.source !== null
      )
        fail(
          "invalid_scope",
          "Active resume destination must have been absent",
        );
    }
  }
  const paths = new Set<string>();
  for (const action of plan.actions) {
    contained(action.root, action.path);
    validateSnapshot(action.source);
    validateSnapshot(action.target);
    if (
      action.kind === "directory" &&
      [action.source, action.target].some(
        (value) => value?.symlink_target !== undefined,
      )
    ) {
      if (
        plan.kind === "tools_install" ||
        action.root !== plan.target_root ||
        action.path !== plan.guard.task_ref
      )
        fail(
          "invalid_scope",
          "Only the selected logical Task root may carry a frozen directory alias",
        );
      for (const value of [action.source, action.target])
        if (value?.symlink_target !== undefined && !value.symlink_target)
          fail("invalid_snapshot", "Directory alias target must be nonempty");
    }
    const key = path.join(action.root, action.path);
    if (paths.has(key)) fail("invalid_plan", `Duplicate action ${key}`);
    paths.add(key);
    if (plan.kind === "tools_install") {
      if (
        action.root !== plan.target_root ||
        action.kind === "directory" ||
        /^\.trellis\/(tasks|workspace|\.runtime|\.internal|sessions)(\/|$)/.test(
          action.path,
        )
      )
        fail(
          "invalid_scope",
          `Tool action outside checkout tool scope: ${key}`,
        );
    } else {
      const task =
        action.root === plan.target_root &&
        (action.path === plan.guard.task_ref ||
          action.path.startsWith(`${plan.guard.task_ref}/`) ||
          (plan.guard.archive_ref &&
            (action.path === plan.guard.archive_ref ||
              action.path.startsWith(`${plan.guard.archive_ref}/`))));
      const archiveParent =
        plan.kind === "legacy_closeout" &&
        action.kind === "directory" &&
        action.root === plan.target_root &&
        plan.guard.archive_ref?.startsWith(`${action.path}/`) &&
        action.path.startsWith(".trellis/tasks/archive");
      const localSession =
        repo.worktrees.includes(action.root) &&
        /^\.trellis\/\.runtime\/sessions\/[^/]+\.json$/.test(action.path);
      const commonSession =
        action.root === plan.common_dir &&
        /^trellis\/sessions\/[^/]+\.json$/.test(action.path);
      const binding =
        action.root === plan.common_dir &&
        action.path ===
          `trellis/task-branches/${plan.guard.task_id}/${plan.guard.generation}.json`;
      const readGuard =
        action.kind !== "directory" &&
        action.root === plan.target_root &&
        isDeepStrictEqual(action.source, action.target);
      if (
        !(
          task ||
          archiveParent ||
          localSession ||
          commonSession ||
          binding ||
          readGuard
        )
      )
        fail("invalid_scope", `Task action outside selected scope: ${key}`);
    }
  }
}
export function preparePlan(input: PreparePlanInput): PreparedMaintenancePlan {
  const repository = observeRepository(input.target_root);
  const guard =
    input.kind === "tools_install"
      ? input.guard
      : {
          ...input.guard,
          target_branch: repository.common_dir ? repository.branch : null,
        };
  const plan = {
    ...input,
    guard,
    schema_version: "1.0" as const,
    operation_id: randomUUID(),
    candidate: candidateIdentity(),
  } as PreparedMaintenancePlan;
  validatePlan(plan);
  for (const action of plan.actions)
    if (!isDeepStrictEqual(live(action), action.source))
      fail("stale_source", action.path);
  return plan;
}
function stateReference(
  plan: PreparedMaintenancePlan,
  stateDir: string,
): string {
  const directory = path.resolve(stateDir);
  const roots = observeRepository(plan.target_root).worktrees;
  for (const root of roots)
    if (directory === root || directory.startsWith(root + path.sep)) {
      try {
        git(root, ["check-ignore", "-q", "--", path.relative(root, directory)]);
      } catch {
        return fail(
          "invalid_state_dir",
          "Recovery state must be external or Git-ignored",
        );
      }
      try {
        if (git(root, ["ls-files", "--", path.relative(root, directory)]))
          return fail(
            "invalid_state_dir",
            "Recovery state contains tracked files",
          );
      } catch (error) {
        if (error instanceof MaintenanceError) throw error;
      }
    }
  return path.join(directory, `${plan.operation_id}.json`);
}
function readStored(ref: string): StoredOperation {
  return JSON.parse(fs.readFileSync(ref, "utf8")) as StoredOperation;
}
export function loadPlan(recoveryRef: string): PreparedMaintenancePlan {
  const saved = readStored(recoveryRef);
  validatePlan(saved.plan);
  return saved.plan;
}
function save(ref: string, stored: StoredOperation): void {
  fs.mkdirSync(path.dirname(ref), { recursive: true });
  writeFileAtomic(ref, JSON.stringify(stored, null, 2) + "\n", 0o600);
}
function validateSelectedCarriers(plan: PreparedMaintenancePlan): void {
  if (plan.kind !== "legacy_closeout" && plan.kind !== "task_resume") return;
  const repo = observeRepository(plan.target_root);
  const selected = {
    task_id: plan.guard.task_id,
    generation: plan.guard.generation,
    task_path: contained(plan.target_root, plan.guard.task_ref),
    task_paths:
      plan.kind === "task_resume"
        ? [plan.guard.archive_ref, plan.guard.original_task_ref].flatMap(
            (ref) => (ref ? [contained(plan.target_root, ref)] : []),
          )
        : [],
  };
  const requireDisposition = (root: string, ref: string): void => {
    if (
      !plan.actions.some(
        (action) =>
          action.root === root &&
          action.path === ref &&
          action.kind !== "directory" &&
          (plan.kind === "task_resume" ||
            (action.source !== null && action.target === null)),
      )
    )
      fail(
        "stale_source",
        `Selected Task carrier was not reviewed${plan.kind === "legacy_closeout" ? " for retirement" : ""}: ${root}:${ref}; prepare a new operation with the current carrier inventory`,
      );
  };
  const directories = [
    ...(repo.common_dir
      ? [{ root: repo.common_dir, ref: "trellis/sessions" }]
      : []),
    ...repo.worktrees.map((root) => ({
      root,
      ref: ".trellis/.runtime/sessions",
    })),
  ];
  // Inspect by frozen identity/path, not the active Task reader: a resumed
  // closeout may already have retired some carriers or removed the Task tree.
  for (const directory of directories) {
    const full = contained(directory.root, directory.ref);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full).sort()) {
      if (!name.endsWith(".json")) continue;
      const ref = `${directory.ref}/${name}`;
      const value: unknown = JSON.parse(
        fs.readFileSync(contained(directory.root, ref), "utf8"),
      );
      if (
        classifySessionCarrier(value, {
          ...selected,
          carrier_workspace: directory.root,
          common_dir: repo.common_dir,
        }).matches
      )
        requireDisposition(directory.root, ref);
    }
  }
  if (repo.common_dir) {
    const ref = `trellis/task-branches/${selected.task_id}/${selected.generation}.json`;
    const raw = readSnapshot(repo.common_dir, ref);
    if (
      raw &&
      classifyBranchBinding(
        JSON.parse(Buffer.from(raw.content_base64, "base64").toString("utf8")),
        selected,
      ).matches
    )
      requireDisposition(repo.common_dir, ref);
  }
}
function validateResumeTrees(plan: PreparedMaintenancePlan): void {
  if (
    plan.kind !== "task_resume" &&
    plan.kind !== "formal_archive_reactivation"
  )
    return;
  if (
    plan.guard.original_task_ref &&
    plan.guard.original_task_ref !== plan.guard.task_ref &&
    fs.existsSync(contained(plan.target_root, plan.guard.original_task_ref))
  )
    fail(
      "later_work_conflict",
      "The original active path was occupied after preparation; its carriers no longer belong to the selected archive",
    );
  for (const ref of [plan.guard.archive_ref, plan.guard.task_ref]) {
    if (!ref) continue;
    const walk = (current: string): void => {
      const full = contained(plan.target_root, current);
      if (!fs.existsSync(full)) return;
      const entry = fs.lstatSync(full);
      const action = plan.actions.find(
        (item) => item.root === plan.target_root && item.path === current,
      );
      if (!action || (action.kind === "directory") !== entry.isDirectory())
        fail(
          "later_work_conflict",
          `Task tree contains an unreviewed entry: ${current}`,
        );
      if (entry.isDirectory())
        for (const name of fs.readdirSync(full)) walk(`${current}/${name}`);
    };
    walk(ref);
  }
  if (plan.kind === "formal_archive_reactivation") {
    for (const workspace of observeRepository(plan.target_root).worktrees) {
      if (workspace === plan.target_root) continue;
      for (const ref of publicTaskRoots(workspace)) {
        const raw = readSnapshot(workspace, `${ref}/task.json`);
        if (!raw) continue;
        const value = JSON.parse(
          Buffer.from(raw.content_base64, "base64").toString("utf8"),
        ) as Record<string, unknown>;
        if (
          value.id === plan.guard.task_id &&
          value.schema_version === "2.0" &&
          classifyMaintenanceTask(value).generation >=
            plan.guard.output_generation
        )
          fail(
            "later_work_conflict",
            `Accessible successor appeared in registered sibling checkout: ${workspace}:${ref}`,
          );
      }
    }
  }
  const tasks = contained(plan.target_root, ".trellis/tasks");
  for (const name of fs.readdirSync(tasks)) {
    if (name === "archive" || `.trellis/tasks/${name}` === plan.guard.task_ref)
      continue;
    const ref = `.trellis/tasks/${name}/task.json`;
    if (
      !fs
        .statSync(contained(plan.target_root, `.trellis/tasks/${name}`))
        .isDirectory()
    )
      continue;
    const raw = readSnapshot(plan.target_root, ref);
    if (!raw) continue;
    const value: unknown = JSON.parse(
      Buffer.from(raw.content_base64, "base64").toString("utf8"),
    );
    if (
      typeof value === "object" &&
      value !== null &&
      "id" in value &&
      typeof value.id === "string" &&
      value.id.toLowerCase() === plan.guard.task_id.toLowerCase()
    )
      fail(
        "later_work_conflict",
        `Selected Task identity gained another active record: ${ref}`,
      );
  }
}
function pending(
  plan: PreparedMaintenancePlan,
  direction: "target" | "source",
): MaintenanceAction[] {
  validateResumeTrees(plan);
  if (direction === "source" && plan.kind === "formal_archive_reactivation")
    validateFormalLaterCarriers(plan);
  const result: MaintenanceAction[] = [];
  for (const action of plan.actions) {
    const state = live(action);
    if (
      !isDeepStrictEqual(state, action.source) &&
      !isDeepStrictEqual(state, action.target)
    )
      fail(
        "later_work_conflict",
        `Owned path changed after prepare: ${action.root}:${action.path}`,
      );
    if (!isDeepStrictEqual(state, action[direction])) result.push(action);
  }
  if (direction === "target" || plan.kind === "task_resume")
    validateSelectedCarriers(plan);
  // A later business child is outside this operation's frozen directory tree.
  for (const action of result)
    if (action.kind === "directory" && action[direction] === null) {
      const full = contained(action.root, action.path);
      if (fs.existsSync(full))
        for (const name of fs.readdirSync(full)) {
          const child = `${action.path}/${name}`;
          if (
            !plan.actions.some(
              (a) =>
                a.root === action.root &&
                a.path === child &&
                a[direction] === null,
            )
          )
            fail(
              "later_work_conflict",
              `Unowned child would prevent directory restoration: ${child}`,
            );
        }
    }
  return result;
}
function write(
  action: MaintenanceAction,
  direction: "target" | "source",
): void {
  const destination = action[direction];
  const full = contained(action.root, action.path);
  if (action.kind === "directory") {
    if (destination === null) {
      if (fs.lstatSync(full).isSymbolicLink()) fs.unlinkSync(full);
      else fs.rmdirSync(full);
    } else {
      const directory = destination as DirectorySnapshot;
      if (directory.symlink_target !== undefined) {
        if (!fs.lstatSync(full, { throwIfNoEntry: false })) {
          fs.mkdirSync(path.dirname(full), { recursive: true });
          fs.symlinkSync(directory.symlink_target, full, "dir");
        }
      } else fs.mkdirSync(full, { recursive: true });
      fs.chmodSync(full, destination.mode);
    }
  } else if (destination === null) fs.unlinkSync(full);
  else {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    writeFileAtomic(
      full,
      Buffer.from((destination as RawSnapshot).content_base64, "base64"),
      destination.mode,
    );
  }
}
function archiveBarrier(plan: PreparedMaintenancePlan): void {
  if (plan.kind !== "legacy_closeout" || !plan.guard.archive_ref) return;
  const actions = plan.actions.filter(
    (a) =>
      a.root === plan.target_root &&
      (a.path === plan.guard.archive_ref ||
        a.path.startsWith(`${plan.guard.archive_ref}/`)),
  );
  if (
    !actions.length ||
    actions.some((a) => !isDeepStrictEqual(live(a), a.target))
  )
    fail(
      "archive_not_readable",
      "Frozen archive is incomplete before carrier retirement",
    );
  const record = JSON.parse(
    fs.readFileSync(
      contained(plan.target_root, `${plan.guard.archive_ref}/task.json`),
      "utf8",
    ),
  ) as { id?: string };
  if (record.id !== plan.guard.task_id)
    fail("archive_not_readable", "Archive Task identity mismatch");
}
function result(
  plan: PreparedMaintenancePlan,
  status: MaintenanceResult["status"],
  actions: MaintenanceAction[],
  ref: string | null,
): MaintenanceResult {
  const value = {
    operation_id: plan.operation_id,
    kind: plan.kind,
    status,
    pending_paths: actions.map((a) => `${a.root}:${a.path}`),
    recovery_ref: ref,
    ...(plan.kind === "formal_archive_reactivation" && status === "applied"
      ? {
          reactivated_task: {
            key: {
              task_id: plan.guard.task_id,
              lifecycle_generation: plan.guard.output_generation,
            },
            task_ref: plan.guard.task_ref,
          },
        }
      : {}),
    ...(plan.kind === "task_resume"
      ? {
          resumed_task: {
            key: {
              task_id: plan.guard.task_id,
              lifecycle_generation: plan.guard.generation,
            },
            task_ref: plan.guard.task_ref,
          },
        }
      : {}),
  };
  // The discriminant and applied-only identity are built together above.
  return value as MaintenanceResult;
}
async function selectToolsPython(
  plan: PreparedMaintenancePlan,
): Promise<string | undefined> {
  if (plan.kind !== "tools_install") return undefined;
  const command = resolveSupportedPython().command;
  const module = await import("./tools.js");
  await module.validateToolsSelection(plan, command);
  return command;
}
async function postvalidate(
  plan: PreparedMaintenancePlan,
  pythonCommand?: string,
): Promise<void> {
  if (plan.kind === "tools_install") {
    const module = await import("./tools.js");
    await module.validateToolsInstallation(plan, pythonCommand);
  }
}
export function previewPlan(plan: PreparedMaintenancePlan): MaintenanceResult {
  validatePlan(plan);
  return result(plan, "prepared", pending(plan, "target"), null);
}
export async function applyPlan(
  plan: PreparedMaintenancePlan,
  stateDir: string,
): Promise<MaintenanceResult> {
  validatePlan(plan);
  const ref = stateReference(plan, stateDir);
  if (fs.existsSync(ref)) {
    if (!isDeepStrictEqual(readStored(ref).plan, plan))
      fail("operation_mismatch", ref);
    return resumeOperation(ref);
  }
  const pythonCommand = await selectToolsPython(plan);
  pending(plan, "target");
  save(ref, { plan, phase: "applying" });
  return resumeOperation(ref, pythonCommand);
}
export async function recoverPlan(
  plan: PreparedMaintenancePlan,
  stateDir: string,
): Promise<MaintenanceResult> {
  const ref = stateReference(plan, stateDir);
  if (!fs.existsSync(ref)) {
    validatePlan(plan);
    return result(plan, "prepared", pending(plan, "target"), null);
  }
  if (!isDeepStrictEqual(readStored(ref).plan, plan))
    fail("operation_mismatch", ref);
  return recoverOperation(ref);
}
export async function recoverOperation(
  ref: string,
): Promise<MaintenanceResult> {
  const stored = readStored(ref);
  validatePlan(stored.plan);
  if (
    stored.phase === "applied" &&
    stored.plan.kind === "formal_archive_reactivation"
  ) {
    validateFormalSource(stored.plan);
    const tasks = await import("./tasks.js");
    tasks.validateAppliedFormalArchive(stored.plan);
    return result(stored.plan, "applied", [], ref);
  }
  const rollback =
    stored.phase === "rolling_back" || stored.phase === "rolled_back";
  const remaining = pending(stored.plan, rollback ? "source" : "target");
  if (!remaining.length && !rollback) {
    const pythonCommand = await selectToolsPython(stored.plan);
    await postvalidate(stored.plan, pythonCommand);
  }
  return result(
    stored.plan,
    remaining.length ? "pending" : rollback ? "rolled_back" : "applied",
    remaining,
    ref,
  );
}
export async function resumePlan(
  plan: PreparedMaintenancePlan,
  stateDir: string,
): Promise<MaintenanceResult> {
  return applyPlan(plan, stateDir);
}
export async function resumeOperation(
  ref: string,
  selectedPython?: string,
): Promise<MaintenanceResult> {
  const stored = readStored(ref);
  validatePlan(stored.plan);
  if (stored.phase === "rolled_back" || stored.phase === "rolling_back")
    return fail(
      "operation_rolled_back",
      "Use rollback recovery; do not reapply a restored operation",
    );
  if (
    stored.phase === "applied" &&
    stored.plan.kind === "formal_archive_reactivation"
  ) {
    validateFormalSource(stored.plan);
    const tasks = await import("./tasks.js");
    tasks.validateAppliedFormalArchive(stored.plan);
    return result(stored.plan, "applied", [], ref);
  }
  const pythonCommand =
    selectedPython ?? (await selectToolsPython(stored.plan));
  const remaining = pending(stored.plan, "target");
  for (const action of remaining) {
    if (
      stored.plan.kind === "legacy_closeout" &&
      !(
        action.root === stored.plan.target_root &&
        stored.plan.guard.archive_ref &&
        (action.path === stored.plan.guard.archive_ref ||
          action.path.startsWith(`${stored.plan.guard.archive_ref}/`) ||
          (action.kind === "directory" &&
            stored.plan.guard.archive_ref.startsWith(`${action.path}/`)))
      )
    )
      archiveBarrier(stored.plan);
    write(action, "target");
  }
  await postvalidate(stored.plan, pythonCommand);
  save(ref, { ...stored, phase: "applied" });
  return result(stored.plan, "applied", [], ref);
}
function currentDataNeedsDelivery(plan: PreparedMaintenancePlan): boolean {
  const tasks = contained(plan.target_root, ".trellis/tasks");
  if (fs.existsSync(tasks))
    for (const name of fs.readdirSync(tasks)) {
      if (name === "archive") continue;
      const directory = path.join(tasks, name);
      if (!fs.statSync(directory).isDirectory()) continue;
      const task = contained(
        plan.target_root,
        `.trellis/tasks/${name}/task.json`,
      );
      if (!fs.existsSync(task)) continue;
      try {
        if (
          classifyMaintenanceTask(JSON.parse(fs.readFileSync(task, "utf8")))
            .kind === "schema2"
        )
          return true;
      } catch {
        return fail(
          "restore_compatibility_unknown",
          `Unsupported active Task ${task}`,
        );
      }
    }
  const locations = [
    { root: plan.target_root, ref: ".trellis/.runtime/sessions" },
    ...(plan.common_dir
      ? [{ root: plan.common_dir, ref: "trellis/sessions" }]
      : []),
  ];
  for (const location of locations) {
    const directory = contained(location.root, location.ref);
    if (!fs.existsSync(directory)) continue;
    for (const name of fs
      .readdirSync(directory)
      .filter((name) => name.endsWith(".json"))) {
      const file = contained(location.root, `${location.ref}/${name}`);
      try {
        const classified = classifySessionCarrier(
          JSON.parse(fs.readFileSync(file, "utf8")),
          {
            task_id: "maintenance-probe",
            generation: 0,
            task_path: path.join(
              plan.target_root,
              ".trellis/tasks/maintenance-probe",
            ),
            carrier_workspace: plan.target_root,
            common_dir: plan.common_dir,
          },
        );
        if (classified.kind === "identity3") return true;
      } catch {
        return fail(
          "restore_compatibility_unknown",
          `Unsupported session ${file}`,
        );
      }
    }
  }
  return false;
}
export async function rollbackPlan(
  plan: PreparedMaintenancePlan,
  stateDir: string,
): Promise<MaintenanceResult> {
  const ref = stateReference(plan, stateDir);
  if (!isDeepStrictEqual(readStored(ref).plan, plan))
    fail("operation_mismatch", ref);
  return rollbackOperation(ref);
}
export async function rollbackOperation(
  ref: string,
): Promise<MaintenanceResult> {
  const stored = readStored(ref);
  const plan = stored.plan;
  validatePlan(plan);
  const remaining = pending(plan, "source");
  if (plan.kind === "tools_install" && remaining.length) {
    if (plan.guard.source_runtime === "unknown")
      fail(
        "restore_compatibility_unknown",
        "Original tools reader capability is not established",
      );
    if (
      plan.guard.source_runtime === "legacy" &&
      currentDataNeedsDelivery(plan)
    )
      fail(
        "incompatible_restore",
        "Current Task2/session3 data requires Delivery-capable tools; separately review combined restoration",
      );
  }
  save(ref, { ...stored, phase: "rolling_back" });
  for (const action of [...remaining].reverse()) write(action, "source");
  save(ref, { ...stored, phase: "rolled_back" });
  return result(plan, "rolled_back", [], ref);
}

function validateFormalSource(plan: PreparedMaintenancePlan): void {
  if (plan.kind !== "formal_archive_reactivation") return;
  const walk = (ref: string): void => {
    const full = contained(plan.target_root, ref);
    if (!fs.existsSync(full))
      fail("stale_source", `Original archive disappeared: ${ref}`);
    if (
      !plan.actions.some(
        (action) => action.root === plan.target_root && action.path === ref,
      )
    )
      fail("stale_source", `Original archive gained an entry: ${ref}`);
    if (fs.statSync(full).isDirectory())
      for (const name of fs.readdirSync(full)) walk(`${ref}/${name}`);
  };
  walk(plan.guard.archive_ref);
  for (const action of plan.actions) {
    if (
      action.root === plan.target_root &&
      (action.path === plan.guard.archive_ref ||
        action.path.startsWith(`${plan.guard.archive_ref}/`)) &&
      !isDeepStrictEqual(live(action), action.source)
    )
      fail("stale_source", `Original archive changed: ${action.path}`);
  }
}
function validateFormalLaterCarriers(
  plan: Extract<
    PreparedMaintenancePlan,
    { kind: "formal_archive_reactivation" }
  >,
): void {
  const repo = observeRepository(plan.target_root);
  const locations = [
    ...repo.worktrees.map((root) => ({
      root,
      ref: ".trellis/.runtime/sessions",
    })),
    ...(repo.common_dir
      ? [{ root: repo.common_dir, ref: "trellis/sessions" }]
      : []),
  ];
  for (const location of locations) {
    const directory = contained(location.root, location.ref);
    if (!fs.existsSync(directory)) continue;
    for (const name of fs
      .readdirSync(directory)
      .filter((name) => name.endsWith(".json"))) {
      const value: unknown = JSON.parse(
        fs.readFileSync(
          contained(location.root, `${location.ref}/${name}`),
          "utf8",
        ),
      );
      if (
        classifySessionCarrier(value, {
          task_id: plan.guard.task_id,
          generation: plan.guard.output_generation,
          task_path: contained(plan.target_root, plan.guard.task_ref),
          carrier_workspace: location.root,
          common_dir: repo.common_dir,
        }).matches
      )
        fail(
          "later_work_conflict",
          `New generation has a session selection: ${location.ref}/${name}`,
        );
    }
  }
  if (
    repo.common_dir &&
    readSnapshot(
      repo.common_dir,
      `trellis/task-branches/${plan.guard.task_id}/${plan.guard.output_generation}.json`,
    )
  )
    fail("later_work_conflict", "New generation has a branch binding");
}

/** Bounded accessible public Task roots, including retained monthly history. */
export function publicTaskRoots(root: string): string[] {
  const refs: string[] = [];
  const collect = (parent: string): void => {
    const directory = contained(root, parent);
    if (!fs.existsSync(directory)) return;
    for (const name of fs.readdirSync(directory).sort()) {
      if (name === "archive") continue;
      const ref = `${parent}/${name}`;
      if (
        fs.statSync(contained(root, ref)).isDirectory() &&
        readSnapshot(root, `${ref}/task.json`)
      )
        refs.push(ref);
    }
  };
  collect(".trellis/tasks");
  const archive = contained(root, ".trellis/tasks/archive");
  if (fs.existsSync(archive))
    for (const month of fs
      .readdirSync(archive)
      .filter((name) => /^\d{4}-\d{2}$/.test(name)))
      collect(`.trellis/tasks/archive/${month}`);
  return refs;
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as childProcess from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task/legacy-migration";
import {
  applyTaskOperation,
  computeCandidateContentRef,
  emptyTaskRecordV2,
  parseTaskRecordV2,
  type TaskOperation,
  type DeliveryFact,
  type WorkflowContract,
} from "@mindfoldhq/trellis-core/task/v2";
import { migrate } from "../../src/commands/migrate.js";
import { update } from "../../src/commands/update.js";
import { loadHashes, computeHash } from "../../src/utils/template-hash.js";
import {
  collectMigration2Templates,
  migration2TemplateCandidate,
  rawMigrationDigest,
} from "../../src/commands/migration2.js";
import {
  migrationPlan2Schema,
  type MigrationPlan2,
  type RawSnapshot,
} from "../../src/commands/migration2-schema.js";
import { deliveryWorkflowMdTemplate } from "../../src/templates/trellis/index.js";
import { readDeliveryWorkflowContract } from "../../src/utils/delivery-workflow.js";
import { VERSION } from "../../src/constants/version.js";
import * as atomic from "../../src/utils/atomic-write.js";

vi.mock("node:child_process", { spy: true });

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture");
  return value;
}
const b64 = (value: string | Buffer): string =>
  Buffer.from(value).toString("base64");
const raw = (bytes: string | Buffer, mode = 0o640): RawSnapshot => ({
  content_base64: b64(bytes),
  sha256: rawMigrationDigest(bytes),
  mode,
});
const ref = ".trellis/tasks/10-12-migration";
let root: string, planPath: string, previousCwd: string, plan: MigrationPlan2;
let inheritedSibling: string | undefined;
const file = (name: string): string => path.join(root, name);
function write(name: string, bytes: string | Buffer, mode = 0o640): void {
  fs.mkdirSync(path.dirname(file(name)), { recursive: true });
  fs.writeFileSync(file(name), bytes);
  fs.chmodSync(file(name), mode);
}
function snapshot(directory = root): Map<string, string> {
  const result = new Map<string, string>();
  function scan(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(full);
      else if (entry.isFile())
        result.set(
          full,
          `${rawMigrationDigest(fs.readFileSync(full))}:${fs.statSync(full).mode & 0o777}`,
        );
    }
  }
  scan(directory);
  return result;
}
function save(): void {
  fs.writeFileSync(planPath, JSON.stringify(plan));
}
function seedWorkspace(id: string, workspace: string): void {
  const original = root;
  root = workspace;
  write(".trellis/.version", VERSION);
  write(".trellis/.template-hashes.json", '{"__version":2,"hashes":{}}');
  write(".trellis/workflow.md", "# old user-owned workflow\n");
  const legacy = emptyTaskRecord({
    id: `${id}-task`,
    name: "Task",
    title: "Title",
    status: "completed",
    commit: "old-commit",
    meta: { evidence: "retain" },
  });
  const source = JSON.stringify(legacy, null, 4) + "\n\n";
  write(`${ref}/task.json`, source);
  write(`${ref}/prd.md`, "Entire accepted task scope\n", 0o600);
  const metadata = Object.fromEntries(
    Object.entries(legacy).filter(
      ([key]) => !["status", "commit", "pr_url", "completedAt"].includes(key),
    ),
  ) as Omit<typeof legacy, "status" | "commit" | "pr_url" | "completedAt">;
  plan.workspaces.push({ id, root: workspace, project_relative: null });
  plan.installations.push({
    workspace: id,
    version_source: raw(VERSION),
    receipt_source: raw('{"__version":2,"hashes":{}}'),
  });
  plan.tasks.push({
    workspace: id,
    task_ref: ref,
    disposition: "convert_active",
    source: raw(source),
    record: emptyTaskRecordV2(metadata),
    legacy_facts: [
      {
        field: "commit",
        disposition: "source_snapshot",
        owner_id: "original-delivery-owner",
        reason: {
          locator: `${ref}/migration/source-task.json`,
          revision: `sha256:${rawMigrationDigest(source)}`,
        },
      },
    ],
  });
  plan.workflows.push({
    workspace: id,
    template_id: "native-delivery-v1",
    contract: readDeliveryWorkflowContract(deliveryWorkflowMdTemplate),
  });
  const templates = collectMigration2Templates(root);
  plan.templates.push({
    workspace: id,
    ...migration2TemplateCandidate(templates),
  });
  for (const [name, content] of templates)
    plan.files.push({
      target: { kind: "project", workspace: id, path: name },
      owner: "template",
      action: "write",
      source: null,
      target_content_base64: b64(content),
      target_mode: /\.(py|sh)$/.test(name) ? 0o755 : 0o644,
    });
  plan.files.push({
    target: { kind: "project", workspace: id, path: ".trellis/workflow.md" },
    owner: "workflow",
    action: "write",
    source: raw("# old user-owned workflow\n"),
    target_content_base64: b64(deliveryWorkflowMdTemplate),
    target_mode: 0o640,
  });
  plan.files.push({
    target: { kind: "project", workspace: id, path: `${ref}/prd.md` },
    owner: "preserve",
    action: "preserve",
    source: raw("Entire accepted task scope\n", 0o600),
  });
  root = original;
}
/** Commit predecessors first: worktree add must inherit real occupied Tasks. */
function inheritedCopies(): {
  sibling: string;
  binding: string;
  branch: string;
} {
  const secondRef = ".trellis/tasks/10-12-second";
  const second = structuredClone(required(plan.tasks[0]));
  second.task_ref = secondRef;
  const source = JSON.parse(
    Buffer.from(required(second.source).content_base64, "base64").toString(),
  ) as Record<string, unknown>;
  source.id = "second-task";
  second.source = raw(JSON.stringify(source));
  second.record = {
    ...(second.record as Record<string, unknown>),
    id: "second-task",
  };
  second.legacy_facts = required(second.legacy_facts).map((fact) => ({
    ...fact,
    reason: {
      ...fact.reason,
      locator: `${secondRef}/migration/source-task.json`,
      revision: `sha256:${second.source?.sha256}`,
    },
  }));
  plan.tasks.push(second);
  write(
    `${secondRef}/task.json`,
    Buffer.from(second.source.content_base64, "base64"),
  );
  for (const taskRef of [ref, secondRef]) {
    for (const name of [
      "prd.md",
      "design.md",
      "implement.md",
      "implement.jsonl",
      "check.jsonl",
    ]) {
      const relative = `${taskRef}/${name}`;
      const bytes = `${taskRef} main ${name}\n`;
      write(relative, bytes, 0o600);
      plan.files = plan.files.filter((entry) => entry.target.path !== relative);
      plan.files.push({
        target: { kind: "project", workspace: "main", path: relative },
        owner: "preserve",
        action: "preserve",
        source: raw(bytes, 0o600),
      });
    }
  }
  execFileSync("git", ["init", root]);
  execFileSync("git", ["-C", root, "add", ".trellis"]);
  execFileSync("git", [
    "-C",
    root,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "-m",
    "tracked inherited predecessors",
  ]);
  const branch = execFileSync("git", ["-C", root, "branch", "--show-current"], {
    encoding: "utf8",
  }).trim();
  const sibling = `${root}-inherited`;
  execFileSync("git", [
    "-C",
    root,
    "worktree",
    "add",
    "-b",
    "inherited-sibling",
    sibling,
  ]);
  inheritedSibling = sibling;
  plan.workspaces.push({
    id: "sibling",
    root: sibling,
    project_relative: null,
  });
  plan.installations.push({
    ...structuredClone(required(plan.installations[0])),
    workspace: "sibling",
  });
  plan.workflows.push({
    ...structuredClone(required(plan.workflows[0])),
    workspace: "sibling",
  });
  plan.templates.push({
    ...structuredClone(required(plan.templates[0])),
    workspace: "sibling",
  });
  const siblingTasks = structuredClone(plan.tasks).map((task) => ({
    ...task,
    workspace: "sibling",
  }));
  for (const task of siblingTasks)
    required(task.source).mode =
      fs.statSync(path.join(sibling, task.task_ref, "task.json")).mode & 0o777;
  const siblingInstallation = required(
    plan.installations.find((entry) => entry.workspace === "sibling"),
  );
  siblingInstallation.version_source.mode =
    fs.statSync(path.join(sibling, ".trellis/.version")).mode & 0o777;
  required(siblingInstallation.receipt_source).mode =
    fs.statSync(path.join(sibling, ".trellis/.template-hashes.json")).mode &
    0o777;
  plan.tasks.push(...siblingTasks);
  // Preserve branch-local planning differences and a mutable record variant.
  const siblingFiles = structuredClone(plan.files).map((entry) => ({
    ...entry,
    target: { ...entry.target, workspace: "sibling" },
  }));
  for (const entry of siblingFiles) {
    if (entry.source)
      entry.source.mode =
        fs.statSync(path.join(sibling, entry.target.path)).mode & 0o777;
    if (entry.owner !== "preserve") continue;
    const bytes = `${entry.target.path} sibling branch\n`;
    const full = path.join(sibling, entry.target.path);
    fs.writeFileSync(full, bytes);
    fs.chmodSync(full, 0o640);
    entry.source = raw(bytes, 0o640);
  }
  plan.files.push(...siblingFiles);
  for (const task of plan.tasks) {
    if ((task.workspace === "main") === (task.task_ref === ref)) continue;
    task.disposition = "defer";
    delete task.record;
    delete task.legacy_facts;
  }
  const peer = required(
    plan.tasks.find(
      (task) => task.workspace === "sibling" && task.task_ref === ref,
    ),
  );
  const variant = JSON.parse(
    Buffer.from(required(peer.source).content_base64, "base64").toString(),
  ) as Record<string, unknown>;
  variant.title = "Independently reviewed branch variant";
  peer.source = raw(JSON.stringify(variant), 0o600);
  fs.writeFileSync(
    path.join(sibling, ref, "task.json"),
    Buffer.from(peer.source.content_base64, "base64"),
  );
  fs.chmodSync(path.join(sibling, ref, "task.json"), 0o600);
  plan.branch_bindings = [];
  for (const [id, branchName] of [
    ["main-task", branch],
    ["second-task", "inherited-sibling"],
  ]) {
    const bytes = JSON.stringify({
      schema_version: "1.0",
      task_id: id,
      lifecycle_generation: 0,
      binding_revision: 0,
      branch_name: branchName,
    });
    const binding = `.git/trellis/task-branches/${id}/0.json`;
    write(binding, bytes, 0o600);
    plan.branch_bindings.push({
      task_id: id,
      lifecycle_generation: 0,
      source: raw(bytes, 0o600),
    });
    const old = { schema_version: 2, task_id: id, lifecycle_generation: 0 };
    const filename = `codex_${id}.json`;
    write(`.git/trellis/sessions/${filename}`, JSON.stringify(old), 0o600);
    plan.sessions.push({
      target: { kind: "common_session", filename },
      source: raw(JSON.stringify(old), 0o600),
      record: { ...old, schema_version: 3, delivery_id: null },
    });
  }
  return {
    sibling,
    binding: file(".git/trellis/task-branches/main-task/0.json"),
    branch,
  };
}
async function execute(
  dryRun = false,
): Promise<Awaited<ReturnType<typeof migrate>>> {
  save();
  return migrate({ from: VERSION, plan: planPath, dryRun });
}

beforeEach(async () => {
  const actual =
    await vi.importActual<typeof import("node:child_process")>(
      "node:child_process",
    );
  vi.mocked(childProcess.execFileSync).mockReset();
  vi.mocked(childProcess.execFileSync).mockImplementation(actual.execFileSync);
  previousCwd = process.cwd();
  inheritedSibling = undefined;
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "trellis-migrate2-")),
  );
  planPath = `${root}-private-plan.json`;
  process.chdir(root);
  plan = {
    schema_version: "2.0",
    source: { version: VERSION, task_schema: "1.0", delivery_api: null },
    target: { version: VERSION, task_schema: "2.0", delivery_api: "1.0" },
    workspaces: [],
    installations: [],
    tasks: [],
    sessions: [],
    workflows: [],
    templates: [],
    files: [],
  };
  seedWorkspace("main", root);
});
afterEach(() => {
  process.chdir(previousCwd);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (inheritedSibling)
    execFileSync("git", [
      "-C",
      root,
      "worktree",
      "remove",
      "--force",
      inheritedSibling,
    ]);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(planPath, { force: true });
});

describe("migration plan 2.0 controlled old-copy cutover", () => {
  it("dispatches same-version migration, previews without writes, preserves exact history/modes and resumes", async () => {
    const before = snapshot();
    const preview = await execute(true);
    expect(snapshot()).toEqual(before);
    expect(preview.conflicts).toEqual([]);
    expect(
      preview.actions.find((a) => a.path === file(`${ref}/task.json`)),
    ).toMatchObject({ before_mode: 0o640, after_mode: 0o640 });
    await execute();
    const result = JSON.parse(
      fs.readFileSync(file(`${ref}/task.json`), "utf8"),
    );
    expect(result).not.toHaveProperty("status");
    expect(result.deliveries).toEqual([]);
    expect(result.completion_results).toEqual([]);
    expect(fs.readFileSync(file(`${ref}/migration/source-task.json`))).toEqual(
      Buffer.from(plan.tasks[0]?.source?.content_base64 ?? "", "base64"),
    );
    expect(
      fs.statSync(file(`${ref}/migration/source-task.json`)).mode & 0o777,
    ).toBe(0o640);
    const applied = snapshot();
    await execute();
    expect(snapshot()).toEqual(applied);
    // Exact preview backup restores only reviewed paths; this is caller rollback,
    // not a production rollback command or Git reset.
    for (const action of [...preview.actions].reverse()) {
      if (action.action === "preserve") continue;
      const original = [
        ...plan.files.map((f) => ({
          path: file(f.target.path),
          source: f.source,
        })),
        ...plan.tasks.map((t) => ({
          path: file(`${t.task_ref}/task.json`),
          source: t.source,
        })),
        ...plan.installations.flatMap((i) => [
          { path: file(".trellis/.version"), source: i.version_source },
          {
            path: file(".trellis/.template-hashes.json"),
            source: i.receipt_source,
          },
        ]),
      ].find((item) => item.path === action.path);
      if (original?.source) {
        fs.writeFileSync(
          action.path,
          Buffer.from(required(original.source).content_base64, "base64"),
        );
        fs.chmodSync(action.path, original.source.mode);
      } else fs.rmSync(action.path, { force: true });
    }
    expect(snapshot()).toEqual(before);
  });
  it.each(["bytes", "mode"])(
    "rejects a third %s state before any replacement",
    async (kind) => {
      if (kind === "bytes") write(`${ref}/task.json`, '{"id":"user-edited"}');
      else fs.chmodSync(file(`${ref}/task.json`), 0o600);
      const before = snapshot();
      const preview = await execute(true);
      expect(preview.conflicts.some((c) => c.includes("third_state"))).toBe(
        true,
      );
      await expect(execute()).rejects.toThrow("preflight conflicts");
      expect(snapshot()).toEqual(before);
    },
  );
  it("resumes ordinary partial failure with frozen receipts and rejects subsequently edited target modes", async () => {
    const actual = atomic.writeFileAtomic;
    let calls = 0;
    vi.spyOn(atomic, "writeFileAtomic").mockImplementation((...args) => {
      if (++calls === 4) throw new Error("ordinary IO failure");
      actual(...args);
    });
    await expect(execute()).rejects.toThrow("ordinary IO failure");
    vi.restoreAllMocks();
    await execute();
    const applied = snapshot();
    await execute();
    expect(snapshot()).toEqual(applied);
    fs.chmodSync(file(".trellis/scripts/task.py"), 0o600);
    const changed = snapshot();
    await expect(execute()).rejects.toThrow("third_state");
    expect(snapshot()).toEqual(changed);
  });
  it("keeps exact source bytes/mode if applying reviewed target permissions fails before rename", async () => {
    const actual = fs.chmodSync;
    const before = snapshot();
    vi.spyOn(fs, "chmodSync").mockImplementation((...args) => {
      if (String(args[0]).endsWith(".tmp"))
        throw new Error("target chmod failure");
      actual(...args);
    });
    await expect(execute()).rejects.toThrow("target chmod failure");
    expect(snapshot()).toEqual(before);
    vi.restoreAllMocks();
    await execute();
    expect(fs.statSync(file(`${ref}/task.json`)).mode & 0o777).toBe(0o640);
  });
  it("requires all active/archive/Task artifact dispositions and snapshot consistency", async () => {
    write(
      ".trellis/tasks/archive/2026-09/old/task.json",
      '{"id":"old"}',
      0o600,
    );
    const before = snapshot();
    await expect(execute()).rejects.toThrow("inventory");
    expect(snapshot()).toEqual(before);
    plan.tasks.push({
      workspace: "main",
      task_ref: ".trellis/tasks/archive/2026-09/old",
      disposition: "history_only",
      source: raw('{"id":"old"}', 0o600),
    });
    plan.files = plan.files.filter((f) => !f.target.path.endsWith("prd.md"));
    await expect(execute()).rejects.toThrow("artifact disposition");
    plan.tasks[0] = { ...required(plan.tasks[0]), source: raw("wrong") };
    await expect(execute()).rejects.toThrow("JSON");
  });
  it("keeps reviewed deferred Tasks/history-only archives raw and converts an exact session with null selection", async () => {
    const deferred = JSON.stringify(
      emptyTaskRecord({ id: "deferred", name: "Deferred" }),
    );
    write(".trellis/tasks/10-01-deferred/task.json", deferred, 0o600);
    write(
      ".trellis/tasks/archive/2026-09/old/task.json",
      '{"id":"old","status":"done"}',
      0o600,
    );
    plan.tasks.push(
      {
        workspace: "main",
        task_ref: ".trellis/tasks/10-01-deferred",
        disposition: "defer",
        source: raw(deferred, 0o600),
      },
      {
        workspace: "main",
        task_ref: ".trellis/tasks/archive/2026-09/old",
        disposition: "history_only",
        source: raw('{"id":"old","status":"done"}', 0o600),
      },
    );
    const old = {
      schema_version: 2,
      task_id: "main-task",
      lifecycle_generation: 0,
    };
    write(
      ".trellis/.runtime/sessions/codex_context.json",
      JSON.stringify(old),
      0o600,
    );
    plan.sessions.push({
      target: {
        kind: "local_session",
        workspace: "main",
        filename: "codex_context.json",
      },
      source: raw(JSON.stringify(old), 0o600),
      record: { ...old, schema_version: 3, delivery_id: null },
    });
    await execute();
    expect(
      JSON.parse(
        fs.readFileSync(
          file(".trellis/.runtime/sessions/codex_context.json"),
          "utf8",
        ),
      ),
    ).toEqual({ ...old, schema_version: 3, delivery_id: null });
    expect(
      fs.readFileSync(file(".trellis/tasks/10-01-deferred/task.json"), "utf8"),
    ).toBe(deferred);
  });
  it("rejects unowned writes, forged template candidates and custom workflow fallback", async () => {
    plan.files.push({
      target: { kind: "project", workspace: "main", path: "business.txt" },
      owner: "preserve",
      action: "write",
      source: null,
      target_content_base64: b64("oops"),
      target_mode: 0o644,
    });
    const before = snapshot();
    await expect(execute()).rejects.toThrow("grants no write");
    expect(snapshot()).toEqual(before);
    plan.files.pop();
    const template = plan.templates[0];
    if (!template) throw new Error("fixture");
    template.candidate_sha256 = "0".repeat(64);
    await expect(execute()).rejects.toThrow("Frozen template");
    plan.templates[0] = {
      workspace: "main",
      ...migration2TemplateCandidate(collectMigration2Templates(root)),
    };
    const workflow = plan.files.find((f) => f.owner === "workflow");
    if (!workflow) throw new Error("fixture");
    workflow.action = "preserve";
    delete workflow.target_content_base64;
    delete workflow.target_mode;
    await expect(execute()).rejects.toThrow("owner must supply compatible");
  });
  it("rejects fabricated session Task/Delivery selections and source mode drift", async () => {
    const old = {
      schema_version: 2,
      task_id: "main-task",
      lifecycle_generation: 0,
    };
    write(".trellis/.runtime/sessions/context.json", JSON.stringify(old));
    plan.sessions.push({
      target: {
        kind: "local_session",
        workspace: "main",
        filename: "context.json",
      },
      source: raw(JSON.stringify(old)),
      record: {
        ...old,
        schema_version: 3,
        delivery_id: "00000000-0000-0000-0000-000000000001",
      },
    });
    const before = snapshot();
    await expect(execute()).rejects.toThrow("eligible current Delivery");
    expect(snapshot()).toEqual(before);
    required(plan.sessions[0]).record = {
      ...old,
      schema_version: 3,
      task_id: "changed",
      delivery_id: null,
    };
    await expect(execute()).rejects.toThrow("identity/generation");
  });
  it("rejects unregistered workspaces, traversal and nested symlinks", async () => {
    const before = snapshot();
    required(plan.workspaces[0]).root = os.tmpdir();
    await expect(execute()).rejects.toThrow("Unregistered workspace");
    expect(snapshot()).toEqual(before);
    required(plan.workspaces[0]).root = root;
    expect(() =>
      migrationPlan2Schema.parse({
        ...plan,
        files: [
          {
            ...plan.files[0],
            target: { kind: "project", workspace: "main", path: "../victim" },
          },
        ],
      }),
    ).toThrow("contained POSIX");
    fs.symlinkSync(os.tmpdir(), file(`${ref}/nested`));
    await expect(execute()).rejects.toThrow("Symlink task artifact");
  });
  it("retires only frozen receipt-owned core files and resumes the same removal", async () => {
    const retired = ".trellis/scripts/retired.py",
      bytes = "# old core entry\n";
    write(retired, bytes, 0o700);
    const receipt = JSON.stringify({
      __version: 2,
      hashes: { [retired]: rawMigrationDigest(bytes) },
    });
    write(".trellis/.template-hashes.json", receipt);
    required(plan.installations[0]).receipt_source = raw(receipt);
    const before = snapshot();
    await expect(execute()).rejects.toThrow(
      "Missing retired template disposition",
    );
    expect(snapshot()).toEqual(before);
    plan.files.push({
      target: { kind: "project", workspace: "main", path: retired },
      owner: "template",
      action: "remove",
      source: raw(bytes, 0o700),
    });
    await execute();
    expect(fs.existsSync(file(retired))).toBe(false);
    const applied = snapshot();
    await execute();
    expect(snapshot()).toEqual(applied);
    expect(
      JSON.parse(
        fs.readFileSync(file(".trellis/.template-hashes.json"), "utf8"),
      ).hashes,
    ).not.toHaveProperty(retired);
  });
  it("cannot use preserve-only decisions to bypass target runtime/workflow compatibility", async () => {
    const workflow = required(
      plan.files.find((item) => item.owner === "workflow"),
    );
    workflow.owner = "preserve";
    workflow.action = "preserve";
    delete workflow.target_content_base64;
    delete workflow.target_mode;
    const before = snapshot();
    await expect(execute()).rejects.toThrow("Missing workflow decision");
    expect(snapshot()).toEqual(before);
    workflow.owner = "workflow";
    workflow.action = "write";
    workflow.target_content_base64 = b64(deliveryWorkflowMdTemplate);
    workflow.target_mode = 0o640;
    const script = required(
      plan.files.find(
        (item) => item.target.path === ".trellis/scripts/task.py",
      ),
    );
    script.owner = "preserve";
    script.action = "preserve";
    delete script.target_content_base64;
    delete script.target_mode;
    await expect(execute()).rejects.toThrow(
      "Prospective template/runtime mismatch",
    );
    expect(snapshot()).toEqual(before);
  });
  it("validates reviewed current slice artifacts, authority and exact candidate bytes", async () => {
    const task = required(plan.tasks[0]),
      workflow = required(plan.workflows[0]).contract as WorkflowContract;
    const scope = {
      locator: `${ref}/prd.md`,
      revision: `sha256:${rawMigrationDigest("Entire accepted task scope\n")}`,
    };
    const id = "00000000-0000-0000-0000-000000000001",
      key = { task_id: "main-task", lifecycle_generation: 0, delivery_id: id };
    let record = parseTaskRecordV2(task.record);
    const apply = (operation: TaskOperation): void => {
      record = applyTaskOperation(record, operation, workflow).record;
    };
    apply({
      api_version: "1.0",
      operation: "accept_scope",
      owner_role: "task_scope",
      owner_id: workflow.owners.task_scope,
      key: { task_id: "main-task", lifecycle_generation: 0 },
      authority: scope,
    });
    apply({
      api_version: "1.0",
      operation: "create_delivery",
      owner_role: "creation",
      owner_id: workflow.owners.creation,
      key,
      profile: "manual",
      scope_ref: { authority: scope, anchors: ["R1"] },
    });
    apply({
      api_version: "1.0",
      operation: "record_gate",
      owner_role: "planning",
      owner_id: workflow.owners.planning,
      key,
      expected_phase: "planning",
      result: {
        result_id: "original-plan",
        owner_id: workflow.owners.planning,
        owner_role: "planning",
        outcome: "accepted",
        scope_ref: { authority: scope, anchors: ["R1"] },
        plan_ref: scope,
        candidate: null,
        predecessor_result_id: null,
        evidence: [scope],
        obligations: [],
      },
    });
    write("payload.bin", "actual candidate", 0o600);
    const candidate = {
      kind: "git_free" as const,
      content_ref: computeCandidateContentRef(
        root,
        ["payload.bin"],
        "git_free",
      ),
      paths: ["payload.bin"],
      head_ref: null,
      base_ref: null,
    };
    apply({
      api_version: "1.0",
      operation: "begin_check",
      owner_role: "implementation",
      owner_id: workflow.owners.implementation,
      key,
      expected_phase: "implementing",
      candidate,
    });
    task.record = record;
    plan.files.push({
      target: { kind: "project", workspace: "main", path: "payload.bin" },
      owner: "preserve",
      action: "preserve",
      source: raw("actual candidate", 0o600),
    });
    const before = snapshot();
    await expect(execute()).rejects.toThrow(
      "Missing reviewed Delivery planning artifact",
    );
    expect(snapshot()).toEqual(before);
    for (const name of [
      "prd.md",
      "design.md",
      "implement.md",
      "implement.jsonl",
      "check.jsonl",
    ])
      plan.files.push({
        target: {
          kind: "project",
          workspace: "main",
          path: `${ref}/deliveries/${id}/${name}`,
        },
        owner: "artifact",
        action: "write",
        source: null,
        target_content_base64: b64(
          name.endsWith("jsonl") ? "" : "Reviewed slice planning\n",
        ),
        target_mode: 0o644,
      });
    const delivery = required(record.deliveries[0]);
    if (!delivery.candidate) throw new Error("fixture candidate");
    delivery.candidate.content_ref = `sha256:${"0".repeat(64)}`;
    await expect(execute()).rejects.toThrow("candidate bytes/modes mismatch");
    expect(snapshot()).toEqual(before);
    delivery.candidate.content_ref = candidate.content_ref;
    record.accepted_scope = { ...scope, revision: `sha256:${"0".repeat(64)}` };
    await expect(execute()).rejects.toThrow();
    expect(snapshot()).toEqual(before);
    record.accepted_scope = scope;
    await execute();
    const python = process.platform === "win32" ? "python" : "python3";
    execFileSync(
      python,
      [
        file(".trellis/scripts/delivery.py"),
        "select",
        "--task",
        file(ref),
        "--delivery",
        id,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          TRELLIS_CONTEXT_ID: "migration-active",
          PYTHONDONTWRITEBYTECODE: "1",
        },
      },
    );
    const current = JSON.parse(
      execFileSync(
        python,
        [file(".trellis/scripts/delivery.py"), "current", "--json"],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            TRELLIS_CONTEXT_ID: "migration-active",
            PYTHONDONTWRITEBYTECODE: "1",
          },
        },
      ),
    );
    expect(current).toMatchObject({
      kind: "current",
      delivery: { id, phase: "checking" },
    });
  });
  it.each([
    { action: "write", force: false },
    { action: "write", force: true },
    { action: "preserve", force: false },
    { action: "preserve", force: true },
  ] as const)(
    "retains reviewed custom workflow ownership through migration replay and update ($action/force=$force)",
    async ({ action, force }) => {
      const custom = deliveryWorkflowMdTemplate.replaceAll(
        '"trellis-start"',
        '"custom-workflow-start"',
      );
      const workflow = required(
        plan.files.find((item) => item.owner === "workflow"),
      );
      const staleReceipt = JSON.stringify({
        __version: 2,
        hashes: { ".trellis/workflow.md": computeHash(custom) },
      });
      write(".trellis/.template-hashes.json", staleReceipt);
      required(plan.installations[0]).receipt_source = raw(staleReceipt);
      required(plan.workflows[0]).contract =
        readDeliveryWorkflowContract(custom);
      required(plan.workflows[0]).template_id = "custom-workflow";
      if (action === "write") workflow.target_content_base64 = b64(custom);
      else {
        write(".trellis/workflow.md", custom);
        workflow.action = "preserve";
        workflow.source = raw(custom);
        delete workflow.target_content_base64;
        delete workflow.target_mode;
      }
      const before = snapshot();
      const preview = await execute(true);
      expect(preview.conflicts).toEqual([]);
      expect(snapshot()).toEqual(before);
      await execute();
      expect(loadHashes(root)[".trellis/workflow.md"]).toBeUndefined();
      const migrated = snapshot();
      await execute();
      expect(snapshot()).toEqual(migrated);
      await update({ force });
      expect(fs.readFileSync(file(".trellis/workflow.md"), "utf8")).toBe(
        custom,
      );
      expect(loadHashes(root)[".trellis/workflow.md"]).toBeUndefined();
      expect(
        readDeliveryWorkflowContract(
          fs.readFileSync(file(".trellis/workflow.md"), "utf8"),
        )?.owners.creation,
      ).toBe("custom-workflow-start");
      const runtime = JSON.parse(
        execFileSync(
          process.platform === "win32" ? "python" : "python3",
          [
            "-B",
            file(".trellis/scripts/get_context.py"),
            "--mode",
            "runtime-contract",
          ],
          { cwd: root, encoding: "utf8" },
        ),
      );
      expect(runtime.owners.creation).toBe("custom-workflow-start");
    },
  );
  it("rejects missing workflow identity and a forged bundled identity before writes", async () => {
    const omitted = JSON.parse(JSON.stringify(plan));
    delete omitted.workflows[0].template_id;
    expect(migrationPlan2Schema.safeParse(omitted).success).toBe(false);
    const custom = deliveryWorkflowMdTemplate.replaceAll(
      '"trellis-start"',
      '"custom-workflow-start"',
    );
    required(
      plan.files.find((item) => item.owner === "workflow"),
    ).target_content_base64 = b64(custom);
    required(plan.workflows[0]).contract = readDeliveryWorkflowContract(custom);
    const before = snapshot();
    await expect(execute()).rejects.toThrow(
      "Bundled workflow identity/content mismatch",
    );
    expect(snapshot()).toEqual(before);
  });
  it.each(["write", "preserve"] as const)(
    "tracks explicitly bundled workflow target after migration %s and reapply",
    async (action) => {
      const workflow = required(
        plan.files.find((item) => item.owner === "workflow"),
      );
      if (action === "preserve") {
        write(".trellis/workflow.md", deliveryWorkflowMdTemplate);
        workflow.action = "preserve";
        workflow.source = raw(deliveryWorkflowMdTemplate);
        delete workflow.target_content_base64;
        delete workflow.target_mode;
      }
      await execute();
      expect(loadHashes(root)[".trellis/workflow.md"]).toBe(
        computeHash(deliveryWorkflowMdTemplate),
      );
      const migrated = snapshot();
      await execute();
      expect(snapshot()).toEqual(migrated);
      await update({ force: true });
      expect(fs.readFileSync(file(".trellis/workflow.md"), "utf8")).toBe(
        deliveryWorkflowMdTemplate,
      );
      expect(loadHashes(root)[".trellis/workflow.md"]).toBe(
        computeHash(deliveryWorkflowMdTemplate),
      );
    },
  );
  it("does not infer bundled ownership from byte-identical user-managed content", async () => {
    required(plan.workflows[0]).template_id = "custom-explicit-copy";
    await execute();
    expect(loadHashes(root)[".trellis/workflow.md"]).toBeUndefined();
    await update({ force: true });
    expect(fs.readFileSync(file(".trellis/workflow.md"), "utf8")).toBe(
      deliveryWorkflowMdTemplate,
    );
    expect(loadHashes(root)[".trellis/workflow.md"]).toBeUndefined();
  });
  it("recovers custom workflow ownership after lost receipt output and restores exact reviewed rollback paths", async () => {
    const custom = deliveryWorkflowMdTemplate.replaceAll(
      '"trellis-start"',
      '"custom-workflow-start"',
    );
    const workflow = required(
      plan.files.find((item) => item.owner === "workflow"),
    );
    workflow.target_content_base64 = b64(custom);
    const entry = required(plan.workflows[0]);
    entry.template_id = "custom-workflow";
    entry.contract = readDeliveryWorkflowContract(custom);
    const staleReceipt = JSON.stringify({
      __version: 2,
      hashes: {
        ".trellis/workflow.md": computeHash(custom),
        "unrelated.txt": "a".repeat(64),
      },
    });
    write(".trellis/.template-hashes.json", staleReceipt);
    required(plan.installations[0]).receipt_source = raw(staleReceipt);
    const before = snapshot(),
      preview = await execute(true);
    const backup = new Map(
      preview.actions.map((action) => [
        action.path,
        fs.existsSync(action.path)
          ? raw(
              fs.readFileSync(action.path),
              fs.statSync(action.path).mode & 0o777,
            )
          : null,
      ]),
    );
    const actual = atomic.writeFileAtomic;
    vi.spyOn(atomic, "writeFileAtomic").mockImplementation((...args) => {
      actual(...args);
      if (args[0] === file(".trellis/.template-hashes.json"))
        throw new Error("lost receipt output");
    });
    await expect(execute()).rejects.toThrow("lost receipt output");
    vi.restoreAllMocks();
    expect(loadHashes(root)[".trellis/workflow.md"]).toBeUndefined();
    expect(loadHashes(root)["unrelated.txt"]).toBe("a".repeat(64));
    const receipt = fs.readFileSync(file(".trellis/.template-hashes.json"));
    write(
      ".trellis/.template-hashes.json",
      Buffer.concat([receipt, Buffer.from("\n")]),
    );
    const drift = snapshot();
    await expect(execute()).rejects.toThrow("third_state");
    expect(snapshot()).toEqual(drift);
    write(".trellis/.template-hashes.json", receipt);
    await execute();
    const migrated = snapshot();
    await execute();
    expect(snapshot()).toEqual(migrated);
    for (const action of [...preview.actions].reverse()) {
      if (action.action === "preserve") continue;
      const original = backup.get(action.path);
      if (original) {
        fs.writeFileSync(
          action.path,
          Buffer.from(original.content_base64, "base64"),
        );
        fs.chmodSync(action.path, original.mode);
      } else if (fs.existsSync(action.path)) fs.unlinkSync(action.path);
    }
    expect(snapshot()).toEqual(before);
    await execute();
    expect(loadHashes(root)[".trellis/workflow.md"]).toBeUndefined();
    expect(fs.readFileSync(file(".trellis/workflow.md"), "utf8")).toBe(custom);
  });
  it.each([
    { timing: "existing", content: "{corrupt" },
    {
      timing: "existing",
      content: JSON.stringify({
        schema_version: 2,
        task_id: "main-task",
        lifecycle_generation: 0,
      }),
    },
    { timing: "after preview", content: "{corrupt" },
    {
      timing: "after preview",
      content: JSON.stringify({
        schema_version: 2,
        task_id: "main-task",
        lifecycle_generation: 0,
      }),
    },
  ])(
    "rejects unreviewed $timing session bytes without refreezing them ($content)",
    async ({ timing, content }) => {
      if (timing === "after preview")
        expect((await execute(true)).conflicts).toEqual([]);
      write(".trellis/.runtime/sessions/unreviewed.json", content, 0o600);
      const before = snapshot();
      await expect(execute(true)).rejects.toThrow(
        "missing_session_disposition",
      );
      expect(snapshot()).toEqual(before);
      await expect(execute()).rejects.toThrow("missing_session_disposition");
      expect(snapshot()).toEqual(before);
    },
  );
  it("requires a session disposition even when a generic file decision preserves its bytes", async () => {
    const name = ".trellis/.runtime/sessions/retained.json",
      content =
        '{"schema_version":2,"task_id":"old-task","lifecycle_generation":0}';
    write(name, content, 0o600);
    plan.files.push({
      target: { kind: "project", workspace: "main", path: name },
      owner: "preserve",
      action: "preserve",
      source: raw(content, 0o600),
    });
    const before = snapshot();
    await expect(execute()).rejects.toThrow("missing_session_disposition");
    expect(snapshot()).toEqual(before);
  });
  it("preserves explicitly reviewed session snapshots and refuses raw byte or mode drift across replay", async () => {
    const name = ".trellis/.runtime/sessions/retained.json",
      content =
        '{"schema_version":2,"task_id":"old-task","lifecycle_generation":0}';
    write(name, content, 0o600);
    plan.sessions.push({
      target: {
        kind: "local_session",
        workspace: "main",
        filename: "retained.json",
      },
      source: raw(content, 0o600),
    });
    const before = snapshot();
    const preview = await execute(true);
    expect(preview.actions).toContainEqual({
      path: file(name),
      action: "preserve",
      before_sha256: rawMigrationDigest(content),
      after_sha256: rawMigrationDigest(content),
      before_mode: 0o600,
      after_mode: 0o600,
    });
    expect(snapshot()).toEqual(before);
    for (const [bytes, mode] of [
      ["{corrupt", 0o600],
      [content, 0o644],
    ] as const) {
      write(name, bytes, mode);
      const changed = snapshot();
      await expect(execute()).rejects.toThrow("third_state");
      expect(snapshot()).toEqual(changed);
    }
    write(name, content, 0o600);
    await execute();
    expect(fs.readFileSync(file(name), "utf8")).toBe(content);
    expect(fs.statSync(file(name)).mode & 0o777).toBe(0o600);
    const migrated = snapshot();
    await execute();
    expect(snapshot()).toEqual(migrated);
  });
  it.each(["existing", "dangling"] as const)(
    "reads fixed Git authority independently of a later %s symlink while refusing SHA and write targets",
    async (targetKind) => {
      const locator = "historical-authority.md";
      const accepted = "accepted original scope";
      execFileSync("git", ["init", "-q", root], { stdio: "pipe" });
      write(locator, accepted, 0o644);
      execFileSync("git", ["-C", root, "add", locator], { stdio: "pipe" });
      execFileSync(
        "git",
        [
          "-C",
          root,
          "-c",
          "user.name=Test",
          "-c",
          "user.email=test@example.invalid",
          "commit",
          "-qm",
          "fixed authority",
        ],
        { stdio: "pipe" },
      );
      const commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
      const target = "current-authority.md";
      if (targetKind === "existing") write(target, "unrelated current bytes");
      fs.unlinkSync(file(locator));
      fs.symlinkSync(target, file(locator));
      const task = required(plan.tasks[0]),
        record = parseTaskRecordV2(task.record);
      record.accepted_scope = {
        locator,
        revision: `sha256:${rawMigrationDigest(accepted)}`,
      };
      task.record = record;
      const before = snapshot();
      await expect(execute()).rejects.toThrow(
        /Symlink migration target.*historical-authority/,
      );
      expect(snapshot()).toEqual(before);
      record.accepted_scope = { locator, revision: commit };
      const preview = await execute(true);
      expect(preview.conflicts).toEqual([]);
      expect(snapshot()).toEqual(before);
      const script = ".trellis/scripts/task.py";
      fs.mkdirSync(path.dirname(file(script)), { recursive: true });
      fs.symlinkSync(file(locator), file(script));
      const linked = snapshot();
      await expect(execute()).rejects.toThrow(
        /Symlink migration target.*scripts\/task.py/,
      );
      expect(snapshot()).toEqual(linked);
      expect(fs.lstatSync(file(script)).isSymbolicLink()).toBe(true);
      fs.unlinkSync(file(script));
      await execute();
      expect(fs.lstatSync(file(locator)).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(file(locator))).toBe(target);
      const migrated = snapshot();
      await execute();
      expect(snapshot()).toEqual(migrated);
    },
  );
  it.each(["sha1", "sha256"] as const)(
    "verifies retained local commit tree bytes and modes independently of the current worktree (%s)",
    async (objectFormat) => {
      execFileSync(
        "git",
        ["init", "-q", `--object-format=${objectFormat}`, root],
        { stdio: "pipe" },
      );
      const committed = "actual committed content";
      write("payload.bin", committed, 0o644);
      execFileSync("git", ["-C", root, "add", "payload.bin"], {
        stdio: "pipe",
      });
      execFileSync(
        "git",
        [
          "-C",
          root,
          "-c",
          "user.name=Test",
          "-c",
          "user.email=test@example.invalid",
          "commit",
          "-qm",
          "real outcome",
        ],
        { stdio: "pipe" },
      );
      const commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
      const task = required(plan.tasks[0]);
      const old = JSON.parse(
        Buffer.from(required(task.source).content_base64, "base64").toString(
          "utf8",
        ),
      );
      old.commit = commit;
      const bytes = JSON.stringify(old);
      task.source = raw(bytes);
      write(`${ref}/task.json`, bytes);
      const record = parseTaskRecordV2(task.record);
      const scope = {
        locator: `${ref}/prd.md`,
        revision: `sha256:${rawMigrationDigest("Entire accepted task scope\n")}`,
      };
      const candidate = {
        kind: "git" as const,
        head_ref: commit,
        base_ref: null,
        paths: ["payload.bin"],
        content_ref: `sha256:${"0".repeat(64)}`,
      };
      const fact: DeliveryFact = {
        result_id: "real-local-outcome",
        owner_id: "original-owner",
        evidence: [scope],
        profile: "local_commit",
        candidate,
        commit,
      };
      const id = "00000000-0000-0000-0000-000000000099";
      record.accepted_scope = scope;
      record.deliveries = [
        {
          id,
          lifecycle_generation: 0,
          scope_ref: { authority: scope, anchors: ["R1"] },
          planning_root: `deliveries/${id}`,
          profile: "local_commit",
          phase: "delivered",
          plan_ref: null,
          candidate,
          results: {
            planning: null,
            check: null,
            full_review: null,
            readiness: null,
          },
          publication_result: null,
          stop_result: null,
          delivery_result: fact,
        },
      ];
      task.record = record;
      task.legacy_facts = [
        {
          field: "commit",
          disposition: "result",
          owner_id: fact.owner_id,
          result_id: fact.result_id,
          reason: scope,
        },
      ];
      for (const name of [
        "prd.md",
        "design.md",
        "implement.md",
        "implement.jsonl",
        "check.jsonl",
      ])
        plan.files.push({
          target: {
            kind: "project",
            workspace: "main",
            path: `${ref}/deliveries/${id}/${name}`,
          },
          owner: "artifact",
          action: "write",
          source: null,
          target_content_base64: b64(""),
          target_mode: 0o644,
        });
      const before = snapshot();
      for (const [mode, content] of [
        [0o644, null],
        [0o644, "wrong committed content"],
        [0o755, committed],
      ] as const) {
        candidate.content_ref =
          content === null
            ? `sha256:${"0".repeat(64)}`
            : `sha256:${rawMigrationDigest(JSON.stringify([["payload.bin", mode, rawMigrationDigest(content)]]))}`;
        await expect(execute()).rejects.toThrow(/candidate|commit tree/);
        expect(snapshot()).toEqual(before);
      }
      candidate.content_ref = `sha256:${rawMigrationDigest(JSON.stringify([["payload.bin", 0o644, rawMigrationDigest(committed)]]))}`;
      // A later HEAD/worktree no longer represents the retained immutable outcome.
      write("payload.bin", "later worktree content", 0o755);
      execFileSync("git", ["-C", root, "add", "payload.bin"], {
        stdio: "pipe",
      });
      execFileSync(
        "git",
        [
          "-C",
          root,
          "-c",
          "user.name=Test",
          "-c",
          "user.email=test@example.invalid",
          "commit",
          "-qm",
          "later work",
        ],
        { stdio: "pipe" },
      );
      await execute();
      expect(fs.readFileSync(file("payload.bin"), "utf8")).toBe(
        "later worktree content",
      );
      expect(
        parseTaskRecordV2(
          JSON.parse(fs.readFileSync(file(`${ref}/task.json`), "utf8")),
        ).deliveries[0]?.delivery_result,
      ).toEqual(fact);
    },
  );
  it("preserves arbitrary business meta locator/revision pairs without treating them as authority", async () => {
    const task = required(plan.tasks[0]),
      record = parseTaskRecordV2(task.record);
    const old = JSON.parse(
      Buffer.from(required(task.source).content_base64, "base64").toString(
        "utf8",
      ),
    );
    old.meta.asset = { locator: "assets/image.png", revision: "revision-17" };
    const bytes = JSON.stringify(old);
    task.source = raw(bytes);
    write(`${ref}/task.json`, bytes);
    record.meta = old.meta;
    task.record = record;
    required(task.legacy_facts?.[0]).reason.revision =
      `sha256:${rawMigrationDigest(bytes)}`;
    await execute();
    expect(
      JSON.parse(fs.readFileSync(file(`${ref}/task.json`), "utf8")).meta.asset,
    ).toEqual(old.meta.asset);
  });
  it("rejects omitted evidence-only archive identity occupation without any writes", async () => {
    write(
      ".trellis/tasks/archive/2025-01/01-01-main-task/evidence.md",
      "Historic evidence",
      0o600,
    );
    const before = snapshot();
    await expect(execute()).rejects.toThrow(/occupation|collision|inventory/);
    expect(snapshot()).toEqual(before);
  });
  it.each([
    ".trellis/tasks/archive/2025-01/01-01-evidence-only",
    ".trellis/tasks/01-01-evidence-only",
  ])(
    "preserves explicitly reviewed missing-record evidence roots and enforces absence on retry (%s)",
    async (taskRef) => {
      const artifact = `${taskRef}/evidence.md`;
      write(artifact, "Historic evidence", 0o600);
      const emptyRef = `${taskRef}-empty`;
      fs.mkdirSync(file(emptyRef));
      for (const task_ref of [taskRef, emptyRef])
        plan.tasks.push({
          workspace: "main",
          task_ref,
          disposition: "history_only",
          source: null,
        });
      const before = snapshot();
      await expect(execute()).rejects.toThrow("artifact disposition");
      expect(snapshot()).toEqual(before);
      plan.files.push({
        target: { kind: "project", workspace: "main", path: artifact },
        owner: "preserve",
        action: "preserve",
        source: raw("Historic evidence", 0o600),
      });
      const preview = await execute(true);
      expect(preview.actions).toContainEqual({
        path: file(`${taskRef}/task.json`),
        action: "preserve",
        before_sha256: null,
        after_sha256: null,
        before_mode: null,
        after_mode: null,
      });
      expect(snapshot()).toEqual(before);
      await execute();
      expect(fs.readFileSync(file(artifact), "utf8")).toBe("Historic evidence");
      expect(fs.statSync(file(artifact)).mode & 0o777).toBe(0o600);
      for (const occupied of [taskRef, emptyRef])
        expect(fs.existsSync(file(`${occupied}/task.json`))).toBe(false);
      await execute();
      write(`${taskRef}/task.json`, '{"id":"third-state"}');
      const changed = snapshot();
      await expect(execute()).rejects.toThrow("third_state");
      expect(snapshot()).toEqual(changed);
    },
  );
  it("rejects explicitly inventoried missing-record visible collisions and null conversion sources", async () => {
    const taskRef = ".trellis/tasks/archive/2025-01/1-1-MAIN-TASK";
    fs.mkdirSync(file(taskRef), { recursive: true });
    plan.tasks.push({
      workspace: "main",
      task_ref: taskRef,
      disposition: "history_only",
      source: null,
    });
    const before = snapshot();
    await expect(execute()).rejects.toThrow("visible-name occupation");
    expect(snapshot()).toEqual(before);
    required(plan.tasks[0]).source = null;
    expect(migrationPlan2Schema.safeParse(plan).success).toBe(false);
  });
  it("preserves frozen Codex model keys across migration and partial retry without accepting third states", async () => {
    const name = ".codex/agents/trellis-check.toml";
    const receipt = JSON.stringify({
      __version: 2,
      hashes: { [name]: "a".repeat(64) },
    });
    write(".trellis/.template-hashes.json", receipt);
    required(plan.installations[0]).receipt_source = raw(receipt);
    write(name, "", 0o600);
    const generic = required(collectMigration2Templates(root).get(name));
    const custom = generic.replace(
      'sandbox_mode = "workspace-write"',
      'sandbox_mode = "workspace-write"\nmodel = "gpt-6-astra"\nmodel_reasoning_effort = "high"',
    );
    write(name, custom, 0o600);
    const templates = collectMigration2Templates(root);
    plan.templates = [
      { workspace: "main", ...migration2TemplateCandidate(templates) },
    ];
    plan.files = plan.files.filter((decision) => decision.owner !== "template");
    for (const [path, content] of templates)
      plan.files.push({
        target: { kind: "project", workspace: "main", path },
        owner: "template",
        action: "write",
        source: path === name ? raw(custom, 0o600) : null,
        target_content_base64: b64(content),
        target_mode: /\.(py|sh)$/.test(path) ? 0o755 : 0o644,
      });
    const genericTemplates = new Map(templates);
    genericTemplates.set(name, generic);
    plan.templates = [
      { workspace: "main", ...migration2TemplateCandidate(genericTemplates) },
    ];
    const beforeDefaults = snapshot();
    await expect(execute()).rejects.toThrow(
      "Frozen template candidate mismatch",
    );
    expect(snapshot()).toEqual(beforeDefaults);
    plan.templates = [
      { workspace: "main", ...migration2TemplateCandidate(templates) },
    ];
    const actual = atomic.writeFileAtomic;
    let calls = 0;
    vi.spyOn(atomic, "writeFileAtomic").mockImplementation((...args) => {
      if (++calls === 4) throw new Error("ordinary IO failure");
      actual(...args);
    });
    await expect(execute()).rejects.toThrow("ordinary IO failure");
    vi.restoreAllMocks();
    write(name, custom.replace("gpt-6-astra", "edited-partial-state"), 0o600);
    const partialChanged = snapshot();
    await expect(execute()).rejects.toThrow("third_state");
    expect(snapshot()).toEqual(partialChanged);
    write(name, custom, 0o600);
    await execute();
    expect(fs.readFileSync(file(name), "utf8")).toContain(
      'model = "gpt-6-astra"',
    );
    expect(fs.readFileSync(file(name), "utf8")).toContain(
      'model_reasoning_effort = "high"',
    );
    const migrated = snapshot();
    await execute();
    expect(snapshot()).toEqual(migrated);
    write(
      name,
      fs
        .readFileSync(file(name), "utf8")
        .replace("gpt-6-astra", "user-third-state"),
      0o644,
    );
    const changed = snapshot();
    await expect(execute()).rejects.toThrow(/third_state|Frozen template/);
    expect(snapshot()).toEqual(changed);
  });
  it("requires explicit attribution of real old outcomes and permits reviewed raw malformed archives", async () => {
    const task = required(plan.tasks[0]);
    delete task.legacy_facts;
    const before = snapshot();
    await expect(execute()).rejects.toThrow(
      "Unresolved legacy fact attribution",
    );
    expect(snapshot()).toEqual(before);
    task.legacy_facts = [
      {
        field: "commit",
        disposition: "result",
        owner_id: "original-owner",
        result_id: "invented-result",
        reason: {
          locator: `${ref}/migration/source-task.json`,
          revision: `sha256:${required(task.source).sha256}`,
        },
      },
    ];
    await expect(execute()).rejects.toThrow("owner/identity mismatch");
    task.legacy_facts[0] = {
      field: "commit",
      disposition: "source_snapshot",
      owner_id: "original-owner",
      reason: {
        locator: `${ref}/migration/source-task.json`,
        revision: `sha256:${required(task.source).sha256}`,
      },
    };
    for (const [name, bytes] of [
      ["old-broken", "bad JSON"],
      ["old-missing", '{"status":"done"}'],
    ] as const) {
      const archive = `.trellis/tasks/archive/2026-09/${name}`;
      write(`${archive}/task.json`, bytes, 0o600);
      plan.tasks.push({
        workspace: "main",
        task_ref: archive,
        disposition: "history_only",
        source: raw(bytes, 0o600),
      });
    }
    await execute();
    expect(
      fs.readFileSync(
        file(".trellis/tasks/archive/2026-09/old-broken/task.json"),
        "utf8",
      ),
    ).toBe("bad JSON");
  });
  it.each(["workflow", "tasks", "task"])(
    "preserves established %s storage aliases and rejects nested artifact links",
    async (alias) => {
      const location =
        alias === "workflow"
          ? ".trellis"
          : alias === "tasks"
            ? ".trellis/tasks"
            : ref;
      const storage = `${root}-storage`;
      fs.renameSync(file(location), storage);
      fs.symlinkSync(storage, file(location), "dir");
      try {
        const before = snapshot(storage);
        await execute(true);
        expect(snapshot(storage)).toEqual(before);
        await execute();
        expect(
          JSON.parse(fs.readFileSync(file(`${ref}/task.json`), "utf8"))
            .schema_version,
        ).toBe("2.0");
        fs.symlinkSync(os.tmpdir(), file(`${ref}/nested`), "dir");
        await expect(execute()).rejects.toThrow("Symlink task artifact");
      } finally {
        fs.rmSync(file(location), { force: true });
        fs.rmSync(storage, { recursive: true, force: true });
      }
    },
  );
  it.each(["0.6.16", "0.7.0-castbox.2"])(
    "migrates actual old-copy source %s and serves the installed public runtime",
    async (version) => {
      plan.source.version = version;
      const installation = required(plan.installations[0]);
      installation.version_source = raw(version);
      write(".trellis/.version", version);
      const script = required(
        plan.files.find(
          (item) => item.target.path === ".trellis/scripts/task.py",
        ),
      );
      const legacyScript = "# old installation entry\n";
      write(script.target.path, legacyScript, 0o700);
      script.source = raw(legacyScript, 0o700);
      save();
      const before = snapshot();
      await migrate({ from: version, plan: planPath, dryRun: true });
      expect(snapshot()).toEqual(before);
      await migrate({ from: version, plan: planPath });
      const python = process.platform === "win32" ? "python" : "python3";
      const result = JSON.parse(
        execFileSync(
          python,
          [file(".trellis/scripts/delivery.py"), "contract", "--json"],
          {
            cwd: root,
            encoding: "utf8",
            env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
          },
        ),
      );
      expect(result).toMatchObject({ task_schema: "2.0", delivery_api: "1.0" });
      const document = fs.readFileSync(
        file(".trellis/delivery-contract.md"),
        "utf8",
      );
      expect(document).toContain("2.0");
      expect(document).toContain("1.0");
      const context = execFileSync(
        python,
        [
          file(".trellis/scripts/get_context.py"),
          "--mode",
          "continuation",
          "--json",
        ],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            TRELLIS_CONTEXT_ID: "migration-unselected",
            PYTHONDONTWRITEBYTECODE: "1",
          },
        },
      );
      expect(context).toContain("Delivery");
      expect(context).toContain("workflow");
      expect(context).not.toContain("missing_runtime_contract");
      expect(fs.statSync(file(script.target.path)).mode & 0o777).toBe(0o755);
    },
  );
  it("isolates live registry Git discovery from redirected ambient Git configuration", async () => {
    const other = `${root}-other-repo`;
    fs.mkdirSync(other);
    try {
      for (const directory of [root, other]) {
        execFileSync("git", ["init", directory], { stdio: "pipe" });
        // Detached auto-maintenance can change .git after commit returns,
        // racing the full unrelated-repository preservation snapshot below.
        execFileSync(
          "git",
          [
            "-C",
            directory,
            "-c",
            "maintenance.auto=false",
            "-c",
            "gc.auto=0",
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "--allow-empty",
            "-m",
            "fixture",
          ],
          { stdio: "pipe" },
        );
      }
      vi.stubEnv("GIT_DIR", path.join(other, ".git"));
      vi.stubEnv("GIT_WORK_TREE", other);
      vi.stubEnv("GIT_CONFIG_COUNT", "1");
      vi.stubEnv("GIT_CONFIG_KEY_0", "core.worktree");
      vi.stubEnv("GIT_CONFIG_VALUE_0", other);
      const before = snapshot(other);
      await execute();
      expect(snapshot(other)).toEqual(before);
      expect(
        JSON.parse(fs.readFileSync(file(`${ref}/task.json`), "utf8"))
          .schema_version,
      ).toBe("2.0");
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(other, { recursive: true, force: true });
    }
  });
  it("migrates registered sibling worktrees and common-dir sessions without checkout-local fallbacks", async () => {
    execFileSync("git", ["init", root]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "--allow-empty",
      "-m",
      "fixture",
    ]);
    const sibling = `${root}-sibling`;
    execFileSync("git", [
      "-C",
      root,
      "worktree",
      "add",
      "-b",
      "migration-sibling",
      sibling,
    ]);
    try {
      seedWorkspace("sibling", sibling);
      const common = path.join(root, ".git");
      fs.mkdirSync(path.join(common, "trellis/sessions"), { recursive: true });
      const old = {
        schema_version: 2,
        task_id: "sibling-task",
        lifecycle_generation: 0,
      };
      const session = path.join(common, "trellis/sessions/context.json");
      fs.writeFileSync(session, JSON.stringify(old));
      fs.chmodSync(session, 0o600);
      plan.sessions.push({
        target: { kind: "common_session", filename: "context.json" },
        source: raw(JSON.stringify(old), 0o600),
        record: { ...old, schema_version: 3, delivery_id: null },
      });
      const localSource = JSON.stringify({
        schema_version: 2,
        task_id: "obsolete-local-pointer",
        lifecycle_generation: 0,
      });
      for (const workspace of plan.workspaces) {
        const directory = path.join(
          workspace.root,
          ".trellis/.runtime/sessions",
        );
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, "old-local.json"), localSource);
        fs.chmodSync(path.join(directory, "old-local.json"), 0o600);
        plan.sessions.push({
          target: {
            kind: "local_session",
            workspace: workspace.id,
            filename: "old-local.json",
          },
          source: raw(localSource, 0o600),
        });
      }
      const before = snapshot(),
        beforeSibling = snapshot(sibling);
      const commonDecision = required(plan.sessions.shift());
      await expect(execute()).rejects.toThrow("missing_session_disposition");
      expect(snapshot()).toEqual(before);
      expect(snapshot(sibling)).toEqual(beforeSibling);
      plan.sessions.unshift(commonDecision);
      await execute(true);
      expect(snapshot()).toEqual(before);
      expect(snapshot(sibling)).toEqual(beforeSibling);
      await execute();
      for (const workspace of plan.workspaces) {
        const local = path.join(
          workspace.root,
          ".trellis/.runtime/sessions/old-local.json",
        );
        expect(fs.readFileSync(local, "utf8")).toBe(localSource);
        expect(fs.statSync(local).mode & 0o777).toBe(0o600);
      }
      expect(JSON.parse(fs.readFileSync(session, "utf8")).schema_version).toBe(
        3,
      );
      expect(
        JSON.parse(
          fs.readFileSync(path.join(sibling, ref, "task.json"), "utf8"),
        ).schema_version,
      ).toBe("2.0");
      await execute();
    } finally {
      execFileSync("git", [
        "-C",
        root,
        "worktree",
        "remove",
        "--force",
        sibling,
      ]);
    }
  });

  describe("Git prunable workspace discovery", () => {
    let sibling: string;
    beforeEach(() => {
      sibling = "";
    });
    afterEach(() => {
      if (sibling) fs.rmSync(sibling, { recursive: true, force: true });
    });
    function worktreeSnapshot() {
      return {
        main: snapshot(),
        sibling: sibling && fs.existsSync(sibling) ? snapshot(sibling) : null,
      };
    }
    function registeredSibling(): string {
      execFileSync("git", ["init", "-q", "-b", "main", root]);
      execFileSync("git", [
        "-C",
        root,
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--allow-empty",
        "-qm",
        "Fixture",
      ]);
      sibling = `${root}-registered sibling`;
      execFileSync("git", [
        "-C",
        root,
        "worktree",
        "add",
        "-q",
        "-b",
        "sibling",
        sibling,
      ]);
      return sibling;
    }
    function listing(): string {
      return execFileSync("git", [
        "-C",
        root,
        "worktree",
        "list",
        "--porcelain",
        "-z",
      ]).toString();
    }
    async function markPrunable(directory: string): Promise<void> {
      const original = (
        await vi.importActual<typeof import("node:child_process")>(
          "node:child_process",
        )
      ).execFileSync;
      vi.spyOn(childProcess, "execFileSync").mockImplementation((...args) => {
        const bytes = original(...args);
        if (
          Array.isArray(args[1]) &&
          args[1].includes("--porcelain") &&
          args[1].includes("-z")
        ) {
          return Buffer.from(
            bytes
              .toString()
              .split("\0\0")
              .map((record) =>
                record.startsWith(`worktree ${directory}\0`)
                  ? `${record}\0prunable controlled stale registration`
                  : record,
              )
              .join("\0\0"),
          );
        }
        return bytes;
      });
    }

    it.each(["retained Trellis data", "deleted directory"])(
      "keeps the same reviewed dry-run valid beside an explicitly prunable sibling with %s",
      async (residue) => {
        const sibling = registeredSibling();
        const clean = await execute(true);
        const planBytes = fs.readFileSync(planPath);
        if (residue === "retained Trellis data") {
          fs.mkdirSync(path.join(sibling, ".trellis"));
          fs.writeFileSync(
            path.join(sibling, ".trellis/owner-data"),
            "Retained historical data\n",
          );
          fs.chmodSync(path.join(sibling, ".trellis/owner-data"), 0o640);
          fs.unlinkSync(path.join(sibling, ".git"));
        } else fs.rmSync(sibling, { recursive: true });
        expect(listing()).toContain("\0prunable ");
        const before = worktreeSnapshot();
        const preview = await execute(true);
        expect(preview).toEqual(clean);
        expect(fs.readFileSync(planPath)).toEqual(planBytes);
        expect(worktreeSnapshot()).toEqual(before);
      },
    );

    it("does not drop a live Trellis sibling from the reviewed inventory", async () => {
      const sibling = registeredSibling();
      fs.mkdirSync(path.join(sibling, ".trellis"));
      const before = worktreeSnapshot();
      await expect(execute(true)).rejects.toThrow(
        "Incomplete registered workspace inventory",
      );
      expect(worktreeSnapshot()).toEqual(before);
    });

    it("retains an absent-Git sibling unless Git explicitly reports it prunable", async () => {
      const sibling = registeredSibling();
      fs.mkdirSync(path.join(sibling, ".trellis"));
      fs.unlinkSync(path.join(sibling, ".git"));
      const original = (
        await vi.importActual<typeof import("node:child_process")>(
          "node:child_process",
        )
      ).execFileSync;
      vi.spyOn(childProcess, "execFileSync").mockImplementation((...args) => {
        const bytes = original(...args);
        if (
          Array.isArray(args[1]) &&
          args[1].includes("--porcelain") &&
          args[1].includes("-z")
        ) {
          return Buffer.from(
            bytes
              .toString()
              .split("\0")
              .filter((field) => !field.startsWith("prunable "))
              .join("\0"),
          );
        }
        return bytes;
      });
      const before = worktreeSnapshot();
      await expect(execute(true)).rejects.toThrow(
        "Incomplete registered workspace inventory",
      );
      expect(worktreeSnapshot()).toEqual(before);
    });

    it("rejects an inventoried prunable sibling with an extant corrupt Git entry", async () => {
      const sibling = registeredSibling();
      seedWorkspace("sibling", sibling);
      fs.writeFileSync(
        path.join(sibling, ".git"),
        `gitdir: ${path.join(root, "missing-gitdir")}\n`,
      );
      await markPrunable(sibling);
      expect(listing()).toContain("\0prunable ");
      const before = worktreeSnapshot();
      await expect(execute(true)).rejects.toThrow(
        /not a git repository|gitfile does not point to a valid repository/,
      );
      expect(worktreeSnapshot()).toEqual(before);
    });

    it("rejects an inventoried prunable location reused as a foreign repository", async () => {
      const sibling = registeredSibling();
      seedWorkspace("sibling", sibling);
      fs.unlinkSync(path.join(sibling, ".git"));
      execFileSync("git", ["init", "-q", "-b", "foreign", sibling]);
      await markPrunable(sibling);
      expect(listing()).toContain("\0prunable ");
      const before = worktreeSnapshot();
      await expect(execute(true)).rejects.toThrow(
        "Repository identity mismatch",
      );
      expect(worktreeSnapshot()).toEqual(before);
    });

    it("does not turn a real Git discovery failure into Git-free migration", async () => {
      const original = (
        await vi.importActual<typeof import("node:child_process")>(
          "node:child_process",
        )
      ).execFileSync;
      vi.spyOn(childProcess, "execFileSync").mockImplementation((...args) => {
        if (Array.isArray(args[1]) && args[1].includes("--show-toplevel")) {
          throw Object.assign(new Error("Controlled Git discovery failure"), {
            stderr: Buffer.from("fatal: discovery unavailable"),
          });
        }
        return original(...args);
      });
      const before = snapshot();
      await expect(execute(true)).rejects.toThrow(
        "Controlled Git discovery failure",
      );
      expect(snapshot()).toEqual(before);
    });

    it("does not treat a dangling invoking Git entry as Git-free", async () => {
      fs.symlinkSync(path.join(root, "missing-gitdir"), file(".git"));
      const before = snapshot();
      await expect(execute(true)).rejects.toThrow(/not a git repository/);
      expect(snapshot()).toEqual(before);
      expect(fs.readlinkSync(file(".git"))).toBe(
        path.join(root, "missing-gitdir"),
      );
    });

    it("retains actual worktree inventory query failures", async () => {
      registeredSibling();
      const original = (
        await vi.importActual<typeof import("node:child_process")>(
          "node:child_process",
        )
      ).execFileSync;
      vi.spyOn(childProcess, "execFileSync").mockImplementation((...args) => {
        if (
          Array.isArray(args[1]) &&
          args[1].includes("--porcelain") &&
          args[1].includes("-z")
        ) {
          throw new Error("Controlled Git inventory failure");
        }
        return original(...args);
      });
      const before = worktreeSnapshot();
      await expect(execute(true)).rejects.toThrow(
        "Controlled Git inventory failure",
      );
      expect(worktreeSnapshot()).toEqual(before);
    });

    it("keeps normal Git-free preview read-only", async () => {
      const before = snapshot();
      expect((await execute(true)).conflicts).toEqual([]);
      expect(snapshot()).toEqual(before);
    });
  });
});

function replaceSource(
  task: MigrationPlan2["tasks"][number],
  edit: (record: Record<string, unknown>) => void,
): void {
  const record = JSON.parse(
    Buffer.from(required(task.source).content_base64, "base64").toString(),
  ) as Record<string, unknown>;
  edit(record);
  task.source = raw(JSON.stringify(record), required(task.source).mode);
  const workspace = required(
    plan.workspaces.find((entry) => entry.id === task.workspace),
  );
  fs.writeFileSync(
    path.join(workspace.root, task.task_ref, "task.json"),
    Buffer.from(task.source.content_base64, "base64"),
  );
  fs.chmodSync(
    path.join(workspace.root, task.task_ref, "task.json"),
    task.source.mode,
  );
}

describe("binding-reviewed inherited registered Task copies", () => {
  it.each([false, true])(
    "migrates opposite bound authorities, preserves branch variants, resumes and rolls back (reverse=%s)",
    async (reverse) => {
      const { sibling, binding } = inheritedCopies();
      if (reverse) plan.tasks.reverse();
      const before = snapshot(),
        peerBefore = snapshot(sibling);
      const backups = new Map<string, { bytes: Buffer; mode: number }>();
      for (const full of [...before.keys(), ...peerBefore.keys()])
        backups.set(full, {
          bytes: fs.readFileSync(full),
          mode: fs.statSync(full).mode & 0o777,
        });
      const preview = await execute(true);
      expect(preview.conflicts).toEqual([]);
      expect(
        preview.actions.find((action) => action.path === binding),
      ).toMatchObject({
        action: "preserve",
        before_mode: 0o600,
        after_mode: 0o600,
      });
      expect(snapshot()).toEqual(before);
      expect(snapshot(sibling)).toEqual(peerBefore);
      await execute();
      for (const task of plan.tasks) {
        const workspace = required(
          plan.workspaces.find((entry) => entry.id === task.workspace),
        );
        const full = path.join(workspace.root, task.task_ref, "task.json");
        if (task.disposition === "defer") {
          expect(fs.readFileSync(full)).toEqual(
            Buffer.from(required(task.source).content_base64, "base64"),
          );
          expect(fs.statSync(full).mode & 0o777).toBe(
            required(task.source).mode,
          );
          expect(
            fs.existsSync(
              path.join(workspace.root, task.task_ref, "migration"),
            ),
          ).toBe(false);
          expect(
            fs.existsSync(
              path.join(workspace.root, task.task_ref, "deliveries"),
            ),
          ).toBe(false);
        } else
          expect(JSON.parse(fs.readFileSync(full, "utf8")).schema_version).toBe(
            "2.0",
          );
      }
      for (const entry of plan.files.filter(
        (entry) => entry.owner === "preserve",
      )) {
        const workspace = required(
          plan.workspaces.find((row) => row.id === entry.target.workspace),
        );
        const full = path.join(workspace.root, entry.target.path);
        expect(fs.readFileSync(full)).toEqual(
          Buffer.from(required(entry.source).content_base64, "base64"),
        );
        expect(fs.statSync(full).mode & 0o777).toBe(
          required(entry.source).mode,
        );
      }
      const applied = snapshot(),
        peerApplied = snapshot(sibling);
      const writer = vi.spyOn(atomic, "writeFileAtomic");
      await execute();
      expect(writer).not.toHaveBeenCalled();
      writer.mockRestore();
      expect(snapshot()).toEqual(applied);
      expect(snapshot(sibling)).toEqual(peerApplied);
      const python = process.platform === "win32" ? "python" : "python3";
      const beforeDirect = snapshot(),
        peerBeforeDirect = snapshot(sibling);
      expect(() =>
        execFileSync(
          python,
          [
            "-B",
            file(".trellis/scripts/delivery.py"),
            "select",
            "--task",
            path.join(sibling, ref),
            "--delivery",
            "00000000-0000-0000-0000-000000000001",
          ],
          {
            cwd: root,
            env: {
              ...process.env,
              CODEX_THREAD_ID: "main-task",
              PYTHONDONTWRITEBYTECODE: "1",
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        ),
      ).toThrow();
      expect(snapshot()).toEqual(beforeDirect);
      expect(snapshot(sibling)).toEqual(peerBeforeDirect);
      for (const workspace of [root, sibling]) {
        for (const [id, expectedRoot, taskRef] of [
          ["main-task", root, ref],
          ["second-task", sibling, ".trellis/tasks/10-12-second"],
        ]) {
          const env = {
            ...process.env,
            CODEX_THREAD_ID: id,
            PYTHONDONTWRITEBYTECODE: "1",
          };
          const current = execFileSync(
            python,
            [
              "-B",
              path.join(workspace, ".trellis/scripts/task.py"),
              "current",
              "--source",
            ],
            { cwd: workspace, env, encoding: "utf8" },
          );
          expect(current).toContain(taskRef);
          expect(current).toContain(`Task workspace: ${expectedRoot}`);
          const context = JSON.parse(
            execFileSync(
              python,
              [
                "-B",
                path.join(workspace, ".trellis/scripts/get_context.py"),
                "--json",
              ],
              { cwd: workspace, env, encoding: "utf8" },
            ),
          ) as { currentTask: { taskWorkspaceRoot: string } };
          expect(context.currentTask.taskWorkspaceRoot).toBe(expectedRoot);
          const continuation = execFileSync(
            python,
            [
              "-B",
              path.join(workspace, ".trellis/scripts/get_context.py"),
              "--mode",
              "continuation",
            ],
            { cwd: workspace, env, encoding: "utf8" },
          );
          expect(continuation).toContain("Read the exact session Task");
        }
      }
      for (const action of [...preview.actions].reverse()) {
        if (action.action === "preserve") continue;
        const backup = backups.get(action.path);
        if (backup) {
          fs.writeFileSync(action.path, backup.bytes);
          fs.chmodSync(action.path, backup.mode);
        } else fs.rmSync(action.path, { force: true });
      }
      expect(snapshot()).toEqual(before);
      expect(snapshot(sibling)).toEqual(peerBefore);
    },
  );

  it("recovers a partial cutover using original identity groups and rejects third states", async () => {
    const { sibling } = inheritedCopies();
    const actual = atomic.writeFileAtomic;
    let writes = 0;
    const writer = vi
      .spyOn(atomic, "writeFileAtomic")
      .mockImplementation((...args) => {
        if (++writes === 4)
          throw new Error("controlled ordinary write failure");
        return actual(...args);
      });
    await expect(execute()).rejects.toThrow(
      "controlled ordinary write failure",
    );
    writer.mockRestore();
    const before = snapshot(),
      peerBefore = snapshot(sibling);
    expect((await execute(true)).conflicts).toEqual([]);
    expect(snapshot()).toEqual(before);
    expect(snapshot(sibling)).toEqual(peerBefore);
    await execute();
    const deferred = path.join(sibling, ref, "task.json");
    fs.chmodSync(deferred, 0o644);
    const third = snapshot(),
      peerThird = snapshot(sibling);
    await expect(execute()).rejects.toThrow("third_state");
    expect(snapshot()).toEqual(third);
    expect(snapshot(sibling)).toEqual(peerThird);
  });

  it.each([
    "missing-binding",
    "duplicate-binding",
    "unknown-binding",
    "binding-extra-field",
    "wrong-peer",
    "absent-branch",
    "detached",
    "case",
    "generation",
    "source",
    "two-authorities",
    "all-defer",
    "same-workspace",
    "workspace-alias",
    "task-alias",
    "omitted-task",
    "omitted-artifact",
    "peer-artifact",
    "archive",
    "visible-history",
  ])("rejects %s without any writes", async (kind) => {
    const { sibling, binding } = inheritedCopies();
    const peer = required(
      plan.tasks.find(
        (task) => task.workspace === "sibling" && task.task_ref === ref,
      ),
    );
    const authority = required(
      plan.tasks.find(
        (task) => task.workspace === "main" && task.task_ref === ref,
      ),
    );
    if (kind === "missing-binding") plan.branch_bindings = [];
    if (kind === "duplicate-binding")
      plan.branch_bindings?.push(
        structuredClone(required(plan.branch_bindings?.[0])),
      );
    if (kind === "unknown-binding")
      required(plan.branch_bindings?.[0]).task_id = "unknown-task";
    if (["binding-extra-field", "wrong-peer", "absent-branch"].includes(kind)) {
      const row = required(plan.branch_bindings?.[0]);
      const value = JSON.parse(
        Buffer.from(row.source.content_base64, "base64").toString(),
      ) as Record<string, unknown>;
      if (kind === "binding-extra-field") value.extra = true;
      else
        value.branch_name =
          kind === "wrong-peer" ? "inherited-sibling" : "not-checked-out";
      row.source = raw(JSON.stringify(value), 0o600);
      fs.writeFileSync(binding, JSON.stringify(value));
    }
    if (kind === "detached")
      execFileSync("git", ["-C", root, "checkout", "--detach"]);
    if (kind === "case")
      replaceSource(peer, (record) => {
        record.id = "MAIN-task";
      });
    if (kind === "generation")
      replaceSource(peer, (record) => {
        record.lifecycle_generation = 1;
      });
    if (kind === "source")
      replaceSource(peer, (record) => {
        record.source = {
          kind: "issue",
          repo_ref: "test/repo",
          number: 1,
          disposition: "exact_source",
        };
      });
    if (kind === "two-authorities") {
      peer.disposition = "convert_active";
      peer.record = structuredClone(authority.record);
      peer.legacy_facts = structuredClone(authority.legacy_facts);
    }
    if (kind === "all-defer") {
      authority.disposition = "defer";
      delete authority.record;
      delete authority.legacy_facts;
    }
    if (kind === "same-workspace") {
      const oldWorkspace = peer.workspace,
        oldRef = peer.task_ref;
      peer.workspace = "main";
      peer.task_ref = ".trellis/tasks/other";
      fs.renameSync(path.join(sibling, oldRef), file(peer.task_ref));
      // Keep inventory valid so this case reaches the identity-group guard.
      for (const entry of plan.files)
        if (
          entry.target.workspace === oldWorkspace &&
          entry.target.path.startsWith(`${oldRef}/`)
        ) {
          entry.target.workspace = peer.workspace;
          entry.target.path = `${peer.task_ref}/${entry.target.path.slice(oldRef.length + 1)}`;
        }
    }
    if (kind === "workspace-alias")
      plan.workspaces.push({ id: "alias", root, project_relative: null });
    if (kind === "task-alias") {
      const link = file(".trellis/tasks/alias");
      fs.symlinkSync(path.join(sibling, ref), link, "dir");
      plan.tasks.push({
        ...structuredClone(peer),
        workspace: "main",
        task_ref: ".trellis/tasks/alias",
      });
    }
    if (kind === "omitted-task")
      plan.tasks = plan.tasks.filter((task) => task !== peer);
    if (kind === "omitted-artifact")
      plan.files = plan.files.filter(
        (entry) =>
          !(
            entry.target.workspace === "sibling" &&
            entry.target.path === `${ref}/design.md`
          ),
      );
    if (kind === "peer-artifact")
      plan.files.push({
        target: {
          kind: "project",
          workspace: "sibling",
          path: `${ref}/migration/invented.json`,
        },
        owner: "artifact",
        action: "write",
        source: null,
        target_content_base64: b64("{}"),
        target_mode: 0o600,
      });
    if (kind === "archive") {
      const taskRef = ".trellis/tasks/archive/2026-10/duplicate";
      fs.mkdirSync(file(taskRef), { recursive: true });
      fs.writeFileSync(
        file(`${taskRef}/task.json`),
        Buffer.from(required(peer.source).content_base64, "base64"),
      );
      plan.tasks.push({
        ...structuredClone(peer),
        workspace: "main",
        task_ref: taskRef,
        disposition: "history_only",
      });
    }
    if (kind === "visible-history") {
      const taskRef = ".trellis/tasks/archive/2026-10/main-task";
      fs.mkdirSync(file(taskRef), { recursive: true });
      plan.tasks.push({
        workspace: "main",
        task_ref: taskRef,
        disposition: "history_only",
        source: null,
      });
    }
    const before = snapshot(),
      peerBefore = snapshot(sibling);
    await expect(execute()).rejects.toThrow(
      kind === "same-workspace" ? "Task identity collision" : undefined,
    );
    expect(snapshot()).toEqual(before);
    expect(snapshot(sibling)).toEqual(peerBefore);
  });

  it.each(["bytes", "mode", "deleted", "symlink"])(
    "rejects binding %s drift on preview/execution",
    async (kind) => {
      const { sibling, binding } = inheritedCopies();
      if (kind === "bytes") fs.appendFileSync(binding, " ");
      if (kind === "mode") fs.chmodSync(binding, 0o640);
      if (kind === "deleted") fs.unlinkSync(binding);
      if (kind === "symlink") {
        fs.unlinkSync(binding);
        fs.symlinkSync(planPath, binding);
      }
      const before = snapshot(),
        peerBefore = snapshot(sibling);
      if (kind === "symlink")
        await expect(execute(true)).rejects.toThrow("Symlink");
      else
        expect((await execute(true)).conflicts.join()).toContain("third_state");
      await expect(execute()).rejects.toThrow();
      expect(snapshot()).toEqual(before);
      expect(snapshot(sibling)).toEqual(peerBefore);
    },
  );

  it.each(
    [
      "checkout",
      "topology",
      "foreign-common",
      "marker",
      "binding-bytes",
      "binding-mode",
      "binding-path",
    ].flatMap((kind) => [
      { kind, mixed: false },
      { kind, mixed: true },
    ]),
  )(
    "rechecks $kind drift after initial preflight and before writing (mixed=$mixed)",
    async ({ kind, mixed }) => {
      const { sibling, binding } = mixed
        ? mixedInheritedCopies()
        : inheritedCopies();
      const actual = (
        await vi.importActual<typeof import("node:child_process")>(
          "node:child_process",
        )
      ).execFileSync;
      let inventoryReads = 0,
        changed = false;
      vi.mocked(childProcess.execFileSync).mockImplementation(
        (
          ...args: Parameters<typeof childProcess.execFileSync>
        ): ReturnType<typeof childProcess.execFileSync> => {
          const argv = args[1];
          if (
            args[0] === "git" &&
            Array.isArray(argv) &&
            argv.includes("worktree") &&
            argv.includes("list")
          ) {
            inventoryReads++;
            if (inventoryReads === 2) changed = true;
          }
          if (changed && args[0] === "git" && Array.isArray(argv)) {
            if (
              kind === "checkout" &&
              argv.includes("--show-current") &&
              argv[1] === root
            )
              return Buffer.from("\n");
            if (
              kind === "topology" &&
              argv.includes("worktree") &&
              argv.includes("list")
            ) {
              const result = actual(...args);
              return Buffer.from(
                Buffer.from(result)
                  .toString()
                  .split("\0\0")
                  .filter((entry) => !entry.startsWith(`worktree ${sibling}\0`))
                  .join("\0\0"),
              );
            }
            if (
              kind === "foreign-common" &&
              argv[1] === sibling &&
              argv.includes("--git-common-dir")
            )
              return Buffer.from(`${os.tmpdir()}\n`);
          }
          if (
            changed &&
            [
              "marker",
              "binding-bytes",
              "binding-mode",
              "binding-path",
            ].includes(kind)
          ) {
            if (kind === "marker")
              write(".trellis/guru-team/extension.json", "{}");
            if (kind === "binding-bytes") fs.appendFileSync(binding, " ");
            if (kind === "binding-mode") fs.chmodSync(binding, 0o640);
            if (kind === "binding-path") {
              fs.unlinkSync(binding);
              fs.symlinkSync(planPath, binding);
            }
            changed = false;
          }
          return actual(...args);
        },
      );
      const writer = vi.spyOn(atomic, "writeFileAtomic");
      await expect(execute()).rejects.toThrow();
      expect(writer).not.toHaveBeenCalled();
      expect(fs.existsSync(file(`${ref}/migration`))).toBe(false);
      expect(fs.existsSync(path.join(sibling, ".trellis/scripts"))).toBe(false);
    },
  );

  it.each(["invocation", "sibling", "git-free"])(
    "keeps the public missing-binding marker boundary (%s)",
    async (kind) => {
      if (kind === "git-free") {
        write(".trellis/guru-team/extension.json", "{}");
        expect((await execute(true)).conflicts).toEqual([]);
        await execute();
        return;
      }
      const { sibling } = inheritedCopies();
      // Unique IDs: remove inherited peers while preserving complete real inventory.
      for (const task of plan.tasks.filter(
        (task) => task.disposition === "defer",
      )) {
        const workspace = required(
          plan.workspaces.find((row) => row.id === task.workspace),
        );
        fs.rmSync(path.join(workspace.root, task.task_ref), {
          recursive: true,
        });
        plan.files = plan.files.filter(
          (entry) =>
            !(
              entry.target.workspace === task.workspace &&
              entry.target.path.startsWith(`${task.task_ref}/`)
            ),
        );
      }
      plan.tasks = plan.tasks.filter((task) => task.disposition !== "defer");
      fs.rmSync(file(".git/trellis/task-branches"), { recursive: true });
      plan.branch_bindings = [];
      expect((await execute(true)).conflicts).toEqual([]);
      const markerRoot = kind === "invocation" ? root : sibling;
      fs.mkdirSync(path.join(markerRoot, ".trellis/guru-team"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(markerRoot, ".trellis/guru-team/extension.json"),
        "{}",
      );
      const before = snapshot(),
        peerBefore = snapshot(sibling);
      await expect(execute()).rejects.toThrow("binding_required");
      expect(snapshot()).toEqual(before);
      expect(snapshot(sibling)).toEqual(peerBefore);
    },
  );
});

describe("inherited copy compatibility boundaries", () => {
  it.each(["git-free", "git"])(
    "AC2 rejects a lone current-schema deferred Task without an authority before writes (%s)",
    async (kind) => {
      if (kind === "git") execFileSync("git", ["init", root]);
      plan.source.task_schema = "mixed";
      const task = required(plan.tasks[0]);
      const record = structuredClone(task.record as Record<string, unknown>);
      mixedDisposition(task, "defer");
      mixedCurrentSource(task, record);

      const before = fullTree();
      await expect(execute(true)).rejects.toThrow(
        "Task identity collision main-task",
      );
      expect(fullTree()).toEqual(before);
      await rejectMixed("Task identity collision main-task");
    },
  );

  it("AC1 preserves a semantically equal current-schema peer with its original bytes and mode", async () => {
    const { sibling } = currentSchemaInheritedCopies();
    const authorityPath = file(`${ref}/task.json`);
    const peerPath = path.join(sibling, ref, "task.json");
    const authorityBytes = fs.readFileSync(authorityPath);
    const peerBytes = fs.readFileSync(peerPath);
    const before = snapshot(),
      peerBefore = snapshot(sibling);

    const preview = await execute(true);
    expect(preview.conflicts).toEqual([]);
    expect(snapshot()).toEqual(before);
    expect(snapshot(sibling)).toEqual(peerBefore);
    expect(
      preview.actions.find((action) => action.path === peerPath),
    ).toMatchObject({
      action: "preserve",
      before_sha256: rawMigrationDigest(peerBytes),
      after_sha256: rawMigrationDigest(peerBytes),
      before_mode: 0o600,
      after_mode: 0o600,
    });

    const writer = vi.spyOn(atomic, "writeFileAtomic");
    await execute();
    expect(writer.mock.calls.some(([target]) => target === peerPath)).toBe(
      false,
    );
    expect(fs.readFileSync(authorityPath)).toEqual(authorityBytes);
    expect(fs.statSync(authorityPath).mode & 0o777).toBe(0o640);
    expect(fs.readFileSync(peerPath)).toEqual(peerBytes);
    expect(fs.statSync(peerPath).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(path.join(sibling, ref, "migration"))).toBe(false);
    expect(fs.existsSync(path.join(sibling, ref, "deliveries"))).toBe(false);

    writer.mockClear();
    const applied = snapshot(),
      peerApplied = snapshot(sibling);
    await execute();
    expect(writer).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(applied);
    expect(snapshot(sibling)).toEqual(peerApplied);
  });

  it("AC2 rejects a current-schema peer whose complete parsed record differs before writes", async () => {
    currentSchemaInheritedCopies();
    const peer = required(
      plan.tasks.find(
        (task) => task.workspace === "sibling" && task.task_ref === ref,
      ),
    );
    replaceSource(peer, (record) => {
      record.title = "Changed current Task content";
    });

    await rejectMixed(/Current-schema Task peer record mismatch/);
  });

  it("AC2 rejects a malformed current-schema peer before writes", async () => {
    currentSchemaInheritedCopies();
    const peer = required(
      plan.tasks.find(
        (task) => task.workspace === "sibling" && task.task_ref === ref,
      ),
    );
    replaceSource(peer, (record) => {
      record.unknown_field = "unsupported";
    });

    await rejectMixed(/source_task_schema=2\.0.*invalid_record/);
  });

  it.each(["current", "legacy"])(
    "supports reviewed %s authority sources with preserved peers",
    async (kind) => {
      const { sibling } = inheritedCopies();
      if (kind === "current") {
        const task = required(
          plan.tasks.find(
            (entry) => entry.workspace === "main" && entry.task_ref === ref,
          ),
        );
        task.source = raw(
          JSON.stringify(task.record),
          required(task.source).mode,
        );
        write(
          `${ref}/task.json`,
          Buffer.from(task.source.content_base64, "base64"),
          task.source.mode,
        );
        task.disposition = "current";
        delete task.record;
        delete task.legacy_facts;
      } else {
        plan.source.task_schema = "legacy";
        for (const task of plan.tasks) {
          replaceSource(task, (record) => {
            delete record.source;
            delete record.lifecycle_generation;
            record.creator = "original";
            record.assignee = "owner";
          });
          if (task.legacy_facts)
            for (const fact of task.legacy_facts)
              fact.reason.revision = `sha256:${required(task.source).sha256}`;
        }
      }
      const before = snapshot(),
        peerBefore = snapshot(sibling);
      expect((await execute(true)).conflicts).toEqual([]);
      expect(snapshot()).toEqual(before);
      expect(snapshot(sibling)).toEqual(peerBefore);
      await execute();
      await execute();
    },
  );

  it("requires reviewed live bindings for unique IDs, and freezes no-binding absence", async () => {
    execFileSync("git", ["init", root]);
    const branch = execFileSync(
      "git",
      ["-C", root, "branch", "--show-current"],
      { encoding: "utf8" },
    ).trim();
    const bytes = JSON.stringify({
      schema_version: "1.0",
      task_id: "main-task",
      lifecycle_generation: 0,
      binding_revision: 0,
      branch_name: branch,
    });
    write(".git/trellis/task-branches/main-task/0.json", bytes, 0o600);
    const before = snapshot();
    await expect(execute()).rejects.toThrow("Missing reviewed branch binding");
    expect(snapshot()).toEqual(before);
    plan.branch_bindings = [
      {
        task_id: "main-task",
        lifecycle_generation: 0,
        source: raw(bytes, 0o600),
      },
    ];
    expect((await execute(true)).conflicts).toEqual([]);
    fs.rmSync(file(".git/trellis/task-branches"), { recursive: true });
    plan.branch_bindings = [];
    const actual = (
      await vi.importActual<typeof import("node:child_process")>(
        "node:child_process",
      )
    ).execFileSync;
    let inventories = 0;
    vi.mocked(childProcess.execFileSync).mockImplementation(
      (
        ...args: Parameters<typeof childProcess.execFileSync>
      ): ReturnType<typeof childProcess.execFileSync> => {
        if (
          Array.isArray(args[1]) &&
          args[1].includes("--porcelain") &&
          ++inventories === 2
        )
          write(".git/trellis/task-branches/main-task/0.json", bytes, 0o600);
        return actual(...args);
      },
    );
    const writer = vi.spyOn(atomic, "writeFileAtomic");
    await expect(execute()).rejects.toThrow(
      "Branch binding appeared during preflight",
    );
    expect(writer).not.toHaveBeenCalled();
  });

  it("preserves absent peer artifacts without allowing invented Delivery writes", async () => {
    const { sibling } = inheritedCopies();
    plan.files.push({
      target: {
        kind: "project",
        workspace: "sibling",
        path: `${ref}/never-existed.txt`,
      },
      owner: "preserve",
      action: "preserve",
      source: null,
    });
    await execute();
    expect(fs.existsSync(path.join(sibling, ref, "never-existed.txt"))).toBe(
      false,
    );
    fs.writeFileSync(
      path.join(sibling, ref, "never-existed.txt"),
      "third state",
    );
    const before = snapshot(),
      peerBefore = snapshot(sibling);
    await expect(execute()).rejects.toThrow("third_state");
    expect(snapshot()).toEqual(before);
    expect(snapshot(sibling)).toEqual(peerBefore);
  });

  it.each([
    "generation",
    "revision",
    "identity",
    "empty-branch",
    "extra-row",
    "git-free",
  ])("rejects malformed %s binding input before writes", async (kind) => {
    let binding: string | undefined;
    if (kind !== "git-free") binding = inheritedCopies().binding;
    const row =
      kind === "git-free"
        ? { task_id: "main-task", lifecycle_generation: 0, source: raw("{}") }
        : required(plan.branch_bindings?.[0]);
    if (kind === "git-free") plan.branch_bindings = [row];
    else {
      const value = JSON.parse(
        Buffer.from(row.source.content_base64, "base64").toString(),
      ) as Record<string, unknown>;
      if (kind === "generation") value.lifecycle_generation = null;
      if (kind === "revision") value.binding_revision = true;
      if (kind === "identity") value.task_id = "MAIN-task";
      if (kind === "empty-branch") value.branch_name = "";
      if (kind === "extra-row") Object.assign(row, { path: "elsewhere.json" });
      row.source = raw(JSON.stringify(value), 0o600);
      fs.writeFileSync(required(binding), JSON.stringify(value));
    }
    const before = snapshot(),
      peerBefore = inheritedSibling ? snapshot(inheritedSibling) : undefined;
    await expect(execute()).rejects.toThrow();
    expect(snapshot()).toEqual(before);
    if (inheritedSibling)
      expect(snapshot(inheritedSibling)).toEqual(peerBefore);
  });
});

// Mixed-source tests use only generated records; no business sample is copied.
type PlanTask = MigrationPlan2["tasks"][number];
function mixedSource(task: PlanTask, schema: "legacy" | "1.0"): void {
  task.source_task_schema = schema;
  if (schema === "legacy") {
    replaceSource(task, (record) => {
      delete record.source;
      delete record.lifecycle_generation;
      record.creator = "retired-creator";
      record.assignee = "retired-assignee";
    });
    const source = required(task.source);
    const bytes = ` \n${JSON.stringify(JSON.parse(Buffer.from(source.content_base64, "base64").toString()), null, 4)}\n\n`;
    task.source = raw(bytes, source.mode);
    const workspace = required(
      plan.workspaces.find((w) => w.id === task.workspace),
    );
    const full = path.join(workspace.root, task.task_ref, "task.json");
    fs.writeFileSync(full, bytes);
    fs.chmodSync(full, source.mode);
  }
  for (const fact of task.legacy_facts ?? [])
    fact.reason.revision = `sha256:${required(task.source).sha256}`;
}
function mixedCurrentSource(
  task: PlanTask,
  record: Record<string, unknown>,
): void {
  const source = required(task.source);
  const bytes = JSON.stringify(record);
  task.source = raw(bytes, source.mode);
  task.source_task_schema = "2.0";
  const workspace = required(
    plan.workspaces.find((entry) => entry.id === task.workspace),
  );
  const full = path.join(workspace.root, task.task_ref, "task.json");
  fs.writeFileSync(full, bytes);
  fs.chmodSync(full, source.mode);
}
function mixedInheritedCopies(): ReturnType<typeof inheritedCopies> {
  const result = inheritedCopies();
  plan.source.task_schema = "mixed";
  for (const task of plan.tasks)
    mixedSource(task, task.task_ref === ref ? "1.0" : "legacy");
  return result;
}
function currentSchemaInheritedCopies(): ReturnType<typeof inheritedCopies> {
  const result = mixedInheritedCopies();
  const authority = required(
    plan.tasks.find(
      (task) => task.workspace === "main" && task.task_ref === ref,
    ),
  );
  const peer = required(
    plan.tasks.find(
      (task) => task.workspace === "sibling" && task.task_ref === ref,
    ),
  );
  const record = structuredClone(
    authority.record as ReturnType<typeof emptyTaskRecordV2>,
  );
  const authoritySource = required(authority.source);
  const authorityBytes = JSON.stringify(record);
  authority.source = raw(authorityBytes, authoritySource.mode);
  authority.disposition = "current";
  delete authority.record;
  delete authority.legacy_facts;
  delete authority.source_task_schema;
  write(`${ref}/task.json`, authorityBytes, authoritySource.mode);

  const peerRecord = Object.fromEntries(Object.entries(record).reverse());
  const peerBytes = ` \n${JSON.stringify(peerRecord, null, 4)}\n\n`;
  peer.source = raw(peerBytes, 0o600);
  peer.source_task_schema = "2.0";
  const sibling = required(
    plan.workspaces.find((workspace) => workspace.id === "sibling"),
  ).root;
  const peerPath = path.join(sibling, ref, "task.json");
  fs.writeFileSync(peerPath, peerBytes);
  fs.chmodSync(peerPath, 0o600);
  return result;
}
function relocateTask(task: PlanTask, nextRef: string): void {
  const workspace = required(
    plan.workspaces.find((w) => w.id === task.workspace),
  );
  const oldRef = task.task_ref;
  fs.mkdirSync(path.dirname(path.join(workspace.root, nextRef)), {
    recursive: true,
  });
  fs.renameSync(
    path.join(workspace.root, oldRef),
    path.join(workspace.root, nextRef),
  );
  task.task_ref = nextRef;
  for (const entry of plan.files)
    if (
      entry.target.workspace === task.workspace &&
      entry.target.path.startsWith(`${oldRef}/`)
    )
      entry.target.path = `${nextRef}/${entry.target.path.slice(oldRef.length + 1)}`;
  for (const fact of task.legacy_facts ?? [])
    fact.reason.locator = `${nextRef}/migration/source-task.json`;
}
/** Includes absent/new directories and symlinks, unlike the older file-only snapshot. */
function fullTree(directory = root): Map<string, string> {
  const result = new Map<string, string>();
  function scan(full: string): void {
    const stat = fs.lstatSync(full);
    const mode = stat.mode & 0o777;
    if (stat.isSymbolicLink())
      result.set(full, `link:${mode}:${fs.readlinkSync(full)}`);
    else if (stat.isDirectory()) {
      result.set(full, `dir:${mode}`);
      for (const name of fs.readdirSync(full).sort())
        scan(path.join(full, name));
    } else
      result.set(
        full,
        `file:${mode}:${rawMigrationDigest(fs.readFileSync(full))}`,
      );
  }
  scan(directory);
  return result;
}
async function rejectMixed(message: string | RegExp): Promise<void> {
  const before = fullTree(),
    peer = inheritedSibling ? fullTree(inheritedSibling) : undefined;
  const writer = vi.spyOn(atomic, "writeFileAtomic");
  await expect(execute()).rejects.toThrow(message);
  expect(writer).not.toHaveBeenCalled();
  writer.mockRestore();
  expect(fullTree()).toEqual(before);
  if (inheritedSibling) expect(fullTree(inheritedSibling)).toEqual(peer);
}

describe("explicit mixed Plan2 predecessor declarations", () => {
  it("AC1 previews a complete 28/3 inventory and converts only selected schema1 with lossless peers", async () => {
    plan.source.task_schema = "mixed";
    mixedSource(required(plan.tasks[0]), "1.0");
    for (let index = 1; index < 31; index++) {
      const taskRef = `.trellis/tasks/10-13-neighbor-${index}`;
      const record = emptyTaskRecord({
        id: `neighbor-${index}`,
        title: "保留 α",
        meta: { whitespace: "  " },
      });
      const source = ` \n${JSON.stringify(record, null, 4)}\n\n`;
      const mode = index % 2 ? 0o600 : 0o644;
      write(`${taskRef}/task.json`, source, mode);
      const task: PlanTask = {
        workspace: "main",
        task_ref: taskRef,
        disposition: "defer",
        source: raw(source, mode),
      };
      plan.tasks.push(task);
      mixedSource(task, index >= 28 ? "legacy" : "1.0");
      for (const name of [
        "prd.md",
        "design.md",
        "implement.md",
        "implement.jsonl",
        "check.jsonl",
        "research/nested/evidence.bin",
      ]) {
        const bytes = name.endsWith(".bin")
          ? Buffer.from([0, 255, 42])
          : Buffer.from(` ${index} 分支 ${name}\n\n`);
        write(`${taskRef}/${name}`, bytes, mode);
        plan.files.push({
          target: {
            kind: "project",
            workspace: "main",
            path: `${taskRef}/${name}`,
          },
          owner: "preserve",
          action: "preserve",
          source: raw(bytes, mode),
        });
      }
    }
    expect(
      plan.tasks.filter((task) => task.source_task_schema === "1.0"),
    ).toHaveLength(28);
    expect(
      plan.tasks.filter((task) => task.source_task_schema === "legacy"),
    ).toHaveLength(3);
    const before = fullTree();
    expect((await execute(true)).conflicts).toEqual([]);
    expect(fullTree()).toEqual(before);
    const writer = vi.spyOn(atomic, "writeFileAtomic");
    await execute();
    for (const task of plan.tasks) {
      const source = required(task.source),
        full = file(`${task.task_ref}/task.json`);
      if (task.disposition === "defer") {
        expect(fs.readFileSync(full)).toEqual(
          Buffer.from(source.content_base64, "base64"),
        );
        expect(fs.statSync(full).mode & 0o777).toBe(source.mode);
        expect(fs.existsSync(file(`${task.task_ref}/migration`))).toBe(false);
        expect(fs.existsSync(file(`${task.task_ref}/deliveries`))).toBe(false);
        expect(
          writer.mock.calls.some(([name]) =>
            name.startsWith(file(`${task.task_ref}/`)),
          ),
        ).toBe(false);
      } else {
        expect(JSON.parse(fs.readFileSync(full, "utf8"))).toEqual(task.record);
        expect(
          fs.readFileSync(file(`${task.task_ref}/migration/source-task.json`)),
        ).toEqual(Buffer.from(source.content_base64, "base64"));
      }
    }
    for (const entry of plan.files.filter(
      (entry) => entry.owner === "preserve",
    )) {
      expect(fs.readFileSync(file(entry.target.path))).toEqual(
        Buffer.from(required(entry.source).content_base64, "base64"),
      );
      expect(fs.statSync(file(entry.target.path)).mode & 0o777).toBe(
        required(entry.source).mode,
      );
      expect(
        writer.mock.calls.some(([name]) => name === file(entry.target.path)),
      ).toBe(false);
    }
    writer.mockClear();
    const applied = fullTree();
    await execute();
    expect(writer).not.toHaveBeenCalled();
    expect(fullTree()).toEqual(applied);
  });
});

function mixedDisposition(
  task: PlanTask,
  disposition: PlanTask["disposition"],
): void {
  task.disposition = disposition;
  if (disposition === "convert_archive" || disposition === "history_only")
    relocateTask(task, ".trellis/tasks/archive/2026-10/mixed-archive");
  if (disposition === "current") {
    task.source = raw(
      JSON.stringify(task.record, null, 4) + "\n\n",
      required(task.source).mode,
    );
    write(
      `${task.task_ref}/task.json`,
      Buffer.from(task.source.content_base64, "base64"),
      task.source.mode,
    );
  }
  if (["defer", "current", "history_only"].includes(disposition)) {
    delete task.record;
    delete task.legacy_facts;
  }
  if (["current", "history_only"].includes(disposition))
    delete task.source_task_schema;
}

describe("mixed source closed input and compatibility matrix", () => {
  it.each(["convert_active", "convert_archive", "defer"] as const)(
    "AC2 requires an explicit valid selector on %s, rejecting malformed values before writes",
    async (disposition) => {
      plan.source.task_schema = "mixed";
      const task = required(plan.tasks[0]);
      mixedSource(task, "1.0");
      mixedDisposition(task, disposition);
      const invalidSelectors: unknown[] = [
        undefined,
        null,
        "mixed",
        "",
        1,
        {},
        [],
      ];
      if (disposition !== "defer") invalidSelectors.push("2.0");
      for (const selector of invalidSelectors) {
        const row = task as unknown as Record<string, unknown>;
        if (selector === undefined) delete row.source_task_schema;
        else row.source_task_schema = selector;
        await rejectMixed(/source_task_schema/);
      }
      task.source_task_schema = "1.0";
      expect((await execute(true)).conflicts).toEqual([]);
    },
  );

  it.each(["legacy", "1.0"] as const)(
    "AC2 forbids homogeneous %s row overrides for every disposition",
    async (mode) => {
      for (const disposition of [
        "convert_active",
        "convert_archive",
        "defer",
        "current",
        "history_only",
      ] as const) {
        // Every case starts from a fresh copy of the original otherwise valid plan.
        const original = structuredClone(plan),
          before = fullTree();
        const task = required(plan.tasks[0]);
        plan.source.task_schema = mode;
        mixedSource(task, mode);
        mixedDisposition(task, disposition);
        task.source_task_schema = mode;
        await rejectMixed(/forbidden/);
        // Restore only this fixture's mutation before exercising the next row.
        const workspace = path.join(root, task.task_ref);
        if (task.task_ref !== ref) fs.renameSync(workspace, file(ref));
        const first = required(original.tasks[0]);
        write(
          `${ref}/task.json`,
          Buffer.from(required(first.source).content_base64, "base64"),
          required(first.source).mode,
        );
        if (fs.existsSync(file(".trellis/tasks/archive")))
          fs.rmSync(file(".trellis/tasks/archive"), { recursive: true });
        plan = original;
        expect(fullTree()).toEqual(before);
      }
    },
  );

  it.each(["current", "history_only"] as const)(
    "AC2 forbids mixed selector on otherwise-valid %s rows",
    async (disposition) => {
      const task = required(plan.tasks[0]);
      plan.source.task_schema = "mixed";
      mixedDisposition(task, disposition);
      for (const [selector, diagnostic] of [
        ["1.0", /forbidden/],
        ["2.0", /Current Task schema selector is only valid for defer/],
      ] as const) {
        task.source_task_schema = selector;
        await rejectMixed(diagnostic);
      }
      delete task.source_task_schema;
      expect((await execute(true)).conflicts).toEqual([]);
    },
  );

  it.each(["convert_active", "convert_archive", "defer"] as const)(
    "AC2 validates declared source on %s without parser fallback in either mismatch direction",
    async (disposition) => {
      const task = required(plan.tasks[0]);
      plan.source.task_schema = "mixed";
      mixedDisposition(task, disposition);
      task.source_task_schema = "legacy";
      await rejectMixed(/declared legacy schema/);
      mixedSource(task, "legacy");
      task.source_task_schema = "1.0";
      await rejectMixed(/source_task_schema=1.0/);
    },
  );

  it.each(["1.0", "legacy"] as const)(
    "AC2 rejects unknown and malformed %s sources without writes",
    async (schema) => {
      plan.source.task_schema = "mixed";
      const task = required(plan.tasks[0]);
      mixedSource(task, schema);
      replaceSource(task, (record) => {
        record.unknown_field = "unsupported";
      });
      await rejectMixed(
        schema === "1.0" ? /not a supported field/ : /declared legacy schema/,
      );
      task.source = raw('{"id":"main-task",', required(task.source).mode);
      write(
        `${ref}/task.json`,
        Buffer.from(task.source.content_base64, "base64"),
        task.source.mode,
      );
      await rejectMixed(/JSON/);
    },
  );

  it.each(
    (["1.0", "legacy"] as const).flatMap((schema) => [
      { schema, archive: false },
      { schema, archive: true },
    ]),
  )(
    "AC3 permits single-kind mixed $schema conversion and exact source history (archive=$archive)",
    async ({ schema, archive }) => {
      plan.source.task_schema = "mixed";
      const task = required(plan.tasks[0]);
      mixedSource(task, schema);
      if (archive) mixedDisposition(task, "convert_archive");
      if (schema === "1.0") {
        replaceSource(task, (record) => {
          record.lifecycle_generation = 7;
          record.source = {
            kind: "issue",
            repo_ref: "synthetic/repository",
            number: 23,
            disposition: "reference_only",
          };
          record.children = ["synthetic-child"];
          record.parent = "synthetic-parent";
          record.meta = { business: "保留", tree: { arbitrary: [1, true] } };
        });
        task.record = {
          ...(task.record as Record<string, unknown>),
          lifecycle_generation: 7,
          source: {
            kind: "issue",
            repo_ref: "synthetic/repository",
            number: 23,
            disposition: "reference_only",
          },
          children: ["synthetic-child"],
          parent: "synthetic-parent",
          meta: { business: "保留", tree: { arbitrary: [1, true] } },
        };
        for (const fact of task.legacy_facts ?? [])
          fact.reason.revision = `sha256:${required(task.source).sha256}`;
      }
      const before = fullTree();
      expect((await execute(true)).conflicts).toEqual([]);
      expect(fullTree()).toEqual(before);
      await execute();
      expect(
        JSON.parse(fs.readFileSync(file(`${task.task_ref}/task.json`), "utf8")),
      ).toEqual(task.record);
      const original = required(task.source),
        backup = file(`${task.task_ref}/migration/source-task.json`);
      expect(fs.readFileSync(backup)).toEqual(
        Buffer.from(original.content_base64, "base64"),
      );
      expect(fs.statSync(backup).mode & 0o777).toBe(original.mode);
      if (schema === "legacy") {
        const retired = JSON.parse(fs.readFileSync(backup, "utf8"));
        expect(retired).toMatchObject({
          creator: "retired-creator",
          assignee: "retired-assignee",
          status: "completed",
        });
      }
    },
  );

  it.each(["current", "history_only", "both"] as const)(
    "AC3 permits mixed inventories containing only %s without predecessor selectors",
    async (kind) => {
      plan.source.task_schema = "mixed";
      const task = required(plan.tasks[0]);
      mixedDisposition(
        task,
        kind === "history_only" ? "history_only" : "current",
      );
      if (kind === "both") {
        for (const [taskRef, bytes] of [
          [
            ".trellis/tasks/archive/2026-10/malformed",
            '{"id":"historical","unknown":true}',
          ],
          [".trellis/tasks/archive/2026-10/missing", null],
        ] as const) {
          fs.mkdirSync(file(taskRef), { recursive: true });
          if (bytes !== null) write(`${taskRef}/task.json`, bytes, 0o600);
          plan.tasks.push({
            workspace: "main",
            task_ref: taskRef,
            disposition: "history_only",
            source: bytes === null ? null : raw(bytes, 0o600),
          });
        }
      }
      const before = fullTree();
      expect((await execute(true)).conflicts).toEqual([]);
      expect(fullTree()).toEqual(before);
      const writer = vi.spyOn(atomic, "writeFileAtomic");
      await execute();
      for (const row of plan.tasks)
        expect(
          writer.mock.calls.some(([name]) =>
            name.startsWith(file(`${row.task_ref}/`)),
          ),
        ).toBe(false);
    },
  );

  it.each([
    "current-record",
    "active-history",
    "wrong-location",
    "unknown-row",
  ])("AC3 retains %s rejection in mixed mode", async (kind) => {
    plan.source.task_schema = "mixed";
    const task = required(plan.tasks[0]);
    if (kind === "current-record") {
      const record = task.record;
      mixedDisposition(task, "current");
      task.record = record;
      await rejectMixed(/preserve raw bytes/);
    } else if (kind === "active-history") {
      task.disposition = "history_only";
      delete task.record;
      delete task.legacy_facts;
      await rejectMixed(/location mismatch/);
    } else if (kind === "wrong-location") {
      mixedSource(task, "1.0");
      task.disposition = "convert_archive";
      await rejectMixed(/location mismatch/);
    } else {
      mixedSource(task, "1.0");
      (task as unknown as Record<string, unknown>).extra_selector = "legacy";
      await rejectMixed(/Unrecognized key/);
    }
  });
});

function previewBackups(
  before: Map<string, string>,
): Map<string, { bytes: Buffer; mode: number }> {
  const backups = new Map<string, { bytes: Buffer; mode: number }>();
  for (const [full, state] of before)
    if (state.startsWith("file:"))
      backups.set(full, {
        bytes: fs.readFileSync(full),
        mode: fs.statSync(full).mode & 0o777,
      });
  return backups;
}
function rollbackMixed(
  actions: Awaited<ReturnType<typeof migrate>>["actions"],
  before: Map<string, string>,
  backups: ReturnType<typeof previewBackups>,
  sibling: string,
): void {
  for (const action of [...actions].reverse()) {
    if (action.action === "preserve") continue;
    const backup = backups.get(action.path);
    if (backup) {
      fs.writeFileSync(action.path, backup.bytes);
      fs.chmodSync(action.path, backup.mode);
    } else fs.rmSync(action.path, { force: true });
  }
  // The caller removes only new empty directories, never a recursive broad restore.
  const after = new Map([...fullTree(), ...fullTree(sibling)]);
  for (const [full, state] of [...after].sort(
    ([a], [b]) => b.length - a.length,
  ))
    if (
      !before.has(full) &&
      state.startsWith("dir:") &&
      fs.readdirSync(full).length === 0
    )
      fs.rmdirSync(full);
  expect(new Map([...fullTree(), ...fullTree(sibling)])).toEqual(before);
}

describe("mixed inherited-copy authority and original-source recovery", () => {
  it.each([false, true])(
    "AC5/AC6 converts opposite declared sources with unique bindings, preserves originals and exact rollback (reverse=%s)",
    async (reverse) => {
      const { sibling } = mixedInheritedCopies();
      if (reverse) plan.tasks.reverse();
      const before = new Map([...fullTree(), ...fullTree(sibling)]),
        backups = previewBackups(before);
      const preview = await execute(true);
      expect(preview.conflicts).toEqual([]);
      expect(new Map([...fullTree(), ...fullTree(sibling)])).toEqual(before);
      const writer = vi.spyOn(atomic, "writeFileAtomic");
      await execute();
      for (const task of plan.tasks) {
        const workspace = required(
          plan.workspaces.find((w) => w.id === task.workspace),
        );
        const full = path.join(workspace.root, task.task_ref, "task.json"),
          source = required(task.source);
        if (task.disposition === "defer") {
          expect(fs.readFileSync(full)).toEqual(
            Buffer.from(source.content_base64, "base64"),
          );
          expect(fs.statSync(full).mode & 0o777).toBe(source.mode);
          expect(
            fs.existsSync(
              path.join(workspace.root, task.task_ref, "migration"),
            ),
          ).toBe(false);
          expect(
            fs.existsSync(
              path.join(workspace.root, task.task_ref, "deliveries"),
            ),
          ).toBe(false);
          expect(
            writer.mock.calls.some(([name]) =>
              name.startsWith(
                path.join(workspace.root, task.task_ref) + path.sep,
              ),
            ),
          ).toBe(false);
        } else {
          expect(JSON.parse(fs.readFileSync(full, "utf8"))).toEqual(
            task.record,
          );
          const backup = path.join(
            workspace.root,
            task.task_ref,
            "migration/source-task.json",
          );
          expect(fs.readFileSync(backup)).toEqual(
            Buffer.from(source.content_base64, "base64"),
          );
          expect(fs.statSync(backup).mode & 0o777).toBe(source.mode);
        }
      }
      for (const entry of plan.files.filter(
        (entry) => entry.action === "preserve",
      )) {
        const workspace = required(
          plan.workspaces.find((w) => w.id === entry.target.workspace),
        );
        const full = path.join(workspace.root, entry.target.path);
        expect(fs.readFileSync(full)).toEqual(
          Buffer.from(required(entry.source).content_base64, "base64"),
        );
        expect(fs.statSync(full).mode & 0o777).toBe(
          required(entry.source).mode,
        );
        expect(writer.mock.calls.some(([name]) => name === full)).toBe(false);
      }
      writer.mockClear();
      const migrated = new Map([...fullTree(), ...fullTree(sibling)]);
      await execute();
      expect(writer).not.toHaveBeenCalled();
      expect(new Map([...fullTree(), ...fullTree(sibling)])).toEqual(migrated);
      rollbackMixed(preview.actions, before, backups, sibling);
    },
  );

  // Reader behavior is independent of plan order; cover each invocation root once.
  it.each(["main", "sibling"] as const)(
    "AC5 resolves exact Python readers and rejects deferred predecessors from %s",
    async (invocation) => {
      const { sibling } = mixedInheritedCopies();
      await execute();
      const migrated = new Map([...fullTree(), ...fullTree(sibling)]);
      const python = process.platform === "win32" ? "python" : "python3";
      const workspace = invocation === "main" ? root : sibling;
      for (const [id, expectedRoot, taskRef] of [
        ["main-task", root, ref],
        ["second-task", sibling, ".trellis/tasks/10-12-second"],
      ]) {
        const options = {
          cwd: workspace,
          env: {
            ...process.env,
            CODEX_THREAD_ID: id,
            PYTHONDONTWRITEBYTECODE: "1",
          },
          encoding: "utf8" as const,
          stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
        };
        const scripts = path.join(workspace, ".trellis/scripts");
        expect(
          execFileSync(
            python,
            ["-B", path.join(scripts, "task.py"), "current", "--source"],
            options,
          ),
        ).toContain(`Task workspace: ${expectedRoot}`);
        const context = JSON.parse(
          execFileSync(
            python,
            ["-B", path.join(scripts, "get_context.py"), "--json"],
            options,
          ),
        ) as { currentTask: { taskWorkspaceRoot: string } };
        expect(context.currentTask.taskWorkspaceRoot).toBe(expectedRoot);
        expect(
          execFileSync(
            python,
            [
              "-B",
              path.join(scripts, "get_context.py"),
              "--mode",
              "continuation",
            ],
            options,
          ),
        ).toContain("Read the exact session Task");
        const contract = JSON.parse(
          execFileSync(
            python,
            ["-B", path.join(scripts, "delivery.py"), "contract", "--json"],
            options,
          ),
        );
        expect(contract).toMatchObject({
          task_schema: "2.0",
          delivery_api: "1.0",
        });
        const runtime = JSON.parse(
          execFileSync(
            python,
            [
              "-B",
              path.join(scripts, "get_context.py"),
              "--mode",
              "runtime-contract",
            ],
            options,
          ),
        );
        expect(runtime).toMatchObject({
          task_schema: "2.0",
          delivery_api: "1.0",
        });
        const selection = JSON.parse(
          execFileSync(
            python,
            ["-B", path.join(scripts, "delivery.py"), "current", "--json"],
            options,
          ),
        );
        expect(selection).toEqual({
          kind: "no_current_delivery",
          key: { task_id: id, lifecycle_generation: 0 },
        });
        const rejected = childProcess.spawnSync(
          python,
          [
            "-B",
            path.join(scripts, "delivery.py"),
            "select",
            "--task",
            path.join(expectedRoot === root ? sibling : root, taskRef),
            "--delivery",
            "00000000-0000-0000-0000-000000000001",
          ],
          options,
        );
        expect(rejected.status).toBe(1);
        // A missing Delivery is not proof that the deferred predecessor was rejected.
        expect(rejected.stderr).toContain(
          taskRef === ref
            ? "unsupported_task_schema"
            : "task_metadata_unsupported-fields",
        );
      }
      expect(new Map([...fullTree(), ...fullTree(sibling)])).toEqual(migrated);
    },
  );

  it("AC6 fails the actual atomic rename after a Task reaches schema2, then previews/resumes original declarations and rolls back", async () => {
    const { sibling } = mixedInheritedCopies();
    const before = new Map([...fullTree(), ...fullTree(sibling)]),
      backups = previewBackups(before);
    const preview = await execute(true);
    const actual = fs.renameSync;
    let failed = false;
    const fault = vi.spyOn(fs, "renameSync").mockImplementation((...args) => {
      if (
        !failed &&
        String(args[1]) === file(`${ref}/migration/source-task.json`)
      ) {
        expect(
          JSON.parse(fs.readFileSync(file(`${ref}/task.json`), "utf8"))
            .schema_version,
        ).toBe("2.0");
        failed = true;
        throw new Error(
          "mixed actual atomic rename failure after Task conversion",
        );
      }
      return actual(...args);
    });
    await expect(execute()).rejects.toThrow(
      "mixed actual atomic rename failure after Task conversion",
    );
    fault.mockRestore();
    expect(failed).toBe(true);
    expect(
      JSON.parse(fs.readFileSync(file(`${ref}/task.json`), "utf8"))
        .schema_version,
    ).toBe("2.0");
    expect(
      JSON.parse(
        Buffer.from(
          required(plan.tasks[0]?.source).content_base64,
          "base64",
        ).toString(),
      ),
    ).not.toHaveProperty("schema_version");
    expect(fullTree().size).toBeGreaterThan(
      before.size - fullTree(sibling).size,
    );
    expect([...fullTree().keys()].some((name) => name.endsWith(".tmp"))).toBe(
      false,
    );
    const partial = new Map([...fullTree(), ...fullTree(sibling)]);
    expect((await execute(true)).conflicts).toEqual([]);
    expect(new Map([...fullTree(), ...fullTree(sibling)])).toEqual(partial);
    await execute();
    const applied = new Map([...fullTree(), ...fullTree(sibling)]),
      writer = vi.spyOn(atomic, "writeFileAtomic");
    await execute();
    expect(writer).not.toHaveBeenCalled();
    writer.mockRestore();
    expect(new Map([...fullTree(), ...fullTree(sibling)])).toEqual(applied);
    rollbackMixed(preview.actions, before, backups, sibling);
  });

  it.each([
    "source-bytes",
    "source-mode",
    "target-bytes",
    "target-mode",
    "binding-bytes",
    "binding-mode",
  ])(
    "AC6 rejects %s third states after mixed conversion before additional writes",
    async (kind) => {
      const { sibling, binding } = mixedInheritedCopies();
      await execute();
      const full = kind.startsWith("binding")
        ? binding
        : kind.startsWith("target")
          ? file(`${ref}/task.json`)
          : path.join(sibling, ref, "task.json");
      if (kind.endsWith("bytes")) fs.appendFileSync(full, " ");
      else
        fs.chmodSync(
          full,
          (fs.statSync(full).mode & 0o777) === 0o600 ? 0o640 : 0o600,
        );
      await rejectMixed(/third_state|changed/);
    },
  );

  it.each([
    ["cross-category-id", /Task identity collision/],
    ["generation", /Task identity collision/],
    ["provenance", /Task identity collision/],
    ["case", /Task identity collision/],
    ["two-authorities", /Ambiguous Task identity|Task identity collision/],
    ["all-defer", /Task identity collision/],
    ["missing-binding", /Missing reviewed branch binding/],
    ["wrong-binding", /Branch binding selects a different Task authority/],
    ["malformed-binding", /invalid_task_branch_binding/],
    ["workspace-alias", /workspace|Workspace/],
    ["task-alias", /symlink|canonical|directory|boundary/],
    ["omitted-task", /inventory/],
    ["omitted-artifact", /artifact disposition/],
    ["peer-artifact", /Unowned Task artifact/],
    ["wrong-location", /location mismatch/],
    ["marker", /binding_required/],
  ] as const)(
    "AC5 rejects mixed %s with exact zero-write evidence",
    async (kind, message) => {
      const { sibling, binding } = mixedInheritedCopies();
      const authority = required(
        plan.tasks.find((t) => t.workspace === "main" && t.task_ref === ref),
      );
      const peer = required(
        plan.tasks.find((t) => t.workspace === "sibling" && t.task_ref === ref),
      );
      if (kind === "cross-category-id") mixedSource(peer, "legacy");
      if (kind === "generation")
        replaceSource(peer, (record) => {
          record.lifecycle_generation = 2;
        });
      if (kind === "provenance")
        replaceSource(peer, (record) => {
          record.source = {
            kind: "issue",
            repo_ref: "synthetic/repo",
            number: 1,
            disposition: "reference_only",
          };
        });
      if (kind === "case")
        replaceSource(peer, (record) => {
          record.id = "MAIN-task";
        });
      if (kind === "two-authorities") {
        peer.disposition = "convert_active";
        peer.record = structuredClone(authority.record);
        (peer.record as Record<string, unknown>).title =
          "Independently reviewed branch variant";
        peer.legacy_facts = structuredClone(authority.legacy_facts);
      }
      if (kind === "all-defer") {
        authority.disposition = "defer";
        delete authority.record;
        delete authority.legacy_facts;
      }
      if (kind === "missing-binding") plan.branch_bindings = [];
      if (kind === "wrong-binding" || kind === "malformed-binding") {
        const entry = required(plan.branch_bindings?.[0]);
        const value = JSON.parse(
          Buffer.from(entry.source.content_base64, "base64").toString(),
        ) as Record<string, unknown>;
        if (kind === "wrong-binding") value.branch_name = "inherited-sibling";
        else value.binding_revision = true;
        entry.source = raw(JSON.stringify(value), 0o600);
        fs.writeFileSync(
          binding,
          Buffer.from(entry.source.content_base64, "base64"),
        );
      }
      if (kind === "workspace-alias")
        plan.workspaces.push({ id: "alias", root, project_relative: null });
      if (kind === "task-alias") {
        fs.symlinkSync(
          path.join(sibling, ref),
          file(".trellis/tasks/alias"),
          "dir",
        );
        plan.tasks.push({
          ...structuredClone(peer),
          workspace: "main",
          task_ref: ".trellis/tasks/alias",
        });
      }
      if (kind === "omitted-task")
        plan.tasks = plan.tasks.filter((t) => t !== peer);
      if (kind === "omitted-artifact")
        plan.files = plan.files.filter(
          (entry) =>
            !(
              entry.target.workspace === "sibling" &&
              entry.target.path === `${ref}/design.md`
            ),
        );
      if (kind === "peer-artifact")
        plan.files.push({
          target: {
            kind: "project",
            workspace: "sibling",
            path: `${ref}/deliveries/invented.json`,
          },
          owner: "artifact",
          action: "write",
          source: null,
          target_content_base64: b64("{}"),
          target_mode: 0o600,
        });
      if (kind === "wrong-location") peer.disposition = "convert_archive";
      if (kind === "marker") {
        // Remove inherited duplicate groups but retain complete inventory: a marker
        // on a unique authority must still demand reviewed binding information.
        for (const task of plan.tasks.filter(
          (t) => t.disposition === "defer",
        )) {
          const workspace = required(
            plan.workspaces.find((w) => w.id === task.workspace),
          );
          fs.rmSync(path.join(workspace.root, task.task_ref), {
            recursive: true,
          });
          plan.files = plan.files.filter(
            (entry) =>
              !(
                entry.target.workspace === task.workspace &&
                entry.target.path.startsWith(`${task.task_ref}/`)
              ),
          );
        }
        plan.tasks = plan.tasks.filter((t) => t.disposition !== "defer");
        plan.branch_bindings = [];
        fs.rmSync(file(".git/trellis/task-branches"), { recursive: true });
        write(".trellis/guru-team/extension.json", "{}");
      }
      await rejectMixed(message);
    },
  );

  it.each(["legacy", "1.0"] as const)(
    "AC3 preserves exact homogeneous %s validator messages without mixed diagnostic wrapping",
    async (mode) => {
      plan.source.task_schema = mode;
      const task = required(plan.tasks[0]);
      if (mode === "legacy")
        await rejectMixed(/^Source Task is not the declared legacy schema$/);
      else {
        replaceSource(task, (record) => {
          record.extra = "unknown";
        });
        await rejectMixed(/^task.extra is not a supported field$/);
      }
    },
  );
});

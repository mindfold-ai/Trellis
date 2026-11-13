import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task/legacy-migration";
import {
  emptyTaskRecordV2,
  loadTaskRecordV2,
  relocateTaskRecordV2,
  type TaskRecordV2,
} from "@mindfoldhq/trellis-core/task/v2";
import * as api from "../../src/commands/maintenance/api.js";
import { registerMaintenanceCommand } from "../../src/commands/maintenance/command.js";
import { snapshot } from "../../src/commands/maintenance/shared.js";
// Desensitized original ten-field installation shape. Never normalize this
// predecessor before the public maintenance entry reads it.
const legacyBytes = fs.readFileSync(
  path.resolve(__dirname, "../fixtures/legacy-formal/task.json"),
  "utf8",
);
const key = { task_id: "formal-selected", lifecycle_generation: 0 };
const nextKey = { ...key, lifecycle_generation: 1 };
const original = ".trellis/tasks/original";
const archived = ".trellis/tasks/archive/2026-10/completed";
const active = ".trellis/tasks/reactivated";
const python = process.platform === "darwin" ? "/usr/bin/python3" : "python3";
let base: string, root: string, common: string, archiveCommit: string;
function write(ref: string, content: object | string, mode = 0o640): void {
  const full = path.join(root, ref);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(
    full,
    typeof content === "string"
      ? content
      : JSON.stringify(content, null, 2) + "\n",
  );
  fs.chmodSync(full, mode);
}
function git(...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function addLinkedCheckout(): string {
  git("add", ".trellis/scripts", ".trellis/workflow.md");
  git("commit", "-m", "retain native tools for linked checkout");
  const linked = path.join(base, "linked");
  git("worktree", "add", "-b", "successor", linked);
  return linked;
}
function bytes(full: string): unknown {
  if (!fs.existsSync(full)) return null;
  const stat = fs.statSync(full);
  return [
    stat.mode & 0o777,
    stat.isDirectory()
      ? fs
          .readdirSync(full)
          .sort()
          .map((name) => [name, bytes(path.join(full, name))])
      : fs.readFileSync(full).toString("hex"),
  ];
}
function ref(locator: string): { locator: string; revision: string } {
  return {
    locator,
    revision: `sha256:${snapshot(fs.readFileSync(path.join(root, locator))).sha256}`,
  };
}
function inspection(): api.InspectFormalArchiveReactivationInput {
  return {
    root,
    key,
    task_ref: archived,
    original_task_ref: original,
    archive: {
      commit: archiveCommit,
      target_ref: "main",
      target_head: git("rev-parse", "main"),
      evidence: [ref(`${archived}/history.md`)],
    },
  };
}
function input(): api.FormalArchiveReactivationInput {
  const old = JSON.parse(
    fs.readFileSync(path.join(root, archived, "task.json"), "utf8"),
  ) as Record<string, unknown>;
  const metadata = Object.fromEntries(
    Object.entries(old).filter(
      ([field]) =>
        ![
          "status",
          "commit",
          "pr_url",
          "completedAt",
          "creator",
          "assignee",
        ].includes(field),
    ),
  );
  const artifacts: api.FormalArchiveReactivationInput["artifacts"] = [];
  const walk = (prefix: string): void => {
    for (const name of fs.readdirSync(path.join(root, prefix))) {
      const locator = `${prefix}/${name}`;
      if (fs.statSync(path.join(root, locator)).isDirectory()) walk(locator);
      else if (locator !== `${archived}/task.json`)
        artifacts.push({
          path: locator,
          action: "preserve",
          source: snapshot(
            fs.readFileSync(path.join(root, locator)),
            fs.statSync(path.join(root, locator)).mode & 0o777,
          ),
        });
    }
  };
  walk(archived);
  return {
    ...inspection(),
    active_ref: active,
    projection: emptyTaskRecordV2({
      ...metadata,
      ...(old.source === undefined
        ? {
            source: {
              kind: "issue" as const,
              repo_ref: "example/project",
              number: 130,
              disposition: "reference_only" as const,
            },
          }
        : {}),
      id: key.task_id,
      lifecycle_generation: 1,
      accepted_scope: {
        ...ref(`${archived}/prd.md`),
        locator: `${active}/prd.md`,
      },
    }),
    artifacts,
    legacy_facts: old.completedAt
      ? [
          {
            field: "completedAt",
            disposition: "source_snapshot",
            owner_id: "original-owner",
            reason: ref(`${archived}/history.md`),
          },
        ]
      : [],
  };
}
function record(): TaskRecordV2 {
  return JSON.parse(
    fs.readFileSync(path.join(root, active, "task.json"), "utf8"),
  ) as TaskRecordV2;
}
function native(entry: string, ...args: string[]): string {
  const result = spawnSync(
    python,
    ["-B", `.trellis/scripts/${entry}.py`, ...args],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, TRELLIS_CONTEXT_ID: "formal-native" },
    },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return result.stdout;
}
function applyNative(operation: object): void {
  native(
    "delivery",
    "apply",
    "--task",
    active,
    "--input",
    JSON.stringify(operation),
  );
}
function prepare(): api.PreparedMaintenancePlan {
  return api.prepareFormalArchiveReactivation(input());
}
async function apply(plan = prepare()): Promise<api.MaintenanceResult> {
  return api.applyMaintenance(plan, { state_dir: path.join(base, "state") });
}
const families = ["schema1", "legacy"] as const;
describe.each(families)("%s formal recovery", (family) => {
  beforeEach(() => {
    base = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "trellis-formal-")),
    );
    root = path.join(base, "root");
    fs.mkdirSync(root);
    git("init", "-b", "main");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "maintenance.auto", "false");
    git("config", "gc.auto", "0");
    write(
      `${original}/task.json`,
      family === "legacy"
        ? legacyBytes
        : emptyTaskRecord({
            id: key.task_id,
            name: "Formal",
            title: "Formal",
            status: "completed",
            meta: { history: "original-owner" },
          }),
    );
    write(`${original}/prd.md`, "accepted historical scope\n", 0o600);
    write(
      `${original}/history.md`,
      "Original owner completed the historical work.\n",
    );
    write(`${original}/run.sh`, "#!/bin/sh\nexit 0\n", 0o750);
    git("add", original);
    git("commit", "-m", "complete original task");
    fs.mkdirSync(path.dirname(path.join(root, archived)), {
      recursive: true,
    });
    fs.renameSync(path.join(root, original), path.join(root, archived));
    git("add", original, archived);
    git("commit", "-m", "archive completed task");
    archiveCommit = git("rev-parse", "HEAD");
    fs.mkdirSync(path.join(root, archived, "empty"), { mode: 0o700 });
    fs.cpSync(
      path.resolve(__dirname, "../../src/templates/trellis/scripts"),
      path.join(root, ".trellis/scripts"),
      { recursive: true },
    );
    write(
      ".trellis/workflow.md",
      fs.readFileSync(
        path.resolve(
          __dirname,
          "../../src/templates/trellis/workflow-delivery-v1.md",
        ),
        "utf8",
      ),
    );
    common = git("rev-parse", "--path-format=absolute", "--git-common-dir");
    write("dirty-business.txt", "unrelated\n");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
    fs.rmSync(base, { recursive: true, force: true });
  });
  it("discovers family and predecessor identity from an exact locator while keeping mutating keys mandatory", async () => {
    const before = bytes(path.join(root, ".trellis"));
    const located = { root, task_ref: archived };
    expect(api.inspectTaskTarget(located)).toMatchObject({
      key,
      classification: { kind: family, task_id: key.task_id, generation: 0 },
    });
    expect(() => api.inspectTaskTarget({ ...located, key: nextKey })).toThrow(
      "target_key_mismatch",
    );
    const withoutKey: Partial<api.FormalArchiveReactivationInput> = input();
    delete withoutKey.key;
    expect(() =>
      api.prepareFormalArchiveReactivation(
        withoutKey as api.FormalArchiveReactivationInput,
      ),
    ).toThrow("invalid_input");
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value) =>
      output.push(String(value)),
    );
    for (const flags of [[], ["--task-id", key.task_id, "--generation", "0"]]) {
      const command = new Command();
      registerMaintenanceCommand(command);
      await command.parseAsync([
        "node",
        "trellis",
        "maintain",
        "inspect-task",
        "--target",
        root,
        "--task-ref",
        archived,
        ...flags,
        "--json",
      ]);
      expect(JSON.parse(output.pop() ?? "{}")).toMatchObject({
        key,
        classification: { kind: family },
      });
    }
    for (const flags of [
      ["--task-id", key.task_id],
      ["--generation", "0"],
    ]) {
      const command = new Command();
      registerMaintenanceCommand(command);
      await command.parseAsync([
        "node",
        "trellis",
        "maintain",
        "inspect-task",
        "--target",
        root,
        "--task-ref",
        archived,
        ...flags,
        "--json",
      ]);
      expect(JSON.parse(output.pop() ?? "{}")).toMatchObject({
        error: { code: "invalid_input" },
      });
    }
    expect(bytes(path.join(root, ".trellis"))).toEqual(before);
  });
  it("is write-free through inspect/prepare/preview, creates one real g+1, and preserves archive/resources", async () => {
    fs.mkdirSync(path.join(common, "trellis/sessions"), { recursive: true });
    fs.writeFileSync(
      path.join(common, "trellis/sessions/old.json"),
      JSON.stringify({ schema_version: 2, ...key }),
    );
    const before = bytes(path.join(root, ".trellis")),
      resources = bytes(path.join(common, "trellis"));
    expect(
      api.inspectFormalArchiveReactivation(inspection()).successor,
    ).toEqual({ kind: "absent" });
    const plan = prepare();
    expect(api.previewMaintenance(plan).status).toBe("prepared");
    expect(api.previewMaintenance(plan)).not.toHaveProperty("reactivated_task");
    expect(bytes(path.join(root, ".trellis"))).toEqual(before);
    expect(bytes(path.join(common, "trellis"))).toEqual(resources);
    const archiveBefore = bytes(path.join(root, archived));
    expect(await apply(plan)).toMatchObject({
      kind: "formal_archive_reactivation",
      status: "applied",
      reactivated_task: { key: nextKey, task_ref: active },
    });
    expect(bytes(path.join(root, archived))).toEqual(archiveBefore);
    expect(bytes(path.join(common, "trellis"))).toEqual(resources);
    expect(record()).toMatchObject({
      id: key.task_id,
      lifecycle_generation: 1,
      deliveries: [],
      completion_results: [],
      closure_results: [],
    });
    expect(
      fs.readFileSync(path.join(root, active, "migration/source-task.json")),
    ).toEqual(fs.readFileSync(path.join(root, archived, "task.json")));
    expect(fs.statSync(path.join(root, active, "empty")).mode & 0o777).toBe(
      0o700,
    );
    expect(fs.readFileSync(path.join(root, "dirty-business.txt"), "utf8")).toBe(
      "unrelated\n",
    );
  });
  it("recovers one original operation after lost output, with receiptless current successor lookup", async () => {
    const plan = prepare(),
      applied = await apply(plan);
    const recovery = {
      recovery_ref: path.join(base, "state", `${plan.operation_id}.json`),
    };
    expect(
      await api.applyMaintenance(plan, {
        state_dir: path.join(base, "state"),
      }),
    ).toEqual(applied);
    expect(await api.recoverMaintenance(recovery)).toEqual(applied);
    expect(await api.resumeMaintenance(recovery)).toEqual(applied);
    fs.unlinkSync(recovery.recovery_ref);
    expect(
      api.inspectFormalArchiveReactivation(inspection()).successor,
    ).toEqual({ kind: "verified", task: { key: nextKey, task_ref: active } });
    expect(() => prepare()).toThrow("already has a successor");
  });
  it.each([true, false])(
    "inspects a shared active snapshot in the selected linked root with receipt present=%s",
    async (receiptPresent) => {
      const main = root;
      root = addLinkedCheckout();
      const plan = prepare();
      const applied = await apply(plan);
      git("add", active);
      git("commit", "-m", "publish converted successor");
      execFileSync("git", ["-C", main, "merge", "--ff-only", "successor"]);
      const recovery = {
        recovery_ref: path.join(base, "state", `${plan.operation_id}.json`),
      };
      expect(await api.recoverMaintenance(recovery)).toEqual(applied);
      if (!receiptPresent) fs.unlinkSync(recovery.recovery_ref);
      const linkedBefore = bytes(path.join(root, ".trellis"));
      const mainBefore = bytes(path.join(main, ".trellis"));
      const resourcesBefore = bytes(path.join(common, "trellis"));
      expect(
        api.inspectFormalArchiveReactivation(inspection()).successor,
      ).toEqual({
        kind: "verified",
        task: { key: nextKey, task_ref: active },
      });
      expect(() => prepare()).toThrow("already has a successor");
      expect(record().lifecycle_generation).toBe(1);
      expect(fs.readdirSync(path.join(base, "state"))).toEqual(
        receiptPresent ? [`${plan.operation_id}.json`] : [],
      );
      expect(bytes(path.join(root, ".trellis"))).toEqual(linkedBefore);
      expect(bytes(path.join(main, ".trellis"))).toEqual(mainBefore);
      expect(bytes(path.join(common, "trellis"))).toEqual(resourcesBefore);
    },
  );
  it("keeps root scope progress and a later native generation usable with an earlier sibling snapshot", async () => {
    const main = root;
    root = addLinkedCheckout();
    const plan = prepare();
    const applied = await apply(plan);
    git("add", active);
    git("commit", "-m", "publish converted successor");
    execFileSync("git", ["-C", main, "merge", "--ff-only", "successor"]);
    write(`${active}/supplement.md`, "Current root scope progress\n");
    const authority = ref(`${active}/supplement.md`);
    applyNative({
      api_version: "1.0",
      operation: "accept_scope",
      key: nextKey,
      owner_role: "task_scope",
      owner_id: "trellis-start",
      authority,
    });
    const assertLookup = (generation: number): void => {
      const linkedBefore = bytes(path.join(root, ".trellis"));
      const mainBefore = bytes(path.join(main, ".trellis"));
      const resourcesBefore = bytes(path.join(common, "trellis"));
      expect(
        api.inspectFormalArchiveReactivation(inspection()).successor,
      ).toEqual({
        kind: "verified",
        task: {
          key: { ...key, lifecycle_generation: generation },
          task_ref: active,
        },
      });
      expect(() => prepare()).toThrow("already has a successor");
      expect(bytes(path.join(root, ".trellis"))).toEqual(linkedBefore);
      expect(bytes(path.join(main, ".trellis"))).toEqual(mainBefore);
      expect(bytes(path.join(common, "trellis"))).toEqual(resourcesBefore);
    };
    assertLookup(1);
    applyNative({
      api_version: "1.0",
      operation: "complete_task",
      key: nextKey,
      owner_role: "completion",
      owner_id: "trellis-complete-task",
      result: {
        result_id: "linked-completion-one",
        owner_id: "trellis-complete-task",
        evidence: [authority],
        lifecycle_generation: 1,
        accepted_scope: authority,
        delivery_result_ids: [],
        outcome: "completed",
      },
    });
    applyNative({
      api_version: "1.0",
      operation: "reopen_task",
      key: nextKey,
      owner_role: "task_scope",
      owner_id: "trellis-start",
      authority,
    });
    const recovery = {
      recovery_ref: path.join(base, "state", `${plan.operation_id}.json`),
    };
    expect(await api.recoverMaintenance(recovery)).toEqual(applied);
    expect(await api.resumeMaintenance(recovery)).toEqual(applied);
    fs.unlinkSync(recovery.recovery_ref);
    assertLookup(2);
    expect(record().lifecycle_generation).toBe(2);
    expect(fs.readdirSync(path.join(base, "state"))).toEqual([]);
    const linkedBefore = bytes(path.join(root, ".trellis"));
    const mainBefore = bytes(path.join(main, ".trellis"));
    expect(() =>
      api.inspectFormalArchiveReactivation({
        ...inspection(),
        root: main,
      }),
    ).toThrow("ambiguous_authority");
    expect(bytes(path.join(root, ".trellis"))).toEqual(linkedBefore);
    expect(bytes(path.join(main, ".trellis"))).toEqual(mainBefore);
    expect(
      JSON.parse(fs.readFileSync(path.join(main, active, "task.json"), "utf8")),
    ).toMatchObject({
      lifecycle_generation: 1,
      accepted_scope: { locator: `${active}/prd.md` },
    });
  });
  it("keeps original result fixed after actual native scope, Completion and reopen at a renamed locator", async () => {
    const plan = prepare(),
      applied = await apply(plan);
    native("task", "start", active);
    expect(JSON.parse(native("delivery", "current", "--json"))).toMatchObject({
      kind: "no_current_delivery",
      key: nextKey,
    });
    expect(native("get_context", "--mode", "continuation")).toContain(
      "whole-scope acceptance",
    );
    write(`${active}/supplement.md`, "Reviewed next scope\n");
    applyNative({
      api_version: "1.0",
      operation: "accept_scope",
      key: nextKey,
      owner_role: "task_scope",
      owner_id: "trellis-start",
      authority: ref(`${active}/supplement.md`),
    });
    applyNative({
      api_version: "1.0",
      operation: "complete_task",
      key: nextKey,
      owner_role: "completion",
      owner_id: "trellis-complete-task",
      result: {
        result_id: "completion-one",
        owner_id: "trellis-complete-task",
        evidence: [ref(`${active}/supplement.md`)],
        lifecycle_generation: 1,
        accepted_scope: ref(`${active}/supplement.md`),
        delivery_result_ids: [],
        outcome: "completed",
      },
    });
    native("task", "rename", active, "renamed");
    const renamed = ".trellis/tasks/renamed";
    native(
      "delivery",
      "apply",
      "--task",
      renamed,
      "--input",
      JSON.stringify({
        api_version: "1.0",
        operation: "reopen_task",
        key: nextKey,
        owner_role: "task_scope",
        owner_id: "trellis-start",
        authority: ref(`${renamed}/supplement.md`),
      }),
    );
    expect(
      (
        JSON.parse(
          fs.readFileSync(path.join(root, renamed, "task.json"), "utf8"),
        ) as TaskRecordV2
      ).lifecycle_generation,
    ).toBe(2);
    expect(
      api.inspectFormalArchiveReactivation(inspection()).successor,
    ).toMatchObject({
      kind: "verified",
      task: { key: { ...key, lifecycle_generation: 2 } },
    });
    expect(
      await api.recoverMaintenance({
        recovery_ref: path.join(base, "state", `${plan.operation_id}.json`),
      }),
    ).toEqual(applied);
    expect(
      await api.resumeMaintenance({
        recovery_ref: path.join(base, "state", `${plan.operation_id}.json`),
      }),
    ).toEqual(applied);
    await expect(
      api.rollbackMaintenance({
        recovery_ref: path.join(base, "state", `${plan.operation_id}.json`),
      }),
    ).rejects.toThrow("later_work_conflict");
  });
  it("finds an actually completed and archived successor without a private receipt", async () => {
    const plan = prepare();
    const applied = await apply(plan);
    native("task", "start", active);
    const authority = ref(`${active}/prd.md`);
    applyNative({
      api_version: "1.0",
      operation: "complete_task",
      key: nextKey,
      owner_role: "completion",
      owner_id: "trellis-complete-task",
      result: {
        result_id: "completed-next",
        owner_id: "trellis-complete-task",
        evidence: [authority],
        lifecycle_generation: 1,
        accepted_scope: authority,
        delivery_result_ids: [],
        outcome: "completed",
      },
    });
    applyNative({
      api_version: "1.0",
      operation: "close_task",
      key: nextKey,
      owner_role: "closure",
      owner_id: "trellis-finish-work",
      result: {
        result_id: "closed-next",
        owner_id: "trellis-finish-work",
        evidence: [authority],
        lifecycle_generation: 1,
        completion_result_id: "completed-next",
        disposition: "no_mutation",
        source_result: null,
      },
    });
    write(".trellis/config.yaml", "task_auto_commit: false\n");
    native("task", "archive", active);
    const taskRef = `.trellis/tasks/archive/${new Date().toISOString().slice(0, 7)}/reactivated`;
    expect(
      api.inspectFormalArchiveReactivation(inspection()).successor,
    ).toEqual({
      kind: "verified",
      task: { key: nextKey, task_ref: taskRef },
    });
    expect(() => prepare()).toThrow("already has a successor");
    expect(
      await api.recoverMaintenance({
        recovery_ref: path.join(base, "state", `${plan.operation_id}.json`),
      }),
    ).toEqual(applied);
    // Archived current v2 uses its ordinary Completion-gated reopen, preserving
    // the predecessor archive and its original generation.
    native(
      "delivery",
      "apply",
      "--task",
      taskRef,
      "--input",
      JSON.stringify({
        api_version: "1.0",
        operation: "reopen_task",
        key: nextKey,
        owner_role: "task_scope",
        owner_id: "trellis-start",
        authority: ref(`${taskRef}/prd.md`),
      }),
    );
    expect(record().lifecycle_generation).toBe(2);
    expect(
      api.inspectFormalArchiveReactivation(inspection()).successor,
    ).toMatchObject({
      kind: "verified",
      task: { key: { ...key, lifecycle_generation: 2 }, task_ref: active },
    });
  });
  it("keeps SDK relocation and create identity reservation consistent with native moves", async () => {
    await apply();
    const { preimage } = loadTaskRecordV2({ root, taskDir: active });
    const destination = ".trellis/tasks/sdk-renamed";
    relocateTaskRecordV2({
      root,
      taskDir: active,
      destination,
      expected_preimage: preimage,
      name: "SDK rename",
    });
    expect(
      api.inspectFormalArchiveReactivation(inspection()).successor,
    ).toMatchObject({
      kind: "verified",
      task: { key: nextKey, task_ref: destination },
    });
    const creation = spawnSync(
      python,
      [
        "-B",
        ".trellis/scripts/task.py",
        "create",
        "Duplicate",
        "--description",
        "Must preserve identity reservation",
        "--task-id",
        key.task_id,
        "--schema-version",
        "2.0",
        "--no-start",
      ],
      { cwd: root, encoding: "utf8" },
    );
    expect(creation.status).toBe(1);
    expect(creation.stdout + creation.stderr).toContain("task_id_collision");
  });
  it("continues ordinary partial application with the same frozen preimages", async () => {
    const plan = prepare();
    // A regular filesystem write error interrupts the original executor after
    // its durable receipt and initial directory actions have been written.
    const originalRename = fs.renameSync;
    let failed = false;
    const writeAtomic = vi
      .spyOn(fs, "renameSync")
      .mockImplementation((from, to) => {
        if (!failed && String(to) === path.join(root, active, "task.json")) {
          failed = true;
          throw new Error("ordinary write failure");
        }
        return originalRename(from, to);
      });
    await expect(apply(plan)).rejects.toThrow("ordinary write failure");
    writeAtomic.mockRestore();
    const recovery = {
      recovery_ref: path.join(base, "state", `${plan.operation_id}.json`),
    };
    expect(fs.existsSync(recovery.recovery_ref)).toBe(true);
    expect(fs.existsSync(path.join(root, active, "prd.md"))).toBe(true);
    const pending = await api.recoverMaintenance(recovery);
    expect(pending).toMatchObject({
      operation_id: plan.operation_id,
      status: "pending",
    });
    expect(pending).not.toHaveProperty("reactivated_task");
    const result = await api.resumeMaintenance(recovery);
    expect(result).toMatchObject({
      operation_id: plan.operation_id,
      status: "applied",
      reactivated_task: { key: nextKey },
    });
  });
  it("accepts normal target advancement when frozen history remains reachable", async () => {
    const plan = prepare();
    write("new-main.txt", "ordinary target advance\n");
    git("add", "new-main.txt");
    git("commit", "-m", "advance target");
    expect((await apply(plan)).status).toBe("applied");
  });
  it("rejects ordinary missing reachability, original-active presence and source drift without writes", () => {
    const before = bytes(path.join(root, ".trellis"));
    const reviewed = input();
    reviewed.archive.commit = git("rev-parse", "HEAD~1");
    expect(() => api.prepareFormalArchiveReactivation(reviewed)).toThrow(
      "original_active_present",
    );
    git("branch", "before-archive", "HEAD~1");
    expect(() =>
      api.inspectFormalArchiveReactivation({
        ...inspection(),
        archive: { ...inspection().archive, target_ref: "before-archive" },
      }),
    ).toThrow("invalid_git_fact");
    expect(bytes(path.join(root, ".trellis"))).toEqual(before);
    write(`${archived}/history.md`, "source changed normally\n");
    expect(() => prepare()).toThrow("stale_source");
  });
  it("rejects ordinary source, locator and predecessor/successor mismatches without changing archives or unrelated work", async () => {
    const before = bytes(path.join(root, ".trellis"));
    const mismatched = input();
    mismatched.projection = {
      ...(mismatched.projection as TaskRecordV2),
      source: {
        kind: "issue",
        repo_ref: "other/project",
        number: 130,
        disposition: "reference_only",
      },
    };
    expect(() => api.prepareFormalArchiveReactivation(mismatched)).toThrow(
      "source_mismatch",
    );
    expect(() =>
      api.inspectFormalArchiveReactivation({
        ...inspection(),
        original_task_ref: archived,
      }),
    ).toThrow("invalid_task_path");
    expect(() =>
      api.inspectFormalArchiveReactivation({ ...inspection(), key: nextKey }),
    ).toThrow("target_key_mismatch");
    expect(bytes(path.join(root, ".trellis"))).toEqual(before);
    const archiveBefore = bytes(path.join(root, archived));
    const applied = await apply();
    const current = record();
    write(`${active}/task.json`, {
      ...current,
      source: {
        kind: "issue",
        repo_ref: "other/project",
        number: 130,
        disposition: "reference_only",
      },
    });
    if (!applied.recovery_ref)
      throw new Error("Applied operation requires a recovery reference");
    fs.unlinkSync(applied.recovery_ref);
    expect(() => api.inspectFormalArchiveReactivation(inspection())).toThrow(
      "source_mismatch",
    );
    const { preimage } = loadTaskRecordV2({ root, taskDir: active });
    expect(() =>
      relocateTaskRecordV2({
        root,
        taskDir: active,
        destination: ".trellis/tasks/wrong-source-move",
        expected_preimage: preimage,
        name: "Must reject mismatched source",
      }),
    ).toThrow("formal_archive_provenance_mismatch");
    const nativeMove = spawnSync(
      python,
      ["-B", ".trellis/scripts/task.py", "rename", active, "wrong-source-move"],
      { cwd: root, encoding: "utf8" },
    );
    expect(nativeMove.status).toBe(1);
    expect(nativeMove.stdout + nativeMove.stderr).toContain(
      "formal_archive_provenance_mismatch",
    );
    expect(
      fs.existsSync(path.join(root, ".trellis/tasks/wrong-source-move")),
    ).toBe(false);
    write(`${active}/task.json`, current);
    const relation = `${active}/migration/formal-archive-reactivation.json`;
    const provenance = JSON.parse(
      fs.readFileSync(path.join(root, relation), "utf8"),
    ) as object;
    write(relation, {
      ...provenance,
      original_task_ref: ".trellis/tasks/wrong-original",
    });
    expect(() => api.inspectFormalArchiveReactivation(inspection())).toThrow(
      "successor_mismatch",
    );
    expect(bytes(path.join(root, archived))).toEqual(archiveBefore);
    expect(fs.readFileSync(path.join(root, "dirty-business.txt"), "utf8")).toBe(
      "unrelated\n",
    );
  });
  it("rejects occupied destinations and reports conflicting active candidates without choosing one", () => {
    write(`${active}/notes.md`, "another task owns this destination\n");
    expect(() => prepare()).toThrow("occupied");
    fs.rmSync(path.join(root, active), { recursive: true });
    for (const ref of [".trellis/tasks/one", ".trellis/tasks/two"])
      write(
        `${ref}/task.json`,
        emptyTaskRecordV2({ id: key.task_id, lifecycle_generation: 1 }),
      );
    expect(
      api.inspectFormalArchiveReactivation(inspection()).successor,
    ).toEqual({
      kind: "conflicting",
      task_refs: [".trellis/tasks/one", ".trellis/tasks/two"],
    });
  });
  it("rolls back only its own new tree before later work", async () => {
    const archivedBefore = bytes(path.join(root, archived));
    const plan = prepare();
    await apply(plan);
    const result = await api.rollbackMaintenance({
      recovery_ref: path.join(base, "state", `${plan.operation_id}.json`),
    });
    expect(result.status).toBe("rolled_back");
    expect(result).not.toHaveProperty("reactivated_task");
    expect(fs.existsSync(path.join(root, active))).toBe(false);
    expect(bytes(path.join(root, archived))).toEqual(archivedBefore);
  });
  it("refuses rollback after a real native session selection and retains both generations", async () => {
    const plan = prepare();
    await apply(plan);
    native("task", "start", active);
    await expect(
      api.rollbackMaintenance({
        recovery_ref: path.join(base, "state", `${plan.operation_id}.json`),
      }),
    ).rejects.toThrow("later_work_conflict");
    expect(record().lifecycle_generation).toBe(1);
  });
  it.each(["scope", "delivery", "binding"] as const)(
    "preserves actual new-generation %s work when rollback is requested",
    async (work) => {
      const plan = prepare();
      await apply(plan);
      if (work === "scope") {
        write(`${active}/supplement.md`, "New accepted work\n");
        applyNative({
          api_version: "1.0",
          operation: "accept_scope",
          key: nextKey,
          owner_role: "task_scope",
          owner_id: "trellis-start",
          authority: ref(`${active}/supplement.md`),
        });
      } else if (work === "delivery") {
        applyNative({
          api_version: "1.0",
          operation: "create_delivery",
          key: {
            ...nextKey,
            delivery_id: "11111111-1111-4111-8111-111111111111",
          },
          owner_role: "creation",
          owner_id: "trellis-start",
          profile: "manual",
          scope_ref: {
            authority: record().accepted_scope,
            anchors: ["actual next slice"],
          },
        });
      } else {
        // The environment owner establishes its ordinary canonical binding after
        // conversion. Maintenance neither creates it nor assumes old ownership.
        const binding = path.join(
          common,
          `trellis/task-branches/${key.task_id}/1.json`,
        );
        fs.mkdirSync(path.dirname(binding), { recursive: true });
        fs.writeFileSync(
          binding,
          JSON.stringify({
            schema_version: "1.0",
            ...nextKey,
            binding_revision: 0,
            branch_name: "main",
          }),
        );
      }
      const before = bytes(path.join(root, active));
      await expect(
        api.rollbackMaintenance({
          recovery_ref: path.join(base, "state", `${plan.operation_id}.json`),
        }),
      ).rejects.toThrow("later_work_conflict");
      expect(bytes(path.join(root, active))).toEqual(before);
    },
  );
  it("stops duplicate conversion when a registered sibling owns a successor", async () => {
    const plan = prepare();
    const main = root;
    root = addLinkedCheckout();
    await apply();
    const linkedBefore = bytes(path.join(root, ".trellis"));
    root = main;
    const mainBefore = bytes(path.join(root, ".trellis"));
    expect(() => prepare()).toThrow("ambiguous_authority");
    await expect(apply(plan)).rejects.toThrow("later_work_conflict");
    expect(fs.existsSync(path.join(root, active))).toBe(false);
    expect(bytes(path.join(root, ".trellis"))).toEqual(mainBefore);
    expect(bytes(path.join(base, "linked", ".trellis"))).toEqual(linkedBefore);
  });
  it("uses the public command envelope and preserves additive API capability", async () => {
    const request = path.join(base, "input.json");
    fs.writeFileSync(
      request,
      JSON.stringify({ kind: "formal_archive_reactivation", input: input() }),
    );
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value) =>
      output.push(String(value)),
    );
    const command = new Command();
    registerMaintenanceCommand(command);
    await command.parseAsync([
      "node",
      "trellis",
      "maintain",
      "prepare",
      "--input",
      request,
      "--json",
    ]);
    expect(JSON.parse(output.pop() ?? "{}")).toMatchObject({
      kind: "formal_archive_reactivation",
    });
    fs.writeFileSync(request, JSON.stringify(inspection()));
    const inspectCommand = new Command();
    registerMaintenanceCommand(inspectCommand);
    await inspectCommand.parseAsync([
      "node",
      "trellis",
      "maintain",
      "inspect-formal-archive",
      "--input",
      request,
      "--json",
    ]);
    expect(JSON.parse(output.pop() ?? "{}")).toMatchObject({
      successor: { kind: "absent" },
    });
    expect(api.getMaintenanceContract()).toMatchObject({
      maintenance_api: "1.0",
      formal_archive_reactivation: {
        task_families: ["schema1", "known_legacy"],
        generation: "increment_once",
        original_archive: "read_only",
      },
    });
  });
});

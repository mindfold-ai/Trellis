import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTaskRecordV2 } from "@mindfoldhq/trellis-core/task/v2";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task/legacy-migration";
import {
  applyPlan,
  preparePlan,
  recoverOperation,
  resumeOperation,
  rollbackOperation,
  readSnapshot,
  readDirectorySnapshot,
  snapshot,
  observeRepository,
  type MaintenanceAction,
} from "../../src/commands/maintenance/shared.js";
vi.mock("../../src/commands/maintenance/tools.js", () => ({
  validateToolsSelection: vi.fn(),
  validateToolsInstallation: vi.fn(),
}));

describe("bounded same-operation maintenance engine", () => {
  let fixture: string;
  let root: string;
  let state: string;
  beforeEach(() => {
    fixture = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "trellis-maintenance-engine-")),
    );
    root = path.join(fixture, "checkout");
    state = path.join(fixture, "recovery");
    fs.mkdirSync(path.join(root, ".trellis/tasks/selected"), {
      recursive: true,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(fixture, { recursive: true, force: true });
  });
  const taskRef = ".trellis/tasks/selected";
  function file(name: string, content: string): MaintenanceAction {
    const ref = `${taskRef}/${name}`;
    return {
      root,
      path: ref,
      source: readSnapshot(root, ref),
      target: snapshot(content, 0o640),
    };
  }
  function taskPlan(actions: MaintenanceAction[]) {
    return preparePlan({
      kind: "task_conversion",
      target_root: root,
      common_dir: null,
      guard: { task_id: "selected", generation: 0, task_ref: taskRef },
      actions,
    });
  }
  it("prepares without writes, recovers original identity and restores modes while preserving later business work", async () => {
    fs.writeFileSync(path.join(root, taskRef, "task.json"), "old", {
      mode: 0o600,
    });
    const plan = taskPlan([file("task.json", "converted")]);
    expect(fs.existsSync(state)).toBe(false);
    expect(fs.readFileSync(path.join(root, taskRef, "task.json"), "utf8")).toBe(
      "old",
    );
    const result = await applyPlan(plan, state);
    const ref = result.recovery_ref as string;
    expect((await recoverOperation(ref)).operation_id).toBe(plan.operation_id);
    fs.writeFileSync(path.join(root, "business.txt"), "later business");
    await rollbackOperation(ref);
    expect(fs.readFileSync(path.join(root, taskRef, "task.json"), "utf8")).toBe(
      "old",
    );
    expect(
      fs.statSync(path.join(root, taskRef, "task.json")).mode & 0o777,
    ).toBe(0o600);
    expect(fs.readFileSync(path.join(root, "business.txt"), "utf8")).toBe(
      "later business",
    );
  });
  it("resumes an ordinary partial writer failure without freezing a new preimage", async () => {
    fs.writeFileSync(path.join(root, taskRef, "first"), "source");
    const plan = taskPlan([file("first", "target"), file("second", "target2")]);
    const original = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(to).endsWith("/second"))
        throw new Error("ordinary write failure");
      return original(from, to);
    });
    await expect(applyPlan(plan, state)).rejects.toThrow(
      "ordinary write failure",
    );
    vi.restoreAllMocks();
    const ref = path.join(state, `${plan.operation_id}.json`);
    expect((await recoverOperation(ref)).pending_paths).toEqual([
      `${root}:${taskRef}/second`,
    ]);
    expect((await resumeOperation(ref)).status).toBe("applied");
    await rollbackOperation(ref);
    expect(fs.readFileSync(path.join(root, taskRef, "first"), "utf8")).toBe(
      "source",
    );
    expect(fs.existsSync(path.join(root, taskRef, "second"))).toBe(false);
  });
  it("blocks later owned edits before any restore writes", async () => {
    const plan = taskPlan([file("first", "target"), file("second", "target2")]);
    const result = await applyPlan(plan, state);
    fs.writeFileSync(path.join(root, taskRef, "second"), "new business");
    await expect(
      rollbackOperation(result.recovery_ref as string),
    ).rejects.toThrow("later_work_conflict");
    expect(fs.readFileSync(path.join(root, taskRef, "first"), "utf8")).toBe(
      "target",
    );
  });
  it("blocks legacy tool restoration after a normal Task2 conversion", async () => {
    const plan = preparePlan({
      kind: "tools_install",
      target_root: root,
      common_dir: null,
      guard: {
        source_runtime: "legacy",
        source_version: "0.6.16",
        target_version: "0.7.0-castbox.3",
        configured_platforms: [],
        required_paths: [],
        workflow: { action: "preserve" },
      },
      actions: [
        {
          root,
          path: ".trellis/.version",
          source: null,
          target: snapshot("new"),
        },
      ],
    });
    const result = await applyPlan(plan, state);
    fs.writeFileSync(
      path.join(root, taskRef, "task.json"),
      JSON.stringify(emptyTaskRecordV2({ id: "selected" })),
    );
    await expect(
      rollbackOperation(result.recovery_ref as string),
    ).rejects.toThrow("incompatible_restore");
    expect(fs.readFileSync(path.join(root, ".trellis/.version"), "utf8")).toBe(
      "new",
    );
  });
  it("restores compatible tools without interpreting ordinary planning JSON as Task state", async () => {
    fs.writeFileSync(
      path.join(root, taskRef, "task.json"),
      JSON.stringify(emptyTaskRecord({ id: "selected" })),
    );
    fs.writeFileSync(
      path.join(root, taskRef, "design-output.json"),
      JSON.stringify({
        schema_version: "2.0",
        diagram: "ordinary business evidence",
      }),
    );
    const plan = preparePlan({
      kind: "tools_install",
      target_root: root,
      common_dir: null,
      guard: {
        source_runtime: "legacy",
        source_version: "0.6.16",
        target_version: "0.7.0-castbox.3",
        configured_platforms: [],
        required_paths: [],
        workflow: { action: "preserve" },
      },
      actions: [
        {
          root,
          path: ".trellis/.version",
          source: null,
          target: snapshot("new"),
        },
      ],
    });
    const applied = await applyPlan(plan, state);
    expect(
      (await rollbackOperation(applied.recovery_ref as string)).status,
    ).toBe("rolled_back");
    expect(
      JSON.parse(
        fs.readFileSync(path.join(root, taskRef, "design-output.json"), "utf8"),
      ),
    ).toHaveProperty("schema_version", "2.0");
  });
  it("blocks changed configured platforms before installation writes", async () => {
    const plan = preparePlan({
      kind: "tools_install",
      target_root: root,
      common_dir: null,
      guard: {
        source_runtime: "legacy",
        source_version: "0.6.16",
        target_version: "0.7.0-castbox.3",
        configured_platforms: [],
        required_paths: [],
        workflow: { action: "preserve" },
      },
      actions: [
        {
          root,
          path: ".trellis/.version",
          source: null,
          target: snapshot("new"),
        },
      ],
    });
    fs.mkdirSync(path.join(root, ".claude/commands"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".claude/commands/test.md"),
      "new configured platform",
    );
    fs.writeFileSync(
      path.join(root, ".trellis/.template-hashes.json"),
      JSON.stringify({
        __version: 2,
        hashes: { ".claude/agents/trellis-check.md": snapshot("owned").sha256 },
      }),
    );
    await expect(applyPlan(plan, state)).rejects.toThrow(
      "installation_context_changed",
    );
    expect(fs.existsSync(path.join(root, ".trellis/.version"))).toBe(false);
  });
  it("recognizes actual Task2 data behind a supported shared task-root alias", async () => {
    const taskStore = path.join(fixture, "task-storage");
    fs.renameSync(path.join(root, ".trellis/tasks"), taskStore);
    fs.symlinkSync(taskStore, path.join(root, ".trellis/tasks"), "dir");
    fs.writeFileSync(
      path.join(root, taskRef, "task.json"),
      JSON.stringify(emptyTaskRecord({ id: "selected" })),
    );
    const plan = preparePlan({
      kind: "tools_install",
      target_root: root,
      common_dir: null,
      guard: {
        source_runtime: "legacy",
        source_version: "0.6.16",
        target_version: "0.7.0-castbox.3",
        configured_platforms: [],
        required_paths: [],
        workflow: { action: "preserve" },
      },
      actions: [
        {
          root,
          path: ".trellis/.version",
          source: null,
          target: snapshot("new"),
        },
      ],
    });
    const applied = await applyPlan(plan, state);
    fs.writeFileSync(
      path.join(root, taskRef, "task.json"),
      JSON.stringify(emptyTaskRecordV2({ id: "selected" })),
    );
    await expect(
      rollbackOperation(applied.recovery_ref as string),
    ).rejects.toThrow("incompatible_restore");
    expect(fs.readFileSync(path.join(root, ".trellis/.version"), "utf8")).toBe(
      "new",
    );
  });
  it("restores closeout directories before retiring its archive, retaining empty-directory modes", async () => {
    const archive = ".trellis/tasks/archive/2026-10/selected";
    const record = JSON.stringify({ id: "selected", status: "completed" });
    fs.writeFileSync(path.join(root, taskRef, "task.json"), record);
    fs.mkdirSync(path.join(root, taskRef, "empty"), { mode: 0o700 });
    const actions: MaintenanceAction[] = [
      ...[
        ".trellis/tasks/archive",
        ".trellis/tasks/archive/2026-10",
        archive,
      ].map((ref) => ({
        kind: "directory" as const,
        root,
        path: ref,
        source: null,
        target: { mode: 0o755 },
      })),
      {
        kind: "directory",
        root,
        path: `${archive}/empty`,
        source: null,
        target: { mode: 0o700 },
      },
      {
        root,
        path: `${archive}/task.json`,
        source: null,
        target: readSnapshot(root, `${taskRef}/task.json`),
      },
      {
        root,
        path: `${taskRef}/task.json`,
        source: readSnapshot(root, `${taskRef}/task.json`),
        target: null,
      },
      {
        kind: "directory",
        root,
        path: `${taskRef}/empty`,
        source: { mode: 0o700 },
        target: null,
      },
      {
        kind: "directory",
        root,
        path: taskRef,
        source: readDirectorySnapshot(root, taskRef),
        target: null,
      },
    ];
    const plan = preparePlan({
      kind: "legacy_closeout",
      target_root: root,
      common_dir: null,
      guard: {
        task_id: "selected",
        generation: 0,
        task_ref: taskRef,
        archive_ref: archive,
      },
      actions,
    });
    const applied = await applyPlan(plan, state);
    expect(fs.existsSync(path.join(root, taskRef))).toBe(false);
    expect(fs.readFileSync(path.join(root, archive, "task.json"), "utf8")).toBe(
      record,
    );
    await rollbackOperation(applied.recovery_ref as string);
    expect(fs.statSync(path.join(root, taskRef, "empty")).mode & 0o777).toBe(
      0o700,
    );
    expect(fs.existsSync(path.join(root, ".trellis/tasks/archive"))).toBe(
      false,
    );
  });
  it("blocks removing a created projection directory containing later business work", async () => {
    const directory = `${taskRef}/deliveries`;
    const plan = taskPlan([
      {
        kind: "directory",
        root,
        path: directory,
        source: null,
        target: { mode: 0o755 },
      },
      file("deliveries/plan.md", "plan"),
    ]);
    const applied = await applyPlan(plan, state);
    fs.writeFileSync(path.join(root, directory, "later.md"), "later work");
    await expect(
      rollbackOperation(applied.recovery_ref as string),
    ).rejects.toThrow("later_work_conflict");
    expect(fs.readFileSync(path.join(root, directory, "plan.md"), "utf8")).toBe(
      "plan",
    );
  });

  it("rejects a sequential branch switch before writes and resumes the same operation after restoring ownership", async () => {
    const git = (...args: string[]): string =>
      execFileSync("git", ["-C", root, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    git("init", "-b", "main");
    git("config", "user.name", "Maintenance Test");
    git("config", "user.email", "maintenance@example.invalid");
    git("commit", "--allow-empty", "-m", "fixture");
    const ref = `${taskRef}/task.json`;
    fs.writeFileSync(path.join(root, ref), "old task");
    const repository = observeRepository(root);
    const plan = preparePlan({
      kind: "task_conversion",
      target_root: root,
      common_dir: repository.common_dir,
      guard: { task_id: "selected", generation: 0, task_ref: taskRef },
      actions: [file("task.json", "converted")],
    });
    expect(plan.kind !== "tools_install" && plan.guard.target_branch).toBe(
      "main",
    );
    git("switch", "-c", "another");
    await expect(applyPlan(plan, state)).rejects.toThrow(
      "task_authority_changed",
    );
    expect(fs.existsSync(state)).toBe(false);
    expect(fs.readFileSync(path.join(root, ref), "utf8")).toBe("old task");
    git("switch", "main");
    const applied = await applyPlan(plan, state);
    expect(applied.operation_id).toBe(plan.operation_id);
    git("switch", "another");
    await expect(
      recoverOperation(applied.recovery_ref as string),
    ).rejects.toThrow("task_authority_changed");
    await expect(
      resumeOperation(applied.recovery_ref as string),
    ).rejects.toThrow("task_authority_changed");
    await expect(
      rollbackOperation(applied.recovery_ref as string),
    ).rejects.toThrow("task_authority_changed");
    expect(fs.readFileSync(path.join(root, ref), "utf8")).toBe("converted");
    git("switch", "main");
    await rollbackOperation(applied.recovery_ref as string);
    expect(fs.readFileSync(path.join(root, ref), "utf8")).toBe("old task");
  });
});

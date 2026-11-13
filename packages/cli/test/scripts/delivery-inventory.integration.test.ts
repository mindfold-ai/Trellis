import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task";
import {
  applyTaskOperation,
  emptyTaskRecordV2,
  type TaskRecordV2,
} from "@mindfoldhq/trellis-core/task/v2";
import { deliveryWorkflowMdTemplate } from "../../src/templates/trellis/index.js";
import { readDeliveryWorkflowContract } from "../../src/utils/delivery-workflow.js";
import { seedDeliveryContext } from "../templates/delivery-fixture.js";

const scripts = path.resolve(
  import.meta.dirname,
  "../../src/templates/trellis/scripts",
);
const python = process.platform === "win32" ? "python" : "python3";
const contract = readDeliveryWorkflowContract(deliveryWorkflowMdTemplate);
if (!contract) throw new Error("Missing native declaration");
const workflow = contract;

function snapshot(root: string): Map<string, string> {
  const files = new Map<string, string>();
  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else
        files.set(
          path.relative(root, file),
          fs.readFileSync(file).toString("base64"),
        );
    }
  }
  walk(root);
  return files;
}

describe("schema-2 acceptance and Delivery inventory", () => {
  let root: string;
  let env: NodeJS.ProcessEnv;
  const authority = {
    locator: "scope.md",
    revision: "sha256:" + "a".repeat(64),
  };
  function run(...args: string[]) {
    return spawnSync(python, args, { cwd: root, env, encoding: "utf8" });
  }
  function writeTask(
    name: string,
    record: TaskRecordV2,
    archive = false,
  ): void {
    const dir = path.join(
      root,
      ".trellis/tasks",
      archive ? "archive/2026-10" : "",
      name,
    );
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "task.json"), JSON.stringify(record));
  }
  function complete(record: TaskRecordV2): TaskRecordV2 {
    return applyTaskOperation(
      record,
      {
        api_version: "1.0",
        operation: "complete_task",
        owner_role: "completion",
        owner_id: workflow.owners.completion,
        key: {
          task_id: record.id,
          lifecycle_generation: record.lifecycle_generation,
        },
        result: {
          result_id: `completion-${record.id}`,
          owner_id: workflow.owners.completion,
          evidence: [authority],
          lifecycle_generation: record.lifecycle_generation,
          accepted_scope: authority,
          delivery_result_ids: [],
          outcome: "completed",
        },
      },
      workflow,
    ).record;
  }
  function scoped(id: string): TaskRecordV2 {
    return applyTaskOperation(
      emptyTaskRecordV2({ id, name: id }),
      {
        api_version: "1.0",
        operation: "accept_scope",
        owner_role: "task_scope",
        owner_id: workflow.owners.task_scope,
        key: { task_id: id, lifecycle_generation: 0 },
        authority,
      },
      workflow,
    ).record;
  }
  beforeEach(() => {
    root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "trellis-delivery-inventory-")),
    );
    env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        [
          "PATH",
          "Path",
          "SYSTEMROOT",
          "SystemRoot",
          "WINDIR",
          "PATHEXT",
        ].includes(key),
      ),
    );
    env.PYTHONDONTWRITEBYTECODE = "1";
    fs.cpSync(scripts, path.join(root, ".trellis/scripts"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, ".trellis/config.yaml"),
      "task_auto_commit: false\n",
    );
    fs.writeFileSync(
      path.join(root, ".trellis/workflow.md"),
      deliveryWorkflowMdTemplate,
    );
    fs.writeFileSync(path.join(root, "scope.md"), "accepted Task scope");
    writeTask("unaccepted", emptyTaskRecordV2({ id: "unaccepted" }));
    writeTask("scoped", scoped("scoped"));
    writeTask("done", complete(scoped("done")));
    writeTask("archived-done", complete(scoped("archived-done")), true);
    writeTask("archived-open", scoped("archived-open"), true);
    seedDeliveryContext(root, "slice", "slice");
    writeTask("parent", {
      ...scoped("parent"),
      children: [
        "done",
        "archived-done",
        "archived-open",
        "unknown-child",
        "legacy-done",
      ],
    });
    for (const name of ["legacy-planning", "legacy-done"]) {
      const dir = path.join(root, ".trellis/tasks", name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "task.json"),
        JSON.stringify(
          emptyTaskRecord({
            id: name,
            status: name.endsWith("done") ? "completed" : "planning",
          }),
        ),
      );
    }
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("lists typed acceptance, real slice phases and deferred legacy history without pseudo status", () => {
    const before = snapshot(root);
    const result = run(".trellis/scripts/task.py", "list", "--json");
    expect(result.status, result.stderr).toBe(0);
    const tasks = (
      JSON.parse(result.stdout) as { tasks: Record<string, unknown>[] }
    ).tasks;
    expect(tasks.find((task) => task.id === "unaccepted")).toMatchObject({
      accepted_scope: null,
      completion_result_id: null,
      deliveries: [],
    });
    expect(tasks.find((task) => task.id === "done")).toMatchObject({
      completion_result_id: "completion-done",
    });
    expect(tasks.find((task) => task.id === "slice")).toMatchObject({
      deliveries: [
        {
          phase: "planning",
          profile: "manual",
          delivery_result_id: null,
          stop_result_id: null,
        },
      ],
    });
    for (const task of tasks) {
      expect(task).not.toHaveProperty("status");
      expect(task).not.toHaveProperty("display_status");
    }
    expect(tasks.find((task) => task.id === "legacy-planning")).toMatchObject({
      history_only: true,
      record_schema: "legacy",
    });
    const text = run(".trellis/scripts/task.py", "list");
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toContain(
      "parent/ (scope=accepted; completion=none; deliveries=none) [2/5 done]",
    );
    expect(text.stdout).not.toContain("task_scope");
    expect(text.stdout).not.toContain("task_completed");
    expect(snapshot(root)).toEqual(before);
  });

  it("keeps v2 pending inventory visible without treating it as implementation authority", () => {
    const before = snapshot(root);
    const result = run(
      "-c",
      "import json,sys;from pathlib import Path;sys.path.insert(0,'.trellis/scripts');from common.task_queue import list_pending_tasks,list_task_inventory;from common.tasks import load_task;print(json.dumps({'pending':list_pending_tasks(Path.cwd()),'complete':list_task_inventory(Path.cwd(),completion='complete'),'planning':list_task_inventory(Path.cwd(),phase='planning'),'v2_status':load_task(Path('.trellis/tasks/slice'),Path.cwd()).status}))",
    );
    expect(result.status, result.stderr).toBe(0);
    const data = JSON.parse(result.stdout) as {
      pending: { id: string; status?: string }[];
      complete: { id: string }[];
      planning: { id: string }[];
      v2_status: unknown;
    };
    expect(data.pending.map((task) => task.id).sort()).toEqual([
      "parent",
      "scoped",
      "slice",
      "unaccepted",
    ]);
    expect(data.pending.every((task) => task.status === undefined)).toBe(true);
    expect(data.complete.map((task) => task.id)).toEqual(["done"]);
    expect(data.planning.map((task) => task.id)).toEqual(["slice"]);
    expect(data.v2_status).toBeNull();
    expect(snapshot(root)).toEqual(before);
  });

  it("uses closed completion/phase filters, with --status confined to legacy execution", () => {
    for (const [filter, value, expected] of [
      ["--completion", "complete", ["done"]],
      ["--delivery-phase", "planning", ["slice"]],
      ["--status", "planning", []],
    ] as const) {
      const result = run(
        ".trellis/scripts/task.py",
        "list",
        filter,
        value,
        "--json",
      );
      expect(result.status, result.stderr).toBe(0);
      expect(
        (JSON.parse(result.stdout) as { tasks: { id: string }[] }).tasks.map(
          (task) => task.id,
        ),
      ).toEqual(expected);
    }
    const before = snapshot(root);
    expect(
      run(
        ".trellis/scripts/task.py",
        "list",
        "--delivery-phase",
        "invented-phase",
      ).status,
    ).not.toBe(0);
    expect(snapshot(root)).toEqual(before);
  });

  it("rejects legacy start before binding or status write under the schema-2 declaration", () => {
    env.TRELLIS_CONTEXT_ID = "exact-inventory";
    const before = snapshot(root);
    const result = run(
      ".trellis/scripts/task.py",
      "start",
      ".trellis/tasks/legacy-planning",
      "--allow-empty-context",
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unsupported_task_schema");
    expect(snapshot(root)).toEqual(before);
  });

  it("retains historical slices after reopen without using their phase or Completion as current acceptance", () => {
    const file = path.join(root, ".trellis/tasks/slice/task.json");
    const record = JSON.parse(fs.readFileSync(file, "utf8")) as TaskRecordV2;
    if (!record.accepted_scope) throw new Error("Missing fixture acceptance");
    const stopped = applyTaskOperation(
      record,
      {
        api_version: "1.0",
        operation: "stop",
        owner_role: "planning",
        owner_id: workflow.owners.planning,
        key: {
          task_id: record.id,
          lifecycle_generation: 0,
          delivery_id: record.deliveries[0].id,
        },
        expected_phase: "planning",
        result: {
          result_id: "historic-stop",
          owner_id: workflow.owners.planning,
          evidence: [authority],
          reason: authority,
          scope_decision: authority,
        },
      },
      workflow,
    ).record;
    // Use the original slice's accepted authority to obtain valid Completion.
    const completed = applyTaskOperation(
      stopped,
      {
        api_version: "1.0",
        operation: "complete_task",
        owner_role: "completion",
        owner_id: workflow.owners.completion,
        key: { task_id: record.id, lifecycle_generation: 0 },
        result: {
          result_id: "historic-completion",
          owner_id: workflow.owners.completion,
          evidence: [authority],
          lifecycle_generation: 0,
          accepted_scope: record.accepted_scope,
          delivery_result_ids: [],
          outcome: "completed",
        },
      },
      workflow,
    ).record;
    const reopened = applyTaskOperation(
      completed,
      {
        api_version: "1.0",
        operation: "reopen_task",
        owner_role: "task_scope",
        owner_id: workflow.owners.task_scope,
        key: { task_id: record.id, lifecycle_generation: 0 },
        authority,
      },
      workflow,
    ).record;
    writeTask("slice", reopened);
    const before = snapshot(root);
    const result = run(".trellis/scripts/task.py", "list", "--json");
    expect(result.status, result.stderr).toBe(0);
    const tasks = (
      JSON.parse(result.stdout) as { tasks: Record<string, unknown>[] }
    ).tasks;
    expect(tasks.find((task) => task.id === "slice")).toMatchObject({
      lifecycle_generation: 1,
      accepted_scope: authority,
      completion_result_id: null,
      deliveries: [
        {
          lifecycle_generation: 0,
          phase: "stopped",
          stop_result_id: "historic-stop",
        },
      ],
    });
    const filtered = run(
      ".trellis/scripts/task.py",
      "list",
      "--delivery-phase",
      "stopped",
      "--json",
    );
    expect(filtered.status, filtered.stderr).toBe(0);
    expect(JSON.parse(filtered.stdout)).toMatchObject({ tasks: [] });
    const incomplete = run(
      ".trellis/scripts/task.py",
      "list",
      "--completion",
      "incomplete",
      "--json",
    );
    expect(incomplete.status, incomplete.stderr).toBe(0);
    expect(
      (JSON.parse(incomplete.stdout) as { tasks: { id: string }[] }).tasks.some(
        (task) => task.id === "slice",
      ),
    ).toBe(true);
    expect(snapshot(root)).toEqual(before);
  });

  it("projects current context with TaskKey and separate noDelivery while retaining legacy history inventory", () => {
    env.TRELLIS_CONTEXT_ID = "exact-inventory";
    const started = run(
      ".trellis/scripts/task.py",
      "start",
      ".trellis/tasks/scoped",
    );
    expect(started.status, started.stderr).toBe(0);
    const before = snapshot(root);
    const result = run(".trellis/scripts/get_context.py", "--json");
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      currentTask: {
        key: { task_id: "scoped", lifecycle_generation: 0 },
        lifecycle: {
          accepted_scope: authority,
          completion_result_id: null,
          deliveries: [],
        },
      },
      currentDelivery: { kind: "no_current_delivery" },
    });
    const text = run(".trellis/scripts/get_context.py");
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).not.toContain("task_scope");
    expect(text.stdout).not.toContain("task_completed");
    expect(snapshot(root)).toEqual(before);
  });
});

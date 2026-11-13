import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deliveryWorkflowMdTemplate,
  workflowMdTemplate,
} from "../../src/templates/trellis/index.js";

const scripts = path.resolve(__dirname, "../../src/templates/trellis/scripts");
const python = process.platform === "darwin" ? "/usr/bin/python3" : "python3";

describe("task create uses the actual installed runtime declaration", () => {
  let root: string;
  let workflow: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-create-default-"));
    workflow = path.join(root, ".trellis/workflow.md");
    fs.mkdirSync(path.dirname(workflow));
    fs.cpSync(scripts, path.join(root, ".trellis/scripts"), {
      recursive: true,
    });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function create(schema?: string) {
    return spawnSync(
      python,
      [
        "-B",
        ".trellis/scripts/task.py",
        "create",
        "Default schema",
        "--description",
        "Declared runtime",
        "--slug",
        "fixture",
        "--task-id",
        "fixture",
        "--no-start",
        ...(schema ? ["--schema-version", schema] : []),
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      },
    );
  }
  function taskDirectory(): string {
    const tasks = path.join(root, ".trellis/tasks");
    const name = fs
      .readdirSync(tasks)
      .find((entry) => entry.endsWith("-fixture"));
    if (!name) throw new Error("Expected created fixture Task");
    return path.join(tasks, name);
  }
  function record(): Record<string, unknown> {
    return JSON.parse(
      fs.readFileSync(path.join(taskDirectory(), "task.json"), "utf8"),
    ) as Record<string, unknown>;
  }
  function snapshot(): Map<string, string> {
    const result = new Map<string, string>();
    function walk(directory: string): void {
      for (const name of fs.readdirSync(directory)) {
        const file = path.join(directory, name);
        const stat = fs.lstatSync(file);
        if (stat.isDirectory()) walk(file);
        else
          result.set(
            path.relative(root, file),
            `${stat.mode}:${stat.isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file).toString("base64")}`,
          );
      }
    }
    walk(root);
    return result;
  }
  it.each(["native", "custom"])(
    "defaults a declared %s runtime to Task-only schema 2 without semantic success",
    (kind) => {
      fs.writeFileSync(
        workflow,
        kind === "native"
          ? deliveryWorkflowMdTemplate
          : deliveryWorkflowMdTemplate.replace(
              /"trellis-([a-z-]+)"/g,
              '"custom-$1"',
            ),
      );
      const result = create();
      expect(result.status, result.stderr).toBe(0);
      expect(record()).toMatchObject({
        schema_version: "2.0",
        accepted_scope: null,
        deliveries: [],
        completion_results: [],
        closure_results: [],
      });
      expect(record()).not.toHaveProperty("status");
      const prd = fs.readFileSync(path.join(taskDirectory(), "prd.md"), "utf8");
      expect(prd).toContain("whole-Task");
      expect(prd).toContain("Delivery");
      expect(prd).not.toContain("before `task.py start`");
      expect(result.stderr).toContain("declared");
      expect(result.stderr).toContain("selection");
      expect(result.stderr).not.toContain("activation");
      expect(result.stderr).not.toContain("Complex task: add design.md");
      if (kind === "custom")
        expect(result.stderr).not.toContain("trellis-start");
    },
  );
  it.each(["legacy", "missing"])(
    "retains undeclared %s compatibility and ignores prospective .new declarations",
    (kind) => {
      if (kind === "legacy") fs.writeFileSync(workflow, workflowMdTemplate);
      fs.writeFileSync(`${workflow}.new`, deliveryWorkflowMdTemplate);
      const result = create();
      expect(result.status, result.stderr).toBe(0);
      expect(record()).toMatchObject({ status: "planning" });
      expect(record()).not.toHaveProperty("schema_version");
    },
  );

  it("binds a default schema-2 Task without creating a Delivery or changing its record", () => {
    fs.writeFileSync(workflow, deliveryWorkflowMdTemplate);
    const created = create();
    expect(created.status, created.stderr).toBe(0);
    const directory = taskDirectory();
    const taskFile = path.join(directory, "task.json");
    const bytes = fs.readFileSync(taskFile);
    const env = {
      ...process.env,
      TRELLIS_CONTEXT_ID: "create-schema-default",
      PYTHONDONTWRITEBYTECODE: "1",
    };
    const selected = spawnSync(
      python,
      ["-B", ".trellis/scripts/task.py", "start", directory],
      { cwd: root, env, encoding: "utf8" },
    );
    expect(selected.status, selected.stderr).toBe(0);
    expect(selected.stdout).toContain("Task selection is bound");
    expect(selected.stdout).not.toContain("this task's jsonl");
    expect(fs.readFileSync(taskFile)).toEqual(bytes);
    const current = spawnSync(
      python,
      ["-B", ".trellis/scripts/delivery.py", "current", "--json"],
      { cwd: root, env, encoding: "utf8" },
    );
    expect(current.status, current.stderr).toBe(0);
    expect(JSON.parse(current.stdout)).toMatchObject({
      kind: "no_current_delivery",
    });
  });
  it.each([
    {
      content: deliveryWorkflowMdTemplate,
      schema: "legacy",
      error: "incompatible_task_schema",
    },
    {
      content: workflowMdTemplate,
      schema: "2.0",
      error: "missing_runtime_contract",
    },
    {
      content: "[trellis-runtime-contract]\n{}\n",
      schema: undefined,
      error: "invalid_runtime_contract_block",
    },
    {
      content:
        "[trellis-runtime-contract]\nnot-json\n[/trellis-runtime-contract]",
      schema: undefined,
      error: "invalid_runtime_contract_json",
    },
    {
      content: deliveryWorkflowMdTemplate.replace(
        '"task_schema": "2.0"',
        '"task_schema": "9.0"',
      ),
      schema: undefined,
      error: "unsupported_runtime_contract",
    },
  ])(
    "refuses mismatched/invalid schema before any writes ($error)",
    ({ content, schema, error }) => {
      fs.writeFileSync(workflow, content);
      const before = snapshot();
      const result = create(schema);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(error);
      expect(snapshot()).toEqual(before);
      expect(fs.existsSync(path.join(root, ".trellis/tasks"))).toBe(false);
    },
  );
  it("does not turn an unreadable installed workflow into legacy compatibility", () => {
    fs.writeFileSync(workflow, Buffer.from([0xff, 0xfe]));
    const before = snapshot();
    const result = create();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("workflow_read_error");
    expect(snapshot()).toEqual(before);
  });
});

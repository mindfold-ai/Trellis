import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scripts = path.resolve(__dirname, "../../src/templates/trellis/scripts");
const native = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../core/test/fixtures/task-v2/native-multi.json"), "utf8")) as { workflow: object };
const python = process.platform === "darwin" ? "/usr/bin/python3" : "python3";
const available = spawnSync(python, ["--version"]).status === 0;
const declaration = `[trellis-runtime-contract]\n${JSON.stringify(native.workflow)}\n[/trellis-runtime-contract]\n`;

describe.skipIf(!available)("Task context selected-record boundary", () => {
  let root: string;
  let task: string;
  function run(args: string[]) {
    return spawnSync(python, [".trellis/scripts/task.py", ...args], { cwd: root, encoding: "utf8", env: { ...process.env, TRELLIS_CONTEXT_ID: "context-boundary", PYTHONDONTWRITEBYTECODE: "1" } });
  }
  function ok(args: string[]): string {
    const result = run(args); expect(result.status, result.stderr + result.stdout).toBe(0); return result.stdout;
  }
  function create(schema: "2.0" | "legacy"): void {
    task = ok(["create", "Context boundary", "--description", "Strict context target", "--slug", "context-boundary", "--schema-version", schema, "--no-start"]).trim();
  }
  function snapshot(directory = path.join(root, task)): unknown[] {
    return fs.readdirSync(directory).sort().map((name) => {
      const file = path.join(directory, name); const stat = fs.lstatSync(file);
      return [name, stat.mode & 0o777, stat.isDirectory() ? snapshot(file) : fs.readFileSync(file).toString("hex")];
    });
  }
  function commands(): string[][] {
    return [["add-context", task, "check", "evidence.md", "context boundary"], ["list-context", task], ["validate", task]];
  }
  function rejected(reason: string): void {
    const before = snapshot();
    for (const args of commands()) {
      const result = run(args);
      expect.soft(result.status, result.stderr + result.stdout).toBe(1);
      expect.soft(result.stderr + result.stdout).toContain(reason);
      expect.soft(result.stderr + result.stdout).not.toContain("untrusted-root-sentinel");
      expect.soft(snapshot()).toEqual(before);
    }
  }
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-context-boundary-"));
    fs.mkdirSync(path.join(root, ".trellis"));
    fs.cpSync(scripts, path.join(root, ".trellis/scripts"), { recursive: true });
    fs.writeFileSync(path.join(root, ".trellis/workflow.md"), declaration);
    fs.writeFileSync(path.join(root, "requirements.md"), "Boundary requirement\n");
    fs.writeFileSync(path.join(root, "evidence.md"), "Independent context evidence\n");
    create("2.0");
    for (const kind of ["implement", "check"]) fs.writeFileSync(path.join(root, task, `${kind}.jsonl`), JSON.stringify({ file: "requirements.md", reason: "untrusted-root-sentinel" }) + "\n");
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  for (const [name, reason, contents] of [
    ["invalid JSON", "invalid", "{broken"],
    ["non-object", "not-object", "[]"],
    ["empty object", "empty", "{}"],
    ["undecodable", "undecodable", Buffer.from([0xff])],
  ] as const) {
    it(`rejects an existing ${name} Task on every context command without writes`, () => {
      fs.writeFileSync(path.join(root, task, "task.json"), contents);
      rejected(`task_metadata_${reason}`);
    });
  }
  it("rejects a schema-2 record missing a required field without treating it as evidence-only", () => {
    const file = path.join(root, task, "task.json"); const record = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    delete record.completion_results; fs.writeFileSync(file, JSON.stringify(record));
    rejected("task_metadata_invalid-task-schema");
  });
  it("rejects a record with unsupported fields on every context command", () => {
    const file = path.join(root, task, "task.json"); const record = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    fs.writeFileSync(file, JSON.stringify({ ...record, unrecognized: true }));
    rejected("task_metadata_unsupported-fields");
  });
  it("rejects unreadable Task metadata on every context command", () => {
    const file = path.join(root, task, "task.json"); fs.unlinkSync(file); fs.mkdirSync(file);
    rejected("task_metadata_unreadable");
  });
  it("rejects a valid legacy record retained under a declared schema-2 runtime", () => {
    fs.rmSync(path.join(root, task), { recursive: true });
    fs.writeFileSync(path.join(root, ".trellis/workflow.md"), "Legacy workflow\n"); create("legacy");
    fs.writeFileSync(path.join(root, ".trellis/workflow.md"), declaration);
    rejected("unsupported_task_schema");
  });
  it("requires a compatible declaration and explicit Delivery for an existing schema-2 Task", () => {
    rejected("delivery_selection_required");
    fs.writeFileSync(path.join(root, ".trellis/workflow.md"), "Legacy workflow\n");
    rejected("missing_runtime_contract");
    fs.writeFileSync(path.join(root, ".trellis/workflow.md"), "[trellis-runtime-contract]\n{broken\n[/trellis-runtime-contract]\n");
    rejected("invalid_runtime_contract_json");
  });
  it("retains legacy context handling without a Delivery runtime declaration", () => {
    fs.rmSync(path.join(root, task), { recursive: true }); fs.unlinkSync(path.join(root, ".trellis/workflow.md")); create("legacy");
    for (const kind of ["implement", "check"]) ok(["add-context", task, kind, "requirements.md", "legacy spec"]);
    expect(ok(["list-context", task])).toContain("requirements.md"); ok(["validate", task]);
  });
  it("retains a legal evidence-only directory only when task.json is actually absent", () => {
    task = ".trellis/tasks/evidence-only"; fs.mkdirSync(path.join(root, task));
    for (const kind of ["implement", "check"]) ok(["add-context", task, kind, "requirements.md", "evidence spec"]);
    expect(ok(["list-context", task])).toContain("requirements.md"); ok(["validate", task]);
    expect(fs.existsSync(path.join(root, task, "task.json"))).toBe(false);
  });
});

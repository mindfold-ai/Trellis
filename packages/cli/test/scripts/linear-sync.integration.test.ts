import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  TaskRecordV2,
  WorkflowContract,
} from "@mindfoldhq/trellis-core/task/v2";

const scripts = path.resolve(
  import.meta.dirname,
  "../../src/templates/trellis/scripts",
);
const python = process.platform === "darwin" ? "/usr/bin/python3" : "python3";
const available =
  process.platform !== "win32" && spawnSync(python, ["--version"]).status === 0;
const fixture = JSON.parse(
  fs.readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../../core/test/fixtures/task-v2/native-multi.json",
    ),
    "utf8",
  ),
) as {
  initial: TaskRecordV2;
  workflow: WorkflowContract;
};
const authority = {
  locator: "requirements.md",
  revision: "sha256:" + "a".repeat(64),
};

describe.skipIf(!available)(
  "bundled Linear hook lifecycle boundary (fake client only)",
  () => {
    let root: string;
    let taskFile: string;
    let env: NodeJS.ProcessEnv;
    beforeEach(() => {
      root = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "trellis-linear-hook-")),
      );
      fs.cpSync(scripts, path.join(root, ".trellis/scripts"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(root, ".trellis/workflow.md"),
        `[trellis-runtime-contract]\n${JSON.stringify(fixture.workflow)}\n[/trellis-runtime-contract]\n`,
      );
      fs.writeFileSync(
        path.join(root, ".trellis/hooks.local.json"),
        JSON.stringify({ linear: { team: "TEAM" } }),
      );
      fs.writeFileSync(
        path.join(root, ".trellis/config.yaml"),
        "task_auto_commit: false\nhooks:\n  after_start:\n    - python3 .trellis/scripts/hooks/linear_sync.py start\n",
      );
      taskFile = path.join(root, ".trellis/tasks/probe/task.json");
      fs.mkdirSync(path.dirname(taskFile), { recursive: true });
      fs.writeFileSync(
        path.join(path.dirname(taskFile), "prd.md"),
        "Accepted overall scope\n",
      );
      const bin = path.join(root, "bin");
      fs.mkdirSync(bin);
      // POSIX kernels do not search PATH for a shebang interpreter. Resolve the
      // selected Python so Linux's `python3` command also yields an executable
      // fake client, while retaining the minimum interpreter selected on macOS.
      const interpreter = spawnSync(
        python,
        ["-c", "import sys; print(sys.executable)"],
        { encoding: "utf8" },
      );
      expect(interpreter.status, interpreter.stderr).toBe(0);
      const pythonExecutable = interpreter.stdout.trim();
      expect(path.isAbsolute(pythonExecutable)).toBe(true);
      fs.writeFileSync(
        path.join(bin, "linearis"),
        `#!${pythonExecutable}\nimport json,os,sys\nwith open(os.environ['FAKE_LINEAR_LOG'],'a',encoding='utf-8') as f: f.write(json.dumps(sys.argv[1:])+'\\n')\nprint(json.dumps({'identifier':'TEAM-1'}))\n`,
        { mode: 0o755 },
      );
      env = {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        TASK_JSON_PATH: taskFile,
        FAKE_LINEAR_LOG: path.join(root, "calls.jsonl"),
        TRELLIS_CONTEXT_ID: "linear-controlled",
        PYTHONDONTWRITEBYTECODE: "1",
      };
      write(native());
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
    function native(): TaskRecordV2 {
      return {
        ...structuredClone(fixture.initial),
        name: "probe",
        title: "Probe",
        accepted_scope: authority,
        meta: { linear_issue: "TEAM-1", retained: { value: 42 } },
      };
    }
    function completed(): TaskRecordV2 {
      return {
        ...native(),
        completion_results: [
          {
            result_id: "completed-g0",
            owner_id: fixture.workflow.owners.completion,
            evidence: [authority],
            lifecycle_generation: 0,
            accepted_scope: authority,
            delivery_result_ids: [],
            outcome: "completed",
          },
        ],
      };
    }
    function legacy(): Record<string, unknown> {
      const record = {
        ...native(),
        status: "in_progress",
        completedAt: null,
        commit: null,
        pr_url: null,
      } as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(record).filter(
          ([key]) =>
            ![
              "schema_version",
              "accepted_scope",
              "deliveries",
              "completion_results",
              "closure_results",
            ].includes(key),
        ),
      );
    }
    function write(record: object): void {
      fs.writeFileSync(taskFile, JSON.stringify(record, null, 2) + "\n", {
        mode: 0o640,
      });
    }
    function calls(): string[][] {
      const log = path.join(root, "calls.jsonl");
      return fs.existsSync(log)
        ? fs
            .readFileSync(log, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line) as string[])
        : [];
    }
    function hook(action: string) {
      return spawnSync(
        python,
        [".trellis/scripts/hooks/linear_sync.py", action],
        { cwd: root, env, encoding: "utf8" },
      );
    }
    function unchanged(
      action: string,
      expectedStatus: number,
    ): ReturnType<typeof hook> {
      const before = fs.readFileSync(taskFile);
      const mode = fs.statSync(taskFile).mode;
      const result = hook(action);
      expect(result.status, result.stderr).toBe(expectedStatus);
      expect(fs.readFileSync(taskFile)).toEqual(before);
      expect(fs.statSync(taskFile).mode).toBe(mode);
      return result;
    }
    it("actual schema-2 task.py start binds only, without external status or description changes", () => {
      const before = fs.readFileSync(taskFile);
      const result = spawnSync(
        python,
        [".trellis/scripts/task.py", "start", ".trellis/tasks/probe"],
        { cwd: root, env, encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(fs.readFileSync(taskFile)).toEqual(before);
      expect(calls()).toEqual([]);
    });
    it("manual schema-2 start validates but does not sync prd or state", () => {
      fs.unlinkSync(path.join(path.dirname(taskFile), "prd.md"));
      unchanged("start", 0);
      expect(calls()).toEqual([]);
    });
    for (const kind of ["missing", "old-generation", "old-scope"] as const) {
      it(`rejects archive with ${kind} Completion before external calls`, () => {
        const record = kind === "missing" ? native() : completed();
        if (kind === "old-generation") record.lifecycle_generation = 1;
        if (kind === "old-scope")
          record.accepted_scope = {
            ...authority,
            revision: "sha256:" + "b".repeat(64),
          };
        write(record);
        expect(unchanged("archive", 1).stderr).toContain(
          "current_completion_required",
        );
        expect(calls()).toEqual([]);
      });
    }
    it("maps an actual matching Completion to Done without changing any local lifecycle fact", () => {
      write(completed());
      unchanged("archive", 0);
      expect(calls()).toEqual([["issues", "update", "TEAM-1", "-s", "Done"]]);
    });
    it("reads archived Task and local configuration from the actual workspace", () => {
      taskFile = path.join(
        root,
        ".trellis/tasks/archive/2026-10/probe/task.json",
      );
      fs.mkdirSync(path.dirname(taskFile), { recursive: true });
      env.TASK_JSON_PATH = taskFile;
      write({ ...completed(), meta: { retained: 42 } });
      expect(hook("create").status).toBe(0);
      expect(calls()[0]).toEqual([
        "issues",
        "create",
        "Probe",
        "--team",
        "TEAM",
        "-p",
        "3",
      ]);
    });
    for (const action of ["create", "start", "archive", "sync"]) {
      it(`rejects invalid schema-2 aggregate on ${action} without external calls or raw rewrite`, () => {
        write({ ...native(), status: "planning", meta: {} });
        expect(unchanged(action, 1).stderr).toContain("unsupported-fields");
        expect(calls()).toEqual([]);
      });
    }
    it("links schema-2 metadata atomically, preserving all domain fields and file mode", () => {
      const original = { ...completed(), meta: { retained: { value: 42 } } };
      write(original);
      const mode = fs.statSync(taskFile).mode;
      expect(hook("create").status).toBe(0);
      expect(JSON.parse(fs.readFileSync(taskFile, "utf8"))).toEqual({
        ...original,
        meta: { ...original.meta, linear_issue: "TEAM-1" },
      });
      expect(fs.statSync(taskFile).mode).toBe(mode);
      expect(
        fs
          .readdirSync(path.dirname(taskFile))
          .filter((name) => name.endsWith(".tmp")),
      ).toEqual([]);
      expect(hook("create").status).toBe(0);
      expect(calls()).toHaveLength(1);
    });
    it("preserves explicit legacy start/description and archive mappings", () => {
      fs.writeFileSync(
        path.join(root, ".trellis/workflow.md"),
        "Retained legacy compatibility workflow\n",
      );
      write(legacy());
      unchanged("start", 0);
      unchanged("archive", 0);
      expect(calls()).toEqual([
        ["issues", "update", "TEAM-1", "-s", "In Progress"],
        ["issues", "update", "TEAM-1", "-d", "Accepted overall scope"],
        ["issues", "update", "TEAM-1", "-s", "Done"],
      ]);
    });
    for (const action of ["create", "start", "archive", "sync"]) {
      it(`rejects history-only legacy execution in schema-2 runtime on ${action}`, () => {
        write(legacy());
        expect(unchanged(action, 1).stderr).toContain(
          "unsupported_task_schema",
        );
        expect(calls()).toEqual([]);
      });
    }
    it("rejects an undeclared schema-2 runtime before external calls", () => {
      fs.writeFileSync(
        path.join(root, ".trellis/workflow.md"),
        "Retained legacy compatibility workflow\n",
      );
      expect(unchanged("create", 1).stderr).toContain(
        "missing_runtime_contract",
      );
      expect(calls()).toEqual([]);
    });
    it("rejects malformed runtime declarations before external calls", () => {
      fs.writeFileSync(
        path.join(root, ".trellis/workflow.md"),
        "[trellis-runtime-contract]\ninvalid\n[/trellis-runtime-contract]\n",
      );
      expect(unchanged("archive", 1).stderr).toContain(
        "invalid_runtime_contract_json",
      );
      expect(calls()).toEqual([]);
    });
    it("uses a checked parent record for metadata linking without modifying parent or Task domain", () => {
      const parent = path.join(root, ".trellis/tasks/parent/task.json");
      fs.mkdirSync(path.dirname(parent));
      fs.writeFileSync(
        parent,
        JSON.stringify({
          ...native(),
          id: "parent",
          name: "parent",
          meta: { linear_issue: "TEAM-P" },
        }),
      );
      const before = fs.readFileSync(parent);
      write({ ...native(), parent: "parent", meta: {} });
      expect(hook("create").status).toBe(0);
      expect(calls()).toEqual([
        [
          "issues",
          "create",
          "Probe",
          "--team",
          "TEAM",
          "-p",
          "3",
          "--parent-ticket",
          "TEAM-P",
        ],
      ]);
      expect(fs.readFileSync(parent)).toEqual(before);
    });
    it("rejects a symlinked task.json before external create and leaves its target unchanged", () => {
      const outside = path.join(root, "outside.json");
      fs.writeFileSync(outside, JSON.stringify({ ...native(), meta: {} }));
      const before = fs.readFileSync(outside);
      fs.unlinkSync(taskFile);
      fs.symlinkSync(outside, taskFile);
      expect(hook("create").status).toBe(1);
      expect(fs.readFileSync(outside)).toEqual(before);
      expect(calls()).toEqual([]);
    });
    it("rejects a parent traversal before external create", () => {
      write({ ...native(), meta: {}, parent: "../../../outside" });
      expect(hook("create").status).toBe(1);
      expect(calls()).toEqual([]);
    });
  },
);

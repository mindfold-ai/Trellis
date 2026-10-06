/** Real CLI regressions for preserving a session's unfinished task (#511). */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEMPLATE_SCRIPTS = path.resolve(
  __dirname,
  "../../src/templates/trellis/scripts",
);
const hasPython = spawnSync("python3", ["--version"]).status === 0;

describe.skipIf(!hasPython)("task.py explicit task switching", () => {
  let tmp: string;
  let env: NodeJS.ProcessEnv;

  /** Run the real CLI with isolated identity; null exercises degraded mode. */
  function run(session: string | null, ...args: string[]) {
    return spawnSync("python3", [".trellis/scripts/task.py", ...args], {
      cwd: tmp,
      encoding: "utf-8",
      env: { ...env, TRELLIS_CONTEXT_ID: session ?? "" },
    });
  }

  /** Seed task metadata without lifecycle effects, including malformed statuses. */
  function seed(name: string, status: unknown = "planning"): string {
    const ref = `.trellis/tasks/${name}`;
    fs.mkdirSync(path.join(tmp, ref), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ref, "task.json"),
      JSON.stringify({ name, title: name, status, branch: "feature/task" }),
    );
    return ref;
  }

  /** Locate a session's pointer file for byte-level mutation assertions. */
  function pointer(session = "session-a"): string {
    return path.join(tmp, ".trellis/.runtime/sessions", `${session}.json`);
  }

  /** Seed a pointer directly so setup does not depend on start's guard. */
  function activate(ref: string, session = "session-a"): void {
    fs.mkdirSync(path.dirname(pointer(session)), { recursive: true });
    fs.writeFileSync(pointer(session), JSON.stringify({ current_task: ref }));
  }

  /** Read the persisted task reference for the requested session. */
  function current(session = "session-a"): string {
    return JSON.parse(fs.readFileSync(pointer(session), "utf-8")).current_task;
  }

  /** Read a task's persisted status after a lifecycle command. */
  function status(ref: string): string {
    return JSON.parse(
      fs.readFileSync(path.join(tmp, ref, "task.json"), "utf-8"),
    ).status;
  }

  /** Create the standard task in session A with optional scenario flags. */
  function create(...args: string[]) {
    return run(
      "session-a",
      "create",
      "New task",
      "--description",
      "Task switching regression",
      "--slug",
      "new-task",
      ...args,
    );
  }

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-task-switch-"));
    fs.cpSync(TEMPLATE_SCRIPTS, path.join(tmp, ".trellis/scripts"), {
      recursive: true,
    });
    // Isolate platform identity even when the suite runs inside an AI shell.
    env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !/(SESSION_?ID|CONVERSATION_?ID|TRANSCRIPT_?PATH|THREAD_ID|TRELLIS_CONTEXT_ID)$/i.test(
            key,
          ),
      ),
    );
    env.PYTHONIOENCODING = "utf-8";
    const init = spawnSync(
      "python3",
      [".trellis/scripts/init_developer.py", "tester"],
      { cwd: tmp, encoding: "utf-8", env },
    );
    expect(init.status, init.stderr).toBe(0);
    fs.writeFileSync(
      path.join(tmp, ".trellis/config.yaml"),
      "hooks:\n  after_start:\n    - python3 record-start.py\n",
    );
    fs.writeFileSync(
      path.join(tmp, "record-start.py"),
      'from pathlib import Path\nwith Path("started.log").open("a") as f:\n    f.write("start\\n")\n',
    );
  });

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it.each(["planning", "in_progress", "review", "blocked-by-team", null])(
    "create preserves an active task with status %s and still creates the new task",
    (activeStatus) => {
      const old = seed("old-task", activeStatus);
      activate(old);
      const before = fs.readFileSync(pointer());
      const result = create();
      expect(result.status, result.stderr).toBe(0);
      expect(fs.readFileSync(pointer())).toEqual(before);
      expect(status(result.stdout.trim())).toBe("planning");
      expect(result.stderr).toContain(old);
      expect(result.stderr).toContain("--switch");
      expect(fs.existsSync(path.join(tmp, "started.log"))).toBe(false);
    },
  );

  it.each(["planning", "in_progress", "review", "blocked-by-team", null])(
    "start refuses a different task while status is %s without any side effects",
    (activeStatus) => {
      const old = seed("old-task", activeStatus);
      const next = seed("new-task");
      activate(old);
      const files = [
        pointer(),
        ...[old, next].map((ref) => path.join(tmp, ref, "task.json")),
      ];
      const before = files.map((file) => fs.readFileSync(file));
      const result = run("session-a", "start", next);
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).toContain(old);
      expect(result.stdout + result.stderr).toContain("--switch");
      expect(files.map((file) => fs.readFileSync(file))).toEqual(before);
      expect(fs.existsSync(path.join(tmp, "started.log"))).toBe(false);
    },
  );

  it.each(["{broken", "[]", "{}", '{"status": []}', '{"status": {}}', null])(
    "unreadable or missing active metadata (%s) cannot bypass protection",
    (contents) => {
      const old = seed("old-task");
      const next = seed("new-task");
      activate(old);
      const oldJson = path.join(tmp, old, "task.json");
      if (contents === null) fs.unlinkSync(oldJson);
      else fs.writeFileSync(oldJson, contents);
      const before = fs.readFileSync(pointer());
      expect(run("session-a", "start", next).status).toBe(1);
      expect(create().status).toBe(0);
      expect(fs.readFileSync(pointer())).toEqual(before);
      expect(fs.existsSync(path.join(tmp, "started.log"))).toBe(false);
    },
  );

  it("--switch names both tasks, activates the target, and leaves the old status unchanged", () => {
    const old = seed("old-task", "in_progress");
    const next = seed("new-task");
    activate(old);
    const oldBytes = fs.readFileSync(path.join(tmp, old, "task.json"));
    const result = run("session-a", "start", next, "--switch");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(old);
    expect(result.stdout).toContain(next);
    expect(current()).toBe(next);
    expect(status(next)).toBe("in_progress");
    expect(fs.readFileSync(path.join(tmp, old, "task.json"))).toEqual(oldBytes);
    expect(
      fs.readFileSync(path.join(tmp, "started.log"), "utf-8").split(/\r?\n/),
    ).toEqual(["start", ""]);
  });

  it("restarting the same task through an absolute path needs no --switch", () => {
    const ref = seed("same-task", "in_progress");
    activate(`./${ref}`);
    const before = fs.readFileSync(path.join(tmp, ref, "task.json"));
    const result = run("session-a", "start", path.join(tmp, ref));
    expect(result.status, result.stderr).toBe(0);
    expect(current()).toBe(ref);
    expect(fs.readFileSync(path.join(tmp, ref, "task.json"))).toEqual(before);
  });

  it.each(["completed", "done", "stale", "absent"])(
    "%s active state allows create activation and start",
    (activeStatus) => {
      const old = seed("old-task", activeStatus);
      if (activeStatus !== "absent") {
        activate(activeStatus === "stale" ? ".trellis/tasks/missing" : old);
      }
      const created = create();
      expect(created.status, created.stderr).toBe(0);
      expect(current()).toBe(created.stdout.trim());
      // Test start's release path independently from create's activation.
      if (activeStatus === "absent") fs.unlinkSync(pointer());
      else activate(activeStatus === "stale" ? ".trellis/tasks/missing" : old);
      const next = seed("start-target");
      const started = run("session-a", "start", next);
      expect(started.status, started.stderr).toBe(0);
      expect(current()).toBe(next);
    },
  );

  it("--no-start preserves the pointer and another session starts independently", () => {
    const old = seed("old-task", "in_progress");
    activate(old);
    const before = fs.readFileSync(pointer());
    const created = create("--no-start");
    expect(created.status, created.stderr).toBe(0);
    expect(fs.readFileSync(pointer())).toEqual(before);
    expect(run("session-b", "start", created.stdout.trim()).status).toBe(0);
    expect(current("session-b")).toBe(created.stdout.trim());
    expect(fs.readFileSync(pointer())).toEqual(before);
  });

  it("without session identity create/start preserve existing session pointers", () => {
    activate(seed("old-task", "in_progress"));
    const before = fs.readFileSync(pointer());
    const created = run(
      null,
      "create",
      "Detached task",
      "--description",
      "No session",
      "--slug",
      "detached",
    );
    expect(created.status, created.stderr).toBe(0);
    const started = run(null, "start", created.stdout.trim());
    expect(started.status, started.stderr).toBe(0);
    expect(started.stdout).toContain("degraded mode");
    expect(status(created.stdout.trim())).toBe("in_progress");
    expect(fs.readFileSync(pointer())).toEqual(before);
  });

  it("--switch does not bypass context validation", () => {
    const old = seed("old-task", "in_progress");
    const next = seed("new-task");
    activate(old);
    fs.writeFileSync(path.join(tmp, next, "implement.jsonl"), "");
    const before = fs.readFileSync(pointer());
    const result = run("session-a", "start", next, "--switch");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("no curated entries");
    expect(fs.readFileSync(pointer())).toEqual(before);
    expect(status(next)).toBe("planning");
    expect(fs.existsSync(path.join(tmp, "started.log"))).toBe(false);
  });
});

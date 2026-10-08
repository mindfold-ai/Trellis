// Mechanical split of regression.test.ts; imported by the canonical test entry.

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task";
import { isManagedPath } from "../src/configurators/index.js";
import { PATHS } from "../src/constants/paths.js";
import {
  settingsTemplate as claudeSettingsTemplate,
  getAllAgents as getClaudeAgents,
} from "../src/templates/claude/index.js";
import { getAllHooks as getCodexHooks } from "../src/templates/codex/index.js";
import { getAllHooks as getCopilotHooks } from "../src/templates/copilot/index.js";
import {
  commonInit,
  taskScript,
  commonCliAdapter,
  commonTaskUtils,
  commonGitContext,
  commonSessionContext,
  getAllScripts,
} from "../src/templates/trellis/index.js";
import { collectPlatformTemplates } from "../src/configurators/index.js";

// =============================================================================
// 1. Windows / Encoding Regressions
// =============================================================================

describe("regression: Windows encoding (beta.10, beta.11, beta.16)", () => {
  it("[beta.10] common/__init__.py has _configure_stream function", () => {
    expect(commonInit).toContain("def _configure_stream");
  });

  it('[beta.10] common/__init__.py has reconfigure(encoding="utf-8") pattern', () => {
    expect(commonInit).toContain('reconfigure(encoding="utf-8"');
  });

  it("[beta.10] common/__init__.py has TextIOWrapper fallback", () => {
    expect(commonInit).toContain("TextIOWrapper");
  });

  it("[issue #190] Codex and Copilot session-start hooks force UTF-8 stdout on Windows", () => {
    const codexSessionStart = getCodexHooks().find(
      (hook) => hook.name === "session-start.py",
    )?.content;
    const copilotSessionStart = getCopilotHooks().find(
      (hook) => hook.name === "session-start.py",
    )?.content;

    for (const [label, content] of [
      ["codex", codexSessionStart],
      ["copilot", copilotSessionStart],
    ] as const) {
      expect(
        content,
        `${label} session-start template should exist`,
      ).toBeTruthy();
      expect(content).toContain("from common import configure_encoding");
      expect(content).toContain("configure_encoding()");
      expect(content).toContain("configure_project_encoding(project_dir)");
      expect(content).toContain("ensure_ascii=False");
    }
  });

  it('[beta.10] common/__init__.py has sys.platform == "win32" guard', () => {
    expect(commonInit).toContain('sys.platform == "win32"');
  });

  it("[beta.10] common/__init__.py configures both stdout AND stderr", () => {
    expect(commonInit).toContain("sys.stdout");
    expect(commonInit).toContain("sys.stderr");
  });

  it("[beta.16] _configure_stream handles stream with reconfigure method", () => {
    // The function should try reconfigure() first, then fallback to detach()
    expect(commonInit).toContain('hasattr(stream, "reconfigure")');
    expect(commonInit).toContain('hasattr(stream, "detach")');
  });

  it("[beta.16] _configure_stream is idempotent (won't crash on double call)", () => {
    // The reconfigure pattern is safe to call multiple times
    // The function should NOT use detach() unconditionally (beta.16 bug root cause)
    // It should check hasattr(stream, "reconfigure") FIRST
    const reconfigureIndex = commonInit.indexOf(
      'hasattr(stream, "reconfigure")',
    );
    const detachIndex = commonInit.indexOf('hasattr(stream, "detach")');
    expect(reconfigureIndex).toBeLessThan(detachIndex);
  });

  it("[beta.10] common/__init__.py has centralized encoding fix", () => {
    // Encoding fix was centralized from individual scripts to common/__init__.py (#67)
    expect(commonInit).toContain('sys.platform == "win32"');
    expect(commonInit).toContain("reconfigure");
  });

  it("[beta.10] task.py imports from common (gets encoding fix via __init__.py)", () => {
    expect(taskScript).toContain("from common");
  });
});

// Windows subprocess flags tests removed — multi_agent pipeline removed

describe("regression: Windows path separator (beta.12)", () => {
  it("[beta.12] isManagedPath handles Windows backslash paths", () => {
    expect(isManagedPath(".claude\\commands\\foo.md")).toBe(true);
    expect(isManagedPath(".trellis\\spec\\backend")).toBe(true);
    expect(isManagedPath(".cursor\\commands\\start.md")).toBe(true);
    expect(isManagedPath(".opencode\\config.json")).toBe(true);
    expect(isManagedPath(".github\\copilot\\hooks\\session-start.py")).toBe(
      true,
    );
    expect(isManagedPath(".github\\hooks\\trellis.json")).toBe(true);
  });

  it("[beta.12] isManagedPath handles mixed separators", () => {
    expect(isManagedPath(".claude\\commands/foo.md")).toBe(true);
  });
});

// =============================================================================
// 2. Path Issues Regressions
// =============================================================================

describe("regression: task directory paths (0.2.14, 0.2.15, beta.13)", () => {
  it("[0.2.15] PATHS.TASKS is .trellis/tasks (not .trellis/custom/*/tasks)", () => {
    expect(PATHS.TASKS).toBe(".trellis/tasks");
    expect(PATHS.TASKS).not.toContain("workspace");
  });

  it("[0.2.14] Claude agent templates do not contain hardcoded .trellis/custom/*/tasks/ paths", () => {
    const agents = getClaudeAgents();
    for (const agent of agents) {
      expect(agent.content).not.toMatch(/\.trellis\/workspace\/[^/]+\/tasks\//);
    }
  });

  it("[beta.13] cli_adapter.py does not contain hardcoded developer paths", () => {
    expect(commonCliAdapter).not.toMatch(/workspace\/taosu/);
    expect(commonCliAdapter).not.toMatch(/workspace\/[a-z]+\/tasks/);
  });

  it("[0.2.15] no script templates contain hardcoded 'taosu' in path patterns", () => {
    const scripts = getAllScripts();
    for (const [name, content] of scripts) {
      // Check for hardcoded username in path patterns (workspace/taosu, /Users/taosu)
      // but allow usage examples like "python3 status.py -a taosu"
      expect(
        content,
        `${name} should not contain hardcoded username in paths`,
      ).not.toMatch(/workspace\/taosu|\/Users\/taosu/);
    }
  });
});

describe("regression: resolve_task_dir path handling", () => {
  it("[beta.12] resolve_task_dir handles .trellis prefix", () => {
    // The function should recognize .trellis-prefixed paths as relative paths
    expect(commonTaskUtils).toContain('.startswith(".trellis")');
  });

  it("[current-task] resolve_task_dir normalizes backslash separators before path classification", () => {
    expect(commonTaskUtils).toContain('target_dir.replace("\\\\", "/")');
  });
});

describe("regression: resolve_task_dir containment chokepoint", () => {
  let tmpDir: string;
  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  function runTask(...args: string[]): {
    status: number | null;
    stdout: string;
    stderr: string;
  } {
    const result = spawnSync(
      pythonCmd,
      [path.join(".trellis", "scripts", "task.py"), ...args],
      { cwd: tmpDir, encoding: "utf-8" },
    );
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  function taskDir(...segments: string[]): string {
    return path.join(tmpDir, ".trellis", "tasks", ...segments);
  }

  function makeTask(name: string): void {
    fs.mkdirSync(taskDir(name), { recursive: true });
    fs.writeFileSync(
      path.join(taskDir(name), "task.json"),
      JSON.stringify(emptyTaskRecord({ id: name, name })) + "\n",
    );
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-task-escape-"));
    const scriptsDir = path.join(tmpDir, ".trellis", "scripts");
    for (const [relativePath, content] of getAllScripts()) {
      const absPath = path.join(scriptsDir, relativePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, "utf-8");
    }
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "custom-note"),
      "name=tester\n",
    );
    fs.mkdirSync(taskDir("archive"), { recursive: true });
    makeTask("08-09-real");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("[audit] set-meta on a traversal path fails and leaves the outside task.json untouched", () => {
    const victimDir = path.join(
      tmpDir,
      "..",
      path.basename(tmpDir) + "-victim",
    );
    fs.mkdirSync(victimDir, { recursive: true });
    const victimJson = path.join(victimDir, "task.json");
    fs.writeFileSync(victimJson, JSON.stringify({ id: "victim", meta: {} }));

    try {
      const r = runTask(
        "set-meta",
        `../${path.basename(victimDir)}`,
        "pwned",
        "yes",
      );
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("refusing to use");
      expect(JSON.parse(fs.readFileSync(victimJson, "utf-8")).meta).toEqual({});
    } finally {
      fs.rmSync(victimDir, { recursive: true, force: true });
    }
  });

  it("[audit] start reports a refused path once, on stderr only", () => {
    // resolve_task_dir names the exact reason on stderr. cmd_start used to add
    // a generic "Task not found" on stdout, so one refusal arrived as two
    // messages split across two streams and the specific one was the easier to
    // miss.
    const r = runTask("start", "../escape");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("refusing to use");
    expect(r.stdout).not.toContain("Task not found");
  });

  it("[audit] set-meta through a symlinked task dir fails and leaves the link target untouched", () => {
    const outsideDir = path.join(tmpDir, "outside-target");
    fs.mkdirSync(outsideDir, { recursive: true });
    const outsideJson = path.join(outsideDir, "task.json");
    fs.writeFileSync(outsideJson, JSON.stringify({ id: "outside", meta: {} }));
    fs.symlinkSync(
      outsideDir,
      taskDir("08-09-symlinked"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const r = runTask("set-meta", "08-09-symlinked", "pwned", "yes");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("refusing to use");
    expect(JSON.parse(fs.readFileSync(outsideJson, "utf-8")).meta).toEqual({});
  });

  it("[audit] create --slug with traversal fails and writes nothing outside the tasks dir", () => {
    const r = runTask(
      "create",

      "Evil",
      "--description",
      "regression fixture",
      "--slug",
      "../../../escaped",
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("--slug must be a plain name");
    expect(fs.existsSync(path.join(tmpDir, ".trellis", "escaped"))).toBe(false);
    expect(
      fs.readdirSync(path.join(tmpDir, ".trellis", "tasks")).sort(),
    ).toEqual(["08-09-real", "archive"]);
  });

  it("[audit] add-context rejects a traversal JSONL filename", () => {
    const r = runTask(
      "add-context",
      "08-09-real",
      "../../../evil-ctx",
      ".trellis/tasks/08-09-real/task.json",
    );
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("must be a plain name");
    expect(fs.existsSync(path.join(tmpDir, "..", "evil-ctx.jsonl"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(tmpDir, "evil-ctx.jsonl"))).toBe(false);
  });

  it("[audit] add-context on '..' fails instead of writing into .trellis/", () => {
    const r = runTask(
      "add-context",
      "..",
      "implement",
      ".trellis/tasks/08-09-real/task.json",
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("invalid task name");
    expect(
      fs.existsSync(path.join(tmpDir, ".trellis", "implement.jsonl")),
    ).toBe(false);
  });

  it("[audit] an ambiguous suffix name fails and lists every match", () => {
    makeTask("01-01-dupe");
    makeTask("12-31-dupe");

    const r = runTask("set-meta", "dupe", "k", "v");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("ambiguous task name");
    expect(r.stderr).toContain("01-01-dupe");
    expect(r.stderr).toContain("12-31-dupe");
    for (const name of ["01-01-dupe", "12-31-dupe"]) {
      expect(
        JSON.parse(
          fs.readFileSync(path.join(taskDir(name), "task.json"), "utf-8"),
        ).meta,
      ).toEqual({});
    }
  });

  it("[audit] legitimate task paths still resolve: name, repo-relative path, and archived task", () => {
    fs.mkdirSync(taskDir("archive", "2026-07", "08-09-old"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(taskDir("archive", "2026-07", "08-09-old"), "task.json"),
      JSON.stringify(emptyTaskRecord({ id: "old", name: "08-09-old" })) + "\n",
    );

    expect(runTask("set-meta", "08-09-real", "by-name", "1").status).toBe(0);
    expect(
      runTask("set-meta", ".trellis/tasks/08-09-real", "by-path", "2").status,
    ).toBe(0);
    expect(
      runTask(
        "set-meta",
        ".trellis/tasks/archive/2026-07/08-09-old",
        "archived",
        "3",
      ).status,
    ).toBe(0);

    expect(
      JSON.parse(
        fs.readFileSync(path.join(taskDir("08-09-real"), "task.json"), "utf-8"),
      ).meta,
    ).toEqual({ "by-name": "1", "by-path": "2" });
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(taskDir("archive", "2026-07", "08-09-old"), "task.json"),
          "utf-8",
        ),
      ).meta,
    ).toEqual({ archived: "3" });
  });
});

describe("regression: task lifecycle overwrite and collision safety", () => {
  let tmpDir: string;
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  const pad = (n: number): string => String(n).padStart(2, "0");
  const now = new Date();
  const datePrefix = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const yearMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

  function runTask(...args: string[]): {
    status: number | null;
    stdout: string;
    stderr: string;
  } {
    const result = spawnSync(
      pythonCmd,
      [path.join(".trellis", "scripts", "task.py"), ...args],
      { cwd: tmpDir, encoding: "utf-8" },
    );
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  function taskDir(...segments: string[]): string {
    return path.join(tmpDir, ".trellis", "tasks", ...segments);
  }

  function readTaskJson(...segments: string[]): Record<string, unknown> {
    return JSON.parse(
      fs.readFileSync(path.join(taskDir(...segments), "task.json"), "utf-8"),
    ) as Record<string, unknown>;
  }

  function writeTaskJson(name: string, data: Record<string, unknown>): void {
    fs.writeFileSync(
      path.join(taskDir(name), "task.json"),
      JSON.stringify(data, null, 2) + "\n",
    );
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-task-collision-"));
    const scriptsDir = path.join(tmpDir, ".trellis", "scripts");
    for (const [relativePath, content] of getAllScripts()) {
      const absPath = path.join(scriptsDir, relativePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, "utf-8");
    }
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "custom-note"),
      "name=tester\n",
    );
    fs.mkdirSync(taskDir("archive"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("[audit] same-day slug reuse fails and preserves the existing task.json", () => {
    expect(
      runTask(
        "create",

        "First",
        "--description",
        "regression fixture",
        "--slug",
        "reuse",
        "--no-start",
      ).status,
    ).toBe(0);

    const dirName = `${datePrefix}-reuse`;
    const live = {
      ...readTaskJson(dirName),
      status: "in_progress",
      branch: "feat/live",
      parent: "some-parent",
      children: ["some-child"],
      meta: { linear: "TRE-1" },
    };
    writeTaskJson(dirName, live);

    const r = runTask(
      "create",

      "Second",
      "--description",
      "regression fixture",
      "--slug",
      "reuse",
      "--no-start",
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("task_id_collision");
    expect(readTaskJson(dirName)).toEqual(live);
  });

  it("[issue-8] create --force cannot reuse an existing stable TaskId", () => {
    expect(
      runTask(
        "create",

        "First",
        "--description",
        "regression fixture",
        "--slug",
        "reuse",
        "--no-start",
      ).status,
    ).toBe(0);
    const dirName = `${datePrefix}-reuse`;
    writeTaskJson(dirName, { ...readTaskJson(dirName), status: "in_progress" });

    const r = runTask(
      "create",

      "Second",
      "--description",
      "regression fixture",
      "--slug",
      "reuse",
      "--no-start",
      "--force",
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("task_id_collision");

    const after = readTaskJson(dirName);
    expect(after.title).toBe("First");
    expect(after.status).toBe("in_progress");
  });

  it("[audit] archive into an existing destination fails, leaving both directories intact", () => {
    expect(
      runTask(
        "create",

        "Kid",
        "--description",
        "regression fixture",
        "--slug",
        "kid",
        "--no-start",
      ).status,
    ).toBe(0);
    const dirName = `${datePrefix}-kid`;

    const destDir = taskDir("archive", yearMonth, dirName);
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(
      path.join(destDir, "task.json"),
      JSON.stringify(emptyTaskRecord({ id: "previously-archived", name: dirName })),
    );

    const r = runTask("archive", dirName, "--no-commit");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("archive destination already exists");
    // Both sides of the collision must be named, or the user cannot tell
    // which archived task to move out of the way.
    expect(r.stderr).toContain(`archive/${yearMonth}/${dirName}`);
    expect(r.stderr).toContain(`Task remains at: .trellis/tasks/${dirName}`);

    // No nesting, no partial state: the live task is untouched (not even
    // flipped to completed) and the archived copy still holds its own file.
    expect(fs.existsSync(path.join(destDir, dirName))).toBe(false);
    expect(readTaskJson(dirName).status).toBe("planning");
    expect(readTaskJson(dirName).completedAt).toBeNull();
    expect(
      JSON.parse(fs.readFileSync(path.join(destDir, "task.json"), "utf-8")).id,
    ).toBe("previously-archived");
  });

  it("[audit] archive still succeeds when the destination is free", () => {
    expect(
      runTask(
        "create",

        "Kid",
        "--description",
        "regression fixture",
        "--slug",
        "kid",
        "--no-start",
      ).status,
    ).toBe(0);
    const dirName = `${datePrefix}-kid`;

    const r = runTask("archive", dirName, "--no-commit");
    expect(r.status, r.stderr).toBe(0);
    expect(fs.existsSync(taskDir(dirName))).toBe(false);
    expect(
      fs.existsSync(
        path.join(taskDir("archive", yearMonth, dirName), "task.json"),
      ),
    ).toBe(true);
  });

  it("[audit] create --parent on a missing task fails and creates nothing", () => {
    const r = runTask(
      "create",

      "Orphan",
      "--description",
      "regression fixture",
      "--slug",
      "orphan",
      "--no-start",
      "--parent",
      "no-such-task",
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("Parent task not resolved");
    expect(r.stderr).toContain("No task was created");
    expect(fs.readdirSync(path.join(tmpDir, ".trellis", "tasks"))).toEqual([
      "archive",
    ]);
  });

  it("[audit] create --parent pointing at a dir without task.json fails and creates nothing", () => {
    fs.mkdirSync(taskDir(`${datePrefix}-bare`), { recursive: true });

    const r = runTask(
      "create",

      "Orphan",
      "--description",
      "regression fixture",
      "--slug",
      "orphan",
      "--no-start",
      "--parent",
      `${datePrefix}-bare`,
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("Parent task.json not found");
    expect(fs.existsSync(taskDir(`${datePrefix}-orphan`))).toBe(false);
  });

  it("[audit] create --parent still links a valid parent on both sides", () => {
    expect(
      runTask(
        "create",

        "Mum",
        "--description",
        "regression fixture",
        "--slug",
        "mum",
        "--no-start",
      ).status,
    ).toBe(0);
    const parentName = `${datePrefix}-mum`;
    const childName = `${datePrefix}-kid`;

    const r = runTask(
      "create",

      "Kid",
      "--description",
      "regression fixture",
      "--slug",
      "kid",
      "--no-start",
      "--parent",
      parentName,
    );
    expect(r.status, r.stderr).toBe(0);
    expect(readTaskJson(childName).parent).toBe(parentName);
    expect(readTaskJson(parentName).children).toEqual([childName]);
  });

  // A read-only child directory makes write_json's mkstemp fail. root ignores
  // the mode bits, so the failure can only be provoked as a normal user.
  const canProvokeWriteFailure =
    process.platform !== "win32" && process.getuid?.() !== 0;

  it.skipIf(!canProvokeWriteFailure)(
    "[audit] add-subtask reports which side was written when the second write fails",
    () => {
      expect(
        runTask(
          "create",

          "Mum",
          "--description",
          "regression fixture",
          "--slug",
          "mum",
          "--no-start",
        ).status,
      ).toBe(0);
      expect(
        runTask(
          "create",

          "Kid",
          "--description",
          "regression fixture",
          "--slug",
          "kid",
          "--no-start",
        ).status,
      ).toBe(0);
      const parentName = `${datePrefix}-mum`;
      const childName = `${datePrefix}-kid`;

      fs.chmodSync(taskDir(childName), 0o555);
      try {
        const r = runTask("add-subtask", parentName, childName);
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain("Failed to write child task.json");
        expect(r.stderr).toContain("half-written");
        // The message must match reality: the parent side did land.
        expect(readTaskJson(parentName).children).toEqual([childName]);
      } finally {
        fs.chmodSync(taskDir(childName), 0o755);
      }
    },
  );

  it.skipIf(!canProvokeWriteFailure)(
    "[audit] remove-subtask reports which side was written when the second write fails",
    () => {
      expect(
        runTask(
          "create",

          "Mum",
          "--description",
          "regression fixture",
          "--slug",
          "mum",
          "--no-start",
        ).status,
      ).toBe(0);
      const parentName = `${datePrefix}-mum`;
      const childName = `${datePrefix}-kid`;
      expect(
        runTask(
          "create",

          "Kid",
          "--description",
          "regression fixture",
          "--slug",
          "kid",
          "--no-start",
          "--parent",
          parentName,
        ).status,
      ).toBe(0);

      fs.chmodSync(taskDir(childName), 0o555);
      try {
        const r = runTask("remove-subtask", parentName, childName);
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain("Failed to write child task.json");
        expect(r.stderr).toContain("half-written");
        // The message must match reality: the parent side did land, so the
        // child is the one still holding a stale parent reference.
        expect(readTaskJson(parentName).children).toEqual([]);
        expect(readTaskJson(childName).parent).toBe(parentName);
      } finally {
        fs.chmodSync(taskDir(childName), 0o755);
      }
    },
  );
});

describe("regression: JSON read/write failure reporting", () => {
  let tmpDir: string;
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  const pad = (n: number): string => String(n).padStart(2, "0");
  const now = new Date();
  const datePrefix = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  // chmod is the only way to provoke a read/write failure, and root ignores
  // the mode bits — skip rather than assert something that cannot happen.
  const canProvokePermissionFailure =
    process.platform !== "win32" && process.getuid?.() !== 0;

  function runTask(
    args: string[],
    env: Record<string, string> = {},
  ): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(
      pythonCmd,
      [path.join(".trellis", "scripts", "task.py"), ...args],
      { cwd: tmpDir, encoding: "utf-8", env: { ...process.env, ...env } },
    );
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  function taskDir(...segments: string[]): string {
    return path.join(tmpDir, ".trellis", "tasks", ...segments);
  }

  function taskJsonPath(name: string): string {
    return path.join(taskDir(name), "task.json");
  }

  function readTaskJson(name: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(taskJsonPath(name), "utf-8")) as Record<
      string,
      unknown
    >;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-task-json-io-"));
    const scriptsDir = path.join(tmpDir, ".trellis", "scripts");
    for (const [relativePath, content] of getAllScripts()) {
      const absPath = path.join(scriptsDir, relativePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, "utf-8");
    }
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "custom-note"),
      "name=tester\n",
    );
    fs.mkdirSync(taskDir("archive"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("[audit] set-meta on a corrupt task.json names the file and the failure class", () => {
    expect(
      runTask([
        "create",

        "Broken",
        "--description",
        "regression fixture",
        "--slug",
        "broken",
        "--no-start",
      ]).status,
    ).toBe(0);
    const name = `${datePrefix}-broken`;
    fs.writeFileSync(taskJsonPath(name), "{ not json");

    const r = runTask(["set-meta", name, "k", "v"]);
    expect(r.status).not.toBe(0);
    // Previously: exit 1 with completely empty stdout AND stderr.
    expect(r.stderr).toContain("task.json");
    expect(r.stderr).toContain("not valid JSON");
    expect(r.stderr).toContain("json.tool");
    expect(fs.readFileSync(taskJsonPath(name), "utf-8")).toBe("{ not json");
  });

  it("[audit] set-meta on a non-UTF-8 task.json names the encoding, not a parse error", () => {
    // read_json_checked caught FileNotFoundError and OSError. UnicodeDecodeError
    // is neither, so a task.json that is not UTF-8 escaped both handlers and
    // surfaced as a traceback.
    expect(
      runTask([
        "create",

        "Latin",
        "--description",
        "regression fixture",
        "--slug",
        "latin",
        "--no-start",
      ]).status,
    ).toBe(0);
    const name = `${datePrefix}-latin`;
    fs.writeFileSync(
      taskJsonPath(name),
      Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d]),
    );

    const r = runTask(["set-meta", name, "k", "v"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).not.toContain("Traceback");
    expect(r.stderr).toContain("not valid UTF-8 text");
  });

  it("[audit] validate reports a non-string `file` instead of crashing on it", () => {
    // A truthy non-string (e.g. {"file": 1}) reached path joining and raised
    // TypeError, so validation crashed on the very row it exists to report.
    expect(
      runTask([
        "create",

        "Typed",
        "--description",
        "regression fixture",
        "--slug",
        "typed",
        "--no-start",
      ]).status,
    ).toBe(0);
    const name = `${datePrefix}-typed`;
    fs.writeFileSync(
      path.join(path.dirname(taskJsonPath(name)), "implement.jsonl"),
      `${JSON.stringify({ file: 1, reason: "numeric path" })}\n`,
      "utf-8",
    );

    const r = runTask(["validate", name]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).not.toContain("Traceback");
    expect(r.stdout).toContain("`file` must be a string path");
  });

  it.skipIf(!canProvokePermissionFailure)(
    "[audit] set-meta on an unreadable task.json reports permissions, not a parse error",
    () => {
      expect(
        runTask([
          "create",

          "Locked",
          "--description",
          "regression fixture",
          "--slug",
          "locked",
          "--no-start",
        ]).status,
      ).toBe(0);
      const name = `${datePrefix}-locked`;
      fs.chmodSync(taskJsonPath(name), 0o000);

      try {
        const r = runTask(["set-meta", name, "k", "v"]);
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain("could not be read");
        expect(r.stderr).toContain("permission");
        // The whole point of the split: this must NOT read as a parse error.
        expect(r.stderr).not.toContain("not valid JSON");
      } finally {
        fs.chmodSync(taskJsonPath(name), 0o644);
      }
    },
  );

  it("[audit] set-scope on a task dir without task.json reports the missing file", () => {
    fs.mkdirSync(taskDir(`${datePrefix}-bare`), { recursive: true });
    const r = runTask(["set-scope", `${datePrefix}-bare`, "cli"]);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("task.json not found");
  });

  it.skipIf(!canProvokePermissionFailure)(
    "[audit] set-branch reports a failed write instead of printing success",
    () => {
      expect(
        runTask([
          "create",

          "Ro",
          "--description",
          "regression fixture",
          "--slug",
          "ro",
          "--no-start",
        ]).status,
      ).toBe(0);
      const name = `${datePrefix}-ro`;
      // Read-only task dir: write_json's mkstemp fails, the original survives.
      fs.chmodSync(taskDir(name), 0o555);

      try {
        const r = runTask(["set-branch", name, "feat/x"]);
        expect(r.status).not.toBe(0);
        expect(r.stdout).not.toContain("Branch set to");
        expect(r.stderr).toContain("Failed to write");
        expect(r.stderr).toContain("unchanged");
      } finally {
        fs.chmodSync(taskDir(name), 0o755);
      }
      expect(readTaskJson(name)).not.toHaveProperty("branch");
    },
  );

  it.skipIf(!canProvokePermissionFailure)(
    "[issue-8] create --force rejects the stable TaskId before a replacement write",
    () => {
      expect(
        runTask([
          "create",

          "First",
          "--description",
          "regression fixture",
          "--slug",
          "dup",
          "--no-start",
        ]).status,
      ).toBe(0);
      const name = `${datePrefix}-dup`;
      fs.chmodSync(taskDir(name), 0o555);

      try {
        const r = runTask([
          "create",

          "Second",
          "--description",
          "regression fixture",
          "--slug",
          "dup",
          "--no-start",
          "--force",
        ]);
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain("task_id_collision");
        expect(r.stderr).not.toContain("Created task");
        // Nothing on stdout means nothing for a script to chain onto.
        expect(r.stdout.trim()).toBe("");
      } finally {
        fs.chmodSync(taskDir(name), 0o755);
      }
      expect(readTaskJson(name).title).toBe("First");
    },
  );

  it.skipIf(!canProvokePermissionFailure)(
    "[audit] archive stops before moving when a child cannot be unlinked",
    () => {
      expect(
        runTask([
          "create",

          "Mum",
          "--description",
          "regression fixture",
          "--slug",
          "mum",
          "--no-start",
        ]).status,
      ).toBe(0);
      const parentName = `${datePrefix}-mum`;
      const childName = `${datePrefix}-kid`;
      expect(
        runTask([
          "create",

          "Kid",
          "--description",
          "regression fixture",
          "--slug",
          "kid",
          "--no-start",
          "--parent",
          parentName,
        ]).status,
      ).toBe(0);

      fs.chmodSync(taskDir(childName), 0o555);
      try {
        const r = runTask(["archive", parentName, "--no-commit"]);
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain("Failed to write");
        expect(r.stderr).toContain(childName);
        expect(r.stderr).toContain("Not archived");
      } finally {
        fs.chmodSync(taskDir(childName), 0o755);
      }
      // The task must still be where the user left it, not half-moved.
      expect(fs.existsSync(taskJsonPath(parentName))).toBe(true);
      expect(readTaskJson(childName).parent).toBe(parentName);
    },
  );

  it.skipIf(!canProvokePermissionFailure)(
    "[audit] archive restores the children it already unlinked when a later one fails",
    () => {
      const createTask = (
        title: string,
        slug: string,
        parent?: string,
      ): void => {
        const args = [
          "create",
          title,
          "--description",
          "regression fixture",
          "--slug",
          slug,
          "--no-start",
        ];
        if (parent) args.push("--parent", parent);
        expect(runTask(args).status).toBe(0);
      };

      createTask("Mum", "mum2");
      const parentName = `${datePrefix}-mum2`;
      createTask("Kid A", "kid-a", parentName);
      createTask("Kid B", "kid-b", parentName);
      const firstChild = `${datePrefix}-kid-a`;
      const failingChild = `${datePrefix}-kid-b`;

      // Archive walks `children` in order, so pin the order: the failing
      // child has to come second, after `kid-a` has already lost its link.
      const parentJson = readTaskJson(parentName);
      parentJson.children = [firstChild, failingChild];
      fs.writeFileSync(
        taskJsonPath(parentName),
        `${JSON.stringify(parentJson, null, 2)}\n`,
        "utf-8",
      );

      // Provoke the write failure through both mechanisms the atomic
      // writer can hit: a read-only directory fails `mkstemp`, and a
      // read-only target fails the final replace. Which one a platform
      // enforces is not the point of this test.
      fs.chmodSync(taskDir(failingChild), 0o555);
      fs.chmodSync(taskJsonPath(failingChild), 0o444);
      try {
        const r = runTask(["archive", parentName, "--no-commit"]);
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain("Failed to write");
        expect(r.stderr).toContain(failingChild);
        expect(r.stderr).toContain("Not archived");
      } finally {
        fs.chmodSync(taskJsonPath(failingChild), 0o644);
        fs.chmodSync(taskDir(failingChild), 0o755);
      }

      // Stopping before the move is not enough on its own: `kid-a` was
      // unlinked before the failure, and with its parent still in the
      // active tree that link is lost for good. It has to come back.
      expect(fs.existsSync(taskJsonPath(parentName))).toBe(true);
      expect(readTaskJson(firstChild).parent).toBe(parentName);
      expect(readTaskJson(failingChild).parent).toBe(parentName);
    },
  );

  it.skipIf(!canProvokePermissionFailure)(
    "[audit] archive restore survives a duplicated child entry",
    () => {
      const create = (title: string, slug: string, parent?: string): string => {
        const args = [
          "create",
          title,
          "--description",
          "regression fixture",
          "--slug",
          slug,
          "--no-start",
        ];
        if (parent) args.push("--parent", parent);
        expect(runTask(args).status).toBe(0);
        return `${datePrefix}-${slug}`;
      };

      const parentName = create("Mum", "mum-dup");
      const firstChild = create("Kid A", "kid-a-dup", parentName);
      const failingChild = create("Kid B", "kid-b-dup", parentName);

      // A duplicated entry makes the unlink loop visit `kid-a-dup` twice.
      // The second visit must not snapshot the already-cleared `null`, or the
      // restore writes that back over the real link and detaches the child
      // while its parent is still in the active tree.
      const parentJson = readTaskJson(parentName);
      parentJson.children = [firstChild, firstChild, failingChild];
      fs.writeFileSync(
        taskJsonPath(parentName),
        `${JSON.stringify(parentJson, null, 2)}\n`,
        "utf-8",
      );

      fs.chmodSync(taskDir(failingChild), 0o555);
      fs.chmodSync(taskJsonPath(failingChild), 0o444);
      try {
        expect(runTask(["archive", parentName, "--no-commit"]).status).not.toBe(
          0,
        );
      } finally {
        fs.chmodSync(taskJsonPath(failingChild), 0o644);
        fs.chmodSync(taskDir(failingChild), 0o755);
      }

      expect(readTaskJson(firstChild).parent).toBe(parentName);
      expect(readTaskJson(failingChild).parent).toBe(parentName);
    },
  );

  it("[audit] list warns about a skipped task instead of silently dropping it", () => {
    expect(
      runTask([
        "create",

        "Good",
        "--description",
        "regression fixture",
        "--slug",
        "good",
        "--no-start",
      ]).status,
    ).toBe(0);
    expect(
      runTask([
        "create",

        "Bad",
        "--description",
        "regression fixture",
        "--slug",
        "bad",
        "--no-start",
      ]).status,
    ).toBe(0);
    fs.writeFileSync(taskJsonPath(`${datePrefix}-bad`), "{ not json");

    const r = runTask(["list"]);
    expect(r.status).toBe(0);
    // Tolerant: the healthy task still lists.
    expect(r.stdout).toContain(`${datePrefix}-good`);
    // Observable: the vanished one is named, with the reason.
    expect(r.stderr).toContain(`${datePrefix}-bad`);
    expect(r.stderr).toContain("Skipping task");
    expect(r.stderr).toContain("not valid JSON");
  });

  it("[audit] start refuses corrupt task metadata without writing a session binding", () => {
    const env = { TRELLIS_CONTEXT_ID: "json-io-start" };
    expect(
      runTask(
        [
          "create",

          "Rot",
          "--description",
          "regression fixture",
          "--slug",
          "rot",
          "--no-start",
        ],
        env,
      ).status,
    ).toBe(0);
    const name = `${datePrefix}-rot`;
    fs.writeFileSync(taskJsonPath(name), "{ not json");

    const r = runTask(["start", name], env);
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain("Current task set to");
    expect(r.stderr).toContain("task_metadata_invalid");
    expect(fs.readFileSync(taskJsonPath(name), "utf8")).toBe("{ not json");
    expect(
      fs.existsSync(
        path.join(tmpDir, ".trellis/.runtime/sessions/json-io-start.json"),
      ),
    ).toBe(false);
  });

  it("[audit] current --json carries a read-failure signal and stays silent when healthy", () => {
    const env = { TRELLIS_CONTEXT_ID: "json-io-test" };
    expect(
      runTask(
        [
          "create",

          "Live",
          "--description",
          "regression fixture",
          "--slug",
          "live",
          "--no-start",
        ],
        env,
      ).status,
    ).toBe(0);
    const name = `${datePrefix}-live`;
    expect(runTask(["start", name], env).status).toBe(0);

    const healthy = runTask(["current", "--json"], env);
    expect(healthy.status).toBe(0);
    const healthyPayload = JSON.parse(healthy.stdout) as Record<
      string,
      unknown
    >;
    expect(Object.keys(healthyPayload).sort()).toEqual([
      "current_task",
      "invocation_root",
      "repository_common_dir",
      "resolved_task_path",
      "source",
      "stale",
      "task_workspace_root",
    ]);

    fs.writeFileSync(taskJsonPath(name), "{ not json");
    const broken = runTask(["current", "--json"], env);
    const brokenPayload = JSON.parse(broken.stdout) as {
      current_task: Record<string, unknown> | null;
      error?: string;
      stale: boolean;
      resolved_task_path: string | null;
    };
    expect(broken.status).toBe(1);
    expect(brokenPayload.current_task).toBeNull();
    expect(brokenPayload.resolved_task_path).toBeNull();
    expect(brokenPayload.stale).toBe(true);
    expect(brokenPayload.error).toContain("task_metadata_invalid");
    expect(brokenPayload.error).toContain("task.json");
  });

  it.skipIf(!canProvokePermissionFailure)(
    "[audit] a session pointer that cannot be written atomically is left intact",
    () => {
      const env = { TRELLIS_CONTEXT_ID: "json-io-session" };
      expect(
        runTask(
          [
            "create",

            "One",
            "--description",
            "regression fixture",
            "--slug",
            "one",
            "--no-start",
          ],
          env,
        ).status,
      ).toBe(0);
      expect(
        runTask(
          [
            "create",

            "Two",
            "--description",
            "regression fixture",
            "--slug",
            "two",
            "--no-start",
          ],
          env,
        ).status,
      ).toBe(0);
      expect(runTask(["start", `${datePrefix}-one`], env).status).toBe(0);

      const sessionsDir = path.join(tmpDir, ".trellis", ".runtime", "sessions");
      const sessionFile = path.join(sessionsDir, "json-io-session.json");
      expect(fs.existsSync(sessionFile)).toBe(true);

      // A read-only sessions dir blocks the temp-file write. The old plain
      // write_text would have opened the existing file for writing (which
      // needs no directory permission) and truncated it before writing.
      fs.chmodSync(sessionsDir, 0o555);
      try {
        const r = runTask(["start", `${datePrefix}-two`], env);
        expect(r.status).not.toBe(0);
        expect(r.stdout + r.stderr).toContain("binding_write_failed");
      } finally {
        fs.chmodSync(sessionsDir, 0o755);
      }

      const session = JSON.parse(fs.readFileSync(sessionFile, "utf-8")) as {
        task_id: string;
        lifecycle_generation: number;
      };
      expect(session.task_id).toBe("one");
      expect(session.lifecycle_generation).toBe(0);
    },
  );
});

describe("regression: is_within_tasks_dir archive boundary (issue #428)", () => {
  let tmpDir: string;
  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "trellis-within-tasks-dir-"),
    );
    const scriptsDir = path.join(tmpDir, ".trellis", "scripts");
    for (const [relativePath, content] of getAllScripts()) {
      const absPath = path.join(scriptsDir, relativePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, "utf-8");
    }
    fs.mkdirSync(path.join(tmpDir, ".trellis", "tasks", "archive"), {
      recursive: true,
    });
    fs.mkdirSync(
      path.join(tmpDir, ".trellis", "tasks", "archive", "2026-07", "old-task"),
      { recursive: true },
    );
    fs.mkdirSync(path.join(tmpDir, ".trellis", "tasks", "live-task"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("[issue-428] rejects the archive root, an archived child, the tasks root, and an external path; accepts a direct child", () => {
    const probe = `
import json
import sys
from pathlib import Path

root = Path.cwd()
sys.path.insert(0, str(root / ".trellis" / "scripts"))
from common.task_utils import is_within_tasks_dir

print(json.dumps({
    "archive_root": is_within_tasks_dir(root / ".trellis" / "tasks" / "archive", root),
    "archived_child": is_within_tasks_dir(root / ".trellis" / "tasks" / "archive" / "2026-07" / "old-task", root),
    "tasks_root": is_within_tasks_dir(root / ".trellis" / "tasks", root),
    "external_path": is_within_tasks_dir(root / "src", root),
    "direct_child": is_within_tasks_dir(root / ".trellis" / "tasks" / "live-task", root),
}))
`;
    const result = spawnSync(pythonCmd, ["-c", probe], {
      cwd: tmpDir,
      encoding: "utf-8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      archive_root: false,
      archived_child: false,
      tasks_root: false,
      external_path: false,
      direct_child: true,
    });
  });
});

describe("regression: write_json fd ownership and cleanup (issue #429)", () => {
  let tmpDir: string;
  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-write-json-"));
    const scriptsDir = path.join(tmpDir, ".trellis", "scripts");
    for (const [relativePath, content] of getAllScripts()) {
      const absPath = path.join(scriptsDir, relativePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, "utf-8");
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runProbe(probeBody: string): {
    status: number | null;
    stdout: string;
    stderr: string;
  } {
    const probe = `
import json
import os
import sys
from pathlib import Path
from unittest import mock

root = Path.cwd()
sys.path.insert(0, str(root / ".trellis" / "scripts"))
from common.io import write_json

${probeBody}
`;
    const result = spawnSync(pythonCmd, ["-c", probe], {
      cwd: tmpDir,
      encoding: "utf-8",
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  it("[issue-429] closes the raw fd itself when fdopen fails, and leaves no temp file", () => {
    const { status, stdout, stderr } = runProbe(`
target = root / "out.json"
real_close = os.close
closed_fds = []

def fake_close(fd):
    closed_fds.append(fd)
    real_close(fd)

def fake_fdopen(fd, *a, **kw):
    # fdopen never took ownership: caller must close fd itself.
    raise OSError("simulated fdopen failure")

with mock.patch("os.close", side_effect=fake_close), \\
     mock.patch("os.fdopen", side_effect=fake_fdopen):
    result = write_json(target, {"a": 1})

leftover_tmp = [p.name for p in root.glob("*.tmp")] + [p.name for p in root.glob(".out.json.*")]
print(json.dumps({
    "result": result,
    "fd_closed": len(closed_fds) == 1,
    "target_exists": target.exists(),
    "leftover_tmp": leftover_tmp,
}))
`);
    expect(status, stderr).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      result: false,
      fd_closed: true,
      target_exists: false,
      leftover_tmp: [],
    });
  });

  it("[issue-429] cleans up the temp file when os.replace fails, without masking the write as a success", () => {
    const { status, stdout, stderr } = runProbe(`
target = root / "out.json"

with mock.patch("os.replace", side_effect=OSError("simulated replace failure")):
    result = write_json(target, {"a": 1})

leftover_tmp = [p.name for p in root.glob(".out.json.*")]
print(json.dumps({
    "result": result,
    "target_exists": target.exists(),
    "leftover_tmp": leftover_tmp,
}))
`);
    expect(status, stderr).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      result: false,
      target_exists: false,
      leftover_tmp: [],
    });
  });

  it("[issue-429] a cleanup failure after a write failure does not raise — still reports False", () => {
    const { status, stdout, stderr } = runProbe(`
target = root / "out.json"

with mock.patch("os.replace", side_effect=OSError("simulated replace failure")), \\
     mock.patch("os.unlink", side_effect=OSError("simulated cleanup failure")):
    result = write_json(target, {"a": 1})

print(json.dumps({"result": result}))
`);
    expect(status, stderr).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ result: false });
  });

  it("[issue-429] a successful write is atomic and leaves no leftover temp file", () => {
    const { status, stdout, stderr } = runProbe(`
target = root / "out.json"
result = write_json(target, {"a": 1, "b": "text"})
leftover_tmp = [p.name for p in root.glob(".out.json.*")]
print(json.dumps({
    "result": result,
    "content": json.loads(target.read_text(encoding="utf-8")),
    "leftover_tmp": leftover_tmp,
}))
`);
    expect(status, stderr).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      result: true,
      content: { a: 1, b: "text" },
      leftover_tmp: [],
    });
  });
});

describe("regression: task auto-activation failure diagnostics (issue #430)", () => {
  let tmpDir: string;
  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-task-activate-"));
    const scriptsDir = path.join(tmpDir, ".trellis", "scripts");
    for (const [relativePath, content] of getAllScripts()) {
      const absPath = path.join(scriptsDir, relativePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, "utf-8");
    }
    fs.mkdirSync(path.join(tmpDir, ".trellis", "spec", "guides"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "spec", "guides", "index.md"),
      "# Guides\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "workflow.md"),
      "# Workflow\n",
    );
    fs.mkdirSync(path.join(tmpDir, ".trellis", "tasks"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".trellis", "workspace", "test-dev"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "custom-note"),
      "name=test-dev\n",
      "utf-8",
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Ambient session env vars from the real host session (e.g. this test
  // running inside Claude Code itself) must not leak into the "no session"
  // scenario — scrub every platform session/transcript key before overlay.
  const AMBIENT_SESSION_ENV_KEYS = [
    "TRELLIS_CONTEXT_ID",
    "CLAUDE_SESSION_ID",
    "CLAUDE_CODE_SESSION_ID",
    "CODEX_SESSION_ID",
    "CODEX_THREAD_ID",
    "CURSOR_SESSION_ID",
    "CURSOR_CONVERSATION_ID",
    "CURSOR_CONVERSATIONID",
    "OPENCODE_SESSION_ID",
    "OPENCODE_SESSIONID",
    "OPENCODE_RUN_ID",
    "GEMINI_SESSION_ID",
    "FACTORY_SESSION_ID",
    "DROID_SESSION_ID",
    "QODER_SESSION_ID",
    "CODEBUDDY_SESSION_ID",
    "KIRO_SESSION_ID",
    "COPILOT_SESSION_ID",
    "COPILOT_SESSIONID",
    "PI_SESSION_ID",
  ] as const;

  function runCreate(env: NodeJS.ProcessEnv) {
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const blocked = new Set<string>(AMBIENT_SESSION_ENV_KEYS);
    const scrubbed: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!blocked.has(key)) scrubbed[key] = value;
    }
    return spawnSync(
      pythonCmd,
      [
        taskScriptPath,
        "create",

        "issue-430 probe",
        "--description",
        "regression fixture",
        "--slug",
        "issue-430-probe",
      ],
      { cwd: tmpDir, encoding: "utf-8", env: { ...scrubbed, ...env } },
    );
  }

  it("[issue-430] no session identity stays silent (normal degraded mode, not a failure)", () => {
    const result = runCreate({});
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).not.toContain("Warning: session activation");
    expect(result.stderr).not.toContain("Activated task for this session");
  });

  it("[issue-430] a real session identity activates normally with no warning", () => {
    const result = runCreate({ TRELLIS_CONTEXT_ID: "probe-session" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("Activated task for this session");
    expect(result.stderr).not.toContain("Warning: session activation");
  });

  it("[issue-430] a pointer-persistence failure is now diagnosable instead of silently swallowed", () => {
    // Pre-create the session-pointer directory's own path as a *file* so
    // `_write_json`'s `path.parent.mkdir(parents=True, exist_ok=True)` raises
    // FileExistsError — a real, portable failure mode (no chmod needed).
    const sessionsPathAsFile = path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      "sessions",
    );
    fs.mkdirSync(path.dirname(sessionsPathAsFile), { recursive: true });
    fs.writeFileSync(sessionsPathAsFile, "not a directory");

    const result = runCreate({ TRELLIS_CONTEXT_ID: "probe-session" });

    // Task creation itself must still succeed — activation is best-effort.
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("Warning: session activation failed");
    expect(result.stderr).not.toContain("Activated task for this session");
  });
});

describe("regression: update only configured platforms (beta.16)", () => {
  // NOTE: v0.5.0-beta.8 added collectTemplates for opencode. Before that,
  // opencode was the only configured platform with no update tracking —
  // `trellis update` silently ignored .opencode/, so CLI-side changes to
  // opencode plugins / agents / package.json never reached installed projects.
  // That was a bug, not a design choice. This test used to assert the bug;
  // now it asserts the fix.
  it("[beta.8] collectPlatformTemplates returns Map for opencode (plugins + agents + lib + package.json + commands + skills)", () => {
    const result = collectPlatformTemplates("opencode");
    expect(result).toBeInstanceOf(Map);
    if (!result) throw new Error("unreachable");
    // Sanity: must include the three plugin files — the bug that prompted this
    // fix was a plugin-shape change that couldn't be delivered via `trellis update`.
    expect(result.has(".opencode/plugins/inject-subagent-context.js")).toBe(
      true,
    );
    expect(result.has(".opencode/plugins/session-start.js")).toBe(true);
    expect(result.has(".opencode/plugins/inject-workflow-state.js")).toBe(true);
    // Plus agents, lib, package.json, at least one command, at least one skill
    expect(result.has(".opencode/agents/trellis-implement.md")).toBe(true);
    expect(result.has(".opencode/lib/context-visibility.js")).toBe(true);
    expect(result.has(".opencode/lib/trellis-context.js")).toBe(true);
    expect(result.has(".opencode/package.json")).toBe(true);
  });

  it("[beta.16] collectPlatformTemplates returns Map for platforms with tracking", () => {
    const withTracking = [
      "claude-code",
      "cursor",
      "opencode",
      "codex",
      "kilo",
      "kiro",
      "gemini",
      "antigravity",
      "devin",
      "qoder",
      "codebuddy",
      "copilot",
      "droid",
      "pi",
      "zcode",
      "omp",
      "grok",
      "kimi",
    ] as const;
    for (const id of withTracking) {
      const result = collectPlatformTemplates(id);
      expect(result, `${id} should have template tracking`).toBeInstanceOf(Map);
    }
  });
});

// dispatch agent removed — parallel/worktree now handled by platform-native features

// =============================================================================
// 4. Template Integrity Regressions
// =============================================================================

describe("regression: shell to Python migration (beta.0)", () => {
  it("[beta.0] no .sh scripts remain in trellis templates", () => {
    const scripts = getAllScripts();
    for (const [name] of scripts) {
      expect(name.endsWith(".sh"), `${name} should not end with .sh`).toBe(
        false,
      );
    }
  });

  it("[beta.0] all script keys end with .py", () => {
    const scripts = getAllScripts();
    for (const [name] of scripts) {
      expect(name.endsWith(".py"), `${name} should end with .py`).toBe(true);
    }
  });

  it("[beta.3] getAllScripts covers every .py file in templates/trellis/scripts/", () => {
    // Bug: update.ts had a hand-maintained file list that missed 11 scripts.
    // Fix: update.ts now uses getAllScripts() directly. This test ensures
    // getAllScripts() itself stays in sync with the filesystem.
    const scriptsDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/templates/trellis/scripts",
    );
    const fsFiles = new Set<string>();
    function walk(dir: string, prefix: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
        } else if (entry.name.endsWith(".py")) {
          fsFiles.add(`${prefix}${entry.name}`);
        }
      }
    }
    walk(scriptsDir, "");

    const scripts = getAllScripts();
    const registeredKeys = new Set(scripts.keys());

    // Known exclusions: files intentionally not in getAllScripts()
    const excluded = new Set([
      "hooks/linear_sync.py",
    ]);

    for (const file of fsFiles) {
      if (excluded.has(file)) continue;
      expect(
        registeredKeys.has(file),
        `${file} exists on disk but is missing from getAllScripts()`,
      ).toBe(true);
    }
  });
});

describe("regression: hook JSON format (beta.7)", () => {
  it("[beta.7] Claude settings.json is valid JSON", () => {
    expect(() => JSON.parse(claudeSettingsTemplate)).not.toThrow();
  });

  it("[beta.7] Claude settings.json has correct hook structure", () => {
    const settings = JSON.parse(claudeSettingsTemplate);
    expect(settings).toHaveProperty("hooks");
    expect(settings).not.toHaveProperty("statusLine");
    expect(settings.hooks).toHaveProperty("SessionStart");
    expect(Array.isArray(settings.hooks.SessionStart)).toBe(true);

    // Each hook entry should have matcher and hooks array
    for (const entry of settings.hooks.SessionStart) {
      expect(entry).toHaveProperty("hooks");
      expect(Array.isArray(entry.hooks)).toBe(true);
      for (const hook of entry.hooks) {
        expect(hook).toHaveProperty("type", "command");
        expect(hook).toHaveProperty("command");
        expect(hook).toHaveProperty("timeout");
      }
    }
  });

  it("[beta.7] hook commands use {{PYTHON_CMD}} placeholder (not hardcoded python3)", () => {
    const settings = JSON.parse(claudeSettingsTemplate);
    const allHookEntries = [
      ...settings.hooks.SessionStart,
      ...settings.hooks.PreToolUse,
    ];
    for (const entry of allHookEntries) {
      for (const hook of entry.hooks) {
        expect(hook.command).toContain("{{PYTHON_CMD}}");
        expect(hook.command).not.toMatch(/^python3?\s/);
      }
    }
  });
});

describe("regression: SessionStart reinject on clear/compact (MIN-231)", () => {
  it("[MIN-231] Claude SessionStart hooks cover startup, clear, and compact", () => {
    const settings = JSON.parse(claudeSettingsTemplate);
    const matchers = settings.hooks.SessionStart.map(
      (e: { matcher: string }) => e.matcher,
    );
    expect(matchers).toEqual(
      expect.arrayContaining(["startup", "clear", "compact"]),
    );
  });

  it("[MIN-231] all SessionStart matchers invoke session-start.py", () => {
    const settings = JSON.parse(claudeSettingsTemplate);
    for (const entry of settings.hooks.SessionStart) {
      expect(
        entry.hooks[0].command,
        `claude ${entry.matcher} should invoke session-start.py`,
      ).toContain("session-start.py");
    }
  });
});

describe("regression: agent-session Trellis update hint", () => {
  let tmpDir: string;
  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-update-hint-"));
    const scriptsDir = path.join(tmpDir, ".trellis", "scripts");
    for (const [relativePath, content] of getAllScripts()) {
      const absPath = path.join(scriptsDir, relativePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, "utf-8");
    }
    fs.mkdirSync(path.join(tmpDir, ".trellis", "tasks"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "custom-note"),
      "name=test-dev\ninitialized_at=2026-05-09T00:00:00Z\n",
      "utf-8",
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runContextWithTrellisOutput(
    currentVersion: string,
    trellisVersionOutput: string | null,
  ): string {
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", ".version"),
      `${currentVersion}\n`,
      "utf-8",
    );
    const runnerPath = path.join(tmpDir, "run-context.py");
    fs.writeFileSync(
      runnerPath,
      [
        "import os",
        "import sys",
        "from pathlib import Path",
        "sys.path.insert(0, str(Path.cwd() / '.trellis' / 'scripts'))",
        "from common import session_context",
        "output = os.environ.get('TRELLIS_VERSION_OUTPUT')",
        "session_context._fetch_trellis_version_output = lambda: None if output == '__NONE__' else output",
        "session_context.output_text(Path.cwd())",
        "",
      ].join("\n"),
      "utf-8",
    );
    return execSync(`${pythonCmd} ${JSON.stringify(runnerPath)}`, {
      cwd: tmpDir,
      encoding: "utf-8",
      env: {
        ...process.env,
        TRELLIS_VERSION_OUTPUT: trellisVersionOutput ?? "__NONE__",
        TRELLIS_CONTEXT_ID: "test-update-session",
      },
    });
  }

  function pythonFunctionBody(source: string, name: string): string {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(
      new RegExp(`def ${escapedName}\\([\\s\\S]*?\\n(?=def |# =|$)`),
    );
    return match?.[0] ?? "";
  }

  it("shows a concise update hint when trellis --version reports a newer version", () => {
    const output = runContextWithTrellisOutput(
      "0.5.0",
      "Trellis update available: 0.5.0 → 0.5.9\nRun: trellis update\n0.5.9",
    );

    expect(output).toContain("Trellis update available: 0.5.0 -> 0.5.9");
    expect(output).toContain("run trellis update");
    expect(output).not.toContain("run trellis upgrade");
    expect(output).toContain("SESSION CONTEXT");
  });

  it("does not show a hint when installed version is equal or newer", () => {
    expect(runContextWithTrellisOutput("0.5.9", "0.5.9")).not.toContain(
      "Trellis update available",
    );
    fs.rmSync(path.join(tmpDir, ".trellis", ".runtime"), {
      recursive: true,
      force: true,
    });
    expect(runContextWithTrellisOutput("0.6.0", "0.5.9")).not.toContain(
      "Trellis update available",
    );
  });

  it("silently skips the hint when trellis --version fails or version parsing fails", () => {
    expect(runContextWithTrellisOutput("0.5.0", null)).not.toContain(
      "Trellis update available",
    );
    fs.rmSync(path.join(tmpDir, ".trellis", ".runtime"), {
      recursive: true,
      force: true,
    });
    expect(runContextWithTrellisOutput("not-a-version", "0.5.9")).not.toContain(
      "Trellis update available",
    );
  });

  it("does not burn the once-per-session marker when version lookup fails", () => {
    expect(runContextWithTrellisOutput("0.5.0", null)).not.toContain(
      "Trellis update available",
    );

    const output = runContextWithTrellisOutput("0.5.0", "0.5.9");

    expect(output).toContain("Trellis update available: 0.5.0 -> 0.5.9");
  });

  it("uses the final trellis --version token when no update line is present", () => {
    const output = runContextWithTrellisOutput("0.5.0", "0.5.9");

    expect(output).toContain("Trellis update available: 0.5.0 -> 0.5.9");
  });

  it("only attempts the default text update hint once per session", () => {
    const first = runContextWithTrellisOutput("0.5.0", "0.5.9");
    const second = runContextWithTrellisOutput("0.5.0", "0.5.9");

    expect(first).toContain("Trellis update available: 0.5.0 -> 0.5.9");
    expect(second).not.toContain("Trellis update available");
    expect(
      fs.existsSync(
        path.join(
          tmpDir,
          ".trellis",
          ".runtime",
          "update-check-test-update-session.marker",
        ),
      ),
    ).toBe(true);
  });

  it("keeps the update hint out of JSON, packages, and phase paths", () => {
    expect(pythonFunctionBody(commonSessionContext, "output_text")).toContain(
      "get_update_hint",
    );
    for (const functionName of ["get_context_json", "output_json"]) {
      expect(
        pythonFunctionBody(commonSessionContext, functionName),
        `${functionName} should not check Trellis updates`,
      ).not.toContain("get_update_hint");
    }
    expect(commonGitContext).toContain('if args.mode == "packages":');
    expect(commonGitContext).toContain('elif args.mode == "phase":');
    expect(commonGitContext).toContain("else:");
    expect(commonGitContext).toContain("output_text()");
  });
});

describe("regression: issue #252 polyrepo Git context", () => {
  let tmpDir: string;
  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-polyrepo-git-"));
    const scriptsDir = path.join(tmpDir, ".trellis", "scripts");
    for (const [relativePath, content] of getAllScripts()) {
      const absPath = path.join(scriptsDir, relativePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, "utf-8");
    }
    fs.mkdirSync(path.join(tmpDir, ".trellis", "tasks"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".trellis", "workspace", "test-dev"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "custom-note"),
      "name=test-dev\n",
      "utf-8",
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfigYaml(content: string): void {
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "config.yaml"),
      content,
      "utf-8",
    );
  }

  function initChildRepo(relativePath: string, commitMessage: string): void {
    const repoPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync("git init -q", { cwd: repoPath });
    execSync("git config user.email test@example.com", { cwd: repoPath });
    execSync("git config user.name Test", { cwd: repoPath });
    fs.writeFileSync(path.join(repoPath, "README.md"), `${commitMessage}\n`);
    execSync("git add README.md", { cwd: repoPath });
    execSync(`git commit -q -m ${JSON.stringify(commitMessage)}`, {
      cwd: repoPath,
    });
  }

  function runSessionContext(kind: "text" | "record" | "json"): string {
    const runnerPath = path.join(tmpDir, "run-context.py");
    let expression = "print(session_context.get_context_text(Path.cwd()))";
    if (kind === "record") {
      expression = "print(session_context.get_context_text_record(Path.cwd()))";
    } else if (kind === "json") {
      expression =
        "print(json.dumps(session_context.get_context_json(Path.cwd())))";
    }
    fs.writeFileSync(
      runnerPath,
      [
        "import json",
        "import sys",
        "from pathlib import Path",
        "sys.path.insert(0, str(Path.cwd() / '.trellis' / 'scripts'))",
        "from common import session_context",
        expression,
        "",
      ].join("\n"),
      "utf-8",
    );
    return execSync(`${pythonCmd} ${JSON.stringify(runnerPath)}`, {
      cwd: tmpDir,
      encoding: "utf-8",
    });
  }

  it("does not render root as unknown/clean when configured package repos exist", () => {
    writeConfigYaml(
      [
        "packages:",
        "  module_a:",
        "    path: module-a",
        "    git: true",
        "",
      ].join("\n"),
    );
    initChildRepo("module-a", "init module a");

    const output = runSessionContext("text");
    const rootBlock = output.slice(
      output.indexOf("## GIT STATUS"),
      output.indexOf("## GIT STATUS (module_a: module-a)"),
    );

    expect(rootBlock).toContain("Root is not a Git repository.");
    expect(rootBlock).toContain(
      "Run Git commands from the package repository paths listed below.",
    );
    expect(rootBlock).not.toContain("Branch: unknown");
    expect(rootBlock).not.toContain("Working directory: Clean");
    expect(output).toContain("## GIT STATUS (module_a: module-a)");
    expect(output).toContain("init module a");
  });

  it("discovers unconfigured child Git repos when root is not a Git repo", () => {
    writeConfigYaml("# no packages configured\n");
    initChildRepo("module-a", "init module a");
    initChildRepo(path.join("services", "module-b"), "init module b");

    const output = runSessionContext("text");

    expect(output).toContain("Root is not a Git repository.");
    expect(output).toContain("## GIT STATUS (module-a: module-a)");
    expect(output).toContain(
      "## GIT STATUS (services_module-b: services/module-b)",
    );
    expect(output).toContain("init module a");
    expect(output).toContain("init module b");
  });

  it("skips automatic Git status when too many child repos are discovered", () => {
    writeConfigYaml("# no packages configured\n");
    for (let i = 0; i < 9; i++) {
      fs.mkdirSync(path.join(tmpDir, `repo-${i}`, ".git"), {
        recursive: true,
      });
    }

    const output = runSessionContext("text");
    const rerun = spawnSync(pythonCmd, [path.join(tmpDir, "run-context.py")], {
      cwd: tmpDir,
      encoding: "utf-8",
    });

    expect(output).not.toContain("## GIT STATUS (repo-");
    expect(rerun.status).toBe(0);
    expect(rerun.stderr).toContain("found more than 8 child Git repositories");
    expect(rerun.stderr).toContain(
      "Configure explicit packages entries with path and git: true",
    );
  });

  it("passes probe timeouts through the shared Git runner", () => {
    const runnerPath = path.join(tmpDir, "run-git-timeout.py");
    fs.writeFileSync(
      runnerPath,
      [
        "import json",
        "import subprocess",
        "import sys",
        "from pathlib import Path",
        "sys.path.insert(0, str(Path.cwd() / '.trellis' / 'scripts'))",
        "from common.git import run_git",
        "captured = {}",
        "def fake_run(*args, **kwargs):",
        "    captured['timeout'] = kwargs.get('timeout')",
        "    raise subprocess.TimeoutExpired(args[0], kwargs.get('timeout'))",
        "subprocess.run = fake_run",
        "rc, out, err = run_git(['status'], timeout=0.25)",
        "from common import session_context",
        "root_calls = []",
        "def fake_git(args, cwd=None, timeout=None):",
        "    root_calls.append({'args': args, 'timeout': timeout})",
        "    if args[:2] == ['status', '--porcelain']:",
        "        return (1, '', 'timed out')",
        "    return (0, 'true\\n' if args[0] == 'rev-parse' else '', '')",
        "session_context.run_git = fake_git",
        "root_info = session_context._collect_root_git_info(Path.cwd())",
        "print(json.dumps({'rc': rc, 'out': out, 'err': err, 'rootCalls': root_calls, 'rootInfo': root_info, **captured}))",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = JSON.parse(
      execSync(`${pythonCmd} ${JSON.stringify(runnerPath)}`, {
        cwd: tmpDir,
        encoding: "utf-8",
      }),
    ) as {
      rc: number;
      out: string;
      err: string;
      timeout: number;
      rootCalls: { args: string[]; timeout: number }[];
      rootInfo: { isClean: boolean };
    };

    expect(result).toEqual(
      expect.objectContaining({
        rc: 1,
        out: "",
        timeout: 0.25,
      }),
    );
    expect(result.err).toContain("timed out");
    expect(result.rootCalls.map((call) => call.args[0])).toEqual([
      "rev-parse",
      "branch",
      "status",
      "status",
      "log",
    ]);
    expect(result.rootCalls.every((call) => call.timeout === 2)).toBe(true);
    expect(result.rootInfo.isClean).toBe(false);
  });

  it("marks JSON root Git state as non-repo instead of clean", () => {
    writeConfigYaml(
      [
        "packages:",
        "  module_a:",
        "    path: module-a",
        "    git: true",
        "",
      ].join("\n"),
    );
    initChildRepo("module-a", "init module a");

    const context = JSON.parse(runSessionContext("json")) as {
      git: { isRepo: boolean; branch: string; isClean: boolean };
      packageGit: { name: string; path: string }[];
    };

    expect(context.git).toEqual(
      expect.objectContaining({
        isRepo: false,
        branch: "",
        isClean: false,
      }),
    );
    expect(context.packageGit).toEqual([
      expect.objectContaining({ name: "module_a", path: "module-a" }),
    ]);
  });
});

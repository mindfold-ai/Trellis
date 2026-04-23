/**
 * Integration tests for the joiner-onboarding branch of init().
 *
 * Covers the three-branch dispatch:
 *   no .trellis/                        → creator bootstrap task
 *   .trellis/ exists, .developer missing → joiner onboarding task
 *   both exist                           → no task created
 *
 * Uses the same fs-temp-dir + hoisted-mock approach as init.integration.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// === External dependency mocks (hoisted by vitest) ===

vi.mock("figlet", () => ({
  default: { textSync: vi.fn(() => "TRELLIS") },
}));

vi.mock("inquirer", () => ({
  default: { prompt: vi.fn().mockResolvedValue({}) },
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockImplementation((cmd: string) => {
    const py = process.platform === "win32" ? "python" : "python3";
    return cmd === `${py} --version` ? "Python 3.11.12" : "";
  }),
}));

// === Imports ===

import { init } from "../../src/commands/init.js";
import { DIR_NAMES, FILE_NAMES, PATHS } from "../../src/constants/paths.js";
import { execSync } from "node:child_process";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

describe("init() joiner onboarding", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-joiner-int-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.spyOn(console, "log").mockImplementation(noop);
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
    vi.mocked(execSync).mockClear();
    vi.mocked(execSync).mockImplementation(((cmd: string) => {
      const py = process.platform === "win32" ? "python" : "python3";
      return cmd === `${py} --version` ? "Python 3.11.12" : "";
    }) as typeof execSync);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Helper: simulate a fresh clone — `.trellis/` committed, `.developer` absent */
  function simulateExistingCheckout(): void {
    const workflow = path.join(tmpDir, DIR_NAMES.WORKFLOW);
    fs.mkdirSync(path.join(workflow, DIR_NAMES.TASKS), { recursive: true });
    fs.mkdirSync(path.join(workflow, DIR_NAMES.SPEC), { recursive: true });
    fs.mkdirSync(path.join(workflow, DIR_NAMES.WORKSPACE), { recursive: true });
  }

  /** Helper: simulate same-dev re-init — both `.trellis/` and `.developer` exist */
  function simulateSameDevReinit(name: string): void {
    simulateExistingCheckout();
    fs.writeFileSync(
      path.join(tmpDir, PATHS.DEVELOPER_FILE),
      `${name}\n`,
      "utf-8",
    );
  }

  it("#1 empty cwd + init → creator bootstrap task created", async () => {
    await init({ yes: true, user: "alice" });

    const bootstrap = path.join(
      tmpDir,
      PATHS.TASKS,
      "00-bootstrap-guidelines",
    );
    expect(fs.existsSync(bootstrap)).toBe(true);

    // No joiner task present
    const joiner = path.join(tmpDir, PATHS.TASKS, "00-join-alice");
    expect(fs.existsSync(joiner)).toBe(false);
  });

  it("#2 existing .trellis/ + no .developer → joiner onboarding task created", async () => {
    simulateExistingCheckout();

    await init({ yes: true, user: "bob", force: true });

    const joiner = path.join(tmpDir, PATHS.TASKS, "00-join-bob");
    expect(fs.existsSync(joiner)).toBe(true);

    const taskJson = JSON.parse(
      fs.readFileSync(path.join(joiner, FILE_NAMES.TASK_JSON), "utf-8"),
    );
    expect(taskJson.id).toBe("00-join-bob");
    expect(taskJson.name).toBe("00-join-bob");
    expect(taskJson.status).toBe("in_progress");
    expect(taskJson.dev_type).toBe("docs");
    expect(taskJson.priority).toBe("P1");
    expect(taskJson.creator).toBe("bob");
    expect(taskJson.assignee).toBe("bob");
    expect(taskJson.title).toContain("bob");

    const prd = fs.readFileSync(path.join(joiner, FILE_NAMES.PRD), "utf-8");
    // PRD is AI-facing instructions ("you (the AI) are running this task").
    // Mentions the developer in context + user-facing elements the AI should
    // reference.
    expect(prd).toContain("bob");
    expect(prd).toContain("You (the AI) are running this task");
    expect(prd).toContain("workflow.md");
    expect(prd).toContain(".trellis/spec/");
    expect(prd).toContain("00-join-bob");
    // Fallback text for empty archive
    expect(prd).toContain("archive is empty");
    const expectedPythonCmd = process.platform === "win32" ? "python" : "python3";
    expect(prd).toContain(
      `${expectedPythonCmd} ./.trellis/scripts/task.py list --assignee bob`,
    );
    expect(prd).toContain(`${expectedPythonCmd} ./.trellis/scripts/task.py finish`);
    expect(prd).toContain(
      `${expectedPythonCmd} ./.trellis/scripts/task.py archive 00-join-bob`,
    );

    // .current-task points at the joiner
    const currentTask = fs.readFileSync(
      path.join(tmpDir, PATHS.CURRENT_TASK_FILE),
      "utf-8",
    );
    expect(currentTask).toBe(`${PATHS.TASKS}/00-join-bob`);

    // Bootstrap task NOT created
    expect(
      fs.existsSync(path.join(tmpDir, PATHS.TASKS, "00-bootstrap-guidelines")),
    ).toBe(false);
  });

  it("#3 existing .trellis/ + .developer → no task created", async () => {
    simulateSameDevReinit("carol");

    await init({ yes: true, user: "carol", force: true });

    expect(
      fs.existsSync(path.join(tmpDir, PATHS.TASKS, "00-join-carol")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(tmpDir, PATHS.TASKS, "00-bootstrap-guidelines")),
    ).toBe(false);
  });

  it("#4 after joiner archive but .developer remains → no new task on re-init", async () => {
    simulateExistingCheckout();

    await init({ yes: true, user: "dave", force: true });
    const joinerPath = path.join(tmpDir, PATHS.TASKS, "00-join-dave");
    expect(fs.existsSync(joinerPath)).toBe(true);

    // Manually create the .developer file that init_developer.py would have
    // written (it's mocked in this test), then archive the joiner task.
    fs.writeFileSync(
      path.join(tmpDir, PATHS.DEVELOPER_FILE),
      "dave\n",
      "utf-8",
    );
    fs.rmSync(joinerPath, { recursive: true, force: true });

    // Re-init: should NOT recreate the joiner task
    await init({ yes: true, user: "dave", force: true });

    expect(fs.existsSync(joinerPath)).toBe(false);
  });

  it("#5a developer name with spaces → filesystem-safe slug", async () => {
    simulateExistingCheckout();

    await init({ yes: true, user: "Tao Su", force: true });

    const joiner = path.join(tmpDir, PATHS.TASKS, "00-join-tao-su");
    expect(fs.existsSync(joiner)).toBe(true);

    const taskJson = JSON.parse(
      fs.readFileSync(path.join(joiner, FILE_NAMES.TASK_JSON), "utf-8"),
    );
    expect(taskJson.creator).toBe("Tao Su");
    expect(taskJson.title).toContain("Tao Su");
  });

  it("#5b developer name with '/' → slug strips separator", async () => {
    simulateExistingCheckout();

    await init({ yes: true, user: "@org/bob", force: true });

    // slugifyDeveloperName: lowercase @org/bob → punctuation-collapsed to "org-bob"
    const joiner = path.join(tmpDir, PATHS.TASKS, "00-join-org-bob");
    expect(fs.existsSync(joiner)).toBe(true);
  });

  it("#5c developer name with Unicode letters → task dir is filesystem-safe", async () => {
    simulateExistingCheckout();

    await init({ yes: true, user: "田中 太郎", force: true });

    // Unicode letters pass through \p{Letter}, so dir name is non-empty
    const entries = fs
      .readdirSync(path.join(tmpDir, PATHS.TASKS))
      .filter((name) => name.startsWith("00-join-"));
    expect(entries).toHaveLength(1);

    const joiner = path.join(tmpDir, PATHS.TASKS, entries[0]);
    const taskJson = JSON.parse(
      fs.readFileSync(path.join(joiner, FILE_NAMES.TASK_JSON), "utf-8"),
    );
    expect(taskJson.creator).toBe("田中 太郎");
  });

  it("#6 joiner creation failure surfaces as warning, init does not crash", async () => {
    // Simulate "fresh clone" state, then set up conditions that make
    // writeTaskSkeleton's mkdirSync fail: writeFileSync for task.json can be
    // thwarted by making .trellis/tasks read-only right before dispatch,
    // but that's fragile cross-platform. A simpler approach: spy on
    // fs.writeFileSync to throw for the joiner's task.json path, forcing
    // writeTaskSkeleton's catch block to return false, which in turn triggers
    // the console.warn in the init dispatch.
    simulateExistingCheckout();

    const originalWriteFileSync = fs.writeFileSync;
    const writeSpy = vi
      .spyOn(fs, "writeFileSync")
      .mockImplementation(((
        filePath: fs.PathOrFileDescriptor,
        data: string | NodeJS.ArrayBufferView,
        options?: fs.WriteFileOptions,
      ) => {
        const pathStr = String(filePath);
        if (pathStr.includes("00-join-eve") && pathStr.endsWith("task.json")) {
          throw new Error("simulated write failure");
        }
        return originalWriteFileSync(filePath, data, options);
      }) as typeof fs.writeFileSync);

    const warnSpy = vi.spyOn(console, "warn");

    await expect(
      init({ yes: true, user: "eve", force: true }),
    ).resolves.toBeUndefined();

    expect(
      warnSpy.mock.calls.some((call) =>
        call.some(
          (arg) =>
            typeof arg === "string" &&
            arg.includes("Failed to create joiner onboarding task"),
        ),
      ),
    ).toBe(true);

    writeSpy.mockRestore();
  });

  // Tests #7/#8 cover the handleReinit path — the default flow when .trellis/
  // already exists and neither --force nor --skip-existing is passed. init()
  // routes through handleReinit() instead of the main dispatch, so joiner
  // creation is wired separately inside handleReinit's add-developer branch.
  // The earlier tests all pass force:true, which bypasses this path.

  it("#7 handleReinit path: existing .trellis/ + no .developer → joiner task created", async () => {
    simulateExistingCheckout();

    await init({ yes: true, user: "frank" });

    const joiner = path.join(tmpDir, PATHS.TASKS, "00-join-frank");
    expect(fs.existsSync(joiner)).toBe(true);

    const taskJson = JSON.parse(
      fs.readFileSync(path.join(joiner, FILE_NAMES.TASK_JSON), "utf-8"),
    );
    expect(taskJson.creator).toBe("frank");
    expect(taskJson.status).toBe("in_progress");

    const currentTask = fs.readFileSync(
      path.join(tmpDir, PATHS.CURRENT_TASK_FILE),
      "utf-8",
    );
    expect(currentTask).toBe(`${PATHS.TASKS}/00-join-frank`);
  });

  it("#8 handleReinit path: existing .trellis/ + .developer → no task created", async () => {
    simulateSameDevReinit("grace");

    await init({ yes: true, user: "grace" });

    expect(
      fs.existsSync(path.join(tmpDir, PATHS.TASKS, "00-join-grace")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(tmpDir, PATHS.TASKS, "00-bootstrap-guidelines")),
    ).toBe(false);
  });
});

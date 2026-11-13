import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkflowContract } from "@mindfoldhq/trellis-core/task/v2";

// Requires an approved core-then-CLI build before execution. This suite never
// installs dependencies or builds; source worktrees are accessed read-only.
const repository = path.resolve(import.meta.dirname, "../../../..");
const cliRoot = path.join(repository, "packages/cli");
const cliBin = path.join(cliRoot, "bin/trellis.js");
let taskRef = "";
const deliveryId = "11111111-1111-4111-8111-111111111111";
const sliceContext = "INSTALLED SELECTED DELIVERY CONTEXT";
const taskTitle = "Linked checkout installation regression";
const sessionId = "installed-worktree-session";
const contextKey = `codex_${sessionId}`;
const python = process.platform === "win32" ? "python" : "python3";

interface CurrentTaskOutput {
  current_task: {
    id: string;
    title: string;
    schema_version: "2.0";
    current_delivery: {
      kind: string;
      key: {
        task_id: string;
        lifecycle_generation: number;
        delivery_id: string;
      };
      delivery: { phase: string; planning_root: string };
    };
  } | null;
  stale: boolean;
  source: string;
  error?: unknown;
}

interface HookOutput {
  hookSpecificOutput: { additionalContext: string };
}

interface Fixture {
  primary: string;
  linked: string;
  env: NodeJS.ProcessEnv;
  offlinePreload: string;
}

let temporaryRoot: string | undefined;

function write(root: string, relative: string, content: string): void {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function run(
  fixture: Fixture,
  cwd: string,
  command: string,
  args: string[],
  options: { input?: string; session?: boolean; status?: number } = {},
): string {
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...fixture.env,
      ...(options.session ? { TRELLIS_CONTEXT_ID: contextKey } : {}),
    },
    input: options.input ?? "",
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const diagnostic =
    [command, ...args].join(" ") +
    `\ncwd=${cwd}\n${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`;
  expect(result.error, diagnostic).toBeUndefined();
  expect(result.status, diagnostic).toBe(options.status ?? 0);
  return result.stdout;
}

function cli(fixture: Fixture, cwd: string, args: string[]): string {
  // The sole external stub is fetch: update's optional npm advisory must not
  // contact the network. The installed CLI, filesystem and Git remain real.
  return run(fixture, cwd, process.execPath, [
    "--import",
    fixture.offlinePreload,
    cliBin,
    ...args,
  ]);
}

function script(
  fixture: Fixture,
  cwd: string,
  relative: string,
  args: string[] = [],
  options: { input?: string; status?: number } = {},
): string {
  return run(fixture, cwd, python, ["-B", relative, ...args], {
    ...options,
    session: true,
  });
}

function hook(fixture: Fixture, cwd: string, relative: string): string {
  const output = script(fixture, cwd, relative, [], {
    input: JSON.stringify({
      cwd,
      session_id: sessionId,
      prompt: "Continue the current task",
    }),
  });
  return (JSON.parse(output) as HookOutput).hookSpecificOutput
    .additionalContext;
}

function installedRuntime(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const visit = (relative: string): void => {
    for (const entry of fs.readdirSync(path.join(root, relative), {
      withFileTypes: true,
    })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(child);
      else files[child] = fs.readFileSync(path.join(root, child), "utf8");
    }
  };
  for (const directory of [
    ".trellis/scripts",
    ".codex/hooks",
    ".claude/hooks",
  ]) {
    visit(directory);
  }
  return files;
}

function createFixture(): Fixture {
  // Fail before allocating any fixture if the approved build is unavailable.
  expect(
    fs.existsSync(path.join(cliRoot, "dist/cli/index.js")),
    "Build core and CLI before running the installed-CLI smoke suite",
  ).toBe(true);
  temporaryRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "trellis-installed-worktree-")),
  );
  const primary = path.join(temporaryRoot, "primary checkout");
  const linked = path.join(temporaryRoot, "linked checkout");
  const home = path.join(temporaryRoot, "home");
  fs.mkdirSync(primary);
  fs.mkdirSync(home);
  fs.mkdirSync(path.join(temporaryRoot, "tmp"));
  write(temporaryRoot, "gitconfig", "");
  write(
    temporaryRoot,
    "offline.mjs",
    [
      "globalThis.fetch = async () => {",
      '  throw new Error("Network disabled in installed CLI fixture");',
      "};",
      "",
    ].join("\n"),
  );

  // Allowlist instead of spreading process.env: host session keys, project
  // redirects, shell env bridges, Git overrides and NODE_OPTIONS cannot leak.
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "PATH",
    "Path",
    "SYSTEMROOT",
    "SystemRoot",
    "WINDIR",
    "PATHEXT",
  ]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    CODEX_HOME: path.join(home, ".codex"),
    CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
    TMPDIR: path.join(temporaryRoot, "tmp"),
    TMP: path.join(temporaryRoot, "tmp"),
    TEMP: path.join(temporaryRoot, "tmp"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: path.join(temporaryRoot, "gitconfig"),
    GIT_CONFIG_COUNT: "3",
    GIT_CONFIG_KEY_0: "core.hooksPath",
    GIT_CONFIG_VALUE_0: path.join(temporaryRoot, "empty-hooks"),
    GIT_CONFIG_KEY_1: "commit.gpgsign",
    GIT_CONFIG_VALUE_1: "false",
    GIT_CONFIG_KEY_2: "core.autocrlf",
    GIT_CONFIG_VALUE_2: "false",
    GIT_TERMINAL_PROMPT: "0",
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
    TRELLIS_QUIET: "1",
    NO_COLOR: "1",
  });
  const fixture = {
    primary,
    linked,
    env,
    offlinePreload: path.join(temporaryRoot, "offline.mjs"),
  };
  run(fixture, primary, "git", [
    "init",
    "--initial-branch=main",
    "--template=",
  ]);
  run(fixture, primary, "git", ["config", "user.name", "Installation Fixture"]);
  run(fixture, primary, "git", [
    "config",
    "user.email",
    "fixture@example.invalid",
  ]);
  cli(fixture, primary, [
    "init",
    "--yes",
    "--codex",
    "--claude",
    "--no-monorepo",
  ]);
  return fixture;
}

function prepareLinkedTask(fixture: Fixture): void {
  // A1: establish this identity in primary before creating its linked worktree.
  expect(
    hook(fixture, fixture.primary, ".codex/hooks/session-start.py"),
  ).toContain("Status: NO ACTIVE TASK");
  run(fixture, fixture.primary, "git", ["add", "."]);
  run(fixture, fixture.primary, "git", [
    "commit",
    "-m",
    "Seed isolated Trellis installation",
  ]);
  run(fixture, fixture.primary, "git", [
    "worktree",
    "add",
    "-b",
    "fixture-linked",
    fixture.linked,
  ]);
  // Exercise the actual fresh default's creator, with no schema/workflow flags.
  taskRef = script(fixture, fixture.linked, ".trellis/scripts/task.py", [
    "create",
    taskTitle,
    "--description",
    "Installed runtime resolves this linked-worktree task from primary",
    "--slug",
    "installed-binding",
    "--task-id",
    "installed-binding",
    "--no-start",
  ]).trim();
  const recordPath = path.join(fixture.linked, taskRef, "task.json");
  const taskOnlyBytes = fs.readFileSync(recordPath, "utf8");
  expect(JSON.parse(taskOnlyBytes)).toMatchObject({
    schema_version: "2.0",
    accepted_scope: null,
    deliveries: [],
    completion_results: [],
    closure_results: [],
  });
  expect(JSON.parse(taskOnlyBytes)).not.toHaveProperty("status");
  expect(fs.existsSync(path.join(fixture.primary, taskRef))).toBe(false);
  script(fixture, fixture.linked, ".trellis/scripts/task.py", [
    "start",
    taskRef,
  ]);
  expect(fs.readFileSync(recordPath, "utf8")).toBe(taskOnlyBytes);
  expect(
    JSON.parse(
      script(fixture, fixture.primary, ".trellis/scripts/delivery.py", [
        "current",
        "--json",
      ]),
    ),
  ).toMatchObject({
    kind: "no_current_delivery",
    key: { task_id: "installed-binding", lifecycle_generation: 0 },
  });

  // Use the installed declaration's owners and real operation entry, rather
  // than seed a phase or infer the bootstrap Delivery from inventory.
  const contract = JSON.parse(
    script(fixture, fixture.linked, ".trellis/scripts/get_context.py", [
      "--mode",
      "runtime-contract",
    ]),
  ) as WorkflowContract;
  const authorityContent =
    "# Whole Task scope\n\nR1: Resolve the linked Task and its separate Delivery.\n";
  write(fixture.linked, `${taskRef}/prd.md`, authorityContent);
  const authority = {
    locator: `${taskRef}/prd.md`,
    revision: `sha256:${createHash("sha256").update(authorityContent).digest("hex")}`,
  };
  const taskKey = { task_id: "installed-binding", lifecycle_generation: 0 };
  script(fixture, fixture.linked, ".trellis/scripts/delivery.py", [
    "apply",
    "--task",
    taskRef,
    "--input",
    JSON.stringify({
      api_version: "1.0",
      operation: "accept_scope",
      key: taskKey,
      owner_role: "task_scope",
      owner_id: contract.owners.task_scope,
      authority,
    }),
  ]);
  script(fixture, fixture.linked, ".trellis/scripts/delivery.py", [
    "apply",
    "--task",
    taskRef,
    "--input",
    JSON.stringify({
      api_version: "1.0",
      operation: "create_delivery",
      key: { ...taskKey, delivery_id: deliveryId },
      owner_role: "creation",
      owner_id: contract.owners.creation,
      scope_ref: { authority, anchors: ["R1"] },
      profile: "manual",
    }),
  ]);
  const planning = `${taskRef}/deliveries/${deliveryId}`;
  write(fixture.linked, `${planning}/prd.md`, `# ${sliceContext}\n`);
  for (const manifest of ["implement.jsonl", "check.jsonl"]) {
    write(
      fixture.linked,
      `${planning}/${manifest}`,
      JSON.stringify({
        file: `${planning}/prd.md`,
        reason: "Installed-worktree smoke requirements",
      }) + "\n",
    );
  }
  script(fixture, fixture.linked, ".trellis/scripts/delivery.py", [
    "select",
    "--task",
    taskRef,
    "--delivery",
    deliveryId,
  ]);
}

function assertPrimaryConsumers(fixture: Fixture): void {
  const current = JSON.parse(
    script(fixture, fixture.primary, ".trellis/scripts/task.py", [
      "current",
      "--json",
    ]),
  ) as CurrentTaskOutput;
  expect(current).toMatchObject({
    current_task: {
      id: "installed-binding",
      title: taskTitle,
      schema_version: "2.0",
      current_delivery: {
        kind: "current",
        key: {
          task_id: "installed-binding",
          lifecycle_generation: 0,
          delivery_id: deliveryId,
        },
        delivery: {
          phase: "planning",
          planning_root: `deliveries/${deliveryId}`,
        },
      },
    },
    stale: false,
  });
  expect(current.current_task).not.toHaveProperty("status");
  const context = JSON.parse(
    script(fixture, fixture.primary, ".trellis/scripts/get_context.py", [
      "--json",
    ]),
  ) as {
    currentTask: { path: string; contextKey: string } | null;
    currentDelivery: {
      kind: string;
      key: { delivery_id: string };
      delivery: { phase: string };
    };
  };
  expect(context.currentTask).toMatchObject({ path: taskRef, contextKey });
  expect(context.currentDelivery).toMatchObject({
    kind: "current",
    key: { delivery_id: deliveryId },
    delivery: { phase: "planning" },
  });
  for (const platform of ["codex", "claude"]) {
    const session = hook(
      fixture,
      fixture.primary,
      `.${platform}/hooks/session-start.py`,
    );
    expect(session).toContain("Delivery query:");
    expect(session).toContain(deliveryId);
    expect(session).toContain('"phase": "planning"');
    expect(session).not.toContain("Status: IN_PROGRESS");
    const workflow = hook(
      fixture,
      fixture.primary,
      `.${platform}/hooks/inject-workflow-state.py`,
    );
    expect(workflow).toContain("<workflow-state>");
    expect(workflow).toContain("Task: installed-binding (planning)");
    expect(workflow).not.toContain("Status: no_task");
    const injection = script(
      fixture,
      fixture.primary,
      `.${platform}/hooks/inject-subagent-context.py`,
      [],
      {
        input: JSON.stringify(
          platform === "codex"
            ? {
                cwd: fixture.primary,
                session_id: sessionId,
                hook_event_name: "SubagentStart",
                agent_type: "trellis-implement",
              }
            : {
                cwd: fixture.primary,
                session_id: sessionId,
                tool_name: "Task",
                tool_input: {
                  subagent_type: "trellis-implement",
                  prompt: "Inspect selected slice",
                },
              },
        ),
      },
    );
    expect(injection).toContain(sliceContext);
    expect(injection).not.toContain("missing_current_delivery");
  }
}

afterEach(() => {
  // All registrations and commits live under this suite-owned common Git dir.
  // Removing this parent cannot unregister or remove a source worktree.
  if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

describe("installed CLI cross-worktree update smoke", () => {
  it("current installation resolves linked tasks after repeated same-version updates", () => {
    const packagePaths = [
      "packages/cli/package.json",
      "packages/core/package.json",
    ];
    const versions = packagePaths.map((file) => {
      const contents = fs.readFileSync(path.join(repository, file), "utf8");
      return {
        contents,
        version: (JSON.parse(contents) as { version: string }).version,
      };
    });
    const fixture = createFixture();
    const freshRuntime = installedRuntime(fixture.primary);
    expect(
      Object.keys(freshRuntime).some((file) => file.endsWith(".new")),
    ).toBe(false);
    expect(cli(fixture, fixture.primary, ["--version"]).trim()).toBe(
      versions[0].version,
    );
    prepareLinkedTask(fixture);

    assertPrimaryConsumers(fixture);

    const taskBefore = fs.readFileSync(
      path.join(fixture.linked, taskRef, "task.json"),
      "utf8",
    );
    // Prove update repairs managed files, not just an already-current install.
    for (const root of [fixture.primary, fixture.linked]) {
      write(root, ".codex/hooks/session-start.py", "# obsolete managed hook\n");
      // Keep Delivery capability-probe dependencies executable; removing the
      // shared session resolver would correctly reject update before writes.
      fs.unlinkSync(
        path.join(root, ".trellis/scripts/common/task_queue.py"),
      );
      expect(installedRuntime(root)).not.toEqual(freshRuntime);
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const root of [fixture.primary, fixture.linked]) {
        cli(fixture, root, ["update", "--force"]);
        expect(installedRuntime(root)).toEqual(freshRuntime);
        expect(
          fs.readFileSync(path.join(root, ".trellis/.version"), "utf8").trim(),
        ).toBe(versions[0].version);
      }
      assertPrimaryConsumers(fixture);
      expect(
        fs.readFileSync(
          path.join(fixture.linked, taskRef, "task.json"),
          "utf8",
        ),
      ).toBe(taskBefore);
    }
    script(fixture, fixture.primary, ".trellis/scripts/task.py", ["finish"]);
    for (let read = 0; read < 2; read++) {
      for (const root of [fixture.primary, fixture.linked]) {
        const cleared = JSON.parse(
          script(
            fixture,
            root,
            ".trellis/scripts/task.py",
            ["current", "--json"],
            { status: 1 },
          ),
        ) as CurrentTaskOutput;
        expect(cleared.current_task).toBeNull();
        expect(cleared.stale).toBe(false);
        expect(cleared.error).toBeUndefined();
        expect(cleared.source).toBe("none");
      }
    }
    for (const [index, file] of packagePaths.entries()) {
      expect(fs.readFileSync(path.join(repository, file), "utf8")).toBe(
        versions[index].contents,
      );
    }
  }, 180_000);
});

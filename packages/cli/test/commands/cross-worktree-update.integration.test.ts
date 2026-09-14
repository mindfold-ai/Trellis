import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

// Requires an approved core-then-CLI build before execution. This suite never
// installs dependencies or builds; source worktrees are accessed read-only.
const repository = path.resolve(import.meta.dirname, "../../../..");
const cliRoot = path.join(repository, "packages/cli");
const cliBin = path.join(cliRoot, "bin/trellis.js");
const taskRef = ".trellis/tasks/09-14-installed-binding";
const taskTitle = "Linked checkout installation regression";
const sessionId = "installed-worktree-session";
const contextKey = `codex_${sessionId}`;
const python = process.platform === "win32" ? "python" : "python3";

interface CurrentTaskOutput {
  current_task: { id: string; title: string; status: string } | null;
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
  const diagnostic = [command, ...args].join(" ") +
    `\ncwd=${cwd}\n${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`;
  expect(result.error, diagnostic).toBeUndefined();
  expect(result.status, diagnostic).toBe(options.status ?? 0);
  return result.stdout;
}

function cli(fixture: Fixture, cwd: string, args: string[]): string {
  // The sole external stub is fetch: update's optional npm advisory must not
  // contact the network. The installed CLI, filesystem and Git remain real.
  return run(fixture, cwd, process.execPath, [
    "--import", fixture.offlinePreload, cliBin, ...args,
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
  return (JSON.parse(output) as HookOutput).hookSpecificOutput.additionalContext;
}

function installedRuntime(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const visit = (relative: string): void => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(child);
      else files[child] = fs.readFileSync(path.join(root, child), "utf8");
    }
  };
  for (const directory of [".trellis/scripts", ".codex/hooks", ".claude/hooks"]) {
    visit(directory);
  }
  return files;
}

function createFixture(): Fixture {
  // Fail before allocating any fixture if the approved build is unavailable.
  expect(fs.existsSync(path.join(cliRoot, "dist/cli/index.js")),
    "Build core and CLI before running the installed-CLI smoke suite").toBe(true);
  temporaryRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "trellis-installed-worktree-")));
  const primary = path.join(temporaryRoot, "primary checkout");
  const linked = path.join(temporaryRoot, "linked checkout");
  const home = path.join(temporaryRoot, "home");
  fs.mkdirSync(primary);
  fs.mkdirSync(home);
  fs.mkdirSync(path.join(temporaryRoot, "tmp"));
  write(temporaryRoot, "gitconfig", "");
  write(temporaryRoot, "offline.mjs", [
    "globalThis.fetch = async () => {",
    '  throw new Error("Network disabled in installed CLI fixture");',
    "};",
    "",
  ].join("\n"));

  // Allowlist instead of spreading process.env: host session keys, project
  // redirects, shell env bridges, Git overrides and NODE_OPTIONS cannot leak.
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "Path", "SYSTEMROOT", "SystemRoot", "WINDIR", "PATHEXT"]) {
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
  const fixture = { primary, linked, env, offlinePreload: path.join(temporaryRoot, "offline.mjs") };
  run(fixture, primary, "git", ["init", "--initial-branch=main", "--template="]);
  run(fixture, primary, "git", ["config", "user.name", "Installation Fixture"]);
  run(fixture, primary, "git", ["config", "user.email", "fixture@example.invalid"]);
  cli(fixture, primary, [
    "init", "--yes", "--codex", "--claude", "--no-monorepo",
    "--creator", "fixture-creator", "--assignee", "fixture-owner",
  ]);
  return fixture;
}

function prepareLinkedTask(fixture: Fixture): void {
  // A1: establish this identity in primary before creating its linked worktree.
  expect(hook(fixture, fixture.primary, ".codex/hooks/session-start.py"))
    .toContain("Status: NO ACTIVE TASK");
  run(fixture, fixture.primary, "git", ["add", "."]);
  run(fixture, fixture.primary, "git", ["commit", "-m", "Seed isolated Trellis installation"]);
  run(fixture, fixture.primary, "git", [
    "worktree", "add", "-b", "fixture-linked", fixture.linked,
  ]);
  write(fixture.linked, `${taskRef}/task.json`, JSON.stringify({
    id: "installed-binding",
    title: taskTitle,
    description: "Installed runtime resolves this linked-worktree task from primary",
    status: "planning",
    creator: "fixture-creator",
    assignee: "fixture-owner",
  }));
  write(fixture.linked, `${taskRef}/prd.md`, "# Installed binding\n\nResolve the linked task.\n");
  for (const manifest of ["implement.jsonl", "check.jsonl"]) {
    write(fixture.linked, `${taskRef}/${manifest}`, JSON.stringify({
      file: `${taskRef}/prd.md`, reason: "Installed-worktree smoke requirements",
    }) + "\n");
  }
  expect(fs.existsSync(path.join(fixture.primary, taskRef))).toBe(false);
  script(fixture, fixture.linked, ".trellis/scripts/task.py", ["start", taskRef]);
}

function assertPrimaryConsumers(fixture: Fixture): void {
  const current = JSON.parse(script(fixture, fixture.primary,
    ".trellis/scripts/task.py", ["current", "--json"])) as CurrentTaskOutput;
  expect(current).toMatchObject({
    current_task: { id: "installed-binding", title: taskTitle, status: "in_progress" },
    stale: false,
  });
  const context = JSON.parse(script(fixture, fixture.primary,
    ".trellis/scripts/get_context.py", ["--json"])) as {
      currentTask: { path: string; contextKey: string } | null;
    };
  expect(context.currentTask).toMatchObject({ path: taskRef, contextKey });
  for (const platform of ["codex", "claude"]) {
    const session = hook(fixture, fixture.primary, `.${platform}/hooks/session-start.py`);
    expect(session).toContain(`Task: ${taskTitle}`);
    expect(session).toContain("Status: IN_PROGRESS");
    const workflow = hook(fixture, fixture.primary, `.${platform}/hooks/inject-workflow-state.py`);
    expect(workflow).toContain("<workflow-state>");
    expect(workflow).toContain("Task: installed-binding (in_progress)");
    expect(workflow).not.toContain("Status: no_task");
  }
}

afterEach(() => {
  // All registrations and commits live under this suite-owned common Git dir.
  // Removing this parent cannot unregister or remove a source worktree.
  if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

describe("installed CLI cross-worktree update smoke", () => {
  it.each(["fresh", "legacy"] as const)(
    "%s installation resolves linked tasks after repeated same-version updates",
    (mode) => {
      const packagePaths = ["packages/cli/package.json", "packages/core/package.json"];
      const versions = packagePaths.map((file) => {
        const contents = fs.readFileSync(path.join(repository, file), "utf8");
        return { contents, version: (JSON.parse(contents) as { version: string }).version };
      });
      const fixture = createFixture();
      const freshRuntime = installedRuntime(fixture.primary);
      expect(Object.keys(freshRuntime).some((file) => file.endsWith(".new"))).toBe(false);
      expect(cli(fixture, fixture.primary, ["--version"]).trim()).toBe(versions[0].version);
      prepareLinkedTask(fixture);

      const legacyFile = path.join(fixture.linked, ".trellis/.runtime/sessions", `${contextKey}.json`);
      let legacyBytes: string | undefined;
      if (mode === "legacy") {
        // Seed the historical storage format without requiring old Git objects
        // that are absent in shallow CI clones. Runtime membership stays real.
        write(fixture.linked, `.trellis/.runtime/sessions/${contextKey}.json`,
          JSON.stringify({ current_task: taskRef, platform: "codex", current_run: null }));
        fs.unlinkSync(path.join(fixture.primary, ".git/trellis/sessions", `${contextKey}.json`));
        legacyBytes = fs.readFileSync(legacyFile, "utf8");
        expect(JSON.parse(legacyBytes)).toMatchObject({ current_task: taskRef });
      }
      assertPrimaryConsumers(fixture);

      const taskBefore = fs.readFileSync(path.join(fixture.linked, taskRef, "task.json"), "utf8");
      // Prove update repairs managed files, not just an already-current install.
      for (const root of [fixture.primary, fixture.linked]) {
        write(root, ".codex/hooks/session-start.py", "# obsolete managed hook\n");
        fs.unlinkSync(path.join(root, ".trellis/scripts/common/session_storage.py"));
        expect(installedRuntime(root)).not.toEqual(freshRuntime);
      }
      for (let pass = 0; pass < 2; pass++) {
        for (const root of [fixture.primary, fixture.linked]) {
          cli(fixture, root, ["update", "--force"]);
          expect(installedRuntime(root)).toEqual(freshRuntime);
          expect(fs.readFileSync(path.join(root, ".trellis/.version"), "utf8").trim())
            .toBe(versions[0].version);
        }
        assertPrimaryConsumers(fixture);
        expect(fs.readFileSync(path.join(fixture.linked, taskRef, "task.json"), "utf8"))
          .toBe(taskBefore);
        if (legacyBytes !== undefined) {
          // Upgrade and hook reads must not lazily promote or rewrite legacy ownership.
          expect(fs.readFileSync(legacyFile, "utf8")).toBe(legacyBytes);
          expect(fs.existsSync(path.join(fixture.primary,
            ".git/trellis/sessions", `${contextKey}.json`))).toBe(false);
        }
      }
      script(fixture, fixture.primary, ".trellis/scripts/task.py", ["finish"]);
      for (let read = 0; read < 2; read++) {
        for (const root of [fixture.primary, fixture.linked]) {
          const cleared = JSON.parse(script(fixture, root,
            ".trellis/scripts/task.py", ["current", "--json"], { status: 1 })) as CurrentTaskOutput;
          expect(cleared.current_task).toBeNull();
          expect(cleared.stale).toBe(false);
          expect(cleared.error).toBeUndefined();
          expect(cleared.source).toBe("none");
        }
      }
      if (mode === "legacy") expect(fs.existsSync(legacyFile)).toBe(false);
      for (const [index, file] of packagePaths.entries()) {
        expect(fs.readFileSync(path.join(repository, file), "utf8")).toBe(versions[index].contents);
      }
    },
    180_000,
  );
});

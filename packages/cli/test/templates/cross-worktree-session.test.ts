import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const templates = path.resolve(import.meta.dirname, "../../src/templates");
let sandbox: string;
let primary: string;
let linked: string;
let env: NodeJS.ProcessEnv;

function run(executable: string, args: string[], cwd = primary, input?: string) {
  return spawnSync(executable, args, { cwd, env, input, encoding: "utf8", timeout: 30_000 });
}
function git(...args: string[]): void {
  const result = run("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args]);
  expect(result.status, result.stderr).toBe(0);
}
function write(root: string, name: string, content: string): void {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function hook(relative: string, root = primary): string {
  const result = run("python3", ["-B", path.join(root, relative)], root,
    JSON.stringify({ cwd: root, session_id: "cross-hook", platform: "codex", prompt: "continue" }));
  expect(result.status, result.stderr).toBe(0);
  const output = JSON.parse(result.stdout) as { hookSpecificOutput: { additionalContext: string } };
  return output.hookSpecificOutput.additionalContext;
}

beforeEach(() => {
  sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "trellis-cross-hooks-")));
  primary = path.join(sandbox, "primary");
  linked = path.join(sandbox, "linked space");
  fs.mkdirSync(primary);
  env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    ["PATH", "Path", "SYSTEMROOT", "SystemRoot", "WINDIR", "PATHEXT"].includes(key),
  ));
  Object.assign(env, {
    HOME: sandbox, USERPROFILE: sandbox, GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: path.join(sandbox, "absent-gitconfig"),
    GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath",
    GIT_CONFIG_VALUE_0: path.join(sandbox, "empty-hooks"),
    PYTHONNOUSERSITE: "1",
  });
  env.CODEX_THREAD_ID = "cross-hook";
  env.PYTHONDONTWRITEBYTECODE = "1";
  fs.cpSync(path.join(templates, "trellis/scripts"), path.join(primary, ".trellis/scripts"), { recursive: true });
  write(primary, ".trellis/config.yaml", "task_auto_commit: false\n");
  for (const [source, destination] of [
    ["codex/hooks/session-start.py", ".codex/hooks/session-start.py"],
    ["copilot/hooks/session-start.py", ".github/hooks/session-start.py"],
    ["shared-hooks/session-start.py", ".claude/hooks/session-start.py"],
    ["shared-hooks/inject-workflow-state.py", ".codex/hooks/inject-workflow-state.py"],
    ["shared-hooks/inject-subagent-context.py", ".codex/hooks/inject-subagent-context.py"],
  ]) {
    write(primary, destination, fs.readFileSync(path.join(templates, source), "utf8"));
  }
  write(primary, ".trellis/workflow.md", "# Workflow\n## Phase Index\nPrimary-only workflow\n## Phase 1: Plan\n[workflow-state:in_progress]\nPRIMARY-WORKFLOW\n[/workflow-state:in_progress]\n[workflow-state:no_task]\nNO-TASK\n[/workflow-state:no_task]\n");
  git("init", "-q");
  git("add", ".");
  git("commit", "-qm", "Fixture runtime");
  // The exact identity already exists at the caller before the worktree does.
  const absent = run("python3", ["-B", ".trellis/scripts/task.py", "current", "--json"]);
  expect(absent.status).toBe(1);
  git("worktree", "add", "--detach", linked, "HEAD");
  write(linked, ".trellis/workflow.md", "# Workflow\n## Phase Index\nLinked-only workflow\n## Phase 1: Plan\n[workflow-state:in_progress]\nLINKED-WORKFLOW\n[/workflow-state:in_progress]\n");
  write(linked, ".trellis/tasks/cross/task.json", JSON.stringify({ id: "cross", name: "cross", title: "Linked task title", description: "Fixture", status: "planning", creator: "fixture", assignee: "fixture" }));
  write(linked, ".trellis/tasks/cross/prd.md", "Linked task requirements\n");
  for (const name of ["implement", "check"]) {
    write(linked, `.trellis/tasks/cross/${name}.jsonl`, `${JSON.stringify({ file: ".trellis/tasks/cross/prd.md", reason: "Fixture requirement" })}\n`);
  }
  const started = run("python3", ["-B", ".trellis/scripts/task.py", "start", ".trellis/tasks/cross"], linked);
  expect(started.status, started.stdout + started.stderr).toBe(0);
});
afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe("cross-worktree installed hook entrypoints", () => {
  it("Codex SessionStart uses linked task metadata and workflow from primary", () => {
    const text = hook(".codex/hooks/session-start.py");
    expect(text).toContain("Linked task title");
    expect(text).toContain("IN_PROGRESS");
    expect(text).not.toContain("NO ACTIVE TASK");
    expect(text).toContain("Linked-only workflow");
    expect(text).not.toContain("Primary-only workflow");
  });

  it("UserPromptSubmit resolves linked workflow and reports corrupt binding explicitly", () => {
    const text = hook(".codex/hooks/inject-workflow-state.py");
    expect(text).toContain("in_progress");
    expect(text).toContain("LINKED-WORKFLOW");
    expect(text).not.toContain("PRIMARY-WORKFLOW");
    write(primary, ".git/trellis/sessions/codex_cross-hook.json", "{broken");
    const invalid = hook(".codex/hooks/inject-workflow-state.py");
    expect(invalid).toMatch(/error|stale|invalid/i);
    expect(invalid).not.toContain("Status: no_task");
  });

  it.each([".claude/hooks/session-start.py", ".github/hooks/session-start.py"])(
    "%s uses the same explicit session binding across worktrees", (entry) => {
      env.TRELLIS_CONTEXT_ID = "codex_cross-hook";
      const text = hook(entry);
      expect(text).toContain("Linked task title");
      expect(text).not.toContain("NO ACTIVE TASK");
    },
  );

  it("OpenCode reads the shared schema without accepting another session on a key miss", () => {
    // Explicit override names the Python-written binding; no path helper is mocked.
    env.TRELLIS_CONTEXT_ID = "codex_cross-hook";
    const code = `
import { pathToFileURL } from 'node:url';
const { TrellisContext } = await import(pathToFileURL(process.argv[1]));
const ctx = new TrellisContext(process.argv[2]);
const active = ctx.getActiveTask({sessionID:'cross-hook'});
console.log(JSON.stringify(active));
delete process.env.TRELLIS_CONTEXT_ID;
console.log(JSON.stringify(ctx.getActiveTask({sessionID:'different-session'})));
`;
    const result = run(process.execPath, ["--input-type=module", "-e", code, path.join(templates, "opencode/lib/trellis-context.js"), primary]);
    expect(result.status, result.stderr).toBe(0);
    const [active, missing] = result.stdout.trim().split("\n").map((line) => JSON.parse(line) as {
      taskPath: string | null; taskWorkspaceRoot: string | null; resolvedTaskPath: string | null; stale: boolean;
    });
    expect(active.taskPath).toBe(".trellis/tasks/cross");
    expect(active.taskWorkspaceRoot).toBe(linked);
    expect(active.resolvedTaskPath).toBe(path.join(linked, ".trellis/tasks/cross"));
    expect(active.stale).toBe(false);
    expect(missing.taskPath).toBeNull();
  });

  it("native Codex SubagentStart loads linked-only manifest content", () => {
    write(primary, ".trellis/spec/fixture.md", "PRIMARY-MANIFEST-CONTENT\n");
    write(linked, ".trellis/spec/fixture.md", "LINKED-MANIFEST-CONTENT\n");
    write(linked, ".trellis/tasks/cross/implement.jsonl", `${JSON.stringify({ file: ".trellis/spec/fixture.md", reason: "Workspace-specific guideline" })}\n`);
    const result = run("python3", ["-B", ".codex/hooks/inject-subagent-context.py"], primary,
      JSON.stringify({ cwd: primary, session_id: "cross-hook", hook_event_name: "SubagentStart", agent_type: "trellis-implement" }));
    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout) as { hookSpecificOutput: { additionalContext: string } };
    expect(output.hookSpecificOutput.additionalContext).toContain("LINKED-MANIFEST-CONTENT");
    expect(output.hookSpecificOutput.additionalContext).not.toContain("PRIMARY-MANIFEST-CONTENT");
  });

  it("OpenCode workflow callback injects linked workflow into the model message", () => {
    env.TRELLIS_CONTEXT_ID = "codex_cross-hook";
    const code = `
import { pathToFileURL } from 'node:url';
const { default: plugin } = await import(pathToFileURL(process.argv[1]));
const hooks = await plugin({directory:process.argv[2]});
const output = {messages:[{info:{role:'user',sessionID:'cross-hook',agent:'build'},parts:[{type:'text',text:'continue'}]}]};
await hooks['experimental.chat.messages.transform']({},output);
console.log(JSON.stringify(output));
`;
    const result = run(process.execPath, ["--input-type=module", "-e", code, path.join(templates, "opencode/plugins/inject-workflow-state.js"), primary]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("LINKED-WORKFLOW");
    expect(result.stdout).not.toContain("PRIMARY-WORKFLOW");
    expect(result.stdout).not.toContain("Status: no_task");
  });
});

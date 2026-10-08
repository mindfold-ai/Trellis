import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task";

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
  write(primary, ".trellis/workflow.md", "# Workflow\n## Phase Index\nPrimary-only workflow\n## Phase 1: Plan\n[workflow-state:in_progress]\nPRIMARY-WORKFLOW\n[/workflow-state:in_progress]\n[workflow-state:no_task]\nNO-TASK\n[/workflow-state:no_task]\n[trellis-continuation]\nPRIMARY-CONTINUATION\n[/trellis-continuation]\n");
  git("init", "-q");
  git("add", ".");
  git("commit", "-qm", "Fixture runtime");
  // The exact identity already exists at the caller before the worktree does.
  const absent = run("python3", ["-B", ".trellis/scripts/task.py", "current", "--json"]);
  expect(absent.status).toBe(1);
  git("worktree", "add", "--detach", linked, "HEAD");
  write(linked, ".trellis/workflow.md", "# Workflow\n## Phase Index\nLinked-only workflow\n## Phase 1: Plan\n[workflow-state:in_progress]\nLINKED-WORKFLOW\n[/workflow-state:in_progress]\n[trellis-continuation]\nLINKED-CONTINUATION\n[/trellis-continuation]\n");
  write(linked, ".trellis/tasks/cross/task.json", JSON.stringify(emptyTaskRecord({ id: "cross", name: "cross", title: "Linked task title", description: "Fixture", status: "planning" })));
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
  it("resolves a retained old checkout through the current task branch binding", () => {
    const source = path.join(linked, ".trellis/tasks/cross/task.json");
    write(primary, ".trellis/tasks/cross/task.json", fs.readFileSync(source, "utf8"));
    const switched = run("git", ["-C", linked, "switch", "-q", "-c", "current-task"]);
    expect(switched.status, switched.stderr).toBe(0);
    const common = run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    expect(common.status, common.stderr).toBe(0);
    const binding = path.join(common.stdout.trim(), "trellis/task-branches/cross/0.json");
    fs.mkdirSync(path.dirname(binding), { recursive: true });
    fs.writeFileSync(binding, JSON.stringify({
      schema_version: "1.0", task_id: "cross", lifecycle_generation: 0,
      binding_revision: 1, branch_name: "current-task",
    }));

    const current = run("python3", ["-B", ".trellis/scripts/get_context.py", "--json"]);
    expect(current.status, current.stderr).toBe(0);
    expect(JSON.parse(current.stdout).currentTask.taskWorkspaceRoot).toBe(linked);

    fs.writeFileSync(binding, JSON.stringify({
      schema_version: "1.0", task_id: "cross", lifecycle_generation: 0,
      binding_revision: 2, branch_name: "missing-task-branch",
    }));
    const missing = run("python3", ["-B", ".trellis/scripts/get_context.py", "--mode", "phase"]);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("current_task_checkout_unresolved");

    fs.writeFileSync(binding, JSON.stringify({
      schema_version: "1.0", task_id: "cross", lifecycle_generation: 0,
      binding_epoch: 1, binding_revision: 2, branch_name: "current-task",
    }));
    const retired = run("python3", ["-B", ".trellis/scripts/get_context.py", "--mode", "phase"]);
    expect(retired.status).not.toBe(0);
    expect(retired.stderr).toContain("invalid_task_branch_binding");
  });

  it("requires branch establishment when a Guru task loses its binding after rebind", () => {
    const source = path.join(linked, ".trellis/tasks/cross/task.json");
    write(primary, ".trellis/tasks/cross/task.json", fs.readFileSync(source, "utf8"));
    write(primary, ".trellis/guru-team/extension.json", "{}\n");
    const switched = run("git", ["-C", linked, "switch", "-q", "-c", "current-task"]);
    expect(switched.status, switched.stderr).toBe(0);
    const common = run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    expect(common.status, common.stderr).toBe(0);
    const binding = path.join(common.stdout.trim(), "trellis/task-branches/cross/0.json");
    fs.mkdirSync(path.dirname(binding), { recursive: true });
    fs.writeFileSync(binding, JSON.stringify({
      schema_version: "1.0", task_id: "cross", lifecycle_generation: 0,
      binding_revision: 1, branch_name: "current-task",
    }));
    const current = run("python3", ["-B", ".trellis/scripts/get_context.py", "--json"]);
    expect(current.status, current.stderr).toBe(0);
    expect(JSON.parse(current.stdout).currentTask.taskWorkspaceRoot).toBe(linked);

    fs.unlinkSync(binding);
    const missing = run("python3", ["-B", ".trellis/scripts/get_context.py", "--mode", "phase"]);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("binding_required");
  });

  it("resolves a merged active task in the invoking checkout without borrowing another copy", () => {
    const source = path.join(linked, ".trellis/tasks/cross/task.json");
    write(primary, ".trellis/tasks/cross/task.json", fs.readFileSync(source, "utf8"));
    for (const [workspace, expected] of [[primary, primary], [linked, linked]]) {
      const result = run("python3", ["-B", ".trellis/scripts/get_context.py", "--json"], workspace);
      expect(result.status, result.stderr).toBe(0);
      const current = JSON.parse(result.stdout) as { currentTask: { taskWorkspaceRoot: string } };
      expect(current.currentTask.taskWorkspaceRoot).toBe(expected);
    }
    env.TRELLIS_CONTEXT_ID = "codex_cross-hook";
    const code = `
import { pathToFileURL } from 'node:url';
const { TrellisContext } = await import(pathToFileURL(process.argv[1]));
console.log(JSON.stringify(new TrellisContext(process.argv[2]).getActiveTask({sessionID:'cross-hook'})));
`;
    for (const workspace of [primary, linked]) {
      const result = run(process.execPath, ["--input-type=module", "-e", code, path.join(templates, "opencode/lib/trellis-context.js"), workspace]);
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).taskWorkspaceRoot).toBe(workspace);
    }
  });

  it("rejects an explicit nonlocal duplicate before changing the session binding", () => {
    const source = path.join(linked, ".trellis/tasks/cross/task.json");
    write(primary, ".trellis/tasks/cross/task.json", fs.readFileSync(source, "utf8"));
    const attempt = run("python3", ["-B", "-c", `
from pathlib import Path
import sys
sys.path.insert(0, '.trellis/scripts')
from common.active_task import set_active_task
set_active_task(sys.argv[1], Path.cwd())
`, path.join(linked, ".trellis/tasks/cross")]);
    expect(attempt.status).not.toBe(0);
    expect(attempt.stderr).toContain("explicit target cannot be selected");
    const current = run("python3", ["-B", ".trellis/scripts/task.py", "current", "--json"]);
    expect(current.status, current.stderr).toBe(0);
    expect(JSON.parse(current.stdout).task_workspace_root).toBe(primary);
  });

  it("selects the invoking checkout in the sole-session fallback", () => {
    const source = path.join(linked, ".trellis/tasks/cross/task.json");
    write(primary, ".trellis/tasks/cross/task.json", fs.readFileSync(source, "utf8"));
    delete env.CODEX_THREAD_ID;
    delete env.TRELLIS_CONTEXT_ID;
    const command = `
from pathlib import Path
import json, sys
sys.path.insert(0, '.trellis/scripts')
from common.active_task import resolve_active_task
task = resolve_active_task(Path.cwd(), allow_single_session_fallback=True)
print(json.dumps({'workspace': str(task.task_workspace_root), 'error': task.error}))
`;
    for (const workspace of [primary, linked]) {
      const result = run("python3", ["-B", "-c", command], workspace);
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ workspace, error: null });
    }
  });

  it("does not borrow the sole linked session into a contextless checkout", () => {
    delete env.CODEX_THREAD_ID;
    delete env.TRELLIS_CONTEXT_ID;
    const command = `
from pathlib import Path
import json, sys
sys.path.insert(0, '.trellis/scripts')
from common.active_task import resolve_active_task
task = resolve_active_task(Path.cwd(), allow_single_session_fallback=True,
                           allow_environment_context=False)
print(json.dumps({'task': task.task_path, 'source': task.source_type,
                  'workspace': str(task.task_workspace_root) if task.task_workspace_root else None,
                  'error': task.error}))
`;
    const unrelated = run("python3", ["-B", "-c", command], primary);
    expect(unrelated.status, unrelated.stderr).toBe(0);
    expect(JSON.parse(unrelated.stdout)).toEqual({ task: null, source: "none", workspace: null, error: null });

    const local = run("python3", ["-B", "-c", command], linked);
    expect(local.status, local.stderr).toBe(0);
    expect(JSON.parse(local.stdout)).toEqual({ task: ".trellis/tasks/cross", source: "session-fallback", workspace: linked, error: null });
  });

  it("OpenCode selects the invoking checkout through a symlink", () => {
    const source = path.join(linked, ".trellis/tasks/cross/task.json");
    write(primary, ".trellis/tasks/cross/task.json", fs.readFileSync(source, "utf8"));
    const alias = path.join(sandbox, "primary-alias");
    fs.symlinkSync(primary, alias, "dir");
    env.TRELLIS_CONTEXT_ID = "codex_cross-hook";
    const code = `
import { pathToFileURL } from 'node:url';
const { TrellisContext } = await import(pathToFileURL(process.argv[1]));
console.log(JSON.stringify(new TrellisContext(process.argv[2]).getActiveTask({sessionID:'cross-hook'})));
`;
    const result = run(process.execPath, ["--input-type=module", "-e", code, path.join(templates, "opencode/lib/trellis-context.js"), alias]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).taskWorkspaceRoot).toBe(primary);
  });

  it("Codex SessionStart uses linked task metadata and workflow from primary", () => {
    const text = hook(".codex/hooks/session-start.py");
    expect(text).toContain("Linked task title");
    expect(text).toContain("IN_PROGRESS");
    expect(text).not.toContain("NO ACTIVE TASK");
    expect(text).toContain("Linked-only workflow");
    expect(text).not.toContain("Primary-only workflow");
  });

  it("continuation uses linked task facts and workflow", () => {
    const facts = run("python3", ["-B", ".trellis/scripts/get_context.py", "--json"]);
    expect(facts.status, facts.stderr).toBe(0);
    const current = JSON.parse(facts.stdout) as {
      currentTask: { path: string; taskWorkspaceRoot: string; resolvedTaskPath: string };
    };
    expect(current.currentTask.path).toBe(".trellis/tasks/cross");
    expect(current.currentTask.taskWorkspaceRoot).toBe(linked);
    expect(current.currentTask.resolvedTaskPath).toBe(path.join(linked, ".trellis/tasks/cross"));

    const continuation = run("python3", [
      "-B", ".trellis/scripts/get_context.py", "--mode", "continuation",
    ]);
    expect(continuation.status, continuation.stderr).toBe(0);
    expect(continuation.stdout).toBe("LINKED-CONTINUATION\n");
    expect(continuation.stdout).not.toContain("PRIMARY-CONTINUATION");
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
    const continuation = run("python3", [
      "-B", ".trellis/scripts/get_context.py", "--mode", "continuation",
    ]);
    expect(continuation.status).not.toBe(0);
    expect(continuation.stdout).not.toContain("PRIMARY-CONTINUATION");
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

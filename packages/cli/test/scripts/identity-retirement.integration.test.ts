import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scripts = path.resolve(__dirname, "../../src/templates/trellis/scripts");
let root: string;
function run(script: string, ...args: string[]) {
  return spawnSync("python3", [path.join(root, ".trellis/scripts", script), ...args], {
    cwd: root, encoding: "utf8",
    env: { ...process.env, TRELLIS_CONTEXT_ID: "retirement-test", TRELLIS_DEVELOPER: "ignored-env" },
  });
}
function py(code: string) {
  return spawnSync("python3", ["-c", `import sys; sys.path.insert(0, ${JSON.stringify(path.join(root, ".trellis/scripts"))}); ${code}`], {
    cwd: root, encoding: "utf8",
  });
}
function write(name: string, content: string) {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}
function git(...args: string[]) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}
function seedRetired(value: string) {
  write(".trellis/.developer", `name=${value}\n`);
  write(".trellis/workspace/index.md", value);
  write(".trellis/workspace/person/index.md", value);
  write(".trellis/workspace/person/journal-1.md", value);
  write(".trellis/workspace/arbitrary/deep/opaque.bin", value);
  write(".trellis/agent-traces/index.md", value);
  write(".trellis/agent-traces/person/traces-1.md", value);
  write(".trellis/agent-traces/arbitrary/deep/opaque.bin", value);
}
function retiredSnapshot(): Record<string, string> {
  const result: Record<string, string> = {};
  function walk(name: string) {
    const file = path.join(root, name);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) result[name] = `link:${fs.readlinkSync(file)}`;
    else if (stat.isDirectory()) {
      result[name] = "directory";
      for (const child of fs.readdirSync(file)) walk(`${name}/${child}`);
    } else result[name] = fs.readFileSync(file).toString("base64");
  }
  walk(".trellis/.developer");
  walk(".trellis/workspace");
  walk(".trellis/agent-traces");
  return result;
}

describe("identity and workspace retirement runtime", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-retirement-"));
    fs.cpSync(scripts, path.join(root, ".trellis/scripts"), { recursive: true });
    write(".gitignore", ".trellis/scripts/\n");
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.test");
    git("add", ".gitignore");
    git("commit", "-qm", "fixture");
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("requires both ownership fields before creating directories, ignoring all retired inputs", () => {
    seedRetired("local-owner");
    const before = retiredSnapshot();
    for (const args of [[], ["--creator", "alice"], ["--assignee", "bob"]]) {
      const result = run("task.py", "create", "Example", "--description", "Fixture", ...args);
      expect(result.status, result.stderr).toBe(2);
      expect(result.stderr).toContain("explicit task ownership");
      expect(fs.existsSync(path.join(root, ".trellis/tasks"))).toBe(false);
      expect(result.stderr).not.toContain("local-owner");
    }
    const result = run("task.py", "create", "Example", "--description", "Fixture", "--creator", "alice", "--assignee", "bob", "--no-start");
    expect(result.status, result.stderr).toBe(0);
    const tasks = path.join(root, ".trellis/tasks");
    const task = JSON.parse(fs.readFileSync(path.join(tasks, fs.readdirSync(tasks)[0], "task.json"), "utf8"));
    expect(task).toMatchObject({ creator: "alice", assignee: "bob" });
    expect(retiredSnapshot()).toEqual(before);
  });

  it("filters matching children even when their parent does not match; --mine never broadens", () => {
    write(".trellis/tasks/parent/task.json", JSON.stringify({ title: "Parent", assignee: "alice", status: "planning", children: ["child"] }));
    write(".trellis/tasks/child/task.json", JSON.stringify({ title: "Child", assignee: "bob", status: "in_progress", parent: "parent" }));
    const text = run("task.py", "list", "--assignee", "bob", "--status", "in_progress");
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toContain("child/");
    expect(text.stdout).not.toContain("parent/");
    const json = run("task.py", "list", "--assignee", "bob", "--json");
    expect(JSON.parse(json.stdout).tasks.map((t: { assignee: string }) => t.assignee)).toEqual(["bob"]);
    for (const flag of ["--mine", "-m"]) {
      const retired = run("task.py", "list", flag, "--json");
      expect(retired.status).toBe(2);
      expect(retired.stdout).toBe("");
      expect(retired.stderr).toContain("--assignee <name>");
    }
  });

  it("rejects record mode before context work and removes retired library APIs", () => {
    seedRetired("private-record");
    const before = retiredSnapshot();
    for (const args of [["--mode", "record"], ["--mode", "record", "--json"]]) {
      const result = run("get_context.py", ...args);
      expect(result.status, result.stderr).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Record mode is retired");
    }
    const result = py(`
from common import paths, config, task_queue, session_context
for module, names in ((paths, ('get_developer', 'check_developer', 'get_workspace_dir', 'get_active_journal_file')), (config, ('get_session_auto_commit', 'get_session_commit_message', 'get_max_journal_lines')), (task_queue, ('list_my_tasks',)), (session_context, ('get_context_record_json', 'get_context_text_record'))):
    assert all(not hasattr(module, name) for name in names)
`);
    expect(result.status, result.stderr).toBe(0);
    expect(retiredSnapshot()).toEqual(before);
  });

  it("preserves ownership and retired bytes through task start, finish, rename and archive", () => {
    seedRetired("old-name");
    write(".trellis/config.yaml", "task_auto_commit: false\n");
    git("checkout", "-qb", "task-lifecycle");
    const created = run("task.py", "create", "Lifecycle", "--description", "Fixture", "--slug", "old-name", "--creator", "alice", "--assignee", "bob", "--base-branch", "main", "--no-start");
    expect(created.status, created.stderr).toBe(0);
    const name = fs.readdirSync(path.join(root, ".trellis/tasks"))[0];
    const before = retiredSnapshot();
    const started = run("task.py", "start", name);
    expect(started.status, started.stderr).toBe(0);
    expect(JSON.parse(run("get_context.py", "--json").stdout).currentTask.path).toBe(`.trellis/tasks/${name}`);
    expect(run("task.py", "finish").status).toBe(0);
    expect(JSON.parse(run("get_context.py", "--json").stdout).currentTask).toBe(null);
    const renamed = run("task.py", "rename", name, "new-name");
    expect(renamed.status, renamed.stderr).toBe(0);
    const renamedName = fs.readdirSync(path.join(root, ".trellis/tasks"))[0];
    const archived = run("task.py", "archive", renamedName);
    expect(archived.status, archived.stderr).toBe(0);
    const archive = path.join(root, ".trellis/tasks/archive");
    const month = fs.readdirSync(archive)[0];
    const task = JSON.parse(fs.readFileSync(path.join(archive, month, renamedName, "task.json"), "utf8"));
    expect(task).toMatchObject({ creator: "alice", assignee: "bob" });
    expect(retiredSnapshot()).toEqual(before);
  });

  it("keeps context identical for absent, untracked, and tracked dirty retired trees", () => {
    seedRetired("committed");
    git("add", ".trellis/.developer", ".trellis/workspace", ".trellis/agent-traces");
    git("commit", "-qm", "historical fixture");
    const baseline = run("get_context.py", "--json");
    expect(baseline.status, baseline.stderr).toBe(0);
    const context = JSON.parse(baseline.stdout);
    expect(context.git.isClean).toBe(true);
    for (const key of ["developer", "journal", "myTasks", "workspace"]) expect(context).not.toHaveProperty(key);
    for (const value of ["changed-a", "changed-b"]) {
      seedRetired(value);
      write(`.trellis/workspace/untracked/${value}`, value);
      const before = retiredSnapshot();
      expect(JSON.parse(run("get_context.py", "--json").stdout)).toEqual(context);
      expect(retiredSnapshot()).toEqual(before);
    }
    fs.rmSync(path.join(root, ".trellis/workspace"), { recursive: true });
    fs.rmSync(path.join(root, ".trellis/agent-traces"), { recursive: true });
    fs.rmSync(path.join(root, ".trellis/.developer"));
    expect(JSON.parse(run("get_context.py", "--json").stdout)).toEqual(context);
    write("ordinary.txt", "visible change");
    expect(JSON.parse(run("get_context.py", "--json").stdout).git.isClean).toBe(false);
  });

  it("skips historical package repositories before probing or traversing aliases", () => {
    seedRetired("package-history");
    for (const name of ["one", "two"]) {
      const relative = `.trellis/workspace/${name}`;
      fs.mkdirSync(path.join(root, relative));
      git("init", "-q", relative);
      write(`${relative}/dirty.txt`, "historical change");
      fs.symlinkSync(path.join(root, relative), path.join(root, name));
    }
    fs.mkdirSync(path.join(root, "active"));
    git("init", "-q", "active");
    write("active/dirty.txt", "active change");
    fs.symlinkSync(path.join(root, "active"), path.join(root, "active-link"));
    write(".trellis/config.yaml", `packages:
  literal:
    path: .trellis/workspace/one
    git: true
  alias:
    path: two
    git: true
  active:
    path: active-link
    git: true
`);
    const before = retiredSnapshot();
    const result = py(`
import json
from pathlib import Path
from common import session_context
root = Path.cwd()
history = (root / '.trellis/workspace').resolve()
def assert_active(path):
    resolved = path.resolve()
    assert resolved != history and history not in resolved.parents, str(path)
for method in ('iterdir', 'is_dir', 'exists'):
    original = getattr(Path, method)
    def guarded(self, *args, _original=original, **kwargs):
        assert_active(self)
        return _original(self, *args, **kwargs)
    setattr(Path, method, guarded)
original_git = session_context.run_git
def guarded_git(args, **kwargs):
    assert_active(kwargs['cwd'])
    return original_git(args, **kwargs)
session_context.run_git = guarded_git
configured = session_context._collect_package_git_info(root)
session_context.get_git_packages = lambda root: {}
discovered = session_context._collect_package_git_info(root, discover_unconfigured=True)
print(json.dumps({'configured': configured, 'discovered': discovered}))
`);
    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.configured.map((item: { path: string }) => item.path)).toEqual(["active-link"]);
    expect(output.discovered.map((item: { path: string }) => item.path)).toEqual(["active", "active-link"]);
    expect(output.configured[0].uncommittedChanges).toBe(1);
    expect(retiredSnapshot()).toEqual(before);
  });

  it("keeps root and package Git probes equivalent when only agent-traces changes", () => {
    write(".trellis/agent-traces/person/traces-1.md", "committed history");
    git("add", ".trellis/agent-traces");
    git("commit", "-qm", "predecessor fixture");
    const probe = () => {
      const result = py(`
import json
from pathlib import Path
from common import session_context
root = Path.cwd()
print(json.dumps({
    'root': session_context._collect_root_git_info(root),
    'package': session_context._collect_git_repo_info('fixture', '.', root),
    'text': session_context.get_context_text(root),
}))
`);
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(result.stdout);
    };
    const baseline = probe();
    expect(baseline.root.isClean).toBe(true);
    expect(baseline.package.isClean).toBe(true);
    write(".trellis/agent-traces/person/traces-1.md", "changed history");
    write(".trellis/agent-traces/untracked/nested.txt", "untracked history");
    expect(probe()).toEqual(baseline);
    fs.rmSync(path.join(root, ".trellis/agent-traces"), { recursive: true });
    expect(probe()).toEqual(baseline);
    write("ordinary.txt", "visible change");
    const changed = probe();
    expect(changed.root.isClean).toBe(false);
    expect(changed.package.isClean).toBe(false);
    expect(changed.text).toContain("ordinary.txt");
  });

  it("does not read or enumerate retired workspace or agent-traces paths in context, rename reporting, or staging discovery", () => {
    seedRetired("old-task");
    fs.symlinkSync("arbitrary", path.join(root, ".trellis/workspace/link"));
    fs.symlinkSync("arbitrary", path.join(root, ".trellis/agent-traces/link"));
    const before = retiredSnapshot();
    const result = py(`
from pathlib import Path
from common import session_context, task_store, safe_commit
root = Path.cwd()
def forbidden(path):
    return any(part in {".developer", "workspace", "agent-traces"} for part in path.parts)
for method in ("read_text", "read_bytes", "iterdir", "glob", "rglob", "open"):
    original = getattr(Path, method)
    def guard(self, *args, _original=original, **kwargs):
        assert not forbidden(self), str(self)
        return _original(self, *args, **kwargs)
    setattr(Path, method, guard)
calls = []
original_git = session_context.run_git
def scoped_git(args, **kwargs):
    calls.append(args)
    return original_git(args, **kwargs)
session_context.run_git = scoped_git
session_context.get_context_json(root)
session_context.get_context_text(root)
assert task_store._plan_reported_refs(root, root / '.trellis/tasks/old-task', set(), 'old-task') == []
assert safe_commit.safe_archive_paths_to_add(root, root / '.trellis/tasks/archive/old-task') == []
for args in calls:
    if args[0] == 'status':
        assert ':(exclude).trellis/workspace' in args
        assert ':(exclude).trellis/agent-traces' in args
        assert ':(exclude).trellis/.developer' in args
print('guarded')
`);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("guarded");
    expect(retiredSnapshot()).toEqual(before);
  });

  it.each([
    ["", true, false],
    ["session_auto_commit: false", false, true],
    ["session_auto_commit: true", true, true],
    ["task_auto_commit: false\nsession_auto_commit: true", false, false],
    ["task_auto_commit: true\nsession_auto_commit: false", true, false],
    ["task_auto_commit: no # opt out", false, false],
    ["task_auto_commit: OFF", false, false],
    ["task_auto_commit: 0", false, false],
    ["task_auto_commit: invalid", true, false],
    ["session_auto_commit: invalid", true, true],
  ])("archive policy precedence: %s", (config, enabled, legacy) => {
    write(".trellis/config.yaml", `${config}\n`);
    const result = py("from common.config import get_task_auto_commit; print(get_task_auto_commit())");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe(enabled ? "True" : "False");
    expect(result.stderr.includes("deprecated")).toBe(legacy);
    if (config.includes("invalid")) expect(result.stderr).toContain("using true (default)");
  });
});

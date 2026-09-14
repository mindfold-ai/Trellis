import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scripts = path.resolve(__dirname, "../../src/templates/trellis/scripts");
let root: string;

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "task-history-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

function probe(code: string): void {
  const result = spawnSync("python3", ["-c", `
import argparse, json, os, sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, ${JSON.stringify(scripts)})
from common import task_context as context, task_store as store
from common.history_paths import require_active_path
root = Path(${JSON.stringify(root)}).resolve()
${code}
`], { cwd: root, encoding: "utf8" });
  expect(result.status, result.stdout + result.stderr).toBe(0);
}

describe("task manifest historical access boundary", () => {
  for (const external of [false, true]) {
    for (const history of ["workspace", "agent-traces", ".backup-old", ".developer"]) {
      it(`rejects manifest aliases before IO (${history}, external=${external})`, () => {
        probe(`
workflow = root / "store" if ${external ? "True" : "False"} else root / ".trellis"
workflow.mkdir()
if workflow.name == "store":
    (root / ".trellis").symlink_to(workflow, target_is_directory=True)
task = root / ".trellis/tasks/09-11-old"
task.mkdir(parents=True)
metadata = '{"id":"old","name":"old","title":"Old"}'
(task / "task.json").write_text(metadata)
(root / "valid.md").write_text("valid")
historical = workflow / ${JSON.stringify(history)}
if historical.name != ".developer":
    historical.mkdir()
    historical = historical / "manifest.jsonl"
original = json.dumps({"file": ".trellis/tasks/09-11-old/prd.md"}) + "\\n"
historical.write_text(original)
manifest = task / "check.jsonl"
manifest.symlink_to(historical)
(task / "implement.jsonl").write_text(json.dumps({"file":"valid.md"}) + "\\n")
real_stat, real_open = Path.stat, Path.open
def forbidden(p):
    return p == manifest or p == historical
def stat(p, *args, **kwargs):
    if kwargs.get("follow_symlinks", True) and forbidden(p):
        raise AssertionError("historical stat: " + str(p))
    return real_stat(p, *args, **kwargs)
def opened(p, *args, **kwargs):
    if forbidden(p):
        raise AssertionError("historical open: " + str(p))
    return real_open(p, *args, **kwargs)
with patch.object(Path, "stat", stat), patch.object(Path, "open", opened), patch.object(context, "get_repo_root", lambda: root), patch.object(store, "get_repo_root", lambda: root):
    args = argparse.Namespace(dir=str(task), file="check", path="valid.md", reason="test")
    assert context.cmd_add_context(args) == 1
    assert context.cmd_list_context(args) == 1
    assert context.cmd_validate(args) == 1
    assert context.curated_entry_count(manifest, root) == 0
    assert store.cmd_rename(argparse.Namespace(name=str(task), new_slug="new", dry_run=False)) == 1
assert historical.read_text() == original
assert (task / "task.json").read_text() == metadata
assert not (task.parent / "09-11-new").exists()
assert manifest.is_symlink()
`);
      });
    }
    it(`rejects referenced direct and aliased targets before stat (external=${external})`, () => {
      probe(`
workflow = root / "store" if ${external ? "True" : "False"} else root / ".trellis"
workflow.mkdir()
if workflow.name == "store":
    (root / ".trellis").symlink_to(workflow, target_is_directory=True)
task = root / ".trellis/tasks/09-11-old"
task.mkdir(parents=True)
manifest = task / "implement.jsonl"
for name in ("workspace", "agent-traces", ".backup-old", ".developer"):
    historical = workflow / name
    historical.write_text("historical")
    alias = root / (name + "-alias")
    alias.symlink_to(historical)
    for target in (root / ".trellis" / name, alias, historical):
        original = json.dumps({"file": str(target)}) + "\\n"
        manifest.write_text(original)
        real_stat = Path.stat
        def stat(p, *args, **kwargs):
            if kwargs.get("follow_symlinks", True) and p in (target, historical):
                raise AssertionError("historical target stat: " + str(p))
            return real_stat(p, *args, **kwargs)
        with patch.object(Path, "stat", stat), patch.object(context, "get_repo_root", lambda: root):
            assert context.cmd_add_context(argparse.Namespace(dir=str(task), file="implement", path=str(target), reason="test")) == 1
            assert context._validate_jsonl(manifest, root, task) == 1
        assert manifest.read_text() == original
`);
    });
  }

  it("preserves ordinary add, list, validate, count and rename", () => {
    probe(`
task = root / ".trellis/tasks/09-11-old"
task.mkdir(parents=True)
(task / "task.json").write_text('{"id":"old","name":"old","title":"Old"}')
(task / "prd.md").write_text("spec")
with patch.object(context, "get_repo_root", lambda: root), patch.object(store, "get_repo_root", lambda: root):
    assert context.cmd_add_context(argparse.Namespace(dir=str(task), file="implement", path=".trellis/tasks/09-11-old/prd.md", reason="test")) == 0
    assert context.cmd_list_context(argparse.Namespace(dir=str(task))) == 0
    assert context.cmd_validate(argparse.Namespace(dir=str(task))) == 0
    assert context.curated_entry_count(task / "implement.jsonl", root) == 1
    assert store.cmd_rename(argparse.Namespace(name=str(task), new_slug="new", dry_run=False)) == 0
assert ".trellis/tasks/09-11-new/prd.md" in (task.parent / "09-11-new/implement.jsonl").read_text()
`);
  });
});

describe("task root and configuration historical access boundary", () => {
  for (const external of [false, true]) {
    it.each(["workspace", "agent-traces", ".backup-old"])(`rejects historical task roots before command IO (%s, external=${external})`, (name) => {
      probe(`
import task as task_cli
workflow = root / "store" if ${external ? "True" : "False"} else root / ".trellis"
workflow.mkdir()
if workflow.name == "store":
    (root / ".trellis").symlink_to(workflow, target_is_directory=True)
historical = workflow / ${JSON.stringify(name)}
(historical / "old").mkdir(parents=True)
original = '{"id":"old","name":"old"}'
(historical / "old/task.json").write_text(original)
tasks = root / ".trellis/tasks"
tasks.symlink_to(historical, target_is_directory=True)
attempts = []
def audit(method):
    def wrapped(p, *args, **kwargs):
        if p == tasks or tasks in p.parents or p == historical or historical in p.parents:
            attempts.append((method.__name__, str(p)))
            raise AssertionError("historical IO: " + str(p))
        return method(p, *args, **kwargs)
    return wrapped
with patch.object(Path, "open", audit(Path.open)), patch.object(Path, "iterdir", audit(Path.iterdir)), patch.object(Path, "mkdir", audit(Path.mkdir)):
    for argv in (["set-meta", ".trellis/tasks/old", "review", "changed"],
                 ["set-meta", "old", "review", "changed"],
                 ["list", "--json"], ["list-archive"],
                 ["create", "New", "--description", "Active task", "--creator", "caller", "--assignee", "owner", "--no-start"],
                 ["archive", "old", "--no-commit", "--skip-branch-validation"]):
        with patch.object(sys, "argv", ["task.py", *argv]):
            assert task_cli.main() == 1, argv
assert attempts == [], attempts
assert (historical / "old/task.json").read_text() == original
assert sorted(p.name for p in historical.iterdir()) == ["old"]
assert tasks.is_symlink()
`);
    });

    it(`rejects configuration aliases without reading their values (external=${external})`, () => {
      probe(`
import task as task_cli
from common.config import get_task_auto_commit, get_hooks
from common.trellis_config import read_trellis_config
from common.history_paths import RetiredDataPathError
workflow = root / "store" if ${external ? "True" : "False"} else root / ".trellis"
workflow.mkdir()
if workflow.name == "store":
    (root / ".trellis").symlink_to(workflow, target_is_directory=True)
config = root / ".trellis/config.yaml"
for name in ("workspace", "agent-traces", ".backup-old", ".developer"):
    historical = workflow / name
    if name != ".developer":
        historical.mkdir()
        historical = historical / "config.yaml"
    config.symlink_to(historical)
    for value in ("true", "false"):
        text = "task_auto_commit: " + value + "\\n"
        historical.write_text(text)
        attempts = []
        original_read = Path.read_text
        def read(p, *args, **kwargs):
            if p == config or p == historical:
                attempts.append(str(p))
                raise AssertionError("historical configuration read")
            return original_read(p, *args, **kwargs)
        with patch.object(Path, "read_text", read):
            for operation in (lambda: get_task_auto_commit(root), lambda: get_hooks("after_create", root), lambda: read_trellis_config(root)):
                try:
                    operation()
                except RetiredDataPathError:
                    pass
                else:
                    raise AssertionError("historical configuration accepted")
            with patch.object(sys, "argv", ["task.py", "create", "New", "--description", "Active task", "--creator", "caller", "--assignee", "owner", "--no-start"]):
                assert task_cli.main() == 1
        assert attempts == [], attempts
        assert historical.read_text() == text
        assert not (workflow / "tasks").exists()
    config.unlink()
`);
    });
  }

  it("keeps active linked task storage and ordinary configuration usable", () => {
    probe(`
import task as task_cli
from common.config import get_task_auto_commit
workflow = root / ".trellis"
workflow.mkdir()
active = root / "active-tasks"
active.mkdir()
(workflow / "tasks").symlink_to(active, target_is_directory=True)
config = workflow / "config.yaml"
for value, expected in (("false", False), ("true", True)):
    config.write_text("task_auto_commit: " + value + "\\n")
    assert get_task_auto_commit(root) is expected
with patch.object(sys, "argv", ["task.py", "create", "New", "--description", "Active task", "--slug", "fresh", "--creator", "caller", "--assignee", "owner", "--no-start"]):
    assert task_cli.main() == 0
task = next(p for p in active.iterdir() if p.name != "archive")
with patch.object(sys, "argv", ["task.py", "set-meta", task.name, "review", "active"]):
    assert task_cli.main() == 0
with patch.object(sys, "argv", ["task.py", "list", "--json"]):
    assert task_cli.main() == 0
assert json.loads((task / "task.json").read_text())["meta"]["review"] == "active"
`);
  });

  for (const external of [false, true]) {
    it.each(["directory", "metadata"])(`skips historical task children and refuses force overwrite (%s, external=${external})`, (aliasKind) => {
      probe(`
import io
import task as task_cli
from contextlib import redirect_stdout
from common.paths import generate_task_date_prefix
workflow = root / "store" if ${external ? "True" : "False"} else root / ".trellis"
workflow.mkdir()
if workflow.name == "store":
    (root / ".trellis").symlink_to(workflow, target_is_directory=True)
tasks = root / ".trellis/tasks"
tasks.mkdir()
historical = workflow / "workspace/old"
historical.mkdir(parents=True)
original = '{"id":"old","name":"old","title":"HISTORICAL-TITLE"}'
(historical / "task.json").write_text(original)
alias = tasks / (generate_task_date_prefix() + "-old")
if ${aliasKind === "directory" ? "True" : "False"}:
    alias.symlink_to(historical, target_is_directory=True)
else:
    alias.mkdir()
    (alias / "task.json").symlink_to(historical / "task.json")
active = tasks / "active"
active.mkdir()
(active / "task.json").write_text('{"id":"active","title":"Active task"}')
attempts = []
def audit(method):
    def wrapped(p, *args, **kwargs):
        if p == alias or alias in p.parents or p == historical or historical in p.parents:
            attempts.append((method.__name__, str(p)))
            raise AssertionError("historical IO")
        return method(p, *args, **kwargs)
    return wrapped
with patch.object(Path, "open", audit(Path.open)), patch.object(Path, "iterdir", audit(Path.iterdir)):
    output = io.StringIO()
    with patch.object(sys, "argv", ["task.py", "list", "--json"]), redirect_stdout(output):
        assert task_cli.main() == 0
    assert "HISTORICAL-TITLE" not in output.getvalue()
    assert "Active task" in output.getvalue()
    with patch.object(sys, "argv", ["task.py", "create", "New", "--description", "Active task", "--slug", "old", "--creator", "caller", "--assignee", "owner", "--no-start", "--force"]):
        assert task_cli.main() == 1
    with patch.object(sys, "argv", ["task.py", "set-meta", str(alias), "review", "changed"]):
        assert task_cli.main() == 1
assert attempts == [], attempts
assert (historical / "task.json").read_text() == original
assert sorted(p.name for p in historical.iterdir()) == ["task.json"]
assert alias.is_symlink() or (alias / "task.json").is_symlink()
`);
    });
  }
});

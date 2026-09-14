import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const scripts = path.resolve(import.meta.dirname, "../../src/templates/trellis/scripts");
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-history-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

function probe(code: string): void {
  const result = spawnSync("python3", ["-B", "-c", `
import io, json, os, sys
from pathlib import Path
from contextlib import redirect_stdout, redirect_stderr
from unittest.mock import patch
sys.path.insert(0, ${JSON.stringify(scripts)})
import task
from common import active_task
from common.history_paths import RetiredDataPathError
root = Path(${JSON.stringify(root)}).resolve()
def command(args):
    out, err = io.StringIO(), io.StringIO()
    with patch.object(sys, "argv", ["task.py", *args]), redirect_stdout(out), redirect_stderr(err):
        status = task.main()
    return status, out.getvalue(), err.getvalue()
${code}
`], { cwd: root, encoding: "utf8" });
  expect(result.status, result.stdout + result.stderr).toBe(0);
}

describe("session storage history boundary", () => {
  for (const external of [false, true]) {
    it.each(["file", "sessions", "runtime"])(`rejects historical %s aliases before reads or writes (external=${external})`, (mode) => {
      probe(`
workflow = root / "backing" if ${external ? "True" : "False"} else root / ".trellis"
workflow.mkdir()
if workflow.name == "backing":
    (root / ".trellis").symlink_to(workflow, target_is_directory=True)
for name in ("one", "two"):
    directory = workflow / "tasks" / name
    directory.mkdir(parents=True)
    (directory / "task.json").write_text(json.dumps({"id": name, "title":name, "description":"Fixture", "status":"in_progress", "creator":"caller", "assignee":"owner"}))
    (directory / "prd.md").write_text("Fixture")
history = workflow / "workspace"
history.mkdir()
runtime = workflow / ".runtime"
mode = ${JSON.stringify(mode)}
if mode == "runtime":
    runtime.symlink_to(history, target_is_directory=True)
    (history / "sessions").mkdir()
    historical_file = history / "sessions/review.json"
elif mode == "sessions":
    runtime.mkdir()
    (runtime / "sessions").symlink_to(history, target_is_directory=True)
    historical_file = history / "review.json"
else:
    (runtime / "sessions").mkdir(parents=True)
    historical_file = history / "old.json"
    (runtime / "sessions/review.json").symlink_to(historical_file)
attempts = []
enabled = False
def audit(event, args):
    if enabled and event in ("open", "os.listdir", "os.scandir", "os.mkdir", "os.remove", "os.rename"):
        for arg in args[:2]:
            if not isinstance(arg, (str, bytes)):
                continue
            actual = os.path.realpath(os.fsdecode(arg))
            if actual == str(history) or actual.startswith(str(history) + os.sep):
                attempts.append((event, actual))
sys.addaudithook(audit)
with patch.dict(os.environ, {"TRELLIS_CONTEXT_ID":"review"}):
    for selected in (None, "one", "two"):
        enabled = False
        if selected:
            historical_file.write_text(json.dumps({"current_task":".trellis/tasks/" + selected}))
        before = {str(p.relative_to(history)):p.read_bytes() for p in history.rglob("*") if p.is_file()}
        tasks_before = {str(p.relative_to(workflow)):p.read_bytes() for p in (workflow / "tasks").rglob("*") if p.is_file()}
        enabled = True
        for args in (["current", "--json"], ["start", ".trellis/tasks/one"], ["finish"],
                     ["rename", ".trellis/tasks/one", "renamed"],
                     ["archive", ".trellis/tasks/one", "--no-commit", "--skip-branch-validation"]):
            status, _, error = command(args)
            assert status == 1 and "historical" in error, (args, status, error)
        for operation in (
            lambda: active_task.resolve_active_task(root, allow_single_session_fallback=True, allow_environment_context=False),
            lambda: active_task.clear_task_from_sessions(".trellis/tasks/one", root),
            lambda: active_task.repoint_task_in_sessions(".trellis/tasks/one", ".trellis/tasks/new", root),
        ):
            try:
                operation()
            except RetiredDataPathError:
                pass
            else:
                raise AssertionError("historical session storage accepted")
        assert attempts == [], attempts
        enabled = False
        after = {str(p.relative_to(history)):p.read_bytes() for p in history.rglob("*") if p.is_file()}
        assert after == before
        assert {str(p.relative_to(workflow)):p.read_bytes() for p in (workflow / "tasks").rglob("*") if p.is_file()} == tasks_before
`);
    });
  }

  it.each([false, true])("retired task refs remain stale regardless of target presence (alias=%s)", (alias) => {
    probe(`
sessions = root / ".trellis/.runtime/sessions"
sessions.mkdir(parents=True)
target = root / ".trellis/workspace/old"
reference = ".trellis/workspace/old"
if ${alias ? "True" : "False"}:
    (root / ".trellis/tasks").mkdir()
    (root / ".trellis/tasks/old").symlink_to(target, target_is_directory=True)
    reference = ".trellis/tasks/old"
record = json.dumps({"current_task":reference})
(sessions / "review.json").write_text(record)
with patch.dict(os.environ, {"TRELLIS_CONTEXT_ID":"review"}):
    absent = active_task.resolve_active_task(root)
    target.mkdir(parents=True)
    present = active_task.resolve_active_task(root)
    assert absent == present and present.stale
    assert active_task.set_active_task(reference, root) is None
assert (sessions / "review.json").read_text() == record
`);
  });

  it("preserves normal start/current/finish and the existing fallback cardinality", () => {
    probe(`
directory = root / ".trellis/tasks/one"
directory.mkdir(parents=True)
(directory / "task.json").write_text(json.dumps({"id":"one", "title":"One", "description":"Fixture", "status":"in_progress"}))
(directory / "prd.md").write_text("Fixture")
fallback = lambda: active_task.resolve_active_task(root, allow_single_session_fallback=True, allow_environment_context=False)
assert fallback().task_path is None
with patch.dict(os.environ, {"TRELLIS_CONTEXT_ID":"review"}):
    assert command(["start", ".trellis/tasks/one"])[0] == 0
    status, out, _ = command(["current", "--json"])
    assert status == 0 and json.loads(out)["current_task"]["id"] == "one"
    assert fallback().source_type == "session-fallback"
    second = root / ".trellis/.runtime/sessions/second.json"
    second.write_text('{"current_task":".trellis/tasks/one"}')
    assert fallback().task_path is None
    second.unlink()
    assert command(["finish"])[0] == 0
    assert active_task.resolve_active_task(root).task_path is None
assert not (root / ".trellis/workspace").exists()
`);
  });
});

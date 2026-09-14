import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const templates = path.resolve(import.meta.dirname, "../../src/templates");
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-status-history-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
function probe(code: string): void {
  const result = spawnSync("python3", ["-B", "-c", `
import io, json, os, sys, importlib.util
from pathlib import Path
from unittest.mock import patch
from contextlib import redirect_stdout
root = Path(${JSON.stringify(root)}).resolve()
os.chdir(root)
scripts = Path(${JSON.stringify(path.join(templates, "trellis/scripts"))})
sys.path.insert(0, str(scripts))
${code}
`], { encoding: "utf8" });
  expect(result.status, result.stdout + result.stderr).toBe(0);
}

describe("optional status and update readers", () => {
  it("keeps update hints optional when session-key resolution rejects history", () => {
    probe(`
from common import session_context as context
from common.history_paths import RetiredDataPathError
(root / ".trellis").mkdir()
(root / ".trellis/.version").write_text("0.6.15")
with patch.object(context, "resolve_context_key", side_effect=RetiredDataPathError("historical ticket")), patch.object(context, "_resolve_available_update_version") as available:
    assert context.get_update_hint(root) is None
    assert context._mark_update_check_attempted(root) is False
    available.assert_not_called()
assert not (root / ".trellis/.runtime").exists()
`);
  });
  it.each(["version", "runtime", "marker"])("does not read or write historical update %s aliases", (kind) => {
    probe(`
from common import session_context as context
workflow = root / ".trellis"
workflow.mkdir()
history = workflow / "workspace"
history.mkdir()
version = workflow / ".version"
version.write_text("0.6.15")
kind = ${JSON.stringify(kind)}
if kind == "runtime":
    alias = workflow / ".runtime"
    alias.symlink_to(history, target_is_directory=True)
elif kind == "version":
    alias = version
    version.unlink()
    (history / "source").write_text("0.6.15")
    alias.symlink_to(history / "source")
else:
    (workflow / ".runtime").mkdir()
    alias = workflow / ".runtime/update-check-review.marker"
    alias.symlink_to(history / "source")
accesses = []
enabled = True
def audit(event, args):
    if enabled and event in ("open", "os.listdir", "os.scandir", "os.mkdir") and isinstance(args[0], (str, bytes)):
        actual = os.path.realpath(os.fsdecode(args[0]))
        if actual == str(history) or actual.startswith(str(history) + os.sep):
            accesses.append((event, actual))
sys.addaudithook(audit)
with patch.object(context, "_resolve_available_update_version", return_value="0.6.16") as available:
    assert context.get_update_hint(root, "review") is None
    available.assert_not_called()
    if kind != "version":
        assert context._mark_update_check_attempted(root, "review") is False
assert accesses == [], accesses
enabled = False
before = {p.name:p.read_bytes() for p in history.iterdir() if p.is_file()}
alias.unlink()
if kind == "version":
    version.write_text("0.6.15")
with patch.object(context, "_resolve_available_update_version", return_value="0.6.16") as available:
    assert "update available" in context.get_update_hint(root, "review")
    assert context.get_update_hint(root, "review") is None
    assert available.call_count == 1
assert (workflow / ".runtime/update-check-review.marker").read_text() == "checked\\n"
assert {p.name:p.read_bytes() for p in history.iterdir() if p.is_file()} == before
`);
  });

  it.each(["metadata", "tasks", "session"])("StatusLine rejects historical %s aliases and keeps normal display", (kind) => {
    probe(`
workflow = root / ".trellis"
task = workflow / "tasks/current"
task.mkdir(parents=True)
(workflow / "scripts").symlink_to(scripts, target_is_directory=True)
metadata = '{"id":"current","title":"ACTIVE TITLE","status":"in_progress","children":null}'
(task / "task.json").write_text(metadata)
sessions = workflow / ".runtime/sessions"
sessions.mkdir(parents=True)
record = '{"current_task":".trellis/tasks/current"}'
(sessions / "review.json").write_text(record)
history = workflow / "workspace"
history.mkdir()
kind = ${JSON.stringify(kind)}
if kind == "tasks":
    alias = workflow / "tasks"
    alias.rename(history / "tasks")
    alias.symlink_to(history / "tasks", target_is_directory=True)
    (history / "tasks/current/task.json").write_text(metadata.replace("ACTIVE", "HISTORICAL"))
else:
    alias = task / "task.json" if kind == "metadata" else sessions / "review.json"
    (history / "source").write_text(metadata.replace("ACTIVE", "HISTORICAL") if kind == "metadata" else record)
    alias.unlink()
    alias.symlink_to(history / "source")
spec = importlib.util.spec_from_file_location("statusline", ${JSON.stringify(path.join(templates, "claude/hooks/statusline.py"))})
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)
accesses = []
enabled = True
def audit(event, args):
    if enabled and event in ("open", "os.listdir", "os.scandir") and isinstance(args[0], (str, bytes)):
        actual = os.path.realpath(os.fsdecode(args[0]))
        if actual == str(history) or actual.startswith(str(history) + os.sep):
            accesses.append((event, actual))
sys.addaudithook(audit)
def invoke():
    out = io.StringIO()
    with patch.dict(os.environ, {"TRELLIS_CONTEXT_ID":"review"}), patch.object(sys, "stdin", io.StringIO('{}')), redirect_stdout(out):
        hook.main()
    return out.getvalue()
assert "HISTORICAL" not in invoke()
assert accesses == [], accesses
enabled = False
alias.unlink()
if kind == "tasks":
    task.mkdir(parents=True)
    (task / "task.json").write_text(metadata)
else:
    alias.write_text(metadata if kind == "metadata" else record)
output = invoke()
assert "ACTIVE TITLE" in output and "1 task(s)" in output, output
`);
  });
});

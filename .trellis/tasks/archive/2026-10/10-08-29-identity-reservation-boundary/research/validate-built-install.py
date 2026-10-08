"""Exercise built CLI installation and real task commands in owned fixtures.

Run from this checkout after `pnpm build`:
python3 .trellis/tasks/10-08-29-identity-reservation-boundary/research/validate-built-install.py
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import tempfile


def main() -> None:
    checkout = Path(__file__).resolve().parents[4]
    cli = checkout / "packages/cli/dist/cli/index.js"
    assert cli.is_file(), "Run pnpm build before this probe"
    with tempfile.TemporaryDirectory(prefix="trellis29-installed-") as temporary:
        root = Path(temporary) / "project"
        root.mkdir()
        env = {key: value for key, value in os.environ.items()
               if key in ("PATH", "HOME", "SYSTEMROOT", "WINDIR", "PATHEXT")}
        env.update(GIT_CONFIG_NOSYSTEM="1",
                   GIT_CONFIG_GLOBAL=str(Path(temporary) / "absent"),
                   GIT_CONFIG_COUNT="1", GIT_CONFIG_KEY_0="core.hooksPath",
                   GIT_CONFIG_VALUE_0=str(Path(temporary) / "empty-hooks"),
                   TRELLIS_CONTEXT_ID="installed29")

        def run(cwd: Path, args: list[str]) -> subprocess.CompletedProcess:
            result = subprocess.run(args, cwd=cwd, env=env, text=True,
                                    capture_output=True, timeout=60)
            assert result.returncode == 0, (args, result.stdout, result.stderr)
            return result

        def git(*args: str) -> subprocess.CompletedProcess:
            return run(root, ["git", "-c", "user.name=Fixture", "-c",
                             "user.email=fixture@example.invalid", "-c",
                             "commit.gpgsign=false", *args])

        git("init", "-q", "-b", "main")
        run(root, ["node", str(cli), "init", "--codex", "--yes"])
        git("add", ".")
        git("commit", "-qm", "Clean installed project")
        history = Path(temporary) / "history"
        git("worktree", "add", "--detach", str(history), "HEAD")
        old = history / ".trellis/tasks/old/task.json"
        old.parent.mkdir(parents=True)
        raw = b'{"id":"Old_Reserved","lifecycle_generation":1,"creator":"old","subtasks":[]}\n'
        old.write_bytes(raw)
        old.chmod(0o640)
        mode = old.stat().st_mode
        source = dict(kind="issue", repo_ref="castbox/Trellis", number=29,
                      disposition="exact_source")
        script = root / ".trellis/scripts/task.py"
        refs = git("for-each-ref", "--format=%(refname) %(objectname)").stdout
        run(root, ["python3", str(script), "create", "Current", "--description",
                   "Installed fixture", "--slug", "current", "--task-id",
                   "current", "--source-json", json.dumps(source), "--no-start"])
        task = next((root / ".trellis/tasks").glob("*-current"))
        data = json.loads((task / "task.json").read_text())
        assert data["source"] == source and data["lifecycle_generation"] == 0
        run(root, ["python3", str(script), "start", str(task), "--allow-empty-context"])
        current = json.loads(run(root, ["python3", str(script), "current", "--json"]).stdout)
        assert current["current_task"]["id"] == "current"
        assert current["current_task"]["dir"] == task.relative_to(root).as_posix()
        assert Path(current["resolved_task_path"]).resolve() == task.resolve()
        assert not current["stale"]
        before = sorted(item.name for item in (root / ".trellis/tasks").iterdir())
        session = root / ".git/trellis/sessions/installed29.json"
        binding = session.read_bytes()
        for identity in ["Old_Reserved", "old_reserved"]:
            result = subprocess.run(
                ["python3", str(script), "create", "Other", "--description",
                 "Other", "--slug", "other", "--task-id", identity, "--no-start"],
                cwd=root, env=env, text=True, capture_output=True, timeout=60)
            assert result.returncode == 1 and "task_id_collision" in result.stderr, (
                result.stdout, result.stderr)
            assert before == sorted(item.name for item in (root / ".trellis/tasks").iterdir())
            assert session.read_bytes() == binding
        assert old.read_bytes() == raw and old.stat().st_mode == mode
        assert git("for-each-ref", "--format=%(refname) %(objectname)").stdout == refs
        print("A29-INSTALLED PASS: built init, mixed registered-worktree create/source/gen0/"
              "start/current, exact/casefold rejection, historical bytes/modes and "
              "session/task/Git-ref preservation")


if __name__ == "__main__":
    main()

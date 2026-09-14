import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const scripts = path.resolve(import.meta.dirname, "../../src/templates/trellis/scripts");
let sandbox: string;

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-cross-worktree-"));
});
afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

// Every Git mutation below is confined to a test-owned temporary repository.
function probe(body: string): void {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    ["PATH", "Path", "SYSTEMROOT", "SystemRoot", "WINDIR", "PATHEXT"].includes(key),
  ));
  Object.assign(env, {
    HOME: sandbox, USERPROFILE: sandbox, GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: path.join(sandbox, "absent-gitconfig"),
    GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath",
    GIT_CONFIG_VALUE_0: path.join(sandbox, "empty-hooks"),
    PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1",
  });
  const result = spawnSync("python3", ["-B", "-c", `
import json, os, shutil, subprocess, sys
from pathlib import Path
base = Path(${JSON.stringify(sandbox)}).resolve()
templates = Path(${JSON.stringify(scripts)})
def git(root, *args):
    p = subprocess.run(['git', '-c', 'user.name=Trellis Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-C', str(root), *args], capture_output=True, text=True)
    assert p.returncode == 0, (args, p.stdout, p.stderr)
    return p.stdout.strip()
def install(root):
    shutil.copytree(templates, root / '.trellis/scripts')
    (root / '.trellis/config.yaml').write_text('task_auto_commit: false\\n')
    (root / '.trellis/workflow.md').write_text('# Workflow\\n')
def repository(name):
    root = base / name
    root.mkdir()
    git(root, 'init', '-q')
    install(root)
    git(root, 'add', '.trellis')
    git(root, 'commit', '-qm', 'Fixture scripts')
    return root
def worktree(root, name):
    target = base / name
    git(root, 'worktree', 'add', '--detach', str(target), 'HEAD')
    return target
def task(root, name='same', title=None):
    directory = root / '.trellis/tasks' / name
    directory.mkdir(parents=True)
    (directory / 'task.json').write_text(json.dumps(dict(id=name, name=name, title=title or name, description='Fixture task', status='planning', creator='fixture', assignee='fixture', children=[], parent=None)))
    (directory / 'prd.md').write_text('Fixture requirement\\n')
    for manifest in ('implement.jsonl', 'check.jsonl'):
        (directory / manifest).write_text(json.dumps(dict(file=str(directory.relative_to(root) / 'prd.md'), reason='Fixture requirement')) + '\\n')
    return directory
def command(root, session, *args):
    env = dict(os.environ, CODEX_THREAD_ID=session, PYTHONDONTWRITEBYTECODE='1')
    return subprocess.run([sys.executable, '-B', str(root / '.trellis/scripts/task.py'), *args], cwd=root, env=env, capture_output=True, text=True)
def start(root, session, directory):
    p = command(root, session, 'start', str(directory))
    assert p.returncode == 0, (p.stdout, p.stderr)
def current(root, session):
    return command(root, session, 'current', '--json')
def legacy(root, session, directory):
    file = root / '.trellis/.runtime/sessions' / ('codex_' + session + '.json')
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(dict(current_task=directory.relative_to(root).as_posix())))
    return file
primary = repository('primary space')
sys.path.insert(0, str(primary / '.trellis/scripts'))
from common.active_task import resolve_active_task, resolve_context_key
def resolve(root, session='one'):
    return resolve_active_task(root, dict(session_id=session), platform='codex')
def assert_absent(root, session='one'):
    active = resolve(root, session)
    assert active.task_path is None and active.error is None and not active.stale and active.source_type == 'none', active
${body}
`], { cwd: sandbox, env, encoding: "utf8", timeout: 60_000 });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
}

describe("repository-scoped session task bindings", () => {
  it("A1 resolves identity in primary before linking, then reads the linked task through resolver and CLIs", () => {
    probe(`
assert resolve_context_key(dict(session_id='one'), platform='codex') == 'codex_one'
assert resolve(primary).task_path is None
linked = worktree(primary, 'linked space')
directory = task(linked, title='Linked workspace task')
start(linked, 'one', directory)
active = resolve(primary)
assert active.error is None and not active.stale, active
assert active.invocation_root == primary
assert active.task_workspace_root == linked
assert active.resolved_task_path == directory
common = Path(git(primary, 'rev-parse', '--path-format=absolute', '--git-common-dir')).resolve()
assert active.repository_common_dir == common
record = json.loads((common / 'trellis/sessions/codex_one.json').read_text())
assert record['schema_version'] == 1
assert Path(record['task_workspace_root']) == linked
assert record['current_task'] == '.trellis/tasks/same'
task(primary, title='Same name in wrong workspace')
p = command(primary, 'one', 'current')
assert p.returncode == 0 and p.stdout.strip() == str(directory), (p.stdout, p.stderr)
p = command(primary, 'one', 'current', '--source')
assert 'Current task: ' + str(directory) in p.stdout
assert 'Task workspace: ' + str(linked) in p.stdout
p = current(primary, 'one')
assert p.returncode == 0, (p.stdout, p.stderr)
assert json.loads(p.stdout)['current_task']['title'] == 'Linked workspace task'
p = subprocess.run([sys.executable, '-B', str(primary / '.trellis/scripts/get_context.py'), '--json'], cwd=primary, env=dict(os.environ, CODEX_THREAD_ID='one'), text=True, capture_output=True)
assert p.returncode == 0, p.stderr
assert json.loads(p.stdout)['currentTask']['path'] == '.trellis/tasks/same'
from common.paths import get_current_task_abs
assert get_current_task_abs(primary, dict(session_id='one'), 'codex') == directory
`);
  });

  it("A2/A3 finishes only one session and archives only the exact workspace-qualified task", () => {
    probe(`
left = worktree(primary, 'left')
right = worktree(primary, 'right')
third = worktree(primary, 'third')
left_task, right_task = task(left, title='Left'), task(right, title='Right')
start(left, 'one', left_task)
start(left, 'same-task-peer', left_task)
start(right, 'two', right_task)
old = legacy(left, 'one', left_task)
p = command(primary, 'one', 'finish')
assert p.returncode == 0, (p.stdout, p.stderr)
assert_absent(third, 'one')
assert not old.exists()
assert resolve(primary, 'same-task-peer').resolved_task_path == left_task
assert resolve(primary, 'two').resolved_task_path == right_task
start(left, 'archive-peer', left_task)
legacy(left, 'legacy-archive-peer', left_task)
p = command(third, 'same-task-peer', 'archive', '.trellis/tasks/same', '--no-commit', '--skip-branch-validation')
assert p.returncode == 0, (p.stdout, p.stderr)
assert not left_task.exists() and right_task.is_dir()
for session in ('same-task-peer', 'archive-peer', 'legacy-archive-peer'):
    assert_absent(primary, session)
assert resolve(primary, 'two').resolved_task_path == right_task
assert len(list((left / '.trellis/tasks/archive').glob('*/same/task.json'))) == 1
`);
  });

  it("A2 repoints new and legacy bindings after rename from another checkout", () => {
    probe(`
linked = worktree(primary, 'linked')
directory = task(linked)
other = worktree(primary, 'other')
other_task = task(other)
start(other, 'other-session', other_task)
start(linked, 'one', directory)
old = legacy(linked, 'peer', directory)
p = command(primary, 'one', 'rename', '.trellis/tasks/same', 'renamed')
assert p.returncode == 0, (p.stdout, p.stderr)
assert not directory.exists()
renamed = resolve(primary).resolved_task_path
assert renamed is not None and renamed.name.endswith('renamed')
assert resolve(primary, 'peer').resolved_task_path == renamed
assert json.loads(old.read_text())['current_task'] == renamed.relative_to(linked).as_posix()
assert other_task.is_dir() and resolve(primary, 'other-session').resolved_task_path == other_task
`);
  });

  it("A4 separates independent repositories with identical context keys", () => {
    probe(`
other = repository('other')
linked = worktree(primary, 'linked')
first, second = task(linked, title='First repo'), task(other, title='Other repo')
start(linked, 'one', first)
start(other, 'one', second)
assert resolve(primary).resolved_task_path == first
assert resolve(other).resolved_task_path == second
`);
  });

  it("A5 reads unique legacy binding, refuses ambiguity and prefers new binding", () => {
    probe(`
linked = worktree(primary, 'linked')
directory = task(linked)
old = legacy(linked, 'one', directory)
before = old.read_bytes()
assert resolve(primary).resolved_task_path == directory
assert old.read_bytes() == before
assert resolve(primary).resolved_task_path == directory
local = task(primary)
legacy(primary, 'one', local)
active = resolve(primary)
assert active.error and active.stale, active
assert current(primary, 'one').returncode != 0
start(linked, 'one', directory)
assert resolve(primary).resolved_task_path == directory
p = command(primary, 'one', 'finish')
assert p.returncode == 0, (p.stdout, p.stderr)
assert_absent(primary)
`);
  });

  it.each(["missing-task", "unreadable-task", "corrupt-task", "corrupt-binding", "unknown-schema", "wrong-common", "unregistered", "outside-tasks"])(
    "A6 fails explicitly for %s", (failure) => {
      probe(`
linked = worktree(primary, 'linked')
directory = task(linked)
start(linked, 'one', directory)
common = Path(git(primary, 'rev-parse', '--path-format=absolute', '--git-common-dir'))
binding = common / 'trellis/sessions/codex_one.json'
failure = ${JSON.stringify(failure)}
if failure == 'missing-task':
    (directory / 'task.json').unlink()
elif failure == 'unreadable-task':
    (directory / 'task.json').unlink()
    (directory / 'task.json').mkdir()
elif failure == 'corrupt-task':
    (directory / 'task.json').write_text('[]')
elif failure == 'corrupt-binding':
    legacy(linked, 'one', directory)
    binding.write_text('{broken')
elif failure == 'unknown-schema':
    legacy(linked, 'one', directory)
    record = json.loads(binding.read_text())
    record['schema_version'] = 99
    binding.write_text(json.dumps(record))
elif failure == 'unregistered':
    saved = (directory / 'task.json').read_text()
    git(primary, 'worktree', 'remove', '--force', str(linked))
    directory.mkdir(parents=True)
    (directory / 'task.json').write_text(saved)
    assert json.loads((directory / 'task.json').read_text())['id'] == 'same'
else:
    record = json.loads(binding.read_text())
    if failure == 'wrong-common':
        record['repository_common_dir'] = str(base / 'different.git')
    else:
        record['current_task'] = 'outside'
        (linked / 'outside').mkdir()
        (linked / 'outside/task.json').write_text('{}')
    binding.write_text(json.dumps(record))
active = resolve(primary)
assert active.error and active.stale, active
p = current(primary, 'one')
assert p.returncode != 0 and json.loads(p.stdout).get('error'), (p.stdout, p.stderr)
`);
    },
  );

  it("A7 keeps non-Git storage local and clears it normally", () => {
    probe(`
local = base / 'non git'
local.mkdir()
install(local)
directory = task(local)
start(local, 'one', directory)
assert (local / '.trellis/.runtime/sessions/codex_one.json').is_file()
assert resolve(local).resolved_task_path == directory
assert resolve(local).repository_common_dir is None
assert command(local, 'one', 'finish').returncode == 0
assert_absent(local)
`);
  });

  it("A2 executes finish hooks in task workspace, not caller workspace", () => {
    probe(`
import shlex
linked = worktree(primary, 'linked')
directory = task(linked)
start(linked, 'one', directory)
trace = linked / 'finish-cwd.txt'
code = "from pathlib import Path; Path('finish-cwd.txt').write_text(str(Path.cwd()))"
(linked / 'finish-probe.py').write_text(code)
shell_command = shlex.join([sys.executable, 'finish-probe.py'])
(linked / '.trellis/config.yaml').write_text('hooks:\\n  after_finish:\\n    - ' + shell_command + '\\n')
from common.config import get_hooks
assert get_hooks('after_finish', linked) == [shell_command]
p = command(primary, 'one', 'finish')
assert p.returncode == 0, (p.stdout, p.stderr)
assert trace.is_file(), (p.stdout, p.stderr)
assert trace.read_text() == str(linked)
assert not (primary / 'finish-cwd.txt').exists()
`);
  });

  it("A5 rejects a corrupt legacy-only candidate rather than treating it as absence", () => {
    probe(`
linked = worktree(primary, 'linked')
directory = task(linked)
old = legacy(linked, 'one', directory)
old.write_text('{broken')
active = resolve(primary)
assert active.error and active.stale, active
`);
  });

  it("preserves a legitimate linked task-root symlink", () => {
    probe(`
linked = worktree(primary, 'linked')
backing = base / 'task storage'
backing.mkdir()
(linked / '.trellis/tasks').symlink_to(backing, target_is_directory=True)
directory = task(linked)
start(linked, 'one', directory)
active = resolve(primary)
assert active.error is None and not active.stale, active
assert active.task_workspace_root == linked
assert active.resolved_task_path.resolve() == directory.resolve()
`);
  });

  it("fails closed when live Git discovery is unavailable in a Git checkout", () => {
    probe(`
linked = worktree(primary, 'linked')
directory = task(linked)
start(linked, 'one', directory)
saved_path = os.environ.get('PATH', '')
try:
    os.environ['PATH'] = str(base / 'no-executables')
    active = resolve(primary)
finally:
    os.environ['PATH'] = saved_path
assert active.error and active.stale, active
`);
  });
});

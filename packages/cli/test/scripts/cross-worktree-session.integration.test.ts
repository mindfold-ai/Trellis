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
    (root / '.trellis/workflow.md').write_text('# Workflow\\n[trellis-continuation]\\nCONTINUATION-' + root.name + '\\n[/trellis-continuation]\\n')
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
def task(root, name='same', title=None, task_id=None, generation=0):
    directory = root / '.trellis/tasks' / name
    directory.mkdir(parents=True)
    data = dict(id=task_id or name, name=name, lifecycle_generation=generation,
                source=dict(kind='no_issue'), title=title or name,
                description='Fixture task', status='planning', dev_type=None,
                scope=None, package=None, priority='P2', createdAt='2026-10-01',
                completedAt=None, base_branch=None, worktree_path=None,
                commit=None, pr_url=None, children=[], parent=None,
                relatedFiles=[], notes='', meta={})
    (directory / 'task.json').write_text(json.dumps(data))
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
  it("creates through the real CLI beside mixed historical worktree metadata without changing history", () => {
    probe(`
historical = worktree(primary, 'historical')
old = historical / '.trellis/tasks/09-23-old/task.json'
old.parent.mkdir(parents=True)
raw = json.dumps(dict(id='Old_Reserved', lifecycle_generation=1, creator='old', assignee='old', subtasks=[]))
old.write_text(raw)
old.chmod(0o640)
mode = old.stat().st_mode
source = dict(kind='issue', repo_ref='castbox/Trellis', number=29, disposition='exact_source')
p = command(primary, 'one', 'create', 'Current', '--description', 'Current task', '--slug', 'current', '--task-id', 'current', '--source-json', json.dumps(source), '--no-start')
assert p.returncode == 0, (p.stdout, p.stderr)
directory = next((primary / '.trellis/tasks').glob('*-current'))
data = json.loads((directory / 'task.json').read_text())
assert data['source'] == source and data['lifecycle_generation'] == 0
p = command(primary, 'one', 'start', str(directory), '--allow-empty-context')
assert p.returncode == 0, (p.stdout, p.stderr)
assert resolve(primary).resolved_task_path == directory
before = sorted(p.name for p in (primary / '.trellis/tasks').iterdir())
common = Path(git(primary, 'rev-parse', '--path-format=absolute', '--git-common-dir'))
session = common / 'trellis/sessions/codex_one.json'
session_bytes = session.read_bytes()
for identity in ('Old_Reserved', 'old_reserved'):
    p = command(primary, 'two', 'create', 'Occupied', '--description', 'Occupied', '--slug', 'occupied', '--task-id', identity)
    assert p.returncode == 1 and 'task_id_collision' in p.stderr, (p.stdout, p.stderr)
    assert sorted(p.name for p in (primary / '.trellis/tasks').iterdir()) == before
    assert not (common / 'trellis/sessions/codex_two.json').exists()
p = command(historical, 'one', 'start', str(old.parent), '--allow-empty-context')
assert p.returncode == 1, (p.stdout, p.stderr)
assert session.read_bytes() == session_bytes
assert old.read_text() == raw and old.stat().st_mode == mode
`);
  });

  it("A1 resolves identity in primary before linking, then reads the linked task through resolver and CLIs", () => {
    probe(`
assert resolve_context_key(dict(session_id='one'), platform='codex') == 'codex_one'
assert resolve(primary).task_path is None
linked = worktree(primary, 'linked space')
(linked / '.trellis/workflow.md').write_text('# Linked workflow\\n[trellis-continuation]\\nLINKED-CONTINUATION\\n[/trellis-continuation]\\n')
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
assert record == dict(schema_version=2, task_id='same', lifecycle_generation=0)
task(primary, title='Same name in wrong workspace', task_id='different-id')
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
assert json.loads(p.stdout)['currentTask']['taskWorkspaceRoot'] == str(linked)
p = subprocess.run([sys.executable, '-B', str(primary / '.trellis/scripts/get_context.py'), '--mode', 'continuation'], cwd=primary, env=dict(os.environ, CODEX_THREAD_ID='one'), text=True, capture_output=True)
assert p.returncode == 0, (p.stdout, p.stderr)
assert p.stdout == 'LINKED-CONTINUATION\\n', p.stdout
assert 'CONTINUATION-primary space' not in p.stdout
from common.paths import get_current_task_abs
assert get_current_task_abs(primary, dict(session_id='one'), 'codex') == directory
`);
  });

  it("A2/A3 finishes only one session and archives only the exact workspace-qualified task", () => {
    probe(`
left = worktree(primary, 'left')
right = worktree(primary, 'right')
third = worktree(primary, 'third')
left_task = task(left, title='Left', task_id='left-id')
right_task = task(right, title='Right', task_id='right-id')
start(left, 'one', left_task)
start(left, 'same-task-peer', left_task)
start(right, 'two', right_task)
p = command(primary, 'one', 'finish')
assert p.returncode == 0, (p.stdout, p.stderr)
assert_absent(third, 'one')
assert resolve(primary, 'same-task-peer').resolved_task_path == left_task
assert resolve(primary, 'two').resolved_task_path == right_task
start(left, 'archive-peer', left_task)
p = command(third, 'same-task-peer', 'archive', '.trellis/tasks/same', '--no-commit')
assert p.returncode == 0, (p.stdout, p.stderr)
assert not left_task.exists() and right_task.is_dir()
for session in ('same-task-peer', 'archive-peer'):
    assert_absent(primary, session)
assert resolve(primary, 'two').resolved_task_path == right_task
assert len(list((left / '.trellis/tasks/archive').glob('*/same/task.json'))) == 1
`);
  });

  it("A2 preserves schema-2 session bytes and resolves a renamed task by TaskId", () => {
    probe(`
linked = worktree(primary, 'linked')
directory = task(linked)
other = worktree(primary, 'other')
other_task = task(other, task_id='other-id')
start(other, 'other-session', other_task)
start(linked, 'one', directory)
start(linked, 'peer', directory)
common = Path(git(primary, 'rev-parse', '--path-format=absolute', '--git-common-dir')).resolve()
peer = common / 'trellis/sessions/codex_peer.json'
before = peer.read_bytes()
p = command(primary, 'one', 'rename', '.trellis/tasks/same', 'renamed')
assert p.returncode == 0, (p.stdout, p.stderr)
assert not directory.exists()
renamed = resolve(primary).resolved_task_path
assert renamed is not None and renamed.name.endswith('renamed')
assert resolve(primary, 'peer').resolved_task_path == renamed
assert peer.read_bytes() == before
metadata = json.loads((renamed / 'task.json').read_text())
assert metadata['id'] == 'same' and metadata['name'] == 'renamed'
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

  it("A5 reports schema-v1 and unversioned bindings stale until explicit rebind", () => {
    probe(`
linked = worktree(primary, 'linked')
directory = task(linked)
old = legacy(linked, 'one', directory)
active = resolve(primary)
assert active.task_path is None and active.error and active.stale, active
assert 'unsupported_binding_schema' in active.error, active
common = Path(git(primary, 'rev-parse', '--path-format=absolute', '--git-common-dir')).resolve()
binding = common / 'trellis/sessions/codex_one.json'
binding.parent.mkdir(parents=True, exist_ok=True)
binding.write_text(json.dumps(dict(schema_version=1, repository_common_dir=str(common), task_workspace_root=str(linked), current_task='.trellis/tasks/same')))
active = resolve(primary)
assert active.error and active.stale and 'unsupported_binding_schema' in active.error, active
assert current(primary, 'one').returncode != 0
p = subprocess.run([sys.executable, '-B', str(primary / '.trellis/scripts/get_context.py'), '--mode', 'continuation'], cwd=primary, env=dict(os.environ, CODEX_THREAD_ID='one'), text=True, capture_output=True)
assert p.returncode != 0, (p.stdout, p.stderr)
assert 'CONTINUATION-primary space' not in p.stdout
start(linked, 'one', directory)
assert resolve(primary).resolved_task_path == directory
assert json.loads(binding.read_text()) == dict(schema_version=2, task_id='same', lifecycle_generation=0)
p = command(primary, 'one', 'finish')
assert p.returncode == 0, (p.stdout, p.stderr)
active = resolve(primary)
assert active.task_path is None and active.error and active.stale, active
assert 'unsupported_binding_schema' in active.error, active
assert old.is_file()
`);
  });

  it.each(["missing-task", "unreadable-task", "corrupt-task", "corrupt-binding", "unknown-schema", "extra-fields", "invalid-generation-bool", "invalid-generation-string", "invalid-generation-float", "invalid-generation-negative", "invalid-generation-null", "generation-mismatch", "unregistered"])(
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
    record = json.loads(binding.read_text())
    record['schema_version'] = 99
    binding.write_text(json.dumps(record))
elif failure == 'extra-fields':
    record = json.loads(binding.read_text())
    record['current_task'] = '.trellis/tasks/same'
    binding.write_text(json.dumps(record))
elif failure == 'invalid-generation-bool':
    record = json.loads(binding.read_text())
    record['lifecycle_generation'] = True
    binding.write_text(json.dumps(record))
elif failure == 'invalid-generation-string':
    record = json.loads(binding.read_text())
    record['lifecycle_generation'] = '0'
    binding.write_text(json.dumps(record))
elif failure == 'invalid-generation-float':
    record = json.loads(binding.read_text())
    record['lifecycle_generation'] = 0.5
    binding.write_text(json.dumps(record))
elif failure == 'invalid-generation-negative':
    record = json.loads(binding.read_text())
    record['lifecycle_generation'] = -1
    binding.write_text(json.dumps(record))
elif failure == 'invalid-generation-null':
    record = json.loads(binding.read_text())
    record['lifecycle_generation'] = None
    binding.write_text(json.dumps(record))
elif failure == 'generation-mismatch':
    record = json.loads(binding.read_text())
    record['lifecycle_generation'] = 1
    binding.write_text(json.dumps(record))
elif failure == 'unregistered':
    saved = (directory / 'task.json').read_text()
    git(primary, 'worktree', 'remove', '--force', str(linked))
    directory.mkdir(parents=True)
    (directory / 'task.json').write_text(saved)
    assert json.loads((directory / 'task.json').read_text())['id'] == 'same'
active = resolve(primary)
assert active.error and active.stale, active
p = current(primary, 'one')
assert p.returncode != 0 and json.loads(p.stdout).get('error'), (p.stdout, p.stderr)
p = subprocess.run([sys.executable, '-B', str(primary / '.trellis/scripts/get_context.py'), '--mode', 'continuation'], cwd=primary, env=dict(os.environ, CODEX_THREAD_ID='one'), text=True, capture_output=True)
assert p.returncode != 0, (failure, p.stdout, p.stderr)
assert 'CONTINUATION-primary space' not in p.stdout
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

  it("A5 reports checkout-local legacy files unsupported without reading them", () => {
    probe(`
linked = worktree(primary, 'linked')
directory = task(linked)
old = legacy(linked, 'one', directory)
old.write_text('{broken')
active = resolve(primary)
assert active.task_path is None and active.error and active.stale, active
assert 'unsupported_binding_schema' in active.error, active
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

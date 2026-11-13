"""Measure actual native entries on isolated real Git worktree fixtures.

Run setup once, then sample before/after against the same fixture roots.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

SOURCE = Path(__file__).resolve().parents[4]
TEMPLATES = SOURCE / 'packages/cli/src/templates/trellis'
RESULTS = Path(__file__).resolve().parent
STATE = SOURCE / '.trellis/.runtime/guru-814-context-validation/fixture.json'


def run(root, argv, env, **kwargs):
    return subprocess.run(argv, cwd=root, env=env, capture_output=True,
                          text=True, encoding='utf-8', **kwargs)


def environment(base):
    env = {k: v for k, v in os.environ.items() if k in {
        'PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'PATHEXT'}}
    env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=str(base / 'absent-config'),
               GIT_CONFIG_COUNT='1', GIT_CONFIG_KEY_0='core.hooksPath',
               GIT_CONFIG_VALUE_0=str(base / 'empty-hooks'),
               PYTHONNOUSERSITE='1', PYTHONDONTWRITEBYTECODE='1',
               TRELLIS_CONTEXT_ID='measure-bound')
    return env


def git(root, env, *argv):
    result = run(root, ['git', '-C', str(root), *argv], env)
    assert result.returncode == 0, (argv, result.stdout, result.stderr)
    return result.stdout.strip()


def install(root):
    shutil.copytree(TEMPLATES / 'scripts', root / '.trellis/scripts',
                    dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__'))
    (root / '.trellis/config.yaml').write_text('task_auto_commit: false\n', encoding='utf-8')


def setup():
    base = Path(tempfile.mkdtemp(prefix='trellis-context-measure-')).resolve()
    env = environment(base)
    fixtures = []
    for count in (2, 169):
        folder = base / str(count)
        root = folder / 'primary space'
        root.mkdir(parents=True)
        git(root, env, 'init', '-q', '-b', 'main')
        git(root, env, 'config', 'maintenance.auto', 'false')
        git(root, env, 'config', 'gc.auto', '0')
        git(root, env, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
            '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'Fixture')
        roots = [root]
        workflow = (TEMPLATES / 'workflow-delivery-v1.md').read_text(encoding='utf-8')
        for index in range(1, count):
            peer = folder / ('linked space' if index == 1 else f'peer-{index}')
            git(root, env, 'worktree', 'add', '-q', '-b', f'peer-{index}', str(peer))
            roots.append(peer)
        for index, peer in enumerate(roots):
            (peer / '.trellis').mkdir()
            # Distinct valid owners prove get_context selected the Task workspace.
            (peer / '.trellis/workflow.md').write_text(
                workflow.replace('"task_scope": "trellis-start"',
                                 f'"task_scope": "fixture-owner-{index}"'), encoding='utf-8')
        install(root)
        install(roots[1])
        peer = roots[1]
        command = [sys.executable, '-B', str(peer / '.trellis/scripts/task.py')]
        created = run(peer, command + ['create', 'Measured task', '--description', 'Fixture',
            '--task-id', 'measured-task', '--slug', 'measured-task', '--schema-version', '2.0',
            '--no-start'], env)
        assert created.returncode == 0, (created.stdout, created.stderr)
        task = next((peer / '.trellis/tasks').glob('*-measured-task'))
        started = run(peer, command + ['start', str(task), '--allow-empty-context'], env)
        assert started.returncode == 0, (started.stdout, started.stderr)
        common = Path(git(root, env, 'rev-parse', '--path-format=absolute', '--git-common-dir'))
        binding = common / 'trellis/task-branches/measured-task/0.json'
        binding.parent.mkdir(parents=True, exist_ok=True)
        binding.write_text(json.dumps(dict(schema_version='1.0', task_id='measured-task',
            lifecycle_generation=0, binding_revision=1, branch_name='peer-1')), encoding='utf-8')
        fixtures.append(dict(count=count, root=str(root), peer=str(peer), task=str(task)))
    state = dict(base=str(base), fixtures=fixtures, python=sys.executable,
                 python_version=sys.version, git=git(root, env, '--version'))
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(state))


BOOTSTRAP = '''
import atexit, json, runpy, sys, traceback
from pathlib import Path
entry, audit_path, *args = sys.argv[1:]
calls = []
def audit(event, args):
    if event == 'subprocess.Popen' and Path(str(args[0])).name == 'git':
        frames = traceback.extract_stack()
        source = next((f.name for f in reversed(frames) if f.filename.endswith('session_storage.py') and f.name != '_git'), 'other')
        calls.append(dict(argv=args[1], source=source))
sys.addaudithook(audit)
atexit.register(lambda: Path(audit_path).write_text(json.dumps(calls), encoding='utf-8'))
sys.path.insert(0, str(Path(entry).parent))
sys.argv = [entry, *args]
runpy.run_path(entry, run_name='__main__')
'''



def snapshot(fixture, env):
    root = Path(fixture['root'])
    listing = git(root, env, 'worktree', 'list', '--porcelain', '-z')
    roots = [Path(record.split('\0')[0][len('worktree '):])
             for record in listing.split('\0\0') if record.startswith('worktree ')]
    common = Path(git(root, env, 'rev-parse', '--path-format=absolute', '--git-common-dir'))
    paths = []
    for workspace in roots:
        paths.extend(p for p in (workspace / '.trellis').rglob('*') if p.is_file())
        if (workspace / '.git').is_file():
            paths.append(workspace / '.git')
    for directory in (common / 'trellis', common / 'worktrees'):
        paths.extend(p for p in directory.rglob('*') if p.is_file())
    return {str(p): (hashlib.sha256(p.read_bytes()).hexdigest(), p.stat().st_mode)
            for p in paths if '__pycache__' not in p.parts}


def sample(label):
    state = json.loads(STATE.read_text(encoding='utf-8'))
    base = Path(state['base'])
    env = environment(base)
    samples = []
    for fixture in state['fixtures']:
        root, peer = Path(fixture['root']), Path(fixture['peer'])
        install(root)
        install(peer)
        for shape in ('known-key-miss', 'bound-remote', 'explicit-task'):
            current_env = dict(env, TRELLIS_CONTEXT_ID='measure-missing' if shape == 'known-key-miss' else 'measure-bound')
            if shape == 'explicit-task':
                entry, args = peer / '.trellis/scripts/task.py', ['start', fixture['task'], '--allow-empty-context']
            else:
                entry, args = root / '.trellis/scripts/get_context.py', ['--mode', 'runtime-contract', '--json']
            audit = base / f'{label}-{fixture["count"]}-{shape}.json'
            before = snapshot(fixture, current_env)
            start = time.perf_counter()
            result = run(root, [sys.executable, '-B', '-c', BOOTSTRAP, str(entry), str(audit), *args], current_env)
            elapsed = time.perf_counter() - start
            unchanged = before == snapshot(fixture, current_env)
            calls = json.loads(audit.read_text(encoding='utf-8'))
            families = Counter(' '.join(call['argv'][3:]) for call in calls)
            sources = Counter(call['source'] for call in calls)
            item = dict(count=fixture['count'], shape=shape, elapsed_seconds=round(elapsed, 4),
                        returncode=result.returncode, stdout=result.stdout, stderr=result.stderr,
                        git_calls=len(calls), families=dict(families), sources=dict(sources),
                        task_session_peer_bytes_and_modes_unchanged=unchanged)
            samples.append(item)
            print(json.dumps(item), flush=True)
            assert result.returncode == 0 and unchanged, item
            if shape != 'explicit-task':
                assert json.loads(result.stdout)['owners']['task_scope'] == (
                    'fixture-owner-0' if shape == 'known-key-miss' else 'fixture-owner-1'), item
    result = dict(label=label, python=state['python'], python_version=state['python_version'],
                  git=state['git'], source_head=git(SOURCE, env, 'rev-parse', 'HEAD'),
                  session_storage_sha256=hashlib.sha256((TEMPLATES / 'scripts/common/session_storage.py').read_bytes()).hexdigest(),
                  samples=samples)
    (RESULTS / f'{label}.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=('setup', 'before', 'after'))
    args = parser.parse_args()
    setup() if args.action == 'setup' else sample(args.action)

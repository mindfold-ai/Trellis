#!/usr/bin/env python3
"""Verify a paired local-tarball install using the real installed CLI and writers.

Usage: python3 verify_install.py --prefix /isolated/npm/prefix --output report.json
Packaging and npm installation are performed separately and recorded alongside.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--prefix', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    prefix = args.prefix.resolve()
    repo = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
    package = prefix / 'node_modules/@mindfoldhq/trellis'
    cli = package / 'bin/trellis.js'
    env = {key: value for key, value in os.environ.items()
           if not key.upper().startswith('GIT_') and key not in {
               'CLAUDE_PROJECT_DIR', 'QODER_PROJECT_DIR', 'CODEBUDDY_PROJECT_DIR',
               'FACTORY_PROJECT_DIR', 'CURSOR_PROJECT_DIR', 'GEMINI_PROJECT_DIR',
               'KIRO_PROJECT_DIR', 'COPILOT_PROJECT_DIR', 'CLAUDE_ENV_FILE'}}
    env.update(TRELLIS_CONTEXT_ID='issue47-install-verification', PYTHONDONTWRITEBYTECODE='1')
    report = {'prefix': str(prefix), 'source_head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
              'kind': 'isolated packed installation; synthetic fixture, no business adoption', 'commands': [], 'checks': {}}
    def run(root: Path, *command: str) -> str:
        process = subprocess.run(list(command), cwd=root, env=env, capture_output=True, text=True)
        report['commands'].append({'argv': list(command), 'cwd': str(root), 'exit_code': process.returncode,
                                   'stdout_tail': process.stdout[-2500:], 'stderr_tail': process.stderr[-1000:]})
        if process.returncode:
            raise RuntimeError(f'{command[:3]}: {process.stderr}\n{process.stdout}')
        return process.stdout
    def digest(data: bytes) -> str:
        return 'sha256:' + hashlib.sha256(data).hexdigest()
    try:
        report['cli_version'] = json.loads((package / 'package.json').read_text())['version']
        dependency = json.loads((package / 'package.json').read_text())['dependencies']['@mindfoldhq/trellis-core']
        core_file = run(prefix, 'node', '--input-type=module', '-e',
                        "import {createRequire} from 'node:module';const r=createRequire(process.argv[1]);console.log(r.resolve('@mindfoldhq/trellis-core'));", str(package / 'package.json')).strip()
        core = prefix / 'node_modules/@mindfoldhq/trellis-core'
        assert Path(core_file).resolve().is_relative_to(core.resolve())
        assert dependency == report['cli_version'] == json.loads((core / 'package.json').read_text())['version']
        report['checks']['exact_paired_core_resolution'] = True
        with tempfile.TemporaryDirectory(prefix='issue47-installed-project-') as tmp:
            root = Path(tmp)
            run(root, 'git', 'init', '-q', '--initial-branch=main')
            run(root, 'git', 'config', 'user.name', 'Issue47 installation fixture')
            run(root, 'git', 'config', 'user.email', 'fixture@example.invalid')
            for name in ['requirements.md', 'plan.md']:
                (root / name).write_text('R1: isolated installation verification fixture\n')
            for name in ['artifact.txt', 'duplicate.txt']:
                (root / name).write_bytes(b'unchanged candidate bytes\0\n')
                (root / name).chmod(0o755 if name == 'duplicate.txt' else 0o644)
            run(root, 'git', 'add', '.')
            run(root, 'git', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'immutable candidate fixture')
            head = run(root, 'git', 'rev-parse', 'HEAD').strip()
            run(root, 'node', str(cli), 'init', '--yes', '--codex', '--workflow', 'native-delivery-v1', '--no-monorepo')
            scripts = root / '.trellis/scripts'
            canonical = repo / 'packages/cli/src/templates/trellis/scripts'
            installed_files = {}
            for name in ['common/git_objects.py', 'common/task_store.py', 'common/delivery_store.py']:
                target = scripts / name
                assert target.read_bytes() == (canonical / name).read_bytes(), name
                assert target.stat().st_mode & 0o777 == 0o755, name
                installed_files[name] = {'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'mode': '0755'}
            report['installed_owner_files'] = installed_files
            assert json.loads(run(root, sys.executable, str(scripts / 'delivery.py'), 'contract', '--json')) == {'delivery_api': '1.0', 'task_schema': '2.0'}
            run(root, sys.executable, str(scripts / 'task.py'), 'create', 'Installed issue47 fixture', '--description', 'Synthetic public writer verification', '--slug', 'install-verification', '--no-start', '--base-branch', 'main')
            task = next((root / '.trellis/tasks').glob('*-install-verification'))
            contract = json.loads(run(root, sys.executable, '-c',
                                     'import json,sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from common.runtime_contract import read_runtime_contract;print(json.dumps(read_runtime_contract(Path(sys.argv[2]))))',
                                     str(scripts), str(root / '.trellis/workflow.md')))
            delivery = '11111111-1111-4111-8111-111111111111'
            owners = contract['owners']
            def ref(name: str) -> dict:
                return {'locator': name, 'revision': digest((root / name).read_bytes())}
            scope = {'authority': ref('requirements.md'), 'anchors': ['R1']}
            def apply(operation: str, role: str, fields: dict) -> dict:
                key = {'task_id': 'install-verification', 'lifecycle_generation': 0}
                if operation != 'accept_scope': key['delivery_id'] = delivery
                value = {'api_version': '1.0', 'operation': operation, 'key': key, 'owner_role': role, 'owner_id': owners[role], **fields}
                source = root / 'operation.json'; source.write_text(json.dumps(value))
                return json.loads(run(root, sys.executable, str(scripts / 'delivery.py'), 'apply', '--task', str(task), '--input', str(source)))
            apply('accept_scope', 'task_scope', {'authority': scope['authority']})
            apply('create_delivery', 'creation', {'scope_ref': scope, 'profile': 'local_commit'})
            paths = ['artifact.txt', 'duplicate.txt', 'deleted.txt']
            current = {'kind': 'git', 'paths': paths, 'head_ref': head, 'base_ref': None,
                       **json.loads(run(root, sys.executable, str(scripts / 'delivery.py'), 'candidate', '--kind', 'git', '--paths', *paths))}
            def gate(role: str, phase: str, previous: str | None, candidate: dict | None) -> str:
                identity = 'installation-' + role
                apply('record_gate', role, {'expected_phase': phase, 'result': {
                    'result_id': identity, 'owner_role': role, 'owner_id': owners[role],
                    'outcome': 'accepted' if role == 'planning' else 'ready' if role == 'readiness' else 'passed',
                    'scope_ref': scope, 'plan_ref': ref('plan.md'), 'candidate': candidate,
                    'predecessor_result_id': previous, 'obligations': [], 'evidence': [ref('plan.md')]}})
                return identity
            planning = gate('planning', 'planning', None, None)
            apply('begin_check', 'implementation', {'expected_phase': 'implementing', 'candidate': current})
            check = gate('check', 'checking', planning, current)
            review = gate('full_review', 'reviewing', check, current)
            gate('readiness', 'reviewing', review, current)
            fields = {'expected_phase': 'publishing', 'result': {'result_id': 'installed-delivery', 'owner_id': owners['delivery'],
                      'evidence': [ref('plan.md')], 'candidate': current, 'profile': 'local_commit', 'commit': head}}
            assert apply('record_delivery', 'delivery', fields)['changed'] is True
            previous = (task / 'task.json').read_bytes()
            assert apply('record_delivery', 'delivery', fields)['changed'] is False
            assert (task / 'task.json').read_bytes() == previous
            report['checks']['installed_public_normal_delivery_and_retry'] = True
            helper = scripts / 'common/git_objects.py'
            canonical_bytes = helper.read_bytes()
            run(root, 'node', str(cli), 'update', '--force')
            assert helper.read_bytes() == canonical_bytes and (task / 'task.json').read_bytes() == previous
            report['checks']['same_version_reapply_preserves_task'] = True
            helper.write_bytes(canonical_bytes + b'\n# isolated user customization\n'); helper.chmod(0o640)
            user_bytes = helper.read_bytes()
            hashes = root / '.trellis/.template-hashes.json'
            hashes_before = hashes.read_bytes()
            preview = run(root, 'node', str(cli), 'update', '--dry-run')
            assert 'git_objects.py' in preview
            assert helper.read_bytes() == user_bytes and hashes.read_bytes() == hashes_before
            run(root, 'node', str(cli), 'update', '--create-new')
            assert helper.read_bytes() == user_bytes and helper.stat().st_mode & 0o777 == 0o640
            assert Path(str(helper) + '.new').read_bytes() == canonical_bytes
            report['checks']['drift_preview_sidecar_preserves_custom_bytes_mode'] = True
            run(root, 'node', str(cli), 'update', '--force')
            assert helper.read_bytes() == canonical_bytes and helper.stat().st_mode & 0o777 == 0o755
            assert (task / 'task.json').read_bytes() == previous
            report['checks']['force_reapply_restores_managed_bytes_mode'] = True
            installed_hashes = json.loads(hashes.read_text())['hashes']
            assert installed_hashes['.trellis/scripts/common/git_objects.py'] == hashlib.sha256(canonical_bytes).hexdigest()
            report['checks']['new_helper_tracked_in_managed_inventory'] = True
        report['passed'] = True
    finally:
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': report['passed'], 'checks': report['checks']}, indent=2))


if __name__ == '__main__':
    main()

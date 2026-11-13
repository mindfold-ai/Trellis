/** Directed installed-public tools proof on the retained real 169-worktree fixture. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const [prefixArg, fixtureArg, reportArg] = process.argv.slice(2);
assert(prefixArg && fixtureArg && reportArg,
  'Usage: node verify-packed-tools.mjs <installed-prefix> <fixture.json> <new-report.json>');
assert(!fs.existsSync(reportArg), 'The report must be new.');
const prefix = path.resolve(prefixArg);
const fixture = JSON.parse(fs.readFileSync(fixtureArg, 'utf8'));
const { root, peer, task } = fixture.fixtures.find(item => item.count === 169);
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'guru814-packed-tools-')));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  ['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'PATHEXT'].includes(key)));
Object.assign(env, {
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(base, 'absent-config'),
  GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath',
  GIT_CONFIG_VALUE_0: path.join(base, 'empty-hooks'),
  PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1',
  TRELLIS_CONTEXT_ID: 'measure-bound', TRELLIS_PYTHON_CMD: '/usr/bin/python3',
});
// Public SDK selection uses the same environment as fresh public-bin consumers.
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, env);
const requireInstalled = createRequire(path.join(prefix, 'package.json'));
const { maintenance } = await import(pathToFileURL(requireInstalled.resolve('@mindfoldhq/trellis')).href);
const cliRoot = path.dirname(path.dirname(requireInstalled.resolve('@mindfoldhq/trellis')));
const cli = JSON.parse(fs.readFileSync(path.join(cliRoot, 'package.json')));
const core = JSON.parse(fs.readFileSync(requireInstalled.resolve('@mindfoldhq/trellis-core/package.json')));
assert.equal(cli.version, core.version);
assert.equal(cli.dependencies['@mindfoldhq/trellis-core'], core.version);
const bin = path.join(cliRoot, 'bin/trellis.js');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {
  status: 'running', package_pair: { cli: cli.version, core: core.version,
    exact_core_dependency: cli.dependencies['@mindfoldhq/trellis-core'] },
  installed_prefix: prefix, fixture_root: root, registered_worktrees: 169,
  python_command: env.TRELLIS_PYTHON_CMD, commands: [], checks: {},
  boundary: 'Same-candidate normal recovery; no historical timeout reproduction or downstream adoption.',
};
function run(command, args, label) {
  const start = performance.now();
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  report.commands.push({ label, status: result.status,
    elapsed_ms: Math.round(performance.now() - start),
    stdout_sha256: sha(result.stdout ?? ''), stderr: result.stderr ?? '',
    ...(result.error ? { executor_error: result.error.code ?? result.error.message } : {}) });
  assert.equal(result.status, 0, `${label}: ${result.error?.code ?? 'exit failure'}; see command summary`);
  return result.stdout.trim();
}
const publicBin = (label, ...args) => JSON.parse(run(process.execPath,
  [bin, 'maintain', ...args, '--json'], label));
function scan(directory) {
  if (!fs.existsSync(directory)) return null;
  const entries = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '__pycache__') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else entries.push([path.relative(directory, full), fs.statSync(full).mode & 0o777,
        sha(fs.readFileSync(full))]);
    }
  }
  visit(directory);
  return sha(JSON.stringify(entries));
}
try {
  report.python_version = run('/usr/bin/python3', ['--version'], 'selected Python version');
  const roots = run('git', ['worktree', 'list', '--porcelain', '-z'], 'real topology')
    .split('\0').filter(value => value.startsWith('worktree ')).map(value => value.slice(9));
  assert.equal(roots.length, 169);
  const common = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], 'shared control root');
  // Give this existing isolated fixture a supported predecessor installation version.
  fs.writeFileSync(path.join(root, '.trellis/.version'), '0.6.15\n');
  fs.writeFileSync(path.join(root, 'unrelated-dirty.txt'), 'Preserve this fixture file.\n');
  const preserved = () => ({
    peers: roots.filter(value => value !== root).map(value => [value, scan(value)]),
    shared_controls: scan(path.join(common, 'trellis')),
    selected_task: scan(task), local_tasks: scan(path.join(root, '.trellis/tasks')),
    unrelated: sha(fs.readFileSync(path.join(root, 'unrelated-dirty.txt'))),
  });
  const before = preserved();
  const inspection = await maintenance.inspectToolsTarget({ root });
  const input = { kind: 'tools_install', input: {
    root, workflow: { action: 'install', template_id: 'native-delivery-v1',
      provider: 'bundled', ownership: 'bundled',
      content: fs.readFileSync(path.join(cliRoot, 'dist/templates/trellis/workflow-delivery-v1.md'), 'utf8') },
    file_decisions: inspection.files.filter(file => file.status === 'conflict')
      .map(file => ({ path: file.path, source: file.source, action: 'replace' })),
  } };
  const inputFile = path.join(base, 'input.json'), planFile = path.join(base, 'plan.json');
  fs.writeFileSync(inputFile, JSON.stringify(input));
  const plan = publicBin('prepare once', 'prepare', '--input', inputFile);
  assert(!plan.error);
  fs.writeFileSync(planFile, JSON.stringify(plan));
  const originalPlan = JSON.stringify(plan);
  assert.equal(publicBin('preview', 'preview', '--plan', planFile).status, 'prepared');
  const applied = publicBin('apply', 'apply', '--plan', planFile, '--state-dir', path.join(base, 'state'));
  assert.equal(applied.status, 'applied');
  assert.equal(applied.operation_id, plan.operation_id);
  assert(applied.recovery_ref);
  const originalStored = JSON.parse(fs.readFileSync(applied.recovery_ref, 'utf8'));
  assert.deepEqual(originalStored.plan, plan);
  const preimageHash = sha(JSON.stringify(plan.actions.map(action => action.source)));
  // Read the original persisted operation after apply as the lost-output recovery path.
  const recovered = publicBin('recover original ref', 'recover', '--recovery', applied.recovery_ref);
  const resumed = publicBin('resume original ref', 'resume', '--recovery', applied.recovery_ref);
  for (const result of [recovered, resumed]) {
    assert.equal(result.status, 'applied');
    assert.equal(result.operation_id, plan.operation_id);
    assert.equal(result.recovery_ref, applied.recovery_ref);
    assert.deepEqual(result.pending_paths, []);
  }
  const finalStored = JSON.parse(fs.readFileSync(applied.recovery_ref, 'utf8'));
  assert.equal(JSON.stringify(finalStored.plan), originalPlan);
  assert.equal(sha(JSON.stringify(finalStored.plan.actions.map(action => action.source))), preimageHash);
  assert.equal(finalStored.phase, 'applied');
  assert.deepEqual(preserved(), before);
  const native = (label, script, ...args) => run('/usr/bin/python3',
    ['-B', path.join(root, '.trellis/scripts', script), ...args], label);
  const contract = JSON.parse(native('installed native contract', 'delivery.py', 'contract', '--json'));
  assert.equal(contract.delivery_api, '1.0'); assert.equal(contract.task_schema, '2.0');
  const runtime = JSON.parse(native('installed bound native context', 'get_context.py', '--mode', 'runtime-contract', '--json'));
  assert.equal(runtime.owners.task_scope, 'fixture-owner-1');
  const selected = JSON.parse(native('installed selected Task', 'task.py', 'current', '--json'));
  assert(JSON.stringify(selected).includes('measured-task'));
  assert.equal(fs.readFileSync(path.join(root, '.trellis/scripts/common/session_storage.py'), 'utf8'),
    fs.readFileSync(path.join(cliRoot, 'dist/templates/trellis/scripts/common/session_storage.py'), 'utf8'));
  report.operation = { operation_id: plan.operation_id, recovery_ref: applied.recovery_ref,
    candidate: plan.candidate, original_plan_sha256: sha(originalPlan), preimages_sha256: preimageHash };
  report.checks = { real_169_worktree_topology: true, exact_installed_pair: true,
    prepare_once: true, same_original_ref_and_plan: true, original_preimages_retained: true,
    native_contract_and_bound_task_workflow: true, selected_task_and_all_peers_preserved: true,
    installed_python_bytes_match_packed_template: true, natural_internal_timeout_observed: false };
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = String(error.stack ?? error); throw error;
} finally {
  fs.writeFileSync(reportArg, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: report.status, report: reportArg, private_state: base })}\n`);
}

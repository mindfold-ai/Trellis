/** One isolated old installation; public packed pair + target-native consumers. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const [prefixArg, outputArg] = process.argv.slice(2);
assert(prefixArg && outputArg, 'Usage: node verify-packed-candidate.mjs <npm-prefix> <report.json>');
const prefix = path.resolve(prefixArg), output = path.resolve(outputArg);
const requireInstalled = createRequire(path.join(prefix, 'package.json'));
const load = async name => import(pathToFileURL(requireInstalled.resolve(name)).href);
const { maintenance } = await load('@mindfoldhq/trellis');
const { emptyTaskRecord } = await load('@mindfoldhq/trellis-core/task/legacy-migration');
const { emptyTaskRecordV2, computeCandidateContentRef } = await load('@mindfoldhq/trellis-core/task/v2');
const cliRoot = path.dirname(requireInstalled.resolve('@mindfoldhq/trellis')).replace(/\/dist$/, '');
const bin = path.join(cliRoot, 'bin/trellis.js');
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'issue46-packed-')));
const root = path.join(base, 'target'); fs.mkdirSync(root);
const report = { kind: 'isolated packed CLI/Core; no business or Guru overlay writes', prefix, root, commands: [], checks: {} };
const cliPackage = JSON.parse(fs.readFileSync(path.join(cliRoot, 'package.json')));
const corePackage = JSON.parse(fs.readFileSync(requireInstalled.resolve('@mindfoldhq/trellis-core/package.json')));
assert.equal(cliPackage.version, corePackage.version);
assert.equal(cliPackage.dependencies['@mindfoldhq/trellis-core'], corePackage.version);
report.package_pair = { cli_version: cliPackage.version, core_version: corePackage.version, exact_core_dependency: cliPackage.dependencies['@mindfoldhq/trellis-core'] };
const sha = value => createHash('sha256').update(value).digest('hex');
const raw = (text, mode = 0o640) => ({ content_base64: Buffer.from(text).toString('base64'), sha256: sha(text), mode });
const put = (ref, value, mode = 0o640) => {
  const full = path.join(root, ref); fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); fs.chmodSync(full, mode);
};
function run(cwd, command, args, env = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  report.commands.push({ command, args, status: result.status, stdout: result.stdout, stderr: result.stderr });
  assert.equal(result.status, 0, result.stdout + result.stderr); return result.stdout.trim();
}
const git = (...args) => run(root, 'git', args);
const publicBin = (...args) => JSON.parse(run(root, process.execPath, [bin, 'maintain', ...args, '--json']));
const native = (script, ...args) => run(root, process.platform === 'win32' ? 'python' : 'python3', [`.trellis/scripts/${script}`, ...args], { TRELLIS_CONTEXT_ID: 'codex_issue46_packed' });
const tree = ref => {
  const full = path.join(root, ref), stat = fs.statSync(full);
  return stat.isDirectory() ? [stat.mode & 0o777, fs.readdirSync(full).sort().map(name => [name, tree(`${ref}/${name}`)])] : [stat.mode & 0o777, fs.readFileSync(full).toString('base64')];
};
try {
  git('init', '-b', 'main'); git('config', 'user.name', 'Issue46 isolated fixture'); git('config', 'user.email', 'fixture@example.invalid');
  put('README.md', 'Original delivered slice\n', 0o644); git('add', 'README.md'); git('commit', '-m', 'Original delivered fixture');
  const head = git('rev-parse', 'HEAD'), common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  const key = { task_id: 'selected', lifecycle_generation: 0 };
  const archiveRef = '.trellis/tasks/archive/2026-10/manual-history';
  const originalRef = '.trellis/tasks/original-location', activeRef = '.trellis/tasks/resumed-location';
  const scope = 'Original accepted Task scope. A supplement remains pending.\n';
  const review = 'Original owner reviewed history and manual archive: no pending Closure/Finish transaction; continue same Task for scope review.\n';
  const old = emptyTaskRecord({ id: key.task_id, name: 'Selected', title: 'Selected', status: 'completed', branch: 'main', commit: head });
  put(`${archiveRef}/task.json`, old); put(`${archiveRef}/prd.md`, scope, 0o600); put(`${archiveRef}/manual-history.md`, review);
  fs.mkdirSync(path.join(root, archiveRef, 'empty'), { mode: 0o700 });
  put('.trellis/.version', '0.6.15\n'); put('.trellis/workflow.md', '# Old custom workflow\n');
  const poison = "raise RuntimeError('OLD DISPATCHER MUST NOT EXECUTE')\n";
  put('.trellis/scripts/task.py', poison, 0o755);
  put('.trellis/spec/project.md', 'Keep project-owned specs\n', 0o600); put('unrelated-dirty.txt', 'Preserve unrelated work\n');
  const carrierRef = 'trellis/sessions/codex_issue46_packed.json';
  fs.mkdirSync(path.dirname(path.join(common, carrierRef)), { recursive: true });
  fs.writeFileSync(path.join(common, carrierRef), JSON.stringify({ schema_version: 1, repository_common_dir: common, task_workspace_root: root, current_task: originalRef, platform: 'codex', last_seen_at: '2026-10-17T00:00:00Z', current_run: null }) + '\n');
  const originalArchive = tree(archiveRef);
  const inspectedBeforeTools = publicBin('inspect-task', '--target', root, '--task-id', key.task_id, '--generation', '0', '--task-ref', archiveRef, '--original-task-ref', originalRef);
  assert.equal(inspectedBeforeTools.classification.kind, 'schema1');
  assert.equal(fs.readFileSync(path.join(root, '.trellis/scripts/task.py'), 'utf8'), poison);
  report.checks.independent_inspection_before_old_dispatcher = true;

  const toolInspection = await maintenance.inspectToolsTarget({ root });
  const toolPlan = await maintenance.prepareToolsInstallation({ root, workflow: { action: 'install', template_id: 'native-delivery-v1', provider: 'bundled', ownership: 'bundled', content: fs.readFileSync(path.join(cliRoot, 'dist/templates/trellis/workflow-delivery-v1.md'), 'utf8') }, file_decisions: toolInspection.files.filter(file => file.status === 'conflict').map(file => ({ path: file.path, source: file.source, action: 'replace' })) });
  const tools = await maintenance.applyMaintenance(toolPlan, { state_dir: path.join(base, 'tool-state') });
  assert.equal(tools.status, 'applied'); assert.deepEqual(tree(archiveRef), originalArchive);
  report.tools = { operation_id: tools.operation_id, recovery_ref: tools.recovery_ref, candidate: toolPlan.candidate };
  report.checks.tools_install_preserves_archive_and_project_files = true;

  const inspection = maintenance.inspectTaskTarget({ root, key, task_ref: archiveRef, original_task_ref: originalRef });
  const metadata = Object.fromEntries(Object.entries(old).filter(([field]) => !['status', 'commit', 'pr_url', 'completedAt'].includes(field)));
  const projection = emptyTaskRecordV2(metadata);
  const authority = { locator: `${activeRef}/prd.md`, revision: `sha256:${sha(scope)}` };
  projection.accepted_scope = authority;
  const deliveryId = '11111111-1111-4111-8111-111111111111', resultId = 'packed-historical-delivery';
  const historicalCandidate = { kind: 'git', content_ref: computeCandidateContentRef(root, ['README.md'], 'git'), paths: ['README.md'], head_ref: head, base_ref: head };
  projection.deliveries = [{ id: deliveryId, lifecycle_generation: 0, scope_ref: { authority, anchors: ['original-delivered-slice'] }, planning_root: `deliveries/${deliveryId}`, profile: 'local_commit', phase: 'delivered', plan_ref: null, candidate: null, results: { planning: null, check: null, full_review: null, readiness: null }, publication_result: null, delivery_result: { result_id: resultId, owner_id: 'trellis-deliver', evidence: [{ locator: `${archiveRef}/manual-history.md`, revision: `sha256:${sha(review)}` }], profile: 'local_commit', candidate: historicalCandidate, commit: head }, stop_result: null }];
  const artifacts = inspection.artifacts.filter(entry => entry.kind === 'file' && entry.path !== `${archiveRef}/task.json`).map(entry => ({ path: entry.path, action: 'preserve', source: entry.source }));
  for (const name of ['prd.md', 'design.md', 'implement.md', 'implement.jsonl', 'check.jsonl']) artifacts.push({ path: `${archiveRef}/deliveries/${deliveryId}/${name}`, action: 'write', source: null, target: raw(name.endsWith('.jsonl') ? '' : 'Original verified delivery plan\n') });
  const resumeInput = { root, key, task_ref: archiveRef, original_task_ref: originalRef, active_ref: activeRef, source_kind: 'schema1', projection, artifacts, legacy_facts: [{ field: 'commit', disposition: 'delivery_result', result_id: resultId, owner_id: 'trellis-deliver', reason: { locator: `${archiveRef}/manual-history.md`, revision: `sha256:${sha(review)}` } }], sessions: inspection.carriers.map(carrier => ({ carrier, action: 'replace', delivery_id: null })), branch_binding: { action: 'establish', source: null, record: { schema_version: '1.0', ...key, binding_revision: 1, branch_name: 'main' } }, resume_intent: { reason: { locator: `${archiveRef}/manual-history.md`, revision: `sha256:${sha(review)}` }, archive_review: { locator: `${archiveRef}/manual-history.md`, revision: `sha256:${sha(review)}` }, next_owner_id: 'trellis-start', next_action: 'accept_scope' } };
  const inputFile = path.join(base, 'input.json'), planFile = path.join(base, 'plan.json');
  fs.writeFileSync(inputFile, JSON.stringify({ kind: 'task_resume', input: resumeInput }));
  const plan = publicBin('prepare', '--input', inputFile); fs.writeFileSync(planFile, JSON.stringify(plan));
  assert.equal(publicBin('preview', '--plan', planFile).status, 'prepared');
  const applied = publicBin('apply', '--plan', planFile, '--state-dir', path.join(base, 'resume-state'));
  assert.equal(applied.status, 'applied'); assert.deepEqual(applied.resumed_task, { key, task_ref: activeRef });
  assert.deepEqual(publicBin('recover', '--recovery', applied.recovery_ref).resumed_task, applied.resumed_task);
  assert.equal(publicBin('resume', '--recovery', applied.recovery_ref).operation_id, plan.operation_id);
  assert.deepEqual(tree(archiveRef), originalArchive);
  const restored = JSON.parse(fs.readFileSync(path.join(root, activeRef, 'task.json')));
  assert.equal(restored.deliveries.length, 1); assert.deepEqual(restored.completion_results, []); assert.deepEqual(restored.closure_results, []);
  assert.deepEqual(restored.deliveries[0].results, { planning: null, check: null, full_review: null, readiness: null });
  report.checks.same_identity_history_no_empty_delivery_or_completion = true;
  report.resume = { operation_id: plan.operation_id, recovery_ref: applied.recovery_ref, resumed_task: applied.resumed_task, candidate: plan.candidate };
  const identity = native('task.py', 'current', '--json'); assert(identity.includes('selected'));
  const continuation = native('get_context.py', '--mode', 'continuation'); assert(continuation.includes('whole-scope acceptance'));
  const history = JSON.parse(native('delivery.py', 'list', '--task', activeRef, '--json')); assert.equal(history[0].delivery_result.commit, head);
  const current = JSON.parse(native('delivery.py', 'current', '--json')); assert.equal(current.kind, 'no_current_delivery');
  put(`${activeRef}/supplement.md`, 'Reviewed current supplement scope; retain original archived authority.\n');
  const supplement = { locator: `${activeRef}/supplement.md`, revision: `sha256:${sha(fs.readFileSync(path.join(root, activeRef, 'supplement.md')))}` };
  native('delivery.py', 'apply', '--input', JSON.stringify({ api_version: '1.0', operation: 'accept_scope', key, owner_role: 'task_scope', owner_id: 'trellis-start', authority: supplement }));
  const afterConsumer = JSON.parse(fs.readFileSync(path.join(root, activeRef, 'task.json')));
  assert.deepEqual(afterConsumer.accepted_scope, supplement); assert.equal(afterConsumer.deliveries.length, 1); assert.deepEqual(afterConsumer.completion_results, []);
  report.checks.target_native_session_continuation_and_actual_next_consumer = true;
  await assert.rejects(maintenance.rollbackMaintenance({ recovery_ref: applied.recovery_ref }), error => error.code === 'later_work_conflict');
  assert.deepEqual(tree(archiveRef), originalArchive); assert.equal(fs.readFileSync(path.join(root, 'unrelated-dirty.txt'), 'utf8'), 'Preserve unrelated work\n');
  report.checks.rollback_preserves_later_scope_work = true;
  report.contract = publicBin('contract'); report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = String(error.stack ?? error); throw error;
} finally {
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ status: report.status, report: output, fixture: base }) + '\n');
}

#!/usr/bin/env node
/** Public installed-pair proof for Issue 64. No source checkout imports. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const [cliArgument, outputArgument] = process.argv.slice(2);
if (!cliArgument || !outputArgument || !path.isAbsolute(cliArgument) || !path.isAbsolute(outputArgument)) {
  throw new Error("Usage: node candidate-smoke.mjs /absolute/prefix/node_modules/@mindfoldhq/trellis/bin/trellis.js /absolute/new-evidence-directory");
}
const cli = fs.realpathSync(cliArgument);
const packageRoot = path.dirname(path.dirname(cli));
const requestedOutput = path.resolve(outputArgument);
fs.mkdirSync(requestedOutput, { recursive: false });
// Public maintenance normalizes checkout roots; match that identity on macOS /tmp aliases.
const output = fs.realpathSync(requestedOutput);
const requireInstalled = createRequire(path.join(packageRoot, "package.json"));
const { maintenance } = await import(pathToFileURL(path.join(packageRoot, "dist/index.js")).href);
const core = await import(pathToFileURL(requireInstalled.resolve("@mindfoldhq/trellis-core/task/v2")).href);
const commandLog = [];
const report = { schema_version: "1.0", started_at: new Date().toISOString(), installed_cli: cli, commands: commandLog };
const python = process.env.TRELLIS_PROBE_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const json = value => JSON.stringify(value, null, 2) + "\n";
const write = (file, value, mode = 0o640) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : json(value));
  fs.chmodSync(file, mode);
};
function run(executable, args, cwd, expectedStatus = 0) {
  const result = spawnSync(executable, args, {
    cwd, encoding: "utf8", env: { ...process.env, TRELLIS_CONTEXT_ID: "issue64-candidate-proof" },
  });
  commandLog.push({ executable, args, cwd, status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message });
  assert.equal(result.status, expectedStatus, `${executable} ${args.join(" ")}\n${result.stdout}\n${result.stderr}\n${result.error?.message ?? ""}`);
  return result.stdout.trim();
}
function maintain(args, expectedStatus = 0) {
  return JSON.parse(run(process.execPath, [cli, "maintain", ...args, "--json"], output, expectedStatus));
}
function treeDigest(full) {
  const info = fs.statSync(full);
  return info.isDirectory()
    ? { mode: info.mode & 0o777, children: fs.readdirSync(full).sort().map(name => [name, treeDigest(path.join(full, name))]) }
    : { mode: info.mode & 0o777, sha256: sha256(fs.readFileSync(full)) };
}
function fixture(name) {
  const root = path.join(output, name);
  fs.mkdirSync(root);
  const git = (...args) => run("git", ["-C", root, ...args], output);
  git("init", "-b", "main");
  git("config", "user.name", "Public candidate fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "maintenance.auto", "false");
  git("config", "gc.auto", "0");
  const original = ".trellis/tasks/original-compact";
  const archived = ".trellis/tasks/archive/2026-10/compact-completed";
  const active = ".trellis/tasks/reactivated-compact";
  const predecessor = {
    id: "legacy-formal-sample", name: "Legacy compact sample", title: "Completed historical accepted slice",
    status: "completed", branch: "main", base_branch: "main", creator: "historical-owner", assignee: "historical-reviewer",
    scope: "GitHub issue: https://github.com/example/repo/issues/130", completedAt: "2026-10-08",
  };
  assert.equal(Object.keys(predecessor).length, 10);
  write(path.join(root, original, "task.json"), predecessor);
  write(path.join(root, original, "prd.md"), "Historical accepted slice BASE-01 through BASE-05 only.\n", 0o600);
  write(path.join(root, original, "history.md"), "Fixture original owner reviewed the formal archive qualification.\n");
  write(path.join(root, original, "run.sh"), "#!/bin/sh\nexit 0\n", 0o750);
  git("add", original);
  git("commit", "-m", "complete fixture accepted slice");
  fs.mkdirSync(path.dirname(path.join(root, archived)), { recursive: true });
  fs.renameSync(path.join(root, original), path.join(root, archived));
  git("add", original, archived);
  git("commit", "-m", "archive fixture accepted slice");
  const archiveCommit = git("rev-parse", "HEAD");
  fs.mkdirSync(path.join(root, archived, "empty"), { mode: 0o700 });
  fs.cpSync(path.join(packageRoot, "dist/templates/trellis/scripts"), path.join(root, ".trellis/scripts"), { recursive: true });
  write(path.join(root, ".trellis/workflow.md"), fs.readFileSync(path.join(packageRoot, "dist/templates/trellis/workflow-delivery-v1.md"), "utf8"));
  write(path.join(root, ".trellis/config.yaml"), "task_auto_commit: false\n");
  write(path.join(root, "unrelated.txt"), "Unrelated business file must survive.\n");
  const key = { task_id: predecessor.id, lifecycle_generation: 0 };
  const nextKey = { ...key, lifecycle_generation: 1 };
  const authority = locator => ({ locator, revision: `sha256:${sha256(fs.readFileSync(path.join(root, locator)))}` });
  const inspection = {
    root, key, task_ref: archived, original_task_ref: original,
    archive: { commit: archiveCommit, target_ref: "main", target_head: archiveCommit, evidence: [authority(`${archived}/history.md`)] },
  };
  const source = { kind: "issue", repo_ref: "example/repo", number: 130, disposition: "reference_only" };
  const projection = core.emptyTaskRecordV2({
    id: predecessor.id, name: predecessor.name, title: predecessor.title, scope: predecessor.scope,
    branch: predecessor.branch, base_branch: predecessor.base_branch, source, lifecycle_generation: 1,
    accepted_scope: { ...authority(`${archived}/prd.md`), locator: `${active}/prd.md` },
  });
  const artifacts = [];
  function walk(ref) {
    for (const item of fs.readdirSync(path.join(root, ref)).sort()) {
      const locator = `${ref}/${item}`;
      const full = path.join(root, locator);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(locator);
      else if (item !== "task.json") {
        const bytes = fs.readFileSync(full);
        artifacts.push({ path: locator, action: "preserve", source: { content_base64: bytes.toString("base64"), sha256: sha256(bytes), mode: stat.mode & 0o777 } });
      }
    }
  }
  walk(archived);
  const input = {
    ...inspection, active_ref: active, projection, artifacts,
    legacy_facts: [{ field: "completedAt", disposition: "source_snapshot", owner_id: "original-owner", reason: authority(`${archived}/history.md`) }],
  };
  const privateDir = path.join(output, `${name}-private`);
  fs.mkdirSync(privateDir);
  const inspectionFile = path.join(privateDir, "inspection.json");
  const inputFile = path.join(privateDir, "input.json");
  const planFile = path.join(privateDir, "plan.json");
  write(inspectionFile, inspection);
  write(inputFile, { kind: "formal_archive_reactivation", input });
  return { root, archived, active, key, nextKey, source, predecessor, authority, inspection, inspectionFile, inputFile, planFile, privateDir, archiveBefore: treeDigest(path.join(root, archived)) };
}
try {
  report.contract = maintain(["contract"]);
  assert.equal(report.contract.maintenance_api, "1.0");
  assert.equal(report.contract.cli_version, report.contract.core_version);
  assert.ok(report.contract.formal_archive_reactivation.task_families.includes("known_legacy"));
  const f = fixture("public-flow");
  const inspect = maintain(["inspect-task", "--target", f.root, "--task-ref", f.archived]);
  assert.deepEqual(inspect.key, f.key);
  assert.equal(inspect.classification.kind, "legacy");
  assert.deepEqual(inspect.classification, { kind: "legacy", task_id: f.key.task_id, generation: 0 });
  assert.equal(maintain(["inspect-formal-archive", "--input", f.inspectionFile]).successor.kind, "absent");
  const beforePrepare = treeDigest(path.join(f.root, ".trellis/tasks"));
  const plan = maintain(["prepare", "--input", f.inputFile]);
  write(f.planFile, plan);
  const preview = maintain(["preview", "--plan", f.planFile]);
  assert.equal(preview.status, "prepared");
  assert.equal(preview.reactivated_task, undefined);
  assert.deepEqual(treeDigest(path.join(f.root, ".trellis/tasks")), beforePrepare);
  const applied = maintain(["apply", "--plan", f.planFile, "--state-dir", path.join(f.privateDir, "state")]);
  assert.equal(applied.status, "applied");
  assert.deepEqual(applied.reactivated_task, { key: f.nextKey, task_ref: f.active });
  const actual = JSON.parse(fs.readFileSync(path.join(f.root, f.active, "task.json"), "utf8"));
  assert.equal(actual.id, f.key.task_id);
  assert.equal(actual.lifecycle_generation, 1);
  assert.deepEqual(actual.source, f.source);
  assert.deepEqual(actual.deliveries, []);
  assert.deepEqual(actual.completion_results, []);
  assert.deepEqual(actual.closure_results, []);
  assert.deepEqual(treeDigest(path.join(f.root, f.archived)), f.archiveBefore);
  assert.equal(fs.readFileSync(path.join(f.root, f.active, "migration/source-task.json"), "utf8"), fs.readFileSync(path.join(f.root, f.archived, "task.json"), "utf8"));
  // Fresh public processes recover the original operation after its output is discarded.
  const recovery = maintain(["recover", "--recovery", applied.recovery_ref]);
  const resumed = maintain(["resume", "--recovery", applied.recovery_ref]);
  assert.deepEqual(recovery, applied);
  assert.deepEqual(resumed, applied);
  assert.deepEqual(maintain(["inspect-formal-archive", "--input", f.inspectionFile]).successor, { kind: "verified", task: { key: f.nextKey, task_ref: f.active } });
  // Exercise actual installed Core relocation and native Python archive consumers.
  const relocated = ".trellis/tasks/sdk-relocated";
  const { preimage } = core.loadTaskRecordV2({ root: f.root, taskDir: f.active });
  core.relocateTaskRecordV2({ root: f.root, taskDir: f.active, destination: relocated, expected_preimage: preimage, name: "SDK relocated successor" });
  const native = (entry, ...args) => run(python, ["-B", `.trellis/scripts/${entry}.py`, ...args], f.root);
  native("task", "start", relocated);
  assert.equal(JSON.parse(native("delivery", "current", "--json")).kind, "no_current_delivery");
  const authority = JSON.parse(fs.readFileSync(path.join(f.root, relocated, "task.json"), "utf8")).accepted_scope;
  const nativeApply = operation => native("delivery", "apply", "--task", relocated, "--input", JSON.stringify({ api_version: "1.0", key: f.nextKey, ...operation }));
  nativeApply({ operation: "complete_task", owner_role: "completion", owner_id: "trellis-complete-task", result: {
    result_id: "completed-successor", owner_id: "trellis-complete-task", evidence: [authority], lifecycle_generation: 1,
    accepted_scope: authority, delivery_result_ids: [], outcome: "completed",
  } });
  nativeApply({ operation: "close_task", owner_role: "closure", owner_id: "trellis-finish-work", result: {
    result_id: "closed-successor", owner_id: "trellis-finish-work", evidence: [authority], lifecycle_generation: 1,
    completion_result_id: "completed-successor", disposition: "no_mutation", source_result: null,
  } });
  native("task", "archive", relocated);
  const archivedSuccessor = maintain(["inspect-formal-archive", "--input", f.inspectionFile]).successor;
  assert.equal(archivedSuccessor.kind, "verified");
  assert.deepEqual(archivedSuccessor.task.key, f.nextKey);
  assert.match(archivedSuccessor.task.task_ref, /^\.trellis\/tasks\/archive\/\d{4}-\d{2}\/sdk-relocated$/);
  assert.deepEqual(treeDigest(path.join(f.root, f.archived)), f.archiveBefore);
  assert.deepEqual(maintain(["recover", "--recovery", applied.recovery_ref]), applied);
  assert.deepEqual(maintain(["resume", "--recovery", applied.recovery_ref]), applied);
  assert.equal(fs.readFileSync(path.join(f.root, "unrelated.txt"), "utf8"), "Unrelated business file must survive.\n");
  report.public_flow = { predecessor: inspect.classification, candidate: plan.candidate, operation_id: plan.operation_id, preview, applied, recovery, resumed, archived_successor: archivedSuccessor, original_archive: f.archiveBefore, original_archive_unchanged: true, actual_core_relocation: true, actual_native_completion_closure_archive: true };
  // A real write fault through the installed public SDK leaves an original receipt.
  // Public CLI recover reports pending without claiming an applied successor, then resumes it.
  const p = fixture("partial-flow");
  const pendingPlan = maintain(["prepare", "--input", p.inputFile]);
  const stateDir = path.join(p.privateDir, "state");
  const recoveryRef = path.join(stateDir, `${pendingPlan.operation_id}.json`);
  const originalRename = fs.renameSync;
  let interrupted = false;
  fs.renameSync = function(from, to, ...args) {
    if (!interrupted && String(to) === path.join(p.root, p.active, "task.json")) {
      interrupted = true;
      throw new Error("Issue 64 probe: ordinary file write interrupted");
    }
    return originalRename.call(this, from, to, ...args);
  };
  try {
    await assert.rejects(maintenance.applyMaintenance(pendingPlan, { state_dir: stateDir }), /ordinary file write interrupted/);
  } finally {
    fs.renameSync = originalRename;
  }
  assert.equal(interrupted, true);
  assert.equal(fs.existsSync(recoveryRef), true);
  const pending = maintain(["recover", "--recovery", recoveryRef]);
  assert.equal(pending.status, "pending");
  assert.equal(pending.reactivated_task, undefined);
  assert.ok(pending.pending_paths.length > 0);
  const appliedPending = maintain(["resume", "--recovery", recoveryRef]);
  assert.equal(appliedPending.status, "applied");
  assert.equal(appliedPending.operation_id, pendingPlan.operation_id);
  assert.deepEqual(appliedPending.reactivated_task, { key: p.nextKey, task_ref: p.active });
  assert.deepEqual(treeDigest(path.join(p.root, p.archived)), p.archiveBefore);
  report.partial_flow = { operation_id: pendingPlan.operation_id, actual_write_interrupted: true, pending, resumed: appliedPending, original_archive_unchanged: true };
  report.completed_at = new Date().toISOString();
  report.status = "passed";
  report.limits = ["Isolated desensitized public fixtures; no real business archive, Guru semantic qualification or joint acceptance.", "Pending proof uses one injected ordinary filesystem write error through the installed public SDK; recover/resume use actual bin processes.", "This probe is scoped to the executing local platform and installed matching package pair."];
} catch (error) {
  report.status = "failed";
  report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  fs.writeFileSync(path.join(output, "report.json"), json(report));
  process.stdout.write(json({ status: report.status, report: path.join(output, "report.json") }));
}

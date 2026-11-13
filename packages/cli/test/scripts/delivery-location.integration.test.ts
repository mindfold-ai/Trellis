import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { AuthorityRef, CandidateRef, GateResult, TaskRecordV2, WorkflowContract } from "@mindfoldhq/trellis-core/task/v2";

const scripts = path.resolve(__dirname, "../../src/templates/trellis/scripts");
const fixtures = path.resolve(__dirname, "../../../core/test/fixtures/task-v2");
const python = process.platform === "darwin" ? "/usr/bin/python3" : "python3";
const available = spawnSync(python, ["--version"]).status === 0;
const native = JSON.parse(fs.readFileSync(path.join(fixtures, "native-multi.json"), "utf8")) as { workflow: WorkflowContract; initial: TaskRecordV2 };
const d1 = "11111111-1111-4111-8111-111111111111";
const digest = (value: string | Buffer): string => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function install(root: string): void {
  fs.mkdirSync(path.join(root, ".trellis"), { recursive: true });
  fs.cpSync(scripts, path.join(root, ".trellis/scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, ".trellis/workflow.md"), `[trellis-runtime-contract]\n${JSON.stringify(native.workflow)}\n[/trellis-runtime-contract]\n`);
}
function run(root: string, entry: string, args: string[], key = "delivery-v2-test") {
  return spawnSync(python, [`.trellis/scripts/${entry}.py`, ...args], {
    cwd: root, encoding: "utf8", env: { ...process.env, TRELLIS_CONTEXT_ID: key },
  });
}
function ok(root: string, entry: string, args: string[], key?: string): string {
  const result = run(root, entry, args, key);
  expect(result.status, `${entry} ${args[0]}: ${result.stderr}\n${result.stdout}`).toBe(0);
  return result.stdout;
}
function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

describe.skipIf(!available)("Delivery task relocation (minimum interpreter)", () => {
  let root: string;
  let task: string;
  let scopeFile: string;
  let planFile: string;
  const extra: string[] = [];
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-delivery-v2-"));
    install(root);
    scopeFile = "requirements.md"; planFile = "plan.md";
    ok(root, "task", ["create", "Delivery fixture", "--description", "Independent slices", "--slug", "fixture", "--task-id", "fixture-task", "--schema-version", "2.0", "--no-start"]);
    task = `.trellis/tasks/${fs.readdirSync(path.join(root, ".trellis/tasks")).find((name) => name.endsWith("-fixture"))}`;
    fs.writeFileSync(path.join(root, "requirements.md"), "R1: retained artifact\nR2: second slice\n");
    fs.writeFileSync(path.join(root, "plan.md"), "Reviewed plan\n");
    fs.writeFileSync(path.join(root, "artifact.txt"), "Accepted artifact\n");
    fs.chmodSync(path.join(root, "artifact.txt"), 0o644);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const directory of [root, ...extra.splice(0)]) fs.rmSync(directory, { recursive: true, force: true });
  });
  function ref(file: string): AuthorityRef { return { locator: file, revision: digest(fs.readFileSync(path.join(root, file))) }; }
  function record(): TaskRecordV2 { return JSON.parse(fs.readFileSync(path.join(root, task, "task.json"), "utf8")) as TaskRecordV2; }
  function operation(name: string, role: keyof WorkflowContract["owners"], fields: Record<string, unknown>, deliveryId?: string, generation = 0) {
    return { api_version: "1.0", operation: name, key: { task_id: "fixture-task", lifecycle_generation: generation, ...(deliveryId ? { delivery_id: deliveryId } : {}) }, owner_role: role, owner_id: native.workflow.owners[role], ...fields };
  }
  function apply(value: object): Record<string, unknown> { return JSON.parse(ok(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(value)])) as Record<string, unknown>; }
  function prepare(deliveryId = d1, profile = "manual"): void {
    if (record().accepted_scope === null) apply(operation("accept_scope", "task_scope", { authority: ref(scopeFile) }));
    apply(operation("create_delivery", "creation", { scope_ref: { authority: ref(scopeFile), anchors: ["R1"] }, profile }, deliveryId));
  }
  function gate(role: GateResult["owner_role"], phase: string, candidate: CandidateRef | null, previous: string | null, deliveryId = d1): string {
    const resultId = `${deliveryId}-${role}`;
    apply(operation("record_gate", role, {
      expected_phase: phase,
      result: { result_id: resultId, owner_role: role, owner_id: native.workflow.owners[role], outcome: role === "planning" ? "accepted" : role === "readiness" ? "ready" : "passed", scope_ref: { authority: ref(scopeFile), anchors: ["R1"] }, plan_ref: ref(planFile), candidate, predecessor_result_id: previous, obligations: [], evidence: [ref(planFile)] },
    }, deliveryId));
    return resultId;
  }
  function candidate(gitProject = false): CandidateRef {
    const hash = JSON.parse(ok(root, "delivery", ["candidate", "--paths", "artifact.txt", "--kind", gitProject ? "git" : "git_free"])) as { content_ref: string };
    return { kind: gitProject ? "git" : "git_free", ...hash, paths: ["artifact.txt"], head_ref: gitProject ? git(root, "rev-parse", "HEAD") : null, base_ref: null };
  }
  function ready(gitProject = false): CandidateRef {
    const planning = gate("planning", "planning", null, null);
    const current = candidate(gitProject);
    apply(operation("begin_check", "implementation", { expected_phase: "implementing", candidate: current }, d1));
    const check = gate("check", "checking", current, planning);
    const review = gate("full_review", "reviewing", current, check);
    gate("readiness", "reviewing", current, review);
    return current;
  }

  function closeEmptyTask(): void {
    apply(operation("accept_scope", "task_scope", { authority: ref(scopeFile) }));
    apply(operation("complete_task", "completion", { result: { result_id: "empty-complete", owner_id: native.workflow.owners.completion, evidence: [ref(scopeFile)], lifecycle_generation: 0, accepted_scope: ref(scopeFile), delivery_result_ids: [], outcome: "completed" } }));
    apply(operation("close_task", "closure", { result: { result_id: "empty-close", owner_id: native.workflow.owners.closure, evidence: [ref(scopeFile)], lifecycle_generation: 0, completion_result_id: "empty-complete", disposition: "no_mutation", source_result: null } }));
  }

  it("refuses archive through a legal direct Task-leaf alias without changing its real Task", () => {
    closeEmptyTask();
    const source = path.join(root, task); const alias = ".trellis/tasks/alias-fixture";
    fs.symlinkSync(source, path.join(root, alias));
    const before = fs.readFileSync(path.join(source, "task.json"));
    const archive = path.join(root, ".trellis/tasks/archive"); const archiveBefore = fs.readdirSync(archive);
    for (const spelling of [alias, alias.replace(".trellis/", ""), "alias-fixture", path.join(root, alias)]) {
      const result = run(root, "task", ["archive", spelling, "--no-commit"]);
      expect(result.status).toBe(1); expect(result.stderr).toContain("Task-leaf symlink");
    }
    expect(fs.lstatSync(path.join(root, alias)).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(source, "task.json"))).toEqual(before);
    expect(fs.readdirSync(archive)).toEqual(archiveBefore);
    expect(JSON.parse(ok(root, "delivery", ["list", "--task", alias, "--json"]))).toEqual([]);
    const program = "from pathlib import Path;import sys;from common.task_artifacts import relocate_task_directory;r=Path(sys.argv[1]);relocate_task_directory(r/sys.argv[2],r/'.trellis/tasks/archive/2026-10/alias-fixture',r)";
    const direct = spawnSync(python, ["-c", program, root, alias], { encoding: "utf8", env: { ...process.env, PYTHONPATH: path.join(root, ".trellis/scripts") } });
    expect(direct.status).toBe(1); expect(direct.stderr).toContain("Task-leaf symlink");
    expect(fs.lstatSync(path.join(root, alias)).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(source, "task.json"))).toEqual(before);
  });

  it("prevalidates malformed session releases before reopening an archived Task", () => {
    closeEmptyTask(); const active = task;
    task = ok(root, "task", ["archive", task, "--no-commit"]).trim();
    const before = fs.readFileSync(path.join(root, task, "task.json"));
    const sessions = path.join(root, ".trellis/.runtime/sessions"); fs.mkdirSync(sessions, { recursive: true });
    const corrupt = path.join(sessions, "other-context.json");
    fs.writeFileSync(corrupt, JSON.stringify({ schema_version: 3, task_id: "bad space", lifecycle_generation: 0, delivery_id: null }));
    const sessionBefore = fs.readFileSync(corrupt);
    const request = operation("reopen_task", "task_scope", { authority: ref(scopeFile) });
    const result = run(root, "delivery", ["reopen", "--task", task, "--input", JSON.stringify(request)]);
    expect(result.status).toBe(1); expect(result.stderr).toContain("invalid_task_id");
    expect.soft(fs.existsSync(path.join(root, active))).toBe(false);
    expect(fs.readFileSync(path.join(root, task, "task.json"))).toEqual(before);
    expect(fs.readFileSync(corrupt)).toEqual(sessionBefore);
  });

  it("recovers a late session-writer failure and lost output with the original reopen key and archive locator", () => {
    scopeFile = `${task}/prd.md`; const authority = ref(scopeFile);
    closeEmptyTask(); const active = task;
    task = ok(root, "task", ["archive", task, "--no-commit"]).trim(); const archived = task;
    const sessions = path.join(root, ".trellis/.runtime/sessions"); fs.mkdirSync(sessions, { recursive: true });
    const binding = { schema_version: 3, task_id: "fixture-task", lifecycle_generation: 0, delivery_id: null };
    for (const name of ["a-context", "b-context"]) fs.writeFileSync(path.join(sessions, `${name}.json`), JSON.stringify(binding));
    const unrelated = path.join(sessions, "unrelated-context.json");
    fs.writeFileSync(unrelated, JSON.stringify({ ...binding, task_id: "another-task" }));
    const unrelatedBefore = fs.readFileSync(unrelated);
    const request = operation("reopen_task", "task_scope", { authority });
    const program = "import runpy,sys;from common import session_storage as ss;original=ss.write_json;ss.write_json=lambda p,d: False if p.name=='b-context.json' else original(p,d);sys.argv=['.trellis/scripts/delivery.py',*sys.argv[1:]];runpy.run_path(sys.argv[0],run_name='__main__')";
    const first = spawnSync(python, ["-c", program, "reopen", "--task", task, "--input", JSON.stringify(request)], { cwd: root, encoding: "utf8", env: { ...process.env, TRELLIS_CONTEXT_ID: "delivery-v2-test", PYTHONPATH: path.join(root, ".trellis/scripts") } });
    expect(first.status).toBe(1); expect(first.stderr).toContain("binding_write_failed");
    task = active;
    expect(record().lifecycle_generation).toBe(1);
    expect(fs.existsSync(path.join(root, archived))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(sessions, "a-context.json"), "utf8")).lifecycle_generation).toBe(1);
    expect(JSON.parse(fs.readFileSync(path.join(sessions, "b-context.json"), "utf8")).lifecycle_generation).toBe(0);
    const afterFirst = fs.readFileSync(path.join(root, task, "task.json"));
    const retry = (value: object) => run(root, "delivery", ["reopen", "--task", archived, "--input", JSON.stringify(value)]);
    expect(retry({ ...request, owner_id: "wrong-owner" }).stderr).toContain("owner_mismatch");
    expect(retry({ ...request, authority: { ...authority, revision: `sha256:${"0".repeat(64)}` } }).stderr).toContain("stale_lifecycle_generation");
    const recovered = retry(request); expect(recovered.status, recovered.stderr).toBe(0);
    expect(JSON.parse(recovered.stdout)).toMatchObject({ changed: false, key: { task_id: "fixture-task", lifecycle_generation: 1 } });
    expect(fs.readFileSync(path.join(root, task, "task.json"))).toEqual(afterFirst);
    for (const name of ["a-context", "b-context"]) expect(JSON.parse(fs.readFileSync(path.join(sessions, `${name}.json`), "utf8"))).toEqual({ ...binding, lifecycle_generation: 1 });
    const sessionsBeforeRetry = fs.readdirSync(sessions).map((name) => [name, fs.readFileSync(path.join(sessions, name), "utf8")]);
    expect(retry(request).status).toBe(0);
    expect(fs.readdirSync(sessions).map((name) => [name, fs.readFileSync(path.join(sessions, name), "utf8")])).toEqual(sessionsBeforeRetry);
    expect(fs.readFileSync(unrelated)).toEqual(unrelatedBefore);
    const authorityPath = path.join(root, task, "prd.md"); const scope = fs.readFileSync(authorityPath);
    fs.writeFileSync(authorityPath, "changed scope\n");
    expect(retry(request).stderr).toContain("authority_mismatch");
    expect(fs.readFileSync(path.join(root, task, "task.json"))).toEqual(afterFirst);
    fs.writeFileSync(authorityPath, scope);
    apply(operation("create_delivery", "creation", { scope_ref: { authority, anchors: ["R1"] }, profile: "manual" }, d1, 1));
    expect(retry(request).stderr).toContain("stale_lifecycle_generation");
    expect(record().lifecycle_generation).toBe(1);
  });

  it("keeps Task-owned scope, Delivery plan and manifests usable after rename", () => {
    const oldTask = task;
    const authority = ref(`${task}/prd.md`);
    apply(operation("accept_scope", "task_scope", { authority }));
    apply(operation("create_delivery", "creation", { scope_ref: { authority, anchors: ["R1"] }, profile: "manual" }, d1));
    const design = `${task}/deliveries/${d1}/design.md`;
    fs.writeFileSync(path.join(root, design), "Accepted slice design\n");
    const plan = ref(design);
    const planning: GateResult = { result_id: "local-planning", owner_role: "planning", owner_id: native.workflow.owners.planning, outcome: "accepted", scope_ref: { authority, anchors: ["R1"] }, plan_ref: plan, candidate: null, predecessor_result_id: null, obligations: [], evidence: [plan] };
    apply(operation("record_gate", "planning", { expected_phase: "planning", result: planning }, d1));
    ok(root, "task", ["start", task]);
    ok(root, "delivery", ["select", "--task", task, "--delivery", d1]);
    for (const kind of ["implement", "check"]) ok(root, "task", ["add-context", task, kind, design, "Reviewed design", "--delivery", d1]);
    const manifest = path.join(root, task, `deliveries/${d1}/check.jsonl`);
    fs.chmodSync(manifest, 0o640);
    const current = candidate();
    apply(operation("begin_check", "implementation", { expected_phase: "implementing", candidate: current }, d1));
    ok(root, "task", ["rename", task, "renamed-fixture"]);
    task = task.replace(/-fixture$/, "-renamed-fixture");
    expect(fs.existsSync(path.join(root, oldTask))).toBe(false);
    expect(record().artifact_origin).toBe(oldTask);
    const firstPlanning = record().deliveries[0]?.results.planning;
    ok(root, "task", ["rename", task, "twice-fixture"]);
    task = task.replace(/-renamed-fixture$/, "-twice-fixture");
    expect(record().artifact_origin).toBe(oldTask);
    expect(record().deliveries[0]?.results.planning).toEqual(firstPlanning);
    expect(record().id).toBe("fixture-task");
    expect(record().lifecycle_generation).toBe(0);
    ok(root, "task", ["validate", task, "--delivery", d1]);
    expect(fs.statSync(path.join(root, task, `deliveries/${d1}/check.jsonl`)).mode & 0o777).toBe(0o640);
    const selected = JSON.parse(ok(root, "delivery", ["current", "--json"])) as { delivery: TaskRecordV2["deliveries"][number] };
    const accepted = selected.delivery.results.planning;
    if (!accepted) throw new Error("missing Planning result");
    const check = { ...accepted, result_id: "after-rename-check", owner_role: "check", owner_id: native.workflow.owners.check, outcome: "passed", candidate: current, predecessor_result_id: accepted.result_id };
    // New producer inputs may use the current physical root; store canonicalizes only refs.
    const currentPlan = ref(`${task}/deliveries/${d1}/design.md`);
    check.plan_ref = currentPlan; check.evidence = [currentPlan];
    check.scope_ref = { authority: ref(`${task}/prd.md`), anchors: ["R1"] };
    const request = operation("record_gate", "check", { expected_phase: "checking", result: check }, d1);
    expect(apply(request).phase).toBe("reviewing");
    expect(record().deliveries[0]?.results.check?.plan_ref).toEqual(plan);
    const beforeRetry = fs.readFileSync(path.join(root, task, "task.json"));
    expect(apply(request).changed).toBe(false);
    expect(fs.readFileSync(path.join(root, task, "task.json"))).toEqual(beforeRetry);
  });

  it("lists archived history and formally reopens the same Task without binding execution", () => {
    scopeFile = `${task}/prd.md`; planFile = `${task}/plan.md`;
    fs.writeFileSync(path.join(root, planFile), "Retained Task plan\n");
    prepare(); const current = ready();
    apply(operation("record_delivery", "delivery", { expected_phase: "publishing", result: { result_id: "delivered-location", owner_id: native.workflow.owners.delivery, evidence: [ref("artifact.txt")], candidate: current, profile: "manual", artifact: ref("artifact.txt") } }, d1));
    apply(operation("complete_task", "completion", { result: { result_id: "completed-location", owner_id: native.workflow.owners.completion, evidence: [ref(scopeFile)], lifecycle_generation: 0, accepted_scope: ref(scopeFile), delivery_result_ids: ["delivered-location"], outcome: "completed" } }));
    apply(operation("close_task", "closure", { result: { result_id: "closed-location", owner_id: native.workflow.owners.closure, evidence: [ref(scopeFile)], lifecycle_generation: 0, completion_result_id: "completed-location", disposition: "no_mutation", source_result: null } }));
    const history = record(); const activeTask = task;
    ok(root, "task", ["start", task]);
    task = ok(root, "task", ["archive", task, "--no-commit"]).trim();
    const before = fs.readFileSync(path.join(root, task, "task.json"));
    const listed = JSON.parse(ok(root, "delivery", ["list", "--task", task, "--json"])) as TaskRecordV2["deliveries"];
    expect(listed).toEqual(history.deliveries);
    expect(JSON.parse(ok(root, "delivery", ["list", "--task", path.join(root, task), "--json"]))).toEqual(history.deliveries);
    const monthAlias = path.join(root, ".trellis/tasks/archive/2099-01");
    fs.symlinkSync(path.dirname(path.join(root, task)), monthAlias);
    expect(run(root, "delivery", ["list", "--task", `.trellis/tasks/archive/2099-01/${path.basename(task)}`, "--json"]).stderr).toContain("invalid_task_path");
    fs.unlinkSync(monthAlias);
    expect(fs.readFileSync(path.join(root, task, "task.json"))).toEqual(before);
    expect(run(root, "task", ["start", task]).status).toBe(1);
    expect(run(root, "delivery", ["select", "--task", task, "--delivery", d1]).status).toBe(1);
    const archivedTask = task;
    const origin = history.accepted_scope;
    if (!origin) throw new Error("missing accepted authority");
    const reopen = operation("reopen_task", "task_scope", { authority: origin });
    const missing = { ...origin, revision: `sha256:${"0".repeat(64)}` };
    expect(run(root, "delivery", ["reopen", "--task", task, "--input", JSON.stringify(operation("reopen_task", "task_scope", { authority: missing }))]).stderr).toContain("authority_mismatch");
    expect(fs.readFileSync(path.join(root, task, "task.json"))).toEqual(before);
    fs.mkdirSync(path.join(root, activeTask));
    expect(run(root, "delivery", ["reopen", "--task", task, "--input", JSON.stringify(reopen)]).stderr).toContain("task_destination_occupied");
    expect(fs.readFileSync(path.join(root, task, "task.json"))).toEqual(before);
    fs.rmSync(path.join(root, activeTask), { recursive: true });
    expect(apply(reopen).changed).toBe(true);
    task = activeTask;
    expect(fs.existsSync(path.join(root, archivedTask))).toBe(false);
    expect(record().id).toBe(history.id);
    expect(record().lifecycle_generation).toBe(1);
    expect(record().deliveries).toEqual(history.deliveries);
    expect(record().completion_results).toEqual(history.completion_results);
    expect(record().closure_results).toEqual(history.closure_results);
    expect(JSON.parse(ok(root, "delivery", ["current", "--json"])).kind).toBe("no_current_task");
    ok(root, "task", ["start", task]);
    expect(JSON.parse(ok(root, "delivery", ["current", "--json"])).kind).toBe("no_current_delivery");
    expect(run(root, "delivery", ["select", "--task", task, "--delivery", d1]).stderr).toContain("delivery_not_found");
  });
  it("rejects legacy selected execution under a schema-2 declaration without changing Task or binding", () => {
    const workflow = path.join(root, ".trellis/workflow.md");
    const nativeText = fs.readFileSync(workflow, "utf8");
    fs.writeFileSync(workflow, "Legacy workflow\n");
    ok(root, "task", ["create", "Legacy history", "--description", "Retained predecessor", "--slug", "legacy-guard", "--schema-version", "legacy", "--no-start"]);
    const legacy = `.trellis/tasks/${fs.readdirSync(path.join(root, ".trellis/tasks")).find((name) => name.endsWith("-legacy-guard"))}`;
    ok(root, "task", ["start", legacy]);
    const taskBytes = fs.readFileSync(path.join(root, legacy, "task.json"));
    const sessions = path.join(root, ".trellis/.runtime/sessions");
    const sessionBytes = fs.readdirSync(sessions).map((name) => [name, fs.readFileSync(path.join(sessions, name), "utf8")]);
    for (const text of [nativeText, "[trellis-runtime-contract]\n{broken\n[/trellis-runtime-contract]\n"]) {
      fs.writeFileSync(workflow, text);
      const result = run(root, "task", ["current", "--json"]);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(text === nativeText ? "maintenance_required" : "invalid_runtime_contract_json");
      if (text === nativeText) {
        expect(result.stdout).toContain("trellis maintain inspect-task --target");
        expect(result.stdout).toContain("--task-id legacy-guard --generation 0");
        expect(JSON.parse(result.stdout).current_task).toBeNull();
      }
      expect(run(root, "task", ["start", legacy]).status).toBe(1);
      expect(run(root, "task", ["archive", legacy, "--no-commit"]).status).toBe(1);
      expect(fs.readFileSync(path.join(root, legacy, "task.json"))).toEqual(taskBytes);
      expect(fs.readdirSync(sessions).map((name) => [name, fs.readFileSync(path.join(sessions, name), "utf8")])).toEqual(sessionBytes);
    }
    fs.writeFileSync(workflow, "Legacy workflow\n");
    expect(JSON.parse(ok(root, "task", ["current", "--json"])).current_task.id).toBe("legacy-guard");
  });

  it("does not remap a candidate's Task artifact paths after rename", () => {
    const locator = `${task}/candidate.md`;
    fs.writeFileSync(path.join(root, locator), "Candidate path identity\n");
    const hash = JSON.parse(ok(root, "delivery", ["candidate", "--paths", locator, "--kind", "git_free"])) as { content_ref: string };
    const saved = { kind: "git_free", ...hash, paths: [locator], head_ref: null, base_ref: null };
    ok(root, "task", ["rename", task, "candidate-moved"]);
    task = task.replace(/-fixture$/, "-candidate-moved");
    const program = "import json,sys;from pathlib import Path;from common.delivery_store import verify_candidate;verify_candidate(Path(sys.argv[1]),json.loads(sys.argv[2]))";
    const result = spawnSync(python, ["-c", program, root, JSON.stringify(saved)], { encoding: "utf8", env: { ...process.env, PYTHONPATH: scripts } });
    expect(result.status).toBe(1); expect(result.stderr).toContain("candidate_mismatch");
  });

  for (const mode of [0o640, 0o666, 0o777]) {
    it(`preserves task.json and related-record modes through public rename/archive under restrictive umask (${mode.toString(8)})`, () => {
      const taskFile = (): string => path.join(root, task, "task.json");
      expect(fs.statSync(taskFile()).mode & 0o777).toBe(0o600);
      ok(root, "task", ["create", "Related child", "--description", "Backref preservation", "--slug", "mode-child", "--schema-version", "2.0", "--no-start"]);
      const child = `.trellis/tasks/${fs.readdirSync(path.join(root, ".trellis/tasks")).find((name) => name.endsWith("-mode-child"))}`;
      const childFile = path.join(root, child, "task.json");
      expect(fs.statSync(childFile).mode & 0o777).toBe(0o600);
      ok(root, "task", ["add-subtask", task, child]);
      fs.chmodSync(taskFile(), mode); fs.chmodSync(childFile, 0o666);
      const restricted = (args: string[]): string => {
        const program = "import os,runpy,sys;os.umask(0o077);sys.argv=['.trellis/scripts/task.py',*sys.argv[1:]];runpy.run_path(sys.argv[0],run_name='__main__')";
        const result = spawnSync(python, ["-c", program, ...args], { cwd: root, encoding: "utf8", env: { ...process.env, TRELLIS_CONTEXT_ID: "delivery-v2-test", PYTHONPATH: path.join(root, ".trellis/scripts") } });
        expect(result.status, result.stderr).toBe(0);
        return result.stdout;
      };
      restricted(["rename", task, "mode-renamed"]);
      task = task.replace(/-fixture$/, "-mode-renamed");
      expect.soft(fs.statSync(taskFile()).mode & 0o777).toBe(mode);
      expect.soft(fs.statSync(childFile).mode & 0o777).toBe(0o666);
      expect(JSON.parse(fs.readFileSync(childFile, "utf8")).parent).toBe(path.basename(task));
      apply(operation("accept_scope", "task_scope", { authority: ref(scopeFile) }));
      apply(operation("complete_task", "completion", { result: { result_id: "mode-completed", owner_id: native.workflow.owners.completion, evidence: [ref(scopeFile)], lifecycle_generation: 0, accepted_scope: ref(scopeFile), delivery_result_ids: [], outcome: "completed" } }));
      apply(operation("close_task", "closure", { result: { result_id: "mode-closed", owner_id: native.workflow.owners.closure, evidence: [ref(scopeFile)], lifecycle_generation: 0, completion_result_id: "mode-completed", disposition: "no_mutation", source_result: null } }));
      const completion = record().completion_results;
      task = restricted(["archive", task, "--no-commit"]).trim();
      expect.soft(fs.statSync(taskFile()).mode & 0o777).toBe(mode);
      expect.soft(fs.statSync(childFile).mode & 0o777).toBe(0o666);
      expect(JSON.parse(fs.readFileSync(childFile, "utf8")).parent).toBeNull();
      expect(record().completion_results).toEqual(completion);
    });
  }

});

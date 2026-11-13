import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTaskOperationToStore, relocateTaskRecordV2, resolveTaskArtifactLocator, verifyAuthority, computeCandidateContentRef, verifyCandidate, emptyTaskRecordV2, getCurrentDelivery, loadTaskRecordV2, parseTaskRecordV2, TaskV2Error, writeTaskRecordV2, type AuthorityRef, type CandidateRef, type TaskOperation, type TaskRecordV2, type WorkflowContract } from "../../src/task/v2/index.js";

interface FixtureStep { operation: TaskOperation; expect_error?: string; expected_phase?: string; expected_changed?: boolean }
interface Fixture { workflow: WorkflowContract; initial: TaskRecordV2; steps: FixtureStep[]; schema_cases?: { name: string; input: unknown; expect_error: string }[]; hash_cases?: { name: string; paths: string[]; files: Record<string, string>; modes?: Record<string, number>; kind?: CandidateRef["kind"]; content_ref: string }[] }
const fixtures = path.resolve(import.meta.dirname, "../fixtures/task-v2");
const native = JSON.parse(fs.readFileSync(path.join(fixtures, "native-multi.json"), "utf8")) as Fixture;
const key = { task_id: "fixture-task", lifecycle_generation: 0, delivery_id: "11111111-1111-4111-8111-111111111111" };
const directories: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function errorCode(callback: () => unknown, code: string): void {
  try { callback(); throw new Error("operation unexpectedly succeeded"); } catch (error) { expect(error).toBeInstanceOf(TaskV2Error); expect((error as TaskV2Error).code).toBe(code); }
}
function op<T extends TaskOperation>(operation: T): T { return operation; }
function makeStore(gitProject = false, objectFormat: "sha1" | "sha256" = "sha1"): { root: string; taskDir: string; authority: AuthorityRef; plan: AuthorityRef; candidate: CandidateRef } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-v2-")); directories.push(root);
  fs.writeFileSync(path.join(root, "requirements.md"), "R1: deliver an artifact\n"); fs.writeFileSync(path.join(root, "plan.md"), "Plan\n"); fs.writeFileSync(path.join(root, "artifact.txt"), "Accepted artifact\n"); fs.chmodSync(path.join(root, "artifact.txt"), 0o644);
  if (gitProject) {
    execFileSync("git", ["init", "-q", `--object-format=${objectFormat}`], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "actual content"], { cwd: root });
  }
  const ref = (file: string): AuthorityRef => ({ locator: file, revision: `sha256:${createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")}` });
  const taskDir = ".trellis/tasks/fixture"; writeTaskRecordV2({ root, taskDir, record: emptyTaskRecordV2({ id: "fixture-task" }) });
  const head = gitProject ? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() : null;
  return { root, taskDir, authority: ref("requirements.md"), plan: ref("plan.md"), candidate: { kind: gitProject ? "git" : "git_free", content_ref: computeCandidateContentRef(root, ["artifact.txt"]), paths: ["artifact.txt"], head_ref: head, base_ref: null } };
}
function storeApply(store: ReturnType<typeof makeStore>, operation: TaskOperation): ReturnType<typeof applyTaskOperationToStore> {
  return applyTaskOperationToStore({ root: store.root, taskDir: store.taskDir, workflow: native.workflow, expected_preimage: loadTaskRecordV2(store).preimage, operation });
}
function prepareStore(store: ReturnType<typeof makeStore>, profile: "manual" | "local_commit" | "pull_request" = "manual"): void {
  storeApply(store, op({ api_version: "1.0", operation: "accept_scope", key: { task_id: key.task_id, lifecycle_generation: 0 }, owner_role: "task_scope", owner_id: native.workflow.owners.task_scope, authority: store.authority }));
  storeApply(store, op({ api_version: "1.0", operation: "create_delivery", key, owner_role: "creation", owner_id: native.workflow.owners.creation, scope_ref: { authority: store.authority, anchors: ["R1"] }, profile }));
  const result = { result_id: "actual-plan", owner_role: "planning" as const, owner_id: native.workflow.owners.planning, outcome: "accepted" as const, scope_ref: { authority: store.authority, anchors: ["R1"] }, plan_ref: store.plan, candidate: null, predecessor_result_id: null, obligations: [], evidence: [store.plan] };
  storeApply(store, op({ api_version: "1.0", operation: "record_gate", key, expected_phase: "planning", owner_role: "planning", owner_id: result.owner_id, result }));
}

describe("Task v2 stable artifact origin", () => {
  it("refuses to archive a legal active Task-leaf alias before modifying its external target", () => {
    const store = makeStore();
    storeApply(store, op({ api_version: "1.0", operation: "accept_scope", key: { task_id: key.task_id, lifecycle_generation: 0 }, owner_role: "task_scope", owner_id: native.workflow.owners.task_scope, authority: store.authority }));
    const completion = { result_id: "alias-complete", owner_id: native.workflow.owners.completion, evidence: [store.authority], lifecycle_generation: 0, accepted_scope: store.authority, delivery_result_ids: [], outcome: "completed" as const };
    storeApply(store, op({ api_version: "1.0", operation: "complete_task", key: { task_id: key.task_id, lifecycle_generation: 0 }, owner_role: "completion", owner_id: completion.owner_id, result: completion }));
    storeApply(store, op({ api_version: "1.0", operation: "close_task", key: { task_id: key.task_id, lifecycle_generation: 0 }, owner_role: "closure", owner_id: native.workflow.owners.closure, result: { result_id: "alias-close", owner_id: native.workflow.owners.closure, evidence: [store.authority], lifecycle_generation: 0, completion_result_id: completion.result_id, disposition: "no_mutation", source_result: null } }));
    const external = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-alias-target-")); directories.push(external);
    const source = path.join(store.root, store.taskDir); const target = path.join(external, "fixture");
    fs.renameSync(source, target); fs.symlinkSync(target, source);
    fs.writeFileSync(path.join(source, "implement.jsonl"), JSON.stringify({ file: `${store.taskDir}/prd.md`, reason: "preserve alias source" }) + "\n");
    const before = loadTaskRecordV2(store).preimage; const manifest = fs.readFileSync(path.join(target, "implement.jsonl"));
    const destination = ".trellis/tasks/archive/2026-10/fixture";
    errorCode(() => relocateTaskRecordV2({ ...store, destination, expected_preimage: before }), "invalid_locator");
    expect(fs.lstatSync(source).isSymbolicLink()).toBe(true);
    expect(loadTaskRecordV2(store).preimage).toBe(before);
    expect(fs.readFileSync(path.join(target, "implement.jsonl"))).toEqual(manifest);
    expect(fs.existsSync(path.join(store.root, ".trellis/tasks/archive"))).toBe(false);
  });
  it("retains the accepted refs through two renames, canonicalizes fresh inputs and preserves retries", () => {
    const store = makeStore(); const origin = store.taskDir;
    fs.writeFileSync(path.join(store.root, origin, "prd.md"), "Local requirements\n");
    fs.writeFileSync(path.join(store.root, origin, "design.md"), "Local plan\n");
    const ref = (locator: string): AuthorityRef => ({ locator, revision: `sha256:${createHash("sha256").update(fs.readFileSync(path.join(store.root, locator))).digest("hex")}` });
    store.authority = ref(`${origin}/prd.md`); store.plan = ref(`${origin}/design.md`);
    prepareStore(store);
    const planning = loadTaskRecordV2(store).record.deliveries[0]?.results.planning;
    const manifest = `${origin}/deliveries/${key.delivery_id}/check.jsonl`;
    fs.mkdirSync(path.dirname(path.join(store.root, manifest)), { recursive: true });
    fs.writeFileSync(path.join(store.root, manifest), JSON.stringify({ file: store.plan.locator, reason: `Keep prose ${origin}/design.md` }) + "\n");
    fs.chmodSync(path.join(store.root, manifest), 0o666);
    for (const destination of [".trellis/tasks/once", ".trellis/tasks/twice"]) {
      relocateTaskRecordV2({ ...store, destination, expected_preimage: loadTaskRecordV2(store).preimage, name: path.basename(destination) });
      store.taskDir = destination;
      expect(loadTaskRecordV2(store).record.artifact_origin).toBe(origin);
      expect(loadTaskRecordV2(store).record.deliveries[0]?.results.planning).toEqual(planning);
      const moved = path.join(store.root, store.taskDir, `deliveries/${key.delivery_id}/check.jsonl`);
      expect(JSON.parse(fs.readFileSync(moved, "utf8"))).toEqual({ file: `${destination}/design.md`, reason: `Keep prose ${origin}/design.md` });
      expect(fs.statSync(moved).mode & 0o777).toBe(0o666);
    }
    storeApply(store, op({ api_version: "1.0", operation: "begin_check", key, expected_phase: "implementing", owner_role: "implementation", owner_id: native.workflow.owners.implementation, candidate: store.candidate }));
    if (!planning) throw new Error("missing Planning");
    const result = { ...planning, result_id: "moved-check", owner_role: "check" as const, owner_id: native.workflow.owners.check, outcome: "passed" as const, scope_ref: { ...planning.scope_ref, authority: ref(`${store.taskDir}/prd.md`) }, plan_ref: ref(`${store.taskDir}/design.md`), evidence: [ref(`${store.taskDir}/design.md`)], candidate: store.candidate, predecessor_result_id: planning.result_id };
    const request = op({ api_version: "1.0", operation: "record_gate", key, expected_phase: "checking", owner_role: "check", owner_id: result.owner_id, result });
    expect(storeApply(store, request).record.deliveries[0]?.results.check?.plan_ref).toEqual(store.plan);
    const before = loadTaskRecordV2(store).preimage;
    expect(storeApply(store, request).changed).toBe(false);
    expect(loadTaskRecordV2(store).preimage).toBe(before);
    const loaded = loadTaskRecordV2(store);
    errorCode(() => writeTaskRecordV2({ ...store, expected_preimage: loaded.preimage, record: { ...loaded.record, artifact_origin: ".trellis/tasks/wrong" } }), "immutable_artifact_origin");
  });

  it("reads fixed Git authority objects after their files disappear from the current tree", () => {
    const store = makeStore(true);
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: store.root, encoding: "utf8" }).trim();
    fs.unlinkSync(path.join(store.root, "plan.md"));
    verifyAuthority(store.root, { locator: "plan.md", revision });
    errorCode(() => verifyAuthority(store.root, { locator: "missing.md", revision }), "invalid_git_fact");
  });

  it("archives and reopens the same identity with identical retained history and no old gate authority", () => {
    const store = makeStore(); const origin = store.taskDir; prepareStore(store);
    const stopped = { result_id: "stop-relocation", owner_id: native.workflow.owners.implementation, evidence: [store.plan], reason: store.plan, scope_decision: store.authority };
    storeApply(store, op({ api_version: "1.0", operation: "stop", key, expected_phase: "implementing", owner_role: "implementation", owner_id: stopped.owner_id, result: stopped }));
    const completion = { result_id: "complete-relocation", owner_id: native.workflow.owners.completion, evidence: [store.authority], lifecycle_generation: 0, accepted_scope: store.authority, delivery_result_ids: [], outcome: "completed" as const };
    storeApply(store, op({ api_version: "1.0", operation: "complete_task", key: { task_id: key.task_id, lifecycle_generation: 0 }, owner_role: "completion", owner_id: completion.owner_id, result: completion }));
    const closure = { result_id: "close-relocation", owner_id: native.workflow.owners.closure, evidence: [store.authority], lifecycle_generation: 0, completion_result_id: completion.result_id, disposition: "no_mutation" as const, source_result: null };
    storeApply(store, op({ api_version: "1.0", operation: "close_task", key: { task_id: key.task_id, lifecycle_generation: 0 }, owner_role: "closure", owner_id: closure.owner_id, result: closure }));
    const before = loadTaskRecordV2(store).record;
    const archived = ".trellis/tasks/archive/2026-10/fixture";
    relocateTaskRecordV2({ ...store, destination: archived, expected_preimage: loadTaskRecordV2(store).preimage }); store.taskDir = archived;
    const request = op({ api_version: "1.0", operation: "reopen_task", key: { task_id: key.task_id, lifecycle_generation: 0 }, owner_role: "task_scope", owner_id: native.workflow.owners.task_scope, authority: store.authority });
    fs.mkdirSync(path.join(store.root, origin));
    const saved = loadTaskRecordV2(store).preimage;
    errorCode(() => storeApply(store, request), "task_destination_occupied");
    expect(loadTaskRecordV2(store).preimage).toBe(saved);
    fs.rmdirSync(path.join(store.root, origin));
    const next = storeApply(store, request).record; store.taskDir = origin;
    expect(next.id).toBe(before.id); expect(next.lifecycle_generation).toBe(1);
    expect(next.deliveries).toEqual(before.deliveries); expect(next.completion_results).toEqual(before.completion_results); expect(next.closure_results).toEqual(before.closure_results);
    expect(getCurrentDelivery(next, key).kind).toBe("error");
    expect(fs.existsSync(path.join(store.root, archived))).toBe(false);
    const afterReopen = loadTaskRecordV2(store).preimage;
    expect(storeApply(store, request)).toMatchObject({ changed: false, key: { task_id: key.task_id, lifecycle_generation: 1 } });
    expect(loadTaskRecordV2(store).preimage).toBe(afterReopen);
    errorCode(() => storeApply(store, { ...request, owner_id: "wrong-owner" }), "owner_mismatch");
    errorCode(() => storeApply(store, { ...request, authority: store.plan }), "stale_lifecycle_generation");
    const scope = fs.readFileSync(path.join(store.root, store.authority.locator));
    fs.writeFileSync(path.join(store.root, store.authority.locator), "authority drift\n");
    errorCode(() => storeApply(store, request), "authority_mismatch");
    expect(loadTaskRecordV2(store).preimage).toBe(afterReopen);
    fs.writeFileSync(path.join(store.root, store.authority.locator), scope);
    storeApply(store, op({ api_version: "1.0", operation: "create_delivery", key: { ...key, lifecycle_generation: 1, delivery_id: "22222222-2222-4222-8222-222222222222" }, owner_role: "creation", owner_id: native.workflow.owners.creation, scope_ref: { authority: store.authority, anchors: ["R1"] }, profile: "manual" }));
    const active = loadTaskRecordV2(store).preimage;
    errorCode(() => storeApply(store, request), "stale_lifecycle_generation");
    expect(loadTaskRecordV2(store).preimage).toBe(active);
  });

  it("rejects malformed origin, lifecycle-less archive, target collision and nested manifest symlinks without changing source", () => {
    const store = makeStore(); prepareStore(store); const before = loadTaskRecordV2(store);
    for (const origin of ["../outside", ".trellis/tasks/archive", ".trellis/tasks/fixture/prd.md", ".trellis/tasks/archive/2026-99/fixture"]) errorCode(() => parseTaskRecordV2({ ...before.record, artifact_origin: origin }), "invalid_locator");
    errorCode(() => relocateTaskRecordV2({ ...store, destination: ".trellis/tasks/archive/2026-10/fixture", expected_preimage: before.preimage }), "completion_and_closure_required");
    const target = ".trellis/tasks/occupied"; fs.mkdirSync(path.join(store.root, target));
    errorCode(() => relocateTaskRecordV2({ ...store, destination: target, expected_preimage: before.preimage }), "task_destination_occupied");
    const manifest = path.join(store.root, store.taskDir, `deliveries/${key.delivery_id}/check.jsonl`); fs.mkdirSync(path.dirname(manifest), { recursive: true }); fs.symlinkSync(path.join(store.root, "plan.md"), manifest);
    errorCode(() => relocateTaskRecordV2({ ...store, destination: ".trellis/tasks/renamed", expected_preimage: before.preimage }), "invalid_locator");
    expect(loadTaskRecordV2(store).preimage).toBe(before.preimage); expect(fs.existsSync(path.join(store.root, ".trellis/tasks/renamed"))).toBe(false);
  });
  it("never remaps candidate paths or grants a forged artifact context", () => {
    const store = makeStore(); const origin = store.taskDir;
    const file = `${origin}/candidate.md`; fs.writeFileSync(path.join(store.root, file), "Retained candidate path\n");
    const candidate: CandidateRef = { kind: "git_free", content_ref: computeCandidateContentRef(store.root, [file]), paths: [file], head_ref: null, base_ref: null };
    const revision = `sha256:${createHash("sha256").update(fs.readFileSync(path.join(store.root, file))).digest("hex")}`;
    relocateTaskRecordV2({ ...store, destination: ".trellis/tasks/renamed", expected_preimage: loadTaskRecordV2(store).preimage }); store.taskDir = ".trellis/tasks/renamed";
    errorCode(() => verifyCandidate(store.root, candidate), "candidate_mismatch");
    const before = loadTaskRecordV2(store).preimage;
    expect(resolveTaskArtifactLocator(store, { locator: file, revision })).toBe(`${store.taskDir}/candidate.md`);
    const other = { locator: ".trellis/tasks/fixture-other/candidate.md", revision };
    expect(resolveTaskArtifactLocator(store, other)).toBe(other.locator);
    expect(resolveTaskArtifactLocator(store, { locator: file, revision: "a".repeat(40) })).toBe(file);
    const external = { locator: "https://example.test/authority", revision };
    expect(resolveTaskArtifactLocator(store, external)).toBe(external.locator);
    expect(loadTaskRecordV2(store).preimage).toBe(before);
    verifyAuthority(store.root, { locator: file, revision }, { task_id: key.task_id, task_root: store.taskDir, artifact_origin: origin });
    errorCode(() => verifyAuthority(store.root, { locator: file, revision }, { task_id: "different-task", task_root: store.taskDir, artifact_origin: origin }), "invalid_artifact_context");
  });

});

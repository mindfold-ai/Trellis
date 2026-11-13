import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTaskOperation, applyTaskOperationToStore, computeCandidateContentRef, emptyTaskRecordV2, getCurrentDelivery, getGateApplicability, loadTaskRecordV2, parseTaskRecordV2, serializeTaskRecordV2, TaskV2Error, verifyCandidate, writeTaskRecordV2, type AuthorityRef, type CandidateRef, type TaskOperation, type TaskRecordV2, type WorkflowContract } from "../../src/task/v2/index.js";

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
function runFixture(fixture: Fixture, until = fixture.steps.length): TaskRecordV2 {
  for (const item of fixture.schema_cases ?? []) errorCode(() => parseTaskRecordV2(item.input), item.expect_error);
  for (const item of fixture.hash_cases ?? []) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-v2-hash-")); directories.push(root);
    for (const [name, contents] of Object.entries(item.files)) { fs.writeFileSync(path.join(root, name), contents); fs.chmodSync(path.join(root, name), item.modes?.[name] ?? 0o644); }
    expect(computeCandidateContentRef(root, item.paths, item.kind)).toBe(item.content_ref);
  }
  let record = fixture.initial;
  for (const step of fixture.steps.slice(0, until)) {
    if (step.expect_error) { errorCode(() => applyTaskOperation(record, step.operation, fixture.workflow), step.expect_error); continue; }
    const result = applyTaskOperation(record, step.operation, fixture.workflow);
    if (step.expected_phase) expect(result.phase).toBe(step.expected_phase);
    if (step.expected_changed !== undefined) expect(result.changed).toBe(step.expected_changed);
    record = result.record;
  }
  return record;
}
function op<T extends TaskOperation>(operation: T): T { return operation; }
function retainedAtPhase(profile: "manual" | "local_commit", phase: string): TaskRecordV2 {
  let record = native.initial;
  for (const step of native.steps) {
    if (step.expect_error) continue;
    const operation = step.operation.operation === "create_delivery" ? { ...step.operation, profile } : step.operation;
    record = applyTaskOperation(record, operation, native.workflow).record;
    if (record.deliveries[0]?.phase === phase) {
      // A separate normally delivered slice supplies retained gate and outcome history.
      for (const peerStep of native.steps.slice(1, 10)) {
        if (peerStep.expect_error) continue;
        const peer = structuredClone(peerStep.operation);
        if (!("delivery_id" in peer.key)) throw new Error("expected Delivery operation");
        peer.key.delivery_id = "22222222-2222-4222-8222-222222222222";
        if ("result" in peer) {
          peer.result.result_id = `peer-${peer.result.result_id}`;
          if ("predecessor_result_id" in peer.result && peer.result.predecessor_result_id !== null) peer.result.predecessor_result_id = `peer-${peer.result.predecessor_result_id}`;
        }
        record = applyTaskOperation(record, peer, native.workflow).record;
      }
      return record;
    }
  }
  throw new Error(`fixture did not reach ${phase}`);
}
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

describe("Task v2 closed lifecycle", () => {
  for (const file of fs.readdirSync(fixtures).filter((name) => name.endsWith(".json"))) {
    it(`shared TS/Python operation fixture: ${file}`, () => { runFixture(JSON.parse(fs.readFileSync(path.join(fixtures, file), "utf8")) as Fixture); });
  }
  it("keeps complete separate from delivered, supports no-new-delivery completion after reopen", () => {
    const record = runFixture(native);
    expect(record.lifecycle_generation).toBe(1);
    expect(record.deliveries.map((d) => [d.id, d.phase, d.lifecycle_generation])).toEqual([[key.delivery_id, "delivered", 0], ["22222222-2222-4222-8222-222222222222", "stopped", 0]]);
    expect(record.completion_results.map((r) => r.lifecycle_generation)).toEqual([0, 1]);
    expect(record.closure_results[0]?.completion_result_id).toBe("completed-g0");
  });
  it("returns query absence and errors without choosing a lone Delivery", () => {
    const record = runFixture(native, 2);
    expect(getCurrentDelivery(null, null)).toEqual({ kind: "no_current_task" });
    expect(getCurrentDelivery(record, { task_id: key.task_id, lifecycle_generation: 0 })).toEqual({ kind: "no_current_delivery", key: { task_id: key.task_id, lifecycle_generation: 0 } });
    expect(getCurrentDelivery(record, key).kind).toBe("current");
    expect(getCurrentDelivery(record, { ...key, lifecycle_generation: 1 }).kind).toBe("error");
    expect(getCurrentDelivery(runFixture(native, 10), key).kind).toBe("terminal_delivery");
  });
  it("fails owners and cannot bypass reopened generation by replacing accepted scope", () => {
    const record = runFixture(native, 2); const bad = { ...native.steps[2]?.operation, owner_id: "wrong-owner" };
    errorCode(() => applyTaskOperation(record, bad, native.workflow), "owner_mismatch");
    const completedIndex = native.steps.findIndex((s) => s.operation.operation === "complete_task" && !s.expect_error);
    const completed = runFixture(native, completedIndex + 1);
    const accept = native.steps[0]?.operation;
    if (!accept || accept.operation !== "accept_scope") throw new Error("fixture missing scope operation");
    errorCode(() => applyTaskOperation(completed, { ...accept, authority: { ...accept.authority, revision: "new-scope" } }, native.workflow), "reopen_required");
  });
  it("retains same undelivered identity through qualified rework, and stale results cannot advance", () => {
    const record = runFixture(native, 8); const d = record.deliveries[0]; if (!d) throw new Error("missing Delivery");
    const reworked = applyTaskOperation(record, { api_version: "1.0", operation: "rework", key, owner_role: "readiness", owner_id: native.workflow.owners.readiness, expected_phase: "reviewing", target_role: "implementation", reason: { locator: "https://example.test/finding", revision: "1" }, affected_results: ["check", "full_review", "readiness"] }, native.workflow).record;
    expect(reworked.deliveries[0]?.id).toBe(d.id); expect(reworked.deliveries[0]?.results.planning).toEqual(d.results.planning);
    errorCode(() => applyTaskOperation(reworked, native.steps[8]?.operation, native.workflow), "stale_phase");
    errorCode(() => applyTaskOperation(record, { api_version: "1.0", operation: "rework", key, owner_role: "readiness", owner_id: native.workflow.owners.readiness, expected_phase: "reviewing", target_role: "planning", reason: { locator: "https://example.test/finding", revision: "1" }, affected_results: [], scope_ref: { ...d.scope_ref, authority: { locator: "wrong.md", revision: "different" } } }, native.workflow), "stale_scope");
  });
  it("historical recovery never invents current gates or allows wrong-key retries", () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(fixtures, "guru-public-mapping.json"), "utf8")) as Fixture;
    const initial = runFixture(fixture, 2);
    const historical = fixture.steps.find((s) => s.operation.operation === "record_delivery")?.operation;
    if (!historical || historical.operation !== "record_delivery") throw new Error("missing history request");
    const recovered = applyTaskOperation(initial, historical, fixture.workflow).record;
    expect(recovered.deliveries[0]?.phase).toBe("delivered"); expect(recovered.deliveries[0]?.results).toEqual({ planning: null, check: null, full_review: null, readiness: null });
    errorCode(() => applyTaskOperation(recovered, { ...historical, key: { ...historical.key, lifecycle_generation: 1 } }, fixture.workflow), "delivery_identity_mismatch");
  });
  it("refreshes the same PR after rework and retains only the latest publication projection", () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(fixtures, "publication-rework.json"), "utf8")) as Fixture;
    const record = runFixture(fixture);
    const delivery = record.deliveries[0];
    expect(delivery?.id).toBe(key.delivery_id);
    expect(delivery?.publication_result?.result_id).toBe("publication-revised-head");
    expect(delivery?.delivery_result?.result_id).toBe("merged-revised");
    expect(delivery?.publication_result?.candidate).toEqual(delivery?.delivery_result?.candidate);
    expect(delivery?.publication_result?.target_ref).toBe("release");
    const published = runFixture(fixture, 8);
    const original = fixture.steps[7]?.operation;
    if (!original || original.operation !== "record_publication") throw new Error("missing publication");
    const owner = "replacement-publication-owner";
    errorCode(() => applyTaskOperation(published, { ...original, owner_id: owner, result: { ...original.result, result_id: "replacement-owner-result", owner_id: owner } }, { ...fixture.workflow, owners: { ...fixture.workflow.owners, publication: owner } }), "publication_identity_mismatch");
  });
  it("restores a missing historical publication only against the exact terminal PR fact", () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(fixtures, "guru-public-mapping.json"), "utf8")) as Fixture;
    const initial = runFixture(fixture, 2);
    const historical = fixture.steps[9]?.operation;
    const publication = fixture.steps[7]?.operation;
    if (!historical || historical.operation !== "record_delivery" || !publication || publication.operation !== "record_publication") throw new Error("missing history");
    const delivered = applyTaskOperation(initial, historical, fixture.workflow).record;
    const recover = { ...publication, historical_success: true };
    for (const result of [{ ...publication.result, repo_ref: "castbox/Other" }, { ...publication.result, pr_number: 456 }, { ...publication.result, target_ref: "release" }, { ...publication.result, reviewed_head: "f".repeat(40), candidate: { ...publication.result.candidate, head_ref: "f".repeat(40) } }]) {
      errorCode(() => applyTaskOperation(delivered, { ...recover, result }, fixture.workflow), "publication_identity_mismatch");
    }
    const restored = applyTaskOperation(delivered, recover, fixture.workflow);
    expect(restored.record.deliveries[0]?.delivery_result).toEqual(delivered.deliveries[0]?.delivery_result);
    expect(restored.record.deliveries[0]?.results).toEqual(delivered.deliveries[0]?.results);
    expect(applyTaskOperation(restored.record, recover, fixture.workflow).changed).toBe(false);
  });
  it("rejects unsupported current profiles including replay while permitting original historical outcome recovery", () => {
    const planningIndex = native.steps.findIndex((step) => step.operation.operation === "record_gate" && step.operation.result.owner_role === "planning" && !step.expect_error);
    const record = runFixture(native, planningIndex + 1);
    const declaration: WorkflowContract = { ...native.workflow, profiles: ["pull_request"] };
    const planning = native.steps[planningIndex]?.operation;
    errorCode(() => applyTaskOperation(record, planning, declaration), "unsupported_delivery_profile");
    const begin = native.steps.find((step) => step.operation.operation === "begin_check")?.operation;
    errorCode(() => applyTaskOperation(record, begin, declaration), "unsupported_delivery_profile");
    const delivered = native.steps.find((step) => step.operation.operation === "record_delivery")?.operation;
    if (!delivered || delivered.operation !== "record_delivery") throw new Error("missing delivery fixture");
    const recovered = applyTaskOperation(record, { ...delivered, historical_success: true }, declaration);
    expect(recovered.phase).toBe("delivered");
    expect(recovered.record.deliveries[0]?.results.check).toBeNull();
    errorCode(() => applyTaskOperation(recovered.record, delivered, declaration), "unsupported_delivery_profile");
  });
  const stopStages = [
    ["planning", "planning"], ["implementing", "implementation"], ["checking", "check"],
    ["reviewing", "full_review"], ["reviewing", "readiness"],
    ["publishing", "publication"], ["publishing", "delivery"],
  ] as const;
  for (const profile of ["manual", "local_commit"] as const) {
    it.each(stopStages)(`stops retained unsupported ${profile} in %s through %s without changing other facts`, (phase, role) => {
      const record = retainedAtPhase(profile, phase);
      const declaration: WorkflowContract = { ...native.workflow, profiles: ["pull_request"] };
      const owner = declaration.owners[role];
      const reason = { locator: "https://example.test/withdrawal", revision: "1" };
      const request = op({ api_version: "1.0", operation: "stop", key, owner_role: role, owner_id: owner, expected_phase: phase, result: { result_id: "withdrawn", owner_id: owner, evidence: [reason], reason, scope_decision: reason } });
      const before = structuredClone(record);
      const result = applyTaskOperation(record, request, declaration);
      const expected = structuredClone(before);
      const withdrawn = expected.deliveries[0]; if (!withdrawn) throw new Error("missing Delivery");
      withdrawn.phase = "stopped"; withdrawn.stop_result = request.result;
      expect(result.record).toEqual(expected);
      expect(result.changed).toBe(true);
      expect(result.result_id).toBe(request.result.result_id);
      expect(record).toEqual(before);
      expect(applyTaskOperation(result.record, request, declaration)).toEqual({ ...result, changed: false });
    });
  }
  it("retains ordinary stop mistakes and terminal guards for unsupported profiles", () => {
    const record = retainedAtPhase("manual", "planning");
    const declaration: WorkflowContract = { ...native.workflow, profiles: ["pull_request"] };
    const reason = { locator: "https://example.test/withdrawal", revision: "1" };
    const request = op({ api_version: "1.0", operation: "stop", key, owner_role: "planning", owner_id: declaration.owners.planning, expected_phase: "planning", result: { result_id: "withdrawn", owner_id: declaration.owners.planning, evidence: [reason], reason, scope_decision: reason } });
    errorCode(() => applyTaskOperation(record, { ...request, owner_role: "implementation", owner_id: declaration.owners.implementation, result: { ...request.result, owner_id: declaration.owners.implementation } }, declaration), "owner_mismatch");
    errorCode(() => applyTaskOperation(record, { ...request, expected_phase: "implementing" }, declaration), "stale_phase");
    errorCode(() => applyTaskOperation(record, { ...request, key: { ...key, lifecycle_generation: 1 } }, declaration), "delivery_identity_mismatch");
    const stopped = applyTaskOperation(record, request, declaration).record;
    errorCode(() => applyTaskOperation(stopped, { ...request, result: { ...request.result, reason: { ...reason, revision: "2" } } }, declaration), "result_identity_conflict");
    errorCode(() => applyTaskOperation(stopped, { ...request, expected_phase: "stopped", result: { ...request.result, result_id: "second-stop" } }, declaration), "terminal_delivery");
    const delivered = runFixture(native, 10);
    errorCode(() => applyTaskOperation(delivered, { ...request, expected_phase: "delivered" }, declaration), "terminal_delivery");
  });
  it("rejects unknown fields, path escape, future results and fake terminal records", () => {
    const record = runFixture(native, 2);
    errorCode(() => parseTaskRecordV2({ ...record, status: "completed" }), "invalid_record");
    errorCode(() => parseTaskRecordV2({ ...record, meta: { phase: "delivered" } }), "invalid_record");
    errorCode(() => parseTaskRecordV2({ ...record, accepted_scope: { locator: "../outside", revision: "1" } }), "invalid_locator");
    const d = record.deliveries[0]; if (!d) throw new Error("missing Delivery");
    errorCode(() => parseTaskRecordV2({ ...record, deliveries: [{ ...d, phase: "delivered" }] }), "invalid_record");
    errorCode(() => parseTaskRecordV2({ ...record, deliveries: [{ ...d, lifecycle_generation: 1 }] }), "invalid_record");
  });
  it("reads applicability independently of phase without mutating results or choosing an owner", () => {
    const record = runFixture(native, 8); const serialized = JSON.stringify(record);
    expect(getGateApplicability(record, key).full_review.kind).toBe("applicable");
    expect(getGateApplicability(record, key).readiness.kind).toBe("missing");
    const accept = native.steps[0]?.operation; if (!accept || accept.operation !== "accept_scope") throw new Error("missing scope");
    const changed = applyTaskOperation(record, { ...accept, authority: { ...accept.authority, revision: "new-authority" } }, native.workflow).record;
    expect(changed.deliveries[0]?.phase).toBe("reviewing");
    expect(getGateApplicability(changed, key).full_review).toEqual({ kind: "not_applicable", result_id: "d1-review", code: "stale_scope" });
    expect(JSON.stringify(record)).toBe(serialized);
    expect(getGateApplicability(runFixture(native), key).planning.code).toBe("stale_lifecycle_generation");
  });
});

describe("Task v2 objective atomic store", () => {
  it.each(["manual", "local_commit"] as const)("persists only stop for a retained unsupported %s slice and preserves retry bytes", (profile) => {
    const store = makeStore(); prepareStore(store, profile);
    storeApply(store, op({ api_version: "1.0", operation: "create_delivery", key: { ...key, delivery_id: "22222222-2222-4222-8222-222222222222" }, owner_role: "creation", owner_id: native.workflow.owners.creation, scope_ref: { authority: store.authority, anchors: ["R2"] }, profile: "pull_request" }));
    const workflow: WorkflowContract = { ...native.workflow, profiles: ["pull_request"] };
    const request = op({ api_version: "1.0", operation: "stop", key, owner_role: "implementation", owner_id: workflow.owners.implementation, expected_phase: "implementing", result: { result_id: "stored-withdrawal", owner_id: workflow.owners.implementation, evidence: [store.authority], reason: store.authority, scope_decision: store.authority } });
    const before = loadTaskRecordV2(store).record;
    const result = applyTaskOperationToStore({ ...store, workflow, operation: request, expected_preimage: loadTaskRecordV2(store).preimage });
    const expected = structuredClone(before);
    const withdrawn = expected.deliveries[0]; if (!withdrawn) throw new Error("missing Delivery");
    withdrawn.phase = "stopped"; withdrawn.stop_result = request.result;
    expect(result.record).toEqual(expected);
    expect(loadTaskRecordV2(store).record).toEqual(expected);
    const after = loadTaskRecordV2(store).preimage;
    expect(applyTaskOperationToStore({ ...store, workflow, operation: request, expected_preimage: after }).changed).toBe(false);
    expect(loadTaskRecordV2(store).preimage).toBe(after);
  });
  it("rejects mutable commit refs and annotated tag objects while recovering the exact immutable commit", () => {
    const store = makeStore(true); prepareStore(store, "local_commit");
    const head = store.candidate.head_ref; if (!head) throw new Error("missing exact commit");
    const request = (commit: string): TaskOperation => op({ api_version: "1.0", operation: "record_delivery", key, expected_phase: "implementing", historical_success: true, owner_role: "delivery", owner_id: native.workflow.owners.delivery, result: { result_id: "immutable-commit-result", owner_id: native.workflow.owners.delivery, evidence: [store.plan], profile: "local_commit", candidate: { ...store.candidate, head_ref: commit }, commit } });
    const before = loadTaskRecordV2(store).preimage;
    const branch = execFileSync("git", ["branch", "--show-current"], { cwd: store.root, encoding: "utf8" }).trim();
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "tag", "-am", "tag object", "candidate-tag"], { cwd: store.root });
    for (const commit of ["HEAD", branch, "candidate-tag", head.slice(0, 12)]) {
      errorCode(() => storeApply(store, request(commit)), "invalid_record");
      expect(loadTaskRecordV2(store).preimage).toBe(before);
    }
    const tag = execFileSync("git", ["rev-parse", "candidate-tag"], { cwd: store.root, encoding: "utf8" }).trim();
    errorCode(() => storeApply(store, request(tag)), "invalid_git_fact");
    const hexNamedBranch = "1".repeat(40);
    execFileSync("git", ["branch", hexNamedBranch], { cwd: store.root });
    errorCode(() => storeApply(store, request(hexNamedBranch)), "invalid_git_fact");
    expect(loadTaskRecordV2(store).preimage).toBe(before);
    expect(storeApply(store, request(head)).phase).toBe("delivered");
  });
  it("verifies an actual SHA-256 commit object through historical local delivery", () => {
    const store = makeStore(true, "sha256"); prepareStore(store, "local_commit");
    const commit = store.candidate.head_ref; if (!commit) throw new Error("missing commit");
    expect(commit).toMatch(/^[a-f0-9]{64}$/);
    const before = loadTaskRecordV2(store).preimage;
    const prefix = commit.slice(0, 40);
    errorCode(() => storeApply(store, op({ api_version: "1.0", operation: "record_delivery", key, expected_phase: "implementing", historical_success: true, owner_role: "delivery", owner_id: native.workflow.owners.delivery, result: { result_id: "truncated-sha256-commit", owner_id: native.workflow.owners.delivery, evidence: [store.plan], profile: "local_commit", candidate: { ...store.candidate, head_ref: prefix }, commit: prefix } })), "invalid_git_fact");
    expect(loadTaskRecordV2(store).preimage).toBe(before);
    expect(storeApply(store, op({ api_version: "1.0", operation: "record_delivery", key, expected_phase: "implementing", historical_success: true, owner_role: "delivery", owner_id: native.workflow.owners.delivery, result: { result_id: "actual-sha256-commit", owner_id: native.workflow.owners.delivery, evidence: [store.plan], profile: "local_commit", candidate: store.candidate, commit } })).phase).toBe("delivered");
  });
  it("isolates all Git reads, including historical blob bytes, from another repository's environment", () => {
    const store = makeStore(true); const foreign = makeStore(true);
    fs.writeFileSync(path.join(store.root, "artifact.txt"), "Own accepted repository content\n");
    execFileSync("git", ["add", "artifact.txt"], { cwd: store.root });
    execFileSync("git", ["-c", "user.name=Own", "-c", "user.email=own@example.invalid", "commit", "-qm", "own candidate"], { cwd: store.root });
    store.candidate = { ...store.candidate, head_ref: execFileSync("git", ["rev-parse", "HEAD"], { cwd: store.root, encoding: "utf8" }).trim(), content_ref: computeCandidateContentRef(store.root, ["artifact.txt"]) };
    prepareStore(store, "local_commit");
    fs.writeFileSync(path.join(foreign.root, "artifact.txt"), "Unrelated repository content\n");
    execFileSync("git", ["add", "artifact.txt"], { cwd: foreign.root });
    execFileSync("git", ["-c", "user.name=Foreign", "-c", "user.email=foreign@example.invalid", "commit", "-qm", "foreign candidate"], { cwd: foreign.root });
    const foreignHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: foreign.root, encoding: "utf8" }).trim();
    const foreignBefore = loadTaskRecordV2(foreign).preimage;
    const contaminated = { GIT_DIR: path.join(foreign.root, ".git"), GIT_WORK_TREE: foreign.root, GIT_COMMON_DIR: path.join(foreign.root, ".git"), GIT_INDEX_FILE: path.join(foreign.root, ".git/index"), GIT_OBJECT_DIRECTORY: path.join(foreign.root, ".git/objects"), GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(foreign.root, ".git/objects"), GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.worktree", GIT_CONFIG_VALUE_0: foreign.root };
    for (const [name, value] of Object.entries(contaminated)) vi.stubEnv(name, value);
    const begin = op({ api_version: "1.0", operation: "begin_check", key, owner_role: "implementation", owner_id: native.workflow.owners.implementation, expected_phase: "implementing", candidate: store.candidate });
    expect(storeApply(store, begin).phase).toBe("checking");
    errorCode(() => verifyCandidate(store.root, { ...store.candidate, head_ref: foreignHead }), "candidate_mismatch");
    const commit = store.candidate.head_ref; if (!commit) throw new Error("missing own commit");
    const request = op({ api_version: "1.0", operation: "record_delivery", key, expected_phase: "checking", historical_success: true, owner_role: "delivery", owner_id: native.workflow.owners.delivery, result: { result_id: "own-repo-outcome", owner_id: native.workflow.owners.delivery, evidence: [store.plan], profile: "local_commit", candidate: store.candidate, commit } });
    expect(storeApply(store, request).phase).toBe("delivered");
    expect(fs.readFileSync(path.join(foreign.root, "artifact.txt"), "utf8")).toBe("Unrelated repository content\n");
    expect(loadTaskRecordV2(foreign).preimage).toBe(foreignBefore);
  });
  it.each([0o600, 0o640, 0o700, 0o750])("normalizes Git mode %s for actual commit recovery and retains full Git-free permissions", (mode) => {
    const store = makeStore(true); const file = path.join(store.root, "artifact.txt"); fs.chmodSync(file, mode);
    execFileSync("git", ["add", "artifact.txt"], { cwd: store.root });
    if (mode & 0o100) execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "make candidate executable"], { cwd: store.root });
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: store.root, encoding: "utf8" }).trim();
    const contents = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    const expected = `sha256:${createHash("sha256").update(JSON.stringify([["artifact.txt", mode & 0o100 ? 0o755 : 0o644, contents]])).digest("hex")}`;
    expect(computeCandidateContentRef(store.root, ["artifact.txt"])).toBe(expected);
    expect(computeCandidateContentRef(store.root, ["artifact.txt"], "git")).toBe(expected);
    expect(computeCandidateContentRef(store.root, ["artifact.txt"], "git_free")).not.toBe(expected);
    store.candidate = { ...store.candidate, content_ref: expected, head_ref: commit }; prepareStore(store, "local_commit");
    expect(storeApply(store, op({ api_version: "1.0", operation: "begin_check", key, expected_phase: "implementing", owner_role: "implementation", owner_id: native.workflow.owners.implementation, candidate: store.candidate })).phase).toBe("checking");
    expect(storeApply(store, op({ api_version: "1.0", operation: "record_delivery", key, expected_phase: "checking", historical_success: true, owner_role: "delivery", owner_id: native.workflow.owners.delivery, result: { result_id: "normalized-mode-outcome", owner_id: native.workflow.owners.delivery, evidence: [store.plan], profile: "local_commit", candidate: store.candidate, commit } })).phase).toBe("delivered");
  });
  it("verifies explicit Git-free permissions inside a Git checkout independently of Git mode normalization", () => {
    const store = makeStore(true); const file = path.join(store.root, "artifact.txt"); fs.chmodSync(file, 0o640);
    const candidate: CandidateRef = { ...store.candidate, kind: "git_free", content_ref: computeCandidateContentRef(store.root, ["artifact.txt"], "git_free"), head_ref: null };
    expect(() => verifyCandidate(store.root, candidate)).not.toThrow();
    fs.chmodSync(file, 0o600);
    errorCode(() => verifyCandidate(store.root, candidate), "candidate_mismatch");
    expect(() => verifyCandidate(store.root, store.candidate)).not.toThrow();
  });
  it("verifies revised PR postconditions before replacing the publication and normally delivering the same slice", () => {
    const store = makeStore(true); prepareStore(store, "pull_request");
    const apply = (operation: TaskOperation, verifyFact?: Parameters<typeof applyTaskOperationToStore>[0]["verifyFact"]) => applyTaskOperationToStore({ ...store, operation, workflow: native.workflow, expected_preimage: loadTaskRecordV2(store).preimage, verifyFact });
    const gates = (suffix: string): void => {
      apply(op({ api_version: "1.0", operation: "begin_check", key, expected_phase: "implementing", owner_role: "implementation", owner_id: native.workflow.owners.implementation, candidate: store.candidate }));
      let previous = "actual-plan";
      for (const role of ["check", "full_review", "readiness"] as const) {
        const result = { result_id: `${suffix}-${role}`, owner_role: role, owner_id: native.workflow.owners[role], outcome: role === "readiness" ? "ready" as const : "passed" as const, scope_ref: { authority: store.authority, anchors: ["R1"] }, plan_ref: store.plan, candidate: store.candidate, predecessor_result_id: previous, obligations: [], evidence: [store.plan] };
        apply(op({ api_version: "1.0", operation: "record_gate", key, expected_phase: role === "check" ? "checking" : "reviewing", owner_role: role, owner_id: result.owner_id, result })); previous = result.result_id;
      }
    };
    gates("original");
    const result = { result_id: "actual-publication", owner_id: native.workflow.owners.publication, evidence: [store.plan], profile: "pull_request" as const, candidate: store.candidate, repo_ref: "castbox/Trellis", pr_number: 123, reviewed_head: store.candidate.head_ref as string, target_ref: "main", publication_ref: { locator: "https://example.test/pr/123", revision: "payload-1" } };
    const published = op({ api_version: "1.0", operation: "record_publication", key, expected_phase: "publishing", owner_role: "publication", owner_id: result.owner_id, result });
    let actual = { repo: result.repo_ref, pr: result.pr_number, head: result.reviewed_head, target: result.target_ref, payload: result.publication_ref, merged: false };
    const verify = vi.fn((fact: Parameters<NonNullable<Parameters<typeof applyTaskOperationToStore>[0]["verifyFact"]>>[0]) => fact.profile === "pull_request" && fact.repo_ref === actual.repo && fact.pr_number === actual.pr && fact.reviewed_head === actual.head && fact.target_ref === actual.target && ("publication_ref" in fact ? JSON.stringify(fact.publication_ref) === JSON.stringify(actual.payload) : actual.merged));
    apply(published, verify);
    apply(op({ api_version: "1.0", operation: "rework", key, expected_phase: "publishing", owner_role: "publication", owner_id: result.owner_id, target_role: "implementation", reason: store.plan, affected_results: ["check", "full_review", "readiness"] }));
    expect(loadTaskRecordV2(store).record.deliveries[0]?.publication_result).toEqual(result);
    fs.writeFileSync(path.join(store.root, "artifact.txt"), "Revised actual artifact\n");
    execFileSync("git", ["add", "artifact.txt"], { cwd: store.root }); execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "revise actual candidate"], { cwd: store.root });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: store.root, encoding: "utf8" }).trim();
    store.candidate = { ...store.candidate, head_ref: head, content_ref: computeCandidateContentRef(store.root, ["artifact.txt"]) }; gates("revised");
    const revised = { ...published, result: { ...result, result_id: "actual-publication-revised", candidate: store.candidate, reviewed_head: head, target_ref: "release", publication_ref: { ...result.publication_ref, revision: "payload-2" } } };
    const retained = loadTaskRecordV2(store).preimage;
    errorCode(() => apply(revised), "fact_verification_required");
    errorCode(() => apply(revised, verify), "fact_verification_required");
    expect(loadTaskRecordV2(store).preimage).toBe(retained);
    actual = { ...actual, head, target: "release", payload: revised.result.publication_ref };
    expect(apply(revised, verify).changed).toBe(true);
    const beforeRetry = loadTaskRecordV2(store).preimage; const calls = verify.mock.calls.length;
    expect(apply({ ...revised, historical_success: true }, verify).changed).toBe(false);
    expect(verify.mock.calls).toHaveLength(calls); expect(loadTaskRecordV2(store).preimage).toBe(beforeRetry);
    const readiness = loadTaskRecordV2(store).record.deliveries[0]?.results.readiness;
    if (!readiness) throw new Error("missing revised readiness");
    apply(op({ api_version: "1.0", operation: "rework", key, expected_phase: "publishing", owner_role: "publication", owner_id: result.owner_id, target_role: "readiness", reason: store.plan, affected_results: ["readiness"] }));
    actual.payload = { ...actual.payload, revision: "actual-lost-payload-3" };
    const recovered = { ...revised, historical_success: true, result: { ...revised.result, result_id: "recovered-publication-3", publication_ref: actual.payload } };
    expect(apply(recovered, verify).phase).toBe("reviewing");
    expect(loadTaskRecordV2(store).record.deliveries[0]?.results.readiness).toBeNull();
    const recoveryBytes = loadTaskRecordV2(store).preimage;
    errorCode(() => apply({ ...revised, historical_success: true }, verify), "fact_verification_required");
    errorCode(() => apply({ ...published, historical_success: true }, verify), "fact_verification_required");
    expect(loadTaskRecordV2(store).preimage).toBe(recoveryBytes);
    expect(apply(recovered, verify).changed).toBe(false);
    apply(op({ api_version: "1.0", operation: "record_gate", key, expected_phase: "reviewing", owner_role: "readiness", owner_id: readiness.owner_id, result: { ...readiness, result_id: "recovered-publication-readiness", obligations: [actual.payload] } }));
    actual.merged = true;
    const delivered = { result_id: "actual-merged", owner_id: native.workflow.owners.delivery, evidence: [store.plan], profile: "pull_request" as const, candidate: store.candidate, repo_ref: actual.repo, pr_number: actual.pr, reviewed_head: head, merge_commit: "f".repeat(40), target_ref: actual.target };
    expect(apply(op({ api_version: "1.0", operation: "record_delivery", key, expected_phase: "publishing", owner_role: "delivery", owner_id: delivered.owner_id, result: delivered }), verify).phase).toBe("delivered");
  });
  it.each([".trellis", ".trellis/tasks", ".trellis/tasks/fixture"])("preserves the owned %s root alias while rejecting record and nested aliases", (locator) => {
    const store = makeStore();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-owned-root-")); directories.push(outside);
    const original = path.join(store.root, locator); const external = path.join(outside, "owned");
    fs.renameSync(original, external); fs.symlinkSync(external, original, "dir");
    prepareStore(store);
    const localPlan = `${store.taskDir}/plan.md`;
    fs.writeFileSync(path.join(store.root, localPlan), "aliased Task planning\n");
    const localAuthority = { locator: localPlan, revision: `sha256:${createHash("sha256").update("aliased Task planning\n").digest("hex")}` };
    expect(computeCandidateContentRef(store.root, [localPlan])).toMatch(/^sha256:[a-f0-9]{64}$/);
    storeApply(store, op({ api_version: "1.0", operation: "accept_scope", key: { task_id: key.task_id, lifecycle_generation: 0 }, owner_role: "task_scope", owner_id: native.workflow.owners.task_scope, authority: localAuthority }));
    const loaded = loadTaskRecordV2(store);
    writeTaskRecordV2({ ...store, record: { ...loaded.record, title: "alias metadata" }, expected_preimage: loaded.preimage });
    expect(loadTaskRecordV2(store).record.title).toBe("alias metadata");
    fs.symlinkSync(path.join(store.root, "artifact.txt"), path.join(store.root, "candidate-alias.txt"));
    errorCode(() => computeCandidateContentRef(store.root, ["candidate-alias.txt"]), "invalid_locator");
    const file = path.join(original, locator.endsWith("fixture") ? "task.json" : `${locator.endsWith("tasks") ? "" : "tasks/"}fixture/task.json`);
    const retained = path.join(outside, "retained.json"); fs.renameSync(file, retained); fs.symlinkSync(retained, file);
    errorCode(() => loadTaskRecordV2(store), "invalid_locator");
  });
  it.each(["requirements.md", "plan.md"])("rejects changed %s before Check and delivery without lifecycle writes", (locator) => {
    const store = makeStore(); prepareStore(store);
    const begin = op({ api_version: "1.0", operation: "begin_check", key, owner_role: "implementation", owner_id: native.workflow.owners.implementation, expected_phase: "implementing", candidate: store.candidate });
    const original = fs.readFileSync(path.join(store.root, locator), "utf8");
    const beforeCheck = loadTaskRecordV2(store).preimage;
    fs.writeFileSync(path.join(store.root, locator), "changed authority\n");
    errorCode(() => storeApply(store, begin), "authority_mismatch");
    expect(loadTaskRecordV2(store).preimage).toBe(beforeCheck);
    fs.writeFileSync(path.join(store.root, locator), original);
    storeApply(store, begin);
    let predecessor = "actual-plan";
    for (const role of ["check", "full_review", "readiness"] as const) {
      const result = { result_id: `actual-${role}`, owner_role: role, owner_id: native.workflow.owners[role], outcome: role === "readiness" ? "ready" as const : "passed" as const, scope_ref: { authority: store.authority, anchors: ["R1"] }, plan_ref: store.plan, candidate: store.candidate, predecessor_result_id: predecessor, obligations: [], evidence: [store.plan] };
      storeApply(store, op({ api_version: "1.0", operation: "record_gate", key, expected_phase: role === "check" ? "checking" : "reviewing", owner_role: role, owner_id: result.owner_id, result }));
      predecessor = result.result_id;
    }
    const beforeDelivery = loadTaskRecordV2(store).preimage;
    fs.writeFileSync(path.join(store.root, locator), "changed after readiness\n");
    const result = { result_id: "actual-manual", owner_id: native.workflow.owners.delivery, evidence: [store.authority], candidate: store.candidate, profile: "manual" as const, artifact: { locator: "artifact.txt", revision: `sha256:${createHash("sha256").update(fs.readFileSync(path.join(store.root, "artifact.txt"))).digest("hex")}` } };
    const delivery = op({ api_version: "1.0", operation: "record_delivery", key, expected_phase: "publishing", owner_role: "delivery", owner_id: result.owner_id, result });
    errorCode(() => storeApply(store, delivery), "authority_mismatch");
    expect(loadTaskRecordV2(store).preimage).toBe(beforeDelivery);
    expect(storeApply(store, { ...delivery, historical_success: true }).phase).toBe("delivered");
  });
  it("writes scoped candidate results without self-invalidating hashes and preserves mode on retry", () => {
    const store = makeStore(); prepareStore(store);
    const before = computeCandidateContentRef(store.root, ["artifact.txt"]);
    const operation = op({ api_version: "1.0", operation: "begin_check", key, owner_role: "implementation", owner_id: native.workflow.owners.implementation, expected_phase: "implementing", candidate: store.candidate });
    const file = path.join(store.root, store.taskDir, "task.json"); fs.chmodSync(file, 0o640); storeApply(store, operation);
    expect(computeCandidateContentRef(store.root, ["artifact.txt"])).toBe(before); expect(fs.statSync(file).mode & 0o777).toBe(0o640);
    expect(fs.readdirSync(path.dirname(file)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    errorCode(() => computeCandidateContentRef(store.root, [`${store.taskDir}/task.json`]), "invalid_candidate");
  });
  it("rejects stale preimages, changed content and mismatched local authority without writes", () => {
    const store = makeStore(); prepareStore(store); const loaded = loadTaskRecordV2(store);
    const operation = op({ api_version: "1.0", operation: "begin_check", key, owner_role: "implementation", owner_id: native.workflow.owners.implementation, expected_phase: "implementing", candidate: store.candidate });
    errorCode(() => applyTaskOperationToStore({ ...store, workflow: native.workflow, operation, expected_preimage: "stale" }), "stale_preimage");
    fs.writeFileSync(path.join(store.root, "artifact.txt"), "edited"); errorCode(() => storeApply(store, operation), "candidate_mismatch");
    expect(loadTaskRecordV2(store).preimage).toBe(loaded.preimage);
    const accept = op({ api_version: "1.0", operation: "accept_scope", key: { task_id: key.task_id, lifecycle_generation: 0 }, owner_role: "task_scope", owner_id: native.workflow.owners.task_scope, authority: { ...store.authority, revision: "sha256:" + "0".repeat(64) } });
    errorCode(() => storeApply(store, accept), "authority_mismatch"); expect(loadTaskRecordV2(store).preimage).toBe(loaded.preimage);
  });
  it("full-record write cannot forge phases or remove identities; corrupt originals survive", () => {
    const store = makeStore(); prepareStore(store); const loaded = loadTaskRecordV2(store);
    errorCode(() => writeTaskRecordV2({ ...store, record: { ...loaded.record, deliveries: [] }, expected_preimage: loaded.preimage }), "immutable_identity");
    errorCode(() => writeTaskRecordV2({ ...store, record: { ...loaded.record, lifecycle_generation: 1 }, expected_preimage: loaded.preimage }), "closed_operation_required");
    const file = path.join(store.root, store.taskDir, "task.json"); fs.writeFileSync(file, "corrupt bytes");
    expect(() => writeTaskRecordV2({ ...store, record: loaded.record, expected_preimage: "corrupt bytes" })).toThrow(); expect(fs.readFileSync(file, "utf8")).toBe("corrupt bytes");
  });
  it("rejects contained symlink children and exact/casefold archived identity collisions", () => {
    const store = makeStore(); const outside = fs.mkdtempSync(path.join(os.tmpdir(), "outside-v2-")); directories.push(outside); fs.writeFileSync(path.join(outside, "secret"), "data"); fs.symlinkSync(path.join(outside, "secret"), path.join(store.root, "link.txt"));
    errorCode(() => computeCandidateContentRef(store.root, ["link.txt"]), "invalid_locator");
    const archive = path.join(store.root, ".trellis/tasks/archive/2026-10/reserved"); fs.mkdirSync(archive, { recursive: true }); fs.writeFileSync(path.join(archive, "task.json"), JSON.stringify({ id: "Old_Reserved", status: "old-invalid" }));
    errorCode(() => writeTaskRecordV2({ root: store.root, taskDir: ".trellis/tasks/new", record: emptyTaskRecordV2({ id: "old_reserved" }) }), "task_id_collision");
    expect(fs.existsSync(path.join(store.root, ".trellis/tasks/new"))).toBe(false);
  });
  it("recovers actual local commit even after current content changed, without manufacturing gates", () => {
    const store = makeStore(true); prepareStore(store, "local_commit"); const candidate = store.candidate;
    fs.writeFileSync(path.join(store.root, "artifact.txt"), "new pending work");
    const head = candidate.head_ref; if (head === null) throw new Error("missing commit");
    const request = op({ api_version: "1.0", operation: "record_delivery", key, expected_phase: "implementing", historical_success: true, owner_role: "delivery", owner_id: native.workflow.owners.delivery, result: { result_id: "real-local-outcome", owner_id: native.workflow.owners.delivery, evidence: [store.authority], candidate, profile: "local_commit", commit: head } });
    const recover = (): ReturnType<typeof applyTaskOperationToStore> => applyTaskOperationToStore({ ...store, workflow: { ...native.workflow, profiles: ["manual"] }, operation: request, expected_preimage: loadTaskRecordV2(store).preimage });
    const result = recover(); expect(result.phase).toBe("delivered"); expect(result.record.deliveries[0]?.results.check).toBeNull();
    const before = loadTaskRecordV2(store).preimage; expect(recover().changed).toBe(false); expect(loadTaskRecordV2(store).preimage).toBe(before);
  });
  it("hashes real deleted paths and reconstructs their actual commit-tree outcome", () => {
    const store = makeStore(true);
    execFileSync("git", ["rm", "artifact.txt"], { cwd: store.root });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "remove artifact"], { cwd: store.root });
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: store.root, encoding: "utf8" }).trim();
    store.candidate = { ...store.candidate, content_ref: computeCandidateContentRef(store.root, ["artifact.txt"]), head_ref: commit };
    prepareStore(store, "local_commit");
    const result = storeApply(store, op({ api_version: "1.0", operation: "record_delivery", key, expected_phase: "implementing", historical_success: true, owner_role: "delivery", owner_id: native.workflow.owners.delivery, result: { result_id: "actual-deletion", owner_id: native.workflow.owners.delivery, evidence: [store.authority], profile: "local_commit", candidate: store.candidate, commit } }));
    expect(result.phase).toBe("delivered");
    fs.writeFileSync(path.join(store.root, "artifact.txt"), "new different file"); expect(computeCandidateContentRef(store.root, ["artifact.txt"])).not.toBe(store.candidate.content_ref);
  });
  it("a failed atomic replacement leaves raw bytes and mode intact", () => {
    const store = makeStore(); const loaded = loadTaskRecordV2(store); const file = path.join(store.root, store.taskDir, "task.json"); const mode = fs.statSync(file).mode;
    vi.spyOn(fs, "renameSync").mockImplementation(() => { throw new Error("simulated disk failure"); });
    expect(() => writeTaskRecordV2({ ...store, record: { ...loaded.record, title: "metadata change" }, expected_preimage: loaded.preimage })).toThrow("simulated disk failure");
    expect(fs.readFileSync(file, "utf8")).toBe(loaded.preimage); expect(fs.statSync(file).mode).toBe(mode);
    expect(fs.readdirSync(path.dirname(file))).toEqual(["task.json"]);
  });
  it("requires objective PR verifier and detects verifier-time concurrent changes", () => {
    const store = makeStore();
    const fixture = JSON.parse(fs.readFileSync(path.join(fixtures, "guru-public-mapping.json"), "utf8")) as Fixture;
    const initial = runFixture(fixture, 2); const file = path.join(store.root, store.taskDir, "task.json"); fs.writeFileSync(file, serializeTaskRecordV2(initial));
    const historical = fixture.steps.find((s) => s.operation.operation === "record_delivery")?.operation;
    const preimage = loadTaskRecordV2(store).preimage;
    errorCode(() => applyTaskOperationToStore({ ...store, workflow: fixture.workflow, operation: historical, expected_preimage: preimage }), "fact_verification_required");
    errorCode(() => applyTaskOperationToStore({ ...store, workflow: fixture.workflow, operation: historical, expected_preimage: preimage, verifyFact: () => { fs.writeFileSync(file, preimage + " "); return true; } }), "stale_preimage");
    expect(fs.readFileSync(file, "utf8")).toBe(preimage + " ");
  });
});

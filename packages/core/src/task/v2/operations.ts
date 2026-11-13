import { emptyTaskRecord, isPlainObject } from "../schema.js";
import { authority, candidate, deliveryFact, fail, gateResult, integer, member, object, parseTaskRecordV2, publicationFact, resultIdentity, slice, string, uuid, validateWorkflowContract } from "./schema.js";
import { DELIVERY_PHASES, OWNER_ROLES, type CurrentDelivery, type DeliveryKey, type DeliverySelection, type DeliveryRecord, type GateApplicability, type GateResult, type GateRole, type OperationOutput, type OwnerRole, type TaskKey, type TaskOperation, type TaskRecordV2, type WorkflowContract } from "./types.js";

export function emptyTaskRecordV2(overrides: Partial<TaskRecordV2> & Pick<TaskRecordV2, "id">): TaskRecordV2 {
  const { status: _status, commit: _commit, pr_url: _pr, completedAt: _completed, ...metadata } = emptyTaskRecord({ id: overrides.id });
  return parseTaskRecordV2({ ...metadata, schema_version: "2.0", accepted_scope: null, deliveries: [], completion_results: [], closure_results: [], ...overrides });
}
/** Canonical equality is property-order independent, shared with Python. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function same(left: unknown, right: unknown): boolean { return canonicalJson(left) === canonicalJson(right); }

const OP_FIELDS = {
  accept_scope: ["authority"], create_delivery: ["scope_ref", "profile"], begin_check: ["expected_phase", "candidate"], record_gate: ["expected_phase", "result"],
  rework: ["expected_phase", "target_role", "reason", "affected_results"], record_publication: ["expected_phase", "result"], record_delivery: ["expected_phase", "result"], stop: ["expected_phase", "result"],
  complete_task: ["result"], close_task: ["result"], reopen_task: ["authority"],
} as const;
export function parseTaskOperation(input: unknown): TaskOperation {
  if (!isPlainObject(input)) fail("invalid_operation", "operation must be an object");
  member(input.operation, Object.keys(OP_FIELDS) as (keyof typeof OP_FIELDS)[]);
  const optional = input.operation === "rework" ? ["scope_ref"] : ["record_publication", "record_delivery"].includes(input.operation) ? ["historical_success"] : [];
  object(input, ["api_version", "operation", "key", "owner_role", "owner_id", ...OP_FIELDS[input.operation]], optional);
  if (input.api_version !== "1.0") fail("unsupported_delivery_api", String(input.api_version)); member(input.owner_role, OWNER_ROLES); string(input.owner_id);
  const isDelivery = ["create_delivery", "begin_check", "record_gate", "rework", "record_publication", "record_delivery", "stop"].includes(input.operation);
  const key = object(input.key, ["task_id", "lifecycle_generation", ...(isDelivery ? ["delivery_id"] : [])]);
  string(key.task_id); if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key.task_id)) fail("invalid_operation", "invalid TaskId"); integer(key.lifecycle_generation); if (isDelivery) uuid(key.delivery_id);
  if ("expected_phase" in input) member(input.expected_phase, DELIVERY_PHASES);
  if ("historical_success" in input && typeof input.historical_success !== "boolean") fail("invalid_operation", "historical_success must be boolean");
  switch (input.operation) {
    case "accept_scope": case "reopen_task": authority(input.authority); break;
    case "create_delivery": slice(input.scope_ref); member(input.profile, ["manual", "local_commit", "pull_request"]); break;
    case "begin_check": candidate(input.candidate); break;
    case "record_gate": gateResult(input.result); break;
    case "record_publication": publicationFact(input.result); break;
    case "record_delivery": deliveryFact(input.result); break;
    case "rework":
      member(input.target_role, ["planning", "implementation", "check", "full_review", "readiness"]); authority(input.reason);
      if (!Array.isArray(input.affected_results)) fail("invalid_operation", "affected_results must be an array"); input.affected_results.forEach((role) => member(role, ["planning", "check", "full_review", "readiness"]));
      if ("scope_ref" in input) slice(input.scope_ref); break;
    case "stop": { const r = object(input.result, ["result_id", "owner_id", "evidence", "reason", "scope_decision"]); resultIdentity(r); authority(r.reason); authority(r.scope_decision); break; }
    case "complete_task": { const r = object(input.result, ["result_id", "owner_id", "evidence", "lifecycle_generation", "accepted_scope", "delivery_result_ids", "outcome"]); resultIdentity(r); integer(r.lifecycle_generation); authority(r.accepted_scope); member(r.outcome, ["completed"]); if (!Array.isArray(r.delivery_result_ids)) fail("invalid_operation", "delivery_result_ids required"); r.delivery_result_ids.forEach(string); break; }
    case "close_task": { const r = object(input.result, ["result_id", "owner_id", "evidence", "lifecycle_generation", "completion_result_id", "disposition", "source_result"]); resultIdentity(r); integer(r.lifecycle_generation); string(r.completion_result_id); member(r.disposition, ["no_mutation", "source_closed"]); if (r.disposition === "source_closed") authority(r.source_result); else if (r.source_result !== null) fail("invalid_operation", "no_mutation has no source result"); break; }
  }
  return structuredClone(input) as unknown as TaskOperation;
}
function requireOwner(op: TaskOperation, workflow: WorkflowContract, role: OwnerRole): void {
  if (op.owner_role !== role || workflow.owners[role] !== op.owner_id) fail("owner_mismatch", `${role} is owned by ${workflow.owners[role]}`);
}
function stageOwners(d: DeliveryRecord): OwnerRole[] {
  switch (d.phase) {
    case "planning": return ["planning"];
    case "implementing": return ["implementation"];
    case "checking": return ["check"];
    case "reviewing": return ["full_review", "readiness"];
    case "publishing": return ["publication", "delivery"];
    default: return [];
  }
}
function activeAuthority(record: TaskRecordV2, d: DeliveryRecord): void {
  if (record.accepted_scope === null || !same(record.accepted_scope, d.scope_ref.authority)) fail("stale_scope", "Delivery scope differs from current Task authority");
}
function applicable(record: TaskRecordV2, d: DeliveryRecord, role: GateRole): GateResult {
  activeAuthority(record, d); const result = d.results[role];
  if (!result || !same(result.scope_ref, d.scope_ref) || !same(result.plan_ref, d.plan_ref) || (role !== "planning" && !same(result.candidate, d.candidate))) fail("gate_not_applicable", role);
  if (role !== "planning") {
    const previous = role === "check" ? "planning" : role === "full_review" ? "check" : "full_review";
    if (result.predecessor_result_id !== applicable(record, d, previous).result_id) fail("gate_not_applicable", `${role} predecessor`);
  }
  return result;
}
function priorResult(record: TaskRecordV2, id: string): unknown {
  const results: { result_id: string }[] = [...record.completion_results, ...record.closure_results];
  for (const d of record.deliveries) for (const r of [...Object.values(d.results), d.publication_result, d.delivery_result, d.stop_result]) if (r) results.push(r);
  return results.find((r) => r.result_id === id);
}
/** Closed deterministic operations. Scope adequacy, review sufficiency and remote actions belong to the declared owners. */
export function applyTaskOperation(input: unknown, request: unknown, declaration: unknown): OperationOutput {
  const record = parseTaskRecordV2(input); const op = parseTaskOperation(request); const workflow = validateWorkflowContract(declaration);
  if (workflow.owners[op.owner_role] !== op.owner_id) fail("owner_mismatch", op.owner_role);
  if (op.key.task_id !== record.id) fail("task_identity_mismatch", op.key.task_id);
  const deliveryId = "delivery_id" in op.key ? op.key.delivery_id : null;
  const d = deliveryId === null ? undefined : record.deliveries.find((item) => item.id === deliveryId);
  if (d && d.lifecycle_generation !== op.key.lifecycle_generation) fail("delivery_identity_mismatch", d.id);
  const historical = (op.operation === "record_delivery" || op.operation === "record_publication") && op.historical_success === true;
  if (d && op.operation !== "stop" && !historical && !workflow.profiles.includes(d.profile)) fail("unsupported_delivery_profile", d.profile);
  const output = (changed: boolean, resultId: string | null = null): OperationOutput => ({ record: parseTaskRecordV2(record), key: op.key, phase: d?.phase ?? null, result_id: resultId, changed });
  // Only the same producer may recover its exact result, even after the Task reopened.
  if ("result" in op) {
    if (op.result.owner_id !== op.owner_id) fail("owner_mismatch", "result producer differs from invoking owner");
    const prior = priorResult(record, op.result.result_id);
    if (prior) {
      const owned = d ? [ ...Object.values(d.results), d.publication_result, d.delivery_result, d.stop_result ].some((r) => r?.result_id === op.result.result_id) : [...record.completion_results, ...record.closure_results].some((r) => r.result_id === op.result.result_id && r.lifecycle_generation === op.key.lifecycle_generation);
      if (!owned || !same(prior, op.result)) fail("result_identity_conflict", op.result.result_id);
      const role = op.operation === "record_gate" ? op.result.owner_role : op.operation === "record_publication" ? "publication" : op.operation === "record_delivery" ? "delivery" : op.operation === "complete_task" ? "completion" : op.operation === "close_task" ? "closure" : op.owner_role;
      requireOwner(op, workflow, role); return output(false, op.result.result_id);
    }
  }
  if (op.operation === "reopen_task" && op.key.lifecycle_generation !== record.lifecycle_generation) {
    requireOwner(op, workflow, "task_scope");
    // No reopen ledger: recover only the immediately preceding completed
    // generation while the reopened scope has no subsequent business facts.
    const untouched = ![...record.deliveries, ...record.completion_results, ...record.closure_results].some((row) => row.lifecycle_generation === record.lifecycle_generation);
    if (record.lifecycle_generation === op.key.lifecycle_generation + 1 && same(record.accepted_scope, op.authority) && untouched && record.completion_results.some((row) => row.lifecycle_generation === op.key.lifecycle_generation)) {
      return { ...output(false), key: { task_id: record.id, lifecycle_generation: record.lifecycle_generation } };
    }
  }
  if (op.key.lifecycle_generation !== record.lifecycle_generation && !historical) fail("stale_lifecycle_generation", String(op.key.lifecycle_generation));
  if (deliveryId !== null && op.operation !== "create_delivery") {
    if (!d) fail("delivery_not_found", deliveryId);
    if (d.lifecycle_generation !== op.key.lifecycle_generation) fail("delivery_identity_mismatch", deliveryId);
    if ("expected_phase" in op && d.phase !== op.expected_phase && !historical) fail("stale_phase", `expected ${op.expected_phase}, found ${d.phase}`);
    if (d.phase === "stopped" || (d.phase === "delivered" && !(op.operation === "record_publication" && historical))) fail("terminal_delivery", d.id);
  }
  if (op.operation === "accept_scope") {
    requireOwner(op, workflow, "task_scope");
    if (!same(record.accepted_scope, op.authority) && record.completion_results.some((r) => r.lifecycle_generation === record.lifecycle_generation && same(r.accepted_scope, record.accepted_scope))) fail("reopen_required", "completed generation requires formal reopen before scope revision");
    record.accepted_scope = op.authority; return output(!same(input, record));
  }
  if (op.operation === "create_delivery") {
    requireOwner(op, workflow, "creation");
    if (!workflow.profiles.includes(op.profile)) fail("unsupported_delivery_profile", op.profile);
    if (d) {
      if (d.lifecycle_generation !== op.key.lifecycle_generation || !same(d.scope_ref, op.scope_ref) || d.profile !== op.profile) fail("delivery_identity_conflict", d.id);
      return output(false);
    }
    if (record.completion_results.some((r) => r.lifecycle_generation === record.lifecycle_generation && same(r.accepted_scope, record.accepted_scope))) fail("task_already_completed", record.id);
    if (!same(op.scope_ref.authority, record.accepted_scope)) fail("stale_scope", "creation requires accepted Task authority");
    const created: DeliveryRecord = { id: op.key.delivery_id, lifecycle_generation: op.key.lifecycle_generation, scope_ref: op.scope_ref, planning_root: `deliveries/${op.key.delivery_id}`, profile: op.profile, phase: "planning", plan_ref: null, candidate: null, results: { planning: null, check: null, full_review: null, readiness: null }, publication_result: null, delivery_result: null, stop_result: null };
    record.deliveries.push(created); return { ...output(true), phase: "planning" };
  }
  if (op.operation === "complete_task") {
    requireOwner(op, workflow, "completion");
    if (op.result.lifecycle_generation !== record.lifecycle_generation || !same(op.result.accepted_scope, record.accepted_scope) || record.accepted_scope === null) fail("stale_scope", "completion must bind current generation and authority");
    if (record.deliveries.some((item) => item.phase !== "delivered" && item.phase !== "stopped")) fail("unfinished_delivery", "Completion cannot bypass active slices");
    if (record.completion_results.some((r) => r.lifecycle_generation === record.lifecycle_generation && same(r.accepted_scope, record.accepted_scope))) fail("completion_already_recorded", record.id);
    record.completion_results.push(op.result); return output(true, op.result.result_id);
  }
  if (op.operation === "close_task") {
    requireOwner(op, workflow, "closure");
    const completion = record.completion_results.find((r) => r.result_id === op.result.completion_result_id && r.lifecycle_generation === record.lifecycle_generation && same(r.accepted_scope, record.accepted_scope));
    if (!completion || op.result.lifecycle_generation !== record.lifecycle_generation) fail("completion_required", "Closure requires current Completion");
    if (op.result.disposition === "source_closed" && record.source.kind !== "issue") fail("invalid_source_disposition", "no source Issue");
    record.closure_results.push(op.result); return output(true, op.result.result_id);
  }
  if (op.operation === "reopen_task") {
    requireOwner(op, workflow, "task_scope");
    if (!record.completion_results.some((r) => r.lifecycle_generation === record.lifecycle_generation && same(r.accepted_scope, record.accepted_scope))) fail("completion_required", "formal reopen requires completed Task");
    record.lifecycle_generation += 1; record.accepted_scope = op.authority;
    return { ...output(true), key: { task_id: record.id, lifecycle_generation: record.lifecycle_generation } };
  }
  if (!d) fail("delivery_not_found", String(deliveryId));
  switch (op.operation) {
    case "begin_check":
      requireOwner(op, workflow, "implementation"); if (d.phase !== "implementing") fail("illegal_transition", d.phase); applicable(record, d, "planning"); d.candidate = op.candidate; d.phase = "checking"; break;
    case "record_gate": {
      const r = op.result; requireOwner(op, workflow, r.owner_role); activeAuthority(record, d);
      const expected = r.owner_role === "planning" ? "planning" : r.owner_role === "check" ? "checking" : "reviewing";
      if (d.phase !== expected) fail("illegal_transition", `${r.owner_role} in ${d.phase}`);
      if (!same(r.scope_ref, d.scope_ref)) fail("stale_scope", "gate scope differs");
      if (r.owner_role === "planning") d.plan_ref = r.plan_ref;
      else {
        const previous = r.owner_role === "check" ? "planning" : r.owner_role === "full_review" ? "check" : "full_review";
        if (!same(r.plan_ref, d.plan_ref) || !same(r.candidate, d.candidate) || r.predecessor_result_id !== applicable(record, d, previous).result_id) fail("gate_not_applicable", r.owner_role);
      }
      d.results[r.owner_role] = r; d.phase = r.owner_role === "planning" ? "implementing" : r.owner_role === "readiness" ? "publishing" : "reviewing"; break;
    }
    case "rework": {
      if (!stageOwners(d).includes(op.owner_role)) fail("owner_mismatch", "rework must be invoked by current semantic owner");
      const target = { planning: "planning", implementation: "implementing", check: "checking", full_review: "reviewing", readiness: "reviewing" } as const;
      const rank: Partial<Record<OwnerRole, number>> = { planning: 0, implementation: 1, check: 2, full_review: 3, readiness: 4, publication: 5, delivery: 6 };
      if (DELIVERY_PHASES.indexOf(target[op.target_role]) > DELIVERY_PHASES.indexOf(d.phase) || (rank[op.target_role] ?? 0) > (rank[op.owner_role] ?? 0)) fail("illegal_transition", "rework cannot advance phase or semantic owner");
      if (op.scope_ref !== undefined) { if (op.target_role !== "planning" || !same(op.scope_ref.authority, record.accepted_scope)) fail("stale_scope", "scope revision requires current Planning"); d.scope_ref = op.scope_ref; }
      for (const role of op.affected_results) d.results[role] = null;
      if (op.target_role !== "planning") applicable(record, d, "planning");
      if (op.target_role === "full_review" || op.target_role === "readiness") applicable(record, d, "check");
      if (op.target_role === "readiness") applicable(record, d, "full_review");
      d.phase = target[op.target_role]; break;
    }
    case "record_publication":
      requireOwner(op, workflow, "publication"); if (d.profile !== "pull_request") fail("unsupported_delivery_profile", d.profile);
      if (!historical) { if (d.phase !== "publishing") fail("illegal_transition", d.phase); applicable(record, d, "readiness"); if (!same(op.result.candidate, d.candidate)) fail("candidate_mismatch", "publication candidate"); }
      if (d.publication_result) {
        if (d.phase === "delivered") fail("publication_already_recorded", d.id);
        const previous = d.publication_result;
        if (previous.repo_ref !== op.result.repo_ref || previous.pr_number !== op.result.pr_number || previous.owner_id !== op.result.owner_id) fail("publication_identity_mismatch", "publication refresh must retain PR and producer identity");
      }
      if (d.delivery_result?.profile === "pull_request") {
        const delivered = d.delivery_result;
        if (delivered.repo_ref !== op.result.repo_ref || delivered.pr_number !== op.result.pr_number || delivered.reviewed_head !== op.result.reviewed_head || delivered.target_ref !== op.result.target_ref || !same(delivered.candidate, op.result.candidate)) fail("publication_identity_mismatch", "historical publication must match terminal delivery");
      }
      d.publication_result = op.result; break;
    case "record_delivery":
      requireOwner(op, workflow, "delivery"); if (op.result.profile !== d.profile) fail("unsupported_delivery_profile", op.result.profile);
      if (!historical) {
        if (d.phase !== "publishing") fail("illegal_transition", d.phase); applicable(record, d, "readiness"); if (!same(op.result.candidate, d.candidate)) fail("candidate_mismatch", "delivery candidate");
        if (op.result.profile === "pull_request") {
          const publication = d.publication_result;
          if (publication?.repo_ref !== op.result.repo_ref || publication.pr_number !== op.result.pr_number || publication.reviewed_head !== op.result.reviewed_head || publication.target_ref !== op.result.target_ref || !same(publication.candidate, op.result.candidate)) fail("publication_required", "exact PR publication required");
        }
      }
      d.delivery_result = op.result; d.phase = "delivered"; break;
    case "stop":
      if (!stageOwners(d).includes(op.owner_role)) fail("owner_mismatch", "stop requires current stage owner and explicit scope decision"); d.stop_result = op.result; d.phase = "stopped"; break;
  }
  return output(true, "result" in op ? op.result.result_id : null);
}
export function getCurrentDelivery(recordInput: unknown | null, selection: DeliveryKey | TaskKey | DeliverySelection | null): CurrentDelivery {
  if (recordInput === null && selection === null) return { kind: "no_current_task" };
  try {
    if (recordInput === null || selection === null) fail("stale_binding", "Task record and selection must agree");
    const record = parseTaskRecordV2(recordInput);
    const key = object(selection, ["task_id", "lifecycle_generation"], ["delivery_id"]); string(key.task_id); integer(key.lifecycle_generation);
    if (selection.task_id !== record.id || selection.lifecycle_generation !== record.lifecycle_generation) fail("stale_binding", "TaskKey differs");
    if (!("delivery_id" in selection) || selection.delivery_id === null) return { kind: "no_current_delivery", key: { task_id: record.id, lifecycle_generation: record.lifecycle_generation } };
    uuid(selection.delivery_id); const d = record.deliveries.find((item) => item.id === selection.delivery_id && item.lifecycle_generation === record.lifecycle_generation);
    if (!d) fail("stale_binding", "selected Delivery does not belong to current generation");
    return { kind: d.phase === "delivered" || d.phase === "stopped" ? "terminal_delivery" : "current", key: selection as DeliveryKey, delivery: d };
  } catch (error) { return { kind: "error", code: error instanceof Error && "code" in error ? String(error.code) : "invalid_record", message: String(error) }; }
}
/** Read-only reference applicability. Actual external/local drift and semantic sufficiency remain original-producer observations. */
export function getGateApplicability(input: unknown, key: DeliveryKey): GateApplicability {
  const record = parseTaskRecordV2(input); object(key, ["task_id", "lifecycle_generation", "delivery_id"]); integer(key.lifecycle_generation); uuid(key.delivery_id);
  if (key.task_id !== record.id) fail("task_identity_mismatch", key.task_id);
  const d = record.deliveries.find((item) => item.id === key.delivery_id && item.lifecycle_generation === key.lifecycle_generation);
  if (!d) fail("delivery_not_found", key.delivery_id);
  const inspect = (role: GateRole): GateApplicability[GateRole] => {
    const result = d.results[role]; if (result === null) return { kind: "missing", result_id: null, code: null };
    try {
      if (d.lifecycle_generation !== record.lifecycle_generation) fail("stale_lifecycle_generation", d.id);
      applicable(record, d, role); return { kind: "applicable", result_id: result.result_id, code: null };
    } catch (error) { return { kind: "not_applicable", result_id: result.result_id, code: error instanceof Error && "code" in error ? String(error.code) : "invalid_record" }; }
  };
  return { planning: inspect("planning"), check: inspect("check"), full_review: inspect("full_review"), readiness: inspect("readiness") };
}
export function listDeliveries(input: unknown): DeliveryRecord[] { return parseTaskRecordV2(input).deliveries; }

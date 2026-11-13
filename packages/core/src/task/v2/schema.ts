import { isPlainObject, taskRecordSchema } from "../schema.js";
import { DELIVERY_PHASES, OWNER_ROLES, type AuthorityRef, type CandidateRef, type DeliveryFact, type DeliveryRecord, type GateResult, type PublicationFact, type SliceScopeRef, type TaskRecordV2, type WorkflowContract } from "./types.js";

export const TASK_RECORD_V2_FIELD_ORDER = ["schema_version", "artifact_origin", "id", "name", "lifecycle_generation", "source", "title", "description", "dev_type", "scope", "package", "priority", "createdAt", "base_branch", "branch", "worktree_path", "children", "parent", "relatedFiles", "notes", "meta", "accepted_scope", "deliveries", "completion_results", "closure_results"] as const;

export class TaskV2Error extends Error {
  constructor(public readonly code: string, message: string) { super(`${code}: ${message}`); this.name = "TaskV2Error"; }
}
export function fail(code: string, message: string): never { throw new TaskV2Error(code, message); }
export function object(value: unknown, fields: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!isPlainObject(value)) fail("invalid_record", "expected a JSON object");
  for (const key of fields) if (!(key in value)) fail("invalid_record", `missing ${key}`);
  for (const key of Object.keys(value)) if (!fields.includes(key) && !optional.includes(key)) fail("invalid_record", `unsupported ${key}`);
  return value;
}
export function string(value: unknown): asserts value is string { if (typeof value !== "string" || !value.trim()) fail("invalid_record", "expected a nonempty string"); }
export function integer(value: unknown): asserts value is number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail("invalid_record", "expected a non-negative safe integer"); }
export function strings(value: unknown): asserts value is string[] { if (!Array.isArray(value)) fail("invalid_record", "expected an array"); value.forEach(string); }
export function uuid(value: unknown): asserts value is string { string(value); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) fail("invalid_record", "delivery_id must be a canonical UUID"); }
export function member<T extends string>(value: unknown, values: readonly T[]): asserts value is T { if (typeof value !== "string" || !values.includes(value as T)) fail("invalid_record", `expected one of ${values.join(",")}`); }
/** Local locators must be contained; external authority locators remain opaque. */
export function relativePath(value: unknown): asserts value is string {
  string(value);
  if (value.startsWith("/") || value.includes("\\") || value.includes("\0") || /[\uD800-\uDFFF]/u.test(value) || /^[A-Za-z]:/.test(value) || value.split("/").some((part) => !part || part === "." || part === "..")) fail("invalid_locator", value);
}
/** Managed active or archived Task root; no artifact or traversal suffix. */
export function taskArtifactRoot(value: unknown): asserts value is string {
  relativePath(value);
  if (value === ".trellis/tasks/archive" || !/^\.trellis\/tasks\/(?:archive\/[0-9]{4}-(?:0[1-9]|1[0-2])\/)?[^/]+$/.test(value)) fail("invalid_locator", "artifact_origin must be a Task root");
}
export function authority(value: unknown): asserts value is AuthorityRef {
  const bag = object(value, ["locator", "revision"]); string(bag.locator); string(bag.revision);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(bag.locator)) relativePath(bag.locator);
}
export function slice(value: unknown): asserts value is SliceScopeRef { const bag = object(value, ["authority", "anchors"]); authority(bag.authority); strings(bag.anchors); if (bag.anchors.length === 0) fail("invalid_record", "scope anchors required"); }
export function candidate(value: unknown): asserts value is CandidateRef {
  const bag = object(value, ["kind", "content_ref", "paths", "head_ref", "base_ref"]);
  member(bag.kind, ["git", "git_free"]); string(bag.content_ref);
  if (!/^sha256:[a-f0-9]{64}$/.test(bag.content_ref)) fail("invalid_record", "candidate content_ref must be sha256");
  strings(bag.paths); if (!bag.paths.length || new Set(bag.paths).size !== bag.paths.length) fail("invalid_record", "candidate paths must be nonempty and unique"); bag.paths.forEach(relativePath);
  for (const field of ["head_ref", "base_ref"]) if (bag[field] !== null) string(bag[field]);
  if (bag.kind === "git_free" && (bag.head_ref !== null || bag.base_ref !== null)) fail("invalid_record", "git_free candidate cannot contain Git refs");
}
export function resultIdentity(value: Record<string, unknown>): void { string(value.result_id); string(value.owner_id); if (!Array.isArray(value.evidence) || !value.evidence.length) fail("invalid_record", "result evidence required"); value.evidence.forEach(authority); }
export function gateResult(value: unknown): asserts value is GateResult {
  const bag = object(value, ["result_id", "owner_role", "owner_id", "outcome", "scope_ref", "plan_ref", "candidate", "predecessor_result_id", "obligations", "evidence"]);
  resultIdentity(bag); member(bag.owner_role, ["planning", "check", "full_review", "readiness"]); slice(bag.scope_ref); authority(bag.plan_ref);
  member(bag.outcome, [bag.owner_role === "planning" ? "accepted" : bag.owner_role === "readiness" ? "ready" : "passed"]);
  if (bag.owner_role === "planning") { if (bag.candidate !== null || bag.predecessor_result_id !== null) fail("invalid_record", "planning has no candidate or predecessor"); }
  else { candidate(bag.candidate); string(bag.predecessor_result_id); }
  if (!Array.isArray(bag.obligations)) fail("invalid_record", "obligations must be an array"); bag.obligations.forEach(authority);
}
export function publicationFact(value: unknown): asserts value is PublicationFact {
  const bag = object(value, ["result_id", "owner_id", "evidence", "profile", "candidate", "repo_ref", "pr_number", "reviewed_head", "target_ref", "publication_ref"]);
  resultIdentity(bag); member(bag.profile, ["pull_request"]); candidate(bag.candidate); prFields(bag); authority(bag.publication_ref);
  if (bag.candidate.kind !== "git" || bag.candidate.head_ref !== bag.reviewed_head) fail("invalid_record", "publication reviewed head must match Git candidate");
}
function prFields(bag: Record<string, unknown>): void { string(bag.repo_ref); if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(bag.repo_ref)) fail("invalid_record", "invalid repo_ref"); integer(bag.pr_number); if (!bag.pr_number) fail("invalid_record", "PR number must be positive"); string(bag.reviewed_head); string(bag.target_ref); }
export function deliveryFact(value: unknown): asserts value is DeliveryFact {
  if (!isPlainObject(value)) fail("invalid_record", "delivery result must be an object");
  member(value.profile, ["manual", "local_commit", "pull_request"]);
  const extra = value.profile === "manual" ? ["artifact"] : value.profile === "local_commit" ? ["commit"] : ["repo_ref", "pr_number", "reviewed_head", "merge_commit", "target_ref"];
  const bag = object(value, ["result_id", "owner_id", "evidence", "profile", "candidate", ...extra]); resultIdentity(bag); candidate(bag.candidate);
  if (bag.profile === "manual") authority(bag.artifact);
  else if (bag.profile === "local_commit") { string(bag.commit); if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(bag.commit)) fail("invalid_record", "local commit must be a full immutable SHA"); if (bag.candidate.kind !== "git" || bag.candidate.head_ref !== bag.commit) fail("invalid_record", "local commit must match candidate head"); }
  else { prFields(bag); string(bag.merge_commit); if (bag.candidate.kind !== "git" || bag.candidate.head_ref !== bag.reviewed_head) fail("invalid_record", "reviewed head must match candidate"); }
}
function parseDelivery(value: unknown): DeliveryRecord {
  const bag = object(value, ["id", "lifecycle_generation", "scope_ref", "planning_root", "profile", "phase", "plan_ref", "candidate", "results", "publication_result", "delivery_result", "stop_result"]);
  uuid(bag.id); integer(bag.lifecycle_generation); slice(bag.scope_ref); member(bag.profile, ["manual", "local_commit", "pull_request"]); member(bag.phase, DELIVERY_PHASES);
  if (bag.planning_root !== `deliveries/${bag.id}`) fail("invalid_locator", "planning_root must belong to Delivery UUID");
  if (bag.plan_ref !== null) authority(bag.plan_ref); if (bag.candidate !== null) candidate(bag.candidate);
  const results = object(bag.results, ["planning", "check", "full_review", "readiness"]);
  for (const [role, result] of Object.entries(results)) if (result !== null) { gateResult(result); if (result.owner_role !== role) fail("invalid_record", "gate slot role mismatch"); }
  if (bag.publication_result !== null) { publicationFact(bag.publication_result); if (bag.profile !== "pull_request") fail("invalid_record", "publication requires pull_request profile"); }
  if (bag.delivery_result !== null) { deliveryFact(bag.delivery_result); if (bag.delivery_result.profile !== bag.profile) fail("invalid_record", "delivery profile mismatch"); }
  if (bag.stop_result !== null) { const stop = object(bag.stop_result, ["result_id", "owner_id", "evidence", "reason", "scope_decision"]); resultIdentity(stop); authority(stop.reason); authority(stop.scope_decision); }
  if ((bag.phase === "delivered") !== (bag.delivery_result !== null) || (bag.phase === "stopped") !== (bag.stop_result !== null)) fail("invalid_record", "terminal phase must match actual result");
  const phase = bag.phase as string;
  if (["implementing", "checking", "reviewing", "publishing"].includes(phase) && results.planning === null) fail("invalid_record", "execution requires recorded Planning");
  if (["checking", "reviewing", "publishing"].includes(phase) && bag.candidate === null) fail("invalid_record", "formal execution requires a candidate");
  if (["reviewing", "publishing"].includes(phase) && results.check === null) fail("invalid_record", "Review requires recorded Check");
  if (phase === "publishing" && (results.full_review === null || results.readiness === null)) fail("invalid_record", "publishing requires full Review and readiness");
  return bag as unknown as DeliveryRecord;
}
export function parseTaskRecordV2(input: unknown): TaskRecordV2 {
  if (!isPlainObject(input)) fail("invalid_record", "task must be an object");
  const { schema_version, artifact_origin, accepted_scope, deliveries, completion_results, closure_results, ...metadata } = input;
  if (schema_version !== "2.0") fail("unsupported_task_schema", String(schema_version));
  if (artifact_origin !== undefined) taskArtifactRoot(artifact_origin);
  // Reuse the unchanged metadata/source boundary without accepting old writable authority.
  for (const key of ["status", "commit", "pr_url", "completedAt"]) if (key in metadata) fail("invalid_record", `Task v2 does not support ${key}`);
  try { taskRecordSchema.parse({ ...metadata, status: "planning", commit: null, pr_url: null, completedAt: null }); }
  catch (error) { fail("invalid_record", error instanceof Error ? error.message : String(error)); }
  if (accepted_scope !== null) authority(accepted_scope);
  for (const values of [deliveries, completion_results, closure_results]) if (!Array.isArray(values)) fail("invalid_record", "domain collections must be arrays");
  const parsedDeliveries = (deliveries as unknown[]).map(parseDelivery);
  if (new Set(parsedDeliveries.map((d) => d.id)).size !== parsedDeliveries.length) fail("duplicate_delivery_id", "Delivery ids must be unique");
  for (const d of parsedDeliveries) if (d.lifecycle_generation > (metadata.lifecycle_generation as number)) fail("invalid_record", "future Delivery generation");
  const resultIds = new Set<string>();
  const reserve = (id: string): void => { if (resultIds.has(id)) fail("result_identity_conflict", id); resultIds.add(id); };
  for (const d of parsedDeliveries) for (const r of [...Object.values(d.results), d.publication_result, d.delivery_result, d.stop_result]) if (r) reserve(r.result_id);
  for (const result of completion_results as unknown[]) {
    const bag = object(result, ["result_id", "owner_id", "evidence", "lifecycle_generation", "accepted_scope", "delivery_result_ids", "outcome"]); resultIdentity(bag); integer(bag.lifecycle_generation); authority(bag.accepted_scope); strings(bag.delivery_result_ids); member(bag.outcome, ["completed"]); reserve(bag.result_id as string);
    if (bag.lifecycle_generation > (metadata.lifecycle_generation as number)) fail("invalid_record", "future completion generation");
    for (const id of bag.delivery_result_ids) if (!parsedDeliveries.some((d) => d.delivery_result?.result_id === id)) fail("invalid_record", "unknown delivery result in completion");
  }
  for (const result of closure_results as unknown[]) {
    const bag = object(result, ["result_id", "owner_id", "evidence", "lifecycle_generation", "completion_result_id", "disposition", "source_result"]); resultIdentity(bag); integer(bag.lifecycle_generation); string(bag.completion_result_id); member(bag.disposition, ["no_mutation", "source_closed"]); reserve(bag.result_id as string);
    if (!(completion_results as Record<string, unknown>[]).some((r) => r.result_id === bag.completion_result_id && r.lifecycle_generation === bag.lifecycle_generation)) fail("invalid_record", "closure requires exact completion");
    if (bag.disposition === "source_closed") authority(bag.source_result); else if (bag.source_result !== null) fail("invalid_record", "no_mutation has no source result");
  }
  const meta = metadata.meta as Record<string, unknown>;
  for (const key of ["artifact_origin", "status", "phase", "candidate", "results", "accepted_scope", "deliveries", "completion_results", "closure_results"]) if (key in meta) fail("invalid_record", `meta cannot hold authoritative ${key}`);
  const ordered: Record<string, unknown> = {};
  for (const key of TASK_RECORD_V2_FIELD_ORDER) if (key in input) ordered[key] = structuredClone(input[key]);
  return ordered as TaskRecordV2;
}
export const taskRecordV2Schema = {
  parse: parseTaskRecordV2,
  safeParse(input: unknown): { success: true; data: TaskRecordV2 } | { success: false; error: Error } {
    try { return { success: true, data: parseTaskRecordV2(input) }; } catch (error) { return { success: false, error: error instanceof Error ? error : new Error(String(error)) }; }
  },
};
export function validateWorkflowContract(input: unknown): WorkflowContract {
  const bag = object(input, ["delivery_api", "task_schema", "profiles", "owners"]);
  if (bag.delivery_api !== "1.0" || bag.task_schema !== "2.0") fail("unsupported_runtime_contract", "requires Delivery API 1.0 / Task schema 2.0");
  if (!Array.isArray(bag.profiles) || !bag.profiles.length) fail("invalid_runtime_contract", "profiles required");
  bag.profiles.forEach((profile) => member(profile, ["manual", "local_commit", "pull_request"]));
  if (new Set(bag.profiles).size !== bag.profiles.length) fail("invalid_runtime_contract", "duplicate profiles");
  const owners = object(bag.owners, OWNER_ROLES); Object.values(owners).forEach(string);
  return structuredClone(bag) as unknown as WorkflowContract;
}

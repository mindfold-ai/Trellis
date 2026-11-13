/** Explicit maintenance boundary; never used by current lifecycle writers. */
import path from "node:path";
import { validateProjectionIdentity } from "./migration-projection.js";
import { isDeepStrictEqual } from "node:util";
import { isKnownLegacyTaskRecord } from "./migration.js";
import { isPlainObject, taskRecordSchema } from "./schema.js";
import { validateTaskV2Projection } from "./migration-v2.js";
import { parseTaskRecordV2 } from "./v2/schema.js";
import type { AuthorityRef, TaskRecordV2 } from "./v2/types.js";

export class MaintenanceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "MaintenanceError";
  }
}
export interface MaintenanceTaskIdentity { task_id: string; generation: number }
export function classifyMaintenanceTask(value: unknown): MaintenanceTaskIdentity & { kind: "legacy" | "schema1" | "schema2" } {
  if (isPlainObject(value) && value.schema_version === "2.0") {
    const record = parseTaskRecordV2(value);
    return { kind: "schema2", task_id: record.id, generation: record.lifecycle_generation };
  }
  const current = taskRecordSchema.safeParse(value);
  if (current.success) return { kind: "schema1", task_id: current.data.id, generation: current.data.lifecycle_generation };
  if (isKnownLegacyTaskRecord(value)) return { kind: "legacy", task_id: (value as Record<string, string>).id, generation: 0 };
  throw new MaintenanceError("unsupported_source", "Task is neither a known legacy record nor a canonical schema1/schema2 record");
}

function legacyIssueIdentity(source: Record<string, unknown>): { repo_ref: string; number: number } {
  const match = typeof source.scope === "string"
    ? /^GitHub issue: https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/issues\/([1-9][0-9]*)$/.exec(source.scope)
    : null;
  if (!match || match[0] !== source.scope || !Number.isSafeInteger(Number(match[2])))
    throw new MaintenanceError("unsupported_source", "Known legacy formal archive requires a canonical GitHub issue scope");
  return { repo_ref: match[1], number: Number(match[2]) };
}

/** Positive formal-family interpretation only; historical qualification belongs to the caller. */
export function classifyFormalArchivePredecessor(value: unknown): MaintenanceTaskIdentity & { kind: "legacy" | "schema1" } {
  const classification = classifyMaintenanceTask(value);
  if (classification.kind === "schema2" || !isPlainObject(value) || value.status !== "completed")
    throw new MaintenanceError("unsupported_source", "Formal reactivation requires a completed schema1 or supported known legacy predecessor");
  if (classification.kind === "legacy") legacyIssueIdentity(value);
  return { ...classification, kind: classification.kind };
}

/** Validate a parsed successor's source; Issue disposition remains caller-owned. */
export function validateFormalArchiveSuccessorSource(source: unknown, successorSource: TaskRecordV2["source"]): void {
  const classification = classifyFormalArchivePredecessor(source);
  const old = source as Record<string, unknown>;
  if (classification.kind === "schema1") {
    if (!isDeepStrictEqual(old.source, successorSource))
      throw new MaintenanceError("source_mismatch", "Formal successor must preserve the schema1 source");
    return;
  }
  const issue = legacyIssueIdentity(old);
  if (successorSource.kind !== "issue" || successorSource.repo_ref !== issue.repo_ref || successorSource.number !== issue.number)
    throw new MaintenanceError("source_mismatch", "Formal successor source must match the legacy scope Issue identity");
}
export type LegacyFactDisposition = {
  field: "commit" | "pr_url" | "completedAt";
  reason: AuthorityRef;
  owner_id: string;
} & ({ disposition: "source_snapshot" } | { disposition: "delivery_result"; result_id: string; owner_id: string });

/** Original owners supply attribution; dates/status never imply v2 success. */
export function validateSelectedTaskProjection(source: unknown, projection: unknown, facts: readonly LegacyFactDisposition[] = []): TaskRecordV2 {
  const classification = classifyMaintenanceTask(source);
  if (classification.kind === "schema2") throw new MaintenanceError("already_current", "Task conversion requires a predecessor");
  const old = source as Record<string, unknown>;
  const record = validateTaskV2Projection(source, projection);
  validateLegacyFacts(old, record, facts);
  return record;
}
function validateLegacyFacts(old: Record<string, unknown>, record: TaskRecordV2, facts: readonly LegacyFactDisposition[]): void {
  const fields = ["commit", "pr_url", "completedAt"].filter(field => old[field] !== undefined && old[field] !== null && old[field] !== "");
  if (!isDeepStrictEqual(fields.sort(), facts.map(f => f.field).sort())) throw new MaintenanceError("legacy_fact_attribution_required", "Unresolved legacy fact attribution: every retained fact needs exactly one disposition");
  for (const fact of facts) {
    if (!fact.owner_id || !fact.reason.locator || !fact.reason.revision) throw new MaintenanceError("invalid_fact_reason", fact.field);
    if (fact.disposition === "source_snapshot") continue;
    if (fact.field === "completedAt") throw new MaintenanceError("invalid_fact_attribution", "completedAt has no v2 timestamp equivalent; retain it in the raw source snapshot");
    const outcome = record.deliveries.flatMap(d => [d.delivery_result, d.publication_result]).find(r => r?.result_id === fact.result_id);
    if (!outcome || outcome.owner_id !== fact.owner_id) throw new MaintenanceError("legacy_result_mismatch", `Legacy result owner/identity mismatch ${fact.field}`);
    const actual = fact.field === "commit"
      ? outcome.profile === "local_commit" ? outcome.commit : outcome.profile === "pull_request" && "merge_commit" in outcome ? outcome.merge_commit : null
      : outcome.profile === "pull_request" ? `https://github.com/${outcome.repo_ref}/pull/${outcome.pr_number}` : null;
    if (actual !== old[fact.field]) throw new MaintenanceError("legacy_result_mismatch", fact.field);
  }
}
/** Caller-owned semantic review; the executor never interprets the next action. */
export interface ArchivedTaskResumeIntent {
  reason: AuthorityRef;
  archive_review: AuthorityRef;
  next_owner_id: string;
  next_action: string;
}
export function validateArchivedTaskResumeProjection(
  source: unknown,
  projection: unknown,
  facts: readonly LegacyFactDisposition[],
  intent: ArchivedTaskResumeIntent,
): TaskRecordV2 {
  if (
    !isPlainObject(intent) ||
    !exact(intent, [
      "reason",
      "archive_review",
      "next_owner_id",
      "next_action",
    ]) ||
    typeof intent.next_owner_id !== "string" ||
    !intent.next_owner_id.trim() ||
    typeof intent.next_action !== "string" ||
    !intent.next_action.trim() ||
    [intent.reason, intent.archive_review].some(
      (ref) =>
        !isPlainObject(ref) ||
        !exact(ref, ["locator", "revision"]) ||
        typeof ref.locator !== "string" ||
        !ref.locator.trim() ||
        typeof ref.revision !== "string" ||
        !ref.revision.trim(),
    )
  )
    throw new MaintenanceError(
      "resume_intent_required",
      "Explicit original archive review, reason and next owner/action are required",
    );
  const record = validateSelectedTaskProjection(source, projection, facts);
  if (!record.accepted_scope)
    throw new MaintenanceError(
      "accepted_scope_required",
      "Resumed Task requires owner-authored accepted scope evidence",
    );
  if (record.completion_results.length || record.closure_results.length)
    throw new MaintenanceError(
      "formal_lifecycle_conflict",
      "Legacy archive resume cannot import or manufacture Completion/Closure; formal archives use reopen",
    );
  for (const delivery of record.deliveries) {
    if (Object.values(delivery.results).some((result) => result !== null))
      throw new MaintenanceError(
        "inherited_gate_conflict",
        "Legacy archive resume cannot import gate authority",
      );
    if (
      delivery.phase !== "delivered" ||
      !delivery.delivery_result ||
      delivery.stop_result ||
      !delivery.delivery_result.evidence.length
    )
      throw new MaintenanceError(
        "historical_outcome_required",
        "Only real historical delivered outcomes with original-owner evidence may be imported; the next owner creates current work",
      );
  }
  return record;
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return isDeepStrictEqual(Object.keys(value).sort(), keys.sort());
}
const taskId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v);
const generation = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const legacySessionMetadata = ["session_id", "sessionId", "sessionID", "conversation_id", "conversationId", "conversationID", "transcript_path", "transcriptPath", "transcript"];
function legacyMetadataCarrier(value: Record<string, unknown>, pathKeys: string[]): boolean {
  const required = [...pathKeys, "platform", "last_seen_at", "current_run"];
  const allowed = new Set([...required, ...legacySessionMetadata]);
  // The 0.6 set_active_task writer adds context metadata and a null run slot.
  // These fields identify a predecessor carrier; none grant current authority.
  return required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => allowed.has(key))
    && value.current_run === null
    && ["platform", "last_seen_at", ...legacySessionMetadata.filter(key => Object.hasOwn(value, key))]
      .every(key => typeof value[key] === "string" && value[key] !== "");
}
function unversionedLocalCarrier(value: Record<string, unknown>): boolean {
  return exact(value, ["current_task"]) || legacyMetadataCarrier(value, ["current_task"]);
}
export interface CarrierSelection extends MaintenanceTaskIdentity { task_path: string; task_paths?: readonly string[]; carrier_workspace?: string; common_dir?: string | null }
export function classifySessionCarrier(value: unknown, selected: CarrierSelection): { kind: "identity2" | "identity3" | "path1" | "path0"; matches: boolean } {
  if (!isPlainObject(value)) throw new MaintenanceError("unsupported_carrier", "Session must be an object");
  if (value.schema_version === 2 || value.schema_version === 3) {
    const version = value.schema_version;
    if (!exact(value, ["schema_version", "task_id", "lifecycle_generation", ...(version === 3 ? ["delivery_id"] : [])]) || !taskId(value.task_id) || !generation(value.lifecycle_generation) || (version === 3 && value.delivery_id !== null && (typeof value.delivery_id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.delivery_id)))) throw new MaintenanceError("unsupported_carrier", "Malformed identity session");
    return { kind: version === 2 ? "identity2" : "identity3", matches: value.task_id === selected.task_id && value.lifecycle_generation === selected.generation };
  }
  const old = value.schema_version === 1;
  const keys = old ? ["schema_version", "repository_common_dir", "task_workspace_root", "current_task"] : ["current_task"];
  if (!(old ? exact(value, keys) || legacyMetadataCarrier(value, keys) : unversionedLocalCarrier(value)) || typeof value.current_task !== "string" || !/^\.trellis\/tasks\/(?:[^/]+|archive\/[^/]+\/[^/]+)$/.test(value.current_task) || value.current_task === ".trellis/tasks/archive" || value.current_task.split("/").some(part => part === "." || part === "..")) throw new MaintenanceError("unsupported_carrier", "Unknown path-based session");
  const workspace = old ? value.task_workspace_root : selected.carrier_workspace;
  if (typeof workspace !== "string" || !path.isAbsolute(workspace) || (old && (typeof value.repository_common_dir !== "string" || !path.isAbsolute(value.repository_common_dir)))) throw new MaintenanceError("unsupported_carrier", "Path carrier requires its original absolute workspace/common storage");
  return { kind: old ? "path1" : "path0", matches: [selected.task_path, ...(selected.task_paths ?? [])].some(taskPath => path.resolve(workspace, String(value.current_task)) === path.resolve(taskPath)) && (!old || path.resolve(String(value.repository_common_dir)) === selected.common_dir) };
}
export function classifyBranchBinding(value: unknown, selected: MaintenanceTaskIdentity): { matches: boolean; branch_name: string; binding_revision: number } {
  if (!isPlainObject(value) || !exact(value, ["schema_version", "task_id", "lifecycle_generation", "binding_revision", "branch_name"]) || value.schema_version !== "1.0" || !taskId(value.task_id) || !generation(value.lifecycle_generation) || !generation(value.binding_revision) || typeof value.branch_name !== "string" || !value.branch_name) throw new MaintenanceError("unsupported_binding", "Expected a canonical schema1 branch binding");
  return { matches: value.task_id === selected.task_id && value.lifecycle_generation === selected.generation, branch_name: value.branch_name, binding_revision: Number(value.binding_revision) };
}

/** Convert a caller-selected formal predecessor without creating old gates. */
export function validateFormalArchiveReactivationProjection(
  source: unknown,
  projection: unknown,
  facts: readonly LegacyFactDisposition[] = [],
): TaskRecordV2 {
  const classification = classifyFormalArchivePredecessor(source);
  const record = parseTaskRecordV2(projection);
  validateFormalArchiveSuccessorSource(source, record.source);
  validateProjectionIdentity(source as Record<string, unknown>, record);
  if (!Number.isSafeInteger(classification.generation + 1) || record.lifecycle_generation !== classification.generation + 1)
    throw new MaintenanceError("target_key_mismatch", "Formal reactivation must increment lifecycle_generation exactly once");
  validateLegacyFacts(source as Record<string, unknown>, record, facts);
  validateArchiveHistory(record, classification.generation);
  return record;
}
function validateArchiveHistory(record: TaskRecordV2, predecessorGeneration: number): void {
  if (!record.accepted_scope)
    throw new MaintenanceError("accepted_scope_required", "Reactivated Task requires actual accepted scope evidence");
  if (record.completion_results.length || record.closure_results.length)
    throw new MaintenanceError("formal_lifecycle_conflict", "Predecessor conversion cannot manufacture Completion/Closure");
  for (const delivery of record.deliveries) {
    if (Object.values(delivery.results).some(result => result !== null))
      throw new MaintenanceError("inherited_gate_conflict", "Predecessor conversion cannot import gate authority");
    if (delivery.lifecycle_generation !== predecessorGeneration || delivery.phase !== "delivered" || !delivery.delivery_result || delivery.stop_result || !delivery.delivery_result.evidence.length)
      throw new MaintenanceError("historical_outcome_required", "Only genuine predecessor-generation delivered outcomes may be retained");
  }
}

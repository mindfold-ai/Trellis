import type { TrellisTaskRecord } from "../schema.js";

export const OWNER_ROLES = ["task_scope", "creation", "planning", "implementation", "check", "full_review", "readiness", "publication", "delivery", "completion", "closure"] as const;
export type OwnerRole = (typeof OWNER_ROLES)[number];
export const DELIVERY_PHASES = ["planning", "implementing", "checking", "reviewing", "publishing", "delivered", "stopped"] as const;
export type DeliveryPhase = (typeof DELIVERY_PHASES)[number];
export type DeliveryProfile = "local_commit" | "manual" | "pull_request";
export type GateRole = "planning" | "check" | "full_review" | "readiness";
export interface TaskKey { task_id: string; lifecycle_generation: number }
export interface DeliveryKey extends TaskKey { delivery_id: string }
export interface DeliverySelection extends TaskKey { delivery_id: string | null }
export interface AuthorityRef { locator: string; revision: string }
export interface SliceScopeRef { authority: AuthorityRef; anchors: string[] }
export interface CandidateRef {
  kind: "git" | "git_free";
  content_ref: string;
  paths: string[];
  head_ref: string | null;
  base_ref: string | null;
}
export interface WorkflowContract {
  delivery_api: "1.0";
  task_schema: "2.0";
  profiles: DeliveryProfile[];
  owners: Record<OwnerRole, string>;
}
/** Producer-authored applicability inputs, independent of phase. */
export interface GateResult {
  result_id: string;
  owner_role: GateRole;
  owner_id: string;
  outcome: "accepted" | "passed" | "ready";
  scope_ref: SliceScopeRef;
  plan_ref: AuthorityRef;
  candidate: CandidateRef | null;
  predecessor_result_id: string | null;
  obligations: AuthorityRef[];
  evidence: AuthorityRef[];
}
export interface ResultIdentity { result_id: string; owner_id: string; evidence: AuthorityRef[] }
export interface PublicationFact extends ResultIdentity {
  profile: "pull_request";
  candidate: CandidateRef;
  repo_ref: string;
  pr_number: number;
  reviewed_head: string;
  target_ref: string;
  publication_ref: AuthorityRef;
}
export type DeliveryFact = ResultIdentity & { candidate: CandidateRef } & (
  | { profile: "local_commit"; commit: string }
  | { profile: "manual"; artifact: AuthorityRef }
  | { profile: "pull_request"; repo_ref: string; pr_number: number; reviewed_head: string; merge_commit: string; target_ref: string }
);
export interface StopResult extends ResultIdentity { reason: AuthorityRef; scope_decision: AuthorityRef }
export interface DeliveryRecord {
  id: string;
  lifecycle_generation: number;
  scope_ref: SliceScopeRef;
  planning_root: string;
  profile: DeliveryProfile;
  phase: DeliveryPhase;
  plan_ref: AuthorityRef | null;
  candidate: CandidateRef | null;
  results: Record<GateRole, GateResult | null>;
  publication_result: PublicationFact | null;
  delivery_result: DeliveryFact | null;
  stop_result: StopResult | null;
}
export interface TaskCompletionResult extends ResultIdentity {
  lifecycle_generation: number;
  accepted_scope: AuthorityRef;
  delivery_result_ids: string[];
  outcome: "completed";
}
export interface TaskClosureResult extends ResultIdentity {
  lifecycle_generation: number;
  completion_result_id: string;
  disposition: "no_mutation" | "source_closed";
  source_result: AuthorityRef | null;
}
export type TaskRecordV2 = Omit<TrellisTaskRecord, "status" | "commit" | "pr_url" | "completedAt"> & {
  schema_version: "2.0";
  /** Immutable original Task artifact root, initialized only by explicit relocation. */
  artifact_origin?: string;
  accepted_scope: AuthorityRef | null;
  deliveries: DeliveryRecord[];
  completion_results: TaskCompletionResult[];
  closure_results: TaskClosureResult[];
};
interface OperationBase { api_version: "1.0"; key: TaskKey; owner_role: OwnerRole; owner_id: string }
interface DeliveryOperationBase extends OperationBase { key: DeliveryKey; expected_phase: DeliveryPhase }
export type TaskOperation =
  | (OperationBase & { operation: "accept_scope"; authority: AuthorityRef })
  | (OperationBase & { operation: "create_delivery"; key: DeliveryKey; scope_ref: SliceScopeRef; profile: DeliveryProfile })
  | (DeliveryOperationBase & { operation: "begin_check"; candidate: CandidateRef })
  | (DeliveryOperationBase & { operation: "record_gate"; result: GateResult })
  | (DeliveryOperationBase & { operation: "rework"; target_role: "planning" | "implementation" | "check" | "full_review" | "readiness"; reason: AuthorityRef; affected_results: GateRole[]; scope_ref?: SliceScopeRef })
  | (DeliveryOperationBase & { operation: "record_publication"; result: PublicationFact; historical_success?: boolean })
  | (DeliveryOperationBase & { operation: "record_delivery"; result: DeliveryFact; historical_success?: boolean })
  | (DeliveryOperationBase & { operation: "stop"; result: StopResult })
  | (OperationBase & { operation: "complete_task"; result: TaskCompletionResult })
  | (OperationBase & { operation: "close_task"; result: TaskClosureResult })
  | (OperationBase & { operation: "reopen_task"; authority: AuthorityRef });
export interface OperationOutput { record: TaskRecordV2; key: TaskKey | DeliveryKey; phase: DeliveryPhase | null; result_id: string | null; changed: boolean }
export type CurrentDelivery =
  | { kind: "no_current_task" }
  | { kind: "no_current_delivery"; key: TaskKey }
  | { kind: "current" | "terminal_delivery"; key: DeliveryKey; delivery: DeliveryRecord }
  | { kind: "error"; code: string; message: string };
export interface GateApplicabilitySlot { kind: "missing" | "applicable" | "not_applicable"; result_id: string | null; code: string | null }
export type GateApplicability = Record<GateRole, GateApplicabilitySlot>;

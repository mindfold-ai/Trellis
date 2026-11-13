import type { AuthorityRef, TaskOperation, TaskRecordV2 } from "./types.js";

/** Validated selected Task location; no inventory fallback or candidate remapping. */
export interface TaskArtifactContext {
  task_id: string;
  task_root: string;
  artifact_origin: string | null;
}
export function authorityLocator(ref: AuthorityRef, context?: TaskArtifactContext): string {
  if (context?.artifact_origin && /^sha256:[a-f0-9]{64}$/.test(ref.revision) && ref.locator.startsWith(context.artifact_origin + "/")) {
    return context.task_root + ref.locator.slice(context.artifact_origin.length);
  }
  return ref.locator;
}
/** Normalize only typed AuthorityRef inputs, before domain equality and retry. */
export function canonicalTaskOperation(input: TaskOperation, context: TaskArtifactContext): TaskOperation {
  const op = structuredClone(input);
  const normalize = (ref: AuthorityRef | null): void => {
    if (ref && context.artifact_origin && /^sha256:[a-f0-9]{64}$/.test(ref.revision) && ref.locator.startsWith(context.task_root + "/")) {
      ref.locator = context.artifact_origin + ref.locator.slice(context.task_root.length);
    }
  };
  if (op.operation === "accept_scope" || op.operation === "reopen_task") normalize(op.authority);
  else if (op.operation === "create_delivery") normalize(op.scope_ref.authority);
  else if (op.operation === "rework") { normalize(op.reason); if (op.scope_ref) normalize(op.scope_ref.authority); }
  if ("result" in op) {
    op.result.evidence.forEach(normalize);
    switch (op.operation) {
      case "record_gate": normalize(op.result.scope_ref.authority); normalize(op.result.plan_ref); op.result.obligations.forEach(normalize); break;
      case "record_publication": normalize(op.result.publication_ref); break;
      case "record_delivery": if (op.result.profile === "manual") normalize(op.result.artifact); break;
      case "stop": normalize(op.result.reason); normalize(op.result.scope_decision); break;
      case "complete_task": normalize(op.result.accepted_scope); break;
      case "close_task": normalize(op.result.source_result); break;
    }
  }
  return op;
}
export function taskArtifactContext(taskRoot: string, record: TaskRecordV2): TaskArtifactContext {
  return { task_id: record.id, task_root: taskRoot, artifact_origin: record.artifact_origin ?? null };
}

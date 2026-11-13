import { validateProjectionIdentity } from "./migration-projection.js";
import { isPlainObject } from "./schema.js";
import { parseTaskRecordV2 } from "./v2/schema.js";
import type { TaskRecordV2 } from "./v2/types.js";
import { getGateApplicability } from "./v2/operations.js";

/** Reviewed projection only: legacy status cannot synthesize lifecycle facts. */
export function validateTaskV2Projection(
  source: unknown,
  projection: unknown,
): TaskRecordV2 {
  if (!isPlainObject(source))
    throw new Error("Migration source must be an object");
  const record = parseTaskRecordV2(projection);
  validateProjectionIdentity(source, record);
  if (record.lifecycle_generation !== (source.lifecycle_generation ?? 0))
    throw new Error("Migration must preserve lifecycle_generation");
  for (const delivery of record.deliveries) {
    if (
      delivery.lifecycle_generation !== record.lifecycle_generation ||
      ["planning", "delivered", "stopped"].includes(delivery.phase)
    )
      continue;
    const gates = getGateApplicability(record, {
      task_id: record.id,
      lifecycle_generation: record.lifecycle_generation,
      delivery_id: delivery.id,
    });
    const roles =
      delivery.phase === "publishing"
        ? (["planning", "check", "full_review", "readiness"] as const)
        : delivery.phase === "reviewing"
          ? (["planning", "check"] as const)
          : (["planning"] as const);
    for (const role of roles)
      if (gates[role].kind !== "applicable")
        throw new Error(`Migration cannot activate stale ${role} gate`);
  }
  // Historical outcomes are supplied by their producers, never reconstructed
  // by this validator. The executor preserves the entire raw source separately.
  return record;
}

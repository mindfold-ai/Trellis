import fs from "node:fs";
import path from "node:path";
import { applyTaskOperation, emptyTaskRecordV2 } from "@mindfoldhq/trellis-core/task/v2";
import { readDeliveryWorkflowContract } from "../../src/utils/delivery-workflow.js";
import { deliveryWorkflowMdTemplate } from "../../src/templates/trellis/index.js";

/** Seed a real v2 aggregate with distinct Task and selected Delivery artifacts. */
export function seedDeliveryContext(workspace: string, taskId: string, taskName: string): string {
  const contract = readDeliveryWorkflowContract(deliveryWorkflowMdTemplate);
  if (!contract) throw new Error("Missing native fixture contract");
  const task = path.join(workspace, ".trellis/tasks", taskName);
  const authority = { locator: `.trellis/tasks/${taskName}/prd.md`, revision: "sha256:" + "a".repeat(64) };
  const deliveryId = "11111111-1111-4111-8111-111111111111";
  const scoped = applyTaskOperation(emptyTaskRecordV2({ id: taskId }), {
    api_version: "1.0", operation: "accept_scope", owner_role: "task_scope", owner_id: contract.owners.task_scope,
    key: { task_id: taskId, lifecycle_generation: 0 }, authority,
  }, contract).record;
  const record = applyTaskOperation(scoped, {
    api_version: "1.0", operation: "create_delivery", owner_role: "creation", owner_id: contract.owners.creation,
    key: { task_id: taskId, lifecycle_generation: 0, delivery_id: deliveryId },
    scope_ref: { authority, anchors: ["slice"] }, profile: "manual",
  }, contract).record;
  const planning = path.join(task, "deliveries", deliveryId);
  fs.mkdirSync(planning, { recursive: true });
  fs.writeFileSync(path.join(task, "task.json"), JSON.stringify(record));
  fs.writeFileSync(path.join(task, "prd.md"), "ROOT TASK ARTIFACT MUST NOT BE IMPLEMENTATION CONTEXT");
  fs.writeFileSync(path.join(planning, "prd.md"), "SELECTED DELIVERY PRD");
  fs.writeFileSync(path.join(planning, "design.md"), "SELECTED DELIVERY DESIGN");
  for (const name of ["implement", "check"]) {
    fs.writeFileSync(path.join(planning, `${name}.jsonl`), JSON.stringify({ file: "context.md" }) + "\n");
  }
  fs.writeFileSync(path.join(workspace, "context.md"), "SELECTED WORKSPACE SPEC");
  fs.writeFileSync(path.join(workspace, ".trellis/workflow.md"), deliveryWorkflowMdTemplate);
  return deliveryId;
}

/** Explicit independent maintenance SDK. No current-session selection or implicit writes. */
import {
  candidateIdentity,
  previewPlan,
  applyPlan,
  recoverOperation,
  resumeOperation,
  rollbackOperation,
} from "./shared.js";
import type { PreparedMaintenancePlan, MaintenanceResult } from "./shared.js";
import { MaintenanceError } from "./shared.js";
export { MaintenanceError } from "./shared.js";
import * as tools from "./tools.js";
import * as tasks from "./tasks.js";
import type { ToolsInstallationInput, ToolsTargetInspection } from "./tools.js";
import type {
  FormalArchiveReactivationInput,
  InspectFormalArchiveReactivationInput,
  FormalArchiveReactivationInspection,
  ArchivedTaskResumeInput,
  TaskConversionInput,
  LegacyCloseoutInput,
  InspectTaskTargetInput,
  InspectedTaskTarget,
} from "./tasks.js";
export type {
  PreparedMaintenancePlan,
  MaintenanceResult,
  FormalArchiveReactivationResult,
  CandidateIdentity,
  RawSnapshot,
} from "./shared.js";
export { parseToolsInstallationInput } from "./tools.js";
export type {
  ToolsInstallationInput,
  ToolsFileDecision,
  ToolsTargetInspection,
  ToolsWorkflowDecision,
} from "./tools.js";
export {
  parseTaskConversionInput,
  parseLegacyCloseoutInput,
  parseArchivedTaskResumeInput,
  parseFormalArchiveReactivationInput,
} from "./tasks.js";
export type {
  FormalArchiveReactivationInput,
  InspectFormalArchiveReactivationInput,
  FormalArchiveReactivationInspection,
  ArchivedTaskResumeInput,
  TaskConversionInput,
  LegacyCloseoutInput,
  InspectTaskTargetInput,
  InspectedTaskTarget,
} from "./tasks.js";

function maintenanceError(error: unknown): MaintenanceError {
  if (error instanceof MaintenanceError) return error;
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "maintenance_failed";
  return new MaintenanceError(
    code,
    error instanceof Error ? error.message : String(error),
  );
}
function perform<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw maintenanceError(error);
  }
}
async function performAsync<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw maintenanceError(error);
  }
}
export function inspectToolsTarget(input: {
  root: string;
}): Promise<ToolsTargetInspection> {
  return performAsync(() => tools.inspectToolsTarget(input));
}
export function prepareToolsInstallation(
  input: ToolsInstallationInput,
): Promise<PreparedMaintenancePlan> {
  return performAsync(() => tools.prepareToolsInstallation(input));
}
export function inspectTaskTarget(
  input: InspectTaskTargetInput,
): InspectedTaskTarget {
  return perform(() => tasks.inspectTaskTarget(input));
}
export function prepareTaskConversion(
  input: TaskConversionInput,
): PreparedMaintenancePlan {
  return perform(() => tasks.prepareTaskConversion(input));
}
export function prepareArchivedTaskResume(
  input: ArchivedTaskResumeInput,
): PreparedMaintenancePlan {
  return perform(() => tasks.prepareArchivedTaskResume(input));
}
export function inspectFormalArchiveReactivation(
  input: InspectFormalArchiveReactivationInput,
): FormalArchiveReactivationInspection {
  return perform(() => tasks.inspectFormalArchiveReactivation(input));
}
export function prepareFormalArchiveReactivation(
  input: FormalArchiveReactivationInput,
): PreparedMaintenancePlan {
  return perform(() => tasks.prepareFormalArchiveReactivation(input));
}
export function prepareLegacyCloseout(
  input: LegacyCloseoutInput,
): PreparedMaintenancePlan {
  return perform(() => tasks.prepareLegacyCloseout(input));
}
export interface MaintenanceContract {
  maintenance_api: "1.0";
  cli_version: string;
  core_version: string;
  operation_kinds: readonly [
    "tools_install",
    "task_conversion",
    "legacy_closeout",
    "task_resume",
    "formal_archive_reactivation",
  ];
  tools_custom_instruction: { path: "AGENTS.md"; action: "custom" };
  source_versions: string[];
  task_families: string[];
  session_families: string[];
  formal_archive_reactivation: {
    task_families: ["schema1", "known_legacy"];
    generation: "increment_once";
    original_archive: "read_only";
  };
  archive_resume: {
    task_families: string[];
    generation: "preserve";
    original_archive: "read_only";
  };
}
export function getMaintenanceContract(): MaintenanceContract {
  const candidate = candidateIdentity();
  return {
    maintenance_api: "1.0" as const,
    cli_version: candidate.cli_version,
    core_version: candidate.core_version,
    operation_kinds: [
      "tools_install",
      "task_conversion",
      "legacy_closeout",
      "task_resume",
      "formal_archive_reactivation",
    ] as const,
    tools_custom_instruction: { path: "AGENTS.md", action: "custom" },
    source_versions: [
      "stable 0.6.x",
      "0.7.0-castbox.N, N >= 1, no newer than candidate",
    ],
    task_families: ["known_legacy", "schema1", "schema2_preserve_only"],
    formal_archive_reactivation: {
      task_families: ["schema1", "known_legacy"],
      generation: "increment_once",
      original_archive: "read_only",
    },
    archive_resume: {
      task_families: ["known_legacy", "schema1"],
      generation: "preserve",
      original_archive: "read_only",
    },
    session_families: [
      "unversioned_local",
      "schema1_path",
      "schema2_identity",
      "schema3_delivery",
    ],
  };
}
export function previewMaintenance(
  plan: PreparedMaintenancePlan,
): MaintenanceResult {
  return perform(() => previewPlan(plan));
}
export function applyMaintenance(
  plan: PreparedMaintenancePlan,
  options: { state_dir: string },
): Promise<MaintenanceResult> {
  return performAsync(() => applyPlan(plan, options.state_dir));
}
export function recoverMaintenance(input: {
  recovery_ref: string;
}): Promise<MaintenanceResult> {
  return performAsync(() => recoverOperation(input.recovery_ref));
}
export function resumeMaintenance(input: {
  recovery_ref: string;
}): Promise<MaintenanceResult> {
  return performAsync(() => resumeOperation(input.recovery_ref));
}
export function rollbackMaintenance(input: {
  recovery_ref: string;
}): Promise<MaintenanceResult> {
  return performAsync(() => rollbackOperation(input.recovery_ref));
}

import { pythonInvocation } from "./python.js";
import { spawnSync } from "node:child_process";
import { getPythonCommandForPlatform } from "../configurators/shared.js";
import fs from "node:fs";
import path from "node:path";
import {
  validateWorkflowContract,
  parseTaskRecordV2,
  type WorkflowContract,
} from "@mindfoldhq/trellis-core/task/v2";
import { VERSION } from "../constants/version.js";
import { assertProjectPath } from "./path-boundary.js";

export type DeliveryWorkflowContract = WorkflowContract;

/** Legacy workflows have no declaration; malformed declarations never fall back. */
export function readDeliveryWorkflowContract(
  content: string,
): DeliveryWorkflowContract | null {
  const lines = content.split(/\r?\n/);
  const opened = lines.flatMap((line, i) =>
    line.trim() === "[trellis-runtime-contract]" ? [i] : [],
  );
  const closed = lines.flatMap((line, i) =>
    line.trim() === "[/trellis-runtime-contract]" ? [i] : [],
  );
  if (!opened.length && !closed.length) {
    if (
      lines.some((line) => /^\[\/?trellis-runtime-contract/.test(line.trim()))
    )
      throw new Error("invalid_runtime_contract_block");
    return null;
  }
  if (opened.length !== 1 || closed.length !== 1 || opened[0] >= closed[0]) {
    throw new Error(
      "invalid_runtime_contract: expected exactly one ordered runtime declaration",
    );
  }
  try {
    return validateWorkflowContract(
      JSON.parse(lines.slice(opened[0] + 1, closed[0]).join("\n")),
    );
  } catch (error) {
    throw new Error(
      `invalid_runtime_contract: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** D1 switches never migrate existing records implicitly. Archives remain history-only. */
export function preflightDeliveryWorkflow(
  cwd: string,
  content: string,
  options: { installingRuntime?: boolean } = {},
): void {
  const contract = readDeliveryWorkflowContract(content);
  const workflowRoot = path.join(cwd, ".trellis");
  // Only the actual installed declaration can make unrelated old records
  // historical-only. Prospective switch content cannot authorize migration.
  const installedWorkflowPath = path.join(workflowRoot, "workflow.md");
  assertProjectPath(installedWorkflowPath, cwd);
  const installedContract = fs.existsSync(installedWorkflowPath)
    ? readDeliveryWorkflowContract(
        fs.readFileSync(installedWorkflowPath, "utf8"),
      )
    : null;
  if (contract && fs.existsSync(workflowRoot)) {
    const versionPath = path.join(workflowRoot, ".version");
    assertProjectPath(versionPath, cwd);
    if (
      !fs.existsSync(versionPath) ||
      fs.readFileSync(versionPath, "utf8").trim() !== VERSION
    ) {
      throw new Error(
        `unsupported_delivery_install: requires installed Trellis ${VERSION}; use an explicit reviewed upgrade`,
      );
    }
  }
  if (contract && fs.existsSync(workflowRoot) && !options.installingRuntime) {
    const script = path.join(workflowRoot, "scripts", "delivery.py");
    assertProjectPath(script, cwd);
    const python = pythonInvocation(getPythonCommandForPlatform());
    const probe = spawnSync(
      python.executable,
      [...python.args, script, "contract", "--json"],
      {
        cwd,
        encoding: "utf8",
        timeout: 10_000,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      },
    );
    let capability: unknown;
    try {
      capability = JSON.parse(probe.stdout ?? "");
    } catch {
      capability = null;
    }
    if (
      probe.error ||
      probe.status !== 0 ||
      !capability ||
      typeof capability !== "object" ||
      !("delivery_api" in capability) ||
      capability.delivery_api !== "1.0" ||
      !("task_schema" in capability) ||
      capability.task_schema !== "2.0"
    ) {
      throw new Error(
        "unsupported_delivery_install: installed runtime cannot serve Delivery API 1.0 / Task schema 2.0; reapply this exact candidate before switching",
      );
    }
  }
  const tasks = path.join(workflowRoot, "tasks");
  assertProjectPath(tasks, cwd);
  if (!fs.existsSync(tasks)) return;
  const identities = new Set<string>();
  for (const entry of fs.readdirSync(tasks, { withFileTypes: true })) {
    if (
      (!entry.isDirectory() && !entry.isSymbolicLink()) ||
      entry.name === "archive"
    )
      continue;
    const taskDirectory = path.join(tasks, entry.name);
    assertProjectPath(taskDirectory, cwd);
    if (!fs.statSync(taskDirectory).isDirectory()) continue;
    const recordPath = path.join(taskDirectory, "task.json");
    assertProjectPath(recordPath, cwd);
    if (!fs.existsSync(recordPath)) continue;
    const data: unknown = JSON.parse(fs.readFileSync(recordPath, "utf8"));
    if (
      data === null ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      !("id" in data) ||
      typeof data.id !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(data.id)
    ) {
      throw new Error(`invalid_task_identity: ${recordPath}`);
    }
    const identity = data.id.toLowerCase();
    if (identities.has(identity))
      throw new Error(`task_identity_collision: ${recordPath}`);
    identities.add(identity);
    const v2 =
      data !== null &&
      typeof data === "object" &&
      "schema_version" in data &&
      data.schema_version === "2.0";
    if (v2) {
      const record = parseTaskRecordV2(data);
      if (contract) {
        const unsupported = record.deliveries.find(
          (delivery) =>
            delivery.phase !== "delivered" &&
            delivery.phase !== "stopped" &&
            !contract.profiles.includes(delivery.profile),
        );
        if (unsupported) {
          throw new Error(
            `unsupported_delivery_profile: ${recordPath}; active Delivery ${unsupported.id} uses ${unsupported.profile}`,
          );
        }
      }
    }
    const preservedHistory =
      !v2 &&
      Boolean(contract) &&
      Boolean(installedContract) &&
      (!("schema_version" in data) || data.schema_version === "1.0");
    if (v2 !== Boolean(contract) && !preservedHistory) {
      throw new Error(
        `delivery_migration_required: ${recordPath}; D1 does not migrate or mix task authorities`,
      );
    }
  }
}

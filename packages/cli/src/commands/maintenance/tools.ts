import { replacePythonCommandLiterals } from "../../configurators/shared.js";
import fs from "node:fs";
import { z } from "zod";
import { compareVersions } from "../../utils/compare-versions.js";
import path from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { VERSION } from "../../constants/version.js";
import { getConfiguredPlatforms } from "../../configurators/index.js";
import {
  pythonInvocation,
  resolveSupportedPython,
} from "../../utils/python.js";
import { computeHash, loadHashes } from "../../utils/template-hash.js";
import { readDeliveryWorkflowContract } from "../../utils/delivery-workflow.js";
import {
  isBundledWorkflow,
  resolveWorkflowTemplate,
} from "../../utils/workflow-resolver.js";
import {
  collectProspectiveTemplateFiles,
  loadUpdateSkipPaths,
} from "../update.js";
import {
  MaintenanceError,
  observeRepository,
  preparePlan,
  readSnapshot,
  snapshot,
  type RawSnapshot as FileSnapshot,
  type PreparedMaintenancePlan,
  type MaintenanceAction,
} from "./shared.js";

type RawSnapshot = FileSnapshot | null;

export type ToolsWorkflowDecision =
  | { action: "preserve" }
  | {
      action: "install";
      template_id: string;
      provider: string;
      content: string;
      ownership: "bundled" | "custom";
    };
export type ToolsFileDecision =
  | {
      path: string;
      source: RawSnapshot;
      action: "replace" | "preserve" | "create-new" | "remove";
    }
  | {
      path: "AGENTS.md";
      source: RawSnapshot;
      action: "custom";
      content: string;
    };
export interface ToolsInstallationInput {
  root: string;
  workflow: ToolsWorkflowDecision;
  file_decisions: ToolsFileDecision[];
}
const rawSnapshotSchema = z
  .strictObject({
    content_base64: z.string(),
    sha256: z.string(),
    mode: z.number().int().min(0).max(0o777),
  })
  .nullable();
const toolsInstallationSchema = z.strictObject({
  root: z.string().min(1),
  workflow: z.discriminatedUnion("action", [
    z.strictObject({ action: z.literal("preserve") }),
    z.strictObject({
      action: z.literal("install"),
      template_id: z.string().min(1),
      provider: z.string().min(1),
      content: z.string().min(1),
      ownership: z.enum(["bundled", "custom"]),
    }),
  ]),
  file_decisions: z.array(
    z.union([
      z.strictObject({
        path: z.string().min(1),
        source: rawSnapshotSchema,
        action: z.enum(["replace", "preserve", "create-new", "remove"]),
      }),
      z.strictObject({
        path: z.literal("AGENTS.md"),
        source: rawSnapshotSchema,
        action: z.literal("custom"),
        content: z.string(),
      }),
    ]),
  ),
});
export function parseToolsInstallationInput(
  input: unknown,
): ToolsInstallationInput {
  const parsed = toolsInstallationSchema.safeParse(input);
  if (!parsed.success) failure("invalid_input", parsed.error.message);
  return parsed.data;
}
const workflowPath = ".trellis/workflow.md";
const receiptPath = ".trellis/.template-hashes.json";
const versionPath = ".trellis/.version";
function failure(code: string, message: string): never {
  throw new MaintenanceError(code, message);
}
function text(source: RawSnapshot): string {
  return source
    ? Buffer.from(source.content_base64, "base64").toString("utf8")
    : "";
}
function same(a: RawSnapshot, b: RawSnapshot): boolean {
  return a?.content_base64 === b?.content_base64 && a?.mode === b?.mode;
}
function versionParts(version: string): number[] | null {
  const stable = /^0\.6\.(\d+)$/.exec(version);
  if (stable) return [0, 6, Number(stable[1]), 0];
  const current = /^0\.7\.0-castbox\.([1-9]\d*)$/.exec(version);
  return current ? [0, 7, 0, Number(current[1])] : null;
}
function supportedVersion(root: string): string {
  const installed = text(readSnapshot(root, versionPath)).trim();
  const source = versionParts(installed),
    candidate = versionParts(VERSION);
  if (!source || !candidate || compareVersions(installed, VERSION) > 0)
    failure(
      "unsupported_source_version",
      `installed ${installed || "missing"}; candidate ${VERSION}`,
    );
  return installed;
}
/** Windows stat does not expose POSIX execute bits. Freeze modes the target
 * filesystem can actually report so exact recovery snapshots remain meaningful.
 */
function toolsTargetMode(name: string, source: RawSnapshot): number {
  if (process.platform === "win32") return source?.mode ?? 0o666;
  return /\.(py|sh)$/.test(name) ? 0o755 : (source?.mode ?? 0o644);
}
function required(name: string): boolean {
  return (
    name.startsWith(".trellis/scripts/") ||
    name.startsWith(".trellis/agents/") ||
    name === ".trellis/delivery-contract.md" ||
    (!name.startsWith(".trellis/") &&
      name !== "AGENTS.md" &&
      name !== ".github/copilot-instructions.md")
  );
}
function skipped(root: string, name: string): boolean {
  return loadUpdateSkipPaths(root).some(
    (p) => name === p || name.startsWith(p.endsWith("/") ? p : `${p}/`),
  );
}
export interface ToolsTargetInspection {
  root: string;
  source_version: string;
  target_version: string;
  configured_platforms: string[];
  workflow: { source: RawSnapshot; ownership: string };
  files: {
    path: string;
    source: RawSnapshot;
    required: boolean;
    skipped: boolean;
    status: string;
  }[];
}
/** Explicit, read-only inspection; never invokes the target's old runtime. */
export async function inspectToolsTarget({
  root,
}: {
  root: string;
}): Promise<ToolsTargetInspection> {
  const repository = observeRepository(root);
  const source_version = supportedVersion(repository.root);
  const files = await collectProspectiveTemplateFiles(repository.root, {
    registrySpecs: false,
    applySkipPaths: false,
  });
  files.delete(workflowPath);
  const hashes = loadHashes(repository.root);
  return {
    root: repository.root,
    source_version,
    target_version: VERSION,
    configured_platforms: [...getConfiguredPlatforms(repository.root)],
    workflow: {
      source: readSnapshot(repository.root, workflowPath),
      ownership: hashes[workflowPath] ? "bundled" : "custom",
    },
    files: [...files].map(([name, content]) => {
      const source = readSnapshot(repository.root, name);
      const unchanged =
        source !== null && computeHash(text(source)) === computeHash(content);
      return {
        path: name,
        source,
        required: required(name),
        skipped: skipped(repository.root, name),
        status: unchanged
          ? "unchanged"
          : source && hashes[name] !== computeHash(text(source))
            ? "conflict"
            : !source && hashes[name]
              ? "deleted"
              : "update",
      };
    }),
  };
}

/** Freeze real prospective tools and exact preimages without touching old data. */
export async function prepareToolsInstallation(
  input: ToolsInstallationInput,
): Promise<PreparedMaintenancePlan> {
  input = parseToolsInstallationInput(input);
  const repository = observeRepository(input.root),
    root = repository.root;
  const source_version = supportedVersion(root);
  const files = await collectProspectiveTemplateFiles(root, {
    registrySpecs: false,
    applySkipPaths: false,
  });
  files.delete(workflowPath);
  const originalWorkflow = readSnapshot(root, workflowPath);
  const installedContract = readDeliveryWorkflowContract(
    text(originalWorkflow),
  );
  const originalHashes = loadHashes(root);
  const hashes = { ...originalHashes };
  if (input.workflow.action === "install") {
    const decision = input.workflow;
    if (!decision.provider || !decision.template_id)
      failure("invalid_workflow", "explicit provider/template required");
    if (decision.ownership === "bundled") {
      if (
        decision.provider !== "bundled" ||
        !isBundledWorkflow(decision.template_id)
      )
        failure(
          "invalid_workflow",
          "bundled ownership requires bundled identity",
        );
      const resolved = await resolveWorkflowTemplate(decision.template_id);
      if (resolved.content !== decision.content)
        failure(
          "candidate_mismatch",
          "workflow does not match actual bundled candidate",
        );
    } else if (decision.provider === "bundled")
      failure(
        "invalid_workflow",
        "custom ownership requires its actual provider",
      );
    readDeliveryWorkflowContract(decision.content);
    files.set(workflowPath, replacePythonCommandLiterals(decision.content));
  } else if (input.workflow.action !== "preserve" || !originalWorkflow)
    failure("invalid_workflow", "preserve requires an existing workflow");
  const decisions = new Map<string, ToolsFileDecision>();
  for (const decision of input.file_decisions) {
    if (decisions.has(decision.path) || !files.has(decision.path))
      failure("invalid_file_decision", decision.path);
    if (!same(readSnapshot(root, decision.path), decision.source))
      failure("stale_source", decision.path);
    decisions.set(decision.path, decision);
  }
  const actions: MaintenanceAction[] =
    input.workflow.action === "preserve"
      ? [
          {
            root,
            path: workflowPath,
            source: originalWorkflow,
            target: originalWorkflow,
          },
        ]
      : [];
  const required_paths: string[] = [];
  const conflicts: string[] = [];
  for (const [name, content] of files) {
    const source = readSnapshot(root, name);
    const decision = decisions.get(name);
    const target = snapshot(
      decision?.action === "custom" ? decision.content : content,
      toolsTargetMode(name, source),
    );
    const isRequired = required(name) || name === workflowPath;
    const skip = skipped(root, name);
    let action = decision?.action;
    // Workflow installation is itself an explicit replacement decision.
    if (name === workflowPath && !action) action = "replace";
    if (skip && !same(source, target)) {
      if (isRequired)
        conflicts.push(`${name}: update.skip excludes required runtime`);
      else actions.push({ root, path: name, source, target: source });
      continue;
    }
    if (
      !action &&
      source &&
      computeHash(text(source)) !== computeHash(content) &&
      hashes[name] !== computeHash(text(source))
    ) {
      conflicts.push(
        `${name}: local edit or unknown ownership requires a disposition`,
      );
      continue;
    }
    if (!action && !source && hashes[name]) {
      conflicts.push(
        `${name}: user-deleted managed file requires a disposition`,
      );
      continue;
    }
    action ??= "replace";
    if (
      action === "remove" &&
      (isRequired ||
        !source ||
        hashes[name] !== computeHash(text(source)) ||
        [
          "AGENTS.md",
          ".github/copilot-instructions.md",
          ".trellis/config.yaml",
        ].includes(name))
    ) {
      conflicts.push(
        `${name}: removal requires complete managed ownership and an optional asset`,
      );
      continue;
    }
    if (action !== "replace" && isRequired && !same(source, target)) {
      conflicts.push(`${name}: ${action} leaves required runtime unresolved`);
      continue;
    }
    if (action === "preserve") {
      actions.push({ root, path: name, source, target: source });
      continue;
    }
    if (action === "create-new") {
      actions.push({ root, path: name, source, target: source });
      actions.push({
        root,
        path: `${name}.new`,
        source: readSnapshot(root, `${name}.new`),
        target:
          process.platform === "win32"
            ? snapshot(
                content,
                toolsTargetMode(name, readSnapshot(root, `${name}.new`)),
              )
            : target,
      });
      continue;
    }
    if (action === "remove") {
      actions.push({ root, path: name, source, target: null });
      Reflect.deleteProperty(hashes, name);
      continue;
    }
    if (isRequired) required_paths.push(name);
    actions.push({ root, path: name, source, target });
    hashes[name] = computeHash(content);
  }
  if (conflicts.length) failure("conflict", conflicts.join("\n"));
  if (
    input.workflow.action === "install" &&
    input.workflow.ownership === "custom"
  )
    Reflect.deleteProperty(hashes, workflowPath);
  actions.push({
    root,
    path: receiptPath,
    source: readSnapshot(root, receiptPath),
    target: snapshot(
      JSON.stringify({ __version: 2, hashes }, null, 2),
      toolsTargetMode(receiptPath, readSnapshot(root, receiptPath)),
    ),
  });
  actions.push({
    root,
    path: versionPath,
    source: readSnapshot(root, versionPath),
    target: snapshot(
      VERSION,
      toolsTargetMode(versionPath, readSnapshot(root, versionPath)),
    ),
  });
  // A declaration or filename alone does not prove the source reader capability.
  // Unknown/local-edited readers may be replaced, but cannot be blindly restored.
  const originalTaskReader = readSnapshot(root, ".trellis/scripts/task.py");
  const ownedReaders =
    Boolean(originalTaskReader) &&
    [...files.keys()]
      .filter((name) => name.startsWith(".trellis/scripts/"))
      .every((name) => {
        const source = readSnapshot(root, name);
        return (
          source === null || originalHashes[name] === computeHash(text(source))
        );
      });
  const deliveryReaders = [
    ".trellis/scripts/delivery.py",
    ".trellis/scripts/common/delivery_schema.py",
    ".trellis/scripts/common/runtime_contract.py",
  ].every((name) => readSnapshot(root, name) !== null);
  const sourceRuntime = !ownedReaders
    ? "unknown"
    : installedContract
      ? deliveryReaders
        ? "delivery"
        : "unknown"
      : "legacy";
  const agentsDecision = decisions.get("AGENTS.md");
  return preparePlan({
    kind: "tools_install",
    target_root: root,
    common_dir: repository.common_dir,
    actions,
    guard: {
      source_runtime: sourceRuntime,
      source_version,
      target_version: VERSION,
      configured_platforms: [...getConfiguredPlatforms(root)],
      required_paths,
      ...(agentsDecision?.action === "custom"
        ? { custom_agents_content: agentsDecision.content }
        : {}),
      workflow:
        input.workflow.action === "preserve"
          ? { action: "preserve" }
          : {
              action: "install",
              template_id: input.workflow.template_id,
              provider: input.workflow.provider,
              ownership: input.workflow.ownership,
            },
    },
  });
}

/** Frozen replacement bytes must still match the current operation's rendering.
 * Preserved files and custom workflow text keep their reviewed dispositions.
 */
export async function validateToolsSelection(
  plan: PreparedMaintenancePlan,
  command: string,
): Promise<void> {
  if (plan.kind !== "tools_install") return;
  const files = await collectProspectiveTemplateFiles(plan.target_root, {
    registrySpecs: false,
    applySkipPaths: false,
    pythonCommand: command,
  });
  files.delete(workflowPath);
  if (
    plan.guard.workflow.action === "install" &&
    plan.guard.workflow.ownership === "bundled"
  ) {
    const workflow = await resolveWorkflowTemplate(
      plan.guard.workflow.template_id,
    );
    files.set(workflowPath, replacePythonCommandLiterals(workflow.content));
  }
  for (const action of plan.actions) {
    if (action.kind === "directory" || !action.target) continue;
    const name = action.path.endsWith(".new")
      ? action.path.slice(0, -4)
      : action.path;
    const candidate =
      name === "AGENTS.md" && plan.guard.custom_agents_content !== undefined
        ? plan.guard.custom_agents_content
        : files.get(name);
    if (candidate === undefined) continue;
    // Equal source/target outside required replacements is a preserve decision.
    if (
      same(action.source, action.target) &&
      !plan.guard.required_paths.includes(action.path)
    )
      continue;
    if (text(action.target) !== candidate)
      failure(
        "stale_source",
        `${action.path}: rendered candidate changed; prepare a new tools installation`,
      );
  }
}

function nativeProbeOutcome(result: SpawnSyncReturns<string>): string {
  if (result.error) {
    return (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT"
      ? "timeout (10000 ms budget)"
      : "could not execute (10000 ms budget)";
  }
  return result.status === 0
    ? "invalid response"
    : `exit ${result.status ?? "unavailable"} (10000 ms budget)`;
}

/** Actual installed native capability, invoked by the common apply/resume engine. */
export function validateToolsInstallation(
  plan: PreparedMaintenancePlan,
  command = resolveSupportedPython().command,
): void {
  if (plan.kind !== "tools_install")
    failure("invalid_plan", "expected tools_install");
  const python = pythonInvocation(command);
  const root = plan.target_root;
  if (fs.readFileSync(path.join(root, versionPath), "utf8").trim() !== VERSION)
    failure("incomplete_operation", "target version was not installed");
  const result = spawnSync(
    python.executable,
    [
      ...python.args,
      path.join(root, ".trellis/scripts/delivery.py"),
      "contract",
      "--json",
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    },
  );
  let capability: { delivery_api?: string; task_schema?: string } = {};
  try {
    capability = JSON.parse(result.stdout || "{}");
  } catch {
    /* Classified below. */
  }
  if (
    result.status !== 0 ||
    capability.delivery_api !== "1.0" ||
    capability.task_schema !== "2.0"
  )
    failure(
      "incomplete_operation",
      `target native contract failed: ${nativeProbeOutcome(result)}`,
    );
  const declared = readDeliveryWorkflowContract(
    fs.readFileSync(path.join(root, workflowPath), "utf8"),
  );
  const context = spawnSync(
    python.executable,
    [
      ...python.args,
      path.join(root, ".trellis/scripts/get_context.py"),
      ...(declared ? ["--mode", "runtime-contract"] : []),
      "--json",
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    },
  );
  const diagnostic = `${context.stdout}\n${context.stderr}`;
  const pendingMaintenance =
    /^Error:.*maintenance_required/m.test(diagnostic) &&
    !/Traceback \(most recent call last\)/.test(diagnostic);
  if (context.error || (context.status !== 0 && !pendingMaintenance))
    failure(
      "incomplete_operation",
      `target native context failed: ${nativeProbeOutcome(context)}`,
    );
}

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import {
  MaintenanceError,
  classifyMaintenanceTask,
  classifyFormalArchivePredecessor,
  validateFormalArchiveSuccessorSource,
  classifyBranchBinding,
  validateSelectedTaskProjection,
  validateArchivedTaskResumeProjection,
  validateFormalArchiveReactivationProjection,
} from "@mindfoldhq/trellis-core/task/maintenance";
import {
  verifyAuthority,
  authorityLocator,
  verifyHistoricalCommit,
  type AuthorityRef,
  type TaskRecordV2,
  parseTaskRecordV2,
} from "@mindfoldhq/trellis-core/task/v2";
import { rawSnapshotSchema } from "../migration2-schema.js";
import {
  inspectBindings,
  taskPath,
  rawJson,
  expectSnapshot,
  type MaintenanceTaskKey,
  type InspectedCarrier,
} from "./bindings.js";
import {
  observeRepository,
  publicTaskRoots,
  readSnapshot,
  readDirectorySnapshot,
  snapshot,
  preparePlan,
  type MaintenanceAction,
  type DirectorySnapshot,
  type PreparedMaintenancePlan,
} from "./shared.js";

function maintenanceError(message: string): MaintenanceError {
  const [code, ...detail] = message.split(":");
  return new MaintenanceError(code, detail.join(":").trim());
}

const keySchema = z
  .object({
    task_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
    lifecycle_generation: z.number().int().nonnegative().safe(),
  })
  .strict();
const rawSchema = rawSnapshotSchema.nullable();
const carrierSchema = z
  .object({
    root: z.string().min(1),
    path: z.string().min(1),
    source: rawSnapshotSchema,
    kind: z.enum(["session", "branch_binding"]),
  })
  .strict();
const reasonSchema = z
  .object({ locator: z.string().min(1), revision: z.string().min(1) })
  .strict();
const factSchema = z.discriminatedUnion("disposition", [
  z
    .object({
      field: z.enum(["commit", "pr_url", "completedAt"]),
      disposition: z.literal("source_snapshot"),
      owner_id: z.string().min(1),
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      field: z.enum(["commit", "pr_url"]),
      disposition: z.literal("delivery_result"),
      owner_id: z.string().min(1),
      reason: reasonSchema,
      result_id: z.string().min(1),
    })
    .strict(),
]);
const branchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preserve"), source: rawSchema }).strict(),
  z
    .object({
      action: z.literal("establish"),
      source: z.null(),
      record: z
        .object({
          schema_version: z.literal("1.0"),
          task_id: z.string(),
          lifecycle_generation: z.number().int().nonnegative(),
          binding_revision: z.number().int().nonnegative(),
          branch_name: z.string().min(1),
        })
        .strict(),
    })
    .strict(),
]);
export const taskConversionInputSchema = z
  .object({
    root: z.string().min(1),
    key: keySchema,
    task_ref: z.string().min(1),
    source_kind: z.enum(["legacy", "schema1"]),
    projection: z
      .unknown()
      .refine(
        (value) => value !== undefined,
        "A complete projection is required",
      ),
    artifacts: z.array(
      z.discriminatedUnion("action", [
        z
          .object({
            path: z.string().min(1),
            action: z.literal("preserve"),
            source: rawSnapshotSchema,
          })
          .strict(),
        z
          .object({
            path: z.string().min(1),
            action: z.literal("write"),
            source: rawSchema,
            target: rawSnapshotSchema,
          })
          .strict(),
      ]),
    ),
    legacy_facts: z.array(factSchema),
    sessions: z.array(
      z
        .object({
          carrier: carrierSchema,
          action: z.enum(["preserve", "replace"]),
          delivery_id: z.string().nullable(),
        })
        .strict(),
    ),
    branch_binding: branchSchema,
  })
  .strict();
const resumeIntentSchema = z
  .object({
    reason: reasonSchema,
    archive_review: reasonSchema,
    next_owner_id: z.string().trim().min(1),
    next_action: z.string().trim().min(1),
  })
  .strict();
export const archivedTaskResumeInputSchema = taskConversionInputSchema
  .extend({
    active_ref: z.string().min(1),
    original_task_ref: z.string().min(1),
    resume_intent: resumeIntentSchema,
    sessions: z.array(
      z
        .object({
          carrier: carrierSchema,
          action: z.enum(["preserve", "replace", "retire"]),
          delivery_id: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type ArchivedTaskResumeInput = z.infer<
  typeof archivedTaskResumeInputSchema
>;
export function parseArchivedTaskResumeInput(
  input: unknown,
): ArchivedTaskResumeInput {
  if (
    typeof input !== "object" ||
    input === null ||
    !("resume_intent" in input) ||
    !resumeIntentSchema.safeParse(input.resume_intent).success
  )
    throw new MaintenanceError(
      "resume_intent_required",
      "Explicit reviewed resume intent is required",
    );
  const parsed = archivedTaskResumeInputSchema.safeParse(input);
  if (!parsed.success)
    throw new MaintenanceError(
      "invalid_input",
      "Archived Task resume input does not match the public contract",
    );
  return parsed.data;
}
export const legacyCloseoutInputSchema = z
  .object({
    root: z.string().min(1),
    key: keySchema,
    task_ref: z.string().min(1),
    source_kind: z.enum(["legacy", "schema1"]),
    archive_ref: z.string().min(1),
    history_note: z.string().trim().min(1),
    retirements: z.array(carrierSchema),
  })
  .strict();
export type TaskConversionInput = z.infer<typeof taskConversionInputSchema>;
export type LegacyCloseoutInput = z.infer<typeof legacyCloseoutInputSchema>;
export interface InspectTaskTargetInput {
  root: string;
  key?: MaintenanceTaskKey;
  task_ref: string;
  original_task_ref?: string;
}
const inspectTaskInputSchema = z
  .object({
    root: z.string().min(1),
    key: keySchema.optional(),
    task_ref: z.string().min(1),
    original_task_ref: z.string().min(1).optional(),
  })
  .strict();

export function parseTaskConversionInput(input: unknown): TaskConversionInput {
  const parsed = taskConversionInputSchema.safeParse(input);
  if (!parsed.success)
    throw new MaintenanceError(
      "invalid_input",
      "Task conversion input does not match the public contract",
    );
  return parsed.data;
}
export function parseLegacyCloseoutInput(input: unknown): LegacyCloseoutInput {
  const parsed = legacyCloseoutInputSchema.safeParse(input);
  if (!parsed.success)
    throw new MaintenanceError(
      "invalid_input",
      "Legacy closeout input does not match the public contract",
    );
  return parsed.data;
}

export interface InspectedTaskTarget extends ReturnType<
  typeof inspectBindings
> {
  root: string;
  common_dir: string | null;
  key: MaintenanceTaskKey;
  task_ref: string;
  source: z.infer<typeof rawSnapshotSchema>;
  classification: ReturnType<typeof classifyMaintenanceTask>;
  artifacts: (
    | {
        path: string;
        kind: "file";
        source: z.infer<typeof rawSnapshotSchema> | null;
      }
    | { path: string; kind: "directory"; source: DirectorySnapshot | null }
  )[];
}

interface TreeEntry {
  path: string;
  kind: "file" | "directory";
}
function tree(root: string, ref: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  function walk(current: string): void {
    const full = taskPath(root, current);
    const entry = fs.lstatSync(full);
    const stat =
      current === ref && entry.isSymbolicLink() ? fs.statSync(full) : entry;
    if (!stat.isDirectory())
      throw maintenanceError(`unsupported_source: task directory ${current}`);
    entries.push({ path: current, kind: "directory" });
    for (const name of fs.readdirSync(full).sort()) {
      const child = `${current}/${name}`,
        childPath = taskPath(root, child);
      const info = fs.lstatSync(childPath);
      if (info.isDirectory()) walk(child);
      else if (info.isFile()) entries.push({ path: child, kind: "file" });
      else
        throw maintenanceError(`unsupported_source: task tree entry ${child}`);
    }
  }
  walk(ref);
  return entries;
}
function isActiveRef(ref: string): boolean {
  return (
    /^\.trellis\/tasks\/[^/]+$/.test(ref) && ref !== ".trellis/tasks/archive"
  );
}
function isArchiveRef(ref: string): boolean {
  return /^\.trellis\/tasks\/archive\/[^/]+\/[^/]+$/.test(ref);
}
function inspectTaskTargetDetails(
  input: InspectTaskTargetInput,
  activeRef?: string,
  detachedHistory = false,
): InspectedTaskTarget {
  const parsed = inspectTaskInputSchema.safeParse(input);
  if (!parsed.success)
    throw new MaintenanceError(
      "invalid_input",
      "Task inspection input does not match the public contract",
    );
  input = parsed.data;
  const repo = observeRepository(input.root);
  if (!isActiveRef(input.task_ref) && !isArchiveRef(input.task_ref))
    throw maintenanceError(
      "invalid_task_path: selected Task must be a direct active child or finite archive/month/directory",
    );
  if (
    input.original_task_ref &&
    (!isArchiveRef(input.task_ref) || !isActiveRef(input.original_task_ref))
  )
    throw maintenanceError(
      "invalid_task_path: original_task_ref is an explicitly reviewed direct active path for an archive",
    );
  taskPath(repo.root, input.task_ref);
  const source = readSnapshot(repo.root, `${input.task_ref}/task.json`);
  if (!source)
    throw maintenanceError("unsupported_source: missing selected task.json");
  const record = rawJson(source);
  const classification = classifyMaintenanceTask(record);
  const key = input.key ?? {
    task_id: classification.task_id,
    lifecycle_generation: classification.generation,
  };
  if (
    classification.task_id !== key.task_id ||
    classification.generation !== key.lifecycle_generation
  )
    throw maintenanceError(
      "target_key_mismatch: selected task identity/generation",
    );
  const binding = detachedHistory
    ? {
        carriers: [],
        branch_binding: null,
        inherited_copies: [],
        authority: "local" as const,
      }
    : inspectBindings(
        repo.root,
        key,
        input.task_ref,
        input.original_task_ref,
        activeRef,
      );
  return {
    root: repo.root,
    common_dir: repo.common_dir,
    key,
    task_ref: input.task_ref,
    source,
    classification,
    ...binding,
    artifacts: tree(repo.root, input.task_ref).map((entry) =>
      entry.kind === "file"
        ? {
            ...entry,
            kind: "file" as const,
            source: readSnapshot(repo.root, entry.path),
          }
        : {
            ...entry,
            kind: "directory" as const,
            source: readDirectorySnapshot(repo.root, entry.path),
          },
    ),
  };
}
export function inspectTaskTarget(
  input: InspectTaskTargetInput,
): ReturnType<typeof inspectTaskTargetDetails> {
  return inspectTaskTargetDetails(input);
}
function matchedCarriers(
  actual: InspectedCarrier[],
  supplied: InspectedCarrier[],
): void {
  const identity = (carrier: InspectedCarrier): string =>
    `${carrier.root}:${carrier.path}`;
  if (
    supplied.length !== actual.length ||
    new Set(supplied.map(identity)).size !== supplied.length
  )
    throw maintenanceError(
      "conflict: every selected carrier requires one explicit disposition",
    );
  for (const carrier of supplied) {
    const match = actual.find(
      (item) =>
        identity(item) === identity(carrier) && item.kind === carrier.kind,
    );
    if (!match)
      throw maintenanceError(
        `conflict: carrier is not attributable to selected task: ${identity(carrier)}`,
      );
    expectSnapshot(carrier.root, carrier.path, carrier.source);
  }
}
function assertPredecessor(actual: string, declared: string): void {
  if (actual !== declared || actual === "schema2")
    throw maintenanceError(
      "unsupported_source: source_kind mismatch or current Task",
    );
}
function verifyReferences(
  root: string,
  record: TaskRecordV2,
  actions: MaintenanceAction[],
  facts: TaskConversionInput["legacy_facts"],
  additionalRefs: AuthorityRef[] = [],
  projectedTaskRoot?: string,
): void {
  const refs: (AuthorityRef | null)[] = [
    record.accepted_scope,
    ...facts.map((fact) => fact.reason),
    ...additionalRefs,
  ];
  for (const delivery of record.deliveries) {
    refs.push(delivery.scope_ref.authority, delivery.plan_ref);
    for (const result of Object.values(delivery.results))
      if (result)
        refs.push(
          result.scope_ref.authority,
          result.plan_ref,
          ...result.obligations,
          ...result.evidence,
        );
    if (delivery.publication_result)
      refs.push(
        delivery.publication_result.publication_ref,
        ...delivery.publication_result.evidence,
      );
    if (delivery.delivery_result) {
      refs.push(...delivery.delivery_result.evidence);
      if (delivery.delivery_result.profile === "manual")
        refs.push(delivery.delivery_result.artifact);
      if (delivery.delivery_result.profile === "local_commit")
        verifyHistoricalCommit(root, delivery.delivery_result);
    }
    if (delivery.stop_result)
      refs.push(
        delivery.stop_result.reason,
        delivery.stop_result.scope_decision,
        ...delivery.stop_result.evidence,
      );
  }
  for (const result of record.completion_results)
    refs.push(result.accepted_scope, ...result.evidence);
  for (const result of record.closure_results)
    refs.push(result.source_result, ...result.evidence);
  for (const delivery of record.deliveries) {
    const candidate = delivery.candidate;
    if (!candidate || ["delivered", "stopped"].includes(delivery.phase))
      continue;
    const entries = [...candidate.paths]
      .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
      .map((locator) => {
        if (
          locator === ".git" ||
          locator.startsWith(".git/") ||
          /(?:^|\/)trellis\/sessions(?:\/|$)/.test(locator) ||
          /^\.trellis\/(?:sessions|\.runtime|\.internal|\.delivery-results)(?:\/|$)/.test(
            locator,
          ) ||
          /^\.trellis\/tasks\/(?:archive\/[^/]+\/)?[^/]+\/task\.json$/.test(
            locator,
          )
        )
          throw maintenanceError(
            "conflict: candidate contains lifecycle/private state",
          );
        taskPath(root, locator);
        const prepared = actions.find(
          (action) => action.root === root && action.path === locator,
        );
        if (prepared?.kind === "directory")
          throw maintenanceError("conflict: candidate path is directory");
        const raw = prepared ? prepared.target : readSnapshot(root, locator);
        if (!prepared)
          actions.push({ root, path: locator, source: raw, target: raw });
        return [
          locator,
          raw
            ? candidate.kind === "git"
              ? raw.mode & 0o100
                ? 0o755
                : 0o644
              : raw.mode
            : null,
          raw?.sha256 ?? null,
        ];
      });
    if (candidate.kind === "git") {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)),
      );
      const git = (...args: string[]): string =>
        execFileSync("git", ["-C", root, ...args], {
          env,
          encoding: "utf8",
        }).trim();
      if (
        candidate.head_ref !== null &&
        git("rev-parse", "HEAD") !== candidate.head_ref
      )
        throw maintenanceError("stale_source: active candidate HEAD mismatch");
      if (
        candidate.base_ref !== null &&
        git("rev-parse", "--verify", `${candidate.base_ref}^{commit}`) !==
          candidate.base_ref
      )
        throw maintenanceError("stale_source: active candidate base mismatch");
    }
    if (
      `sha256:${createHash("sha256").update(JSON.stringify(entries)).digest("hex")}` !==
      candidate.content_ref
    )
      throw maintenanceError(
        "stale_source: prospective active candidate content mismatch",
      );
  }
  for (const originalRef of refs) {
    const ref =
      originalRef && projectedTaskRoot
        ? {
            ...originalRef,
            locator: authorityLocator(originalRef, {
              task_id: record.id,
              task_root: projectedTaskRoot,
              artifact_origin: record.artifact_origin ?? null,
            }),
          }
        : originalRef;
    if (!ref || /^[a-z][a-z0-9+.-]*:\/\//i.test(ref.locator)) continue;
    const prepared = actions.find(
      (action) =>
        action.root === root &&
        action.path === ref.locator &&
        action.kind !== "directory",
    );
    if (
      prepared &&
      prepared.kind !== "directory" &&
      prepared.target &&
      /^sha256:/.test(ref.revision)
    ) {
      if (`sha256:${prepared.target.sha256}` !== ref.revision)
        throw maintenanceError(
          `stale_source: prospective authority ${ref.locator}`,
        );
    } else {
      verifyAuthority(root, ref);
      if (/^sha256:/.test(ref.revision) && !prepared) {
        const source = readSnapshot(root, ref.locator);
        actions.push({ root, path: ref.locator, source, target: source });
      }
    }
  }
}
export function prepareTaskConversion(
  rawInput: TaskConversionInput,
): PreparedMaintenancePlan {
  const input = parseTaskConversionInput(rawInput);
  if (!isActiveRef(input.task_ref))
    throw maintenanceError(
      "invalid_task_path: conversion requires a direct active Task; use task_resume for a legacy archive",
    );
  return prepareSelectedTask(input);
}
export function prepareArchivedTaskResume(
  rawInput: ArchivedTaskResumeInput,
): PreparedMaintenancePlan {
  const input = parseArchivedTaskResumeInput(rawInput);
  if (
    !isArchiveRef(input.task_ref) ||
    !isActiveRef(input.active_ref) ||
    !isActiveRef(input.original_task_ref)
  )
    throw maintenanceError(
      "invalid_task_path: resume requires exact archive, original active and destination active paths",
    );
  if (fs.existsSync(taskPath(input.root, input.active_ref)))
    throw maintenanceError(
      "conflict: active destination already exists; recover the original operation",
    );
  if (fs.existsSync(taskPath(input.root, input.original_task_ref)))
    throw maintenanceError(
      "conflict: original active path is occupied; its path carriers cannot be attributed to the archive",
    );
  return prepareSelectedTask(input, input);
}
function prepareSelectedTask(
  input:
    | TaskConversionInput
    | ArchivedTaskResumeInput
    | FormalArchiveReactivationInput,
  resume?: ArchivedTaskResumeInput | FormalArchiveReactivationInput,
  formal?: FormalArchiveReactivationInput,
): PreparedMaintenancePlan {
  const inspected = inspectTaskTargetDetails(
    {
      root: input.root,
      key: input.key,
      task_ref: input.task_ref,
      ...(resume ? { original_task_ref: resume.original_task_ref } : {}),
    },
    resume?.active_ref,
    Boolean(formal),
  );
  const root = inspected.root,
    repo = observeRepository(root);
  assertPredecessor(
    inspected.classification.kind,
    "source_kind" in input
      ? input.source_kind
      : classifyFormalArchivePredecessor(rawJson(inspected.source)).kind,
  );
  const projection = formal
    ? validateFormalArchiveReactivationProjection(
        rawJson(inspected.source),
        input.projection,
        input.legacy_facts,
      )
    : resume && "resume_intent" in resume
      ? validateArchivedTaskResumeProjection(
          rawJson(inspected.source),
          input.projection,
          input.legacy_facts,
          resume.resume_intent,
        )
      : validateSelectedTaskProjection(
          rawJson(inspected.source),
          input.projection,
          input.legacy_facts,
        );
  const targetRef = resume?.active_ref ?? input.task_ref;
  const destination = (ref: string): string =>
    targetRef + ref.slice(input.task_ref.length);
  const actions: MaintenanceAction[] = resume
    ? inspected.artifacts.map(
        (entry) =>
          ({
            ...(entry.kind === "directory"
              ? { kind: "directory" as const }
              : {}),
            root,
            path: entry.path,
            source: entry.source,
            target: entry.source,
          }) as MaintenanceAction,
      )
    : [];
  const rootPrefix = `${input.task_ref}/`;
  const existingFiles = inspected.artifacts
    .filter((entry) => entry.kind === "file")
    .map((entry) => entry.path);
  const seen = new Set<string>();
  for (const artifact of input.artifacts) {
    if (
      !artifact.path.startsWith(rootPrefix) ||
      artifact.path === `${input.task_ref}/task.json` ||
      seen.has(artifact.path)
    )
      throw maintenanceError(
        `conflict: invalid/duplicate artifact ${artifact.path}`,
      );
    taskPath(root, artifact.path);
    seen.add(artifact.path);
    expectSnapshot(root, artifact.path, artifact.source);
    if (
      artifact.action === "write" &&
      !artifact.path.startsWith(`${input.task_ref}/deliveries/`)
    )
      throw maintenanceError(
        `conflict: original root artifacts must be preserved: ${artifact.path}`,
      );
    actions.push({
      root,
      path: destination(artifact.path),
      source: resume ? null : artifact.source,
      target: artifact.action === "write" ? artifact.target : artifact.source,
    });
  }
  for (const file of existingFiles)
    if (file !== `${input.task_ref}/task.json` && !seen.has(file))
      throw maintenanceError(`conflict: missing artifact disposition ${file}`);
  for (const delivery of projection.deliveries)
    for (const name of [
      "prd.md",
      "design.md",
      "implement.md",
      "implement.jsonl",
      "check.jsonl",
    ])
      if (
        !actions.find(
          (action) =>
            action.path === `${targetRef}/${delivery.planning_root}/${name}`,
        )?.target
      )
        throw maintenanceError(
          `conflict: missing Delivery planning artifact ${delivery.id}/${name}`,
        );
  const retained = `${targetRef}/migration/source-task.json`;
  if (seen.has(retained) || readSnapshot(root, retained))
    throw maintenanceError(
      "conflict: source snapshot already exists; recover the original operation",
    );
  actions.push({
    root,
    path: retained,
    source: null,
    target: inspected.source,
  });
  actions.push({
    root,
    path: `${targetRef}/task.json`,
    source: resume ? null : inspected.source,
    target: snapshot(
      JSON.stringify(projection, null, 2) + "\n",
      inspected.source.mode,
    ),
  });
  matchedCarriers(
    inspected.carriers,
    ("sessions" in input ? input.sessions : []).map(
      (session) => session.carrier,
    ),
  );
  for (const session of "sessions" in input ? input.sessions : []) {
    if (session.action === "retire") {
      if (!resume || session.delivery_id !== null)
        throw maintenanceError("conflict: retirement cannot select a Delivery");
      actions.push({
        root: session.carrier.root,
        path: session.carrier.path,
        source: session.carrier.source,
        target: null,
      });
      continue;
    }
    if (session.action === "preserve") {
      if (session.delivery_id !== null)
        throw maintenanceError(
          "conflict: preserved session cannot change Delivery selection",
        );
      actions.push({
        root: session.carrier.root,
        path: session.carrier.path,
        source: session.carrier.source,
        target: session.carrier.source,
      });
      continue;
    }
    if (
      session.delivery_id !== null &&
      !projection.deliveries.some(
        (delivery) =>
          delivery.id === session.delivery_id &&
          delivery.lifecycle_generation === input.key.lifecycle_generation &&
          !["delivered", "stopped"].includes(delivery.phase),
      )
    )
      throw maintenanceError(
        "conflict: session Delivery is not a current eligible Delivery",
      );
    const targetRoot = repo.common_dir ?? session.carrier.root;
    const targetPath = repo.common_dir
      ? `trellis/sessions/${path.posix.basename(session.carrier.path)}`
      : session.carrier.path;
    const targetSource = readSnapshot(targetRoot, targetPath);
    if (
      targetRoot !== session.carrier.root &&
      targetSource &&
      !inspected.carriers.some(
        (carrier) => carrier.root === targetRoot && carrier.path === targetPath,
      )
    )
      throw maintenanceError(
        "conflict: common session name belongs to another Task",
      );
    actions.push({
      root: targetRoot,
      path: targetPath,
      source: targetSource,
      target: snapshot(
        JSON.stringify(
          { schema_version: 3, ...input.key, delivery_id: session.delivery_id },
          null,
          2,
        ) + "\n",
        targetSource?.mode ?? session.carrier.source.mode,
      ),
    });
    if (targetRoot !== session.carrier.root)
      actions.push({
        root: session.carrier.root,
        path: session.carrier.path,
        source: session.carrier.source,
        target: null,
      });
  }
  if (resume && "resume_intent" in resume) {
    actions.push({
      root,
      path: `${targetRef}/migration/archive-resume.json`,
      source: null,
      target: snapshot(
        JSON.stringify(
          {
            archive_ref: input.task_ref,
            original_task_ref: resume.original_task_ref,
            key: input.key,
            resume_intent: resume.resume_intent,
          },
          null,
          2,
        ) + "\n",
      ),
    });
  }
  const binding = inspected.branch_binding;
  if ("branch_binding" in input) {
    if (input.branch_binding.action === "preserve") {
      if (!binding && repo.common_dir)
        throw maintenanceError(
          "ambiguous_authority: explicit original-owner branch binding establishment required",
        );
      if (binding) {
        expectSnapshot(binding.root, binding.path, input.branch_binding.source);
        actions.push({
          root: binding.root,
          path: binding.path,
          source: binding.source,
          target: binding.source,
        });
      } else if (input.branch_binding.source !== null)
        throw maintenanceError("target_key_mismatch: no Git binding exists");
    } else {
      if (
        !repo.common_dir ||
        binding ||
        input.branch_binding.record.branch_name !== repo.branch
      )
        throw maintenanceError(
          "ambiguous_authority: establish requires absent binding and actual target branch",
        );
      const classified = classifyBranchBinding(input.branch_binding.record, {
        task_id: input.key.task_id,
        generation: input.key.lifecycle_generation,
      });
      if (!classified.matches)
        throw maintenanceError("target_key_mismatch: proposed branch binding");
      actions.push({
        root: repo.common_dir,
        path: `trellis/task-branches/${input.key.task_id}/${input.key.lifecycle_generation}.json`,
        source: null,
        target: snapshot(
          JSON.stringify(input.branch_binding.record, null, 2) + "\n",
        ),
      });
    }
  }
  verifyReferences(
    root,
    projection,
    actions,
    input.legacy_facts,
    formal
      ? formal.archive.evidence
      : resume && "resume_intent" in resume
        ? [resume.resume_intent.reason, resume.resume_intent.archive_review]
        : [],
    formal ? targetRef : undefined,
  );
  if (formal)
    actions.push({
      root,
      path: `${targetRef}/migration/formal-archive-reactivation.json`,
      source: null,
      target: snapshot(
        JSON.stringify(
          {
            key: formal.key,
            archive_ref: formal.task_ref,
            archive_commit: formal.archive.commit,
            original_task_ref: formal.original_task_ref,
          },
          null,
          2,
        ) + "\n",
      ),
    });
  // Freeze parent-directory preimages, including existing empty directory modes.
  const directories = new Set(
    inspected.artifacts
      .filter((entry) => entry.kind === "directory")
      .map((entry) => destination(entry.path)),
  );
  for (const action of actions)
    if (action.root === root && action.path.startsWith(`${targetRef}/`)) {
      let parent = path.posix.dirname(action.path);
      while (parent === targetRef || parent.startsWith(`${targetRef}/`)) {
        directories.add(parent);
        if (parent === targetRef) break;
        parent = path.posix.dirname(parent);
      }
    }
  const dirActions: MaintenanceAction[] = [...directories]
    .sort((a, b) => a.split("/").length - b.split("/").length)
    .map((ref) => ({
      kind: "directory",
      root,
      path: ref,
      source: readDirectorySnapshot(root, ref),
      target: resume
        ? (readDirectorySnapshot(
            root,
            input.task_ref + ref.slice(targetRef.length),
          ) ?? { mode: 0o755 })
        : (readDirectorySnapshot(root, ref) ?? { mode: 0o755 }),
    }));
  const common = {
    target_root: root,
    common_dir: repo.common_dir,
    actions: [...dirActions, ...uniqueActions(actions)],
  };
  const guard = {
    task_id: input.key.task_id,
    generation: input.key.lifecycle_generation,
    task_ref: targetRef,
  };
  if (formal)
    return preparePlan({
      ...common,
      kind: "formal_archive_reactivation",
      guard: {
        ...guard,
        output_generation: projection.lifecycle_generation,
        archive_commit: formal.archive.commit,
        target_ref: formal.archive.target_ref,
        target_head: formal.archive.target_head,
        archive_ref: formal.task_ref,
        original_task_ref: formal.original_task_ref,
      },
    });
  return preparePlan({
    ...common,
    kind: resume ? "task_resume" : "task_conversion",
    guard: {
      ...guard,
      ...(resume
        ? {
            archive_ref: input.task_ref,
            original_task_ref: resume.original_task_ref,
          }
        : {}),
    },
  });
}
function uniqueActions(actions: MaintenanceAction[]): MaintenanceAction[] {
  const found = new Map<string, MaintenanceAction>();
  for (const action of actions) {
    const key = `${action.root}:${action.path}`,
      previous = found.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(action))
      throw maintenanceError(`conflict: inconsistent session mapping ${key}`);
    found.set(key, action);
  }
  return [...found.values()];
}
export function prepareLegacyCloseout(
  rawInput: LegacyCloseoutInput,
): PreparedMaintenancePlan {
  const input = parseLegacyCloseoutInput(rawInput);
  if (!isActiveRef(input.task_ref))
    throw maintenanceError(
      "invalid_task_path: historical closeout requires a direct active Task",
    );
  const inspected = inspectTaskTarget({
    root: input.root,
    key: input.key,
    task_ref: input.task_ref,
  });
  const root = inspected.root;
  assertPredecessor(inspected.classification.kind, input.source_kind);
  if (inspected.inherited_copies.length && inspected.authority !== "bound")
    throw maintenanceError(
      "ambiguous_authority: inherited copies require original branch binding",
    );
  if (!/^\.trellis\/tasks\/archive\/[^/]+\/[^/]+$/.test(input.archive_ref))
    throw maintenanceError(
      "invalid_task_path: fixed archive destination required",
    );
  const destination = taskPath(root, input.archive_ref);
  if (fs.existsSync(destination))
    throw maintenanceError(
      "conflict: archive already exists; recover original operation",
    );
  const expected = [
    ...inspected.carriers,
    ...(inspected.branch_binding ? [inspected.branch_binding] : []),
  ];
  matchedCarriers(expected, input.retirements);
  const entries = tree(root, input.task_ref),
    actions: MaintenanceAction[] = [];
  for (const parent of [
    ".trellis/tasks/archive",
    path.posix.dirname(input.archive_ref),
  ]) {
    const source = readDirectorySnapshot(root, parent);
    actions.push({
      kind: "directory",
      root,
      path: parent,
      source,
      target: source ?? { mode: 0o755 },
    });
  }
  for (const entry of entries) {
    const archived =
      input.archive_ref + entry.path.slice(input.task_ref.length);
    if (entry.kind === "directory")
      actions.push({
        kind: "directory",
        root,
        path: archived,
        source: null,
        target: {
          mode: (readDirectorySnapshot(root, entry.path) as DirectorySnapshot)
            .mode,
        },
      });
    else
      actions.push({
        root,
        path: archived,
        source: null,
        target: readSnapshot(root, entry.path),
      });
  }
  const note = `${input.archive_ref}/maintenance-history.md`;
  if (actions.some((action) => action.path === note))
    throw maintenanceError(
      "conflict: original tree already contains history note path",
    );
  actions.push({
    root,
    path: note,
    source: null,
    target: snapshot(input.history_note + "\n"),
  });
  for (const carrier of input.retirements)
    actions.push({
      root: carrier.root,
      path: carrier.path,
      source: carrier.source,
      target: null,
    });
  for (const entry of [...entries].reverse()) {
    if (entry.kind === "directory")
      actions.push({
        kind: "directory",
        root,
        path: entry.path,
        source: readDirectorySnapshot(root, entry.path),
        target: null,
      });
    else
      actions.push({
        root,
        path: entry.path,
        source: readSnapshot(root, entry.path),
        target: null,
      });
  }
  return preparePlan({
    kind: "legacy_closeout",
    target_root: root,
    common_dir: inspected.common_dir,
    actions,
    guard: {
      task_id: input.key.task_id,
      generation: input.key.lifecycle_generation,
      task_ref: input.task_ref,
      archive_ref: input.archive_ref,
    },
  });
}

const archiveFactsSchema = z
  .object({
    commit: z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/),
    target_ref: z.string().min(1),
    target_head: z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/),
    evidence: z.array(reasonSchema).min(1),
  })
  .strict();
const formalInspectionSchema = z
  .object({
    root: z.string().min(1),
    key: keySchema,
    task_ref: z.string().min(1),
    original_task_ref: z.string().min(1),
    archive: archiveFactsSchema,
  })
  .strict();
export const formalArchiveReactivationInputSchema = formalInspectionSchema
  .extend({
    active_ref: z.string().min(1),
    projection: taskConversionInputSchema.shape.projection,
    artifacts: taskConversionInputSchema.shape.artifacts,
    legacy_facts: taskConversionInputSchema.shape.legacy_facts,
  })
  .strict();
export type FormalArchiveReactivationInput = z.infer<
  typeof formalArchiveReactivationInputSchema
>;
export type InspectFormalArchiveReactivationInput = z.infer<
  typeof formalInspectionSchema
>;
export interface FormalArchiveSuccessor {
  key: MaintenanceTaskKey;
  task_ref: string;
}
export interface FormalArchiveReactivationInspection {
  key: MaintenanceTaskKey;
  task_ref: string;
  successor:
    | { kind: "absent" }
    | { kind: "verified"; task: FormalArchiveSuccessor }
    | { kind: "conflicting"; task_refs: string[] };
}
export function parseFormalArchiveReactivationInput(
  input: unknown,
): FormalArchiveReactivationInput {
  const parsed = formalArchiveReactivationInputSchema.safeParse(input);
  if (!parsed.success)
    throw new MaintenanceError(
      "invalid_input",
      "Formal archive input does not match the public contract",
    );
  return parsed.data;
}
function formalGit(root: string, ...args: string[]): Buffer {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)),
  );
  try {
    return execFileSync("git", ["-C", root, ...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new MaintenanceError(
      "invalid_git_fact",
      `Cannot verify archive Git fact: ${args[0]}`,
    );
  }
}
function verifyFormalArchive(
  input: InspectFormalArchiveReactivationInput,
): InspectedTaskTarget {
  if (
    !isArchiveRef(input.task_ref) ||
    !/^\.trellis\/tasks\/archive\/\d{4}-\d{2}\/[^/]+$/.test(input.task_ref) ||
    !isActiveRef(input.original_task_ref)
  )
    throw new MaintenanceError(
      "invalid_task_path",
      "Formal reactivation requires a monthly archive and explicit original active path",
    );
  const repo = observeRepository(input.root);
  if (!repo.common_dir)
    throw new MaintenanceError(
      "invalid_git_fact",
      "Formal archive requires exact Git history",
    );
  const observed = inspectTaskTargetDetails(
    {
      root: repo.root,
      key: input.key,
      task_ref: input.task_ref,
      original_task_ref: input.original_task_ref,
    },
    undefined,
    true,
  );
  const source = rawJson(observed.source) as Record<string, unknown>;
  classifyFormalArchivePredecessor(source);
  const commit = input.archive.commit;
  for (const oid of [commit, input.archive.target_head]) {
    if (
      formalGit(repo.root, "rev-parse", "--verify", `${oid}^{commit}`)
        .toString()
        .trim() !== oid
    )
      throw new MaintenanceError(
        "invalid_git_fact",
        "Archive facts require exact complete commit OIDs",
      );
    formalGit(
      repo.root,
      "merge-base",
      "--is-ancestor",
      oid,
      input.archive.target_ref,
    );
  }
  if (
    formalGit(repo.root, "ls-tree", commit, "--", input.original_task_ref)
      .length
  )
    throw new MaintenanceError(
      "original_active_present",
      "Archive commit still contains the original active Task path",
    );
  const committed = formalGit(
    repo.root,
    "ls-tree",
    "-r",
    "-z",
    commit,
    "--",
    input.task_ref,
  )
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const files = observed.artifacts.filter((entry) => entry.kind === "file");
  if (committed.length !== files.length)
    throw new MaintenanceError(
      "stale_source",
      "Archive file set differs from its selected commit",
    );
  for (const entry of committed) {
    const match = /^(100644|100755) blob [a-f0-9]+\t([\s\S]+)$/.exec(entry);
    if (!match)
      throw new MaintenanceError(
        "unsupported_source",
        "Archive history must contain regular files",
      );
    const actual = files.find((file) => file.path === match[2]);
    if (
      !actual?.source ||
      actual.kind !== "file" ||
      (actual.source.mode & 0o100 ? "100755" : "100644") !== match[1] ||
      snapshot(formalGit(repo.root, "show", `${commit}:${match[2]}`)).sha256 !==
        actual.source.sha256
    )
      throw new MaintenanceError(
        "stale_source",
        `Archive differs from its selected commit: ${match[2]}`,
      );
  }
  if (
    input.archive.evidence.some((ref) =>
      /^[a-z][a-z0-9+.-]*:\/\//i.test(ref.locator),
    )
  )
    throw new MaintenanceError(
      "invalid_input",
      "Archive facts require repository-file evidence",
    );
  for (const ref of input.archive.evidence) verifyAuthority(repo.root, ref);
  return observed;
}
function successorAt(
  root: string,
  ref: string,
  input: InspectFormalArchiveReactivationInput,
  old: Pick<InspectedTaskTarget, "source">,
): FormalArchiveSuccessor {
  const raw = readSnapshot(root, `${ref}/task.json`);
  if (!raw)
    throw new MaintenanceError(
      "successor_mismatch",
      `Missing successor record: ${ref}`,
    );
  const record = parseTaskRecordV2(rawJson(raw));
  validateFormalArchiveSuccessorSource(rawJson(old.source), record.source);
  const provenance = readSnapshot(
    root,
    `${ref}/migration/formal-archive-reactivation.json`,
  );
  const retained = readSnapshot(root, `${ref}/migration/source-task.json`);
  const expected = {
    key: input.key,
    archive_ref: input.task_ref,
    archive_commit: input.archive.commit,
    original_task_ref: input.original_task_ref,
  };
  if (
    !provenance ||
    !isDeepStrictEqual(rawJson(provenance), expected) ||
    retained?.sha256 !== old.source.sha256 ||
    record.id !== input.key.task_id ||
    record.lifecycle_generation <= input.key.lifecycle_generation
  )
    throw new MaintenanceError(
      "successor_mismatch",
      `Successor provenance does not match selected predecessor: ${ref}`,
    );
  // Ordinary reopen retains the actual matching Completion for each completed
  // intermediate generation. The initial predecessor has no v2 Completion.
  for (
    let generation = input.key.lifecycle_generation + 1;
    generation < record.lifecycle_generation;
    generation++
  ) {
    const completions = record.completion_results.filter(
      (result) => result.lifecycle_generation === generation,
    );
    if (!completions.length)
      throw new MaintenanceError(
        "successor_mismatch",
        `Missing intermediate Completion for generation ${generation}: ${ref}`,
      );
    for (const completion of completions) {
      verifyAuthority(root, completion.accepted_scope, {
        task_id: record.id,
        task_root: ref,
        artifact_origin: record.artifact_origin ?? null,
      });
      if (
        completion.delivery_result_ids.some(
          (id) =>
            !record.deliveries.some(
              (delivery) =>
                delivery.lifecycle_generation === generation &&
                delivery.delivery_result?.result_id === id,
            ),
        )
      )
        throw new MaintenanceError(
          "successor_mismatch",
          `Intermediate Completion history mismatch: ${ref}`,
        );
    }
  }
  return {
    key: {
      task_id: record.id,
      lifecycle_generation: record.lifecycle_generation,
    },
    task_ref: ref,
  };
}
export function inspectFormalArchiveReactivation(
  rawInput: InspectFormalArchiveReactivationInput,
): FormalArchiveReactivationInspection {
  const parsed = formalInspectionSchema.safeParse(rawInput);
  if (!parsed.success)
    throw new MaintenanceError(
      "invalid_input",
      "Formal archive inspection input does not match the public contract",
    );
  const input = parsed.data;
  const old = verifyFormalArchive(input);
  const candidates: string[] = [];
  for (const ref of publicTaskRoots(old.root)) {
    const raw = readSnapshot(old.root, `${ref}/task.json`);
    if (!raw) continue;
    const value = rawJson(raw) as Record<string, unknown>;
    if (
      typeof value.id === "string" &&
      value.id.toLowerCase() === input.key.task_id.toLowerCase() &&
      (!isArchiveRef(ref) || value.schema_version === "2.0")
    )
      candidates.push(ref);
  }
  if (candidates.length > 1)
    return {
      key: input.key,
      task_ref: input.task_ref,
      successor: { kind: "conflicting", task_refs: candidates },
    };
  const successor = candidates.length
    ? successorAt(old.root, candidates[0], input, old)
    : null;
  for (const workspace of observeRepository(old.root).worktrees) {
    if (workspace === old.root) continue;
    for (const ref of publicTaskRoots(workspace)) {
      const raw = readSnapshot(workspace, `${ref}/task.json`);
      if (!raw) continue;
      const value = rawJson(raw) as Record<string, unknown>;
      if (
        value.id !== input.key.task_id ||
        value.schema_version !== "2.0" ||
        classifyMaintenanceTask(value).generation <=
          input.key.lifecycle_generation
      )
        continue;
      // The result describes this root, not an environment owner. A verified
      // sibling can retain an earlier snapshot after normal scope/reopen work.
      if (
        successor &&
        successorAt(workspace, ref, input, old).key.lifecycle_generation <=
          successor.key.lifecycle_generation
      )
        continue;
      throw new MaintenanceError(
        "ambiguous_authority",
        `Accessible successor belongs to registered sibling checkout: ${workspace}:${ref}`,
      );
    }
  }
  if (!successor) {
    if (fs.existsSync(taskPath(old.root, input.original_task_ref)))
      throw new MaintenanceError(
        "original_active_present",
        "Original active path is occupied",
      );
    return {
      key: input.key,
      task_ref: input.task_ref,
      successor: { kind: "absent" },
    };
  }
  return {
    key: input.key,
    task_ref: input.task_ref,
    successor: {
      kind: "verified",
      task: successor,
    },
  };
}
export function prepareFormalArchiveReactivation(
  rawInput: FormalArchiveReactivationInput,
): PreparedMaintenancePlan {
  const input = parseFormalArchiveReactivationInput(rawInput);
  if (!isActiveRef(input.active_ref))
    throw new MaintenanceError(
      "invalid_task_path",
      "New Task must be a direct active destination",
    );
  const {
    projection: _projection,
    artifacts: _artifacts,
    legacy_facts: _facts,
    active_ref: _active,
    ...inspectionInput
  } = input;
  const inspection = inspectFormalArchiveReactivation(inspectionInput);
  if (inspection.successor.kind !== "absent")
    throw new MaintenanceError(
      "conflict",
      "Selected predecessor already has a successor; inspect or recover it",
    );
  if (fs.existsSync(taskPath(input.root, input.active_ref)))
    throw new MaintenanceError("conflict", "Active destination is occupied");
  if (
    formalGit(
      input.root,
      "rev-parse",
      "--verify",
      `${input.archive.target_ref}^{commit}`,
    )
      .toString()
      .trim() !== input.archive.target_head
  )
    throw new MaintenanceError(
      "stale_source",
      "Observed target head changed before preparation",
    );
  return prepareSelectedTask(input, input, input);
}

/** Receipt recovery verifies public successor history, but returns the original key. */
export function validateAppliedFormalArchive(
  plan: Extract<
    PreparedMaintenancePlan,
    { kind: "formal_archive_reactivation" }
  >,
): void {
  const source = readSnapshot(
    plan.target_root,
    `${plan.guard.archive_ref}/task.json`,
  );
  if (!source)
    throw new MaintenanceError("stale_source", "Original archive disappeared");
  const input = {
    root: plan.target_root,
    key: {
      task_id: plan.guard.task_id,
      lifecycle_generation: plan.guard.generation,
    },
    task_ref: plan.guard.archive_ref,
    original_task_ref: plan.guard.original_task_ref,
    archive: {
      commit: plan.guard.archive_commit,
      target_ref: plan.guard.target_ref,
      target_head: plan.guard.target_head,
      evidence: [],
    },
  };
  const refs = publicTaskRoots(plan.target_root).filter((ref) => {
    const raw = readSnapshot(plan.target_root, `${ref}/task.json`);
    if (!raw) return false;
    const record = rawJson(raw) as Record<string, unknown>;
    return record.id === plan.guard.task_id && record.schema_version === "2.0";
  });
  if (refs.length !== 1)
    throw new MaintenanceError(
      "later_work_conflict",
      "Original conversion must have one accessible public successor",
    );
  successorAt(plan.target_root, refs[0], input, { source });
}

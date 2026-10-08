import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  serializeTaskRecord,
  taskRecordSchema,
  isKnownLegacyTaskRecord,
  validateLegacyTaskProjection,
} from "@mindfoldhq/trellis-core/task";
import { VERSION } from "../constants/version.js";
import { collectTemplateFiles } from "./update.js";
import { computeHash, loadHashes } from "../utils/template-hash.js";
import { assertProjectPath } from "../utils/path-boundary.js";
import { writeFileAtomic } from "../utils/atomic-write.js";
import { compareVersions } from "../utils/compare-versions.js";
import {
  getConfiguredPlatforms,
  collectPlatformTemplates,
} from "../configurators/index.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const planSchema = z
  .object({
    schema_version: z.literal("1.0"),
    target_version: z.string(),
    tasks: z.array(
      z
        .object({
          task_ref: z.string().regex(/^\.trellis\/tasks\/[^/]+$/),
          expected_sha256: hash,
          record: z.unknown(),
          retired_fields: z.array(z.string()).optional(),
        })
        .strict(),
    ),
    deferred_tasks: z
      .array(
        z
          .object({
            task_ref: z.string().regex(/^\.trellis\/tasks\/[^/]+$/),
            expected_sha256: hash,
          })
          .strict(),
      )
      .optional()
      .default([]),
    current_tasks: z
      .array(
        z
          .object({
            task_ref: z.string().regex(/^\.trellis\/tasks\/[^/]+$/),
            expected_sha256: hash,
          })
          .strict(),
      )
      .optional()
      .default([]),
    file_decisions: z.array(
      z
        .object({
          path: z.string(),
          action: z.enum(["replace", "preserve", "remove"]),
          expected_sha256: hash.nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export interface MigrateOptions {
  from: string;
  plan: string;
  dryRun?: boolean;
}
export interface MigrationAction {
  path: string;
  action: "write" | "remove" | "preserve";
  before_sha256: string | null;
  after_sha256: string | null;
  before_mode: number | null;
  after_mode: number | null;
}
export interface MigrationResult {
  status: "preview" | "migrated";
  source_version: string;
  target_version: string;
  actions: MigrationAction[];
  conflicts: string[];
}
interface PendingAction {
  facts: MigrationAction;
  content?: string;
}

// 0.6.16 source ad332e3fe5a19d7274cb03e7c2f3e2128f8de291 shipped
// this reference at these exact roots. It has no current template consumer.
// This is a bounded retirement profile, not ownership of a platform directory.
const LEGACY_0616_RETIRED_PLATFORM_PATHS = new Set([
  ".agents/skills/trellis-meta/references/local-architecture/workspace-memory.md",
  ".claude/skills/trellis-meta/references/local-architecture/workspace-memory.md",
  ".cursor/skills/trellis-meta/references/local-architecture/workspace-memory.md",
]);

/** Raw-byte identity for backup and same-plan resume; template receipts use their own normalized hash. */
function digest(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function filePath(cwd: string, name: string): string {
  if (
    path.isAbsolute(name) ||
    name.split("/").some((part) => !part || part === "." || part === "..") ||
    name.includes("\\")
  ) {
    throw new Error(`Invalid migration path ${name}`);
  }
  const result = path.join(cwd, name);
  assertProjectPath(result, cwd);
  return result;
}

function describe(
  cwd: string,
  name: string,
  action: MigrationAction["action"],
  content?: string,
): PendingAction {
  const full = filePath(cwd, name);
  const stat = fs.lstatSync(full, { throwIfNoEntry: false });
  if (stat && !stat.isFile())
    throw new Error(`Reconcile non-file migration target ${name}`);
  const before = stat ? digest(fs.readFileSync(full)) : null;
  const beforeMode = stat ? stat.mode & 0o777 : null;
  let after = before;
  let afterMode = beforeMode;
  if (action === "write") {
    if (content === undefined)
      throw new Error(`Missing target content ${name}`);
    after = digest(content);
    afterMode = beforeMode ?? 0o644;
    if (name.endsWith(".py") || name.endsWith(".sh")) afterMode = 0o755;
  } else if (action === "remove") {
    after = null;
    afterMode = null;
  }
  return {
    facts: {
      path: name,
      action,
      before_sha256: before,
      after_sha256: after,
      before_mode: beforeMode,
      after_mode: afterMode,
    },
    content,
  };
}

/** Retire only receipt-owned core namespaces, never Guru or historical data. */
function ownsRetiredCorePath(
  name: string,
  platformPaths: Set<string>,
): boolean {
  if (
    name.startsWith(".trellis/scripts/") ||
    name.startsWith(".trellis/agents/")
  )
    return true;
  return (
    platformPaths.has(name) || LEGACY_0616_RETIRED_PLATFORM_PATHS.has(name)
  );
}

/**
 * Explicit one-way migration. Backup/recovery/rollback are the caller's owner;
 * this executor returns the exact write set and accepts old/target bytes on resume.
 */
export async function migrate(
  options: MigrateOptions,
): Promise<MigrationResult> {
  const cwd = process.cwd();
  if (
    !/^(?:0\.6\.(?:0|[1-9]\d*)|0\.7\.0-castbox\.[1-9]\d*)$/.test(
      options.from,
    ) ||
    compareVersions(options.from, VERSION) >= 0
  )
    throw new Error(
      `Unsupported migration source ${options.from}; expected a 0.6.x or 0.7.0-castbox predecessor of ${VERSION}`,
    );
  const installed = fs
    .readFileSync(filePath(cwd, ".trellis/.version"), "utf8")
    .trim();
  if (installed !== options.from && installed !== VERSION)
    throw new Error(`Unsupported installed migration version ${installed}`);
  const plan = planSchema.parse(
    JSON.parse(fs.readFileSync(options.plan, "utf8")) as unknown,
  );
  if (plan.target_version !== VERSION)
    throw new Error(`Migration plan target must be ${VERSION}`);
  const hashes = loadHashes(cwd);
  const templates = await collectTemplateFiles(cwd, { registrySpecs: false });
  // These paths belong to the caller's workflow/configuration owners. Their
  // exact bytes survive core migration; current Guru installation follows.
  for (const name of [
    ".trellis/workflow.md",
    ".trellis/config.yaml",
    ".trellis/.gitignore",
  ])
    templates.delete(name);
  const decisions = new Map(
    plan.file_decisions.map((item) => [item.path, item]),
  );
  if (decisions.size !== plan.file_decisions.length)
    throw new Error("Duplicate file decision");
  const conflicts: string[] = [];
  const pending: PendingAction[] = [];
  let completedHashes = { ...hashes };
  const platformPaths = new Set<string>();
  for (const platform of getConfiguredPlatforms(cwd)) {
    for (const name of collectPlatformTemplates(platform)?.keys() ?? [])
      platformPaths.add(name);
  }
  for (const [name, content] of templates) {
    const candidate = describe(cwd, name, "write", content);
    const decision = decisions.get(name);
    const full = filePath(cwd, name);
    const currentContent =
      candidate.facts.before_sha256 === null
        ? null
        : fs.readFileSync(full, "utf8");
    const equal =
      candidate.facts.before_sha256 === candidate.facts.after_sha256;
    const managed =
      currentContent !== null && hashes[name] === computeHash(currentContent);
    if (decision?.action === "remove")
      throw new Error(`Current template cannot be retired: ${name}`);
    if (
      decision &&
      !equal &&
      decision.expected_sha256 !== candidate.facts.before_sha256
    )
      throw new Error(`Stale file decision ${name}`);
    if (decision?.action === "preserve") {
      pending.push(describe(cwd, name, "preserve"));
    } else if (
      equal ||
      managed ||
      currentContent === null ||
      decision?.action === "replace"
    ) {
      pending.push(candidate);
      completedHashes[name] = computeHash(content);
    } else {
      pending.push(describe(cwd, name, "preserve"));
      conflicts.push(name);
    }
  }
  // Explicit remove decisions may only retire exact receipt-owned core bytes.
  for (const decision of plan.file_decisions) {
    if (templates.has(decision.path)) continue;
    if (decision.action === "preserve") {
      const item = describe(cwd, decision.path, "preserve");
      if (item.facts.before_sha256 !== decision.expected_sha256)
        throw new Error(`Stale file decision ${decision.path}`);
      pending.push(item);
      continue;
    }
    if (
      decision.action !== "remove" ||
      !ownsRetiredCorePath(decision.path, platformPaths)
    ) {
      throw new Error(`No core retirement ownership for ${decision.path}`);
    }
    const item = describe(cwd, decision.path, "remove");
    if (item.facts.before_sha256 !== null) {
      if (
        !hashes[decision.path] ||
        item.facts.before_sha256 !== decision.expected_sha256 ||
        computeHash(fs.readFileSync(filePath(cwd, decision.path), "utf8")) !==
          hashes[decision.path]
      ) {
        throw new Error(
          `Retired core file is locally modified: ${decision.path}`,
        );
      }
    }
    pending.push(item);
    const { [decision.path]: _retiredHash, ...remainingHashes } =
      completedHashes;
    completedHashes = remainingHashes;
  }
  // Old receipt entries absent from the target templates still need review.
  // Preserve is a preview disposition, never an implicit retirement decision.
  for (const name of Object.keys(hashes)) {
    if (
      !templates.has(name) &&
      !decisions.has(name) &&
      ownsRetiredCorePath(name, platformPaths)
    ) {
      const item = describe(cwd, name, "preserve");
      pending.push(item);
      conflicts.push(name);
    }
  }
  const taskRefs = new Set<string>();
  for (const task of plan.tasks) {
    if (task.task_ref === ".trellis/tasks/archive")
      throw new Error("Historical archives are outside migration");
    if (taskRefs.has(task.task_ref))
      throw new Error(`Duplicate task projection ${task.task_ref}`);
    taskRefs.add(task.task_ref);
    const name = `${task.task_ref}/task.json`;
    const target = serializeTaskRecord(taskRecordSchema.parse(task.record));
    const item = describe(cwd, name, "write", target);
    if (item.facts.before_sha256 === null)
      throw new Error(`Missing legacy task ${name}`);
    if (item.facts.before_sha256 !== item.facts.after_sha256) {
      if (item.facts.before_sha256 !== task.expected_sha256)
        throw new Error(`Stale task projection ${name}`);
      validateLegacyTaskProjection(
        JSON.parse(fs.readFileSync(filePath(cwd, name), "utf8")) as unknown,
        task.record,
        task.retired_fields,
      );
    }
    pending.push(item);
  }
  for (const task of plan.deferred_tasks) {
    if (task.task_ref === ".trellis/tasks/archive")
      throw new Error("Historical archives are outside migration");
    if (taskRefs.has(task.task_ref))
      throw new Error(`Duplicate task disposition ${task.task_ref}`);
    taskRefs.add(task.task_ref);
    const name = `${task.task_ref}/task.json`;
    const item = describe(cwd, name, "preserve");
    if (item.facts.before_sha256 !== task.expected_sha256)
      throw new Error(`Stale deferred task ${name}`);
    if (
      !isKnownLegacyTaskRecord(
        JSON.parse(fs.readFileSync(filePath(cwd, name), "utf8")),
      )
    )
      throw new Error(`Deferred task is not a known legacy record: ${name}`);
    pending.push(item);
  }
  for (const task of plan.current_tasks) {
    if (task.task_ref === ".trellis/tasks/archive")
      throw new Error("Historical archives are outside migration");
    if (taskRefs.has(task.task_ref))
      throw new Error(`Duplicate task disposition ${task.task_ref}`);
    taskRefs.add(task.task_ref);
    const name = `${task.task_ref}/task.json`;
    const item = describe(cwd, name, "preserve");
    if (item.facts.before_sha256 !== task.expected_sha256)
      throw new Error(`Stale current task ${name}`);
    taskRecordSchema.parse(
      JSON.parse(fs.readFileSync(filePath(cwd, name), "utf8")) as unknown,
    );
    pending.push(item);
  }
  // Do not activate an installation with an omitted legacy active record.
  const tasksRoot = filePath(cwd, ".trellis/tasks");
  if (fs.existsSync(tasksRoot)) {
    for (const entry of fs.readdirSync(tasksRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === "archive") continue;
      const ref = `.trellis/tasks/${entry.name}`;
      if (taskRefs.has(ref)) continue;
      const full = filePath(cwd, `${ref}/task.json`);
      if (fs.existsSync(full))
        taskRecordSchema.parse(
          JSON.parse(fs.readFileSync(full, "utf8")) as unknown,
        );
    }
  }
  pending.push(
    describe(
      cwd,
      ".trellis/.template-hashes.json",
      "write",
      JSON.stringify({ __version: 2, hashes: completedHashes }, null, 2),
    ),
  );
  pending.push(describe(cwd, ".trellis/.version", "write", VERSION));
  const result: MigrationResult = {
    status: options.dryRun ? "preview" : "migrated",
    source_version: options.from,
    target_version: VERSION,
    actions: pending.map((item) => item.facts),
    conflicts,
  };
  if (options.dryRun) return result;
  if (conflicts.length)
    throw new Error(
      `Migration needs explicit file decisions: ${conflicts.join(", ")}`,
    );
  for (const item of pending) {
    const { facts, content } = item;
    const full = filePath(cwd, facts.path);
    if (facts.action === "preserve") continue;
    if (facts.action === "remove") {
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } else {
      if (content === undefined)
        throw new Error(`Missing content ${facts.path}`);
      if (facts.before_sha256 !== facts.after_sha256) {
        fs.mkdirSync(path.dirname(full), { recursive: true });
        writeFileAtomic(full, content);
      }
      if (facts.after_mode !== null) fs.chmodSync(full, facts.after_mode);
    }
  }
  return result;
}

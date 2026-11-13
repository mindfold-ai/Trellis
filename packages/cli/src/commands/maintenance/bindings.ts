import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import {
  MaintenanceError,
  classifyBranchBinding,
  classifyMaintenanceTask,
  classifySessionCarrier,
} from "@mindfoldhq/trellis-core/task/maintenance";
import {
  contained,
  observeRepository,
  readSnapshot,
  type RawSnapshot,
} from "./shared.js";

export interface MaintenanceTaskKey {
  task_id: string;
  lifecycle_generation: number;
}
export interface InspectedCarrier {
  root: string;
  path: string;
  source: Exclude<RawSnapshot, null>;
  kind: "session" | "branch_binding";
}

function maintenanceError(message: string): MaintenanceError {
  const [code, ...detail] = message.split(":");
  return new MaintenanceError(code, detail.join(":").trim());
}

/** Resolve contained real paths before reading; maintenance has no path repair. */
export function taskPath(root: string, ref: string): string {
  return contained(root, ref);
}
export function rawJson(raw: Exclude<RawSnapshot, null>): unknown {
  try {
    return JSON.parse(
      Buffer.from(raw.content_base64, "base64").toString("utf8"),
    );
  } catch {
    throw new MaintenanceError(
      "unsupported_source",
      "Selected raw record or carrier is not valid JSON",
    );
  }
}
export function expectSnapshot(
  root: string,
  ref: string,
  source: RawSnapshot | null,
): void {
  if (!isDeepStrictEqual(readSnapshot(root, ref), source))
    throw maintenanceError(`stale_source: ${root}:${ref}`);
}
function git(root: string, ...args: string[]): string {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)),
  );
  return execFileSync("git", ["-C", root, ...args], {
    env,
    encoding: "utf8",
  }).trim();
}

export function inspectBindings(
  root: string,
  key: MaintenanceTaskKey,
  taskRef: string,
  originalTaskRef?: string,
  activeRef?: string,
): {
  carriers: InspectedCarrier[];
  branch_binding: InspectedCarrier | null;
  inherited_copies: { root: string; task_ref: string }[];
  authority: "local" | "bound" | "requires_binding";
} {
  const repo = observeRepository(root);
  const selected = {
    task_id: key.task_id,
    generation: key.lifecycle_generation,
    task_path: taskPath(root, taskRef),
    task_paths: [originalTaskRef, activeRef].flatMap((ref) =>
      ref ? [taskPath(root, ref)] : [],
    ),
  };
  const carriers: InspectedCarrier[] = [];
  const directories = [
    ...(repo.common_dir
      ? [{ root: repo.common_dir, ref: "trellis/sessions" }]
      : []),
    ...repo.worktrees.map((workspace) => ({
      root: workspace,
      ref: ".trellis/.runtime/sessions",
    })),
  ];
  for (const directory of directories) {
    const full = taskPath(directory.root, directory.ref);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full).sort()) {
      if (!name.endsWith(".json")) continue;
      const ref = `${directory.ref}/${name}`;
      taskPath(directory.root, ref);
      const source = readSnapshot(directory.root, ref);
      if (!source) continue;
      const value = rawJson(source);
      // Path0 is relative to its carrier's checkout. Path1 names its own workspace.
      const classification = classifySessionCarrier(value, {
        ...selected,
        carrier_workspace: directory.root,
        common_dir: repo.common_dir,
      });
      if (classification.matches)
        carriers.push({
          root: directory.root,
          path: ref,
          source,
          kind: "session",
        });
    }
  }
  let branchBinding: InspectedCarrier | null = null;
  if (repo.common_dir) {
    const ref = `trellis/task-branches/${key.task_id}/${key.lifecycle_generation}.json`;
    taskPath(repo.common_dir, ref);
    const source = readSnapshot(repo.common_dir, ref);
    if (source) {
      const classified = classifyBranchBinding(rawJson(source), selected);
      if (!classified.matches)
        throw maintenanceError("target_key_mismatch: branch binding");
      const owners = repo.worktrees.filter(
        (workspace) =>
          git(workspace, "branch", "--show-current") === classified.branch_name,
      );
      if (owners.length !== 1 || owners[0] !== root)
        throw maintenanceError(
          "ambiguous_authority: original branch binding does not select target checkout",
        );
      branchBinding = {
        root: repo.common_dir,
        path: ref,
        source,
        kind: "branch_binding",
      };
    }
  }
  const inherited: { root: string; task_ref: string }[] = [];
  const selectedRaw = readSnapshot(root, `${taskRef}/task.json`);
  if (!selectedRaw)
    throw maintenanceError("unsupported_source: selected Task disappeared");
  const selectedSource = rawJson(selectedRaw) as Record<string, unknown>;
  for (const workspace of repo.worktrees) {
    const tasks = taskPath(workspace, ".trellis/tasks");
    if (!fs.existsSync(tasks)) continue;
    for (const name of fs.readdirSync(tasks).sort()) {
      if (name === "archive") continue;
      const ref = `.trellis/tasks/${name}`;
      const directory = taskPath(workspace, ref);
      if (!fs.statSync(directory).isDirectory()) continue;
      const raw = readSnapshot(workspace, `${ref}/task.json`);
      if (!raw) continue;
      const value = rawJson(raw) as Record<string, unknown>;
      // Native identity reservation checks casefold collisions even when a
      // branch binding selects this checkout. Other bound-out peer identities
      // do not participate in that native selection.
      if (
        typeof value.id === "string" &&
        value.id !== key.task_id &&
        value.id.toLowerCase() === key.task_id.toLowerCase() &&
        (!branchBinding || workspace === root)
      )
        throw maintenanceError(
          `task_id_casefold_collision: selected identity collides at ${workspace}:${ref}`,
        );
      if (value.id !== key.task_id) continue;
      if (activeRef && workspace === root)
        throw maintenanceError(
          `conflict: selected TaskId already has an active record at ${workspace}:${ref}`,
        );
      const identity = classifyMaintenanceTask(value);
      if (identity.generation !== key.lifecycle_generation) continue;
      if (workspace === root && ref === taskRef) continue;
      if (
        workspace === root ||
        !isDeepStrictEqual(value.source, selectedSource.source)
      )
        throw maintenanceError(
          `ambiguous_authority: colliding selected identity ${workspace}:${ref}`,
        );
      inherited.push({ root: workspace, task_ref: ref });
    }
  }
  return {
    carriers,
    branch_binding: branchBinding,
    inherited_copies: inherited,
    authority: branchBinding
      ? "bound"
      : repo.common_dir
        ? "requires_binding"
        : "local",
  };
}

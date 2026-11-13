import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task/legacy-migration";
import {
  emptyTaskRecordV2,
  type TaskRecordV2,
} from "@mindfoldhq/trellis-core/task/v2";
import { Command } from "commander";
import { registerMaintenanceCommand } from "../../src/commands/maintenance/command.js";
import * as api from "../../src/commands/maintenance/api.js";
import {
  snapshot,
  type MaintenanceAction,
} from "../../src/commands/maintenance/shared.js";

const key = { task_id: "selected", lifecycle_generation: 0 };
const originalRef = ".trellis/tasks/original-directory";
const archiveRef = ".trellis/tasks/archive/2026-10/manually-renamed";
const activeRef = ".trellis/tasks/resumed-directory";
const deliveryId = "11111111-1111-4111-8111-111111111111";
const resultId = "22222222-2222-4222-8222-222222222222";
const python = process.platform === "darwin" ? "/usr/bin/python3" : "python3";
let base: string, root: string, peer: string, common: string;
function write(
  location: string,
  ref: string,
  value: string | object,
  mode = 0o640,
): void {
  const file = path.join(location, ref);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n",
  );
  fs.chmodSync(file, mode);
}
function git(location: string, ...args: string[]): string {
  return execFileSync("git", ["-C", location, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function bytes(location: string, ref: string): unknown {
  const full = path.join(location, ref);
  if (!fs.existsSync(full)) return null;
  const stat = fs.statSync(full);
  return [
    stat.mode & 0o777,
    stat.isDirectory()
      ? fs
          .readdirSync(full)
          .sort()
          .map((name) => [name, bytes(location, `${ref}/${name}`)])
      : fs.readFileSync(full).toString("hex"),
  ];
}
function inspect(): api.InspectedTaskTarget {
  return api.inspectTaskTarget({
    root,
    key,
    task_ref: archiveRef,
    original_task_ref: originalRef,
  });
}
function input(): api.ArchivedTaskResumeInput {
  const observed = inspect();
  const old = JSON.parse(
    Buffer.from(observed.source.content_base64, "base64").toString("utf8"),
  ) as Record<string, unknown>;
  const metadata = Object.fromEntries(
    Object.entries(old).filter(
      ([field]) =>
        ![
          "status",
          "commit",
          "pr_url",
          "completedAt",
          "creator",
          "assignee",
        ].includes(field),
    ),
  );
  const authority = {
    locator: `${activeRef}/prd.md`,
    revision: `sha256:${snapshot("accepted scope\n").sha256}`,
  };
  const projection = emptyTaskRecordV2({
    ...metadata,
    id: key.task_id,
    accepted_scope: authority,
  });
  return {
    root,
    key,
    task_ref: archiveRef,
    original_task_ref: originalRef,
    active_ref: activeRef,
    source_kind: "schema1",
    projection,
    resume_intent: {
      reason: authority,
      archive_review: { ...authority, locator: `${archiveRef}/prd.md` },
      next_owner_id: "trellis-complete-task",
      next_action: "review whole-task acceptance and outstanding supplement",
    },
    artifacts: observed.artifacts.flatMap((entry) =>
      entry.kind === "file" &&
      entry.path !== `${archiveRef}/task.json` &&
      entry.source
        ? [
            {
              path: entry.path,
              action: "preserve" as const,
              source: entry.source,
            },
          ]
        : [],
    ),
    legacy_facts: [],
    sessions: observed.carriers.map((carrier) => ({
      carrier,
      action: "replace",
      delivery_id: null,
    })),
    branch_binding: {
      action: "preserve",
      source: observed.branch_binding?.source ?? null,
    },
  };
}
function run(script: string, ...args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(python, ["-B", `.trellis/scripts/${script}`, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      TRELLIS_CONTEXT_ID: "codex_old",
      PYTHONDONTWRITEBYTECODE: "1",
    },
  });
}
function recovery(plan: api.PreparedMaintenancePlan): string {
  return path.join(base, "state", `${plan.operation_id}.json`);
}
function assertNoWrite(before: unknown, carriers: unknown): void {
  expect(bytes(root, ".trellis/tasks")).toEqual(before);
  expect(bytes(common, "trellis")).toEqual(carriers);
}
beforeEach(() => {
  base = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "trellis-archive-resume-")),
  );
  root = path.join(base, "root");
  peer = path.join(base, "peer");
  fs.mkdirSync(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  write(root, "README.md", "fixture");
  git(root, "add", "README.md");
  git(root, "commit", "-m", "fixture");
  git(root, "worktree", "add", "-b", "peer", peer);
  common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  fs.cpSync(
    path.resolve(__dirname, "../../src/templates/trellis/scripts"),
    path.join(root, ".trellis/scripts"),
    { recursive: true },
  );
  write(
    root,
    ".trellis/workflow.md",
    fs.readFileSync(
      path.resolve(
        __dirname,
        "../../src/templates/trellis/workflow-delivery-v1.md",
      ),
      "utf8",
    ),
  );
  write(
    root,
    `${archiveRef}/task.json`,
    emptyTaskRecord({
      id: key.task_id,
      name: "Selected",
      title: "Selected",
      branch: "main",
      status: "completed",
      meta: { private_closeout: "original owner must review" },
    }),
  );
  write(root, `${archiveRef}/prd.md`, "accepted scope\n", 0o600);
  write(
    root,
    `${archiveRef}/maintenance-history.md`,
    "Manually archived; no formal Completion, Closure or Finish. Original owner retains private responsibilities.\n",
  );
  fs.mkdirSync(path.join(root, archiveRef, "empty"), { mode: 0o700 });
  write(common, "trellis/sessions/codex_old.json", {
    schema_version: 1,
    repository_common_dir: common,
    task_workspace_root: root,
    current_task: originalRef,
  });
  write(common, "trellis/task-branches/selected/0.json", {
    schema_version: "1.0",
    ...key,
    binding_revision: 1,
    branch_name: "main",
  });
  write(common, "trellis/sessions/unrelated.json", {
    schema_version: 3,
    task_id: "another",
    lifecycle_generation: 0,
    delivery_id: null,
  });
  write(common, "trellis/sessions/other-generation.json", {
    schema_version: 2,
    task_id: "selected",
    lifecycle_generation: 1,
  });
  write(root, "dirty-business.txt", "leave alone");
  write(peer, "untracked-peer.txt", "leave peer alone");
});
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
  fs.rmSync(base, { recursive: true, force: true });
});

describe("selected manually archived predecessor resume", () => {
  it("restores the same Task/generation, native identity/continuation and actual next consumer while retaining the original archive", async () => {
    write(root, ".trellis/.runtime/sessions/codex_old.json", {
      current_task: originalRef,
    });
    write(common, "trellis/sessions/archive-path.json", {
      current_task: archiveRef,
      platform: "codex",
      last_seen_at: "2026-10-17",
      current_run: null,
    });
    // Unversioned common storage cannot establish an absolute original workspace.
    fs.unlinkSync(path.join(common, "trellis/sessions/archive-path.json"));
    write(root, ".trellis/.runtime/sessions/archive-path.json", {
      current_task: archiveRef,
    });
    const archived = bytes(root, archiveRef),
      peerBefore = bytes(peer, "."),
      unselected = bytes(common, "trellis/sessions/unrelated.json");
    const reviewed = input();
    expect(reviewed.sessions.map((session) => session.carrier.path)).toEqual([
      "trellis/sessions/codex_old.json",
      ".trellis/.runtime/sessions/archive-path.json",
      ".trellis/.runtime/sessions/codex_old.json",
    ]);
    const plan = api.prepareArchivedTaskResume(reviewed);
    expect(plan.kind).toBe("task_resume");
    expect(bytes(root, activeRef)).toBeNull();
    expect(
      plan.actions
        .filter((action) => action.path.startsWith(archiveRef))
        .every(
          (action) =>
            JSON.stringify(action.source) === JSON.stringify(action.target),
        ),
    ).toBe(true);
    const result = await api.applyMaintenance(plan, {
      state_dir: path.join(base, "state"),
    });
    expect(result).toMatchObject({
      status: "applied",
      resumed_task: { key, task_ref: activeRef },
    });
    expect(bytes(root, archiveRef)).toEqual(archived);
    expect(bytes(peer, ".")).toEqual(peerBefore);
    expect(bytes(common, "trellis/sessions/unrelated.json")).toEqual(
      unselected,
    );
    expect(fs.statSync(path.join(root, activeRef, "empty")).mode & 0o777).toBe(
      0o700,
    );
    const record = JSON.parse(
      fs.readFileSync(path.join(root, activeRef, "task.json"), "utf8"),
    ) as TaskRecordV2;
    expect(record.id).toBe(key.task_id);
    expect(record.lifecycle_generation).toBe(0);
    expect(record.deliveries).toEqual([]);
    expect(record.completion_results).toEqual([]);
    expect(record.closure_results).toEqual([]);
    const current = run("task.py", "current", "--json");
    expect(
      current.status,
      String(current.stdout) + String(current.stderr),
    ).toBe(0);
    expect(String(current.stdout)).toContain(activeRef);
    const continuation = run("get_context.py", "--mode", "continuation");
    expect(
      continuation.status,
      String(continuation.stdout) + String(continuation.stderr),
    ).toBe(0);
    expect(String(continuation.stdout)).toContain("whole-scope acceptance");
    const delivery = run("delivery.py", "current", "--json");
    expect(
      delivery.status,
      String(delivery.stdout) + String(delivery.stderr),
    ).toBe(0);
    expect(JSON.parse(String(delivery.stdout))).toMatchObject({
      kind: "no_current_delivery",
      key,
    });
    // The real next public consumer, with no synthetic planning/gates from resume.
    const next = run(
      "delivery.py",
      "apply",
      "--input",
      JSON.stringify({
        api_version: "1.0",
        operation: "create_delivery",
        key: { ...key, delivery_id: deliveryId },
        owner_role: "creation",
        owner_id: "trellis-start",
        profile: "local_commit",
        scope_ref: {
          authority: record.accepted_scope,
          anchors: ["new supplement"],
        },
      }),
    );
    expect(next.status, String(next.stdout) + String(next.stderr)).toBe(0);
    const after = JSON.parse(
      fs.readFileSync(path.join(root, activeRef, "task.json"), "utf8"),
    ) as TaskRecordV2;
    expect(after.deliveries).toHaveLength(1);
    expect(after.deliveries[0].phase).toBe("planning");
    expect(Object.values(after.deliveries[0].results)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    await expect(
      api.rollbackMaintenance({ recovery_ref: recovery(plan) }),
    ).rejects.toMatchObject({ code: "later_work_conflict" });
    expect(bytes(root, archiveRef)).toEqual(archived);
    expect(fs.readFileSync(path.join(root, "dirty-business.txt"), "utf8")).toBe(
      "leave alone",
    );
  });

  it("imports attributed real historical delivery without inherited gates or a replacement Delivery", async () => {
    const old = JSON.parse(
      fs.readFileSync(path.join(root, archiveRef, "task.json"), "utf8"),
    );
    old.pr_url = "https://github.com/example/project/pull/4";
    old.completedAt = "2026-10-01";
    write(root, `${archiveRef}/task.json`, old);
    const reviewed = input(),
      record = reviewed.projection as TaskRecordV2,
      authority = record.accepted_scope as NonNullable<
        TaskRecordV2["accepted_scope"]
      >;
    const candidate = {
      kind: "git" as const,
      content_ref: `sha256:${"a".repeat(64)}`,
      paths: ["README.md"],
      head_ref: git(root, "rev-parse", "HEAD"),
      base_ref: git(root, "rev-parse", "HEAD"),
    };
    record.deliveries = [
      {
        id: deliveryId,
        lifecycle_generation: 0,
        scope_ref: { authority, anchors: ["retained"] },
        planning_root: `deliveries/${deliveryId}`,
        profile: "pull_request",
        phase: "delivered",
        plan_ref: null,
        candidate: null,
        results: {
          planning: null,
          check: null,
          full_review: null,
          readiness: null,
        },
        publication_result: null,
        delivery_result: {
          result_id: resultId,
          owner_id: "original-delivery-owner",
          evidence: [
            { locator: old.pr_url, revision: "original-producer-reviewed" },
          ],
          profile: "pull_request",
          candidate,
          repo_ref: "example/project",
          pr_number: 4,
          reviewed_head: candidate.head_ref,
          merge_commit: candidate.head_ref,
          target_ref: "main",
        },
        stop_result: null,
      },
    ];
    reviewed.legacy_facts = [
      {
        field: "pr_url",
        disposition: "delivery_result",
        owner_id: "original-delivery-owner",
        result_id: resultId,
        reason: { locator: old.pr_url, revision: "original-producer-reviewed" },
      },
      {
        field: "completedAt",
        disposition: "source_snapshot",
        owner_id: "original-owner",
        reason: reviewed.resume_intent.archive_review,
      },
    ];
    for (const name of [
      "prd.md",
      "design.md",
      "implement.md",
      "implement.jsonl",
      "check.jsonl",
    ])
      reviewed.artifacts.push({
        path: `${archiveRef}/deliveries/${deliveryId}/${name}`,
        action: "write",
        source: null,
        target: snapshot(
          name.endsWith("jsonl") ? "" : "Retained historical planning\n",
        ),
      });
    const archived = bytes(root, archiveRef),
      plan = api.prepareArchivedTaskResume(reviewed);
    await api.applyMaintenance(plan, { state_dir: path.join(base, "state") });
    expect(bytes(root, archiveRef)).toEqual(archived);
    const history = run("delivery.py", "list", "--task", activeRef, "--json");
    expect(
      history.status,
      String(history.stdout) + String(history.stderr),
    ).toBe(0);
    expect(JSON.parse(String(history.stdout))).toEqual(record.deliveries);
    const current = run("delivery.py", "current", "--json");
    expect(JSON.parse(String(current.stdout))).toMatchObject({
      kind: "no_current_delivery",
      key,
    });
    const continuation = run("get_context.py", "--mode", "continuation");
    expect(continuation.status).toBe(0);
    expect(String(continuation.stdout)).toContain(
      "trellis-complete-task decides whole-scope acceptance",
    );
    const restored = JSON.parse(
      fs.readFileSync(path.join(root, activeRef, "task.json"), "utf8"),
    ) as TaskRecordV2;
    expect(restored.deliveries).toHaveLength(1);
    expect(restored.completion_results).toEqual([]);
    expect(restored.closure_results).toEqual([]);
  });

  it("uses explicit-task routing when no session is selected, preserving original branch ownership", async () => {
    fs.unlinkSync(path.join(common, "trellis/sessions/codex_old.json"));
    const reviewed = input();
    expect(reviewed.sessions).toEqual([]);
    const result = await api.applyMaintenance(
      api.prepareArchivedTaskResume(reviewed),
      { state_dir: path.join(base, "state") },
    );
    expect(result.status).toBe("applied");
    const query = run("delivery.py", "list", "--task", activeRef, "--json");
    expect(query.status, String(query.stdout) + String(query.stderr)).toBe(0);
    expect(JSON.parse(String(query.stdout))).toEqual([]);
    expect(
      fs.existsSync(path.join(common, "trellis/sessions/codex_old.json")),
    ).toBe(false);
  });

  it("recovers lost output and partial writes with fixed identity/preimages and exact rollback", async () => {
    const archived = bytes(root, archiveRef),
      carriers = bytes(common, "trellis"),
      peerBefore = bytes(peer, "."),
      plan = api.prepareArchivedTaskResume(input());
    const rename = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(to) === path.join(root, activeRef, "task.json"))
        throw new Error("ordinary write failure");
      return rename(from, to);
    });
    await expect(
      api.applyMaintenance(plan, { state_dir: path.join(base, "state") }),
    ).rejects.toThrow("ordinary write failure");
    vi.restoreAllMocks();
    expect(
      (await api.recoverMaintenance({ recovery_ref: recovery(plan) })).status,
    ).toBe("pending");
    const applied = await api.resumeMaintenance({
      recovery_ref: recovery(plan),
    });
    expect(applied.operation_id).toBe(plan.operation_id);
    expect(applied.status).toBe("applied");
    expect(
      (
        await api.applyMaintenance(plan, {
          state_dir: path.join(base, "state"),
        })
      ).operation_id,
    ).toBe(plan.operation_id);
    expect(
      (await api.recoverMaintenance({ recovery_ref: recovery(plan) })).status,
    ).toBe("applied");
    expect(
      (await api.rollbackMaintenance({ recovery_ref: recovery(plan) })).status,
    ).toBe("rolled_back");
    expect(bytes(root, activeRef)).toBeNull();
    expect(bytes(root, archiveRef)).toEqual(archived);
    expect(bytes(common, "trellis")).toEqual(carriers);
    expect(bytes(peer, ".")).toEqual(peerBefore);
    expect(
      (await api.recoverMaintenance({ recovery_ref: recovery(plan) })).status,
    ).toBe("rolled_back");
    await expect(
      api.resumeMaintenance({ recovery_ref: recovery(plan) }),
    ).rejects.toMatchObject({ code: "operation_rolled_back" });
  });

  it.each([
    "archive-added",
    "archive-edited",
    "carrier-added",
    "identity-conflict",
    "candidate-mismatch",
  ] as const)("rejects ordinary stale %s before writes", async (change) => {
    const plan = api.prepareArchivedTaskResume(input());
    if (change === "archive-added")
      write(root, `${archiveRef}/new-evidence.md`, "later history");
    if (change === "archive-edited")
      write(root, `${archiveRef}/prd.md`, "changed source");
    if (change === "carrier-added")
      write(common, "trellis/sessions/new.json", { schema_version: 2, ...key });
    if (change === "identity-conflict")
      write(
        root,
        ".trellis/tasks/other/task.json",
        emptyTaskRecord({ id: key.task_id, lifecycle_generation: 1 }),
      );
    if (change === "candidate-mismatch")
      plan.candidate.core_digest = "changed-candidate";
    const before = bytes(root, ".trellis/tasks"),
      carriers = bytes(common, "trellis");
    await expect(
      api.applyMaintenance(plan, { state_dir: path.join(base, "state") }),
    ).rejects.toBeInstanceOf(api.MaintenanceError);
    assertNoWrite(before, carriers);
    expect(fs.existsSync(path.join(base, "state"))).toBe(false);
  });

  it.each([
    "new-file",
    "new-session",
    "new-binding",
    "edited-archive",
  ] as const)(
    "refuses recovery/rollback over later %s without touching later work",
    async (change) => {
      const reviewed = input();
      if (change === "new-binding") {
        fs.unlinkSync(
          path.join(common, "trellis/task-branches/selected/0.json"),
        );
        reviewed.branch_binding = {
          action: "establish",
          source: null,
          record: {
            schema_version: "1.0",
            ...key,
            binding_revision: 1,
            branch_name: "main",
          },
        };
      }
      const plan = api.prepareArchivedTaskResume(reviewed);
      await api.applyMaintenance(plan, { state_dir: path.join(base, "state") });
      if (change === "new-file")
        write(root, `${activeRef}/new-business.md`, "later work");
      if (change === "new-session")
        write(common, "trellis/sessions/new.json", {
          schema_version: 3,
          ...key,
          delivery_id: null,
        });
      if (change === "new-binding")
        write(common, "trellis/task-branches/selected/0.json", {
          schema_version: "1.0",
          ...key,
          binding_revision: 2,
          branch_name: "main",
        });
      if (change === "edited-archive")
        write(
          root,
          `${archiveRef}/maintenance-history.md`,
          "later archive evidence",
        );
      const before = bytes(root, ".trellis/tasks"),
        carriers = bytes(common, "trellis");
      await expect(
        api.recoverMaintenance({ recovery_ref: recovery(plan) }),
      ).rejects.toBeInstanceOf(api.MaintenanceError);
      await expect(
        api.rollbackMaintenance({ recovery_ref: recovery(plan) }),
      ).rejects.toBeInstanceOf(api.MaintenanceError);
      assertNoWrite(before, carriers);
    },
  );

  it("returns specific intent/path/format/identity/ownership diagnostics and preserves existing conversion/closeout selection", () => {
    const reviewed = input(),
      before = bytes(root, ".trellis/tasks"),
      carriers = bytes(common, "trellis");
    const missing = { ...reviewed } as Partial<api.ArchivedTaskResumeInput>;
    delete missing.resume_intent;
    expect(() =>
      api.prepareArchivedTaskResume(missing as api.ArchivedTaskResumeInput),
    ).toThrow("resume_intent_required");
    expect(() =>
      api.prepareArchivedTaskResume({
        ...reviewed,
        task_ref: ".trellis/tasks/archive/2026-10/missing",
      }),
    ).toThrow("unsupported_source");
    expect(() =>
      api.prepareArchivedTaskResume({
        ...reviewed,
        task_ref: ".trellis/tasks/archive/2026-10/../bad",
      }),
    ).toThrow("invalid_task_path");
    expect(() =>
      api.prepareArchivedTaskResume({
        ...reviewed,
        key: { ...key, task_id: "wrong" },
      }),
    ).toThrow("target_key_mismatch");
    const conversion = api.parseTaskConversionInput(
      Object.fromEntries(
        Object.entries(reviewed).filter(
          ([field]) =>
            !["active_ref", "original_task_ref", "resume_intent"].includes(
              field,
            ),
        ),
      ),
    );
    expect(() => api.prepareTaskConversion(conversion)).toThrow(
      "invalid_task_path",
    );
    expect(() =>
      api.prepareLegacyCloseout({
        root,
        key,
        task_ref: archiveRef,
        archive_ref: ".trellis/tasks/archive/2026-10/second",
        source_kind: "schema1",
        history_note: "retained",
        retirements: [],
      }),
    ).toThrow("invalid_task_path");
    assertNoWrite(before, carriers);
    write(root, `${archiveRef}/task.json`, reviewed.projection as TaskRecordV2);
    expect(() => api.prepareArchivedTaskResume(reviewed)).toThrow(
      "unsupported_source",
    );
    write(root, `${archiveRef}/task.json`, {
      id: key.task_id,
      arbitrary: true,
    });
    expect(() => api.prepareArchivedTaskResume(reviewed)).toThrow(
      "unsupported_source",
    );
  });

  it.each([0, 1])(
    "rejects an active same TaskId at generation %s, casefold collision and ambiguous branch owner",
    (generation) => {
      const reviewed = input();
      write(
        root,
        ".trellis/tasks/another-directory/task.json",
        emptyTaskRecord({ id: key.task_id, lifecycle_generation: generation }),
      );
      expect(() => api.prepareArchivedTaskResume(reviewed)).toThrow("conflict");
      fs.rmSync(path.join(root, ".trellis/tasks/another-directory"), {
        recursive: true,
      });
      write(
        root,
        ".trellis/tasks/casefold/task.json",
        emptyTaskRecord({ id: "Selected" }),
      );
      expect(() => api.prepareArchivedTaskResume(reviewed)).toThrow(
        "task_id_casefold_collision",
      );
      fs.rmSync(path.join(root, ".trellis/tasks/casefold"), {
        recursive: true,
      });
      write(common, "trellis/task-branches/selected/0.json", {
        schema_version: "1.0",
        ...key,
        binding_revision: 1,
        branch_name: "peer",
      });
      expect(() => api.prepareArchivedTaskResume(reviewed)).toThrow(
        "ambiguous_authority",
      );
    },
  );

  it("prepares task_resume through the public CLI envelope and advertises its additive capability", async () => {
    const reviewed = input(),
      file = path.join(base, "input.json");
    write(base, "input.json", { kind: "task_resume", input: reviewed });
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message) => {
      output.push(String(message));
    });
    const program = new Command();
    registerMaintenanceCommand(program);
    await program.parseAsync(
      ["maintain", "prepare", "--input", file, "--json"],
      { from: "user" },
    );
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0])).toMatchObject({
      kind: "task_resume",
      guard: {
        task_id: key.task_id,
        generation: 0,
        task_ref: activeRef,
        archive_ref: archiveRef,
        original_task_ref: originalRef,
      },
    });
    expect(api.getMaintenanceContract()).toMatchObject({
      operation_kinds: expect.arrayContaining(["task_resume"]),
      archive_resume: { generation: "preserve", original_archive: "read_only" },
    });
    expect(fs.existsSync(path.join(root, activeRef))).toBe(false);
  });

  it("supports a positively recognized preidentity legacy archive without replacing the Task", async () => {
    const legacy = {
      id: key.task_id,
      name: "Selected",
      title: "Selected",
      status: "in_progress",
      creator: "original-owner",
      assignee: "original-owner",
    };
    write(root, `${archiveRef}/task.json`, legacy);
    const observed = inspect(),
      reviewed = input();
    reviewed.source_kind = "legacy";
    reviewed.projection = emptyTaskRecordV2({
      id: key.task_id,
      name: "Selected",
      title: "Selected",
      accepted_scope: {
        locator: `${activeRef}/prd.md`,
        revision: `sha256:${snapshot("accepted scope\n").sha256}`,
      },
    });
    expect(observed.classification.kind).toBe("legacy");
    await api.applyMaintenance(api.prepareArchivedTaskResume(reviewed), {
      state_dir: path.join(base, "state"),
    });
    expect(
      fs.readFileSync(path.join(root, activeRef, "migration/source-task.json")),
    ).toEqual(Buffer.from(observed.source.content_base64, "base64"));
    expect(
      JSON.parse(
        fs.readFileSync(path.join(root, activeRef, "task.json"), "utf8"),
      ),
    ).toMatchObject({
      id: key.task_id,
      lifecycle_generation: 0,
      deliveries: [],
    });
    expect(run("get_context.py", "--mode", "continuation").status).toBe(0);
  });

  it("rejects path reuse after preparation before touching the new Task or its carriers", async () => {
    const plan = api.prepareArchivedTaskResume(input());
    write(
      root,
      `${originalRef}/task.json`,
      emptyTaskRecord({ id: "replacement" }),
    );
    const before = bytes(root, ".trellis/tasks"),
      carriers = bytes(common, "trellis");
    await expect(
      api.applyMaintenance(plan, { state_dir: path.join(base, "state") }),
    ).rejects.toThrow("original active path was occupied");
    assertNoWrite(before, carriers);
  });

  it("protects a different Task that reused the former active path and its original path session", () => {
    const reviewed = input();
    write(
      root,
      `${originalRef}/task.json`,
      emptyTaskRecord({ id: "replacement", name: "Replacement" }),
    );
    const before = bytes(root, ".trellis/tasks"),
      carriers = bytes(common, "trellis");
    expect(() => api.prepareArchivedTaskResume(reviewed)).toThrow(
      "original active path is occupied",
    );
    assertNoWrite(before, carriers);
  });

  it("rejects a plan attempting to mutate its retained archive", () => {
    const plan = api.prepareArchivedTaskResume(input());
    const action = plan.actions.find(
      (item) => item.path === `${archiveRef}/prd.md`,
    ) as MaintenanceAction;
    if (action.kind === "directory")
      throw new Error("fixture must name a file");
    action.target = snapshot("tampered");
    expect(() => api.previewMaintenance(plan)).toThrow(
      "Original archive is read-only",
    );
  });
});

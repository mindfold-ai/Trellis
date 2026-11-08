import { describe, expect, it } from "vitest";
import { emptyTaskRecord } from "../../src/task/schema.js";
import { emptyTaskRecordV2 } from "../../src/task/v2/operations.js";
import { classifyMaintenanceTask, classifySessionCarrier, classifyBranchBinding, validateSelectedTaskProjection, validateArchivedTaskResumeProjection } from "../../src/task/maintenance.js";

describe("selected maintenance domain boundary", () => {
  const old = emptyTaskRecord({ id: "selected", lifecycle_generation: 2, completedAt: "2026-09-01", commit: "old-commit", status: "completed" });
  const projection = emptyTaskRecordV2(Object.fromEntries(Object.entries(old).filter(([key]) => !["status", "commit", "pr_url", "completedAt"].includes(key))) as Parameters<typeof emptyTaskRecordV2>[0]);
  it("positively separates predecessor/current formats without permissive fallback", () => {
    expect(classifyMaintenanceTask(old)).toEqual({ kind: "schema1", task_id: "selected", generation: 2 });
    expect(classifyMaintenanceTask({ id: "old", name: "old", title: "old", status: "planning", creator: "owner", assignee: "owner" })).toEqual({ kind: "legacy", task_id: "old", generation: 0 });
    expect(classifyMaintenanceTask(projection).kind).toBe("schema2");
    expect(() => classifyMaintenanceTask({ ...old, lifecycle_generation: undefined })).toThrow("unsupported_source");
    expect(() => classifyMaintenanceTask({ ...old, schema_version: "1.0" })).toThrow("unsupported_source");
  });
  it("projects legacy Guru metadata as raw history without native lifecycle results", () => {
    const legacy = {
      id: "old-guru",
      name: "old-guru",
      title: "Old Guru task",
      status: "completed",
      creator: "old",
      assignee: "old",
      commit: "old-commit",
      completedAt: "2026-07-20",
      guru_chain: "light",
      guru_gates: { planning: { confirmed_by: "old", status: "passed" } },
      design_package: null,
      requirement_package: null,
      require_req_uc: true,
      risk: "high",
      route: "lite_task",
      meta: { retained_business_fact: "original" },
    };
    const original = JSON.stringify(legacy);
    const target = emptyTaskRecordV2({
      id: legacy.id,
      name: legacy.name,
      title: legacy.title,
      meta: legacy.meta,
    });
    expect(classifyMaintenanceTask(legacy)).toEqual({
      kind: "legacy",
      task_id: legacy.id,
      generation: 0,
    });
    const reason = { locator: "migration/source-task.json", revision: "original-owner" };
    const record = validateSelectedTaskProjection(legacy, target, [
      { field: "commit", disposition: "source_snapshot", owner_id: "original-owner", reason },
      { field: "completedAt", disposition: "source_snapshot", owner_id: "original-owner", reason },
    ]);
    expect(record).toEqual(target);
    expect(record.deliveries).toEqual([]);
    expect(record.completion_results).toEqual([]);
    expect(record.closure_results).toEqual([]);
    expect(record.accepted_scope).toBeNull();
    expect(JSON.stringify(legacy)).toBe(original);
    expect(() => classifyMaintenanceTask({ ...target, guru_chain: legacy.guru_chain })).toThrow();
  });
  it("requires explicit old fact attribution and preserves dates without fabricating results", () => {
    expect(() => validateSelectedTaskProjection(old, projection)).toThrow("legacy_fact_attribution_required");
    const reason = { locator: "history.md", revision: "original-owner" };
    const record = validateSelectedTaskProjection(old, projection, [
      { field: "commit", disposition: "source_snapshot", owner_id: "original-owner", reason },
      { field: "completedAt", disposition: "source_snapshot", owner_id: "original-owner", reason },
    ]);
    expect(record.deliveries).toEqual([]);
    expect(record.completion_results).toEqual([]);
    expect(() => validateSelectedTaskProjection(old, projection, [
      { field: "commit", disposition: "source_snapshot", owner_id: "original-owner", reason },
      { field: "completedAt", disposition: "delivery_result", reason, owner_id: "owner", result_id: "missing" },
    ])).toThrow("timestamp");
  });
  it("recognizes the original 0.6 local writer metadata without treating it as current authority", () => {
    const selected = { task_id: "selected", generation: 0, task_path: "/owner/.trellis/tasks/selected", carrier_workspace: "/owner" };
    const actualWriter = { platform: "codex", last_seen_at: "2026-10-15T09:58:29Z", current_task: ".trellis/tasks/selected", current_run: null };
    expect(classifySessionCarrier(actualWriter, selected)).toEqual({ kind: "path0", matches: true });
    expect(classifySessionCarrier({ ...actualWriter, sessionId: "original-session", transcript_path: "/platform/transcript" }, selected)).toEqual({ kind: "path0", matches: true });
    expect(classifySessionCarrier({ ...actualWriter, current_task: ".trellis/tasks/other" }, selected).matches).toBe(false);
    expect(() => classifySessionCarrier({ ...actualWriter, last_seen_at: null }, selected)).toThrow("unsupported_carrier");
  });
  it("attributes identity and old path carriers to the exact owner and generation", () => {
    const selected = { task_id: "selected", generation: 2, task_path: "/owner/.trellis/tasks/selected", carrier_workspace: "/peer", common_dir: "/common" };
    expect(classifySessionCarrier({ schema_version: 2, task_id: "selected", lifecycle_generation: 1 }, selected).matches).toBe(false);
    expect(classifySessionCarrier({ current_task: ".trellis/tasks/selected" }, selected).matches).toBe(false);
    expect(classifySessionCarrier({ schema_version: 1, current_task: ".trellis/tasks/selected", repository_common_dir: "/common", task_workspace_root: "/owner" }, selected)).toEqual({ kind: "path1", matches: true });
    expect(classifySessionCarrier({ schema_version: 3, task_id: "selected", lifecycle_generation: 2, delivery_id: null }, selected).matches).toBe(true);
    expect(() => classifySessionCarrier({ current_task: "selected" }, selected)).toThrow("unsupported_carrier");
    expect(classifyBranchBinding({ schema_version: "1.0", task_id: "selected", lifecycle_generation: 1, binding_revision: 0, branch_name: "task" }, selected).matches).toBe(false);
  });
  it("recognizes the native schema-1 writer and retains exact path ownership", () => {
    const selected = { task_id: "selected", generation: 0, task_path: "/owner/.trellis/tasks/selected", common_dir: "/common" };
    // 43fffc17 active_task.py set_active_task: metadata + schema-1 path identity.
    const writer = { platform: "codex", last_seen_at: "2026-10-15T09:58:29Z", schema_version: 1, repository_common_dir: "/common", task_workspace_root: "/owner", current_task: ".trellis/tasks/selected", current_run: null };
    expect(classifySessionCarrier(writer, selected)).toEqual({ kind: "path1", matches: true });
    for (const alias of ["session_id", "sessionId", "sessionID", "conversation_id", "conversationId", "conversationID", "transcript_path", "transcriptPath", "transcript"]) {
      expect(classifySessionCarrier({ ...writer, [alias]: "original-context" }, selected)).toEqual({ kind: "path1", matches: true });
      expect(() => classifySessionCarrier({ ...writer, [alias]: "" }, selected)).toThrow("unsupported_carrier");
    }
    for (const change of [{ current_task: ".trellis/tasks/other" }, { task_workspace_root: "/peer" }, { repository_common_dir: "/different" }]) {
      expect(classifySessionCarrier({ ...writer, ...change }, selected)).toEqual({ kind: "path1", matches: false });
    }
    for (const change of [{ platform: "" }, { last_seen_at: null }, { current_run: {} }, { arbitrary: "unknown" }]) {
      expect(() => classifySessionCarrier({ ...writer, ...change }, selected)).toThrow("unsupported_carrier");
    }
    for (const missing of ["platform", "last_seen_at", "current_run"]) {
      const partial = Object.fromEntries(Object.entries(writer).filter(([key]) => key !== missing));
      expect(() => classifySessionCarrier(partial, selected)).toThrow("unsupported_carrier");
    }
  });
});

describe("legacy archive resume semantics", () => {
  const source = emptyTaskRecord({
    id: "retained",
    lifecycle_generation: 0,
    status: "completed",
    completedAt: "2026-10-01",
  });
  const reason = { locator: "history.md", revision: "owner-review" };
  const intent = {
    reason,
    archive_review: reason,
    next_owner_id: "completion-owner",
    next_action: "review whole Task acceptance",
  };
  const facts = [
    {
      field: "completedAt" as const,
      disposition: "source_snapshot" as const,
      owner_id: "original-owner",
      reason,
    },
  ];
  const projection = emptyTaskRecordV2({
    id: "retained",
    accepted_scope: reason,
  });
  it("keeps the same identity/generation and accepted scope without manufacturing an empty Delivery or completed Task", () => {
    const record = validateArchivedTaskResumeProjection(
      source,
      projection,
      facts,
      intent,
    );
    expect(record).toEqual(projection);
    expect(record.deliveries).toEqual([]);
    expect(record.completion_results).toEqual([]);
    expect(record.closure_results).toEqual([]);
    expect(() =>
      validateArchivedTaskResumeProjection(
        source,
        { ...projection, lifecycle_generation: 1 },
        facts,
        intent,
      ),
    ).toThrow("preserve lifecycle_generation");
  });
  it("requires explicit review and accepted scope, rejecting a formal archive rather than bypassing reopen", () => {
    expect(() =>
      validateArchivedTaskResumeProjection(source, projection, facts, {
        ...intent,
        next_owner_id: "",
      }),
    ).toThrow("resume_intent_required");
    expect(() =>
      validateArchivedTaskResumeProjection(
        source,
        { ...projection, accepted_scope: null },
        facts,
        intent,
      ),
    ).toThrow("accepted_scope_required");
    expect(() =>
      validateArchivedTaskResumeProjection(projection, projection, [], intent),
    ).toThrow("already_current");
    expect(() =>
      validateArchivedTaskResumeProjection(
        source,
        {
          ...projection,
          completion_results: [
            {
              result_id: "11111111-1111-4111-8111-111111111111",
              owner_id: "completion",
              evidence: [reason],
              lifecycle_generation: 0,
              accepted_scope: reason,
              delivery_result_ids: [],
              outcome: "completed",
            },
          ],
        },
        facts,
        intent,
      ),
    ).toThrow("formal_lifecycle_conflict");
  });
  it("rejects synthetic current Deliveries and inherited gate authority while retaining actual historical outcomes", () => {
    const delivery = {
      id: "11111111-1111-4111-8111-111111111111",
      lifecycle_generation: 0,
      scope_ref: { authority: reason, anchors: ["historical"] },
      planning_root: "deliveries/11111111-1111-4111-8111-111111111111",
      profile: "manual",
      phase: "planning",
      plan_ref: null,
      candidate: null,
      results: {
        planning: null,
        check: null,
        full_review: null,
        readiness: null,
      },
      publication_result: null,
      delivery_result: null,
      stop_result: null,
    };
    expect(() =>
      validateArchivedTaskResumeProjection(
        source,
        { ...projection, deliveries: [delivery] },
        facts,
        intent,
      ),
    ).toThrow("historical_outcome_required");
    const historical = {
      ...delivery,
      phase: "delivered",
      delivery_result: {
        result_id: "22222222-2222-4222-8222-222222222222",
        owner_id: "original-delivery-owner",
        evidence: [reason],
        profile: "manual",
        artifact: reason,
        candidate: {
          kind: "git_free",
          content_ref: `sha256:${"a".repeat(64)}`,
          paths: ["artifact.txt"],
          head_ref: null,
          base_ref: null,
        },
      },
    };
    expect(
      validateArchivedTaskResumeProjection(
        source,
        { ...projection, deliveries: [historical] },
        facts,
        intent,
      ).deliveries,
    ).toEqual([historical]);
    const gate = {
      result_id: "33333333-3333-4333-8333-333333333333",
      owner_role: "planning",
      owner_id: "old-planning-owner",
      outcome: "accepted",
      scope_ref: historical.scope_ref,
      plan_ref: reason,
      candidate: null,
      predecessor_result_id: null,
      obligations: [],
      evidence: [reason],
    };
    expect(() =>
      validateArchivedTaskResumeProjection(
        source,
        {
          ...projection,
          deliveries: [
            {
              ...historical,
              results: { ...historical.results, planning: gate },
            },
          ],
        },
        facts,
        intent,
      ),
    ).toThrow("inherited_gate_conflict");
  });
  it("matches only finite reviewed path aliases and exact identity generations", () => {
    const selected = {
      task_id: "retained",
      generation: 0,
      task_path: "/owner/.trellis/tasks/archive/2026-10/renamed",
      task_paths: ["/owner/.trellis/tasks/original"],
      carrier_workspace: "/owner",
    };
    expect(
      classifySessionCarrier(
        { current_task: ".trellis/tasks/original" },
        selected,
      ).matches,
    ).toBe(true);
    expect(
      classifySessionCarrier(
        { current_task: ".trellis/tasks/archive/2026-10/renamed" },
        selected,
      ).matches,
    ).toBe(true);
    expect(
      classifySessionCarrier(
        { current_task: ".trellis/tasks/renamed" },
        selected,
      ).matches,
    ).toBe(false);
    expect(() =>
      classifySessionCarrier(
        { current_task: ".trellis/tasks/archive/../other" },
        selected,
      ),
    ).toThrow("unsupported_carrier");
  });
});

import { describe, expect, it } from "vitest";
import {
  emptyTaskRecord,
  isKnownLegacyTaskRecord,
  taskRecordSchema,
  validateLegacyTaskProjection,
} from "../../src/task/index.js";

describe("explicit legacy task projection", () => {
  const current = emptyTaskRecord({
    id: "media-model-tiers",
    name: "media-model-tiers",
    title: "Media model",
    status: "planning",
    meta: { source: "TAPD-42" },
  });

  it("recognizes only old headers for reservation, excluding malformed current and unknown records", () => {
    const old = {
      id: "old-work",
      name: "old-work",
      title: "Old work",
      status: "planning",
      creator: "old",
      assignee: "old",
    };
    expect(isKnownLegacyTaskRecord(old)).toBe(true);
    expect(
      isKnownLegacyTaskRecord({
        ...old,
        subtasks: ["child"],
        meta: { business: "fact" },
      }),
    ).toBe(true);
    for (const value of [
      current,
      { ...old, source: { kind: "no_issue" } },
      { ...old, lifecycle_generation: -1 },
      { ...old, label: "unknown" },
      { ...old, id: "" },
      { ...old, subtasks: [42] },
      { id: "minimal", status: "planning" },
    ]) {
      expect(isKnownLegacyTaskRecord(value)).toBe(false);
    }
  });

  it("#1 migrates complete personnel records while the normal schema rejects them", () => {
    const base = Object.fromEntries(
      Object.entries(current).filter(
        ([key]) => key !== "lifecycle_generation" && key !== "source",
      ),
    );
    const legacy = { ...base, creator: "old", assignee: "old", subtasks: [] };
    expect(() => taskRecordSchema.parse(legacy)).toThrow();
    expect(validateLegacyTaskProjection(legacy, current)).toEqual(current);
    expect(() =>
      validateLegacyTaskProjection(legacy, { ...current, id: "replacement" }),
    ).toThrow("retain task.id");
  });

  it("#2 accepts reviewed missing-field completion with an unknown creation date", () => {
    const minimal = {
      id: current.id,
      name: current.name,
      title: current.title,
      status: "in_progress",
      creator: "old",
    };
    const projected = { ...current, status: "in_progress", createdAt: "" };
    expect(validateLegacyTaskProjection(minimal, projected).createdAt).toBe("");
    expect(() =>
      validateLegacyTaskProjection(minimal, {
        ...projected,
        lifecycle_generation: 1,
      }),
    ).toThrow("generation 0");
  });

  it("#3 requires lossless relation mapping and explicit unknown field disposition", () => {
    const legacy = {
      id: current.id,
      children: ["child-a"],
      subtasks: ["child-b"],
      old_label: "reviewed obsolete label",
    };
    expect(() => validateLegacyTaskProjection(legacy, current)).toThrow(
      "old_label",
    );
    expect(() =>
      validateLegacyTaskProjection(legacy, current, ["old_label"]),
    ).toThrow("lossless");
    const projected = { ...current, children: ["child-a", "child-b"] };
    expect(
      validateLegacyTaskProjection(legacy, projected, ["old_label"]).children,
    ).toEqual(projected.children);
  });

  it("#4 preserves business descriptions, metadata and delivery facts", () => {
    const legacy = {
      id: current.id,
      meta: current.meta,
      description: "Business facts",
      commit: "abc",
      pr_url: "https://github.com/example/app/pull/2",
    };
    expect(() => validateLegacyTaskProjection(legacy, current)).toThrow(
      "description",
    );
    expect(
      validateLegacyTaskProjection(legacy, {
        ...current,
        description: legacy.description,
        commit: legacy.commit,
        pr_url: legacy.pr_url,
      }).pr_url,
    ).toBe(legacy.pr_url);
  });
});

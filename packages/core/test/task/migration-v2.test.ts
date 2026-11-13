import { describe, expect, it } from "vitest";
import { emptyTaskRecord } from "../../src/task/schema.js";
import { emptyTaskRecordV2 } from "../../src/task/v2/operations.js";
import { validateTaskV2Projection } from "../../src/task/migration-v2.js";

describe("explicit Task schema migration", () => {
  const old = emptyTaskRecord({
    id: "migration",
    name: "Migration",
    status: "completed",
    commit: "historical",
    pr_url: "https://github.com/example/repo/pull/1",
    meta: { business: "facts" },
    lifecycle_generation: 2,
  });
  const metadata = Object.fromEntries(
    Object.entries(old).filter(
      ([key]) => !["status", "commit", "pr_url", "completedAt"].includes(key),
    ),
  ) as Omit<typeof old, "status" | "commit" | "pr_url" | "completedAt">;
  const projected = emptyTaskRecordV2(metadata);
  it("preserves metadata without turning legacy completed into lifecycle results", () => {
    const result = validateTaskV2Projection(old, projected);
    expect(result.completion_results).toEqual([]);
    expect(result.deliveries).toEqual([]);
    expect(result.meta).toEqual(old.meta);
  });
  it.each(["id", "source", "meta", "name", "lifecycle_generation"])(
    "rejects changed stable %s",
    (field) => {
      const changed = {
        ...projected,
        [field]:
          field === "source"
            ? {
                kind: "issue",
                repo_ref: "example/repo",
                number: 1,
                disposition: "exact_source",
              }
            : field === "meta"
              ? {}
              : field === "lifecycle_generation"
                ? 3
                : "changed",
      };
      expect(() => validateTaskV2Projection(old, changed)).toThrow("preserve");
    },
  );
  it("requires lossless old task tree and related-file evidence", () => {
    expect(() =>
      validateTaskV2Projection({ ...old, children: ["child"] }, projected),
    ).toThrow("lossless");
    expect(() =>
      validateTaskV2Projection({ ...old, relatedFiles: ["file"] }, projected),
    ).toThrow("relatedFiles");
  });
  it("does not introduce an arbitrary relocation origin through migration", () => {
    expect(() =>
      validateTaskV2Projection(old, {
        ...projected,
        artifact_origin: ".trellis/tasks/another-task",
      }),
    ).toThrow("explicit relocation");
  });
  it("does not add invented Task children to the preserved relation tree", () => {
    expect(() =>
      validateTaskV2Projection(old, {
        ...projected,
        children: ["invented-child"],
      }),
    ).toThrow("exact task tree");
  });
});

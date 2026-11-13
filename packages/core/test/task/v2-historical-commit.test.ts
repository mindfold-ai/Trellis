import { expect, it } from "vitest";
import { verifyHistoricalCommit, TaskV2Error } from "../../src/task/v2/index.js";

const commit = "a".repeat(40);
const evidence = [{ locator: "https://example.test/outcome", revision: "v1" }];
const candidate = { kind: "git", paths: ["payload.bin"], head_ref: commit, base_ref: null, content_ref: `sha256:${"0".repeat(64)}` };
const local = { result_id: "historical-result", owner_id: "original-producer", profile: "local_commit", evidence, candidate, commit };
function expectCode(fact: unknown, code: string): void {
  try {
    verifyHistoricalCommit("/unavailable-repository", fact);
    throw new Error("Unexpected verification success");
  } catch (error) {
    expect(error).toBeInstanceOf(TaskV2Error);
    expect((error as TaskV2Error).code).toBe(code);
  }
}
it.each([
  { ...local, extra: "not a typed delivery field" },
  { ...local, result_id: "" },
  { ...local, commit: "HEAD" },
  { ...local, candidate: { ...candidate, head_ref: "b".repeat(40) } },
  { ...local, candidate: { ...candidate, paths: ["payload.bin", "payload.bin"] } },
])("validates the closed delivery fact before accessing Git (%j)", (fact) => {
  expectCode(fact, "invalid_record");
});
it("rejects noncontained candidate paths before accessing Git", () => {
  expectCode({ ...local, candidate: { ...candidate, paths: ["../payload.bin"] } }, "invalid_locator");
});
it.each([
  { result_id: local.result_id, owner_id: local.owner_id, evidence, candidate, profile: "manual", artifact: evidence[0] },
  { result_id: local.result_id, owner_id: local.owner_id, evidence, candidate, profile: "pull_request", repo_ref: "castbox/Trellis", pr_number: 1, reviewed_head: commit, merge_commit: "b".repeat(40), target_ref: "main" },
])("does not claim historical commit verification for another delivery profile (%j)", (fact) => {
  expectCode(fact, "unsupported_fact_profile");
});

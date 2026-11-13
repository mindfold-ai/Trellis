import { describe, expect, it } from "vitest";

import { emptyTaskRecord, inferTaskPhase } from "../../src/task/index.js";

describe("inferTaskPhase", () => {
  it("maps canonical statuses to phases", () => {
    expect(inferTaskPhase("planning")).toBe("plan");
    expect(inferTaskPhase("in_progress")).toBe("implement");
    expect(inferTaskPhase("review")).toBe("review");
    expect(inferTaskPhase("completed")).toBe("completed");
    expect(inferTaskPhase("done")).toBe("completed");
  });

  it("accepts a TrellisTaskRecord and reads status", () => {
    expect(inferTaskPhase(emptyTaskRecord({ id: "example" }))).toBe("plan");
    expect(
      inferTaskPhase(emptyTaskRecord({ status: "in_progress" })),
    ).toBe("implement");
  });

  it("returns 'unknown' for unrecognized or missing statuses", () => {
    expect(inferTaskPhase("")).toBe("unknown");
    expect(inferTaskPhase("wat")).toBe("unknown");
    expect(inferTaskPhase(null)).toBe("unknown");
    expect(inferTaskPhase(undefined)).toBe("unknown");
  });
});

import { describe, expect, it } from "vitest";
import path from "node:path";
import { getInstallPath } from "../../src/utils/template-fetcher.js";

// =============================================================================
// getInstallPath — pure function (EASY)
// =============================================================================

describe("getInstallPath", () => {
  it("returns spec path for 'spec' type", () => {
    const result = getInstallPath("/project", "spec");
    expect(result).toBe(path.join("/project", ".trellis/spec"));
  });

  it("returns skill path for 'skill' type", () => {
    const result = getInstallPath("/project", "skill");
    expect(result).toBe(path.join("/project", ".agents/skills"));
  });

  it("returns command path for 'command' type", () => {
    const result = getInstallPath("/project", "command");
    expect(result).toBe(path.join("/project", ".claude/commands"));
  });

  it("returns project root for 'full' type", () => {
    const result = getInstallPath("/project", "full");
    expect(result).toBe(path.join("/project", "."));
  });

  it("falls back to spec path for unknown type", () => {
    const result = getInstallPath("/project", "unknown-type");
    expect(result).toBe(path.join("/project", ".trellis/spec"));
  });

  it("works with different cwd values", () => {
    const result = getInstallPath("/home/user/my-project", "spec");
    expect(result).toBe(path.join("/home/user/my-project", ".trellis/spec"));
  });
});

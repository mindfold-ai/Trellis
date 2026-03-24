import { describe, expect, it } from "vitest";
import { AI_TOOLS, type AITool } from "../../src/types/ai-tools.js";

const ALL_TOOL_IDS = Object.keys(AI_TOOLS) as AITool[];

// =============================================================================
// AI_TOOLS registry data integrity
// =============================================================================

describe("AI_TOOLS registry", () => {
  it("has at least one platform", () => {
    expect(ALL_TOOL_IDS.length).toBeGreaterThan(0);
  });

  it("every platform has all required fields", () => {
    for (const id of ALL_TOOL_IDS) {
      const config = AI_TOOLS[id];
      expect(config.name.length).toBeGreaterThan(0);
      expect(config.configDir.startsWith(".")).toBe(true);
      for (const extraPath of config.extraManagedPaths ?? []) {
        expect(extraPath.startsWith(".")).toBe(true);
      }
      expect(config.cliFlag.length).toBeGreaterThan(0);
      expect(config.templateDirs).toContain("common");
    }
  });
});

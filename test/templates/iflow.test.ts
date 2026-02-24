import { describe, expect, it } from "vitest";
import {
  settingsTemplate,
  getAllCommands,
  getAllAgents,
  getAllHooks,
  getSettingsTemplate,
} from "../../src/templates/iflow/index.js";

// =============================================================================
// settingsTemplate — module-level constant
// =============================================================================

describe("iflow settingsTemplate", () => {
  it("is valid JSON", () => {
    expect(() => JSON.parse(settingsTemplate)).not.toThrow();
  });

  it("is a non-empty string", () => {
    expect(settingsTemplate.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// getAllCommands — reads iflow command templates
// =============================================================================

describe("iflow getAllCommands", () => {
  it("returns commands from commands/trellis/ subdirectory", () => {
    // iflow getAllCommands now reads from commands/trellis/ subdirectory
    // This creates commands like /trellis:start, /trellis:finish-work, etc.
    const commands = getAllCommands();
    expect(commands.length).toBeGreaterThan(0);

    // Each command should have a name and content
    for (const command of commands) {
      expect(command.name.length).toBeGreaterThan(0);
      expect(command.content.length).toBeGreaterThan(0);
    }

    // Check for expected commands
    const commandNames = commands.map((c) => c.name);
    expect(commandNames).toContain("start");
    expect(commandNames).toContain("finish-work");
  });

});

// =============================================================================
// getAllAgents — reads iflow agent templates
// =============================================================================

describe("iflow getAllAgents", () => {
  it("each agent has name and content", () => {
    const agents = getAllAgents();
    for (const agent of agents) {
      expect(agent.name.length).toBeGreaterThan(0);
      expect(agent.content.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// getAllHooks — reads iflow hook templates
// =============================================================================

describe("iflow getAllHooks", () => {
  it("each hook has targetPath starting with hooks/ and content", () => {
    const hooks = getAllHooks();
    for (const hook of hooks) {
      expect(hook.targetPath.startsWith("hooks/")).toBe(true);
      expect(hook.content.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// getSettingsTemplate
// =============================================================================

describe("iflow getSettingsTemplate", () => {
  it("returns correct shape", () => {
    const result = getSettingsTemplate();
    expect(result.targetPath).toBe("settings.json");
    expect(result.content.length).toBeGreaterThan(0);
  });
});

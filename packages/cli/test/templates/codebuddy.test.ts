import { describe, expect, it } from "vitest";
import { getAllCommands } from "../../src/templates/codebuddy/index.js";

// CodeBuddy uses nested directories: commands/trellis/<name>.md
const EXPECTED_COMMAND_NAMES = [
  "before-dev",
  "brainstorm",
  "break-loop",
  "check-cross-layer",
  "check",
  "create-command",
  "finish-work",
  "integrate-skill",
  "onboard",
  "record-session",
  "start",
  "update-spec",
];

describe("codebuddy getAllCommands", () => {
  it("returns the expected command set", () => {
    const commands = getAllCommands();
    const names = commands.map((cmd) => cmd.name);
    expect(names).toEqual(EXPECTED_COMMAND_NAMES);
  });

  it("each command has name and content", () => {
    const commands = getAllCommands();
    for (const cmd of commands) {
      expect(cmd.name.length).toBeGreaterThan(0);
      expect(cmd.content.length).toBeGreaterThan(0);
    }
  });

  it("command names do not include .md extension", () => {
    const commands = getAllCommands();
    for (const cmd of commands) {
      expect(cmd.name).not.toContain(".md");
    }
  });
});

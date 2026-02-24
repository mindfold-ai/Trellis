import { describe, expect, it } from "vitest";
import { getAllCommands } from "../../src/templates/kilo/index.js";

const EXPECTED_COMMAND_NAMES = [
  "before-backend-dev",
  "before-frontend-dev",
  "brainstorm",
  "break-loop",
  "check-backend",
  "check-cross-layer",
  "check-frontend",
  "create-command",
  "finish-work",
  "integrate-skill",
  "onboard",
  "parallel",
  "record-session",
  "start",
  "update-spec",
];

describe("kilo getAllCommands", () => {
  it("returns the expected command set", () => {
    const commands = getAllCommands();
    const names = commands.map((c) => c.name);
    expect(names).toEqual(EXPECTED_COMMAND_NAMES);
  });

  it("each command has non-empty content", () => {
    const commands = getAllCommands();
    for (const command of commands) {
      expect(command.name.length).toBeGreaterThan(0);
      expect(command.content.length).toBeGreaterThan(0);
    }
  });
});

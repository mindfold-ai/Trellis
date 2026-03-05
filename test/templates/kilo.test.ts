import { describe, expect, it } from "vitest";
import { getAllWorkflows } from "../../src/templates/kilo/index.js";

const EXPECTED_WORKFLOW_NAMES = [
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

describe("kilo getAllWorkflows", () => {
  it("returns the expected workflow set", () => {
    const workflows = getAllWorkflows();
    const names = workflows.map((w) => w.name);
    expect(names).toEqual(EXPECTED_WORKFLOW_NAMES);
  });

  it("each workflow has non-empty content", () => {
    const workflows = getAllWorkflows();
    for (const workflow of workflows) {
      expect(workflow.name.length).toBeGreaterThan(0);
      expect(workflow.content.length).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  getTrellisTemplatePath,
  getClaudeTemplatePath,
  getOpenCodeTemplatePath,
  getPiTemplatePath,
  getPiSourcePath,
  getTrellisSourcePath,
  readTrellisFile,
  readTemplate,
  readScript,
  readMarkdown,
} from "../../src/templates/extract.js";

// =============================================================================
// getXxxTemplatePath — returns existing directory paths
// =============================================================================

describe("template path functions", () => {
  it("getTrellisTemplatePath returns existing directory", () => {
    const p = getTrellisTemplatePath();
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });

  it("getClaudeTemplatePath returns existing directory", () => {
    const p = getClaudeTemplatePath();
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });

  it("getOpenCodeTemplatePath returns existing directory", () => {
    const p = getOpenCodeTemplatePath();
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });

  it("getPiTemplatePath returns existing directory", () => {
    const p = getPiTemplatePath();
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });
});

// =============================================================================
// Deprecated aliases return same result
// =============================================================================

describe("deprecated source path aliases", () => {
  it("getTrellisSourcePath equals getTrellisTemplatePath", () => {
    expect(getTrellisSourcePath()).toBe(getTrellisTemplatePath());
  });

  it("getPiSourcePath equals getPiTemplatePath", () => {
    expect(getPiSourcePath()).toBe(getPiTemplatePath());
  });
});

// =============================================================================
// readTrellisFile — reads files from trellis template directory
// =============================================================================

describe("readTrellisFile", () => {
  it("reads workflow.yaml from trellis templates", () => {
    const content = readTrellisFile("workflow.yaml");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain("workflow_states:");
  });

  it("reads workflow body files from trellis templates", () => {
    const content = readTrellisFile("workflow/states/in_progress.md");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain("trellis-implement");
  });

  it("reads a script file", () => {
    const content = readTrellisFile("scripts/task.py");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
  });

  it("throws for nonexistent file", () => {
    expect(() => readTrellisFile("nonexistent.txt")).toThrow();
  });
});

// =============================================================================
// readTemplate — reads from category subdirectories
// =============================================================================

describe("readTemplate", () => {
  it("throws for nonexistent category/file", () => {
    expect(() => readTemplate("scripts", "nonexistent.txt")).toThrow();
  });
});

// =============================================================================
// readScript / readMarkdown helpers
// =============================================================================

describe("readScript", () => {
  it("reads a Python script from scripts/", () => {
    const content = readScript("task.py");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
  });
});

describe("readMarkdown", () => {
  it("reads workflow body markdown", () => {
    const content = readMarkdown("workflow/steps/2.1.md");
    expect(typeof content).toBe("string");
    expect(content).toContain("#");
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  getTrellisTemplatePath,
  getCursorTemplatePath,
  getClaudeTemplatePath,
  getOpenCodeTemplatePath,
  getIflowTemplatePath,
  getKiloTemplatePath,
  getTrellisSourcePath,
  getCursorSourcePath,
  getClaudeSourcePath,
  getIflowSourcePath,
  getOpenCodeSourcePath,
  readTrellisFile,
  readTemplate,
  readScript,
  readMarkdown,
  readCursorFile,
  readClaudeFile,
  readOpenCodeFile,
  readKiloFile,
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

  it("getCursorTemplatePath returns existing directory", () => {
    const p = getCursorTemplatePath();
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

  it("getIflowTemplatePath returns existing directory", () => {
    const p = getIflowTemplatePath();
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });

  it("getKiloTemplatePath returns existing directory", () => {
    const p = getKiloTemplatePath();
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

  it("getCursorSourcePath equals getCursorTemplatePath", () => {
    expect(getCursorSourcePath()).toBe(getCursorTemplatePath());
  });

  it("getClaudeSourcePath equals getClaudeTemplatePath", () => {
    expect(getClaudeSourcePath()).toBe(getClaudeTemplatePath());
  });

  it("getIflowSourcePath equals getIflowTemplatePath", () => {
    expect(getIflowSourcePath()).toBe(getIflowTemplatePath());
  });

  it("getOpenCodeSourcePath equals getOpenCodeTemplatePath", () => {
    expect(getOpenCodeSourcePath()).toBe(getOpenCodeTemplatePath());
  });
});

// =============================================================================
// readTrellisFile — reads files from trellis template directory
// =============================================================================

describe("readTrellisFile", () => {
  it("reads workflow.md from trellis templates", () => {
    const content = readTrellisFile("workflow.md");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain("#"); // markdown heading
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
// readScript — helper wrapping readTrellisFile
// =============================================================================

describe("readScript", () => {
  it("reads a Python script from scripts/", () => {
    const content = readScript("task.py");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// readMarkdown — helper wrapping readTrellisFile
// =============================================================================

describe("readMarkdown", () => {
  it("reads workflow.md", () => {
    const content = readMarkdown("workflow.md");
    expect(typeof content).toBe("string");
    expect(content).toContain("#");
  });
});

// =============================================================================
// Platform file readers
// =============================================================================

describe("readCursorFile", () => {
  it("reads a file from cursor templates", () => {
    // Cursor templates should have at least a commands directory
    const cursorPath = getCursorTemplatePath();
    const entries = fs.readdirSync(cursorPath);
    if (entries.length > 0) {
      // Find a readable file
      for (const entry of entries) {
        const fullPath = `${cursorPath}/${entry}`;
        if (fs.statSync(fullPath).isFile()) {
          const content = readCursorFile(entry);
          expect(typeof content).toBe("string");
          return;
        }
      }
    }
  });
});

describe("readClaudeFile", () => {
  it("reads settings.json from claude templates", () => {
    const content = readClaudeFile("settings.json");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
    // Should be valid JSON
    expect(() => JSON.parse(content)).not.toThrow();
  });
});

describe("readOpenCodeFile", () => {
  it("can read a file from opencode templates", () => {
    const opencodePath = getOpenCodeTemplatePath();
    const entries = fs.readdirSync(opencodePath);
    if (entries.length > 0) {
      for (const entry of entries) {
        const fullPath = `${opencodePath}/${entry}`;
        if (fs.statSync(fullPath).isFile()) {
          const content = readOpenCodeFile(entry);
          expect(typeof content).toBe("string");
          return;
        }
      }
    }
  });
});

describe("readKiloFile", () => {
  it("can read a file from kilo templates", () => {
    const kiloPath = getKiloTemplatePath();
    const entries = fs.readdirSync(kiloPath);
    if (entries.length > 0) {
      for (const entry of entries) {
        const fullPath = `${kiloPath}/${entry}`;
        if (fs.statSync(fullPath).isFile()) {
          const content = readKiloFile(entry);
          expect(typeof content).toBe("string");
          return;
        }
      }
    }
  });
});

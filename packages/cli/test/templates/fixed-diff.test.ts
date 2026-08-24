import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBundledSkillTemplates } from "../../src/templates/common/index.js";
import { getAllScripts } from "../../src/templates/trellis/index.js";

const pythonCmd = process.platform === "win32" ? "python" : "python3";

describe("generated templates pass fixed-diff checks", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-fixed-diff-"));
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relativePath: string, content: string): string {
    const absolutePath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf-8");
    return absolutePath;
  }

  function initializeDeveloper(): string {
    const scriptsDir = path.join(tmpDir, ".trellis", "scripts");
    for (const [relativePath, content] of getAllScripts()) {
      writeFile(path.join(".trellis", "scripts", relativePath), content);
    }

    execFileSync(
      pythonCmd,
      [path.join(scriptsDir, "init_developer.py"), "test-dev"],
      { cwd: tmpDir, stdio: "pipe" },
    );
    return fs.readFileSync(
      path.join(tmpDir, ".trellis", "workspace", "test-dev", "journal-1.md"),
      "utf-8",
    );
  }

  function writeAffectedBundledSkillFiles(): string[] {
    const affected = new Map([
      ["trellis-channel", new Set(["references/command-reference.md"])],
      [
        "trellis-meta",
        new Set(["references/local-architecture/workspace-memory.md"]),
      ],
    ]);
    const written: string[] = [];

    for (const skill of getBundledSkillTemplates()) {
      const selected = affected.get(skill.name);
      if (!selected) continue;
      for (const file of skill.files) {
        if (!selected.has(file.relativePath)) continue;
        const relativePath = path.join(
          ".agents",
          "skills",
          skill.name,
          file.relativePath,
        );
        writeFile(relativePath, file.content);
        written.push(relativePath);
      }
    }

    expect(written).toHaveLength(2);
    return written;
  }

  it("initial journal has exactly one final newline", () => {
    const journal = initializeDeveloper();

    expect(journal.endsWith("\n")).toBe(true);
    expect(journal.endsWith("\n\n")).toBe(false);
  });

  it("fresh affected files are clean when staged", () => {
    const bundledFiles = writeAffectedBundledSkillFiles();
    initializeDeveloper();
    const journalPath = path.join(
      ".trellis",
      "workspace",
      "test-dev",
      "journal-1.md",
    );

    execFileSync("git", ["add", "--", ...bundledFiles, journalPath], {
      cwd: tmpDir,
    });
    const fixedDiff = spawnSync("git", ["diff", "--cached", "--check"], {
      cwd: tmpDir,
      encoding: "utf-8",
    });

    expect(fixedDiff.status, `${fixedDiff.stdout}${fixedDiff.stderr}`).toBe(0);
  });
});

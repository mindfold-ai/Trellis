import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const cli = path.join(repoRoot, "packages/cli/bin/trellis.js");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("maintained quick-start commands", () => {
  for (const readme of ["README.md", "README_CN.md"]) {
    const commands = fs.readFileSync(path.join(repoRoot, readme), "utf8")
      .split("\n")
      .filter((line) => /^trellis init\b/.test(line));

    it(`${readme} includes executable initialization examples`, () => {
      expect(commands.length).toBeGreaterThan(0);
      for (const command of commands) {
        const args = command.trim().split(/\s+/).slice(1);
        expect(args).not.toContain("-u");
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-readme-init-"));
        temporaryDirectories.push(dir);
        // Keep the documented flags; --yes only supplies a noninteractive test mode.
        const result = spawnSync(process.execPath, [cli, ...args, "--yes"], {
          cwd: dir,
          encoding: "utf8",
          timeout: 20_000,
          env: { ...process.env, TRELLIS_CONTEXT_ID: "readme-fixture" },
        });
        expect(result.status, result.stderr || result.stdout).toBe(0);
        expect(fs.existsSync(path.join(dir, ".trellis/tasks/00-bootstrap-guidelines/task.json"))).toBe(true);
      }
    }, 30_000);
  }
});

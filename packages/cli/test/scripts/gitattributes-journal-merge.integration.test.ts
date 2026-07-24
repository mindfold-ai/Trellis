/**
 * Integration test for the `.gitattributes` "merge=union" rule shipped for
 * developer journal files under `.trellis/workspace/` (#415 quick-fix tier).
 *
 * Simulates two branches diverging from a common base, each appending a
 * different session block to the same journal file, then merges them with
 * real `git merge` — proving the union merge driver actually resolves the
 * append-only file cleanly. A parallel scenario on `index.md` (no attribute
 * applied) proves we did NOT accidentally cover it.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const GITATTRIBUTES_TEMPLATE = path.resolve(
  __dirname,
  "../../src/templates/trellis/gitattributes.txt",
);

function git(cwd: string, ...args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
}

function gitOk(cwd: string, ...args: string[]): string {
  const r = git(cwd, ...args);
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed (rc=${r.status}): ${r.stderr}`);
  }
  return r.stdout.trim();
}

describe("journal-*.md merge=union gitattributes rule", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-gitattr-merge-"));
    gitOk(tmp, "init", "-q", "-b", "main");
    gitOk(tmp, "config", "user.email", "test@example.com");
    gitOk(tmp, "config", "user.name", "Test");

    fs.copyFileSync(GITATTRIBUTES_TEMPLATE, path.join(tmp, ".gitattributes"));

    const workspaceDir = path.join(tmp, ".trellis", "workspace", "tester");
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(
      path.join(workspaceDir, "journal-1.md"),
      "# Journal - tester (Part 1)\n\n---\n\n## Session 1: base session\n\nbase content\n",
    );
    fs.writeFileSync(
      path.join(workspaceDir, "index.md"),
      "# Index\n\n@@@auto:current-status\n- Total Sessions: 1\n@@@/auto:current-status\n",
    );

    gitOk(tmp, "add", "-A");
    gitOk(tmp, "commit", "-q", "-m", "base");
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("does not apply merge=union to index.md", () => {
    const content = fs.readFileSync(path.join(tmp, ".gitattributes"), "utf-8");
    expect(content).toContain(".trellis/workspace/*/journal-*.md merge=union");
    expect(content).not.toMatch(/index\.md.*merge=union/);
  });

  it("merges two branches' appended journal sessions cleanly (no conflict markers)", () => {
    const journalPath = path.join(
      tmp,
      ".trellis",
      "workspace",
      "tester",
      "journal-1.md",
    );

    gitOk(tmp, "checkout", "-q", "-b", "branch-a");
    fs.appendFileSync(journalPath, "\n## Session 2: branch-a work\n\nfrom branch a\n");
    gitOk(tmp, "commit", "-aq", "-m", "session on branch-a");

    gitOk(tmp, "checkout", "-q", "main");
    gitOk(tmp, "checkout", "-q", "-b", "branch-b");
    fs.appendFileSync(journalPath, "\n## Session 2: branch-b work\n\nfrom branch b\n");
    gitOk(tmp, "commit", "-aq", "-m", "session on branch-b");

    const merge = git(tmp, "merge", "branch-a", "--no-edit");
    expect(merge.status).toBe(0);

    const merged = fs.readFileSync(journalPath, "utf-8");
    expect(merged).toContain("branch-a work");
    expect(merged).toContain("branch-b work");
    expect(merged).not.toContain("<<<<<<<");
    expect(merged).not.toContain(">>>>>>>");
  });

  it("still produces a normal git conflict on index.md for the same parallel-edit scenario", () => {
    const indexPath = path.join(
      tmp,
      ".trellis",
      "workspace",
      "tester",
      "index.md",
    );

    gitOk(tmp, "checkout", "-q", "-b", "branch-a");
    fs.writeFileSync(
      indexPath,
      "# Index\n\n@@@auto:current-status\n- Total Sessions: 2 (branch-a)\n@@@/auto:current-status\n",
    );
    gitOk(tmp, "commit", "-aq", "-m", "index update on branch-a");

    gitOk(tmp, "checkout", "-q", "main");
    gitOk(tmp, "checkout", "-q", "-b", "branch-b");
    fs.writeFileSync(
      indexPath,
      "# Index\n\n@@@auto:current-status\n- Total Sessions: 2 (branch-b)\n@@@/auto:current-status\n",
    );
    gitOk(tmp, "commit", "-aq", "-m", "index update on branch-b");

    const merge = git(tmp, "merge", "branch-a", "--no-edit");
    expect(merge.status).not.toBe(0);

    const conflicted = fs.readFileSync(indexPath, "utf-8");
    expect(conflicted).toContain("<<<<<<<");
    expect(conflicted).toContain(">>>>>>>");
  });
});

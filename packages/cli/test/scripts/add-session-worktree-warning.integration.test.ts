import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

it("retired recording in a linked worktree cannot inherit or change main-checkout history", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-retired-worktree-"));
  const main = path.join(tmp, "main");
  const linked = path.join(tmp, "linked");
  fs.mkdirSync(main);
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: main, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  };
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.test");
    git("commit", "--allow-empty", "-qm", "fixture");
    git("worktree", "add", "-qb", "linked", linked);
    const history = path.join(main, ".trellis/workspace/person");
    fs.mkdirSync(history, { recursive: true });
    fs.writeFileSync(path.join(main, ".trellis/.developer"), "name=main-private");
    fs.writeFileSync(path.join(history, "journal-1.md"), "main-history");
    const script = path.resolve(__dirname, "../../src/templates/trellis/scripts/add_session.py");
    const result = spawnSync("python3", [script, "--title", "Old caller"], { cwd: linked, encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("is retired");
    expect(result.stderr).not.toContain("main-private");
    expect(fs.existsSync(path.join(linked, ".trellis"))).toBe(false);
    expect(fs.readFileSync(path.join(history, "journal-1.md"), "utf8")).toBe("main-history");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

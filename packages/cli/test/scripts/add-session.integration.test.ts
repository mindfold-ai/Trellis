import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scripts = path.resolve(__dirname, "../../src/templates/trellis/scripts");
describe("retired identity and recording entry points", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-retired-entry-"));
    fs.mkdirSync(path.join(root, ".trellis/workspace/person"), { recursive: true });
    fs.writeFileSync(path.join(root, ".trellis/.developer"), "name=private-owner\n");
    fs.writeFileSync(path.join(root, ".trellis/workspace/person/journal-1.md"), "private-history");
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  it.each(["add_session.py", "init_developer.py", "get_developer.py"])("%s rejects stale callers without reads or writes", (script) => {
    const code = `
import builtins, pathlib, runpy, sys
target = ${JSON.stringify(path.join(scripts, script))}
def reject(*args, **kwargs):
    raise AssertionError('retired diagnostic accessed project data')
builtins.open = reject
pathlib.Path.open = reject
pathlib.Path.iterdir = reject
sys.argv = [target, '--title', 'old caller', '--stdin']
runpy.run_path(target, run_name='__main__')
`;
    const result = spawnSync("python3", ["-c", code], { cwd: root, encoding: "utf8", input: "ignored input" });
    expect(result.status, result.stderr).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("is retired");
    expect(result.stderr).not.toContain("private-owner");
    expect(fs.readFileSync(path.join(root, ".trellis/.developer"), "utf8")).toBe("name=private-owner\n");
    expect(fs.readFileSync(path.join(root, ".trellis/workspace/person/journal-1.md"), "utf8")).toBe("private-history");
    expect(fs.readdirSync(path.join(root, ".trellis"))).toEqual([".developer", "workspace"]);
  });
});

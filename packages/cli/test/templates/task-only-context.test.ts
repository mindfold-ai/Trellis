import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { collectPlatformTemplates, PLATFORM_IDS } from "../../src/configurators/index.js";
import { configYamlTemplate } from "../../src/templates/trellis/index.js";

const templateRoot = path.resolve(import.meta.dirname, "../../src/templates");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("task-only platform context", () => {
  it.each(PLATFORM_IDS)("%s provides task workflow instructions", (platform) => {
    const templates = collectPlatformTemplates(platform);
    expect(templates).toBeDefined();
    for (const [file, content] of templates ?? []) {
      if (/finish-work/.test(file)) {
        expect(content).toContain("task.py archive");
        expect(content).toContain("--no-commit");
      }
    }
  });

  it("ships only task archive configuration", () => {
    expect(configYamlTemplate).toContain("# task_auto_commit: true");
  });

  it("OpenCode compact state reports current work", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-opencode-task-only-"));
    temporaryDirectories.push(directory);
    fs.mkdirSync(path.join(directory, ".trellis/tasks"), { recursive: true });
    execFileSync("git", ["init", "-q", directory]);
    const sessionUtils = path.join(templateRoot, "opencode/lib/session-utils.js");
    const run = () => execFileSync(process.execPath, ["--input-type=module", "-e", `
import { pathToFileURL } from "node:url";
const { buildSessionContext } = await import(pathToFileURL(process.argv[1]));
const { TrellisContext } = await import(new URL("./trellis-context.js", pathToFileURL(process.argv[1])));
const context = buildSessionContext(new TrellisContext(process.argv[2]));
console.log(context);
`, sessionUtils, directory], { encoding: "utf8" });
    const baseline = run();
    expect(baseline).toContain("Project tasks: 0");
    fs.writeFileSync(path.join(directory, "current.txt"), "current work\n");
    expect(run()).toContain("dirty 1 paths");
  });

  it.each(["shared-hooks", "codex/hooks", "copilot/hooks"])(
    "%s compact state reports current work",
    (hookDirectory) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-hook-task-only-"));
      temporaryDirectories.push(directory);
      fs.mkdirSync(path.join(directory, ".trellis"));
      execFileSync("git", ["init", "-q", directory]);
      const hook = path.join(templateRoot, hookDirectory, "session-start.py");
      const run = () => execFileSync("python3", ["-c", `
import importlib.util, sys, types
from pathlib import Path
hook_path, root = sys.argv[1:]
spec = importlib.util.spec_from_file_location("hook", hook_path)
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)
common = types.ModuleType("common")
paths = types.ModuleType("common.paths")
paths.get_tasks_dir = lambda root: root / ".trellis" / "tasks"
tasks = types.ModuleType("common.tasks")
def iter_tasks(directory, repo_root):
    assert repo_root == Path(root)
    assert directory == repo_root / ".trellis" / "tasks"
    return iter(())
tasks.iter_active_tasks = iter_tasks
sys.modules.update({"common": common, "common.paths": paths, "common.tasks": tasks})
hook._resolve_active_task = lambda *args: types.SimpleNamespace(task_path=None)
print(hook._build_compact_current_state(Path(root) / ".trellis", {}, []))
`, hook, directory], { encoding: "utf8" });

      const baseline = run();
      expect(baseline).toContain("Project tasks: 0");
      expect(baseline).toContain("Current task: none");
      fs.writeFileSync(path.join(directory, "current.txt"), "current work\n");
      expect(run()).toContain("dirty 1 paths");
    },
  );
});

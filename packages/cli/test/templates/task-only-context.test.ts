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
  it.each(PLATFORM_IDS)("%s cannot regenerate retired workflow instructions", (platform) => {
    const templates = collectPlatformTemplates(platform);
    expect(templates).toBeDefined();
    for (const [file, content] of templates ?? []) {
      expect(file).not.toMatch(/record-session|workspace-index|workspace-memory/);
      expect(content, `${platform}: ${file}`).not.toMatch(
        /get_active_journal_file|get_developer\(|init_developer\.py|add_session\.py|--mode record|--mine\b|session_commit_message|max_journal_lines/,
      );
      if (/finish-work/.test(file)) {
        expect(content).toContain("task.py archive");
        expect(content).toContain("--no-commit");
        expect(content).not.toMatch(/journal|My active tasks/i);
      }
    }
  });

  it("ships only task archive configuration", () => {
    expect(configYamlTemplate).toContain("# task_auto_commit: true");
    expect(configYamlTemplate).not.toMatch(/session_auto_commit|session_commit_message|max_journal_lines/);
  });

  it("OpenCode compact state ignores history while reporting current work", () => {
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
    expect(baseline).not.toMatch(/Developer:|Journal:/);
    fs.mkdirSync(path.join(directory, ".trellis/workspace/alice"), { recursive: true });
    fs.writeFileSync(path.join(directory, ".trellis/workspace/alice/journal-1.md"), "history\n");
    fs.writeFileSync(path.join(directory, ".trellis/.developer"), "name=alice\n");
    fs.mkdirSync(path.join(directory, ".trellis/agent-traces"));
    fs.writeFileSync(path.join(directory, ".trellis/agent-traces/trace.md"), "predecessor history\n");
    fs.mkdirSync(path.join(directory, ".trellis/.backup-old/nested"), { recursive: true });
    const backup = path.join(directory, ".trellis/.backup-old/nested/arbitrary.md");
    fs.writeFileSync(backup, "backup history\n");
    expect(run()).toBe(baseline);
    execFileSync("git", ["-C", directory, "add", ".trellis"]);
    expect(run()).toBe(baseline);
    fs.writeFileSync(backup, "changed backup history\n");
    expect(run()).toBe(baseline);
    expect(fs.readFileSync(backup, "utf8")).toBe("changed backup history\n");
    fs.writeFileSync(path.join(directory, "current.txt"), "current work\n");
    expect(run()).toContain("dirty 1 paths");
  });

  it.each(["shared-hooks", "codex/hooks", "copilot/hooks"])(
    "%s compact state works without retired Python APIs and ignores dirty history",
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
original_read = Path.read_text
original_iter = Path.iterdir
accesses = []
def guard(path):
    if path.name == ".developer" or "workspace" in path.parts or "agent-traces" in path.parts or any(part.startswith(".backup-") for part in path.parts):
        accesses.append(str(path))
def read(path, *args, **kwargs):
    guard(path)
    return original_read(path, *args, **kwargs)
def iterate(path):
    guard(path)
    return original_iter(path)
Path.read_text = read
Path.iterdir = iterate
print(hook._build_compact_current_state(Path(root) / ".trellis", {}, []))
assert not accesses, accesses
`, hook, directory], { encoding: "utf8" });

      const baseline = run();
      expect(baseline).toContain("Project tasks: 0");
      expect(baseline).toContain("Current task: none");
      expect(baseline).not.toMatch(/Developer:|Journal:/);
      fs.mkdirSync(path.join(directory, ".trellis/workspace/alice"), { recursive: true });
      const journal = path.join(directory, ".trellis/workspace/alice/journal-1.md");
      fs.writeFileSync(journal, "historical evidence\n");
      fs.writeFileSync(path.join(directory, ".trellis/.developer"), "name=alice\n");
      fs.mkdirSync(path.join(directory, ".trellis/agent-traces"));
      const trace = path.join(directory, ".trellis/agent-traces/trace.md");
      fs.writeFileSync(trace, "predecessor evidence\n");
      fs.mkdirSync(path.join(directory, ".trellis/.backup-old/nested"), { recursive: true });
      const backup = path.join(directory, ".trellis/.backup-old/nested/arbitrary.md");
      fs.writeFileSync(backup, "backup history\n");
      expect(run()).toBe(baseline);
      execFileSync("git", ["-C", directory, "add", ".trellis"]);
      expect(run()).toBe(baseline);
      fs.writeFileSync(journal, "changed historical evidence\n");
      fs.writeFileSync(trace, "changed predecessor evidence\n");
      fs.writeFileSync(backup, "changed backup history\n");
      expect(run()).toBe(baseline);
      fs.writeFileSync(path.join(directory, "current.txt"), "current work\n");
      expect(run()).toContain("dirty 1 paths");
      expect(fs.readFileSync(journal, "utf8")).toBe("changed historical evidence\n");
      expect(fs.readFileSync(backup, "utf8")).toBe("changed backup history\n");
    },
  );
});

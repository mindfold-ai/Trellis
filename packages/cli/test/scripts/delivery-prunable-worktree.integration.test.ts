import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scripts = path.resolve(__dirname, "../../src/templates/trellis/scripts");
const workflow = path.resolve(
  __dirname,
  "../../src/templates/trellis/workflow-delivery-v1.md",
);
const python = process.platform === "darwin" ? "/usr/bin/python3" : "python3";
const available = spawnSync(python, ["--version"]).status === 0;
const context = "prunable-worktree-test";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
function install(root: string): void {
  fs.mkdirSync(path.join(root, ".trellis"), { recursive: true });
  fs.cpSync(scripts, path.join(root, ".trellis/scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".trellis/workflow.md"),
    fs.readFileSync(workflow),
  );
}
function run(root: string, entry: string, args: string[]) {
  return spawnSync(python, [`.trellis/scripts/${entry}.py`, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      TRELLIS_CONTEXT_ID: context,
      PYTHONDONTWRITEBYTECODE: "1",
    },
  });
}
function ok(root: string, entry: string, args: string[]): string {
  const result = run(root, entry, args);
  expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
  return result.stdout;
}
function snapshot(
  root: string,
): Record<string, { bytes: string; mode: number }> {
  const files: Record<string, { bytes: string; mode: number }> = {};
  function visit(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else
        files[path.relative(root, file)] = {
          bytes: fs.readFileSync(file).toString("base64"),
          mode: fs.statSync(file).mode,
        };
    }
  }
  visit(root);
  return files;
}

describe.skipIf(!available)(
  "registered prunable worktree session discovery",
  () => {
    let temporary: string;
    let main: string;
    let live: string;
    let stale: string;
    let taskRef: string;
    beforeEach(() => {
      temporary = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "trellis-prunable-")),
      );
      main = path.join(temporary, "main");
      live = path.join(temporary, "live sibling");
      stale = path.join(temporary, "stale sibling");
      fs.mkdirSync(main);
      git(main, "init", "-q", "-b", "main");
      git(
        main,
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--allow-empty",
        "-qm",
        "Initial",
      );
      for (const [root, branch] of [
        [live, "live"],
        [stale, "stale"],
      ]) {
        git(main, "worktree", "add", "-q", "-b", branch, root);
        install(root);
      }
      install(main);
      const invocationWorkflow = path.join(main, ".trellis/workflow.md");
      fs.writeFileSync(
        invocationWorkflow,
        fs
          .readFileSync(invocationWorkflow, "utf8")
          .replace(
            /\[trellis-continuation\][\s\S]*?\[\/trellis-continuation\]/,
            "[trellis-continuation]\nInvocation-only owner must not be selected.\n[/trellis-continuation]",
          ),
      );
      ok(live, "task", [
        "create",
        "Selected task",
        "--description",
        "Exact selected identity",
        "--task-id",
        "selected-task",
        "--slug",
        "selected-task",
        "--schema-version",
        "2.0",
        "--no-start",
      ]);
      taskRef = `.trellis/tasks/${fs.readdirSync(path.join(live, ".trellis/tasks")).find((name) => name.endsWith("-selected-task"))}`;
      ok(live, "task", ["start", taskRef, "--allow-empty-context"]);
    });
    afterEach(() => fs.rmSync(temporary, { recursive: true, force: true }));

    function loseGitEntry(root = stale): void {
      fs.unlinkSync(path.join(root, ".git"));
      const listing = git(main, "worktree", "list", "--porcelain");
      expect(listing).toContain(`worktree ${root}`);
      expect(listing).toContain(
        "prunable gitdir file points to non-existent location",
      );
    }
    function assertSelected(): void {
      const current = JSON.parse(ok(main, "task", ["current", "--json"]));
      expect(current.current_task).toMatchObject({
        id: "selected-task",
        lifecycle_generation: 0,
      });
      expect(current.task_workspace_root).toBe(live);
      const delivery = JSON.parse(ok(main, "delivery", ["current", "--json"]));
      expect(delivery).toMatchObject({
        kind: "no_current_delivery",
        key: { task_id: "selected-task", lifecycle_generation: 0 },
      });
      const body = fs
        .readFileSync(workflow, "utf8")
        .split("[trellis-continuation]\n")[1]
        .split("[/trellis-continuation]")[0];
      expect(ok(main, "get_context", ["--mode", "continuation"])).toBe(body);
    }

    it("ignores an explicitly prunable sibling with retained Trellis data and no Git entry, without writes", () => {
      const retained = path.join(stale, ".trellis/tasks/old/task.json");
      fs.mkdirSync(path.dirname(retained), { recursive: true });
      fs.writeFileSync(retained, "{invalid retained historical data");
      fs.chmodSync(retained, 0o640);
      loseGitEntry();
      const before = snapshot(temporary);
      assertSelected();
      expect(snapshot(temporary)).toEqual(before);
    });

    it("keeps a selected Task in a prunable worktree stale instead of selecting another Task", () => {
      ok(main, "task", [
        "create",
        "Other",
        "--description",
        "Unrelated task",
        "--slug",
        "other",
        "--schema-version",
        "2.0",
        "--no-start",
      ]);
      loseGitEntry(live);
      const before = snapshot(temporary);
      for (const [entry, args] of [
        ["task", ["current", "--json"]],
        ["delivery", ["current", "--json"]],
        ["get_context", ["--mode", "continuation"]],
      ] as const) {
        const result = run(main, entry, [...args]);
        expect(result.status).toBe(1);
        expect(result.stderr + result.stdout).toContain("stale_task_identity");
        expect(result.stdout).not.toContain('"kind": "no_current_task"');
      }
      expect(snapshot(temporary)).toEqual(before);
    });

    it("does not ignore a registered sibling whose Git entry exists but is corrupt", () => {
      fs.writeFileSync(
        path.join(stale, ".git"),
        `gitdir: ${path.join(temporary, "missing-gitdir")}\n`,
      );
      const before = snapshot(temporary);
      const result = run(main, "task", ["current", "--json"]);
      expect(result.status).toBe(1);
      expect(result.stderr + result.stdout).toContain("git_discovery_failed");
      expect(result.stderr + result.stdout).toContain(stale);
      expect(snapshot(temporary)).toEqual(before);
    });

    it("rejects a registered location reused as a foreign repository", () => {
      fs.unlinkSync(path.join(stale, ".git"));
      git(stale, "init", "-q", "-b", "foreign");
      const before = snapshot(temporary);
      const result = run(main, "task", ["current", "--json"]);
      expect(result.status).toBe(1);
      expect(result.stderr + result.stdout).toContain("common_dir_mismatch");
      expect(snapshot(temporary)).toEqual(before);
    });

    it("rejects generation drift on a valid selected sibling even beside a prunable sibling", () => {
      loseGitEntry();
      const file = path.join(live, taskRef, "task.json");
      const record = JSON.parse(fs.readFileSync(file, "utf8"));
      record.lifecycle_generation = 1;
      fs.writeFileSync(file, JSON.stringify(record));
      const before = snapshot(temporary);
      const result = run(main, "task", ["current", "--json"]);
      expect(result.status).toBe(1);
      expect(result.stderr + result.stdout).toContain(
        "stale_lifecycle_generation",
      );
      expect(snapshot(temporary)).toEqual(before);
    });

    it("retains discovery errors for an absent Git entry without the Git prunable marker", () => {
      loseGitEntry();
      const result = spawnSync(
        python,
        [
          "-c",
          `
from pathlib import Path
from common import session_storage as storage
original = storage._git
def git(root, *args):
    output = original(root, *args)
    if args == ('worktree', 'list', '--porcelain', '-z'):
        output = '\\0'.join(field for field in output.split('\\0') if not field.startswith('prunable '))
    return output
storage._git = git
storage.workspace_roots(storage.repository_facts(Path.cwd()))
`,
        ],
        {
          cwd: main,
          encoding: "utf8",
          env: {
            ...process.env,
            PYTHONPATH: path.join(main, ".trellis/scripts"),
            PYTHONDONTWRITEBYTECODE: "1",
          },
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("git_discovery_failed");
      expect(result.stderr).toContain(stale);
    });

    it("fails before session resolution when Git inventory discovery itself fails", () => {
      const before = snapshot(temporary);
      const result = spawnSync(
        python,
        [
          "-c",
          `
from pathlib import Path
from common import session_storage as storage
original = storage._git
def git(root, *args):
    if args == ('worktree', 'list', '--porcelain', '-z'):
        raise storage.SessionBindingError('git_discovery_failed: controlled inventory failure')
    return original(root, *args)
storage._git = git
storage.repository_facts(Path.cwd())
`,
        ],
        {
          cwd: main,
          encoding: "utf8",
          env: {
            ...process.env,
            PYTHONPATH: path.join(main, ".trellis/scripts"),
            PYTHONDONTWRITEBYTECODE: "1",
          },
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "git_discovery_failed: controlled inventory failure",
      );
      expect(snapshot(temporary)).toEqual(before);
    });

    it("rejects a corrupt invoking Git worktree rather than treating it as unbound", () => {
      fs.writeFileSync(
        path.join(live, ".git"),
        `gitdir: ${path.join(temporary, "missing-invocation-gitdir")}\n`,
      );
      const before = snapshot(temporary);
      const result = run(live, "task", ["current", "--json"]);
      expect(result.status).toBe(1);
      expect(result.stderr + result.stdout).toContain("git_discovery_failed");
      expect(snapshot(temporary)).toEqual(before);
    });
  },
);

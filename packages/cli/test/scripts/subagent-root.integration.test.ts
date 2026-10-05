import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getSharedHookScripts } from "../../src/templates/shared-hooks/index.js";
import { getAllScripts } from "../../src/templates/trellis/index.js";

const TASK_REF = ".trellis/tasks/issue-635";
const pythonCmd = process.platform === "win32" ? "python" : "python3";

describe("subagent hook Trellis root discovery (#635)", () => {
  let base: string;
  let root: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-hook-root-"));
    root = path.join(base, "project");
    fs.mkdirSync(root);
    const hook = getSharedHookScripts().find(
      (entry) => entry.name === "inject-subagent-context.py",
    );
    if (!hook) throw new Error("Missing generated subagent context hook");
    writeFile(".claude/hooks/inject-subagent-context.py", hook.content);
    writeFile(".codex/hooks/inject-subagent-context.py", hook.content);
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  function writeFile(relativePath: string, content: string): void {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf-8");
  }

  function setupTask(): void {
    for (const [relativePath, content] of getAllScripts()) {
      writeFile(`.trellis/scripts/${relativePath}`, content);
    }
    writeFile(`${TASK_REF}/task.json`, '{"status":"in_progress"}\n');
    writeFile(`${TASK_REF}/prd.md`, "PARENT_TRELLIS_TASK_PRD\n");
    for (const platform of ["claude", "codex"]) {
      writeFile(
        `.trellis/.runtime/sessions/${platform}_root-parent.json`,
        JSON.stringify({ current_task: TASK_REF, platform }),
      );
    }
  }

  function runHook(platform: "claude" | "codex", cwd: string): string {
    const payload =
      platform === "codex"
        ? {
            hook_event_name: "SubagentStart",
            agent_type: "trellis-implement",
            session_id: "root-parent",
            cwd,
          }
        : {
            hook_event_name: "PreToolUse",
            tool_name: "Agent",
            session_id: "root-parent",
            cwd,
            tool_input: {
              subagent_type: "trellis-implement",
              prompt: `Active task: ${TASK_REF}\nImplement the scoped task`,
            },
          };
    const result = spawnSync(
      pythonCmd,
      [path.join(root, `.${platform}/hooks/inject-subagent-context.py`)],
      {
        cwd,
        input: JSON.stringify(payload),
        encoding: "utf-8",
        env: { ...process.env, TRELLIS_HOOKS: "1", TRELLIS_DISABLE_HOOKS: "0" },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  }

  it.each([
    ["ordinary Git root", true, false],
    ["Trellis root without Git", false, false],
    ["nested child Git repository", false, true],
    ["nested Git repository under a Git root", true, true],
  ] as const)("injects task context from %s", (_name, rootGit, childGit) => {
    setupTask();
    if (rootGit) {
      expect(spawnSync("git", ["init", "-q", root]).status).toBe(0);
    }
    let cwd = root;
    if (childGit) {
      cwd = path.join(root, "packages", "app");
      fs.mkdirSync(cwd, { recursive: true });
      expect(spawnSync("git", ["init", "-q", cwd]).status).toBe(0);
    }
    for (const platform of ["claude", "codex"] as const) {
      const rawOutput = runHook(platform, cwd);
      expect(rawOutput).toContain("PARENT_TRELLIS_TASK_PRD");
      const output = JSON.parse(rawOutput) as {
        hookSpecificOutput: {
          additionalContext?: string;
          updatedInput?: { prompt: string };
        };
      };
      const context =
        output.hookSpecificOutput.additionalContext ??
        output.hookSpecificOutput.updatedInput?.prompt;
      expect(context).toContain("PARENT_TRELLIS_TASK_PRD");
      expect(context).toContain(`${TASK_REF}/prd.md`);
    }
  });

  it("prefers a nearer nested Trellis root over the parent task", () => {
    setupTask();
    const child = path.join(root, "packages", "app");
    fs.mkdirSync(child, { recursive: true });
    fs.cpSync(path.join(root, ".trellis"), path.join(child, ".trellis"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(child, TASK_REF, "prd.md"),
      "CHILD_TRELLIS_TASK_PRD\n",
      "utf-8",
    );
    for (const platform of ["claude", "codex"] as const) {
      const output = runHook(platform, child);
      expect(output).toContain("CHILD_TRELLIS_TASK_PRD");
      expect(output).not.toContain("PARENT_TRELLIS_TASK_PRD");
    }
  });

  it.each([false, true])(
    "does not inject into a Git root without a Trellis directory (file: %s)",
    (trellisFile) => {
      expect(spawnSync("git", ["init", "-q", root]).status).toBe(0);
      if (trellisFile) writeFile(".trellis", "not a workflow directory\n");
      for (const platform of ["claude", "codex"] as const) {
        expect(runHook(platform, root)).toBe("");
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "injects through a directory symlink for .trellis",
    () => {
      setupTask();
      const store = path.join(base, "shared-workflow");
      fs.renameSync(path.join(root, ".trellis"), store);
      fs.symlinkSync(store, path.join(root, ".trellis"), "dir");
      for (const platform of ["claude", "codex"] as const) {
        expect(runHook(platform, root)).toContain("PARENT_TRELLIS_TASK_PRD");
      }
    },
  );
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectPlatformTemplates } from "../../src/configurators/index.js";
import { getAllScripts } from "../../src/templates/trellis/index.js";

const TASK_DIR = ".trellis/tasks/issue-634";
const HOOK = ".claude/hooks/inject-subagent-context.py";
const SESSION = ".trellis/.runtime/sessions/claude_research-test.json";
const pythonCmd = process.platform === "win32" ? "python" : "python3";

describe("research prompt output scope (#634)", () => {
  let tmpDir: string;

  function writeFile(relativePath: string, content: string): void {
    const target = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }

  function setTask(taskDir: string): void {
    writeFile(
      SESSION,
      JSON.stringify({ current_task: taskDir, platform: "claude" }),
    );
  }

  function dispatch(
    toolName: string,
    contextKey = "claude_research-test",
    sessionId: string | null = "research-test",
  ): string {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TRELLIS_CONTEXT_ID: contextKey,
    };
    if (sessionId === null) delete env.CLAUDE_CODE_SESSION_ID;
    const result = spawnSync(pythonCmd, [path.join(tmpDir, HOOK)], {
      cwd: tmpDir,
      encoding: "utf-8",
      env,
      input: JSON.stringify({
        cwd: tmpDir,
        ...(sessionId === null ? {} : { session_id: sessionId }),
        hook_event_name: "PreToolUse",
        tool_name: toolName,
        tool_input: {
          subagent_type: "trellis-research",
          prompt: "Find the existing task persistence contract.",
        },
      }),
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    return result.stdout.trim();
  }

  function promptFrom(output: string): string {
    const parsed = JSON.parse(output) as {
      hookSpecificOutput: { updatedInput: { prompt: string } };
    };
    return parsed.hookSpecificOutput.updatedInput.prompt;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-research-prompt-"));
    expect(spawnSync("git", ["init", "-q", tmpDir]).status).toBe(0);
    const platformFiles = collectPlatformTemplates("claude-code");
    if (!platformFiles) throw new Error("Claude templates are unavailable");
    for (const [filePath, content] of platformFiles)
      writeFile(filePath, content);
    for (const [filePath, content] of getAllScripts()) {
      writeFile(`.trellis/scripts/${filePath}`, content);
    }
    writeFile(`${TASK_DIR}/prd.md`, "# Task persistence\n");
    setTask(TASK_DIR);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.each(["Task", "Agent"])(
    "%s dispatch permits only task research outputs",
    (toolName) => {
      const settings = JSON.parse(
        fs.readFileSync(path.join(tmpDir, ".claude/settings.json"), "utf-8"),
      ) as {
        hooks: {
          PreToolUse: { matcher: string; hooks: { command: string }[] }[];
        };
      };
      expect(
        settings.hooks.PreToolUse.some(
          (registration) =>
            registration.matcher === toolName &&
            registration.hooks.some((hook) => hook.command.includes(HOOK)),
        ),
      ).toBe(true);

      const prompt = promptFrom(dispatch(toolName));
      expect(prompt).toContain(
        `one markdown file per topic under \`${TASK_DIR}/research/*.md\``,
      );
      expect(prompt).toContain(
        `**Forbidden writes**: Any file outside \`${TASK_DIR}/research/\``,
      );
      expect(prompt).toContain("Do not run git operations.");
      expect(prompt).toContain(
        "Reply with only the written paths and a one-line summary per file",
      );
      expect(prompt).not.toContain("- Modify any files");
      expect(prompt).toContain("Find the existing task persistence contract.");
    },
  );

  it("requires an output destination when no task is active", () => {
    fs.unlinkSync(path.join(tmpDir, SESSION));
    const prompt = promptFrom(dispatch("Task"));
    expect(prompt).toContain("task.py current --source");
    expect(prompt).toContain("ask the user where to write output");
    expect(prompt).toContain(
      "Do not guess a destination or write files until the output directory is resolved",
    );
    expect(prompt).not.toContain("**Allowed writes**");
    expect(prompt).not.toContain(`${TASK_DIR}/research`);
  });

  it("does not borrow another window's task for an unmatched parent identity", () => {
    const prompt = promptFrom(dispatch("Agent", "claude_other-parent"));
    expect(prompt).toContain("ask the user where to write output");
    expect(prompt).not.toContain("**Allowed writes**");
    expect(prompt).not.toContain(`${TASK_DIR}/research`);
  });

  it("does not borrow another window's task for an unmatched payload session", () => {
    const prompt = promptFrom(dispatch("Task", "", "other-parent"));
    expect(prompt).not.toContain("**Allowed writes**");
    expect(prompt).not.toContain(`${TASK_DIR}/research`);
  });

  it("retains single-session fallback for an identity-less caller", () => {
    const prompt = promptFrom(dispatch("Task", "", null));
    expect(prompt).toContain(`${TASK_DIR}/research/*.md`);
  });

  it("does not grant writes through an outside-repository task pointer", () => {
    setTask("../");
    expect(dispatch("Agent")).toBe("");
  });

  it("does not grant writes to a deleted task", () => {
    setTask(".trellis/tasks/deleted");
    expect(dispatch("Task")).toBe("");
  });

  it("keeps all shared-hook dogfood copies in sync", () => {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../..",
    );
    const shared = fs.readFileSync(
      path.join(
        repoRoot,
        "packages/cli/src/templates/shared-hooks/inject-subagent-context.py",
      ),
      "utf-8",
    );
    for (const platform of [".claude", ".cursor", ".codex"]) {
      expect(
        fs.readFileSync(
          path.join(repoRoot, platform, "hooks/inject-subagent-context.py"),
          "utf-8",
        ),
        platform,
      ).toBe(shared);
    }
  });
});

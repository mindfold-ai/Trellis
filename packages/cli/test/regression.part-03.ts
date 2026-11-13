// Mechanical split of regression.test.ts; imported by the canonical test entry.

import { execFileSync, execSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task";
import { getAllHooks as getCodexHooks } from "../src/templates/codex/index.js";
import { getAllHooks as getCopilotHooks } from "../src/templates/copilot/index.js";
import {
  getSharedHookScripts,
  SHARED_HOOKS_BY_PLATFORM,
} from "../src/templates/shared-hooks/index.js";
import { getAllScripts } from "../src/templates/trellis/index.js";
import {
  collectPlatformTemplates,
  resolveCliFlag,
} from "../src/configurators/index.js";
import { TrellisContext } from "../src/templates/opencode/lib/trellis-context.js";
describe("regression: current-task path normalization", () => {
  let tmpDir: string;
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  const claudeSessionStart = getSharedHookScripts().find(
    (hook) => hook.name === "session-start.py",
  )?.content;
  const codexSessionStart = getCodexHooks().find(
    (hook) => hook.name === "session-start.py",
  )?.content;
  const copilotSessionStart = getCopilotHooks().find(
    (hook) => hook.name === "session-start.py",
  )?.content;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-current-task-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTrellisScripts(): void {
    const scriptsDir = path.join(tmpDir, ".trellis", "scripts");
    for (const [relativePath, content] of getAllScripts()) {
      const absPath = path.join(scriptsDir, relativePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, "utf-8");
    }
  }

  function writeProjectFile(relativePath: string, content: string): void {
    const absPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, "utf-8");
  }

  function writeLegacyCurrentTask(taskRef: string): void {
    writeProjectFile(path.join(".trellis", ".current-task"), `${taskRef}\n`);
  }

  function sessionContextPath(contextKey: string): string {
    const gitCommonDir = spawnSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: tmpDir,
      encoding: "utf-8",
      env: sessionEnv(),
    });
    if (gitCommonDir.status === 0) {
      return path.join(
        path.resolve(tmpDir, gitCommonDir.stdout.trim()),
        "trellis",
        "sessions",
        `${contextKey}.json`,
      );
    }
    return path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      "sessions",
      `${contextKey}.json`,
    );
  }

  function writeSessionContext(contextKey: string, taskRef: string): void {
    const taskId = taskRef
      .replaceAll("\\", "/")
      .split("/")
      .filter(Boolean)
      .at(-1);
    if (!taskId) throw new Error(`Invalid task fixture ref: ${taskRef}`);
    const contextPath = sessionContextPath(contextKey);
    fs.mkdirSync(path.dirname(contextPath), { recursive: true });
    fs.writeFileSync(
      contextPath,
      JSON.stringify(
        { schema_version: 2, task_id: taskId, lifecycle_generation: 0 },
        null,
        2,
      ),
      "utf-8",
    );
  }

  const SESSION_ENV_KEYS = [
    "TRELLIS_CONTEXT_ID",
    "CLAUDE_SESSION_ID",
    "CLAUDE_CODE_SESSION_ID",
    "CODEX_SESSION_ID",
    "CODEX_THREAD_ID",
    "CURSOR_SESSION_ID",
    "CURSOR_CONVERSATION_ID",
    "CURSOR_CONVERSATIONID",
    "OPENCODE_SESSION_ID",
    "OPENCODE_SESSIONID",
    "OPENCODE_RUN_ID",
    "GEMINI_SESSION_ID",
    "FACTORY_SESSION_ID",
    "DROID_SESSION_ID",
    "QODER_SESSION_ID",
    "CODEBUDDY_SESSION_ID",
    "KIRO_SESSION_ID",
    "COPILOT_SESSION_ID",
    "COPILOT_SESSIONID",
    "PI_SESSION_ID",
    "CLAUDE_TRANSCRIPT_PATH",
    "CODEX_TRANSCRIPT_PATH",
    "CURSOR_TRANSCRIPT_PATH",
    "GEMINI_TRANSCRIPT_PATH",
    "FACTORY_TRANSCRIPT_PATH",
    "DROID_TRANSCRIPT_PATH",
    "QODER_TRANSCRIPT_PATH",
    "CODEBUDDY_TRANSCRIPT_PATH",
  ] as const;

  function sessionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    const blocked = new Set<string>(SESSION_ENV_KEYS);
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!blocked.has(key)) {
        env[key] = value;
      }
    }
    return { ...env, ...overrides };
  }

  function initializeHookGitRepo(): void {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        [
          "PATH",
          "Path",
          "SYSTEMROOT",
          "SystemRoot",
          "WINDIR",
          "PATHEXT",
        ].includes(key),
      ),
    );
    execFileSync("git", ["init", "-q", "--template="], {
      cwd: tmpDir,
      env: {
        ...env,
        HOME: tmpDir,
        USERPROFILE: tmpDir,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: path.join(tmpDir, "absent-gitconfig"),
      },
    });
  }

  function setupTaskRepo(): void {
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", "custom-note"),
      "fixture=active\n",
    );
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Workflow\n");
    writeProjectFile(
      path.join(".trellis", "spec", "guides", "index.md"),
      "# Guides\n",
    );
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "task.json"),
      JSON.stringify(
        {
          ...emptyTaskRecord({ id: "issue-106" }),
          id: "issue-106",
          name: "issue-106",
          lifecycle_generation: 0,
          children: [],
          title: "Issue 106 task",
          status: "in_progress",
          package: null,
        },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "prd.md"),
      "# PRD\n",
    );
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "implement.jsonl"),
      '{"file":"src/example.ts","reason":"runtime regression"}\n',
    );
  }

  function runPython(
    relativeScriptPath: string,
    input?: string,
    envOverrides: NodeJS.ProcessEnv = {},
  ): string {
    const scriptPath = path.join(tmpDir, relativeScriptPath);
    return execSync(`${pythonCmd} ${JSON.stringify(scriptPath)}`, {
      cwd: tmpDir,
      input,
      encoding: "utf-8",
      env: sessionEnv(envOverrides),
    });
  }

  function runPythonWithLegacyStdinLocale(
    relativeScriptPath: string,
    input: string,
  ): string {
    const scriptPath = path.join(tmpDir, relativeScriptPath);
    const result = spawnSync(
      pythonCmd,
      [
        "-c",
        "import runpy, sys; sys.stdout.reconfigure(encoding='utf-8', errors='replace'); runpy.run_path(sys.argv[1], run_name='__main__')",
        scriptPath,
      ],
      {
        cwd: tmpDir,
        input,
        encoding: "utf-8",
        env: sessionEnv({ PYTHONIOENCODING: "gbk" }),
      },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr);
    }
    return result.stdout;
  }

  function expectTemplateContent(
    content: string | undefined,
    label: string,
  ): string {
    expect(content, `${label} template should exist`).toBeTruthy();
    return content ?? "";
  }

  // ------------------------------------------------------------
  // Single-session fallback (issue #225 — class-2 sub-agents)
  // ------------------------------------------------------------

  function runTaskCurrent(envOverrides: NodeJS.ProcessEnv = {}): {
    output: string;
    status: number;
  } {
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    let output = "";
    let status = 0;
    try {
      output = execSync(
        `${pythonCmd} ${JSON.stringify(taskScriptPath)} current --source`,
        {
          cwd: tmpDir,
          encoding: "utf-8",
          env: sessionEnv(envOverrides),
        },
      );
    } catch (error) {
      status =
        typeof (error as { status?: unknown }).status === "number"
          ? (error as { status: number }).status
          : 1;
      output = String((error as { stdout?: unknown }).stdout ?? "");
    }
    return { output, status };
  }

  // ------------------------------------------------------------
  // inject-workflow-state.py hook (workflow-enforcement-v2)
  // ------------------------------------------------------------

  const injectWorkflowStateScript = getSharedHookScripts().find(
    (hook) => hook.name === "inject-workflow-state.py",
  )?.content;

  function writeWorkflowStateHook(): void {
    writeProjectFile(
      path.join(".trellis", "hooks", "inject-workflow-state.py"),
      expectTemplateContent(injectWorkflowStateScript, "inject-workflow-state"),
    );
  }

  function setStatus(status: string): void {
    const taskJsonPath = path.join(
      tmpDir,
      ".trellis",
      "tasks",
      "issue-106",
      "task.json",
    );
    const data = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8")) as {
      status: string;
    };
    data.status = status;
    fs.writeFileSync(taskJsonPath, JSON.stringify(data, null, 2));
  }

  function writeWorkflowMd(body: string): void {
    writeProjectFile(path.join(".trellis", "workflow.md"), body);
  }

  function runInjectWorkflowState(cwdOverride?: string): string {
    return runInjectWorkflowStateWithInput({
      cwd: cwdOverride ?? tmpDir,
      session_id: "workflow-a",
    });
  }

  function runInjectWorkflowStateWithInput(inputData: object): string {
    return runPython(
      path.join(".trellis", "hooks", "inject-workflow-state.py"),
      JSON.stringify(inputData),
    );
  }

  // Every platform that declares the shell-session hook must actually resolve
  // identity, not merely have the script on disk. Both the platform list and
  // each platform's hook install path are derived from the registry, so
  // platform #8 gets this coverage by being added to the table.
  //
  // NOTE: none of these hosts is installed in CI. "End to end" here means the
  // real hook script and the real task.py driven with a simulated payload of
  // the shape that platform's config subscribes to — not a live CLI.
  describe("[session-current-task] shell-ticket bridge, per declaring platform", () => {
    const SHELL_HOOK = "inject-shell-session-context.py";
    const WORKFLOW_HOOK = "inject-workflow-state.py";
    const SESSION_START_HOOK = "session-start.py";

    const declaringPlatforms = Object.entries(SHARED_HOOKS_BY_PLATFORM)
      .filter(([, hooks]) => hooks.includes(SHELL_HOOK))
      .map(([platform]) => platform);

    function templatesFor(platform: string): Map<string, string> {
      const tool = resolveCliFlag(platform);
      if (!tool) throw new Error(`${platform} matches no AI_TOOLS cliFlag`);
      const files = collectPlatformTemplates(tool);
      if (!files) throw new Error(`${platform} collects no templates`);
      return files;
    }

    function installPath(
      files: Map<string, string>,
      hookName: string,
    ): string | undefined {
      return [...files.keys()].find((p) => p.endsWith(`/${hookName}`));
    }

    function requireInstallPath(
      files: Map<string, string>,
      hookName: string,
      platform: string,
    ): string {
      const found = installPath(files, hookName);
      if (!found) {
        throw new Error(
          `${platform} declares ${hookName} but installs it nowhere`,
        );
      }
      return found;
    }

    function writeSharedHook(hookPath: string, hookName: string): void {
      writeProjectFile(
        hookPath,
        expectTemplateContent(
          getSharedHookScripts().find((h) => h.name === hookName)?.content,
          hookName,
        ),
      );
    }

    /** sessionEnv() plus a scrub of the <PLATFORM>_PROJECT_DIR family: a dev
     *  running this suite inside any AI host exports one, and the hooks check
     *  that family before falling back to their own script path. Matched by
     *  suffix rather than listed, so a new host cannot quietly break this. */
    function hookEnv(): NodeJS.ProcessEnv {
      return Object.fromEntries(
        Object.entries(sessionEnv()).filter(
          ([key]) => !key.endsWith("_PROJECT_DIR"),
        ),
      );
    }

    it("at least one platform declares the shell-session hook", () => {
      // Guards the loop below from silently becoming a no-op.
      expect(declaringPlatforms.length).toBeGreaterThan(0);
    });

    for (const platform of declaringPlatforms) {
      it(`${platform}: hook writes a ticket, task.py start consumes it, the platform's own hook reads the same key`, () => {
        setupTaskRepo();
        const files = templatesFor(platform);
        const hookPath = requireInstallPath(files, SHELL_HOOK, platform);
        writeSharedHook(hookPath, SHELL_HOOK);

        // Which payload shape to send is read off the config we actually ship
        // for this platform, not assumed.
        const registrations = [...files].filter(
          ([p, c]) => !p.endsWith(".md") && c.includes(`hooks/${SHELL_HOOK}`),
        );
        const isShellExecutionEvent = registrations.some(([, c]) =>
          c.includes("beforeShellExecution"),
        );

        const sessionId = `e2e-${platform}`;
        const command = `${pythonCmd} ./.trellis/scripts/task.py start .trellis/tasks/issue-106`;
        const payload = isShellExecutionEvent
          ? { session_id: sessionId, cwd: tmpDir, command }
          : {
              session_id: sessionId,
              cwd: tmpDir,
              tool_name: "Bash",
              tool_input: { command },
            };

        const hookOutput = execSync(
          `${pythonCmd} ${JSON.stringify(path.join(tmpDir, hookPath))}`,
          {
            cwd: tmpDir,
            input: JSON.stringify(payload),
            encoding: "utf-8",
            env: hookEnv(),
          },
        );
        // A shell-execution host wants a permission decision; a tool-call host
        // reads a schema this hook has no opinion on, so it says nothing.
        if (isShellExecutionEvent) {
          expect(JSON.parse(hookOutput) as { permission?: string }).toEqual({
            permission: "allow",
          });
        } else {
          expect(hookOutput.trim()).toBe("");
        }

        const ticketDir = path.join(
          tmpDir,
          ".trellis",
          ".runtime",
          "shell-tickets",
        );
        const [ticketName] = fs.readdirSync(ticketDir);
        const ticket = JSON.parse(
          fs.readFileSync(path.join(ticketDir, ticketName), "utf-8"),
        ) as { context_key: string };
        expect(ticket.context_key).toBeTruthy();

        const startOutput = execSync(
          `${pythonCmd} ${JSON.stringify(path.join(tmpDir, ".trellis", "scripts", "task.py"))} start ${JSON.stringify(".trellis/tasks/issue-106")}`,
          { cwd: tmpDir, encoding: "utf-8", env: hookEnv() },
        );
        expect(startOutput).toContain(`Source: session:${ticket.context_key}`);
        expect(
          fs.existsSync(
            path.join(
              tmpDir,
              ".trellis",
              ".runtime",
              "sessions",
              `${ticket.context_key}.json`,
            ),
          ),
        ).toBe(true);

        // A second session file switches off the single-session fallback, so
        // the platform's own hook can only find the task by computing exactly
        // the same context key the ticket carried. That agreement is the whole
        // point: a ticket keyed differently writes a file no hook ever reads.
        writeSessionContext("decoy_other_window", ".trellis/tasks/issue-106");

        // Whichever context hook this platform ships. The per-turn breadcrumb
        // names the task directory; session-start names its title.
        const workflowHookPath = installPath(files, WORKFLOW_HOOK);
        const contextHook = workflowHookPath
          ? { path: workflowHookPath, name: WORKFLOW_HOOK, needle: "issue-106" }
          : {
              path: requireInstallPath(files, SESSION_START_HOOK, platform),
              name: SESSION_START_HOOK,
              needle: "Issue 106 task",
            };
        writeSharedHook(contextHook.path, contextHook.name);
        const contextOutput = execSync(
          `${pythonCmd} ${JSON.stringify(path.join(tmpDir, contextHook.path))}`,
          {
            cwd: tmpDir,
            input: JSON.stringify({
              session_id: sessionId,
              cwd: tmpDir,
              hook_event_name: "UserPromptSubmit",
            }),
            encoding: "utf-8",
            env: hookEnv(),
          },
        );
        expect(
          contextOutput,
          `${platform}'s ${contextHook.name} did not resolve the task the ticket set — its context key disagrees with the ticket's`,
        ).toContain(contextHook.needle);
      });
    }

    it("a ticket from another session never resolves for this one", () => {
      setupTaskRepo();
      const platform = declaringPlatforms[0];
      const files = templatesFor(platform);
      const hookPath = requireInstallPath(files, SHELL_HOOK, platform);
      writeSharedHook(hookPath, SHELL_HOOK);
      const command = `${pythonCmd} ./.trellis/scripts/task.py start .trellis/tasks/issue-106`;

      // Two windows, same repo, same subcommand, both tickets fresh.
      for (const sessionId of ["window-a", "window-b"]) {
        execSync(
          `${pythonCmd} ${JSON.stringify(path.join(tmpDir, hookPath))}`,
          {
            cwd: tmpDir,
            input: JSON.stringify({
              session_id: sessionId,
              cwd: tmpDir,
              tool_name: "Bash",
              tool_input: { command },
            }),
            encoding: "utf-8",
            env: hookEnv(),
          },
        );
      }
      expect(
        fs.readdirSync(
          path.join(tmpDir, ".trellis", ".runtime", "shell-tickets"),
        ),
      ).toHaveLength(2);

      const startOutput = execSync(
        `${pythonCmd} ${JSON.stringify(path.join(tmpDir, ".trellis", "scripts", "task.py"))} start ${JSON.stringify(".trellis/tasks/issue-106")}`,
        { cwd: tmpDir, encoding: "utf-8", env: hookEnv() },
      );
      // Degraded, never a guess: two candidate keys means neither wins.
      expect(startOutput).not.toContain("Source: session:");
      expect(
        fs.existsSync(path.join(tmpDir, ".trellis", ".runtime", "sessions")),
      ).toBe(false);
    });

    it("a payload carrying neither command shape is a silent no-op, not an exception", () => {
      // This hook runs on a pre-tool event. On several hosts a non-zero exit
      // or a stderr splat blocks the tool call, so an unrecognized payload
      // must cost nothing.
      setupTaskRepo();
      const platform = declaringPlatforms[0];
      const hookPath = requireInstallPath(
        templatesFor(platform),
        SHELL_HOOK,
        platform,
      );
      writeSharedHook(hookPath, SHELL_HOOK);

      const payloads = [
        JSON.stringify({ session_id: "s", cwd: tmpDir }), // no command at all
        JSON.stringify({
          session_id: "s",
          cwd: tmpDir,
          tool_input: "not-a-dict",
        }),
        JSON.stringify({
          session_id: "s",
          cwd: tmpDir,
          tool_input: { file_path: "a.ts" },
        }),
        JSON.stringify({
          session_id: "s",
          cwd: tmpDir,
          tool_input: { command: "git status" },
        }),
        JSON.stringify([1, 2, 3]), // valid JSON, wrong root type
        "not json at all",
        "",
      ];
      for (const input of payloads) {
        const result = spawnSync(pythonCmd, [path.join(tmpDir, hookPath)], {
          cwd: tmpDir,
          input,
          encoding: "utf-8",
          env: hookEnv(),
        });
        expect(result.status, `payload ${input} should exit 0`).toBe(0);
        expect(result.stdout.trim(), `payload ${input} should stay quiet`).toBe(
          "",
        );
        expect(result.stderr.trim()).toBe("");
      }
      expect(
        fs.existsSync(
          path.join(tmpDir, ".trellis", ".runtime", "shell-tickets"),
        ),
      ).toBe(false);
    });

    it("tickets left in the pre-0.6.13 cursor-shell directory are still honored", () => {
      // Migration decision: write the new directory, read both. An upgrade
      // mid-command would otherwise drop one command into degraded mode on
      // Cursor — the one platform this bridge already worked for.
      setupTaskRepo();
      const now = Date.now() / 1000;
      writeProjectFile(
        path.join(".trellis", ".runtime", "cursor-shell", "legacy.json"),
        JSON.stringify({
          platform: "cursor",
          context_key: "cursor_legacy-window",
          cwd: tmpDir,
          command: "task.py start .trellis/tasks/issue-106",
          subcommands: [
            { name: "start", task_ref: ".trellis/tasks/issue-106" },
          ],
          created_at_epoch: now,
          expires_at_epoch: now + 30,
        }),
      );

      const startOutput = execSync(
        `${pythonCmd} ${JSON.stringify(path.join(tmpDir, ".trellis", "scripts", "task.py"))} start ${JSON.stringify(".trellis/tasks/issue-106")}`,
        { cwd: tmpDir, encoding: "utf-8", env: hookEnv() },
      );
      expect(startOutput).toContain("Source: session:cursor_legacy-window");
    });
  });

  it("[session-current-task] Cursor preToolUse injects context for custom Task subagents", () => {
    setupTaskRepo();
    initializeHookGitRepo();
    const injectSubagentContextScript = getSharedHookScripts().find(
      (hook) => hook.name === "inject-subagent-context.py",
    )?.content;
    writeProjectFile(
      path.join(".cursor", "hooks", "inject-subagent-context.py"),
      expectTemplateContent(
        injectSubagentContextScript,
        "inject-subagent-context hook",
      ),
    );
    writeSessionContext("cursor_parent-a", ".trellis/tasks/issue-106");

    const unicodePrompt = "检查测试质量。\n第二行 TOKEN_CURSOR_HOOK_TEST";
    const hookOutput = runPythonWithLegacyStdinLocale(
      path.join(".cursor", "hooks", "inject-subagent-context.py"),
      JSON.stringify({
        cursor_version: "3.2.11",
        hook_event_name: "preToolUse",
        tool_name: "Subagent",
        tool_input: {
          prompt: unicodePrompt,
          subagent_type: {
            custom: {
              name: "trellis-implement",
            },
          },
        },
        conversation_id: "parent-a",
        cwd: tmpDir,
      }),
    );

    const parsed = JSON.parse(hookOutput) as {
      permission?: string;
      updated_input?: { prompt?: string };
      hookSpecificOutput?: { updatedInput?: { prompt?: string } };
    };
    const prompt = parsed.updated_input?.prompt ?? "";

    expect(parsed.permission).toBe("allow");
    expect(prompt).toContain(
      "=== .trellis/tasks/issue-106/prd.md (Requirements) ===",
    );
    expect(prompt).toContain(unicodePrompt);
    expect(parsed.hookSpecificOutput?.updatedInput?.prompt).toBe(prompt);
  });

  it("[session-current-task] CodeBuddy preToolUse injects context for subagent_name Task subagents", () => {
    // CodeBuddy's Task tool names its sub-agent parameter `subagent_name`
    // (not `subagent_type`). The shared hook must accept both spellings.
    setupTaskRepo();
    initializeHookGitRepo();
    const injectSubagentContextScript = getSharedHookScripts().find(
      (hook) => hook.name === "inject-subagent-context.py",
    )?.content;
    writeProjectFile(
      path.join(".codebuddy", "hooks", "inject-subagent-context.py"),
      expectTemplateContent(
        injectSubagentContextScript,
        "inject-subagent-context hook",
      ),
    );
    writeSessionContext("codebuddy_parent-a", ".trellis/tasks/issue-106");
    // Decoy: CodeBuddy exports CLAUDE_PROJECT_DIR as a compatibility alias
    // alongside its own variable, so a hook that probes the alias first
    // resolves the key `claude_parent-a` and reads THIS pointer instead. Both
    // files use the same session id on purpose — that is what the real host
    // produces, and it is why the collision is invisible without a decoy.
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-999", "task.json"),
      JSON.stringify(
        {
          ...emptyTaskRecord({ id: "issue-999" }),
          id: "issue-999",
          name: "issue-999",
          lifecycle_generation: 0,
          title: "Wrong task",
          status: "in_progress",
        },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-999", "prd.md"),
      "# Wrong task\n\nTOKEN_WRONG_TASK_MUST_NOT_APPEAR\n",
    );
    writeSessionContext("claude_parent-a", ".trellis/tasks/issue-999");

    const unicodePrompt = "检查测试质量。\n第二行 TOKEN_CODEBUDDY_HOOK_TEST";
    const hookOutput = runPython(
      path.join(".codebuddy", "hooks", "inject-subagent-context.py"),
      JSON.stringify({
        hook_event_name: "preToolUse",
        tool_name: "task",
        tool_input: {
          prompt: unicodePrompt,
          subagent_name: "trellis-implement",
        },
        session_id: "parent-a",
        cwd: tmpDir,
      }),
      // Both variables are set, as CodeBuddy really does. Setting only
      // CODEBUDDY_PROJECT_DIR would keep the test hermetic but let a wrong
      // probe order pass, which is how the ordering bug survived here after
      // it was fixed in the other two shared hooks.
      { CODEBUDDY_PROJECT_DIR: tmpDir, CLAUDE_PROJECT_DIR: tmpDir },
    );

    const parsed = JSON.parse(hookOutput) as {
      permission?: string;
      updated_input?: { prompt?: string };
      hookSpecificOutput?: { updatedInput?: { prompt?: string } };
    };
    const prompt = parsed.updated_input?.prompt ?? "";

    expect(parsed.permission).toBe("allow");
    expect(prompt).toContain(
      "=== .trellis/tasks/issue-106/prd.md (Requirements) ===",
    );
    expect(prompt).not.toContain("TOKEN_WRONG_TASK_MUST_NOT_APPEAR");
    expect(prompt).toContain(unicodePrompt);
    expect(parsed.hookSpecificOutput?.updatedInput?.prompt).toBe(prompt);
  });

  it("[session-current-task] Cursor generic subagents do not receive Trellis jsonl injection", () => {
    setupTaskRepo();
    initializeHookGitRepo();
    const injectSubagentContextScript = getSharedHookScripts().find(
      (hook) => hook.name === "inject-subagent-context.py",
    )?.content;
    writeProjectFile(
      path.join(".cursor", "hooks", "inject-subagent-context.py"),
      expectTemplateContent(
        injectSubagentContextScript,
        "inject-subagent-context hook",
      ),
    );
    writeSessionContext("cursor_parent-a", ".trellis/tasks/issue-106");

    const hookOutput = runPython(
      path.join(".cursor", "hooks", "inject-subagent-context.py"),
      JSON.stringify({
        cursor_version: "3.2.11",
        hook_event_name: "preToolUse",
        tool_name: "Subagent",
        tool_input: {
          prompt: "Report whether TOKEN_CURSOR_HOOK_TEST is visible.",
          subagent_type: "generalPurpose",
        },
        conversation_id: "parent-a",
        cwd: tmpDir,
      }),
    );

    expect(hookOutput.trim()).toBe("");
  });

  it("[codex-native-subagents] SubagentStart injects a marker and the valid parent task", () => {
    setupTaskRepo();
    initializeHookGitRepo();
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "implement.jsonl"),
      '{"file":"src/implement-context.md","reason":"implement contract"}\n',
    );
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "design.md"),
      "TOKEN_CODEX_DESIGN\n",
    );
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "implement.md"),
      "TOKEN_CODEX_PLAN\n",
    );
    writeProjectFile("src/implement-context.md", "TOKEN_CODEX_IMPLEMENT\n");
    writeSessionContext("codex_parent-a", ".trellis/tasks/issue-106");
    const injectSubagentContextScript = getSharedHookScripts().find(
      (hook) => hook.name === "inject-subagent-context.py",
    )?.content;
    const hookPath = path.join(".codex", "hooks", "inject-subagent-context.py");
    writeProjectFile(
      hookPath,
      expectTemplateContent(
        injectSubagentContextScript,
        "codex inject-subagent-context hook",
      ),
    );

    const output = runPython(
      hookPath,
      JSON.stringify({
        hook_event_name: "SubagentStart",
        agent_type: "trellis-implement",
        session_id: "parent-a",
        cwd: tmpDir,
      }),
    );
    const parsed = JSON.parse(output) as {
      hookSpecificOutput?: {
        hookEventName?: string;
        additionalContext?: string;
      };
    };
    const context = parsed.hookSpecificOutput?.additionalContext ?? "";

    expect(parsed.hookSpecificOutput?.hookEventName).toBe("SubagentStart");
    expect(context).toContain("<!-- trellis-hook-injected -->");
    expect(context).toContain("Trellis Native Implement Subagent");
    expect(context).toContain("`trellis-implement` role");
    expect(context).toContain("Active task: .trellis/tasks/issue-106");
    expect(context).toContain("TOKEN_CODEX_IMPLEMENT");
    expect(context).toContain("TOKEN_CODEX_DESIGN");
    expect(context).toContain("TOKEN_CODEX_PLAN");
  });

  it("[codex-native-subagents] implement and check preserve curated context before task artifacts", () => {
    setupTaskRepo();
    initializeHookGitRepo();
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "implement.jsonl"),
      '{"file":"src/implement-order.md","reason":"implement ordering"}\n',
    );
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "check.jsonl"),
      '{"file":"src/check-order.md","reason":"check ordering"}\n',
    );
    writeProjectFile("src/implement-order.md", "TOKEN_IMPLEMENT_ORDER\n");
    writeProjectFile("src/check-order.md", "TOKEN_CHECK_ORDER\n");
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "prd.md"),
      "TOKEN_PRD_ORDER\n",
    );
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "design.md"),
      "TOKEN_DESIGN_ORDER\n",
    );
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "implement.md"),
      "TOKEN_PLAN_ORDER\n",
    );
    writeSessionContext("codex_parent-order", ".trellis/tasks/issue-106");
    const injectSubagentContextScript = getSharedHookScripts().find(
      (hook) => hook.name === "inject-subagent-context.py",
    )?.content;
    const hookPath = path.join(".codex", "hooks", "inject-subagent-context.py");
    writeProjectFile(
      hookPath,
      expectTemplateContent(
        injectSubagentContextScript,
        "codex inject-subagent-context hook",
      ),
    );

    for (const [agentType, curatedToken] of [
      ["trellis-implement", "TOKEN_IMPLEMENT_ORDER"],
      ["trellis-check", "TOKEN_CHECK_ORDER"],
    ] as const) {
      const output = runPython(
        hookPath,
        JSON.stringify({
          hook_event_name: "SubagentStart",
          agent_type: agentType,
          session_id: "parent-order",
          cwd: tmpDir,
        }),
      );
      const parsed = JSON.parse(output) as {
        hookSpecificOutput: { additionalContext: string };
      };
      const context = parsed.hookSpecificOutput.additionalContext;
      const positions = [
        context.indexOf(curatedToken),
        context.indexOf("TOKEN_PRD_ORDER"),
        context.indexOf("TOKEN_DESIGN_ORDER"),
        context.indexOf("TOKEN_PLAN_ORDER"),
      ];

      for (const position of positions) {
        expect(position).toBeGreaterThanOrEqual(0);
      }
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it("[codex-native-subagents] research gets its task path without implement or check manifests", () => {
    setupTaskRepo();
    initializeHookGitRepo();
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "implement.jsonl"),
      '{"file":"src/implement-private.md","reason":"must stay isolated"}\n',
    );
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "check.jsonl"),
      '{"file":"src/check-private.md","reason":"must stay isolated"}\n',
    );
    writeProjectFile("src/implement-private.md", "TOKEN_IMPLEMENT_PRIVATE\n");
    writeProjectFile("src/check-private.md", "TOKEN_CHECK_PRIVATE\n");
    writeSessionContext("codex_research-parent", ".trellis/tasks/issue-106");
    const injectSubagentContextScript = getSharedHookScripts().find(
      (hook) => hook.name === "inject-subagent-context.py",
    )?.content;
    const hookPath = path.join(".codex", "hooks", "inject-subagent-context.py");
    writeProjectFile(
      hookPath,
      expectTemplateContent(
        injectSubagentContextScript,
        "codex inject-subagent-context hook",
      ),
    );

    const output = runPython(
      hookPath,
      JSON.stringify({
        hook_event_name: "SubagentStart",
        agent_type: "trellis-research",
        session_id: "research-parent",
        cwd: tmpDir,
      }),
    );
    const parsed = JSON.parse(output) as {
      hookSpecificOutput: { additionalContext: string };
    };
    const context = parsed.hookSpecificOutput.additionalContext;

    expect(context).toContain("Active task: .trellis/tasks/issue-106");
    expect(context).toContain("Project Spec Directory Structure");
    expect(context).not.toContain("TOKEN_IMPLEMENT_PRIVATE");
    expect(context).not.toContain("TOKEN_CHECK_PRIVATE");
    expect(context).not.toContain("implement.jsonl");
    expect(context).not.toContain("check.jsonl");
  });

  it("[codex-native-subagents] unknown or malformed parents never borrow a sole session task", () => {
    setupTaskRepo();
    initializeHookGitRepo();
    writeSessionContext("codex_unrelated", ".trellis/tasks/issue-106");
    const injectSubagentContextScript = getSharedHookScripts().find(
      (hook) => hook.name === "inject-subagent-context.py",
    )?.content;
    const hookPath = path.join(".codex", "hooks", "inject-subagent-context.py");
    writeProjectFile(
      hookPath,
      expectTemplateContent(
        injectSubagentContextScript,
        "codex inject-subagent-context hook",
      ),
    );

    for (const sessionId of ["missing-parent", { id: "malformed" }, "  "]) {
      const output = runPython(
        hookPath,
        JSON.stringify({
          hook_event_name: "SubagentStart",
          agent_type: "trellis-implement",
          session_id: sessionId,
          cwd: tmpDir,
        }),
      );
      expect(output.trim()).toBe("");
    }
  });

  it("[codex-native-subagents] parent session isolates concurrent tasks and ignores inherited context", () => {
    setupTaskRepo();
    initializeHookGitRepo();
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "implement.jsonl"),
      '{"file":"src/session-a.md","reason":"session A only"}\n',
    );
    writeProjectFile("src/session-a.md", "TOKEN_CODEX_SESSION_A\n");
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-107", "task.json"),
      JSON.stringify(
        {
          ...emptyTaskRecord({ id: "issue-107" }),
          id: "issue-107",
          name: "issue-107",
          lifecycle_generation: 0,
          children: [],
          title: "Issue 107",
          status: "in_progress",
        },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-107", "prd.md"),
      "TOKEN_CODEX_PRD_B\n",
    );
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-107", "implement.jsonl"),
      '{"file":"src/session-b.md","reason":"session B only"}\n',
    );
    writeProjectFile("src/session-b.md", "TOKEN_CODEX_SESSION_B\n");
    writeSessionContext("codex_parent-a", ".trellis/tasks/issue-106");
    writeSessionContext("codex_parent-b", ".trellis/tasks/issue-107");
    const injectSubagentContextScript = getSharedHookScripts().find(
      (hook) => hook.name === "inject-subagent-context.py",
    )?.content;
    const hookPath = path.join(".codex", "hooks", "inject-subagent-context.py");
    writeProjectFile(
      hookPath,
      expectTemplateContent(
        injectSubagentContextScript,
        "codex inject-subagent-context hook",
      ),
    );

    const outputFor = (sessionId: string, env: NodeJS.ProcessEnv = {}) => {
      const output = runPython(
        hookPath,
        JSON.stringify({
          hook_event_name: "SubagentStart",
          agent_type: "trellis-implement",
          session_id: sessionId,
          cwd: tmpDir,
        }),
        env,
      );
      return (
        JSON.parse(output) as {
          hookSpecificOutput: { additionalContext: string };
        }
      ).hookSpecificOutput.additionalContext;
    };

    const sessionA = outputFor("parent-a");
    const sessionB = outputFor("parent-b");
    const parentWins = outputFor("parent-a", {
      TRELLIS_CONTEXT_ID: "codex_parent-b",
    });

    expect(sessionA).toContain("TOKEN_CODEX_SESSION_A");
    expect(sessionA).not.toContain("TOKEN_CODEX_SESSION_B");
    expect(sessionB).toContain("TOKEN_CODEX_SESSION_B");
    expect(sessionB).not.toContain("TOKEN_CODEX_SESSION_A");
    expect(parentWins).toContain("TOKEN_CODEX_SESSION_A");
    expect(parentWins).not.toContain("TOKEN_CODEX_SESSION_B");
  });

  it("[codex-native-subagents] non-Trellis SubagentStart agents stay silent", () => {
    setupTaskRepo();
    initializeHookGitRepo();
    writeSessionContext("codex_parent-a", ".trellis/tasks/issue-106");
    const injectSubagentContextScript = getSharedHookScripts().find(
      (hook) => hook.name === "inject-subagent-context.py",
    )?.content;
    const hookPath = path.join(".codex", "hooks", "inject-subagent-context.py");
    writeProjectFile(
      hookPath,
      expectTemplateContent(
        injectSubagentContextScript,
        "codex inject-subagent-context hook",
      ),
    );

    const output = runPython(
      hookPath,
      JSON.stringify({
        hook_event_name: "SubagentStart",
        agent_type: "general-purpose-reviewer",
        session_id: "parent-a",
        cwd: tmpDir,
      }),
    );

    expect(output.trim()).toBe("");
  });

  it("[session-current-task] Cursor hook uses conversation_id when transcript_path is null", () => {
    setupTaskRepo();
    writeLegacyCurrentTask(".trellis/tasks/issue-106");
    writeWorkflowStateHook();
    writeProjectFile(
      path.join(".trellis", "tasks", "cursor-task", "task.json"),
      JSON.stringify(
        {
          ...emptyTaskRecord({ id: "cursor-task" }),
          id: "cursor-task",
          name: "cursor-task",
          lifecycle_generation: 0,
          children: [],
          title: "Cursor task",
          status: "in_progress",
        },
        null,
        2,
      ),
    );
    writeSessionContext("cursor_cursor-a", ".trellis/tasks/cursor-task");

    const parsed = JSON.parse(
      runInjectWorkflowStateWithInput({
        cwd: tmpDir,
        cursor_version: "3.1.17",
        conversation_id: "cursor-a",
        transcript_path: null,
      }),
    ) as {
      hookSpecificOutput: { additionalContext: string };
    };

    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Task: cursor-task (in_progress)",
    );
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain(
      "Source:",
    );
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain(
      "issue-106",
    );
  });

  it("[session-current-task] OpenCode resolver ignores legacy .current-task and uses plugin sessionID", () => {
    setupTaskRepo();
    writeLegacyCurrentTask(".trellis/tasks/issue-106");
    writeProjectFile(
      path.join(".trellis", "tasks", "opencode-task", "task.json"),
      JSON.stringify(
        {
          id: "opencode-task",
          name: "opencode-task",
          lifecycle_generation: 0,
          title: "OpenCode task",
          status: "in_progress",
        },
        null,
        2,
      ),
    );
    writeSessionContext("opencode_oc-a", ".trellis/tasks/opencode-task");

    const ctx = new TrellisContext(tmpDir);
    // A main session without identity cannot adopt another session's binding.
    const none = ctx.getActiveTask();
    expect(none.taskPath).toBeNull();
    expect(none.source).toBe("none");
    expect(none.stale).toBe(false);

    const active = ctx.getActiveTask({
      sessionID: "oc-a",
    });

    expect(active.taskPath).toBe(".trellis/tasks/opencode-task");
    expect(active.source).toBe("session:opencode_oc-a");
    expect(active.stale).toBe(false);
  });

  it("[session-current-task] OpenCode resolver ignores OPENCODE_RUN_ID and uses the plugin sessionID", () => {
    // Inverted from "prefers OPENCODE_RUN_ID" on 2026-08-06, matching the
    // Python-side inversion in `PURGED_ENV_NAMES` and in "task.py start
    // ignores OPENCODE_RUN_ID". The name is absent from OpenCode 1.18.13's
    // source and from the 1.17.18 binary (82 OPENCODE_* literals, no RUN_ID),
    // so the only way it was ever set was a stray host-shell export — which
    // hijacked the resolver rather than helping it.
    setupTaskRepo();
    writeProjectFile(
      path.join(".trellis", "tasks", "opencode-run-task", "task.json"),
      JSON.stringify(
        {
          id: "opencode-run-task",
          name: "opencode-run-task",
          lifecycle_generation: 0,
          title: "OpenCode run task",
          status: "in_progress",
          priority: "P1",
        },
        null,
        2,
      ),
    );
    writeSessionContext("opencode_run-a", ".trellis/tasks/opencode-run-task");
    writeSessionContext("opencode_oc-a", ".trellis/tasks/issue-106");

    const previous = process.env.OPENCODE_RUN_ID;
    process.env.OPENCODE_RUN_ID = "run-a";
    try {
      const active = new TrellisContext(tmpDir).getActiveTask({
        sessionID: "oc-a",
      });

      expect(active.source).toBe("session:opencode_oc-a");
      expect(active.taskPath).toBe(".trellis/tasks/issue-106");
      expect(active.stale).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.OPENCODE_RUN_ID;
      } else {
        process.env.OPENCODE_RUN_ID = previous;
      }
    }
  });

  it("[#412] shared and Codex contexts include an adaptive one-shot notice without changing payload shape", () => {
    setupTaskRepo();

    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(claudeSessionStart, "claude session-start"),
    );
    writeProjectFile(
      path.join(".codex", "hooks", "session-start.py"),
      expectTemplateContent(codexSessionStart, "codex session-start"),
    );

    const sharedPayload = JSON.parse(
      runPython(path.join(".claude", "hooks", "session-start.py")),
    ) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
      additional_context: string;
    };
    const codexPayload = JSON.parse(
      runPython(
        path.join(".codex", "hooks", "session-start.py"),
        JSON.stringify({ cwd: tmpDir }),
      ),
    ) as {
      suppressOutput: boolean;
      systemMessage: string;
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };

    expect(Object.keys(sharedPayload)).toEqual([
      "hookSpecificOutput",
      "additional_context",
    ]);
    expect(sharedPayload.additional_context).toBe(
      sharedPayload.hookSpecificOutput.additionalContext,
    );
    expect(Object.keys(codexPayload)).toEqual([
      "suppressOutput",
      "systemMessage",
      "hookSpecificOutput",
    ]);
    expect(codexPayload.suppressOutput).toBe(true);
    expect(codexPayload.systemMessage).toMatch(
      /^Trellis context injected \(\d+ chars\)$/,
    );

    for (const payload of [sharedPayload, codexPayload]) {
      expect(Object.keys(payload.hookSpecificOutput)).toEqual([
        "hookEventName",
        "additionalContext",
      ]);
      expect(payload.hookSpecificOutput.hookEventName).toBe("SessionStart");

      const ctx = payload.hookSpecificOutput.additionalContext;
      expect(ctx.startsWith("<session-context>")).toBe(true);
      expect(ctx).toContain("Trellis compact SessionStart context");
      expect(ctx).toContain("<first-reply-notice>");
      expect(ctx).toContain("the user's current request");
      expect(ctx).toContain("the user message that triggered this reply");
      expect(ctx).toContain("has no clear natural language");
      expect(ctx).toContain(
        "explicitly established project communication language",
      );
      expect(ctx).toContain("Trellis SessionStart ✓");
      expect(ctx).toContain("Continue directly with the user's request");
      expect(ctx).toContain(
        "must not alter the language used for the remainder of the response",
      );
      expect(ctx).toContain("This notice is one-shot");
      expect(ctx.indexOf("the user's current request")).toBeLessThan(
        ctx.indexOf("explicitly established project communication language"),
      );
      expect(
        ctx.indexOf("explicitly established project communication language"),
      ).toBeLessThan(ctx.indexOf("Trellis SessionStart ✓"));
      expect(ctx.indexOf("<first-reply-notice>")).toBeLessThan(
        ctx.indexOf("<current-state>"),
      );
      expect(ctx).toContain("<current-state>");
      expect(ctx).toContain("<trellis-workflow>");
      expect(ctx).toContain("<guidelines>");
      expect(ctx).toContain("<task-status>");
      expect(ctx).not.toContain("say once in Chinese");
      expect(ctx).not.toContain("exactly one short Chinese sentence");
    }
  });

  it("[#240] Codex SessionStart output uses compact context without generic sub-agent notice", () => {
    setupTaskRepo();
    writeProjectFile(
      path.join(".codex", "hooks", "session-start.py"),
      expectTemplateContent(codexSessionStart, "codex session-start"),
    );

    const payload = JSON.parse(
      runPython(
        path.join(".codex", "hooks", "session-start.py"),
        JSON.stringify({ cwd: tmpDir }),
      ),
    ) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };

    const ctx = payload.hookSpecificOutput.additionalContext;
    expect(payload.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(ctx.startsWith("<session-context>")).toBe(true);
    expect(ctx).toContain("Trellis compact SessionStart context");
    expect(ctx).toContain("Task context order for implementation/check");
    expect(ctx).toContain("design.md if present");
    expect(ctx).not.toContain("<sub-agent-notice>");
  });

  it("[#248] Copilot template does not assert Copilot ignores SessionStart hook output", () => {
    // GitHub #248: Microsoft's VS Code Agent hooks docs (preview, since VS
    // Code 1.110, Feb 2026) document SessionStart additionalContext as the
    // injection mechanism. The previous Trellis hook hardcoded a misleading
    // "currently ignores" claim in both the docstring and the runtime
    // systemMessage. Both must stay removed; Trellis should not re-introduce
    // a pessimistic absolute claim about Copilot's consumption behavior.
    const content = expectTemplateContent(
      copilotSessionStart,
      "copilot session-start",
    );

    expect(content).not.toContain(
      "documented SessionStart behavior ignores hook output",
    );
    expect(content).not.toContain(
      "Copilot currently ignores sessionStart hook output",
    );
    expect(content).not.toContain("systemMessage");
    expect(content).not.toContain("Trellis context injected");
  });

  it("[#248] Copilot SessionStart payload omits systemMessage and emits spec-compliant additionalContext", () => {
    setupTaskRepo();

    writeProjectFile(
      path.join(".github", "copilot", "hooks", "session-start.py"),
      expectTemplateContent(copilotSessionStart, "copilot session-start"),
    );

    const payload = JSON.parse(
      runPython(
        path.join(".github", "copilot", "hooks", "session-start.py"),
        JSON.stringify({ cwd: tmpDir }),
      ),
    ) as {
      systemMessage?: string;
      suppressOutput?: boolean;
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };

    // systemMessage must be absent — the old "currently ignores" diagnostic
    // was surfacing to users as a perceived Copilot bug (GitHub #248).
    expect(payload.systemMessage).toBeUndefined();
    expect(payload.suppressOutput).toBe(true);
    expect(payload.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(payload.hookSpecificOutput.additionalContext.length).toBeGreaterThan(
      0,
    );
    expect(payload.hookSpecificOutput.additionalContext).not.toContain(
      "<first-reply-notice>",
    );
  });

  it("[workflow-v2] shared session-start summarizes in-progress context without auto-dispatch approval", () => {
    setupTaskRepo();
    writeSessionContext("claude_session-a", ".trellis/tasks/issue-106");

    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(claudeSessionStart, "claude session-start"),
    );

    const rawOutput = runPython(
      path.join(".claude", "hooks", "session-start.py"),
      JSON.stringify({ cwd: tmpDir, session_id: "session-a" }),
    );
    expect(rawOutput).toContain("Status: IN_PROGRESS");
    expect(rawOutput).toContain("Implementation/check context order");
    expect(rawOutput).toContain("prd.md");
    expect(rawOutput).toContain("design.md if present");
    expect(rawOutput).toContain("implement.md if present");
    expect(rawOutput).not.toContain("if you stay in the main session");
    expect(rawOutput).not.toContain("Next required action: dispatch");
    expect(rawOutput).not.toContain("If there is an active task, ask whether");
    expect(rawOutput).toContain("load details on demand");
  });

  it("[trellis-hooks-env] runtime: shared hooks emit no additionalContext when TRELLIS_HOOKS=0", () => {
    setupTaskRepo();
    writeSessionContext("claude_session-a", ".trellis/tasks/issue-106");

    const claudeSession = expectTemplateContent(
      claudeSessionStart,
      "claude session-start",
    );
    const workflowState = expectTemplateContent(
      getSharedHookScripts().find((h) => h.name === "inject-workflow-state.py")
        ?.content,
      "inject-workflow-state",
    );
    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      claudeSession,
    );
    writeProjectFile(
      path.join(".claude", "hooks", "inject-workflow-state.py"),
      workflowState,
    );

    const stdinPayload = JSON.stringify({
      cwd: tmpDir,
      session_id: "session-a",
    });

    // Baseline: gate off, hooks emit content (sanity check)
    const baselineSession = runPython(
      path.join(".claude", "hooks", "session-start.py"),
      stdinPayload,
    );
    expect(baselineSession).toContain("hookSpecificOutput");

    // With TRELLIS_HOOKS=0: shared hooks short-circuit with empty stdout
    const gatedSession = runPython(
      path.join(".claude", "hooks", "session-start.py"),
      stdinPayload,
      { TRELLIS_HOOKS: "0" },
    );
    expect(gatedSession.trim()).toBe("");

    const gatedWorkflow = runPython(
      path.join(".claude", "hooks", "inject-workflow-state.py"),
      stdinPayload,
      { TRELLIS_HOOKS: "0" },
    );
    expect(gatedWorkflow.trim()).toBe("");

    // TRELLIS_DISABLE_HOOKS=1 has the same effect
    const gatedAlt = runPython(
      path.join(".claude", "hooks", "session-start.py"),
      stdinPayload,
      { TRELLIS_DISABLE_HOOKS: "1" },
    );
    expect(gatedAlt.trim()).toBe("");
  });

  it("[session-current-task] OpenCode context layer normalizes backslash refs for downstream plugins", () => {
    setupTaskRepo();
    writeSessionContext("opencode_oc-a", ".trellis\\tasks\\issue-106");

    const ctx = new TrellisContext(tmpDir) as TrellisContext & {
      getCurrentTask: (platformInput?: object | null) => string | null;
      resolveTaskDir: (taskRef: string) => string | null;
    };

    expect(ctx.getCurrentTask({ sessionID: "oc-a" })).toBe(
      ".trellis/tasks/issue-106",
    );
    expect(ctx.resolveTaskDir(".trellis\\tasks\\issue-106")).toBe(
      path.join(tmpDir, ".trellis", "tasks", "issue-106"),
    );
  });

  it("[session-fallback] main CLI does not borrow a sole unrelated session", () => {
    setupTaskRepo();
    writeSessionContext("codex_session_parent", ".trellis/tasks/issue-106");

    const { output, status } = runTaskCurrent();
    expect(status).toBe(1);
    expect(output).toContain("Current task: (none)");
    expect(output).toContain("Source: none");
  });

  it("[session-fallback] zero session files — no fallback, returns none", () => {
    setupTaskRepo();
    // No session files written

    const { output, status } = runTaskCurrent();
    expect(status).toBe(1);
    expect(output).toContain("Current task: (none)");
    expect(output).toContain("Source: none");
  });

  it("[session-fallback] multiple session files — refuses to guess, returns none", () => {
    setupTaskRepo();
    writeSessionContext("codex_session_a", ".trellis/tasks/issue-106");
    writeProjectFile(
      path.join(".trellis", "tasks", "other-task", "task.json"),
      JSON.stringify(
        {
          id: "other-task",
          name: "other-task",
          lifecycle_generation: 0,
          title: "other",
          status: "in_progress",
        },
        null,
        2,
      ),
    );
    writeSessionContext("codex_session_b", ".trellis/tasks/other-task");

    const { output, status } = runTaskCurrent();
    expect(status).toBe(1);
    expect(output).toContain("Current task: (none)");
    expect(output).toContain("Source: none");
  });

  it("[session-fallback] explicit context-key match takes precedence over fallback", () => {
    setupTaskRepo();
    writeSessionContext("codex_session_explicit", ".trellis/tasks/issue-106");

    const { output, status } = runTaskCurrent({
      TRELLIS_CONTEXT_ID: "codex_session_explicit",
    });
    expect(status).toBe(0);
    expect(output).toContain("Current task: .trellis/tasks/issue-106");
    // Source should be "session:" (precise match), not "session-fallback:"
    expect(output).toContain("Source: session:codex_session_explicit");
    expect(output).not.toContain("session-fallback");
  });

  it("[issue #469] finish removes only the exact matched session file", () => {
    setupTaskRepo();
    writeSessionContext("codex_exact", ".trellis/tasks/issue-106");
    writeSessionContext("codex_thread_sibling", ".trellis/tasks/issue-106");
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const sessionsDir = path.join(tmpDir, ".trellis", ".runtime", "sessions");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} finish`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODEX_THREAD_ID: "exact" }),
      },
    );

    expect(output).toContain("Source: session:codex_exact");
    expect(fs.existsSync(path.join(sessionsDir, "codex_exact.json"))).toBe(
      false,
    );
    expect(
      fs.existsSync(path.join(sessionsDir, "codex_thread_sibling.json")),
    ).toBe(true);
  });

  it("[issue #469] finish preserves a sole unmatched session file", () => {
    setupTaskRepo();
    writeSessionContext("codex_previous-thread", ".trellis/tasks/issue-106");
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const fallbackPath = path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      "sessions",
      "codex_previous-thread.json",
    );
    const previousBytes = fs.readFileSync(fallbackPath);

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} finish`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODEX_THREAD_ID: "current-thread" }),
      },
    );

    expect(output).toContain("No current task set");
    expect(fs.readFileSync(fallbackPath)).toEqual(previousBytes);

    const current = runTaskCurrent({ CODEX_THREAD_ID: "current-thread" });
    expect(current.status).toBe(1);
    expect(current.output).toContain("Current task: (none)");
    expect(current.output).toContain("Source: none");
  });

  it("[issue #469] finish deletes nothing when fallback resolution is ambiguous", () => {
    setupTaskRepo();
    writeSessionContext("codex_thread_a", ".trellis/tasks/issue-106");
    writeSessionContext("codex_thread_b", ".trellis/tasks/issue-106");
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const sessionsDir = path.join(tmpDir, ".trellis", ".runtime", "sessions");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} finish`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODEX_THREAD_ID: "current-thread" }),
      },
    );

    expect(output).toContain("No current task set");
    expect(fs.existsSync(path.join(sessionsDir, "codex_thread_a.json"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(sessionsDir, "codex_thread_b.json"))).toBe(
      true,
    );
  });

  it("[issue #469] finish preserves a malformed exact session when another session exists", () => {
    setupTaskRepo();
    writeProjectFile(
      path.join(".trellis", ".runtime", "sessions", "codex_malformed.json"),
      "{",
    );
    writeSessionContext("codex_other", ".trellis/tasks/issue-106");
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const sessionsDir = path.join(tmpDir, ".trellis", ".runtime", "sessions");

    const output = spawnSync(pythonCmd, [taskScriptPath, "finish"], {
      cwd: tmpDir,
      encoding: "utf-8",
      env: sessionEnv({ CODEX_THREAD_ID: "malformed" }),
    });
    expect(output.status).toBe(1);
    expect(output.stderr).toContain("binding_invalid");
    expect(output.stdout).not.toContain("No current task set");
    expect(fs.existsSync(path.join(sessionsDir, "codex_malformed.json"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(sessionsDir, "codex_other.json"))).toBe(
      true,
    );
  });

  it("[audit] a non-UTF-8 session file fails explicitly without a traceback", () => {
    setupTaskRepo();
    const sessionsDir = path.join(tmpDir, ".trellis", ".runtime", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, "codex_binary.json"),
      Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d]),
    );
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    const proc = spawnSync(pythonCmd, [taskScriptPath, "finish"], {
      cwd: tmpDir,
      encoding: "utf-8",
      env: sessionEnv({ CODEX_THREAD_ID: "binary" }),
    });

    expect(proc.stderr ?? "").not.toContain("UnicodeDecodeError");
    expect(proc.status).toBe(1);
    expect(proc.stderr).toContain("binding_undecodable");
    expect(proc.stdout).not.toContain("No current task set");
    expect(
      fs.readFileSync(path.join(sessionsDir, "codex_binary.json")),
    ).toEqual(Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d]));
  });

  it("[workflow-state] missing/empty workflow.md degrades to generic line (post-R5: no fallback dict)", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".trellis/tasks/issue-106");
    writeWorkflowStateHook();
    // overwrite workflow.md with empty content (no tag blocks). After
    // v0.5.0-rc.0 the fallback dict was removed — the hook now degrades
    // to the generic "Refer to workflow.md" line so users see (and fix) the
    // broken state instead of being silently masked by hardcoded text.
    writeWorkflowMd("# Empty\n");

    const output = runInjectWorkflowState();
    const parsed = JSON.parse(output) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Task: issue-106 (in_progress)",
    );
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Refer to workflow.md",
    );
    // Hardcoded fallback wording must NOT appear post-R5
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain(
      "trellis-implement → trellis-check",
    );
  });

  it("[workflow-state] in_progress tag in workflow.md mentions Phase 3.4 commit (R1 invariant)", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".trellis/tasks/issue-106");
    writeWorkflowStateHook();
    // Write a workflow.md containing only the in_progress tag with the
    // canonical Phase 3.4 commit reminder. This guards against future
    // regressions that omit Phase 3.4 from the per-turn breadcrumb.
    writeWorkflowMd(
      "[workflow-state:in_progress]\n" +
        "Flow: trellis-implement → trellis-check → trellis-update-spec → commit (Phase 3.4) → /trellis:finish-work\n" +
        "[/workflow-state:in_progress]\n",
    );

    const parsed = JSON.parse(runInjectWorkflowState()) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "commit (Phase 3.4)",
    );
  });

  it("[workflow-state] workflow.md tag overrides hardcoded fallback", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".trellis/tasks/issue-106");
    writeWorkflowStateHook();
    writeWorkflowMd(
      "[workflow-state:in_progress]\nCUSTOM BODY from workflow.md\n[/workflow-state:in_progress]\n",
    );

    const parsed = JSON.parse(runInjectWorkflowState()) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "CUSTOM BODY from workflow.md",
    );
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain(
      "trellis-implement → trellis-check",
    );
  });

  it("[workflow-state-r5] inject-workflow-state.py contains no _FALLBACK_BREADCRUMBS dict (post-rc.0 collapse)", () => {
    // R5: the fallback breadcrumb dict was removed in v0.5.0-rc.0 to
    // collapse three sources (workflow.md / py / js) to one. This test
    // guards against accidental re-introduction.
    const py = injectWorkflowStateScript ?? "";
    expect(py).not.toMatch(/_FALLBACK_BREADCRUMBS\s*=\s*\{/);
  });

  it("[workflow-state-dispatch-mode-dedup] _codex_mode_banner and resolve_breadcrumb_key share one normalization helper", () => {
    // _codex_mode_banner and resolve_breadcrumb_key both normalize
    // codex.dispatch_mode to auto/inline (sub-agent alias, invalid → inline).
    // That cascade must live in exactly one place so the two never drift.
    const py = injectWorkflowStateScript ?? "";
    expect(py).toContain("def _resolve_codex_dispatch_mode(");
    const cascadeOccurrences = (
      py.match(/elif cfg_mode in \("auto", "sub-agent"\):/g) ?? []
    ).length;
    expect(cascadeOccurrences).toBe(1);
  });

  it("[workflow-state-r5] opencode inject-workflow-state.js contains no FALLBACK_BREADCRUMBS dict", () => {
    const jsURL = new URL(
      "../src/templates/opencode/plugins/inject-workflow-state.js",
      import.meta.url,
    );
    const js = fs.readFileSync(jsURL, "utf-8");
    expect(js).not.toMatch(/const\s+FALLBACK_BREADCRUMBS\s*=\s*\{/);
  });

  it("[workflow-state] custom status with hyphen matches via regex", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".trellis/tasks/issue-106");
    writeWorkflowStateHook();
    setStatus("in-review");
    writeWorkflowMd(
      "[workflow-state:in-review]\nTeam review pending\n[/workflow-state:in-review]\n",
    );

    const parsed = JSON.parse(runInjectWorkflowState()) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Task: issue-106 (in-review)",
    );
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Team review pending",
    );
  });

  it("[workflow-state] unknown status with no tag emits generic fallback, not silent", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".trellis/tasks/issue-106");
    writeWorkflowStateHook();
    setStatus("weirdstate");
    writeWorkflowMd("# no matching tags\n");

    const output = runInjectWorkflowState();
    expect(output.trim()).not.toBe("");
    const parsed = JSON.parse(output) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Task: issue-106 (weirdstate)",
    );
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Refer to workflow.md",
    );
  });

  it("[workflow-state] CWD drift: hook finds .trellis/ when invoked from subdirectory", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".trellis/tasks/issue-106");
    writeWorkflowStateHook();
    // Create a subdirectory and invoke hook with that CWD
    const subDir = path.join(tmpDir, "packages", "cli");
    fs.mkdirSync(subDir, { recursive: true });

    const parsed = JSON.parse(runInjectWorkflowState(subDir)) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Task: issue-106",
    );
  });

  it("[workflow-state] no_task breadcrumb emitted when no session active task exists", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", "custom-note"), "name=test\n");
    // Post-R5: breadcrumb body is read exclusively from workflow.md tag
    // blocks. Provide a minimal no_task tag so the test can assert the
    // routing to trellis-brainstorm content surfaces.
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      "[workflow-state:no_task]\n" +
        "No active task. Load `trellis-brainstorm` skill to start.\n" +
        "[/workflow-state:no_task]\n",
    );
    writeLegacyCurrentTask(".trellis/tasks/issue-106");
    writeWorkflowStateHook();
    // Legacy repo-global state must not suppress the session no_task breadcrumb.
    const output = runInjectWorkflowState();
    expect(output.trim()).not.toBe("");
    const parsed = JSON.parse(output) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Status: no_task",
    );
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "trellis-brainstorm",
    );
  });

  it("reports task_error when task.json is malformed", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".trellis/tasks/issue-106");
    writeWorkflowStateHook();
    writeWorkflowMd(
      "[workflow-state:no_task]\n" +
        "No active task.\n" +
        "[/workflow-state:no_task]\n" +
        "[workflow-state:task_error]\n" +
        "Repair the active task record before continuing.\n" +
        "[/workflow-state:task_error]\n",
    );
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "task.json"),
      "{not-json\n",
    );

    const output = runInjectWorkflowState();
    const parsed = JSON.parse(output) as {
      hookSpecificOutput: { additionalContext: string };
    };
    const context = parsed.hookSpecificOutput.additionalContext;
    expect(context).toContain("Task: session binding (task_error)");
    expect(context).toContain("Task binding error: task_metadata_invalid:");
    expect(context).not.toContain("Task: issue-106");
    expect(context).toContain(
      "Repair the active task record before continuing.",
    );
    expect(context).not.toContain("Status: no_task");
  });

  it("reports task_error when task.json has no usable status", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".trellis/tasks/issue-106");
    writeWorkflowStateHook();
    writeWorkflowMd(
      "[workflow-state:no_task]\nNo active task.\n[/workflow-state:no_task]\n",
    );
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "task.json"),
      JSON.stringify({
        id: "issue-106",
        name: "issue-106",
        lifecycle_generation: 0,
        children: [],
        title: "Missing status",
      }),
    );

    const output = runInjectWorkflowState();
    const parsed = JSON.parse(output) as {
      hookSpecificOutput: { additionalContext: string };
    };
    const context = parsed.hookSpecificOutput.additionalContext;
    expect(context).toContain("Task: session binding (task_error)");
    expect(context).toContain("Task binding error: task_metadata_invalid-task-schema:");
    expect(context).toContain("Refer to workflow.md for current step.");
    expect(context).not.toContain("Status: no_task");
  });

  it("reports task_error when task.json is not an object", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".trellis/tasks/issue-106");
    writeWorkflowStateHook();
    writeWorkflowMd(
      "[workflow-state:task_error]\nRepair the active task record before continuing.\n[/workflow-state:task_error]\n",
    );
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "task.json"),
      "[]",
    );

    const output = runInjectWorkflowState();
    const parsed = JSON.parse(output) as {
      hookSpecificOutput: { additionalContext: string };
    };
    const context = parsed.hookSpecificOutput.additionalContext;
    expect(context).toContain("Task: session binding (task_error)");
    expect(context).toContain("Task binding error: task_metadata_not-object:");
    expect(context).not.toContain("Task: issue-106");
    expect(context).toContain(
      "Repair the active task record before continuing.",
    );
    expect(context).not.toContain("Status: no_task");
  });

  it("[#240] Codex workflow-state output starts with codex mode, not generic sub-agent notice", () => {
    setupTaskRepo();
    writeProjectFile(
      path.join(".codex", "hooks", "inject-workflow-state.py"),
      expectTemplateContent(injectWorkflowStateScript, "inject-workflow-state"),
    );

    const parsed = JSON.parse(
      runPython(
        path.join(".codex", "hooks", "inject-workflow-state.py"),
        JSON.stringify({ cwd: tmpDir, session_id: "workflow-a" }),
      ),
    ) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };

    const ctx = parsed.hookSpecificOutput.additionalContext;
    expect(parsed.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    expect(ctx).not.toContain("<sub-agent-notice>");
    expect(ctx).toContain("<codex-mode>auto:");
    expect(ctx.indexOf("</codex-mode>")).toBeLessThan(
      ctx.indexOf("<workflow-state>"),
    );
  });

  it("[workflow-state] silent exit 0 when not a Trellis project (no .trellis/ dir)", () => {
    // No .trellis/ at all — hook should silently exit
    writeWorkflowStateHook();
    fs.rmSync(path.join(tmpDir, ".trellis"), { recursive: true, force: true });
    fs.mkdirSync(path.join(tmpDir, ".trellis", "hooks"), { recursive: true });
    fs.copyFileSync(
      path.join(
        __dirname,
        "..",
        "src",
        "templates",
        "shared-hooks",
        "inject-workflow-state.py",
      ),
      path.join(tmpDir, ".trellis", "hooks", "inject-workflow-state.py"),
    );
    // Now .trellis/ exists only as a parent for the hook script — need to move
    // the hook out of .trellis/ so root-finding fails. Use a fully separate dir.
    const nonTrellisDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "non-trellis-"),
    );
    try {
      const hookPath = path.join(nonTrellisDir, "hook.py");
      fs.copyFileSync(
        path.join(
          __dirname,
          "..",
          "src",
          "templates",
          "shared-hooks",
          "inject-workflow-state.py",
        ),
        hookPath,
      );
      const result = execSync(`${pythonCmd} ${JSON.stringify(hookPath)}`, {
        cwd: nonTrellisDir,
        input: JSON.stringify({ cwd: nonTrellisDir }),
        encoding: "utf-8",
      });
      expect(result.trim()).toBe("");
    } finally {
      fs.rmSync(nonTrellisDir, { recursive: true, force: true });
    }
  });

  it("[#356] inject-workflow-state.py exits when host leaves stdin open with no payload", async () => {
    setupTaskRepo();
    writeWorkflowStateHook();

    const hookPath = path.join(
      tmpDir,
      ".trellis",
      "hooks",
      "inject-workflow-state.py",
    );
    const child = spawn(pythonCmd, [hookPath], {
      cwd: tmpDir,
      env: sessionEnv({ KIRO_PROJECT_DIR: tmpDir }),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const result = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
      timedOut: boolean;
    }>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({ code: null, signal: "SIGKILL", timedOut: true });
      }, 1500);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal, timedOut: false });
      });
    });

    expect(result.timedOut, stderr).toBe(false);
    expect(result.code).toBe(0);
    expect(stdout).toContain("<workflow-state>");
  });

  // ------------------------------------------------------------
  // Legacy current_phase / next_action field removal (FP round 3 cleanup)
  // ------------------------------------------------------------

  it("[workflow-v2] task.py create does NOT write legacy current_phase / next_action fields", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "dummy task" --description "regression fixture" --slug dummy-task`,
      { cwd: tmpDir, encoding: "utf-8" },
    );
    // Locate the newly created task dir
    const tasksDir = path.join(tmpDir, ".trellis", "tasks");
    const newDirs = fs
      .readdirSync(tasksDir)
      .filter((d) => d.includes("dummy-task"));
    expect(newDirs.length).toBeGreaterThan(0);
    const newTaskJsonPath = path.join(tasksDir, newDirs[0], "task.json");
    const data = JSON.parse(fs.readFileSync(newTaskJsonPath, "utf-8")) as {
      current_phase?: unknown;
      next_action?: unknown;
    };
    expect(data.current_phase).toBeUndefined();
    expect(data.next_action).toBeUndefined();
  });

  // ------------------------------------------------------------
  // v0.5.0-beta.12: init-context removal + jsonl seeding on task create
  // ------------------------------------------------------------

  it("[init-context-removal] task.py create does NOT seed jsonl when no sub-agent platform configured", () => {
    setupTaskRepo();
    // setupTaskRepo does not create any .{platform}/ dir → agent-less mode
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "plain task" --description "regression fixture" --slug plain-task`,
      { cwd: tmpDir, encoding: "utf-8" },
    );
    const tasksDir = path.join(tmpDir, ".trellis", "tasks");
    const newDirs = fs
      .readdirSync(tasksDir)
      .filter((d) => d.includes("plain-task"));
    expect(newDirs.length).toBeGreaterThan(0);
    const taskDir = path.join(tasksDir, newDirs[0]);
    expect(fs.existsSync(path.join(taskDir, "implement.jsonl"))).toBe(false);
    expect(fs.existsSync(path.join(taskDir, "check.jsonl"))).toBe(false);
  });

  it("[validation-preflight] task.py create writes EMPTY jsonl when a sub-agent platform dir exists", () => {
    setupTaskRepo();
    // Simulate a Claude Code install
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "seeded task" --description "regression fixture" --slug seeded-task`,
      { cwd: tmpDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    expect(output).toBeDefined();
    const tasksDir = path.join(tmpDir, ".trellis", "tasks");
    const newDirs = fs
      .readdirSync(tasksDir)
      .filter((d) => d.includes("seeded-task"));
    expect(newDirs.length).toBeGreaterThan(0);
    const taskDir = path.join(tasksDir, newDirs[0]);

    for (const jsonlName of ["implement.jsonl", "check.jsonl"]) {
      const jsonlPath = path.join(taskDir, jsonlName);
      expect(fs.existsSync(jsonlPath), `${jsonlName} should exist`).toBe(true);
      // Empty on create — a placeholder row would pass validate locally and
      // then fail PR preflight as unresolved scaffolding.
      expect(fs.readFileSync(jsonlPath, "utf-8"), jsonlName).toBe("");
    }
  });
});

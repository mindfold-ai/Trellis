// Mechanical split of regression.test.ts; imported by the canonical test entry.

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task";
import { getStatuslineHook } from "../src/templates/claude/index.js";
import { getAllHooks as getCodexHooks } from "../src/templates/codex/index.js";
import { getSharedHookScripts } from "../src/templates/shared-hooks/index.js";
import { getAllScripts } from "../src/templates/trellis/index.js";
describe("regression: current-task path normalization", () => {
  let tmpDir: string;
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  const claudeSessionStart = getSharedHookScripts().find(
    (hook) => hook.name === "session-start.py",
  )?.content;
  const codexSessionStart = getCodexHooks().find(
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

  function expectSessionContext(
    contextKey: string,
    taskId: string,
    lifecycleGeneration = 0,
  ): void {
    const contextPath = sessionContextPath(contextKey);
    expect(JSON.parse(fs.readFileSync(contextPath, "utf-8"))).toEqual({
      schema_version: 2,
      task_id: taskId,
      lifecycle_generation: lifecycleGeneration,
    });
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

  function setupTaskRepo(): void {
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", "custom-note"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
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

  // ==========================================================================
  // [env-name-purge] active_task.py's env tables may only name real variables
  // ==========================================================================
  // A 2026-08-05 audit checked all 21 platforms against vendor docs, shipped
  // binaries and live shells (see .trellis/tasks/08-05-session-identity-
  // propagation/research/platform-session-identity.md). 12 of the 21 declared
  // session env var names had never existed on any platform — they were
  // pattern-guessed from a `<PLATFORM>_SESSION_ID` shape no vendor agreed to,
  // and three of them entered in a single bulk commit with no per-platform
  // evidence. The tests below exist so that re-adding one by pattern-matching
  // its neighbours fails loudly instead of shipping as a silent no-op.

  // Runs a probe against the *installed* resolver in tmpDir, with a JSON
  // payload as argv[1] and the parsed JSON stdout as the result.
  function runActiveTaskProbe(
    fileName: string,
    bodyLines: string[],
    payload: unknown,
  ): unknown {
    writeProjectFile(
      fileName,
      [
        "import json",
        "import os",
        "import sys",
        `sys.path.insert(0, ${JSON.stringify(path.join(tmpDir, ".trellis", "scripts"))})`,
        "from common.active_task import (",
        "    _ENV_CONVERSATION_KEYS,",
        "    _ENV_SESSION_KEYS,",
        "    _ENV_TRANSCRIPT_KEYS,",
        "    _iter_env_keys,",
        "    resolve_context_key,",
        ")",
        "",
        "payload = json.loads(sys.argv[1])",
        "",
        "# Hermetic: drop every name the tables know about plus the override, so",
        "# the host session running this suite (itself an AI CLI) cannot answer",
        "# for the platform under test.",
        "for _table in (_ENV_SESSION_KEYS, _ENV_CONVERSATION_KEYS, _ENV_TRANSCRIPT_KEYS):",
        "    for _entry_name, _entry_keys in _table:",
        "        for _key in _entry_keys:",
        "            os.environ.pop(_key, None)",
        'os.environ.pop("TRELLIS_CONTEXT_ID", None)',
        ...bodyLines,
      ].join("\n"),
    );

    const result = spawnSync(
      pythonCmd,
      [path.join(tmpDir, fileName), JSON.stringify(payload)],
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout);
  }

  // [platform, env var name] pairs deleted from active_task.py on 2026-08-05.
  const PURGED_ENV_NAMES: readonly (readonly [string, string])[] = [
    // Verified absent from a live Claude Code 2.1.221 bash child and from
    // code.claude.com/docs/en/env-vars. CLAUDE_CODE_SESSION_ID survives.
    ["claude", "CLAUDE_SESSION_ID"],
    // Verified absent from a live `codex exec` env. CODEX_THREAD_ID survives.
    ["codex", "CODEX_SESSION_ID"],
    // Empty in a live cursor-agent shell. Cursor keeps CURSOR_CONVERSATION_ID
    // and the beforeShellExecution ticket.
    ["cursor", "CURSOR_SESSION_ID"],
    // Zero hits in OpenCode 1.18.13 source; none among the 59 OPENCODE_*
    // literals in the 1.17.18 binary. The plugin's command prefix is the
    // real channel.
    ["opencode", "OPENCODE_SESSION_ID"],
    ["opencode", "OPENCODE_SESSIONID"],
    ["opencode", "OPENCODE_RUN_ID"],
    // Absent from Factory's docs and from droid 0.100.0's binary (the only
    // SESSION_ID strings in it are OpenSSL error constants).
    ["droid", "FACTORY_SESSION_ID"],
    ["droid", "DROID_SESSION_ID"],
    // Absent from codebuddy.ai's env-vars and hooks references; its hooks get
    // only CODEBUDDY_PROJECT_DIR / CODEBUDDY_PLUGIN_ROOT / CLAUDE_PROJECT_DIR.
    ["codebuddy", "CODEBUDDY_SESSION_ID"],
    // Absent from docs.trae.cn's hook reference; hooks get TRAE_PROJECT_DIR,
    // CLAUDE_PROJECT_DIR and TRAE_ENV_FILE.
    ["trae", "TRAE_SESSION_ID"],
    // Pi builds its bash env as `{...process.env, PATH}` only; no PI_* session
    // var exists. The Pi extension's `export TRELLIS_CONTEXT_ID=…` command
    // prefix is the real channel.
    ["pi", "PI_SESSION_ID"],
    ["pi", "PI_SESSIONID"],
    // Transcript-table inventions, both checked: absent from docs and from
    // live envs.
    ["claude", "CLAUDE_TRANSCRIPT_PATH"],
    ["codex", "CODEX_TRANSCRIPT_PATH"],
  ];

  function statuslineRateLimitPayload(): string {
    const nowSecs = Math.floor(Date.now() / 1000);
    return JSON.stringify({
      model: { display_name: "Test" },
      context_window: { used_percentage: 1, context_window_size: 1000 },
      cost: { total_duration_ms: 0 },
      rate_limits: {
        five_hour: {
          used_percentage: 17,
          resets_at: nowSecs + 4 * 3600 + 31 * 60 + 60,
        },
        seven_day: {
          used_percentage: 19,
          resets_at: nowSecs + 2 * 86400 + 11 * 3600 + 60,
        },
      },
    });
  }

  // ---------------------------------------------------------------------
  // CLAUDE_ENV_FILE dedup — the file is user-owned and sourced by every
  // shell, and _persist_context_key_for_bash used to append unconditionally.
  // Measured on a maintainer machine: 3884 export lines for 27 distinct
  // values (169 KB, 99.3% redundant). Dedup keys on the LAST matching export
  // because shell applies later assignments over earlier ones.
  // ---------------------------------------------------------------------

  function writeClaudeSessionStartHook(): void {
    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(
        getSharedHookScripts().find((hook) => hook.name === "session-start.py")
          ?.content,
        "claude session-start",
      ),
    );
  }

  function runSessionStart(sessionId: string, envFile: string): void {
    runPython(
      path.join(".claude", "hooks", "session-start.py"),
      JSON.stringify({
        session_id: sessionId,
        transcript_path: path.join(tmpDir, "transcript.jsonl"),
        cwd: tmpDir,
        hook_event_name: "SessionStart",
      }),
      { CLAUDE_ENV_FILE: envFile },
    );
  }

  function contextIdExports(envFile: string): string[] {
    return fs
      .readFileSync(envFile, "utf-8")
      .split("\n")
      .filter((line) => line.startsWith("export TRELLIS_CONTEXT_ID="));
  }

  // ---------------------------------------------------------------------
  // SessionStart update reminder. `_get_update_hint` (now public as
  // `get_update_hint`) computed "Trellis update available: X -> Y, run trellis
  // update" for months, but its only caller was `output_text()` — the
  // get_context.py text path. The hook
  // built its own payload and never went through it, so on hook-driven
  // platforms the reminder was silent: this repo sat on .trellis/.version
  // 0.6.2 against an installed 0.6.7 CLI while `.trellis/.runtime/` held six
  // codex_* update markers and not one claude_* marker. The hint now rides the
  // <first-reply-notice> block, the payload's existing "say it in the first
  // visible reply" channel, so it reaches the user and not just the model.
  //
  // The fake `trellis` CLI below is a shell script on PATH. Windows
  // CreateProcess resolves a bare command name against .exe only, so
  // subprocess.run(["trellis", ...]) would never find a .bat/.cmd shim —
  // those cases skip there.
  // ---------------------------------------------------------------------

  const isWindows = process.platform === "win32";

  function writeFakeTrellisCli(body: string): NodeJS.ProcessEnv {
    const binDir = path.join(tmpDir, "fake-bin");
    fs.mkdirSync(binDir, { recursive: true });
    const shimPath = path.join(binDir, "trellis");
    fs.writeFileSync(shimPath, `#!/bin/sh\n${body}`, "utf-8");
    fs.chmodSync(shimPath, 0o755);
    return {
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      TRELLIS_FAKE_CALL_LOG: path.join(tmpDir, "trellis-calls.log"),
    };
  }

  function trellisCliCallCount(): number {
    const callLog = path.join(tmpDir, "trellis-calls.log");
    if (!fs.existsSync(callLog)) {
      return 0;
    }
    return fs.readFileSync(callLog, "utf-8").split("\n").filter(Boolean).length;
  }

  const REPORTS_0_5_9 = 'echo called >> "$TRELLIS_FAKE_CALL_LOG"\necho 0.5.9\n';

  function sessionStartContext(
    sessionId: string,
    envOverrides: NodeJS.ProcessEnv = {},
  ): string {
    const raw = runPython(
      path.join(".claude", "hooks", "session-start.py"),
      JSON.stringify({
        session_id: sessionId,
        transcript_path: path.join(tmpDir, "transcript.jsonl"),
        cwd: tmpDir,
        hook_event_name: "SessionStart",
      }),
      // Pin CLAUDE_ENV_FILE inside tmpDir: the hook appends the context key to
      // whatever that variable points at, and a dev running this suite from
      // inside Claude Code exports their own file.
      { CLAUDE_ENV_FILE: path.join(tmpDir, "claude-env.sh"), ...envOverrides },
    );
    const payload = JSON.parse(raw) as {
      hookSpecificOutput: { additionalContext: string };
    };
    return payload.hookSpecificOutput.additionalContext;
  }

  function firstReplyNotice(context: string): string {
    const closingTag = "</first-reply-notice>";
    const start = context.indexOf("<first-reply-notice>");
    const end = context.indexOf(closingTag);
    expect(start, "payload should carry a first-reply notice").toBeGreaterThan(
      -1,
    );
    expect(end).toBeGreaterThan(start);
    return context.slice(start, end + closingTag.length);
  }

  // The notice exactly as it shipped before the update reminder existed. A
  // project that is up to date must still emit these bytes and nothing else —
  // no empty block, no placeholder line. Comparing two runs of the same build
  // cannot catch a line that is added unconditionally, so this is pinned.
  const NOTICE_WITHOUT_UPDATE_HINT = [
    "<first-reply-notice>",
    "On the first visible assistant reply in this session, briefly acknowledge that Trellis SessionStart context loaded.",
    "Choose the acknowledgment language in this order:",
    "1. Use the language of the user's current request (the user message that triggered this reply).",
    "2. If that request has no clear natural language, use an explicitly established project communication language.",
    "3. If neither provides a language, output the language-neutral fallback exactly: `Trellis SessionStart ✓`.",
    "Continue directly with the user's request after the acknowledgment.",
    "The acknowledgment must not alter the language used for the remainder of the response.",
    "This notice is one-shot: do not repeat it after the first visible assistant reply in this session.",
    "</first-reply-notice>",
  ].join("\n");

  function updateMarkerPath(sessionId: string): string {
    return path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      `update-check-claude_${sessionId}.marker`,
    );
  }

  it("[session-current-task] task.py start without context key enters degraded mode (returns 0, no pointer)", () => {
    // 0.5.3 hotfix: task.py start no longer hard-fails when no session identity
    // is available (Windows + Claude Code, --continue resume, etc.). Instead it
    // prints a degraded-mode warning and returns 0 so the AI workflow can
    // proceed.
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".trellis\\\\tasks\\\\issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv(),
      },
    );

    expect(output).toContain("Session identity not available");
    expect(output).toContain("degraded");
    expect(output).toContain("conversation context");
    expect(output).toContain("TRELLIS_CONTEXT_ID");

    // No active-task pointer written
    expect(fs.existsSync(path.join(tmpDir, ".trellis", ".current-task"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(tmpDir, ".trellis", ".runtime"))).toBe(
      false,
    );

    // task.json.status remains in_progress (was already in_progress; degraded
    // mode preserves the existing status when not planning)
    const taskJsonPath = path.join(
      tmpDir,
      ".trellis",
      "tasks",
      "issue-106",
      "task.json",
    );
    const taskJson = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8"));
    expect(taskJson.status).toBe("in_progress");
  });

  it("[session-current-task] task.py start in degraded mode flips planning → in_progress", () => {
    // Verify the status flip path of degraded mode by setting up a task with
    // status=planning explicitly, then asserting the flip happened without a
    // session identity being available.
    setupTaskRepo();
    const taskJsonPath = path.join(
      tmpDir,
      ".trellis",
      "tasks",
      "issue-106",
      "task.json",
    );
    const taskJson = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8"));
    taskJson.status = "planning";
    fs.writeFileSync(taskJsonPath, JSON.stringify(taskJson, null, 2), "utf-8");

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".trellis\\\\tasks\\\\issue-106")}`,
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    expect(output).toContain("planning → in_progress");
    const after = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8"));
    expect(after.status).toBe("in_progress");
  });

  it("[session-current-task] task.py start writes session runtime state when TRELLIS_CONTEXT_ID is set", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".trellis\\\\tasks\\\\issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "session-a" }),
      },
    );

    expect(output).toContain("Source: session:session-a");
    expect(output).not.toContain("Fallback:");
    expectSessionContext("session-a", "issue-106");
    expect(fs.existsSync(path.join(tmpDir, ".trellis", ".current-task"))).toBe(
      false,
    );
  });

  it("[session-current-task] task.py finish deletes the session runtime context", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const contextPath = path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      "sessions",
      "session-finish.json",
    );

    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".trellis/tasks/issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "session-finish" }),
      },
    );
    expect(fs.existsSync(contextPath)).toBe(true);

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} finish`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "session-finish" }),
      },
    );

    expect(output).toContain("Cleared current task");
    expect(output).toContain("Source: session:session-finish");
    expect(fs.existsSync(contextPath)).toBe(false);
  });

  it("[workflow-state-r7] task.py create auto-sets session pointer when TRELLIS_CONTEXT_ID is set (planning breadcrumb reachable)", () => {
    // Pre-R7 (v0.5.0-beta.19 and earlier), `task.py create` only created the
    // task directory; the session pointer was set by `task.py start`. That
    // made the [workflow-state:planning] block dead text — the breadcrumb
    // stayed at no_task during brainstorm + jsonl curation. R7 hooked
    // set_active_task into cmd_create so the planning breadcrumb fires
    // immediately when session identity is available.
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", "custom-note"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Workflow\n");

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "r7-auto-active" --description "regression fixture" --slug r7-auto`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "r7-session" }),
      },
    );

    // Resolve the new task directory (MM-DD-r7-auto)
    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".trellis", "tasks"))
      .find((d) => d.includes("r7-auto"));
    expect(taskDir).toBeDefined();

    expectSessionContext("r7-session", "r7-auto");
  });

  it("[issue-397] task.py create stores the trimmed description and reports session activation", () => {
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", "custom-note"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Workflow\n");

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const result = spawnSync(
      pythonCmd,
      [
        taskScriptPath,
        "create",

        "described task",
        "--description",
        "  padded description  ",
        "--slug",
        "described",
      ],
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "issue-397-session" }),
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Activated task for this session");
    expect(result.stderr).toContain("Source: session:issue-397-session");

    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".trellis", "tasks"))
      .find((d) => d.includes("described"));
    expect(taskDir).toBeDefined();
    const taskJson = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, ".trellis", "tasks", taskDir as string, "task.json"),
        "utf-8",
      ),
    ) as { description: string };
    expect(taskJson.description).toBe("padded description");
  });

  it("[issue-397] task.py create --no-start does not move the session pointer", () => {
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", "custom-note"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Workflow\n");
    writeSessionContext("batch-session", ".trellis/tasks/existing-task");

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const result = spawnSync(
      pythonCmd,
      [
        taskScriptPath,
        "create",

        "batch backlog task",
        "--slug",
        "batch-backlog",
        "--description",
        "regression fixture",
        "--no-start",
      ],
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "batch-session" }),
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Skipped session activation (--no-start)");
    expectSessionContext("batch-session", "existing-task");

    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".trellis", "tasks"))
      .find((d) => d.includes("batch-backlog"));
    expect(taskDir).toBeDefined();
    const taskJson = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, ".trellis", "tasks", taskDir as string, "task.json"),
        "utf-8",
      ),
    ) as { description: string };
    expect(taskJson.description).toBe("regression fixture");
  });

  it("[workflow-state-r7] task.py create degrades silently without session identity (no .runtime side effect)", () => {
    // R7 contract: best-effort activation. No context key (CLI shell with no
    // session env) → task is still created, but no .runtime/sessions/ file is
    // written. Pre-R7 behavior parity for headless CLI usage.
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", "custom-note"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Workflow\n");

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    // sessionEnv() with no overrides drops every session-identity env var.
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "r7-cli-only" --description "regression fixture" --slug r7-cli`,
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".trellis", "tasks"))
      .find((d) => d.includes("r7-cli"));
    expect(taskDir).toBeDefined();

    const sessionsDir = path.join(tmpDir, ".trellis", ".runtime", "sessions");
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir);
      expect(files).toEqual([]);
    }
  });

  it("[workflow-state-r7] task.py create then task.py start is idempotent (pointer + status flip)", () => {
    // Finding 6: R7 made cmd_create auto-call set_active_task. cmd_start also
    // calls set_active_task. The second call must not error, and status must
    // still flip planning → in_progress correctly.
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", "custom-note"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Workflow\n");

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "r7-idem" --description "regression fixture" --slug r7-idem`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "r7-idem-session" }),
      },
    );

    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".trellis", "tasks"))
      .find((d) => d.includes("r7-idem"));
    expect(taskDir).toBeDefined();
    const relTaskDir = path.posix.join(".trellis", "tasks", taskDir as string);

    // Status should be planning after create.
    const taskJsonPath = path.join(
      tmpDir,
      ".trellis",
      "tasks",
      taskDir as string,
      "task.json",
    );
    const beforeStart = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8")) as {
      status: string;
    };
    expect(beforeStart.status).toBe("planning");

    // Now run start with the same session — must not error.
    let startStatus = 0;
    let startOutput = "";
    try {
      startOutput = execSync(
        `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(relTaskDir)}`,
        {
          cwd: tmpDir,
          encoding: "utf-8",
          env: sessionEnv({ TRELLIS_CONTEXT_ID: "r7-idem-session" }),
        },
      );
    } catch (err) {
      const e = err as { status?: number; stderr?: string; stdout?: string };
      startStatus = e.status ?? 1;
      startOutput = (e.stdout ?? "") + (e.stderr ?? "");
    }
    expect(startStatus).toBe(0);
    expect(startOutput).toContain("planning → in_progress");

    // Status flipped to in_progress.
    const afterStart = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8")) as {
      status: string;
    };
    expect(afterStart.status).toBe("in_progress");

    // Pointer still points at the same task.
    expectSessionContext("r7-idem-session", "r7-idem");
  });

  it("[session-current-task] task.py archive deletes runtime sessions pointing at the archived task", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const contextA = path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      "sessions",
      "session-a.json",
    );
    const contextB = path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      "sessions",
      "session-b.json",
    );
    const contextOther = path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      "sessions",
      "session-other.json",
    );
    writeProjectFile(
      path.join(".trellis", ".runtime", "sessions", "session-a.json"),
      JSON.stringify(
        { schema_version: 2, task_id: "issue-106", lifecycle_generation: 0 },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(".trellis", ".runtime", "sessions", "session-b.json"),
      JSON.stringify(
        { schema_version: 2, task_id: "issue-106", lifecycle_generation: 0 },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(".trellis", ".runtime", "sessions", "session-other.json"),
      JSON.stringify(
        { schema_version: 2, task_id: "other-task", lifecycle_generation: 0 },
        null,
        2,
      ),
    );

    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} archive issue-106 --no-commit`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv(),
      },
    );

    expect(fs.existsSync(contextA)).toBe(false);
    expect(fs.existsSync(contextB)).toBe(false);
    expect(fs.existsSync(contextOther)).toBe(true);
  });

  it("[task-lifecycle] task.py create refuses an archived task dir-name collision", () => {
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", "custom-note"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Workflow\n");
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const createArgs = [
      taskScriptPath,
      "create",

      "web auth retry",
      "--description",
      "regression fixture",
      "--slug",
      "web-auth-retry",
    ];
    const env = sessionEnv({ TRELLIS_CONTEXT_ID: "archive-collision" });

    execSync(
      `${pythonCmd} ${createArgs.map((arg) => JSON.stringify(arg)).join(" ")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env,
      },
    );

    const tasksDir = path.join(tmpDir, ".trellis", "tasks");
    const taskDirName = fs
      .readdirSync(tasksDir)
      .find((entry) => entry.endsWith("-web-auth-retry"));
    expect(taskDirName).toBeDefined();
    const activeTaskDir = path.join(tasksDir, taskDirName as string);
    fs.writeFileSync(path.join(activeTaskDir, "prd.md"), "# PRD\n", "utf-8");

    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} archive ${JSON.stringify(taskDirName)} --no-commit`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env,
      },
    );

    const archiveRoot = path.join(tasksDir, "archive");
    let archivedTaskDir: string | undefined;
    for (const monthDir of fs.readdirSync(archiveRoot)) {
      const candidate = path.join(archiveRoot, monthDir, taskDirName as string);
      if (fs.existsSync(candidate)) {
        archivedTaskDir = candidate;
      }
    }
    expect(archivedTaskDir).toBeDefined();
    const archivedTaskJsonPath = path.join(
      archivedTaskDir as string,
      "task.json",
    );
    const archivedPrdPath = path.join(archivedTaskDir as string, "prd.md");
    const archivedTaskJsonBefore = fs.readFileSync(
      archivedTaskJsonPath,
      "utf-8",
    );
    const archivedPrdBefore = fs.readFileSync(archivedPrdPath, "utf-8");
    const archivedTaskJson = JSON.parse(archivedTaskJsonBefore) as {
      status: string;
      completedAt: string | null;
    };
    expect(archivedTaskJson.status).toBe("completed");
    expect(archivedTaskJson.completedAt).not.toBeNull();

    const contextPath = path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      "sessions",
      "archive-collision.json",
    );
    expect(fs.existsSync(contextPath)).toBe(false);

    const result = spawnSync(pythonCmd, createArgs, {
      cwd: tmpDir,
      encoding: "utf-8",
      env,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("task_id_collision");
    expect(result.stderr).toContain(taskDirName as string);
    expect(result.stderr).toContain(".trellis/tasks/archive/");
    expect(fs.existsSync(path.join(tasksDir, taskDirName as string))).toBe(
      false,
    );
    expect(fs.readFileSync(archivedTaskJsonPath, "utf-8")).toBe(
      archivedTaskJsonBefore,
    );
    expect(fs.readFileSync(archivedPrdPath, "utf-8")).toBe(archivedPrdBefore);
    expect(fs.existsSync(contextPath)).toBe(false);
  });

  it("[task-identity] create accepts a distinct TaskId with a reused slug", () => {
    writeTrellisScripts();
    const oldPrefix = new Date().getMonth() === 0 && new Date().getDate() === 1 ? "02-02" : "01-01";
    writeProjectFile(
      path.join(".trellis", "tasks", `${oldPrefix}-reused`, "task.json"),
      JSON.stringify(emptyTaskRecord({ id: "old-task-id", name: "reused", status: "completed" })),
    );
    const args = [
      path.join(tmpDir, ".trellis", "scripts", "task.py"), "create", "New task",
      "--slug", "reused", "--task-id", "new-task-id", "--description", "Distinct task",
       "--no-start",
    ];
    const created = spawnSync(pythonCmd, args, { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() });
    expect(created.status, created.stderr).toBe(0);
    const tasksDir = path.join(tmpDir, ".trellis", "tasks");
    const createdDir = fs.readdirSync(tasksDir).find((name) => name.endsWith("-reused") && name !== `${oldPrefix}-reused`);
    expect(createdDir).toBeDefined();
    expect(JSON.parse(fs.readFileSync(path.join(tasksDir, createdDir as string, "task.json"), "utf-8"))).toMatchObject({
      id: "new-task-id", name: "reused", lifecycle_generation: 0,
    });

    const duplicateArgs = [...args];
    duplicateArgs[duplicateArgs.indexOf("--task-id") + 1] = "old-task-id";
    const duplicate = spawnSync(pythonCmd, duplicateArgs, {
      cwd: tmpDir, encoding: "utf-8", env: sessionEnv(),
    });
    expect(duplicate.status).toBe(1);
    expect(duplicate.stderr).toContain("task_id_collision");
  });

  it("[task-identity] create rejects a TaskId retained only by a remote-tracking ref", () => {
    writeTrellisScripts();
    execSync("git init -q -b main", { cwd: tmpDir });
    execSync("git config user.name Test", { cwd: tmpDir });
    execSync("git config user.email test@example.invalid", { cwd: tmpDir });
    const prior = path.join(".trellis", "tasks", "09-29-prior", "task.json");
    writeProjectFile(prior, JSON.stringify({ id: "stable-prior", status: "in_progress", lifecycle_generation: 0 }));
    execSync("git add .trellis/tasks && git commit -qm prior", { cwd: tmpDir });
    const priorHead = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();
    execSync(`git update-ref refs/remotes/origin/prior ${priorHead}`, { cwd: tmpDir });
    execSync("git rm -q .trellis/tasks/09-29-prior/task.json && git commit -qm current", { cwd: tmpDir });

    const result = spawnSync(pythonCmd, [
      path.join(tmpDir, ".trellis", "scripts", "task.py"), "create", "New task",
      "--slug", "new-task", "--task-id", "stable-prior", "--description", "new task",
       "--no-start",
    ], { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("task_id_collision");
    expect(fs.existsSync(path.join(tmpDir, ".trellis", "tasks"))).toBe(false);
  });

  it("[issue-377] task.py create normalizes a --slug carrying today's date prefix", () => {
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", "custom-note"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const now = new Date();
    const todayPrefix = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const result = spawnSync(
      pythonCmd,
      [
        taskScriptPath,
        "create",

        "Example Task",
        "--description",
        "regression fixture",
        "--slug",
        `${todayPrefix}-example-task`,
      ],
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("normalized to");
    const tasksDir = path.join(tmpDir, ".trellis", "tasks");
    expect(
      fs.existsSync(path.join(tasksDir, `${todayPrefix}-example-task`)),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tasksDir, `${todayPrefix}-${todayPrefix}-example-task`),
      ),
    ).toBe(false);
  });

  it("[issue-377] task.py create rejects a --slug carrying a different date prefix", () => {
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", "custom-note"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const now = new Date();
    // Pick a valid date prefix that is guaranteed not to be today.
    const otherPrefix =
      now.getMonth() + 1 === 1 && now.getDate() === 1 ? "02-02" : "01-01";

    const result = spawnSync(
      pythonCmd,
      [
        taskScriptPath,
        "create",

        "Example Task",
        "--description",
        "regression fixture",
        "--slug",
        `${otherPrefix}-example-task`,
      ],
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("date prefix");
    expect(result.stderr).toContain("--slug example-task");
    const tasksDir = path.join(tmpDir, ".trellis", "tasks");
    const created = fs.existsSync(tasksDir) ? fs.readdirSync(tasksDir) : [];
    expect(created.filter((d) => d.endsWith("example-task"))).toEqual([]);
  });

  it("[issue-377] task.py create leaves non-date numeric slug prefixes untouched", () => {
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", "custom-note"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const now = new Date();
    const todayPrefix = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // 13-45 is not a valid MM-DD date, so it is part of the slug body.
    const result = spawnSync(
      pythonCmd,
      [
        taskScriptPath,
        "create",

        "Example Task",
        "--description",
        "regression fixture",
        "--slug",
        "13-45-example-task",
      ],
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("normalized to");
    expect(
      fs.existsSync(
        path.join(
          tmpDir,
          ".trellis",
          "tasks",
          `${todayPrefix}-13-45-example-task`,
        ),
      ),
    ).toBe(true);
  });

  it("[task-input-contract] task.py archive accepts task name, relative path, and absolute path", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    // Create three additional task directories for the three input forms.
    const taskNames = ["issue-201", "issue-202", "issue-203"];
    for (const name of taskNames) {
      writeProjectFile(
        path.join(".trellis", "tasks", name, "task.json"),
        JSON.stringify(
          {
            ...emptyTaskRecord({ id: name }),
            id: name,
            name,
            lifecycle_generation: 0,
            children: [],
            title: `Task ${name}`,
            status: "in_progress",
            package: null,
          },
          null,
          2,
        ),
      );
    }

    // Form 1: bare slug
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} archive ${taskNames[0]} --no-commit`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv(),
      },
    );

    // Form 2: relative path
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} archive ${JSON.stringify(`.trellis/tasks/${taskNames[1]}`)} --no-commit`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv(),
      },
    );

    // Form 3: absolute path
    const absPath = path.join(tmpDir, ".trellis", "tasks", taskNames[2]);
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} archive ${JSON.stringify(absPath)} --no-commit`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv(),
      },
    );

    // All three task dirs should be removed from active tasks/.
    for (const name of taskNames) {
      expect(
        fs.existsSync(path.join(tmpDir, ".trellis", "tasks", name)),
        `task ${name} should no longer exist in active tasks/`,
      ).toBe(false);
    }

    // All three should appear under archive/<YYYY-MM>/.
    const archiveRoot = path.join(tmpDir, ".trellis", "tasks", "archive");
    expect(fs.existsSync(archiveRoot)).toBe(true);
    const archivedNames = new Set<string>();
    for (const monthDir of fs.readdirSync(archiveRoot)) {
      const monthPath = path.join(archiveRoot, monthDir);
      if (fs.statSync(monthPath).isDirectory()) {
        for (const taskDir of fs.readdirSync(monthPath)) {
          archivedNames.add(taskDir);
        }
      }
    }
    for (const name of taskNames) {
      expect(archivedNames.has(name), `task ${name} should be archived`).toBe(
        true,
      );
    }
  });

  it("[session-current-task] task.py start also uses platform-native session env when available", () => {
    // Was written against CODEX_SESSION_ID, which the 2026-08-05 env-name audit
    // proved never existed on any Codex build. Repointed to a name that is
    // empirically real (CLAUDE_CODE_SESSION_ID, verified in a live Claude Code
    // bash child) so the test still covers what it was for — the env table
    // resolving end-to-end through `task.py start` — instead of covering a
    // fiction. Codex's surviving real name has its own test below.
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".trellis/tasks/issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CLAUDE_CODE_SESSION_ID: "native-a" }),
      },
    );

    expect(output).toContain("Source: session:claude_native-a");
    expectSessionContext("claude_native-a", "issue-106");
  });

  it("[zcode-session-key] hook input and shell env resolve the same runtime key", () => {
    setupTaskRepo();
    const probePath = path.join(tmpDir, "zcode-context-key-probe.py");
    writeProjectFile(
      "zcode-context-key-probe.py",
      [
        "import json",
        "import sys",
        `sys.path.insert(0, ${JSON.stringify(path.join(tmpDir, ".trellis", "scripts"))})`,
        "from common.active_task import resolve_context_key",
        'value = "sess-zcode-review"',
        "print(json.dumps({",
        '  "hook": resolve_context_key({"session_id": value}, platform="zcode"),',
        '  "shell": resolve_context_key(),',
        "}))",
      ].join("\n"),
    );

    const result = JSON.parse(
      execSync(`${pythonCmd} ${JSON.stringify(probePath)}`, {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CLAUDE_SESSION_ID: "sess-zcode-review" }),
      }),
    ) as { hook: string; shell: string };

    expect(result).toEqual({
      hook: "claude_sess-zcode-review",
      shell: "claude_sess-zcode-review",
    });
  });

  it("[grok] Python CLIAdapter executes Grok paths, commands, and detection", () => {
    setupTaskRepo();
    fs.mkdirSync(path.join(tmpDir, ".grok"), { recursive: true });
    const probe = `
import json
import sys
from pathlib import Path

root = Path.cwd()
sys.path.insert(0, str(root / ".trellis" / "scripts"))
from common.cli_adapter import CLIAdapter, detect_platform

adapter = CLIAdapter("grok")
print(json.dumps({
    "config_dir_name": adapter.config_dir_name,
    "commands_path": adapter.get_commands_path(root, "trellis", "start.md").relative_to(root).as_posix(),
    "command_path": adapter.get_trellis_command_path("start"),
    "run": adapter.build_run_command("implement", "test prompt"),
    "resume": adapter.build_resume_command("ignored-session-id"),
    "detected": detect_platform(root),
}))
`;

    const result = spawnSync(pythonCmd, ["-c", probe], {
      cwd: tmpDir,
      encoding: "utf-8",
      env: sessionEnv(),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      config_dir_name: ".grok",
      commands_path: ".grok/commands/trellis-start.md",
      command_path: ".grok/commands/trellis-start.md",
      run: ["grok", "-p", "test prompt", "--yolo"],
      resume: ["grok", "-c"],
      detected: "grok",
    });
  });

  it("[kimi] Python CLIAdapter executes Kimi paths, commands, and detection", () => {
    setupTaskRepo();
    fs.mkdirSync(path.join(tmpDir, ".kimi-code"), { recursive: true });
    const probe = `
import json
import sys
from pathlib import Path

root = Path.cwd()
sys.path.insert(0, str(root / ".trellis" / "scripts"))
from common.cli_adapter import CLIAdapter, detect_platform

adapter = CLIAdapter("kimi")
print(json.dumps({
    "config_dir_name": adapter.config_dir_name,
    "commands_path": adapter.get_commands_path(root, "trellis", "start.md").relative_to(root).as_posix(),
    "command_path": adapter.get_trellis_command_path("start"),
    "run": adapter.build_run_command("implement", "test prompt"),
    "resume": adapter.build_resume_command("session-abc"),
    "detected": detect_platform(root),
}))
`;

    const result = spawnSync(pythonCmd, ["-c", probe], {
      cwd: tmpDir,
      encoding: "utf-8",
      env: sessionEnv(),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      config_dir_name: ".kimi-code",
      commands_path: ".kimi-code/skills/trellis-start/SKILL.md",
      command_path: ".kimi-code/skills/trellis-start/SKILL.md",
      run: ["kimi", "-p", "test prompt", "--yolo"],
      resume: ["kimi", "--session", "session-abc"],
      detected: "kimi",
    });
  });

  it("[grok] task.py start ignores GROK_SESSION_ID and enters degraded mode", () => {
    // GROK_SESSION_ID is a real Grok Build env var, but it is only injected
    // into hook script processes (confirmed against docs.x.ai and a real
    // `grok -p` run: the bash-tool subprocess that actually runs task.py only
    // sees GROK_AGENT=1). Grok therefore has no usable env session key, same
    // as ZCode/Reasonix, and correctly degrades instead of pretending to
    // resolve a session that was never available to this process.
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".trellis/tasks/issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ GROK_SESSION_ID: "native-a" }),
      },
    );

    expect(output).toContain("Session identity not available");
    expect(output).toContain("degraded");
    expect(output).not.toContain("session:grok_native-a");
    const sessionsDir = path.join(tmpDir, ".trellis", ".runtime", "sessions");
    expect(fs.existsSync(path.join(sessionsDir, "grok_native-a.json"))).toBe(
      false,
    );
  });

  it("[session-current-task] task.py start uses Codex Desktop CODEX_THREAD_ID", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".trellis/tasks/issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODEX_THREAD_ID: "thread-a" }),
      },
    );

    expect(output).toContain("Source: session:codex_thread-a");
    expectSessionContext("codex_thread-a", "issue-106");
  });

  it("[session-current-task] task.py start ignores OPENCODE_RUN_ID and enters degraded mode", () => {
    // Inverted from "uses OPENCODE_RUN_ID" on 2026-08-05. All three declared
    // OpenCode names (OPENCODE_SESSION_ID / OPENCODE_SESSIONID /
    // OPENCODE_RUN_ID) are absent from OpenCode 1.18.13's source and from the
    // 59 OPENCODE_* literals in the shipped 1.17.18 binary; the OpenCode plugin
    // is what actually carries identity, by prefixing the bash command with
    // `export TRELLIS_CONTEXT_ID=…` (plugins/inject-subagent-context.js). So
    // the env-table entry only ever pretended to work, and OpenCode now
    // degrades honestly — same shape as the Grok case above.
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".trellis/tasks/issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ OPENCODE_RUN_ID: "run-a" }),
      },
    );

    expect(output).toContain("Session identity not available");
    expect(output).toContain("degraded");
    expect(output).not.toContain("session:opencode_run-a");
    const sessionsDir = path.join(tmpDir, ".trellis", ".runtime", "sessions");
    expect(fs.existsSync(path.join(sessionsDir, "opencode_run-a.json"))).toBe(
      false,
    );
  });

  it("[session-current-task] the OpenCode plugin's TRELLIS_CONTEXT_ID prefix still activates the task", () => {
    // The other half of the test above: removing OpenCode from the env table is
    // only safe because the plugin injects the key into the bash command. This
    // reproduces exactly what plugins/inject-subagent-context.js prepends.
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".trellis/tasks/issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "opencode_run-a" }),
      },
    );

    expect(output).toContain("Source: session:opencode_run-a");
    expectSessionContext("opencode_run-a", "issue-106");
  });

  it("[env-name-purge] a purged env var name resolves no context key for its platform", () => {
    setupTaskRepo();

    const result = runActiveTaskProbe(
      "purged-env-names-probe.py",
      [
        'value = "purge-probe"',
        "out = {}",
        "for platform, name in payload:",
        "    os.environ.pop(name, None)",
        "for platform, name in payload:",
        "    os.environ[name] = value",
        "    try:",
        "        out[platform + ':' + name] = {",
        '            "scoped": resolve_context_key(None, platform=platform),',
        '            "unscoped": resolve_context_key(),',
        "        }",
        "    finally:",
        "        os.environ.pop(name, None)",
        "print(json.dumps(out))",
      ],
      PURGED_ENV_NAMES,
    );

    // "scoped" is the hook path (platform already known); "unscoped" is the
    // bash-child path that scans every entry. Both must come back empty.
    const expected: Record<
      string,
      { scoped: string | null; unscoped: string | null }
    > = {};
    for (const [platform, name] of PURGED_ENV_NAMES) {
      expected[`${platform}:${name}`] = { scoped: null, unscoped: null };
    }
    // One deliberate exception: CLAUDE_SESSION_ID is gone from the *claude*
    // entry but retained as ZCode's fallback, so an unscoped scan still finds
    // it there — and _CONTEXT_KEY_PLATFORM_ALIASES canonicalizes zcode to
    // claude, which is why the key reads `claude_`. Deleting it outright would
    // take away ZCode's only remaining candidate.
    expected["claude:CLAUDE_SESSION_ID"].unscoped = "claude_purge-probe";

    expect(result).toEqual(expected);
  });

  it("[env-name-purge] a platform absent from an env table yields no keys and does not raise", () => {
    // Purging left five platforms with no session-table entry at all. This is
    // the code path that makes that safe: _iter_env_keys filters by name, so an
    // absent platform produces an empty tuple and the caller's loop never runs.
    setupTaskRepo();

    const result = runActiveTaskProbe(
      "absent-platform-probe.py",
      [
        "out = {}",
        "for platform in payload:",
        "    out[platform] = {",
        '        "session": [n for n, _ in _iter_env_keys(_ENV_SESSION_KEYS, platform)],',
        '        "conversation": [n for n, _ in _iter_env_keys(_ENV_CONVERSATION_KEYS, platform)],',
        '        "transcript": [n for n, _ in _iter_env_keys(_ENV_TRANSCRIPT_KEYS, platform)],',
        '        "resolved": resolve_context_key(None, platform=platform),',
        "    }",
        "print(json.dumps(out))",
      ],
      ["opencode", "pi", "trae", "droid", "codebuddy", "cursor", "no-such-cli"],
    );

    expect(result).toEqual({
      // Gone from every table — identity arrives via the plugin/extension
      // command prefix (opencode, pi) or not at all (trae).
      opencode: {
        session: [],
        conversation: [],
        transcript: [],
        resolved: null,
      },
      pi: { session: [], conversation: [], transcript: [], resolved: null },
      trae: { session: [], conversation: [], transcript: [], resolved: null },
      // Session entry gone; their never-researched transcript names stay.
      droid: {
        session: [],
        conversation: [],
        transcript: ["droid"],
        resolved: null,
      },
      codebuddy: {
        session: [],
        conversation: [],
        transcript: ["codebuddy"],
        resolved: null,
      },
      // Cursor keeps the conversation and transcript rows; its session row is
      // gone. `resolved` is null because no cursor shell ticket exists here.
      cursor: {
        session: [],
        conversation: ["cursor"],
        transcript: ["cursor"],
        resolved: null,
      },
      // A platform no table has ever heard of behaves identically.
      "no-such-cli": {
        session: [],
        conversation: [],
        transcript: [],
        resolved: null,
      },
    });
  });

  it("[env-name-purge] every surviving env var name still resolves for its platform", () => {
    // The mirror image of the purge test: proof that the deletions did not
    // take a working name with them, and that ZCode now prefers Claude Code's
    // real variable over the historical invented one.
    setupTaskRepo();

    const result = runActiveTaskProbe(
      "surviving-env-names-probe.py",
      [
        "out = {}",
        "for label, env, platform in payload:",
        "    for key in list(env):",
        "        os.environ[key] = env[key]",
        "    try:",
        "        out[label] = resolve_context_key(None, platform=platform)",
        "    finally:",
        "        for key in list(env):",
        "            os.environ.pop(key, None)",
        "print(json.dumps(out))",
      ],
      [
        ["claude", { CLAUDE_CODE_SESSION_ID: "probe" }, "claude"],
        ["codex", { CODEX_THREAD_ID: "probe" }, "codex"],
        ["gemini", { GEMINI_SESSION_ID: "probe" }, "gemini"],
        ["qoder", { QODER_SESSION_ID: "probe" }, "qoder"],
        ["kiro", { KIRO_SESSION_ID: "probe" }, "kiro"],
        ["copilot", { COPILOT_SESSION_ID: "probe" }, "copilot"],
        ["copilot-alt", { COPILOT_SESSIONID: "probe" }, "copilot"],
        ["snow", { SNOW_SESSION_ID: "probe" }, "snow"],
        ["cursor-conversation", { CURSOR_CONVERSATION_ID: "probe" }, "cursor"],
        [
          "cursor-transcript",
          { CURSOR_TRANSCRIPT_PATH: "/tmp/t.md" },
          "cursor",
        ],
        // ZCode: the real Claude Code name, the historical fallback, and both
        // at once — the last one pins the ordering.
        ["zcode-real", { CLAUDE_CODE_SESSION_ID: "probe" }, "zcode"],
        ["zcode-legacy", { CLAUDE_SESSION_ID: "probe" }, "zcode"],
        [
          "zcode-prefers-real",
          { CLAUDE_CODE_SESSION_ID: "real", CLAUDE_SESSION_ID: "legacy" },
          "zcode",
        ],
        ["dsh", { DSH_SESSION_ID: "probe" }, "dsh"],
        // DSH ships no hook, so the shell path resolves with no platform hint
        // and walks the whole table. A DSH launched from Codex inherits
        // CODEX_THREAD_ID; without DSH sitting first this returned a foreign
        // `codex_outer` pointer (reported by @SajoLuo against DSH 0.1.0-rc.6).
        [
          "dsh-inherits-codex",
          { DSH_SESSION_ID: "own", CODEX_THREAD_ID: "outer" },
          null,
        ],
      ],
    );

    expect(result).toEqual({
      claude: "claude_probe",
      codex: "codex_probe",
      gemini: "gemini_probe",
      qoder: "qoder_probe",
      kiro: "kiro_probe",
      copilot: "copilot_probe",
      "copilot-alt": "copilot_probe",
      snow: "snow_probe",
      "cursor-conversation": "cursor_probe",
      "cursor-transcript": expect.stringMatching(
        /^cursor_transcript_[0-9a-f]{24}$/,
      ),
      // zcode keys canonicalize to `claude_` via _CONTEXT_KEY_PLATFORM_ALIASES
      // so the hook path and the shell path land on the same runtime file.
      "zcode-real": "claude_probe",
      "zcode-legacy": "claude_probe",
      "zcode-prefers-real": "claude_real",
      dsh: "dsh_probe",
      "dsh-inherits-codex": "dsh_own",
    });
  });

  it("[session-current-task] task.py finish ignores legacy .current-task when no session task is set", () => {
    setupTaskRepo();
    writeLegacyCurrentTask(".trellis/tasks/issue-106");
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} finish`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "session-fallback" }),
      },
    );

    expect(output).toContain("No current task set");
    expect(fs.existsSync(path.join(tmpDir, ".trellis", ".current-task"))).toBe(
      true,
    );
  });

  it("[session-current-task] task.py current ignores legacy .current-task without context key", () => {
    setupTaskRepo();
    writeLegacyCurrentTask(".trellis/tasks/issue-106");
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    let output = "";
    let status = 0;
    try {
      execSync(
        `${pythonCmd} ${JSON.stringify(taskScriptPath)} current --source`,
        {
          cwd: tmpDir,
          encoding: "utf-8",
          env: sessionEnv(),
        },
      );
    } catch (error) {
      status =
        typeof (error as { status?: unknown }).status === "number"
          ? (error as { status: number }).status
          : 1;
      output = String((error as { stdout?: unknown }).stdout ?? "");
    }

    expect(status).toBe(1);
    expect(output).toContain("Current task: (none)");
    expect(output).toContain("Source: none");
  });

  it("[session-current-task] stale session task does not fall back to legacy .current-task", () => {
    setupTaskRepo();
    writeLegacyCurrentTask(".trellis/tasks/issue-106");
    writeProjectFile(
      path.join(".trellis", ".runtime", "sessions", "session-b.json"),
      JSON.stringify(
        {
          schema_version: 1,
          repository_common_dir: tmpDir,
          task_workspace_root: tmpDir,
          current_task: ".trellis/tasks/missing-task",
        },
        null,
        2,
      ),
    );
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    const result = spawnSync(pythonCmd, [taskScriptPath, "current", "--json"], {
      cwd: tmpDir,
      encoding: "utf-8",
      env: sessionEnv({ TRELLIS_CONTEXT_ID: "session-b" }),
    });
    expect(result.status).toBe(1);
    const output = JSON.parse(result.stdout) as {
      current_task: unknown;
      stale: boolean;
      error: string;
    };
    expect(output.current_task).toBeNull();
    expect(output.stale).toBe(true);
    expect(output.error).toContain("unsupported_binding_schema");
    expect(result.stdout).not.toContain("issue-106");
  });

  it("[session-current-task] Claude statusline uses session-scoped task when session_id is present", () => {
    setupTaskRepo();
    writeLegacyCurrentTask(".trellis/tasks/issue-106");
    writeProjectFile(
      path.join(".trellis", "tasks", "session-task", "task.json"),
      JSON.stringify(
        {
          ...emptyTaskRecord({ id: "session-task" }),
          id: "session-task",
          name: "session-task",
          lifecycle_generation: 0,
          children: [],
          title: "Session scoped task",
          status: "in_progress",
          priority: "P1",
        },
        null,
        2,
      ),
    );
    writeSessionContext("claude_status-a", ".trellis/tasks/session-task");
    writeProjectFile(
      path.join(".claude", "hooks", "statusline.py"),
      getStatuslineHook(),
    );

    const nowSecs = Math.floor(Date.now() / 1000);
    const output = runPythonWithLegacyStdinLocale(
      path.join(".claude", "hooks", "statusline.py"),
      JSON.stringify({
        session_id: "status-a",
        model: { display_name: "中文模型" },
        context_window: { used_percentage: 1, context_window_size: 1000 },
        cost: { total_duration_ms: 0 },
        rate_limits: {
          five_hour: {
            used_percentage: 17,
            resets_at: nowSecs + 4 * 3600 + 31 * 60 + 60,
          },
          seven_day: {
            used_percentage: 19,
            resets_at: nowSecs + 2 * 86400 + 11 * 3600 + 60,
          },
        },
      }),
    );

    expect(output).toContain("Session scoped task");
    expect(output).toContain("中文模型");
    expect(output).toContain("[session]");
    expect(output).not.toContain("Issue 106 task");
    // Rate-limit display with reset countdown (opt-in statusline enhancement)
    expect(output).toContain("5h 17%");
    expect(output).toMatch(/\(reset 4h3[12]m\)/);
    expect(output).toContain("7d 19%");
    expect(output).toContain("(reset 2d11h)");
  });

  it("[session-current-task] Claude statusline ignores legacy .current-task without session context", () => {
    setupTaskRepo();
    writeLegacyCurrentTask(".trellis/tasks/issue-106");
    writeProjectFile(
      path.join(".claude", "hooks", "statusline.py"),
      getStatuslineHook(),
    );

    const output = runPython(
      path.join(".claude", "hooks", "statusline.py"),
      JSON.stringify({
        model: { display_name: "Test" },
        context_window: { used_percentage: 1, context_window_size: 1000 },
        cost: { total_duration_ms: 0 },
      }),
    );

    expect(output).not.toContain("Issue 106 task");
    expect(output).not.toContain("[global]");
  });

  it("[statusline-opt-in] Claude statusline tolerates ISO-8601 resets_at and missing seven_day (no crash)", () => {
    setupTaskRepo();
    writeProjectFile(
      path.join(".claude", "hooks", "statusline.py"),
      getStatuslineHook(),
    );

    // resets_at wire format is not pinned across Claude Code versions:
    // epoch seconds and ISO-8601 strings have both been observed. The
    // statusline must render the countdown for ISO too — and never crash.
    const isoReset = new Date(
      Date.now() + (4 * 3600 + 31 * 60 + 90) * 1000,
    ).toISOString();
    const output = runPython(
      path.join(".claude", "hooks", "statusline.py"),
      JSON.stringify({
        model: { display_name: "Test" },
        context_window: { used_percentage: 1, context_window_size: 1000 },
        cost: { total_duration_ms: 0 },
        rate_limits: {
          five_hour: { used_percentage: 17, resets_at: isoReset },
          // seven_day intentionally absent
        },
      }),
    );

    expect(output).toContain("5h 17%");
    expect(output).toMatch(/\(reset 4h3[12]m\)/);
    expect(output).not.toContain("7d");
  });

  it("[statusline-opt-in] Claude statusline moves rate limits to their own line when COLUMNS is narrow", () => {
    setupTaskRepo();
    writeProjectFile(
      path.join(".claude", "hooks", "statusline.py"),
      getStatuslineHook(),
    );

    // COLUMNS is injected by Claude Code v2.1.153+. The split must be an
    // explicit "\n": the status bar counts only newlines for its height,
    // so relying on terminal auto-wrap misaligns rows.
    const output = runPython(
      path.join(".claude", "hooks", "statusline.py"),
      statuslineRateLimitPayload(),
      { COLUMNS: "60" },
    );

    const lines = output.trimEnd().split("\n");
    expect(lines.length).toBe(2);
    const [infoLine, rateLine] = lines;
    expect(infoLine).not.toContain("5h");
    expect(infoLine).not.toContain("7d");
    expect(rateLine).toContain("5h 17%");
    expect(rateLine).toContain("7d 19%");
  });

  it("[statusline-opt-in] Claude statusline stays single-line when COLUMNS is wide or unset", () => {
    setupTaskRepo();
    writeProjectFile(
      path.join(".claude", "hooks", "statusline.py"),
      getStatuslineHook(),
    );

    for (const env of [{ COLUMNS: "500" }, { COLUMNS: undefined }]) {
      const output = runPython(
        path.join(".claude", "hooks", "statusline.py"),
        statuslineRateLimitPayload(),
        env,
      );
      const lines = output.trimEnd().split("\n");
      expect(lines.length).toBe(1);
      expect(lines[0]).toContain("5h 17%");
      expect(lines[0]).toContain("7d 19%");
    }
  });

  it("[session-current-task] Python session-start hooks resolve session backslash refs without stale pointer", () => {
    setupTaskRepo();
    writeSessionContext("claude_session-a", ".trellis\\tasks\\issue-106");
    writeSessionContext("codex_session-a", ".trellis\\tasks\\issue-106");

    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(claudeSessionStart, "claude session-start"),
    );
    writeProjectFile(
      path.join(".codex", "hooks", "session-start.py"),
      expectTemplateContent(codexSessionStart, "codex session-start"),
    );

    const claudeOutput = runPython(
      path.join(".claude", "hooks", "session-start.py"),
      JSON.stringify({ cwd: tmpDir, session_id: "session-a" }),
    );
    const codexOutput = runPython(
      path.join(".codex", "hooks", "session-start.py"),
      JSON.stringify({ cwd: tmpDir, session_id: "session-a" }),
    );

    expect(claudeOutput).toContain("Status: IN_PROGRESS");
    expect(claudeOutput).not.toContain("STALE POINTER");

    const codexPayload = JSON.parse(codexOutput) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(codexPayload.hookSpecificOutput.additionalContext).toContain(
      "Status: IN_PROGRESS",
    );
    expect(codexPayload.hookSpecificOutput.additionalContext).not.toContain(
      "STALE POINTER",
    );
  });

  it("[session-current-task] Claude SessionStart persists TRELLIS_CONTEXT_ID for Bash commands", () => {
    setupTaskRepo();
    const sessionStartScript = getSharedHookScripts().find(
      (hook) => hook.name === "session-start.py",
    )?.content;
    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(sessionStartScript, "claude session-start"),
    );
    const envFile = path.join(tmpDir, "claude-env.sh");

    runPython(
      path.join(".claude", "hooks", "session-start.py"),
      JSON.stringify({
        session_id: "bash-start-a",
        transcript_path: path.join(tmpDir, "transcript.jsonl"),
        cwd: tmpDir,
        hook_event_name: "SessionStart",
      }),
      { CLAUDE_ENV_FILE: envFile },
    );

    expect(fs.readFileSync(envFile, "utf-8")).toContain(
      "export TRELLIS_CONTEXT_ID=claude_bash-start-a",
    );
  });

  it("[env-file-dedup] repeated SessionStarts with the same key append exactly once", () => {
    setupTaskRepo();
    writeClaudeSessionStartHook();
    const envFile = path.join(tmpDir, "claude-env.sh");
    // The env file belongs to the user — pre-existing content must survive.
    fs.writeFileSync(envFile, 'export http_proxy="http://127.0.0.1:7890"\n');

    runSessionStart("dedup-a", envFile);
    runSessionStart("dedup-a", envFile);
    runSessionStart("dedup-a", envFile);

    expect(contextIdExports(envFile)).toEqual([
      "export TRELLIS_CONTEXT_ID=claude_dedup-a",
    ]);
    expect(fs.readFileSync(envFile, "utf-8")).toContain(
      'export http_proxy="http://127.0.0.1:7890"',
    );
  });

  it("[env-file-dedup] a changed key appends again", () => {
    setupTaskRepo();
    writeClaudeSessionStartHook();
    const envFile = path.join(tmpDir, "claude-env.sh");

    runSessionStart("dedup-a", envFile);
    runSessionStart("dedup-a", envFile);
    runSessionStart("dedup-b", envFile);
    runSessionStart("dedup-b", envFile);

    expect(contextIdExports(envFile)).toEqual([
      "export TRELLIS_CONTEXT_ID=claude_dedup-a",
      "export TRELLIS_CONTEXT_ID=claude_dedup-b",
    ]);
  });

  it("[env-file-dedup] switching back to an earlier key re-appends (last line wins, not 'appears anywhere')", () => {
    // A -> B -> A. `claude_dedup-a` is already in the file when the third
    // SessionStart runs, but the LAST export assigns `claude_dedup-b`, so the
    // sourced shell would be on B. Skipping here would hand later Bash
    // commands the wrong session identity.
    setupTaskRepo();
    writeClaudeSessionStartHook();
    const envFile = path.join(tmpDir, "claude-env.sh");

    runSessionStart("dedup-a", envFile);
    runSessionStart("dedup-b", envFile);
    runSessionStart("dedup-a", envFile);

    expect(contextIdExports(envFile)).toEqual([
      "export TRELLIS_CONTEXT_ID=claude_dedup-a",
      "export TRELLIS_CONTEXT_ID=claude_dedup-b",
      "export TRELLIS_CONTEXT_ID=claude_dedup-a",
    ]);
  });

  it("[env-file-dedup] an unwritable or unreadable CLAUDE_ENV_FILE is a silent no-op", () => {
    setupTaskRepo();
    writeClaudeSessionStartHook();

    // Path under a directory that does not exist: both the dedup read and the
    // append raise OSError. The hook must still emit its payload.
    const missing = path.join(tmpDir, "no-such-dir", "claude-env.sh");
    expect(() => runSessionStart("dedup-missing", missing)).not.toThrow();
    expect(fs.existsSync(missing)).toBe(false);

    // Path pointing at a directory: the dedup read raises OSError on POSIX
    // (IsADirectoryError) and on Windows (PermissionError).
    const asDirectory = path.join(tmpDir, "env-dir");
    fs.mkdirSync(asDirectory);
    expect(() => runSessionStart("dedup-dir", asDirectory)).not.toThrow();
    expect(fs.statSync(asDirectory).isDirectory()).toBe(true);
  });

  it("[env-file-dedup] a non-UTF-8 user env file does not break SessionStart", () => {
    // UnicodeDecodeError is a ValueError, not an OSError — reading the user's
    // file without errors="replace" would escape the non-fatal guard.
    setupTaskRepo();
    writeClaudeSessionStartHook();
    const envFile = path.join(tmpDir, "claude-env.sh");
    fs.writeFileSync(envFile, Buffer.from([0xff, 0xfe, 0x0a]));

    expect(() => runSessionStart("dedup-latin", envFile)).not.toThrow();
    expect(contextIdExports(envFile)).toEqual([
      "export TRELLIS_CONTEXT_ID=claude_dedup-latin",
    ]);
  });

  it.skipIf(isWindows)(
    "[session-update-hint] a stale .trellis/.version reaches the user through the first-reply notice",
    () => {
      setupTaskRepo();
      writeClaudeSessionStartHook();
      const fakeCli = writeFakeTrellisCli(REPORTS_0_5_9);
      writeProjectFile(path.join(".trellis", ".version"), "0.5.0\n");

      const context = sessionStartContext("update-stale", fakeCli);

      // Inside the notice, not merely somewhere in the payload: a hint the
      // assistant is not told to say out loud never reaches the maintainer.
      expect(firstReplyNotice(context)).toContain(
        "Trellis update available: 0.5.0 -> 0.5.9, run trellis update",
      );
      expect(firstReplyNotice(context)).toContain(
        "on its own line in that same reply",
      );
      expect(trellisCliCallCount()).toBe(1);
    },
  );

  it.skipIf(isWindows)(
    "[session-update-hint] an up-to-date project emits a byte-identical payload",
    () => {
      setupTaskRepo();
      writeClaudeSessionStartHook();
      const fakeCli = writeFakeTrellisCli(REPORTS_0_5_9);

      // No .trellis/.version: the hint path cannot produce anything, so this
      // is the payload exactly as it was shipped before the change.
      const baseline = sessionStartContext("update-baseline", fakeCli);

      writeProjectFile(path.join(".trellis", ".version"), "0.6.0\n");
      const upToDate = sessionStartContext("update-current", fakeCli);

      expect(baseline).not.toContain("Trellis update available");
      expect(firstReplyNotice(upToDate)).toBe(NOTICE_WITHOUT_UPDATE_HINT);
      expect(upToDate).toBe(baseline);
    },
  );

  it.skipIf(isWindows)(
    "[session-update-hint] the once-per-session marker suppresses the second version probe",
    () => {
      setupTaskRepo();
      writeClaudeSessionStartHook();
      const fakeCli = writeFakeTrellisCli(REPORTS_0_5_9);
      writeProjectFile(path.join(".trellis", ".version"), "0.5.0\n");

      const first = sessionStartContext("update-marker", fakeCli);
      // SessionStart also fires on clear/compact within the same session.
      const second = sessionStartContext("update-marker", fakeCli);

      expect(first).toContain("Trellis update available: 0.5.0 -> 0.5.9");
      expect(second).not.toContain("Trellis update available");
      expect(trellisCliCallCount()).toBe(1);
      // The marker is keyed by the identity the hook resolved from stdin, not
      // by session_context's TERM_SESSION_ID / ppid fallback — the latter is a
      // terminal window, which would mute the reminder for every later session
      // opened in it.
      expect(fs.existsSync(updateMarkerPath("update-marker"))).toBe(true);
    },
  );

  it.skipIf(isWindows)(
    "[session-update-hint] a failing or hanging trellis CLI stays silent and leaves the check for the next session",
    () => {
      setupTaskRepo();
      writeClaudeSessionStartHook();
      writeProjectFile(path.join(".trellis", ".version"), "0.5.0\n");

      const failing = writeFakeTrellisCli(
        'echo called >> "$TRELLIS_FAKE_CALL_LOG"\necho boom >&2\nexit 1\n',
      );
      const afterFailure = sessionStartContext("update-fail", failing);

      // Hangs well past the hint path's 1s subprocess timeout.
      const hanging = writeFakeTrellisCli(
        'echo called >> "$TRELLIS_FAKE_CALL_LOG"\nsleep 5\n',
      );
      const afterTimeout = sessionStartContext("update-hang", hanging);

      for (const context of [afterFailure, afterTimeout]) {
        expect(context).not.toContain("Trellis update available");
        expect(context).toContain("<first-reply-notice>");
        expect(context).toContain("<task-status>");
      }
      // A probe that never produced an answer must not burn the marker.
      expect(fs.existsSync(updateMarkerPath("update-fail"))).toBe(false);
      expect(fs.existsSync(updateMarkerPath("update-hang"))).toBe(false);
    },
  );

  it("[session-update-hint] an unreadable .trellis/.version leaves SessionStart working and silent", () => {
    setupTaskRepo();
    writeClaudeSessionStartHook();
    // A directory where the version file belongs: read_text raises OSError
    // (IsADirectoryError on POSIX, PermissionError on Windows) before the hint
    // path ever reaches `trellis --version`.
    fs.mkdirSync(path.join(tmpDir, ".trellis", ".version"));

    const context = sessionStartContext("update-unreadable");

    expect(context).not.toContain("Trellis update available");
    expect(context).toContain("<first-reply-notice>");
    expect(context).toContain("<task-status>");
  });

  it("[session-current-task] Cursor beforeShellExecution bridges conversation_id into task.py shell commands", () => {
    setupTaskRepo();
    const shellBridgeScript = getSharedHookScripts().find(
      (hook) => hook.name === "inject-shell-session-context.py",
    )?.content;
    writeProjectFile(
      path.join(".cursor", "hooks", "inject-shell-session-context.py"),
      expectTemplateContent(shellBridgeScript, "cursor shell bridge"),
    );

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const unicodeProbe = "测试质量。\n第二行";
    const hookOutput = runPythonWithLegacyStdinLocale(
      path.join(".cursor", "hooks", "inject-shell-session-context.py"),
      JSON.stringify({
        cursor_version: "3.1.17",
        conversation_id: "cursor-shell-a",
        generation_id: "gen-a",
        cwd: tmpDir,
        command: `${pythonCmd} ./.trellis/scripts/task.py start .trellis/tasks/issue-106 && ${pythonCmd} ./.trellis/scripts/task.py current --source && echo '${unicodeProbe}'`,
        hook_event_name: "beforeShellExecution",
      }),
    );
    expect(JSON.parse(hookOutput) as { permission?: string }).toMatchObject({
      permission: "allow",
    });
    // Ticket directory renamed cursor-shell -> shell-tickets when the bridge
    // stopped being Cursor-only. Every Cursor-observable assertion in this
    // test (permission allow, context key, session file) is unchanged.
    const [ticketName] = fs.readdirSync(
      path.join(tmpDir, ".trellis", ".runtime", "shell-tickets"),
    );
    const ticket = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, ".trellis", ".runtime", "shell-tickets", ticketName),
        "utf-8",
      ),
    ) as { command: string };
    expect(ticket.command).toContain(unicodeProbe);

    const startOutput = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".trellis/tasks/issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv(),
      },
    );
    expect(startOutput).toContain("Source: session:cursor_cursor-shell-a");

    const currentOutput = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} current --source`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv(),
      },
    );
    expect(currentOutput).toContain("Current task: .trellis/tasks/issue-106");
    expect(currentOutput).toContain("Source: session:cursor_cursor-shell-a");

    expectSessionContext("cursor_cursor-shell-a", "issue-106");
  });
});

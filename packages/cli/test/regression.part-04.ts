// Mechanical split of regression.test.ts; imported by the canonical test entry.

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task";
import { getSharedHookScripts } from "../src/templates/shared-hooks/index.js";
import { getAllScripts } from "../src/templates/trellis/index.js";
describe("regression: current-task path normalization", () => {
  let tmpDir: string;
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  const claudeSessionStart = getSharedHookScripts().find(
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

  function expectTemplateContent(
    content: string | undefined,
    label: string,
  ): string {
    expect(content, `${label} template should exist`).toBeTruthy();
    return content ?? "";
  }

  // ------------------------------------------------------------
  // inject-workflow-state.py hook (workflow-enforcement-v2)
  // ------------------------------------------------------------

  const injectWorkflowStateScript = getSharedHookScripts().find(
    (hook) => hook.name === "inject-workflow-state.py",
  )?.content;

  // ------------------------------------------------------------
  // workflow_phase.get_phase_index() expansion (FP round 3)
  //   Now returns Phase Index + Phase 1/2/3 bodies (was Phase Index only).
  // ------------------------------------------------------------

  function templateWorkflowMd(): string {
    const { readFileSync } = fs;
    const { dirname, join: pathJoin } = path;
    const templatePath = pathJoin(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "templates",
      "trellis",
      "workflow.md",
    );
    return readFileSync(templatePath, "utf-8");
  }

  function runContinuation() {
    return spawnSync(
      pythonCmd,
      [
        "-B",
        path.join(tmpDir, ".trellis", "scripts", "get_context.py"),
        "--mode",
        "continuation",
      ],
      { cwd: tmpDir, encoding: "utf-8" },
    );
  }

  // ------------------------------------------------------------
  // [issue-codex-dispatch-mode] config-driven dispatch mode for codex
  // ------------------------------------------------------------

  function writeCodexInjectHook(): string {
    const rel = path.join(".codex", "hooks", "inject-workflow-state.py");
    writeProjectFile(
      rel,
      expectTemplateContent(injectWorkflowStateScript, "inject-workflow-state"),
    );
    return rel;
  }

  function writeConfigYaml(content: string): void {
    writeProjectFile(path.join(".trellis", "config.yaml"), content);
  }

  // --- Branch metadata recorded at start, validated at archive -------------

  function initTaskGitRepo(branch: string, withRemote = false): void {
    execSync(`git init -q -b ${branch}`, { cwd: tmpDir });
    execSync("git config user.email test@example.com", { cwd: tmpDir });
    execSync("git config user.name Test", { cwd: tmpDir });
    execSync("git add -A", { cwd: tmpDir });
    execSync("git commit -q -m init", { cwd: tmpDir });
    if (withRemote) {
      // Never contacted: the fixture only needs a configured remote.
      execSync("git remote add origin https://example.invalid/repo.git", {
        cwd: tmpDir,
      });
    }
  }

  function patchIssue106Task(fields: Record<string, unknown>): string {
    const taskJsonPath = path.join(
      tmpDir,
      ".trellis",
      "tasks",
      "issue-106",
      "task.json",
    );
    const data = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8"));
    fs.writeFileSync(
      taskJsonPath,
      JSON.stringify({ ...data, ...fields }, null, 2),
    );
    return taskJsonPath;
  }

  function readIssue106Task(): { branch: string | null; status: string } {
    return JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, ".trellis", "tasks", "issue-106", "task.json"),
        "utf-8",
      ),
    );
  }

  it("[validation-preflight] task.py create prints jsonl curation instructions instead of writing them into the files", () => {
    setupTaskRepo();
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const result = spawnSync(
      pythonCmd,
      [
        taskScriptPath,
        "create",

        "curation hint task",
        "--description",
        "regression fixture",
        "--slug",
        "curation-hint-task",
      ],
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Curate implement.jsonl / check.jsonl");
    expect(result.stderr).toContain('{"file": "<path>", "reason": "<why>"}');
    expect(result.stderr).toContain("get_context.py --mode packages");
  });

  it("[grok] task.py create creates empty jsonl when Grok is the only sub-agent platform", () => {
    setupTaskRepo();
    fs.mkdirSync(path.join(tmpDir, ".grok"), { recursive: true });
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "grok task" --description "regression fixture" --slug grok-task`,
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    const tasksDir = path.join(tmpDir, ".trellis", "tasks");
    const taskName = fs
      .readdirSync(tasksDir)
      .find((name) => name.includes("grok-task"));
    expect(taskName).toBeDefined();
    const taskDir = path.join(tasksDir, taskName as string);

    for (const jsonlName of ["implement.jsonl", "check.jsonl"]) {
      const jsonlPath = path.join(taskDir, jsonlName);
      expect(fs.existsSync(jsonlPath), `${jsonlName} should exist`).toBe(true);
      expect(fs.readFileSync(jsonlPath, "utf-8"), jsonlName).toBe("");
    }
  });

  it("[kimi] task.py create creates empty jsonl when Kimi is the only sub-agent platform", () => {
    setupTaskRepo();
    fs.mkdirSync(path.join(tmpDir, ".kimi-code"), { recursive: true });
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "kimi task" --description "regression fixture" --slug kimi-task`,
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    const tasksDir = path.join(tmpDir, ".trellis", "tasks");
    const taskName = fs
      .readdirSync(tasksDir)
      .find((name) => name.includes("kimi-task"));
    expect(taskName).toBeDefined();
    const taskDir = path.join(tasksDir, taskName as string);

    for (const jsonlName of ["implement.jsonl", "check.jsonl"]) {
      const jsonlPath = path.join(taskDir, jsonlName);
      expect(fs.existsSync(jsonlPath), `${jsonlName} should exist`).toBe(true);
      expect(fs.readFileSync(jsonlPath, "utf-8"), jsonlName).toBe("");
    }
  });

  it("[issue-373] task.py create does NOT seed jsonl for Codex inline mode", () => {
    setupTaskRepo();
    fs.mkdirSync(path.join(tmpDir, ".codex"), { recursive: true });
    writeConfigYaml("codex:\n  dispatch_mode: inline\n");
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "codex inline task" --description "regression fixture" --slug codex-inline-task`,
      { cwd: tmpDir, encoding: "utf-8" },
    );

    const taskDir = path.join(
      tmpDir,
      ".trellis",
      "tasks",
      fs
        .readdirSync(path.join(tmpDir, ".trellis", "tasks"))
        .find((d) => d.includes("codex-inline-task")) as string,
    );
    expect(fs.existsSync(path.join(taskDir, "implement.jsonl"))).toBe(false);
    expect(fs.existsSync(path.join(taskDir, "check.jsonl"))).toBe(false);
  });

  it("[issue-373] task.py create creates empty jsonl when Codex explicitly uses sub-agent dispatch", () => {
    setupTaskRepo();
    fs.mkdirSync(path.join(tmpDir, ".codex"), { recursive: true });
    writeProjectFile(
      path.join(".trellis", "config.yaml"),
      "codex:\n  dispatch_mode: sub-agent  # opt into trellis-* sub-agents\n",
    );
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "codex subagent task" --description "regression fixture" --slug codex-subagent-task`,
      { cwd: tmpDir, encoding: "utf-8" },
    );

    const taskDir = path.join(
      tmpDir,
      ".trellis",
      "tasks",
      fs
        .readdirSync(path.join(tmpDir, ".trellis", "tasks"))
        .find((d) => d.includes("codex-subagent-task")) as string,
    );
    for (const jsonlName of ["implement.jsonl", "check.jsonl"]) {
      const jsonlPath = path.join(taskDir, jsonlName);
      expect(fs.existsSync(jsonlPath), `${jsonlName} should exist`).toBe(true);
      expect(fs.readFileSync(jsonlPath, "utf-8"), jsonlName).toBe("");
    }
  });

  it("[init-context-removal] task.py init-context is deprecated with clear pointer to planning artifacts", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    let threw = false;
    let stderr = "";
    try {
      execSync(
        `${pythonCmd} ${JSON.stringify(taskScriptPath)} init-context .trellis/tasks/issue-106 fullstack`,
        { cwd: tmpDir, encoding: "utf-8" },
      );
    } catch (err) {
      threw = true;
      const e = err as { stderr?: string; status?: number };
      stderr = e.stderr ?? "";
      expect(e.status).toBe(2);
    }
    expect(threw).toBe(true);
    expect(stderr).toContain("v0.5.0-beta.12");
    expect(stderr).toContain("planning artifact guidance");
    expect(stderr).toContain("add-context");
  });

  it("[init-context-removal] inject-subagent-context.py skips seed rows (no `file` field)", () => {
    // Hook's read_jsonl_entries should return empty list when jsonl contains
    // only a seed row — not crash, not treat `_example` as a path.
    const hookContent = getSharedHookScripts().find(
      (h) => h.name === "inject-subagent-context.py",
    )?.content;
    expect(hookContent).toBeDefined();
    const hookPath = path.join(tmpDir, "hook.py");
    fs.writeFileSync(hookPath, hookContent as string, "utf-8");

    // Minimal fake jsonl with only seed
    const jsonlDir = path.join(tmpDir, "repo");
    fs.mkdirSync(jsonlDir, { recursive: true });
    fs.writeFileSync(
      path.join(jsonlDir, "seed.jsonl"),
      JSON.stringify({ _example: "seed row" }) + "\n",
      "utf-8",
    );

    // Run a tiny Python snippet that imports the hook module and calls
    // read_jsonl_entries. Capturing the stderr warning proves the code path.
    const probeScript = `
import sys, importlib.util
spec = importlib.util.spec_from_file_location("h", ${JSON.stringify(hookPath)})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
entries = mod.read_jsonl_entries(${JSON.stringify(jsonlDir)}, "seed.jsonl")
print(len(entries))
`;
    const probePath = path.join(tmpDir, "probe.py");
    fs.writeFileSync(probePath, probeScript, "utf-8");
    const result = execSync(`${pythonCmd} ${JSON.stringify(probePath)}`, {
      cwd: tmpDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    expect(result.trim()).toBe("0");
  });

  it("[#573] task.py validate fails for a freshly created task until manifests are curated", () => {
    setupTaskRepo();
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "seed-only" --description "regression fixture" --slug seed-only-task`,
      { cwd: tmpDir, encoding: "utf-8" },
    );
    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".trellis", "tasks"))
      .find((d) => d.includes("seed-only-task"));
    expect(taskDir).toBeDefined();
    const relTaskDir = path.posix.join(".trellis", "tasks", taskDir as string);

    const result = spawnSync(
      pythonCmd,
      [taskScriptPath, "validate", relTaskDir],
      { cwd: tmpDir, encoding: "utf-8" },
    );
    // Seed-only manifests used to pass with a green "✓ (0 entries)", so
    // sub-agents silently ran with zero spec context (#573).
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("0 curated entries");
    expect(result.stdout).toContain("add-context");
    expect(result.stdout).toContain("--allow-empty-context");
  });

  describe("[validation-preflight] task.py validate vs PR preflight contract", () => {
    // Each case writes the manifests directly, then runs the real validator.
    // Create → validate must never produce a task that validates locally and
    // then trips PR preflight's `_example` scaffolding rule.
    const placeholderRow =
      '{"_example": "Fill with {\\"file\\": \\"<path>\\", \\"reason\\": \\"<why>\\"}."}\n';
    // Curated row for the manifest not under test: an empty manifest is
    // itself an error since #573, which would obscure the count under test.
    const curatedRow =
      '{"file":".trellis/spec/guides/index.md","reason":"guideline"}\n';

    function validateWith(
      implementContent: string,
      checkContent: string,
    ): ReturnType<typeof spawnSync> {
      setupTaskRepo();
      const taskDir = path.join(tmpDir, ".trellis", "tasks", "issue-106");
      fs.writeFileSync(
        path.join(taskDir, "implement.jsonl"),
        implementContent,
        "utf-8",
      );
      fs.writeFileSync(
        path.join(taskDir, "check.jsonl"),
        checkContent,
        "utf-8",
      );
      const taskScriptPath = path.join(
        tmpDir,
        ".trellis",
        "scripts",
        "task.py",
      );
      return spawnSync(
        pythonCmd,
        [taskScriptPath, "validate", ".trellis/tasks/issue-106"],
        { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
      );
    }

    it("rejects a placeholder-only implement.jsonl with file, line, and remediation", () => {
      const result = validateWith(placeholderRow, curatedRow);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        "implement.jsonl:1: Placeholder `_example` row",
      );
      expect(result.stdout).toContain('{"file": "<path>", "reason": "<why>"}');
      expect(result.stdout).toContain("Validation failed (1 errors)");
    });

    it("rejects a placeholder row in check.jsonl too", () => {
      const result = validateWith(curatedRow, placeholderRow);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        "check.jsonl:1: Placeholder `_example` row",
      );
    });

    it("rejects a placeholder row that sits alongside curated entries", () => {
      const result = validateWith(`${placeholderRow}${curatedRow}`, curatedRow);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        "implement.jsonl:1: Placeholder `_example` row",
      );
      expect(result.stdout).toContain("Validation failed (1 errors)");
    });

    it("[#573] fails for empty manifests instead of passing them silently", () => {
      const result = validateWith("", "");
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        "implement.jsonl: ✗ (0 curated entries — sub-agents would get zero spec context)",
      );
      expect(result.stdout).toContain(
        "check.jsonl: ✗ (0 curated entries — sub-agents would get zero spec context)",
      );
      expect(result.stdout).toContain("add-context <task> implement");
      expect(result.stdout).toContain("--allow-empty-context");
    });

    it("passes for curated entries pointing at real files", () => {
      setupTaskRepo();
      const taskDir = path.join(tmpDir, ".trellis", "tasks", "issue-106");
      const curated =
        '{"file":".trellis/spec/guides/index.md","reason":"guideline"}\n';
      fs.writeFileSync(path.join(taskDir, "implement.jsonl"), curated, "utf-8");
      fs.writeFileSync(path.join(taskDir, "check.jsonl"), curated, "utf-8");
      const taskScriptPath = path.join(
        tmpDir,
        ".trellis",
        "scripts",
        "task.py",
      );
      const result = spawnSync(
        pythonCmd,
        [taskScriptPath, "validate", ".trellis/tasks/issue-106"],
        { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("All validations passed");
    });

    it("still rejects malformed JSON lines", () => {
      const result = validateWith("{not json\n", curatedRow);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("implement.jsonl:1: Invalid JSON");
    });

    it("reports a non-object row instead of crashing on it", () => {
      // Valid JSON, wrong shape — the row must be an error with a line
      // number, not an AttributeError traceback out of `data.get`.
      const result = validateWith(
        '"just a string"\n[1, 2]\nnull\n',
        curatedRow,
      );
      expect(result.status).toBe(1);
      expect(result.stderr).not.toContain("Traceback");
      for (const line of [1, 2, 3]) {
        expect(result.stdout).toContain(
          `implement.jsonl:${line}: Expected a JSON object`,
        );
      }
      expect(result.stdout).toContain("Validation failed (3 errors)");
    });

    it("list-context skips non-object rows instead of crashing on them", () => {
      // Same wrong-shape rows as the validate case above — list-context is a
      // read-only listing, so it skips them and still lists curated entries.
      setupTaskRepo();
      const taskDir = path.join(tmpDir, ".trellis", "tasks", "issue-106");
      fs.writeFileSync(
        path.join(taskDir, "implement.jsonl"),
        '"just a string"\n[1, 2]\nnull\n{"file":".trellis/spec/guides/index.md","reason":"guideline"}\n',
        "utf-8",
      );
      fs.writeFileSync(path.join(taskDir, "check.jsonl"), "", "utf-8");
      const taskScriptPath = path.join(
        tmpDir,
        ".trellis",
        "scripts",
        "task.py",
      );
      const result = spawnSync(
        pythonCmd,
        [taskScriptPath, "list-context", ".trellis/tasks/issue-106"],
        { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
      );
      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain("Traceback");
      expect(result.stdout).toContain(".trellis/spec/guides/index.md");
    });

    it("rejects a placeholder row inside an archived task", () => {
      setupTaskRepo();
      const archivedDir = path.join(
        tmpDir,
        ".trellis",
        "tasks",
        "archive",
        "2026-07",
        "07-01-archived-task",
      );
      fs.mkdirSync(archivedDir, { recursive: true });
      fs.writeFileSync(
        path.join(archivedDir, "task.json"),
        JSON.stringify({ title: "Archived", status: "completed" }, null, 2),
      );
      fs.writeFileSync(
        path.join(archivedDir, "implement.jsonl"),
        placeholderRow,
        "utf-8",
      );
      fs.writeFileSync(path.join(archivedDir, "check.jsonl"), "", "utf-8");
      const taskScriptPath = path.join(
        tmpDir,
        ".trellis",
        "scripts",
        "task.py",
      );
      const result = spawnSync(
        pythonCmd,
        [
          taskScriptPath,
          "validate",
          ".trellis/tasks/archive/2026-07/07-01-archived-task",
        ],
        { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        "implement.jsonl:1: Placeholder `_example` row",
      );
    });
  });

  describe("[#573] task.py start seed-only context gate", () => {
    const curatedRow =
      '{"file":".trellis/spec/guides/index.md","reason":"guideline"}\n';

    function writeManifests(
      implement: string | null,
      check: string | null,
    ): void {
      const taskDir = path.join(tmpDir, ".trellis", "tasks", "issue-106");
      if (implement !== null) {
        fs.writeFileSync(
          path.join(taskDir, "implement.jsonl"),
          implement,
          "utf-8",
        );
      }
      if (check !== null) {
        fs.writeFileSync(path.join(taskDir, "check.jsonl"), check, "utf-8");
      }
    }

    function runStart(...extra: string[]): ReturnType<typeof spawnSync> {
      const taskScriptPath = path.join(
        tmpDir,
        ".trellis",
        "scripts",
        "task.py",
      );
      return spawnSync(
        pythonCmd,
        [taskScriptPath, "start", ".trellis/tasks/issue-106", ...extra],
        {
          cwd: tmpDir,
          encoding: "utf-8",
          // Session identity so a successful start prints "Current task set
          // to" instead of the degraded-mode notice.
          env: sessionEnv({ TRELLIS_CONTEXT_ID: "test-ctx-573" }),
        },
      );
    }

    it("blocks start when seeded manifests have zero curated entries", () => {
      setupTaskRepo();
      writeManifests("", "");
      const r = runStart();
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("no curated entries");
      expect(r.stdout).toContain("add-context");
      expect(r.stdout).toContain("--allow-empty-context");
      expect(r.stdout).not.toContain("Current task set to");
    });

    it("names only the manifest that is actually empty", () => {
      setupTaskRepo();
      writeManifests(curatedRow, "");
      const r = runStart();
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("check.jsonl has no curated entries");
      expect(r.stdout).not.toContain("implement.jsonl and check.jsonl");
    });

    it("--allow-empty-context bypasses the gate", () => {
      setupTaskRepo();
      writeManifests("", "");
      const r = runStart("--allow-empty-context");
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("Current task set to");
    });

    it("does not gate when manifests are absent (agent-less platform)", () => {
      // `create` seeds the manifests only on sub-agent-capable platforms;
      // absence means no sub-agent will ever read them.
      setupTaskRepo();
      const r = runStart();
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("Current task set to");
    });

    it("starts normally once both manifests are curated", () => {
      setupTaskRepo();
      writeManifests(curatedRow, curatedRow);
      const r = runStart();
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("Current task set to");
    });
  });

  it("[init-context-removal] task.py list-context prints 'no curated entries yet' for uncurated jsonl", () => {
    setupTaskRepo();
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "seed-list" --description "regression fixture" --slug seed-list-task`,
      { cwd: tmpDir, encoding: "utf-8" },
    );
    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".trellis", "tasks"))
      .find((d) => d.includes("seed-list-task"));
    expect(taskDir).toBeDefined();
    const relTaskDir = path.posix.join(".trellis", "tasks", taskDir as string);

    const result = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} list-context ${relTaskDir}`,
      { cwd: tmpDir, encoding: "utf-8" },
    );
    // Sentinel message proves the seed-detection branch ran.
    expect(result).toContain("no curated entries yet");
  });

  it("[workflow-state-r1] template workflow.md [workflow-state:in_progress] mentions commit (Phase 3.4)", () => {
    const wf = templateWorkflowMd();
    const match = wf.match(
      /\[workflow-state:in_progress\]([\s\S]*?)\[\/workflow-state:in_progress\]/,
    );
    expect(match).toBeTruthy();
    const body = match?.[1] ?? "";
    expect(body).toMatch(/commit \(Phase 3\.4\)/i);
  });

  it("[issue-237] all implement/check agent templates contain recursion guards", () => {
    const templateRoot = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "templates",
    );
    const agentFiles = [
      "claude/agents/trellis-implement.md",
      "claude/agents/trellis-check.md",
      "codebuddy/agents/trellis-implement.md",
      "codebuddy/agents/trellis-check.md",
      "codex/agents/trellis-implement.toml",
      "codex/agents/trellis-check.toml",
      "cursor/agents/trellis-implement.md",
      "cursor/agents/trellis-check.md",
      "gemini/agents/trellis-implement.md",
      "gemini/agents/trellis-check.md",
      "kiro/agents/trellis-implement.json",
      "kiro/agents/trellis-check.json",
      "opencode/agents/trellis-implement.md",
      "opencode/agents/trellis-check.md",
      "pi/agents/trellis-implement.md",
      "pi/agents/trellis-check.md",
      "qoder/agents/trellis-implement.md",
      "qoder/agents/trellis-check.md",
      "kimi/agents/trellis-implement.md",
      "kimi/agents/trellis-check.md",
    ];

    for (const relativePath of agentFiles) {
      const content = fs.readFileSync(
        path.join(templateRoot, relativePath),
        "utf-8",
      );
      expect(content, `${relativePath} should mention recursion guard`).toMatch(
        /Recursion guard|Recursion Guard/,
      );
      expect(
        content,
        `${relativePath} should scope dispatch to main session`,
      ).toContain("main session");
      expect(
        content,
        `${relativePath} should mention workflow-state safety`,
      ).toMatch(/workflow-state breadcrumbs|workflow.md/);

      if (relativePath.includes("implement")) {
        expect(
          content,
          `${relativePath} should forbid nested implement`,
        ).toContain("spawn another `trellis-implement`");
        expect(content, `${relativePath} should forbid nested check`).toContain(
          "`trellis-check`",
        );
      } else {
        expect(content, `${relativePath} should forbid nested check`).toContain(
          "spawn another `trellis-check`",
        );
        expect(
          content,
          `${relativePath} should forbid nested implement`,
        ).toContain("`trellis-implement`");
      }
    }
  });

  it("[issue-241-followup] Codex role profiles keep recursion guards without disabling native subagents", () => {
    // Native Codex subagents are bounded by their documented depth limit and
    // the profiles' direct-execution guidance. The legacy per-profile feature
    // override blocked native Trellis subagent dispatch entirely, so it must
    // not reappear.
    const templateRoot = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "templates",
    );
    const codexAgentFiles = [
      "codex/agents/trellis-implement.toml",
      "codex/agents/trellis-check.toml",
      "codex/agents/trellis-research.toml",
    ];

    for (const relativePath of codexAgentFiles) {
      const content = fs.readFileSync(
        path.join(templateRoot, relativePath),
        "utf-8",
      );
      const roleGuard = relativePath.endsWith("trellis-research.toml")
        ? "research is role-isolated"
        : "MUST NOT spawn another";
      expect(content, `${relativePath} should retain a role guard`).toContain(
        roleGuard,
      );
      expect(content).not.toMatch(/multi_agent\s*=\s*false/);
      expect(content).not.toMatch(
        /\[features\.multi_agent_v2\][\s\S]*?enabled\s*=\s*false/,
      );
    }
  });

  it("[workflow-state-r2] template workflow.md [workflow-state:planning] mentions artifact gates + required jsonl curation", () => {
    const wf = templateWorkflowMd();
    const match = wf.match(
      /\[workflow-state:planning\]([\s\S]*?)\[\/workflow-state:planning\]/,
    );
    expect(match).toBeTruthy();
    const body = match?.[1] ?? "";
    expect(body).toMatch(/Lightweight: `prd\.md` can be enough/);
    expect(body).toMatch(
      /Complex: finish `prd\.md`, `design\.md`, and `implement\.md`/,
    );
    expect(body).toContain(
      "curate `implement.jsonl` and `check.jsonl` as spec/research manifests before start",
    );
  });

  it("[#292] workflow and brainstorm templates treat seed-only jsonl as not planning-ready", () => {
    const wf = templateWorkflowMd();
    expect(wf).not.toContain("seed-only manifests are tolerated by consumers");
    expect(wf).not.toContain(
      "curated when extra spec or research context is needed",
    );
    expect(wf).toContain(
      'Ready gate: both `implement.jsonl` and `check.jsonl` must contain at least one real `{"file": "...", "reason": "..."}` entry before `task.py start`.',
    );
    expect(wf).toContain(
      "Runtime consumers tolerate missing or seed-only manifests for compatibility, but that tolerance is not a planning-ready state.",
    );
    expect(wf).toContain(
      "`implement.jsonl` and `check.jsonl` each contain at least one real curated entry (seed row does not count)",
    );

    const templateRoot = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "templates",
    );
    const brainstormFiles = [
      "common/skills/brainstorm.md",
      "copilot/prompts/brainstorm.prompt.md",
    ];

    for (const relativePath of brainstormFiles) {
      const content = fs.readFileSync(
        path.join(templateRoot, relativePath),
        "utf-8",
      );
      expect(content, relativePath).toContain(
        "The caller manages any task manifests and activation checks.",
      );
    }
  });

  it("[#320] brainstorm templates require lossless PRD convergence before start", () => {
    const templateRoot = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "templates",
    );
    const brainstormFiles = [
      "common/skills/brainstorm.md",
      "copilot/prompts/brainstorm.prompt.md",
    ];

    for (const relativePath of brainstormFiles) {
      const content = fs.readFileSync(
        path.join(templateRoot, relativePath),
        "utf-8",
      );
      expect(content, relativePath).toContain(
        "Run the requirement convergence gate, then the PRD convergence pass.",
      );
      expect(content, relativePath).toContain("## PRD Convergence Pass");
      expect(content, relativePath).toContain(
        "Fold temporary brainstorm sections such as `What I already know`, `Assumptions`, and resolved `Open Questions`",
      );
      expect(content, relativePath).toContain(
        "Preserve every file:line anchor, decision, constraint, requirement ID, and acceptance-criteria mapping.",
      );
      expect(content, relativePath).toContain(
        "no unresolved temporary brainstorm sections, no duplicate facts across sections",
      );
    }
  });

  it("[workflow-state-r3-no_task] template workflow.md [workflow-state:no_task] block is present and well-formed", () => {
    const wf = templateWorkflowMd();
    expect(wf).toMatch(
      /\[workflow-state:no_task\]\s*\n[\s\S]+?\n\s*\[\/workflow-state:no_task\]/,
    );
  });

  it("[workflow-state-r3-completed] template workflow.md [workflow-state:completed] block is present and well-formed", () => {
    const wf = templateWorkflowMd();
    expect(wf).toMatch(
      /\[workflow-state:completed\]\s*\n[\s\S]+?\n\s*\[\/workflow-state:completed\]/,
    );
  });

  it("[strip-breadcrumb] _strip_breadcrumb_tag_blocks only strips matched STATUS pairs (backreference parity with parser)", () => {
    // Finding 1: the strip regex previously used [A-Za-z0-9_-]+ on both ends,
    // accepting [workflow-state:A]...[/workflow-state:B]. The parser uses \1
    // backreference to require matched STATUS. Tightening the strip regex to
    // use the same backreference closes the contract gap.
    const sessionStartScript = getSharedHookScripts().find(
      (hook) => hook.name === "session-start.py",
    )?.content;
    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(sessionStartScript, "shared session-start"),
    );

    // Each probe writes a fenced result so newlines in stripped output are
    // preserved; the JS side parses by splitting on the END marker.
    const probe = [
      "import importlib.util, pathlib, json",
      "spec = importlib.util.spec_from_file_location('ss', pathlib.Path('.claude/hooks/session-start.py'))",
      "mod = importlib.util.module_from_spec(spec)",
      "spec.loader.exec_module(mod)",
      "matched = '[workflow-state:planning]\\nbody\\n[/workflow-state:planning]'",
      "mismatched = '[workflow-state:planning]\\nbody\\n[/workflow-state:in_progress]'",
      "nested_orphan = '[workflow-state:planning]\\nbody1\\n[/workflow-state:other]\\ntail\\n[/workflow-state:planning]'",
      "result = {'M': mod._strip_breadcrumb_tag_blocks(matched), 'X': mod._strip_breadcrumb_tag_blocks(mismatched), 'N': mod._strip_breadcrumb_tag_blocks(nested_orphan)}",
      "print(json.dumps(result))",
    ].join("; ");
    const output = execSync(`${pythonCmd} -c ${JSON.stringify(probe)}`, {
      cwd: tmpDir,
      encoding: "utf-8",
    });
    const lastLine = output
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .pop();
    const result = JSON.parse(lastLine ?? "{}") as Record<string, string>;

    // Matched pair: stripped (empty string).
    expect(result.M).toBe("");
    // Mismatched pair: NOT stripped — full input preserved.
    expect(result.X).toContain("[workflow-state:planning]");
    expect(result.X).toContain("[/workflow-state:in_progress]");
    // Nested orphan: outer pair matches via \1 backreference and gets
    // stripped as one unit. Either fully stripped or fully preserved —
    // never partial (no dangling [/workflow-state:other] orphan).
    if (result.N !== "") {
      expect(result.N).toContain("[workflow-state:planning]");
      expect(result.N).toContain("[/workflow-state:planning]");
    }
  });

  it("[issue-6] continuation extraction preserves CRLF body bytes and writes nothing", () => {
    writeTrellisScripts();
    const workflowPath = path.join(
      fs.realpathSync(tmpDir),
      ".trellis",
      "workflow.md",
    );
    fs.writeFileSync(
      workflowPath,
      "before\r\n[trellis-continuation]\r\nfirst\r\nliteral pass finding typed_exit readiness completion authorization\r\n[/trellis-continuation]\r\nafter\r\n",
    );
    const before = fs.readFileSync(workflowPath);
    const entriesBefore = fs.readdirSync(path.join(tmpDir, ".trellis"));

    const result = runContinuation();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(
      "first\r\nliteral pass finding typed_exit readiness completion authorization\r\n",
    );
    expect(fs.readFileSync(workflowPath).equals(before)).toBe(true);
    expect(fs.readdirSync(path.join(tmpDir, ".trellis"))).toEqual(
      entriesBefore,
    );
  });

  it("[issue-6] continuation preserves unrelated standalone Markdown tags", () => {
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      "[trellis-continuation]\n[Codex]\nroute text\n[/Codex]\n[/trellis-continuation]\n",
    );

    const result = runContinuation();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("[Codex]\nroute text\n[/Codex]\n");
  });

  it.each([
    ["missing", "# Workflow\n", "missing_block"],
    [
      "duplicate",
      "[trellis-continuation]\none\n[/trellis-continuation]\n[trellis-continuation]\ntwo\n[/trellis-continuation]\n",
      "duplicate_block",
    ],
    [
      "empty",
      "[trellis-continuation]\n \t\n[/trellis-continuation]\n",
      "empty_body",
    ],
    ["unclosed", "[trellis-continuation]\nbody\n", "missing_close"],
    ["missing-open", "[/trellis-continuation]\n", "missing_open"],
    [
      "mismatched",
      "[trellis-continuation]\nbody\n[/trellis-resume]\n",
      "mismatched_marker",
    ],
    [
      "nested",
      "[trellis-continuation]\nouter\n[trellis-continuation]\ninner\n[/trellis-continuation]\n[/trellis-continuation]\n",
      "nested_block",
    ],
  ])(
    "[issue-6] continuation rejects %s structure",
    (_name, workflow, subtype) => {
      writeTrellisScripts();
      const workflowPath = path.join(
        fs.realpathSync(tmpDir),
        ".trellis",
        "workflow.md",
      );
      writeProjectFile(path.join(".trellis", "workflow.md"), workflow);

      const result = runContinuation();

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        `invalid_continuation_contract: ${subtype}: ${workflowPath}\n`,
      );
    },
  );

  it("[workflow-v2] get_context.py --mode phase returns compact Phase Index only", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", "custom-note"), "name=test\n");
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      templateWorkflowMd(),
    );

    const contextScript = path.join(
      tmpDir,
      ".trellis",
      "scripts",
      "get_context.py",
    );
    const output = execSync(
      `${pythonCmd} ${JSON.stringify(contextScript)} --mode phase`,
      { cwd: tmpDir, encoding: "utf-8" },
    );

    expect(output).toContain("## Phase Index");
    expect(output).toContain("### Request Triage");
    expect(output).toContain("### Planning Artifacts");
    expect(output).toContain("### Loading Step Detail");
    expect(output).not.toMatch(/^## Phase 1: Plan/m);
    expect(output).not.toContain("#### 1.1 Requirement exploration");
    expect(output).not.toContain("#### 2.1 Implement");
  });

  it("[workflow-v2] --mode phase --platform codex (sub-agent mode) filters out generic before-dev routing", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", "custom-note"), "name=test\n");
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      templateWorkflowMd(),
    );
    // Codex defaults to inline since 0.5.9; opt into sub-agent dispatch
    // explicitly so the legacy spawn-trellis-implement block surfaces.
    writeConfigYaml("codex:\n  dispatch_mode: sub-agent\n");

    const contextScript = path.join(
      tmpDir,
      ".trellis",
      "scripts",
      "get_context.py",
    );
    const output = execSync(
      `${pythonCmd} ${JSON.stringify(contextScript)} --mode phase --platform codex`,
      { cwd: tmpDir, encoding: "utf-8" },
    );

    expect(output).toContain("trellis-implement");
    expect(output).not.toContain(
      "| About to write code / start implementing | trellis-before-dev |",
    );
    expect(output).not.toContain("before-dev takes under a minute");
  });

  it("[pi] --mode phase --platform pi uses sub-agent routing", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", "custom-note"), "name=test\n");
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      templateWorkflowMd(),
    );

    const contextScript = path.join(
      tmpDir,
      ".trellis",
      "scripts",
      "get_context.py",
    );
    const output = execSync(
      `${pythonCmd} ${JSON.stringify(contextScript)} --mode phase --platform pi`,
      { cwd: tmpDir, encoding: "utf-8" },
    );

    expect(output).toContain("trellis-implement");
    expect(output).toContain("implement.jsonl");
    expect(output).not.toContain(
      "| About to write code / start implementing | trellis-before-dev |",
    );
    expect(output).not.toContain("before-dev takes under a minute");
  });

  it("[workflow-v2] step 2.1 for Codex describes native hook injection with child-side fallback", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", "custom-note"), "name=test\n");
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      templateWorkflowMd(),
    );
    const contextScript = path.join(
      tmpDir,
      ".trellis",
      "scripts",
      "get_context.py",
    );
    const output = execSync(
      `${pythonCmd} ${JSON.stringify(contextScript)} --mode phase --step 2.1 --platform codex`,
      { cwd: tmpDir, encoding: "utf-8" },
    );

    expect(output).toContain("The platform hook/plugin auto-handles");
    expect(output).toContain(
      "For Codex, `SubagentStart` supplies native context injection",
    );
    expect(output).not.toContain(
      "The pull-based sub-agent definition auto-handles",
    );
    expect(output).not.toContain("Load the `trellis-before-dev` skill");
  });

  it("[pi] step 2.1 describes extension-backed sub-agent context path", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", "custom-note"), "name=test\n");
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      templateWorkflowMd(),
    );

    const contextScript = path.join(
      tmpDir,
      ".trellis",
      "scripts",
      "get_context.py",
    );
    const output = execSync(
      `${pythonCmd} ${JSON.stringify(contextScript)} --mode phase --step 2.1 --platform pi`,
      { cwd: tmpDir, encoding: "utf-8" },
    );

    expect(output).toContain("The platform hook/plugin auto-handles");
    expect(output).toContain("Reads `implement.jsonl`");
    expect(output).not.toContain("The Codex sub-agent definition auto-handles");
    expect(output).not.toContain("Load the `trellis-before-dev` skill");
  });

  it("[workflow-v2] --mode phase --platform kilo keeps trellis-before-dev routing (agent-less path)", () => {
    // Symmetric to the codex filter test: agent-less platforms MUST still
    // see `trellis-before-dev` because they write code in the main session.
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", "custom-note"), "name=test\n");
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      templateWorkflowMd(),
    );

    const contextScript = path.join(
      tmpDir,
      ".trellis",
      "scripts",
      "get_context.py",
    );
    const output = execSync(
      `${pythonCmd} ${JSON.stringify(contextScript)} --mode phase --platform kilo`,
      { cwd: tmpDir, encoding: "utf-8" },
    );

    expect(output).toContain("`trellis-before-dev`");
    expect(output).not.toContain("Dispatch the `trellis-implement` sub-agent");
  });

  // ------------------------------------------------------------
  // session-start.py <trellis-workflow> + <guidelines> compact context
  // ------------------------------------------------------------

  it("[workflow-v2] session-start.py <trellis-workflow> block contains compact Phase Index", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", "custom-note"), "name=test\n");
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      templateWorkflowMd(),
    );
    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(claudeSessionStart, "shared session-start"),
    );

    const rawOutput = runPython(
      path.join(".claude", "hooks", "session-start.py"),
    );
    const payload = JSON.parse(rawOutput) as {
      hookSpecificOutput: { additionalContext: string };
    };
    const ctx = payload.hookSpecificOutput.additionalContext;

    const workflowMatch =
      /<trellis-workflow>([\s\S]*?)<\/trellis-workflow>/.exec(ctx);
    if (!workflowMatch) throw new Error("workflow block not found in payload");
    const workflowBlock = workflowMatch[1];

    expect(workflowBlock).toContain("## Phase Index");
    expect(workflowBlock).toContain("### Request Triage");
    expect(workflowBlock).toContain("### Planning Artifacts");
    expect(workflowBlock).toContain("### Loading Step Detail");
    expect(workflowBlock).not.toMatch(/^## Phase 1: Plan/m);
    expect(workflowBlock).not.toContain("#### 1.1 Requirement exploration");
    // Breadcrumb tag BLOCKS (matched opening + closing pair) excluded — they're
    // consumed by inject-workflow-state.py. Inline `[workflow-state:planning]`
    // mentions in narrative prose are fine; only complete blocks are stripped.
    const tagBlockRe =
      /\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n[\s\S]*?\n\s*\[\/workflow-state:\1\]/;
    expect(tagBlockRe.test(workflowBlock)).toBe(false);
  });

  it("[workflow-v2] session-start.py <guidelines> block lists context order and spec paths", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", "custom-note"), "name=test\n");
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      templateWorkflowMd(),
    );
    // Guides are no longer inlined in compact SessionStart.
    writeProjectFile(
      path.join(".trellis", "spec", "guides", "index.md"),
      "# Thinking Guides\n\nGUIDES_INLINE_MARKER\n",
    );
    // Package index — must be paths-only (content should NOT appear)
    writeProjectFile(
      path.join(".trellis", "spec", "cli", "backend", "index.md"),
      "# Backend\n\nBACKEND_INDEX_CONTENT_SHOULD_NOT_APPEAR\n",
    );
    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(claudeSessionStart, "shared session-start"),
    );

    const rawOutput = runPython(
      path.join(".claude", "hooks", "session-start.py"),
    );
    const payload = JSON.parse(rawOutput) as {
      hookSpecificOutput: { additionalContext: string };
    };
    const ctx = payload.hookSpecificOutput.additionalContext;

    const guidelinesMatch = /<guidelines>([\s\S]*?)<\/guidelines>/.exec(ctx);
    if (!guidelinesMatch)
      throw new Error("guidelines block not found in payload");
    const guidelinesBlock = guidelinesMatch[1];

    expect(guidelinesBlock).toContain("Task context order");
    expect(guidelinesBlock).not.toContain("GUIDES_INLINE_MARKER");
    expect(guidelinesBlock).toContain(".trellis/spec/cli/backend/index.md");
    expect(guidelinesBlock).not.toContain(
      "BACKEND_INDEX_CONTENT_SHOULD_NOT_APPEAR",
    );
    // Pointer to discovery command
    expect(guidelinesBlock).toContain("--mode packages");
  });

  // ------------------------------------------------------------
  // inject-subagent-context.py update_current_phase() removal
  //   Hook must NOT write current_phase back to task.json on spawn.
  // ------------------------------------------------------------

  it("[workflow-v2] inject-subagent-context.py does NOT write current_phase when implement spawns", () => {
    const sharedInject = getSharedHookScripts().find(
      (hook) => hook.name === "inject-subagent-context.py",
    )?.content;

    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", "custom-note"), "name=test\n");
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Minimal\n");
    // Session active task WITHOUT current_phase field (post-migration state)
    writeSessionContext("claude_phase-a", ".trellis/tasks/issue-106");
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "task.json"),
      JSON.stringify(
        {
          ...emptyTaskRecord({ id: "issue-106" }),
          id: "issue-106",
          name: "issue-106",
          lifecycle_generation: 0,
          title: "Issue 106",
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
      '{"file":"src/example.ts","reason":"spec"}\n',
    );
    writeProjectFile(
      path.join(".claude", "hooks", "inject-subagent-context.py"),
      expectTemplateContent(sharedInject, "shared inject-subagent-context"),
    );

    // Simulate Task tool spawn (Claude-style input)
    const input = JSON.stringify({
      tool_name: "Task",
      tool_input: {
        subagent_type: "trellis-implement",
        prompt: "do work",
      },
      cwd: tmpDir,
      session_id: "phase-a",
    });
    runPython(
      path.join(".claude", "hooks", "inject-subagent-context.py"),
      input,
    );

    // Assert task.json is NOT modified with current_phase
    const taskJson = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, ".trellis", "tasks", "issue-106", "task.json"),
        "utf-8",
      ),
    ) as Record<string, unknown>;
    expect(taskJson.current_phase).toBeUndefined();
    expect(taskJson.next_action).toBeUndefined();
    // Sanity: other fields intact
    expect(taskJson.status).toBe("in_progress");
  });

  it("[workflow-v2] inject-subagent-context.py source does NOT contain update_current_phase function", () => {
    const sharedInject = getSharedHookScripts().find(
      (hook) => hook.name === "inject-subagent-context.py",
    )?.content;
    expect(sharedInject).toBeTruthy();
    expect(sharedInject).not.toContain("def update_current_phase");
    expect(sharedInject).not.toContain("update_current_phase(");
    // AGENTS_NO_PHASE_UPDATE constant was only used by the removed function
    expect(sharedInject).not.toContain("AGENTS_NO_PHASE_UPDATE");
  });

  it("[issue-codex-dispatch-mode] codex breadcrumb defaults to native auto dispatch when config absent", () => {
    setupTaskRepo();
    writeSessionContext("codex_workflow-a", ".trellis/tasks/issue-106");
    const codexHookPath = writeCodexInjectHook();
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      "[workflow-state:in_progress]\n" +
        "DISPATCH the trellis-implement / trellis-check sub-agents.\n" +
        "[/workflow-state:in_progress]\n" +
        "[workflow-state:in_progress-inline]\n" +
        "MAIN SESSION edits code via trellis-before-dev directly.\n" +
        "[/workflow-state:in_progress-inline]\n",
    );

    const parsed = JSON.parse(
      runPython(
        codexHookPath,
        JSON.stringify({ cwd: tmpDir, session_id: "workflow-a" }),
      ),
    ) as { hookSpecificOutput: { additionalContext: string } };
    const ctx = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("DISPATCH the trellis-implement");
    expect(ctx).not.toContain("MAIN SESSION edits code");
  });

  it("[issue-codex-dispatch-mode] codex breadcrumb routes to plain status when codex.dispatch_mode=sub-agent", () => {
    setupTaskRepo();
    writeSessionContext("codex_workflow-a", ".trellis/tasks/issue-106");
    const codexHookPath = writeCodexInjectHook();
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      "[workflow-state:in_progress]\n" +
        "DISPATCH the trellis-implement / trellis-check sub-agents.\n" +
        "[/workflow-state:in_progress]\n" +
        "[workflow-state:in_progress-inline]\n" +
        "MAIN SESSION edits code via trellis-before-dev directly.\n" +
        "[/workflow-state:in_progress-inline]\n",
    );
    writeConfigYaml("codex:\n  dispatch_mode: sub-agent\n");

    const parsed = JSON.parse(
      runPython(
        codexHookPath,
        JSON.stringify({ cwd: tmpDir, session_id: "workflow-a" }),
      ),
    ) as { hookSpecificOutput: { additionalContext: string } };
    const ctx = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("DISPATCH the trellis-implement");
    expect(ctx).not.toContain("MAIN SESSION edits code");
  });

  it("[issue-codex-dispatch-mode] codex breadcrumb routes to inline tag when codex.dispatch_mode=inline", () => {
    setupTaskRepo();
    writeSessionContext("codex_workflow-a", ".trellis/tasks/issue-106");
    const codexHookPath = writeCodexInjectHook();
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      "[workflow-state:in_progress]\n" +
        "DISPATCH the trellis-implement / trellis-check sub-agents.\n" +
        "[/workflow-state:in_progress]\n" +
        "[workflow-state:in_progress-inline]\n" +
        "MAIN SESSION edits code via trellis-before-dev directly.\n" +
        "[/workflow-state:in_progress-inline]\n",
    );
    writeConfigYaml("codex:\n  dispatch_mode: inline\n");

    const parsed = JSON.parse(
      runPython(
        codexHookPath,
        JSON.stringify({ cwd: tmpDir, session_id: "workflow-a" }),
      ),
    ) as { hookSpecificOutput: { additionalContext: string } };
    const ctx = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("MAIN SESSION edits code");
    expect(ctx).toContain("trellis-before-dev");
    expect(ctx).not.toContain("DISPATCH the trellis-implement");
  });

  it("[issue-codex-dispatch-mode] non-codex platform ignores codex.dispatch_mode=inline", () => {
    setupTaskRepo();
    writeSessionContext("claude_workflow-a", ".trellis/tasks/issue-106");
    // Hook installed under .claude/ — _detect_platform returns "claude".
    const claudeHookPath = path.join(
      ".claude",
      "hooks",
      "inject-workflow-state.py",
    );
    writeProjectFile(
      claudeHookPath,
      expectTemplateContent(injectWorkflowStateScript, "inject-workflow-state"),
    );
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      "[workflow-state:in_progress]\n" +
        "DISPATCH the trellis-implement / trellis-check sub-agents.\n" +
        "[/workflow-state:in_progress]\n" +
        "[workflow-state:in_progress-inline]\n" +
        "MAIN SESSION edits code via trellis-before-dev directly.\n" +
        "[/workflow-state:in_progress-inline]\n",
    );
    writeConfigYaml("codex:\n  dispatch_mode: inline\n");

    const parsed = JSON.parse(
      runPython(
        claudeHookPath,
        JSON.stringify({ cwd: tmpDir, session_id: "workflow-a" }),
      ),
    ) as { hookSpecificOutput: { additionalContext: string } };
    const ctx = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("DISPATCH the trellis-implement");
    expect(ctx).not.toContain("MAIN SESSION edits code");
  });

  it("[issue-codex-dispatch-mode] get_context.py --platform codex swaps to inline block content", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", "custom-note"), "name=test\n");
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      templateWorkflowMd(),
    );
    writeConfigYaml("codex:\n  dispatch_mode: inline\n");

    const contextScript = path.join(
      tmpDir,
      ".trellis",
      "scripts",
      "get_context.py",
    );
    const output = execSync(
      `${pythonCmd} ${JSON.stringify(contextScript)} --mode phase --step 2.1 --platform codex`,
      { cwd: tmpDir, encoding: "utf-8" },
    );

    // The [Kilo, Antigravity, Devin] inline block content surfaces:
    // it tells the main session to load trellis-before-dev directly.
    expect(output).toContain("trellis-before-dev");
    expect(output).toContain("Read `{TASK_DIR}/prd.md`");
    // The Codex sub-agent dispatch text must NOT surface in inline mode.
    expect(output).not.toMatch(/Active task: <task path>/);
  });

  it("[issue-codex-dispatch-mode] resolve_breadcrumb_key picks status-inline only for codex+inline", () => {
    // Cover all four cases via the actual hook helper (imported from the
    // installed shared-hooks template). This locks the helper's contract
    // rather than retesting an inline copy.
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", "hooks", "inject-workflow-state.py"),
      expectTemplateContent(injectWorkflowStateScript, "inject-workflow-state"),
    );
    const probePath = path.join(tmpDir, "probe_breadcrumb.py");
    fs.writeFileSync(
      probePath,
      [
        "import importlib.util, json, sys",
        "from pathlib import Path",
        `hook_path = Path(${JSON.stringify(
          path.join(tmpDir, ".trellis", "hooks", "inject-workflow-state.py"),
        )})`,
        "spec = importlib.util.spec_from_file_location('iws', hook_path)",
        "mod = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(mod)",
        "result = {",
        "  'codex_inline': mod.resolve_breadcrumb_key('in_progress', 'codex', {'codex': {'dispatch_mode': 'inline'}}),",
        "  'codex_subagent': mod.resolve_breadcrumb_key('in_progress', 'codex', {'codex': {'dispatch_mode': 'sub-agent'}}),",
        "  'codex_missing': mod.resolve_breadcrumb_key('in_progress', 'codex', {}),",
        "  'claude_inline': mod.resolve_breadcrumb_key('in_progress', 'claude', {'codex': {'dispatch_mode': 'inline'}}),",
        "}",
        "print(json.dumps(result))",
      ].join("\n"),
    );
    const output = execSync(`${pythonCmd} ${JSON.stringify(probePath)}`, {
      cwd: tmpDir,
      encoding: "utf-8",
    });
    const result = JSON.parse(
      output
        .split("\n")
        .filter((l) => l.startsWith("{"))
        .pop() ?? "{}",
    ) as Record<string, string>;
    expect(result.codex_inline).toBe("in_progress-inline");
    expect(result.codex_subagent).toBe("in_progress");
    // Default for Codex is native auto dispatch; only explicit inline swaps
    // to the main-session breadcrumb.
    expect(result.codex_missing).toBe("in_progress");
    expect(result.claude_inline).toBe("in_progress");
  });

  it("[issue-codex-dispatch-mode] inline `#` comment after value is stripped (config.yaml uncomment leaves trailing hint)", () => {
    // The shipped template has:
    //   #   dispatch_mode: sub-agent  # or "inline" to let the main agent edit code directly
    // Users uncomment by removing leading `#` and may change "sub-agent" to "inline"
    // while leaving the trailing hint comment, producing:
    //   codex:
    //     dispatch_mode: inline  # or "inline" to let the main agent edit code directly
    // The minimal YAML parser MUST treat the trailing ` # ...` as a comment, not as
    // part of the value, otherwise resolve_breadcrumb_key sees an opaque string and
    // falls back to sub-agent dispatch.
    setupTaskRepo();
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", "hooks", "trellis_config.py"),
      expectTemplateContent(
        getAllScripts().get("common/trellis_config.py") ?? "",
        "trellis_config",
      ),
    );
    const probePath = path.join(tmpDir, "probe_inline_comment.py");
    fs.writeFileSync(
      probePath,
      [
        "import importlib.util, json, sys",
        "from pathlib import Path",
        `hook_path = Path(${JSON.stringify(
          path.join(tmpDir, ".trellis", "hooks", "trellis_config.py"),
        )})`,
        "spec = importlib.util.spec_from_file_location('tc', hook_path)",
        "mod = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(mod)",
        "yaml = 'codex:\\n  dispatch_mode: inline  # or \"inline\" to let the main agent edit code directly\\n'",
        "parsed = mod.parse_simple_yaml(yaml)",
        "print(json.dumps(parsed))",
      ].join("\n"),
    );
    const output = execSync(`${pythonCmd} ${JSON.stringify(probePath)}`, {
      cwd: tmpDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(
      output
        .split("\n")
        .filter((l) => l.startsWith("{"))
        .pop() ?? "{}",
    ) as { codex?: { dispatch_mode?: string } };
    expect(parsed.codex?.dispatch_mode).toBe("inline");
  });

  it("[issue-codex-dispatch-mode] resolve_effective_platform namespaces codex into codex-sub-agent / codex-inline", () => {
    setupTaskRepo();
    writeTrellisScripts();
    const probePath = path.join(tmpDir, "probe_effective_platform.py");
    fs.writeFileSync(
      probePath,
      [
        "import sys, json",
        `sys.path.insert(0, ${JSON.stringify(path.join(tmpDir, ".trellis", "scripts"))})`,
        "from common.workflow_phase import resolve_effective_platform",
        "result = {",
        "  'codex_default': resolve_effective_platform('codex', {}),",
        "  'codex_explicit_auto': resolve_effective_platform('codex', {'codex': {'dispatch_mode': 'auto'}}),",
        "  'codex_explicit_subagent': resolve_effective_platform('codex', {'codex': {'dispatch_mode': 'sub-agent'}}),",
        "  'codex_inline': resolve_effective_platform('codex', {'codex': {'dispatch_mode': 'inline'}}),",
        "  'codex_invalid_mode': resolve_effective_platform('codex', {'codex': {'dispatch_mode': 'invalid'}}),",
        "  'codex_invalid_config': resolve_effective_platform('codex', {'codex': True}),",
        "  'cursor_passthrough': resolve_effective_platform('cursor', {'codex': {'dispatch_mode': 'inline'}}),",
        "  'claude_label': resolve_effective_platform('claude', {'codex': {'dispatch_mode': 'inline'}}),",
        "}",
        "print(json.dumps(result))",
      ].join("\n"),
    );
    const output = execSync(`${pythonCmd} ${JSON.stringify(probePath)}`, {
      cwd: tmpDir,
      encoding: "utf-8",
    });
    const result = JSON.parse(
      output
        .split("\n")
        .filter((l) => l.startsWith("{"))
        .pop() ?? "{}",
    ) as Record<string, string>;
    expect(result.codex_default).toBe("codex-sub-agent");
    expect(result.codex_explicit_auto).toBe("codex-sub-agent");
    expect(result.codex_explicit_subagent).toBe("codex-sub-agent");
    expect(result.codex_inline).toBe("codex-inline");
    // Invalid mode falls back to explicit inline rather than dispatching.
    expect(result.codex_invalid_mode).toBe("codex-inline");
    // A malformed codex section must match config.py's safe inline fallback.
    expect(result.codex_invalid_config).toBe("codex-inline");
    // Non-codex platforms ignore the codex.dispatch_mode setting. cursor has no
    // marker-label alias, so it is the pure passthrough case.
    expect(result.cursor_passthrough).toBe("cursor");
    // claude does have one: its marker label in workflow.md is "Claude Code",
    // and resolving to the bare id used to strip its routing blocks silently.
    expect(result.claude_label).toBe("Claude Code");
  });

  it("[issue-codex-dispatch-mode] codex hook injects <codex-mode> banner reflecting dispatch_mode", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".trellis/tasks/issue-106");
    const codexHookPath = path.join(
      ".codex",
      "hooks",
      "inject-workflow-state.py",
    );
    writeProjectFile(
      codexHookPath,
      expectTemplateContent(injectWorkflowStateScript, "inject-workflow-state"),
    );
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      "[workflow-state:in_progress]\nDISPATCH the trellis-implement.\n[/workflow-state:in_progress]\n[workflow-state:in_progress-inline]\nMAIN SESSION inline edit.\n[/workflow-state:in_progress-inline]\n",
    );

    // Default (no config.yaml) → native auto-dispatch banner.
    const defaultRun = JSON.parse(
      runPython(
        codexHookPath,
        JSON.stringify({ cwd: tmpDir, session_id: "workflow-a" }),
      ),
    ) as { hookSpecificOutput: { additionalContext: string } };
    expect(defaultRun.hookSpecificOutput.additionalContext).toContain(
      "<codex-mode>auto: implement/check work defaults to Trellis sub-agents; native Codex context injection is preferred and child-side loading is the fallback. The main session still coordinates, clarifies, updates specs, commits, and finishes.</codex-mode>",
    );

    // Legacy sub-agent alias → the auto-dispatch banner.
    writeConfigYaml("codex:\n  dispatch_mode: sub-agent\n");
    const subAgentRun = JSON.parse(
      runPython(
        codexHookPath,
        JSON.stringify({ cwd: tmpDir, session_id: "workflow-a" }),
      ),
    ) as { hookSpecificOutput: { additionalContext: string } };
    expect(subAgentRun.hookSpecificOutput.additionalContext).toContain(
      "<codex-mode>auto: implement/check work defaults to Trellis sub-agents; native Codex context injection is preferred and child-side loading is the fallback. The main session still coordinates, clarifies, updates specs, commits, and finishes.</codex-mode>",
    );
  });

  it("[issue-codex-dispatch-mode] non-codex hook does NOT inject <codex-mode> banner", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".trellis/tasks/issue-106");
    // Hook installed under .claude/ — _detect_platform returns "claude".
    const claudeHookPath = path.join(
      ".claude",
      "hooks",
      "inject-workflow-state.py",
    );
    writeProjectFile(
      claudeHookPath,
      expectTemplateContent(injectWorkflowStateScript, "inject-workflow-state"),
    );
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      "[workflow-state:in_progress]\nDISPATCH the trellis-implement.\n[/workflow-state:in_progress]\n",
    );
    writeConfigYaml("codex:\n  dispatch_mode: inline\n");

    const result = JSON.parse(
      runPython(
        claudeHookPath,
        JSON.stringify({ cwd: tmpDir, session_id: "workflow-a" }),
      ),
    ) as { hookSpecificOutput: { additionalContext: string } };
    expect(result.hookSpecificOutput.additionalContext).not.toContain(
      "<codex-mode>",
    );
  });

  it("[issue-395] task.py list --json emits a stable machine-readable schema", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} list --json`,
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    const parsed = JSON.parse(output) as {
      tasks: {
        dir: string;
        title: string;
        status: string;
        priority: string;
        parent: string | null;
        children: string[];
      }[];
    };
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0]).toMatchObject({
      dir: ".trellis/tasks/issue-106",
      title: "Issue 106 task",
      status: "in_progress",
      parent: null,
      children: [],
    });
  });

  it("[issue-395] task.py current --json reports null when no task is active", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    const result = spawnSync(pythonCmd, [taskScriptPath, "current", "--json"], {
      cwd: tmpDir,
      encoding: "utf-8",
      env: sessionEnv(),
    });

    expect(result.status).toBe(1);
    const parsed = JSON.parse(result.stdout) as { current_task: unknown };
    expect(parsed.current_task).toBeNull();
  });

  it("[issue-395] task.py current --json reports the active task object", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".trellis/tasks/issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "json-current-session" }),
      },
    );

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} current --json`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "json-current-session" }),
      },
    );

    const parsed = JSON.parse(output) as {
      current_task: { dir: string; title: string; status: string } | null;
    };
    expect(parsed.current_task).toMatchObject({
      dir: ".trellis/tasks/issue-106",
      title: "Issue 106 task",
      status: "in_progress",
    });
  });

  it("[issue-399.1] task.py create stamps base_branch from origin/HEAD, not the checked-out branch", () => {
    setupTaskRepo();
    execSync("git init -q -b feature/some-work", { cwd: tmpDir });
    execSync("git config user.email test@example.com", { cwd: tmpDir });
    execSync("git config user.name Test", { cwd: tmpDir });
    execSync("git add -A", { cwd: tmpDir });
    execSync("git commit -q -m init", { cwd: tmpDir });

    // Simulate a bare "origin" remote whose default branch is main, while
    // the local checkout stays on a feature branch (#399 item 1 repro).
    const remotePath = path.join(tmpDir, "origin-bare.git");
    execSync(`git init -q --bare ${JSON.stringify(remotePath)}`, {
      cwd: tmpDir,
    });
    execSync("git branch -m feature/some-work main", { cwd: tmpDir });
    execSync(`git remote add origin ${JSON.stringify(remotePath)}`, {
      cwd: tmpDir,
    });
    execSync("git push -q origin main", { cwd: tmpDir });
    execSync(
      `git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main`,
      { cwd: tmpDir },
    );
    execSync("git checkout -q -b feature/some-work", { cwd: tmpDir });

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "base branch test" --description "regression fixture" --slug base-branch-test --no-start`,
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".trellis", "tasks"))
      .find((d) => d.includes("base-branch-test"));
    expect(taskDir).toBeDefined();
    const taskJson = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, ".trellis", "tasks", taskDir as string, "task.json"),
        "utf-8",
      ),
    ) as { base_branch: string };
    expect(taskJson.base_branch).toBe("main");

    fs.rmSync(remotePath, { recursive: true, force: true });
  });

  it("[issue-399.1] task.py create falls back to the checked-out branch when no default branch resolves", () => {
    setupTaskRepo();
    execSync("git init -q -b solo-branch", { cwd: tmpDir });
    execSync("git config user.email test@example.com", { cwd: tmpDir });
    execSync("git config user.name Test", { cwd: tmpDir });
    execSync("git add -A", { cwd: tmpDir });
    execSync("git commit -q -m init", { cwd: tmpDir });
    // No origin remote configured at all.

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const result = spawnSync(
      pythonCmd,
      [
        taskScriptPath,
        "create",

        "no remote test",
        "--description",
        "regression fixture",
        "--slug",
        "no-remote-test",
        "--no-start",
      ],
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    // #399 follow-up: silently falling back must now warn on stderr, naming
    // the branch that got stamped.
    expect(result.stderr).toContain(
      "warning: could not resolve the repository's default branch",
    );
    expect(result.stderr).toContain("solo-branch");

    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".trellis", "tasks"))
      .find((d) => d.includes("no-remote-test"));
    const taskJson = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, ".trellis", "tasks", taskDir as string, "task.json"),
        "utf-8",
      ),
    ) as { base_branch: string };
    expect(taskJson.base_branch).toBe("solo-branch");
  });

  it("[issue-399.1] task.py create --base-branch overrides both origin/HEAD detection and the fallback", () => {
    setupTaskRepo();
    execSync("git init -q -b solo-branch", { cwd: tmpDir });
    execSync("git config user.email test@example.com", { cwd: tmpDir });
    execSync("git config user.name Test", { cwd: tmpDir });
    execSync("git add -A", { cwd: tmpDir });
    execSync("git commit -q -m init", { cwd: tmpDir });
    // No origin remote configured at all — would otherwise fall back with a warning.

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const result = spawnSync(
      pythonCmd,
      [
        taskScriptPath,
        "create",

        "explicit base branch test",
        "--description",
        "regression fixture",
        "--slug",
        "explicit-base-branch-test",
        "--base-branch",
        "release/1.0",
        "--no-start",
      ],
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    expect(result.stderr).not.toContain(
      "warning: could not resolve the repository's default branch",
    );

    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".trellis", "tasks"))
      .find((d) => d.includes("explicit-base-branch-test"));
    expect(taskDir).toBeDefined();
    const taskJson = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, ".trellis", "tasks", taskDir as string, "task.json"),
        "utf-8",
      ),
    ) as { base_branch: string };
    expect(taskJson.base_branch).toBe("release/1.0");
  });

  it("[issue-399.2] task.py validate warns when the recorded branch no longer exists locally", () => {
    setupTaskRepo();
    execSync("git init -q -b main", { cwd: tmpDir });
    execSync("git config user.email test@example.com", { cwd: tmpDir });
    execSync("git config user.name Test", { cwd: tmpDir });
    execSync("git add -A", { cwd: tmpDir });
    execSync("git commit -q -m init", { cwd: tmpDir });

    const taskJsonPath = path.join(
      tmpDir,
      ".trellis",
      "tasks",
      "issue-106",
      "task.json",
    );
    const data = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8"));
    data.branch = "task/deleted-branch-does-not-exist";
    fs.writeFileSync(taskJsonPath, JSON.stringify(data, null, 2));

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const result = spawnSync(
      pythonCmd,
      [taskScriptPath, "validate", ".trellis/tasks/issue-106"],
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    expect(result.stdout).toContain(
      "recorded branch 'task/deleted-branch-does-not-exist' no longer exists locally",
    );
  });

  it("[issue-8] task.py archive ignores a missing legacy branch without warning", () => {
    setupTaskRepo();
    execSync("git init -q -b main", { cwd: tmpDir });
    execSync("git config user.email test@example.com", { cwd: tmpDir });
    execSync("git config user.name Test", { cwd: tmpDir });
    execSync("git add -A", { cwd: tmpDir });
    execSync("git commit -q -m init", { cwd: tmpDir });

    const taskJsonPath = path.join(
      tmpDir,
      ".trellis",
      "tasks",
      "issue-106",
      "task.json",
    );
    const data = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8"));
    data.branch = "task/deleted-branch-does-not-exist";
    fs.writeFileSync(taskJsonPath, JSON.stringify(data, null, 2));

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const result = spawnSync(
      pythonCmd,
      [taskScriptPath, "archive", ".trellis/tasks/issue-106", "--no-commit"],
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("recorded branch");
    const archiveRoot = path.join(tmpDir, ".trellis", "tasks", "archive");
    const month = fs.readdirSync(archiveRoot)[0];
    const archivedTask = JSON.parse(fs.readFileSync(path.join(archiveRoot, month, "issue-106", "task.json"), "utf-8"));
    expect(archivedTask.branch).toBe("task/deleted-branch-does-not-exist");
  });

  it("[issue-8] task.py start does not infer branch metadata", () => {
    setupTaskRepo();
    initTaskGitRepo("main");
    execSync("git checkout -q -b feature/record-me", { cwd: tmpDir });
    patchIssue106Task({
      status: "planning",
      branch: null,
      base_branch: "main",
    });

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const result = spawnSync(
      pythonCmd,
      [taskScriptPath, "start", ".trellis/tasks/issue-106"],
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "start-branch-session" }),
      },
    );

    expect(result.stdout).not.toContain("Branch recorded");
    expect(readIssue106Task()).toMatchObject({
      branch: null,
      status: "in_progress",
    });
  });

  it("[issue-399.3] task.py start does not clobber an explicitly set branch", () => {
    setupTaskRepo();
    initTaskGitRepo("main");
    execSync("git checkout -q -b feature/current", { cwd: tmpDir });
    patchIssue106Task({
      status: "planning",
      branch: "task/set-by-hand",
      base_branch: "main",
    });

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const result = spawnSync(
      pythonCmd,
      [taskScriptPath, "start", ".trellis/tasks/issue-106"],
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "start-noclobber-session" }),
      },
    );

    expect(result.stdout).not.toContain("Branch recorded");
    expect(readIssue106Task().branch).toBe("task/set-by-hand");
  });

  it("[issue-8] task.py start on a detached HEAD still starts without branch metadata", () => {
    setupTaskRepo();
    initTaskGitRepo("main");
    execSync("git checkout -q --detach", { cwd: tmpDir });
    patchIssue106Task({
      status: "planning",
      branch: null,
      base_branch: "main",
    });

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const result = spawnSync(
      pythonCmd,
      [taskScriptPath, "start", ".trellis/tasks/issue-106"],
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "start-detached-session" }),
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("no checked-out branch");
    expect(readIssue106Task()).toMatchObject({
      branch: null,
      status: "in_progress",
    });
  });

  it("[issue-8] task.py archive accepts a branch-less task in a remote-backed repo", () => {
    setupTaskRepo();
    initTaskGitRepo("main", true);
    patchIssue106Task({ branch: null, base_branch: "main" });

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const result = spawnSync(
      pythonCmd,
      [taskScriptPath, "archive", ".trellis/tasks/issue-106", "--no-commit"],
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    expect(result.status).toBe(0);
    expect(
      fs.existsSync(path.join(tmpDir, ".trellis", "tasks", "issue-106")),
    ).toBe(false);
    const archiveRoot = path.join(tmpDir, ".trellis", "tasks", "archive");
    const month = fs.readdirSync(archiveRoot)[0];
    const archivedTask = JSON.parse(fs.readFileSync(path.join(archiveRoot, month, "issue-106", "task.json"), "utf-8"));
    expect(archivedTask).toMatchObject({ branch: null, status: "completed" });
  });

  it("[issue-8] task.py archive preserves self-referential legacy branch and durable identity", () => {
    setupTaskRepo();
    initTaskGitRepo("main", true);
    const source = { kind: "issue", repo_ref: "castbox/Trellis", number: 8, disposition: "exact_source" };
    patchIssue106Task({ branch: "main", base_branch: "main", lifecycle_generation: 3, source });

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const result = spawnSync(
      pythonCmd,
      [taskScriptPath, "archive", ".trellis/tasks/issue-106", "--no-commit"],
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("branch and base_branch");
    const archiveRoot = path.join(tmpDir, ".trellis", "tasks", "archive");
    const month = fs.readdirSync(archiveRoot)[0];
    const archivedTask = JSON.parse(fs.readFileSync(path.join(archiveRoot, month, "issue-106", "task.json"), "utf-8"));
    expect(archivedTask).toMatchObject({
      id: "issue-106", source, lifecycle_generation: 3,
      branch: "main", base_branch: "main", status: "completed",
    });
  });

  it("[issue-8] task.py archive preserves a deleted legacy branch without warning", () => {
    setupTaskRepo();
    initTaskGitRepo("main", true);
    patchIssue106Task({
      branch: "feature/merged-and-deleted",
      base_branch: "main",
    });

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    const result = spawnSync(
      pythonCmd,
      [taskScriptPath, "archive", ".trellis/tasks/issue-106", "--no-commit"],
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("recorded branch");
    expect(
      fs.existsSync(path.join(tmpDir, ".trellis", "tasks", "issue-106")),
    ).toBe(false);
    const archiveRoot = path.join(tmpDir, ".trellis", "tasks", "archive");
    const month = fs.readdirSync(archiveRoot)[0];
    const archivedTask = JSON.parse(fs.readFileSync(path.join(archiveRoot, month, "issue-106", "task.json"), "utf-8"));
    expect(archivedTask.branch).toBe("feature/merged-and-deleted");
  });
});

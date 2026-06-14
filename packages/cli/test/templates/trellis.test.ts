import { describe, expect, it } from "vitest";
import {
  scriptsInit,
  commonInit,
  commonPaths,
  commonDeveloper,
  commonGitContext,
  commonTaskQueue,
  commonTaskUtils,
  commonActiveTask,
  commonCliAdapter,
  getDeveloperScript,
  initDeveloperScript,
  taskScript,
  getContextScript,
  addSessionScript,
  workflowYamlTemplate,
  gitignoreTemplate,
  getAllScripts,
  getWorkflowBodyFiles,
} from "../../src/templates/trellis/index.js";

// =============================================================================
// Template Constants — module-level string exports
// =============================================================================

describe("trellis template constants", () => {
  const allTemplates = {
    scriptsInit,
    commonInit,
    commonPaths,
    commonDeveloper,
    commonGitContext,
    commonTaskQueue,
    commonTaskUtils,
    commonActiveTask,
    commonCliAdapter,
    getDeveloperScript,
    initDeveloperScript,
    taskScript,
    getContextScript,
    addSessionScript,
    workflowYamlTemplate,
    gitignoreTemplate,
  };

  function inProgressBreadcrumb(): string {
    const block = getWorkflowBodyFiles().get("states/in_progress.md");
    if (!block) {
      throw new Error("in_progress breadcrumb body must exist");
    }
    return block;
  }

  function stepBody(step: string): string {
    const body = getWorkflowBodyFiles().get(`steps/${step}.md`);
    if (!body) {
      throw new Error(`step ${step} body must exist`);
    }
    return body;
  }

  it("all templates are non-empty strings", () => {
    for (const [name, content] of Object.entries(allTemplates)) {
      expect(content.length, `${name} should be non-empty`).toBeGreaterThan(0);
    }
  });

  it("Python scripts contain valid Python syntax indicators", () => {
    // scriptsInit (__init__.py) only has docstrings, so use scripts with actual code
    const pyScripts = [
      commonInit,
      commonPaths,
      commonActiveTask,
      getDeveloperScript,
      taskScript,
    ];
    for (const script of pyScripts) {
      expect(
        script.includes("import") ||
          script.includes("def ") ||
          script.includes("class ") ||
          script.includes("#"),
      ).toBe(true);
    }
  });

  it("scriptsInit is a Python docstring module", () => {
    expect(scriptsInit).toContain('"""');
  });

  it("workflowYamlTemplate is a structured workflow manifest", () => {
    expect(workflowYamlTemplate).toContain("schema_version:");
    expect(workflowYamlTemplate).toContain("workflow_states:");
    expect(workflowYamlTemplate).toContain("body_file:");
  });

  it("workflow body templates are present and non-empty", () => {
    const bodies = getWorkflowBodyFiles();
    expect(bodies.get("states/in_progress.md")).toBeDefined();
    expect(bodies.get("steps/2.1.md")).toBeDefined();
    for (const [name, content] of bodies) {
      expect(content.length, `${name} should be non-empty`).toBeGreaterThan(0);
    }
  });

  it("[issue-225] in_progress breadcrumb has class-2 sub-agent dispatch protocol", () => {
    // The in_progress breadcrumb instructs the main agent to prefix
    // dispatch prompts with "Active task: <path>" on class-2 platforms.
    // Without this line, codex/copilot/gemini/qoder sub-agents cannot
    // find the active task (no PreToolUse hook to inject context).
    const block = inProgressBreadcrumb();
    expect(block).toContain("Active task:");
    expect(block.toLowerCase()).toContain("class-2");
    expect(block).toMatch(/codex|copilot|gemini|qoder/);
  });

  it("[issue-237] in_progress breadcrumb self-exempts implement/check sub-agents", () => {
    // The in_progress breadcrumb may be injected into sub-agent turns on some
    // hosts, so its main-session dispatch guidance must not recursively apply
    // to a sub-agent that is already doing the requested work.
    const block = inProgressBreadcrumb();
    expect(block).toContain("Main-session default");
    expect(block).toContain("Sub-agent self-exemption");
    expect(block).toContain("already running as `trellis-implement`");
    expect(block).toContain("do NOT spawn another `trellis-implement`");
    expect(block).toContain("already running as `trellis-check`");
    expect(block).toContain("do NOT spawn another `trellis-check`");
    expect(block).toContain("main session only");
  });

  it("[issue-237] Phase 2 dispatch steps require prompt recursion guards", () => {
    const implementStep = stepBody("2.1");
    const checkStep = stepBody("2.2");
    expect(implementStep).toContain("**Dispatch prompt guard**");
    expect(implementStep).toContain(
      "already the `trellis-implement` sub-agent",
    );
    expect(implementStep).toContain(
      "not spawn another `trellis-implement` / `trellis-check`",
    );
    expect(checkStep).toContain(
      "already the `trellis-check` sub-agent",
    );
    expect(checkStep).toContain(
      "not spawn another `trellis-check` / `trellis-implement`",
    );
  });

  it("gitignoreTemplate contains ignore patterns", () => {
    expect(gitignoreTemplate).toContain(".developer");
    expect(gitignoreTemplate).toContain("__pycache__");
  });
});

// =============================================================================
// getAllScripts — pure function assembling pre-loaded strings
// =============================================================================

describe("getAllScripts", () => {
  it("returns a Map", () => {
    const scripts = getAllScripts();
    expect(scripts).toBeInstanceOf(Map);
  });

  it("contains expected script entries", () => {
    const scripts = getAllScripts();
    expect(scripts.has("__init__.py")).toBe(true);
    expect(scripts.has("common/__init__.py")).toBe(true);
    expect(scripts.has("common/paths.py")).toBe(true);
    expect(scripts.has("common/active_task.py")).toBe(true);
    expect(scripts.has("common/workflow_model.py")).toBe(true);
    expect(scripts.has("task.py")).toBe(true);
    expect(scripts.has("get_developer.py")).toBe(true);
  });

  it("has at least one entry", () => {
    const scripts = getAllScripts();
    expect(scripts.size).toBeGreaterThan(0);
  });

  it("all values are non-empty strings", () => {
    const scripts = getAllScripts();
    for (const [key, value] of scripts) {
      expect(value.length, `${key} should be non-empty`).toBeGreaterThan(0);
    }
  });

  it("values match the exported constants", () => {
    const scripts = getAllScripts();
    expect(scripts.get("__init__.py")).toBe(scriptsInit);
    expect(scripts.get("common/__init__.py")).toBe(commonInit);
    expect(scripts.get("task.py")).toBe(taskScript);
  });

  it("does not contain multi_agent entries", () => {
    const scripts = getAllScripts();
    for (const [key] of scripts) {
      expect(key, `${key} should not be a multi_agent script`).not.toContain("multi_agent");
    }
  });
});

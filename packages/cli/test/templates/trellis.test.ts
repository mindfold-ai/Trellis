import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  collectPlatformTemplates,
  PLATFORM_IDS,
} from "../../src/configurators/index.js";
import type { AITool } from "../../src/types/ai-tools.js";
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
  workflowMdTemplate,
  gitignoreTemplate,
  getAllScripts,
  getAllAgents,
  implementAgentTemplate,
  checkAgentTemplate,
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
    workflowMdTemplate,
    gitignoreTemplate,
  };

  function inProgressBreadcrumb(): string {
    const inProgressMatch = /\[workflow-state:in_progress\]([\s\S]*?)\[\/workflow-state:in_progress\]/.exec(
      workflowMdTemplate,
    );
    if (!inProgressMatch) {
      throw new Error("in_progress breadcrumb block must exist in workflow.md");
    }
    return inProgressMatch[1];
  }

  function workflowStateBreadcrumb(status: string): string {
    const match = new RegExp(
      `\\[workflow-state:${status}\\]([\\s\\S]*?)\\[/workflow-state:${status}\\]`,
    ).exec(workflowMdTemplate);
    if (!match) {
      throw new Error(`${status} breadcrumb block must exist in workflow.md`);
    }
    return match[1];
  }

  function stepSection(step: string): string {
    const pattern = new RegExp(
      `#### ${step.replace(".", "\\.")}[^\\n]*\\n([\\s\\S]*?)(?=\\n#### |\\n### |$)`,
    );
    const match = pattern.exec(workflowMdTemplate);
    if (!match) {
      throw new Error(`workflow.md step ${step} must exist`);
    }
    return match[1];
  }

  function platformBlock(section: string, openingMarker: string): string {
    const escaped = openingMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const closingMarker = openingMarker.replace("[", "[/");
    const escapedClosing = closingMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`${escaped}\\n([\\s\\S]*?)\\n${escapedClosing}`);
    const match = pattern.exec(section);
    if (!match) {
      throw new Error(`workflow.md block ${openingMarker} must exist`);
    }
    return match[0];
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

  it("workflowMdTemplate is markdown", () => {
    expect(workflowMdTemplate).toContain("#");
  });

  it("marketplace native workflow mirror matches the bundled workflow", () => {
    const repoRoot = fs.existsSync(path.join(process.cwd(), "marketplace"))
      ? process.cwd()
      : path.resolve(process.cwd(), "../..");
    const marketplaceNative = fs.readFileSync(
      path.join(repoRoot, "marketplace/workflows/native/workflow.md"),
      "utf-8",
    );
    expect(marketplaceNative).toBe(workflowMdTemplate);
  });

  it("marketplace TDD workflow planning breadcrumbs include behavior gates", () => {
    const repoRoot = fs.existsSync(path.join(process.cwd(), "marketplace"))
      ? process.cwd()
      : path.resolve(process.cwd(), "../..");
    const tddWorkflow = fs.readFileSync(
      path.join(repoRoot, "marketplace/workflows/tdd/workflow.md"),
      "utf-8",
    );
    const planning = /\[workflow-state:planning\]([\s\S]*?)\[\/workflow-state:planning\]/.exec(
      tddWorkflow,
    )?.[1];
    const planningInline = /\[workflow-state:planning-inline\]([\s\S]*?)\[\/workflow-state:planning-inline\]/.exec(
      tddWorkflow,
    )?.[1];

    for (const block of [planning, planningInline]) {
      expect(block).toContain("observable behavior slices");
      expect(block).toContain("public interface under test");
      expect(block).toContain("mock boundaries");
    }
  });

  it("[issue-225] workflow.md in_progress breadcrumb has class-2 sub-agent dispatch protocol", () => {
    // The in_progress breadcrumb instructs the main agent to prefix
    // dispatch prompts with "Active task: <path>" on class-2 platforms.
    // Without this line, codex/copilot/gemini/qoder sub-agents cannot
    // find the active task (no PreToolUse hook to inject context).
    const block = inProgressBreadcrumb();
    expect(block).toContain("Active task:");
    expect(block.toLowerCase()).toContain("class-2");
    expect(block).toMatch(/codex|copilot|gemini|qoder/);
  });

  it("[issue-zcode-repeat] pull-based platforms use the pull-based implement block, not hook auto-handles", () => {
    const implement = stepSection("2.1");
    const hookAutoBlock = platformBlock(
      implement,
      "[Claude Code, Cursor, OpenCode, CodeBuddy, Droid, Pi, Oh My Pi]",
    );
    const pullBasedMarker =
      "[codex-sub-agent, Gemini, Qoder, Copilot, ZCode, Reasonix, Trae, Grok]";
    const pullBasedBlock = platformBlock(implement, pullBasedMarker);

    const workflowLabelByPlatform: Partial<Record<AITool, string>> = {
      codex: "codex-sub-agent",
      gemini: "Gemini",
      qoder: "Qoder",
      copilot: "Copilot",
      zcode: "ZCode",
      trae: "Trae",
      grok: "Grok",
    };
    // Pi templates keep a pull-based fallback, but workflow 2.1 routes Pi
    // through the extension-backed context path.
    const extensionBackedPreludeFallbackPlatforms = new Set<AITool>(["pi"]);
    const generatedPullBasedLabels = PLATFORM_IDS.flatMap((id) => {
      if (extensionBackedPreludeFallbackPlatforms.has(id)) {
        return [];
      }
      const templates = collectPlatformTemplates(id);
      const hasPullBasedPrelude =
        templates !== undefined &&
        [...templates.entries()].some(
          ([filePath, content]) =>
            /trellis-(implement|check)/.test(filePath) &&
            content.includes("Required: Load Trellis Context First"),
        );
      if (!hasPullBasedPrelude) {
        return [];
      }
      const label = workflowLabelByPlatform[id];
      expect(
        label,
        `${id} generates pull-based agent definitions but has no workflow marker mapping`,
      ).toBeDefined();
      return [label as string];
    });

    const pullBasedLabels = [...generatedPullBasedLabels, "Reasonix"];
    for (const label of pullBasedLabels) {
      expect(pullBasedBlock, `${label} must use pull-based 2.1 guidance`).toContain(
        label,
      );
      expect(
        hookAutoBlock,
        `${label} must not use hook/plugin auto-handles 2.1 guidance`,
      ).not.toContain(label);
    }
    expect(pullBasedBlock).toContain(
      "The pull-based sub-agent definition auto-handles the context load requirement",
    );
  });

  it("[issue-237] workflow.md in_progress breadcrumb self-exempts implement/check sub-agents", () => {
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

  it("[issue-237] workflow.md Phase 2 dispatch steps require prompt recursion guards", () => {
    expect(workflowMdTemplate).toContain("**Dispatch prompt guard**");
    expect(workflowMdTemplate).toContain(
      "already the `trellis-implement` sub-agent",
    );
    expect(workflowMdTemplate).toContain(
      "not spawn another `trellis-implement` / `trellis-check`",
    );
    expect(workflowMdTemplate).toContain(
      "already the `trellis-check` sub-agent",
    );
    expect(workflowMdTemplate).toContain(
      "not spawn another `trellis-check` / `trellis-implement`",
    );
  });

  it("workflow.md documents parent child task tree responsibilities", () => {
    expect(workflowMdTemplate).toContain("### Parent / Child Task Trees");
    expect(workflowMdTemplate).toContain(
      "several independently verifiable deliverables",
    );
    expect(workflowMdTemplate).toContain(
      "Parent/child structure is not a dependency system",
    );
    expect(workflowMdTemplate).toContain("--parent <parent-dir>");
    expect(workflowMdTemplate).toContain("task.py add-subtask <parent> <child>");
    expect(workflowMdTemplate).toContain(
      "start the child that owns the next independently verifiable deliverable",
    );
  });

  it("workflow.md step 1.1 includes parent child split guidance", () => {
    const step = stepSection("1.1");
    expect(step).toContain("When considering a parent/child split");
    expect(step).toContain("Parent tasks own source requirements");
    expect(step).toContain("Child tasks own actual deliverables");
    expect(step).toContain(
      "Parent/child structure is not a dependency system",
    );
    expect(step).toContain("Do not start the parent unless");
  });

  it("workflow.md planning breadcrumbs mention parent child split guidance", () => {
    const planning = workflowStateBreadcrumb("planning");
    const planningInline = workflowStateBreadcrumb("planning-inline");
    for (const block of [planning, planningInline]) {
      expect(block).toContain("Multi-deliverable scope");
      expect(block).toContain("parent task plus independently verifiable child tasks");
      expect(block).toContain("not implied by tree position");
    }
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

// =============================================================================
// getAllAgents — channel runtime agent definitions dispatched at init/update.
// agent-loader.ts loads `.trellis/agents/<name>.md` and requires `---` YAML
// frontmatter at the top with a flat `name: <name>` field. These tests pin the
// contract so a future template edit can't silently break channel spawn.
// =============================================================================

describe("getAllAgents", () => {
  it("ships implement and check agents", () => {
    const agents = getAllAgents();
    expect(agents.has("implement.md")).toBe(true);
    expect(agents.has("check.md")).toBe(true);
  });

  it("values match exported constants", () => {
    const agents = getAllAgents();
    expect(agents.get("implement.md")).toBe(implementAgentTemplate);
    expect(agents.get("check.md")).toBe(checkAgentTemplate);
  });

  it("each agent body starts with `---` frontmatter and a matching name field", () => {
    const agents = getAllAgents();
    for (const [file, content] of agents) {
      expect(content.startsWith("---\n"), `${file} must start with --- frontmatter`).toBe(true);
      // Frontmatter must close on a `---\n` line.
      const frontmatterClose = content.indexOf("\n---\n", 4);
      expect(frontmatterClose, `${file} must have a closing --- frontmatter line`).toBeGreaterThan(0);
      const frontmatter = content.slice(4, frontmatterClose);
      // The agent's `name:` field must match the file basename so
      // `trellis channel spawn --agent <name>` resolves correctly.
      const expectedName = file.replace(/\.md$/, "");
      const nameLine = frontmatter
        .split("\n")
        .find((line) => /^name\s*:/.test(line));
      expect(nameLine, `${file} must declare a name field`).toBeTruthy();
      expect(
        nameLine?.split(":")[1]?.trim(),
        `${file} name field should equal "${expectedName}"`,
      ).toBe(expectedName);
    }
  });
});

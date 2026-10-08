// Mechanical split of regression.test.ts; imported by the canonical test entry.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AI_TOOLS } from "../src/types/ai-tools.js";
import { getAllAgents as getClaudeAgents } from "../src/templates/claude/index.js";
import { getAllHooks as getCodexHooks } from "../src/templates/codex/index.js";
import { getAllHooks as getCopilotHooks } from "../src/templates/copilot/index.js";
import { getSharedHookScripts } from "../src/templates/shared-hooks/index.js";
import {
  getCommandTemplates,
  getSkillTemplates,
} from "../src/templates/common/index.js";
import {
  commonCliAdapter,
  commonConfig,
  commonTrellisConfig,
  getAllScripts,
} from "../src/templates/trellis/index.js";
import {
  collectPlatformTemplates,
  configurePlatform,
  PLATFORM_IDS,
} from "../src/configurators/index.js";
import { setWriteMode } from "../src/utils/file-writer.js";
import { guidesIndexContent } from "../src/templates/markdown/index.js";
import * as markdownExports from "../src/templates/markdown/index.js";
describe("regression: backslash in markdown templates (beta.12)", () => {
  it("[beta.12] Common command/skill templates do not contain problematic backslash sequences", () => {
    const templates = [...getCommandTemplates(), ...getSkillTemplates()];
    for (const tmpl of templates) {
      expect(tmpl.content).not.toContain("\\--");
      expect(tmpl.content).not.toContain("\\->");
    }
  });

  it("[beta.12] Claude agent templates do not contain problematic backslash sequences", () => {
    const agents = getClaudeAgents();
    for (const agent of agents) {
      expect(agent.content).not.toContain("\\--");
      expect(agent.content).not.toContain("\\->");
    }
  });

  it("[beta.12] Shared hook templates do not contain problematic backslash sequences", () => {
    const hooks = getSharedHookScripts();
    for (const hook of hooks) {
      expect(hook.content).not.toContain("\\--");
      expect(hook.content).not.toContain("\\->");
    }
  });
});

// =============================================================================
// 5. Platform Registry Regressions
// =============================================================================

describe("regression: platform additions (beta.9, beta.13, beta.16)", () => {
  it("[beta.9] OpenCode platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("opencode");
    expect(AI_TOOLS.opencode.configDir).toBe(".opencode");
  });

  it("[beta.13] Cursor platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("cursor");
    expect(AI_TOOLS.cursor.configDir).toBe(".cursor");
  });

  it("[codex] Codex platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("codex");
    expect(AI_TOOLS.codex.configDir).toBe(".codex");
    expect(AI_TOOLS.codex.supportsAgentSkills).toBe(true);
  });

  it("[kiro] Kiro platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("kiro");
    expect(AI_TOOLS.kiro.configDir).toBe(".kiro/skills");
  });

  it("[gemini] Gemini CLI platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("gemini");
    expect(AI_TOOLS.gemini.configDir).toBe(".gemini");
  });

  it("[antigravity] Antigravity platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("antigravity");
    expect(AI_TOOLS.antigravity.configDir).toBe(".agent/workflows");
  });

  it("[devin] Devin platform is registered (formerly Windsurf)", () => {
    expect(AI_TOOLS).toHaveProperty("devin");
    expect(AI_TOOLS.devin.configDir).toBe(".devin/workflows");
    expect(AI_TOOLS.devin.name).toBe("Devin");
    // Windsurf was renamed to Devin — the old key must be gone.
    expect(AI_TOOLS).not.toHaveProperty("windsurf");
  });

  it("[qoder] Qoder platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("qoder");
    expect(AI_TOOLS.qoder.configDir).toBe(".qoder");
  });

  it("[codebuddy] CodeBuddy platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("codebuddy");
    expect(AI_TOOLS.codebuddy.configDir).toBe(".codebuddy");
  });

  it("[copilot] Copilot platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("copilot");
    expect(AI_TOOLS.copilot.configDir).toBe(".github/copilot");
  });

  it("[droid] Factory Droid platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("droid");
    expect(AI_TOOLS.droid.configDir).toBe(".factory");
    expect(AI_TOOLS.droid.cliFlag).toBe("droid");
  });

  it("[pi] Pi Agent platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("pi");
    expect(AI_TOOLS.pi.configDir).toBe(".pi");
    expect(AI_TOOLS.pi.cliFlag).toBe("pi");
    expect(AI_TOOLS.pi.hasPythonHooks).toBe(false);
    expect(AI_TOOLS.pi.templateContext.agentCapable).toBe(true);
    expect(AI_TOOLS.pi.templateContext.hasHooks).toBe(true);
  });

  it("[zcode] ZCode platform is registered with hook support", () => {
    // ZCode 3.x ships a workspace hook config (.zcode/config.json,
    // SessionStart + UserPromptSubmit + PreToolUse) reusing the shared Python
    // hook scripts. It is class-1 for sub-agent context because PreToolUse
    // Agent/Task can mutate the sub-agent prompt.
    expect(AI_TOOLS).toHaveProperty("zcode");
    expect(AI_TOOLS.zcode.configDir).toBe(".zcode");
    expect(AI_TOOLS.zcode.cliFlag).toBe("zcode");
    expect(AI_TOOLS.zcode.hasPythonHooks).toBe(true);
    expect(AI_TOOLS.zcode.templateContext.agentCapable).toBe(true);
    expect(AI_TOOLS.zcode.templateContext.hasHooks).toBe(true);
    // .zcode/hooks is now a managed path (written by configureZcode).
    expect(AI_TOOLS.zcode.extraManagedPaths).toContain(".zcode/hooks");
  });

  it("[omp] Oh My Pi platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("omp");
    expect(AI_TOOLS.omp.configDir).toBe(".omp");
    expect(AI_TOOLS.omp.cliFlag).toBe("omp");
    expect(AI_TOOLS.omp.hasPythonHooks).toBe(false);
    expect(AI_TOOLS.omp.templateContext.agentCapable).toBe(true);
    expect(AI_TOOLS.omp.templateContext.hasHooks).toBe(true);
  });

  it("[grok] Grok Build platform is registered as pull-based class-2", () => {
    expect(AI_TOOLS).toHaveProperty("grok");
    expect(AI_TOOLS.grok.configDir).toBe(".grok");
    expect(AI_TOOLS.grok.cliFlag).toBe("grok");
    expect(AI_TOOLS.grok.hasPythonHooks).toBe(false);
    expect(AI_TOOLS.grok.templateContext.agentCapable).toBe(true);
    expect(AI_TOOLS.grok.templateContext.hasHooks).toBe(false);
    expect(AI_TOOLS.grok.templateContext.cmdRefPrefix).toBe("/trellis-");
  });

  it("[kimi] Kimi Code platform is registered as pull-based class-2", () => {
    expect(AI_TOOLS).toHaveProperty("kimi");
    expect(AI_TOOLS.kimi.name).toBe("Kimi Code");
    expect(AI_TOOLS.kimi.configDir).toBe(".kimi-code");
    expect(AI_TOOLS.kimi.cliFlag).toBe("kimi");
    expect(AI_TOOLS.kimi.supportsAgentSkills).toBe(true);
    expect(AI_TOOLS.kimi.hasPythonHooks).toBe(false);
    expect(AI_TOOLS.kimi.templateContext.agentCapable).toBe(true);
    expect(AI_TOOLS.kimi.templateContext.hasHooks).toBe(false);
    expect(AI_TOOLS.kimi.templateContext.cmdRefPrefix).toBe("/skill:trellis-");
  });

  it("[beta.9] all platforms have consistent required fields", () => {
    for (const id of PLATFORM_IDS) {
      const tool = AI_TOOLS[id];
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.configDir.startsWith(".")).toBe(true);
      expect(tool.cliFlag.length).toBeGreaterThan(0);
      expect(Array.isArray(tool.templateDirs)).toBe(true);
      expect(tool.templateDirs).toContain("common");
      expect(typeof tool.defaultChecked).toBe("boolean");
      expect(typeof tool.hasPythonHooks).toBe("boolean");
    }
  });
});

describe("regression: cli_adapter platform support (beta.9, beta.13, beta.16)", () => {
  it("[beta.9] cli_adapter.py supports opencode platform", () => {
    expect(commonCliAdapter).toContain('"opencode"');
    expect(commonCliAdapter).toContain(".opencode");
  });

  it("[beta.13] cli_adapter.py supports cursor platform", () => {
    expect(commonCliAdapter).toContain('"cursor"');
    expect(commonCliAdapter).toContain(".cursor");
  });

  it("[codex] cli_adapter.py supports codex platform", () => {
    expect(commonCliAdapter).toContain('"codex"');
    expect(commonCliAdapter).toContain(".agents");
    expect(commonCliAdapter).toContain(".codex");
  });

  it("[kiro] cli_adapter.py supports kiro platform", () => {
    expect(commonCliAdapter).toContain('"kiro"');
    expect(commonCliAdapter).toContain(".kiro");
  });

  it("[gemini] cli_adapter.py supports gemini platform", () => {
    expect(commonCliAdapter).toContain('"gemini"');
    expect(commonCliAdapter).toContain(".gemini");
  });

  it("[antigravity] cli_adapter.py supports antigravity platform", () => {
    expect(commonCliAdapter).toContain('"antigravity"');
    expect(commonCliAdapter).toContain(".agent");
  });

  it("[devin] cli_adapter.py supports devin platform (formerly windsurf)", () => {
    expect(commonCliAdapter).toContain('"devin"');
    expect(commonCliAdapter).toContain(".devin");
    // Legacy .windsurf/ is still recognized for back-compat detection.
    expect(commonCliAdapter).toContain(".windsurf");
  });

  it("[qoder] cli_adapter.py supports qoder platform", () => {
    expect(commonCliAdapter).toContain('"qoder"');
    expect(commonCliAdapter).toContain(".qoder");
  });

  it("[codebuddy] cli_adapter.py supports codebuddy platform", () => {
    expect(commonCliAdapter).toContain('"codebuddy"');
    expect(commonCliAdapter).toContain(".codebuddy");
  });

  it("[copilot] cli_adapter.py supports copilot platform", () => {
    expect(commonCliAdapter).toContain('"copilot"');
    expect(commonCliAdapter).toContain(".github/copilot");
  });

  it("[droid] cli_adapter.py supports droid platform", () => {
    expect(commonCliAdapter).toContain('"droid"');
    expect(commonCliAdapter).toContain(".factory");
  });

  it("[pi] cli_adapter.py supports pi platform", () => {
    expect(commonCliAdapter).toContain('"pi"');
    expect(commonCliAdapter).toContain(".pi");
    expect(commonCliAdapter).toContain('cmd = ["pi", "-p", prompt]');
    expect(commonCliAdapter).toContain('return ["pi", "-c", session_id]');
    expect(commonCliAdapter).toContain(
      'return f".pi/prompts/trellis-{name}.md"',
    );
  });

  it("[omp] cli_adapter.py supports omp platform", () => {
    expect(commonCliAdapter).toContain('"omp"');
    expect(commonCliAdapter).toContain(".omp");
  });

  it("[grok] cli_adapter.py supports grok platform", () => {
    expect(commonCliAdapter).toContain('"grok"');
    expect(commonCliAdapter).toContain(".grok");
    // omp and grok share one branch for the trellis-command path (see the
    // Python-execution test above for the resolved ".grok/commands/..." path).
    expect(commonCliAdapter).toContain(
      'elif self.platform in ("omp", "grok"):',
    );
    expect(commonCliAdapter).toContain(
      'cmd = ["grok", "-p", prompt, "--yolo"]',
    );
  });

  it("[kimi] cli_adapter.py supports kimi platform", () => {
    expect(commonCliAdapter).toContain('"kimi"');
    expect(commonCliAdapter).toContain(".kimi-code");
    expect(commonCliAdapter).toContain(
      'cmd = ["kimi", "-p", prompt, "--yolo"]',
    );
    expect(commonCliAdapter).toContain(
      'return ["kimi", "--session", session_id]',
    );
    expect(commonCliAdapter).toContain(
      'return f".kimi-code/skills/trellis-{name}/SKILL.md"',
    );
  });

  it("[droid] cli_adapter.py treats droid as commands-only (no CLI run/resume yet)", () => {
    expect(commonCliAdapter).toContain(
      "Factory Droid CLI agent run is not yet supported.",
    );
    expect(commonCliAdapter).toContain(
      "Factory Droid CLI resume is not yet supported.",
    );
    expect(commonCliAdapter).toContain('elif self.platform == "droid":');
    expect(commonCliAdapter).toContain('return "droid"');
    expect(commonCliAdapter).toContain(
      'return f".factory/commands/trellis/{name}.md"',
    );
  });

  it("[droid] cli_adapter.py has explicit droid branches in all key methods", () => {
    expect(commonCliAdapter).toMatch(
      /def get_trellis_command_path[\s\S]*?elif self\.platform == "droid":[\s\S]*?\.factory\/commands\/trellis\//,
    );
    expect(commonCliAdapter).toMatch(
      /def get_non_interactive_env[\s\S]*?elif self\.platform == "droid":[\s\S]*?return \{\}/,
    );
    expect(commonCliAdapter).toMatch(
      /def build_run_command[\s\S]*?elif self\.platform == "droid":[\s\S]*?CLI agent run is not yet supported/,
    );
    expect(commonCliAdapter).toMatch(
      /def build_resume_command[\s\S]*?elif self\.platform == "droid":[\s\S]*?CLI resume is not yet supported/,
    );
    expect(commonCliAdapter).toMatch(
      /def cli_name[\s\S]*?elif self\.platform == "droid":[\s\S]*?return "droid"/,
    );
  });

  it("[droid] cli_adapter.py detect_platform handles .factory directory", () => {
    expect(commonCliAdapter).toContain('return "droid"');
    expect(commonCliAdapter).toMatch(
      /detect_platform[\s\S]*?\.factory[\s\S]*?return "droid"/,
    );
  });

  it("[beta.9] cli_adapter.py has detect_platform function", () => {
    expect(commonCliAdapter).toContain("def detect_platform");
  });

  // Regression for 04-22-migrate-flow-bugs Bug A: codex/kiro branches of
  // get_trellis_command_path were missing the `trellis-` prefix that
  // 0.5.0-beta.0 introduced via 60+ rename manifest entries. Without the
  // prefix, any caller that built skill paths via get_trellis_command_path
  // (add-context, check agent prelude, etc.) would produce paths that don't
  // resolve to any real skill file.
  it("[migrate-flow-bugs] get_trellis_command_path codex branch uses trellis- prefix", () => {
    expect(commonCliAdapter).toMatch(
      /def get_trellis_command_path[\s\S]*?elif self\.platform == "codex":[\s\S]*?return f"\.agents\/skills\/trellis-\{name\}\/SKILL\.md"/,
    );
    expect(commonCliAdapter).not.toMatch(
      /def get_trellis_command_path[\s\S]*?elif self\.platform == "codex":[\s\S]*?return f"\.agents\/skills\/\{name\}\/SKILL\.md"/,
    );
  });

  it("[migrate-flow-bugs] get_trellis_command_path kiro branch uses trellis- prefix", () => {
    expect(commonCliAdapter).toMatch(
      /def get_trellis_command_path[\s\S]*?elif self\.platform == "kiro":[\s\S]*?return f"\.kiro\/skills\/trellis-\{name\}\/SKILL\.md"/,
    );
    expect(commonCliAdapter).not.toMatch(
      /def get_trellis_command_path[\s\S]*?elif self\.platform == "kiro":[\s\S]*?return f"\.kiro\/skills\/\{name\}\/SKILL\.md"/,
    );
  });

  // Regression for 04-22-migrate-flow-bugs Bug B: .agents/skills/ is a shared
  // layer (Codex writes, Amp/Cline consume via agentskills.io standard) — not
  // a single-platform config dir. Previously included in
  // _ALL_PLATFORM_CONFIG_DIRS, which caused Kiro / Antigravity / Windsurf
  // detection to fail whenever .agents/ existed (codex had already excluded
  // it, other platforms had not).
  it("[migrate-flow-bugs] _ALL_PLATFORM_CONFIG_DIRS excludes .agents (shared layer, not platform-specific)", () => {
    expect(commonCliAdapter).toMatch(/_ALL_PLATFORM_CONFIG_DIRS\s*=\s*\(/);
    const tupleMatch = commonCliAdapter.match(
      /_ALL_PLATFORM_CONFIG_DIRS\s*=\s*\(([\s\S]*?)\)/,
    );
    expect(tupleMatch).toBeTruthy();
    const tupleBody = (tupleMatch as RegExpMatchArray)[1];
    expect(tupleBody).not.toMatch(/"\.agents"/);
    // Must still include actual platform dirs
    expect(tupleBody).toContain('".claude"');
    expect(tupleBody).toContain('".codex"');
    expect(tupleBody).toContain('".kiro"');
  });

  it("[migrate-flow-bugs] detect_platform has codex shared-skills fallback guarded by no-other-platform-dir check", () => {
    // Fallback fires when .agents/skills/trellis-* exists AND no other
    // platform dir is present. Guard is essential — .agents/skills/ can
    // legitimately coexist with .claude (claude user + shared layer for
    // other agents) and must not trigger codex in that case.
    expect(commonCliAdapter).toMatch(
      /agents_skills\s*=\s*project_root\s*\/\s*"\.agents"\s*\/\s*"skills"/,
    );
    expect(commonCliAdapter).toMatch(
      /if agents_skills\.is_dir\(\) and not _has_other_platform_dir\(\s*project_root,\s*set\(\)/,
    );
    expect(commonCliAdapter).toMatch(/entry\.name\.startswith\("trellis-"\)/);
  });

  // v0.5.0-beta.12 removed `task.py init-context`; jsonl manifests are now
  // curated during planning when needed. The subparser, cmd_init_context, and get_check_context
  // helpers are all gone. task.py still guards against old invocations with
  // a clear deprecation message so users who muscle-memory-type the old
  // command get pointed at the new workflow.
  it("[init-context-removal] task.py no longer registers init-context subparser", () => {
    const taskScript = getAllScripts().get("task.py");
    expect(taskScript).toBeDefined();
    expect(taskScript as string).not.toMatch(
      /subparsers\.add_parser\(\s*"init-context"/,
    );
  });

  it("[init-context-removal] task.py emits deprecation message on init-context invocation", () => {
    const taskScript = getAllScripts().get("task.py");
    expect(taskScript).toBeDefined();
    // Guard fires before argparse so user sees the real reason (not argparse's
    // generic "invalid choice" error).
    expect(taskScript as string).toMatch(
      /sys\.argv\[1\]\s*==\s*"init-context"/,
    );
    expect(taskScript as string).toContain("v0.5.0-beta.12");
    expect(taskScript as string).toContain("planning artifact guidance");
  });

  it("[init-context-removal] common/task_context.py removes cmd_init_context + get_check_context helpers", () => {
    const taskContext = getAllScripts().get("common/task_context.py");
    expect(taskContext).toBeDefined();
    // Mechanical-fill path gone; only curate helpers remain.
    expect(taskContext as string).not.toMatch(/def cmd_init_context\b/);
    expect(taskContext as string).not.toMatch(/def get_check_context\b/);
    expect(taskContext as string).not.toMatch(/def get_implement_backend\b/);
    expect(taskContext as string).not.toMatch(/def get_implement_frontend\b/);
    // Remaining surface — still callable by task.py.
    expect(taskContext as string).toMatch(/def cmd_add_context\b/);
    expect(taskContext as string).toMatch(/def cmd_validate\b/);
    expect(taskContext as string).toMatch(/def cmd_list_context\b/);
  });

  it("[init-context-removal] task_store.cmd_create creates jsonl for sub-agent platforms", () => {
    const taskStore = getAllScripts().get("common/task_store.py");
    expect(taskStore).toBeDefined();
    // Sub-agent platform probe.
    expect(taskStore as string).toMatch(/_SUBAGENT_CONFIG_DIRS/);
    expect(taskStore as string).toContain('".claude"');
    expect(taskStore as string).toContain('".github/copilot"');
    expect(taskStore as string).toContain('".pi"');
    expect(taskStore as string).toContain('".zcode"');
    expect(taskStore as string).toContain('".grok"');
    expect(taskStore as string).toContain('".kimi-code"');
    expect(taskStore as string).toContain('_CODEX_CONFIG_DIR = ".codex"');
    expect(taskStore as string).toContain(
      'get_codex_dispatch_mode(repo_root) == "auto"',
    );
    expect(commonConfig).toContain("def get_codex_dispatch_mode");
    // Manifests are created empty — no placeholder row that PR preflight
    // would later reject as unresolved scaffolding.
    expect(taskStore as string).not.toMatch(/_write_seed_jsonl/);
    expect(taskStore as string).not.toContain("_example");
    expect(taskStore as string).toContain(
      'jsonl_path.write_text("", encoding="utf-8")',
    );
    // cmd_create calls into the jsonl-creation path.
    expect(taskStore as string).toMatch(/_has_subagent_platform\(repo_root\)/);

    // The validator is the second half of the contract: placeholder rows left
    // by older versions are a hard error, not a silently skipped comment.
    const taskContext = getAllScripts().get("common/task_context.py");
    expect(taskContext as string).toContain('"_example" in data');
    expect(taskContext as string).toContain("Placeholder `_example` row");
  });

  it("[init-context-removal] platform-specific start templates no longer reference init-context", () => {
    // v0.5.0-beta.12 removed `task.py init-context`. Platform start templates
    // were updated to describe planning-time context curation instead. They must not
    // reference the deleted subcommand.
    const pkgRoot = path.resolve(__dirname, "..");
    const copilotStart = fs.readFileSync(
      path.join(pkgRoot, "src/templates/copilot/prompts/start.prompt.md"),
      "utf-8",
    );
    expect(copilotStart).not.toContain("task.py init-context");
  });

  it("[beta.9] cli_adapter.py has get_cli_adapter function with validation", () => {
    expect(commonCliAdapter).toContain("def get_cli_adapter");
    // Should validate platform parameter
    expect(commonCliAdapter).toContain("Unsupported platform");
  });

  it("[beta.12] cli_adapter.py has config_dir_name property for each platform", () => {
    expect(commonCliAdapter).toContain("config_dir_name");
    expect(commonCliAdapter).toContain(".claude");
    expect(commonCliAdapter).toContain(".cursor");
    expect(commonCliAdapter).toContain(".opencode");
    expect(commonCliAdapter).toContain(".codex");
    expect(commonCliAdapter).toContain(".kiro");
    expect(commonCliAdapter).toContain(".gemini");
    expect(commonCliAdapter).toContain(".agent");
    expect(commonCliAdapter).toContain(".devin");
    expect(commonCliAdapter).toContain(".qoder");
    expect(commonCliAdapter).toContain(".codebuddy");
    expect(commonCliAdapter).toContain(".github/copilot");
    expect(commonCliAdapter).toContain(".factory");
    expect(commonCliAdapter).toContain(".pi");
    expect(commonCliAdapter).toContain(".omp");
  });

  it("[copilot] cli_adapter.py treats copilot as IDE-only (no CLI run/resume)", () => {
    expect(commonCliAdapter).toContain(
      "GitHub Copilot is IDE-only; CLI agent run is not supported.",
    );
    expect(commonCliAdapter).toContain(
      "GitHub Copilot is IDE-only; CLI resume is not supported.",
    );
    expect(commonCliAdapter).toContain('elif self.platform == "copilot":');
    expect(commonCliAdapter).toContain('return "copilot"');
    expect(commonCliAdapter).toContain(
      'return f".github/prompts/{name}.prompt.md"',
    );
  });

  it("[copilot] cli_adapter.py has explicit copilot branches in all key methods", () => {
    expect(commonCliAdapter).toMatch(
      /def get_commands_path[\s\S]*?if self\.platform == "copilot":[\s\S]*?prompts_dir/,
    );
    expect(commonCliAdapter).toMatch(
      /def get_trellis_command_path[\s\S]*?elif self\.platform == "copilot":[\s\S]*?\.github\/prompts\//,
    );
    expect(commonCliAdapter).toMatch(
      /def get_non_interactive_env[\s\S]*?elif self\.platform == "copilot":[\s\S]*?return \{\}/,
    );
    expect(commonCliAdapter).toMatch(
      /def build_run_command[\s\S]*?elif self\.platform == "copilot":[\s\S]*?CLI agent run is not supported/,
    );
    expect(commonCliAdapter).toMatch(
      /def build_resume_command[\s\S]*?elif self\.platform == "copilot":[\s\S]*?CLI resume is not supported/,
    );
    expect(commonCliAdapter).toMatch(
      /def cli_name[\s\S]*?elif self\.platform == "copilot":[\s\S]*?return "copilot"/,
    );
  });
});

// =============================================================================
// 6. Cross-version Migration Consistency
// =============================================================================

describe("regression: collectTemplates paths match init directory structure (0.3.1)", () => {
  it("[0.3.1] all platforms with commands use consistent trellis/ subdirectory", () => {
    const platformsWithCommands = ["claude-code", "gemini"] as const;
    for (const id of platformsWithCommands) {
      const templates = collectPlatformTemplates(id);
      if (!templates) continue;
      const commandKeys = [...templates.keys()].filter((k) =>
        k.includes("/commands/"),
      );
      for (const key of commandKeys) {
        expect(
          key,
          `${id} command path should include trellis/ subdirectory: ${key}`,
        ).toContain("/commands/trellis/");
      }
    }
  });

  it("[0.3.4] kilo uses workflows/ for commands and skills/ for skills", () => {
    const templates = collectPlatformTemplates("kilo");
    expect(templates).toBeInstanceOf(Map);
    if (!templates) return;
    const keys = [...templates.keys()];
    for (const key of keys) {
      expect(
        key.startsWith(".kilocode/workflows/") ||
          key.startsWith(".kilocode/skills/"),
        `kilo path should use workflows/ or skills/: ${key}`,
      ).toBe(true);
    }
  });

  it("[devin] devin uses workflows/ instead of commands/trellis/", () => {
    const templates = collectPlatformTemplates("devin");
    expect(templates).toBeInstanceOf(Map);
    if (!templates) return;
    const keys = [...templates.keys()];
    for (const key of keys) {
      expect(
        key.startsWith(".devin/workflows/") || key.startsWith(".devin/skills/"),
        `devin path should use workflows/ or skills/: ${key}`,
      ).toBe(true);
    }
  });

  it("[codex] collectTemplates tracks both .agents skills and .codex assets", () => {
    const templates = collectPlatformTemplates("codex");
    expect(templates).toBeInstanceOf(Map);
    if (!templates) return;

    const keys = [...templates.keys()];
    expect(keys.some((key) => key.startsWith(".agents/skills/"))).toBe(true);
    expect(keys.some((key) => key.startsWith(".codex/agents/"))).toBe(true);
    expect(keys.some((key) => key.startsWith(".codex/hooks/"))).toBe(true);
    expect(keys).toContain(".codex/hooks.json");
    expect(keys).toContain(".codex/config.toml");
  });

  it("[copilot] collectTemplates tracks hooks and VS Code discovery config", () => {
    const templates = collectPlatformTemplates("copilot");
    expect(templates).toBeInstanceOf(Map);
    if (!templates) return;

    const keys = [...templates.keys()];
    expect(keys.some((key) => key.startsWith(".github/prompts/"))).toBe(true);
    // Copilot is agent-capable → start.prompt.md is not generated;
    // session-start hook injects workflow overview instead.
    expect(keys).not.toContain(".github/prompts/start.prompt.md");
    expect(keys).toContain(".github/prompts/finish-work.prompt.md");
    expect(keys).toContain(".github/prompts/continue.prompt.md");
    expect(keys.some((key) => key.startsWith(".github/copilot/hooks/"))).toBe(
      true,
    );
    expect(keys).toContain(".github/copilot/hooks.json");
    expect(keys).toContain(".github/hooks/trellis.json");
  });

  it("[zcode] collectTemplates tracks hooks + config.json and filters start command", () => {
    const templates = collectPlatformTemplates("zcode");
    expect(templates).toBeInstanceOf(Map);
    if (!templates) return;

    const keys = [...templates.keys()];
    // Shared hooks written to .zcode/hooks/
    expect(keys).toContain(".zcode/hooks/session-start.py");
    expect(keys).toContain(".zcode/hooks/inject-workflow-state.py");
    expect(keys).toContain(".zcode/hooks/inject-subagent-context.py");
    // Workspace hook registration
    expect(keys).toContain(".zcode/config.json");
    // agentCapable && hasHooks → start command is filtered out.
    expect(keys).not.toContain(".zcode/commands/trellis/start.md");
    expect(keys).toContain(".zcode/commands/trellis/finish-work.md");
    expect(keys).toContain(".zcode/commands/trellis/continue.md");
  });
});

// =============================================================================
// YAML Quote Stripping (0.3.8)
// =============================================================================

describe("regression: parse_simple_yaml uses _unquote not greedy strip (0.3.8)", () => {
  // 0.6.x: the parser was consolidated into trellis_config.py (config.py now
  // imports it), so these source assertions follow it there. config.py must
  // not grow a second copy back.
  it("trellis_config.py defines _unquote helper", () => {
    expect(commonTrellisConfig).toContain("def _unquote(value: str) -> str:");
  });

  it("trellis_config.py uses _unquote for list items, not .strip('\"')", () => {
    // The bug: .strip('"').strip("'") greedily eats nested quotes
    // e.g. "echo 'hello'" -> strip("'") -> echo 'hello (broken!)
    expect(commonTrellisConfig).not.toContain(".strip('\"').strip(\"'\")");
    expect(commonTrellisConfig).toContain("_unquote(stripped[2:].strip())");
  });

  it("trellis_config.py uses _unquote for key-value, not .strip('\"')", () => {
    // 0.5.11: parse path strips inline comments first, then unquotes, so YAML
    // `key: false  # comment` parses correctly. The forbidden
    // `.strip('"').strip("'")` greedy chain still must not appear.
    expect(commonTrellisConfig).not.toContain(".strip('\"').strip(\"'\")");
    expect(commonTrellisConfig).toContain("_unquote(value)");
    expect(commonTrellisConfig).toContain("_strip_inline_comment(value)");
  });

  it("config.py imports the parser instead of redefining it", () => {
    expect(commonConfig).toContain(
      "from .trellis_config import parse_simple_yaml",
    );
    expect(commonConfig).not.toContain("def parse_simple_yaml(");
    expect(commonConfig).not.toContain("def _parse_yaml_block(");
    expect(commonConfig).not.toContain("def _unquote(");
  });
});

describe("regression: parse_simple_yaml Python execution (0.3.8)", () => {
  // trellis_config.py imports nothing from the package (hooks load it as a
  // single file), so it runs standalone as-is — no source extraction needed.
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  let tmpDir: string;

  beforeEach(() => {
    expect(commonTrellisConfig).toContain("def parse_simple_yaml(");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-yaml-py-"));
    fs.writeFileSync(path.join(tmpDir, "yaml_parser.py"), commonTrellisConfig);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Run parse_simple_yaml via Python subprocess, returning result + stderr */
  function runPythonYamlFull(yamlContent: string): {
    result: unknown;
    stderr: string;
  } {
    const scriptFile = path.join(tmpDir, "_test.py");
    const script = [
      "import sys, json",
      `sys.path.insert(0, ${JSON.stringify(tmpDir)})`,
      "from yaml_parser import parse_simple_yaml",
      `result = parse_simple_yaml(${JSON.stringify(yamlContent)})`,
      "print(json.dumps(result))",
    ].join("\n");
    fs.writeFileSync(scriptFile, script);
    const proc = spawnSync(pythonCmd, [scriptFile], { encoding: "utf-8" });
    expect(proc.status, proc.stderr).toBe(0);
    return {
      result: JSON.parse((proc.stdout ?? "").trim()),
      stderr: proc.stderr ?? "",
    };
  }

  function runPythonYaml(yamlContent: string): unknown {
    return runPythonYamlFull(yamlContent).result;
  }

  it("nested single quotes inside double quotes are preserved", () => {
    const result = runPythonYaml("key: \"echo 'hello'\"");
    expect(result).toEqual({ key: "echo 'hello'" });
  });

  it("nested double quotes inside single quotes are preserved", () => {
    const result = runPythonYaml("key: 'say \"hi\"'");
    expect(result).toEqual({ key: 'say "hi"' });
  });

  it("list items with nested quotes are preserved", () => {
    const result = runPythonYaml(
      "hooks:\n  after_create:\n    - \"echo 'Task created'\"",
    );
    expect(result).toEqual({
      hooks: { after_create: ["echo 'Task created'"] },
    });
  });

  it("simple quoted values work", () => {
    const result = runPythonYaml("a: \"hello\"\nb: 'world'");
    expect(result).toEqual({ a: "hello", b: "world" });
  });

  it("unquoted values are unchanged", () => {
    const result = runPythonYaml("key: plain value");
    expect(result).toEqual({ key: "plain value" });
  });

  it("mismatched quotes are left as-is", () => {
    const result = runPythonYaml("key: \"hello'");
    expect(result).toEqual({ key: "\"hello'" });
  });

  // ---------------------------------------------------------------------
  // Unsupported constructs are reported, not silently mis-parsed (audit §4)
  // ---------------------------------------------------------------------

  it("a mapping inside a list is not hoisted into the parent dict", () => {
    // Was: {"packages": ["name: cli"], "path": "packages/cli"} — the nested
    // `path` key silently became a top-level config key.
    const { result, stderr } = runPythonYamlFull(
      "packages:\n  - name: cli\n    path: packages/cli\n",
    );
    expect(result).not.toHaveProperty("path");
    expect(result).toEqual({ packages: ["name: cli"] });
    expect(stderr).toContain("mappings inside a list are not supported");
    expect(stderr).toContain("path: packages/cli");
  });

  it("block scalars are reported and their body is not leaked", () => {
    // Was: {"notes": "|"} — the marker became the value, body dropped.
    const { result, stderr } = runPythonYamlFull(
      "notes: |\n  line one\n  key: not-a-real-key\nkeep: ok\n",
    );
    expect(result).toEqual({ keep: "ok" });
    expect(stderr).toContain("block scalars are not supported");
    expect(stderr).toContain(":1:");
  });

  it("anchors, aliases, merge keys and flow collections are reported", () => {
    const { result, stderr } = runPythonYamlFull(
      "base: &b\nuse: *b\nlist: [a, b]\nmap: {a: 1}\nkeep: ok\n",
    );
    expect(result).toEqual({ keep: "ok" });
    expect(stderr).toContain("YAML anchors are not supported");
    expect(stderr).toContain("YAML aliases are not supported");
    expect(stderr).toContain("flow sequences are not supported");
    expect(stderr).toContain("flow mappings are not supported");
  });

  it("quoted values that look like YAML constructs stay untouched", () => {
    // A hook command is a plain string; only unquoted scalars are inspected.
    const { result, stderr } = runPythonYamlFull(
      'cmd: "a | b"\nglob: "*.py"\nflowish: "[a, b]"\n',
    );
    expect(result).toEqual({
      cmd: "a | b",
      glob: "*.py",
      flowish: "[a, b]",
    });
    expect(stderr).toBe("");
  });

  it("a well-formed config parses with no warnings", () => {
    const { result, stderr } = runPythonYamlFull(
      [
        "session_auto_commit: false  # off for this project",
        "packages:",
        "  cli:",
        "    path: packages/cli",
        "    git: yes",
        "hooks:",
        "  after_create:",
        "    - echo one",
        "  after_archive:",
        "    - echo two",
        "",
      ].join("\n"),
    );
    expect(result).toEqual({
      session_auto_commit: "false",
      packages: { cli: { path: "packages/cli", git: "yes" } },
      hooks: { after_create: ["echo one"], after_archive: ["echo two"] },
    });
    expect(stderr).toBe("");
  });
});

// =============================================================================
// 8. Dead Code / Template Content Regressions
// =============================================================================

// =============================================================================
// S4: Submodule + PR Awareness (beta.1)
// =============================================================================

// submodule awareness in multi_agent scripts tests removed — multi_agent pipeline removed

describe("regression: cross-platform-thinking-guide dead code removed (0.3.1)", () => {
  it("[0.3.1] guidesCrossPlatformThinkingGuideContent is not exported from markdown/index", () => {
    expect(markdownExports).not.toHaveProperty(
      "guidesCrossPlatformThinkingGuideContent",
    );
  });

  it("[0.3.1] guides index.md does not reference cross-platform-thinking-guide", () => {
    expect(guidesIndexContent).not.toContain("cross-platform-thinking-guide");
    expect(guidesIndexContent).not.toContain("Cross-Platform Thinking Guide");
  });
});

// =============================================================================
// Pull-based Class-2 Platforms (0.5)
// =============================================================================

describe("regression: class-2 platforms use pull-based sub-agent context", () => {
  // Class 2: gemini, qoder, copilot — hooks can't reliably inject
  // sub-agent prompts, so sub-agents Read jsonl/prd themselves.
  // implement/check get the pull-based prelude; research does not (it
  // searches the spec tree and has no task-level context dependency).
  const class2 = [
    {
      id: "qoder" as const,
      hooksDir: ".qoder/hooks",
      preludeAgents: [
        ".qoder/agents/trellis-implement.md",
        ".qoder/agents/trellis-check.md",
      ],
      nonPreludeAgents: [".qoder/agents/trellis-research.md"],
    },
    {
      id: "gemini" as const,
      hooksDir: ".gemini/hooks",
      preludeAgents: [
        ".gemini/agents/trellis-implement.md",
        ".gemini/agents/trellis-check.md",
      ],
      nonPreludeAgents: [".gemini/agents/trellis-research.md"],
    },
    {
      id: "copilot" as const,
      hooksDir: ".github/copilot/hooks",
      preludeAgents: [
        ".github/agents/trellis-implement.agent.md",
        ".github/agents/trellis-check.agent.md",
      ],
      nonPreludeAgents: [".github/agents/trellis-research.agent.md"],
    },
  ];

  for (const { id, hooksDir, preludeAgents, nonPreludeAgents } of class2) {
    describe(`[${id}]`, () => {
      let tmpDir: string;

      beforeEach(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `trellis-c2-${id}-`));
        setWriteMode("force");
        await configurePlatform(id, tmpDir);
      });

      afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      });

      it("does NOT install inject-subagent-context.py", () => {
        const hooks = fs.readdirSync(path.join(tmpDir, hooksDir));
        expect(hooks).not.toContain("inject-subagent-context.py");
      });

      it("implement/check definitions contain pull-based prelude", () => {
        for (const file of preludeAgents) {
          const content = fs.readFileSync(path.join(tmpDir, file), "utf-8");
          expect(content).toContain("Required: Load Trellis Context First");
          expect(content).toContain("task.py current --source");
        }
      });

      it("[beta.21] prelude is injected exactly once, not duplicated", () => {
        // The codex toml source templates once carried an inline prelude that
        // predated the code-injected prelude (injectPullBasedPreludeToml). The
        // generated agent then contained the block twice. Source templates must
        // stay prelude-free so the injector is the single source.
        for (const file of preludeAgents) {
          const content = fs.readFileSync(path.join(tmpDir, file), "utf-8");
          const occurrences =
            content.split("Required: Load Trellis Context First").length - 1;
          expect(occurrences, `${file} should have exactly one prelude`).toBe(
            1,
          );
        }
      });

      it("[issue-225] prelude tells sub-agent to look for `Active task:` line in dispatch prompt first", () => {
        for (const file of preludeAgents) {
          const content = fs.readFileSync(path.join(tmpDir, file), "utf-8");
          expect(content).toContain("Active task:");
          expect(content).toContain("dispatch prompt");
        }
      });

      it("research definition does NOT contain pull-based prelude", () => {
        // research is orthogonal: it searches .trellis/spec/ and doesn't
        // depend on an active task. Prelude would make it fail when Phase 1.2
        // runs before planning-time jsonl curation.
        for (const file of nonPreludeAgents) {
          const content = fs.readFileSync(path.join(tmpDir, file), "utf-8");
          expect(content).not.toContain("Required: Load Trellis Context First");
        }
      });

      it("hook config does not reference inject-subagent-context.py", () => {
        const configPaths = [
          ".qoder/settings.json",
          ".gemini/settings.json",
          ".github/copilot/hooks.json",
          ".github/hooks/trellis.json",
        ];
        for (const p of configPaths) {
          const full = path.join(tmpDir, p);
          if (fs.existsSync(full)) {
            const txt = fs.readFileSync(full, "utf-8");
            expect(txt).not.toContain("inject-subagent-context.py");
          }
        }
      });
    });
  }
});

// =============================================================================
// Native Codex SubagentStart Context Delivery (0.6)
// =============================================================================

describe("regression: Codex uses native SubagentStart context delivery", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-codex-native-"));
    setWriteMode("force");
    await configurePlatform("codex", tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("installs the native context hook and preserves the main-session workflow hook", () => {
    const hooks = fs.readdirSync(path.join(tmpDir, ".codex", "hooks"));
    expect(hooks).toContain("inject-subagent-context.py");
    expect(hooks).toContain("inject-workflow-state.py");

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".codex", "hooks.json"), "utf-8"),
    ) as {
      hooks: {
        UserPromptSubmit?: unknown[];
        SubagentStart?: {
          matcher?: string;
          hooks?: { command?: string }[];
        }[];
      };
    };
    const subagentStart = config.hooks.SubagentStart?.[0];

    expect(config.hooks.UserPromptSubmit).toBeDefined();
    expect(subagentStart?.matcher).toBe(
      "^(?:trellis-implement|trellis-check|trellis-research)$",
    );
    expect(subagentStart?.hooks?.[0]?.command).toContain(
      ".codex/hooks/inject-subagent-context.py",
    );
  });

  it("uses marker-gated role profiles rather than the old unconditional pull prelude", () => {
    for (const role of ["implement", "check", "research"] as const) {
      const content = fs.readFileSync(
        path.join(tmpDir, ".codex", "agents", `trellis-${role}.toml`),
        "utf-8",
      );
      expect(content).toContain("<!-- trellis-hook-injected -->");
      expect(content).toContain("Active task:");
      expect(content).not.toContain("Required: Load Trellis Context First");
    }
  });
});

describe("regression: copilot agents use YAML tools frontmatter", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-copilot-tools-"));
    setWriteMode("force");
    await configurePlatform("copilot", tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes Copilot agent tools as YAML lists", () => {
    // implement / check agents intentionally do NOT declare any MCP tools in
    // their source `tools:` list — explicit `mcp__exa__*` names silent-skip
    // the agent on Claude Code when the Exa MCP server is not configured
    // (#302). Copilot's transformer therefore emits only the local-tool
    // equivalents.
    const content = fs.readFileSync(
      path.join(tmpDir, ".github/agents/trellis-implement.agent.md"),
      "utf-8",
    );
    const frontmatter = content.split("---\n")[1] ?? "";

    expect(frontmatter).toContain(
      "tools:\n  - read\n  - edit\n  - execute\n  - search",
    );
    expect(frontmatter).not.toContain("  - web");
    expect(frontmatter).not.toContain("  - exa/*");
    expect(frontmatter).not.toContain(
      "tools: Read, Write, Edit, Bash, Glob, Grep",
    );
  });

  it("maps research agent MCP tools to Copilot tool names", () => {
    // research is the one agent that legitimately needs external search.
    // Its source uses the wildcard `mcp__*` (avoids the explicit-name
    // silent-skip, opts into any MCP the user has configured) and the
    // Copilot transformer maps that wildcard to the full set of supported
    // Copilot MCP tool equivalents.
    const content = fs.readFileSync(
      path.join(tmpDir, ".github/agents/trellis-research.agent.md"),
      "utf-8",
    );
    const frontmatter = content.split("---\n")[1] ?? "";

    expect(frontmatter).toContain("tools:\n  - read");
    expect(frontmatter).toContain("  - edit");
    expect(frontmatter).toContain("  - search");
    expect(frontmatter).toContain("  - execute");
    expect(frontmatter).toContain("  - web");
    expect(frontmatter).toContain("  - exa/*");
    expect(frontmatter).toContain("  - chrome-devtools/*");
    expect(frontmatter).not.toContain("mcp__exa__");
    expect(frontmatter).not.toContain("mcp__chrome-devtools__*");
    expect(frontmatter).not.toContain("mcp__*");
    expect(frontmatter).not.toContain("Skill");
  });

  it("collectPlatformTemplates matches written Copilot agent output", () => {
    const templates = collectPlatformTemplates("copilot");
    expect(templates).toBeInstanceOf(Map);

    const generated = fs.readFileSync(
      path.join(tmpDir, ".github/agents/trellis-check.agent.md"),
      "utf-8",
    );
    expect(templates?.get(".github/agents/trellis-check.agent.md")).toBe(
      generated,
    );
  });
});

describe("regression: pi uses TypeScript extension assets instead of Python hooks", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-pi-"));
    setWriteMode("force");
    await configurePlatform("pi", tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("installs no Python hook files under .pi", () => {
    const templates = collectPlatformTemplates("pi");
    expect(templates).toBeInstanceOf(Map);
    const keys = [...(templates ?? new Map()).keys()];
    expect(keys.some((key) => key.endsWith(".py"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".pi", "hooks"))).toBe(false);
  });

  it("installs a subagent-capable extension and pull-based agent context", () => {
    const extension = fs.readFileSync(
      path.join(tmpDir, ".pi", "extensions", "trellis", "index.ts"),
      "utf-8",
    );
    expect(extension).toContain('name: "trellis_subagent"');
    expect(extension).toContain('pi.on?.("before_agent_start"');
    expect(extension).toContain('pi.on?.("tool_call"');

    for (const agent of ["trellis-implement.md", "trellis-check.md"]) {
      const content = fs.readFileSync(
        path.join(tmpDir, ".pi", "agents", agent),
        "utf-8",
      );
      expect(content).toContain("Required: Load Trellis Context First");
      expect(content).toContain("task.py current --source");
    }
  });
});

// =============================================================================
// Research agent must persist findings (0.5)
// =============================================================================

describe("regression: research agent persists findings to task dir", () => {
  // Every platform's research agent must:
  //   1. Have a Write tool (or platform equivalent) — otherwise it cannot
  //      fulfill workflow.md step 1.2 "调研产出必须写入文件".
  //   2. Explicitly tell the agent to write under {TASK_DIR}/research/.
  //   3. NOT have "Modify any files" as a blanket forbidden rule (that
  //      contradicts the persist requirement).
  //
  // Before 0.5, research agents were read-only and only emitted chat
  // replies, which got compacted away.
  const markdownPlatforms = [
    "packages/cli/src/templates/claude/agents/trellis-research.md",
    "packages/cli/src/templates/cursor/agents/trellis-research.md",
    "packages/cli/src/templates/qoder/agents/trellis-research.md",
    "packages/cli/src/templates/codebuddy/agents/trellis-research.md",
    "packages/cli/src/templates/droid/droids/trellis-research.md",
  ];

  const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname2, "../../..");

  for (const rel of markdownPlatforms) {
    it(`[${rel}] has Write tool and persist instruction`, () => {
      const content = fs.readFileSync(path.join(repoRoot, rel), "utf-8");
      // Frontmatter tool list must include Write (capitalized form)
      const fm = content.split("---\n")[1] ?? "";
      expect(fm).toMatch(/tools:\s*[^\n]*\bWrite\b/);
      // Body must reference persist target
      expect(content).toContain("{TASK_DIR}/research/");
      expect(content).toMatch(/PERSIST|[Pp]ersist/);
      // Must not have blanket "Modify any files" forbidden rule
      expect(content).not.toMatch(/^- Modify any files\s*$/m);
    });
  }

  // Gemini CLI 0.40+ rejects the comma-separated `tools:` line that other
  // platforms accept (Zod expects an array or omission). Trellis omits the
  // line entirely so the sub-agent inherits parent tools — see issue #224
  // and research/agent-tools-frontmatter.md. The persist contract still
  // applies (body references {TASK_DIR}/research/ and the PERSIST keyword).
  it("[packages/cli/src/templates/gemini/agents/trellis-research.md] omits tools line + has persist instruction", () => {
    const rel = "packages/cli/src/templates/gemini/agents/trellis-research.md";
    const content = fs.readFileSync(path.join(repoRoot, rel), "utf-8");
    const fm = content.split("---\n")[1] ?? "";
    expect(fm).not.toMatch(/^tools:/m);
    expect(content).toContain("{TASK_DIR}/research/");
    expect(content).toMatch(/PERSIST|[Pp]ersist/);
    expect(content).not.toMatch(/^- Modify any files\s*$/m);
  });

  it("codex research.toml uses workspace-write sandbox and persist instruction", () => {
    const content = fs.readFileSync(
      path.join(
        repoRoot,
        "packages/cli/src/templates/codex/agents/trellis-research.toml",
      ),
      "utf-8",
    );
    expect(content).toMatch(/sandbox_mode\s*=\s*"workspace-write"/);
    expect(content).toContain("{TASK_DIR}/research/");
    expect(content).toMatch(/persist|Persist/);
  });

  it("kiro research.json includes write tool and persist instruction", () => {
    const content = fs.readFileSync(
      path.join(
        repoRoot,
        "packages/cli/src/templates/kiro/agents/trellis-research.json",
      ),
      "utf-8",
    );
    const data = JSON.parse(content) as {
      tools: string[];
      prompt: string;
    };
    expect(data.tools).toContain("write");
    expect(data.prompt).toContain("{TASK_DIR}/research/");
    expect(data.prompt).toMatch(/PERSIST|persist/);
  });

  it("opencode research.md grants write/edit permission and has persist instruction", () => {
    const content = fs.readFileSync(
      path.join(
        repoRoot,
        "packages/cli/src/templates/opencode/agents/trellis-research.md",
      ),
      "utf-8",
    );
    const fm = content.split("---\n")[1] ?? "";
    // OpenCode uses YAML permission block, not Claude-style `tools:` list
    expect(fm).toMatch(/^\s*write:\s*allow\s*$/m);
    expect(fm).toMatch(/^\s*edit:\s*allow\s*$/m);
    // Body must reference persist target and PERSIST keyword
    expect(content).toContain("{TASK_DIR}/research/");
    expect(content).toMatch(/PERSIST|[Pp]ersist/);
    // Must not have blanket "Modify any files" forbidden rule (the pre-fix
    // body's central failure)
    expect(content).not.toMatch(/^- Modify any files\s*$/m);
  });
});

describe("regression: templates/markdown/spec contains only .md.txt files (0.5.0-beta.9)", () => {
  // Invariant: packages/cli/src/templates/markdown/spec/ is for user-facing
  // placeholder templates only — markdown/index.ts reads .md.txt via
  // readLocalTemplate, so bare .md files there are orphans (ship to dist as
  // dead weight, never land on user disks). Documented in
  // .trellis/spec/cli/backend/directory-structure.md "Don't: Leak dogfood
  // spec into templates/markdown/spec/". Captured while cleaning up ~2-year-old
  // leakage in task 04-21-task-schema-unify.
  it("every file under templates/markdown/spec ends in .md.txt", () => {
    function walk(dir: string): string[] {
      const out: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.isFile()) out.push(full);
      }
      return out;
    }
    const __dirname3 = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(__dirname3, "../../..");
    const specRoot = path.join(
      repoRoot,
      "packages/cli/src/templates/markdown/spec",
    );
    const files = walk(specRoot);
    const orphans = files.filter((f) => !f.endsWith(".md.txt"));
    expect(
      orphans,
      `Orphan non-.md.txt files in templates/markdown/spec/: ${orphans.join(", ")}`,
    ).toEqual([]);
  });
});

describe("regression: opencode plugin files have only export default (#212)", () => {
  // OpenCode 1.2.x plugin loader iterates `Object.entries(mod)` and invokes
  // every export as a plugin factory. Named exports alongside the default get
  // called with wrong args, the loader aborts, and the default factory
  // silently never runs — no error surfaces to stderr or to the plugin's own
  // debug log. dc2bea3 fixed session-start.js by extracting named exports to
  // lib/session-utils.js. This test prevents regression: any future named
  // export added directly to a `.opencode/plugins/*.js` file would silently
  // break that plugin's hooks on user machines.
  const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname2, "../../..");
  const pluginsDir = path.join(
    repoRoot,
    "packages/cli/src/templates/opencode/plugins",
  );
  const pluginFiles = fs
    .readdirSync(pluginsDir)
    .filter((f) => f.endsWith(".js"));

  for (const file of pluginFiles) {
    it(`${file} has exactly one export, and it is 'export default'`, () => {
      const content = fs.readFileSync(path.join(pluginsDir, file), "utf-8");
      const exportLines = content
        .split("\n")
        .filter((l) => /^export\s/.test(l));
      expect(
        exportLines,
        `${file} must have exactly one top-level export (got ${exportLines.length}). ` +
          `Move helper functions/constants to ../lib/ — opencode loader treats every export as a plugin factory.`,
      ).toHaveLength(1);
      expect(exportLines[0]).toMatch(/^export\s+default\s/);
    });
  }
});

// =============================================================================
// regression: Gemini CLI 0.40.x template compatibility (issue #224)
// =============================================================================

describe("regression: Gemini CLI 0.40.x template compatibility (#224)", () => {
  const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname2, "../../..");
  const geminiAgentsDir = path.resolve(
    __dirname2,
    "../src/templates/gemini/agents",
  );

  it("[#224] gemini agent .md files do NOT carry a comma-separated tools line", () => {
    // Gemini CLI 0.40+ Zod schema rejects `tools: a, b, c` with
    // "tools: Expected array, received string". Trellis omits the line so
    // sub-agents inherit parent tools (per research/agent-tools-frontmatter.md).
    for (const entry of fs.readdirSync(geminiAgentsDir)) {
      if (!entry.endsWith(".md")) continue;
      const content = fs.readFileSync(
        path.join(geminiAgentsDir, entry),
        "utf-8",
      );
      const fm = content.split("---\n")[1] ?? "";
      expect(
        fm,
        `gemini/agents/${entry} must NOT include a tools: line — Gemini CLI 0.40+ rejects the comma-separated form`,
      ).not.toMatch(/^tools:/m);
    }
  });

  it("[#224] gemini settings.json uses BeforeAgent (not UserPromptSubmit)", () => {
    const settingsPath = path.resolve(
      repoRoot,
      "packages/cli/src/templates/gemini/settings.json",
    );
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as { hooks?: Record<string, unknown> };
    expect(parsed.hooks).toBeDefined();
    expect(Object.keys(parsed.hooks ?? {})).toContain("BeforeAgent");
    expect(Object.keys(parsed.hooks ?? {})).not.toContain("UserPromptSubmit");
  });

  it("[#224] inject-workflow-state.py emits BeforeAgent for gemini, UserPromptSubmit otherwise", () => {
    const hookPath = path.resolve(
      repoRoot,
      "packages/cli/src/templates/shared-hooks/inject-workflow-state.py",
    );
    const content = fs.readFileSync(hookPath, "utf-8");
    // The platform branch: `"BeforeAgent" if platform == "gemini"`
    expect(content).toContain("platform = _detect_platform(data)");
    expect(content).toMatch(
      /"BeforeAgent"\s+if\s+platform\s*==\s*"gemini"\s+else\s+"UserPromptSubmit"/,
    );
  });

  it("[#224] configurePlatform('gemini') writes shared skills to .agents/skills, NOT .gemini/skills", async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "trellis-gemini-issue224-"),
    );
    try {
      setWriteMode("force");
      await configurePlatform("gemini", tmpDir);
      expect(fs.existsSync(path.join(tmpDir, ".agents", "skills"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".gemini", "skills"))).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      setWriteMode("ask");
    }
  });

  it("[#224] codex + gemini render byte-identical content for shared `.agents/skills/` files", () => {
    const codexFiles = collectPlatformTemplates("codex");
    const geminiFiles = collectPlatformTemplates("gemini");
    expect(codexFiles).toBeInstanceOf(Map);
    expect(geminiFiles).toBeInstanceOf(Map);
    if (!codexFiles || !geminiFiles) return;

    let overlapCount = 0;
    for (const [filePath, codexContent] of codexFiles) {
      if (!filePath.startsWith(".agents/skills/")) continue;
      const geminiContent = geminiFiles.get(filePath);
      if (geminiContent === undefined) continue;
      overlapCount++;
      expect(
        geminiContent,
        `Codex and Gemini disagree on ${filePath} — last-writer-wins would corrupt the shared skill`,
      ).toBe(codexContent);
    }
    // At least the shared common skills + bundled trellis-meta files must
    // overlap. If this drops to 0 the assertion above is silently passing.
    expect(overlapCount).toBeGreaterThan(0);
  });

  it("[trellis-hooks-env] all hook templates honor TRELLIS_HOOKS=0 / TRELLIS_DISABLE_HOOKS=1", () => {
    // All shipped hook scripts must early-return when the operator sets
    // TRELLIS_HOOKS=0 (or TRELLIS_DISABLE_HOOKS=1), so subprocess wrappers
    // and casual-chat scenarios can disable Trellis injection without
    // editing config or restarting under different settings.
    const sharedHookTargets = [
      "session-start.py",
      "inject-workflow-state.py",
      "inject-subagent-context.py",
      "inject-shell-session-context.py",
    ];
    for (const name of sharedHookTargets) {
      const script = getSharedHookScripts().find(
        (h) => h.name === name,
      )?.content;
      expect(script, `shared-hooks/${name} should exist`).toBeTruthy();
      expect(script).toContain('os.environ.get("TRELLIS_HOOKS") == "0"');
      expect(script).toContain(
        'os.environ.get("TRELLIS_DISABLE_HOOKS") == "1"',
      );
    }

    // Platform-specific Python session-start variants (codex, copilot)
    for (const [label, hooks] of [
      ["codex", getCodexHooks()],
      ["copilot", getCopilotHooks()],
    ] as const) {
      const sessionStart = hooks.find(
        (h) => h.name === "session-start.py",
      )?.content;
      expect(sessionStart, `${label} session-start should exist`).toBeTruthy();
      expect(sessionStart).toContain('os.environ.get("TRELLIS_HOOKS") == "0"');
      expect(sessionStart).toContain(
        'os.environ.get("TRELLIS_DISABLE_HOOKS") == "1"',
      );
    }

    // OpenCode JS plugins (no TS export — read from disk)
    const openCodePluginDir = path.resolve(
      repoRoot,
      "packages/cli/src/templates/opencode/plugins",
    );
    const jsPlugins = [
      "session-start.js",
      "inject-workflow-state.js",
      "inject-subagent-context.js",
    ];
    for (const name of jsPlugins) {
      const content = fs.readFileSync(
        path.join(openCodePluginDir, name),
        "utf-8",
      );
      expect(content).toContain('process.env.TRELLIS_HOOKS === "0"');
      expect(content).toContain('process.env.TRELLIS_DISABLE_HOOKS === "1"');
    }
  });

});

describe("regression: session-start.py f-string Python <=3.11 compat (0.5.2)", () => {
  // PEP 498 (Python <=3.11) forbids backslashes inside the *expression* part
  // of an f-string. Trellis 0.5.0/0.5.1 shipped session-start hooks with
  //   `f"{drive}:\\{rest.replace('/', '\\')}"`
  // which crashes on parse with `SyntaxError: f-string expression part cannot
  // include a backslash`. PEP 701 (Python 3.12+) lifted this restriction, so
  // the bug only manifests for users on the macOS system Python 3.9 / older
  // Linux distros. The fix moves the `.replace(...)` call to a separate
  // statement before the f-string interpolation.
  //
  // This regression scans the source files (no Python runtime needed) and
  // asserts no f-string contains a backslash inside its `{...}` expression.
  const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname2, "../../..");
  const HOOK_FILES = [
    "packages/cli/src/templates/codex/hooks/session-start.py",
    "packages/cli/src/templates/copilot/hooks/session-start.py",
    "packages/cli/src/templates/shared-hooks/session-start.py",
  ];
  // Match an f-string (f"..." or f'...') whose `{...}` body contains a `\`.
  // Backslash inside expression part is illegal under PEP 498.
  const F_STRING_BACKSLASH =
    /f(?:"[^"\n]*\{[^}\n]*\\[^}\n]*\}[^"\n]*"|'[^'\n]*\{[^}\n]*\\[^}\n]*\}[^'\n]*')/;

  for (const rel of HOOK_FILES) {
    it(`${rel} has no backslash inside any f-string expression part`, () => {
      const content = fs.readFileSync(path.join(repoRoot, rel), "utf-8");
      const m = content.match(F_STRING_BACKSLASH);
      expect(
        m,
        `Found f-string with backslash in expression part — Python <=3.11 will fail to parse this file:\n  ${m?.[0] ?? ""}`,
      ).toBeNull();
    });

    it(`${rel} parses cleanly with python3 -m py_compile`, () => {
      // Belt-and-braces: ask the host Python to parse the file. On Python
      // 3.12+ this won't catch the regression (PEP 701 allows it), so the
      // regex test above is the primary gate. On macOS system Python 3.9 or
      // any CI runner with python3 < 3.12 this is a hard catch.
      const r = spawnSync(
        "python3",
        [
          "-c",
          `import ast,sys; ast.parse(open(sys.argv[1], encoding='utf-8').read()); print('OK')`,
          path.join(repoRoot, rel),
        ],
        { encoding: "utf-8" },
      );
      // If python3 is unavailable on the runner, skip silently — the regex
      // assertion above already covers the regression deterministically.
      if (r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT")
        return;
      expect(
        r.status,
        `python3 ast.parse failed for ${rel}:\n${r.stderr ?? ""}`,
      ).toBe(0);
      expect(r.stdout ?? "").toContain("OK");
    });
  }
});

describe("regression: sub-agent context injection fallback (0.5.3)", () => {
  // 0.5.3 hotfix: class-1 platforms (claude / cursor / opencode / kiro /
  // codebuddy / droid) used to rely entirely on PreToolUse hook injection for
  // sub-agent task context. When the hook silently failed (Windows + Claude
  // Code issue #53254 / #25981 / #36156, --continue resume, fork
  // distributions, hooks disabled) sub-agents received the dispatch prompt
  // without prd / spec / jsonl context, with no recovery path.
  //
  // The fix: hook output now begins with a `<!-- trellis-hook-injected -->`
  // marker, and every class-1 trellis-implement / trellis-check definition
  // file carries a Trellis Context Loading Protocol section telling the
  // sub-agent to load context itself when the marker is absent.
  const HOOK_INJECTED_MARKER = "<!-- trellis-hook-injected -->";

  it("inject-subagent-context.py emits the marker for implement / check / finish", () => {
    const hook = getSharedHookScripts().find(
      (h) => h.name === "inject-subagent-context.py",
    );
    expect(hook).toBeDefined();
    const src = hook?.content ?? "";
    // Marker must appear in build_implement_prompt / build_check_prompt /
    // build_finish_prompt (research is intentionally NOT marker'd — it has no
    // task binding).
    expect(src).toContain(HOOK_INJECTED_MARKER);
    // Must appear at least three times (one per implement / check / finish).
    const matches = src.match(/<!--\s*trellis-hook-injected\s*-->/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  // 6 markdown class-1 platforms × 2 agents = 12 markdown files.
  // Kiro is a JSON file (separate test below).
  const CLASS1_MD_AGENT_FILES: {
    platform: string;
    rel: string;
    agent: "implement" | "check";
  }[] = [
    {
      platform: "claude",
      rel: "packages/cli/src/templates/claude/agents/trellis-implement.md",
      agent: "implement",
    },
    {
      platform: "claude",
      rel: "packages/cli/src/templates/claude/agents/trellis-check.md",
      agent: "check",
    },
    {
      platform: "cursor",
      rel: "packages/cli/src/templates/cursor/agents/trellis-implement.md",
      agent: "implement",
    },
    {
      platform: "cursor",
      rel: "packages/cli/src/templates/cursor/agents/trellis-check.md",
      agent: "check",
    },
    {
      platform: "codebuddy",
      rel: "packages/cli/src/templates/codebuddy/agents/trellis-implement.md",
      agent: "implement",
    },
    {
      platform: "codebuddy",
      rel: "packages/cli/src/templates/codebuddy/agents/trellis-check.md",
      agent: "check",
    },
    {
      platform: "opencode",
      rel: "packages/cli/src/templates/opencode/agents/trellis-implement.md",
      agent: "implement",
    },
    {
      platform: "opencode",
      rel: "packages/cli/src/templates/opencode/agents/trellis-check.md",
      agent: "check",
    },
    {
      platform: "droid",
      rel: "packages/cli/src/templates/droid/droids/trellis-implement.md",
      agent: "implement",
    },
    {
      platform: "droid",
      rel: "packages/cli/src/templates/droid/droids/trellis-check.md",
      agent: "check",
    },
    {
      platform: "zcode",
      rel: "packages/cli/src/templates/zcode/agents/trellis-implement.md",
      agent: "implement",
    },
    {
      platform: "zcode",
      rel: "packages/cli/src/templates/zcode/agents/trellis-check.md",
      agent: "check",
    },
  ];

  const __dirnameFb = path.dirname(fileURLToPath(import.meta.url));
  const repoRootFb = path.resolve(__dirnameFb, "../../..");

  function expectTaskArtifactContract(content: string): void {
    expect(content).toContain("prd.md");
    expect(content).toContain("design.md");
    expect(content).toContain("implement.md");
    expect(content).not.toMatch(/prd\.md`?\s+(?:if present|if exists)/i);
    expect(content).toMatch(/design\.md[^\n.]*(?:if present|if exists)/i);
    expect(content).toMatch(/implement\.md[^\n.]*(?:if present|if exists)/i);
  }

  for (const { platform, rel, agent } of CLASS1_MD_AGENT_FILES) {
    it(`${platform}/${agent} markdown agent file carries marker + fallback protocol`, () => {
      const content = fs.readFileSync(path.join(repoRootFb, rel), "utf-8");
      // 1. References the marker
      expect(content).toContain(HOOK_INJECTED_MARKER);
      // 2. Has the protocol heading
      expect(content).toContain("Trellis Context Loading Protocol");
      // 3. Tells AI how to find the active task path
      expect(content).toContain("Active task:");
      // 4. Tells AI which task files to Read in fallback path
      expectTaskArtifactContract(content);
      const expectedJsonl =
        agent === "implement" ? "implement.jsonl" : "check.jsonl";
      expect(content).toContain(expectedJsonl);
    });
  }

  for (const agent of ["implement", "check"] as const) {
    it(`kiro/${agent} JSON agent carries marker + fallback protocol in prompt`, () => {
      // 0.5.7 (#247): Kiro CLI renamed `instructions` → `prompt` in agent JSON.
      const filePath = path.join(
        repoRootFb,
        `packages/cli/src/templates/kiro/agents/trellis-${agent}.json`,
      );
      const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const prompt: string = json.prompt ?? "";
      expect(prompt).toContain(HOOK_INJECTED_MARKER);
      expect(prompt).toContain("Trellis Context Loading Protocol");
      expect(prompt).toContain("Active task:");
      expectTaskArtifactContract(prompt);
      const expectedJsonl =
        agent === "implement" ? "implement.jsonl" : "check.jsonl";
      expect(prompt).toContain(expectedJsonl);
    });
  }

  const GEMINI_QODER_AGENT_FILES = [
    "packages/cli/src/templates/gemini/agents/trellis-implement.md",
    "packages/cli/src/templates/gemini/agents/trellis-check.md",
    "packages/cli/src/templates/qoder/agents/trellis-implement.md",
    "packages/cli/src/templates/qoder/agents/trellis-check.md",
  ];

  for (const rel of GEMINI_QODER_AGENT_FILES) {
    it(`${rel} references task artifacts`, () => {
      const content = fs.readFileSync(path.join(repoRootFb, rel), "utf-8");
      expectTaskArtifactContract(content);
    });
  }

  for (const agent of ["implement", "check"] as const) {
    it(`pi/${agent} agent references task artifacts`, () => {
      const content = fs.readFileSync(
        path.join(
          repoRootFb,
          `packages/cli/src/templates/pi/agents/trellis-${agent}.md`,
        ),
        "utf-8",
      );
      expectTaskArtifactContract(content);
    });
  }

  it("[issue-247] kiro agent JSON files use Kiro CLI's current schema (prompt / hooks-object)", () => {
    // Kiro CLI rejected Trellis's pre-0.5.7 agent JSON with "invalid agent"
    // because the schema drifted: `instructions` → `prompt`, `tools` field
    // gained a sibling `allowedTools`, and `hooks` switched from an array of
    // `{on, command, timeout_ms}` entries to an object keyed by event name.
    // See https://kiro.dev/docs/cli/custom-agents/configuration-reference.
    for (const agent of ["implement", "check", "research"] as const) {
      const filePath = path.join(
        repoRootFb,
        `packages/cli/src/templates/kiro/agents/trellis-${agent}.json`,
      );
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as {
        prompt?: unknown;
        instructions?: unknown;
        tools?: unknown;
        allowedTools?: unknown;
        hooks?: unknown;
      };

      expect(data.prompt, `${agent}: prompt field present`).toBeTypeOf(
        "string",
      );
      expect(
        data.instructions,
        `${agent}: instructions field removed`,
      ).toBeUndefined();
      expect(Array.isArray(data.tools), `${agent}: tools is array`).toBe(true);
      expect(
        Array.isArray(data.allowedTools),
        `${agent}: allowedTools is array`,
      ).toBe(true);

      // hooks must be an OBJECT keyed by event name, not an array.
      expect(
        data.hooks !== null &&
          typeof data.hooks === "object" &&
          !Array.isArray(data.hooks),
        `${agent}: hooks is object (not array)`,
      ).toBe(true);
    }
  });

  it("workflow.md dispatch protocol covers all platforms (not class-2 only)", () => {
    const workflowPath = path.join(
      repoRootFb,
      "packages/cli/src/templates/trellis/workflow.md",
    );
    const wf = fs.readFileSync(workflowPath, "utf-8");
    // The protocol enforces `Active task: <path>` for ALL sub-agents (no
    // trellis-research carve-out as of 0.5.8 — research sub-agents need the
    // task path to know which `{task_dir}/research/` to write into).
    expect(wf).toContain("Sub-agent dispatch protocol");
    expect(wf).toContain("all platforms");
    expect(wf).toContain("all sub-agents");
    expect(wf).not.toContain("EXCEPT trellis-research");
    expect(wf).toContain("trellis-research");
    expect(wf).toContain("Active task:");
    // Must NOT scope the rule to class-2 only — that was the pre-0.5.3 limit.
    expect(wf).not.toMatch(
      /Sub-agent dispatch protocol \(class-2 platforms[^)]*\)/,
    );
  });
});

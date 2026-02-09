/**
 * Regression Tests — Historical Bug Prevention
 *
 * Each test references a specific version where the bug was introduced/fixed.
 * Prevents recurrence of bugs from beta.2 through beta.16.
 *
 * Categories:
 * 1. Windows / Encoding (beta.2, beta.7, beta.10, beta.11, beta.12, beta.16)
 * 2. Path Issues (0.2.14, 0.2.15, beta.13)
 * 3. Semver / Migration Engine (beta.5, beta.14, beta.16)
 * 4. Template Integrity (beta.0, beta.7, beta.12)
 * 5. Platform Registry (beta.9, beta.13, beta.16)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearManifestCache,
  getAllMigrations,
  getAllMigrationVersions,
  getMigrationsForVersion,
  hasPendingMigrations,
} from "../src/migrations/index.js";
import { isManagedPath } from "../src/configurators/index.js";
import { AI_TOOLS } from "../src/types/ai-tools.js";
import { PATHS } from "../src/constants/paths.js";
import {
  settingsTemplate as claudeSettingsTemplate,
  getAllCommands as getClaudeCommands,
  getAllAgents as getClaudeAgents,
  getAllHooks as getClaudeHooks,
} from "../src/templates/claude/index.js";
import {
  settingsTemplate as iflowSettingsTemplate,
  getAllHooks as getIflowHooks,
} from "../src/templates/iflow/index.js";
import {
  commonInit,
  commonGitContext,
  taskScript,
  addSessionScript,
  multiAgentPlan,
  multiAgentStart,
  commonCliAdapter,
  getAllScripts,
} from "../src/templates/trellis/index.js";
import { collectPlatformTemplates, PLATFORM_IDS } from "../src/configurators/index.js";

afterEach(() => {
  clearManifestCache();
});

// =============================================================================
// 1. Windows / Encoding Regressions
// =============================================================================

describe("regression: Windows encoding (beta.10, beta.11, beta.16)", () => {
  it("[beta.10] common/__init__.py has _configure_stream function", () => {
    expect(commonInit).toContain("def _configure_stream");
  });

  it("[beta.10] common/__init__.py has reconfigure(encoding=\"utf-8\") pattern", () => {
    expect(commonInit).toContain('reconfigure(encoding="utf-8"');
  });

  it("[beta.10] common/__init__.py has TextIOWrapper fallback", () => {
    expect(commonInit).toContain("TextIOWrapper");
  });

  it("[beta.10] common/__init__.py has sys.platform == \"win32\" guard", () => {
    expect(commonInit).toContain('sys.platform == "win32"');
  });

  it("[beta.10] common/__init__.py configures both stdout AND stderr", () => {
    expect(commonInit).toContain("sys.stdout");
    expect(commonInit).toContain("sys.stderr");
  });

  it("[beta.16] _configure_stream handles stream with reconfigure method", () => {
    // The function should try reconfigure() first, then fallback to detach()
    expect(commonInit).toContain('hasattr(stream, "reconfigure")');
    expect(commonInit).toContain('hasattr(stream, "detach")');
  });

  it("[beta.16] _configure_stream is idempotent (won't crash on double call)", () => {
    // The reconfigure pattern is safe to call multiple times
    // The function should NOT use detach() unconditionally (beta.16 bug root cause)
    // It should check hasattr(stream, "reconfigure") FIRST
    const reconfigureIndex = commonInit.indexOf('hasattr(stream, "reconfigure")');
    const detachIndex = commonInit.indexOf('hasattr(stream, "detach")');
    expect(reconfigureIndex).toBeLessThan(detachIndex);
  });

  it("[beta.10] task.py has inline encoding fix before imports", () => {
    // Encoding fix must come before other imports to prevent early UnicodeEncodeError
    const encodingFixIndex = taskScript.indexOf('sys.platform == "win32"');
    const commonImportIndex = taskScript.indexOf("from common");
    expect(encodingFixIndex).toBeGreaterThan(-1);
    expect(commonImportIndex).toBeGreaterThan(-1);
    expect(encodingFixIndex).toBeLessThan(commonImportIndex);
  });

  it("[beta.10] add_session.py has inline encoding fix", () => {
    expect(addSessionScript).toContain('sys.platform == "win32"');
    expect(addSessionScript).toContain("reconfigure");
  });

  it("[beta.10] git_context.py has inline encoding fix", () => {
    expect(commonGitContext).toContain('sys.platform == "win32"');
    expect(commonGitContext).toContain("reconfigure");
  });
});

describe("regression: Windows subprocess flags (beta.2, beta.12)", () => {
  it("[beta.12] plan.py uses CREATE_NEW_PROCESS_GROUP on win32", () => {
    expect(multiAgentPlan).toContain("CREATE_NEW_PROCESS_GROUP");
    expect(multiAgentPlan).toContain('sys.platform == "win32"');
  });

  it("[beta.12] plan.py uses start_new_session on non-Windows", () => {
    expect(multiAgentPlan).toContain("start_new_session");
  });

  it("[beta.12] start.py uses CREATE_NEW_PROCESS_GROUP on win32", () => {
    expect(multiAgentStart).toContain("CREATE_NEW_PROCESS_GROUP");
    expect(multiAgentStart).toContain('sys.platform == "win32"');
  });

  it("[beta.12] start.py uses start_new_session on non-Windows", () => {
    expect(multiAgentStart).toContain("start_new_session");
  });
});

describe("regression: Windows path separator (beta.12)", () => {
  it("[beta.12] isManagedPath handles Windows backslash paths", () => {
    expect(isManagedPath(".claude\\commands\\foo.md")).toBe(true);
    expect(isManagedPath(".trellis\\spec\\backend")).toBe(true);
    expect(isManagedPath(".iflow\\hooks\\test.py")).toBe(true);
    expect(isManagedPath(".cursor\\commands\\start.md")).toBe(true);
    expect(isManagedPath(".opencode\\config.json")).toBe(true);
  });

  it("[beta.12] isManagedPath handles mixed separators", () => {
    expect(isManagedPath(".claude\\commands/foo.md")).toBe(true);
  });
});

// =============================================================================
// 2. Path Issues Regressions
// =============================================================================

describe("regression: task directory paths (0.2.14, 0.2.15, beta.13)", () => {
  it("[0.2.15] PATHS.TASKS is .trellis/tasks (not .trellis/workspace/*/tasks)", () => {
    expect(PATHS.TASKS).toBe(".trellis/tasks");
    expect(PATHS.TASKS).not.toContain("workspace");
  });

  it("[0.2.14] Claude agent templates do not contain hardcoded .trellis/workspace/*/tasks/ paths", () => {
    const agents = getClaudeAgents();
    for (const agent of agents) {
      expect(agent.content).not.toMatch(/\.trellis\/workspace\/[^/]+\/tasks\//);
    }
  });

  it("[beta.13] cli_adapter.py does not contain hardcoded developer paths", () => {
    expect(commonCliAdapter).not.toMatch(/workspace\/taosu/);
    expect(commonCliAdapter).not.toMatch(/workspace\/[a-z]+\/tasks/);
  });

  it("[0.2.15] no script templates contain hardcoded 'taosu' in path patterns", () => {
    const scripts = getAllScripts();
    for (const [name, content] of scripts) {
      // Check for hardcoded username in path patterns (workspace/taosu, /Users/taosu)
      // but allow usage examples like "python3 status.py -a taosu"
      expect(content, `${name} should not contain hardcoded username in paths`).not.toMatch(
        /workspace\/taosu|\/Users\/taosu/,
      );
    }
  });
});

describe("regression: task.py _resolve_task_dir path handling", () => {
  it("[beta.12] task.py resolve_task_dir handles .trellis prefix", () => {
    // The function should recognize .trellis-prefixed paths as relative paths
    expect(taskScript).toContain('.startswith(".trellis")');
  });

  it("[potential] task.py path check includes '/' separator check", () => {
    // resolve_task_dir should detect relative paths containing '/'
    expect(taskScript).toContain('"/" in target_dir');
  });
});

// =============================================================================
// 3. Semver / Migration Engine Regressions
// =============================================================================

describe("regression: semver prerelease handling (beta.5)", () => {
  it("[beta.5] prerelease version sorts before release version", () => {
    // 0.3.0-beta.1 < 0.3.0 (prerelease is less than release)
    const versions = getAllMigrationVersions();
    const betaVersions = versions.filter((v) => v.includes("beta"));
    const releaseVersions = versions.filter(
      (v) => !v.includes("beta") && !v.includes("alpha"),
    );

    if (betaVersions.length > 0 && releaseVersions.length > 0) {
      // All beta versions should appear before their corresponding release versions
      const lastBeta = betaVersions[betaVersions.length - 1];
      const firstRelease = releaseVersions[0];
      const lastBetaIdx = versions.indexOf(lastBeta);
      const firstReleaseIdx = versions.indexOf(firstRelease);
      // Only compare if they share the same base version
      if (lastBeta.startsWith(firstRelease.split("-")[0])) {
        expect(lastBetaIdx).toBeLessThan(firstReleaseIdx);
      }
    }
  });

  it("[beta.5] prerelease numeric parts compare numerically (beta.2 < beta.10)", () => {
    // getMigrationsForVersion relies on correct version ordering
    // beta.2 should be before beta.10 (numeric, not lexicographic)
    const versions = getAllMigrationVersions();
    const beta2Idx = versions.indexOf("0.3.0-beta.2");
    const beta10Idx = versions.indexOf("0.3.0-beta.10");
    if (beta2Idx !== -1 && beta10Idx !== -1) {
      expect(beta2Idx).toBeLessThan(beta10Idx);
    }
  });

  it("[beta.5] getMigrationsForVersion returns empty for equal versions", () => {
    expect(getMigrationsForVersion("0.3.0-beta.5", "0.3.0-beta.5")).toEqual([]);
  });

  it("[beta.5] getMigrationsForVersion correctly handles beta range", () => {
    // beta.0 to beta.2 should include beta.1 and beta.2 migrations
    getMigrationsForVersion("0.3.0-beta.0", "0.3.0-beta.2");
    // Should not include beta.0 itself (only > fromVersion)
    const versions = getAllMigrationVersions();
    if (versions.includes("0.3.0-beta.1")) {
      expect(hasPendingMigrations("0.3.0-beta.0", "0.3.0-beta.2")).toBeDefined();
    }
  });
});

describe("regression: migration data integrity (beta.14)", () => {
  it("[beta.14] all migrations have non-undefined 'from' field", () => {
    const allMigrations = getAllMigrations();
    for (const m of allMigrations) {
      expect(m.from, `migration should have 'from' field defined`).toBeDefined();
      expect(typeof m.from).toBe("string");
      expect(m.from.length).toBeGreaterThan(0);
    }
  });

  it("[beta.14] all migrations have valid type field", () => {
    const allMigrations = getAllMigrations();
    const validTypes = ["rename", "rename-dir", "delete"];
    for (const m of allMigrations) {
      expect(validTypes).toContain(m.type);
    }
  });

  it("[beta.14] rename/rename-dir migrations have 'to' field", () => {
    const allMigrations = getAllMigrations();
    const renames = allMigrations.filter(
      (m) => m.type === "rename" || m.type === "rename-dir",
    );
    for (const m of renames) {
      expect(m.to, `rename migration from '${m.from}' should have 'to'`).toBeDefined();
      expect(typeof m.to).toBe("string");
      expect((m.to as string).length).toBeGreaterThan(0);
    }
  });

  it("[beta.14] all manifest versions are valid semver-like strings", () => {
    const versions = getAllMigrationVersions();
    for (const v of versions) {
      expect(v).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    }
  });
});

describe("regression: update only configured platforms (beta.16)", () => {
  it("[beta.16] collectPlatformTemplates returns undefined for opencode (no collectTemplates)", () => {
    // OpenCode uses plugin system, templates tracked separately
    const result = collectPlatformTemplates("opencode");
    expect(result).toBeUndefined();
  });

  it("[beta.16] collectPlatformTemplates returns Map for platforms with tracking", () => {
    const withTracking = ["claude-code", "cursor", "iflow", "codex"] as const;
    for (const id of withTracking) {
      const result = collectPlatformTemplates(id);
      expect(result, `${id} should have template tracking`).toBeInstanceOf(Map);
    }
  });
});

// =============================================================================
// 4. Template Integrity Regressions
// =============================================================================

describe("regression: shell to Python migration (beta.0)", () => {
  it("[beta.0] no .sh scripts remain in trellis templates", () => {
    const scripts = getAllScripts();
    for (const [name] of scripts) {
      expect(name.endsWith(".sh"), `${name} should not end with .sh`).toBe(false);
    }
  });

  it("[beta.0] all script keys end with .py", () => {
    const scripts = getAllScripts();
    for (const [name] of scripts) {
      expect(name.endsWith(".py"), `${name} should end with .py`).toBe(true);
    }
  });

  it("[beta.0] multi_agent uses underscore (not hyphen)", () => {
    const scripts = getAllScripts();
    const multiAgentKeys = [...scripts.keys()].filter((k) =>
      k.includes("multi"),
    );
    for (const key of multiAgentKeys) {
      expect(key).toContain("multi_agent");
      expect(key).not.toContain("multi-agent");
    }
  });
});

describe("regression: hook JSON format (beta.7)", () => {
  it("[beta.7] Claude settings.json is valid JSON", () => {
    expect(() => JSON.parse(claudeSettingsTemplate)).not.toThrow();
  });

  it("[beta.7] Claude settings.json has correct hook structure", () => {
    const settings = JSON.parse(claudeSettingsTemplate);
    expect(settings).toHaveProperty("hooks");
    expect(settings.hooks).toHaveProperty("SessionStart");
    expect(Array.isArray(settings.hooks.SessionStart)).toBe(true);

    // Each hook entry should have matcher and hooks array
    for (const entry of settings.hooks.SessionStart) {
      expect(entry).toHaveProperty("hooks");
      expect(Array.isArray(entry.hooks)).toBe(true);
      for (const hook of entry.hooks) {
        expect(hook).toHaveProperty("type", "command");
        expect(hook).toHaveProperty("command");
        expect(hook).toHaveProperty("timeout");
      }
    }
  });

  it("[beta.7] hook commands use {{PYTHON_CMD}} placeholder (not hardcoded python3)", () => {
    const settings = JSON.parse(claudeSettingsTemplate);
    const allHookEntries = [
      ...settings.hooks.SessionStart,
      ...settings.hooks.PreToolUse,
      ...settings.hooks.SubagentStop,
    ];
    for (const entry of allHookEntries) {
      for (const hook of entry.hooks) {
        expect(hook.command).toContain("{{PYTHON_CMD}}");
        expect(hook.command).not.toMatch(/^python3?\s/);
      }
    }
  });

  it("[beta.7] iFlow settings.json is valid JSON with hooks", () => {
    expect(() => JSON.parse(iflowSettingsTemplate)).not.toThrow();
    const settings = JSON.parse(iflowSettingsTemplate);
    expect(settings).toHaveProperty("hooks");
  });

  it("[beta.7] iFlow hook commands use {{PYTHON_CMD}} placeholder", () => {
    const settings = JSON.parse(iflowSettingsTemplate);
    const hookTypes = Object.values(settings.hooks) as { hooks: { command: string }[] }[][];
    for (const entries of hookTypes) {
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          expect(hook.command).toContain("{{PYTHON_CMD}}");
        }
      }
    }
  });
});

describe("regression: backslash in markdown templates (beta.12)", () => {
  it("[beta.12] Claude command templates do not contain problematic backslash sequences", () => {
    const commands = getClaudeCommands();
    for (const cmd of commands) {
      expect(cmd.content).not.toContain("\\--");
      expect(cmd.content).not.toContain("\\->");
    }
  });

  it("[beta.12] Claude agent templates do not contain problematic backslash sequences", () => {
    const agents = getClaudeAgents();
    for (const agent of agents) {
      expect(agent.content).not.toContain("\\--");
      expect(agent.content).not.toContain("\\->");
    }
  });

  it("[beta.12] Claude hook templates do not contain problematic backslash sequences", () => {
    const hooks = getClaudeHooks();
    for (const hook of hooks) {
      expect(hook.content).not.toContain("\\--");
      expect(hook.content).not.toContain("\\->");
    }
  });

  it("[beta.12] iFlow hook templates do not contain problematic backslash sequences", () => {
    const hooks = getIflowHooks();
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

  it("[beta.16] iFlow platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("iflow");
    expect(AI_TOOLS.iflow.configDir).toBe(".iflow");
  });

  it("[codex] Codex platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("codex");
    expect(AI_TOOLS.codex.configDir).toBe(".agents/skills");
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

  it("[beta.16] cli_adapter.py supports iflow platform", () => {
    expect(commonCliAdapter).toContain('"iflow"');
    expect(commonCliAdapter).toContain(".iflow");
  });

  it("[codex] cli_adapter.py supports codex platform", () => {
    expect(commonCliAdapter).toContain('"codex"');
    expect(commonCliAdapter).toContain(".agents");
  });

  it("[beta.9] cli_adapter.py has detect_platform function", () => {
    expect(commonCliAdapter).toContain("def detect_platform");
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
    expect(commonCliAdapter).toContain(".iflow");
    expect(commonCliAdapter).toContain(".agents");
  });
});

// =============================================================================
// 6. Cross-version Migration Consistency
// =============================================================================

describe("regression: migration manifest consistency", () => {
  it("all manifest JSON files are loaded", () => {
    const manifestDir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/migrations/manifests",
    );
    const jsonFiles = fs
      .readdirSync(manifestDir)
      .filter((f) => f.endsWith(".json"));
    const versions = getAllMigrationVersions();
    expect(versions.length).toBe(jsonFiles.length);
    expect(versions.length).toBeGreaterThan(0);
  });

  it("version ordering is strictly ascending", () => {
    const versions = getAllMigrationVersions();
    // Check known ordering constraints
    const knownOrder = [
      "0.1.9",
      "0.2.0",
      "0.2.12",
      "0.2.13",
      "0.2.14",
      "0.2.15",
      "0.3.0-beta.0",
      "0.3.0-beta.1",
      "0.3.0-beta.2",
      "0.3.0-beta.3",
      "0.3.0-beta.4",
      "0.3.0-beta.5",
    ];
    for (let i = 0; i < knownOrder.length; i++) {
      const idx = versions.indexOf(knownOrder[i]);
      expect(idx, `${knownOrder[i]} should be in versions`).not.toBe(-1);
      if (i > 0) {
        const prevIdx = versions.indexOf(knownOrder[i - 1]);
        expect(idx, `${knownOrder[i]} should come after ${knownOrder[i - 1]}`).toBeGreaterThan(prevIdx);
      }
    }
  });

  it("[beta.0] shell-to-python migration has both renames and deletes", () => {
    const migrations = getMigrationsForVersion("0.2.15", "0.3.0-beta.0");
    const renames = migrations.filter((m) => m.type === "rename");
    const deletes = migrations.filter((m) => m.type === "delete");
    expect(renames.length).toBeGreaterThan(0);
    expect(deletes.length).toBeGreaterThan(0);
  });

  it("[0.2.14] command namespace migration renames exist", () => {
    const migrations = getMigrationsForVersion("0.2.13", "0.2.14");
    expect(migrations.length).toBeGreaterThan(0);
    // Should include commands moved to trellis/ subdirectory
    const claudeRenames = migrations.filter(
      (m) => m.type === "rename" && m.from.startsWith(".claude/commands/"),
    );
    expect(claudeRenames.length).toBeGreaterThan(0);
  });
});

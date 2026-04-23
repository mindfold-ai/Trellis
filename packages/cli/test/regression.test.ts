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

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  getAllAgents as getClaudeAgents,
} from "../src/templates/claude/index.js";
import { getAllHooks as getCodexHooks } from "../src/templates/codex/index.js";
import { getSharedHookScripts } from "../src/templates/shared-hooks/index.js";
import {
  getCommandTemplates,
  getSkillTemplates,
} from "../src/templates/common/index.js";
import {
  commonInit,
  taskScript,
  addSessionScript,
  commonCliAdapter,
  commonTaskUtils,
  commonDeveloper,
  commonConfig,
  getAllScripts,
} from "../src/templates/trellis/index.js";
import {
  collectPlatformTemplates,
  configurePlatform,
  PLATFORM_IDS,
} from "../src/configurators/index.js";
import { setWriteMode } from "../src/utils/file-writer.js";
import { guidesIndexContent, workspaceIndexContent } from "../src/templates/markdown/index.js";
import * as markdownExports from "../src/templates/markdown/index.js";
import { TrellisContext } from "../src/templates/opencode/lib/trellis-context.js";


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

  it('[beta.10] common/__init__.py has reconfigure(encoding="utf-8") pattern', () => {
    expect(commonInit).toContain('reconfigure(encoding="utf-8"');
  });

  it("[beta.10] common/__init__.py has TextIOWrapper fallback", () => {
    expect(commonInit).toContain("TextIOWrapper");
  });

  it('[beta.10] common/__init__.py has sys.platform == "win32" guard', () => {
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
    const reconfigureIndex = commonInit.indexOf(
      'hasattr(stream, "reconfigure")',
    );
    const detachIndex = commonInit.indexOf('hasattr(stream, "detach")');
    expect(reconfigureIndex).toBeLessThan(detachIndex);
  });

  it("[beta.10] common/__init__.py has centralized encoding fix", () => {
    // Encoding fix was centralized from individual scripts to common/__init__.py (#67)
    expect(commonInit).toContain('sys.platform == "win32"');
    expect(commonInit).toContain("reconfigure");
  });

  it("[beta.10] task.py imports from common (gets encoding fix via __init__.py)", () => {
    expect(taskScript).toContain("from common");
  });

  it("[rc.2] add_session.py table separator detection uses regex (not startswith)", () => {
    // Bug: startswith("|---") breaks when formatters add spaces: "| ---- |"
    // Fix: use re.match with a character-class pattern to allow optional whitespace/spaces
    expect(addSessionScript).not.toContain('startswith("|---")');
    expect(addSessionScript).toContain(String.raw`re.match(r"^\|[-| ]+\|\s*$", line)`);
  });
});

describe("regression: branch context in session records (issue-106)", () => {
  it("[issue-106] add_session.py accepts --branch CLI arg", () => {
    expect(addSessionScript).toContain("--branch");
    expect(addSessionScript).not.toContain("--base-branch");
  });

  it("[issue-106] add_session.py auto-detects branch via git branch --show-current", () => {
    expect(addSessionScript).toContain("branch --show-current");
  });

  it("[issue-106] add_session.py reads branch from task.json when available", () => {
    expect(addSessionScript).toContain('task_data.raw.get("branch")');
    expect(addSessionScript).not.toContain('task_data.raw.get("base_branch")');
  });

  it("[issue-106] add_session.py session content includes **Branch** field only", () => {
    expect(addSessionScript).toContain("**Branch**");
    expect(addSessionScript).not.toContain("**Base Branch**");
  });

  it("[issue-106] add_session.py index table header has 5 columns including Branch", () => {
    expect(addSessionScript).toContain(
      "| # | Date | Title | Commits | Branch |",
    );
    expect(addSessionScript).not.toContain(
      "| # | Date | Title | Commits | Branch | Base Branch |",
    );
  });

  it("[issue-106] add_session.py migrates old 4/6-column headers to 5-column", () => {
    expect(addSessionScript).toMatch(
      /re\.match\(\r?\n\s+r"\^\\\|\\s\*#\\s\*\\\|\\s\*Date\\s\*\\\|\\s\*Title\\s\*\\\|\\s\*Commits\\s\*\\\|\\s\*Branch\\s\*\\\|\\s\*Base Branch\\s\*\\\|\\s\*\$",/,
    );
    expect(addSessionScript).toContain(
      String.raw`re.match(r"^\|\s*#\s*\|\s*Date\s*\|\s*Title\s*\|\s*Commits\s*\|\s*Branch\s*\|\s*$", line)`,
    );
  });

  it("[issue-106] developer.py init template has 5-column session history table", () => {
    expect(commonDeveloper).toContain(
      "| # | Date | Title | Commits | Branch |",
    );
    expect(commonDeveloper).toContain(
      "|---|------|-------|---------|--------|",
    );
  });

  it("[issue-106] workspace-index.md template documents Branch field only for session records", () => {
    expect(workspaceIndexContent).toContain("Branch: Which branch the work was done on");
    expect(workspaceIndexContent).toContain("**Branch**: `{branch-name}`");
    expect(workspaceIndexContent).not.toContain("**Base Branch**: `{base-branch-name}`");
  });
});

describe("regression: add_session.py runtime branch context (issue-106)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTrellisScripts(): void {
    const scriptsDir = path.join(tmpDir, ".trellis", "scripts");
    for (const [relativePath, content] of getAllScripts()) {
      const absPath = path.join(scriptsDir, relativePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content);
    }
  }

  function createWorkspaceIndex(
    headerMode: "legacy4" | "legacy6" | "current5",
  ): void {
    let header = "| # | Date | Title | Commits | Branch |";
    let separator = "|---|------|-------|---------|--------|";
    if (headerMode === "legacy4") {
      header = "| # | Date | Title | Commits |";
      separator = "|---|------|-------|---------|";
    } else if (headerMode === "legacy6") {
      header = "| # | Date | Title | Commits | Branch | Base Branch |";
      separator = "|---|------|-------|---------|--------|-------------|";
    }
    const indexContent = `# Workspace Index - test-dev

## Current Status

<!-- @@@auto:current-status -->
- **Active File**: \`journal-1.md\`
- **Total Sessions**: 0
- **Last Active**: -
<!-- @@@/auto:current-status -->

## Active Documents

<!-- @@@auto:active-documents -->
| File | Lines | Status |
|------|-------|--------|
| \`journal-1.md\` | ~0 | Active |
<!-- @@@/auto:active-documents -->

## Session History

<!-- @@@auto:session-history -->
${header}
${separator}
<!-- @@@/auto:session-history -->
`;
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "workspace", "test-dev", "index.md"),
      indexContent,
      "utf-8",
    );
  }

  function setupSessionRepo(options?: {
    gitBranch?: string;
    headerMode?: "legacy4" | "legacy6" | "current5";
    taskBranch?: string;
    taskBaseBranch?: string;
  }): void {
    writeTrellisScripts();

    fs.mkdirSync(path.join(tmpDir, ".trellis", "workspace", "test-dev"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-22T00:00:00\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "workspace", "test-dev", "journal-1.md"),
      "# Journal - test-dev (Part 1)\n\n---\n",
      "utf-8",
    );
    createWorkspaceIndex(options?.headerMode ?? "current5");

    if (options?.taskBranch || options?.taskBaseBranch) {
      const taskDir = path.join(tmpDir, ".trellis", "tasks", "issue-106");
      fs.mkdirSync(taskDir, { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, ".trellis", ".current-task"),
        ".trellis/tasks/issue-106\n",
        "utf-8",
      );
      fs.writeFileSync(
        path.join(taskDir, "task.json"),
        JSON.stringify(
          {
            title: "Issue 106 task",
            status: "in_progress",
            package: null,
            branch: options.taskBranch ?? null,
            base_branch: options.taskBaseBranch ?? null,
          },
          null,
          2,
        ),
        "utf-8",
      );
    }

    if (options?.gitBranch) {
      execSync("git init -q", { cwd: tmpDir });
      execSync(`git branch -m ${JSON.stringify(options.gitBranch)}`, {
        cwd: tmpDir,
      });
    }
  }

  function runAddSession(
    title: string,
    options?: { branch?: string },
  ): void {
    const command = [
      "python3",
      JSON.stringify(path.join(tmpDir, ".trellis", "scripts", "add_session.py")),
      "--title",
      JSON.stringify(title),
      "--summary",
      JSON.stringify("Regression test session"),
      "--no-commit",
    ];
    if (options?.branch) {
      command.push("--branch", JSON.stringify(options.branch));
    }

    execSync(command.join(" "), {
      cwd: tmpDir,
      encoding: "utf-8",
    });
  }

  it("[issue-106] prefers explicit CLI branch over task.json and git", () => {
    setupSessionRepo({
      gitBranch: "feature/from-git",
      taskBranch: "task/from-task",
      taskBaseBranch: "main",
    });

    runAddSession("CLI branch wins", { branch: "cli/from-arg" });

    const journal = fs.readFileSync(
      path.join(tmpDir, ".trellis", "workspace", "test-dev", "journal-1.md"),
      "utf-8",
    );
    const index = fs.readFileSync(
      path.join(tmpDir, ".trellis", "workspace", "test-dev", "index.md"),
      "utf-8",
    );

    expect(journal).toContain("**Branch**: `cli/from-arg`");
    expect(journal).not.toContain("**Base Branch**:");
    expect(journal).not.toContain("task/from-task");
    expect(journal).not.toContain("feature/from-git");
    expect(index).toContain("`cli/from-arg` |");
    expect(index).not.toContain("`task/from-task`");
    expect(index).not.toContain("`feature/from-git`");
  });

  it("[issue-106] prefers task.json branch over current git branch and ignores task base_branch", () => {
    setupSessionRepo({
      gitBranch: "feature/from-git",
      taskBranch: "task/from-task",
      taskBaseBranch: "main",
    });

    runAddSession("Task branch wins");

    const journal = fs.readFileSync(
      path.join(tmpDir, ".trellis", "workspace", "test-dev", "journal-1.md"),
      "utf-8",
    );
    const index = fs.readFileSync(
      path.join(tmpDir, ".trellis", "workspace", "test-dev", "index.md"),
      "utf-8",
    );

    expect(journal).toContain("**Branch**: `task/from-task`");
    expect(journal).not.toContain("**Base Branch**:");
    expect(journal).not.toContain("feature/from-git");
    expect(index).toContain("`task/from-task` |");
    expect(index).not.toContain("`feature/from-git`");
  });

  it("[issue-106] falls back to git branch and migrates old 6-column session history", () => {
    setupSessionRepo({
      gitBranch: "feature/from-git",
      headerMode: "legacy6",
    });

    runAddSession("Git branch fallback");

    const journal = fs.readFileSync(
      path.join(tmpDir, ".trellis", "workspace", "test-dev", "journal-1.md"),
      "utf-8",
    );
    const index = fs.readFileSync(
      path.join(tmpDir, ".trellis", "workspace", "test-dev", "index.md"),
      "utf-8",
    );

    expect(journal).toContain("**Branch**: `feature/from-git`");
    expect(journal).not.toContain("**Base Branch**:");
    expect(index).toContain("| # | Date | Title | Commits | Branch |");
    expect(index).toContain("|---|------|-------|---------|--------|");
    expect(index).toContain("`feature/from-git` |");
    expect(index).not.toContain(
      "| # | Date | Title | Commits | Branch | Base Branch |\n|---|------|-------|---------|--------|-------------|",
    );
  });

  it("[issue-106] migrates old 4-column session history directly to 5 columns", () => {
    setupSessionRepo({
      headerMode: "legacy4",
    });

    runAddSession("Legacy 4-column migration");

    const index = fs.readFileSync(
      path.join(tmpDir, ".trellis", "workspace", "test-dev", "index.md"),
      "utf-8",
    );

    expect(index).toContain("| # | Date | Title | Commits | Branch |");
    expect(index).toContain("|---|------|-------|---------|--------|");
    expect(index).not.toContain(
      "| # | Date | Title | Commits |\n|---|------|-------|---------|",
    );
  });

  it("[issue-106] records a session even when no branch information is available", () => {
    setupSessionRepo();

    runAddSession("No branch available");

    const journal = fs.readFileSync(
      path.join(tmpDir, ".trellis", "workspace", "test-dev", "journal-1.md"),
      "utf-8",
    );
    const index = fs.readFileSync(
      path.join(tmpDir, ".trellis", "workspace", "test-dev", "index.md"),
      "utf-8",
    );

    expect(journal).not.toContain("**Branch**:");
    expect(journal).not.toContain("**Base Branch**:");
    expect(index).toContain("`-` |");
    expect(index).toContain("- **Total Sessions**: 1");
  });
});

// Windows subprocess flags tests removed — multi_agent pipeline removed

describe("regression: Windows path separator (beta.12)", () => {
  it("[beta.12] isManagedPath handles Windows backslash paths", () => {
    expect(isManagedPath(".claude\\commands\\foo.md")).toBe(true);
    expect(isManagedPath(".trellis\\spec\\backend")).toBe(true);
    expect(isManagedPath(".cursor\\commands\\start.md")).toBe(true);
    expect(isManagedPath(".opencode\\config.json")).toBe(true);
    expect(isManagedPath(".github\\copilot\\hooks\\session-start.py")).toBe(
      true,
    );
    expect(isManagedPath(".github\\hooks\\trellis.json")).toBe(true);
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
      expect(
        content,
        `${name} should not contain hardcoded username in paths`,
      ).not.toMatch(/workspace\/taosu|\/Users\/taosu/);
    }
  });
});

describe("regression: resolve_task_dir path handling", () => {
  it("[beta.12] resolve_task_dir handles .trellis prefix", () => {
    // The function should recognize .trellis-prefixed paths as relative paths
    expect(commonTaskUtils).toContain('.startswith(".trellis")');
  });

  it("[current-task] resolve_task_dir normalizes backslash separators before path classification", () => {
    expect(commonTaskUtils).toContain('target_dir.replace("\\\\", "/")');
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
      expect(
        hasPendingMigrations("0.3.0-beta.0", "0.3.0-beta.2"),
      ).toBeDefined();
    }
  });
});

describe("regression: migration data integrity (beta.14)", () => {
  it("[beta.14] all migrations have non-undefined 'from' field", () => {
    const allMigrations = getAllMigrations();
    for (const m of allMigrations) {
      expect(
        m.from,
        `migration should have 'from' field defined`,
      ).toBeDefined();
      expect(typeof m.from).toBe("string");
      expect(m.from.length).toBeGreaterThan(0);
    }
  });

  it("[beta.14] all migrations have valid type field", () => {
    const allMigrations = getAllMigrations();
    const validTypes = ["rename", "rename-dir", "delete", "safe-file-delete"];
    for (const m of allMigrations) {
      expect(validTypes).toContain(m.type);
    }
  });

  it("[beta.1-040] safe-file-delete migrations have allowed_hashes", () => {
    const allMigrations = getAllMigrations();
    const safeDeletes = allMigrations.filter(
      (m) => m.type === "safe-file-delete",
    );
    for (const m of safeDeletes) {
      expect(
        m.allowed_hashes,
        `safe-file-delete for '${m.from}' should have allowed_hashes`,
      ).toBeDefined();
      expect(Array.isArray(m.allowed_hashes)).toBe(true);
      expect(
        (m.allowed_hashes as string[]).length,
        `safe-file-delete for '${m.from}' should have at least one hash`,
      ).toBeGreaterThan(0);
      for (const hash of m.allowed_hashes as string[]) {
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });

  it("[beta.14] rename/rename-dir migrations have 'to' field", () => {
    const allMigrations = getAllMigrations();
    const renames = allMigrations.filter(
      (m) => m.type === "rename" || m.type === "rename-dir",
    );
    for (const m of renames) {
      expect(
        m.to,
        `rename migration from '${m.from}' should have 'to'`,
      ).toBeDefined();
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
  // NOTE: v0.5.0-beta.8 added collectTemplates for opencode. Before that,
  // opencode was the only configured platform with no update tracking —
  // `trellis update` silently ignored .opencode/, so CLI-side changes to
  // opencode plugins / agents / package.json never reached installed projects.
  // That was a bug, not a design choice. This test used to assert the bug;
  // now it asserts the fix.
  it("[beta.8] collectPlatformTemplates returns Map for opencode (plugins + agents + lib + package.json + commands + skills)", () => {
    const result = collectPlatformTemplates("opencode");
    expect(result).toBeInstanceOf(Map);
    if (!result) throw new Error("unreachable");
    // Sanity: must include the three plugin files — the bug that prompted this
    // fix was a plugin-shape change that couldn't be delivered via `trellis update`.
    expect(result.has(".opencode/plugins/inject-subagent-context.js")).toBe(true);
    expect(result.has(".opencode/plugins/session-start.js")).toBe(true);
    expect(result.has(".opencode/plugins/inject-workflow-state.js")).toBe(true);
    // Plus agents, lib, package.json, at least one command, at least one skill
    expect(result.has(".opencode/agents/trellis-implement.md")).toBe(true);
    expect(result.has(".opencode/lib/trellis-context.js")).toBe(true);
    expect(result.has(".opencode/package.json")).toBe(true);
  });

  it("[beta.16] collectPlatformTemplates returns Map for platforms with tracking", () => {
    const withTracking = [
      "claude-code",
      "cursor",
      "opencode",
      "codex",
      "kilo",
      "kiro",
      "gemini",
      "antigravity",
      "windsurf",
      "qoder",
      "codebuddy",
      "copilot",
    ] as const;
    for (const id of withTracking) {
      const result = collectPlatformTemplates(id);
      expect(result, `${id} should have template tracking`).toBeInstanceOf(Map);
    }
  });
});

// dispatch agent removed — parallel/worktree now handled by platform-native features

// =============================================================================
// 4. Template Integrity Regressions
// =============================================================================

describe("regression: shell to Python migration (beta.0)", () => {
  it("[beta.0] no .sh scripts remain in trellis templates", () => {
    const scripts = getAllScripts();
    for (const [name] of scripts) {
      expect(name.endsWith(".sh"), `${name} should not end with .sh`).toBe(
        false,
      );
    }
  });

  it("[beta.0] all script keys end with .py", () => {
    const scripts = getAllScripts();
    for (const [name] of scripts) {
      expect(name.endsWith(".py"), `${name} should end with .py`).toBe(true);
    }
  });

  it("[beta.3] getAllScripts covers every .py file in templates/trellis/scripts/", () => {
    // Bug: update.ts had a hand-maintained file list that missed 11 scripts.
    // Fix: update.ts now uses getAllScripts() directly. This test ensures
    // getAllScripts() itself stays in sync with the filesystem.
    const scriptsDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/templates/trellis/scripts",
    );
    const fsFiles = new Set<string>();
    function walk(dir: string, prefix: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
        } else if (entry.name.endsWith(".py")) {
          fsFiles.add(`${prefix}${entry.name}`);
        }
      }
    }
    walk(scriptsDir, "");

    const scripts = getAllScripts();
    const registeredKeys = new Set(scripts.keys());

    // Known exclusions: files intentionally not in getAllScripts()
    const excluded = new Set(["hooks/linear_sync.py"]);

    for (const file of fsFiles) {
      if (excluded.has(file)) continue;
      expect(
        registeredKeys.has(file),
        `${file} exists on disk but is missing from getAllScripts()`,
      ).toBe(true);
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
    ];
    for (const entry of allHookEntries) {
      for (const hook of entry.hooks) {
        expect(hook.command).toContain("{{PYTHON_CMD}}");
        expect(hook.command).not.toMatch(/^python3?\s/);
      }
    }
  });

});

describe("regression: SessionStart reinject on clear/compact (MIN-231)", () => {
  it("[MIN-231] Claude SessionStart hooks cover startup, clear, and compact", () => {
    const settings = JSON.parse(claudeSettingsTemplate);
    const matchers = settings.hooks.SessionStart.map(
      (e: { matcher: string }) => e.matcher,
    );
    expect(matchers).toEqual(
      expect.arrayContaining(["startup", "clear", "compact"]),
    );
  });

  it("[MIN-231] all SessionStart matchers invoke session-start.py", () => {
    const settings = JSON.parse(claudeSettingsTemplate);
    for (const entry of settings.hooks.SessionStart) {
      expect(
        entry.hooks[0].command,
        `claude ${entry.matcher} should invoke session-start.py`,
      ).toContain("session-start.py");
    }
  });
});

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

  function setupTaskRepo(taskRef = ".trellis\\tasks\\issue-106"): void {
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Workflow\n");
    writeProjectFile(
      path.join(".trellis", "spec", "guides", "index.md"),
      "# Guides\n",
    );
    writeProjectFile(path.join(".trellis", ".current-task"), `${taskRef}\n`);
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "task.json"),
      JSON.stringify(
        {
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

  function runPython(relativeScriptPath: string, input?: string): string {
    const scriptPath = path.join(tmpDir, relativeScriptPath);
    return execSync(`${pythonCmd} ${JSON.stringify(scriptPath)}`, {
      cwd: tmpDir,
      input,
      encoding: "utf-8",
    });
  }

  function expectTemplateContent(
    content: string | undefined,
    label: string,
  ): string {
    expect(content, `${label} template should exist`).toBeTruthy();
    return content ?? "";
  }

  it("[current-task] task.py start canonicalizes Windows-style task refs before writing", () => {
    setupTaskRepo("");
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".trellis\\\\tasks\\\\issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
      },
    );

    expect(output).toContain(".trellis/tasks/issue-106");
    expect(
      fs.readFileSync(path.join(tmpDir, ".trellis", ".current-task"), "utf-8").trim(),
    ).toBe(".trellis/tasks/issue-106");
  });

  it("[current-task] Python session-start hooks resolve legacy backslash refs without stale pointer", () => {
    setupTaskRepo();

    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(claudeSessionStart, "claude session-start"),
    );
    writeProjectFile(
      path.join(".codex", "hooks", "session-start.py"),
      expectTemplateContent(codexSessionStart, "codex session-start"),
    );

    const claudeOutput = runPython(path.join(".claude", "hooks", "session-start.py"));
    const codexOutput = runPython(
      path.join(".codex", "hooks", "session-start.py"),
      JSON.stringify({ cwd: tmpDir }),
    );

    expect(claudeOutput).toContain("Status: READY");
    expect(claudeOutput).not.toContain("STALE POINTER");

    const codexPayload = JSON.parse(codexOutput) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(codexPayload.hookSpecificOutput.additionalContext).toContain(
      "Status: READY",
    );
    expect(codexPayload.hookSpecificOutput.additionalContext).not.toContain(
      "STALE POINTER",
    );
  });

  it("[workflow-v2] shared session-start READY guidance points to Phase 2.1, not mandatory before-dev", () => {
    setupTaskRepo();

    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(claudeSessionStart, "claude session-start"),
    );

    const rawOutput = runPython(path.join(".claude", "hooks", "session-start.py"));
    expect(rawOutput).toContain("Follow Phase 2.1 for your platform");
    expect(rawOutput).not.toContain(
      "Next-Action: Load skill `trellis-before-dev`",
    );
  });

  it("[current-task] OpenCode context layer normalizes backslash refs for downstream plugins", () => {
    setupTaskRepo();

    const ctx = new TrellisContext(tmpDir) as TrellisContext & {
      resolveTaskDir: (taskRef: string) => string | null;
    };

    expect(ctx.getCurrentTask()).toBe(".trellis/tasks/issue-106");
    expect(ctx.resolveTaskDir(".trellis\\tasks\\issue-106")).toBe(
      path.join(tmpDir, ".trellis", "tasks", "issue-106"),
    );
  });

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
    return runPython(
      path.join(".trellis", "hooks", "inject-workflow-state.py"),
      JSON.stringify({ cwd: cwdOverride ?? tmpDir }),
    );
  }

  it("[workflow-state] in_progress default hardcoded fallback works without workflow.md", () => {
    setupTaskRepo();
    writeWorkflowStateHook();
    // overwrite workflow.md with empty content (no tag blocks)
    writeWorkflowMd("# Empty\n");

    const output = runInjectWorkflowState();
    const parsed = JSON.parse(output) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Task: issue-106 (in_progress)",
    );
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "trellis-implement → trellis-check",
    );
  });

  it("[workflow-state] workflow.md tag overrides hardcoded fallback", () => {
    setupTaskRepo();
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

  it("[workflow-state] custom status with hyphen matches via regex", () => {
    setupTaskRepo();
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

  it("[workflow-state] no_task breadcrumb emitted when .current-task missing", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Empty\n");
    writeWorkflowStateHook();
    // no .current-task file → should emit no_task breadcrumb (not silent)
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
      const result = execSync(
        `${pythonCmd} ${JSON.stringify(hookPath)}`,
        {
          cwd: nonTrellisDir,
          input: JSON.stringify({ cwd: nonTrellisDir }),
          encoding: "utf-8",
        },
      );
      expect(result.trim()).toBe("");
    } finally {
      fs.rmSync(nonTrellisDir, { recursive: true, force: true });
    }
  });

  // ------------------------------------------------------------
  // Legacy current_phase / next_action field removal (FP round 3 cleanup)
  // ------------------------------------------------------------

  it("[workflow-v2] task.py create does NOT write legacy current_phase / next_action fields", () => {
    setupTaskRepo("");
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "dummy task" --slug dummy-task --assignee test-dev`,
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
    setupTaskRepo("");
    // setupTaskRepo does not create any .{platform}/ dir → agent-less mode
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "plain task" --slug plain-task --assignee test-dev`,
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

  it("[init-context-removal] task.py create seeds jsonl when a sub-agent platform dir exists", () => {
    setupTaskRepo("");
    // Simulate a Claude Code install
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "seeded task" --slug seeded-task --assignee test-dev`,
      { cwd: tmpDir, encoding: "utf-8" },
    );
    const tasksDir = path.join(tmpDir, ".trellis", "tasks");
    const newDirs = fs
      .readdirSync(tasksDir)
      .filter((d) => d.includes("seeded-task"));
    expect(newDirs.length).toBeGreaterThan(0);
    const taskDir = path.join(tasksDir, newDirs[0]);

    for (const jsonlName of ["implement.jsonl", "check.jsonl"]) {
      const jsonlPath = path.join(taskDir, jsonlName);
      expect(fs.existsSync(jsonlPath), `${jsonlName} should exist`).toBe(true);
      const content = fs.readFileSync(jsonlPath, "utf-8").trim();
      // One line of self-describing seed with `_example` and no `file` field.
      const lines = content.split("\n");
      expect(lines.length).toBe(1);
      const row = JSON.parse(lines[0]) as Record<string, unknown>;
      expect(row._example).toBeDefined();
      expect(row.file).toBeUndefined();
    }
  });

  it("[init-context-removal] task.py init-context is deprecated with clear pointer to Phase 1.3", () => {
    setupTaskRepo("");
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
    expect(stderr).toContain("Phase 1.3");
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

  it("[init-context-removal] task.py validate treats seed-only jsonl as 0 errors", () => {
    setupTaskRepo("");
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "seed-only" --slug seed-only-task --assignee test-dev`,
      { cwd: tmpDir, encoding: "utf-8" },
    );
    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".trellis", "tasks"))
      .find((d) => d.includes("seed-only-task"));
    expect(taskDir).toBeDefined();
    const relTaskDir = path.posix.join(".trellis", "tasks", taskDir as string);

    const result = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} validate ${relTaskDir}`,
      { cwd: tmpDir, encoding: "utf-8" },
    );
    // Exit 0 (no error raised) plus success marker in output.
    expect(result).toContain("All validations passed");
  });

  it("[init-context-removal] task.py list-context prints 'no curated entries yet' for seed-only jsonl", () => {
    setupTaskRepo("");
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "seed-list" --slug seed-list-task --assignee test-dev`,
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

  it("[workflow-v2] get_context.py --mode phase returns Phase Index + Phase 1/2/3 step bodies", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
    writeProjectFile(path.join(".trellis", "workflow.md"), templateWorkflowMd());

    const contextScript = path.join(tmpDir, ".trellis", "scripts", "get_context.py");
    const output = execSync(
      `${pythonCmd} ${JSON.stringify(contextScript)} --mode phase`,
      { cwd: tmpDir, encoding: "utf-8" },
    );

    // Phase Index section always present
    expect(output).toContain("## Phase Index");
    // Phase 1/2/3 bodies now inlined (the expansion)
    expect(output).toContain("## Phase 1: Plan");
    expect(output).toContain("#### 1.1 Requirement exploration");
    expect(output).toContain("## Phase 2: Execute");
    expect(output).toContain("#### 2.1 Implement");
    expect(output).toContain("## Phase 3: Finish");
    expect(output).toContain("#### 3.3 Spec update");
    // Stops at Workflow State Breadcrumbs (consumed by UserPromptSubmit hook)
    expect(output).not.toContain("## Workflow State Breadcrumbs");
  });

  it("[workflow-v2] --mode phase --platform codex filters out generic before-dev routing", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
    writeProjectFile(path.join(".trellis", "workflow.md"), templateWorkflowMd());

    const contextScript = path.join(tmpDir, ".trellis", "scripts", "get_context.py");
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

  it("[workflow-v2] step 2.1 for codex describes self-loaded agent context, not hook injection", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
    writeProjectFile(path.join(".trellis", "workflow.md"), templateWorkflowMd());

    const contextScript = path.join(tmpDir, ".trellis", "scripts", "get_context.py");
    const output = execSync(
      `${pythonCmd} ${JSON.stringify(contextScript)} --mode phase --step 2.1 --platform codex`,
      { cwd: tmpDir, encoding: "utf-8" },
    );

    expect(output).toContain("The Codex sub-agent definition auto-handles");
    expect(output).toContain("Reads `.trellis/.current-task`, `prd.md`, and `info.md`");
    expect(output).not.toContain("The platform hook/plugin auto-handles");
    expect(output).not.toContain("Load the `trellis-before-dev` skill");
  });

  it("[workflow-v2] --mode phase --platform kilo keeps trellis-before-dev routing (agent-less path)", () => {
    // Symmetric to the codex filter test: agent-less platforms MUST still
    // see `trellis-before-dev` because they write code in the main session.
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
    writeProjectFile(path.join(".trellis", "workflow.md"), templateWorkflowMd());

    const contextScript = path.join(tmpDir, ".trellis", "scripts", "get_context.py");
    const output = execSync(
      `${pythonCmd} ${JSON.stringify(contextScript)} --mode phase --platform kilo`,
      { cwd: tmpDir, encoding: "utf-8" },
    );

    expect(output).toContain("`trellis-before-dev`");
    expect(output).not.toContain("Dispatch the `trellis-implement` sub-agent");
  });

  // ------------------------------------------------------------
  // session-start.py <workflow> + <guidelines> block restructure
  // ------------------------------------------------------------

  it("[workflow-v2] session-start.py <workflow> block contains Phase 1/2/3 step bodies", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
    writeProjectFile(path.join(".trellis", "workflow.md"), templateWorkflowMd());
    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(claudeSessionStart, "shared session-start"),
    );

    const rawOutput = runPython(path.join(".claude", "hooks", "session-start.py"));
    const payload = JSON.parse(rawOutput) as {
      hookSpecificOutput: { additionalContext: string };
    };
    const ctx = payload.hookSpecificOutput.additionalContext;

    const workflowMatch = /<workflow>([\s\S]*?)<\/workflow>/.exec(ctx);
    if (!workflowMatch) throw new Error("workflow block not found in payload");
    const workflowBlock = workflowMatch[1];

    // Step bodies inlined (not just TOC)
    expect(workflowBlock).toContain("## Phase 1: Plan");
    expect(workflowBlock).toContain("#### 1.1 Requirement exploration");
    expect(workflowBlock).toContain("#### 2.1 Implement");
    expect(workflowBlock).toContain("#### 3.3 Spec update");
    // Breadcrumbs BODY excluded (different hook consumes the tag blocks);
    // the TOC line "## Workflow State Breadcrumbs" is fine, but the tag
    // blocks themselves must NOT appear here.
    expect(workflowBlock).not.toContain("[workflow-state:planning]");
    expect(workflowBlock).not.toContain("[workflow-state:in_progress]");
  });

  it("[workflow-v2] session-start.py <guidelines> block lists spec paths, not inlined content", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
    writeProjectFile(path.join(".trellis", "workflow.md"), templateWorkflowMd());
    // Guides — must be inlined
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

    const rawOutput = runPython(path.join(".claude", "hooks", "session-start.py"));
    const payload = JSON.parse(rawOutput) as {
      hookSpecificOutput: { additionalContext: string };
    };
    const ctx = payload.hookSpecificOutput.additionalContext;

    const guidelinesMatch = /<guidelines>([\s\S]*?)<\/guidelines>/.exec(ctx);
    if (!guidelinesMatch)
      throw new Error("guidelines block not found in payload");
    const guidelinesBlock = guidelinesMatch[1];

    // guides/index.md stays inlined (cross-package thinking guides)
    expect(guidelinesBlock).toContain("GUIDES_INLINE_MARKER");
    // Other package index listed as path, content NOT inlined
    expect(guidelinesBlock).toContain(".trellis/spec/cli/backend/index.md");
    expect(guidelinesBlock).not.toContain("BACKEND_INDEX_CONTENT_SHOULD_NOT_APPEAR");
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
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Minimal\n");
    // Active task WITHOUT current_phase field (post-migration state)
    writeProjectFile(path.join(".trellis", ".current-task"), ".trellis/tasks/issue-106\n");
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "task.json"),
      JSON.stringify(
        {
          id: "issue-106",
          title: "Issue 106",
          status: "in_progress",
          package: null,
        },
        null,
        2,
      ),
    );
    writeProjectFile(path.join(".trellis", "tasks", "issue-106", "prd.md"), "# PRD\n");
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
    });
    runPython(path.join(".claude", "hooks", "inject-subagent-context.py"), input);

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
});

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

  it("[windsurf] Windsurf platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("windsurf");
    expect(AI_TOOLS.windsurf.configDir).toBe(".windsurf/workflows");
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

  it("[windsurf] cli_adapter.py supports windsurf platform", () => {
    expect(commonCliAdapter).toContain('"windsurf"');
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
    expect(commonCliAdapter).toMatch(
      /entry\.name\.startswith\("trellis-"\)/,
    );
  });

  // v0.5.0-beta.12 removed `task.py init-context` — Phase 1.3 is now
  // agent-curated. The subparser, cmd_init_context, and get_check_context
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
    expect(taskScript as string).toContain("Phase 1.3");
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

  it("[init-context-removal] task_store.cmd_create seeds jsonl for sub-agent platforms", () => {
    const taskStore = getAllScripts().get("common/task_store.py");
    expect(taskStore).toBeDefined();
    // Sub-agent platform probe.
    expect(taskStore as string).toMatch(/_SUBAGENT_CONFIG_DIRS/);
    expect(taskStore as string).toContain('".claude"');
    expect(taskStore as string).toContain('".codex"');
    expect(taskStore as string).toContain('".github/copilot"');
    // Seed row is self-describing and has no `file` field (so consumers skip
    // it naturally).
    expect(taskStore as string).toMatch(/_write_seed_jsonl/);
    expect(taskStore as string).toContain('"_example"');
    // cmd_create calls into the seed path.
    expect(taskStore as string).toMatch(/_has_subagent_platform\(repo_root\)/);
  });

  // Regression for 04-22-migrate-flow-bugs Bug C: breaking releases must
  // ship a migrationGuide. Otherwise `update --migrate` generates a task
  // PRD filled with older versions' guides (or no task at all), leaving
  // users to migrate blind. Historical miss: 0.5.0-beta.0 — 206 migrations,
  // zero migrationGuide.
  it("[migrate-flow-bugs] 0.5.0-beta.0 manifest has migrationGuide + aiInstructions (back-filled)", () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(
          path.resolve(__dirname, ".."),
          "src/migrations/manifests/0.5.0-beta.0.json",
        ),
        "utf-8",
      ),
    );
    expect(manifest.breaking).toBe(true);
    expect(manifest.recommendMigrate).toBe(true);
    expect(typeof manifest.migrationGuide).toBe("string");
    expect(manifest.migrationGuide.length).toBeGreaterThan(500);
    expect(typeof manifest.aiInstructions).toBe("string");
    expect(manifest.aiInstructions.length).toBeGreaterThan(200);
    // Sanity: guide references the actual 0.5 breaking themes
    expect(manifest.migrationGuide).toMatch(/trellis-/); // skill renames
    expect(manifest.migrationGuide).toMatch(/record-session|finish-work/);
  });

  it("[migrate-flow-bugs] all breaking+recommendMigrate manifests include migrationGuide", () => {
    // Enforce going forward: every historical manifest where both
    // breaking=true AND recommendMigrate=true must have a non-empty
    // migrationGuide. create-manifest.js also rejects new ones without it.
    const manifestsDir = path.join(
      path.resolve(__dirname, ".."),
      "src/migrations/manifests",
    );
    const files = fs
      .readdirSync(manifestsDir)
      .filter((f) => f.endsWith(".json"));
    const offenders: string[] = [];
    for (const file of files) {
      const m = JSON.parse(
        fs.readFileSync(path.join(manifestsDir, file), "utf-8"),
      );
      if (m.breaking && m.recommendMigrate && !m.migrationGuide) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("[init-context-removal] platform-specific start templates no longer reference init-context", () => {
    // v0.5.0-beta.12 removed `task.py init-context`. Platform start templates
    // were updated to describe agent-curated Phase 1.3 instead. They must not
    // reference the deleted subcommand.
    const pkgRoot = path.resolve(__dirname, "..");
    const codexStart = fs.readFileSync(
      path.join(pkgRoot, "src/templates/codex/skills/start/SKILL.md"),
      "utf-8",
    );
    expect(codexStart).not.toContain("task.py init-context");

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
    expect(commonCliAdapter).toContain(".windsurf");
    expect(commonCliAdapter).toContain(".qoder");
    expect(commonCliAdapter).toContain(".codebuddy");
    expect(commonCliAdapter).toContain(".github/copilot");
    expect(commonCliAdapter).toContain(".factory");
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

describe("regression: prerelease→stable version stamp (rc.6→0.3.0)", () => {
  it("[0.3.0] rc→stable upgrade returns no migrations (all already applied)", () => {
    const migrations = getMigrationsForVersion("0.3.0-rc.6", "0.3.0");
    expect(migrations).toEqual([]);
  });

  it("[0.3.0] 0.3.0 manifest exists and is well-formed", () => {
    const versions = getAllMigrationVersions();
    expect(versions).toContain("0.3.0");
  });

  it("[0.3.0] prerelease sorts before stable in version ordering", () => {
    const versions = getAllMigrationVersions();
    const rcIdx = versions.indexOf("0.3.0-rc.6");
    const stableIdx = versions.indexOf("0.3.0");
    expect(rcIdx).not.toBe(-1);
    expect(stableIdx).not.toBe(-1);
    expect(rcIdx).toBeLessThan(stableIdx);
  });
});

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
        expect(
          idx,
          `${knownOrder[i]} should come after ${knownOrder[i - 1]}`,
        ).toBeGreaterThan(prevIdx);
      }
    }
  });

  it("[beta.0] shell-to-python migration uses only renames (no deletes)", () => {
    const migrations = getMigrationsForVersion("0.2.15", "0.3.0-beta.0");
    const renames = migrations.filter((m) => m.type === "rename");
    const deletes = migrations.filter((m) => m.type === "delete");
    expect(renames.length).toBeGreaterThan(0);
    expect(deletes.length).toBe(0);
  });

  it("[#57] shell archive migrations use rename type with correct from/to paths", () => {
    const migrations = getMigrationsForVersion("0.2.15", "0.3.0-beta.0");
    const shellArchives = migrations.filter(
      (m) => m.to?.includes("scripts-shell-archive"),
    );
    // 19 shell scripts should be archived
    expect(shellArchives.length).toBe(19);
    for (const m of shellArchives) {
      expect(m.type).toBe("rename");
      expect(m.from).toMatch(/\.trellis\/scripts\/.*\.sh$/);
      expect(m.to).toMatch(/\.trellis\/scripts-shell-archive\/.*\.sh$/);
      // The filename should be preserved
      const fromFile = m.from.split("/").pop();
      const toFile = (m.to as string).split("/").pop();
      expect(toFile).toBe(fromFile);
    }
  });

  it("[#57] shell archive covers all three subdirectories", () => {
    const migrations = getMigrationsForVersion("0.2.15", "0.3.0-beta.0");
    const shellArchives = migrations.filter(
      (m) => m.to?.includes("scripts-shell-archive"),
    );
    const topLevel = shellArchives.filter(
      (m) => !m.from.includes("/common/") && !m.from.includes("/multi-agent/"),
    );
    const common = shellArchives.filter((m) => m.from.includes("/common/"));
    const multiAgent = shellArchives.filter((m) =>
      m.from.includes("/multi-agent/"),
    );
    expect(topLevel.length).toBe(6);
    expect(common.length).toBe(8);
    expect(multiAgent.length).toBe(5);
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

  // v0.5.0-beta.0: 5 user-facing commands became auto-triggered skills across all platforms.
  // Manifest must contain 13 source layers × 5 commands = 65 rename entries so upgraders
  // don't end up with old command files alongside new skill files.
  describe("[0.5.0-beta.0] command→skill rename coverage", () => {
    const COMMANDS = [
      "before-dev",
      "brainstorm",
      "break-loop",
      "check",
      "update-spec",
    ] as const;

    type PathFn = (name: string) => string;
    const PLATFORMS: { id: string; from: PathFn; to: PathFn }[] = [
      { id: "claude",      from: (n) => `.claude/commands/trellis/${n}.md`,     to: (n) => `.claude/skills/trellis-${n}/SKILL.md` },
      { id: "cursor",      from: (n) => `.cursor/commands/trellis-${n}.md`,     to: (n) => `.cursor/skills/trellis-${n}/SKILL.md` },
      { id: "opencode",    from: (n) => `.opencode/commands/trellis/${n}.md`,   to: (n) => `.opencode/skills/trellis-${n}/SKILL.md` },
      { id: "codebuddy",   from: (n) => `.codebuddy/commands/trellis/${n}.md`,  to: (n) => `.codebuddy/skills/trellis-${n}/SKILL.md` },
      { id: "droid",       from: (n) => `.factory/commands/trellis/${n}.md`,    to: (n) => `.factory/skills/trellis-${n}/SKILL.md` },
      { id: "gemini",      from: (n) => `.gemini/commands/trellis/${n}.toml`,   to: (n) => `.gemini/skills/trellis-${n}/SKILL.md` },
      { id: "copilot",     from: (n) => `.github/prompts/${n}.prompt.md`,       to: (n) => `.github/skills/trellis-${n}/SKILL.md` },
      { id: "kilo",        from: (n) => `.kilocode/workflows/${n}.md`,          to: (n) => `.kilocode/skills/trellis-${n}/SKILL.md` },
      { id: "antigravity", from: (n) => `.agent/workflows/${n}.md`,             to: (n) => `.agent/skills/trellis-${n}/SKILL.md` },
      { id: "windsurf",    from: (n) => `.windsurf/workflows/trellis-${n}.md`,  to: (n) => `.windsurf/skills/trellis-${n}/SKILL.md` },
      { id: "kiro",        from: (n) => `.kiro/skills/${n}/SKILL.md`,           to: (n) => `.kiro/skills/trellis-${n}/SKILL.md` },
      { id: "qoder",       from: (n) => `.qoder/skills/${n}/SKILL.md`,          to: (n) => `.qoder/skills/trellis-${n}/SKILL.md` },
      { id: "shared",      from: (n) => `.agents/skills/${n}/SKILL.md`,         to: (n) => `.agents/skills/trellis-${n}/SKILL.md` },
    ];

    it("has at least 65 rename entries for command→skill (13 platforms × 5 commands)", () => {
      const migrations = getMigrationsForVersion("0.4.0", "0.5.0-beta.0");
      const renames = migrations.filter((m) => m.type === "rename");
      // >= because additional non-command→skill renames may exist (e.g. finish-work
      // relocation under trellis- namespace on skill-only platforms).
      expect(renames.length).toBeGreaterThanOrEqual(
        PLATFORMS.length * COMMANDS.length,
      );
    });

    it("every platform × command pair has a matching rename entry", () => {
      const migrations = getMigrationsForVersion("0.4.0", "0.5.0-beta.0");
      const renames = migrations.filter((m) => m.type === "rename");
      const index = new Map(renames.map((m) => [m.from, m.to]));

      for (const p of PLATFORMS) {
        for (const c of COMMANDS) {
          const expectedFrom = p.from(c);
          const expectedTo = p.to(c);
          expect(index.has(expectedFrom), `missing rename for ${p.id}:${c} (${expectedFrom})`).toBe(true);
          expect(index.get(expectedFrom)).toBe(expectedTo);
        }
      }
    });

    it("breaking + recommendMigrate flags are both set (drives gate)", () => {
      // The update.ts breaking-change gate only fires when BOTH flags are true.
      // If either gets dropped accidentally, users upgrading from 0.4.x can half-migrate
      // by running `trellis update` without `--migrate`.
      const manifestPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../src/migrations/manifests/0.5.0-beta.0.json",
      );
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
        breaking?: boolean;
        recommendMigrate?: boolean;
      };
      expect(manifest.breaking).toBe(true);
      expect(manifest.recommendMigrate).toBe(true);
    });
  });
});

// =============================================================================
// 7. collectTemplates Path Consistency
// =============================================================================

describe("regression: collectTemplates paths match init directory structure (0.3.1)", () => {
  it("[0.3.1] all platforms with commands use consistent trellis/ subdirectory", () => {
    const platformsWithCommands = ["claude-code", "gemini"] as const;
    for (const id of platformsWithCommands) {
      const templates = collectPlatformTemplates(id);
      if (!templates) continue;
      const commandKeys = [...templates.keys()].filter(
        (k) => k.includes("/commands/"),
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
        key.startsWith(".kilocode/workflows/") || key.startsWith(".kilocode/skills/"),
        `kilo path should use workflows/ or skills/: ${key}`,
      ).toBe(true);
    }
  });

  it("[windsurf] windsurf uses workflows/ instead of commands/trellis/", () => {
    const templates = collectPlatformTemplates("windsurf");
    expect(templates).toBeInstanceOf(Map);
    if (!templates) return;
    const keys = [...templates.keys()];
    for (const key of keys) {
      expect(
        key.startsWith(".windsurf/workflows/") || key.startsWith(".windsurf/skills/"),
        `windsurf path should use workflows/ or skills/: ${key}`,
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
});

// =============================================================================
// YAML Quote Stripping (0.3.8)
// =============================================================================

describe("regression: parse_simple_yaml uses _unquote not greedy strip (0.3.8)", () => {
  it("config.py defines _unquote helper", () => {
    expect(commonConfig).toContain("def _unquote(s: str) -> str:");
  });

  it("config.py uses _unquote for list items, not .strip('\"')", () => {
    // The bug: .strip('"').strip("'") greedily eats nested quotes
    // e.g. "echo 'hello'" -> strip("'") -> echo 'hello (broken!)
    expect(commonConfig).not.toContain(".strip('\"').strip(\"'\")");
    expect(commonConfig).toContain("_unquote(stripped[2:].strip())");
  });

  it("config.py uses _unquote for key-value, not .strip('\"')", () => {
    expect(commonConfig).toContain("_unquote(value.strip())");
  });
});

describe("regression: parse_simple_yaml Python execution (0.3.8)", () => {
  // Extract _unquote + _parse_yaml_block + _next_content_line + parse_simple_yaml
  // from commonConfig and run them in an isolated Python process.
  // We can't import config.py directly because it has `from .paths import ...`
  let tmpDir: string;
  let extractedPy: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-yaml-py-"));
    // Extract _unquote + parse_simple_yaml + _parse_yaml_block + _next_content_line
    // These 4 functions have no external imports — safe to run standalone.
    const fnStart = commonConfig.indexOf("def _unquote(");
    const fnEnd = commonConfig.indexOf("\n# Defaults");
    extractedPy = commonConfig.substring(fnStart, fnEnd);
    fs.writeFileSync(path.join(tmpDir, "yaml_parser.py"), extractedPy);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Run parse_simple_yaml via Python subprocess and return parsed result */
  function runPythonYaml(yamlContent: string): unknown {
    const scriptFile = path.join(tmpDir, "_test.py");
    const script = [
      "import sys, json",
      `sys.path.insert(0, ${JSON.stringify(tmpDir)})`,
      "from yaml_parser import parse_simple_yaml",
      `result = parse_simple_yaml(${JSON.stringify(yamlContent)})`,
      "print(json.dumps(result))",
    ].join("\n");
    fs.writeFileSync(scriptFile, script);
    const out = execSync(`python3 ${JSON.stringify(scriptFile)}`, {
      encoding: "utf-8",
    });
    return JSON.parse(out.trim());
  }

  it("nested single quotes inside double quotes are preserved", () => {
    const result = runPythonYaml('key: "echo \'hello\'"');
    expect(result).toEqual({ key: "echo 'hello'" });
  });

  it("nested double quotes inside single quotes are preserved", () => {
    const result = runPythonYaml("key: 'say \"hi\"'");
    expect(result).toEqual({ key: 'say "hi"' });
  });

  it("list items with nested quotes are preserved", () => {
    const result = runPythonYaml(
      'hooks:\n  after_create:\n    - "echo \'Task created\'"',
    );
    expect(result).toEqual({
      hooks: { after_create: ["echo 'Task created'"] },
    });
  });

  it("simple quoted values work", () => {
    const result = runPythonYaml('a: "hello"\nb: \'world\'');
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
  // Class 2: gemini, qoder, codex, copilot — hooks can't reliably inject
  // sub-agent prompts, so sub-agents Read jsonl/prd themselves.
  // implement/check get the pull-based prelude; research does not (it
  // searches the spec tree and has no task-level context dependency).
  const class2 = [
    {
      id: "qoder" as const,
      hooksDir: ".qoder/hooks",
      preludeAgents: [".qoder/agents/trellis-implement.md", ".qoder/agents/trellis-check.md"],
      nonPreludeAgents: [".qoder/agents/trellis-research.md"],
    },
    {
      id: "gemini" as const,
      hooksDir: ".gemini/hooks",
      preludeAgents: [".gemini/agents/trellis-implement.md", ".gemini/agents/trellis-check.md"],
      nonPreludeAgents: [".gemini/agents/trellis-research.md"],
    },
    {
      id: "codex" as const,
      hooksDir: ".codex/hooks",
      preludeAgents: [
        ".codex/agents/trellis-implement.toml",
        ".codex/agents/trellis-check.toml",
      ],
      nonPreludeAgents: [".codex/agents/trellis-research.toml"],
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
          expect(content).toContain(".trellis/.current-task");
        }
      });

      it("research definition does NOT contain pull-based prelude", () => {
        // research is orthogonal: it searches .trellis/spec/ and doesn't
        // depend on an active task. Prelude would make it fail when Phase 1.2
        // runs before Phase 1.3's jsonl curation.
        for (const file of nonPreludeAgents) {
          const content = fs.readFileSync(path.join(tmpDir, file), "utf-8");
          expect(content).not.toContain("Required: Load Trellis Context First");
        }
      });

      it("hook config does not reference inject-subagent-context.py", () => {
        const configPaths = [
          ".qoder/settings.json",
          ".gemini/settings.json",
          ".codex/hooks.json",
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
    "packages/cli/src/templates/gemini/agents/trellis-research.md",
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

  it("codex research.toml uses workspace-write sandbox and persist instruction", () => {
    const content = fs.readFileSync(
      path.join(repoRoot, "packages/cli/src/templates/codex/agents/trellis-research.toml"),
      "utf-8",
    );
    expect(content).toMatch(/sandbox_mode\s*=\s*"workspace-write"/);
    expect(content).toContain("{TASK_DIR}/research/");
    expect(content).toMatch(/persist|Persist/);
  });

  it("kiro research.json includes write tool and persist instruction", () => {
    const content = fs.readFileSync(
      path.join(repoRoot, "packages/cli/src/templates/kiro/agents/trellis-research.json"),
      "utf-8",
    );
    const data = JSON.parse(content) as {
      tools: string[];
      instructions: string;
    };
    expect(data.tools).toContain("write");
    expect(data.instructions).toContain("{TASK_DIR}/research/");
    expect(data.instructions).toMatch(/PERSIST|persist/);
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

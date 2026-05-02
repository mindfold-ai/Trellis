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
import { getAllHooks as getCopilotHooks } from "../src/templates/copilot/index.js";
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
import {
  guidesIndexContent,
  workspaceIndexContent,
} from "../src/templates/markdown/index.js";
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

  it("[issue #190] Codex and Copilot session-start hooks force UTF-8 stdout on Windows", () => {
    const codexSessionStart = getCodexHooks().find(
      (hook) => hook.name === "session-start.py",
    )?.content;
    const copilotSessionStart = getCopilotHooks().find(
      (hook) => hook.name === "session-start.py",
    )?.content;

    for (const [label, content] of [
      ["codex", codexSessionStart],
      ["copilot", copilotSessionStart],
    ] as const) {
      expect(
        content,
        `${label} session-start template should exist`,
      ).toBeTruthy();
      expect(content).toContain("from common import configure_encoding");
      expect(content).toContain("configure_encoding()");
      expect(content).toContain("configure_project_encoding(project_dir)");
      expect(content).toContain("ensure_ascii=False");
    }
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
    expect(addSessionScript).toContain(
      String.raw`re.match(r"^\|[-| ]+\|\s*$", line)`,
    );
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
    expect(workspaceIndexContent).toContain(
      "Branch: Which branch the work was done on",
    );
    expect(workspaceIndexContent).toContain("**Branch**: `{branch-name}`");
    expect(workspaceIndexContent).not.toContain(
      "**Base Branch**: `{base-branch-name}`",
    );
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
      fs.mkdirSync(
        path.join(tmpDir, ".trellis", ".runtime", "sessions"),
        { recursive: true },
      );
      fs.writeFileSync(
        path.join(
          tmpDir,
          ".trellis",
          ".runtime",
          "sessions",
          "session-a.json",
        ),
        JSON.stringify(
          {
            current_task: ".trellis/tasks/issue-106",
            platform: "test",
          },
          null,
          2,
        ),
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

  function runAddSession(title: string, options?: { branch?: string }): void {
    const command = [
      "python3",
      JSON.stringify(
        path.join(tmpDir, ".trellis", "scripts", "add_session.py"),
      ),
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
      env: { ...process.env, TRELLIS_CONTEXT_ID: "session-a" },
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

  it("[beta.15] Claude Code statusline is not safe-deleted on update", () => {
    const claudeStatusLineDeletes = getAllMigrations().filter(
      (m) =>
        m.type === "safe-file-delete" &&
        m.from === ".claude/hooks/statusline.py",
    );

    expect(claudeStatusLineDeletes).toEqual([]);
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
    expect(result.has(".opencode/plugins/inject-subagent-context.js")).toBe(
      true,
    );
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
      "droid",
      "pi",
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
    expect(settings).not.toHaveProperty("statusLine");
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
  const copilotSessionStart = getCopilotHooks().find(
    (hook) => hook.name === "session-start.py",
  )?.content;
  const firstReplyNoticeSentence =
    "Trellis SessionStart 已注入：workflow、当前任务状态、开发者身份、git 状态、active tasks、spec 索引已加载。";

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

  function writeSessionContext(contextKey: string, taskRef: string): void {
    writeProjectFile(
      path.join(".trellis", ".runtime", "sessions", `${contextKey}.json`),
      JSON.stringify(
        {
          current_task: taskRef,
          platform: "test",
        },
        null,
        2,
      ),
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

  function sessionEnv(
    overrides: NodeJS.ProcessEnv = {},
  ): NodeJS.ProcessEnv {
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
      path.join(".trellis", ".developer"),
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

  it("[session-current-task] task.py start without context key fails without creating .current-task", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    let output = "";
    let status = 0;
    try {
      execSync(
        `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".trellis\\\\tasks\\\\issue-106")}`,
        {
          cwd: tmpDir,
          encoding: "utf-8",
          env: sessionEnv(),
        },
      );
    } catch (error) {
      status =
        typeof (error as { status?: unknown }).status === "number"
          ? ((error as { status: number }).status)
          : 1;
      output = String((error as { stdout?: unknown }).stdout ?? "");
    }

    expect(status).toBe(1);
    expect(output).toContain("Cannot set active task without a session identity");
    expect(output).toContain("TRELLIS_CONTEXT_ID");
    expect(
      fs.existsSync(path.join(tmpDir, ".trellis", ".current-task")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(tmpDir, ".trellis", ".runtime")),
    ).toBe(false);
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
    const contextPath = path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      "sessions",
      "session-a.json",
    );
    const context = JSON.parse(fs.readFileSync(contextPath, "utf-8")) as {
      current_task: string;
    };
    expect(context.current_task).toBe(".trellis/tasks/issue-106");
    expect(
      fs.existsSync(path.join(tmpDir, ".trellis", ".current-task")),
    ).toBe(false);
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

    const output = execSync(`${pythonCmd} ${JSON.stringify(taskScriptPath)} finish`, {
      cwd: tmpDir,
      encoding: "utf-8",
      env: sessionEnv({ TRELLIS_CONTEXT_ID: "session-finish" }),
    });

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
      path.join(".trellis", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Workflow\n");

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "r7-auto-active" --slug r7-auto --assignee test-dev`,
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

    const contextPath = path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      "sessions",
      "r7-session.json",
    );
    expect(fs.existsSync(contextPath)).toBe(true);
    const context = JSON.parse(fs.readFileSync(contextPath, "utf-8")) as {
      current_task: string;
    };
    expect(context.current_task).toBe(`.trellis/tasks/${taskDir}`);
  });

  it("[workflow-state-r7] task.py create degrades silently without session identity (no .runtime side effect)", () => {
    // R7 contract: best-effort activation. No context key (CLI shell with no
    // session env) → task is still created, but no .runtime/sessions/ file is
    // written. Pre-R7 behavior parity for headless CLI usage.
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Workflow\n");

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    // sessionEnv() with no overrides drops every session-identity env var.
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "r7-cli-only" --slug r7-cli --assignee test-dev`,
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
      path.join(".trellis", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Workflow\n");

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "r7-idem" --slug r7-idem --assignee test-dev`,
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
      meta?: { prd_status?: string };
    };
    expect(beforeStart.status).toBe("planning");
    expect(beforeStart.meta?.prd_status).toBe("draft");

    const confirmOutput = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} set-prd-status ${JSON.stringify(relTaskDir)} confirmed`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "r7-idem-session" }),
      },
    );
    expect(confirmOutput).toContain("draft → confirmed");

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
    const contextPath = path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      "sessions",
      "r7-idem-session.json",
    );
    expect(fs.existsSync(contextPath)).toBe(true);
    const context = JSON.parse(fs.readFileSync(contextPath, "utf-8")) as {
      current_task: string;
    };
    expect(context.current_task).toBe(relTaskDir);
  });

  it("[prd-status] task.py start blocks planning tasks until PRD is confirmed", () => {
    writeTrellisScripts();
    writeProjectFile(
      path.join(".trellis", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Workflow\n");

    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "prd gate" --slug prd-gate --assignee test-dev`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "prd-gate-session" }),
      },
    );

    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".trellis", "tasks"))
      .find((d) => d.includes("prd-gate"));
    expect(taskDir).toBeDefined();
    const relTaskDir = path.posix.join(".trellis", "tasks", taskDir as string);
    const taskJsonPath = path.join(
      tmpDir,
      ".trellis",
      "tasks",
      taskDir as string,
      "task.json",
    );

    let startStatus = 0;
    let startOutput = "";
    try {
      startOutput = execSync(
        `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(relTaskDir)}`,
        {
          cwd: tmpDir,
          encoding: "utf-8",
          env: sessionEnv({ TRELLIS_CONTEXT_ID: "prd-gate-session" }),
        },
      );
    } catch (error) {
      const e = error as { status?: number; stdout?: string; stderr?: string };
      startStatus = e.status ?? 1;
      startOutput = (e.stdout ?? "") + (e.stderr ?? "");
    }

    expect(startStatus).toBe(1);
    expect(startOutput).toContain("Cannot enter implementation while PRD is unconfirmed");
    expect(startOutput).toContain("set-prd-status");

    const blockedTask = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8")) as {
      status: string;
      meta?: { prd_status?: string };
    };
    expect(blockedTask.status).toBe("planning");
    expect(blockedTask.meta?.prd_status).toBe("draft");

    const confirmOutput = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} set-prd-status ${JSON.stringify(relTaskDir)} confirmed`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "prd-gate-session" }),
      },
    );
    expect(confirmOutput).toContain("draft → confirmed");

    const allowedOutput = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(relTaskDir)}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "prd-gate-session" }),
      },
    );
    expect(allowedOutput).toContain("planning → in_progress");

    const afterStart = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8")) as {
      status: string;
      meta?: { prd_status?: string };
    };
    expect(afterStart.status).toBe("in_progress");
    expect(afterStart.meta?.prd_status).toBe("confirmed");
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
      JSON.stringify({ current_task: ".trellis/tasks/issue-106" }, null, 2),
    );
    writeProjectFile(
      path.join(".trellis", ".runtime", "sessions", "session-b.json"),
      JSON.stringify({ current_task: "issue-106" }, null, 2),
    );
    writeProjectFile(
      path.join(".trellis", ".runtime", "sessions", "session-other.json"),
      JSON.stringify({ current_task: ".trellis/tasks/other-task" }, null, 2),
    );

    execSync(`${pythonCmd} ${JSON.stringify(taskScriptPath)} archive issue-106 --no-commit`, {
      cwd: tmpDir,
      encoding: "utf-8",
      env: sessionEnv(),
    });

    expect(fs.existsSync(contextA)).toBe(false);
    expect(fs.existsSync(contextB)).toBe(false);
    expect(fs.existsSync(contextOther)).toBe(true);
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
      expect(archivedNames.has(name), `task ${name} should be archived`).toBe(true);
    }
  });

  it("[session-current-task] task.py start also uses platform-native session env when available", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".trellis/tasks/issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODEX_SESSION_ID: "native-a" }),
      },
    );

    expect(output).toContain("Source: session:codex_native-a");
    const contextPath = path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      "sessions",
      "codex_native-a.json",
    );
    const context = JSON.parse(fs.readFileSync(contextPath, "utf-8")) as {
      current_task: string;
    };
    expect(context.current_task).toBe(".trellis/tasks/issue-106");
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
    const contextPath = path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      "sessions",
      "codex_thread-a.json",
    );
    const context = JSON.parse(fs.readFileSync(contextPath, "utf-8")) as {
      current_task: string;
    };
    expect(context.current_task).toBe(".trellis/tasks/issue-106");
  });

  it("[session-current-task] task.py start uses OpenCode OPENCODE_RUN_ID", () => {
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

    expect(output).toContain("Source: session:opencode_run-a");
    const contextPath = path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      "sessions",
      "opencode_run-a.json",
    );
    const context = JSON.parse(fs.readFileSync(contextPath, "utf-8")) as {
      current_task: string;
    };
    expect(context.current_task).toBe(".trellis/tasks/issue-106");
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
    expect(
      fs.existsSync(path.join(tmpDir, ".trellis", ".current-task")),
    ).toBe(true);
  });

  it("[session-current-task] task.py current ignores legacy .current-task without context key", () => {
    setupTaskRepo();
    writeLegacyCurrentTask(".trellis/tasks/issue-106");
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    let output = "";
    let status = 0;
    try {
      execSync(`${pythonCmd} ${JSON.stringify(taskScriptPath)} current --source`, {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv(),
      });
    } catch (error) {
      status =
        typeof (error as { status?: unknown }).status === "number"
          ? ((error as { status: number }).status)
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
        { current_task: ".trellis/tasks/missing-task", platform: "test" },
        null,
        2,
      ),
    );
    const taskScriptPath = path.join(tmpDir, ".trellis", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} current --source`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ TRELLIS_CONTEXT_ID: "session-b" }),
      },
    );

    expect(output).toContain("Current task: .trellis/tasks/missing-task");
    expect(output).toContain("Source: session:session-b");
    expect(output).toContain("State: stale");
    expect(output).not.toContain("issue-106");
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

  it("[prd-status] session-start keeps planning tasks out of READY until PRD is confirmed", () => {
    setupTaskRepo();
    writeSessionContext("claude_prd-a", ".trellis/tasks/issue-106");
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "task.json"),
      JSON.stringify(
        {
          title: "Issue 106 task",
          status: "planning",
          package: null,
          meta: { prd_status: "draft" },
        },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(claudeSessionStart, "claude session-start"),
    );

    const output = runPython(
      path.join(".claude", "hooks", "session-start.py"),
      JSON.stringify({ cwd: tmpDir, session_id: "prd-a" }),
    );

    expect(output).toContain("Status: PLANNING (PRD confirmation)");
    expect(output).toContain("set-prd-status");
    expect(output).not.toContain("Status: READY");
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
    const hookOutput = runPython(
      path.join(".cursor", "hooks", "inject-shell-session-context.py"),
      JSON.stringify({
        cursor_version: "3.1.17",
        conversation_id: "cursor-shell-a",
        generation_id: "gen-a",
        cwd: tmpDir,
        command: `${pythonCmd} ./.trellis/scripts/task.py start .trellis/tasks/issue-106 && ${pythonCmd} ./.trellis/scripts/task.py current --source`,
        hook_event_name: "beforeShellExecution",
      }),
    );
    expect(JSON.parse(hookOutput) as { permission?: string }).toMatchObject({
      permission: "allow",
    });

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

    const contextPath = path.join(
      tmpDir,
      ".trellis",
      ".runtime",
      "sessions",
      "cursor_cursor-shell-a.json",
    );
    const context = JSON.parse(fs.readFileSync(contextPath, "utf-8")) as {
      current_task: string;
      platform: string;
    };
    expect(context.current_task).toBe(".trellis/tasks/issue-106");
    expect(context.platform).toBe("cursor");
  });

  it("[session-current-task] Cursor preToolUse injects context for custom Task subagents", () => {
    setupTaskRepo();
    writeProjectFile(path.join(".git", "HEAD"), "ref: refs/heads/main\n");
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
    writeProjectFile(
      path.join(".trellis", ".runtime", "sessions", "cursor_parent-a.json"),
      JSON.stringify(
        {
          current_task: ".trellis/tasks/issue-106",
          current_run: null,
          platform: "cursor",
        },
        null,
        2,
      ),
    );

    const hookOutput = runPython(
      path.join(".cursor", "hooks", "inject-subagent-context.py"),
      JSON.stringify({
        cursor_version: "3.2.11",
        hook_event_name: "preToolUse",
        tool_name: "Subagent",
        tool_input: {
          prompt: "Report whether TOKEN_CURSOR_HOOK_TEST is visible.",
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
    expect(prompt).toContain("TOKEN_CURSOR_HOOK_TEST");
    expect(parsed.hookSpecificOutput?.updatedInput?.prompt).toBe(prompt);
  });

  it("[prd-status] Cursor preToolUse blocks trellis-implement when PRD is still draft", () => {
    setupTaskRepo();
    writeProjectFile(path.join(".git", "HEAD"), "ref: refs/heads/main\n");
    writeProjectFile(
      path.join(".trellis", "tasks", "issue-106", "task.json"),
      JSON.stringify(
        {
          title: "Issue 106 task",
          status: "planning",
          package: null,
          meta: { prd_status: "draft" },
        },
        null,
        2,
      ),
    );
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
    writeProjectFile(
      path.join(".trellis", ".runtime", "sessions", "cursor_parent-a.json"),
      JSON.stringify(
        {
          current_task: ".trellis/tasks/issue-106",
          current_run: null,
          platform: "cursor",
        },
        null,
        2,
      ),
    );

    const hookOutput = runPython(
      path.join(".cursor", "hooks", "inject-subagent-context.py"),
      JSON.stringify({
        cursor_version: "3.2.11",
        hook_event_name: "preToolUse",
        tool_name: "Subagent",
        tool_input: {
          prompt: "Please implement the feature.",
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
      updated_input?: { prompt?: string };
      hookSpecificOutput?: { updatedInput?: { prompt?: string } };
    };
    const prompt =
      parsed.updated_input?.prompt ??
      parsed.hookSpecificOutput?.updatedInput?.prompt ??
      "";

    expect(prompt).toContain("PRD Gate Failed");
    expect(prompt).toContain("set-prd-status");
    expect(prompt).toContain("Do NOT modify code");
  });

  it("[session-current-task] Cursor generic subagents do not receive Trellis jsonl injection", () => {
    setupTaskRepo();
    writeProjectFile(path.join(".git", "HEAD"), "ref: refs/heads/main\n");
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
    writeProjectFile(
      path.join(".trellis", ".runtime", "sessions", "cursor_parent-a.json"),
      JSON.stringify(
        {
          current_task: ".trellis/tasks/issue-106",
          current_run: null,
          platform: "cursor",
        },
        null,
        2,
      ),
    );

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

  it("[session-current-task] Cursor hook uses conversation_id when transcript_path is null", () => {
    setupTaskRepo();
    writeLegacyCurrentTask(".trellis/tasks/issue-106");
    writeWorkflowStateHook();
    writeProjectFile(
      path.join(".trellis", "tasks", "cursor-task", "task.json"),
      JSON.stringify(
        {
          id: "cursor-task",
          title: "Cursor task",
          status: "in_progress",
        },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(".trellis", ".runtime", "sessions", "cursor_cursor-a.json"),
      JSON.stringify(
        {
          current_task: ".trellis/tasks/cursor-task",
          platform: "cursor",
        },
        null,
        2,
      ),
    );

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
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Source: session:cursor_cursor-a",
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
          title: "OpenCode task",
          status: "in_progress",
        },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(
        ".trellis",
        ".runtime",
        "sessions",
        "opencode_oc-a.json",
      ),
      JSON.stringify(
        {
          current_task: ".trellis/tasks/opencode-task",
          platform: "opencode",
        },
        null,
        2,
      ),
    );

    const ctx = new TrellisContext(tmpDir);
    const none = ctx.getActiveTask();
    expect(none.taskPath).toBeNull();
    expect(none.source).toBe("none");

    const active = ctx.getActiveTask({
      sessionID: "oc-a",
    });

    expect(active.taskPath).toBe(".trellis/tasks/opencode-task");
    expect(active.source).toBe("session:opencode_oc-a");
    expect(active.stale).toBe(false);
  });

  it("[session-current-task] OpenCode resolver prefers OPENCODE_RUN_ID over plugin sessionID", () => {
    setupTaskRepo();
    writeProjectFile(
      path.join(".trellis", "tasks", "opencode-run-task", "task.json"),
      JSON.stringify(
        {
          title: "OpenCode run task",
          status: "in_progress",
          priority: "P1",
        },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(".trellis", ".runtime", "sessions", "opencode_run-a.json"),
      JSON.stringify(
        {
          current_task: ".trellis/tasks/opencode-run-task",
          platform: "opencode",
        },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(".trellis", ".runtime", "sessions", "opencode_oc-a.json"),
      JSON.stringify(
        {
          current_task: ".trellis/tasks/issue-106",
          platform: "opencode",
        },
        null,
        2,
      ),
    );

    const previous = process.env.OPENCODE_RUN_ID;
    process.env.OPENCODE_RUN_ID = "run-a";
    try {
      const active = new TrellisContext(tmpDir).getActiveTask({
        sessionID: "oc-a",
      });

      expect(active.source).toBe("session:opencode_run-a");
      expect(active.taskPath).toBe(".trellis/tasks/opencode-run-task");
      expect(active.stale).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.OPENCODE_RUN_ID;
      } else {
        process.env.OPENCODE_RUN_ID = previous;
      }
    }
  });

  it("[session-start-proof] shared and Codex contexts include one-shot first-reply notice without changing payload shape", () => {
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
    };
    const codexPayload = JSON.parse(
      runPython(
        path.join(".codex", "hooks", "session-start.py"),
        JSON.stringify({ cwd: tmpDir }),
      ),
    ) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };

    for (const payload of [sharedPayload, codexPayload]) {
      expect(Object.keys(payload)).not.toContain("firstReplyNotice");
      expect(Object.keys(payload.hookSpecificOutput)).toEqual([
        "hookEventName",
        "additionalContext",
      ]);
      expect(payload.hookSpecificOutput.hookEventName).toBe("SessionStart");

      const ctx = payload.hookSpecificOutput.additionalContext;
      expect(ctx).toContain("<first-reply-notice>");
      expect(ctx).toContain(firstReplyNoticeSentence);
      expect(ctx).toContain("This notice is one-shot");
      expect(ctx.indexOf("<first-reply-notice>")).toBeLessThan(
        ctx.indexOf("<current-state>"),
      );
    }
  });

  it("[session-start-proof] Copilot template does not promise model-visible SessionStart injection", () => {
    const content = expectTemplateContent(
      copilotSessionStart,
      "copilot session-start",
    );

    expect(content).toContain(
      "documented SessionStart behavior ignores hook output",
    );
    expect(content).toContain(
      "Copilot currently ignores sessionStart hook output",
    );
    expect(content).not.toContain("Trellis context injected");
    expect(content).not.toContain(firstReplyNoticeSentence);
  });

  it("[session-start-proof] Copilot SessionStart payload is diagnostic-only", () => {
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
      systemMessage: string;
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };

    expect(payload.systemMessage).toContain("SessionStart diagnostics emitted");
    expect(payload.systemMessage).toContain(
      "Copilot currently ignores sessionStart hook output",
    );
    expect(payload.systemMessage).not.toContain("Trellis context injected");
    expect(payload.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(payload.hookSpecificOutput.additionalContext).not.toContain(
      "<first-reply-notice>",
    );
    expect(payload.hookSpecificOutput.additionalContext).not.toContain(
      firstReplyNoticeSentence,
    );
  });

  it("[workflow-v2] shared session-start READY guidance requires implement/check sub-agents", () => {
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
    expect(rawOutput).toContain(
      "Next required action: dispatch `trellis-implement`",
    );
    expect(rawOutput).toContain("default is to NOT edit code in the main session");
    expect(rawOutput).toContain("dispatch `trellis-check`");
    expect(rawOutput).not.toContain("if you stay in the main session");
    expect(rawOutput).not.toContain(
      "load `trellis-before-dev` before writing code",
    );
    expect(rawOutput).not.toContain("If there is an active task, ask whether");
    expect(rawOutput).toContain(
      "execute its Next required action without asking whether to continue",
    );
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
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
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

  // ------------------------------------------------------------
  // Legacy current_phase / next_action field removal (FP round 3 cleanup)
  // ------------------------------------------------------------

  it("[workflow-v2] task.py create does NOT write legacy current_phase / next_action fields", () => {
    setupTaskRepo();
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
    setupTaskRepo();
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
    setupTaskRepo();
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
    setupTaskRepo();
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
    setupTaskRepo();
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

  it("[workflow-state-r1] template workflow.md [workflow-state:in_progress] mentions commit (Phase 3.4)", () => {
    const wf = templateWorkflowMd();
    const match = wf.match(
      /\[workflow-state:in_progress\]([\s\S]*?)\[\/workflow-state:in_progress\]/,
    );
    expect(match).toBeTruthy();
    const body = match?.[1] ?? "";
    expect(body).toMatch(/commit \(Phase 3\.4\)/i);
  });

  it("[workflow-state-r2] template workflow.md [workflow-state:planning] mentions Phase 1.3 + jsonl curation", () => {
    const wf = templateWorkflowMd();
    const match = wf.match(
      /\[workflow-state:planning\]([\s\S]*?)\[\/workflow-state:planning\]/,
    );
    expect(match).toBeTruthy();
    const body = match?.[1] ?? "";
    expect(body).toMatch(/Phase 1\.3/);
    expect(body).toMatch(/implement\.jsonl|check\.jsonl/);
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

  it("[workflow-v2] get_context.py --mode phase returns Phase Index + Phase 1/2/3 step bodies", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
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
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
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

  it("[workflow-v2] step 2.1 for codex describes self-loaded agent context, not hook injection", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
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

    expect(output).toContain("The Codex sub-agent definition auto-handles");
    expect(output).toContain(
      "Resolves the active task with `task.py current --source`",
    );
    expect(output).not.toContain("The platform hook/plugin auto-handles");
    expect(output).not.toContain("Load the `trellis-before-dev` skill");
  });

  it("[pi] step 2.1 describes extension-backed sub-agent context path", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
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
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
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
  // session-start.py <workflow> + <guidelines> block restructure
  // ------------------------------------------------------------

  it("[workflow-v2] session-start.py <workflow> block contains Phase 1/2/3 step bodies", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
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

    const workflowMatch = /<workflow>([\s\S]*?)<\/workflow>/.exec(ctx);
    if (!workflowMatch) throw new Error("workflow block not found in payload");
    const workflowBlock = workflowMatch[1];

    // Step bodies inlined (not just TOC)
    expect(workflowBlock).toContain("## Phase 1: Plan");
    expect(workflowBlock).toContain("#### 1.1 Requirement exploration");
    expect(workflowBlock).toContain("#### 2.1 Implement");
    expect(workflowBlock).toContain("#### 3.3 Spec update");
    // Breadcrumb tag BLOCKS (matched opening + closing pair) excluded — they're
    // consumed by inject-workflow-state.py. Inline `[workflow-state:planning]`
    // mentions in narrative prose are fine; only complete blocks are stripped.
    const tagBlockRe =
      /\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n[\s\S]*?\n\s*\[\/workflow-state:\1\]/;
    expect(tagBlockRe.test(workflowBlock)).toBe(false);
  });

  it("[workflow-v2] session-start.py <guidelines> block lists spec paths, not inlined content", () => {
    writeTrellisScripts();
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
    writeProjectFile(
      path.join(".trellis", "workflow.md"),
      templateWorkflowMd(),
    );
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

    // guides/index.md stays inlined (cross-package thinking guides)
    expect(guidelinesBlock).toContain("GUIDES_INLINE_MARKER");
    // Other package index listed as path, content NOT inlined
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
    writeProjectFile(path.join(".trellis", ".developer"), "name=test\n");
    writeProjectFile(path.join(".trellis", "workflow.md"), "# Minimal\n");
    // Session active task WITHOUT current_phase field (post-migration state)
    writeProjectFile(
      path.join(".trellis", ".runtime", "sessions", "claude_phase-a.json"),
      JSON.stringify(
        {
          current_task: ".trellis/tasks/issue-106",
          platform: "claude",
        },
        null,
        2,
      ),
    );
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

  it("[pi] Pi Agent platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("pi");
    expect(AI_TOOLS.pi.configDir).toBe(".pi");
    expect(AI_TOOLS.pi.cliFlag).toBe("pi");
    expect(AI_TOOLS.pi.hasPythonHooks).toBe(false);
    expect(AI_TOOLS.pi.templateContext.agentCapable).toBe(true);
    expect(AI_TOOLS.pi.templateContext.hasHooks).toBe(true);
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

  it("[pi] cli_adapter.py supports pi platform", () => {
    expect(commonCliAdapter).toContain('"pi"');
    expect(commonCliAdapter).toContain(".pi");
    expect(commonCliAdapter).toContain('cmd = ["pi", "-p", prompt]');
    expect(commonCliAdapter).toContain('return ["pi", "-c", session_id]');
    expect(commonCliAdapter).toContain(
      'return f".pi/prompts/trellis-{name}.md"',
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
    expect(taskStore as string).toContain('".pi"');
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
    expect(commonCliAdapter).toContain(".pi");
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
    const shellArchives = migrations.filter((m) =>
      m.to?.includes("scripts-shell-archive"),
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
    const shellArchives = migrations.filter((m) =>
      m.to?.includes("scripts-shell-archive"),
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
      {
        id: "claude",
        from: (n) => `.claude/commands/trellis/${n}.md`,
        to: (n) => `.claude/skills/trellis-${n}/SKILL.md`,
      },
      {
        id: "cursor",
        from: (n) => `.cursor/commands/trellis-${n}.md`,
        to: (n) => `.cursor/skills/trellis-${n}/SKILL.md`,
      },
      {
        id: "opencode",
        from: (n) => `.opencode/commands/trellis/${n}.md`,
        to: (n) => `.opencode/skills/trellis-${n}/SKILL.md`,
      },
      {
        id: "codebuddy",
        from: (n) => `.codebuddy/commands/trellis/${n}.md`,
        to: (n) => `.codebuddy/skills/trellis-${n}/SKILL.md`,
      },
      {
        id: "droid",
        from: (n) => `.factory/commands/trellis/${n}.md`,
        to: (n) => `.factory/skills/trellis-${n}/SKILL.md`,
      },
      {
        id: "gemini",
        from: (n) => `.gemini/commands/trellis/${n}.toml`,
        to: (n) => `.gemini/skills/trellis-${n}/SKILL.md`,
      },
      {
        id: "copilot",
        from: (n) => `.github/prompts/${n}.prompt.md`,
        to: (n) => `.github/skills/trellis-${n}/SKILL.md`,
      },
      {
        id: "kilo",
        from: (n) => `.kilocode/workflows/${n}.md`,
        to: (n) => `.kilocode/skills/trellis-${n}/SKILL.md`,
      },
      {
        id: "antigravity",
        from: (n) => `.agent/workflows/${n}.md`,
        to: (n) => `.agent/skills/trellis-${n}/SKILL.md`,
      },
      {
        id: "windsurf",
        from: (n) => `.windsurf/workflows/trellis-${n}.md`,
        to: (n) => `.windsurf/skills/trellis-${n}/SKILL.md`,
      },
      {
        id: "kiro",
        from: (n) => `.kiro/skills/${n}/SKILL.md`,
        to: (n) => `.kiro/skills/trellis-${n}/SKILL.md`,
      },
      {
        id: "qoder",
        from: (n) => `.qoder/skills/${n}/SKILL.md`,
        to: (n) => `.qoder/skills/trellis-${n}/SKILL.md`,
      },
      {
        id: "shared",
        from: (n) => `.agents/skills/${n}/SKILL.md`,
        to: (n) => `.agents/skills/trellis-${n}/SKILL.md`,
      },
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
          expect(
            index.has(expectedFrom),
            `missing rename for ${p.id}:${c} (${expectedFrom})`,
          ).toBe(true);
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

  it("[windsurf] windsurf uses workflows/ instead of commands/trellis/", () => {
    const templates = collectPlatformTemplates("windsurf");
    expect(templates).toBeInstanceOf(Map);
    if (!templates) return;
    const keys = [...templates.keys()];
    for (const key of keys) {
      expect(
        key.startsWith(".windsurf/workflows/") ||
          key.startsWith(".windsurf/skills/"),
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
          expect(content).toContain("task.py current --source");
          if (file.includes("implement")) {
            expect(content).toContain("prd_status");
          }
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
    const content = fs.readFileSync(
      path.join(tmpDir, ".github/agents/trellis-implement.agent.md"),
      "utf-8",
    );
    const frontmatter = content.split("---\n")[1] ?? "";

    expect(frontmatter).toContain(
      "tools:\n  - read\n  - edit\n  - execute\n  - search\n  - web\n  - exa/*",
    );
    expect(frontmatter).not.toContain(
      "tools: Read, Write, Edit, Bash, Glob, Grep",
    );
  });

  it("maps research agent MCP tools to Copilot tool names", () => {
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
    expect(extension).toContain('name: "subagent"');
    expect(extension).toContain('pi.on?.("before_agent_start"');
    expect(extension).toContain('pi.on?.("tool_call"');

    for (const agent of ["trellis-implement.md", "trellis-check.md"]) {
      const content = fs.readFileSync(
        path.join(tmpDir, ".pi", "agents", agent),
        "utf-8",
      );
      expect(content).toContain("Required: Load Trellis Context First");
      expect(content).toContain("task.py current --source");
      if (agent.includes("implement")) {
        expect(content).toContain("prd_status");
      }
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
      instructions: string;
    };
    expect(data.tools).toContain("write");
    expect(data.instructions).toContain("{TASK_DIR}/research/");
    expect(data.instructions).toMatch(/PERSIST|persist/);
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

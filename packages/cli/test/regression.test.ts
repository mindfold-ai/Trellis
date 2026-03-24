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
  taskScript,
  addSessionScript,
  multiAgentPlan,
  multiAgentStart,
  multiAgentCleanup,
  multiAgentCreatePr,
  commonCliAdapter,
  commonWorktree,
  commonTaskUtils,
  commonDeveloper,
  getAllScripts,
} from "../src/templates/trellis/index.js";
import {
  collectPlatformTemplates,
  PLATFORM_IDS,
} from "../src/configurators/index.js";
import { guidesIndexContent, workspaceIndexContent } from "../src/templates/markdown/index.js";
import * as markdownExports from "../src/templates/markdown/index.js";

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
    expect(addSessionScript).toContain(
      String.raw`re.match(
                r"^\|\s*#\s*\|\s*Date\s*\|\s*Title\s*\|\s*Commits\s*\|\s*Branch\s*\|\s*Base Branch\s*\|\s*$",`,
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

  it("[potential] resolve_task_dir path check includes '/' separator check", () => {
    // resolve_task_dir should detect relative paths containing '/'
    expect(commonTaskUtils).toContain('"/" in target_dir');
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
  it("[beta.16] collectPlatformTemplates returns undefined for opencode (no collectTemplates)", () => {
    // OpenCode uses plugin system, templates tracked separately
    const result = collectPlatformTemplates("opencode");
    expect(result).toBeUndefined();
  });

  it("[beta.16] collectPlatformTemplates returns Map for platforms with tracking", () => {
    const withTracking = [
      "claude-code",
      "cursor",
      "iflow",
      "codex",
      "kilo",
      "kiro",
      "gemini",
      "antigravity",
      "qoder",
    ] as const;
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
    const excluded = new Set(["hooks/linear_sync.py", "multi_agent/_bootstrap.py"]);

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
    const hookTypes = Object.values(settings.hooks) as {
      hooks: { command: string }[];
    }[][];
    for (const entries of hookTypes) {
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          expect(hook.command).toContain("{{PYTHON_CMD}}");
        }
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

  it("[MIN-231] iFlow SessionStart hooks cover startup, clear, and compress", () => {
    const settings = JSON.parse(iflowSettingsTemplate);
    const matchers = settings.hooks.SessionStart.map(
      (e: { matcher: string }) => e.matcher,
    );
    expect(matchers).toEqual(
      expect.arrayContaining(["startup", "clear", "compress"]),
    );
  });

  it("[MIN-231] all SessionStart matchers invoke session-start.py", () => {
    for (const [label, template] of [
      ["claude", claudeSettingsTemplate],
      ["iflow", iflowSettingsTemplate],
    ] as const) {
      const settings = JSON.parse(template);
      for (const entry of settings.hooks.SessionStart) {
        expect(
          entry.hooks[0].command,
          `${label} ${entry.matcher} should invoke session-start.py`,
        ).toContain("session-start.py");
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
    expect(AI_TOOLS.codex.extraManagedPaths).toEqual([".codex"]);
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

  it("[qoder] Qoder platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("qoder");
    expect(AI_TOOLS.qoder.configDir).toBe(".qoder");
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
    expect(commonCliAdapter).toContain(".codex");
  });

  it("[codex] multi_agent plan/start scripts allow codex platform", () => {
    expect(multiAgentPlan).toContain('"codex"');
    expect(multiAgentStart).toContain('"codex"');
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

  it("[qoder] cli_adapter.py supports qoder platform", () => {
    expect(commonCliAdapter).toContain('"qoder"');
    expect(commonCliAdapter).toContain(".qoder");
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
    expect(commonCliAdapter).toContain(".kiro");
    expect(commonCliAdapter).toContain(".gemini");
    expect(commonCliAdapter).toContain(".agent");
    expect(commonCliAdapter).toContain(".qoder");
  });

  it("[0.3.10] iFlow CLI uses correct agent invocation syntax", () => {
    expect(commonCliAdapter).toContain('cmd = ["iflow", "-p"]');
    expect(commonCliAdapter).toContain('cmd.extend(["-y", "--agent", mapped_agent])');
    expect(commonCliAdapter).toContain("cmd.append(prompt)");
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
});

// =============================================================================
// 7. collectTemplates Path Consistency
// =============================================================================

describe("regression: collectTemplates paths match init directory structure (0.3.1)", () => {
  it("[0.3.1] iflow collectTemplates uses commands/trellis/ subdirectory", () => {
    const templates = collectPlatformTemplates("iflow");
    expect(templates).toBeInstanceOf(Map);
    const commandKeys = [...(templates as Map<string, string>).keys()].filter(
      (k) => k.includes("/commands/"),
    );
    for (const key of commandKeys) {
      expect(
        key,
        `iflow command path should include trellis/ subdirectory: ${key}`,
      ).toMatch(/\.iflow\/commands\/trellis\//);
    }
  });

  it("[0.3.1] all platforms with commands use consistent trellis/ subdirectory", () => {
    const platformsWithCommands = ["claude-code", "iflow", "gemini"] as const;
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

  it("[0.3.4] kilo uses workflows/ instead of commands/trellis/", () => {
    const templates = collectPlatformTemplates("kilo");
    expect(templates).toBeInstanceOf(Map);
    if (!templates) return;
    const keys = [...templates.keys()];
    for (const key of keys) {
      expect(key, `kilo path should use workflows/: ${key}`).toContain(
        ".kilocode/workflows/",
      );
      expect(key, `kilo should not use commands/: ${key}`).not.toContain(
        "/commands/",
      );
    }
  });

  it("[codex] collectTemplates tracks both .agents skills and .codex assets", () => {
    const templates = collectPlatformTemplates("codex");
    expect(templates).toBeInstanceOf(Map);
    if (!templates) return;

    const keys = [...templates.keys()];
    expect(keys.some((key) => key.startsWith(".agents/skills/"))).toBe(true);
    expect(keys.some((key) => key.startsWith(".codex/agents/"))).toBe(true);
    expect(keys).toContain(".codex/config.toml");
  });
});

// =============================================================================
// YAML Quote Stripping (0.3.8)
// =============================================================================

describe("regression: parse_simple_yaml uses _unquote not greedy strip (0.3.8)", () => {
  it("worktree.py defines _unquote helper", () => {
    expect(commonWorktree).toContain("def _unquote(s: str) -> str:");
  });

  it("worktree.py uses _unquote for list items, not .strip('\"')", () => {
    // The bug: .strip('"').strip("'") greedily eats nested quotes
    // e.g. "echo 'hello'" -> strip("'") -> echo 'hello (broken!)
    expect(commonWorktree).not.toContain(".strip('\"').strip(\"'\")");
    expect(commonWorktree).toContain("_unquote(stripped[2:].strip())");
  });

  it("worktree.py uses _unquote for key-value, not .strip('\"')", () => {
    expect(commonWorktree).toContain("_unquote(value.strip())");
  });
});

describe("regression: parse_simple_yaml Python execution (0.3.8)", () => {
  // Extract _unquote + _parse_yaml_block + _next_content_line + parse_simple_yaml
  // from commonWorktree and run them in an isolated Python process.
  // We can't import worktree.py directly because it has `from .paths import ...`
  let tmpDir: string;
  let extractedPy: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-yaml-py-"));
    // Extract _unquote + parse_simple_yaml + _parse_yaml_block + _next_content_line
    // These 4 functions have no external imports — safe to run standalone.
    const fnStart = commonWorktree.indexOf("def _unquote(");
    const fnEnd = commonWorktree.indexOf("\ndef _yaml_get_value(");
    extractedPy = commonWorktree.substring(fnStart, fnEnd);
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

describe("regression: submodule awareness in multi_agent scripts (beta.1)", () => {
  it("[S4] start.py checks submodule status prefix before init (prevents detached HEAD)", () => {
    // Critical: running `git submodule update --init` on already-initialized submodule
    // detaches HEAD, destroying agent's in-progress work. Must check status prefix first.
    expect(multiAgentStart).toContain("submodule status");
    expect(multiAgentStart).toContain('prefix == "-"');
    expect(multiAgentStart).toContain('prefix == "+"');
  });

  it("[S4] start.py imports submodule helpers from common.config", () => {
    expect(multiAgentStart).toContain("get_submodule_packages");
    expect(multiAgentStart).toContain("validate_package");
  });

  it("[S4] create_pr.py uses git symbolic-ref for portable base branch detection", () => {
    // Must use `git symbolic-ref refs/remotes/origin/HEAD` (not grep + English output)
    // for cross-platform / cross-locale compatibility
    expect(multiAgentCreatePr).toContain("symbolic-ref");
    expect(multiAgentCreatePr).toContain("refs/remotes/origin/HEAD");
  });

  it("[S4] create_pr.py guards submodule_prs read with isinstance", () => {
    // Prevents TypeError crash when task.json has submodule_prs: null or non-dict
    expect(multiAgentCreatePr).toContain("isinstance(raw_prs, dict)");
  });

  it("[S4] create_pr.py has squash-merge warning for submodule PRs", () => {
    expect(multiAgentCreatePr).toContain("_SUBMODULE_SQUASH_WARNING_MARKER");
    expect(multiAgentCreatePr).toContain("squash-merged");
  });

  it("[S4] cleanup.py defines AND calls _warn_submodule_prs", () => {
    // Bug found during review: function was defined but never called.
    // Verify both definition and at least one call site exist.
    expect(multiAgentCleanup).toContain("def _warn_submodule_prs(");
    // Count occurrences: 1 def + at least 2 calls = at least 3
    const occurrences = multiAgentCleanup.split("_warn_submodule_prs").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });
});

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

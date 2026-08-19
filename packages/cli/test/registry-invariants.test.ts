/**
 * Registry Invariant Tests
 *
 * Cross-module consistency checks inspired by:
 * - SQLite's invariant checking (PRAGMA integrity_check after every operation)
 * - Mark Seemann's DI container testing (roundtrip + consumer-perspective checks)
 *
 * These tests catch errors when adding a new platform but forgetting to update
 * one of the registries or derived data.
 */

import { describe, expect, it } from "vitest";
import { AI_TOOLS } from "../src/types/ai-tools.js";
import {
  PLATFORM_IDS,
} from "../src/configurators/index.js";

const COMMANDER_RESERVED_FLAGS = ["help", "version", "V", "h"];

// =============================================================================
// Internal Consistency (SQLite-style invariant checks)
// =============================================================================

describe("registry internal consistency", () => {
  it("PLATFORM_IDS length matches AI_TOOLS keys", () => {
    expect(PLATFORM_IDS.length).toBe(Object.keys(AI_TOOLS).length);
  });

  it("all cliFlag values are unique", () => {
    const flags = PLATFORM_IDS.map((id) => AI_TOOLS[id].cliFlag);
    const unique = new Set(flags);
    expect(unique.size).toBe(flags.length);
  });

  it("all configDir values are unique", () => {
    const dirs = PLATFORM_IDS.map((id) => AI_TOOLS[id].configDir);
    const unique = new Set(dirs);
    expect(unique.size).toBe(dirs.length);
  });

  it("all configDir values start with dot", () => {
    for (const id of PLATFORM_IDS) {
      expect(AI_TOOLS[id].configDir.startsWith(".")).toBe(true);
    }
  });

  it("platforms with supportsAgentSkills do not use .agents/skills as configDir", () => {
    for (const id of PLATFORM_IDS) {
      if (AI_TOOLS[id].supportsAgentSkills) {
        expect(AI_TOOLS[id].configDir).not.toBe(".agents/skills");
      }
    }
  });

  it("no configDir collides with .trellis", () => {
    for (const id of PLATFORM_IDS) {
      expect(AI_TOOLS[id].configDir).not.toBe(".trellis");
    }
  });

  it("no cliFlag collides with commander.js reserved flags", () => {
    for (const id of PLATFORM_IDS) {
      expect(COMMANDER_RESERVED_FLAGS).not.toContain(AI_TOOLS[id].cliFlag);
    }
  });

  it("every platform has non-empty name", () => {
    for (const id of PLATFORM_IDS) {
      expect(AI_TOOLS[id].name.length).toBeGreaterThan(0);
    }
  });

  it("every platform templateDirs includes common", () => {
    for (const id of PLATFORM_IDS) {
      expect(AI_TOOLS[id].templateDirs).toContain("common");
    }
  });

  // templateContext.cliFlag mirrors the outer AIToolConfig.cliFlag — the two
  // must stay in sync so {{CLI_FLAG}} substitution in shipped templates
  // agrees with the --claude/--cursor/--codex CLI flag users invoke.
  it("templateContext.cliFlag matches AIToolConfig.cliFlag for every platform", () => {
    for (const id of PLATFORM_IDS) {
      const config = AI_TOOLS[id];
      expect(config.templateContext.cliFlag).toBe(config.cliFlag);
    }
  });

});

// =============================================================================
// UserPromptSubmit breadcrumb wiring (workflow-enforcement-v2)
// =============================================================================

describe("UserPromptSubmit hook wiring", () => {
  /** Map from template config path to (parser, event name) */
  const PLATFORM_HOOK_CONFIGS = [
    {
      platform: "claude",
      path: "claude/settings.json",
      event: "UserPromptSubmit",
    },
    {
      platform: "qoder",
      path: "qoder/settings.json",
      event: "UserPromptSubmit",
    },
    {
      platform: "codebuddy",
      path: "codebuddy/settings.json",
      event: "UserPromptSubmit",
    },
    {
      platform: "droid",
      path: "droid/settings.json",
      event: "UserPromptSubmit",
    },
    {
      // Gemini CLI 0.40+ renamed the per-turn event from `UserPromptSubmit`
      // (Claude Code naming we initially copied) to `BeforeAgent`. The
      // schema validator rejects the legacy name — see issue #224.
      platform: "gemini",
      path: "gemini/settings.json",
      event: "BeforeAgent",
    },
    {
      platform: "copilot",
      path: "copilot/hooks.json",
      event: "userPromptSubmitted",
    },
    {
      platform: "codex",
      path: "codex/hooks.json",
      event: "UserPromptSubmit",
    },
    {
      platform: "trae",
      path: "trae/hooks.json",
      event: "UserPromptSubmit",
    },
  ] as const;

  for (const { platform, path, event } of PLATFORM_HOOK_CONFIGS) {
    it(`${platform} hook config contains ${event} referencing inject-workflow-state.py`, async () => {
      const fs = await import("node:fs");
      const { dirname, join } = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const __filename = fileURLToPath(import.meta.url);
      const templatesRoot = join(
        dirname(__filename),
        "..",
        "src",
        "templates",
      );
      const raw = fs.readFileSync(join(templatesRoot, path), "utf-8");
      const parsed = JSON.parse(raw) as {
        hooks?: Record<string, unknown>;
      };
      expect(parsed.hooks).toBeDefined();
      expect(Object.keys(parsed.hooks ?? {})).toContain(event);
      expect(raw).toContain("inject-workflow-state.py");
    });
  }

  it("kiro main `trellis` agent wires userPromptSubmit; sub-agents do not", async () => {
    // Kiro DOES support per-turn hooks (official docs: CLI agent
    // `hooks.userPromptSubmit`). The main `trellis` agent wires the per-turn
    // breadcrumb; the 3 sub-agents only inject sub-agent context on spawn.
    const fs = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __filename = fileURLToPath(import.meta.url);
    const kiroAgentsDir = join(
      dirname(__filename),
      "..",
      "src",
      "templates",
      "kiro",
      "agents",
    );
    for (const entry of fs.readdirSync(kiroAgentsDir)) {
      if (!entry.endsWith(".json")) continue;
      const content = fs.readFileSync(join(kiroAgentsDir, entry), "utf-8");
      const parsed = JSON.parse(content) as {
        hooks?: Record<string, unknown>;
      };
      if (entry === "trellis.json") {
        expect(Object.keys(parsed.hooks ?? {})).toContain("userPromptSubmit");
        expect(content).toContain("inject-workflow-state.py");
      } else {
        expect(
          content,
          `kiro/agents/${entry} (sub-agent) should not wire inject-workflow-state.py`,
        ).not.toContain("inject-workflow-state.py");
      }
    }
  });
});

// =============================================================================
// Docs Drift (docs-site is hand-written; AI_TOOLS is the source of truth)
// =============================================================================
//
// 0.6.14 shipped while the docs still advertised 17 platforms and the registry
// already had 21: --grok, --kimi, --snow and --trae worked but were documented
// nowhere, and a user asked in the community whether Grok support was planned.
// `trellis init --help` was correct that whole time because it is generated
// from AI_TOOLS — only the prose drifted, and nothing failed when it did.
//
// docs-site is a submodule, so these skip when it is not checked out. CI clones
// with `submodules: recursive`, so they always run there.
//
// Changelogs are excluded deliberately: they record what was true at a past
// release, and rewriting them to match today's registry would be false.

describe("docs-site matches the platform registry", () => {
  async function docsPages(): Promise<{ root: string; files: string[] } | null> {
    const fs = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __filename = fileURLToPath(import.meta.url);
    const root = join(dirname(__filename), "..", "..", "..", "docs-site");
    if (!fs.existsSync(root)) return null;

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name === "changelog" || entry.name === "node_modules") continue;
          walk(join(dir, entry.name));
        } else if (entry.name.endsWith(".mdx")) {
          files.push(join(dir, entry.name));
        }
      }
    };
    walk(root);
    return { root, files };
  }

  it("every page that documents init flags documents all of them", async () => {
    const fs = await import("node:fs");
    const { relative } = await import("node:path");
    const docs = await docsPages();
    if (docs === null) return;

    const flags = PLATFORM_IDS.map((id) => `--${AI_TOOLS[id].cliFlag}`);
    for (const file of docs.files) {
      const content = fs.readFileSync(file, "utf-8");
      if (!/Supported flags|支持的 flag/.test(content)) continue;
      for (const flag of flags) {
        expect(
          content,
          `${relative(docs.root, file)} lists init flags but omits ${flag}`,
        ).toContain(flag);
      }
    }
  });

  it("no page states a platform count other than the registry's", async () => {
    const fs = await import("node:fs");
    const { relative } = await import("node:path");
    const docs = await docsPages();
    if (docs === null) return;

    // Only two-digit numbers are read as a claim about how many platforms are
    // supported. Prose legitimately says "on both platforms" or walks through
    // three in an example; a real support count has never been below ten.
    const claim = /(\d{2,})\s*(?:configured\s+)?(?:platforms|个已配置平台|个平台)/g;
    for (const file of docs.files) {
      const content = fs.readFileSync(file, "utf-8");
      for (const [text, count] of content.matchAll(claim)) {
        expect(
          Number(count),
          `${relative(docs.root, file)} says "${text.trim()}", registry has ` +
            `${PLATFORM_IDS.length}. Check the same page for a platform or ` +
            `flag list to update alongside the number — they are usually ` +
            `separate lines, and bumping only the count is the easy miss.`,
        ).toBe(PLATFORM_IDS.length);
      }
    }
  });
});

// Every `start` / `continue` command renders phase content with
// `get_context.py --mode phase --platform {{CLI_FLAG}}`, so a platform id that
// does not resolve to a label used by workflow.md's marker blocks loses those
// blocks entirely — filter_platform drops them and returns success, so the
// symptom is an empty section rather than an error. claude, kimi, omp and dsh
// all shipped that way until _PLATFORM_MARKER_LABELS was added.
//
// This drives the real Python resolver rather than reimplementing its matching
// rules here: a copy would drift from the code it is meant to protect.
describe("every platform resolves to a marker label workflow.md uses", () => {
  it("no platform id loses its Active Task Routing block", async () => {
    const { execFileSync } = await import("node:child_process");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const testDir = dirname(fileURLToPath(import.meta.url));
    const scriptsDir = join(testDir, "..", "src", "templates", "trellis", "scripts");
    const workflowPath = join(
      testDir,
      "..",
      "src",
      "templates",
      "trellis",
      "workflow.md",
    );
    const flags = PLATFORM_IDS.map((id) => AI_TOOLS[id].cliFlag);

    const probe = [
      "import json, sys",
      `sys.path.insert(0, ${JSON.stringify(scriptsDir)})`,
      "from common.workflow_phase import resolve_effective_platform, filter_platform",
      `content = open(${JSON.stringify(workflowPath)}, encoding="utf-8").read()`,
      "out = {}",
      "for flag in json.loads(sys.argv[1]):",
      "    rendered = filter_platform(content, resolve_effective_platform(flag, {}))",
      // Keep the assertion structural: count bullets surviving inside the
      // routing section rather than matching its prose, which is edited often.
      "    section = rendered.split('### Active Task Routing', 1)",
      "    body = section[1].split('###', 1)[0] if len(section) > 1 else ''",
      "    out[flag] = len([l for l in body.splitlines() if l.startswith('- ')])",
      "print(json.dumps(out))",
    ].join("\n");

    // execFileSync, not execSync: the probe is multi-line, and going through a
    // shell would turn its newlines into literal backslash-n.
    const raw = execFileSync(
      process.env.PYTHON_CMD || "python3",
      ["-c", probe, JSON.stringify(flags)],
      { encoding: "utf-8" },
    );
    const bullets = JSON.parse(raw) as Record<string, number>;

    const empty = Object.entries(bullets)
      .filter(([, count]) => count === 0)
      .map(([flag]) => flag);

    expect(
      empty,
      `these platform ids resolve to a label no marker block lists, so their ` +
        `Active Task Routing section renders empty: ${empty.join(", ")}. Add ` +
        `them to _PLATFORM_MARKER_LABELS in workflow_phase.py, or align the ` +
        `marker label in workflow.md with the id.`,
    ).toEqual([]);
  });
});

// Roundtrip and derived-helper tests are in configurators/index.test.ts
// This file focuses on internal consistency invariants only

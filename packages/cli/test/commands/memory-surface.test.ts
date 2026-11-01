/**
 * Phase 6 surface checks that do not need a fresh git repo:
 * four-host flags, remember-only commands, and template maps.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AI_TOOLS } from "../../src/types/ai-tools.js";
import {
  collectPlatformTemplates,
  getInitToolChoices,
} from "../../src/configurators/index.js";
import {
  getBundledSkillTemplates,
  getCommandTemplates,
  getSkillTemplates,
} from "../../src/templates/common/index.js";
import { runMem } from "../../src/commands/mem.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const FORBIDDEN_BASENAMES = new Set([
  "start.md",
  "continue.md",
  "finish-work.md",
]);

function posixKeys(files: Map<string, string> | undefined): string[] {
  return [...(files?.keys() ?? [])].sort();
}

describe("host CLI surface", () => {
  it("exposes the four original hosts plus DeepSeek Harness and Cursor", () => {
    expect(Object.keys(AI_TOOLS).sort()).toEqual([
      "claude-code",
      "codex",
      "cursor",
      "dsh",
      "opencode",
      "pi",
    ]);
    expect(
      getInitToolChoices()
        .map((t) => t.key)
        .sort(),
    ).toEqual(["claude", "codex", "cursor", "dsh", "opencode", "pi"]);
  });

  it("registers DeepSeek and Cursor without the hosts this release skips", () => {
    const src = readFileSync(join(ROOT, "src/cli/index.ts"), "utf-8");
    expect(src).toMatch(/\.option\("--claude"/);
    expect(src).toMatch(/\.option\("--codex"/);
    expect(src).toMatch(/\.option\("--opencode"/);
    expect(src).toMatch(/\.option\("--pi"/);
    expect(src).toMatch(/\.option\("--dsh"/);
    expect(src).toMatch(/\.option\("--cursor"/);
    expect(src).not.toMatch(/--gemini|--omp|--droid|--kimi|--copilot/);
  });
});

describe("remember-only command templates", () => {
  it("ships remember, update-spec, and session-insight only", () => {
    expect(getCommandTemplates().map((t) => t.name)).toEqual(["remember"]);
    expect(getSkillTemplates().map((t) => t.name)).toEqual(["update-spec"]);
    expect(getBundledSkillTemplates().map((t) => t.name)).toEqual([
      "mini-trellis-session-insight",
    ]);
  });
});

describe("platform template maps", () => {
  it("writes mini-trellis remember/session-insight and no start/finish-work", () => {
    const claude = posixKeys(collectPlatformTemplates("claude-code"));
    const codex = posixKeys(collectPlatformTemplates("codex"));
    const opencode = posixKeys(collectPlatformTemplates("opencode"));
    const pi = posixKeys(collectPlatformTemplates("pi"));
    const all = [...claude, ...codex, ...opencode, ...pi];

    expect(claude).toContain(".claude/commands/mini-trellis/remember.md");
    expect(claude).toContain(".claude/hooks/session-start.py");
    expect(claude).toContain(
      ".claude/skills/mini-trellis-session-insight/SKILL.md",
    );
    expect(claude).toContain(
      ".claude/skills/mini-trellis-update-spec/SKILL.md",
    );

    expect(codex).toContain(".agents/skills/mini-trellis-remember/SKILL.md");
    expect(codex).toContain(".codex/hooks.json");
    expect(codex).toContain(".codex/hooks/session-start.py");

    expect(opencode).toContain(".opencode/commands/mini-trellis/remember.md");
    expect(opencode).not.toContain(
      ".opencode/plugins/inject-workflow-state.js",
    );
    expect(opencode).not.toContain(
      ".opencode/plugins/inject-subagent-context.js",
    );

    expect(pi).toContain(".pi/extensions/mini-trellis/index.ts");
    expect(pi).toContain(".pi/prompts/mini-trellis-remember.md");
    expect(pi).not.toContain(".pi/extensions/trellis/index.ts");

    const dsh = posixKeys(collectPlatformTemplates("dsh"));
    const cursor = posixKeys(collectPlatformTemplates("cursor"));
    expect(dsh).toContain(".dsh/skills/mini-trellis-remember/SKILL.md");
    expect(dsh).toContain(".dsh/skills/mini-trellis-session-insight/SKILL.md");
    expect(dsh.some((rel) => rel.startsWith(".agents/"))).toBe(false);
    expect(dsh.some((rel) => rel.includes("trellis-agent"))).toBe(false);
    expect(dsh.join("\n")).not.toMatch(/trellis_wait|beforeSubmitPrompt/);
    expect(
      collectPlatformTemplates("dsh")?.get(
        ".dsh/skills/mini-trellis-session-insight/SKILL.md",
      ),
    ).toMatch(/no project SessionStart/);
    expect(
      collectPlatformTemplates("dsh")?.get(
        ".dsh/skills/mini-trellis-session-insight/SKILL.md",
      ),
    ).toMatch(/~\/\.dsh\/sessions/);

    expect(cursor).toContain(".cursor/hooks/session-start.py");
    expect(cursor).toContain(".cursor/skills/mini-trellis-remember/SKILL.md");
    expect(cursor.some((rel) => rel.startsWith(".agents/"))).toBe(false);
    expect(cursor.some((rel) => rel.includes("/agents/"))).toBe(false);
    const cursorHooks = JSON.parse(
      collectPlatformTemplates("cursor")?.get(".cursor/hooks.json") ?? "{}",
    ) as { hooks: Record<string, unknown> };
    expect(Object.keys(cursorHooks.hooks)).toEqual(["sessionStart"]);
    expect(JSON.stringify(cursorHooks)).not.toMatch(/beforeSubmitPrompt/);
    expect(
      collectPlatformTemplates("cursor")?.get(
        ".cursor/skills/mini-trellis-remember/SKILL.md",
      ),
    ).toMatch(/Do not copy the same description into a second file/);
    expect(
      collectPlatformTemplates("cursor")?.get(
        ".cursor/skills/mini-trellis-update-spec/SKILL.md",
      ),
    ).toMatch(/Do not record a proposal as a current capability/);
    expect(
      collectPlatformTemplates("cursor")?.get(
        ".cursor/skills/mini-trellis-session-insight/SKILL.md",
      ),
    ).toMatch(/conversation history is not parsed/);

    for (const rel of [...all, ...dsh, ...cursor]) {
      const base = rel.split("/").pop() ?? rel;
      expect(FORBIDDEN_BASENAMES.has(base)).toBe(false);
    }
  });
});

describe("mem help", () => {
  it("lists unified recall/read in top-level help mem", () => {
    const text = execFileSync(
      process.execPath,
      [join(ROOT, "bin/mini-trellis.js"), "help", "mem"],
      { encoding: "utf8" },
    );
    expect(text).toMatch(/recall\|read\|list\|search/);
    expect(text).toContain("project documents");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not teach --phase or task.py", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    runMem(["help"]);
    const text = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(text).toMatch(/mini-trellis mem/);
    expect(text).not.toMatch(/--phase/);
    expect(text).not.toMatch(/task\.py/);
    expect(text).not.toMatch(/brainstorm|finish-work/);
  });
});

describe("session_context has no update probe", () => {
  it("never spawns a version check or teaches trellis update", () => {
    const src = readFileSync(
      join(ROOT, "src/templates/trellis/scripts/common/session_context.py"),
      "utf-8",
    );
    const hook = readFileSync(
      join(ROOT, "src/templates/shared-hooks/session-start.py"),
      "utf-8",
    );
    for (const text of [src, hook]) {
      expect(text).not.toMatch(/get_update_hint|update available/);
      expect(text).not.toMatch(/run trellis update|@mindfoldhq\/trellis/);
    }
  });
});

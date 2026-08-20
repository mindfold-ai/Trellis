import { describe, expect, it } from "vitest";

import {
  buildClaudeArgs,
  INLINE_SYSTEM_PROMPT_MAX_CHARS,
  shouldUseSystemPromptFile,
} from "../../src/commands/channel/adapters/claude.js";

describe("Claude channel adapter buildClaudeArgs", () => {
  it("inlines the system prompt when no prompt file is given", () => {
    const args = buildClaudeArgs({ systemPrompt: "agent body" });
    expect(args).toContain("--append-system-prompt");
    expect(args[args.indexOf("--append-system-prompt") + 1]).toBe("agent body");
    expect(args).not.toContain("--append-system-prompt-file");
  });

  it("skips the system prompt flags entirely for a blank prompt", () => {
    const args = buildClaudeArgs({ systemPrompt: "   " });
    expect(args).not.toContain("--append-system-prompt");
    expect(args).not.toContain("--append-system-prompt-file");
  });

  it("prefers --append-system-prompt-file when systemPromptFile is set", () => {
    const args = buildClaudeArgs({
      systemPrompt: "x".repeat(300_000),
      systemPromptFile: "/tmp/worker.system-prompt.md",
    });
    expect(args).toContain("--append-system-prompt-file");
    expect(args[args.indexOf("--append-system-prompt-file") + 1]).toBe(
      "/tmp/worker.system-prompt.md",
    );
    // The oversized prompt must NOT be inlined on the command line — that is
    // exactly what trips OS argv limits (Windows 32,767-char CreateProcess
    // cap → spawn ENAMETOOLONG; Linux MAX_ARG_STRLEN 128KiB per arg).
    expect(args).not.toContain("--append-system-prompt");
    expect(args.join(" ").length).toBeLessThan(300_000);
  });
});

describe("shouldUseSystemPromptFile", () => {
  it("keeps blank and small prompts inline (works on old Claude Code)", () => {
    expect(shouldUseSystemPromptFile("")).toBe(false);
    expect(shouldUseSystemPromptFile("   \n  ")).toBe(false);
    expect(shouldUseSystemPromptFile("agent body")).toBe(false);
    // At the budget exactly: still inline.
    expect(shouldUseSystemPromptFile("x".repeat(INLINE_SYSTEM_PROMPT_MAX_CHARS))).toBe(false);
  });

  it("routes oversized prompts to a file before they hit argv limits", () => {
    // One char over the budget: must go through a file.
    expect(
      shouldUseSystemPromptFile("x".repeat(INLINE_SYSTEM_PROMPT_MAX_CHARS + 1)),
    ).toBe(true);
    // The original bug: a whole design doc injected via --file.
    expect(shouldUseSystemPromptFile("y".repeat(300_000))).toBe(true);
  });
});

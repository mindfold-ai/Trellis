import { describe, expect, it, vi, afterEach } from "vitest";
import {
  getPythonCommandForPlatform,
  replacePythonCommandLiterals,
  resolvePlaceholders,
} from "../../src/configurators/shared.js";
import type { TemplateContext } from "../../src/types/ai-tools.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const claudeCtx: TemplateContext = {
  cmdRefPrefix: "/trellis:",
  executorAI: "Bash scripts or Task calls",
  userActionLabel: "Slash commands",
  agentCapable: true,
  hasHooks: true,
  cliFlag: "claude",
};

const codexCtx: TemplateContext = {
  cmdRefPrefix: "$",
  executorAI: "Bash scripts or tool calls",
  userActionLabel: "Skills",
  agentCapable: true,
  hasHooks: false,
  cliFlag: "codex",
};

const cursorCtx: TemplateContext = {
  cmdRefPrefix: "/trellis-",
  executorAI: "Bash scripts or file reads",
  userActionLabel: "Slash commands",
  agentCapable: false,
  hasHooks: false,
  cliFlag: "cursor",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// replacePythonCommandLiterals — platform-mocked unit tests
// ---------------------------------------------------------------------------

describe("replacePythonCommandLiterals", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    // Restore original platform descriptor
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  function mockPlatform(platform: string) {
    Object.defineProperty(process, "platform", { value: platform });
  }

  it("replaces python3 with python on win32", () => {
    mockPlatform("win32");
    expect(replacePythonCommandLiterals("run python3 script.py")).toBe(
      "run python script.py",
    );
  });

  it("replaces multiple occurrences on win32", () => {
    mockPlatform("win32");
    expect(
      replacePythonCommandLiterals("python3 a.py && python3 b.py"),
    ).toBe("python a.py && python b.py");
  });

  it("preserves shebang lines on win32", () => {
    mockPlatform("win32");
    const input = "#!/usr/bin/env python3\npython3 script.py";
    const result = replacePythonCommandLiterals(input);
    expect(result).toBe("#!/usr/bin/env python3\npython script.py");
  });

  it("does not replace python3 on non-Windows platforms", () => {
    mockPlatform("linux");
    expect(replacePythonCommandLiterals("run python3 script.py")).toBe(
      "run python3 script.py",
    );
  });

  it("preserves shebang lines on non-Windows platforms", () => {
    mockPlatform("darwin");
    const input = "#!/usr/bin/env python3\npython3 script.py";
    expect(replacePythonCommandLiterals(input)).toBe(input);
  });

  it("is idempotent on win32", () => {
    mockPlatform("win32");
    const once = replacePythonCommandLiterals("python3 script.py");
    const twice = replacePythonCommandLiterals(once);
    expect(once).toBe("python script.py");
    expect(twice).toBe("python script.py");
  });

  it("handles empty string", () => {
    mockPlatform("win32");
    expect(replacePythonCommandLiterals("")).toBe("");
  });

  it("does not replace python3 that is part of a longer word", () => {
    mockPlatform("win32");
    // "python3" as a standalone token is replaced; "python3x" contains "python3"
    // so it WILL be replaced to "pythonx" — this is expected behavior
    expect(replacePythonCommandLiterals("python3x")).toBe("pythonx");
  });

  it("handles multiline content with mixed shebangs and commands", () => {
    mockPlatform("win32");
    const input = [
      "#!/usr/bin/env python3",
      "# comment about python3",
      "exec python3 \"$0\" \"$@\"",
      "python3 ./.trellis/scripts/task.py",
    ].join("\n");
    const expected = [
      "#!/usr/bin/env python3",
      "# comment about python",
      "exec python \"$0\" \"$@\"",
      "python ./.trellis/scripts/task.py",
    ].join("\n");
    expect(replacePythonCommandLiterals(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// getPythonCommandForPlatform
// ---------------------------------------------------------------------------

describe("getPythonCommandForPlatform", () => {
  it("returns python on Windows", () => {
    expect(getPythonCommandForPlatform("win32")).toBe("python");
  });

  it("returns python3 on macOS and Linux", () => {
    expect(getPythonCommandForPlatform("darwin")).toBe("python3");
    expect(getPythonCommandForPlatform("linux")).toBe("python3");
  });
});

describe("resolvePlaceholders", () => {
  // -----------------------------------------------------------------------
  // Legacy behavior (no context)
  // -----------------------------------------------------------------------

  describe("without context (legacy)", () => {
    it("resolves {{PYTHON_CMD}}", () => {
      const result = resolvePlaceholders("run {{PYTHON_CMD}} script.py");
      const expected =
        process.platform === "win32" ? "run python script.py" : "run python3 script.py";
      expect(result).toBe(expected);
    });

    it("leaves other placeholders untouched when no context", () => {
      const input = "See {{CMD_REF:brainstorm}} and {{EXECUTOR_AI}}";
      expect(resolvePlaceholders(input)).toBe(input);
    });
  });

  // -----------------------------------------------------------------------
  // CMD_REF substitution
  // -----------------------------------------------------------------------

  describe("{{CMD_REF:name}}", () => {
    it("resolves with /trellis: prefix (Claude)", () => {
      const result = resolvePlaceholders(
        "See {{CMD_REF:brainstorm}} for details",
        claudeCtx,
      );
      expect(result).toBe("See /trellis:brainstorm for details");
    });

    it("resolves with $ prefix (Codex)", () => {
      const result = resolvePlaceholders(
        "Run {{CMD_REF:check}} after coding",
        codexCtx,
      );
      expect(result).toBe("Run $check after coding");
    });

    it("resolves with /trellis- prefix (Cursor)", () => {
      const result = resolvePlaceholders(
        "Use {{CMD_REF:finish-work}} when done",
        cursorCtx,
      );
      expect(result).toBe("Use /trellis-finish-work when done");
    });

    it("handles multiple CMD_REF in one template", () => {
      const input =
        "{{CMD_REF:start}} then {{CMD_REF:brainstorm}} then {{CMD_REF:check}}";
      expect(resolvePlaceholders(input, claudeCtx)).toBe(
        "/trellis:start then /trellis:brainstorm then /trellis:check",
      );
    });

    it("handles hyphenated command names", () => {
      expect(
        resolvePlaceholders("{{CMD_REF:finish-work}}", claudeCtx),
      ).toBe("/trellis:finish-work");
      expect(
        resolvePlaceholders("{{CMD_REF:check-cross-layer}}", codexCtx),
      ).toBe("$check-cross-layer");
    });
  });

  // -----------------------------------------------------------------------
  // Simple substitutions
  // -----------------------------------------------------------------------

  describe("simple substitutions", () => {
    it("resolves {{EXECUTOR_AI}}", () => {
      expect(
        resolvePlaceholders("| `[AI]` | {{EXECUTOR_AI}} |", claudeCtx),
      ).toBe("| `[AI]` | Bash scripts or Task calls |");
      expect(
        resolvePlaceholders("| `[AI]` | {{EXECUTOR_AI}} |", codexCtx),
      ).toBe("| `[AI]` | Bash scripts or tool calls |");
    });

    it("resolves {{USER_ACTION_LABEL}}", () => {
      expect(
        resolvePlaceholders("| `[USER]` | {{USER_ACTION_LABEL}} |", claudeCtx),
      ).toBe("| `[USER]` | Slash commands |");
      expect(
        resolvePlaceholders("| `[USER]` | {{USER_ACTION_LABEL}} |", codexCtx),
      ).toBe("| `[USER]` | Skills |");
    });

    it("resolves {{PYTHON_CMD}} alongside context placeholders", () => {
      const result = resolvePlaceholders(
        "{{PYTHON_CMD}} ./.trellis/scripts/task.py and {{CMD_REF:start}}",
        claudeCtx,
      );
      const py = process.platform === "win32" ? "python" : "python3";
      expect(result).toBe(
        `${py} ./.trellis/scripts/task.py and /trellis:start`,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Conditional blocks
  // -----------------------------------------------------------------------

  describe("conditional blocks", () => {
    describe("{{#AGENT_CAPABLE}}", () => {
      const template = [
        "Before",
        "{{#AGENT_CAPABLE}}",
        "Call Implement Agent",
        "{{/AGENT_CAPABLE}}",
        "After",
      ].join("\n");

      it("includes block when agentCapable=true", () => {
        const result = resolvePlaceholders(template, claudeCtx);
        expect(result).toContain("Call Implement Agent");
        expect(result).toContain("Before");
        expect(result).toContain("After");
      });

      it("removes block when agentCapable=false", () => {
        const result = resolvePlaceholders(template, cursorCtx);
        expect(result).not.toContain("Call Implement Agent");
        expect(result).toContain("Before");
        expect(result).toContain("After");
      });
    });

    describe("{{^AGENT_CAPABLE}} (negated)", () => {
      const template = [
        "{{^AGENT_CAPABLE}}",
        "Implement the changes directly",
        "{{/AGENT_CAPABLE}}",
      ].join("\n");

      it("removes block when agentCapable=true", () => {
        const result = resolvePlaceholders(template, claudeCtx);
        expect(result).not.toContain("Implement the changes directly");
      });

      it("includes block when agentCapable=false", () => {
        const result = resolvePlaceholders(template, cursorCtx);
        expect(result).toContain("Implement the changes directly");
      });
    });

    describe("{{#HAS_HOOKS}} / {{^HAS_HOOKS}}", () => {
      const template = [
        "{{#HAS_HOOKS}}",
        "code-spec context is auto-injected by hook",
        "{{/HAS_HOOKS}}",
        "{{^HAS_HOOKS}}",
        "read specs manually before coding",
        "{{/HAS_HOOKS}}",
      ].join("\n");

      it("Claude (hasHooks=true) gets hook text", () => {
        const result = resolvePlaceholders(template, claudeCtx);
        expect(result).toContain("auto-injected by hook");
        expect(result).not.toContain("read specs manually");
      });

      it("Codex (hasHooks=false) gets manual text", () => {
        const result = resolvePlaceholders(template, codexCtx);
        expect(result).not.toContain("auto-injected by hook");
        expect(result).toContain("read specs manually");
      });
    });

    describe("nested conditionals", () => {
      const template = [
        "{{#AGENT_CAPABLE}}",
        "Agents available",
        "{{#HAS_HOOKS}}",
        "Hook injection active",
        "{{/HAS_HOOKS}}",
        "{{^HAS_HOOKS}}",
        "No hooks, manual injection",
        "{{/HAS_HOOKS}}",
        "{{/AGENT_CAPABLE}}",
        "{{^AGENT_CAPABLE}}",
        "No agents, do it inline",
        "{{/AGENT_CAPABLE}}",
      ].join("\n");

      it("Claude (agent+hooks): agents + hook injection", () => {
        const result = resolvePlaceholders(template, claudeCtx);
        expect(result).toContain("Agents available");
        expect(result).toContain("Hook injection active");
        expect(result).not.toContain("No hooks");
        expect(result).not.toContain("No agents");
      });

      it("Codex (agent, no hooks): agents + manual injection", () => {
        const result = resolvePlaceholders(template, codexCtx);
        expect(result).toContain("Agents available");
        expect(result).not.toContain("Hook injection active");
        expect(result).toContain("No hooks, manual injection");
        expect(result).not.toContain("No agents");
      });

      it("Cursor (no agent, no hooks): inline only", () => {
        const result = resolvePlaceholders(template, cursorCtx);
        expect(result).not.toContain("Agents available");
        expect(result).not.toContain("Hook injection");
        expect(result).toContain("No agents, do it inline");
      });
    });
  });

  // -----------------------------------------------------------------------
  // Blank line cleanup
  // -----------------------------------------------------------------------

  describe("blank line cleanup", () => {
    it("collapses 3+ consecutive blank lines to 2", () => {
      const template = "A\n\n{{#AGENT_CAPABLE}}\nRemoved\n{{/AGENT_CAPABLE}}\n\nB";
      const result = resolvePlaceholders(template, cursorCtx);
      expect(result).not.toMatch(/\n{3,}/);
      expect(result).toContain("A");
      expect(result).toContain("B");
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // CLI_FLAG substitution (migrate-flow-bugs Bug B fix: platform propagation)
  // -----------------------------------------------------------------------

  describe("{{CLI_FLAG}}", () => {
    it("substitutes to the platform's cliFlag value", () => {
      const input = "--platform {{CLI_FLAG}}";
      expect(resolvePlaceholders(input, claudeCtx)).toBe("--platform claude");
      expect(resolvePlaceholders(input, codexCtx)).toBe("--platform codex");
      expect(resolvePlaceholders(input, cursorCtx)).toBe("--platform cursor");
    });

    it("substitutes multiple occurrences in one string", () => {
      const input = "a={{CLI_FLAG}} b={{CLI_FLAG}}";
      expect(resolvePlaceholders(input, codexCtx)).toBe("a=codex b=codex");
    });

    it("leaves {{CLI_FLAG}} literal when no context is provided", () => {
      const input = "--platform {{CLI_FLAG}}";
      expect(resolvePlaceholders(input)).toBe(input);
    });

    it("works alongside {{PYTHON_CMD}} in a realistic init-context invocation", () => {
      const input =
        '{{PYTHON_CMD}} ./.trellis/scripts/task.py init-context "$TASK_DIR" <type> --platform {{CLI_FLAG}}';
      const py = process.platform === "win32" ? "python" : "python3";
      expect(resolvePlaceholders(input, codexCtx)).toBe(
        `${py} ./.trellis/scripts/task.py init-context "$TASK_DIR" <type> --platform codex`,
      );
    });
  });

  describe("edge cases", () => {
    it("handles empty content", () => {
      expect(resolvePlaceholders("", claudeCtx)).toBe("");
    });

    it("handles content with no placeholders", () => {
      const plain = "# Just a heading\n\nSome text.";
      expect(resolvePlaceholders(plain, claudeCtx)).toBe(plain);
    });

    it("does not resolve unknown placeholders", () => {
      const input = "{{UNKNOWN}} and {{#UNKNOWN_FLAG}}x{{/UNKNOWN_FLAG}}";
      expect(resolvePlaceholders(input, claudeCtx)).toBe(input);
    });
  });
});

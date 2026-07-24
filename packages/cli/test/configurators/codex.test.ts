import { describe, expect, it, afterEach, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  extractCodexAgentModelKeys,
  applyCodexAgentModelKeys,
  preserveCodexAgentModelKeys,
} from "../../src/configurators/codex.js";
import { getAllAgents } from "../../src/templates/codex/index.js";

// ---------------------------------------------------------------------------
// extractCodexAgentModelKeys
// ---------------------------------------------------------------------------

describe("extractCodexAgentModelKeys", () => {
  it("returns empty object when no model keys are present", () => {
    const content = [
      'name = "trellis-implement"',
      'sandbox_mode = "workspace-write"',
      "",
      'developer_instructions = """',
      "body",
      '"""',
    ].join("\n");
    expect(extractCodexAgentModelKeys(content)).toEqual({});
  });

  it("ignores commented hint lines", () => {
    const content = [
      'sandbox_mode = "workspace-write"',
      '# model = "gpt-5.4"',
      '# model_reasoning_effort = "low"',
    ].join("\n");
    expect(extractCodexAgentModelKeys(content)).toEqual({});
  });

  it("extracts both keys when uncommented", () => {
    const content = [
      'sandbox_mode = "workspace-write"',
      'model = "gpt-5.6-luna"',
      'model_reasoning_effort = "low"',
    ].join("\n");
    expect(extractCodexAgentModelKeys(content)).toEqual({
      model: "gpt-5.6-luna",
      model_reasoning_effort: "low",
    });
  });

  it("extracts a single key when only one is set", () => {
    const content = [
      'sandbox_mode = "workspace-write"',
      'model_reasoning_effort = "medium"',
    ].join("\n");
    expect(extractCodexAgentModelKeys(content)).toEqual({
      model_reasoning_effort: "medium",
    });
  });

  it("unescapes quoted values", () => {
    const content = 'model = "gpt-\\"custom\\""';
    expect(extractCodexAgentModelKeys(content)).toEqual({
      model: 'gpt-"custom"',
    });
  });

  it("tolerates a trailing inline comment", () => {
    const content = 'model = "gpt-5.4" # pinned for cost control';
    expect(extractCodexAgentModelKeys(content)).toEqual({ model: "gpt-5.4" });
  });

  it("does not extract a key-shaped line from inside a multi-line string body", () => {
    const content = [
      'sandbox_mode = "workspace-write"',
      "",
      'developer_instructions = """',
      "Example: pin a model by setting",
      'model = "gpt-fake-inside-body"',
      "in the toml.",
      '"""',
    ].join("\n");
    expect(extractCodexAgentModelKeys(content)).toEqual({});
  });

  it("still extracts real keys that appear after a closed multi-line string", () => {
    const content = [
      'developer_instructions = """',
      "body",
      '"""',
      'model = "gpt-5.6-luna"',
    ].join("\n");
    expect(extractCodexAgentModelKeys(content)).toEqual({
      model: "gpt-5.6-luna",
    });
  });
});

// ---------------------------------------------------------------------------
// applyCodexAgentModelKeys
// ---------------------------------------------------------------------------

describe("applyCodexAgentModelKeys", () => {
  const fresh = [
    'name = "trellis-implement"',
    'sandbox_mode = "workspace-write"',
    '# model = "gpt-5.4"',
    '# model_reasoning_effort = "low"',
    "",
    'developer_instructions = """body"""',
  ].join("\n");

  it("returns content unchanged when no keys are preserved", () => {
    expect(applyCodexAgentModelKeys(fresh, {})).toBe(fresh);
  });

  it("inserts both lines right after sandbox_mode", () => {
    const result = applyCodexAgentModelKeys(fresh, {
      model: "gpt-5.6-luna",
      model_reasoning_effort: "low",
    });
    const lines = result.split("\n");
    const sandboxIdx = lines.findIndex((l) => l.startsWith("sandbox_mode"));
    expect(lines[sandboxIdx + 1]).toBe('model = "gpt-5.6-luna"');
    expect(lines[sandboxIdx + 2]).toBe('model_reasoning_effort = "low"');
    // The commented hint lines stay untouched further down.
    expect(result).toContain('# model = "gpt-5.4"');
  });

  it("inserts only the set key", () => {
    const result = applyCodexAgentModelKeys(fresh, {
      model_reasoning_effort: "medium",
    });
    expect(result).toContain('model_reasoning_effort = "medium"');
    expect(result).not.toMatch(/^model = "/m);
  });

  it("TOML-escapes quotes and backslashes in preserved values", () => {
    const result = applyCodexAgentModelKeys(fresh, {
      model: 'weird"model\\name',
    });
    expect(result).toContain('model = "weird\\"model\\\\name"');
  });
});

// ---------------------------------------------------------------------------
// preserveCodexAgentModelKeys (filesystem integration)
// ---------------------------------------------------------------------------

describe("preserveCodexAgentModelKeys", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-codex-model-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function freshAgentFiles(): Map<string, string> {
    const files = new Map<string, string>();
    for (const agent of getAllAgents()) {
      files.set(`.codex/agents/${agent.name}.toml`, agent.content);
    }
    return files;
  }

  it("leaves fresh render untouched when no on-disk file exists (fresh init)", () => {
    const files = freshAgentFiles();
    const before = new Map(files);
    preserveCodexAgentModelKeys(tmpDir, files);
    expect(files).toEqual(before);
    for (const [, content] of files) {
      expect(content).not.toMatch(/^model(_reasoning_effort)? = "/m);
    }
  });

  it("preserves both keys from the on-disk file into all three tomls it applies to", () => {
    const agentDir = path.join(tmpDir, ".codex", "agents");
    fs.mkdirSync(agentDir, { recursive: true });
    for (const agent of getAllAgents()) {
      const existing =
        agent.content.trimEnd() +
        '\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "low"\n';
      fs.writeFileSync(path.join(agentDir, `${agent.name}.toml`), existing);
    }

    const files = freshAgentFiles();
    preserveCodexAgentModelKeys(tmpDir, files);

    expect(getAllAgents().length).toBeGreaterThanOrEqual(3);
    for (const agent of getAllAgents()) {
      const content = files.get(`.codex/agents/${agent.name}.toml`) ?? "";
      expect(content).toContain('model = "gpt-5.4"');
      expect(content).toContain('model_reasoning_effort = "low"');
    }
  });

  it("removing the keys on disk removes them from the next render (idempotent)", () => {
    const agentDir = path.join(tmpDir, ".codex", "agents");
    fs.mkdirSync(agentDir, { recursive: true });
    const [firstAgent] = getAllAgents();
    if (!firstAgent) throw new Error("expected at least one codex agent");

    // First render: keys present on disk.
    fs.writeFileSync(
      path.join(agentDir, `${firstAgent.name}.toml`),
      firstAgent.content.trimEnd() + '\nmodel = "gpt-5.4"\n',
    );
    let files = freshAgentFiles();
    preserveCodexAgentModelKeys(tmpDir, files);
    expect(files.get(`.codex/agents/${firstAgent.name}.toml`)).toContain(
      'model = "gpt-5.4"',
    );

    // User removes the line from the on-disk file, then update re-renders.
    fs.writeFileSync(
      path.join(agentDir, `${firstAgent.name}.toml`),
      firstAgent.content,
    );
    files = freshAgentFiles();
    preserveCodexAgentModelKeys(tmpDir, files);
    expect(
      files.get(`.codex/agents/${firstAgent.name}.toml`),
    ).not.toMatch(/^model = "/m);
  });

  it("does not touch files outside .codex/agents/trellis-*.toml", () => {
    const files = new Map<string, string>([
      [".codex/hooks.json", '{"hooks":[]}'],
    ]);
    const before = new Map(files);
    preserveCodexAgentModelKeys(tmpDir, files);
    expect(files).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Static templates ship commented hints, no live model lines
// ---------------------------------------------------------------------------

describe("codex agent toml templates", () => {
  it("ship commented model hint lines but no live model lines", () => {
    for (const agent of getAllAgents()) {
      expect(agent.content).toContain('# model = "gpt-5.6-terra"');
      expect(agent.content).toContain('# model_reasoning_effort = "high"');
      expect(agent.content).not.toMatch(/^model = "/m);
      expect(agent.content).not.toMatch(/^model_reasoning_effort = "/m);
    }
  });
});

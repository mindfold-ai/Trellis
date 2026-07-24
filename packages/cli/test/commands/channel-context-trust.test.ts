import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadAgent } from "../../src/commands/channel/agent-loader.js";
import { assembleContext } from "../../src/commands/channel/context-loader.js";
import {
  parseChannelTrustSection,
  resolveTrustedRoots,
} from "../../src/commands/channel/context-trust.js";

const isWin = process.platform === "win32";

function realTmp(): string {
  return fs.realpathSync(os.tmpdir());
}

describe("parseChannelTrustSection", () => {
  it("returns empty when channel section absent", () => {
    expect(parseChannelTrustSection("packages:\n  cli:\n    path: x\n")).toEqual(
      { trustedDirs: [] },
    );
  });

  it("parses a trusted_context_dirs list", () => {
    const content = [
      "channel:",
      "  worker_guard:",
      "    idle_timeout: 5m",
      "  trusted_context_dirs:",
      "    - /work/user/trellis_workspace",
      "    - /another/dir  # trailing comment",
      "",
      "next_section: 1",
    ].join("\n");
    const result = parseChannelTrustSection(content);
    expect(result.trustedDirs).toEqual([
      "/work/user/trellis_workspace",
      "/another/dir",
    ]);
  });

  it("parses auto_trust_trellis_symlinks true/false", () => {
    expect(
      parseChannelTrustSection("channel:\n  auto_trust_trellis_symlinks: false\n")
        .autoTrustSymlinks,
    ).toBe(false);
    expect(
      parseChannelTrustSection("channel:\n  auto_trust_trellis_symlinks: true\n")
        .autoTrustSymlinks,
    ).toBe(true);
  });

  it("ignores commented-out entries", () => {
    const content = [
      "channel:",
      "  # trusted_context_dirs:",
      "  #   - /work/user/trellis_workspace",
      "  # auto_trust_trellis_symlinks: false",
    ].join("\n");
    const result = parseChannelTrustSection(content);
    expect(result.trustedDirs).toEqual([]);
    expect(result.autoTrustSymlinks).toBeUndefined();
  });

  it("stops the list at the next key within the section", () => {
    const content = [
      "channel:",
      "  trusted_context_dirs:",
      "    - /a",
      "  auto_trust_trellis_symlinks: false",
    ].join("\n");
    const result = parseChannelTrustSection(content);
    expect(result.trustedDirs).toEqual(["/a"]);
    expect(result.autoTrustSymlinks).toBe(false);
  });
});

describe("resolveTrustedRoots", () => {
  let tmpDir: string;
  let cwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(realTmp(), "trellis-trust-test-"));
    cwd = path.join(tmpDir, "project");
    fs.mkdirSync(path.join(cwd, ".trellis"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty set with no config and no symlinks", () => {
    expect(resolveTrustedRoots(cwd)).toEqual([]);
  });

  it("adds a configured trusted_context_dirs entry (realpath)", () => {
    const extDir = path.join(tmpDir, "ext");
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".trellis", "config.yaml"),
      `channel:\n  trusted_context_dirs:\n    - ${extDir}\n`,
    );
    const roots = resolveTrustedRoots(cwd);
    expect(roots).toEqual([fs.realpathSync(extDir)]);
  });

  it("skips a non-existent trusted_context_dirs entry with a warning", () => {
    const missing = path.join(tmpDir, "does-not-exist");
    fs.writeFileSync(
      path.join(cwd, ".trellis", "config.yaml"),
      `channel:\n  trusted_context_dirs:\n    - ${missing}\n`,
    );
    const originalWrite = process.stderr.write.bind(process.stderr);
    const warnings: string[] = [];
    process.stderr.write = ((chunk: string) => {
      warnings.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      expect(resolveTrustedRoots(cwd)).toEqual([]);
    } finally {
      process.stderr.write = originalWrite;
    }
    expect(warnings.some((w) => w.includes("trusted_context_dirs"))).toBe(true);
  });

  it.skipIf(isWin)(
    "auto-trusts .trellis/tasks when it is a top-level symlink",
    () => {
      const extTasks = path.join(tmpDir, "ext-tasks");
      fs.mkdirSync(extTasks, { recursive: true });
      fs.symlinkSync(extTasks, path.join(cwd, ".trellis", "tasks"), "dir");
      const roots = resolveTrustedRoots(cwd);
      expect(roots).toEqual([fs.realpathSync(extTasks)]);
    },
  );

  it.skipIf(isWin)(
    "auto-trusts .trellis/workspace when it is a top-level symlink",
    () => {
      const extWorkspace = path.join(tmpDir, "ext-workspace");
      fs.mkdirSync(extWorkspace, { recursive: true });
      fs.symlinkSync(
        extWorkspace,
        path.join(cwd, ".trellis", "workspace"),
        "dir",
      );
      const roots = resolveTrustedRoots(cwd);
      expect(roots).toEqual([fs.realpathSync(extWorkspace)]);
    },
  );

  it.skipIf(isWin)(
    "does not auto-trust when auto_trust_trellis_symlinks is false",
    () => {
      const extTasks = path.join(tmpDir, "ext-tasks");
      fs.mkdirSync(extTasks, { recursive: true });
      fs.symlinkSync(extTasks, path.join(cwd, ".trellis", "tasks"), "dir");
      fs.writeFileSync(
        path.join(cwd, ".trellis", "config.yaml"),
        "channel:\n  auto_trust_trellis_symlinks: false\n",
      );
      expect(resolveTrustedRoots(cwd)).toEqual([]);
    },
  );

  it.skipIf(isWin)(
    "does not auto-trust a nested symlink (only top-level tasks/workspace count)",
    () => {
      const evilTarget = path.join(tmpDir, "evil");
      fs.mkdirSync(evilTarget, { recursive: true });
      fs.mkdirSync(path.join(cwd, ".trellis", "tasks", "x"), {
        recursive: true,
      });
      fs.symlinkSync(
        evilTarget,
        path.join(cwd, ".trellis", "tasks", "x", "evil"),
        "dir",
      );
      expect(resolveTrustedRoots(cwd)).toEqual([]);
    },
  );
});

describe("assembleContext with trusted roots (#414 repro)", () => {
  let tmpDir: string;
  let cwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(realTmp(), "trellis-trust-ctx-test-"));
    cwd = path.join(tmpDir, "project");
    fs.mkdirSync(path.join(cwd, ".trellis"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.skipIf(isWin)(
    "loads --jsonl-referenced files through an auto-trusted .trellis/tasks symlink",
    () => {
      const extTasks = path.join(tmpDir, "ext-tasks");
      const taskDir = path.join(extTasks, "x");
      fs.mkdirSync(taskDir, { recursive: true });
      const contextFile = path.join(taskDir, "prd.md");
      fs.writeFileSync(contextFile, "# PRD content\n");
      const jsonlPath = path.join(taskDir, "implement.jsonl");
      fs.writeFileSync(
        jsonlPath,
        `${JSON.stringify({ file: contextFile, reason: "prd" })}\n`,
      );
      fs.symlinkSync(extTasks, path.join(cwd, ".trellis", "tasks"), "dir");

      const trustedRoots = resolveTrustedRoots(cwd);
      const result = assembleContext(cwd, [], [jsonlPath], trustedRoots);
      expect(result.prompt).toContain("# PRD content");
    },
  );

  it.skipIf(isWin)(
    "refuses the same file when auto-trust is disabled and no allowlist is set",
    () => {
      const extTasks = path.join(tmpDir, "ext-tasks");
      const taskDir = path.join(extTasks, "x");
      fs.mkdirSync(taskDir, { recursive: true });
      const contextFile = path.join(taskDir, "prd.md");
      fs.writeFileSync(contextFile, "# PRD content\n");
      const jsonlPath = path.join(taskDir, "implement.jsonl");
      fs.writeFileSync(
        jsonlPath,
        `${JSON.stringify({ file: contextFile, reason: "prd" })}\n`,
      );
      fs.symlinkSync(extTasks, path.join(cwd, ".trellis", "tasks"), "dir");
      fs.writeFileSync(
        path.join(cwd, ".trellis", "config.yaml"),
        "channel:\n  auto_trust_trellis_symlinks: false\n",
      );

      const trustedRoots = resolveTrustedRoots(cwd);
      expect(trustedRoots).toEqual([]);
      // jsonl itself lives outside cwd too, so it is refused before any
      // entry is read — prompt stays empty.
      const result = assembleContext(cwd, [], [jsonlPath], trustedRoots);
      expect(result.prompt).toBe("");
    },
  );

  it("refuses --file /etc/passwd (absolute path outside cwd, no trust)", () => {
    fs.mkdirSync(path.join(cwd, "sub"), { recursive: true });
    const result = assembleContext(
      path.join(cwd, "sub"),
      ["/etc/passwd"],
      [],
      [],
    );
    expect(result.prompt).toBe("");
    expect(result.paths).toEqual([]);
  });

  it("refuses --file ../../outside (relative escape, no trust)", () => {
    const outside = path.join(tmpDir, "outside.md");
    fs.writeFileSync(outside, "secret\n");
    const deepCwd = path.join(cwd, "a", "b");
    fs.mkdirSync(deepCwd, { recursive: true });
    const result = assembleContext(deepCwd, ["../../../outside.md"], [], []);
    expect(result.prompt).toBe("");
  });

  it.skipIf(isWin)(
    "refuses a nested symlink planted under a non-symlinked .trellis/tasks",
    () => {
      const evilTarget = path.join(tmpDir, "evil-secret.txt");
      fs.writeFileSync(evilTarget, "top secret\n");
      const taskDir = path.join(cwd, ".trellis", "tasks", "x");
      fs.mkdirSync(taskDir, { recursive: true });
      const evilLink = path.join(taskDir, "evil");
      fs.symlinkSync(evilTarget, evilLink, "file");

      const trustedRoots = resolveTrustedRoots(cwd);
      expect(trustedRoots).toEqual([]);
      const result = assembleContext(cwd, [evilLink], [], trustedRoots);
      expect(result.prompt).toBe("");
    },
  );

  it.skipIf(isWin)(
    "accepts files under a channel.trusted_context_dirs allowlist entry regardless of symlinks",
    () => {
      const extDir = path.join(tmpDir, "allowlisted");
      fs.mkdirSync(extDir, { recursive: true });
      const contextFile = path.join(extDir, "notes.md");
      fs.writeFileSync(contextFile, "notes content\n");
      fs.writeFileSync(
        path.join(cwd, ".trellis", "config.yaml"),
        `channel:\n  trusted_context_dirs:\n    - ${extDir}\n`,
      );

      const trustedRoots = resolveTrustedRoots(cwd);
      const result = assembleContext(cwd, [contextFile], [], trustedRoots);
      expect(result.prompt).toContain("notes content");
    },
  );

  it("refuses a sibling directory whose name merely prefix-matches a trusted root", () => {
    const trustedDir = path.join(tmpDir, "trellis_workspace");
    const evilSibling = path.join(tmpDir, "trellis_workspace-evil");
    fs.mkdirSync(trustedDir, { recursive: true });
    fs.mkdirSync(evilSibling, { recursive: true });
    const evilFile = path.join(evilSibling, "secret.md");
    fs.writeFileSync(evilFile, "should not load\n");
    fs.writeFileSync(
      path.join(cwd, ".trellis", "config.yaml"),
      `channel:\n  trusted_context_dirs:\n    - ${trustedDir}\n`,
    );

    const trustedRoots = resolveTrustedRoots(cwd);
    expect(trustedRoots).toEqual([fs.realpathSync(trustedDir)]);
    const result = assembleContext(cwd, [evilFile], [], trustedRoots);
    expect(result.prompt).toBe("");
  });

  it("accepts a relative trusted_context_dirs entry resolved against cwd", () => {
    const extDir = path.join(tmpDir, "rel-allowlisted");
    fs.mkdirSync(extDir, { recursive: true });
    const contextFile = path.join(extDir, "notes.md");
    fs.writeFileSync(contextFile, "relative entry content\n");
    fs.writeFileSync(
      path.join(cwd, ".trellis", "config.yaml"),
      "channel:\n  trusted_context_dirs:\n    - ../rel-allowlisted\n",
    );

    const trustedRoots = resolveTrustedRoots(cwd);
    expect(trustedRoots).toEqual([fs.realpathSync(extDir)]);
    const result = assembleContext(cwd, [contextFile], [], trustedRoots);
    expect(result.prompt).toContain("relative entry content");
  });
});

describe("agent-loader honors trusted roots", () => {
  let tmpDir: string;
  let cwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(realTmp(), "trellis-trust-agent-test-"));
    cwd = path.join(tmpDir, "project");
    fs.mkdirSync(path.join(cwd, ".trellis"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.skipIf(isWin)(
    "loads an agent reached through a trusted-root .trellis/agents symlink",
    () => {
      // .trellis itself isn't in the auto-trust list (only tasks/workspace),
      // so exercise the allowlist path instead: symlink .trellis/agents to
      // a dir inside a channel.trusted_context_dirs entry.
      const extRoot = path.join(tmpDir, "ext-root");
      const extAgents = path.join(extRoot, "agents");
      fs.mkdirSync(extAgents, { recursive: true });
      fs.writeFileSync(
        path.join(extAgents, "architect.md"),
        ["---", "name: architect", "provider: claude", "---", "", "Body"].join(
          "\n",
        ),
      );
      fs.symlinkSync(extAgents, path.join(cwd, ".trellis", "agents"), "dir");
      fs.writeFileSync(
        path.join(cwd, ".trellis", "config.yaml"),
        `channel:\n  trusted_context_dirs:\n    - ${extRoot}\n`,
      );

      const trustedRoots = resolveTrustedRoots(cwd);
      const agent = loadAgent("architect", cwd, trustedRoots);
      expect(agent.systemPrompt).toBe("Body");
      expect(agent.provider).toBe("claude");
    },
  );

  it("without trusted roots, agent files still resolve normally under agentsRoot", () => {
    fs.mkdirSync(path.join(cwd, ".trellis", "agents"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".trellis", "agents", "architect.md"),
      ["---", "name: architect", "provider: claude", "---", "", "Body"].join(
        "\n",
      ),
    );
    const agent = loadAgent("architect", cwd, []);
    expect(agent.systemPrompt).toBe("Body");
  });
});

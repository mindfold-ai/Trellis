import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveProviderPath } from "../../src/commands/channel/supervisor.js";

describe("resolveProviderPath", () => {
  let tmpDir: string;
  let originalPath: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-provider-"));
    originalPath = process.env.PATH;
    process.env.PATH = tmpDir;
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
  });

  afterEach(() => {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeShimTarget(relativeTarget: string, baseDir = tmpDir): string {
    const target = path.join(baseDir, relativeTarget);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "", "utf8");
    return target;
  }

  it("resolves direct exe npm shims without prefix args", () => {
    const exePath = writeShimTarget(
      "node_modules\\@anthropic-ai\\claude\\claude.exe",
    );
    fs.writeFileSync(
      path.join(tmpDir, "claude.cmd"),
      '@IF EXIST "%dp0%\\node_modules\\@anthropic-ai\\claude\\claude.exe" "%dp0%\\node_modules\\@anthropic-ai\\claude\\claude.exe" %*\r\n',
      "utf8",
    );
    expect(resolveProviderPath("claude")).toEqual({
      command: exePath,
      prefixArgs: [],
    });
  });

  it("resolves node-script npm shims through the current Node executable", () => {
    const jsPath = writeShimTarget(
      "node_modules\\@openai\\codex\\bin\\codex.js",
    );
    fs.writeFileSync(
      path.join(tmpDir, "codex.cmd"),
      '@IF EXIST "%dp0%\\node.exe" (\r\n  "%dp0%\\node.exe"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n) ELSE (\r\n  "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n)\r\n',
      "utf8",
    );
    expect(resolveProviderPath("codex")).toEqual({
      command: process.execPath,
      prefixArgs: [jsPath],
    });
  });

  it("checks local node_modules bin before PATH", () => {
    const projectDir = path.join(tmpDir, "project");
    const binDir = path.join(projectDir, "node_modules", ".bin");
    const jsPath = writeShimTarget(
      "node_modules\\@openai\\codex\\bin\\codex.js",
      binDir,
    );
    process.env.PATH = path.join(tmpDir, "global-bin");
    fs.writeFileSync(
      path.join(binDir, "codex.cmd"),
      '"%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n',
      "utf8",
    );
    expect(resolveProviderPath("codex", projectDir)).toEqual({
      command: process.execPath,
      prefixArgs: [jsPath],
    });
  });

  it("falls back to the provider name when no shim target can be resolved", () => {
    fs.writeFileSync(
      path.join(tmpDir, "codex.cmd"),
      '"%_prog%"  "%dp0%\\missing\\codex.js" %*\r\n',
      "utf8",
    );
    expect(resolveProviderPath("codex")).toEqual({
      command: "codex",
      prefixArgs: [],
    });
  });
});

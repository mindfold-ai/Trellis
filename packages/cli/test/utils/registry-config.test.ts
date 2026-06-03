import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  loadSpecRegistryConfig,
  writeSpecRegistryConfig,
} from "../../src/utils/registry-config.js";

describe("registry-config", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-reg-config-"));
    fs.mkdirSync(path.join(tmpDir, ".trellis"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when config.yaml is missing", () => {
    expect(loadSpecRegistryConfig(tmpDir)).toBeNull();
  });

  it("writes and reads registry spec source", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "config.yaml"),
      "# Trellis Configuration\n",
      "utf-8",
    );

    writeSpecRegistryConfig(tmpDir, { source: "gitlab:org/repo/spec" });

    expect(loadSpecRegistryConfig(tmpDir)).toEqual({
      source: "gitlab:org/repo/spec",
    });
  });

  it("writes and reads registry marketplace template source", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "config.yaml"),
      "# Trellis Configuration\n",
      "utf-8",
    );

    writeSpecRegistryConfig(tmpDir, {
      source: "gitlab:org/repo/marketplace",
      template: "golang-spec",
    });

    expect(loadSpecRegistryConfig(tmpDir)).toEqual({
      source: "gitlab:org/repo/marketplace",
      template: "golang-spec",
    });
  });

  it("preserves self-hosted SSH registry source strings", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "config.yaml"),
      "# Trellis Configuration\n",
      "utf-8",
    );

    writeSpecRegistryConfig(tmpDir, {
      source: "git@git.ppdaicorp.com:xionghongwei/trellis-spec.git",
      template: "golang-spec",
    });

    expect(loadSpecRegistryConfig(tmpDir)).toEqual({
      source: "git@git.ppdaicorp.com:xionghongwei/trellis-spec.git",
      template: "golang-spec",
    });
  });

  it("reads quoted registry spec source", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "config.yaml"),
      "registry:\n  spec:\n    source: 'gh:org/repo/spec#main'\n    template: \"backend\"\n",
      "utf-8",
    );

    expect(loadSpecRegistryConfig(tmpDir)).toEqual({
      source: "gh:org/repo/spec#main",
      template: "backend",
    });
  });

  it("does not duplicate an existing registry section", () => {
    const configPath = path.join(tmpDir, ".trellis", "config.yaml");
    fs.writeFileSync(
      configPath,
      "registry:\n  spec:\n    source: gh:org/repo/spec\n",
      "utf-8",
    );

    writeSpecRegistryConfig(tmpDir, { source: "gh:other/repo/spec" });

    const config = fs.readFileSync(configPath, "utf-8");
    expect(config.match(/^registry:/gm)).toHaveLength(1);
    expect(loadSpecRegistryConfig(tmpDir)).toEqual({
      source: "gh:other/repo/spec",
    });
  });

  it("updates an existing registry section", () => {
    const configPath = path.join(tmpDir, ".trellis", "config.yaml");
    fs.writeFileSync(
      configPath,
      "registry:\n  spec:\n    source: gitlab:old/spec\n",
      "utf-8",
    );

    writeSpecRegistryConfig(tmpDir, {
      source: "git@git.ppdaicorp.com:xionghongwei/trellis-spec.git",
      template: "golang-spec",
    });

    const config = fs.readFileSync(configPath, "utf-8");
    expect(config.match(/^registry:/gm)).toHaveLength(1);
    expect(loadSpecRegistryConfig(tmpDir)).toEqual({
      source: "git@git.ppdaicorp.com:xionghongwei/trellis-spec.git",
      template: "golang-spec",
    });
  });

  it("adds spec config under an existing registry section", () => {
    const configPath = path.join(tmpDir, ".trellis", "config.yaml");
    fs.writeFileSync(
      configPath,
      "registry:\n  marketplace:\n    source: gh:org/marketplace\n\ncommands:\n  skip: []\n",
      "utf-8",
    );

    writeSpecRegistryConfig(tmpDir, {
      source: "gh:org/specs/golang",
      template: "golang-spec",
    });

    const config = fs.readFileSync(configPath, "utf-8");
    expect(config.match(/^registry:/gm)).toHaveLength(1);
    expect(config).toContain("  marketplace:\n    source: gh:org/marketplace");
    expect(loadSpecRegistryConfig(tmpDir)).toEqual({
      source: "gh:org/specs/golang",
      template: "golang-spec",
    });
  });
});

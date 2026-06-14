import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  normalizeLocale,
  readProjectLocale,
  resolveLocale,
  setLocale,
  t,
} from "../../src/i18n/index.js";

describe("i18n", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-i18n-"));
    setLocale("en");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    setLocale("en");
  });

  it("normalizes supported locale aliases", () => {
    expect(normalizeLocale("zh-CN")).toBe("zh");
    expect(normalizeLocale("zh_Hans")).toBe("zh");
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("fr-FR")).toBeUndefined();
  });

  it("resolves locale by CLI, env, project config, then default", () => {
    const workflowDir = path.join(tmpDir, ".trellis");
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(
      path.join(workflowDir, "config.yaml"),
      "language: zh\n",
      "utf-8",
    );

    expect(
      resolveLocale({
        cliLocale: "en",
        cwd: tmpDir,
        env: { TRELLIS_LANG: "zh" },
      }),
    ).toBe("en");
    expect(resolveLocale({ cwd: tmpDir, env: {} })).toBe("zh");
    expect(resolveLocale({ env: { LANG: "zh_CN.UTF-8" } })).toBe("en");
    expect(resolveLocale({ env: {} })).toBe("en");
  });

  it("reads project locale from config.yaml", () => {
    const workflowDir = path.join(tmpDir, ".trellis");
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(
      path.join(workflowDir, "config.yaml"),
      "# comment\nlanguage: zh\n",
      "utf-8",
    );

    expect(readProjectLocale(tmpDir)).toBe("zh");
  });

  it("formats localized messages with placeholders", () => {
    expect(
      t(
        "update.complete",
        { action: "Update", projectVersion: "0.1.0", cliVersion: "0.2.0" },
        "en",
      ),
    ).toBe("Update complete! (0.1.0 -> 0.2.0)");

    expect(
      t(
        "update.complete",
        { action: "更新", projectVersion: "0.1.0", cliVersion: "0.2.0" },
        "zh",
      ),
    ).toBe("更新完成！(0.1.0 -> 0.2.0)");
  });
});

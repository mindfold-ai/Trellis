import { execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import {
  isSupportedPythonVersion,
  requireSupportedPython,
} from "../../src/commands/init.js";

describe("isSupportedPythonVersion", () => {
  it("accepts Python 3.9 and newer", () => {
    expect(isSupportedPythonVersion("Python 3.9.6")).toBe(true);
    expect(isSupportedPythonVersion("Python 3.11.12")).toBe(true);
  });

  it("rejects Python versions below 3.9", () => {
    expect(isSupportedPythonVersion("Python 3.8.18")).toBe(false);
    expect(isSupportedPythonVersion("Python 2.7.18")).toBe(false);
  });

  it("rejects unparseable version output", () => {
    expect(isSupportedPythonVersion("something else")).toBe(false);
  });
});

describe("requireSupportedPython", () => {
  beforeEach(() => {
    vi.mocked(execSync).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the detected version when it is supported", () => {
    vi.mocked(execSync).mockReturnValue("Python 3.11.12");

    expect(requireSupportedPython("python3")).toBe("Python 3.11.12");

    expect(execSync).toHaveBeenCalledWith("python3 --version", {
      encoding: "utf-8",
      stdio: "pipe",
    });
  });

  it("throws when the detected version is below the supported floor", () => {
    vi.mocked(execSync).mockReturnValue("Python 3.8.18");

    expect(() => requireSupportedPython("python3")).toThrow(
      'Python 3.8.18 detected via "python3", but Trellis init requires Python ≥ 3.9.',
    );
  });

  it("throws when the command is missing", () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("command not found");
    });

    expect(() => requireSupportedPython("python")).toThrow(
      'Python command "python" not found. Trellis init requires Python ≥ 3.9.',
    );
  });

  it("warns and proceeds when child_process spawn is sandbox-restricted (EPERM)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(execSync).mockImplementation(() => {
      const err = new Error("Operation not permitted") as NodeJS.ErrnoException;
      err.code = "EPERM";
      throw err;
    });

    const result = requireSupportedPython("python3");

    expect(result).toBe("version unknown (sandbox-restricted)");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/Python version check skipped/);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/EPERM\/EACCES/);
  });

  it("treats EACCES the same as EPERM (sandbox-restricted)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(execSync).mockImplementation(() => {
      const err = new Error("Permission denied") as NodeJS.ErrnoException;
      err.code = "EACCES";
      throw err;
    });

    expect(requireSupportedPython("python3")).toBe(
      "version unknown (sandbox-restricted)",
    );
  });

  it("skips the probe entirely when TRELLIS_SKIP_PYTHON_CHECK=1", () => {
    const prev = process.env.TRELLIS_SKIP_PYTHON_CHECK;
    process.env.TRELLIS_SKIP_PYTHON_CHECK = "1";
    try {
      // execSync should not be called at all
      const result = requireSupportedPython("python3");
      expect(result).toBe("version check skipped (TRELLIS_SKIP_PYTHON_CHECK=1)");
      expect(execSync).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) {
        delete process.env.TRELLIS_SKIP_PYTHON_CHECK;
      } else {
        process.env.TRELLIS_SKIP_PYTHON_CHECK = prev;
      }
    }
  });
});

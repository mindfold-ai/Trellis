import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("figlet", () => ({ default: { textSync: () => "Trellis" } }));
vi.mock("inquirer", () => ({
  default: { prompt: vi.fn().mockResolvedValue({ proceed: true }) },
}));
vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => "Python 3.11.12"),
}));

import { init } from "../../src/commands/init.js";
import { update } from "../../src/commands/update.js";
import { VERSION } from "../../src/constants/version.js";

describe("current-version update", () => {
  let root: string;
  const file = (name: string): string => path.join(root, name);
  const write = (name: string, content: string): void => {
    fs.mkdirSync(path.dirname(file(name)), { recursive: true });
    fs.writeFileSync(file(name), content);
  };

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-update-current-"));
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await init({ yes: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.each(["0.2.15", "0.6.15", "unknown"])(
    "rejects installed version %s before reading project history",
    async (installedVersion) => {
      write(".trellis/.version", installedVersion);
      write(".trellis/tasks/old/task.json", '{"id":"old"}');
      write(".trellis/unowned/old/arbitrary.bin", "historical bytes");
      const beforeHashes = fs.readFileSync(
        file(".trellis/.template-hashes.json"),
        "utf8",
      );
      const originalRead = fs.readFileSync;
      const originalList = fs.readdirSync;
      const historyRoot = file(".trellis/unowned");
      const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation(((
        name: fs.PathOrFileDescriptor,
        ...args: unknown[]
      ) => {
        if (typeof name === "string" && name.startsWith(historyRoot))
          throw new Error(`historical read: ${name}`);
        return Reflect.apply(originalRead, fs, [name, ...args]);
      }) as typeof fs.readFileSync);
      const listSpy = vi.spyOn(fs, "readdirSync").mockImplementation(((
        name: fs.PathLike,
        ...args: unknown[]
      ) => {
        if (typeof name === "string" && name.startsWith(historyRoot))
          throw new Error(`historical traversal: ${name}`);
        return Reflect.apply(originalList, fs, [name, ...args]);
      }) as typeof fs.readdirSync);

      await expect(update({ force: true })).rejects.toThrow(
        "Unsupported installed Trellis version",
      );
      expect(
        readSpy.mock.calls.some(
          ([name]) => typeof name === "string" && name.startsWith(historyRoot),
        ),
      ).toBe(false);
      expect(
        listSpy.mock.calls.some(
          ([name]) => typeof name === "string" && name.startsWith(historyRoot),
        ),
      ).toBe(false);
      readSpy.mockRestore();
      listSpy.mockRestore();
      expect(fs.readFileSync(file(".trellis/.version"), "utf8")).toBe(
        installedVersion,
      );
      expect(
        fs.readFileSync(file(".trellis/.template-hashes.json"), "utf8"),
      ).toBe(beforeHashes);
      expect(
        fs.readFileSync(file(".trellis/unowned/old/arbitrary.bin"), "utf8"),
      ).toBe("historical bytes");
    },
  );

  it("rejects reinitializing an older installation", async () => {
    write(".trellis/.version", "0.6.15");
    await expect(init({ yes: true })).rejects.toThrow(
      "Unsupported installed Trellis version",
    );
    expect(fs.readFileSync(file(".trellis/.version"), "utf8")).toBe("0.6.15");
  });

  it("reapplies the current version without generating a migration task or reading history", async () => {
    write(".trellis/unowned/old/arbitrary.bin", "historical bytes");
    const tasksBefore = fs.readdirSync(file(".trellis/tasks")).sort();
    await update({ force: true });
    expect(fs.readFileSync(file(".trellis/.version"), "utf8")).toBe(VERSION);
    expect(fs.readdirSync(file(".trellis/tasks")).sort()).toEqual(tasksBefore);
    expect(
      fs.readFileSync(file(".trellis/unowned/old/arbitrary.bin"), "utf8"),
    ).toBe("historical bytes");
  });
});

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
import * as atomic from "../../src/utils/atomic-write.js";
import {
  computeHash,
  loadHashes,
  saveHashes,
} from "../../src/utils/template-hash.js";
import {
  hasRetiredInstructions,
  isRetiredDataPath,
} from "../../src/migrations/retirement.js";

describe("retirement update transaction", () => {
  let root: string;
  const read = (name: string): string =>
    fs.readFileSync(path.join(root, name), "utf-8");
  const write = (name: string, content: string): void => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  };
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-retirement-"));
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await init({
      yes: true,
      force: true,
      creator: "fixture",
      assignee: "fixture",
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.each(["0.2.15", "0.6.15"])(
    "upgrades %s without reading or backing up retired bytes, using explicit ownership",
    async (source) => {
      write(".trellis/.version", source);
      const historical = {
        ".trellis/.developer": "name=forbidden-person\n",
        ".trellis/workspace/index.md": "root index",
        ".trellis/workspace/person/arbitrary.bin": "arbitrary data",
        ".trellis/workspace/person/traces-1.md": "legacy traces",
        ".trellis/agent-traces/old.md": "predecessor",
      };
      for (const [name, content] of Object.entries(historical))
        write(name, content);
      const originalRead = fs.readFileSync;
      const originalList = fs.readdirSync;
      const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation(((
        name: fs.PathOrFileDescriptor,
        ...args: unknown[]
      ) => {
        if (
          typeof name === "string" &&
          isRetiredDataPath(path.relative(root, name))
        )
          throw new Error(`forbidden read ${name}`);
        return Reflect.apply(originalRead, fs, [name, ...args]);
      }) as typeof fs.readFileSync);
      const listSpy = vi.spyOn(fs, "readdirSync").mockImplementation(((
        name: fs.PathLike,
        ...args: unknown[]
      ) => {
        if (
          typeof name === "string" &&
          isRetiredDataPath(path.relative(root, name))
        )
          throw new Error(`forbidden traversal ${name}`);
        return Reflect.apply(originalList, fs, [name, ...args]);
      }) as typeof fs.readdirSync);
      await update({ force: true, migrate: true, assignee: "explicit-owner" });
      readSpy.mockRestore();
      listSpy.mockRestore();
      for (const [name, content] of Object.entries(historical))
        expect(read(name)).toBe(content);
      const tasks = fs
        .readdirSync(path.join(root, ".trellis/tasks"))
        .filter((name) => name.endsWith(`migrate-to-${VERSION}`));
      expect(tasks).toHaveLength(1);
      const taskPath = `.trellis/tasks/${tasks[0]}`;
      const metadata = JSON.parse(read(`${taskPath}/task.json`)) as {
        creator: string;
        assignee: string;
      };
      expect(metadata.creator).toBe("trellis-update");
      expect(metadata.assignee).toBe("explicit-owner");
      expect(hasRetiredInstructions(read(`${taskPath}/prd.md`))).toBe(false);
      expect(read(`${taskPath}/prd.md`)).toContain("task.py");
      const taskBefore = read(`${taskPath}/task.json`);
      await update({ force: true, migrate: true });
      expect(read(`${taskPath}/task.json`)).toBe(taskBefore);
      for (const backup of fs
        .readdirSync(path.join(root, ".trellis"))
        .filter((name) => name.startsWith(".backup-"))) {
        for (const name of Object.keys(historical))
          expect(fs.existsSync(path.join(root, ".trellis", backup, name))).toBe(
            false,
          );
      }
    },
  );

  it("missing noninteractive assignee exits 2 before receipts, backup or task writes", async () => {
    write(".trellis/.version", "0.6.15");
    const hashes = read(".trellis/.template-hashes.json");
    const dirs = fs.readdirSync(path.join(root, ".trellis"));
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });
    await expect(update({ force: true, migrate: true })).rejects.toThrow(
      "exit:2",
    );
    expect(read(".trellis/.version")).toBe("0.6.15");
    expect(read(".trellis/.template-hashes.json")).toBe(hashes);
    expect(fs.readdirSync(path.join(root, ".trellis"))).toEqual(dirs);
  });

  it("incompatible existing target task blocks without rewriting custom content", async () => {
    const taskPath = `.trellis/tasks/01-01-migrate-to-${VERSION}`;
    write(
      `${taskPath}/task.json`,
      '{"creator":"original","assignee":"original"}',
    );
    write(`${taskPath}/prd.md`, "Run init_developer.py then add_session.py");
    const hashes = read(".trellis/.template-hashes.json");
    await expect(update({ force: true, migrate: true })).rejects.toThrow(
      "Incompatible migration task",
    );
    expect(read(`${taskPath}/prd.md`)).toBe(
      "Run init_developer.py then add_session.py",
    );
    expect(read(".trellis/.template-hashes.json")).toBe(hashes);
  });
  it.each([
    "Run /trellis:record-session",
    "Invoke trellis-record-session after finishing",
    "export TRELLIS_DEVELOPER=alice\npython3 .trellis/scripts/task.py create Example",
    "const workspace = getWorkspaceDir(root);",
    "python3 .trellis/scripts/init_developer.py alice # deprecated",
    "```sh\npython3 .trellis/scripts/init_developer.py alice # deprecated\n```",
  ])(
    "blocks incompatible custom workflow without mutating it: %s",
    async (instruction) => {
      const workflow = `# Custom workflow\n${instruction}\n`;
      write(".trellis/workflow.md", workflow);
      write(".trellis/.version", "0.6.15");
      const receipt = read(".trellis/.template-hashes.json");
      const entries = fs.readdirSync(path.join(root, ".trellis"));
      await expect(update({ skipAll: true, migrate: true, assignee: "owner" })).rejects.toThrow(
        "Retirement requires reconciliation",
      );
      expect(read(".trellis/workflow.md")).toBe(workflow);
      expect(read(".trellis/.template-hashes.json")).toBe(receipt);
      expect(read(".trellis/.version")).toBe("0.6.15");
      expect(fs.readdirSync(path.join(root, ".trellis"))).toEqual(entries);
    },
  );
  it("preserves a custom workflow containing harmless retirement guidance", async () => {
    const workflow =
      "# Task-only workflow\nDo not run add_session.py; it is retired.\nTRELLIS_DEVELOPER is retired.\ngetWorkspaceDir is removed.\n";
    write(".trellis/workflow.md", workflow);
    const receipt = loadHashes(root)[".trellis/workflow.md"];
    await update({ force: true });
    expect(read(".trellis/workflow.md")).toBe(workflow);
    expect(loadHashes(root)[".trellis/workflow.md"]).toBe(receipt);
  });

  it.each([
    "Run pnpm test from the workspace root.",
    "Use pnpm --filter @acme/api build in this workspace.",
    "Read the SQLite write-ahead journal when diagnosing storage failures.",
  ])("preserves unrelated workflow instructions through reinit and force upgrade: %s", async (instruction) => {
    const workflow = `# Custom workflow\n${instruction}\n`;
    write(".trellis/workflow.md", workflow);
    const receipt = loadHashes(root)[".trellis/workflow.md"];
    await init({ yes: true });
    expect(read(".trellis/workflow.md")).toBe(workflow);
    write(".trellis/.version", "0.6.15");
    await update({ force: true, migrate: true, assignee: "owner" });
    expect(read(".trellis/.version")).toBe(VERSION);
    expect(read(".trellis/workflow.md")).toBe(workflow);
    expect(loadHashes(root)[".trellis/workflow.md"]).toBe(receipt);
  });

  it("rejects a historical tasks alias before init enumerates it", async () => {
    const tasks = path.join(root, ".trellis/tasks");
    fs.rmSync(tasks, { recursive: true });
    write(".trellis/workspace/history.txt", "historical bytes");
    fs.symlinkSync(path.join(root, ".trellis/workspace"), tasks, "dir");
    const receipt = read(".trellis/.template-hashes.json");
    const readdir = vi.spyOn(fs, "readdirSync");
    await expect(init({ yes: true, force: true, creator: "caller", assignee: "owner" })).rejects.toThrow("Retired identity/history");
    expect(readdir.mock.calls.filter(([entry]) => String(entry) === tasks || String(entry).includes(".trellis/workspace"))).toEqual([]);
    expect(read(".trellis/workspace/history.txt")).toBe("historical bytes");
    expect(read(".trellis/.template-hashes.json")).toBe(receipt);
  });

  it.each([false, true])("blocks an incompatible statusLine before update (force=%s)", async (force) => {
    const settings = JSON.parse(read(".claude/settings.json")) as Record<string, unknown>;
    settings.statusLine = { type: "command", command: "python3 .trellis/scripts/get_developer.py" };
    write(".claude/settings.json", JSON.stringify(settings));
    const receipt = read(".trellis/.template-hashes.json");
    const version = read(".trellis/.version");
    const entries = fs.readdirSync(path.join(root, ".trellis"));
    await expect(update({ force, skipAll: !force, migrate: true, assignee: "owner" })).rejects.toThrow("Incompatible statusLine");
    expect(JSON.parse(read(".claude/settings.json"))).toEqual(settings);
    expect(read(".trellis/.template-hashes.json")).toBe(receipt);
    expect(read(".trellis/.version")).toBe(version);
    expect(fs.readdirSync(path.join(root, ".trellis"))).toEqual(entries);
  });

  it("blocks shell history access in a custom statusLine before update", async () => {
    const settings = JSON.parse(read(".claude/settings.json")) as Record<string, unknown>;
    settings.statusLine = { type: "command", command: "cat .trellis/.developer" };
    write(".claude/settings.json", JSON.stringify(settings));
    write(".trellis/.developer", "name=historical\n");
    write(".trellis/.version", "0.6.15");
    await expect(update({ force: true, migrate: true, assignee: "owner" })).rejects.toThrow("Incompatible statusLine");
    expect(read(".trellis/.version")).toBe("0.6.15");
    expect(read(".claude/settings.json")).toContain("cat .trellis/.developer");
  });

  it("preserves a compatible user statusLine on reapply", async () => {
    const settings = JSON.parse(read(".claude/settings.json")) as Record<string, unknown>;
    const statusLine = { type: "command", command: "printf 'active task'" };
    settings.statusLine = statusLine;
    write(".claude/settings.json", JSON.stringify(settings));
    await update({ force: true });
    expect(JSON.parse(read(".claude/settings.json")).statusLine).toEqual(statusLine);
  });

  it("force reapply replaces rather than preserves a workflow with a commented legacy command", async () => {
    const workflow = "# Custom workflow\n```sh\npython3 .trellis/scripts/init_developer.py alice # deprecated\n```\n";
    write(".trellis/workflow.md", workflow);
    await update({ force: true, migrate: true, assignee: "owner" });
    expect(read(".trellis/workflow.md")).not.toBe(workflow);
    expect(read(".trellis/workflow.md")).not.toContain("init_developer.py alice");
  });

  it("stock obsolete module is removed on same-version reapply", async () => {
    const name = ".trellis/scripts/common/developer.py";
    write(name, "def get_developer(): pass\n");
    saveHashes(root, { ...loadHashes(root), [name]: computeHash(read(name)) });
    await update({ force: true });
    expect(fs.existsSync(path.join(root, name))).toBe(false);
    expect(loadHashes(root)[name]).toBeUndefined();
  });
  it.each([false, true])(
    "retires the actual old Copilot prompt with customization protection (custom=%s)",
    async (customized) => {
      await init({
        yes: true,
        force: true,
        copilot: true,
        creator: "fixture",
        assignee: "fixture",
      });
      const name = ".github/prompts/record-session.prompt.md";
      // Exact pre-retirement shipped prompt, not synthetic command text.
      const stock = fs.readFileSync(
        new URL(
          "../migrations/fixtures/copilot-record-session.prompt.md",
          import.meta.url,
        ),
        "utf-8",
      );
      write(name, stock);
      saveHashes(root, { ...loadHashes(root), [name]: computeHash(stock) });
      write(".trellis/.version", "0.6.15");
      const content = customized
        ? `${stock}\nCustom project recording instructions.\n`
        : stock;
      write(name, content);
      if (customized) {
        const receipt = read(".trellis/.template-hashes.json");
        const entries = fs.readdirSync(path.join(root, ".trellis"));
        await expect(
          update({ migrate: true, skipAll: true, assignee: "owner" }),
        ).rejects.toThrow(name);
        expect(read(name)).toBe(content);
        expect(read(".trellis/.version")).toBe("0.6.15");
        expect(read(".trellis/.template-hashes.json")).toBe(receipt);
        expect(fs.readdirSync(path.join(root, ".trellis"))).toEqual(entries);
      }
      await update({ migrate: true, force: customized, assignee: "owner" });
      expect(fs.existsSync(path.join(root, name))).toBe(false);
      expect(loadHashes(root)[name]).toBeUndefined();
      expect(read(".trellis/.version")).toBe(VERSION);
      const backups = fs
        .readdirSync(path.join(root, ".trellis"))
        .filter((entry) => entry.startsWith(".backup-"));
      expect(
        backups.some(
          (backup) => read(`.trellis/${backup}/${name}`) === content,
        ),
      ).toBe(true);
      await update({ migrate: true });
      expect(
        fs
          .readdirSync(path.join(root, ".trellis"))
          .filter((entry) => entry.startsWith(".backup-")),
      ).toEqual(backups);
    },
  );
  it("retires old entrypoints without executing their historical rename actions", async () => {
    write(".trellis/.version", "0.2.15");
    const name = ".trellis/scripts/get-developer.sh";
    write(name, "#!/bin/sh\necho old identity\n");
    saveHashes(root, { ...loadHashes(root), [name]: computeHash(read(name)) });
    await update({ force: true, migrate: true, assignee: "owner" });
    expect(fs.existsSync(path.join(root, name))).toBe(false);
    expect(
      fs.existsSync(
        path.join(root, ".trellis/scripts-shell-archive/get-developer.sh"),
      ),
    ).toBe(false);
  });

  it("restores managed files and receipts after a task write failure, then retries once", async () => {
    write(".trellis/.version", "0.6.15");
    const script = ".trellis/scripts/get_context.py";
    write(script, "# previous stock runtime\n");
    saveHashes(root, {
      ...loadHashes(root),
      [script]: computeHash(read(script)),
    });
    const receipt = read(".trellis/.template-hashes.json");
    const originalWrite = atomic.writeFileAtomic;
    const failingWrite = vi
      .spyOn(atomic, "writeFileAtomic")
      .mockImplementation((name, content) => {
        if (name.endsWith("/task.json"))
          throw new Error("Task write unavailable");
        originalWrite(name, content);
      });
    await expect(update({ force: true, assignee: "owner" })).rejects.toThrow(
      "Update incomplete",
    );
    failingWrite.mockRestore();
    expect(read(script)).toBe("# previous stock runtime\n");
    expect(read(".trellis/.version")).toBe("0.6.15");
    expect(read(".trellis/.template-hashes.json")).toBe(receipt);
    await update({ force: true, assignee: "owner" });
    expect(read(".trellis/.version")).toBe(VERSION);
    expect(
      fs
        .readdirSync(path.join(root, ".trellis/tasks"))
        .filter((name) => name.endsWith(`migrate-to-${VERSION}`)),
    ).toHaveLength(1);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "restores settings symlink after real EACCES creating a migration task",
    async () => {
      write(".trellis/.version", "0.6.15");
      const settings = path.join(root, ".claude/settings.json");
      const original = read(".claude/settings.json");
      write("settings-target.json", original);
      fs.unlinkSync(settings);
      fs.symlinkSync("../settings-target.json", settings);
      // Force an atomic replacement before task creation fails.
      write("settings-target.json", "{}\n");
      const receipt = read(".trellis/.template-hashes.json");
      const tasks = path.join(root, ".trellis/tasks");
      const entries = fs.readdirSync(tasks);
      fs.chmodSync(tasks, 0o555);
      try {
        await expect(update({ force: true, assignee: "owner" })).rejects.toThrow(
          /managed backup restoration completed.*EACCES/s,
        );
      } finally {
        fs.chmodSync(tasks, 0o755);
      }
      expect(fs.lstatSync(settings).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(settings)).toBe("../settings-target.json");
      expect(read("settings-target.json")).toBe("{}\n");
      expect(read(".trellis/.version")).toBe("0.6.15");
      expect(read(".trellis/.template-hashes.json")).toBe(receipt);
      expect(fs.readdirSync(tasks)).toEqual(entries);
      await update({ force: true, assignee: "owner" });
      expect(read(".trellis/.version")).toBe(VERSION);
      expect(read("settings-target.json")).toBe("{}\n");
    },
  );

  it.skipIf(process.platform === "win32")(
    "refuses managed files beneath a directory symlink before touching external targets",
    async () => {
      write(".trellis/.version", "0.6.15");
      const external = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-linked-settings-"));
      const claude = path.join(root, ".claude");
      fs.cpSync(claude, external, { recursive: true });
      fs.rmSync(claude, { recursive: true });
      fs.symlinkSync(external, claude, "dir");
      fs.writeFileSync(path.join(external, "settings.json"), "{}\n");
      const receipt = read(".trellis/.template-hashes.json");
      const entries = fs.readdirSync(path.join(root, ".trellis"));
      try {
        await expect(update({ force: true, assignee: "owner" })).rejects.toThrow(
          "Unsupported managed symlink parent .claude",
        );
        expect(fs.readlinkSync(claude)).toBe(external);
        expect(fs.readFileSync(path.join(external, "settings.json"), "utf-8")).toBe("{}\n");
        expect(read(".trellis/.version")).toBe("0.6.15");
        expect(read(".trellis/.template-hashes.json")).toBe(receipt);
        expect(fs.readdirSync(path.join(root, ".trellis"))).toEqual(entries);
      } finally {
        fs.rmSync(external, { recursive: true, force: true });
      }
    },
  );

  it.each([{ skipAll: true }, { createNew: true }])(
    "required custom runtime blocks before all writes with %j",
    async (options) => {
      write(".trellis/scripts/get_context.py", "# custom runtime\n");
      const hashes = read(".trellis/.template-hashes.json");
      const dirs = fs.readdirSync(path.join(root, ".trellis"));
      await expect(update(options)).rejects.toThrow(
        "Retirement requires reconciliation",
      );
      expect(read(".trellis/scripts/get_context.py")).toBe(
        "# custom runtime\n",
      );
      expect(read(".trellis/.template-hashes.json")).toBe(hashes);
      expect(fs.readdirSync(path.join(root, ".trellis"))).toEqual(dirs);
      expect(
        fs.existsSync(path.join(root, ".trellis/scripts/get_context.py.new")),
      ).toBe(false);
    },
  );
});

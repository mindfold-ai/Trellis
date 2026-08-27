import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import inquirer from "inquirer";

vi.mock("figlet", () => ({
  default: { textSync: vi.fn(() => "TRELLIS") },
}));

vi.mock("inquirer", () => ({
  default: { prompt: vi.fn() },
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockImplementation((cmd: string) => {
    const python = process.platform === "win32" ? "python" : "python3";
    return cmd === `${python} --version` ? "Python 3.11.12" : "";
  }),
}));

import { ablate, restore } from "../../src/commands/ablate.js";
import { init } from "../../src/commands/init.js";
import {
  ABLATION_STATE_ROOT_ENV,
  fingerprintPath,
  getTransactionPaths,
  type PathFingerprint,
} from "../../src/utils/ablation-store.js";
import { loadHashes } from "../../src/utils/template-hash.js";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

describe("ablate()/restore() integration", () => {
  let projectDir: string;
  let stateRoot: string;
  let originalStateRoot: string | undefined;
  let originalStdinIsTtyDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-ablate-int-"));
    stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-ablate-state-"));
    originalStateRoot = process.env[ABLATION_STATE_ROOT_ENV];
    originalStdinIsTtyDescriptor = Object.getOwnPropertyDescriptor(
      process.stdin,
      "isTTY",
    );
    process.env[ABLATION_STATE_ROOT_ENV] = stateRoot;
    vi.spyOn(process, "cwd").mockReturnValue(projectDir);
    vi.spyOn(console, "log").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
    vi.mocked(inquirer.prompt).mockResolvedValue({ proceed: true });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalStdinIsTtyDescriptor) {
      Object.defineProperty(
        process.stdin,
        "isTTY",
        originalStdinIsTtyDescriptor,
      );
    } else {
      Reflect.deleteProperty(process.stdin, "isTTY");
    }
    if (originalStateRoot === undefined) {
      Reflect.deleteProperty(process.env, ABLATION_STATE_ROOT_ENV);
    } else {
      process.env[ABLATION_STATE_ROOT_ENV] = originalStateRoot;
    }
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  });

  async function initialize(): Promise<void> {
    fs.writeFileSync(path.join(projectDir, "application.txt"), "unchanged\n");
    await init({ yes: true, codex: true, claude: true, force: true });
  }

  function projectFingerprint(): PathFingerprint {
    return fingerprintPath(projectDir);
  }

  it("#1 performs a complete exact round trip while preserving user neighbors", async () => {
    await initialize();
    const sensitiveTask = path.join(
      projectDir,
      ".trellis",
      "tasks",
      "private-context.md",
    );
    fs.mkdirSync(path.dirname(sensitiveTask), { recursive: true });
    fs.writeFileSync(sensitiveTask, "user-authored recovery text\n");
    const userNeighbor = path.join(projectDir, ".codex", "user-note.txt");
    fs.writeFileSync(userNeighbor, "mine\n");
    fs.appendFileSync(path.join(projectDir, "AGENTS.md"), "\nUser footer\n");
    const before = projectFingerprint();

    await ablate({ yes: true });
    expect(fs.existsSync(path.join(projectDir, ".trellis"))).toBe(false);
    expect(
      fs.readFileSync(path.join(projectDir, "application.txt"), "utf-8"),
    ).toBe("unchanged\n");
    expect(fs.readFileSync(userNeighbor, "utf-8")).toBe("mine\n");
    expect(fs.existsSync(getTransactionPaths(projectDir).stateFile)).toBe(true);
    expect(
      fs.readFileSync(
        path.join(
          getTransactionPaths(projectDir).backupDir,
          ".trellis",
          "tasks",
          "private-context.md",
        ),
        "utf-8",
      ),
    ).toBe("user-authored recovery text\n");
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("may contain user-authored sensitive text"),
    );

    await restore({ yes: true });
    expect(projectFingerprint()).toEqual(before);
    expect(fs.readFileSync(sensitiveTask, "utf-8")).toBe(
      "user-authored recovery text\n",
    );
    expect(fs.existsSync(getTransactionPaths(projectDir).transactionDir)).toBe(
      false,
    );
  });

  it("#2 dry-run creates no recovery state and changes no project path", async () => {
    await initialize();
    const before = projectFingerprint();

    await ablate({ dryRun: true });
    expect(projectFingerprint()).toEqual(before);
    expect(fs.existsSync(getTransactionPaths(projectDir).transactionDir)).toBe(
      false,
    );
    expect(inquirer.prompt).not.toHaveBeenCalled();
  });

  it("#3 cancel leaves both project and external state untouched", async () => {
    await initialize();
    const before = projectFingerprint();
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ proceed: false });

    await ablate({});
    expect(projectFingerprint()).toEqual(before);
    expect(fs.existsSync(getTransactionPaths(projectDir).transactionDir)).toBe(
      false,
    );
  });

  it("#4 restore conflict refuses every write, then succeeds after conflict cleanup", async () => {
    await initialize();
    const before = projectFingerprint();
    await ablate({ yes: true });
    const conflictPath = path.join(projectDir, ".codex", "hooks.json");
    fs.mkdirSync(path.dirname(conflictPath), { recursive: true });
    fs.writeFileSync(conflictPath, '{"user":true}\n');
    const conflicted = projectFingerprint();

    await expect(restore({ yes: true })).rejects.toThrow(
      /changed while ablated/,
    );
    expect(projectFingerprint()).toEqual(conflicted);
    expect(fs.existsSync(path.join(projectDir, ".trellis"))).toBe(false);

    fs.rmSync(conflictPath);
    await restore({ yes: true });
    expect(projectFingerprint()).toEqual(before);
  });

  it("#5 repeated ablate is rejected and repeated restore is a friendly no-op", async () => {
    await initialize();
    await ablate({ yes: true });
    await expect(ablate({ yes: true })).rejects.toThrow(/already ablated/);
    await restore({ yes: true });
    await restore({ yes: true });
    expect(fs.existsSync(path.join(projectDir, ".trellis"))).toBe(true);
  });

  it("#6 non-interactive mutation requires --yes", async () => {
    await initialize();
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: false,
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never);

    await expect(ablate({})).rejects.toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fs.existsSync(path.join(projectDir, ".trellis"))).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "#7 refuses parent-symlink traversal without touching the target",
    async () => {
      await init({ yes: true, codex: true, force: true });
      const originalCodex = path.join(projectDir, ".codex");
      const externalCodex = fs.mkdtempSync(
        path.join(os.tmpdir(), "trellis-ablate-external-"),
      );
      fs.cpSync(originalCodex, externalCodex, { recursive: true });
      fs.rmSync(originalCodex, { recursive: true });
      fs.symlinkSync(externalCodex, originalCodex);
      const externalBefore = fingerprintPath(externalCodex);

      try {
        await expect(ablate({ yes: true })).rejects.toThrow(
          /escapes project root/,
        );
        expect(fingerprintPath(externalCodex)).toEqual(externalBefore);
        expect(
          fs.existsSync(getTransactionPaths(projectDir).transactionDir),
        ).toBe(false);
      } finally {
        fs.rmSync(externalCodex, { recursive: true, force: true });
      }
    },
  );

  it("#8 no install and no recovery state are friendly no-ops", async () => {
    vi.mocked(console.log).mockClear();
    await ablate({ yes: true });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Trellis is not installed in this project."),
    );

    vi.mocked(console.log).mockClear();
    await restore({ yes: true });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(
        "No Trellis ablation transaction exists for this project.",
      ),
    );
    expect(fs.readdirSync(projectDir)).toEqual([]);
  });

  it("#9 restore dry-run preflights conflicts but changes neither project nor state", async () => {
    await initialize();
    await ablate({ yes: true });
    vi.mocked(inquirer.prompt).mockClear();
    const projectBefore = projectFingerprint();
    const stateFile = getTransactionPaths(projectDir).stateFile;
    const stateBefore = fs.readFileSync(stateFile, "utf-8");

    await restore({ dryRun: true });
    expect(projectFingerprint()).toEqual(projectBefore);
    expect(fs.readFileSync(stateFile, "utf-8")).toBe(stateBefore);
    expect(inquirer.prompt).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === "win32")(
    "#10 apply failure rolls back exactly and removes the unused transaction",
    async () => {
      await init({ yes: true, codex: true, force: true });
      const blockedRelative = Object.keys(loadHashes(projectDir)).find(
        (entry) => entry.startsWith(".codex/hooks/"),
      );
      if (!blockedRelative) {
        throw new Error("Test fixture requires a managed Codex hook file");
      }
      const blockedParent = path.dirname(
        path.join(projectDir, ...blockedRelative.split("/")),
      );
      fs.chmodSync(blockedParent, 0o500);
      const before = projectFingerprint();

      try {
        await expect(ablate({ yes: true })).rejects.toThrow();
        expect(projectFingerprint()).toEqual(before);
        expect(
          fs.existsSync(getTransactionPaths(projectDir).transactionDir),
        ).toBe(false);
      } finally {
        fs.chmodSync(blockedParent, 0o700);
      }
    },
  );

  it("#11 restore cancellation keeps the ablated project and transaction", async () => {
    await initialize();
    await ablate({ yes: true });
    const before = projectFingerprint();
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ proceed: false });

    await restore({});
    expect(projectFingerprint()).toEqual(before);
    expect(fs.existsSync(getTransactionPaths(projectDir).stateFile)).toBe(true);
  });

  it("#12 non-interactive restore requires --yes", async () => {
    await initialize();
    await ablate({ yes: true });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: false,
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never);

    await expect(restore({})).rejects.toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fs.existsSync(path.join(projectDir, ".trellis"))).toBe(false);
    expect(fs.existsSync(getTransactionPaths(projectDir).stateFile)).toBe(true);
  });

  it("#13 strict planner failures include recovery guidance", async () => {
    await initialize();
    fs.writeFileSync(path.join(projectDir, ".codex", "hooks.json"), "{\n");

    await expect(ablate({ yes: true })).rejects.toThrow(
      /Restore the managed file.*stale manifest entry/,
    );
    expect(fs.existsSync(getTransactionPaths(projectDir).transactionDir)).toBe(
      false,
    );
  });

  it("#14 rejects an in-project recovery root before state lookup", async () => {
    const invalidStateRoot = path.join(projectDir, "recovery");
    process.env[ABLATION_STATE_ROOT_ENV] = invalidStateRoot;

    await expect(ablate({ yes: true })).rejects.toThrow(
      /must point outside the project/,
    );
    await expect(restore({ yes: true })).rejects.toThrow(
      /must point outside the project/,
    );
    expect(fs.existsSync(invalidStateRoot)).toBe(false);
    expect(fs.readdirSync(projectDir)).toEqual([]);
  });
});

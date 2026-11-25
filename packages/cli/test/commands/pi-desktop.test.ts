import { describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import {
  installPiDesktopPlugin,
  piDesktopStatus,
  uninstallPiDesktopPlugin,
  type CommonOptions,
} from "../../src/commands/pi-desktop/commands.js";
import { registerPiDesktopCommand } from "../../src/commands/pi-desktop/index.js";
import { normalizeProjectPath } from "../../src/commands/pi-desktop/paths.js";
import { skillsForRepo, type UserSkillRow } from "../../src/commands/pi-desktop/registries.js";
import { PI_DESKTOP_PLUGIN_ID } from "../../src/constants/pi-desktop.js";

const NOW = new Date("2026-01-02T03:04:05Z");

/** A repository that `trellis init --pi-desktop` has already configured. */
function scaffoldRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "trellis-pidesk-cli-"));
  const plugin = join(root, ".pi-desktop", "trellis");
  mkdirSync(join(plugin, "agent"), { recursive: true });
  writeFileSync(
    join(plugin, "manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        id: PI_DESKTOP_PLUGIN_ID,
        name: "Trellis",
        version: "0.0.0-test",
        main: "main.js",
        permissions: ["agent.extension"],
        contributes: { agentExtensions: ["agent/index.ts"] },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(plugin, "main.js"), "module.exports = {};\n");
  writeFileSync(join(plugin, "agent", "index.ts"), "export default function () {}\n");

  const skillDir = join(root, ".agents", "skills", "trellis-demo");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    "---\nname: trellis-demo\ndescription: Demo skill used by the pi-desktop tests\n---\n\n# Demo\n",
  );

  // A skill the user wrote by hand: Trellis must never register or remove it.
  const userSkillDir = join(root, ".agents", "skills", "user-owned");
  mkdirSync(userSkillDir, { recursive: true });
  writeFileSync(
    join(userSkillDir, "SKILL.md"),
    "---\nname: user-owned\ndescription: A hand-written skill Trellis does not own\n---\n\n# Mine\n",
  );

  // Ownership is read from the template hash manifest, exactly as init wrote it.
  mkdirSync(join(root, ".trellis"), { recursive: true });
  writeFileSync(
    join(root, ".trellis", ".template-hashes.json"),
    `${JSON.stringify(
      {
        __version: 2,
        hashes: {
          ".agents/skills/trellis-demo/SKILL.md":
            "0000000000000000000000000000000000000000000000000000000000000000",
        },
      },
      null,
      2,
    )}\n`,
  );

  return root;
}

function optionsFor(repo: string, dataDir: string): CommonOptions {
  return {
    cwd: repo,
    dataDir,
    // Keep the sub-agent home inside the temp dir: tests must never write to
    // the developer's real `~/.agents/subagents`.
    agentsDir: join(dataDir, "agents-home"),
    hostRunning: () => false,
    now: NOW,
  };
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf-8")) as unknown;
}

function dataDirForTest(): string {
  return mkdtempSync(join(tmpdir(), "trellis-pidesk-data-"));
}

describe("trellis pi-desktop install", () => {
  it("copies the plugin, registers one row, and registers the repo skills", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();

    const report = installPiDesktopPlugin(optionsFor(repo, dataDir));

    expect(report.registryAction).toBe("created");
    expect(report.files.sort()).toEqual([
      "agent/index.ts",
      "main.js",
      "manifest.json",
    ]);
    expect(readdirSync(join(report.installedDir, "agent"))).toContain("index.ts");

    const rows = readJson(report.registryPath) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.id).toBe(PI_DESKTOP_PLUGIN_ID);
    expect(row.status).toBe("ready");
    expect(row.enabled).toBe(true);
    expect(row.permissions).toEqual(["agent.extension"]);
    expect(row.path).toBe(report.installedDir);
    expect(row.scope).toEqual({
      mode: "projects",
      projects: [normalizeProjectPath(repo)],
    });

    const skills = readJson(report.skills.path) as Record<string, unknown>[];
    expect(report.skills.created).toEqual(["trellis-demo"]);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      id: "trellis-demo",
      name: "trellis-demo",
      description: "Demo skill used by the pi-desktop tests",
      enabled: true,
      source: "imported",
      scope: { mode: "projects", projects: [normalizeProjectPath(repo)] },
    });
    expect(report.registryBackup).toBeNull();
  });

  it("is idempotent and keeps one row per plugin", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();
    installPiDesktopPlugin(optionsFor(repo, dataDir));

    const second = installPiDesktopPlugin(optionsFor(repo, dataDir));

    expect(second.registryAction).toBe("unchanged");
    expect(second.skills.created).toEqual([]);
    expect(second.skills.updated).toEqual([]);
    expect(second.skills.unchanged).toEqual(["trellis-demo"]);
    expect(readJson(second.registryPath)).toHaveLength(1);
  });

  it("keeps host-owned row fields and reports the second install as unchanged", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();
    const first = installPiDesktopPlugin(optionsFor(repo, dataDir));

    // The host adds fields of its own to `plugins/registry.json`.
    const rows = readJson(first.registryPath) as Record<string, unknown>[];
    writeFileSync(
      first.registryPath,
      `${JSON.stringify([{ ...rows[0], hostBadge: "gold" }], null, 2)}\n`,
    );

    const second = installPiDesktopPlugin(optionsFor(repo, dataDir));

    expect(second.registryAction).toBe("unchanged");
    // Nothing was rewritten, so the host's field is still there and no backup
    // of the untouched file was taken.
    expect(second.registryBackup).toBeNull();
    const after = readJson(second.registryPath) as Record<string, unknown>[];
    expect(after[0].hostBadge).toBe("gold");
  });

  it("only registers the skills Trellis wrote", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();

    const report = installPiDesktopPlugin(optionsFor(repo, dataDir));
    const rows = readJson(report.skills.path) as { id: string }[];

    expect(report.skills.created).toEqual(["trellis-demo"]);
    expect(rows.map((row) => row.id)).toEqual(["trellis-demo"]);
    expect(rows.map((row) => row.id)).not.toContain("user-owned");

    // A host-owned row for that same hand-written skill must survive uninstall.
    const userRow = {
      id: "user-owned",
      name: "user-owned",
      description: "A hand-written skill Trellis does not own",
      enabled: true,
      scope: { mode: "projects", projects: [normalizeProjectPath(repo)] },
      source: "created",
      path: join(repo, ".agents", "skills", "user-owned", "SKILL.md").replace(/\\/g, "/"),
      sizeBytes: 10,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    writeFileSync(report.skills.path, JSON.stringify([...rows, userRow], null, 2));

    uninstallPiDesktopPlugin(optionsFor(repo, dataDir));
    const after = readJson(report.skills.path) as { id: string }[];
    expect(after.map((row) => row.id)).toEqual(["user-owned"]);
  });
  it("extends the project scope when a second repository installs", () => {
    const first = scaffoldRepo();
    const second = scaffoldRepo();
    const dataDir = dataDirForTest();

    installPiDesktopPlugin(optionsFor(first, dataDir));
    const report = installPiDesktopPlugin(optionsFor(second, dataDir));

    const rows = readJson(report.registryPath) as { scope: { projects: string[] } }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].scope.projects).toEqual(
      expect.arrayContaining([
        normalizeProjectPath(first),
        normalizeProjectPath(second),
      ]),
    );
    expect(rows[0].scope.projects).toHaveLength(2);
  });

  it("does not narrow a row the user enabled for every project", () => {
    const first = scaffoldRepo();
    const second = scaffoldRepo();
    const dataDir = dataDirForTest();
    mkdirSync(join(dataDir, "plugins"), { recursive: true });
    const registryPath = join(dataDir, "plugins", "registry.json");
    writeFileSync(
      registryPath,
      `${JSON.stringify(
        [
          {
            id: PI_DESKTOP_PLUGIN_ID,
            name: "Trellis",
            version: "0.0.0-test",
            enabled: true,
            scope: { mode: "global", projects: [] },
            installedAt: NOW.toISOString(),
            updatedAt: NOW.toISOString(),
          },
        ],
        null,
        2,
      )}\n`,
    );

    installPiDesktopPlugin(optionsFor(first, dataDir));

    const rows = readJson(registryPath) as { scope: unknown }[];
    expect(rows[0].scope).toEqual({ mode: "global", projects: [] });
    // A global row still covers every project, including one never seen here.
    expect(piDesktopStatus(optionsFor(second, dataDir)).registered).toBe(true);
  });

  it("survives host rows that are not objects, before and after the write", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();
    mkdirSync(join(dataDir, "agent-capabilities"), { recursive: true });
    const skillRegistryPath = join(dataDir, "agent-capabilities", "skills.json");
    // Rows the host wrote: no `path`, and something that is not even an object.
    const hostRows = [null, "junk", { id: "host-row", scope: { mode: "global" } }];
    writeFileSync(skillRegistryPath, JSON.stringify(hostRows, null, 2));
    mkdirSync(join(dataDir, "plugins"), { recursive: true });
    writeFileSync(
      join(dataDir, "plugins", "registry.json"),
      JSON.stringify([
        {
          id: PI_DESKTOP_PLUGIN_ID,
          name: "Trellis",
          // A project-scoped row that lost its project list.
          scope: { mode: "projects" },
          installedAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
        },
      ]),
    );

    const report = installPiDesktopPlugin(optionsFor(repo, dataDir));

    expect(report.registryAction).toBe("updated");
    expect(report.skills.created).toEqual(["trellis-demo"]);
    const registry = readJson(report.registryPath) as {
      scope: { projects: string[] };
    }[];
    expect(registry[0].scope.projects).toEqual([normalizeProjectPath(repo)]);
    const skills = readJson(skillRegistryPath) as unknown[];
    expect(skills.length).toBe(hostRows.length + 1);
    expect(skills.slice(0, hostRows.length)).toEqual(hostRows);
  });

  it("keeps one backup per registry file", () => {
    const repos = [scaffoldRepo(), scaffoldRepo(), scaffoldRepo()];
    const dataDir = dataDirForTest();

    for (const repo of repos) installPiDesktopPlugin(optionsFor(repo, dataDir));

    // Every install after the first rewrote both registries: the backup name is
    // fixed, so three installs leave one file each, not three.
    const pluginBaks = readdirSync(join(dataDir, "plugins")).filter((name) =>
      name.includes(".bak"),
    );
    expect(pluginBaks).toEqual(["registry.json.trellis.bak"]);
    const skillBaks = readdirSync(join(dataDir, "agent-capabilities")).filter(
      (name) => name.includes(".bak"),
    );
    expect(skillBaks).toEqual(["skills.json.trellis.bak"]);
  });

  it("refuses to write while the host is running unless forced", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();
    const running: CommonOptions = { ...optionsFor(repo, dataDir), hostRunning: () => true };

    expect(() => installPiDesktopPlugin(running)).toThrow(/PI-Desktop is running/);
    expect(existsSync(join(dataDir, "plugins", "registry.json"))).toBe(false);

    const forced = installPiDesktopPlugin({ ...running, force: true });
    expect(forced.registryAction).toBe("created");
  });

  it("validates the sub-agent payload before writing anything", async () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();

    vi.resetModules();
    vi.doMock("../../src/templates/pi-desktop/subagents.js", () => ({
      getGlobalSubagentFiles: () => {
        throw new Error(
          'pi-desktop sub-agent "trellis-check" is invalid for this test',
        );
      },
    }));
    try {
      const fresh = await import("../../src/commands/pi-desktop/commands.js");
      expect(() => fresh.installPiDesktopPlugin(optionsFor(repo, dataDir))).toThrow(
        /trellis-check" is invalid/,
      );
    } finally {
      vi.doUnmock("../../src/templates/pi-desktop/subagents.js");
      vi.resetModules();
    }

    // Nothing from the install was left behind: no plugin copy, no row.
    expect(existsSync(join(dataDir, "plugins"))).toBe(false);
    expect(existsSync(join(dataDir, "agent-capabilities"))).toBe(false);
  });

  it("writes nothing at all on a dry run", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();

    const report = installPiDesktopPlugin({
      ...optionsFor(repo, dataDir),
      dryRun: true,
    });

    expect(report.dryRun).toBe(true);
    expect(report.files).toHaveLength(3);
    expect(existsSync(report.installedDir)).toBe(false);
    expect(existsSync(report.registryPath)).toBe(false);
    expect(existsSync(report.skills.path)).toBe(false);
    expect(report.skills.created).toEqual(["trellis-demo"]);
  });

  it("points at trellis init when the plugin was never generated", () => {
    const repo = mkdtempSync(join(tmpdir(), "trellis-pidesk-empty-"));
    const dataDir = dataDirForTest();

    expect(() => installPiDesktopPlugin(optionsFor(repo, dataDir))).toThrow(
      /trellis init --pi-desktop/,
    );
  });

  it("rejects a manifest the host would refuse", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();
    const manifestPath = join(repo, ".pi-desktop", "trellis", "manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        id: PI_DESKTOP_PLUGIN_ID,
        main: "main.js",
        permissions: [],
        contributes: { agentExtensions: ["agent/index.ts"] },
      }),
    );

    expect(() => installPiDesktopPlugin(optionsFor(repo, dataDir))).toThrow(
      /agent\.extension/,
    );
  });

  it("aborts before writing when the host registry has an unknown shape", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();
    mkdirSync(join(dataDir, "plugins"), { recursive: true });
    const registryPath = join(dataDir, "plugins", "registry.json");
    const original = `${JSON.stringify({ plugins: [] }, null, 2)}\n`;
    writeFileSync(registryPath, original);

    expect(() => installPiDesktopPlugin(optionsFor(repo, dataDir))).toThrow(
      /not a plugin registry/,
    );
    expect(readFileSync(registryPath, "utf-8")).toBe(original);
    expect(existsSync(join(dataDir, "plugins", "installed"))).toBe(false);
  });

  it("aborts before writing when the skill registry has an unknown shape", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();
    mkdirSync(join(dataDir, "agent-capabilities"), { recursive: true });
    writeFileSync(
      join(dataDir, "agent-capabilities", "skills.json"),
      JSON.stringify({ skills: [] }),
    );

    expect(() => installPiDesktopPlugin(optionsFor(repo, dataDir))).toThrow(
      /not a skill registry/,
    );
    expect(existsSync(join(dataDir, "plugins", "installed"))).toBe(false);
  });
});

describe("trellis pi-desktop uninstall", () => {
  it("removes only Trellis rows and files", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();
    mkdirSync(join(dataDir, "plugins"), { recursive: true });
    mkdirSync(join(dataDir, "agent-capabilities"), { recursive: true });
    writeFileSync(
      join(dataDir, "plugins", "registry.json"),
      JSON.stringify([{ id: "other.plugin", name: "Other", scope: { mode: "global", projects: [] } }]),
    );
    writeFileSync(
      join(dataDir, "agent-capabilities", "skills.json"),
      JSON.stringify([
        {
          id: "foreign",
          path: join(tmpdir(), "elsewhere", ".agents", "skills", "foreign", "SKILL.md").replace(/\\/g, "/"),
          scope: { mode: "global", projects: [] },
        },
      ]),
    );

    installPiDesktopPlugin(optionsFor(repo, dataDir));
    const report = uninstallPiDesktopPlugin(optionsFor(repo, dataDir));

    expect(report.removedRow).toBe(true);
    expect(report.removedDir).toBe(true);
    expect(report.removedSkills).toEqual(["trellis-demo"]);
    expect(report.scopeRetained).toEqual([]);

    const rows = readJson(report.registryPath) as { id: string }[];
    expect(rows.map((row) => row.id)).toEqual(["other.plugin"]);
    const skills = readJson(report.skillsPath) as { id: string }[];
    expect(skills.map((row) => row.id)).toEqual(["foreign"]);
    expect(existsSync(join(report.installedDir))).toBe(false);
  });

  it("keeps the shared row and sub-agents while another project still needs them", () => {
    const first = scaffoldRepo();
    const second = scaffoldRepo();
    const dataDir = dataDirForTest();
    installPiDesktopPlugin(optionsFor(first, dataDir));
    const installed = installPiDesktopPlugin(optionsFor(second, dataDir));
    const subagents = installed.subagents.dir;

    const report = uninstallPiDesktopPlugin(optionsFor(first, dataDir));

    // The row survives with the other repository's scope: uninstalling here must
    // not unregister a repository that still has Trellis enabled.
    expect(report.removedRow).toBe(false);
    expect(report.scopeRetained).toEqual([normalizeProjectPath(second)]);
    const rows = readJson(report.registryPath) as {
      id: string;
      scope: { mode: string; projects: string[] };
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toEqual({
      mode: "projects",
      projects: [normalizeProjectPath(second)],
    });
    // Files every project shares stay, or the other install breaks.
    expect(report.removedDir).toBe(false);
    expect(existsSync(report.installedDir)).toBe(true);
    expect(report.removedSubagents).toEqual([]);
    expect(existsSync(join(subagents, "trellis-check.md"))).toBe(true);
    // This repository's own skill row is gone; the other repository's stays.
    expect(report.removedSkills).toEqual(["trellis-demo"]);
    const skills = readJson(report.skillsPath) as { path: string }[];
    expect(skills.map((row) => row.path)).toEqual([
      join(second, ".agents", "skills", "trellis-demo", "SKILL.md").replace(/\\/g, "/"),
    ]);

    // The last repository to leave takes the shared files with it.
    const last = uninstallPiDesktopPlugin(optionsFor(second, dataDir));
    expect(last.removedRow).toBe(true);
    expect(last.scopeRetained).toEqual([]);
    expect(readJson(last.registryPath)).toEqual([]);
    expect(last.removedSubagents.sort()).toEqual([
      "trellis-check.md",
      "trellis-implement.md",
      "trellis-research.md",
    ]);
    expect(existsSync(last.installedDir)).toBe(false);
  });

  it("removes a global row from any repository", () => {
    const other = scaffoldRepo();
    const dataDir = dataDirForTest();
    mkdirSync(join(dataDir, "plugins"), { recursive: true });
    writeFileSync(
      join(dataDir, "plugins", "registry.json"),
      JSON.stringify([
        {
          id: PI_DESKTOP_PLUGIN_ID,
          scope: { mode: "global", projects: [] },
          installedAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
        },
      ]),
    );
    const report = uninstallPiDesktopPlugin(optionsFor(other, dataDir));

    expect(report.removedRow).toBe(true);
    expect(readJson(report.registryPath)).toEqual([]);
  });

  it("is a no-op on a data directory Trellis never touched", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();

    const report = uninstallPiDesktopPlugin({
      ...optionsFor(repo, dataDir),
      dryRun: true,
    });

    expect(report.removedRow).toBe(false);
    expect(report.removedDir).toBe(false);
    expect(report.removedSkills).toEqual([]);
    expect(report.scopeRetained).toEqual([]);
    expect(existsSync(join(dataDir, "plugins"))).toBe(false);
  });

  it("refuses to write while the host is running unless forced", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();
    installPiDesktopPlugin(optionsFor(repo, dataDir));
    const running: CommonOptions = { ...optionsFor(repo, dataDir), hostRunning: () => true };

    expect(() => uninstallPiDesktopPlugin(running)).toThrow(/PI-Desktop is running/);
    expect(piDesktopStatus(optionsFor(repo, dataDir)).registered).toBe(true);

    // A dry run writes nothing, so a live host does not block it.
    expect(uninstallPiDesktopPlugin({ ...running, dryRun: true }).removedRow).toBe(true);

    const forced = uninstallPiDesktopPlugin({ ...running, force: true });
    expect(forced.removedRow).toBe(true);
  });
});

describe("trellis pi-desktop status", () => {
  it("reports registration, skills and drift", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();
    installPiDesktopPlugin(optionsFor(repo, dataDir));

    const clean = piDesktopStatus(optionsFor(repo, dataDir));
    expect(clean.registered).toBe(true);
    expect(clean.row?.id).toBe(PI_DESKTOP_PLUGIN_ID);
    expect(clean.missingInInstall).toEqual([]);
    expect(clean.changedInInstall).toEqual([]);
    expect(clean.extraInInstall).toEqual([]);
    // The fraction counts only the skills Trellis wrote, so the user's own skill
    // stays out of the denominator instead of reading as permanently missing.
    expect(clean.skillsOnDisk).toBe(1);
    expect(clean.skillsRegistered).toBe(1);

    writeFileSync(join(clean.installedDir, "main.js"), "module.exports = {x:1};\n");
    const drifted = piDesktopStatus(optionsFor(repo, dataDir));
    expect(drifted.changedInInstall).toEqual(["main.js"]);
  });

  it("reports an unregistered repository without throwing", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();

    const report = piDesktopStatus(optionsFor(repo, dataDir));

    expect(report.registered).toBe(false);
    expect(report.row).toBeNull();
    expect(report.missingInInstall).toHaveLength(3);
    expect(report.skillsRegistered).toBe(0);
  });

  it("is not registered in a repository the row's scope does not cover", () => {
    const installed = scaffoldRepo();
    const other = scaffoldRepo();
    const dataDir = dataDirForTest();
    installPiDesktopPlugin(optionsFor(installed, dataDir));

    const report = piDesktopStatus(optionsFor(other, dataDir));

    // The row exists, but the host does not activate Trellis here.
    expect(report.row?.id).toBe(PI_DESKTOP_PLUGIN_ID);
    expect(report.registered).toBe(false);
    expect(report.row?.scope.projects).toEqual([normalizeProjectPath(installed)]);
    expect(report.skillsRegistered).toBe(0);

    expect(piDesktopStatus(optionsFor(installed, dataDir)).registered).toBe(true);
  });

  it("matches skill rows case-insensitively on Windows", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();
    const report = installPiDesktopPlugin(optionsFor(repo, dataDir));
    const rows = readJson(report.skills.path) as UserSkillRow[];

    // `d:\x` and `D:\x` are the same repository on Windows, so the scope is
    // stored in whatever case the installing shell used.
    const mixed = process.platform === "win32" ? repo.toUpperCase() : repo;

    expect(skillsForRepo(rows, mixed).map((row) => row.id)).toEqual([
      "trellis-demo",
    ]);
    expect(piDesktopStatus(optionsFor(mixed, dataDir)).skillsRegistered).toBe(1);
  });
});

describe("pi-desktop project paths", () => {
  it("strips the trailing separator of a normal path", () => {
    const repo = scaffoldRepo();
    expect(normalizeProjectPath(`${repo}/`)).toBe(normalizeProjectPath(repo));
  });

  it.skipIf(process.platform !== "win32")("keeps a drive root intact", () => {
    // `D:` means "current directory on D:" to Windows, not the drive root.
    expect(normalizeProjectPath("D:\\")).toBe("D:/");
    expect(normalizeProjectPath("D:/")).toBe("D:/");
    expect(normalizeProjectPath("D:\\work\\repo")).toBe("D:/work/repo");
  });
});

describe("trellis pi-desktop CLI", () => {
  /** Run the real command tree and return what it printed on stdout. */
  async function run(argv: string[]): Promise<string> {
    const program = new Command();
    program.exitOverride();
    registerPiDesktopCommand(program);
    const printed: string[] = [];
    const errors: string[] = [];
    const log = vi
      .spyOn(console, "log")
      .mockImplementation((...args: unknown[]) => {
        printed.push(args.map(String).join(" "));
      });
    const error = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      });
    try {
      await program.parseAsync(["node", "trellis", ...argv]);
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
    expect(errors).toEqual([]);
    return printed.join("\n");
  }

  async function inRepo<T>(repo: string, body: () => Promise<T>): Promise<T> {
    const previous = process.cwd();
    process.chdir(repo);
    try {
      return await body();
    } finally {
      process.chdir(previous);
    }
  }

  it("passes --agents-dir through status and uninstall", async () => {
    const first = scaffoldRepo();
    const second = scaffoldRepo();
    const dataDir = dataDirForTest();
    const agentsDir = join(dataDir, "custom-agents");
    const subagents = join(agentsDir, "subagents");
    installPiDesktopPlugin({ ...optionsFor(first, dataDir), agentsDir });
    installPiDesktopPlugin({ ...optionsFor(second, dataDir), agentsDir });

    const status = JSON.parse(
      await inRepo(first, () =>
        run([
          "pi-desktop",
          "status",
          "--data-dir",
          dataDir,
          "--agents-dir",
          agentsDir,
          "--json",
        ]),
      ),
    ) as { subagentsDir: string; subagentsFound: number; registered: boolean };
    expect(status.subagentsDir).toBe(subagents);
    expect(status.subagentsFound).toBe(3);
    expect(status.registered).toBe(true);

    // The uninstall only removes this repository from the shared scope, and it
    // looks for the sub-agents where install put them.
    const scoped = await inRepo(first, () =>
      run([
        "pi-desktop",
        "uninstall",
        "--data-dir",
        dataDir,
        "--agents-dir",
        agentsDir,
        "--force",
      ]),
    );
    expect(scoped).toMatch(/scope kept for 1 other project/);
    expect(existsSync(join(subagents, "trellis-check.md"))).toBe(true);

    const last = await inRepo(second, () =>
      run([
        "pi-desktop",
        "uninstall",
        "--data-dir",
        dataDir,
        "--agents-dir",
        agentsDir,
        "--force",
      ]),
    );
    expect(last).toMatch(/registry row removed/);
    expect(existsSync(join(subagents, "trellis-check.md"))).toBe(false);
    expect(existsSync(join(subagents, "trellis-research.md"))).toBe(false);
  });
});

describe("global sub-agents (~/.agents/subagents)", () => {
  it("writes the three roles in the host's shape", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();

    const report = installPiDesktopPlugin(optionsFor(repo, dataDir));

    expect(report.subagents.skipped).toBe(false);
    expect(report.subagents.written.sort()).toEqual([
      "trellis-check.md",
      "trellis-implement.md",
      "trellis-research.md",
    ]);

    const dir = join(dataDir, "agents-home", "subagents");
    expect(report.subagents.dir).toBe(dir);

    const content = readFileSync(join(dir, "trellis-check.md"), "utf-8");
    // The host validates tools case-sensitively: lowercase `read` is dropped,
    // so a verbatim copy of `.pi/agents/*.md` would fail to load.
    expect(content).toMatch(/^name: trellis-check$/m);
    expect(content).toMatch(/^tools: \[Read, /m);
    expect(content).toMatch(/^description: .+/m);
    expect(content).toContain("trellis-managed: pi-desktop");
    expect(content).toContain("## Scope Guard (must run first)");
    expect(content).toContain(".trellis/workflow.md");
  });

  it("is idempotent and never rewrites unchanged bytes", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();
    installPiDesktopPlugin(optionsFor(repo, dataDir));

    const again = installPiDesktopPlugin(optionsFor(repo, dataDir));

    expect(again.subagents.written).toEqual([]);
    expect(again.subagents.unchanged).toHaveLength(3);
  });

  it("removes only the files Trellis wrote", () => {
    const repo = scaffoldRepo();
    const dataDir = dataDirForTest();
    const report = installPiDesktopPlugin(optionsFor(repo, dataDir));
    const foreign = join(report.subagents.dir, "my-own.md");
    writeFileSync(foreign, "---\nname: my-own\ndescription: mine\n---\n");

    uninstallPiDesktopPlugin(optionsFor(repo, dataDir));

    expect(readdirSync(report.subagents.dir)).toEqual(["my-own.md"]);
  });
});

/**
 * Synthetic-project acceptance for DeepSeek Harness and Cursor.
 * File placement and command output only: neither host is launched.
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recallMem, readMemRefs } from "mini-trellis-core/mem";

vi.mock("figlet", () => ({
  default: { textSync: vi.fn(() => "mini-trellis") },
}));
vi.mock("inquirer", () => ({
  default: { prompt: vi.fn() },
}));

import { init } from "../../src/commands/init.js";
import { buildDoctorReport } from "../../src/commands/doctor.js";
import { runRefresh } from "../../src/commands/refresh.js";
import { resetResolvedPythonCommand } from "../../src/configurators/shared.js";
import { setWriteMode } from "../../src/utils/file-writer.js";

function has(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const canRun = has("git", ["--version"]) && has("python3", ["--version"]);
const TOPIC = ".trellis/research/callback-limit.md";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });
}

function writeTopic(cwd: string, key: string): void {
  fs.writeFileSync(
    path.join(cwd, TOPIC),
    `# Callback limit\n\nEach callback must carry idempotency key ${key}.\n`,
  );
}

function recordTopic(cwd: string, key: string): void {
  execFileSync(
    "python3",
    [
      ".trellis/scripts/add_session.py",
      "--title",
      "Callback limit",
      "--summary",
      `Recorded idempotency key ${key}`,
      "--topic",
      TOPIC,
    ],
    { cwd, stdio: "pipe" },
  );
}

describe.skipIf(!canRun)("DeepSeek and Cursor synthetic project", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "mini-trellis-dsh-cursor-")),
    );
    git(tmpDir, "init", "-q", "-b", "main");
    git(tmpDir, "config", "user.email", "t@example.com");
    git(tmpDir, "config", "user.name", "Test");
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    resetResolvedPythonCommand();
    await init({
      yes: true,
      force: true,
      user: "tester",
      dsh: true,
      cursor: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetResolvedPythonCommand();
    setWriteMode("ask");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("installs pull skills, injects a short local Cursor entry, and recalls an updated note", () => {
    expect(
      fs.existsSync(
        path.join(tmpDir, ".dsh/skills/mini-trellis-remember/SKILL.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".dsh/skills/mini-trellis-update-spec/SKILL.md"),
      ),
    ).toBe(true);
    const dshSkill = fs.readFileSync(
      path.join(tmpDir, ".dsh/skills/mini-trellis-session-insight/SKILL.md"),
      "utf8",
    );
    expect(dshSkill).toContain("no project SessionStart");
    expect(dshSkill).toContain("~/.dsh/sessions");
    expect(fs.existsSync(path.join(tmpDir, ".dsh/hooks"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".agents"))).toBe(false);

    const hooks = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".cursor/hooks.json"), "utf8"),
    ) as { hooks: Record<string, unknown> };
    expect(Object.keys(hooks.hooks)).toEqual(["sessionStart"]);
    expect(JSON.stringify(hooks)).not.toContain("beforeSubmitPrompt");
    expect(
      fs.existsSync(
        path.join(tmpDir, ".cursor/skills/mini-trellis-remember/SKILL.md"),
      ),
    ).toBe(true);

    const report = buildDoctorReport(tmpDir);
    expect(report.platforms.sort()).toEqual(["cursor", "dsh"]);
    expect(report.checks.find((check) => check.name === "dsh")?.level).toBe(
      "ok",
    );
    expect(
      report.checks.find((check) => check.name === "dsh-trigger")?.detail,
    ).toContain("no project SessionStart");
    expect(
      report.checks.find((check) => check.name === "dsh-runtime"),
    ).toBeUndefined();
    expect(
      report.checks.find((check) => check.name === "cursor-runtime")?.detail,
    ).toContain("cloud agents do not run sessionStart");

    writeTopic(tmpDir, "key-one");
    recordTopic(tmpDir, "key-one");

    const hook = spawnSync(
      "python3",
      [path.join(tmpDir, ".cursor/hooks/session-start.py")],
      {
        cwd: tmpDir,
        input: JSON.stringify({
          session_id: "cursor-session-1",
          is_background_agent: false,
          composer_mode: "agent",
        }),
        encoding: "utf8",
      },
    );
    expect(hook.status).toBe(0);
    const payload = JSON.parse(hook.stdout) as {
      additional_context?: string;
    };
    expect(payload.additional_context).toContain("mini-trellis mem recall");
    expect(payload.additional_context).toContain("mini-trellis-remember");
    expect(payload.additional_context).not.toContain("key-one");

    const first = recallMem({
      query: "idempotency key-one",
      cwd: tmpDir,
      limit: 3,
    });
    expect(
      first.hits.some(
        (hit) => hit.path === TOPIC && hit.excerpt.includes("key-one"),
      ),
    ).toBe(true);

    writeTopic(tmpDir, "key-two");
    recordTopic(tmpDir, "key-two");
    const second = recallMem({
      query: "idempotency key-two",
      cwd: tmpDir,
      limit: 3,
    });
    const updated = second.hits.find((hit) => hit.path === TOPIC);
    expect(updated?.excerpt).toContain("key-two");
    if (!updated) throw new Error("updated topic was not recalled");
    const read = readMemRefs({ cwd: tmpDir, refs: [updated.ref] });
    expect(read.reads[0]?.text).toContain("key-two");
    expect(read.reads[0]?.path).toBe(TOPIC);
  });

  it("keeps a user Cursor hook when the host is configured again", async () => {
    const hooksPath = path.join(tmpDir, ".cursor/hooks.json");
    const existing = JSON.parse(fs.readFileSync(hooksPath, "utf8")) as {
      hooks: Record<string, unknown[]>;
    };
    existing.hooks.beforeShellExecution = [
      { command: "./hooks/user-audit.sh" },
    ];
    fs.writeFileSync(hooksPath, `${JSON.stringify(existing, null, 2)}\n`);

    await init({ yes: true, force: true, user: "tester", cursor: true });

    const merged = JSON.parse(fs.readFileSync(hooksPath, "utf8")) as {
      hooks: Record<string, { command?: string }[]>;
    };
    expect(Object.keys(merged.hooks).sort()).toEqual([
      "beforeShellExecution",
      "sessionStart",
    ]);
    expect(merged.hooks.beforeShellExecution[0]?.command).toBe(
      "./hooks/user-audit.sh",
    );
    expect(merged.hooks.sessionStart).toHaveLength(1);
    const lines = vi
      .mocked(console.log)
      .mock.calls.map((args) => args.map((arg) => String(arg)).join(" "))
      .join("\n");
    expect(lines).toContain("mini-trellis-remember");
    expect(lines).not.toContain("/mini-trellis:remember");
  });

  it("keeps a user Cursor hook across refresh and reports invalid JSON", async () => {
    const hooksPath = path.join(tmpDir, ".cursor/hooks.json");
    const existing = JSON.parse(fs.readFileSync(hooksPath, "utf8")) as {
      version: number;
      hooks: Record<string, unknown[]>;
    };
    existing.version = 2;
    existing.hooks.beforeShellExecution = [
      { command: "./hooks/user-audit.sh" },
    ];
    fs.writeFileSync(hooksPath, `${JSON.stringify(existing, null, 2)}\n`);

    const report = runRefresh({ cwd: tmpDir, cursor: true });
    expect(report.ok).toBe(true);
    const merged = JSON.parse(fs.readFileSync(hooksPath, "utf8")) as {
      version: number;
      hooks: Record<string, { command?: string }[]>;
    };
    expect(merged.version).toBe(2);
    expect(merged.hooks.beforeShellExecution[0]?.command).toBe(
      "./hooks/user-audit.sh",
    );
    expect(merged.hooks.sessionStart).toHaveLength(1);

    fs.writeFileSync(hooksPath, "{not json\n");
    const blocked = runRefresh({ cwd: tmpDir, cursor: true });
    expect(blocked.ok).toBe(false);
    expect(
      blocked.items.find((item) => item.path === ".cursor/hooks.json"),
    ).toMatchObject({
      action: "conflict",
      detail: "existing file is not valid JSON",
    });
    expect(fs.readFileSync(hooksPath, "utf8")).toBe("{not json\n");

    const diagnosis = buildDoctorReport(tmpDir);
    expect(
      diagnosis.checks.find((check) => check.name === "cursor-config"),
    ).toMatchObject({
      level: "warn",
      detail: expect.stringContaining("not valid JSON"),
    });

    await init({ yes: true, force: true, user: "tester", cursor: true });
    expect(fs.readFileSync(hooksPath, "utf8")).toBe("{not json\n");
    const warnings = vi
      .mocked(console.warn)
      .mock.calls.map((args) => args.map((arg) => String(arg)).join(" "))
      .join("\n");
    expect(warnings).toContain("Skipped .cursor/hooks.json");
  });
});

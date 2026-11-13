import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Three sites used to hand a template's raw bytes to `writeFile` while
 * `collectPlatformTemplates` ran the whole map through the python3 → python
 * rewrite: `.snow/SNOW.md` (snow.ts), `.github/copilot-instructions.md`
 * (copilot.ts) and `.reasonix/skills/<agent>/SKILL.md` (reasonix.ts). The two
 * paths agreed only because those four template files happen to contain no
 * `python3` literal — adding one would have produced a permanent phantom
 * `trellis update` diff on Windows and nowhere else.
 *
 * Converging `configure` onto `collectTemplates` routes them through the same
 * rewrite. That is a real behavior change, so it gets a test that injects the
 * literal those files do not have yet.
 */
const { PYTHON3_LINE } = vi.hoisted(() => ({
  PYTHON3_LINE:
    "\n\nRun `python3 ./.trellis/scripts/task.py current` before starting.\n",
}));

vi.mock("../../src/templates/snow/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/templates/snow/index.js")>();
  return {
    ...actual,
    getSnowGuide: () => `${actual.getSnowGuide()}${PYTHON3_LINE}`,
  };
});

vi.mock("../../src/templates/copilot/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/templates/copilot/index.js")
    >();
  return {
    ...actual,
    getCopilotInstructions: () =>
      `${actual.getCopilotInstructions()}${PYTHON3_LINE}`,
  };
});

vi.mock("../../src/templates/reasonix/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/templates/reasonix/index.js")
    >();
  return {
    ...actual,
    getAllAgents: () =>
      actual
        .getAllAgents()
        .map((agent) => ({ ...agent, content: agent.content + PYTHON3_LINE })),
  };
});

const {
  collectPlatformTemplates,
  configurePlatform,
} = await import("../../src/configurators/index.js");
const { setWriteMode } = await import("../../src/utils/file-writer.js");
const { resetResolvedPythonCommand, setResolvedPythonCommand } = await import(
  "../../src/configurators/shared.js"
);

/** The previously-raw write sites, one file each. */
const RAW_WRITE_SITES = [
  ["snow", ".snow/SNOW.md"],
  ["copilot", ".github/copilot-instructions.md"],
  ["reasonix", ".reasonix/skills/trellis-implement/SKILL.md"],
] as const;

async function configureInto(
  id: (typeof RAW_WRITE_SITES)[number][0],
  relPath: string,
): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `trellis-pyrewrite-${id}-`));
  try {
    await configurePlatform(id, dir);
    return fs.readFileSync(path.join(dir, ...relPath.split("/")), "utf-8");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("python3 rewrite reaches the previously-raw write sites", () => {
  beforeEach(() => {
    setWriteMode("force");
  });

  afterEach(() => {
    resetResolvedPythonCommand();
    setWriteMode("ask");
  });

  it("leaves the literal alone under the default (POSIX) rendering", async () => {
    // Guards the test itself: proves the injected literal really reaches disk,
    // so the Windows case below is measuring the rewrite and not a dead mock.
    for (const [id, relPath] of RAW_WRITE_SITES) {
      const written = await configureInto(id, relPath);
      expect(written, `${id}: ${relPath}`).toContain(
        "python3 ./.trellis/scripts/task.py",
      );
    }
  });

  it.each(["python", "py -3"])("rewrites the literal under Windows %s rendering, matching collectTemplates", async (command) => {
    setResolvedPythonCommand(command);
    for (const [id, relPath] of RAW_WRITE_SITES) {
      const written = await configureInto(id, relPath);
      expect(written, `${id}: ${relPath}`).toContain(
        `${command} ./.trellis/scripts/task.py`,
      );
      expect(written, `${id}: ${relPath}`).not.toContain("python3");
      expect(written, `${id}: ${relPath} must match the collected bytes`).toBe(
        collectPlatformTemplates(id)?.get(relPath),
      );
    }
  });
});

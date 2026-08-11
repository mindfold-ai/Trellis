import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const cliRoot = resolve(import.meta.dirname, "../..");
const scriptPath = join(cliRoot, "scripts", "migrate-trellis-pi-subagents.ps1");
const canonicalExtensionPath = join(
  cliRoot,
  "src",
  "templates",
  "pi",
  "extensions",
  "trellis",
  "index.ts.txt",
);
const canonicalTelemetryPath = join(
  cliRoot,
  "src",
  "templates",
  "pi",
  "extensions",
  "context-telemetry",
  "index.ts.txt",
);
const telemetryRelativePath = ".pi/extensions/context-telemetry/index.ts";
const pwshProbe = spawnSync(
  "pwsh",
  ["-NoLogo", "-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"],
  { encoding: "utf-8" },
);
const hasPwsh = pwshProbe.status === 0 && Number(pwshProbe.stdout.trim()) >= 7;

const LEGACY_TASK_LINE =
  "1. **Look at the dispatch prompt** you received from the main agent. If its first line is `Active task: <path>` (e.g. `Active task: .trellis/tasks/04-17-foo`), use that path. The main agent is required to include this line on class-2 platforms.";

const roots: string[] = [];

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

function write(root: string, relativePath: string, content: string): void {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf-8");
}

function role(name: string): string {
  const taskResolution =
    name === "trellis-research"
      ? "1. Resolve the active task with `python3 ./.trellis/scripts/task.py current --source`."
      : LEGACY_TASK_LINE;
  return [
    "---",
    `name: ${name}`,
    `description: Legacy ${name} fixture.`,
    "tools: read, write, edit, bash",
    "---",
    `# ${name}`,
    "",
    "## Core Responsibilities",
    "",
    taskResolution,
    "2. Create `<task-dir>/research/` when it does not exist.",
    "3. Search internal code, specs, and relevant external documentation.",
    "4. Write each distinct topic to `<task-dir>/research/<topic-slug>.md`.",
    "5. Report only file paths and concise summaries to the caller.",
    "",
    "Keep this fixture body.",
    "",
  ].join("\n");
}

function createLegacyProject(): {
  root: string;
  originals: Map<string, string>;
} {
  const root = mkdtempSync(join(tmpdir(), "trellis-pi-migrator-"));
  roots.push(root);
  write(root, ".trellis/.version", "0.6.14\n");
  write(root, "unrelated.txt", "preserve me\n");

  const files = new Map<string, string>([
    [
      ".pi/settings.json",
      JSON.stringify(
        {
          enableSkillCommands: true,
          extensions: ["./extensions/trellis/index.ts"],
          prompts: ["./prompts"],
        },
        null,
        2,
      ) + "\n",
    ],
    [".pi/agents/trellis-implement.md", role("trellis-implement")],
    [".pi/agents/trellis-check.md", role("trellis-check")],
    [".pi/agents/trellis-research.md", role("trellis-research")],
    [
      ".pi/extensions/trellis/index.ts",
      [
        "export default function trellisExtension(pi: any) {",
        '  pi.registerTool({ name: "trellis_subagent" });',
        '  pi.registerShortcut("alt+o", {});',
        "}",
        "",
      ].join("\n"),
    ],
  ]);

  const hashes: Record<string, string> = {};
  for (const [relativePath, content] of files) {
    write(root, relativePath, content);
    hashes[relativePath] = sha256(content);
  }
  const hashContent = JSON.stringify({ __version: 2, hashes }, null, 2) + "\n";
  write(root, ".trellis/.template-hashes.json", hashContent);
  files.set(".trellis/.template-hashes.json", hashContent);
  return { root, originals: files };
}

function run(args: string[]) {
  return spawnSync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-File", scriptPath, ...args],
    { encoding: "utf-8" },
  );
}

function snapshot(root: string): Map<string, string> {
  const result = new Map<string, string>();
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else result.set(full.slice(root.length + 1), readFileSync(full, "utf-8"));
    }
  };
  walk(root);
  return result;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!hasPwsh)("guarded Pi subagents PowerShell migrator", () => {
  it("previews without writes, applies atomically, and is a second-run no-op", () => {
    const { root } = createLegacyProject();
    const before = snapshot(root);

    const preview = run(["-ProjectRoot", root, "-WhatIf"]);
    expect(preview.status, preview.stderr).toBe(0);
    expect(preview.stdout).toContain("recognized-legacy .pi/settings.json");
    expect(preview.stdout).toContain(
      "managed-new .pi/extensions/context-telemetry/index.ts",
    );
    expect(preview.stdout).toContain("WhatIf: 7 targeted file(s)");
    expect(snapshot(root)).toEqual(before);
    expect(existsSync(join(root, ".trellis/.migrations"))).toBe(false);

    const applied = run(["-ProjectRoot", root]);
    expect(applied.status, applied.stderr).toBe(0);
    expect(applied.stdout).toContain("Migration complete: 7 file(s).");
    const settings = JSON.parse(
      readFileSync(join(root, ".pi/settings.json"), "utf-8"),
    ) as { packages: string[] };
    expect(settings.packages).toEqual(["npm:pi-subagents@0.46.0"]);
    for (const name of [
      "trellis-implement",
      "trellis-check",
      "trellis-research",
    ]) {
      const content = readFileSync(
        join(root, `.pi/agents/${name}.md`),
        "utf-8",
      );
      expect(content).toContain(
        "extensions: ./.pi/extensions/context-telemetry/index.ts",
      );
      expect(content).toContain("thinking: medium");
      expect(content).toContain("defaultContext: fresh");
      expect(content).toContain("maxSubagentDepth: 0");
      expect(content).toContain("nestedPiBoundary: unenforced");
      expect(content).toContain("do not create an OS sandbox");
      expect(content).toContain('"review":false');
      if (name === "trellis-check") {
        expect(content).toContain('"review-findings"');
      }
      expect(content).toContain("Task: Active task: <path>");
      if (name === "trellis-research") {
        expect(content).toContain(
          "Only when the dispatch message has no accepted task identity",
        );
        expect(content).toContain(
          "3. Create `<task-dir>/research/` when it does not exist.",
        );
      }
      expect(content).toContain("Keep this fixture body.");
    }
    expect(
      readFileSync(join(root, ".pi/extensions/trellis/index.ts"), "utf-8"),
    ).toBe(readFileSync(canonicalExtensionPath, "utf-8"));
    expect(readFileSync(join(root, telemetryRelativePath), "utf-8")).toBe(
      readFileSync(canonicalTelemetryPath, "utf-8"),
    );
    expect(readFileSync(join(root, "unrelated.txt"), "utf-8")).toBe(
      "preserve me\n",
    );
    const migratedHashes = JSON.parse(
      readFileSync(join(root, ".trellis/.template-hashes.json"), "utf-8"),
    ) as { hashes: Record<string, string> };
    for (const relativePath of [
      ".pi/settings.json",
      ".pi/agents/trellis-implement.md",
      ".pi/agents/trellis-check.md",
      ".pi/agents/trellis-research.md",
      ".pi/extensions/trellis/index.ts",
      telemetryRelativePath,
    ]) {
      expect(migratedHashes.hashes[relativePath]).toBe(
        sha256(readFileSync(join(root, relativePath), "utf-8")).toUpperCase(),
      );
    }

    const afterApply = snapshot(root);
    const second = run(["-ProjectRoot", root]);
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain("No changes required");
    expect(snapshot(root)).toEqual(afterApply);
  });

  it("reconciles stale template metadata for an already-migrated project", () => {
    const { root, originals } = createLegacyProject();
    const applied = run(["-ProjectRoot", root]);
    expect(applied.status, applied.stderr).toBe(0);

    const originalHashes = originals.get(".trellis/.template-hashes.json");
    if (!originalHashes)
      throw new Error("Legacy template hashes fixture missing");
    writeFileSync(
      join(root, ".trellis/.template-hashes.json"),
      originalHashes,
      "utf-8",
    );
    const reconciled = run(["-ProjectRoot", root]);
    expect(reconciled.status, reconciled.stderr).toBe(0);
    expect(reconciled.stdout).toContain("Migration complete: 1 file(s).");

    const hashes = JSON.parse(
      readFileSync(join(root, ".trellis/.template-hashes.json"), "utf-8"),
    ) as { hashes: Record<string, string> };
    for (const relativePath of [
      ".pi/settings.json",
      ".pi/agents/trellis-implement.md",
      ".pi/agents/trellis-check.md",
      ".pi/agents/trellis-research.md",
      ".pi/extensions/trellis/index.ts",
      telemetryRelativePath,
    ]) {
      expect(hashes.hashes[relativePath]).toBe(
        sha256(readFileSync(join(root, relativePath), "utf-8")).toUpperCase(),
      );
    }

    const third = run(["-ProjectRoot", root]);
    expect(third.status, third.stderr).toBe(0);
    expect(third.stdout).toContain("No changes required");
  });

  it("fails closed before backup creation when a legacy target was customized", () => {
    const { root } = createLegacyProject();
    const rolePath = join(root, ".pi/agents/trellis-check.md");
    writeFileSync(
      rolePath,
      readFileSync(rolePath, "utf-8") + "user customization\n",
      "utf-8",
    );
    const before = snapshot(root);

    const result = run(["-ProjectRoot", root]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unknown customization detected");
    expect(snapshot(root)).toEqual(before);
    expect(existsSync(join(root, ".trellis/.migrations"))).toBe(false);
  });

  it("fails closed when an already-managed telemetry extension was customized", () => {
    const { root } = createLegacyProject();
    const applied = run(["-ProjectRoot", root]);
    expect(applied.status, applied.stderr).toBe(0);

    const telemetryPath = join(root, telemetryRelativePath);
    writeFileSync(
      telemetryPath,
      readFileSync(telemetryPath, "utf-8") + "// local customization\n",
      "utf-8",
    );
    const before = snapshot(root);

    const result = run(["-ProjectRoot", root]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unknown customization detected");
    expect(snapshot(root)).toEqual(before);
  });

  it("writes a SHA256 manifest and verifies both rollback inputs and restoration", () => {
    const { root, originals } = createLegacyProject();
    const applied = run(["-ProjectRoot", root]);
    expect(applied.status, applied.stderr).toBe(0);
    const manifestLine = applied.stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith("Rollback manifest: "));
    if (!manifestLine)
      throw new Error("Rollback manifest path was not emitted");
    const manifestPath = manifestLine.slice("Rollback manifest: ".length);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
      schemaVersion: number;
      files: {
        path: string;
        classification: string;
        recordedTemplateHash: string | null;
        existedBefore: boolean;
        beforeHash: string | null;
        afterHash: string;
        backupPath: string | null;
      }[];
    };
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.files).toHaveLength(7);
    for (const entry of manifest.files) {
      if (entry.path === ".trellis/.template-hashes.json") {
        expect(entry.classification).toBe("migration-metadata");
        expect(entry.recordedTemplateHash).toBeNull();
        expect(entry.existedBefore).toBe(true);
      } else if (entry.path === telemetryRelativePath) {
        expect(entry.classification).toBe("managed-new");
        expect(entry.recordedTemplateHash).toBeNull();
        expect(entry.existedBefore).toBe(false);
        expect(entry.beforeHash).toBeNull();
        expect(entry.backupPath).toBeNull();
      } else {
        expect(entry.classification).toBe("recognized-legacy");
        expect(entry.recordedTemplateHash).toBe(entry.beforeHash);
        expect(entry.recordedTemplateHash).toMatch(/^[A-F0-9]{64}$/);
        expect(entry.existedBefore).toBe(true);
      }
      if (entry.beforeHash !== null) {
        expect(entry.beforeHash).toMatch(/^[A-F0-9]{64}$/);
      }
      expect(entry.afterHash).toMatch(/^[A-F0-9]{64}$/);
      if (entry.existedBefore) {
        expect(entry.backupPath).toBe(`files/${entry.path}`);
      }
    }

    const rollbackPreview = run(["-RollbackManifest", manifestPath, "-WhatIf"]);
    expect(rollbackPreview.status, rollbackPreview.stderr).toBe(0);
    expect(rollbackPreview.stdout).toContain(
      "rollback validated for 7 file(s)",
    );

    const rollback = run(["-RollbackManifest", manifestPath]);
    expect(rollback.status, rollback.stderr).toBe(0);
    expect(rollback.stdout).toContain("Rollback complete and verified");
    for (const [relativePath, original] of originals) {
      expect(readFileSync(join(root, relativePath), "utf-8")).toBe(original);
    }
    expect(existsSync(join(root, telemetryRelativePath))).toBe(false);
    expect(readFileSync(join(root, "unrelated.txt"), "utf-8")).toBe(
      "preserve me\n",
    );
  });
});

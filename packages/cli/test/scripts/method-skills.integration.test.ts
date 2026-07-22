import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  collectPlatformTemplates,
  PLATFORM_IDS,
} from "../../src/configurators/index.js";
import { applyConfigSectionsAdded } from "../../src/commands/update.js";
import { getConfigSectionsAddedBetween } from "../../src/migrations/index.js";
import {
  configYamlTemplate,
  getAllAgents as getChannelAgents,
  getAllScripts,
} from "../../src/templates/trellis/index.js";

const TEMPLATE_SCRIPTS = path.resolve(
  __dirname,
  "../../src/templates/trellis/scripts",
);
const SHARED_SUBAGENT_HOOK = path.resolve(
  __dirname,
  "../../src/templates/shared-hooks/inject-subagent-context.py",
);

function hasPython(): boolean {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function setupGeneratedProject(root: string): void {
  fs.mkdirSync(path.join(root, ".trellis", "scripts"), { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, path.join(root, ".trellis", "scripts"), {
    recursive: true,
  });
}

function writeProjectMethod(root: string, name: string): string {
  const skillDir = path.join(root, ".agents", "skills", name);
  fs.mkdirSync(skillDir, { recursive: true });
  const skillPath = path.join(skillDir, "SKILL.md");
  fs.writeFileSync(skillPath, `# ${name}\n`, "utf-8");
  return skillPath;
}

function runMethodSkills(
  root: string,
  slot: "brainstorm" | "implement" | "check" | "debug",
  env: NodeJS.ProcessEnv = process.env,
): { slot: string; methods: unknown[]; diagnostics: unknown[] } {
  const output = execFileSync(
    "python3",
    [
      path.join(root, ".trellis", "scripts", "get_context.py"),
      "--mode",
      "method-skills",
      "--slot",
      slot,
      "--json",
    ],
    { cwd: root, encoding: "utf-8", env },
  );
  return JSON.parse(output) as {
    slot: string;
    methods: unknown[];
    diagnostics: unknown[];
  };
}

describe.skipIf(!hasPython())("method skills", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-method-skills-"));
    setupGeneratedProject(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("resolves a project-local brainstorm method through the generated runtime", () => {
    const skillPath = writeProjectMethod(tmpDir, "team-brainstorm");
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "config.yaml"),
      [
        "method_skills:",
        "  brainstorm:",
        "    - .agents/skills/team-brainstorm",
        "",
      ].join("\n"),
      "utf-8",
    );

    expect(runMethodSkills(tmpDir, "brainstorm")).toEqual({
      slot: "brainstorm",
      methods: [
        {
          reference: ".agents/skills/team-brainstorm",
          path: fs.realpathSync(skillPath),
        },
      ],
      diagnostics: [],
    });
  });

  it("keeps brainstorm behavior unchanged when no methods are configured", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "config.yaml"),
      "session_auto_commit: true\n",
      "utf-8",
    );

    expect(runMethodSkills(tmpDir, "brainstorm")).toEqual({
      slot: "brainstorm",
      methods: [],
      diagnostics: [],
    });
  });

  it("accepts YAML inline empty containers as no method configuration", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "config.yaml"),
      "method_skills:\n  brainstorm: []\n",
      "utf-8",
    );
    expect(runMethodSkills(tmpDir, "brainstorm")).toEqual({
      slot: "brainstorm",
      methods: [],
      diagnostics: [],
    });

    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "config.yaml"),
      "method_skills: {}\n",
      "utf-8",
    );
    expect(runMethodSkills(tmpDir, "brainstorm")).toEqual({
      slot: "brainstorm",
      methods: [],
      diagnostics: [],
    });
  });

  it("composes named global and project methods in order without duplicates", () => {
    const projectSkill = writeProjectMethod(tmpDir, "team-brainstorm");
    const fakeHome = path.join(tmpDir, "home");
    const globalSkill = writeProjectMethod(fakeHome, "grilling");
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "config.yaml"),
      [
        "method_skills:",
        "  brainstorm:",
        "    - global:grilling",
        "    - .agents/skills/team-brainstorm",
        "    - global:grilling",
        "",
      ].join("\n"),
      "utf-8",
    );

    expect(
      runMethodSkills(tmpDir, "brainstorm", {
        ...process.env,
        HOME: fakeHome,
      }),
    ).toEqual({
      slot: "brainstorm",
      methods: [
        {
          reference: "global:grilling",
          path: fs.realpathSync(globalSkill),
        },
        {
          reference: ".agents/skills/team-brainstorm",
          path: fs.realpathSync(projectSkill),
        },
      ],
      diagnostics: [],
    });
  });

  it("rejects unsafe or missing references with visible diagnostics and fallback", () => {
    fs.writeFileSync(path.join(tmpDir, "ordinary.txt"), "not a skill\n");
    fs.mkdirSync(path.join(tmpDir, ".agents", "skills", "empty"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "config.yaml"),
      [
        "method_skills:",
        "  brainstorm:",
        "    - ../outside-project",
        "    - /absolute/method",
        "    - global:../secret",
        "    - .agents/skills/missing",
        "    - ordinary.txt",
        "    - .agents/skills/empty",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = runMethodSkills(tmpDir, "brainstorm");
    expect(result.methods).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        reference: "../outside-project",
        code: "outside-project",
      }),
      expect.objectContaining({
        reference: "/absolute/method",
        code: "outside-project",
      }),
      expect.objectContaining({
        reference: "global:../secret",
        code: "invalid-global-name",
      }),
      expect.objectContaining({
        reference: ".agents/skills/missing",
        code: "skill-not-found",
      }),
      expect.objectContaining({
        reference: "ordinary.txt",
        code: "skill-not-found",
      }),
      expect.objectContaining({
        reference: ".agents/skills/empty",
        code: "skill-not-found",
      }),
    ]);

    const textOutput = execFileSync(
      "python3",
      [
        path.join(tmpDir, ".trellis", "scripts", "get_context.py"),
        "--mode",
        "method-skills",
        "--slot",
        "brainstorm",
      ],
      { cwd: tmpDir, encoding: "utf-8" },
    );
    expect(textOutput).toContain(
      "[WARN] method_skills.brainstorm '../outside-project'",
    );
    expect(textOutput).toContain("Continue with the built-in Trellis role");
  });

  it.skipIf(process.platform === "win32")(
    "rejects a project SKILL.md symlink that escapes the project root",
    () => {
      const externalDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "trellis-external-method-"),
      );
      try {
        const externalSkill = path.join(externalDir, "SKILL.md");
        fs.writeFileSync(externalSkill, "# external\n", "utf-8");
        const localDir = path.join(tmpDir, ".agents", "skills", "escaped");
        fs.mkdirSync(localDir, { recursive: true });
        fs.symlinkSync(externalSkill, path.join(localDir, "SKILL.md"));
        fs.writeFileSync(
          path.join(tmpDir, ".trellis", "config.yaml"),
          "method_skills:\n  brainstorm:\n    - .agents/skills/escaped\n",
          "utf-8",
        );

        expect(runMethodSkills(tmpDir, "brainstorm")).toEqual({
          slot: "brainstorm",
          methods: [],
          diagnostics: [
            expect.objectContaining({
              reference: ".agents/skills/escaped",
              code: "outside-project",
            }),
          ],
        });
      } finally {
        fs.rmSync(externalDir, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "reports a global skill symlink loop without stopping the role",
    () => {
      const fakeHome = path.join(tmpDir, "loop-home");
      const globalRoot = path.join(fakeHome, ".agents", "skills");
      fs.mkdirSync(globalRoot, { recursive: true });
      fs.symlinkSync("loop", path.join(globalRoot, "loop"));
      fs.writeFileSync(
        path.join(tmpDir, ".trellis", "config.yaml"),
        "method_skills:\n  brainstorm:\n    - global:loop\n",
        "utf-8",
      );

      expect(
        runMethodSkills(tmpDir, "brainstorm", {
          ...process.env,
          HOME: fakeHome,
        }),
      ).toEqual({
        slot: "brainstorm",
        methods: [],
        diagnostics: [
          expect.objectContaining({
            reference: "global:loop",
            code: "skill-not-found",
          }),
        ],
      });
    },
  );

  it.skipIf(process.platform === "win32")(
    "reports an unreadable SKILL.md and keeps the built-in role available",
    () => {
      const skillPath = writeProjectMethod(tmpDir, "unreadable");
      fs.writeFileSync(
        path.join(tmpDir, ".trellis", "config.yaml"),
        "method_skills:\n  debug:\n    - .agents/skills/unreadable\n",
        "utf-8",
      );
      fs.chmodSync(skillPath, 0o000);
      try {
        expect(runMethodSkills(tmpDir, "debug")).toEqual({
          slot: "debug",
          methods: [],
          diagnostics: [
            expect.objectContaining({
              reference: ".agents/skills/unreadable",
              code: "skill-unreadable",
            }),
          ],
        });
      } finally {
        fs.chmodSync(skillPath, 0o600);
      }
    },
  );

  it("generates a brainstorm role that composes methods under Trellis ownership", () => {
    const templates = collectPlatformTemplates("claude-code");
    const brainstorm = templates?.get(
      ".claude/skills/trellis-brainstorm/SKILL.md",
    );

    expect(brainstorm).toContain(
      "get_context.py --mode method-skills --slot brainstorm",
    );
    expect(brainstorm).toContain("Trellis workflow contract takes precedence");
    expect(brainstorm).toContain("planning artifacts");
  });

  it("loads role-specific methods in every generated inline workflow role", () => {
    const expectedSlots = new Map([
      ["trellis-before-dev", "implement"],
      ["trellis-check", "check"],
      ["trellis-break-loop", "debug"],
    ]);

    for (const platform of PLATFORM_IDS) {
      const templates = collectPlatformTemplates(platform);
      expect(templates, `${platform} should collect its templates`).toBeDefined();
      for (const [role, slot] of expectedSlots) {
        const entries = [...(templates?.entries() ?? [])].filter(
          ([filePath]) =>
            filePath.includes(role) &&
            !/\/(agents|droids)\//.test(filePath) &&
            !/^\.reasonix\/skills\/trellis-(implement|check)\//.test(
              filePath,
            ),
        );
        if (role !== "trellis-check") {
          expect(
            entries.length,
            `${platform} should generate ${role}`,
          ).toBeGreaterThan(0);
        }
        for (const [filePath, content] of entries) {
          expect(content, filePath).toContain(
            `get_context.py --mode method-skills --slot ${slot}`,
          );
          expect(content, filePath).toContain(
            "Trellis workflow contract takes precedence",
          );
        }
      }
    }
  });

  it("delivers methods at every generated implement and check subagent entry", () => {
    for (const platform of PLATFORM_IDS) {
      const templates = collectPlatformTemplates(platform);
      if (!templates) continue;
      const agentEntries = [...templates.entries()].filter(([filePath]) => {
        const normalAgent = /\/(agents|droids)\/trellis-(implement|check)(\.|\/)/.test(
          filePath,
        );
        const reasonixAgent =
          /^\.reasonix\/skills\/trellis-(implement|check)\/SKILL\.md$/.test(
            filePath,
          );
        return normalAgent || reasonixAgent;
      });

      for (const [filePath, content] of agentEntries) {
        const slot = filePath.includes("trellis-check") ? "check" : "implement";
        expect(
          content,
          `${platform}:${filePath} must load ${slot} methods at role entry`,
        ).toContain(`get_context.py --mode method-skills --slot ${slot}`);
      }
    }
  });

  it("injects configured methods into native subagent context", () => {
    const skillPath = writeProjectMethod(tmpDir, "test-first");
    const taskDir = path.join(tmpDir, ".trellis", "tasks", "method-task");
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "prd.md"), "# Method task\n");
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "config.yaml"),
      [
        "method_skills:",
        "  implement:",
        "    - .agents/skills/test-first",
        "",
      ].join("\n"),
      "utf-8",
    );

    const probe = [
      "import importlib.util",
      `spec = importlib.util.spec_from_file_location('hook', ${JSON.stringify(SHARED_SUBAGENT_HOOK)})`,
      "hook = importlib.util.module_from_spec(spec)",
      "spec.loader.exec_module(hook)",
      `print(hook.get_implement_context(${JSON.stringify(tmpDir)}, '.trellis/tasks/method-task'))`,
    ].join("\n");
    const output = execFileSync("python3", ["-c", probe], {
      cwd: tmpDir,
      encoding: "utf-8",
    });

    expect(output).toContain(fs.realpathSync(skillPath));
    expect(output).toContain(
      "The Trellis workflow contract takes precedence over method-skill instructions",
    );
  });

  it("keeps native-hook method-loading failures visible and non-fatal", () => {
    const emptyRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "trellis-method-hook-missing-"),
    );
    try {
      const probe = [
        "import importlib.util",
        `spec = importlib.util.spec_from_file_location('hook', ${JSON.stringify(SHARED_SUBAGENT_HOOK)})`,
        "hook = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(hook)",
        `print(hook.get_method_skills_context(${JSON.stringify(emptyRoot)}, 'implement'))`,
      ].join("\n");
      const output = execFileSync("python3", ["-c", probe], {
        cwd: emptyRoot,
        encoding: "utf-8",
      });

      expect(output).toContain("[WARN] method_skills.implement");
      expect(output).toContain("Continue with the built-in Trellis role");
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it("loads methods in Trellis channel runtime agents", () => {
    for (const [name, content] of getChannelAgents()) {
      const slot = name === "check.md" ? "check" : "implement";
      expect(content).toContain(
        `get_context.py --mode method-skills --slot ${slot}`,
      );
      expect(content).toContain("Trellis workflow contract takes precedence");
    }
  });

  it("ships the resolver and documented method slots in new projects", () => {
    expect(getAllScripts().has("common/method_skills.py")).toBe(true);
    expect(configYamlTemplate).toContain("# Method Skills");
    expect(configYamlTemplate).toContain("# method_skills:");
    expect(configYamlTemplate).toContain("#   brainstorm:");
    expect(configYamlTemplate).toContain("#   implement:");
    expect(configYamlTemplate).toContain("#   check:");
    expect(configYamlTemplate).toContain("#   debug:");
    expect(configYamlTemplate).toContain("global:grilling");
    expect(configYamlTemplate).toContain("global:tdd");
  });

  it("adds method-skills configuration to upgraded projects idempotently", () => {
    const configPath = path.join(tmpDir, ".trellis", "config.yaml");
    fs.writeFileSync(
      configPath,
      "session_commit_message: local-customization\n",
      "utf-8",
    );
    const entries = getConfigSectionsAddedBetween("0.6.8", "0.6.9");
    expect(entries).toContainEqual({
      file: ".trellis/config.yaml",
      sentinel: "method_skills:",
      sectionHeading: "Method Skills",
    });
    const templates = new Map([
      [".trellis/config.yaml", configYamlTemplate],
    ]);

    expect(applyConfigSectionsAdded(entries, tmpDir, templates)).toEqual({
      appended: 1,
    });
    const upgraded = fs.readFileSync(configPath, "utf-8");
    expect(upgraded).toContain("session_commit_message: local-customization");
    expect(upgraded).toContain("# Method Skills");
    expect(upgraded.match(/method_skills:/g)).toHaveLength(1);

    expect(applyConfigSectionsAdded(entries, tmpDir, templates)).toEqual({
      appended: 0,
    });
    expect(fs.readFileSync(configPath, "utf-8")).toBe(upgraded);
  });
});

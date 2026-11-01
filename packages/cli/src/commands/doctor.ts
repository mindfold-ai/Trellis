import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { AI_TOOLS, type AITool } from "../types/ai-tools.js";
import { getConfiguredPlatforms } from "../configurators/index.js";
import { needsTrellisMigration } from "./migrate.js";

export type DoctorLevel = "ok" | "warn" | "error" | "unknown";

export interface DoctorCheck {
  level: DoctorLevel;
  name: string;
  detail: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
  platforms: AITool[];
}

interface RuntimeStatus {
  schema?: number;
  platform?: string;
  last_hook_at?: string;
  last_status?: string;
  last_output_chars?: number;
  last_error_category?: string;
}

interface RecordingStatus {
  schema: number;
  last_write_at: string;
  last_status: "ok" | "error";
  last_exit_code: number;
}

function recordingCheck(cwd: string): DoctorCheck {
  const name = "recording-runtime";
  const file = path.join(cwd, ".trellis/.runtime/writes/latest.json");
  if (!fs.existsSync(file)) {
    return {
      name,
      level: "unknown",
      detail: "no add_session.py outcome observed",
    };
  }
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as RecordingStatus;
    if (
      value?.schema !== 1 ||
      typeof value.last_write_at !== "string" ||
      !Number.isFinite(Date.parse(value.last_write_at)) ||
      !Number.isInteger(value.last_exit_code) ||
      value.last_exit_code < 0 ||
      !["ok", "error"].includes(value.last_status) ||
      (value.last_status === "ok") !== (value.last_exit_code === 0)
    )
      throw new Error("invalid metadata");
    return {
      name,
      level: value.last_status === "ok" ? "ok" : "warn",
      detail:
        `last add_session.py ${value.last_status} at ${value.last_write_at}; exit ${value.last_exit_code}` +
        (value.last_status === "error"
          ? "; recording-failed (a partial checkpoint may exist; inspect the command error before retrying)"
          : " (does not verify direct spec/research edits)"),
    };
  } catch {
    return {
      name,
      level: "warn",
      detail: "recording metadata is unreadable or invalid; outcome unknown",
    };
  }
}

const PLATFORM_CHECKS: Record<AITool, string[]> = {
  "claude-code": [".claude/hooks/session-start.py", ".claude/settings.json"],
  codex: [".codex/hooks/session-start.py", ".codex/hooks.json"],
  opencode: [".opencode/plugins/session-start.js"],
  pi: [".pi/extensions/mini-trellis/index.ts", ".pi/settings.json"],
  dsh: [
    ".dsh/skills/mini-trellis-session-insight/SKILL.md",
    ".dsh/skills/mini-trellis-remember/SKILL.md",
  ],
  cursor: [".cursor/hooks/session-start.py", ".cursor/hooks.json"],
};

const TRIGGER_MARKERS: Record<AITool, [string, string]> = {
  "claude-code": [".claude/hooks/session-start.py", "additional_context"],
  codex: [".codex/hooks/session-start.py", "additional_context"],
  opencode: [".opencode/plugins/session-start.js", "messages.transform"],
  pi: [".pi/extensions/mini-trellis/index.ts", "before_agent_start"],
  dsh: [
    ".dsh/skills/mini-trellis-session-insight/SKILL.md",
    "no project SessionStart",
  ],
  cursor: [".cursor/hooks/session-start.py", "additional_context"],
};

export function buildDoctorReport(cwd: string): DoctorReport {
  if (needsTrellisMigration(cwd)) {
    return {
      ok: false,
      checks: [
        {
          level: "error",
          name: "legacy-trellis",
          detail:
            "Trellis workflow detected; run mini-trellis migrate --dry-run",
        },
      ],
      platforms: [...getConfiguredPlatforms(cwd)],
    };
  }
  const checks: DoctorCheck[] = [];
  const exists = (relative: string): boolean =>
    fs.existsSync(path.join(cwd, relative));

  const runtimeStatus = (platform: AITool): RuntimeStatus | null => {
    const file = path.join(
      cwd,
      ".trellis",
      ".runtime",
      "hooks",
      `${platform}.json`,
    );
    try {
      const value = JSON.parse(fs.readFileSync(file, "utf8")) as RuntimeStatus;
      return value?.schema === 1 &&
        typeof value.last_status === "string" &&
        typeof value.last_hook_at === "string" &&
        Number.isFinite(Date.parse(value.last_hook_at)) &&
        Number.isInteger(value.last_output_chars) &&
        (value.last_output_chars ?? -1) >= 0
        ? value
        : null;
    } catch {
      return null;
    }
  };

  const workflowReady =
    exists(".trellis") && exists(".trellis/scripts/add_session.py");
  checks.push({
    level: workflowReady ? "ok" : "error",
    name: "memory-layer",
    detail: workflowReady
      ? ".trellis and add_session.py are present"
      : "missing .trellis or .trellis/scripts/add_session.py; run mini-trellis init",
  });
  checks.push(recordingCheck(cwd));

  const agents = exists("AGENTS.md")
    ? fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8")
    : "";
  const agentsReady =
    agents.includes("<!-- TRELLIS:START -->") &&
    agents.includes("<!-- TRELLIS:END -->");
  checks.push({
    level: agentsReady ? "ok" : "warn",
    name: "instructions",
    detail: agentsReady
      ? "AGENTS.md contains the managed mini-trellis block"
      : "AGENTS.md is missing the managed mini-trellis block; run init to add it",
  });

  const platforms = [...getConfiguredPlatforms(cwd)];
  for (const platform of Object.keys(AI_TOOLS) as AITool[]) {
    const files = PLATFORM_CHECKS[platform];
    const present = files.filter(exists);
    if (present.length === 0) continue;
    const complete = present.length === files.length;
    checks.push({
      level: complete ? "ok" : "warn",
      name: platform,
      detail: complete
        ? platform === "dsh"
          ? "DeepSeek Harness skills are present"
          : `${AI_TOOLS[platform].name} hook and config are present`
        : `${AI_TOOLS[platform].name} is partially configured (${present.length}/${files.length} files)`,
    });
    if (complete) {
      const [triggerPath, marker] = TRIGGER_MARKERS[platform];
      let triggerLevel: DoctorLevel = "unknown";
      let triggerDetail = "host delivery is unknown until a real session runs";
      try {
        const content = fs.readFileSync(path.join(cwd, triggerPath), "utf8");
        if (content.includes(marker)) {
          triggerLevel = "ok";
          triggerDetail = `trigger asset contains ${marker}`;
        } else {
          triggerLevel = "warn";
          triggerDetail = `trigger asset does not contain ${marker}`;
        }
      } catch {
        triggerLevel = "warn";
        triggerDetail = "trigger asset could not be read";
      }
      checks.push({
        level: triggerLevel,
        name: `${platform}-trigger`,
        detail: triggerDetail,
      });
      if (platform === "dsh") continue;
      if (platform === "cursor") {
        try {
          JSON.parse(
            fs.readFileSync(path.join(cwd, ".cursor/hooks.json"), "utf8"),
          );
        } catch {
          checks.push({
            level: "warn",
            name: "cursor-config",
            detail:
              ".cursor/hooks.json is not valid JSON; init skips it and refresh keeps the file",
          });
        }
      }
      const runtime = runtimeStatus(platform);
      if (!runtime) {
        checks.push({
          level: "unknown",
          name: `${platform}-runtime`,
          detail:
            platform === "codex"
              ? "no real hook execution observed; ensure Codex trusts this project, then use /hooks to review/trust the project hook and start a new session"
              : platform === "cursor"
                ? "no real local hook execution observed; cloud agents do not run sessionStart"
                : "no real hook execution observed; run one host session",
        });
      } else if (
        runtime.last_status === "ok" ||
        runtime.last_status === "deduped"
      ) {
        checks.push({
          level: "ok",
          name: `${platform}-runtime`,
          detail: `hook ${runtime.last_status} at ${runtime.last_hook_at ?? "unknown time"}; emitted ${runtime.last_output_chars ?? 0} chars (model delivery still requires real-session evidence)`,
        });
      } else {
        checks.push({
          level: "warn",
          name: `${platform}-runtime`,
          detail: `last hook ${runtime.last_status ?? "unknown"} at ${runtime.last_hook_at ?? "unknown time"}${runtime.last_error_category ? `; error ${runtime.last_error_category}` : ""}`,
        });
      }
    }
  }

  if (platforms.length === 0) {
    checks.push({
      level: "warn",
      name: "platforms",
      detail:
        "no host detected; choose --claude, --codex, --opencode, --pi, --dsh, or --cursor",
    });
  }

  return {
    ok: checks.every((check) => check.level !== "error"),
    checks,
    platforms,
  };
}

export function runDoctor(
  options: { json?: boolean; cwd?: string } = {},
): DoctorReport {
  const report = buildDoctorReport(options.cwd ?? process.cwd());
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(chalk.bold("mini-trellis doctor\n"));
    for (const check of report.checks) {
      const icon =
        check.level === "ok"
          ? "✓"
          : check.level === "warn"
            ? "!"
            : check.level === "unknown"
              ? "?"
              : "✗";
      const color =
        check.level === "ok"
          ? chalk.green
          : check.level === "warn"
            ? chalk.yellow
            : check.level === "unknown"
              ? chalk.gray
              : chalk.red;
      console.log(`${color(icon)} ${check.name}: ${check.detail}`);
    }
    console.log();
    console.log(
      report.ok
        ? chalk.green("Doctor passed.")
        : chalk.red("Doctor found blocking issues."),
    );
  }
  return report;
}

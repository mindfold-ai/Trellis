import chalk from "chalk";
import type { Command } from "commander";
import {
  installPiDesktopPlugin,
  piDesktopStatus,
  uninstallPiDesktopPlugin,
  type CommonOptions,
  type InstallReport,
  type StatusReport,
  type UninstallReport,
} from "./commands.js";

interface CommonFlags {
  dataDir?: string;
  dryRun?: boolean;
  force?: boolean;
  skipSkills?: boolean;
  agentsDir?: string;
  skipSubagents?: boolean;
}

function toOptions(flags: CommonFlags): CommonOptions {
  return {
    cwd: process.cwd(),
    dataDir: flags.dataDir,
    dryRun: flags.dryRun,
    force: flags.force,
    skipSkills: flags.skipSkills,
    agentsDir: flags.agentsDir,
    skipSubagents: flags.skipSubagents,
  };
}

function fail(error: unknown): void {
  console.error(
    chalk.red("Error:"),
    error instanceof Error ? error.message : error,
  );
  if (process.env.DEBUG || process.env.TRELLIS_DEBUG) {
    console.error(error instanceof Error ? error.stack : error);
  }
  process.exitCode = 1;
}

function printInstall(report: InstallReport): void {
  const prefix = report.dryRun ? chalk.yellow("[dry-run] ") : "";
  console.log(
    `${prefix}${chalk.green("✓")} PI-Desktop plugin ${report.registryAction}: ${report.files.length} file(s)`,
  );
  console.log(chalk.gray(`  data dir   ${report.dataDir}`));
  console.log(chalk.gray(`  installed  ${report.installedDir}`));
  console.log(chalk.gray(`  registry   ${report.registryPath}`));
  if (report.registryBackup) {
    console.log(chalk.gray(`  backup     ${report.registryBackup}`));
  }

  if (report.skills.skipped) {
    console.log(chalk.gray("  skills     skipped (--skip-skills)"));
  } else {
    const parts = [
      report.skills.created.length
        ? `${report.skills.created.length} added`
        : "",
      report.skills.updated.length
        ? `${report.skills.updated.length} updated`
        : "",
      report.skills.unchanged.length
        ? `${report.skills.unchanged.length} unchanged`
        : "",
    ].filter(Boolean);
    console.log(
      chalk.gray(`  skills     ${parts.join(", ") || "none on disk"}`),
    );
    if (report.skills.backup) {
      console.log(chalk.gray(`  backup     ${report.skills.backup}`));
    }
  }

  if (report.subagents.skipped) {
    console.log(chalk.gray("  subagents  skipped (--skip-subagents)"));
  } else {
    const parts = [
      report.subagents.written.length
        ? `${report.subagents.written.length} written`
        : "",
      report.subagents.unchanged.length
        ? `${report.subagents.unchanged.length} unchanged`
        : "",
    ].filter(Boolean);
    console.log(
      chalk.gray(
        `  subagents  ${parts.join(", ") || "none"} · ${report.subagents.dir}`,
      ),
    );
  }

  if (report.dryRun) {
    console.log(chalk.yellow("Dry run: nothing was written."));
  } else {
    console.log(
      chalk.cyan(
        "Restart PI-Desktop so it loads the plugin and re-reads the registry.",
      ),
    );
  }
}

function printStatus(report: StatusReport, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(chalk.bold("PI-Desktop integration"));
  console.log(chalk.gray(`  data dir   ${report.dataDir}`));
  console.log(chalk.gray(`  plugin     ${report.pluginDir}`));
  console.log(chalk.gray(`  installed  ${report.installedDir}`));
  console.log(chalk.gray(`  registry   ${report.registryPath}`));

  if (report.row) {
    const scope = report.row.scope;
    const state = report.registered
      ? chalk.green(report.row.status ?? "ready")
      : chalk.yellow("not active in this repo");
    console.log(
      `  registered ${state} · ${report.row.id} ${report.row.version}`,
    );
    console.log(
      chalk.gray(
        `  scope      ${scope?.mode ?? "global"}${
          scope?.projects?.length ? `: ${scope.projects.join(", ")}` : ""
        }`,
      ),
    );
  } else {
    console.log(
      `  registered ${chalk.yellow("no")} — run \`trellis pi-desktop install\``,
    );
  }

  const drift = [
    report.missingInInstall.length
      ? `${report.missingInInstall.length} missing`
      : "",
    report.changedInInstall.length
      ? `${report.changedInInstall.length} changed`
      : "",
    report.extraInInstall.length ? `${report.extraInInstall.length} stale` : "",
  ].filter(Boolean);
  console.log(
    chalk.gray(
      `  files      ${report.repoFiles} in repo · ${drift.length ? drift.join(", ") : "install matches"}`,
    ),
  );

  console.log(
    chalk.gray(
      `  skills     ${report.skillsRegistered}/${report.skillsOnDisk} registered · ${report.skillsPath}`,
    ),
  );
  console.log(
    chalk.gray(
      `  subagents  ${report.subagentsFound} in ${report.subagentsDir}`,
    ),
  );
  console.log(
    chalk.gray(
      `  host       ${report.hostRunning ? "running" : "not running"}`,
    ),
  );
}

function printUninstall(report: UninstallReport): void {
  const prefix = report.dryRun ? chalk.yellow("[dry-run] ") : "";
  if (report.scopeRetained.length > 0) {
    console.log(
      `${prefix}${chalk.gray("○")} registry row kept · scope kept for ${report.scopeRetained.length} other project(s)`,
    );
    console.log(chalk.gray(`             ${report.scopeRetained.join(", ")}`));
  } else {
    console.log(
      `${prefix}${report.removedRow ? chalk.green("✓") : chalk.gray("○")} registry row ${
        report.removedRow ? "removed" : "not present"
      }`,
    );
  }
  console.log(
    `${prefix}${report.removedDir ? chalk.green("✓") : chalk.gray("○")} installed files ${
      report.removedDir ? `removed (${report.installedDir})` : "not present"
    }`,
  );
  console.log(
    `${prefix}${chalk.green("✓")} skills ${report.removedSkills.length} registration(s) removed`,
  );
  console.log(
    `${prefix}${report.removedSubagents.length > 0 ? chalk.green("✓") : chalk.gray("○")} sub-agents ${report.removedSubagents.length} removed${
      report.scopeRetained.length > 0 ? " (shared with other projects)" : ""
    }`,
  );
  if (report.dryRun) console.log(chalk.yellow("Dry run: nothing was written."));
}

export function registerPiDesktopCommand(program: Command): void {
  const group = program
    .command("pi-desktop")
    .description(
      "Install or remove the Trellis plugin for PI-Desktop (vastsa/PI-Desktop)",
    );

  group
    .command("install")
    .description(
      "Register the generated .pi-desktop/trellis plugin in the host plugin registry",
    )
    .option("--data-dir <path>", "Override the PI-Desktop data directory")
    .option("--dry-run", "Show what would change without writing anything")
    .option("--force", "Write even while PI-Desktop is running")
    .option("--skip-skills", "Do not register .agents/skills in the host")
    .option("--agents-dir <path>", "Override ~/.agents (the sub-agent home)")
    .option("--skip-subagents", "Do not write ~/.agents/subagents/trellis-*.md")
    .action((flags: CommonFlags) => {
      try {
        printInstall(installPiDesktopPlugin(toOptions(flags)));
      } catch (error) {
        fail(error);
      }
    });

  group
    .command("status")
    .description("Report registry state, install drift and skill registration")
    .option("--data-dir <path>", "Override the PI-Desktop data directory")
    .option("--agents-dir <path>", "Override ~/.agents (the sub-agent home)")
    .option("--json", "Print the report as JSON")
    .action((flags: CommonFlags & { json?: boolean }) => {
      try {
        printStatus(piDesktopStatus(toOptions(flags)), flags.json === true);
      } catch (error) {
        fail(error);
      }
    });

  group
    .command("uninstall")
    .description("Remove the registry row, installed files and skill rows")
    .option("--data-dir <path>", "Override the PI-Desktop data directory")
    .option("--agents-dir <path>", "Override ~/.agents (the sub-agent home)")
    .option("--dry-run", "Show what would change without writing anything")
    .option("--force", "Write even while PI-Desktop is running")
    .action((flags: CommonFlags) => {
      try {
        printUninstall(uninstallPiDesktopPlugin(toOptions(flags)));
      } catch (error) {
        fail(error);
      }
    });
}

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { init } from "../commands/init.js";
import { update } from "../commands/update.js";
import { uninstall } from "../commands/uninstall.js";
import { DIR_NAMES } from "../constants/paths.js";
import { VERSION, PACKAGE_NAME } from "../constants/version.js";
import { resolveLocale, setLocale, t } from "../i18n/index.js";
import { compareVersions } from "../utils/compare-versions.js";

// Re-export for backwards compatibility (consumers should prefer constants/version.js)
export { VERSION, PACKAGE_NAME };

/**
 * Check if a Trellis update is available (compare project version with CLI version)
 */
function checkForUpdates(cwd: string): void {
  const versionFile = path.join(cwd, DIR_NAMES.WORKFLOW, ".version");

  if (!fs.existsSync(versionFile)) return;

  const projectVersion = fs.readFileSync(versionFile, "utf-8").trim();
  const cliVersion = VERSION;
  const comparison = compareVersions(cliVersion, projectVersion);

  if (comparison > 0) {
    // CLI is newer than project - update available
    console.log(
      chalk.yellow(
        `\n⚠️  ${t("cli.update.available", { projectVersion, cliVersion })}`,
      ),
    );
    console.log(chalk.gray(`   ${t("cli.update.run")}\n`));
  } else if (comparison < 0) {
    // CLI is older than project - CLI needs updating
    console.log(
      chalk.yellow(
        `\n⚠️  ${t("cli.update.cliOlder", { cliVersion, projectVersion })}`,
      ),
    );
    console.log(
      chalk.gray(
        `   ${t("cli.update.install", { packageName: PACKAGE_NAME })}\n`,
      ),
    );
  }
}

// Check for updates at CLI startup (only if .trellis exists)
const cwd = process.cwd();
setLocale(resolveLocale({ argv: process.argv, cwd }));
if (fs.existsSync(path.join(cwd, DIR_NAMES.WORKFLOW))) {
  checkForUpdates(cwd);
}

const program = new Command();

program
  .name("trellis")
  .description(t("cli.description"))
  .option("--locale <locale>", t("option.locale"))
  .option("--lang <locale>", t("option.locale"))
  .helpOption("-h, --help", t("cli.help.description"))
  .addHelpCommand("help [command]", t("cli.help.command"))
  .version(VERSION, "-v, --version", t("cli.version.description"));

program
  .command("init")
  .description(t("init.description"))
  .helpOption("-h, --help", t("cli.help.description"))
  .option("--locale <locale>", t("option.locale"))
  .option("--cursor", t("init.option.cursor"))
  .option("--claude", t("init.option.claude"))
  .option("--opencode", t("init.option.opencode"))
  .option("--codex", t("init.option.codex"))
  .option("--kilo", t("init.option.kilo"))
  .option("--kiro", t("init.option.kiro"))
  .option("--gemini", t("init.option.gemini"))
  .option("--antigravity", t("init.option.antigravity"))
  .option("--windsurf", t("init.option.windsurf"))
  .option("--qoder", t("init.option.qoder"))
  .option("--codebuddy", t("init.option.codebuddy"))
  .option("--copilot", t("init.option.copilot"))
  .option("--droid", t("init.option.droid"))
  .option("--pi", t("init.option.pi"))
  .option("--reasonix", t("init.option.reasonix"))
  .option("-y, --yes", t("init.option.yes"))
  .option("-u, --user <name>", t("init.option.user"))
  .option("-f, --force", t("init.option.force"))
  .option("-s, --skip-existing", t("init.option.skipExisting"))
  .option("--monorepo", t("init.option.monorepo"))
  .option("--no-monorepo", t("init.option.noMonorepo"))
  .option("-t, --template <name>", t("init.option.template"))
  .option("--overwrite", t("init.option.overwrite"))
  .option("--append", t("init.option.append"))
  .option("-r, --registry <source>", t("init.option.registry"))
  .action(async (options: Record<string, unknown>) => {
    try {
      const globalOptions = program.opts() as {
        locale?: string;
        lang?: string;
      };
      options.locale =
        options.locale ?? globalOptions.locale ?? globalOptions.lang;
      await init(options);
    } catch (error) {
      console.error(
        chalk.red(t("cli.error.prefix")),
        error instanceof Error ? error.message : error,
      );
      if (process.env.DEBUG || process.env.TRELLIS_DEBUG) {
        console.error(error instanceof Error ? error.stack : error);
      }
      process.exit(1);
    }
  });

program
  .command("update")
  .description(t("update.description"))
  .helpOption("-h, --help", t("cli.help.description"))
  .option("--locale <locale>", t("option.locale"))
  .option("--dry-run", t("update.option.dryRun"))
  .option("-f, --force", t("update.option.force"))
  .option("-s, --skip-all", t("update.option.skipAll"))
  .option("-n, --create-new", t("update.option.createNew"))
  .option("--allow-downgrade", t("update.option.allowDowngrade"))
  .option("--migrate", t("update.option.migrate"))
  .action(async (options: Record<string, unknown>) => {
    try {
      const globalOptions = program.opts() as {
        locale?: string;
        lang?: string;
      };
      await update({
        locale: (options.locale ??
          globalOptions.locale ??
          globalOptions.lang) as string | undefined,
        dryRun: options.dryRun as boolean,
        force: options.force as boolean,
        skipAll: options.skipAll as boolean,
        createNew: options.createNew as boolean,
        allowDowngrade: options.allowDowngrade as boolean,
        migrate: options.migrate as boolean,
      });
    } catch (error) {
      console.error(
        chalk.red(t("cli.error.prefix")),
        error instanceof Error ? error.message : error,
      );
      if (process.env.DEBUG || process.env.TRELLIS_DEBUG) {
        console.error(error instanceof Error ? error.stack : error);
      }
      process.exit(1);
    }
  });

program
  .command("uninstall")
  .description(t("uninstall.description"))
  .helpOption("-h, --help", t("cli.help.description"))
  .option("--locale <locale>", t("option.locale"))
  .option("-y, --yes", t("uninstall.option.yes"))
  .option("--dry-run", t("uninstall.option.dryRun"))
  .action(async (options: Record<string, unknown>) => {
    try {
      const globalOptions = program.opts() as {
        locale?: string;
        lang?: string;
      };
      await uninstall({
        locale: (options.locale ??
          globalOptions.locale ??
          globalOptions.lang) as string | undefined,
        yes: options.yes as boolean,
        dryRun: options.dryRun as boolean,
      });
    } catch (error) {
      console.error(
        chalk.red(t("cli.error.prefix")),
        error instanceof Error ? error.message : error,
      );
      if (process.env.DEBUG || process.env.TRELLIS_DEBUG) {
        console.error(error instanceof Error ? error.stack : error);
      }
      process.exit(1);
    }
  });

program.parse();

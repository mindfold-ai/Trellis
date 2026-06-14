export const enMessages = {
  "cli.description":
    "AI-assisted development workflow framework for Cursor, Claude Code and more",
  "cli.version.description": "output the version number",
  "cli.help.description": "display help for command",
  "cli.help.command": "display help for command",
  "cli.error.prefix": "Error:",
  "cli.update.available":
    "Trellis update available: {projectVersion} -> {cliVersion}",
  "cli.update.run": "Run: trellis update",
  "cli.update.cliOlder":
    "Your CLI ({cliVersion}) is older than project ({projectVersion})",
  "cli.update.install": "Run: npm install -g {packageName}",

  "option.locale": "Use interface language: en or zh",

  "init.description": "Initialize trellis in the current project",
  "init.option.cursor": "Include Cursor commands",
  "init.option.claude": "Include Claude Code commands",
  "init.option.opencode": "Include OpenCode commands",
  "init.option.codex": "Include Codex skills",
  "init.option.kilo": "Include Kilo CLI commands",
  "init.option.kiro": "Include Kiro Code skills",
  "init.option.gemini": "Include Gemini CLI commands",
  "init.option.antigravity": "Include Antigravity workflows",
  "init.option.windsurf": "Include Windsurf workflows",
  "init.option.qoder": "Include Qoder commands",
  "init.option.codebuddy": "Include CodeBuddy commands",
  "init.option.copilot": "Include GitHub Copilot hooks",
  "init.option.droid": "Include Factory Droid commands",
  "init.option.pi": "Include Pi Agent extension assets",
  "init.option.reasonix": "Include Reasonix skills",
  "init.option.yes": "Skip prompts and use defaults",
  "init.option.user": "Initialize developer identity with specified name",
  "init.option.force": "Overwrite existing files without asking",
  "init.option.skipExisting": "Skip existing files without asking",
  "init.option.monorepo": "Force monorepo mode",
  "init.option.noMonorepo": "Skip monorepo detection",
  "init.option.template":
    "Use a remote spec template (e.g., electron-fullstack)",
  "init.option.overwrite":
    "Overwrite existing spec directory when using template",
  "init.option.append": "Only add missing files when using template",
  "init.option.registry":
    "Use a custom template registry (e.g., gh:myorg/myrepo/specs)",
  "init.tagline": "All-in-one AI framework & toolkit for Claude Code & Cursor",
  "init.mode.force": "Mode: Force overwrite existing files",
  "init.mode.skip": "Mode: Skip existing files",
  "init.mode.yes": "Mode: Non-interactive (skip existing files)",
  "init.developer": "Developer:",
  "init.creatingWorkflow": "Creating workflow structure...",
  "init.createdAgents": "Created AGENTS.md",
  "init.noTools": "No tools selected. At least one tool is required.",

  "update.description":
    "Update trellis configuration and commands to latest version",
  "update.option.dryRun": "Preview changes without applying them",
  "update.option.force": "Overwrite all changed files without asking",
  "update.option.skipAll": "Skip all changed files without asking",
  "update.option.createNew": "Create .new copies for all changed files",
  "update.option.allowDowngrade": "Allow downgrading to an older version",
  "update.option.migrate": "Apply pending file migrations (renames/deletions)",
  "update.notInitialized": "Trellis not initialized in this directory.",
  "update.runInitFirst": "Run 'trellis init' first.",
  "update.title": "Trellis Update",
  "update.projectVersion": "Project version:",
  "update.cliVersion": "CLI version:",
  "update.latestNpm": "Latest on npm:",
  "update.latestNpmUnavailable": "Latest on npm:   (unable to fetch)",
  "update.summary": "--- Summary ---",
  "update.complete": "{action} complete! ({projectVersion} -> {cliVersion})",
  "update.action.update": "Update",
  "update.action.downgrade": "Downgrade",
  "update.tipNewFiles":
    "Tip: Review .new files and merge changes manually if needed.",

  "uninstall.description":
    "Remove all trellis files (managed platform files + .trellis/) from this project",
  "uninstall.option.yes": "Skip confirmation prompt",
  "uninstall.option.dryRun":
    "List what would be removed without changing anything",
  "uninstall.notInstalled":
    "Trellis is not installed in this project (no .trellis/ directory found).",
  "uninstall.continue": "Continue?",
  "uninstall.cancelled": "Uninstall cancelled. No files modified.",
  "uninstall.dryRun": "Dry run - no files were modified.",
  "uninstall.complete":
    "Uninstalled trellis: {deletedFiles} files deleted, {modifiedFiles} files modified, {deletedDirs} directories removed.",
} as const;

export type MessageKey = keyof typeof enMessages;

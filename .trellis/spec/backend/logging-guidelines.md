# Logging Guidelines

> How console output and logging is done in this CLI project.

---

## Overview

This CLI project uses **chalk** for colored console output. Since this is a user-facing CLI tool, we use `console.log()` and `console.error()` directly rather than a structured logging library. Output follows consistent color conventions to help users quickly understand the nature of each message.

---

## Color Conventions

| Color | Chalk Method | Usage | Example |
|-------|--------------|-------|---------|
| **Cyan** | `chalk.cyan()` | Headers, banners, section titles | `"Next steps:"` |
| **Blue** | `chalk.blue()` | Action in progress, step indicators | `"Creating workflow structure..."` |
| **Green** | `chalk.green()` | Success messages | `"Trellis initialized successfully!"` |
| **Yellow** | `chalk.yellow()` | Warnings, coming soon, skipped items | `"Coming soon: update command"` |
| **Red** | `chalk.red()` | Errors | `"Error:"` prefix |
| **Gray** | `chalk.gray()` | Secondary info, hints, paths | Descriptions, file paths |
| **White** | `chalk.white()` | Highlighted inline text | Commands to run |

---

## Message Patterns

### Section Headers (Cyan)

```typescript
console.log(chalk.cyan("Next steps:"));
console.log(chalk.cyan("Generated structure files:"));
```

### Progress Steps (Blue with Emoji)

```typescript
console.log(chalk.blue("📁 Creating workflow structure..."));
console.log(chalk.blue("📝 Configuring Cursor commands..."));
console.log(chalk.blue("🤖 Configuring Multi-Agent Pipeline..."));
console.log(chalk.blue("📄 Created init-agent.md"));
```

### Sub-steps (Gray with Indentation)

```typescript
console.log(chalk.gray("   - Creating agent configurations..."));
console.log(chalk.gray("   - Creating hook configurations..."));
```

### Success (Green with Emoji)

```typescript
console.log(chalk.green("\n✅ Trellis initialized successfully!\n"));
```

### Warnings (Yellow with Emoji)

```typescript
console.log(chalk.yellow("Coming soon: update command"));
console.log(chalk.yellow("No tools selected. At least one tool is required."));
console.log(chalk.yellow(`⚠️  Failed to initialize developer: ${message}`));
```

### Errors (Red)

```typescript
console.error(
  chalk.red("Error:"),
  error instanceof Error ? error.message : error,
);
```

### Informational (Mixed Colors)

```typescript
// Key-value pairs
console.log(chalk.blue("👤 Developer:"), chalk.gray(developerName));
console.log(chalk.blue("🔍 Project type:"), chalk.gray(projectDescription));

// Instructions with highlighted commands
console.log(
  chalk.gray(`${stepNum}. Use `) +
  chalk.white("/trellis:start") +
  chalk.gray(" command in your AI tool to begin a session"),
);
```

---

## Output Structure

### Banner and Introduction

```typescript
// ASCII art banner (cyan)
const banner = figlet.textSync("Trellis", { font: "Rebel" });
console.log(chalk.cyan(`\n${banner.trimEnd()}`));

// Tagline (gray)
console.log(chalk.gray("\n  AI-assisted development workflow framework\n"));
```

### Progress Output

```typescript
// Mode indicator
console.log(chalk.gray("Mode: Force overwrite existing files\n"));

// Detection results
console.log(chalk.blue("👤 Developer:"), chalk.gray(developerName));
console.log(chalk.blue("🔍 Project type:"), chalk.gray(description));

// Configuration summary
console.log(chalk.gray(`\nConfiguring: ${tools.join(", ")}`));
console.log(chalk.gray(`Project type: ${typeDescription}\n`));

// Step progress
console.log(chalk.blue("📁 Creating workflow structure..."));
console.log(chalk.blue("📝 Configuring Cursor commands..."));
```

### Completion Summary

```typescript
// Success message
console.log(chalk.green("\n✅ Trellis initialized successfully!\n"));

// Next steps
console.log(chalk.cyan("Next steps:"));
console.log(
  chalk.gray(`1. Use `) +
  chalk.white("/trellis:start") +
  chalk.gray(" command in your AI tool"),
);

// Generated files
console.log(chalk.cyan("Generated structure files:"));
console.log(chalk.gray(`  ${PATHS.STRUCTURE}/guides/   - Thinking guides`));
```

---

## Emoji Usage

| Emoji | Usage |
|-------|-------|
| 📁 | Directory/folder operations |
| 📝 | Configuration/file writing |
| 📄 | Single file creation |
| 🤖 | AI/agent related |
| 👤 | User/developer related |
| 🔍 | Detection/analysis |
| ✅ | Success completion |
| ⚠️ | Warnings |

---

## Indentation

Use indentation to show hierarchy:

```typescript
// Top level (no indent)
console.log(chalk.blue("🤖 Configuring Multi-Agent Pipeline..."));

// Sub-level (3 spaces + dash)
console.log(chalk.gray("   - Creating agent configurations..."));
console.log(chalk.gray("   - Creating hook configurations..."));

// File listings (2 spaces)
console.log(chalk.gray(`  ${PATHS.STRUCTURE}/guides/   - Thinking guides`));
console.log(chalk.gray(`  ${PATHS.STRUCTURE}/frontend/ - Frontend guidelines`));
```

---

## DO / DON'T

### DO

- Use `chalk` for all colored output
- Follow the color convention consistently
- Use emojis for visual scanning (sparingly)
- Use indentation to show hierarchy
- Add blank lines between sections for readability
- Use `console.error()` for errors

### DON'T

- Don't use raw ANSI escape codes
- Don't mix color meanings (e.g., red for non-error)
- Don't overuse emojis
- Don't log sensitive information (paths with usernames excepted for context)
- Don't use `console.log()` for errors (use `console.error()`)
- Don't output debug information in production

---

## Examples

### Complete Init Output Flow

```typescript
// 1. Banner
console.log(chalk.cyan(`\n${banner.trimEnd()}`));
console.log(chalk.gray("\n  AI-assisted development workflow framework\n"));

// 2. Mode (if special mode)
if (options.force) {
  console.log(chalk.gray("Mode: Force overwrite existing files\n"));
}

// 3. Detection results
console.log(chalk.blue("👤 Developer:"), chalk.gray(developerName));
console.log(chalk.blue("🔍 Project type:"), chalk.gray(typeDescription));

// 4. Configuration summary
console.log(chalk.gray(`\nConfiguring: ${tools.join(", ")}\n`));

// 5. Progress steps
console.log(chalk.blue("📁 Creating workflow structure..."));
console.log(chalk.blue("📝 Configuring Cursor commands..."));
console.log(chalk.blue("🤖 Configuring Multi-Agent Pipeline..."));
console.log(chalk.gray("   - Creating agent configurations..."));

// 6. Success
console.log(chalk.green("\n✅ Trellis initialized successfully!\n"));

// 7. Next steps
console.log(chalk.cyan("Next steps:"));
console.log(
  chalk.gray("1. Use ") +
  chalk.white("/trellis:start") +
  chalk.gray(" command to begin"),
);
```

### Error Output

```typescript
try {
  await init(options);
} catch (error) {
  console.error(
    chalk.red("Error:"),
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}
```

### Warning Output

```typescript
// Non-critical warning
console.log(
  chalk.yellow(
    `⚠️  Failed to initialize developer: ${message}`,
  ),
);

// Coming soon feature
console.log(chalk.yellow("Coming soon: update command"));
```

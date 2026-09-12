# Contributing to Trellis

Thanks for your interest in contributing to Trellis! This document provides guidelines for contributing to the project.

## Ways to Contribute

### Reporting Bugs

Before creating a bug report, please check [existing issues](https://github.com/mindfold-ai/Trellis/issues) to avoid duplicates.

When reporting a bug, include:
- Trellis version (`trellis --version`)
- Node.js version (`node --version`)
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs or screenshots

### Suggesting Features

Feature requests are welcome! Please open an issue with:
- Clear description of the feature
- Use case / problem it solves
- Any implementation ideas (optional)

### Improving Documentation

Documentation improvements are always appreciated:
- Fix typos or unclear explanations
- Add examples
- Improve README or guide docs

### Contributing Code

Code contributions are welcome for:
- Bug fixes
- New features (please discuss in an issue first)
- Performance improvements
- Test coverage

## Development Setup

### Prerequisites

- Node.js 18.17.0+ (`packages/cli` sets `engines.node` to `>=18.17.0`)
- pnpm
- Python 3 (for `.claude/hooks/` and the `.trellis/scripts/` workflow scripts)
- A POSIX shell (for the Husky pre-commit hook and the two `.sh` helpers)

### Getting Started

1. **Fork the repository** on GitHub

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/Trellis.git
   cd Trellis
   ```

3. **Install dependencies**
   ```bash
   pnpm install
   ```

4. **Build the project**
   ```bash
   pnpm build
   ```

### Running Checks

```bash
pnpm lint                                   # ESLint for TypeScript, both packages
pnpm typecheck                              # TypeScript type checking
pnpm --filter @mindfoldhq/trellis lint:py   # Type checking for Python (basedpyright)
pnpm --filter @mindfoldhq/trellis lint:all  # ESLint + basedpyright for the CLI package
```

> **Note:** `lint:py` and `lint:all` are defined in `packages/cli`, so they need the
> `--filter` prefix from the repository root.

> **Note:** Pre-commit hooks will automatically run `eslint --fix` and `prettier --write` on staged `packages/cli/src/**/*.ts` files.

## Project Structure

```
Trellis/
├── packages/
│   ├── cli/                # @mindfoldhq/trellis - the CLI
│   │   └── src/
│   │       ├── cli/                # CLI entry point
│   │       ├── commands/           # CLI commands (init, update)
│   │       ├── configurators/      # Template application logic
│   │       ├── migrations/         # Version migration manifests
│   │       ├── templates/          # Templates copied to user projects ←
│   │       └── utils/              # Utility functions
│   └── core/               # @mindfoldhq/trellis-core - channel, mem, task
├── .claude/                # Claude Code config (project's own) ←
│   ├── agents/             # Agent definitions
│   ├── commands/           # Slash commands
│   └── hooks/              # Python hook scripts
├── .trellis/               # Trellis workflow (project's own) ←
│   ├── scripts/            # Python scripts
│   └── spec/               # Spec file templates
└── docs-site/              # Documentation (git submodule)
```

> **Important:** When modifying `.claude/`, `.trellis/`, or `.cursor/`, check if the same changes need to be applied to `packages/cli/src/templates/`. The project uses its own config files, but templates are what gets installed to user projects.

## Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `refactor` - Code refactoring
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

**Examples:**
```
feat(cli): add --dry-run flag to init command
fix(hooks): resolve context injection for nested tasks
docs(readme): update quick start instructions
```

## Pull Request Process

1. **Create a branch** from `main`
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** and commit following the commit guidelines

3. **Ensure quality checks pass**
   ```bash
   pnpm lint && pnpm typecheck
   ```

4. **Push to your fork**
   ```bash
   git push origin feat/your-feature-name
   ```

5. **Open a Pull Request** against `main` branch
   - Provide a clear description of changes
   - Reference any related issues
   - Include screenshots for UI changes

6. **Address review feedback** if requested

## Thank You

Every contribution helps make Trellis better. We appreciate your time and effort!

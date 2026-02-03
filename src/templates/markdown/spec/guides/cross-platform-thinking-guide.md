# Cross-Platform Thinking Guide

> **Purpose**: Catch platform-specific assumptions before they become bugs.

---

## Why This Matters

**Most cross-platform bugs come from implicit assumptions**:

- Assumed shebang works → breaks on Windows
- Assumed `/` path separator → breaks on Windows
- Assumed `\n` line endings → inconsistent behavior
- Assumed command availability → `grep` vs `findstr`

---

## Platform Differences Checklist

### 1. Script Execution

| Assumption | macOS/Linux | Windows |
|------------|-------------|---------|
| Shebang (`#!/usr/bin/env python3`) | ✅ Works | ❌ Ignored |
| Direct execution (`./script.py`) | ✅ Works | ❌ Fails |
| `python3` command | ✅ Always available | ⚠️ May need `python` |
| `python` command | ⚠️ May be Python 2 | ✅ Usually Python 3 |

**Rule 1**: Always use explicit `python3` in documentation, help text, and error messages.

```python
# BAD - Assumes shebang works
print("Usage: ./script.py <args>")
print("Run: script.py <args>")

# GOOD - Explicit interpreter
print("Usage: python3 script.py <args>")
print("Run: python3 ./script.py <args>")
```

**Rule 2**: When calling Python from TypeScript/Node.js, detect the available command:

```typescript
function getPythonCommand(): string {
  try {
    execSync("python3 --version", { stdio: "pipe" });
    return "python3";
  } catch {
    try {
      execSync("python --version", { stdio: "pipe" });
      return "python";
    } catch {
      return "python3"; // Default, will fail with clear error
    }
  }
}
```

**Rule 3**: When calling Python from Python, use `sys.executable`:

```python
import sys
import subprocess

# BAD - Hardcoded command
subprocess.run(["python3", "other_script.py"])

# GOOD - Use current interpreter
subprocess.run([sys.executable, "other_script.py"])
```

### 2. Path Handling

| Assumption | macOS/Linux | Windows |
|------------|-------------|---------|
| `/` separator | ✅ Works | ⚠️ Sometimes works |
| `\` separator | ❌ Escape char | ✅ Native |
| `pathlib.Path` | ✅ Works | ✅ Works |

**Rule**: Use `pathlib.Path` for all path operations.

```python
# BAD - String concatenation
path = base + "/" + filename

# GOOD - pathlib
from pathlib import Path
path = Path(base) / filename
```

### 3. Line Endings

| Format | macOS/Linux | Windows | Git |
|--------|-------------|---------|-----|
| `\n` (LF) | ✅ Native | ⚠️ Some tools | ✅ Normalized |
| `\r\n` (CRLF) | ⚠️ Extra char | ✅ Native | Converted |

**Rule**: Use `.gitattributes` to enforce consistent line endings.

```gitattributes
* text=auto eol=lf
*.sh text eol=lf
*.py text eol=lf
```

### 4. Environment Variables

| Variable | macOS/Linux | Windows |
|----------|-------------|---------|
| `HOME` | ✅ Set | ❌ Use `USERPROFILE` |
| `PATH` separator | `:` | `;` |
| Case sensitivity | ✅ Case-sensitive | ❌ Case-insensitive |

**Rule**: Use `pathlib.Path.home()` instead of environment variables.

```python
# BAD
home = os.environ.get("HOME")

# GOOD
home = Path.home()
```

### 5. Command Availability

| Command | macOS/Linux | Windows |
|---------|-------------|---------|
| `grep` | ✅ Built-in | ❌ Not available |
| `find` | ✅ Built-in | ⚠️ Different syntax |
| `cat` | ✅ Built-in | ❌ Use `type` |
| `tail -f` | ✅ Built-in | ❌ Not available |

**Rule**: Use Python standard library instead of shell commands when possible.

```python
# BAD - tail -f is not available on Windows
subprocess.run(["tail", "-f", log_file])

# GOOD - Cross-platform implementation
def tail_follow(file_path: Path) -> None:
    """Follow a file like 'tail -f', cross-platform compatible."""
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        f.seek(0, 2)  # Go to end
        while True:
            line = f.readline()
            if line:
                print(line, end="", flush=True)
            else:
                time.sleep(0.1)
```

### 6. File Encoding

| Default Encoding | macOS/Linux | Windows |
|------------------|-------------|---------|
| Terminal | UTF-8 | Often CP1252 or GBK |
| File I/O | UTF-8 | System locale |
| Git output | UTF-8 | May vary |

**Rule**: Always explicitly specify `encoding="utf-8"` and use `errors="replace"`.

```python
# BAD - Relies on system default
with open(file, "r") as f:
    content = f.read()

result = subprocess.run(cmd, capture_output=True, text=True)

# GOOD - Explicit encoding with error handling
with open(file, "r", encoding="utf-8", errors="replace") as f:
    content = f.read()

result = subprocess.run(
    cmd,
    capture_output=True,
    text=True,
    encoding="utf-8",
    errors="replace"
)
```

**Git commands**: Force UTF-8 output encoding:

```python
# Force git to output UTF-8
git_args = ["git", "-c", "i18n.logOutputEncoding=UTF-8"] + args
result = subprocess.run(
    git_args,
    capture_output=True,
    text=True,
    encoding="utf-8",
    errors="replace"
)
```

---

## Change Propagation Checklist

When making platform-related changes, check **all these locations**:

### Documentation & Help Text
- [ ] Docstrings at top of Python files
- [ ] `--help` output / argparse descriptions
- [ ] Usage examples in README
- [ ] Error messages that suggest commands
- [ ] Markdown documentation (`.md` files)

### Code Locations
- [ ] `src/templates/` - Template files for new projects
- [ ] `.trellis/scripts/` - Project's own scripts (if self-hosting)
- [ ] `dist/` - Built output (rebuild after changes)

### Search Pattern
```bash
# Find all places that might need updating
grep -r "python [a-z]" --include="*.py" --include="*.md"
grep -r "\./" --include="*.py" --include="*.md" | grep -v python3
```

---

## Pre-Commit Checklist

Before committing cross-platform code:

- [ ] All Python invocations use `python3` explicitly (docs) or `sys.executable` (code)
- [ ] All paths use `pathlib.Path`
- [ ] No hardcoded path separators (`/` or `\`)
- [ ] No platform-specific commands without fallbacks (e.g., `tail -f`)
- [ ] All file I/O specifies `encoding="utf-8"` and `errors="replace"`
- [ ] All subprocess calls specify `encoding="utf-8"` and `errors="replace"`
- [ ] Git commands use `-c i18n.logOutputEncoding=UTF-8`
- [ ] External tool API formats verified from documentation
- [ ] Documentation matches code behavior
- [ ] Ran search to find all affected locations

### 7. External Tool API Contracts

When integrating with external tools (Claude Code, Cursor, etc.), their API contracts are **implicit assumptions**.

**Rule**: Verify API formats from official documentation, don't guess.

```python
# BAD - Guessed format
output = {"continue": True, "message": "..."}

# GOOD - Verified format from documentation
output = {
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": "..."
    }
}
```

> **Warning**: Different hook types may have different output formats.
> Always check the specific documentation for each hook event.

---

## JSON/External Data Defensive Checks

When parsing JSON or external data, TypeScript types are **compile-time only**. Runtime data may not match.

**Rule**: Always add defensive checks for required fields before using them.

```typescript
// BAD - Trusts TypeScript type definition
interface MigrationItem {
  from: string;  // TypeScript says required
  to?: string;
}

function process(item: MigrationItem) {
  const path = item.from;  // Runtime: could be undefined!
}

// GOOD - Defensive check before use
function process(item: MigrationItem) {
  if (!item.from) return;  // Skip invalid data
  const path = item.from;  // Now guaranteed
}
```

**When to apply**:
- Parsing JSON files (manifests, configs)
- API responses
- User input
- Any data from external sources

**Pattern**: Check existence → then use

```typescript
// Filter pattern - skip invalid items
const validItems = items.filter(item => item.from && item.to);

// Early return pattern - bail on invalid
if (!data.requiredField) {
  console.warn("Missing required field");
  return defaultValue;
}
```

---

## Common Mistakes

### 1. "It works on my Mac"

```python
# Developer's Mac
subprocess.run(["./script.py"])  # Works!

# User's Windows
subprocess.run(["./script.py"])  # FileNotFoundError
```

### 2. "The shebang should handle it"

```python
#!/usr/bin/env python3
# This line is IGNORED on Windows
```

### 3. "I updated the template"

```
src/templates/script.py  ← Updated
.trellis/scripts/script.py  ← Forgot to sync!
```

### 4. "Python 3 is always python3"

```bash
# Developer's Mac/Linux
python3 script.py  # Works!

# User's Windows (Python from python.org)
python3 script.py  # 'python3' is not recognized
python script.py   # Works!
```

### 5. "UTF-8 is the default everywhere"

```python
# Developer's Mac (UTF-8 default)
subprocess.run(cmd, capture_output=True, text=True)  # Works!

# User's Windows (GBK/CP1252 default)
subprocess.run(cmd, capture_output=True, text=True)  # Garbled Chinese/Unicode

---

## Recovery: When You Find a Platform Bug

1. **Fix the immediate issue**
2. **Search for similar patterns** (grep the codebase)
3. **Update this guide** with the new pattern
4. **Add to pre-commit checklist** if recurring

---

**Core Principle**: If it's not explicit, it's an assumption. And assumptions break.

---

## Release Checklist: Versioned Files

When releasing a new version, ensure **all versioned files** are created/updated:

- [ ] `src/migrations/manifests/{version}.json` - Migration manifest exists
- [ ] Manifest has correct version, description, changelog
- [ ] `pnpm build` copies manifests to `dist/`
- [ ] Test upgrade path from older versions (not just adjacent)

**Why this matters**: Missing manifests cause "path undefined" errors when users upgrade from older versions.

```bash
# Verify all expected manifests exist
ls src/migrations/manifests/

# Test upgrade path
node -e "
const { getMigrationsForVersion } = require('./dist/migrations/index.js');
console.log('From 0.2.12:', getMigrationsForVersion('0.2.12', 'CURRENT').length);
"
```

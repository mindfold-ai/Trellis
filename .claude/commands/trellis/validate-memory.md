# Validate Memory - AOSP Memory Freshness Check

Scan all `docs/memory/` files and report their population status. Helps identify which memory docs need to be filled in.

---

## Steps

### Step 1: Discover All Memory Files

```bash
find docs/memory -name "*.md" | sort
```

Or use Glob tool: `docs/memory/**/*.md`

### Step 2: Read Frontmatter for Each File

For each `.md` file, read the first 15 lines to extract YAML frontmatter fields:
- `confidence`: `pending` | `inferred` | `validated`
- `last_updated`: date string or empty
- `verified_by`: name or empty

### Step 3: Categorize Files

Group files into three categories:

**Pending** (unfilled templates):
- `confidence: pending`
- These are placeholders — content not yet added

**Inferred** (partially filled, needs validation):
- `confidence: inferred`
- Content was written but not verified against actual codebase

**Validated** (verified content):
- `confidence: validated`
- Content has been confirmed accurate

### Step 4: Check Staleness

For `inferred` and `validated` files:
- Parse `last_updated` field
- Flag files where `last_updated` is empty or older than 30 days as "potentially stale"

### Step 5: Output Report

```
AOSP Memory Population Report
==============================

Summary:
  Total files: N
  Validated:   N (NN%)
  Inferred:    N (NN%)
  Pending:     N (NN%)

By Module:
  codebase/   : V validated, I inferred, P pending
  systemui/   : V validated, I inferred, P pending
  launcher/   : V validated, I inferred, P pending
  framework/  : V validated, I inferred, P pending
  cross_layer/: V validated, I inferred, P pending

Pending Files (unfilled templates):
  - docs/memory/codebase/CODEBASE_MAP.md
  - docs/memory/systemui/overview.md
  - ... (list all pending)

Potentially Stale (inferred/validated but last_updated empty or >30 days):
  - docs/memory/<file> (last_updated: <date>)

Recommendations:
  1. Start with codebase/ — CODEBASE_MAP.md is the foundation for all modules
  2. Then fill each module's overview.md and entrypoints.md
  3. Use: confidence: inferred when writing from code inspection without full verification
  4. Upgrade to: confidence: validated after verifying against running system
  5. Run /trellis:load-module <module> to load memory into current session
```

---

## Notes

- This is a read-only command — it does not modify any files
- Memory files with `confidence: pending` are skipped by session-start hook and `/trellis:load-module`
- To fill in a memory file: read the actual AOSP source, fill in the content, set `confidence: inferred`, set `last_updated` to today, set `verified_by` to your developer name
- To upgrade confidence: verify the content against the running system, then change `confidence: inferred` → `confidence: validated`

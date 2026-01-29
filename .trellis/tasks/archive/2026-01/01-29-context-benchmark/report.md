# Trellis Context Consumption Report

> **Answer to**: "Have you tested how much context Trellis + Skill + MCP consumes?"

---

## Executive Summary

| Scenario | Tokens | % of 200k | % of 128k |
|----------|--------|-----------|-----------|
| **Session Start (baseline)** | ~6,500 | 3.3% | 5.1% |
| **+ Implement task** | +3,000-5,000 | +1.5-2.5% | +2.3-3.9% |
| **+ Check task** | +3,000-4,000 | +1.5-2.0% | +2.3-3.1% |
| **Full workflow cycle** | ~12,000-15,000 | 6-7.5% | 9-12% |

**Conclusion**: Trellis consumes ~6,500 tokens at session start, and a typical implement+check cycle adds another ~6,000-9,000 tokens. This is **3-7.5% of a 200k context window**.

---

## Detailed Measurements

### 1. Session Start (Baseline)

When you run `/start`, these files are injected:

| Component | Bytes | Tokens |
|-----------|-------|--------|
| `workflow.md` | 11,486 | ~2,871 |
| `start.md` (command) | 6,552 | ~1,638 |
| `get-context.sh` output | 2,993 | ~748 |
| Frontend index.md | 1,342 | ~335 |
| Backend index.md | 1,409 | ~352 |
| Guides index.md | 2,347 | ~586 |
| **Total** | **26,129** | **~6,530** |

### 2. Spec Files (On-Demand Injection)

These are injected via JSONL files when calling implement/check agents:

| Category | Bytes | Tokens |
|----------|-------|--------|
| Backend specs (7 files) | 45,422 | ~11,355 |
| Frontend specs (7 files) | 5,971 | ~1,492 |
| Guides (3 files) | 6,539 | ~1,634 |
| **All specs** | **59,158** | **~14,789** |

**Note**: Not all specs are injected at once. The JSONL files select only relevant specs per task.

### 3. Agent System Prompts

When spawning a subagent, its system prompt is added:

| Agent | Bytes | Tokens |
|-------|-------|--------|
| implement.md | 2,054 | ~513 |
| check.md | 2,833 | ~708 |
| debug.md | 1,935 | ~483 |
| research.md | 2,470 | ~617 |
| plan.md | 10,197 | ~2,549 |
| dispatch.md | 5,176 | ~1,294 |
| **All agents** | **24,665** | **~6,166** |

### 4. Skills (Commands)

Commands are only loaded when invoked:

| Command | Bytes | Tokens |
|---------|-------|--------|
| start.md | 6,552 | ~1,638 |
| onboard.md | 14,407 | ~3,601 |
| finish-work.md | 3,167 | ~791 |
| check-cross-layer.md | 4,640 | ~1,160 |
| parallel.md | 5,019 | ~1,254 |
| Others (9 files) | 22,535 | ~5,636 |
| **All commands** | **56,320** | **~14,080** |

**Note**: Only one command is loaded at a time when user invokes it.

---

## MCP Tools Context

MCP servers add tool definitions to the system prompt. This is separate from Trellis.

Typical MCP tool context:
- Each tool definition: ~100-300 tokens
- A server with 10 tools: ~1,000-3,000 tokens

**MCP is additive** - you can disable unused MCP servers to reduce context.

---

## Context Flow Diagram

```
Session Start
    │
    ├─ workflow.md (2,871 tokens)
    ├─ start.md (1,638 tokens)
    ├─ 3 index files (1,273 tokens)
    └─ context output (748 tokens)
    = ~6,530 tokens baseline
    │
    ▼
Task(implement) called
    │
    ├─ implement.md agent (513 tokens)
    ├─ prd.md (~200-500 tokens)
    └─ specs from implement.jsonl (~2,000-4,000 tokens)
    = +3,000-5,000 tokens
    │
    ▼
Task(check) called
    │
    ├─ check.md agent (708 tokens)
    ├─ prd.md (~200-500 tokens)
    └─ specs from check.jsonl (~2,000-3,000 tokens)
    = +3,000-4,000 tokens
```

---

## Comparison to Raw Claude

| Approach | Session Start | Per Task | Total (1 cycle) |
|----------|---------------|----------|-----------------|
| **Raw Claude** | 0 | 0 | 0 |
| **Trellis only** | 6,530 | 6,000-9,000 | 12,530-15,530 |
| **+ 3 MCP servers** | +3,000-6,000 | 0 | 15,530-21,530 |
| **+ Custom skills** | +0 (on-demand) | +800-1,600 | 16,330-23,130 |

---

## Optimization Tips

### 1. Minimize Session Start Context
Edit `session-start.py` to inject fewer index files if not needed.

### 2. Curate JSONL Files
Only include specs that are directly relevant to the task.

### 3. Disable Unused MCP Servers
In `.mcp.json` or Claude settings, disable MCP servers you don't need.

### 4. Use Smaller Agents for Simple Tasks
- `research` agent: Only ~617 tokens
- `implement` agent: Only ~513 tokens
- `plan` agent: ~2,549 tokens (larger, for complex planning)

### 5. Archive Old Tasks
Old task directories don't consume context if not active.

---

## Recommendations

| Model Context | Trellis Suitability |
|---------------|---------------------|
| **200k tokens** | Excellent - plenty of room |
| **128k tokens** | Good - can do full workflows |
| **32k tokens** | Usable - keep JSONL files minimal |
| **8k tokens** | Not recommended |

---

## Key Takeaways for Community

1. **Trellis baseline is ~6,500 tokens** (3.3% of 200k)
2. **Full workflow cycle is ~12,000-15,000 tokens** (6-7.5% of 200k)
3. **MCP is separate** - disable unused servers to save context
4. **Skills are on-demand** - they don't consume context until invoked
5. **Specs are selective** - JSONL files control what gets injected

**Bottom line**: If you have a 200k context model, Trellis overhead is minimal. You retain 93%+ of your context for actual work.

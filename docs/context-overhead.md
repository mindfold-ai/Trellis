# Context Overhead Analysis

> How much context does Trellis consume? A detailed breakdown.

---

## Quick Answer

| Scenario | Tokens | 1M Window | 200k Window |
|----------|--------|-----------|-------------|
| **Session start** | ~6,500 | 0.65% | 3.25% |
| **Peak (during Implement)** | ~11,000 | 1.1% | 5.5% |
| **Full workflow cycle** | ~8,500 avg | 0.85% | 4.25% |

**Bottom line**: Trellis uses **~1% of 1M** or **~5% of 200k** context at peak. The rest is yours.

---

## How Trellis Context Works

### Key Insight: Subagent Context is Independent

Each subagent runs with its **own isolated context**, which is discarded when it finishes:

```
Main Agent (persistent)     Subagent (temporary)
─────────────────────────   ─────────────────────
│ ~6,500 tokens          │  │ ~4,100 tokens    │
│ ├─ workflow.md         │  │ ├─ agent prompt  │
│ ├─ index files         │  │ ├─ jsonl specs   │
│ └─ start command       │──│ └─ prd.md        │
│                        │  └─────────────────────
│ + subagent outputs     │       (discarded)
└─────────────────────────
```

Only the **output** from subagents accumulates in the main agent's history.

---

## Per-Agent Context Breakdown

### Main Agent (Human Interactive)

Injected at session start via `SessionStart` hook:

| Component | Tokens | 1M | 200k |
|-----------|--------|-----|------|
| workflow.md | ~2,871 | 0.29% | 1.44% |
| start.md (command) | ~1,638 | 0.16% | 0.82% |
| get-context.sh output | ~748 | 0.07% | 0.37% |
| frontend/index.md | ~335 | 0.03% | 0.17% |
| backend/index.md | ~352 | 0.04% | 0.18% |
| guides/index.md | ~586 | 0.06% | 0.29% |
| **Total** | **~6,530** | **0.65%** | **3.27%** |

### Research Agent

Lightweight agent for codebase exploration:

| Component | Tokens | 1M | 200k |
|-----------|--------|-----|------|
| research.md (agent prompt) | ~617 | 0.06% | 0.31% |
| Project structure template | ~100 | 0.01% | 0.05% |
| Prompt wrapper | ~225 | 0.02% | 0.11% |
| research.jsonl (optional) | 0-500 | 0-0.05% | 0-0.25% |
| **Total** | **~942-1,442** | **0.09-0.14%** | **0.47-0.72%** |

### Implement Agent

Heaviest agent, carries development specs:

| Component | Tokens | 1M | 200k |
|-----------|--------|-----|------|
| implement.md (agent prompt) | ~513 | 0.05% | 0.26% |
| Prompt wrapper | ~112 | 0.01% | 0.06% |
| implement.jsonl entries | ~3,000-3,500 | 0.30-0.35% | 1.50-1.75% |
| prd.md | ~300 | 0.03% | 0.15% |
| info.md (optional) | 0-500 | 0-0.05% | 0-0.25% |
| **Total** | **~3,925-4,925** | **0.39-0.49%** | **1.96-2.46%** |

### Check Agent

Code quality verification:

| Component | Tokens | 1M | 200k |
|-----------|--------|-----|------|
| check.md (agent prompt) | ~708 | 0.07% | 0.35% |
| Prompt wrapper | ~120 | 0.01% | 0.06% |
| check.jsonl entries | ~970-1,500 | 0.10-0.15% | 0.49-0.75% |
| prd.md | ~300 | 0.03% | 0.15% |
| **Total** | **~2,098-2,628** | **0.21-0.26%** | **1.05-1.31%** |

### Debug Agent

Issue fixing specialist:

| Component | Tokens | 1M | 200k |
|-----------|--------|-----|------|
| debug.md (agent prompt) | ~483 | 0.05% | 0.24% |
| Prompt wrapper | ~130 | 0.01% | 0.07% |
| debug.jsonl entries | ~970-1,500 | 0.10-0.15% | 0.49-0.75% |
| codex-review-output.txt | 0-2,000 | 0-0.20% | 0-1.00% |
| **Total** | **~1,583-4,113** | **0.16-0.41%** | **0.79-2.06%** |

### Finish Agent

Lightweight final verification (Check agent with `[finish]` flag):

| Component | Tokens | 1M | 200k |
|-----------|--------|-----|------|
| check.md (agent prompt) | ~708 | 0.07% | 0.35% |
| Prompt wrapper | ~125 | 0.01% | 0.06% |
| finish-work.md | ~791 | 0.08% | 0.40% |
| prd.md | ~300 | 0.03% | 0.15% |
| **Total** | **~1,924** | **0.19%** | **0.96%** |

---

## Workflow Timeline

Context usage through a typical development cycle:

| Phase | Main Agent | Subagent | Peak Total | 1M | 200k |
|-------|------------|----------|------------|-----|------|
| Session start | 6,530 | - | 6,530 | 0.65% | 3.27% |
| + Research | 6,530 | 1,000 | 7,530 | 0.75% | 3.77% |
| + Research output | 7,030 | - | 7,030 | 0.70% | 3.52% |
| + Implement | 7,030 | 4,100 | **11,130** | **1.11%** | **5.57%** |
| + Implement output | 7,830 | - | 7,830 | 0.78% | 3.92% |
| + Check | 7,830 | 2,300 | 10,130 | 1.01% | 5.07% |
| + Check output | 8,430 | - | 8,430 | 0.84% | 4.22% |

**Peak usage: ~11,130 tokens** (during Implement phase)

---

## Agent Comparison Summary

| Agent | Tokens | 1M | 200k | Use Case |
|-------|--------|-----|------|----------|
| Research | ~1,000 | 0.10% | 0.50% | Codebase exploration |
| Finish | ~1,900 | 0.19% | 0.95% | Final PR check |
| Check | ~2,300 | 0.23% | 1.15% | Quality verification |
| Debug | ~2,200 | 0.22% | 1.10% | Issue fixing |
| Implement | ~4,100 | 0.41% | 2.05% | Feature development |

---

## Optimization Tips

### 1. Curate JSONL Files Carefully

Only include specs that are directly relevant:

```jsonl
// Good: task-specific specs only
{"file": ".trellis/spec/frontend/components.md"}

// Avoid: workflow.md is already in Main Agent
{"file": ".trellis/workflow.md"}  // redundant
```

### 2. Use Lightweight Agents When Possible

- Quick exploration → **Research** (~1,000 tokens)
- Final verification → **Finish** (~1,900 tokens)
- Full quality check → **Check** (~2,300 tokens)

### 3. Skip Unnecessary Phases

If you know exactly what to do:
- Skip Research, go directly to Implement
- Use Finish instead of full Check for simple tasks

### 4. Monitor JSONL File Sizes

```bash
# Check what your jsonl files reference
cat .trellis/tasks/your-task/implement.jsonl

# Measure total context
for f in $(jq -r '.file' implement.jsonl); do
  wc -c "$f"
done
```

---

## FAQ

### Q: Does context accumulate across subagent calls?

**No.** Each subagent has independent context. Only their outputs accumulate in the main agent.

### Q: What's the absolute minimum context?

**~6,530 tokens** at session start. This is the baseline for using Trellis.

### Q: Can I use Trellis with 32k context models?

**Possible but tight.** Peak usage (~11k) is 34% of 32k. You'll have ~21k for actual work. Consider disabling MCP servers and using minimal JSONL files.

### Q: How does MCP affect this?

**MCP is separate.** Each MCP tool definition adds ~100-300 tokens. A server with 10 tools adds ~1,000-3,000 tokens. Disable unused servers to save context.

---

## Conclusion

| Model | Trellis Overhead | Available for Work |
|-------|------------------|-------------------|
| **1M tokens** | ~1.1% peak | **~988,870 tokens** |
| **200k tokens** | ~5.6% peak | **~188,870 tokens** |
| **128k tokens** | ~8.7% peak | **~116,870 tokens** |
| **32k tokens** | ~34.8% peak | **~20,870 tokens** |

Trellis is designed for modern large-context models. With 200k+ context, the framework overhead is negligible.

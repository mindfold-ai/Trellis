# Understanding Trellis Through Kubernetes

> If you're familiar with Kubernetes, this document will help you quickly grasp Trellis's design philosophy.

---

## Table of Contents

1. [K8s Core Concepts Overview](#1-k8s-core-concepts-overview)
2. [Trellis and K8s Analogy](#2-trellis-and-k8s-analogy)
3. [Reconciliation Mechanism Deep Dive](#3-reconciliation-mechanism-deep-dive)
4. [Complete Workflow](#4-complete-workflow)
5. [Why This Design](#5-why-this-design)

---

## 1. K8s Core Concepts Overview

### 1.1 Imperative vs Declarative

**Imperative**: Describe "how to do it"
```bash
# Step-by-step instructions for the system
current_pods=$(kubectl get pods -l app=nginx --no-headers | wc -l)
if [ $current_pods -lt 3 ]; then
  kubectl run nginx --image=nginx:1.19
fi
```

**Declarative**: Describe "what you want"
```yaml
# Just state the desired end state
apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: nginx
        image: nginx:1.19
```

| Dimension | Imperative | Declarative |
|-----------|------------|-------------|
| Focus | Process (How) | Result (What) |
| Executor | User orchestrates each step | System auto-reconciles |
| Idempotency | Requires extra handling | Naturally idempotent |
| Error Recovery | Requires user intervention | Self-healing |

### 1.2 Control Loop

The core of K8s is the **Control Loop**:

```
Desired State          Actual State
(User declares)        (System observes)
      |                     |
      +---> Controller <----+
                |
            Observe → Diff → Act → Repeat
```

**Power in action**:
```
I declare: I want 3 nginx Pods

A Pod gets accidentally deleted → Controller detects 2 ≠ 3 → Auto-creates 1
I modify declaration to 5      → Controller detects 3 ≠ 5 → Auto-creates 2

No manual intervention needed. System auto-detects, auto-recovers, auto-adapts.
```

---

## 2. Trellis and K8s Analogy

### 2.1 Architecture Mapping

```
┌─────────────────────────────────────────────────────────────┐
│  Kubernetes                                                 │
│                                                             │
│  YAML Manifest ──> Controller ──> Actual State              │
│  (Desired State)   (Reconcile)    (Actual State)            │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│  Trellis                                                    │
│                                                             │
│  Task Dir      ──> Dispatch + Ralph Loop ──> Compliant Code │
│  (Desired State)   (Reconcile)               (Actual State) │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Core Component Mapping

| Kubernetes | Trellis | Description |
|------------|---------|-------------|
| YAML Manifest | Task Directory | Declares desired state |
| Controller | Dispatch | Orchestrates phase execution |
| Reconciliation Loop | Ralph Loop | Loops until verification passes |
| Pod/Container | Agent | Actual execution unit |
| ConfigMap | jsonl + Hook | Injects config/context |
| Actual State | Final Code | Product after reconciliation |

### 2.3 Key Insight

K8s solves: **Infrastructure complexity** — Uses declarative to abstract away details, Controller handles reconciliation.

Trellis solves: **AI development uncertainty** — Uses declarative to define expectations (prd.md + guidelines), Ralph Loop handles reconciliation.

Common ground:
- Users only declare "what they want", don't worry about "how to do it"
- System continuously reconciles until actual state matches desired
- Auto-repairs when deviations occur

> Next, Chapter 3 details the reconciliation mechanism (Hook + Ralph Loop), and Chapter 4 expands on the complete workflow (Phase 1-4).

---

## 3. Reconciliation Mechanism Deep Dive

Trellis reconciliation is achieved through two mechanisms working together: **Hook Injection** and **Ralph Loop**.

### 3.1 Hook Injection

**Timing**: Automatically triggered each time a Subagent is called

**Function**: Injects file contents referenced in jsonl into the Agent's context

```
Plan/Research Agent finds needed files in advance
            │
            ▼
    Writes to implement.jsonl / check.jsonl
            │
            ▼
    Dispatch calls Subagent
            │
            ▼
    Hook intercepts, reads jsonl, injects file contents
            │
            ▼
    Subagent receives complete context, starts working
```

**jsonl file example**:
```jsonl
{"file": ".trellis/spec/backend/index.md", "reason": "Backend guidelines"}
{"file": "src/api/auth.ts", "reason": "Existing auth pattern"}
```

**Why this design**:
- Prevents context overload (Context Rot) — Only injects what's needed for current phase
- Traceable — jsonl records what context each task used
- Decoupled — Agent doesn't need to search, focuses on execution

### 3.2 Ralph Loop

**Essence**: A programmatic quality gate that intercepts Agent stop requests and forces continuation if verification fails.

**Trigger timing**: When Check Agent attempts to stop

**Flow**:

```
Check Agent attempts to stop
        │
        ▼
SubagentStop Hook triggers ralph-loop.py
        │
        ▼
    Has verify config?
        │
   ┌────┴────┐
  Yes        No
   │         │
   ▼         ▼
Run verify   Check completion
commands     markers
(pnpm lint)  (parse from output)
   │         │
   ▼         ▼
┌──┴──┐   ┌──┴──┐
│Pass  │   │Complete│
│     │   │       │
▼     ▼   ▼       ▼
allow block allow  block
(stop) (continue) (stop) (continue)

Max 5 iterations, then force allow
```

**verify config example** (worktree.yaml):
```yaml
verify:
  - pnpm lint
  - pnpm typecheck
```

**Why use programmatic verification instead of letting AI judge**:
- Programmatic verification is reliable — lint pass means pass, doesn't depend on AI's judgment
- Configurable — Different projects can configure different verification commands
- Prevents infinite loops — Max 5 iterations, then force allow

**Limitations**:
- Complex architectural issues or logic bugs may require human intervention
- Depends on guideline quality; unclear guidelines lead to limited check effectiveness

---

## 4. Complete Workflow

### 4.1 Phase Overview

```
Task Directory
├── prd.md           (Task requirements)
├── implement.jsonl  (Implementation phase context)
├── check.jsonl      (Check phase context)
└── task.json        (Metadata)
        │
        ▼
┌───────────────────────────────────────────────┐
│  Phase 1: implement                           │
│  ─────────────────                            │
│  Agent: Implement Agent                       │
│  Injects: prd.md + files from implement.jsonl │
│  Task: Write code based on requirements       │
└───────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│  Phase 2: check                               │
│  ─────────────────                            │
│  Agent: Check Agent                           │
│  Injects: Guideline files from check.jsonl   │
│  Task: Check code compliance, fix issues     │
│  Reconcile: Ralph Loop verifies, loops if fail│
└───────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│  Phase 3: finish                              │
│  ─────────────────                            │
│  Agent: Check Agent (with [finish] flag)     │
│  Injects: finish-work.md (Pre-Commit List)   │
│  Task: Pre-commit completeness check          │
│        - lint/typecheck/test passing         │
│        - Documentation in sync               │
│        - API/DB changes complete             │
│  Reconcile: Skips Ralph Loop (already verified)│
└───────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│  Phase 4: create-pr                           │
│  ─────────────────                            │
│  Task: Create Pull Request                    │
└───────────────────────────────────────────────┘
        │
        ▼
    Compliant Code + PR
```

### 4.2 Exception Path

If Check Agent reports unfixable issues, Dispatch can call **Debug Agent** for deep analysis. This is not the default flow, but exception handling.

---

## 5. Why This Design

### 5.1 One-Click Complete Workflow

`/trellis:start` or `/trellis:parallel` (Claude Code only) launches with one click, AI completes the entire flow:

```
Plan → Implement → Check → Finish → PR
```

Users don't need to guide step-by-step. What to do at each phase, which guidelines to reference — it's all predefined.

### 5.2 Continuous Accumulation of Development Guidelines

```
Guidelines stored in .trellis/spec/
        │
        ▼
AI executes with guidelines ──> Finds issues ──> Updates guidelines
        │                                    │
        └────────────────────────────────────┘
              Guidelines improve over time
```

Thinking Guides help discover "didn't think of that" problems.

### 5.3 Preventing Context Rot

Too much context causes LLM to:
- **Distraction** — Gets sidetracked by irrelevant information
- **Confusion** — Information contradicts itself
- **Clash** — Old and new information conflict

Trellis injects by phase:
- implement phase: Requirements + related code
- check phase: Development guidelines
- finish phase: Pre-commit checklist

Each phase's Agent only receives context relevant to its task.

### 5.4 Programmatic Quality Control

```
Traditional approach:
  "Please check code quality" ──> AI says "I checked" ──> Did it really?

Trellis approach:
  Ralph Loop runs pnpm lint ──> Pass to proceed ──> Programmatically guaranteed
```

Doesn't rely on AI's self-judgment, uses programmatic enforcement.

### 5.5 Traceability

| Record | Content |
|--------|---------|
| jsonl | What context each task used |
| workspace | Work content of each session |
| task.json | Complete task lifecycle |

When issues arise, you can trace back to which file was missing, or which guideline was unclear.

---

## Summary

| Concept | K8s | Trellis |
|---------|-----|---------|
| Desired State | YAML Manifest | Task Directory (prd.md + jsonl) |
| Execution Unit | Pod/Container | Agent |
| Reconciliation Loop | Controller | Dispatch + Ralph Loop |
| Config Injection | ConfigMap | Hook + jsonl |
| Final Product | Running Pods | Compliant Code |

**Core philosophy aligned**: Declare desired → System reconciles → Eventually consistent.

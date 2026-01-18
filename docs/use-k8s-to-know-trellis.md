# Understanding Trellis Through K8s

> This document explains Trellis design concepts using Kubernetes analogies. If you're familiar with K8s, understanding Trellis will be more intuitive.

---

## Table of Contents
1. [The Essential Difference Between Two Paradigms](#1-the-essential-difference-between-two-paradigms)
2. [K8s Core Mechanisms](#2-k8s-core-mechanisms)
3. [Trellis and K8s Analogy](#3-trellis-and-k8s-analogy)
4. [How Trellis Works in Practice](#4-how-trellis-works-in-practice)

---

## 1. The Essential Difference Between Two Paradigms

### 1.1 Imperative: Describing "How to Do It"

```bash
# Imperative: telling the system step by step how to operate
current_pods=$(kubectl get pods -l app=nginx --no-headers | wc -l)
if [ $current_pods -lt 3 ]; then
  for i in $(seq $current_pods 2); do
    kubectl run nginx-$i --image=nginx:1.19
  done
elif [ $current_pods -gt 3 ]; then
  kubectl delete pod $(kubectl get pods -l app=nginx -o name | tail -n +4)
fi
```

### 1.2 Declarative: Describing "What You Want"

```yaml
# Declarative: only specify the desired final state
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: nginx
        image: nginx:1.19
```

### 1.3 Core Differences Comparison

| Dimension | Imperative | Declarative |
|-----------|------------|-------------|
| Focus | Process (How) | Result (What) |
| Executor | User orchestrates each step | System auto-reconciles |
| State Management | User responsible | System responsible |
| Idempotency | Requires additional handling | Naturally idempotent |
| Error Recovery | Requires user intervention | System self-heals |

---

## 2. K8s Core Mechanisms

### 2.1 Control Loop

The core of K8s is the "control loop", also called the "reconciliation loop":

```
Desired State (user declares)    Actual State (system observes)
        |                           |
        +------> Controller <-------+
                    |
                 Observe  (observe actual state)
                    ↓
                  Diff    (compute difference)
                    ↓
                   Act    (execute actions)
                    ↓
                 Repeat   (infinite loop)
```

**The power of this pattern**:

```
Scenario: I declare I want 3 nginx Pods

Time T1: Cluster has 0 Pods
  → Controller detects: 0 ≠ 3 → creates 3 Pods

Time T2: 1 Pod is accidentally deleted
  → Controller detects: 2 ≠ 3 → creates 1 Pod

Time T3: A node goes down
  → Controller detects: 2 ≠ 3 → creates 1 Pod on another node

Time T4: I modify the declaration to 5 Pods
  → Controller detects: 3 ≠ 5 → creates 2 Pods

The entire process requires no manual intervention - the system automatically detects problems, recovers, and adapts to changes.
```

### 2.2 Key Characteristics of Declarative

**1. Idempotency**

```bash
# Same result no matter how many times executed
kubectl apply -f deployment.yaml  # 1st time: creates
kubectl apply -f deployment.yaml  # 2nd time: no change
kubectl apply -f deployment.yaml  # 100th time: still no change
```

**2. Self-Healing**

```
Pod crashes → Controller detects actual ≠ desired → auto-rebuild
Node goes down → Controller detects actual ≠ desired → auto-migrate
```

**3. Eventual Consistency**

```
Traditional thinking:
  "Execute command → takes effect immediately → returns success"

K8s thinking:
  "Accept declaration → returns 'accepted' → async reconciliation → eventually reaches desired state"
```

---

## 3. Trellis and K8s Analogy

### 3.1 Architecture Correspondence

**Kubernetes**:

```
YAML (desired state) --> Controller (reconciliation loop) --> Actual State
```

**Trellis**:

```
Feature Directory (desired state)
├── prd.md (feature requirements)
├── jsonl (code specification references)
└── feature.json (metadata)
        |
        v
    Dispatch calls Agents by phase
        |
        ├─> implement (write code)
        |
        ├─> check (code specification check) <──┐
        |       |                               | Ralph Loop
        |       └── verification failed ────────┘ (programmatic loop control)
        |
        ├─> finish (pre-commit completeness check)
        |
        └─> create-pr
        |
        v
Specification-compliant code (Actual State)
```

Hook injects specifications as reference each time an Agent is called.

**Reconciliation Process Details**:

Phase 1 - implement:
  - Dispatch calls Implement Agent
  - Hook injects prd.md + specifications referenced by jsonl
  - Agent writes code referencing specifications

Phase 2 - check (code specification check):
  - Dispatch calls Check Agent
  - Hook injects specifications referenced by check.jsonl (check-backend/frontend/cross-layer)
  - Checks if code follows development specifications, cross-layer data flow, code reuse, etc.
  - Fixes issues itself when found
  - Ralph Loop programmatic loop control:
    - If verify command is configured → execute command to verify (programmatic, reliable)
    - Otherwise → check Agent output completion markers
  - Only proceeds when verification passes, otherwise Agent continues fixing
  - Maximum 5 iterations (prevents infinite loops)

Phase 3 - finish (pre-commit completeness check):
  - Dispatch calls Check Agent (prompt has [finish] marker)
  - Hook injects finish-work.md (Pre-Commit Checklist)
  - Check contents:
    - Code quality: are lint/typecheck/test passing
    - Documentation sync: does .trellis/structure/ need updates
    - API changes: are schema, docs, client in sync
    - DB changes: are migration, schema, related queries updated
  - Skips Ralph Loop (code specifications already verified in check phase)
  - Ensures work is complete and deliverable (code + docs + tests + verification)

Phase 4 - create-pr:
  - Creates Pull Request

Exception path - debug:
  - If Check Agent reports an unfixable issue
  - Dispatch can call Debug Agent for deep analysis
  - This is not the default flow, but exception handling

The "reconciliation" here is controlled programmatically by **Ralph Loop**: it intercepts Check Agent's stop requests, verifies if truly complete (runs lint/typecheck or checks completion markers), and blocks stopping to let Agent continue fixing if not passed. This is similar to K8s Controller's reconciliation concept, but uses programs rather than LLMs to control the loop.

### 3.2 Core Component Comparison

| Kubernetes | Trellis | Description |
|------------|---------|-------------|
| YAML Manifest | Feature Directory | Declares desired state (prd.md = feature requirements, jsonl-referenced specs = code requirements) |
| Controller Reconciliation Loop | Ralph Loop | Programmatically intercepts Agent stop, continues loop if verification fails |
| Actual State | Final Code | Code that passes checks and fixes, compliant with specifications |
| Verification Mechanism | verify config | Verification commands configured in worktree.yaml (e.g., pnpm lint) |

**About Hook**: Hook is part of the reconciliation process — it injects specification documents each time an agent is called, giving the agent reference material to judge if code meets expectations.

### 3.3 Self-Healing Mechanism Comparison

**Kubernetes Self-Healing**:

```
Pod OOMKilled → Controller detects → auto-restart
Container CrashLoopBackOff → Controller detects → retry with backoff strategy
Node NotReady → Controller detects → migrate Pod to healthy node
```

K8s self-healing is **passive detection + automatic repair**: the system continuously monitors and automatically handles problems when found.

**Trellis Self-Healing**:

Trellis implements programmatic loop control through **Ralph Loop** (SubagentStop Hook):

```
Check Agent attempts to stop
        |
        v
SubagentStop Hook triggers ralph-loop.py
        |
        v
verify config exists?
        |
        ├── Yes --> Execute configured verification commands
        |            |
        |            ├── All pass --> allow (stop)
        |            └── Fail --> block (continue fixing)
        |
        └── No --> Check Agent output completion markers
                     |
                     ├── Markers complete --> allow
                     └── Missing markers --> block

Maximum 5 iterations, force allow after exceeding
```

**Specific Mechanisms**:

1. **Programmatic Verification (Recommended)**:
   - Configure `verify` commands in `worktree.yaml`
   - Ralph Loop executes these commands for verification
   - Does not rely on AI output, program enforces verification

2. **Completion Markers (Fallback)**:
   - If verify is not configured, checks Agent output markers
   - Markers are generated from `check.jsonl` reason fields
   - Requires Agent to actually perform checks before outputting markers

3. **Check Agent's Self-Repair Capability**:
   - Check Agent definition clearly states "Fix issues yourself, not just report them"
   - When issues are found, uses Edit tool to directly modify code
   - Ralph Loop tells Agent where failures occurred if verification fails

4. **finish Phase Skips Loop**:
   - When prompt has `[finish]` marker, skips Ralph Loop
   - Because check phase already verified

**Limitations**:
- Complex architectural issues or logic bugs may require human intervention
- Maximum 5 iterations, force allow after exceeding (prevents cost overruns)
- Depends on specification file quality; unclear specs lead to limited check effectiveness

---

## 4. How Trellis Works in Practice

### 4.1 What Trellis Does

**Core Mechanism**:

```
Plan Agent or Research Agent finds needed files in advance
              │
              ▼
     Writes to implement.jsonl / check.jsonl
              │
              ▼
     Hook injects all these files when calling Subagent
              │
              ▼
     Subagent receives complete context and starts working
```

**jsonl File Example**:

```jsonl
{"file": ".trellis/structure/backend/index.md", "reason": "Backend guidelines"}
{"file": "src/api/auth.ts", "reason": "Existing auth pattern"}
{"file": "src/middleware/", "type": "directory", "reason": "Middleware patterns"}
```

**Dispatch Invocation**:

```python
Task(subagent_type="implement", prompt="Implement feature according to prd.md")
# Hook automatically injects all files from implement.jsonl
```

### 4.2 Advantages of This Workflow

1. **One-Click Start for Complete Workflow**:
   - `/start` or `/parallel` one-click launch, AI automatically completes the entire Plan → Implement → Check → Finish → PR flow
   - Users don't need step-by-step guidance, AI executes autonomously following preset flow and specifications
   - What to do at each phase and which specifications to reference are all predefined

2. **Continuous Accumulation of Development Specifications**:
   - Specifications are stored in `.trellis/structure/`, they are the project's knowledge assets
   - Every time issues are found (bugs, omissions, inconsistencies), specifications are updated
   - Specifications improve with use: AI references specifications to execute, clearer specs lead to better execution
   - Thinking Guides help discover "didn't think of that" issues

3. **Complete End-to-End Flow**:
   - From requirements analysis (Plan) → Implementation (Implement) → Check → Finish → PR
   - Each phase has clear responsibilities and checkpoints
   - Not a single-point tool, but a complete workflow

4. **Preventing Context Rot**:
   - Too much context causes LLM Distraction, Confusion, and Clash
   - Trellis injects by phase: implement phase injects requirements and related code, check phase injects development specs, finish phase injects commit checklist
   - Each phase's Agent only receives context relevant to its task

5. **Programmatic Quality Control**:
   - Ralph Loop programmatically intercepts Agent stop, continues loop if verification fails
   - `verify` config can use lint/typecheck and other commands for verification, not relying on AI self-judgment
   - More reliable than pure prompt constraints

6. **Traceability**:
   - jsonl records which context each feature used
   - agent-traces records each session's work content
   - When issues arise, can trace back which file was missing or which spec was unclear

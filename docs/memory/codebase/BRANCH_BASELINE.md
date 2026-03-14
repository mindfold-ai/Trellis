---
title: Branch Baseline
module: codebase
layer: baseline
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Branch Baseline

> Active branches, manifest versions, and baseline commits for the AOSP adaptation project.

---

## Active Branches

| Branch | Base AOSP Tag | Purpose | Status |
|--------|--------------|---------|--------|
| (pending) | (pending) | Main development | active |
| (pending) | (pending) | Stable baseline | (pending) |

---

## Manifest Versions

| Branch | Manifest File | AOSP Build ID | Notes |
|--------|--------------|--------------|-------|
| (pending) | (pending) | (pending) | |

---

## Baseline Commits

Key commits that establish the starting point for our customizations:

| Module | Commit Hash | Description | Date |
|--------|------------|-------------|------|
| SystemUI | (pending) | (pending) | (pending) |
| Launcher | (pending) | (pending) | (pending) |
| Framework | (pending) | (pending) | (pending) |

---

## Merge Strategy

- Rebase our changes on top of new AOSP tags quarterly (or per release)
- Attribution tags (`[AOSP-CUSTOM]`) are the key to identifying our patches during rebase
- (pending: fill in merge procedure details)

---

## Related Specs

- `.trellis/spec/architecture/low-intrusion-principles.md` — why attribution tags matter
- `.trellis/spec/module_ownership/ownership-rules.md` — owner tracking

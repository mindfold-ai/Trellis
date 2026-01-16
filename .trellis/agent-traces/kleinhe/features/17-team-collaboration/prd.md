# Feature: Team Collaboration (Progressive)

## Goal

Build a progressive team collaboration mechanism, starting with simple visibility for small teams, gradually supporting larger scale and finer permission control.

---

## Milestone 1: Basic Visibility (4-person team)

**Goal**: Enable team members to see each other's features

**Implementation**:
- `feature.sh list-all` - List features from all developers
- Output format: `[developer] feature-name (status) - date`

**Status**: Implemented

---

## Milestone 2: Version and Upgrade (Cross-project reuse)

**Goal**: Support Trellis cross-project upgrades

**Implementation**:
- `.trellis/version.json` - Version identifier
- `.trellis/scripts/upgrade.sh` - Upgrade script

**Status**: Implemented

---

## Milestone 3: Feature Status Sync (Future)

**Goal**: Automatically sync feature status to shared location

**Possible directions**:
- Auto-generate `feature-board.md`
- Integrate with Linear/GitHub Issues

**Status**: Planned

---

## Milestone 4: Team-level Isolation (Future, large teams)

**Goal**: Support team boundaries and permission control

**Possible directions**:
- Team configuration files
- Team-level features directories
- Cross-team visibility control

**Status**: Planned

---

## Verification

```bash
# Milestone 1
./.trellis/scripts/feature.sh list-all

# Milestone 2 (in another project)
./.trellis/scripts/upgrade.sh /path/to/Trellis
```

# Second local repair commit plan — pending user authorization

Repository: `/Users/wumengye/Documents/GoProjects/Trellis`.
Branch: `codex/31-native-delivery-lifecycle`.
Parent HEAD: `1f479eaf65c1ce661d7aa69d1b68affc6eeb2c92`.
Proposed message: `fix(task): preserve publication recovery and exact Delivery context`.

Action: stage exactly the paths below and create one local repair commit.
Authorization for the earlier 195-path work commit is already consumed; this
plan requires fresh approval. No remote action or history rewrite is part of
this plan. Current Task remains legacy in_progress; D2 readiness is outstanding.

Scope: close four independently reproduced full-range Review findings: same-PR
publication refresh/recovery; missing-session v2 hook fallback; actual Droid
carriers; contradictory workflow workspace specs. Include their meaningful
regressions, synchronized shipped/dogfood contract/runtime/hooks, design and
actual source/installed evidence. No unrelated Task/gitlink/worktree changes.

Checks: Core 442 PASS / 1 existing SQLite SKIP; CLI 1928 PASS with 4 workers;
lint/typecheck/build PASS; Python 3.9 compile and twin parity PASS. Independent
complete-range source Review and three fresh installed sample Reviews PASS;
samples complete real manual/local outcomes, retries and Completion/Closure.
See `execution.md`, `source-review-rework.md`, `installed-review-rework.md`.

Commit hook will run its required checks with `VITEST_MAX_WORKERS=4`, preserving
existing timeouts. After success, reread the actual committed range and remote
state before any publication proposal. Existing local resources are preserved.

## Exact paths

25 paths (including this plan):

- `.claude/hooks/inject-subagent-context.py`
- `.codex/hooks/inject-subagent-context.py`
- `.cursor/hooks/inject-subagent-context.py`
- `.trellis/delivery-contract.md`
- `.trellis/scripts/common/delivery_operations.py`
- `.trellis/spec/cli/backend/delivery-lifecycle.md`
- `.trellis/spec/cli/backend/platform-integration.md`
- `.trellis/spec/cli/backend/script-conventions.md`
- `.trellis/spec/cli/backend/workflow-state-contract.md`
- `.trellis/tasks/10-12-31-native-delivery-lifecycle/design.md`
- `.trellis/tasks/10-12-31-native-delivery-lifecycle/research/execution.md`
- `.trellis/tasks/10-12-31-native-delivery-lifecycle/research/installed-review-rework.md`
- `.trellis/tasks/10-12-31-native-delivery-lifecycle/research/rework-commit-plan.md`
- `.trellis/tasks/10-12-31-native-delivery-lifecycle/research/source-review-rework.md`
- `packages/cli/src/templates/droid/droids/trellis-check.md`
- `packages/cli/src/templates/droid/droids/trellis-implement.md`
- `packages/cli/src/templates/shared-hooks/inject-subagent-context.py`
- `packages/cli/src/templates/trellis/delivery-contract.md`
- `packages/cli/src/templates/trellis/scripts/common/delivery_operations.py`
- `packages/cli/test/commands/delivery-workflow.integration.test.ts`
- `packages/cli/test/scripts/delivery-v2.integration.test.ts`
- `packages/core/src/task/v2/operations.ts`
- `packages/core/test/fixtures/task-v2/publication-history-recovery.json`
- `packages/core/test/fixtures/task-v2/publication-rework.json`
- `packages/core/test/task/v2.test.ts`

## Pre-approval content identity

The plan itself is listed without a self-referential digest. All other selected
paths are fingerprinted below; verify these bytes before staging.

- `.claude/hooks/inject-subagent-context.py`: `be772bbef7bbe2df903cf90c9ec55b00c00a083e4a01954f50da05348b793fcc`
- `.codex/hooks/inject-subagent-context.py`: `be772bbef7bbe2df903cf90c9ec55b00c00a083e4a01954f50da05348b793fcc`
- `.cursor/hooks/inject-subagent-context.py`: `be772bbef7bbe2df903cf90c9ec55b00c00a083e4a01954f50da05348b793fcc`
- `.trellis/delivery-contract.md`: `881d193581afdaa48653100c650b5dc7b84c6f0b98f571f90a080c72114b1dbe`
- `.trellis/scripts/common/delivery_operations.py`: `d181215daeb13d56b8aef6039e986e84a59cb38d90273fc0d36170e076fa2c07`
- `.trellis/spec/cli/backend/delivery-lifecycle.md`: `0663d2405f4b2f94dda18c851c12d171f4a18bbaffda6ace00770c713027cb87`
- `.trellis/spec/cli/backend/platform-integration.md`: `51e8585f8335a7c49dd5bdb9bcb7f4016d1dabd0c0afb6cd503f61cc200353d5`
- `.trellis/spec/cli/backend/script-conventions.md`: `0d037dd838e22247338eef632adc8ce04afe833313d1049d20923a1898327146`
- `.trellis/spec/cli/backend/workflow-state-contract.md`: `39810b5b4734625666c2e932fbd53f5ed0daeeb4c0950869b7134e59a44e5a18`
- `.trellis/tasks/10-12-31-native-delivery-lifecycle/design.md`: `0a9d3fd2beb5d6728c3aded24b6d50b6c5d3c4fed565f09a4d2bb82798ddaf7a`
- `.trellis/tasks/10-12-31-native-delivery-lifecycle/research/execution.md`: `267182480c873df9713f8c4c508d1edf468f71d09786ba78534a5fe805e4337e`
- `.trellis/tasks/10-12-31-native-delivery-lifecycle/research/installed-review-rework.md`: `81d8229f6ab45321e3ddf0907de768cf5c41507ec2a8ce1c287a86cf0cbd77cd`
- `.trellis/tasks/10-12-31-native-delivery-lifecycle/research/source-review-rework.md`: `64878f4cf9bcc53db8919615b662eea6c7e7544430c743981d37eed8d3d9b18b`
- `packages/cli/src/templates/droid/droids/trellis-check.md`: `8da84cd644468f463f0a45a32a32f5f3afff1b7397d4799c9e4e15c23028da31`
- `packages/cli/src/templates/droid/droids/trellis-implement.md`: `b500785ee48afc646b83543577f878cac8af01a8263df183778085495cb28d36`
- `packages/cli/src/templates/shared-hooks/inject-subagent-context.py`: `be772bbef7bbe2df903cf90c9ec55b00c00a083e4a01954f50da05348b793fcc`
- `packages/cli/src/templates/trellis/delivery-contract.md`: `881d193581afdaa48653100c650b5dc7b84c6f0b98f571f90a080c72114b1dbe`
- `packages/cli/src/templates/trellis/scripts/common/delivery_operations.py`: `d181215daeb13d56b8aef6039e986e84a59cb38d90273fc0d36170e076fa2c07`
- `packages/cli/test/commands/delivery-workflow.integration.test.ts`: `d8f953f414e93655bc853e0a8890349f951aa6d3eadcd9d760ed9609c55ac34a`
- `packages/cli/test/scripts/delivery-v2.integration.test.ts`: `f579ef362b2437443a56774f47243c59f4811a7cbc66abd4f7cd543f586305eb`
- `packages/core/src/task/v2/operations.ts`: `99734f5076d2591fc0a899a959f7198d962e2e8459e4c4d87b3a26a76ff3edf0`
- `packages/core/test/fixtures/task-v2/publication-history-recovery.json`: `45226cf20198c099aa5c754f774dde80178a7fd0af6bc235965d9e220cb51129`
- `packages/core/test/fixtures/task-v2/publication-rework.json`: `086ffe141fde025d8d556bae214e15d3992796ebf901cf11bad76fd96dee4f6d`
- `packages/core/test/task/v2.test.ts`: `49a54844c1adad2d90508f0aad666b31ceaa40144efe904c161b7bb13be8994c`

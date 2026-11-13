# Implementation

- [x] Add closed custom AGENTS input, private guard and capability.
- [x] Freeze final target in prepare and validate from guard during apply/recovery.
- [x] Add real filesystem integration scenarios 1-5 and update maintenance spec.
- [x] Build Core then CLI; run relevant integration tests, TypeScript and affected ESLint checks.
- [x] Return built CLI path for Guru integration; do not publish or commit.

## Validation results

Core and CLI builds passed. CLI typecheck and full CLI ESLint passed. Four targeted maintenance integration files passed all 52 tests, including original-operation recovery, ordinary partial writer recovery, exact rollback and later-edit protection. git diff --check passed. This local source candidate does not change version files or published tag/npm identities. Guru integration and remote CI/source locking remain owned by Guru #658.

## Source delivery review and closeout

Independent review of the complete candidate reported no P0-P3 findings. Additional empty-content, permissions, duplicate-decision and skip-path probes matched the accepted contract. This local Fork source scope is implemented and checked. The dependency is castbox/Trellis#57; its Guru consumer remains castbox/guru-trellis#658. This result does not claim Guru completion, a deployed dependency or business installation acceptance.

Native Phase 3.4 completed at source commit `c5f360e6df1b540d12ed4b4ef0a92cadb0ba2de7`. The commit includes the five implementation/spec/test files and this native Task. Its pre-commit gate passed the complete Core and CLI suites; CLI reported 2405 passing tests. The native archive records only this completed Fork source scope. Remote dependency publication, CI source locking and Guru completion remain separate. No remote Issue closure or publication has occurred in this worker.

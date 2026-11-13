# Research: independent public digest design review

- Query: Review completed PRD/design/implementation plan for smallest additive API, exact OID checks, no-lazy-fetch preservation, lifecycle, independent validation and installed exposure.
- Scope: internal; planning artifact review only.
- Date: 2026-10-17

## Findings

No actionable design flaw found in the current artifacts.

Reviewed files:
- `prd.md`: explicit same-Issue residual, immutable fact reuse, old filesystem API preservation, independent input checks, before/after gates, matching release and downstream adoption boundary.
- `design.md`: root-bound `GitCandidateContent`, exact actual commit identity in SHA1/SHA256 repositories, isolated environment plus explicit no-lazy-fetch control, bare scratch support, close-and-reject-reuse lifecycle, type/availability checks on cache hits, additive installed public module exposure.
- `implement.md`: before-and-freeze source HOLD, isolated Guru adaptation, independent checking, normal install projection, immutable paired release and verified merge before closure.

The design resolves the material caller risks identified in `caller-continuation.md`: mutable snapshots do not become immutable authority; HistoryContext closes/recreates digest state on root switch; no-lazy-fetch is a public argument rather than inherited-environment dependency; cached digests do not cache validation success; old local_commit and filesystem contracts stay in scope for regression checking.

Related specs: `.trellis/spec/cli/backend/delivery-lifecycle.md:304` operation-local immutable observations; `.trellis/spec/cli/backend/trellis-core-sdk.md` additive public boundary; `.agents/skills/python-design/SKILL.md` deep public owner interface.

## Caveats / Not Found

- Planning review is not implementation, test, benchmark, installed-source or release proof.
- Source HOLD remains active until complete before measurements and numerical budgets are frozen.
- Implementation review must verify actual exact-OID type rejection, literal-path handling, no-lazy-fetch on every Git helper, object-availability checks on cache hits, closed-context rejection, root-switch cleanup and installed canonical/dogfood parity.

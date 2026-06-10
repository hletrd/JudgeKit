# Architect — RPF Cycle 1 (2026-06-11)

**HEAD reviewed:** f977ef4c. Lens: structure, coupling, layering of the delta.

## Findings

### A1 — CSP route coverage is an enumerated allowlist split across two files (LOW→MEDIUM trend, confidence High)
The nonce-CSP contract is distributed between `proxy.ts` (matcher enumeration)
and `next.config.ts` (strict static fallback). Adding a page route requires
remembering a matcher entry; two regressions of this class have now shipped
(SEC-21-3, then 6035ca83's four routes). Architecturally this is an implicit
cross-file invariant with no guard. Options: (a) catch-all matcher with a
static-asset negative lookahead — single source of truth; (b) a unit test that
walks `src/app/**/page.tsx` route dirs and asserts each maps into the matcher
list (cheap, no runtime change — fits the repo's existing source-grep-guard
test idiom, e.g. `tests/unit/infra/source-grep-inventory.test.ts`). Recommend (b)
now, (a) when middleware cost on assets is measured.

### A2 — "Effective restrictions" now have two resolution helpers (LOW, confidence High)
`getEffectiveModeRestrictions` (system-settings.ts:205-216) and the inline
logic in `isAiAssistantEnabledForContext` (platform-mode-context.ts:288-293)
implement the same override rule independently. They agree today; a future
edit to one (e.g. a third override flag) can drift. Consolidate: have
`isAiAssistantEnabledForContext` call `getEffectiveModeRestrictions(effectiveMode)`.

### A3 — Claim SQL grows by accretion (LOW, watch item)
`buildClaimSql` now chains 5 CTEs with subtle cross-CTE invariants (snapshot
semantics, same-row-update prohibition, lock ordering). Each fix (token fence,
slot bump, prev release, next: self-reclaim compensation) raises the cost of
the next change. The module's "single source of truth + structural tests"
discipline is good; when the self-reclaim fix lands, add invariant comments
covering (i) why `<> @workerId` must stay on the release CTE and (ii) the
lock-order rationale. If one more capacity-accounting case appears, consider
moving active_tasks accounting out of the claim statement into the poll/
finalize path (single-writer model).

### A4 — Drafts vs snapshots separation: correct (no finding)
`source_drafts` (read-back, upsert, user-facing) vs `code_snapshots`
(append-only anti-cheat telemetry) are properly distinct tables/modules with
opposite contracts — the commit message's rationale is implemented as stated.
Good boundary.

### A5 — Background-job registry is healthy (no finding)
`instrumentation.ts` is the single composition point for process-level jobs
(rate-limit eviction, audit pruning, retention pruning, staleness sweep,
shutdown flush). Each is idempotent and unref'd.

## Carried items re-assessed (unchanged preconditions)
- ARCH-CARRY-1 (raw API handlers vs createApiHandler): the delta added no new
  raw handler; judge claim/poll remain raw by documented exception. RE-DEFER.
- ARCH-CARRY-2 (SSE O(n) eviction >500 conns): unchanged. RE-DEFER.
- deploy-docker.sh size (C3-AGG-5): +0 growth this cycle. RE-DEFER.

## Final sweep
Layering: new code respects lib/ ↔ app/ boundaries (draft store in lib,
route thin). i18n: new strings via messages (en+ko both updated — checked
messages/ diff). No schema layering violations (migration 0026 idempotent per
repo convention; drift guard green in unit run). Done.

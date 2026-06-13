# Test Engineer — RPF Cycle 7 (2026-06-13)

**HEAD reviewed:** 0472b007. Lens executed directly by the cycle agent (fallback per cycles 1–6).
**Baseline:** unit 339 files / 2650 tests PASS; component 71 files / 246 tests PASS (cycle-6 record). No flaky tests observed in the baseline run.

## Test gaps for this cycle's findings

### TE7-1 — Offset-ordering tiebreak pins missing on 7 sibling listings (HIGH for CR7-1)
The submissions listing has the canonical pin
(`tests/unit/api/submissions.route.test.ts:758-759`:
`orderBy.mock.calls[0]` has length 2). The siblings have NO equivalent pin, so
a regression that drops the id tiebreak would pass CI. Add the SAME shape pin
to each fixed route's test:
- `anti-cheat-get-behavioral.test.ts` (or a new `anti-cheat.route.test.ts`) — assert the events query `orderBy` receives 2 args.
- new/extended tests for `admin/audit-logs`, `admin/login-logs`, `users`, `files`, `problems` routes asserting the 2-key order on the paged query (and the cap query for audit/login exports).
Red-first: add the assertion BEFORE the route change so it fails on the
single-key order, then make it pass.

### TE7-2 — Dashboard paging has no poll-merge / loadMore-race coverage (HIGH for CR7-2/D7-1/D7-2)
`tests/component/anti-cheat-dashboard.test.tsx` exists but does not exercise:
(a) poll merge after loadMore drops no previously-loaded rows; (b) loadMore
after a poll reset does not duplicate ids; (c) fetch-sequence guard discards a
stale in-flight loadMore. The participant-timeline test
(`participant-anti-cheat-timeline.test.tsx`) already has the analogous
interleave test (cycle-6) — mirror it for the dashboard. Without these the
fix is unverified and can silently regress.

### TE7-3 — Schedule-edit token-expiry sync needs red-first coverage (HIGH for SEC7-1/A7-1)
No test asserts that editing an assignment's deadline updates existing
`contest_access_tokens.expiresAt`. Add to
`tests/unit/assignments/management.test.ts` (or a focused
`contest-access-tokens.test.ts` case): extend → tokens' expiry moves to new
`lateDeadline ?? deadline`; shorten → moves earlier; clear deadline → NULL.
And invite-route refresh (CR7-3): re-invite of an existing token updates a
stale `expiresAt` (assert `onConflictDoUpdate` set).

## Quality / no-gap confirmations
- Cycle-6 added solid red-first pins for G1 (token validity boundary, in-tx revocation, effective-close expiry, single-source consumption) and the queue-first reportEvent terminal-state asserts. No over-mocking that would hide the new logic.
- Source-grep inventory test (`tests/unit/infra/source-grep-inventory.test.ts`) is the right guard for the single-source-of-truth invariants; any new interpolation of `CONTEST_ACCESS_TOKEN_VALIDITY_SQL` or new `orderBy` should keep that baseline honest — bump with justification if a fix legitimately adds a call site.

## Final sweep
No flaky/time-dependent assertions introduced. The three gaps above (TE7-1/2/3)
map 1:1 to this cycle's planned fixes and must be written red-first.

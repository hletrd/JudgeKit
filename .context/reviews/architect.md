# Architect — RPF Cycle 9 (2026-06-13)

**HEAD:** da6179f3.

## A9-1 — listing-order invariant is enforced by an allow-list, not a structural guard (LOW, Medium)
The "every offset-paged listing ends in a unique sort key" invariant is real and
correct, but it is currently policed by a hand-maintained 5-route allow-list in
`listing-order-tiebreak.test.ts`. New or previously-missed offset routes
(CR9-1/2/3) silently escape it. **Structural options (not all in scope now):**
- (taken this cycle) extend the allow-list to the 3 missed routes;
- (future, optional) a `parsePagination`-coupled lint/AST check that any query
  combining `.offset(` with `.orderBy(` must include the table PK as the final
  ORDER BY key. Recorded as a hardening direction, NOT a deferred *finding* (no
  current defect beyond the 3 routes the allow-list extension covers).

The fix itself is purely additive and respects the established single-owner
pattern (the contract test stays the one source of truth for the invariant).

## Token-lifecycle architecture — converged
`contest-access-tokens.ts` is the single owner of validity + expiry; all 4
creation/mutation sites route through it after AGG8-1. The optional
`buildContestAccessTokenValues(...)` constructor (A8-1) remains an unimplemented
*hardening direction* (no future-drift insurance), explicitly recorded in the
cycle-8 plan as NOT a deferred finding — no action required unless a 5th token
insert site is added.

## No other architectural drift
Module boundaries, API handler factory, and DB-time discipline unchanged and
sound.

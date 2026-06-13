# tracer — RPF Cycle 10 (2026-06-13)

**HEAD:** 03125b44 (clean tree).

## Method
Traced the listing-order invariant end-to-end: every `.offset(` call site → its `orderBy` → whether a unique key terminates the order; traced the contract test (`listing-order-tiebreak.test.ts`) against the actual routes it claims to cover.

## Findings
**No new actionable findings.** The invariant "every offset/cap-paged listing ends in a unique key" holds across all 11 `.offset(` sites:
1. `submissions/route.ts` ✓  2. `anti-cheat/route.ts` (paged) ✓  3. `code-snapshots` ✓  4. `recruiting-invitations.ts` ✓  5. `accepted-solutions` (3 branches) ✓  6. `export.ts` (orderColumns=["id"] per table, snapshot-isolated) ✓  7-11. audit-logs / login-logs / users / files / problems ✓.

The contract test now enumerates 8 routes (5 cycle-7 + 3 cycle-9) and the assertions match the live source exactly (verified by reading both). The test's allow-list is no longer incomplete for the offset-paged class — its prior gap (cycle-9 AGG9-4) is closed.

The only ordered query WITHOUT a unique tiebreak is the anti-cheat gap-scan (`limit(5000)`, non-paged, AGG8-2) — correctly excluded from the paged-listing invariant and tracked as a carried deferral.

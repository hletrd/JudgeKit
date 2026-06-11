# RPF Cycle 42 — Verifier

**Date:** 2026-04-23
**Base commit:** 8912b987
**Reviewer angle:** Evidence-based correctness check against stated behavior

## Findings

### V-1: `problemPoints` length not validated against `problemIds` in quick-create [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/quick-create/route.ts:17-21,89`

**Description:** Verified that the Zod schema at lines 12-21 allows `problemPoints` to differ in length from `problemIds`. At line 89, `body.problemPoints?.[i] ?? 100` silently defaults unmatched problems to 100 points. This violates the expected behavior where an instructor who specifies custom point values should have them applied consistently to all problems. The fix is straightforward: add a `.refine()` to validate array lengths match.

**Evidence:** Traced the data flow from schema validation through to the database insert. The `problemValues` array at line 84-90 maps each `problemId` with its corresponding `problemPoints` entry or 100. No validation step catches length mismatches.

**Confidence:** Medium

---

### V-2: All prior cycle fixes remain intact [VERIFIED]

Verified that the following fixes from prior cycles are still in place and working:
1. `"redeemed"` removed from PATCH route allowed transitions (commit 498eb3e2)
2. `Date.now()` replaced with `getDbNowUncached()` in assignment PATCH (commit ff532a69)
3. Non-null assertions removed from anti-cheat heartbeat gap detection (commit 3acee3c9)
4. NaN guard in quick-create route (present)
5. MAX_EXPIRY_MS guard in bulk route (present)
6. Un-revoke transition removed from PATCH route (commit 81c732be)
7. ESCAPE clause in SSE LIKE queries (present)
8. Case-insensitive email dedup in bulk route (present)

---

## Sweep: Files Reviewed

All files listed in other reviewer reports, with specific focus on data flow verification.

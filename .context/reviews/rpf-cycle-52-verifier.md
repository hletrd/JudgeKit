# Cycle 52 — Verifier

**Date:** 2026-04-23
**Base commit:** 1117564e
**Reviewer:** verifier

## Inventory of Reviewed Files

- `src/lib/assignments/recruiting-invitations.ts` (full — focus on redeemRecruitingToken)
- `src/lib/assignments/exam-sessions.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/security/api-rate-limit.ts` (full)
- `src/app/api/v1/contests/quick-create/route.ts` (full)
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts` (full)
- `src/lib/auth/config.ts` (full)

## Findings

No new findings this cycle.

### Verified Behaviors

1. **redeemRecruitingToken atomic claim**: The SQL WHERE clause at line 502-508 checks `status = 'pending'` AND `(expires_at IS NULL OR expires_at > NOW())` in a single atomic UPDATE within a transaction. This prevents TOCTOU races for concurrent token redemption. If the UPDATE returns no rows, the transaction throws "alreadyRedeemed" which is caught and returned as an error. VERIFIED.

2. **exam session idempotency**: `startExamSession` checks for existing sessions inside the transaction and returns the existing session if found. The `onConflictDoNothing()` on the INSERT provides additional protection against race conditions. After insertion, the session is re-fetched to get the authoritative row. VERIFIED.

3. **ICPC leaderboard deterministic tie-breaking**: The sort at lines 346-359 uses: (1) more problems solved, (2) less penalty, (3) earlier last AC, (4) userId string comparison. This matches the SQL-based ranking in `computeSingleUserLiveRank`. VERIFIED.

4. **IOI leaderboard epsilon comparison**: The `isScoreTied` function at line 340-342 uses `Math.abs(a - b) < 0.01` to match the SQL `ROUND(..., 2)` precision. The JavaScript-side `Math.round(rawTotal * 100) / 100` normalization at line 322 prevents float drift accumulation. VERIFIED.

5. **quick-create NaN guards**: Lines 39-47 check `Number.isFinite(startsAt.getTime())` and `Number.isFinite(deadline.getTime())` as defense-in-depth even though the Zod schema enforces `.datetime()` format. The schedule validation `startsAt >= deadline` at line 49 catches inverted date ranges. VERIFIED.

6. **assignment PATCH DB time usage**: Line 103 uses `await getDbNowUncached()` for the active exam-mode contest check, consistent with the recruiting token routes and submission deadline enforcement. VERIFIED.

7. **auth config timing-safe password comparison**: The `DUMMY_PASSWORD_HASH` at line 51 ensures that even when no user is found, a real Argon2id verification occurs, preventing timing-based user enumeration. VERIFIED.

### Prior Fixes Still Intact

All 23 fixes from cycles 37-50 remain intact as documented in the cycle 51 aggregate.

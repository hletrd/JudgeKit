# RPF Cycle 11 — Document Specialist

**Date:** 2026-04-20
**Base commit:** 74353547

## Findings

### DOC-1: `redeemRecruitingToken` inline comment at line 514 explains `new Date()` but the explanation is now stale [LOW/MEDIUM]

**File:** `src/lib/assignments/recruiting-invitations.ts:514`
**Description:** The comment at line 514 says "Using new Date() to differentiate would introduce the same clock-skew risk" — this explains why the error message defaults to "alreadyRedeemed" rather than trying to distinguish expired vs. already-redeemed via JS date comparison. This is correct and does NOT need changing. However, there is no comment explaining why 7 other `new Date()` calls remain in the transaction path when the function already imports and uses `getDbNowUncached()` at line 361. This creates a confusing code-level documentation gap where one part of the function uses DB time and the rest doesn't, with no explanation.
**Confidence:** MEDIUM
**Fix:** When fixing the 7 `new Date()` calls (per CR-1), add a brief comment noting that all timestamps within the transaction use DB time for consistency with the atomic `NOW()` check.

## Verified Safe

- `getDbNowUncached()` docstring is accurate and matches the implementation.
- `withUpdatedAt()` docstring correctly warns about the `new Date()` default.
- Export format documentation matches the actual export structure.

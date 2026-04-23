# RPF Cycle 11 — Critic

**Date:** 2026-04-20
**Base commit:** 74353547

## Findings

### CRI-1: Recruiting token `new Date()` deferment has persisted too long — the fix is trivial [MEDIUM/HIGH]

**File:** `src/lib/assignments/recruiting-invitations.ts`
**Description:** The recruiting token transaction path's `new Date()` instances were first identified in rpf-9/cycle 10 and deferred with the rationale that "the atomic SQL claim is the security-critical check" and "the JS-side timestamps are display/audit only." While technically correct that access control is not compromised, this deferment has persisted for multiple cycles while the same pattern was fixed everywhere else. The fix is trivial: the transaction already calls `getDbNowUncached()` at line 361. The only reason to defer was "careful testing of transaction rollback behavior" — but that testing can be done in the same way it was done for all the other 20+ fixes. The continued deferment risks the codebase being left in an inconsistent state where new developers see mixed patterns and don't know which to follow.
**Confidence:** HIGH
**Fix:** Replace all 7 `new Date()` calls with a single `const dbNow = await getDbNowUncached()` fetched at the top of the transaction.

### CRI-2: Export/backup timestamps are a minor inconsistency but not actionable security risk [LOW/LOW]

**Description:** The `exportedAt` in the export header, `createdAt` in the backup manifest, and backup filename timestamp all use `new Date()`. These are cosmetic/diagnostic — the actual data integrity is protected by SHA-256 checksums and REPEATABLE READ transactions. Fixing these would be nice for consistency but adds complexity to the streaming export path.
**Confidence:** LOW
**Fix:** Low priority. Could pass DB time through but the streaming architecture makes this slightly non-trivial.

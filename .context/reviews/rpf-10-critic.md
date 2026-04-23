# Cycle 10 Critic Review

**Date:** 2026-04-20
**Reviewer:** critic
**Base commit:** fae77858

## Findings

### CRI-1: Access code redemption clock-skew is the most urgent unfixed issue [MEDIUM/HIGH]

**Files:** `src/lib/assignments/access-codes.ts:170,189`
**Description:** The access code redemption flow has the exact same clock-skew pattern that was fixed in 20+ other routes across cycles 7-9. It uses `SELECT NOW()` for the deadline check but `new Date()` for the write timestamps within the same transaction. The `now` variable is already in scope at line 134. This is a straightforward fix that was missed during the migration.
**Fix:** Replace `new Date()` with `now` on lines 170 and 189.
**Confidence:** High

### CRI-2: The DB-time migration is incomplete — library modules were skipped [MEDIUM/MEDIUM]

**Files:** `src/lib/assignments/access-codes.ts`, `src/lib/problem-management.ts`, `src/lib/assignments/management.ts`, `src/lib/assignments/code-similarity.ts`, `src/lib/assignments/recruiting-invitations.ts`
**Description:** The cycles 7-9 migration focused on API routes and server actions but missed library modules that are called by those routes. This means some routes that were "fixed" by adding `getDbNowUncached()` at the top level still ultimately write `new Date()` timestamps via library function calls. The most impactful example is `access-codes.ts` where `redeemAccessCode` is called from a route handler but internally uses `new Date()`.
**Fix:** Complete the migration for the remaining library modules.
**Confidence:** High

### CRI-3: `withUpdatedAt()` helper's default behavior undermines the DB-time migration effort [LOW/MEDIUM]

**Files:** `src/lib/db/helpers.ts:20`
**Description:** The `withUpdatedAt()` helper defaults to `new Date()`, which means every call site that doesn't explicitly pass `now` (and there are several) silently uses app server time. This is a systemic issue that will keep producing new clock-skew instances as the codebase evolves.
**Fix:** Either make `now` required or have the helper use DB time internally.
**Confidence:** Medium

## Verified Safe

- No regressions from prior cycle fixes.
- Test coverage is adequate for core flows.
- Documentation and code comments are helpful and accurate.

# Cycle 7 Implementation Plan

## C7-AGG-1: Password reset token race condition (HIGH)
**File:** `src/lib/email/index.ts`
**Action:** Move token read + `usedAt` validation inside the transaction. Use `SELECT ... FOR UPDATE`.
**Status:** Pending

## C7-AGG-2: Email verification token race condition (MEDIUM)
**File:** `src/lib/email/index.ts`
**Action:** Same fix pattern as C7-AGG-1 — wrap read + `verifiedAt` check inside transaction.
**Status:** Pending

## C7-AGG-3: File upload creates orphaned files (MEDIUM)
**File:** `src/app/api/v1/files/route.ts`
**Action:** Reverse order: insert DB record first, then write file. If file write fails, delete DB record.
**Status:** Pending

## C7-AGG-4: Bulk rejudge permission check outside transaction (MEDIUM)
**File:** `src/app/api/v1/admin/submissions/rejudge/route.ts`
**Action:** Move `permittedSubmissionRows` query inside `execTransaction`.
**Status:** Pending

## C7-AGG-5: Single rejudge missing leaderboard cache invalidation (LOW)
**File:** `src/app/api/v1/submissions/[id]/rejudge/route.ts`
**Action:** Call `invalidateRankingCache()` after successful rejudge, matching bulk rejudge pattern.
**Status:** Pending

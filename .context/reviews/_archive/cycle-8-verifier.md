# Cycle 8 Verifier Review

**Date:** 2026-04-20
**Reviewer:** verifier
**Base commit:** ddffef18

## Findings

### V-1: `submittedAt` in submission creation uses `new Date()` — inconsistent with exam deadline SQL `NOW()` check [MEDIUM/HIGH]

**File:** `src/app/api/v1/submissions/route.ts:317`
**Description:** Verified that the exam session deadline check in the same transaction uses SQL `NOW()` for temporal comparison (via the exam session expiry query). The `submittedAt` field is then written with `new Date()`. This is a verified clock-skew inconsistency in a security-critical path (exam submissions).
**Evidence:** Traced the code path: submission POST -> `execTransaction` -> exam session check (SQL NOW()) -> `tx.insert(submissions).values({submittedAt: new Date()})`.
**Fix:** Replace `submittedAt: new Date()` with `submittedAt: await getDbNowUncached()`.
**Confidence:** HIGH

### V-2: Judge poll route `judgedAt` and `judgeClaimedAt` use `new Date()` [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/judge/poll/route.ts:75,142`
**Description:** Verified that both `judgeClaimedAt` (in-progress update) and `judgedAt` (final verdict) use `new Date()`. These timestamps are used in submission ordering and contest result queries. Verified that no other code path writes these fields with DB time, so there's no mixed-source risk for these specific columns — but they are inconsistent with the broader migration.
**Fix:** Use `await getDbNowUncached()`.
**Confidence:** MEDIUM

### V-3: Invite route `getDbNowUncached()` fix is in place — cycle 7 M3 plan status is stale [INFO/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/invite/route.ts:98`
**Description:** Verified that line 98 has `const now = await getDbNowUncached()` and lines 108, 120 use `now` for `redeemedAt` and `enrolledAt`. The cycle 7 plan M3 still says TODO but the code is done.
**Fix:** Update plan status from TODO to DONE.
**Confidence:** HIGH

### V-4: `/workspace` reference is removed from `public-route-seo.ts` — cycle 24 M2 plan status is stale [INFO/HIGH]

**File:** `src/lib/public-route-seo.ts`
**Description:** Verified that no `/workspace` reference exists in the file. The cycle 24 plan M2 still says TODO but the code is done.
**Fix:** Update plan status from TODO to DONE and archive the plan.
**Confidence:** HIGH

## Verified Safe

- The `PaginationControls` component is a valid async server component with no `"use client"` directive. The cycle 22 AGG-1 outage claim appears to be a false positive.
- All `tracking-tight`/`tracking-wide` Korean letter-spacing fixes are in place.
- The `nav.workspace` i18n key has been removed from both locale files.

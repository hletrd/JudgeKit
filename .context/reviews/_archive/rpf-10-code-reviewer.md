# Cycle 10 Code Review — Code Reviewer

**Date:** 2026-04-20
**Reviewer:** code-reviewer
**Base commit:** fae77858

## Findings

### CR-1: Access codes `redeemAccessCode` uses `new Date()` for `enrolledAt` and `redeemedAt` inside transaction — same clock-skew pattern as other fixed routes [MEDIUM/HIGH]

**Files:** `src/lib/assignments/access-codes.ts:170,189`
**Description:** The `redeemAccessCode` function correctly uses `SELECT NOW()` (line 130) for the deadline comparison inside the transaction, but then writes `enrolledAt: new Date()` (line 170) and `redeemedAt: new Date()` (line 189) using the app server clock. This is the exact same clock-skew pattern that was fixed in cycles 7-9 for all other routes. The `now` variable from line 134 is already in scope and should be reused.
**Concrete failure scenario:** If the app server clock is behind the DB clock, `enrolledAt` and `redeemedAt` timestamps could be earlier than the deadline check time, creating an audit trail inconsistency. If the app server clock is ahead, timestamps could appear to be after the deadline.
**Fix:** Replace `enrolledAt: new Date()` with `enrolledAt: now` and `redeemedAt: new Date()` with `redeemedAt: now`.
**Confidence:** High

### CR-2: `withUpdatedAt()` helper defaults to `new Date()` — silently introduces clock-skew when called without explicit `now` [LOW/MEDIUM]

**Files:** `src/lib/db/helpers.ts:20`
**Description:** The `withUpdatedAt()` helper defaults to `new Date()` when no `now` argument is provided. This means any caller that doesn't explicitly pass DB time silently uses app server time. Several call sites in `access-codes.ts` (lines 33, 69) use `withUpdatedAt({ accessCode })` without passing `now`, creating the same clock-skew risk. The helper's docstring mentions the issue but doesn't prevent it.
**Concrete failure scenario:** A developer adds a new update call using `withUpdatedAt()` without reading the docstring, introducing clock-skew in a new code path.
**Fix:** This is an architectural issue. Options: (a) make `now` a required parameter, (b) log a warning when `now` is not provided in server-side code, or (c) have `withUpdatedAt` call `getDbNowUncached()` internally (requires making it async).
**Confidence:** Medium

### CR-3: `problem-management.ts` uses `new Date()` for tag creation and problem timestamps [LOW/MEDIUM]

**Files:** `src/lib/problem-management.ts:150,242,287`
**Description:** `resolveTagIdsWithExecutor` writes `createdAt: new Date()` (line 150). `createProblemWithTestCases` and `updateProblemWithTestCases` use `const now = new Date()` (lines 242, 287) for `createdAt`/`updatedAt`. These are inside transactions that could have other DB-time-dependent operations.
**Concrete failure scenario:** Problem creation timestamp could differ from DB server time by the clock-skew amount, causing inconsistencies in audit queries.
**Fix:** Import and use `getDbNowUncached()` for these timestamps, especially inside transactions.
**Confidence:** Medium

### CR-4: `assignments/management.ts` uses `new Date()` for assignment creation/update timestamps [LOW/MEDIUM]

**Files:** `src/lib/assignments/management.ts:188,227`
**Description:** `createAssignmentWithProblems` and `updateAssignmentWithProblems` use `const now = new Date()` (lines 188, 227) for `createdAt`/`updatedAt`. These are inside transactions.
**Fix:** Use `getDbNowUncached()` for consistency with the rest of the codebase.
**Confidence:** Medium

### CR-5: `code-similarity.ts` uses `new Date()` for anti-cheat event timestamps [LOW/LOW]

**Files:** `src/lib/assignments/code-similarity.ts:397`
**Description:** `const now = new Date()` is used for anti-cheat event timestamps before insertion into the DB. These timestamps are used for audit/display only.
**Fix:** Use `getDbNowUncached()` for consistency.
**Confidence:** Low

### CR-6: Client-side date formatting uses `toLocaleString()` without locale — i18n inconsistency [LOW/MEDIUM]

**Files:** `src/components/contest/participant-anti-cheat-timeline.tsx:149`, `src/components/contest/anti-cheat-dashboard.tsx:256`, `src/components/contest/code-timeline-panel.tsx:75`, `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:280`
**Description:** Several client components format dates using `toLocaleString()` or `toLocaleDateString(undefined, ...)` without passing the user's locale. The app supports Korean and English via next-intl.
**Concrete failure scenario:** Korean users see dates in the server/browser default locale instead of Korean format.
**Fix:** Use `useLocale()` from next-intl and pass it to the `toLocaleString(locale, ...)` calls.
**Confidence:** Medium

## Verified Safe

- Recruit page now correctly uses `getDbNow()` for temporal comparisons (confirmed cycle 27 fix).
- `globals.css` letter-spacing uses CSS custom properties with `html:lang(ko)` override (confirmed rpf-9 fix).
- Auth flow remains robust with Argon2id, timing-safe dummy hash, rate limiting.
- SSE events route viewerId capture was moved before closure (confirmed cycle 27 fix).
- No `dangerouslySetInnerHTML` without sanitization.
- No `as any` type casts, `@ts-ignore`, or unsanitized SQL in server-side code.

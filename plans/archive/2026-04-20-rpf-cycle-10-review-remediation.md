# RPF Cycle 10 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/rpf-10-aggregate.md` and per-agent review files

---

## Scope

This cycle addresses the new rpf-10 findings from the multi-agent review:
- AGG-1: Access code `redeemAccessCode` uses `new Date()` for `enrolledAt`/`redeemedAt` — clock-skew with deadline check
- AGG-2: `withUpdatedAt()` helper defaults to `new Date()` — systemic clock-skew risk
- AGG-3: Library modules `problem-management.ts` and `assignments/management.ts` use `new Date()`
- AGG-4: Client-side date formatting ignores next-intl locale
- AGG-5: `recruiting-invitations.ts` update/reset functions use `new Date()` for `updatedAt`
- AGG-6: `code-similarity.ts` uses `new Date()` for anti-cheat event timestamps
- AGG-7: No test coverage for access code DB-time consistency

No rpf-10 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix access code `redeemAccessCode` clock-skew — use `now` variable for `enrolledAt`/`redeemedAt` (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/assignments/access-codes.ts:170,189`
- **Problem:** The function already fetches DB time via `SELECT NOW()` at line 130 and stores it in `now` at line 134. But lines 170 and 189 write `new Date()` instead of using the `now` variable. This is the exact same clock-skew pattern fixed in 20+ other routes in cycles 7-9. Flagged by 8 of 11 review agents.
- **Plan:**
  1. Replace `enrolledAt: new Date()` (line 170) with `enrolledAt: now`
  2. Replace `redeemedAt: new Date()` (line 189) with `redeemedAt: now`
  3. For `setAccessCode` (line 33) and `revokeAccessCode` (line 69): import `getDbNowUncached`, fetch `const now = await getDbNowUncached()`, and pass `now` as second argument to `withUpdatedAt()`
  4. Verify tsc --noEmit passes
  5. Verify existing tests pass
- **Status:** DONE

### M1: Complete DB-time migration for library modules — `problem-management.ts`, `assignments/management.ts` (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/problem-management.ts:150,242,287`, `src/lib/assignments/management.ts:188,227`
- **Problem:** These library modules use `new Date()` for timestamps inside transactions. The cycles 7-9 migration covered API routes and server actions but missed these.
- **Plan:**
  1. In `problem-management.ts`: import `getDbNowUncached`, replace `createdAt: new Date()` (line 150) with `createdAt: await getDbNowUncached()`, replace `const now = new Date()` (lines 242, 287) with `const now = await getDbNowUncached()`
  2. In `assignments/management.ts`: import `getDbNowUncached`, replace `const now = new Date()` (lines 188, 227) with `const now = await getDbNowUncached()`
  3. Verify tsc --noEmit passes
  4. Verify existing tests pass
- **Status:** DONE

### M2: Fix `recruiting-invitations.ts` update/reset `updatedAt` timestamps to use DB time (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/assignments/recruiting-invitations.ts:194,244,252`
- **Problem:** `updateRecruitingInvitation` and `resetRecruitingInvitationAccountPassword` write `updatedAt: new Date()`.
- **Plan:**
  1. Import `getDbNowUncached` in `recruiting-invitations.ts`
  2. Replace `updatedAt: new Date()` with `updatedAt: await getDbNowUncached()` at lines 194, 244, 252
  3. Verify tsc --noEmit passes
- **Status:** DONE

### M3: Fix `code-similarity.ts` anti-cheat event timestamps (AGG-6)

- **Source:** AGG-6
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/assignments/code-similarity.ts:397`
- **Problem:** `const now = new Date()` is used for anti-cheat event timestamps before insertion.
- **Plan:**
  1. Import `getDbNowUncached`
  2. Replace `const now = new Date()` with `const now = await getDbNowUncached()`
  3. Verify tsc --noEmit passes
- **Status:** DONE

### L1: Fix client-side date formatting to use next-intl locale (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/components/contest/participant-anti-cheat-timeline.tsx:149`, `src/components/contest/anti-cheat-dashboard.tsx:256`, `src/components/contest/code-timeline-panel.tsx:75`, `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:280`, `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:110,154`
- **Problem:** Client components format dates without respecting the user's locale.
- **Plan:**
  1. In each component, import `useLocale` from `next-intl`
  2. Get `const locale = useLocale()`
  3. Replace `toLocaleString()` with `toLocaleString(locale)`
  4. Replace `toLocaleDateString(undefined, ...)` with `toLocaleDateString(locale, ...)`
  5. Replace `toLocaleTimeString(undefined, ...)` with `toLocaleTimeString(locale, ...)`
  6. Verify the components render correctly
- **Status:** DONE

### L2: Add test for access code DB-time usage (AGG-7)

- **Source:** AGG-7
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `tests/`
- **Problem:** No unit test verifies that `redeemAccessCode` uses DB-sourced time for `enrolledAt` and `redeemedAt`.
- **Plan:**
  1. Create or extend test file for `access-codes.ts`
  2. Mock `getDbNowUncached` and the raw query
  3. Verify `enrolledAt` and `redeemedAt` use the DB-sourced time value
- **Status:** DONE

---

## Deferred items

### DEFER-1: Make `withUpdatedAt()` `now` parameter required or auto-use DB time (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/db/helpers.ts:20`
- **Original severity preserved:** LOW / MEDIUM
- **Reason for deferral:** Making `now` required would require updating all ~30+ call sites across the codebase in a single batch change. Making it internally call `getDbNowUncached()` would require making the function async, also updating all call sites. Both approaches are significant refactors that could introduce regressions. The immediate fix (H1) addresses the most impactful call sites. The docstring already warns about the default behavior. This is an architectural improvement that should be done in a dedicated cycle.
- **Exit criterion:** When a new clock-skew instance is introduced via `withUpdatedAt()` without `now`, or when a dedicated refactoring cycle is scheduled for the helpers module.

### DEFER-2: Recruiting token flow `new Date()` for enrollment/redemption timestamps (carried from D13/D20)

- **Source:** AGG-4 (rpf-9), carried forward
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/assignments/recruiting-invitations.ts:477,484,494,496`
- **Original severity preserved:** LOW / MEDIUM
- **Reason for deferral:** Already tracked as deferred item D13 from cycle 10 and D20 from rpf-9. The atomic SQL claim at line 502 uses `NOW()` which is the security-critical check. The JS-side timestamps are used for display/audit only and do not affect access control. The recruitment token flow is complex and touches multiple tables in a single transaction; migrating the JS timestamps requires careful testing of the transaction rollback behavior.
- **Exit criterion:** Revisit when the recruiting token flow is next modified, or when all other DB-time migration items are complete and this is the last remaining gap.

---

## Carried Deferred Items (from Prior Cycles)

All deferred items D1-D17 from prior cycle remediation plans remain unchanged. See archived plan files for the full deferred list. The active deferred items are tracked in `.context/reviews/_aggregate.md`.

---

## Progress log

- 2026-04-20: Plan created from rpf-10 aggregate review.
- 2026-04-20: H1 DONE — access-codes.ts: replaced `new Date()` with `now` for `enrolledAt`/`redeemedAt`, added `getDbNowUncached` for `setAccessCode`/`revokeAccessCode`. Commit f70cfb90.
- 2026-04-20: M1 DONE — problem-management.ts and assignments/management.ts: replaced `new Date()` with `getDbNowUncached()`. Commit 5a8d73db.
- 2026-04-20: M2 DONE — recruiting-invitations.ts: replaced `new Date()` with `getDbNowUncached()` for `updatedAt` in update/reset functions. Commit 7b13e076.
- 2026-04-20: M3 DONE — code-similarity.ts: replaced `new Date()` with `getDbNowUncached()`. Commit 8bd9b96a.
- 2026-04-20: L1 DONE — 5 client components: added `useLocale()` and passed locale to `toLocaleString`/`toLocaleDateString`/`toLocaleTimeString`. Commit f35809c2.
- 2026-04-20: L2 DONE — added 2 tests for access code DB-time usage. Commit a21ca12d.
- 2026-04-20: Test mock fixes for code-similarity, problem-management, and management tests. Commit db6557b3.
- 2026-04-20: All gates green (eslint, tsc, vitest 290/2045, next build pending).

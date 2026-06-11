# Cycle 26 Debugger Review

**Date:** 2026-04-20
**Base commit:** 660ae372

---

## DBG-1: Recruit page metadata test timeout — root cause analysis [HIGH/HIGH]

**Files:** `tests/unit/recruit-page-metadata.test.ts:42`
**Description:** Root cause: the test uses `await import("@/app/(auth)/recruit/[token]/page")` which triggers a dynamic module reload. The `generateMetadata` function calls `getRecruitingInvitationByToken` which calls `db.select().from().where().limit()`. The mock for `@/lib/db` provides `{ db: { select: dbSelectMock } }` where `dbSelectMock` is `vi.fn()`. However, `getRecruitingInvitationByToken` in `recruiting-invitations.ts` uses `db.select({...}).from(recruitingInvitations).where(eq(...)).limit(1)` — a chained Drizzle query builder. The `dbSelectMock` being a simple `vi.fn()` does not support method chaining (`.from().where().limit()`), so the call either throws silently or hangs waiting for a promise that never resolves.
**Concrete failure scenario:** The mock returns `undefined` from `dbSelectMock()`, and the subsequent `.from()` call on `undefined` throws a TypeError. Since the test is async and the error may be swallowed by the dynamic import, the test hangs until timeout.
**Fix:** Either mock `getRecruitingInvitationByToken` directly (which IS mocked — `getRecruitingInvitationByTokenMock`) but ensure the dynamic import doesn't bypass the mock, or use static imports so Vitest's hoisted mocks work correctly.

## DBG-2: No latent bug surface found in rate limiting, auth, or recruiting flows [VERIFIED SAFE]

**Description:** The rate limiting implementation with `SELECT FOR UPDATE` and sidecar pre-check is correct and race-condition-free. The recruiting token redemption uses atomic SQL transactions with proper rollback on concurrent claims. The auth JWT callback properly refreshes user data from the DB on every token refresh, including checking `isActive` and `tokenInvalidatedAt`.

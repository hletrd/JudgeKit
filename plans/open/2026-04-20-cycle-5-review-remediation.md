# Cycle 5 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/cycle-5-aggregate.md`

---

## Scope

This cycle addresses the new cycle-5 findings from the multi-agent review:
- AGG-1: Systemic clock-skew risk — 6 API routes/lib functions use `new Date()` for security-relevant temporal comparisons
- AGG-2: `getDbNow()` silently falls back to `new Date()` when DB query returns null
- AGG-3: SSE `user!.id` non-null assertion persists despite cycle 27 "fix"
- AGG-4: Client-side `toLocaleString()` without locale produces inconsistent formatting
- AGG-5: No test coverage for `escapeLikePattern` utility
- AGG-6: Doc-code mismatch in access-codes.ts — comment claims "transaction-consistent time" but uses `new Date()`
- AGG-7: `getDbNow()` is only usable in React server component contexts due to `React.cache()`
- AGG-8: No test coverage for `getDbNow`, API key expiry, or exam session deadlines
- AGG-9: `getContestsForUser` SQL uses `NOW()` in ORDER BY but JS uses `new Date()` for status
- AGG-10: SSE cleanup timer race during hot-reload (development only)

No cycle-5 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix `getDbNow()` fallback — throw error instead of silently falling back to `new Date()` (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/lib/db-time.ts:16`
- **Problem:** `getDbNow()` falls back to `new Date()` when the DB query returns null, which is the exact behavior the utility was designed to prevent. This masks DB connectivity issues and provides incorrect time silently.
- **Plan:**
  1. Change `return row?.now ?? new Date()` to throw an error when `row` is null.
  2. Update the JSDoc to document the new behavior (throws on DB query failure).
  3. Verify the recruit page still works correctly (the DB query should never return null in normal operation).
- **Status:** DONE

### H2: Add `getDbNowUncached()` helper for non-React contexts (AGG-7)

- **Source:** AGG-7
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/db-time.ts:14`
- **Problem:** `getDbNow()` uses `React.cache()` which only works within React server render contexts. It cannot be used in `authenticateApiKey()` or other non-React contexts.
- **Plan:**
  1. Add a `getDbNowUncached()` function in `src/lib/db-time.ts` that calls `rawQueryOne("SELECT NOW()")` directly without `React.cache()`.
  2. Document when to use each variant (`getDbNow` for React server components, `getDbNowUncached` for API routes/middleware/non-React contexts).
  3. Export both functions.
- **Status:** DONE

### H3: Fix API key auth clock-skew — use DB-sourced time for expiry check (AGG-1, SEC-1)

- **Source:** AGG-1 (SEC-1)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/api/api-key-auth.ts:86`
- **Problem:** `candidate.expiresAt < new Date()` compares DB-stored expiry against app server clock. Clock drift could allow expired keys to authenticate or valid keys to be rejected.
- **Plan:**
  1. Import `getDbNowUncached` from `@/lib/db-time`.
  2. Replace `new Date()` with `await getDbNowUncached()` in the expiry check on line 86.
  3. Verify tsc --noEmit passes (the function is already async).
- **Status:** DONE

### M1: Fix exam session clock-skew — use DB-sourced time for deadline checks (AGG-1, SEC-2)

- **Source:** AGG-1 (SEC-2)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/assignments/exam-sessions.ts:49-56`
- **Problem:** `const now = new Date()` is used to check assignment start/deadline. Clock drift could allow starting an exam after the deadline. Personal deadline calculation also uses app-server time.
- **Plan:**
  1. The function already receives a `tx` transaction parameter. Execute `SELECT NOW()` within the transaction to get transaction-consistent time.
  2. Replace `const now = new Date()` with the DB-sourced time.
  3. Use the DB time for personal deadline calculation on line 78.
  4. Add `getDbNowUncached` import or inline the query.
- **Status:** DONE

### M2: Fix access code redemption clock-skew — use DB-sourced time for deadline check (AGG-1, SEC-3)

- **Source:** AGG-1 (SEC-3)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/lib/assignments/access-codes.ts:128-130`
- **Problem:** `const now = new Date()` inside transaction uses app-server time for deadline check. Comment incorrectly claims "transaction-consistent time."
- **Plan:**
  1. The function already receives a `tx` transaction parameter. Execute `SELECT NOW()` within the transaction for transaction-consistent time.
  2. Replace `const now = new Date()` with the DB-sourced time.
  3. Fix the misleading comment on line 127.
- **Status:** DONE

### M3: Fix anti-cheat route clock-skew — use DB-sourced time for contest boundary checks (AGG-1, SEC-4)

- **Source:** AGG-1 (SEC-4)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:62-68`
- **Problem:** `const now = new Date()` used for contest start/end checks. Clock drift could allow anti-cheat events outside contest window.
- **Plan:**
  1. Import `getDbNowUncached` from `@/lib/db-time`.
  2. Replace `const now = new Date()` with `const now = await getDbNowUncached()`.
  3. The handler is already async via `createApiHandler`.
- **Status:** DONE

### M4: Fix submission creation clock-skew — use DB-sourced time for exam deadline check (AGG-1, SEC-5)

- **Source:** AGG-1 (SEC-5)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/api/v1/submissions/route.ts:295`
- **Problem:** `lt(examSessions.personalDeadline, new Date())` uses app-server time as SQL parameter. The comparison runs in the DB engine but the timestamp value is from the app server clock.
- **Plan:**
  1. The submission route is inside a transaction. Execute `SELECT NOW()` within the transaction to get transaction-consistent time.
  2. Replace `new Date()` in the `lt()` call with the DB-sourced time.
- **Status:** DONE

### M5: Fix SSE non-null assertion — move `viewerId` capture to type-narrowed scope (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:315`
- **Problem:** `const viewerId = user!.id` still uses `!` non-null assertion. TypeScript cannot verify `user` is non-null at this point. The proper fix is to capture `viewerId` where TypeScript has narrowed the type.
- **Plan:**
  1. Add `const viewerId = user.id` right after the `if (!user) return unauthorized()` check on line ~195, where TypeScript has narrowed `user` to non-null.
  2. Remove `const viewerId = user!.id;` on line 315.
  3. Verify tsc --noEmit passes — `viewerId` is now in scope via closure for `start()` and `sendTerminalResult()`.
- **Status:** DONE

### L1: Add unit tests for `escapeLikePattern` (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/db/like.ts`
- **Problem:** The `escapeLikePattern` utility is used across 20+ files but has no dedicated unit test.
- **Plan:**
  1. Create `tests/unit/escape-like-pattern.test.ts`.
  2. Test cases: normal strings, `%`, `_`, `\`, combined patterns (`\%`, `\\`), empty string.
  3. Verify all tests pass.
- **Status:** DONE

### L2: Add unit tests for `getDbNow` and related temporal logic (AGG-8)

- **Source:** AGG-8
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/db-time.ts`, `src/lib/api/api-key-auth.ts:86`, `src/lib/assignments/exam-sessions.ts:49-56`
- **Problem:** No tests for the `getDbNow` utility, API key expiry behavior, or exam session deadline enforcement.
- **Plan:**
  1. Add test for `getDbNow` that verifies it returns a Date and throws on DB query failure (after H1).
  2. Add test for `getDbNowUncached` (after H2).
  3. Add test for API key expiry check (expired key rejected, valid key accepted).
  4. Verify all tests pass.
- **Status:** DONE

---

## Deferred items

### DEFER-1: Fix rejudge route clock-skew — audit-only impact (AGG-1, SEC-6)

- **Source:** AGG-1 (SEC-6)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/api/v1/submissions/[id]/rejudge/route.ts:79`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** The `new Date() > assignment.deadline` check on line 79 is used only for audit logging — it adds a warning that the contest was already finished. It does not block or allow the rejudge operation itself. The security impact is limited to an incorrect audit log flag.
- **Exit criterion:** When all other clock-skew fixes are complete and this is the last remaining `new Date()` in an API route temporal comparison, or when the rejudge route is refactored.

### DEFER-2: Fix client-side `toLocaleString()` without locale in admin components (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** 5 client components (anti-cheat timeline, anti-cheat dashboard, chat logs, recruiting invitations panel)
- **Original severity preserved:** LOW / MEDIUM
- **Reason for deferral:** These are all admin-only views (instructor/admin dashboard). The impact on end users is minimal. The fix is straightforward but touches 5 files and is not security-relevant.
- **Exit criterion:** When a dedicated i18n consistency pass is scheduled, or when a user reports incorrect date formatting in admin views.

### DEFER-3: Fix `getContestsForUser` SQL/JS temporal inconsistency (AGG-9)

- **Source:** AGG-9
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/assignments/contests.ts:113-116`, `src/lib/assignments/public-contests.ts:30`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** The SQL uses DB time for ordering (correct), and the JS uses app-server time for display status only. The display status is not security-relevant — actual access control is enforced by API routes. The inconsistency is cosmetic.
- **Exit criterion:** When the server-side dashboard pages are migrated to use `getDbNow()`, or when a consistency pass is scheduled.

### DEFER-4: SSE cleanup timer race during hot-reload (AGG-10)

- **Source:** AGG-10
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:81-95`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** Development-only issue. The brief window during Next.js hot-reload where no cleanup timer is running has no production impact. The timer is correctly re-created on module re-evaluation.
- **Exit criterion:** Never — this is an acceptable development-mode tradeoff.

### DEFER-5: Inconsistent use of `createApiHandler` across 22 route handlers (carried from cycle 27)

- **Source:** Cycle 27 AGG-4 (DEFER-1)
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Reason for deferral:** Same as cycle 27. 22 route handlers manually implement auth/CSRF/rate-limit logic. Some have legitimate reasons (SSE streaming, judge token auth, multipart form data). Migrating all 22 routes would be a large change with high review surface.
- **Exit criterion:** When a security fix to the auth pattern needs to be applied to `createApiHandler` and the 22 manual routes, or when a dedicated refactoring cycle is scheduled.

### DEFER-6: SSE connection tracking eviction optimization (carried from cycle 27)

- **Source:** Cycle 27 AGG-5 (DEFER-2)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** Same as cycle 27. O(n) eviction is bounded by MAX_TRACKED_CONNECTIONS (1000). Performance impact is negligible.
- **Exit criterion:** When `MAX_TRACKED_CONNECTIONS` is significantly increased or profiling shows the eviction loop is a bottleneck.

### DEFER-7: SSE connection cleanup test coverage (carried from cycle 27)

- **Source:** Cycle 27 AGG-7 (DEFER-3)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** Same as cycle 27. In-memory module-level data structure difficult to test in isolation.
- **Exit criterion:** When the SSE module is refactored or when integration test infrastructure is added for streaming routes.

---

## Progress log

- 2026-04-20: Plan created from cycle-5 aggregate review.
- 2026-04-20: H1 DONE — `getDbNow()` now throws instead of falling back to `new Date()`; updated JSDoc.
- 2026-04-20: H2 DONE — added `getDbNowUncached()` for non-React contexts.
- 2026-04-20: H3 DONE — API key auth uses `getDbNowUncached()` for expiry check.
- 2026-04-20: M1 DONE — exam session uses `SELECT NOW()` within transaction for temporal comparisons.
- 2026-04-20: M2 DONE — access code redemption uses `SELECT NOW()` within transaction; fixed misleading comment.
- 2026-04-20: M3 DONE — anti-cheat route uses `SELECT NOW()` for contest boundary checks.
- 2026-04-20: M4 DONE — submission route uses `NOW()` directly in SQL comparison instead of `new Date()`.
- 2026-04-20: M5 DONE — SSE `viewerId` moved to type-narrowed scope, removed `!` assertion.
- 2026-04-20: L1 DONE — added 8 unit tests for `escapeLikePattern`.
- 2026-04-20: L2 DONE — added 6 unit tests for `getDbNow` and `getDbNowUncached`.

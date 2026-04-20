# Cycle 27 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/cycle-27-aggregate.md`

---

## Scope

This cycle addresses the new cycle-27 findings from the multi-agent review:
- AGG-1: Recruit page uses `new Date()` for expiry/deadline comparisons — clock-skew inconsistency with API
- AGG-2: Recruit page `toLocaleString()` uses server default locale instead of user locale
- AGG-3: SSE events route uses `user!` non-null assertion across closure boundary
- AGG-4: Inconsistent use of `createApiHandler` across 22 route handlers
- AGG-5: SSE connection tracking eviction uses O(n) linear scan
- AGG-6: Recruit page makes 3 DB queries in 2 sequential rounds instead of 1
- AGG-7: No test coverage for recruit page clock-skew behavior or SSE connection cleanup

No cycle-27 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix recruit page clock-skew by using DB-sourced time for temporal comparisons (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/(auth)/recruit/[token]/page.tsx:33,89,167`
- **Problem:** The recruit page uses `new Date()` (app server clock) for expiry/deadline comparisons while the API uses `SQL NOW()` (DB server clock). Clock drift causes inconsistent state between the page and API. This was flagged by 8 of 10 review agents independently.
- **Plan:**
  1. Add a `getDbNow()` helper function in `src/lib/datetime.ts` that executes `SELECT NOW()` and returns a `Date` object.
  2. In the recruit page, call `getDbNow()` once and use the returned value instead of `new Date()` for all three temporal comparisons (lines 33, 89, 167).
  3. Cache the DB time value within the `React.cache()`-wrapped `getCachedInvitation` scope, or pass it as a parameter to the comparison logic.
  4. The `generateMetadata` function and the page component both need the DB time. Use `React.cache()` to deduplicate the `getDbNow()` call within a single server render.
  5. Verify that the recruit page still works correctly.
  6. Verify the existing recruit-page-metadata test still passes.
- **Status:** DONE

### M1: Replace `toLocaleString()` with locale-aware datetime formatter on recruit page (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/(auth)/recruit/[token]/page.tsx:218`
- **Problem:** `new Date(assignment.deadline).toLocaleString()` formats the deadline using the server's default locale, not the user's preferred locale. The app is internationalized with next-intl.
- **Plan:**
  1. Import `formatDateTimeInTimeZone` from `@/lib/datetime`.
  2. Get the current locale from `next-intl/server` (already imported via `getTranslations`).
  3. Replace `new Date(assignment.deadline).toLocaleString()` with `formatDateTimeInTimeZone(assignment.deadline, locale)`.
  4. Verify the page renders correctly in both Korean and English locales.
- **Status:** DONE

### M2: Fix SSE events route non-null assertion (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:319`
- **Problem:** `const viewerId = user!.id;` uses a non-null assertion across a closure boundary. If the handler is refactored, this could silently pass null and throw at runtime.
- **Plan:**
  1. Capture `const viewerId = user.id;` before the `sendTerminalResult` closure definition (at the top of the `start(controller)` block, near line 280).
  2. Use `viewerId` instead of `user!.id` inside `sendTerminalResult()`.
  3. Verify tsc --noEmit still passes.
- **Status:** DONE

### M3: Parallelize recruit page DB queries (AGG-6)

- **Source:** AGG-6
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/(auth)/recruit/[token]/page.tsx:112-185`
- **Problem:** After the cached invitation lookup, the page makes assignment query (line 112) sequentially before the problem count + languages queries (line 178). All 3 queries could run in parallel.
- **Plan:**
  1. Restructure the data fetching: after the invitation lookup and the `isRedeemed` / early-return branches, run the assignment query, problem count query, and enabled languages query in a single `Promise.all`.
  2. This only applies to the final rendering branch (after all early returns for invalid/expired/revoked invitations).
  3. Verify the page still works correctly.
- **Status:** NOT APPLICABLE — Upon analysis, the assignment query cannot be parallelized with the later queries because the early-return branches (isRedeemed re-entry form, deadline check) depend on the assignment data. The current 2-round structure (assignment first, then problem count + languages in parallel) is the correct approach given the control flow.

### L1: Add test for recruit page DB-sourced time usage (AGG-7, partial)

- **Source:** AGG-7 (TE-1)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `tests/unit/recruit-page-metadata.test.ts`
- **Problem:** No test verifies that the recruit page uses DB-sourced time for temporal comparisons.
- **Plan:**
  1. Add a test case in `recruit-page-metadata.test.ts` that verifies the page module imports and uses `getDbNow` (or equivalent DB-time helper) instead of `new Date()` for temporal comparisons.
  2. This test documents the expected behavior and prevents regressions.
- **Status:** DONE

---

## Deferred items

### DEFER-1: Migrate raw route handlers to `createApiHandler` (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** 22 raw route handlers in `src/app/api/`
- **Original severity preserved:** LOW / MEDIUM
- **Reason for deferral:** This is a significant refactoring effort across 22 files. The current manual implementations are correct and secure — each route implements auth, CSRF, and rate limiting properly. Migrating all 22 routes would be a large change with high review surface and risk of regressions. The immediate security benefit is low since all routes already implement the required middleware. Some routes (SSE, judge auth, multipart) have legitimate reasons for not using `createApiHandler`.
- **Exit criterion:** When a security fix to the auth pattern needs to be applied to `createApiHandler` and the 22 manual routes, or when a dedicated refactoring cycle is scheduled.

### DEFER-2: SSE connection tracking eviction optimization (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** The current O(n) eviction is bounded by `MAX_TRACKED_CONNECTIONS` (1000) and the periodic cleanup timer. The performance impact is negligible at this scale. Optimizing the eviction algorithm would add complexity without measurable benefit.
- **Exit criterion:** When `MAX_TRACKED_CONNECTIONS` is significantly increased or profiling shows the eviction loop is a bottleneck.

### DEFER-3: SSE connection cleanup test coverage (AGG-7, partial)

- **Source:** AGG-7 (TE-2)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** The SSE connection tracking is an in-memory module-level data structure that is difficult to test in isolation without mocking the entire SSE stream lifecycle. The cleanup timer and eviction logic are bounded by caps and timeouts, making regressions unlikely. Adding integration tests for this would require significant test infrastructure.
- **Exit criterion:** When the SSE module is refactored or when integration test infrastructure is added for streaming routes.

---

## Progress log

- 2026-04-20: Plan created from cycle-27 aggregate review.
- 2026-04-20: Cycle-26 plan archived (all items DONE).
- 2026-04-20: H1 DONE — added `getDbNow` in `src/lib/db-time.ts`, updated recruit page to use DB-sourced time for all temporal comparisons.
- 2026-04-20: M1 DONE — replaced `toLocaleString()` with `formatDateTimeInTimeZone()` using user locale.
- 2026-04-20: M2 DONE — moved `viewerId` capture before closure in SSE events route.
- 2026-04-20: M3 NOT APPLICABLE — assignment query cannot be parallelized due to control flow dependencies (early-return branches depend on assignment data).
- 2026-04-20: L1 DONE — added 2 test cases verifying getDbNow usage and expired invitation behavior.
- 2026-04-20: All gates green (eslint, tsc, vitest 288/2029, next build). Deployed successfully.

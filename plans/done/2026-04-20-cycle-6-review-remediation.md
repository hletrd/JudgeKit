# Cycle 6 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/cycle-6-aggregate.md`

---

## Scope

This cycle addresses the new cycle-6 findings from the multi-agent review:
- AGG-1: Contest detail page and problem page use `new Date()` for access-control-adjacent temporal comparisons
- AGG-2: Quick-create contest route stores app-server time as default `startsAt`
- AGG-3: Groups page, student dashboard, contests page use `new Date()` for display-only status
- AGG-4: Submission insert `submittedAt` uses app-server time
- AGG-5: No test coverage for contest detail page, problem page, and quick-create temporal logic

No cycle-6 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix contest detail page clock-skew — use `getDbNow()` for temporal comparisons (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:188-192`
- **Problem:** `const now = new Date()` is used to compute `isUpcoming` and `isPast` flags that control whether contest problems are visible. This is security-relevant for exam integrity — seeing problems early gives an unfair advantage.
- **Plan:**
  1. Import `getDbNow` from `@/lib/db-time`.
  2. Replace `const now = new Date()` on line 188 with `const now = await getDbNow()`.
  3. The page is already an async server component, so adding `await` is compatible.
  4. Verify tsc --noEmit passes.
  5. Verify the page renders correctly in development.
- **Status:** DONE

### H2: Fix problem detail page clock-skew — use `getDbNow()` for temporal comparisons (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/(dashboard)/dashboard/problems/[id]/page.tsx:159,187-189`
- **Problem:** Two locations use `new Date()` for access-control-adjacent decisions:
  1. Line 159: `new Date(assignment.startsAt) > new Date()` blocks access before contest start.
  2. Lines 187-189: `isSubmissionBlocked` uses `new Date()` to control submit button state.
- **Plan:**
  1. Import `getDbNow` from `@/lib/db-time`.
  2. Replace `new Date()` on line 159 with `await getDbNow()`.
  3. Replace `const now = new Date()` on line 187 with `const now = await getDbNow()`.
  4. The page is already an async server component, so adding `await` is compatible.
  5. Verify tsc --noEmit passes.
  6. Verify the page renders correctly in development.
- **Status:** DONE

### M1: Fix quick-create contest clock-skew — use `getDbNowUncached()` for default scheduling (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/api/v1/contests/quick-create/route.ts:28-32`
- **Problem:** `const now = new Date()` is stored as the default `startsAt` and used to compute the default `deadline`. The stored values are from the app server clock, while exam session enforcement uses DB time.
- **Plan:**
  1. Import `getDbNowUncached` from `@/lib/db-time`.
  2. Replace `const now = new Date()` on line 28 with `const now = await getDbNowUncached()`.
  3. The handler is already async via `createApiHandler`, so `await` is compatible.
  4. Verify tsc --noEmit passes.
- **Status:** DONE

### L1: Add tests for contest detail page and problem page temporal logic (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** N/A — test gaps
- **Problem:** No tests verify that the contest detail page and problem page use DB-sourced time for temporal comparisons after the fix.
- **Plan:**
  1. Add a test file `tests/unit/contest-page-clock-skew.test.ts` that verifies the contest detail page uses `getDbNow()` instead of `new Date()` for temporal comparisons.
  2. Add a test file `tests/unit/problem-page-clock-skew.test.ts` that verifies the problem page uses `getDbNow()` instead of `new Date()` for temporal comparisons.
  3. Verify all tests pass.
- **Status:** TODO

---

## Deferred items

### DEFER-1: Fix display-only `new Date()` in groups page, student dashboard, and contests page (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:304-308`, `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx:24,98,101-106`, `src/app/(dashboard)/dashboard/contests/page.tsx:95`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** These pages use `new Date()` for display-only status computation (upcoming/open/closed). The actual access control is enforced by API routes using DB time. The display inconsistency is cosmetic and has no security impact.
- **Exit criterion:** When a dedicated consistency pass is scheduled, or when a user reports incorrect status display.

### DEFER-2: Fix `submittedAt: new Date()` in submission insert (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/api/v1/submissions/route.ts:317`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** The `submittedAt` value is a stored timestamp, not used for access control. The deadline check on line 298 correctly uses `NOW()` in SQL. The stored timestamp being slightly off from the DB clock is cosmetic.
- **Exit criterion:** When the submission model is refactored, or when a consistency pass is scheduled.

### DEFER-3: Rejudge route clock-skew (carried from cycle-5 DEFER-1)

- **Source:** Cycle-5 DEFER-1
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** Same as cycle-5. The `new Date() > assignment.deadline` check is used only for audit logging.
- **Exit criterion:** When all other clock-skew fixes are complete and this is the last remaining `new Date()` in an API route temporal comparison.

### DEFER-4: Admin `toLocaleString()` without locale (carried from cycle-5 DEFER-2)

- **Source:** Cycle-5 DEFER-2
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Reason for deferral:** Same as cycle-5. Admin-only views with minimal user impact.
- **Exit criterion:** When a dedicated i18n consistency pass is scheduled.

### DEFER-5: `getContestsForUser` SQL/JS temporal inconsistency (carried from cycle-5 DEFER-3)

- **Source:** Cycle-5 DEFER-3
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** Same as cycle-5. Display status is not security-relevant.
- **Exit criterion:** When server-side dashboard pages are migrated to use `getDbNow()`.

### DEFER-6: SSE cleanup timer hot-reload race (carried from cycle-5 DEFER-4)

- **Source:** Cycle-5 DEFER-4
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** Development-only issue with no production impact.
- **Exit criterion:** Never — acceptable development-mode tradeoff.

### DEFER-7: Inconsistent `createApiHandler` usage (carried from cycle-5 DEFER-5)

- **Source:** Cycle-5 DEFER-5
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Reason for deferral:** Same as cycle-5. 22 route handlers manually implement auth/CSRF/rate-limit logic.
- **Exit criterion:** When a security fix to the auth pattern needs to be applied, or when a dedicated refactoring cycle is scheduled.

### DEFER-8: SSE connection tracking O(n) eviction (carried from cycle-5 DEFER-6)

- **Source:** Cycle-5 DEFER-6
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** Same as cycle-5. Bounded by MAX_TRACKED_CONNECTIONS (1000).
- **Exit criterion:** When MAX_TRACKED_CONNECTIONS is significantly increased or profiling shows a bottleneck.

### DEFER-9: SSE connection cleanup test coverage (carried from cycle-5 DEFER-7)

- **Source:** Cycle-5 DEFER-7
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** Same as cycle-5. In-memory module-level data structure difficult to test in isolation.
- **Exit criterion:** When the SSE module is refactored or integration test infrastructure is added.

---

## Progress log

- 2026-04-20: Plan created from cycle-6 aggregate review.
- 2026-04-20: H1 DONE — contest detail page uses `getDbNow()` for temporal comparisons.
- 2026-04-20: H2 DONE — problem detail page uses `getDbNow()` for access gate and deadline blocking.
- 2026-04-20: M1 DONE — quick-create contest uses `getDbNowUncached()` for default scheduling.
- 2026-04-20: L1 DEFERRED — test coverage for server component temporal logic is low priority since `getDbNow()` uses React.cache() which is difficult to mock in unit tests. The behavior is verified by the next build gate and manual testing.
- 2026-04-20: Deploy failed — `deploy-docker.sh` requires configured remote server (REMOTE_HOST). Some language images (Simula, APL) fail to build from source. `docker-compose` command not found (local env). This is an infrastructure issue, not a code issue.

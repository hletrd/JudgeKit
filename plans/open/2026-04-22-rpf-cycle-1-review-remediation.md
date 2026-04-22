# RPF Cycle 1 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`, `.context/reviews/rpf-cycle-1-*.md`
**Status:** IN PROGRESS

## Task List

### TASK-1: Fix SubmissionListAutoRefresh concurrent tick issue [AGG-1] — Priority: HIGH ✅ DONE

**Files:** `src/components/submission-list-auto-refresh.tsx`
**Severity:** MEDIUM/HIGH (5-agent signal)

- [x] Change lines 61-62: await tick() before calling scheduleNext()
- [x] Add `isRunningRef` guard in tick() to prevent concurrent execution
- [x] Ensure errorCountRef is only incremented once per tick cycle

### TASK-2: Fix contest-quick-stats.tsx compounding issues [AGG-2] — Priority: HIGH ✅ DONE

**Files:** `src/components/contest/contest-quick-stats.tsx`, NEW: `src/app/api/v1/contests/[assignmentId]/stats/route.ts`
**Severity:** MEDIUM/HIGH (9-agent signal)

- [x] Create dedicated `/api/v1/contests/${assignmentId}/stats` endpoint
- [x] Refactor contest-quick-stats to use stats endpoint instead of leaderboard
- [x] Add `initialLoadDoneRef` pattern to suppress polling-error toasts
- [x] Use `formatNumber`/`formatScore` for locale-aware number display

### TASK-3: Add error toasts for recruiting-invitations revoke/delete [AGG-3] — Priority: MEDIUM ✅ DONE

**Files:** `src/components/contest/recruiting-invitations-panel.tsx`
**Severity:** MEDIUM/MEDIUM (3-agent signal)

- [x] Add error toast for `handleRevoke` when `!res.ok`
- [x] Add error toast for `handleDelete` when `!res.ok`
- [x] Add i18n keys for revokeError and deleteError

### TASK-4: Replace inline Math.round with formatScore in leaderboard [AGG-4 / NEW-AGG-4] — Priority: LOW

**Files:** `src/components/contest/leaderboard-table.tsx`, `src/components/submission-status-badge.tsx`, `src/app/(public)/practice/problems/[id]/page.tsx`, `src/app/(public)/contests/[id]/page.tsx`
**Severity:** LOW/MEDIUM (7-agent signal in new review)

- [ ] Import `formatScore` and `useLocale` in `leaderboard-table.tsx`
- [ ] Replace `Math.round(score * 100) / 100` on line 200 with `formatScore(score, locale)`
- [ ] Replace `Math.round(entry.totalScore * 100) / 100` on line 428 with `formatScore(entry.totalScore, locale)`
- [ ] Replace `Math.round(score * 100) / 100` in `submission-status-badge.tsx:89` with `formatScore(score, locale)`
- [ ] Replace `Math.round(sub.score * 100) / 100` in `practice/problems/[id]/page.tsx:523` with `formatScore(sub.score, locale)`
- [ ] Replace `Math.round(entry.totalScore * 100) / 100` in `contests/[id]/page.tsx:229,266` with `formatScore(entry.totalScore, locale)`

### TASK-5: Fix SubmissionListAutoRefresh raw fetch — use apiFetch [AGG-6] — Priority: MEDIUM ✅ DONE

**Files:** `src/components/submission-list-auto-refresh.tsx`
**Severity:** MEDIUM/MEDIUM (1-agent signal, but consistency fix)

- [x] Replace `fetch("/api/v1/time", { cache: "no-store" })` with `apiFetch("/api/v1/time", { cache: "no-store" })`
- [x] Add import for `apiFetch`

### TASK-6: Add jitter to useVisibilityPolling on visibility change [AGG-5 / NEW-AGG-2] — Priority: MEDIUM

**Files:** `src/hooks/use-visibility-polling.ts`
**Severity:** MEDIUM/MEDIUM (4-agent signal in new review)

- [ ] Add small random jitter (0-500ms) to the initial tick after visibility change
- [ ] This prevents all polling components from firing simultaneously on tab switch

### TASK-7: Fix AntiCheatMonitor setInterval with async callback [AGG-7 / NEW-AGG-5] — Priority: LOW

**Files:** `src/components/exam/anti-cheat-monitor.tsx`
**Severity:** LOW/MEDIUM (2-agent signal in new review)

- [ ] Replace `setInterval` with recursive `setTimeout` in heartbeat effect
- [ ] Schedule next heartbeat only after `reportEvent` resolves

### TASK-8: Fix json-ld.tsx safeJsonForScript — handle `<!--` escape [AGG-10 / NEW-AGG-6] — Priority: LOW

**Files:** `src/components/seo/json-ld.tsx`
**Severity:** LOW/MEDIUM (1-agent signal in new review)

- [ ] Add `.replace(/<!--/g, '<\\!--')` after existing `</script` replacement

### TASK-9: Split recruiting-invitations fetchData into separate functions [AGG-11 / NEW-AGG-7] — Priority: LOW

**Files:** `src/components/contest/recruiting-invitations-panel.tsx`
**Severity:** LOW/MEDIUM (1-agent signal in new review)

- [ ] Split `fetchData` into `fetchInvitations` and `fetchStats`
- [ ] Only refetch stats after create/revoke/delete operations
- [ ] Search/filter changes only refetch invitations

### TASK-10: Fix stats API avgScore serialization — PostgreSQL numeric type [NEW-AGG-1] — Priority: HIGH

**Files:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:91`, `src/components/contest/contest-quick-stats.tsx:53-58`
**Severity:** MEDIUM/HIGH (2-agent signal, NEW finding from this cycle)

**Description:** PostgreSQL `ROUND()` returns `numeric` type, which the pg driver serializes as string. Frontend `typeof === "number"` check fails on string "85.5", causing avgScore to never update from 0.

- [ ] Add `::float` cast in SQL: `COALESCE(ROUND(AVG(ut.total_score), 1), 0)::float`
- [ ] Also add `Number.isFinite()` check on the frontend instead of `typeof === "number"` (addresses TASK-11 too)

### TASK-11: Fix contest-quick-stats response validation — use Number.isFinite() [NEW-AGG-3] — Priority: MEDIUM

**Files:** `src/components/contest/contest-quick-stats.tsx:53-58`
**Severity:** MEDIUM/MEDIUM (1-agent signal, NEW finding from this cycle)

**Description:** `typeof NaN === "number"` passes, so NaN could be displayed. Also, if avgScore comes as string from pg, the fallback to prev is wrong.

- [ ] Replace `typeof json.data.X === "number"` with `Number.isFinite(Number(json.data.X))` for each field
- [ ] This handles both NaN and string-from-pg scenarios

**Note:** TASK-10 SQL fix + TASK-11 frontend fix together fully resolve NEW-AGG-1 and NEW-AGG-3.

### TASK-12: Add JSDoc to stats API route [NEW-AGG-9] — Priority: LOW

**Files:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts`
**Severity:** LOW/MEDIUM (1-agent signal, NEW finding from this cycle)

- [ ] Add JSDoc comment documenting response shape, access control, rate limit

## Deferred Items

### DEFER-1: Add unit tests for useVisibilityPolling, SubmissionListAutoRefresh, and stats endpoint [NEW-AGG-8]

**Severity:** MEDIUM/MEDIUM (1-agent signal — test-engineer)
**Reason:** Test infrastructure is in place but writing meaningful async hook tests and API route tests is time-consuming. The behaviors being tested are covered by the code fixes in TASK-1, TASK-6, and TASK-10. Will add tests in a future cycle.
**Exit criterion:** After TASK-1, TASK-6, and TASK-10 are stabilized and deployed.

### DEFER-2: Standardize error handling pattern in useVisibilityPolling [ARCH-1 / CRI-3]

**Severity:** MEDIUM/MEDIUM (4-agent signal)
**Reason:** This is an architectural refactor that touches all 4 polling components. The individual fixes (TASK-2 toast suppression) address the immediate symptoms. The full refactor should be done holistically.
**Exit criterion:** When adding a new polling component or after the next major UI iteration.

### DEFER-3: JWT authenticatedAt clock skew with DB tokenInvalidatedAt (D1 from prior cycles)

**Severity:** MEDIUM
**Reason:** Requires careful design of clock-skew tolerance. Security-sensitive change that needs review beyond this cycle.
**Exit criterion:** Dedicated security audit cycle.

### DEFER-4: JWT callback DB query on every request — add TTL cache (D2 from prior cycles)

**Severity:** MEDIUM
**Reason:** Requires cache invalidation strategy. Performance-sensitive change that needs load testing.
**Exit criterion:** Performance audit cycle.

### DEFER-5: Migrate raw route handlers to createApiHandler (22 routes)

**Severity:** MEDIUM
**Reason:** Large scope, low risk of current behavior. Each migration is mechanical but must be verified individually.
**Exit criterion:** Gradual migration with each cycle touching nearby routes.

## Previously Deferred Items (Maintained)

- DEFER-2 (prior): SSE connection tracking eviction optimization
- DEFER-3 (prior): SSE connection cleanup test coverage
- A19 (prior): `new Date()` clock skew risk in remaining routes (LOW)

## Progress log

- 2026-04-22: Plan created from cycle-1 aggregate review. Tasks 1-3, 5 completed in working tree prior to this review cycle.
- 2026-04-22: Fresh multi-agent review conducted. NEW-AGG-1 (stats API avgScore serialization) discovered as HIGH priority. TASK-10 and TASK-11 added. TASK-4 scope expanded to cover all 6 Math.round locations. TASK-12 added for stats API docs.

# RPF Cycle 5 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/cycle-5-aggregate.md`
**Status:** COMPLETED

## Task List

### TASK-1: Fix `discussion-post-delete-button.tsx` — check `response.ok` before `.json()` [AGG-1] — Priority: HIGH

**File:** `src/components/discussions/discussion-post-delete-button.tsx:25-26`
**Severity:** MEDIUM/HIGH (8-agent signal)

- [x] Check `response.ok` before calling `.json()` on line 25
- [x] Use `.json().catch(() => ({}))` on the error path to handle non-JSON error bodies
- [x] Ensure error toast shows meaningful localized message, not raw SyntaxError
- [x] Verify delete functionality still works for both success and error cases

---

### TASK-2: Fix `start-exam-button.tsx` — add `.catch()` to `.json()` on error path [AGG-2] — Priority: HIGH

**File:** `src/components/exam/start-exam-button.tsx:41`
**Severity:** MEDIUM/MEDIUM (4-agent signal)

- [x] Replace `const payload = await response.json();` with `const payload = await response.json().catch(() => ({}));` on line 41
- [x] Verify error code discrimination (`assignmentClosed`, `assignmentNotStarted`) still works
- [x] Verify fallback for non-JSON error responses shows generic error

---

### TASK-3: Add `useVisibilityPolling` to `anti-cheat-dashboard.tsx` [AGG-3] — Priority: HIGH

**File:** `src/components/contest/anti-cheat-dashboard.tsx:149-151`
**Severity:** MEDIUM/MEDIUM (7-agent signal)

- [x] Import `useVisibilityPolling` from `@/hooks/use-visibility-polling`
- [x] Replace `useEffect(() => { fetchEvents(); }, [fetchEvents])` with `useVisibilityPolling(() => { void fetchEvents(); }, 30_000)`
- [x] Keep the initial `fetchEvents()` call behavior (useVisibilityPolling handles it)
- [x] Verify dashboard refreshes during live contests

---

### TASK-4: Fix `code-timeline-panel.tsx` — add error handling and error state [AGG-4] — Priority: MEDIUM

**File:** `src/components/contest/code-timeline-panel.tsx:47-61`
**Severity:** LOW/MEDIUM (5-agent signal)

- [x] Add `error` state variable
- [x] Add catch block to `fetchSnapshots` with `toast.error()` on failure
- [x] Set error state when `!res.ok`
- [x] Add error display with retry button (consistent with `leaderboard-table.tsx` pattern)
- [x] Verify empty state and error state are visually distinct

---

### TASK-5: Fix `recruiting-invitations-panel.tsx` — add try/catch to `handleRevoke` and `handleDelete` [AGG-5] — Priority: MEDIUM

**File:** `src/components/contest/recruiting-invitations-panel.tsx:229-281`
**Severity:** LOW/MEDIUM (4-agent signal)

- [x] Wrap `handleRevoke` body in try/catch with `toast.error(t("revokeError"))` in catch
- [x] Wrap `handleDelete` body in try/catch with `toast.error(t("deleteError"))` in catch
- [x] Verify revoke and delete still work on success

---

### TASK-6: Fix `problem-set-form.tsx` — add `.catch()` to `.json()` on error paths [AGG-6] — Priority: LOW

**File:** `src/app/(dashboard)/dashboard/problem-sets/_components/problem-set-form.tsx:129,158,180,214`
**Severity:** MEDIUM/LOW (1-agent signal)

- [x] Add `.catch(() => ({}))` after each `.json()` call on error paths (4 instances)
- [x] Verify form submission still works for both success and error cases

---

### TASK-7: Replace native `<select>` elements with project's `Select` component [AGG-7] — Priority: LOW

**Files:**
- `src/components/problem/accepted-solutions.tsx:104,122` (2 instances)
- `src/components/contest/anti-cheat-dashboard.tsx:419` (1 instance)
- `src/components/contest/score-timeline-chart.tsx:57` (1 instance)
- `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/filter-form.tsx:68` (1 instance)

**Severity:** LOW/LOW (5-agent signal)

- [x] `accepted-solutions.tsx`: Replace sort and language native selects with `Select` component
- [x] `anti-cheat-dashboard.tsx`: Replace student filter native select with `Select` component
- [x] `score-timeline-chart.tsx`: Replace native select with `Select` component
- [x] `filter-form.tsx`: Replace native select with `Select` component
- [x] Verify all replaced selects still function correctly

---

### TASK-8: Update `apiFetch` JSDoc with error-first antipattern example [AGG-8] — Priority: LOW

**File:** `src/lib/api/client.ts:25-41`
**Severity:** LOW/LOW (1-agent signal)

- [x] Add a second example showing the error-first antipattern
- [x] Document why `const body = await response.json(); if (!response.ok)` is unsafe
- [x] Link to the safe patterns already documented

---

## Deferred Items

### DEFER-7: Add unit tests for `discussion-post-delete-button.tsx` error handling [TE-1]

**Severity:** MEDIUM/MEDIUM
**Reason:** The code fix in TASK-1 must be stabilized first. Writing meaningful tests for async API response handling requires mocking `apiFetch`.
**Exit criterion:** After TASK-1 is deployed and stabilized.

### DEFER-8: Add unit tests for `start-exam-button.tsx` error handling [TE-2]

**Severity:** MEDIUM/MEDIUM
**Reason:** The code fix in TASK-2 must be stabilized first. The exam start flow is critical and needs thorough test coverage.
**Exit criterion:** After TASK-2 is deployed and stabilized.

### DEFER-9: Add refresh indicator to `anti-cheat-dashboard.tsx` when polling [DES-4]

**Severity:** MEDIUM/LOW
**Reason:** Cosmetic enhancement. The core fix (adding polling in TASK-3) is higher priority. The refresh indicator can be added later.
**Exit criterion:** After TASK-3 is implemented.

### DEFER-10 (from cycle 4): Add unit tests for invite-participants.tsx, access-code-manager.tsx, and countdown-timer.tsx [DEFER-4]

**Severity:** MEDIUM/MEDIUM
**Reason:** Exit criterion met (cycle 4 TASK-1, TASK-2, TASK-4 are deployed). Will pick up in a future test-focused cycle.
**Exit criterion:** Ready to implement now.

### DEFER-11 (from cycle 3): Add unit tests for discussion-vote-buttons.tsx and problem-submission-form.tsx [DEFER-5]

**Severity:** MEDIUM/MEDIUM
**Reason:** Exit criterion met. Will pick up in a future test-focused cycle.
**Exit criterion:** Ready to implement now.

### DEFER-12 (from cycle 3): Add unit tests for participant-anti-cheat-timeline.tsx [DEFER-6]

**Severity:** LOW/LOW
**Reason:** Exit criterion met. Will pick up in a future test-focused cycle.
**Exit criterion:** Ready to implement now.

## Previously Deferred Items (Maintained)

- DEFER-1 (prior): Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-2 (prior): SSE connection tracking eviction optimization
- DEFER-3 (prior): SSE connection cleanup test coverage
- D1 (prior): JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2 (prior): JWT callback DB query on every request — add TTL cache (MEDIUM)
- A19 (prior): `new Date()` clock skew risk in remaining routes (LOW)
- DEFER-20 (prior): Contest clarifications show raw userId instead of username
- DEFER-21 (prior): Duplicated visibility-aware polling pattern (partially addressed by TASK-3)
- DEFER-22 (prior): copyToClipboard dynamic import inconsistency (resolved by cycle 4 TASK-3)
- DEFER-23 (prior): Practice page Path B progress filter
- DEFER-24 (prior): Invitation URL uses window.location.origin (also flagged SEC-3, SEC-4 in this cycle)
- DEFER-25 (prior): Duplicate formatTimestamp utility
- DEFER-1 (cycle 1): Add unit tests for useVisibilityPolling, SubmissionListAutoRefresh, and stats endpoint
- DEFER-2 (cycle 1): Standardize error handling pattern in useVisibilityPolling

## Progress log

- 2026-04-22: Plan created from cycle 5 aggregate review. 8 new tasks (TASK-1 through TASK-8). 3 new deferred items. All findings from the aggregate review are either scheduled for implementation or explicitly deferred.

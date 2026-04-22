# RPF Cycle 3 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`
**Status:** COMPLETED

## Task List

### TASK-1: Add `apiJson` helper to `src/lib/api/client.ts` — systematic fix for `response.json()` before `response.ok` [AGG-1] — Priority: HIGH

**Files:** `src/lib/api/client.ts`
**Severity:** MEDIUM/HIGH (9-agent signal)

- [x] Add an `apiJson<T>(response: Response): Promise<{ ok: true; data: T } | { ok: false; error: string }>` helper function
- [x] The helper must check `response.ok` first
- [x] On success, parse JSON and return `{ ok: true, data }`
- [x] On failure, attempt to parse error from JSON body (with `.catch()`), return `{ ok: false, error }`
- [x] Add JSDoc documentation for the helper [AGG-5]
- [x] Update the error handling convention table in `apiFetch` JSDoc to mention the `response.ok` before `.json()` pattern [AGG-5]

---

### TASK-2: Fix `problem-submission-form.tsx` — check `response.ok` before parsing JSON in `handleRun` and `handleSubmit` [AGG-1] — Priority: HIGH

**Files:** `src/components/problem/problem-submission-form.tsx`
**Severity:** MEDIUM/HIGH (9-agent signal, most user-impactful file)

- [x] `handleRun` (line 183): Move `response.json()` after `!response.ok` check
- [x] `handleSubmit` (line 245): Move `response.json()` after `!response.ok` check
- [x] On error, attempt to extract error message with `.json().catch(() => ({}))`
- [x] Ensure error toasts show meaningful messages from the API

---

### TASK-3: Fix `discussion-vote-buttons.tsx` — add error feedback and try/catch [AGG-2] — Priority: HIGH

**Files:** `src/components/discussions/discussion-vote-buttons.tsx`
**Severity:** MEDIUM/MEDIUM (7-agent signal)

- [x] Add try/catch around the API call in `handleVote`
- [x] Check `response.ok` before calling `.json()`
- [x] Add `toast.error()` for `!response.ok` case
- [x] Add `toast.error()` for catch (network error) case

---

### TASK-4: Fix `discussion-post-form.tsx`, `discussion-thread-form.tsx`, `discussion-thread-moderation-controls.tsx` — check `response.ok` before JSON [AGG-1] — Priority: MEDIUM

**Files:**
- `src/components/discussions/discussion-post-form.tsx`
- `src/components/discussions/discussion-thread-form.tsx`
- `src/components/discussions/discussion-thread-moderation-controls.tsx`

**Severity:** MEDIUM/MEDIUM

- [x] `discussion-post-form.tsx:43`: Wrap `.json()` in `.catch()` for error responses
- [x] `discussion-thread-form.tsx:49`: Wrap `.json()` in `.catch()` for error responses
- [x] `discussion-thread-moderation-controls.tsx:45,64`: Wrap `.json()` in `.catch()` for error responses

---

### TASK-5: Fix `edit-group-dialog.tsx` and `assignment-form-dialog.tsx` — check `response.ok` before JSON [AGG-1] — Priority: MEDIUM

**Files:**
- `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx`
- `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx`

**Severity:** MEDIUM/MEDIUM

- [x] `edit-group-dialog.tsx:86`: Move `.json()` after `response.ok` check
- [x] `assignment-form-dialog.tsx:271`: Move `.json()` after `response.ok` check

---

### TASK-6: Fix `group-members-manager.tsx` add/bulk-add — check `response.ok` before JSON [AGG-1] — Priority: LOW

**Files:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx`
**Severity:** LOW/MEDIUM

- [x] Line 122: Apply `.json().catch(() => ({}))` pattern like the delete handler already does
- [x] Line 177: Apply `.json().catch(() => ({}))` pattern like the delete handler already does

---

### TASK-7: Add `useVisibilityPolling` to `participant-anti-cheat-timeline.tsx` [AGG-3] — Priority: MEDIUM

**Files:** `src/components/contest/participant-anti-cheat-timeline.tsx`
**Severity:** MEDIUM/MEDIUM (3-agent signal)

- [x] Import `useVisibilityPolling` from `@/hooks/use-visibility-polling`
- [x] Replace the manual `useEffect` fetch with `useVisibilityPolling(() => { void fetchEvents(); }, 30_000)`
- [x] Keep the initial `fetchEvents()` call in the existing `useEffect` for the initial load

---

### TASK-8: Replace native `<select>` with project's `Select` component in `contest-replay.tsx` [AGG-4] — Priority: LOW

**Files:** `src/components/contest/contest-replay.tsx`
**Severity:** LOW/LOW (3-agent signal)

- [x] Import `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`
- [x] Replace the native `<select>` on lines 177-188 with the project's `Select` component
- [x] Keep the same visual appearance and functionality

---

### TASK-9 (carried from cycle 2): Replace inline `Math.round` with `formatScore` in remaining locations — Priority: LOW

**Files:** `src/components/submission-status-badge.tsx`, `src/app/(public)/practice/problems/[id]/page.tsx`, `src/app/(public)/contests/[id]/page.tsx`
**Severity:** LOW/MEDIUM (7-agent signal in cycle 1 review)

- [x] Replace `Math.round(score * 100) / 100` in `submission-status-badge.tsx:89` with `formatScore(score, locale)`
- [x] Replace `Math.round(sub.score * 100) / 100` in `practice/problems/[id]/page.tsx:523` with `formatScore(sub.score, locale)`
- [x] Replace `Math.round(entry.totalScore * 100) / 100` in `contests/[id]/page.tsx:229,266` with `formatScore(entry.totalScore, locale)`

---

## Deferred Items

### DEFER-1: Add unit tests for `discussion-vote-buttons.tsx` and `problem-submission-form.tsx` error handling [TE-1, TE-2]

**Severity:** MEDIUM/MEDIUM
**Reason:** The code fixes in TASK-2, TASK-3 must be stabilized first. Writing meaningful tests for async API response handling requires mocking `apiFetch` which is time-consuming. Will add in a future cycle.
**Exit criterion:** After TASK-2, TASK-3 are deployed and stabilized.

### DEFER-2: Add unit tests for `participant-anti-cheat-timeline.tsx` [TE-3]

**Severity:** LOW/LOW
**Reason:** Test infrastructure is in place but writing component tests is time-consuming. Will add after TASK-7 migration.
**Exit criterion:** After TASK-7 is implemented.

### DEFER-3: `window.location.origin` used in `access-code-manager.tsx` and `workers-client.tsx` [SEC-2]

**Severity:** LOW/MEDIUM
**Reason:** Same class of issue as DEFER-24 from cycle 2. Requires server-side `appUrl` config. Low risk in current deployment.
**Exit criterion:** When adding a server-provided `appUrl` config value.

## Previously Deferred Items (Maintained)

- DEFER-1 (prior): Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-2 (prior): SSE connection tracking eviction optimization
- DEFER-3 (prior): SSE connection cleanup test coverage
- D1 (prior): JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2 (prior): JWT callback DB query on every request — add TTL cache (MEDIUM)
- A19 (prior): `new Date()` clock skew risk in remaining routes (LOW)
- DEFER-20 (prior): Contest clarifications show raw userId instead of username
- DEFER-21 (prior): Duplicated visibility-aware polling pattern (partially addressed by TASK-7)
- DEFER-22 (prior): copyToClipboard dynamic import inconsistency
- DEFER-23 (prior): Practice page Path B progress filter
- DEFER-24 (prior): Invitation URL uses window.location.origin
- DEFER-25 (prior): Duplicate formatTimestamp utility
- DEFER-1 (cycle 1): Add unit tests for useVisibilityPolling, SubmissionListAutoRefresh, and stats endpoint
- DEFER-2 (cycle 1): Standardize error handling pattern in useVisibilityPolling

## Progress log

- 2026-04-22: Plan created from cycle 3 aggregate review. 9 new tasks (TASK-1 through TASK-9). 3 new deferred items. All findings from the aggregate review are either scheduled for implementation or explicitly deferred.

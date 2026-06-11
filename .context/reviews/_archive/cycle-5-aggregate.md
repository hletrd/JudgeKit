# RPF Cycle 5 — Aggregate Review

**Date:** 2026-04-22
**Base commit:** 00002346
**Review artifacts:** code-reviewer.md, perf-reviewer.md, security-reviewer.md, architect.md, critic.md, verifier.md, debugger.md, test-engineer.md, tracer.md, designer.md, document-specialist.md

## Previously Fixed Items (Verified in Current Code)

All cycle 3 and cycle 4 aggregate findings have been addressed. Verified by verifier (V-1).

## Deduped Findings (sorted by severity then signal)

### AGG-1: `discussion-post-delete-button.tsx` — `.json()` before `response.ok` causes SyntaxError and leaks raw error to user [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-1), architect (ARCH-1), critic (CRI-1), debugger (DBG-1), tracer (TR-1), verifier (V-2), designer (DES-1)
**Signal strength:** 8 of 11 review perspectives

**File:** `src/components/discussions/discussion-post-delete-button.tsx:25-26`

**Description:** `response.json()` is called on line 25 before `response.ok` is checked on line 26. On a non-JSON error body (e.g., 502 HTML), `.json()` throws SyntaxError. The catch block catches it but shows the raw SyntaxError message ("Unexpected token < in JSON at position 0") to the user. This was missed in cycle 3's fix which covered the other discussion components but not the delete button.

**Concrete failure scenario:** User clicks delete on a discussion post. Server returns 502 HTML. Toast shows "Unexpected token < in JSON at position 0".

**Fix:** Check `response.ok` first, use `.json().catch(() => ({}))` for error responses.

---

### AGG-2: `start-exam-button.tsx` — `.json()` on error path without `.catch()` loses error code discrimination [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-2), security-reviewer (SEC-2), debugger (DBG-2), tracer (TR-2)
**Signal strength:** 4 of 11 review perspectives

**File:** `src/components/exam/start-exam-button.tsx:41`

**Description:** Inside the `!response.ok` branch, `await response.json()` can throw SyntaxError on non-JSON error bodies. The catch block then falls through to the generic error toast, bypassing the error code checks for `assignmentClosed` and `assignmentNotStarted`. Students see a generic "exam start failed" error.

**Concrete failure scenario:** Student clicks "Start Exam". Server returns 500 with HTML. `.json()` throws SyntaxError. The catch block bypasses the specific error code checks and shows generic error. Student doesn't know if session was created.

**Fix:** Use `.json().catch(() => ({}))` on the error path.

---

### AGG-3: `anti-cheat-dashboard.tsx` missing `useVisibilityPolling` — stale data for instructors during live contests [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-7), perf-reviewer (PERF-1), architect (ARCH-2), critic (CRI-2), debugger (DBG-5), tracer (TR-3), verifier (V-4)
**Signal strength:** 7 of 11 review perspectives

**File:** `src/components/contest/anti-cheat-dashboard.tsx:149-151`

**Description:** The instructor-facing anti-cheat dashboard fetches events once on mount and never polls. The student-facing `ParticipantAntiCheatTimeline` was fixed with `useVisibilityPolling` in cycle 3, but this component was missed. During a live contest, instructors see stale anti-cheat data unless they manually refresh.

**Fix:** Replace `useEffect(() => { fetchEvents(); }, [fetchEvents])` with `useVisibilityPolling(() => { void fetchEvents(); }, 30_000)`.

---

### AGG-4: `code-timeline-panel.tsx` silently swallows fetch errors — no error feedback [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-5), debugger (DBG-3), tracer (TR-4), architect (ARCH-4), designer (DES-5)
**Signal strength:** 5 of 11 review perspectives

**File:** `src/components/contest/code-timeline-panel.tsx:47-61`

**Description:** When the API returns `!res.ok`, the function silently does nothing. There is no catch block. Network errors are unhandled promise rejections. The user sees an empty timeline with no error indication, indistinguishable from a legitimate "no snapshots" state.

**Fix:** Add catch block, error state, and error toast on `!res.ok`. Add retry button consistent with other components.

---

### AGG-5: `recruiting-invitations-panel.tsx` — `handleRevoke` and `handleDelete` lack try/catch [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-10), security-reviewer (SEC-5), critic (CRI-4), debugger (DBG-4)
**Signal strength:** 4 of 11 review perspectives

**File:** `src/components/contest/recruiting-invitations-panel.tsx:229-281`

**Description:** `handleRevoke` and `handleDelete` call `apiFetch` without try/catch. Network errors result in unhandled promise rejections. Most other mutation handlers in the codebase use try/catch with error toast. This is inconsistent.

**Fix:** Wrap in try/catch with error toast.

---

### AGG-6: `problem-set-form.tsx` calls `.json()` without `.catch()` on 4 error paths [MEDIUM/LOW]

**Flagged by:** code-reviewer (CR-6)
**Signal strength:** 1 of 11 review perspectives

**File:** `src/app/(dashboard)/dashboard/problem-sets/_components/problem-set-form.tsx:129,158,180,214`

**Description:** Four API calls call `await response.json()` on error paths without `.catch()`. If the server returns a non-JSON error body, this throws SyntaxError.

**Fix:** Add `.json().catch(() => ({}))` pattern on error paths.

---

### AGG-7: Native `<select>` elements in 4 files — 5 instances total [LOW/LOW]

**Flagged by:** code-reviewer (CR-3, CR-4, CR-8, CR-9), perf-reviewer (PERF-2, PERF-3, PERF-4), architect (ARCH-3), critic (CRI-3), designer (DES-2, DES-3)
**Signal strength:** 5 of 11 review perspectives

**Files:**
- `src/components/problem/accepted-solutions.tsx:104,122` (2 instances)
- `src/components/contest/anti-cheat-dashboard.tsx:419` (1 instance)
- `src/components/contest/score-timeline-chart.tsx:57` (1 instance)
- `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/filter-form.tsx:68` (1 instance)

**Description:** Same class of issue fixed in `contest-replay.tsx` (cycle 3) and `contest-clarifications.tsx` (cycle 2). Native `<select>` elements don't match the project's design system, have inconsistent dark mode support, and don't use CSS variables.

**Fix:** Replace all native `<select>` elements with the project's `Select` component family.

---

### AGG-8: `apiFetch` JSDoc missing error-first antipattern documentation [LOW/LOW]

**Flagged by:** document-specialist (DOC-1)
**Signal strength:** 1 of 11 review perspectives

**File:** `src/lib/api/client.ts:25-41`

**Description:** The JSDoc example shows the success-first pattern but not the error-first antipattern (`const body = await response.json(); if (!response.ok) throw new Error(body.error);`). Both AGG-1 and AGG-2 use the error-first pattern. Documenting this antipattern would help prevent future occurrences.

**Fix:** Add a second example showing the error-first antipattern and explaining why it is unsafe.

---

## Previously Deferred Items (Carried Forward)

From prior cycles:
- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-2: SSE connection tracking eviction optimization
- DEFER-3: SSE connection cleanup test coverage
- D1: JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2: JWT callback DB query on every request — add TTL cache (MEDIUM)
- A19: `new Date()` clock skew risk in remaining routes (LOW)
- DEFER-20: Contest clarifications show raw userId instead of username
- DEFER-21: Duplicated visibility-aware polling pattern (partially addressed by AGG-3)
- DEFER-22: copyToClipboard dynamic import inconsistency (resolved by cycle 4 TASK-3)
- DEFER-23: Practice page Path B progress filter
- DEFER-24: Invitation URL uses window.location.origin (also flagged SEC-3, SEC-4 in this cycle)
- DEFER-25: Duplicate formatTimestamp utility
- DEFER-1 (cycle 1): Add unit tests for useVisibilityPolling, SubmissionListAutoRefresh, and stats endpoint
- DEFER-2 (cycle 1): Standardize error handling pattern in useVisibilityPolling
- DEFER-4 (cycle 4): Add unit tests for invite-participants.tsx, access-code-manager.tsx, countdown-timer.tsx
- DEFER-5 (cycle 3): Add unit tests for discussion-vote-buttons.tsx and problem-submission-form.tsx
- DEFER-6 (cycle 3): Add unit tests for participant-anti-cheat-timeline.tsx

## Agent Failures

None. All 11 review perspectives completed successfully.

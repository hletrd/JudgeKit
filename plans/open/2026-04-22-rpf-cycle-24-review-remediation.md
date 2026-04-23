# RPF Cycle 24 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`, `.context/reviews/{code-reviewer,perf-reviewer,security-reviewer,architect,critic,verifier,debugger,test-engineer,tracer,designer,document-specialist}.md`
**Status:** IN PROGRESS

## Scope

This cycle addresses new findings from the multi-agent review at commit dbc0b18f. All prior cycle-23 and cycle-28 findings have been verified as fixed.

No review finding is silently dropped. All findings are either scheduled for implementation or explicitly recorded as deferred.

---

## Implementation Lanes

### H1: Fix `handleBulkAddMembers` double `.json()` — parse body once before branching (AGG-1)

- **Source:** AGG-1 (6-agent signal: CR-1, ARCH-1, V-1, DBG-1, CRI-2, TR-1)
- **Severity / confidence:** HIGH / HIGH
- **Citations:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:181-185`
- **Problem:** `handleBulkAddMembers` calls `response.json()` on the error branch (line 181) and then again on the success branch (line 185). The `handleAddMember` function in the same file was fixed in cycle 23, but this function was missed.
- **Plan:**
  1. Refactor `handleBulkAddMembers` to parse the response body once before the if/else, same as `handleAddMember`
  2. Verify error and success paths both work correctly
  3. Verify all gates pass
- **Status:** PENDING

### M1: Fix discussion components raw error.message leak — always use i18n labels in toasts (AGG-2)

- **Source:** AGG-2 (6-agent signal: CR-2, SEC-1, V-2, DBG-2, CRI-1, TR-2)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:**
  - `src/components/discussions/discussion-post-form.tsx:54`
  - `src/components/discussions/discussion-thread-form.tsx:61`
  - `src/components/discussions/discussion-post-delete-button.tsx:36`
  - `src/components/discussions/discussion-thread-moderation-controls.tsx:83,104`
- **Problem:** These components use `toast.error(error instanceof Error ? error.message : errorLabel)`. While the normal error path throws `new Error(errorLabel)`, unexpected errors (TypeError, SyntaxError) would have their raw messages shown to users.
- **Plan:**
  1. For each of the 4 files, change the catch block to always use the i18n label in the toast
  2. Add `console.error(...)` logging for debugging
  3. Verify all gates pass
- **Status:** PENDING

### M2: Fix `group-members-manager.tsx` default error handler — never leak raw error.message (AGG-3)

- **Source:** AGG-3 (3-agent signal: CR-3, SEC-2, CRI-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:102`
- **Problem:** The `getErrorMessage` default case returns `error.message || tCommon("error")`, leaking raw error messages.
- **Plan:**
  1. Change the default case to always return `tCommon("error")`
  2. Add `console.error("Unexpected error:", error)` for debugging
  3. Verify all gates pass
- **Status:** PENDING

### M3: Fix `submission-overview.tsx` silent error swallowing on non-OK responses (AGG-4)

- **Source:** AGG-4 (3-agent signal: CR-4, V-3, DES-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/components/lecture/submission-overview.tsx:91`
- **Problem:** When the API returns a non-OK response, the code silently returns with no user feedback. This violates the convention in `src/lib/api/client.ts`.
- **Plan:**
  1. Add a toast error for non-OK responses on initial load (similar to the existing catch block)
  2. Verify all gates pass
- **Status:** PENDING

### M4: Fix `problem-submission-form.tsx` double `.json()` in handleRun and handleSubmit (AGG-5)

- **Source:** AGG-5 (3-agent signal: CR-5, CR-6, ARCH-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:**
  - `src/components/problem/problem-submission-form.tsx:184-188`
  - `src/components/problem/problem-submission-form.tsx:247-252`
- **Problem:** Same double `.json()` anti-pattern in both `handleRun` and `handleSubmit`.
- **Plan:**
  1. Refactor both functions to parse the body once before branching
  2. Verify error and success paths both work correctly
  3. Verify all gates pass
- **Status:** PENDING

### M5: Fix `compiler-client.tsx` double `.json()` on same Response (AGG-6)

- **Source:** AGG-6 (2-agent signal: CR-7, ARCH-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/components/code/compiler-client.tsx:270-287`
- **Problem:** Error branch calls `res.json()` on line 270, success branch on line 287.
- **Plan:**
  1. Refactor to parse the body once before branching
  2. Verify all gates pass
- **Status:** PENDING

---

## Deferred Items

### DEFER-44: `apiFetchJson` migration documentation note (DOC-1)

- **Source:** DOC-1 (1-agent signal)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/lib/api/client.ts:117-128`
- **Reason for deferral:** Documentation-only improvement. The existing JSDoc already clearly documents the anti-pattern. Adding a migration tracker is a nice-to-have.
- **Exit criterion:** When a codebase-wide `apiFetch` -> `apiFetchJson` migration pass is undertaken.

---

## Previously Deferred Items (Carried Forward)

All previously deferred items from prior cycle plans remain in effect:
- DEFER-1 through DEFER-5 (from cycle 1 plan)
- DEFER-20 through DEFER-25 (from cycle 2 plan)
- D1, D2, A19 (from earlier cycles)
- DEFER-26 through DEFER-40 (from RPF cycle 28 plan)
- DEFER-41 through DEFER-43 (from RPF cycle 23 plan)

---

## Progress Log

- 2026-04-22: Plan created from multi-agent review at commit dbc0b18f. 6 aggregate findings. 6 scheduled for implementation (H1, M1-M5). 1 deferred (DEFER-44). All prior cycle-23 and cycle-28 findings verified as fixed.

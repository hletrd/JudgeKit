# Tracer Review — RPF Cycle 24

**Date:** 2026-04-22
**Base commit:** dbc0b18f

## TR-1: `handleBulkAddMembers` double `.json()` — causal trace [HIGH/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:181-185`

**Causal trace:**
1. User clicks "Bulk Add" button -> `handleBulkAddMembers()` called
2. `apiFetch()` returns a Response with `ok: false` (e.g., 403 Forbidden)
3. Line 181: `response.json().catch(() => ({}))` consumes the body -> returns error object
4. Line 182: `throw new Error(...)` exits the function
5. Response body is now consumed

**Hypothesis 1 (current behavior):** The throw exits before line 185 runs. No bug today.
**Hypothesis 2 (regression risk):** If the throw is removed (e.g., to show a toast instead), line 185 would call `.json()` on the already-consumed body, throwing `TypeError: Body has already been consumed`. This would be caught by the outer catch and show a confusing error.

**Fix:** Parse once before branching.

---

## TR-2: Discussion error toast trace — raw message leak path [MEDIUM/MEDIUM]

**File:** `src/components/discussions/discussion-post-form.tsx:44-54`

**Causal trace:**
1. User submits post -> `handleSubmit()` called
2. `apiFetch()` returns Response with `ok: false` and HTML body (502 from proxy)
3. Line 46: `response.json().catch(() => ({}))` -> `.json()` throws SyntaxError, `.catch()` returns `{}`
4. Line 47: `console.error(...)` logs the empty error
5. Line 48: `throw new Error(errorLabel)` throws i18n label
6. Line 53-54: catch block catches the thrown Error, `error.message === errorLabel`, toast shows i18n label. Correct.

**BUT:** If `.catch()` itself somehow fails (extremely rare edge case: `response.body` already locked by a prior read), the SyntaxError propagates to the catch block:
- `error.message` = `"Body has already been consumed"` or similar
- `toast.error(error.message)` shows raw JS error to user

**Fix:** Always use i18n label in toast.

---

## Summary

- HIGH: 1 (TR-1)
- MEDIUM: 1 (TR-2)
- Total new findings: 2

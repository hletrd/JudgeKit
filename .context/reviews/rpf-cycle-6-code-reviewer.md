# Code Reviewer — RPF Cycle 6

## Scope
Full codebase review with focus on recently changed files (last 10 commits) and carry-forward findings from cycle 5 aggregate.

## Findings

### CR-1: `recruiting-invitations-panel.tsx` — `handleCreate` does not reset `setCreatedLink` on error path
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/contest/recruiting-invitations-panel.tsx:197-209`
- **Problem:** When the POST to create an invitation returns a non-OK response, `createdLink` state is never cleared. If the user had a previously created link showing in the dialog, it remains visible after a failed creation attempt, potentially misleading the user into thinking the new invitation was created.
- **Fix:** Add `setCreatedLink(null)` at the beginning of `handleCreate` or in the `else` branch.

### CR-2: `recruiting-invitations-panel.tsx` — `handleCreate` missing catch for network errors
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/contest/recruiting-invitations-panel.tsx:150-213`
- **Problem:** The `handleCreate` function has a `try/finally` but no `catch` block. If `apiFetch` throws a network error (not a bad response, but an actual exception like DNS failure), the error propagates unhandled. The `finally` sets `creating` to false, but no error toast is shown to the user. Other handlers like `handleRevoke` and `handleDelete` properly have `catch` blocks.
- **Fix:** Add a `catch` block with `toast.error(t("createError"))`.

### CR-3: `access-code-manager.tsx` — `handleCopyLink` uses `window.location.origin` for share URL (DEFER-24 carry)
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/contest/access-code-manager.tsx:134`
- **Problem:** `window.location.origin` is used to construct the share link. This is client-side and cannot reflect the canonical server URL if accessed via a non-canonical hostname (e.g., IP address, alternate domain). The same pattern exists in `recruiting-invitations-panel.tsx:97` and `workers-client.tsx:147`.
- **Note:** This is a carried finding (DEFER-24). No fix yet.

### CR-4: `countdown-timer.tsx` — `/api/v1/time` response `.json()` called without `.catch()` guard
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/exam/countdown-timer.tsx:80`
- **Problem:** `res.json()` is called after checking `res.ok` but without a `.catch()`. If the server returns a 200 with a non-JSON body, this would throw. However, the outer `.then` chain has a `.catch(() => {})`, so the error is silently swallowed and offset stays at 0. The risk is low but inconsistent with the established pattern documented in `apiFetch` JSDoc.
- **Fix:** Add `.catch(() => null)` after `.json()` and check for null in the next `.then`.

### CR-5: `filter-form.tsx` — hidden input for `status` can become stale before form submission
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/filter-form.tsx:78`
- **Problem:** The hidden input `<input type="hidden" name="status" value={statusValue}>` is kept in sync with the Select component via `onValueChange`. However, the Select's `onValueChange` updates `statusValue` state, which React batches. If the form is submitted before the re-render completes, the hidden input might have the old value. This is unlikely in practice due to React's synchronous state updates, but it's a subtle coupling.
- **Fix:** This is very low risk. Could use `form.requestSubmit()` instead of native submission, or use `useRef` for the value. Not urgent.

### CR-6: Carried from cycle 5 AGG-5 — Multiple API routes use dual count + data queries
- **Severity:** LOW
- **Confidence:** HIGH
- **Status:** NOT FIXED
- **Files:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`, `src/app/api/v1/problems/route.ts`, `src/app/api/v1/users/route.ts`, `src/app/api/v1/submissions/route.ts`

### CR-7: Carried from cycle 5 AGG-6 — 11 API routes still use manual `getApiUser` pattern
- **Severity:** LOW
- **Confidence:** HIGH
- **Status:** NOT FIXED

# Debugger Review — RPF Cycle 19 (Updated)

**Date:** 2026-04-22
**Reviewer:** debugger
**Base commit:** 6df94cb1

## Previous Findings Status

| ID | Finding | Status |
|----|---------|--------|
| DBG-1 | handleCopyKeyPrefix clipboard failure | FIXED (uses copyToClipboard utility) |
| DBG-2 | SubmissionListAutoRefresh interval leak | FIXED (backoff added, guard with isRunningRef) |

## New Findings

### DBG-3: `contest-join-client` navigates to `/dashboard/contests/undefined` when JSON parse fails on success path [MEDIUM/HIGH]

**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:49-58`

**Description:** After `res.ok` is true, line 49 calls `res.json().catch(() => ({ data: {} }))`. If the `.catch()` fires, `payload.data` becomes `{}` and `payload.data.assignmentId` is `undefined`. Line 58 then calls `router.push('/dashboard/contests/undefined')`, navigating the user to a non-existent page that will show a 404 or error state.

**Concrete failure scenario:** A CDN returns `200 OK` with an HTML body. The `.json()` call throws `SyntaxError`, caught by `.catch()`. The user sees a "Join success" toast and then lands on a broken page.

**Fix:** Add guard: `if (!payload.data?.assignmentId) { toast.error(t("joinFailed")); return; }` before the navigation.

---

### DBG-4: Unguarded `.json()` throws SyntaxError on success paths — 5+ locations [MEDIUM/MEDIUM]

**Files:**
- `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:128,185`
- `src/components/problem/problem-submission-form.tsx:188,252`
- `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:184`
- `src/hooks/use-submission-polling.ts:238`
- `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:218`

**Description:** After checking `response.ok`, these locations call `await response.json()` without `.catch()`. A non-JSON body on a 200 response (reverse proxy HTML) causes an unhandled `SyntaxError` that crashes the async handler silently. The outer `catch` block may show a generic error toast, but the specific failure mode is lost.

**Concrete failure scenario:** nginx returns `200 OK` with HTML body. `.json()` throws `SyntaxError`. The outer catch shows "An error occurred" but the user has no idea what happened.

**Fix:** Add `.catch(() => ({ data: {} }))` to each success-path `.json()` call.

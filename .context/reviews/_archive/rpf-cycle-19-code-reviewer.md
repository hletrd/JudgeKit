# Code Review — RPF Cycle 19 (Updated)

**Date:** 2026-04-22
**Reviewer:** code-reviewer
**Base commit:** 6df94cb1

## Previous Findings Status

| ID | Finding | Status |
|----|---------|--------|
| CR-1 | Duplicate formatNumber in dashboard-judge-system-section | FIXED |
| CR-2 | Scattered formatting functions | FIXED (formatBytes added, local copies removed) |
| CR-3 | .toFixed() i18n gaps | Partially addressed (internal .toFixed in formatBytes OK) |
| CR-4 | Clipboard copy in api-keys-client | FIXED (uses copyToClipboard) |

## New Findings

### CR-5: Unguarded `.json()` on success paths — multiple files [MEDIUM/HIGH]

**Files:**
- `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:128,185`
- `src/components/problem/problem-submission-form.tsx:188,252`
- `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:184`
- `src/hooks/use-submission-polling.ts:238`
- `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:218`

**Description:** After checking `response.ok`, several files call `await response.json()` without `.catch()`. If the server returns a 200 with a non-JSON body (e.g., a reverse proxy returning HTML), this throws an unhandled `SyntaxError`. The `apiFetchJson` helper and the codebase's own JSDoc (in `src/lib/api/client.ts:25-48`) explicitly warn about this pattern.

**Concrete failure scenario:** A reverse proxy (nginx, Cloudflare) returns `200 OK` with an HTML error page. The `.json()` call throws `SyntaxError: Unexpected token < in JSON at position 0`, crashing the component's async handler. No error toast is shown.

**Fix:** Add `.catch(() => ({ data: {} }))` to each success-path `.json()` call, or migrate to `apiFetchJson`.

---

### CR-6: Raw server error messages leaked to users in toast.error [MEDIUM/MEDIUM]

**Files:**
- `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:78`
- `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:214`

**Description:** These locations display raw server error strings directly to users via `toast.error((errorBody as { error?: string }).error ?? fallbackLabel)`. The server error could contain internal implementation details, SQL errors, stack traces, or other sensitive information. The discussion vote buttons were already fixed in a previous cycle to use only the localized label.

**Concrete failure scenario:** A server error returns `{ "error": "duplicate key value violates unique constraint \"users_email_key\"" }`. The raw SQL constraint name is displayed to the end user.

**Fix:** Replace with `toast.error(localizedLabel)` and log the raw error to console only.

---

### CR-7: contest-join-client navigation to `/dashboard/contests/undefined` when assignmentId missing [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:49,58`

**Description:** After `res.ok`, line 49 calls `res.json().catch(() => ({ data: {} }))`. If the `.catch()` fires (non-JSON success body), `payload.data` is `{}`, so `payload.data.assignmentId` is `undefined`. Line 58 then navigates to `/dashboard/contests/undefined`.

**Concrete failure scenario:** A CDN or reverse proxy returns `200 OK` with a non-JSON body. The `.catch()` fallback fires, `assignmentId` is `undefined`, and the user is navigated to a non-existent page.

**Fix:** Add a guard after parsing: `if (!payload.data?.assignmentId) { toast.error(t("joinFailed")); return; }`

---

### CR-8: `forceNavigate` has no JSDoc documenting appropriate usage [LOW/LOW]

**File:** `src/lib/navigation/client.ts:3-5`

**Description:** `forceNavigate` uses `window.location.assign()` which causes a full page reload, bypassing Next.js client-side routing. It has only one call site (`locale-switcher.tsx:49`), which is appropriate (locale changes need a full reload). However, there is no JSDoc warning future developers about the cost and when to prefer `router.push()`.

**Fix:** Add JSDoc documenting the tradeoff.

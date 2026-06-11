# RPF Cycle 19 Aggregate Review (Updated)

**Date:** 2026-04-22
**Base commit:** 6df94cb1
**Review artifacts:** `rpf-cycle-19-code-reviewer.md`, `rpf-cycle-19-security-reviewer.md`, `rpf-cycle-19-perf-reviewer.md`, `rpf-cycle-19-debugger.md`

## Previous Findings Resolution

| Previous ID | Finding | Resolution |
|-------------|---------|------------|
| AGG-1 | Duplicate formatNumber in dashboard-judge-system-section | FIXED — imports from @/lib/formatting |
| AGG-2 | Clipboard copy handleCopyKeyPrefix silent failure | FIXED — uses copyToClipboard utility |
| AGG-3 | Scattered formatting functions | FIXED — formatBytes/formatNumber consolidated in formatting.ts |
| AGG-4 | .toFixed() i18n gaps | Partially fixed — internal .toFixed() in formatBytes is OK (not user-facing) |
| AGG-5 | Practice page Path B memory concern | DEFERRED (requires SQL CTE, carried from cycles 18-19) |
| AGG-7 | formatNumber in wrong module | FIXED — now in formatting.ts with re-export |
| AGG-8 | No unit tests for formatNumber/formatBytes | FIXED — tests in formatting.test.ts |
| AGG-9 | SubmissionListAutoRefresh no backoff | FIXED — exponential backoff with errorCountRef |
| AGG-10 | forceNavigate lacks JSDoc | Open — low priority |
| AGG-11 | Mobile sign-out touch target | Open — low priority |

## New Deduped Findings (sorted by severity then signal)

### AGG-NEW-1: Unguarded `.json()` on success paths — 5+ locations risk SyntaxError crash [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-5), debugger (DBG-4)
**Files:**
- `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:128,185`
- `src/components/problem/problem-submission-form.tsx:188,252`
- `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:184`
- `src/hooks/use-submission-polling.ts:238`
- `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:218`

**Description:** After checking `response.ok`, these locations call `await response.json()` without `.catch()`. If the server returns a 200 with a non-JSON body (e.g., reverse proxy HTML), this throws an unhandled `SyntaxError`. The codebase's own `apiFetchJson` helper and JSDoc in `src/lib/api/client.ts:25-48` explicitly document this anti-pattern.

**Concrete failure scenario:** nginx returns `200 OK` with an HTML body. `.json()` throws `SyntaxError`. The outer catch may show a generic error toast, but the specific failure is lost and the user has no actionable feedback.

**Fix:** Add `.catch(() => ({ data: {} }))` to each success-path `.json()` call, or migrate to `apiFetchJson`.

---

### AGG-NEW-2: Raw server error messages leaked to users via toast — potential information disclosure [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-6), security-reviewer (SEC-3)
**Files:**
- `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:78`
- `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:214`

**Description:** These locations display raw server error strings directly to users via `toast.error((errorBody as { error?: string }).error ?? fallbackLabel)`. The server error could contain internal implementation details, SQL errors, stack traces, or other sensitive information. The discussion vote buttons were already fixed in a previous cycle to use only the localized label.

**Concrete failure scenario:** A database constraint violation returns `{ "error": "duplicate key value violates unique constraint \"users_email_key\"" }`. The raw SQL constraint name (table + column) is displayed to the end user, aiding reconnaissance.

**Fix:** Replace with `console.error(rawError); toast.error(localizedLabel)` pattern.

---

### AGG-NEW-3: contest-join-client navigates to `/dashboard/contests/undefined` when JSON parse fallback fires [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-7), debugger (DBG-3)
**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:49,58`

**Description:** After `res.ok`, line 49 calls `res.json().catch(() => ({ data: {} }))`. If `.catch()` fires, `payload.data.assignmentId` is `undefined`. Line 58 then navigates to `/dashboard/contests/undefined`, showing a 404 or error page.

**Concrete failure scenario:** A CDN returns `200 OK` with an HTML body. `.json()` throws, caught by `.catch()`. The user sees a success toast but lands on a broken page.

**Fix:** Add guard: `if (!payload.data?.assignmentId) { toast.error(t("joinFailed")); return; }`

---

### AGG-NEW-4: `forceNavigate` has no JSDoc documenting appropriate usage [LOW/LOW]

**Flagged by:** code-reviewer (CR-8)
**File:** `src/lib/navigation/client.ts:3-5`

**Description:** `forceNavigate` uses `window.location.assign()` which causes a full page reload. Only one call site exists (`locale-switcher.tsx:49`), which is appropriate. Adding JSDoc prevents future misuse.

**Fix:** Add JSDoc warning.

## Verified Safe / No Regression Found

- All previous cycle 19 fixes confirmed working (formatNumber consolidation, clipboard, formatBytes, backoff)
- Korean letter-spacing compliance maintained
- No `as any`, `@ts-ignore`, `@ts-expect-error`
- HTML sanitization uses DOMPurify with strict allowlists
- Auth flow robust (Argon2id, timing-safe dummy hash, rate limiting)
- CSRF protection consistent across mutation routes
- Proxy middleware correctly uses `"mustChangePassword"` key (not English string)
- `SubmissionListAutoRefresh` has proper exponential backoff
- Contest quick stats use AbortController for request cancellation
- `formatting.ts` properly consolidates formatNumber, formatBytes, formatScore, formatDifficulty, formatDuration

## Agent Failures

None.

# Code Quality Review — RPF Cycle 14

**Date:** 2026-04-22
**Reviewer:** code-reviewer
**Base commit:** 023ae5d4

## Previously Fixed Items (Verified in Current Code)

All cycle 13 findings are fixed:
- AGG-1 (workers-client.tsx icon-only buttons missing aria-label): Fixed — all six buttons now have `aria-label`
- AGG-2 (chat-logs-client.tsx unguarded res.json() without res.ok check): Fixed — both `res.ok` check and `.catch()` guard added
- AGG-3 (group-instructors-manager.tsx remove instructor button missing aria-label): Fixed — `aria-label={t("removeInstructor")}` added
- AGG-4 (multiple components unguarded res.json() on success paths): Partially fixed — several components now have `.catch()` guards, but some remain

## Findings

### CR-1: Multiple components still have unguarded `res.json()` on success paths [MEDIUM/HIGH]

**Files:**
- `src/components/contest/anti-cheat-dashboard.tsx:124,161,238` — success path, no `.catch()`
- `src/components/contest/analytics-charts.tsx:542` — success path, no `.catch()`
- `src/components/contest/leaderboard-table.tsx:231` — success path, no `.catch()`
- `src/components/contest/participant-anti-cheat-timeline.tsx:96,131` — success path, no `.catch()`
- `src/components/contest/recruiting-invitations-panel.tsx:202,218` — success and error paths, no `.catch()`
- `src/components/code/compiler-client.tsx:287` — success path, no `.catch()`
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:141,177` — success path, no `.catch()`
- `src/app/(dashboard)/dashboard/problems/[id]/problem-export-button.tsx:19` — success path, no `.catch()`
- `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:49` — success path, no `.catch()`
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:220,336,427` — success path, no `.catch()`
- `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:105` — success path, no `.catch()`

**Description:** This is a continuation of the same class of issue identified in cycles 11-13 (AGG-4/AGG-5). While cycle 13 added `.catch()` guards to several files (recruiter-candidates-panel, quick-create-contest-form, invite-participants, code-timeline-panel, contest-quick-stats, submission-overview), many files still have unguarded `res.json()` calls on their success paths. If the server returns a non-JSON 200 body, `res.json()` throws SyntaxError. The outer catch blocks handle it, but the SyntaxError is an unnecessary exception path.

**Concrete failure scenario:** API returns 200 with empty body due to proxy misconfiguration. `res.json()` throws SyntaxError. The error is caught and a generic error toast is shown, but the user has no idea what went wrong. With a `.catch()` guard, the component would gracefully fall back to empty data.

**Fix:** Add `.catch()` guards on all success-path `.json()` calls. Consider a centralized `apiFetchJson` helper.

**Confidence:** HIGH

---

### CR-2: `problem-import-button.tsx` parses uploaded JSON without size limit [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:22-23`

**Description:** Line 22 calls `await file.text()` and line 23 calls `JSON.parse(text)` without any file size validation. A user could upload a multi-gigabyte JSON file that crashes the browser tab. The server-side route has proper Zod validation, but the client-side parsing happens before the API call.

**Concrete failure scenario:** User selects a 2GB JSON file. `file.text()` loads the entire file into memory, crashing the browser tab with an out-of-memory error before the API call is ever made.

**Fix:** Add a file size check (e.g., 10MB limit) before calling `file.text()`:
```ts
if (file.size > 10 * 1024 * 1024) {
  toast.error(t("fileTooLarge"));
  return;
}
```

**Confidence:** HIGH

---

### CR-3: `contest-join-client.tsx` — variable shadowing of `payload` [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:45,49`

**Description:** On line 45, a `const payload` is declared inside the `!res.ok` block for error handling. On line 49, another `const payload` is declared in the same scope for the success path. While this works because the error path throws before reaching line 49, the variable shadowing is confusing and could lead to bugs if the control flow changes.

**Fix:** Rename one of the variables, e.g., `const errorPayload` on line 45.

**Confidence:** MEDIUM

---

### CR-4: `create-problem-form.tsx` — double `res.json()` on success path [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:332,336`

**Description:** At line 331-336, the code first calls `const data = await res.json().catch(() => ({}))` for the error check, then immediately calls `const { data } = await res.json()` on line 336 for the success path. The error-path `.json()` consumes the response body, so the second `.json()` call on line 336 would throw a "body already consumed" error if the code ever reached it after the error path. However, in the current flow, the `!res.ok` block throws before line 336, so this is a latent bug rather than an active one.

Similarly at lines 423-427: `const data = await res.json().catch(() => ({}))` on the error path, then `const data = await res.json()` on the success path.

**Concrete failure scenario:** If someone refactors the code to remove the `throw` from the error path, the second `res.json()` call would fail because the response body was already consumed by the first call.

**Fix:** Restructure to use a single `.json()` call:
```ts
const data = await res.json().catch(() => ({}));
if (!res.ok) {
  throw new Error(data.error || "uploadFailed");
}
// Use data for success path
```

**Confidence:** MEDIUM

---

### CR-5: `problem-export-button.tsx` — unguarded `res.json()` + no `.catch()` + no null check on `data.data` [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/[id]/problem-export-button.tsx:19-24`

**Description:** Line 19 calls `const data = await res.json()` without `.catch()`. Then line 24 accesses `data.data.problem.title` without checking if `data.data` or `data.data.problem` exists. If the API returns a valid 200 response with an unexpected shape, this throws a TypeError.

**Concrete failure scenario:** API returns 200 with `{"data": {}}` (missing `problem`). Line 24 throws `Cannot read properties of undefined (reading 'title')`.

**Fix:** Add `.catch()` guard and null checks:
```ts
const data = await res.json().catch(() => null);
if (!data?.data?.problem) {
  toast.error(t("exportFailed"));
  return;
}
```

**Confidence:** HIGH

---

### CR-6: `recruiting-invitations-panel.tsx:218` — unguarded `res.json()` on error path [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:218`

**Description:** In the `else` block (after `!res.ok`), line 218 calls `const json = await res.json()` without `.catch()`. This is wrapped in a try-catch, but it would be more consistent with the established pattern to use `.catch(() => ({}))`.

**Fix:** Change to `const json = await res.json().catch(() => ({}))`.

**Confidence:** MEDIUM

---

## Final Sweep

The cycle 13 fixes for workers-client.tsx, chat-logs-client.tsx, and group-instructors-manager.tsx are properly implemented. The main remaining issues are:
1. **Unguarded `res.json()` calls** — still present in 11+ components despite three cycles of partial fixes. This needs a systematic approach (e.g., centralized helper).
2. **Problem import file size validation** — no client-side protection against oversized files.
3. **Double `res.json()` calls** in create-problem-form.tsx — latent bug from consuming the response body twice.
4. **Variable shadowing** in contest-join-client.tsx — confusing but not currently broken.
5. **Missing null checks** after `res.json()` in problem-export-button.tsx.

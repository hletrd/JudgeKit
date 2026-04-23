# Code Review — RPF Cycle 24

**Date:** 2026-04-22
**Base commit:** dbc0b18f

## CR-1: `handleBulkAddMembers` calls `.json()` twice on same Response [HIGH/HIGH]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:181-185`

**Description:** After checking `!response.ok` on line 180, the error branch calls `response.json()` on line 181. Then on line 185, the success path calls `response.json()` again on the same Response. The Response body can only be consumed once. While the if/else branching prevents the "body already consumed" error today, this is the documented anti-pattern from `src/lib/api/client.ts`. The `apiFetchJson` utility was created specifically to eliminate this pattern.

**Concrete failure scenario:** A developer moves the error handling to not throw, then both `.json()` calls execute, causing `TypeError: Body has already been consumed`.

**Fix:** Use `apiFetchJson` or parse the body once before branching.

---

## CR-2: Discussion components expose raw `error.message` to users via toast [MEDIUM/MEDIUM]

**Files:**
- `src/components/discussions/discussion-post-form.tsx:54`
- `src/components/discussions/discussion-thread-form.tsx:61`
- `src/components/discussions/discussion-post-delete-button.tsx:36`
- `src/components/discussions/discussion-thread-moderation-controls.tsx:83,104`

**Description:** These components use `toast.error(error instanceof Error ? error.message : errorLabel)`. While the `throw new Error(errorLabel)` on the preceding line means `error.message` will be the i18n label in the normal error path, the catch block catches ALL errors including network errors and SyntaxErrors. If a `TypeError` or `SyntaxError` slips through, the raw error message is displayed to the user.

**Concrete failure scenario:** A network error with message "Failed to fetch" or SyntaxError "Unexpected token < in JSON" shown directly to user.

**Fix:** Always use the `errorLabel` in the toast, log raw error to console:
```ts
catch (error) {
  console.error("Operation failed:", error);
  toast.error(errorLabel);
}
```

---

## CR-3: `group-members-manager.tsx` default error handler leaks raw error messages [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:102`

**Description:** The `getErrorMessage` function has a `default` case that returns `error.message || tCommon("error")`. Any unexpected error (e.g., TypeError from failed `.json()`) will have its raw message shown to the user. Only the explicit cases are i18n-safe.

**Fix:** Change the default to always return `tCommon("error")` and log raw error.

---

## CR-4: `submission-overview.tsx` silently swallows non-OK responses [MEDIUM/MEDIUM]

**File:** `src/components/lecture/submission-overview.tsx:91`

**Description:** When the API returns a non-OK response, the code simply `return`s with no user feedback. The `src/lib/api/client.ts` convention states: "Never silently swallow errors — always surface them to the user."

**Fix:** Add toast error for non-OK responses on initial load.

---

## CR-5: `problem-submission-form.tsx` double `.json()` in handleRun [MEDIUM/MEDIUM]

**File:** `src/components/problem/problem-submission-form.tsx:184-188`

**Description:** Same double `.json()` anti-pattern. Error branch (line 184) and success branch (line 188) each call `.json()` on the same Response.

**Fix:** Parse the body once before branching, or use `apiFetchJson`.

---

## CR-6: `problem-submission-form.tsx` double `.json()` in handleSubmit [MEDIUM/MEDIUM]

**File:** `src/components/problem/problem-submission-form.tsx:247-252`

**Description:** Same pattern as CR-5 in the `handleSubmit` function.

**Fix:** Same as CR-5.

---

## CR-7: `compiler-client.tsx` double `.json()` on same Response [MEDIUM/MEDIUM]

**File:** `src/components/code/compiler-client.tsx:270-287`

**Description:** After checking `!res.ok`, error branch calls `res.json()` on line 270, then success branch calls `res.json()` on line 287. Same anti-pattern.

**Fix:** Parse the body once before branching.

---

## Summary

- HIGH: 1 (CR-1)
- MEDIUM: 6 (CR-2 through CR-7)
- Total findings: 7

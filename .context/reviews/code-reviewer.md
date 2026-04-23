# Code Review — RPF Cycle 25

**Date:** 2026-04-22
**Base commit:** ac51baaa

## CR-1: `compiler-client.tsx` exposes raw error messages from API response in toast and UI [MEDIUM/HIGH]

**File:** `src/components/code/compiler-client.tsx:271-279`

The `handleRun` catch block on line 292 does:
```ts
const errorMessage = err instanceof Error ? err.message : "Network error";
updateTestCase(runningTestCaseId, (testCase) => ({ ...testCase, error: errorMessage, result: null }));
toast.error(t("runFailed"), { description: errorMessage });
```

And similarly the `!res.ok` branch on line 271 does:
```ts
const errorMessage = data.error || data.message || res.statusText || "Request failed";
```

Both expose raw API error messages directly to the user. The `client.ts` convention says "Use i18n keys for all user-facing error messages." While server-side errors are typically i18n keys thrown by `createApiHandler`, the `res.statusText` fallback and any unexpected `data.error`/`data.message` values could expose internal error text. Additionally, if `data.error` is an object instead of a string, `errorMessage` would be `[object Object]`.

**Fix:** Use i18n keys in toasts. Show raw errors only in the inline error display (for debugging compiler output), not in toast descriptions. Ensure `errorMessage` is always a string.

---

## CR-2: `contest-quick-stats.tsx` double-wraps `Number()` on already-typed values [LOW/MEDIUM]

**File:** `src/components/contest/contest-quick-stats.tsx:65-68`

```ts
participantCount: Number.isFinite(Number(data.data!.participantCount)) ? Number(data.data!.participantCount) : prev.participantCount,
```

The `Number()` call is applied to values that are already numbers from JSON parsing. `Number(someNumber)` is a no-op. The double-wrapping is misleading and suggests the developer was unsure about the type.

**Fix:** Use `typeof data.data!.participantCount === "number" && Number.isFinite(data.data!.participantCount) ? data.data!.participantCount : prev.participantCount` for type-safe validation without unnecessary coercion.

---

## CR-3: `create-problem-form.tsx` default error handler leaks raw error.message [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:310`

The `getErrorMessage` switch/case has:
```ts
default:
  return error.message || tCommon("error");
```

This falls through to showing `error.message` for any unhandled error type. If a `SyntaxError` from a `.json()` parse failure gets here, the raw `"Unexpected token <..."` message is shown.

**Fix:** Change default to `return tCommon("error")` and log the raw error with `console.error()`.

---

## CR-4: `assignment-form-dialog.tsx` default error handler leaks raw error.message [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:206`

Same pattern as CR-3:
```ts
default:
  return error.message || tCommon("error");
```

**Fix:** Same as CR-3.

---

## CR-5: `start-exam-button.tsx` catches raw `error.message` for branching logic [LOW/LOW]

**File:** `src/components/exam/start-exam-button.tsx:49-54`

The catch block checks `error.message === "assignmentClosed"` and `error.message === "assignmentNotStarted"`. This is a server-contract pattern where the server throws known error strings. It's functional but fragile -- if the server changes the error string, the client silently falls through to the generic error.

**Fix:** Consider using error codes (e.g., in the response body) instead of matching on error.message text. Low priority since this is an existing pattern used consistently across the codebase.

---

## CR-6: `recruiting-invitations-panel.tsx` constructs invitation URLs with `window.location.origin` [LOW/HIGH]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:99,216,239`

```ts
const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
const link = `${baseUrl}/recruit/${token}`;
```

This is already tracked as DEFER-24 / SEC-3. Carried forward.

---

## CR-7: `problem-submission-form.tsx` `translateSubmissionError` uses a legacy error map with string matching [LOW/MEDIUM]

**File:** `src/components/problem/problem-submission-form.tsx:146-168`

The `legacyErrorMap` maps hardcoded English strings to i18n keys. This is fragile -- if the API changes error messages, the mapping silently breaks and falls through to the generic error. The `try { return t(translationKey as never) }` with `as never` also suppresses TypeScript type checking on the i18n key.

**Fix:** Long-term, the API should return error codes instead of English strings, and the client should map codes to i18n keys. Short-term, add a TypeScript type for valid i18n keys to replace `as never`.

# Document Specialist Review — RPF Cycle 25

**Date:** 2026-04-22
**Base commit:** ac51baaa

## DOC-1: `src/lib/api/client.ts` JSDoc could be clearer about `apiFetchJson` fallback behavior for error responses [LOW/LOW]

**File:** `src/lib/api/client.ts:117-128`

The JSDoc for `apiFetchJson` says:
> `fallback` - Value returned when `.json()` throws (e.g., non-JSON body). Also returned as `data` when `res.ok` is false.

This is technically correct but could be clearer. The fallback is returned in TWO scenarios:
1. When `.json()` throws (non-JSON body)
2. When `res.ok` is false (regardless of whether JSON parsed successfully)

The second scenario means that even if the error response is valid JSON, the caller gets the fallback value, not the parsed error body. This is by design (preventing error body leakage) but should be documented more explicitly.

**Fix:** Add a note: "When `res.ok` is false, `data` is the fallback value regardless of whether the response body could be parsed as JSON. This prevents accidental leakage of server error details."

---

## DOC-2: `getErrorMessage` functions lack JSDoc explaining error.message convention [LOW/LOW]

**Files:**
- `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:84`
- `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:47`
- `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:184`
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:286`

These functions map `error.message` values to i18n keys but have no documentation explaining the convention. New developers might not understand that `error.message` values are server-side error codes, not user-facing strings.

**Fix:** Add a JSDoc comment explaining: "Maps server error codes (thrown as `new Error(code)` by API handlers) to user-facing i18n keys."

---

## DOC-3: `useVisibilityPolling` JSDoc is missing the `paused` parameter documentation [LOW/LOW]

**File:** `src/hooks/use-visibility-polling.ts:17`

The hook accepts a `paused` parameter but the JSDoc at the top of the file doesn't document it:
```ts
export function useVisibilityPolling(
  callback: () => void,
  intervalMs: number,
  paused = false,
)
```

The `paused` parameter was added to support the submission-overview fix but the JSDoc wasn't updated.

**Fix:** Add documentation for the `paused` parameter.

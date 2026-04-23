# Architecture Review — RPF Cycle 25

**Date:** 2026-04-22
**Base commit:** ac51baaa

## ARCH-1: Error message mapping pattern is inconsistent across components [MEDIUM/MEDIUM]

**Files:**
- `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:84-103`
- `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:47-71`
- `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:184-206`
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:286-310`
- `src/components/exam/start-exam-button.tsx:48-55`

Each component implements its own `getErrorMessage` function with a switch/case on `error.message`. This creates several problems:
1. **Inconsistent default handling** -- some use `error.message || tCommon("error")` (leaks raw messages), others use `tCommon("error")` (safe).
2. **Fragile server-client coupling** -- matching on `error.message` string values means server-side error string changes break client-side mapping silently.
3. **Code duplication** -- similar switch/case logic repeated across 5+ components.

**Fix:** Create a shared `mapServerErrorCode(message: string, i18nMap: Record<string, string>, fallback: string)` utility that:
- Maps known error strings to i18n keys
- Always returns the fallback for unknown errors
- Logs unmapped errors to console for debugging
- Can be extended with a lint rule to enforce usage

---

## ARCH-2: `apiFetchJson` adoption is incomplete -- most components still use manual `apiFetch` + `.json()` pattern [LOW/MEDIUM]

**Files:** Many across `src/components/` and `src/app/`

The `apiFetchJson` helper in `src/lib/api/client.ts` was created to eliminate the double-`.json()` and missing-`.catch()` anti-patterns. However, the majority of components still use the raw `apiFetch` + manual `.json().catch()` pattern. This means:
1. The anti-pattern surface area remains large
2. Future developers must remember the manual pattern
3. No compile-time enforcement of safe patterns

**Fix:** Incrementally migrate components to `apiFetchJson`. Consider adding a lint rule that flags `apiFetch(...).json()` without `.catch()`. Tracked as DEFER-1/DEFER-38.

---

## ARCH-3: `useVisibilityPolling` hook has no mechanism for exponential backoff on repeated failures [LOW/LOW]

**File:** `src/hooks/use-visibility-polling.ts`

The hook polls at a fixed interval regardless of whether previous fetches succeeded or failed. For components that experience persistent failures (e.g., server is down), this creates a steady stream of failed requests.

**Fix:** Consider adding optional failure-count tracking that increases the interval on consecutive failures. Low priority since all current consumers handle their own errors.

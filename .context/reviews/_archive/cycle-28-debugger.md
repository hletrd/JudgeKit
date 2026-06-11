# Cycle 28 Debugger Review

**Date:** 2026-04-20
**Reviewer:** debugger
**Base commit:** d4489054

## Findings

### DBG-1: `compiler-client.tsx` localStorage.setItem crash in private browsing [LOW/MEDIUM]

**File:** `src/components/code/compiler-client.tsx:183`
**Problem:** `localStorage.setItem("compiler:language", language)` in a useEffect will throw `QuotaExceededError` in Safari private browsing mode. This is a latent bug — the component will crash when the user changes the language selector. All other localStorage write operations in the codebase are wrapped in try/catch.
**Concrete failure scenario:** User opens playground in Safari private browsing, selects a different language, and the React error boundary catches the crash. The user sees the error fallback UI instead of the compiler.
**Fix:** Wrap in try/catch.

### DBG-2: `submission-detail-client.tsx` localStorage.setItem crash in private browsing [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:94`
**Problem:** `localStorage.setItem(key, JSON.stringify(payload))` in `handleResubmit` will throw in Safari private browsing. This blocks the resubmit navigation entirely.
**Concrete failure scenario:** Student wants to resubmit a solution, clicks the "Resubmit" button, and nothing happens because the function throws before `router.push()`.
**Fix:** Wrap in try/catch. The draft save is best-effort; the navigation should always proceed.

## Verified Safe / No Issue

- Error boundary components properly gate `console.error` behind dev checks.
- `use-unsaved-changes-guard.ts` properly handles all navigation interception scenarios (beforeunload, popstate, pushState/replaceState monkey-patching, click interception).
- `use-source-draft.ts` properly handles all localStorage access with try/catch.
- `anti-cheat-monitor.tsx` properly handles localStorage with try/catch and retry logic.
- SSE polling in `use-submission-polling.ts` properly falls back to fetch polling on SSE failure.

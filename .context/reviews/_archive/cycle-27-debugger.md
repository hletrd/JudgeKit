# Cycle 27 Debugger

**Date:** 2026-04-22
**Base commit:** 14025d58

## Findings

### DBG-1: 14 unguarded `console.error` calls in client components -- latent information leak [MEDIUM/MEDIUM]

**Files:** (see code-reviewer CR-1 through CR-4 for full list)

**Description:** The error boundary components were fixed to gate `console.error` behind `process.env.NODE_ENV === "development"`. However, 14 other client-side `console.error` calls in API-consuming components remain ungated. These are in the "happy path before error boundary" zone -- they fire before any error boundary is triggered, so the error boundary gate does not protect them.

**Failure scenario:** A network error in a discussion post creation returns `{ "error": "ECONNREFUSED 127.0.0.1:5432" }`. The `console.error("Discussion post creation failed:", ...)` at line 47 of `discussion-post-form.tsx` writes the internal connection details to the browser console. This happens before any error boundary, and the user-visible toast only shows the i18n error message.

**Fix:** Gate all 14 `console.error` calls behind `process.env.NODE_ENV === "development"`.

**Confidence:** HIGH

### DBG-2: `admin-config.tsx` double `.json()` -- latent runtime error risk [LOW/MEDIUM]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:99+103`

**Description:** The test-connection handler calls `response.json()` twice (error branch at line 99, success branch at line 103). The `return` at line 101 prevents the second call from running, but this is a latent bug: if the early return is removed during refactoring, the second `.json()` call will throw `TypeError: Body already consumed`. This is the same pattern fixed in cycle 26 AGG-1.

**Fix:** Parse response body once before branching.

**Confidence:** MEDIUM

## Verified Safe

- All previous cycle bugs are confirmed fixed (clock-skew, toLocaleString, non-null assertion, React.cache deduplication).
- No empty catch blocks in production code.
- Error boundaries properly log errors in dev-only.
- Judge claim/poll routes handle edge cases (invalid claim token, stale claims, worker capacity).

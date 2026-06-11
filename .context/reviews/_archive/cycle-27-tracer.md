# Cycle 27 Tracer

**Date:** 2026-04-22
**Base commit:** 14025d58

## Findings

### TR-1: Causal trace: ungated `console.error` -> production information leak [MEDIUM/MEDIUM]

**Causal chain:**
1. User triggers a discussion post creation in production
2. API returns `{ error: "Internal: column 'foo' not found at query.ts:42" }` (non-OK response)
3. `discussion-post-form.tsx:46`: `const errorBody = await response.json().catch(() => ({}))`
4. `discussion-post-form.tsx:47`: `console.error("Discussion post creation failed:", (errorBody as { error?: string }).error)` -- **LEAKS to browser DevTools**
5. User sees i18n error toast (safe), but the raw error body is in the console
6. Any user who opens DevTools can see the internal error details

**Hypothesis:** The error boundary gate (fixed in prior cycles) is bypassed because the `console.error` fires in the API-consuming component before any error boundary is triggered. The security measure is incomplete.

**Fix:** Gate all 14 client-side `console.error` calls behind `process.env.NODE_ENV === "development"`.

**Confidence:** HIGH

### TR-2: Causal trace: `admin-config.tsx` double `.json()` -> latent Body-consumed error [LOW/MEDIUM]

**Causal chain:**
1. Admin clicks "Test Connection" for chat widget
2. API returns non-OK response
3. Line 99: `const errorBody = await response.json().catch(() => ({}))` -- first `.json()` call, body consumed
4. Line 100: `setTestResult(...)` -- uses errorBody
5. Line 101: `return` -- exits early (prevents second `.json()`)
6. **If line 101 is removed during refactoring:**
7. Line 103: `const data = await response.json().catch(() => ({...}))` -- second `.json()` throws `TypeError: Body already consumed`
8. `.catch(() => ...)` swallows the TypeError, silently falls through to `setTestResult(data)` with fallback data
9. Admin sees "parseError" instead of the actual error -- confusing but not a crash

**Hypothesis:** The `.catch()` on the second `.json()` prevents a crash, but produces confusing behavior. The "parse once, then branch" pattern eliminates the risk entirely.

**Fix:** Parse response body once before branching.

**Confidence:** MEDIUM

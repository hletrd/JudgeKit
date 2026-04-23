# RPF Cycle 9 Tracer Review

**Date:** 2026-04-20
**Base commit:** c30662f0

## Findings

### TR-1: `api-key-auth.ts` — time source divergence in single auth flow [MEDIUM/MEDIUM]

**Files:** `src/lib/api/api-key-auth.ts:88,103`
**Description:** Tracing the API key auth flow: (1) fetch key by hash, (2) check expiry using `getDbNowUncached()`, (3) fetch user, (4) fire-and-forget update `lastUsedAt: new Date()`. Steps 2 and 4 use different time sources. If the app server clock drifts ahead, `lastUsedAt` could be recorded after `expiresAt` even though step 2 verified the key was not expired.
**Fix:** Reuse `now` from step 2 for step 4.

### TR-2: `globals.css` letter-spacing traced to all Korean text [HIGH/HIGH]

**Files:** `src/app/globals.css:129,213`
**Description:** The `html { letter-spacing: -0.01em }` rule is inherited by every element on every page. The `.problem-description :is(h1, h2, h3, h4) { letter-spacing: -0.02em }` adds additional compression to problem description headings. Both affect Korean text rendering globally.
**Fix:** Add `:not(:lang(ko))` selectors.

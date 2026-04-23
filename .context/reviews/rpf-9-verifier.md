# RPF Cycle 9 Verifier Review

**Date:** 2026-04-20
**Base commit:** c30662f0

## Findings

### V-1: `globals.css` letter-spacing contradicts CLAUDE.md Korean text rule — confirmed violation [HIGH/HIGH]

**Files:** `src/app/globals.css:129,213`
**Description:** Verified by reading CLAUDE.md rule: "Keep Korean text at the browser/font default letter spacing. Do not apply custom letter-spacing (or tracking-* Tailwind utilities) to Korean content." The `html { letter-spacing: -0.01em }` rule directly violates this. The `.problem-description :is(h1, h2, h3, h4) { letter-spacing: -0.02em }` also violates it. This is a confirmed product rule violation.
**Fix:** Add `:not(:lang(ko))` selectors or use CSS custom properties.

### V-2: `api-key-auth.ts` `lastUsedAt` uses wrong time source — confirmed [MEDIUM/MEDIUM]

**Files:** `src/lib/api/api-key-auth.ts:103`
**Description:** Confirmed that line 88 uses `getDbNowUncached()` and line 103 uses `new Date()` in the same function. The `now` variable from line 88 is in scope and could be reused at line 103.
**Fix:** Replace `lastUsedAt: new Date()` with `lastUsedAt: now`.

### V-3: Previous cycle 8 fixes (getDbNowUncached migration) confirmed working [INFO/HIGH]

**Description:** All API route migrations from cycles 7-8 are confirmed in place. The `getDbNowUncached()` function is used consistently in API routes. The gaps are in server actions and the specific `api-key-auth.ts` `lastUsedAt` write.

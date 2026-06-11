# RPF Cycle 9 Debugger Review

**Date:** 2026-04-20
**Base commit:** c30662f0

## Findings

### DBG-1: `globals.css` letter-spacing on `html` element affects Korean text rendering [HIGH/HIGH]

**Files:** `src/app/globals.css:129,213`
**Description:** The `html { letter-spacing: -0.01em }` rule applies negative letter-spacing to all text including Korean. For Korean characters, the default letter-spacing is already optimized by the font. Applying -0.01em compresses Korean text, reducing readability. This is a rendering bug that manifests as slightly compressed Korean text across the entire application.
**Fix:** Use `:not(:lang(ko))` or `:lang(en)` selector to limit letter-spacing to non-Korean content.

### DBG-2: `api-key-auth.ts` `lastUsedAt` fire-and-forget uses stale app-server time [MEDIUM/MEDIUM]

**Files:** `src/lib/api/api-key-auth.ts:103`
**Description:** The `lastUsedAt` update at line 103 uses `new Date()` in a fire-and-forget `void db.update().catch()` call. While the timing difference is typically small, in high-precision audit scenarios (e.g., "was this key used before or after revocation?"), the app-server time could be off by seconds to minutes.
**Fix:** Use `now` (already fetched from `getDbNowUncached()`) instead of `new Date()`.

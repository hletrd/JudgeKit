# Document Specialist — Cycle 14

**Date:** 2026-04-24
**Base commit:** ca6b7d84

## CR14-DOC1: `mapTokenToSession` comment says "add it HERE" but `syncTokenWithUser` no longer requires it

- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/lib/auth/config.ts:157`
- **Evidence:** The comment on line 157 says "When adding a new preference field: add it to AUTH_PREFERENCE_FIELDS, AuthUserRecord, next-auth.d.ts (Session["user"] and JWT), AND here." However, `syncTokenWithUser` (line 122) now uses `Object.assign(token, fields)`, which means it no longer requires a manual field addition. The comment is misleading — it implies that both `syncTokenWithUser` and `mapTokenToSession` need manual updates, when only `mapTokenToSession` does.
- **Suggested fix:** Update the comment to reflect that `syncTokenWithUser` is automated via `Object.assign`, and only `mapTokenToSession` requires manual field addition. Or better yet, fix `mapTokenToSession` to also be automated, making the comment obsolete.

## CR14-DOC2: `rate-limit.ts` has no JSDoc documenting the clock source assumption

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/lib/security/rate-limit.ts`
- **Evidence:** The functions in `rate-limit.ts` use `Date.now()` for all time comparisons, while `api-rate-limit.ts` uses `getDbNowMs()`. There is no documentation explaining which clock source each module uses or why. This makes it difficult for future developers to understand the intentional design choice vs. an oversight.
- **Suggested fix:** Add a module-level JSDoc explaining the clock source for each rate-limit module.

## Verified Prior Fixes

- `apiFetch` JSDoc mentions `.json().catch()` pattern (verified in `src/lib/api/client.ts:28`)

# RPF Cycle 9 Security Review

**Date:** 2026-04-20
**Base commit:** c30662f0

## Findings

### SEC-1: `api-key-auth.ts` `lastUsedAt` uses app server time while expiry check uses DB time [MEDIUM/MEDIUM]

**Files:** `src/lib/api/api-key-auth.ts:103`
**Description:** The `authenticateApiKey` function correctly validates API key expiry using `getDbNowUncached()` (line 88), but the fire-and-forget `lastUsedAt` update uses `new Date()` (line 103). If `lastUsedAt` is ever used in a security-relevant comparison (e.g., determining if a key was used after revocation), the clock skew could produce incorrect results.
**Fix:** Replace `lastUsedAt: new Date()` with `lastUsedAt: now` (the already-fetched `getDbNowUncached()` value).

### SEC-2: Recruiting token flow timestamps inconsistent within single transaction [LOW/MEDIUM]

**Files:** `src/lib/assignments/recruiting-invitations.ts:477,484,494,496`
**Description:** The `redeemRecruitingToken` function writes enrollment and redemption timestamps using `new Date()` but the atomic claim check uses `NOW()`. Within a single transaction, these timestamps should use the same time source.
**Fix:** Fetch `getDbNowUncached()` once at the start of the function and use it for all timestamp writes.

### SEC-3: Server actions lack time-source consistency [LOW/LOW]

**Files:** `src/lib/actions/plugins.ts`, `src/lib/actions/language-configs.ts`, `src/lib/actions/system-settings.ts`, `src/lib/actions/user-management.ts`
**Description:** Server actions use `new Date()` for `updatedAt` while API routes writing to the same tables use `getDbNowUncached()`. This creates a mixed time-source pattern in the same columns.
**Fix:** Migrate server actions to use `getDbNowUncached()`.

## Verified Safe

- No secrets leaked in client-side code.
- API key encryption uses AES-256-GCM with proper IV and auth tag.
- Rate limiting uses PostgreSQL SELECT FOR UPDATE to prevent TOCTOU races.
- CSRF protection is in place for server actions via `isTrustedServerActionOrigin()`.
- HTML sanitization uses DOMPurify with strict allowlists.
- Environment variables are validated in production via `requireNonEmptyEnv()`.

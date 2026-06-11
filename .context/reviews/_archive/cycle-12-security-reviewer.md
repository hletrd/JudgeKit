# Cycle 12 — Security Reviewer

**Date:** 2026-04-19
**Base commit:** 2339c7ea

## Findings

### CR12-SR1 — [MEDIUM] `authorizeRecruitingToken` returns full user object without `mustChangePassword` check

- **File:** `src/lib/auth/recruiting-token.ts:51,62`
- **Confidence:** MEDIUM
- **Evidence:** On line 51, the function checks `if (!user || !user.isActive) return null` but does not check `mustChangePassword`. The hardcoded value `mustChangePassword: false` on line 62 means a recruiting token user who has been forced to change their password can still log in via the recruiting token path without being redirected to `/change-password`. This bypasses the proxy's mustChangePassword gate (proxy.ts line 307-312) for this auth path.
- **Suggested fix:** Check `user.mustChangePassword` and either return null (forcing normal login) or set the field to `true` in the returned object so the proxy redirects correctly.

### CR12-SR2 — [LOW] `recordRateLimitFailure` uses `blockedUntil || null` which treats 0 as null

- **File:** `src/lib/security/rate-limit.ts:215,225`
- **Confidence:** MEDIUM
- **Evidence:** `blockedUntil || null` will convert `0` to `null` due to JavaScript's falsy coercion. While `blockedUntil = 0` is unlikely in practice (it's computed as `now + blockDuration`), the intent is clearly to store `null` when there's no block. The `consumeRateLimitAttemptMulti` function on line 175 uses `blockedUntil > 0 ? blockedUntil : null` which is more correct. Same issue in `recordRateLimitFailureMulti` line 253.
- **Suggested fix:** Use `blockedUntil > 0 ? blockedUntil : null` consistently.

### CR12-SR3 — [LOW] `npm_package_version` in export metadata can leak internal version info

- **File:** `src/lib/db/export.ts:64`
- **Confidence:** LOW
- **Evidence:** The export file includes `process.env.npm_package_version` in its metadata. This version is typically not sensitive but could aid targeted attacks if the version has known vulnerabilities. Since this is a backup/restore feature gated behind admin auth, the risk is minimal.
- **Suggested fix:** Consider making version inclusion optional or stripping it for sanitized exports.

### CR12-SR4 — [LOW] CSP allows `'unsafe-inline'` for styles

- **File:** `src/proxy.ts:195`
- **Confidence:** LOW
- **Evidence:** The Content-Security-Policy header includes `style-src 'self' 'unsafe-inline'`. This is common for apps using CSS-in-JS or inline styles (Tailwind generates scoped class names, but some component libraries inject inline styles). While `'unsafe-inline'` for styles is lower risk than for scripts, it can still be exploited for CSS-based data exfiltration in targeted attacks.
- **Suggested fix:** Consider migrating to nonce-based style CSP if feasible, or document the tradeoff.

### CR12-SR5 — [MEDIUM] Import route allows full database replacement without confirmation step

- **File:** `src/app/api/v1/admin/migrate/import/route.ts` (not directly read, but import logic in `src/lib/db/import.ts:132-236`)
- **Confidence:** MEDIUM
- **Evidence:** The `importDatabase` function truncates ALL tables in reverse FK order and then re-imports. While this is wrapped in a transaction and rolled back on failure, the destructive nature (complete data replacement) combined with no two-step confirmation in the API is risky. A single API call with valid admin credentials + a valid export file replaces the entire database. There's no "dry run" or "preview changes" step.
- **Suggested fix:** Add a dry-run/preview endpoint that validates and shows what would change before executing the actual import.

## Previously Deferred Items Still Valid

- D1: JWT authenticatedAt clock skew (MEDIUM)
- D3: JWT callback DB query on every request (MEDIUM)
- D4: SSE submission events route capability check incomplete (MEDIUM)
- D6: Metrics endpoint dual auth without rate limiting (MEDIUM)

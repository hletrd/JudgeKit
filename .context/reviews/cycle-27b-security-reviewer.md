# Security Reviewer — Cycle 27b

**Date:** 2026-04-25
**Base commit:** 4c4c2c9e

## Previously Fixed (Verified)

- `rateLimitedResponse` now uses DB-consistent time (nowMs is required param)
- Sidecar rejection paths call `getDbNowMs()` before calling `rateLimitedResponse`
- Password hashing uses Argon2id with OWSP-recommended parameters
- `argon2.needsRehash` implemented for parameter change detection
- Referrer-Policy and X-Content-Type-Options headers on proxy responses
- Data retention uses DB server time for cutoff computation

## New Findings

### SEC-1: Ungated `console.error` in 6 client-side components — information leak risk [MEDIUM/MEDIUM]

Same finding as CR-1 through CR-5. The ungated `console.error` calls in `assignment-form-dialog.tsx:206`, `group-instructors-manager.tsx:73`, `language-config-table.tsx:137,161,189`, `problem-import-button.tsx:38`, and `database-backup-restore.tsx:146` could expose internal error details (SQL column names, stack traces) to any user who opens browser DevTools in production.

**Concrete failure scenario:** A database error response `{"error": "column 'email_hash' not found at query.ts:42"}` is logged to the browser console, exposing the schema column name and server file path.

**Fix:** Gate all 7 ungated `console.error` calls behind `process.env.NODE_ENV === "development"`.

## Security Postive Observations

- All rate-limiting paths use DB server time (no clock-skew vectors)
- `isValidImageReference()` validates Docker image tags before shell execution
- Dockerfile path traversal check in `buildDockerImageLocal()`
- DOMPurify configured with narrow allowlists and URI regexp
- Auth tokens sent via `Authorization: Bearer` header (not query params)
- Argon2id with proper parameters for password hashing
- CSRF protection via NextAuth
- No `eval()`, `new Function()`, `as any`, or `@ts-ignore` in server code

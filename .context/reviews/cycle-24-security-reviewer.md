# Cycle 24 Security Review

**Date:** 2026-05-09
**HEAD:** c86576a1
**Scope:** Security-focused review of recent changes and full codebase

---

## Prior Findings Status

All April 2026 cycle-24 findings verified at current HEAD:
- SEC-1 (silent error handlers): Fixed in prior cycles
- SEC-2 (ContestsLayout navigation): Still present as known Next.js workaround

---

## New Findings

### S-1: [MEDIUM] contestAccessTokens.expiresAt lacks database index

**Files:** `src/lib/db/schema.pg.ts:1024-1028`
**Confidence:** HIGH

The new `expires_at` column on `contest_access_tokens` is queried in multiple locations with `AND (cat.expires_at IS NULL OR cat.expires_at > NOW())`. Without an index on `expires_at`, these queries will perform full table scans on `contest_access_tokens`. Under load with many tokens, this becomes a performance and availability risk.

**Affected queries:**
- `src/lib/assignments/contests.ts:183` (student contest list)
- `src/lib/platform-mode-context.ts:88-89` (problem scope resolution)
- `src/lib/platform-mode-context.ts:117-118` (accessible assignment lookup)
- `src/lib/platform-mode-context.ts:142-143` (active restricted assignment)
- `src/app/api/v1/contests/[assignmentId]/*/route.ts` (multiple route handlers)

**Concrete failure:** A platform with 10,000 contest access tokens. Every page load that checks contest access does a full scan of the tokens table. During a high-traffic contest, this creates lock contention and query timeouts.

**Fix:** Add a composite index:
```typescript
index("cat_assignment_user_expires_idx").on(table.assignmentId, table.userId, table.expiresAt),
```
Or at minimum:
```typescript
index("cat_expires_at_idx").on(table.expiresAt),
```

---

### S-2: [LOW] Existing contest access tokens have NULL expiresAt (indefinite validity)

**Files:** `drizzle/pg/0022_contest_access_token_expiry.sql`
**Confidence:** MEDIUM

The migration adds `expires_at` as a nullable column with no default. Existing tokens will have `NULL expires_at`, which the query logic treats as "never expires" (`expires_at IS NULL OR expires_at > NOW()`). This means tokens created before this migration grant indefinite access.

While this is intentional for backward compatibility, it creates a security gap where old tokens remain valid forever. The fix should be a data migration that sets `expires_at` for existing tokens based on their assignment's deadline.

**Fix:** Add a follow-up migration:
```sql
UPDATE contest_access_tokens cat
SET expires_at = a.deadline
FROM assignments a
WHERE cat.assignment_id = a.id
  AND cat.expires_at IS NULL;
```

---

### S-3: [LOW] SECRET_SETTINGS_KEYS is not cross-referenced with LOGGER_REDACT_PATHS

**Files:** `src/lib/security/secrets.ts:74`
**Confidence:** LOW

`SECRET_SETTINGS_KEYS` only contains `hcaptchaSecret` but there is no automated check ensuring new entries are also added to `LOGGER_REDACT_PATHS`. If a future secret setting key is added to `SECRET_SETTINGS_KEYS` but not to `LOGGER_REDACT_PATHS`, it will leak in logs.

**Fix:** Derive logger paths from `SECRET_SETTINGS_KEYS` or add a cross-reference assertion in secrets.ts.

---

## Areas Verified (No Issues Found)

- Password hashing uses Argon2id with OWASP parameters
- Dummy password hash prevents user enumeration via timing
- CSP nonce-based script-src configured correctly
- frame-ancestors 'none' prevents clickjacking
- Path traversal prevention in file operations (resolveStoredPath)
- SQL injection prevention in all raw SQL usage
- XSS prevention: user content sanitized before dangerouslySetInnerHTML
- No plaintext secrets in logs (LOGGER_REDACT_PATHS covers all sensitive paths)
- Secure cookie flags conditionally set based on protocol
- Security headers (Referrer-Policy, X-Content-Type-Options) present in proxy.ts

# RPF Cycle 16 — Code Reviewer

**Date:** 2026-04-24
**HEAD:** bbc1ef67

## Scope

Reviewed code quality, logic, SOLID compliance, and maintainability across:
- `src/lib/db/export.ts` — DB export engine, redaction logic
- `src/lib/db/schema.pg.ts` — Schema definitions
- `src/lib/assignments/recruiting-invitations.ts` — Recruiting token flow
- `src/lib/judge/auth.ts` — Judge worker authentication
- `src/lib/security/encryption.ts` — Encryption utilities
- `src/lib/security/csrf.ts` — CSRF validation
- `src/lib/security/in-memory-rate-limit.ts` — In-memory rate limiter
- `src/lib/security/rate-limit.ts` — DB-backed rate limiter
- `src/lib/audit/events.ts` — Audit event recording
- `src/lib/auth/config.ts` — NextAuth configuration
- `src/lib/api/auth.ts` — API authentication helpers
- `src/lib/api/api-key-auth.ts` — API key authentication
- `src/lib/docker/client.ts` — Docker client
- `src/proxy.ts` — Next.js middleware/proxy
- `src/lib/judge/poll/route.ts` — Judge result submission
- `src/lib/logger.ts` — Pino logger with redaction

## Findings

### CR-1: [HIGH] Stale Column Reference in Export Sanitization — `recruitingInvitations.token`
**Confidence:** High

The `recruitingInvitations.token` column was dropped in cycle 15 (commit `7cd2c983`), but `SANITIZED_COLUMNS` in `src/lib/db/export.ts:251` still references `"token"` for that table:

```ts
recruitingInvitations: new Set(["token", "tokenHash"]),
```

When a sanitized export runs, the code iterates over `SANITIZED_COLUMNS[tableName]` and tries to find the column index for `"token"` in the exported row. Since the column no longer exists, one of two outcomes occurs:
1. If the column-to-index mapping logic silently skips missing columns, the `"token"` entry is a no-op dead reference — misleading and incorrect documentation.
2. If the mapping throws on a missing column, the export crashes at runtime.

Either way, the stale reference must be removed.

**Fix:** Remove `"token"` from the `recruitingInvitations` entry in `SANITIZED_COLUMNS`. The column no longer exists in the schema.

---

### CR-2: [MEDIUM] Phantom Column Reference in Export — `contestAccessTokens.token`
**Confidence:** High

`SANITIZED_COLUMNS` in `src/lib/db/export.ts:252` references `"token"` for `contestAccessTokens`:

```ts
contestAccessTokens: new Set(["token"]),
```

However, the `contestAccessTokens` schema (schema.pg.ts:994-1014) has no `token` column — it only has `id`, `assignmentId`, `userId`, `redeemedAt`, and `ipAddress`. This is a phantom reference that either silently does nothing or throws at export time.

**Fix:** Remove the entire `contestAccessTokens` entry from `SANITIZED_COLUMNS`, or if there was historically a token column that was removed, remove the `"token"` reference.

---

### CR-3: [MEDIUM] `judgeWorkers.secretToken` Column Still Exists in Schema
**Confidence:** High

The `judgeWorkers` table (schema.pg.ts:418) still has a `secretToken` column:

```ts
secretToken: text("secret_token"),
```

This column is:
- Set to `null` on every new registration (register/route.ts:56)
- Rejected by auth if `secretTokenHash` is absent (judge/auth.ts:76-81)
- Sanitized in exports (export.ts:250)

The column serves no operational purpose and is a data-at-rest security risk (any legacy rows with plaintext tokens would be exposed in a DB compromise). This is a carry-over from AGG-8 / DEFER-66 in the cycle 15 plan.

**Fix:** Drop the `secretToken` column from the schema, create a Drizzle migration, and remove it from `SANITIZED_COLUMNS` in export.ts.

---

### CR-4: [LOW] Audit Event `details` Contains `claimTokenPresent: true` Flag
**Confidence:** Low

In `src/app/api/v1/judge/poll/route.ts:118`, the audit event includes:

```ts
details: {
  claimTokenPresent: true,
  previousStatus: submission.status,
  status,
},
```

The `claimTokenPresent` field is always `true` when this code path executes (the claim was already validated above), making it a no-op. It does not leak the actual claim token value, so this is not a security issue — just a redundant field that adds noise to the audit log.

**Fix:** Remove the `claimTokenPresent` field from the audit details, or make it useful by only including it conditionally (e.g., when the claim token was missing/invalid in an earlier check).

---

### CR-5: [LOW] Duplicated SQL Expression for `isExpired` in Recruiting Invitations
**Confidence:** High

The `isExpired` computed column expression appears verbatim 4 times in `src/lib/assignments/recruiting-invitations.ts` (lines 128, 153, 177, 284):

```ts
isExpired: sql<boolean>`CASE WHEN ${recruitingInvitations.status} = 'pending' AND ${recruitingInvitations.expiresAt} IS NOT NULL AND ${recruitingInvitations.expiresAt} < NOW() THEN true ELSE false END`,
```

This violates DRY and increases the risk of the expression going out of sync if the business logic changes.

**Fix:** Extract the expression into a shared constant/function and reference it from all 4 locations.

---

## Positive Observations

- The recruiting token flow correctly uses `tokenHash` for all DB lookups and only returns the plaintext token on creation (never reads it back from DB).
- The judge worker registration already sets `secretToken: null` and stores only the hash.
- Timing-safe comparison (`safeTokenCompare`) is used consistently for all auth token comparisons.
- The audit event serialization now uses `truncateObject` instead of string slicing (fixed in cycle 15).
- The in-memory rate limiter eviction was fixed to O(1) FIFO (fixed in cycle 15).
- Build-phase guard was added to auth config (fixed in cycle 15).

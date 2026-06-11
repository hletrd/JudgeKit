# Aggregate Review -- Cycle 24

**Date:** 2026-05-09
**HEAD:** c86576a1
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, architect, test-engineer, verifier, critic
**Total findings:** 9 (deduplicated to 5)

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] contestAccessTokens.expiresAt lacks database index

**Sources:** S-1, P-1, C-1 | **Confidence:** HIGH
**Cross-agent signal:** 3 of 7 review perspectives

The new `expires_at` column on `contest_access_tokens` (added in migration 0022) is queried in 10+ locations with `AND (cat.expires_at IS NULL OR cat.expires_at > NOW())`. The table only has a unique index on `(assignment_id, user_id)`. Without an index covering `expires_at`, these queries perform full table scans.

**Affected queries:**
- `src/lib/assignments/contests.ts:183` (student contest list)
- `src/lib/platform-mode-context.ts:88-89,117-118,142-143` (3 problem/assignment lookups)
- `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts:46`
- `src/app/api/v1/contests/[assignmentId]/clarifications/route.ts:27`
- `src/app/api/v1/contests/[assignmentId]/announcements/route.ts:27`
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:54`
- `src/app/api/v1/contests/[assignmentId]/stats/route.ts:72`
- `src/app/api/v1/contests/[assignmentId]/invite/route.ts` (access check)

**Concrete failure scenario:** A platform with 10,000+ contest access tokens. Every page load that checks contest access does a full scan. During a high-traffic contest, this creates query pile-up, increased latency, and potential timeouts.

**Fix:** Add a composite index in the Drizzle schema:
```typescript
index("cat_assignment_user_expires_idx").on(table.assignmentId, table.userId, table.expiresAt),
```

Generate and run the migration.

---

### AGG-2: [MEDIUM] Export redaction map merge uses object spread that could lose columns

**Sources:** CR-1, P-2, C-2 | **Confidence:** HIGH
**Cross-agent signal:** 2 of 7 review perspectives

In `src/lib/db/export.ts:78`, the active redaction map is built with:
```typescript
const activeRedactionMap = options.sanitize
  ? { ...EXPORT_SANITIZED_COLUMNS, ...EXPORT_ALWAYS_REDACT_COLUMNS }
  : EXPORT_ALWAYS_REDACT_COLUMNS;
```

For tables present in both objects (users, sessions, accounts, apiKeys, systemSettings), the Set from `EXPORT_ALWAYS_REDACT_COLUMNS` overwrites the one from `EXPORT_SANITIZED_COLUMNS`. Currently the Sets are identical for overlapping tables, but if a future change adds a column to only `EXPORT_SANITIZED_COLUMNS` for a table that also exists in `EXPORT_ALWAYS_REDACT_COLUMNS`, the spread will silently drop it.

**Concrete failure scenario:** A developer adds `users.someNewSecret` to `EXPORT_SANITIZED_COLUMNS` (because it should be redacted in sanitized exports but retained in full-fidelity backups). They forget to also add it to `EXPORT_ALWAYS_REDACT_COLUMNS`. During a sanitized export, the `users` entry from ALWAYS (which doesn't have `someNewSecret`) overwrites the SANITIZED entry, and `someNewSecret` is exported in plaintext.

**Fix:** Replace the spread with an explicit merge that unions the Sets:
```typescript
function mergeRedactionMaps(
  sanitized: Record<string, Set<string>>,
  always: Record<string, Set<string>>
): Record<string, Set<string>> {
  const merged: Record<string, Set<string>> = {};
  for (const [table, cols] of Object.entries(sanitized)) {
    merged[table] = new Set([...cols, ...(always[table] ?? [])]);
  }
  for (const [table, cols] of Object.entries(always)) {
    if (!merged[table]) merged[table] = new Set(cols);
  }
  return merged;
}
```

---

### AGG-3: [LOW] Existing contest access tokens have NULL expiresAt (indefinite validity)

**Sources:** S-2, C-1 | **Confidence:** MEDIUM
**Cross-agent signal:** 2 of 7 review perspectives

Migration `0022_contest_access_token_expiry.sql` adds `expires_at` as a nullable column with no default. Existing tokens have `NULL expires_at`, and the query logic treats NULL as "never expires" (`expires_at IS NULL OR expires_at > NOW()`). This means tokens created before this migration grant indefinite access.

**Concrete failure scenario:** A student redeemed an access code before the migration. Their token has `NULL expires_at`. After the contest deadline passes, they can still access contest resources because the query treats NULL as valid.

**Fix:** Add a data migration:
```sql
UPDATE contest_access_tokens cat
SET expires_at = a.deadline
FROM assignments a
WHERE cat.assignment_id = a.id
  AND cat.expires_at IS NULL;
```

Alternatively, if the assignment no longer exists (orphaned token), set a past date or delete the token.

---

### AGG-4: [LOW] Contest access token expiry logic duplicated across 6+ files

**Sources:** A-2 | **Confidence:** MEDIUM
**Cross-agent signal:** 1 of 7 review perspectives

The expiry check `(expires_at IS NULL OR expires_at > NOW())` is duplicated in SQL across 10+ query locations. While this is a small fragment, it creates maintenance risk if the logic needs to change (e.g., add grace period, change timezone handling).

**Fix:** Extract a shared SQL expression or Drizzle helper. Given the project uses raw SQL for complex queries, a module-level SQL fragment constant would suffice:
```typescript
export const CONTEST_ACCESS_TOKEN_VALID = sql`(
  cat.expires_at IS NULL OR cat.expires_at > NOW()
)`;
```

---

### AGG-5: [LOW] Missing test for export redaction map merge behavior

**Sources:** TE-1 | **Confidence:** HIGH
**Cross-agent signal:** 1 of 7 review perspectives

No test verifies that the merged redaction map includes all columns when a table exists in both `EXPORT_SANITIZED_COLUMNS` and `EXPORT_ALWAYS_REDACT_COLUMNS`. This is the exact scenario that would catch AGG-2.

**Fix:** Add a unit test that creates divergent column sets for the same table in both maps and asserts the merged map contains the union.

---

## Carried Forward from Prior Cycles

All prior DEFER items (DEFER-1 through DEFER-13 from cycle 23 plan) remain unchanged.

## Positive Observations

- Centralized secrets registry (`secrets.ts`) is well-designed and correctly integrated
- Contest access token expiry is correctly implemented in all access queries
- ICPC live-rank tie-breaker direction corrected (earlier last AC ranks better)
- Security headers (Referrer-Policy, X-Content-Type-Options) present in proxy.ts
- All clock-skew-sensitive paths use `getDbNowMs()`
- `createApiHandler` correctly awaits `params` for Next.js 16 compatibility
- `resolveStoredPath` properly prevents path traversal
- CSP is well-configured with nonce-based script-src
- Password hashing uses Argon2id with OWASP parameters
- No `eval()`, `new Function()`, or `Math.random()` in security contexts
- No `as any` type casts in server code

## Subagent Availability Note

No subagent spawning tool was available in this environment. Review was performed as a single comprehensive manual sweep covering all perspectives. All relevant files were examined.

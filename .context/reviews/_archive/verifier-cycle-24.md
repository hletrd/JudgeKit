# Verifier — Cycle 24

**Date:** 2026-04-24
**Reviewer:** verifier
**Scope:** Evidence-based correctness check against stated behavior

---

## Findings

### V-1: [MEDIUM] `getRetentionCutoff` Uses App-Server Time for Data That Uses DB-Server Time

**Confidence:** HIGH
**Citations:** `src/lib/data-retention.ts:38-40`, `src/lib/data-retention-maintenance.ts`, `src/lib/db/cleanup.ts`

All contest boundary checks, anti-cheat dedup, SSE coordination, and rate limiting consistently use `getDbNowMs()` or `getDbNowUncached()` for DB-server time. However, `getRetentionCutoff` uses `Date.now()` (app-server time) to compute the cutoff date, while the data it compares against (`submittedAt`, `createdAt`, etc.) is stored using DB-server time.

The function signature already accepts an optional `now` parameter, but no caller passes DB time. The `data-retention-maintenance.ts` and `db/cleanup.ts` callers use the default.

**Stated behavior:** Data older than the retention period is deleted. If the app-server clock drifts from the DB server clock, data may be deleted slightly early or slightly late.

**Fix:** Update `data-retention-maintenance.ts` and `db/cleanup.ts` to pass `await getDbNowMs()` as the `nowMs` parameter.

---

### V-2: [LOW] `verifyPassword` Does Not Check Argon2 Parameter Rehash Need

**Confidence:** MEDIUM
**Citations:** `src/lib/security/password-hash.ts:30-41`

The `verifyPassword` function returns `needsRehash: false` for Argon2 hashes. The argon2 library provides `argon2.needsRehash(hash, options)` to check if a hash was created with different parameters than the current policy. This is not called.

**Stated behavior:** The code comment says "caller should rehash and persist the new hash when `needsRehash` is true." But `needsRehash` is only true for bcrypt-to-argon2 migration, not for argon2 parameter changes.

**Fix:** After a successful Argon2 verification, add:
```typescript
if (valid && !isBcryptHash(storedHash)) {
  return { valid, needsRehash: argon2.needsRehash(storedHash, ARGON2_OPTIONS) };
}
```

---

## Files Reviewed

- `src/lib/data-retention.ts` (full)
- `src/lib/data-retention-maintenance.ts` (referenced)
- `src/lib/db/cleanup.ts` (referenced)
- `src/lib/security/password-hash.ts` (full)
- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)

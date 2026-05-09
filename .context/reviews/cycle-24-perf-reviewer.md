# Cycle 24 Performance Review

**Date:** 2026-05-09
**HEAD:** c86576a1
**Scope:** Performance, concurrency, and resource usage review

---

## New Findings

### P-1: [MEDIUM] contestAccessTokens.expiresAt query lacks index

**Files:** `src/lib/db/schema.pg.ts:1024-1028`
**Confidence:** HIGH
**Cross-agent signal:** Also flagged by security-reviewer (S-1)

The missing index on `expires_at` in `contest_access_tokens` causes full table scans in EXISTS subqueries across multiple hot paths. This is the most significant performance risk introduced in recent changes.

**Query pattern:**
```sql
SELECT 1 FROM contest_access_tokens cat
WHERE cat.assignment_id = @assignmentId
  AND cat.user_id = @userId
  AND (cat.expires_at IS NULL OR cat.expires_at > NOW())
```

With only a unique index on `(assignment_id, user_id)`, PostgreSQL can find the specific row but must then check the `expires_at` condition without index support. For a table with many tokens, this is a sequential scan.

**Impact:** Medium to high under load. Each contest route handler performs this check. During a contest with many participants, the accumulated query time grows linearly with token count.

**Fix:** Add composite index `(assignment_id, user_id, expires_at)` or `(expires_at)`.

---

### P-2: [LOW] Export redaction uses Set spread in hot loop

**Files:** `src/lib/db/export.ts:78`
**Confidence:** LOW
**Cross-agent signal:** Also flagged by code-reviewer (CR-1)

The object spread `{ ...EXPORT_SANITIZED_COLUMNS, ...EXPORT_ALWAYS_REDACT_COLUMNS }` is executed once per export, not per row, so the performance impact is minimal. However, the Set values are shared references, which is correct for performance (no copying per lookup).

The actual per-row redaction at line 112 uses `redactSet?.has(col)` which is O(1) per column. With ~50 tables * 1000 rows * ~20 columns = ~1M lookups per export chunk, this is efficient.

**No action required** - performance is acceptable.

---

## Areas Verified (No Issues Found)

- Batched DELETE in data retention (BATCH_SIZE = 5000) prevents long-running locks
- Promise.allSettled in pruneSensitiveOperationalData prevents cascade failures
- SSE connection slot uses advisory locks for serialization
- Rate limiter uses in-memory cache with periodic eviction
- Compiler execution has timeout guards via AbortSignal
- Docker client has timeout on container operations
- Export uses streaming with backpressure (waitForReadableStreamDemand)

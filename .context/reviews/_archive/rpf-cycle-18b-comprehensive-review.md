# RPF Cycle 18b Comprehensive Deep Code Review

**Date:** 2026-04-24
**Reviewer:** Multi-angle review (code quality, security, performance, architecture, correctness, testing, data integrity)
**Base commit:** 087e0b77

---

## Findings

### F1: `flushAuditBuffer` re-buffers lost events in reverse order — new events appended after stale batch
- **File**: `src/lib/audit/events.ts:169-172`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: When `flushAuditBuffer()` fails, line 171 re-buffers the lost batch by prepending it to `_auditBuffer`: `_auditBuffer = [...batch, ..._auditBuffer]`. This puts the old (failed) events BEFORE any new events that may have accumulated in `_auditBuffer` since the flush started. While this preserves the failed events, it breaks the chronological ordering guarantee of audit events. If a subsequent flush succeeds, the events from the failed batch will be inserted with an earlier timestamp than events that actually occurred after them. This can cause audit log anomalies where events appear to have happened before their causal predecessors.

  Additionally, the spread operation creates a new array on every failure, which allocates O(batch_size) memory. For a batch of 50 events with 2x cap = 100 events already buffered, this creates an array of 150 elements on each failure.

- **Concrete failure scenario**: An admin performs a critical action (e.g., user deletion) at T=1. The audit buffer flush fails at T=2. New events (e.g., login) are added at T=3. The re-buffer prepends the T=1 events before T=3 events. When the next flush succeeds, the T=1 events are inserted after T=3 events in the database, causing the audit log to show the deletion happening after the login, which is chronologically incorrect and could confuse compliance auditors.

- **Fix**: Append the failed batch after the current buffer to preserve insertion order: `_auditBuffer = [..._auditBuffer, ...batch]`. This ensures events are always inserted in the order they were recorded, even after a flush failure. Alternatively, add a `sequenceNumber` to each buffered event and sort before flush.

### F2: `truncateObject` budget accounting can undercount in nested arrays — may produce JSON exceeding MAX_JSON_LENGTH
- **File**: `src/lib/audit/events.ts:62-73`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: In the array branch of `truncateObject()`, line 69 checks `if (remaining - serialized.length - 1 < 0) break;`. However, `serialized` is the JSON of the *truncated* item, not the original item. The `+1` accounts for the comma separator, but it doesn't account for the `[` and `]` brackets of the array itself (which are deducted at line 64 as `remaining = budget - 2`). The issue is that each serialized item's length includes its own structural characters (quotes, braces, etc.), but the `remaining` budget was reduced by `keyCost` for the key and comma, not for the item's own brackets.

  For deeply nested structures (arrays of objects containing arrays), the budget tracking can accumulate small errors because `JSON.stringify(truncated).length` includes all nested structure characters, but `remaining` was only decremented by the serialized length plus a comma. When the function returns, the outer `JSON.stringify(truncated)` in `serializeDetails` may produce output slightly exceeding `MAX_JSON_LENGTH`, but the final safety check at line 103 catches this and falls back to `{"_truncated":true}`.

  In practice, the fallback at line 103 prevents invalid JSON from being stored, so this is a quality/completeness issue rather than a correctness issue — valid JSON is always produced, but complex details may be over-truncated to the sentinel value when a more nuanced truncation was possible.

- **Concrete failure scenario**: An audit event has a deeply nested `details` object with arrays of objects. The `truncateObject` function slightly over-estimates the available budget for nested items. The final serialized result exceeds `MAX_JSON_LENGTH`, triggering the `{"_truncated":true}` fallback. The audit event loses all its structured detail instead of retaining a truncated but useful subset.

- **Fix**: Use a two-pass approach: first truncate conservatively, then verify the total serialized length. If it exceeds the budget, re-truncate more aggressively. Alternatively, build the output incrementally with exact byte counting rather than estimating with `JSON.stringify` of each truncated element.

### F3: `db/cleanup.ts` still runs alongside in-process pruners despite deprecation — dual deletion wastes DB resources
- **File**: `src/lib/db/cleanup.ts`, `src/app/api/internal/cleanup/route.ts`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The `/api/internal/cleanup` cron endpoint still exists and is functional, calling `cleanupOldEvents()`. While it now uses `DATA_RETENTION_DAYS` and respects `DATA_RETENTION_LEGAL_HOLD` (fixes from prior cycles), it still runs alongside the in-process pruners in `data-retention-maintenance.ts`. Both paths perform the same batched DELETE operations on the same tables. If an external cron job calls this endpoint while the in-process pruner is also running, both will attempt to delete the same rows simultaneously.

  The cron endpoint now logs a deprecation notice (line 34-37 of the route), which is good. However, it is still fully functional and could be triggered by any caller with the CRON_SECRET.

- **Concrete failure scenario**: An operator has both the cron endpoint and the in-process pruner active. The cron fires at midnight, scanning `audit_events` for rows older than 90 days and deleting them in batches. The in-process pruner fires on its 24-hour timer and does the same. The second scan finds fewer rows but still consumes a DB connection and performs a sequential scan on a potentially large table.

- **Fix**: Add an env var `ENABLE_CRON_CLEANUP` (default `false`) that gates the cleanup endpoint. When disabled, the endpoint returns a 410 Gone response explaining that in-process pruning is the canonical mechanism. This preserves backward compatibility for operators who explicitly need the cron endpoint.

### F4: `computeContestRanking` cache does not differentiate between assignment IDs across different DB snapshots
- **File**: `src/lib/assignments/contest-scoring.ts:57,97-129`
- **Severity**: LOW
- **Confidence**: LOW
- **Description**: The ranking cache uses `assignmentId:cutoffSec` as the key. If a contest's configuration changes (e.g., scoring model switched from ICPC to IOI, or problems added/removed), the cached data becomes stale. The cache has a 30-second TTL, so stale data is served for up to 15 seconds (stale-while-revalidate) and up to 30 seconds (hard TTL). In practice, contest configuration changes are rare and typically done by admins who expect a short delay, so this is a minor issue.

  More importantly, if the same `assignmentId` key is accessed by two different requests that see different DB snapshots (e.g., one before a scoring model change and one after), the stale-while-revalidate pattern may return the pre-change ranking while a background refresh computes the post-change ranking. This is consistent with the cache's documented behavior but could confuse an admin who just changed the scoring model.

- **Concrete failure scenario**: An admin switches a contest from ICPC to IOI scoring. For the next 15-30 seconds, students still see the ICPC-style leaderboard (solved count as primary sort) while the background refresh computes the IOI-style leaderboard (total score as primary sort). When the refresh completes, the leaderboard suddenly changes ranking methodology.

- **Fix**: Include a configuration version (e.g., hash of scoring model + problem count) in the cache key, or invalidate the cache when contest configuration is updated. Alternatively, accept the 15-30 second staleness window as documented behavior for admin configuration changes.

### F5: `in-memory-rate-limit.ts` `maybeEvict()` iterates the entire Map during the first pass when over capacity
- **File**: `src/lib/security/in-memory-rate-limit.ts:23-51`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The `maybeEvict()` function is called on every rate limit check and record operation. When `store.size > MAX_ENTRIES` (10,000), the function performs two full iterations: first to evict expired entries (lines 37-41), then to evict oldest-by-insertion-order entries (lines 43-49). The first pass iterates the entire Map even if most entries are not expired. With 10,000 entries, this means iterating 10,000 entries on every rate limit call when the store is at capacity.

  The 60-second throttle on eviction calls (`now - lastEviction < 60_000`) mitigates this in practice, as eviction only runs once per minute. However, during high-traffic periods where the store fills up, the first eviction after the 60-second window will iterate the full map.

- **Concrete failure scenario**: A burst of traffic fills the in-memory rate limiter to 10,000 entries. On the next rate limit check after the 60-second window, `maybeEvict()` iterates all 10,000 entries twice. This adds ~1-2ms of CPU time per call, which is negligible for a single request but could add up under sustained high traffic.

- **Fix**: Track expired entry count separately and skip the first pass if the count is zero. Alternatively, use a separate `Set<string>` of keys that are known to be expired, populated during the check/record operations, so the eviction pass only needs to iterate known-expired keys.

### F6: `proxy.ts` auth cache eviction deletes oldest entry by insertion order — may evict recently authenticated users during burst
- **File**: `src/proxy.ts:64-71`
- **Severity**: LOW
- **Confidence**: LOW
- **Description**: When the auth cache reaches `AUTH_CACHE_MAX_SIZE` (500), `setCachedAuthUser` evicts the first (oldest) entry by Map insertion order. However, the cache key includes `authenticatedAtSeconds`, which means that when a user's token is refreshed (new `authenticatedAt`), a new cache entry is created with a different key, and the old entry becomes orphaned. The old entry will be evicted only when it reaches the front of the Map's insertion order.

  With 500 active users whose tokens refresh every 5 minutes (JWT maxAge), the cache could accumulate 500 fresh entries and 500 stale entries (different `authenticatedAt`). Since the eviction only checks `size >= AUTH_CACHE_MAX_SIZE`, it will evict the oldest entry by insertion order, which might be a fresh entry that was recently created for a user whose token just refreshed.

  In practice, the 2-second TTL ensures that stale entries are never returned (they fail the `expiresAt > Date.now()` check in `getCachedAuthUser`), so this is a memory efficiency concern rather than a correctness issue.

- **Concrete failure scenario**: 500 active users are browsing the dashboard. All tokens refresh around the same time, creating 500 new cache entries. The cache now has 500 stale + 500 fresh = 1000 entries, but the eviction only fires when size >= 500 and only removes one entry at a time. The stale entries remain in the cache until they reach the front of the insertion order, wasting memory.

- **Fix**: Add cleanup of expired entries in `setCachedAuthUser` before checking size, similar to how `getCachedAuthUser` deletes expired entries on read. This would keep the cache size bounded by the number of active (non-expired) entries rather than total entries including expired ones.

---

## Verified Safe (No Issue)

### VS1: All prior cycle fixes are correctly implemented and verified
- **Files**: contest-analytics.ts, participant-timeline.ts, recruiting-invitations.ts, contest-scoring.ts, auto-review.ts, analytics/route.ts, db/cleanup.ts, logger.ts, events.ts, password-hash.ts, data-retention-maintenance.ts
- **Description**: Verified the following fixes from cycles 15-17:
  - Cycle 15: Plaintext `recruitingInvitations.token` column dropped, audit JSON truncation uses recursive `truncateObject`, O(1) FIFO eviction in in-memory rate limiter, build-phase guard in auth config.
  - Cycle 16: `isAdmin` made module-private, anti-cheat heartbeat gap uses DESC ordering, `resetRecruitingInvitationAccountPassword` sets `mustChangePassword: true`, `getInvitationStats` uses atomic single-query, contest scoring has failure cooldown.
  - Cycle 17: `firstAcMap` uses exact key lookup (not `endsWith`), code snapshots limited to 1000, anti-cheat events use GROUP BY aggregation, analytics cache has stale-while-revalidate, `redeemRecruitingToken` uses DB time only, IOI tie detection uses epsilon comparison, auto-review has pLimit(2), `hcaptchaSecret` in REDACT_PATHS, audit pruning consolidated into data-retention-maintenance.

### VS2: `verifyAndRehashPassword` transparently rehashes bcrypt to argon2
- **File**: `src/lib/security/password-hash.ts:51-70`
- **Description**: The new `verifyAndRehashPassword` function correctly handles the bcrypt-to-argon2 migration. It is used in auth config (login flow), backup route, and recruiting invitations. The `change-password.ts` route correctly uses `verifyPassword` without rehash since the password is about to be replaced anyway (documented with a comment).

### VS3: `db/cleanup.ts` now uses canonical retention config and respects legal hold
- **File**: `src/lib/db/cleanup.ts:4,28-31`
- **Description**: The cleanup function now imports `DATA_RETENTION_DAYS` and `DATA_RETENTION_LEGAL_HOLD` from the canonical `data-retention.ts` module. The legal hold check is present and matches the in-process pruners' behavior.

### VS4: SSE connection tracking uses O(1) per-user count lookup
- **File**: `src/app/api/v1/submissions/[id]/events/route.ts:29,58,66-72`
- **Description**: The `userConnectionCounts` Map provides O(1) lookups for per-user connection counts, correctly incremented in `addConnection` and decremented in `removeConnection`.

### VS5: `computeSingleUserLiveRank` avoids full leaderboard recomputation for frozen leaderboard student rank
- **File**: `src/lib/assignments/leaderboard.ts:86-189`
- **Description**: The function computes a single user's rank using a targeted SQL query that counts users ranked above the target, rather than computing the full leaderboard twice.

---

## Previously Deferred Items (Still Active)

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| A19 | `new Date()` clock skew risk | LOW | Deferred -- only affects distributed deployments with unsynchronized clocks |
| A7 | Dual encryption key management | MEDIUM | Deferred -- consolidation requires migration |
| A12 | Inconsistent auth/authorization patterns | MEDIUM | Deferred -- existing routes work correctly |
| A2 | Rate limit eviction could delete SSE slots | MEDIUM | Deferred -- unlikely with heartbeat refresh |
| A17 | JWT contains excessive UI preference data | LOW | Deferred -- requires session restructure |
| A25 | Timing-unsafe bcrypt fallback | LOW | Deferred -- bcrypt-to-argon2 migration in progress |
| A26 | Polling-based backpressure wait | LOW | Deferred -- no production reports |
| L2(c13) | Anti-cheat LRU cache single-instance limitation | LOW | Deferred -- already guarded by getUnsupportedRealtimeGuard |
| L5(c13) | Bulk create elevated roles warning | LOW | Deferred -- server validates role assignments |
| D16 | `sanitizeSubmissionForViewer` unexpected DB query | LOW | Deferred -- only called from one place, no N+1 risk |
| D17 | Exam session `new Date()` clock skew | LOW | Deferred -- same as A19 |
| D18 | Contest replay top-10 limit | LOW | Deferred -- likely intentional, requires design input |
| L6(c16) | `sanitizeSubmissionForViewer` N+1 risk for list endpoints | LOW | Deferred -- re-open if added to list endpoints |
| AGG-1(c18) | Inconsistent locale handling in number formatting | MEDIUM | Deferred from cycle 18 aggregate |
| AGG-2(c18) | Access code share link missing locale prefix | LOW | Deferred from cycle 18 aggregate |
| AGG-3(c18) | Practice page progress-filter in-JS filtering at scale | MEDIUM | Deferred from cycle 18 aggregate |
| AGG-4(c18) | Hardcoded English error string in api-keys clipboard | LOW | Deferred from cycle 18 aggregate |
| AGG-5(c18) | `userId!` non-null assertion in practice page | LOW | Deferred from cycle 18 aggregate |
| AGG-6(c18) | Copy-code-button no error feedback on clipboard failure | LOW | Deferred from cycle 18 aggregate |
| AGG-7(c18) | Practice page component exceeds 700 lines | LOW | Deferred from cycle 18 aggregate |
| AGG-8(c18) | Recruiting invitations panel `min` date uses client time | LOW | Deferred from cycle 18 aggregate |

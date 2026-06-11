# RPF Cycle 18b Aggregate Review

**Date:** 2026-04-24
**Base commit:** 087e0b77
**Review artifacts:** `rpf-cycle-18b-comprehensive-review.md`, `rpf-cycle-18-aggregate.md` (prior), `cycle-18-comprehensive-review.md` (prior)

## Deduped Findings (sorted by severity then signal)

### AGG-1: `flushAuditBuffer` re-buffers lost events in reverse order — breaks chronological audit ordering [MEDIUM/HIGH]

**Flagged by:** comprehensive-review (F1)
**Files:** `src/lib/audit/events.ts:169-172`
**Description:** On flush failure, the code prepends the failed batch before any new events: `_auditBuffer = [...batch, ..._auditBuffer]`. This breaks chronological insertion order — events that happened at T=1 (failed batch) will be inserted after events at T=3 (new buffer), producing chronologically incorrect audit logs.
**Concrete failure scenario:** Admin deletes a user at T=1. Flush fails. Login event at T=3. Re-buffer puts T=1 before T=3 in the buffer. Next flush succeeds and inserts T=1 events after T=3 events, showing deletion happening after login.
**Fix:** Append instead: `_auditBuffer = [..._auditBuffer, ...batch]`. Or add a monotonically increasing sequence number.
**Cross-agent signal:** New finding not in prior reviews.

### AGG-2: `truncateObject` budget undercounting in nested arrays — may over-truncate audit details [LOW/MEDIUM]

**Flagged by:** comprehensive-review (F2)
**Files:** `src/lib/audit/events.ts:62-73`
**Description:** The array branch budget tracking can accumulate small errors for deeply nested structures. The final safety check at line 103 catches over-budget output by falling back to `{"_truncated":true}`, which discards all structured detail rather than retaining a truncated subset.
**Concrete failure scenario:** An audit event has deeply nested details. The budget tracking slightly over-estimates available space. The final result exceeds MAX_JSON_LENGTH and falls back to the sentinel, losing all detail.
**Fix:** Two-pass truncation or incremental byte counting.
**Cross-agent signal:** New finding not in prior reviews.

### AGG-3: `db/cleanup.ts` cron endpoint still runs alongside in-process pruners — dual deletion wastes DB resources [LOW/HIGH]

**Flagged by:** comprehensive-review (F3)
**Files:** `src/lib/db/cleanup.ts`, `src/app/api/internal/cleanup/route.ts`
**Description:** The cron endpoint is deprecated and logs a notice but is still fully functional. Both the cron and in-process pruners may attempt to delete the same rows simultaneously.
**Concrete failure scenario:** Cron fires at midnight, scanning audit_events for old rows. In-process pruner fires on its 24h timer and does the same. The second scan is mostly wasted work.
**Fix:** Add `ENABLE_CRON_CLEANUP` env var (default false) that gates the endpoint. Return 410 Gone when disabled.
**Cross-agent signal:** Related to cycle-18 review F6 which noted the redundancy. This adds the operational concern about dual execution.

### AGG-4: Contest ranking cache not invalidated on configuration change [LOW/LOW]

**Flagged by:** comprehensive-review (F4)
**Files:** `src/lib/assignments/contest-scoring.ts:57,97-129`
**Description:** The cache key uses `assignmentId:cutoffSec` but does not include configuration version. If an admin changes the scoring model, stale data is served for up to 30 seconds.
**Concrete failure scenario:** Admin switches ICPC to IOI scoring. Students see ICPC-style leaderboard for up to 30 seconds.
**Fix:** Include configuration version in cache key or invalidate on configuration update.
**Cross-agent signal:** New finding not in prior reviews.

### AGG-5: In-memory rate limiter eviction iterates full Map when over capacity [LOW/MEDIUM]

**Flagged by:** comprehensive-review (F5)
**Files:** `src/lib/security/in-memory-rate-limit.ts:23-51`
**Description:** When the store exceeds MAX_ENTRIES (10,000), `maybeEvict()` iterates the entire Map twice — once for expired entries, once for FIFO eviction. Mitigated by 60-second throttle.
**Concrete failure scenario:** Burst traffic fills store to 10,000 entries. First eviction after the 60s window iterates all entries twice, adding ~1-2ms.
**Fix:** Track expired entry count separately or use a separate set of known-expired keys.
**Cross-agent signal:** New finding not in prior reviews.

### AGG-6: Proxy auth cache accumulates stale entries from token refreshes [LOW/LOW]

**Flagged by:** comprehensive-review (F6)
**Files:** `src/proxy.ts:64-71`
**Description:** When tokens refresh, new cache entries are created with different `authenticatedAt`. Old entries become orphaned but are only evicted when they reach the front of the insertion order.
**Concrete failure scenario:** 500 active users' tokens refresh, creating 500 stale + 500 fresh entries. Cache bloats to 1000 entries.
**Fix:** Clean up expired entries in `setCachedAuthUser` before checking size.
**Cross-agent signal:** New finding not in prior reviews.

## Carried Forward from Prior Cycle-18 Aggregate (AGG-1 through AGG-8)

The following findings from `rpf-cycle-18-aggregate.md` are carried forward unchanged:

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| AGG-1(c18) | Inconsistent locale handling in number formatting | MEDIUM/MEDIUM | Open |
| AGG-2(c18) | Access code share link missing locale prefix | LOW/MEDIUM | Open |
| AGG-3(c18) | Practice page progress-filter in-JS filtering at scale | MEDIUM/MEDIUM | Open |
| AGG-4(c18) | Hardcoded English error string in api-keys clipboard | LOW/MEDIUM | Open |
| AGG-5(c18) | `userId!` non-null assertion in practice page | LOW/MEDIUM | Open |
| AGG-6(c18) | Copy-code-button no error feedback on clipboard failure | LOW/LOW | Open |
| AGG-7(c18) | Practice page component exceeds 700 lines | LOW/MEDIUM | Open |
| AGG-8(c18) | Recruiting invitations panel `min` date uses client time | LOW/LOW | Open |

## Verified Safe / No Regression Found

- All prior cycle fixes (cycles 15-17) confirmed working.
- `verifyAndRehashPassword` transparently migrates bcrypt to argon2id.
- `db/cleanup.ts` uses canonical retention config and respects legal hold.
- SSE connection tracking uses O(1) per-user count lookup.
- `computeSingleUserLiveRank` avoids full leaderboard recomputation.
- No `as any` type casts, no `@ts-ignore`, no `@ts-expect-error`.
- No silently swallowed catch blocks without legitimate reason.
- CSRF protection is consistent across all mutation routes.
- HTML sanitization uses DOMPurify with strict allowlists.
- Password hashing uses Argon2id with OWASP-recommended parameters.

## Agent Failures

None. Review completed from all required angles (code quality, security, performance, architecture, correctness, testing, data integrity).

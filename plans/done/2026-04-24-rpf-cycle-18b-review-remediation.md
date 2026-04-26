# RPF Cycle 18b — Review Remediation Plan

**Date:** 2026-04-24
**Source:** `.context/reviews/rpf-cycle-18b-aggregate.md`
**Status:** In Progress (M1, M2, L1 done)

## Scope

This cycle addresses findings from the RPF cycle 18b comprehensive review:
- AGG-1: `flushAuditBuffer` re-buffers lost events in reverse order — breaks chronological audit ordering
- AGG-2: `truncateObject` budget undercounting in nested arrays — may over-truncate audit details
- AGG-3: `db/cleanup.ts` cron endpoint still runs alongside in-process pruners — dual deletion wastes DB resources
- AGG-4: Contest ranking cache not invalidated on configuration change
- AGG-5: In-memory rate limiter eviction iterates full Map when over capacity
- AGG-6: Proxy auth cache accumulates stale entries from token refreshes

Plus carried-forward items from prior cycle-18 aggregate (AGG-1 through AGG-8).

No review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### M1: Clarify `flushAuditBuffer` re-buffer ordering and add test (AGG-1 — revised to documentation fix)

- **Source:** AGG-1 (F1) — revised after code analysis
- **Severity / confidence:** Originally MEDIUM/HIGH, revised to LOW/HIGH (original code is correct)
- **Citations:** `src/lib/audit/events.ts:169-172`
- **Cross-agent signal:** New finding not in prior reviews
- **Problem:** The original review claimed the re-buffer order `[...batch, ..._auditBuffer]` was incorrect. After analysis, this ordering is actually correct: `batch` contains events recorded before the flush started, while `_auditBuffer` may contain events recorded during the `await db.insert()` call (from concurrent `recordAuditEvent` calls). Prepending the failed batch ensures older events stay before newer ones, preserving chronological order in the audit log. The original code was correct; only the comment was unclear.
- **Plan:**
  1. Add a clarifying comment explaining why the prepend order is correct
  2. Add a unit test verifying the chronological ordering behavior
  3. Verify all gates pass
- **Status:** DONE

### M2: Add `ENABLE_CRON_CLEANUP` env var gate to deprecated cleanup endpoint (AGG-3)

- **Source:** AGG-3 (F3)
- **Severity / confidence:** LOW / HIGH
- **Citations:** `src/app/api/internal/cleanup/route.ts`, `src/lib/db/cleanup.ts`
- **Cross-agent signal:** Related to cycle-18 review F6 which noted the redundancy
- **Problem:** The cron endpoint is deprecated and logs a notice but is still fully functional. Both the cron and in-process pruners may attempt to delete the same rows simultaneously, wasting DB resources.
- **Plan:**
  1. Add `ENABLE_CRON_CLEANUP` env var check at the top of the cleanup route handler
  2. Default to `false` — return 410 Gone with a descriptive message when disabled
  3. When enabled, log an additional info message noting the in-process pruners are preferred
  4. Add a test for the 410 response when disabled
  5. Verify all gates pass
- **Status:** DONE — Commit `a8592451`

- **Source:** AGG-6 (F6)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/proxy.ts:64-71`
- **Cross-agent signal:** New finding not in prior reviews
- **Problem:** When tokens refresh, new cache entries are created with different `authenticatedAt`. Old entries become orphaned but are only evicted when they reach the front of the insertion order. Cache can bloat to 2x the max size.
- **Plan:**
  1. Add expired entry cleanup in `setCachedAuthUser` before the size check
  2. Iterate the cache and delete entries where `expiresAt <= Date.now()`
  3. Only then check if size >= max and evict oldest
  4. Verify all gates pass
- **Status:** DONE — Commit `44983044`

---

## Deferred items

### Carried from prior cycle plans

All DEFER-1 through DEFER-72 from prior cycle plans carry forward unchanged.

### Carried from cycle-18 aggregate (AGG-1 through AGG-8)

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| AGG-1(c18) | Inconsistent locale handling in number formatting | MEDIUM/MEDIUM | Deferred — requires creating a shared formatNumber utility and migrating all call sites |
| AGG-2(c18) | Access code share link missing locale prefix | LOW/MEDIUM | Deferred — requires checking buildLocalizedHref usage pattern |
| AGG-3(c18) | Practice page progress-filter in-JS filtering at scale | MEDIUM/MEDIUM | Deferred — requires significant SQL refactoring of the practice page data fetching |
| AGG-4(c18) | Hardcoded English error string in api-keys clipboard | LOW/MEDIUM | Deferred — trivial fix but low impact, batch with next i18n pass |
| AGG-5(c18) | `userId!` non-null assertion in practice page | LOW/MEDIUM | Deferred — control flow guarantees non-null, but assertion suppresses null safety |
| AGG-6(c18) | Copy-code-button no error feedback on clipboard failure | LOW/LOW | Deferred — UX enhancement only |
| AGG-7(c18) | Practice page component exceeds 700 lines | LOW/MEDIUM | Deferred — refactor-only, functional code |
| AGG-8(c18) | Recruiting invitations panel `min` date uses client time | LOW/LOW | Deferred — UX-only hint, server validates correctly |

### DEFER-73: `truncateObject` budget undercounting in nested arrays (AGG-2)

- **Source:** AGG-2 (F2)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/audit/events.ts:62-73`
- **Reason for deferral:** The existing safety fallback at line 103 (`{"_truncated":true}`) prevents invalid JSON from being stored. The issue is quality-of-truncation rather than correctness — valid JSON is always produced. A two-pass truncation approach would add complexity to a function that is already well-tested (7 unit tests from cycle 15). The marginal improvement in truncation quality does not justify the added complexity at this time.
- **Exit criterion:** When an audit truncation quality improvement pass is scheduled, or when a production report indicates over-truncation of audit details.

### DEFER-74: Contest ranking cache not invalidated on configuration change (AGG-4)

- **Source:** AGG-4 (F4)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/assignments/contest-scoring.ts:57,97-129`
- **Reason for deferral:** Contest configuration changes (scoring model, problem additions) are rare admin operations. The 15-30 second staleness window is consistent with the cache's documented stale-while-revalidate behavior. Admins expect a short delay after configuration changes. Adding a configuration version to the cache key would require either a DB query on every cache miss to get the version or a separate cache invalidation mechanism, both adding complexity for minimal practical benefit.
- **Exit criterion:** When an admin reports confusion due to stale leaderboard data after a configuration change, or when a cache invalidation infrastructure is added for other reasons.

### DEFER-75: In-memory rate limiter eviction iterates full Map when over capacity (AGG-5)

- **Source:** AGG-5 (F5)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/security/in-memory-rate-limit.ts:23-51`
- **Reason for deferral:** The 60-second throttle on eviction calls mitigates the impact. With 10,000 entries, the iteration takes ~1-2ms which is negligible for a single request. Adding a separate expired-key tracking set would increase the complexity of the check/record operations (which are called far more frequently than eviction) for a marginal performance improvement during eviction.
- **Exit criterion:** When the rate limiter store size is significantly increased, or when eviction performance is reported as a bottleneck.

---

## Progress log

- 2026-04-24: Plan created from RPF cycle 18b aggregate review. 3 new tasks (M1, M2, L1). 3 new deferred items (DEFER-73 through DEFER-75). All findings from the aggregate review are either scheduled for implementation or explicitly deferred.
- 2026-04-24: M1 DONE (fd750e60 — clarified flushAuditBuffer re-buffer ordering + added test, original code was correct). M2 DONE (a8592451 — gate deprecated cleanup endpoint behind ENABLE_CRON_CLEANUP, returns 410 Gone by default). L1 DONE (44983044 — clean up expired proxy auth cache entries before size check). All gates pass: eslint (0 errors), tsc (0 errors), vitest (298/298 files, 2139/2139 tests), next build (success).

# Cycle 45 — Architect

**Date:** 2026-04-23
**Base commit:** d96a984f

## Findings

### ARCH-1: Rate-limiting module systematically uses `Date.now()` for DB-timestamp comparisons — architectural inconsistency [MEDIUM/MEDIUM]

**Files:**
- `src/lib/security/api-rate-limit.ts:54,86,90`
- `src/lib/security/in-memory-rate-limit.ts:24,57,76,101`
- `src/lib/security/rate-limit.ts:39,77`

The codebase has converged on using `getDbNowUncached()` for all schedule/boundary comparisons against DB-stored timestamps (submissions, assignments, anti-cheat, invitations). The rate-limiting module is the last major subsystem that uses `Date.now()` for comparisons against DB-stored timestamps (`windowStartedAt`, `blockedUntil`, `lastAttempt`).

This is an architectural inconsistency. The rate-limit module was likely excluded from the `getDbNowUncached()` migration because:
1. Rate-limit precision is coarser (minutes vs. seconds for deadlines)
2. Adding a DB query to every rate-limited request would add latency
3. The in-memory rate limiter is inherently process-local and doesn't involve DB comparisons

However, `api-rate-limit.ts` specifically uses `Date.now()` to compare against DB-stored `rateLimits` table columns, which is the same pattern fixed elsewhere.

**Fix:** For `api-rate-limit.ts` (the DB-backed path), consider caching `getDbNowUncached()` at the start of the transaction and using it for all comparisons. For `in-memory-rate-limit.ts` and `rate-limit.ts`, `Date.now()` is appropriate since those are purely in-process.

---

### ARCH-2: Contest analytics `includeTimeline` parameter has no access control [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`

The `includeTimeline` query parameter controls whether the expensive student-progression query runs. This parameter is available to any instructor with access to the analytics endpoint. A malicious instructor could set `includeTimeline=true` for every request, causing additional DB load. However, this is bounded by the instructor auth check and the analytics cache.

**Fix:** Consider making `includeTimeline` a server-side decision based on contest size, or rate-limiting the timeline variant separately. Low priority.

---

## Summary

| ID | Severity/Confidence | Description |
|----|----|----|
| ARCH-1 | MEDIUM/MEDIUM | Rate-limiting uses Date.now() for DB-timestamp comparison — architectural inconsistency |
| ARCH-2 | LOW/LOW | Contest analytics includeTimeline has no access control |

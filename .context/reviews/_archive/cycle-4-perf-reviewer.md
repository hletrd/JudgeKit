# Cycle 4 — Performance Reviewer Findings

> Generated: 2026-05-14
> Reviewer: single-pass comprehensive review (no registered subagents available)
> Scope: Database queries, SSE polling, exports, container execution
> Base commit: bc7e5998

---

## Summary

No new CRITICAL, HIGH, or MEDIUM findings. All prior performance findings from the cycle-4 inner loop have been verified as fixed.

## Verified Fixes

| ID | Severity | File | Finding | Status |
|----|----------|------|---------|--------|
| F1 | HIGH | `src/app/api/v1/contests/[assignmentId]/export/route.ts` | Contest export loads all ranking entries without limit | FIXED — `MAX_EXPORT_ENTRIES = 10_000` hard cap with truncation flag |
| F3 | MEDIUM | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts` | `getAssignmentStatusRows` unbounded | FIXED — `MAX_EXPORT_ROWS = 10_000` hard cap with truncation flag |
| F2 | MEDIUM | `src/app/api/v1/submissions/route.ts` | Dual queries for count + data | FIXED — offset path uses `COUNT(*) OVER()` single query |

## Known Deferred Performance Issues (Unchanged)

### F4 — SSE `sharedPollTick` Unbounded `inArray` Query
- **Severity:** LOW (deferred from cycle 7)
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:224-232`
- **Status:** Unchanged. The shared poll tick still queries all active submission IDs in a single `inArray`. With 500 concurrent connections, this creates an IN clause with 500 IDs. Acceptable for current load; batching or status-based querying would improve scalability.

### F5 — Anti-Cheat Heartbeat Gap Detection Memory Usage
- **Severity:** LOW (deferred from prior cycle)
- **File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:200-209`
- **Status:** Unchanged. Fetches up to 5,000 heartbeat rows and reverses in memory. The comment justifies this as covering ~83 hours at 60s intervals. For long contests, a SQL `LAG()` window function would be more efficient but requires schema/index verification.

## Performance Observations

1. **Compiler execution** uses `pLimit(Math.max(cpus().length - 1, 1))` to cap concurrent Docker containers — appropriate for the host resource profile.
2. **SSE connection tracking** uses O(1) per-user count index (`userConnectionCounts` Map) alongside the main tracking Map — avoids O(n) iteration on each connection.
3. **Stale threshold caching** in SSE cleanup uses 5-minute TTL to avoid `getConfiguredSettings()` DB queries on every cleanup tick.

## Conclusion

Performance posture is stable. Export OOM risks have been mitigated. No new performance regressions identified.

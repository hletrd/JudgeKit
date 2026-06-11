# Cycle 15 — Performance Reviewer Perspective

**Date:** 2026-05-11
**HEAD reviewed:** `af634e63`
**Reviewer:** perf-reviewer (single-agent comprehensive review)
**Prior aggregate:** `_aggregate-cycle-14.md`

---

## Methodology

- Examined module-level caches for TTL bounds and memory leaks.
- Verified `Promise.all` error handling across all call sites.
- Verified `Date.now()` usage — all are either in-memory cache TTL (acceptable) or
  client-side code where DB time is unavailable.
- Verified `Math.random()` usage — only in UI skeleton jitter and polling jitter (acceptable).
- Verified SSE coordination and polling patterns.
- Verified anti-cheat dashboard query (deferred from prior cycle).
- Checked for N+1 queries and unbounded result sets.

---

## Findings

**0 new findings.**

### Areas reviewed with no issues found

1. **Module-level caches** — All verified:
   - `src/lib/system-settings-config.ts` — TTL-bounded with `Date.now()` (in-memory only).
   - `src/lib/capabilities/cache.ts` — TTL-bounded role cache.
   - `src/proxy.ts` — Auth user cache with expiration timestamp.
   - Static data (Set of statuses, language maps) — no TTL needed.
   No unbounded caches found.

2. **`Promise.all` usage** — All call sites verified:
   - Parallel DB queries in layout/data loaders — properly awaited.
   - `src/lib/data-retention-maintenance.ts` — uses `Promise.allSettled` for isolation.
   - `src/lib/docker/client.ts` — parallel container operations with proper error propagation.
   No issues found.

3. **SSE coordination** — `sharedPollTick` uses `inArray` with subscriber IDs. Prior cycle
   flagged unbounded IN clause (M2 in old aggregate). Still present but deferred under
   `ARCH-CARRY-2` with exit criterion "SSE perf cycle OR > 500 concurrent". Current
   concurrency is well below threshold. No new issues.

4. **Polling patterns** — Client-side polling uses `AbortController` (fixed in prior cycle).
   Jitter is bounded (`Math.floor(Math.random() * 500)` in `use-visibility-polling.ts`).
   No thundering-herd risk.

5. **Database queries** — No new N+1 patterns. All list endpoints use pagination with LIMIT/OFFSET.
   Search queries use `LIKE` with `ESCAPE` (properly parameterized via Drizzle ORM).

---

## Conclusion

No new performance issues found in cycle 15. All prior performance-related items remain
in their deferred states with appropriate exit criteria.

# Critic Pass — RPF Cycle 3/100

**Date:** 2026-04-27
**Lane:** critic
**Scope:** Multi-perspective critique of the working tree, with emphasis on cycle-2 commits and the residual deferred-item surface

## Summary

The cycle-2 commits land cleanly and resolve every cycle-2-aggregate finding. Tests, lint, and build are green. The most useful cycle-3 critique angles are (a) opportunistic test-quality improvements that the cycle-2 test suite revealed, (b) the `_refreshingKeys/_lastRefreshFailureAt` cohesion gap that cycle 2 deferred and that's now visible in two test cases, and (c) the rotation/timing of the cycle-by-cycle plan archive (lots of `plans/open/*` entries from cycles 22–48 still sitting open).

## Findings

### CRIT3-1: [LOW] `plans/open/` directory has 80+ unarchived plan files, many fully-implemented

**Files:** `plans/open/*.md` (80+ files)
**Confidence:** HIGH

The `plans/open` directory holds plans from cycles 1 through 54+. Most have all tasks marked `[x]` in their headers but have not been moved to `plans/done/`. This makes it harder to find the active plan for the current cycle and clutters the archive surface.

Sampling shows:
- `plans/open/2026-04-22-rpf-cycle-1-review-remediation.md` (cycle 1 done)
- `plans/open/2026-04-22-rpf-cycle-2-review-remediation.md` (cycle 2 done)
- `plans/open/2026-04-22-rpf-cycle-3-review-remediation.md` (cycle 3 done)
- ... and so on.

Without an explicit cleanup pass, the open dir grows monotonically.

**Failure scenario:** Discoverability — finding "the current cycle's open plan" requires manual filtering. New contributors looking at `plans/open/` see ~80 entries instead of the live ones.

**Fix:** This cycle, do a single grep across `plans/open/` for plans whose tasks are all `[x]` and move them to `plans/done/`. Defer the bulk archive to a single grep-driven housekeeping commit.

**Note:** Earlier cycles already attempted this. The pattern recurs because each cycle adds a new plan and only sometimes archives the one it implements. Establish: each cycle archives the plan from N-2 cycles back if all tasks `[x]`.

---

### CRIT3-2: [LOW] `_lastRefreshFailureAt` is a `Map` but `_refreshingKeys` is a `Set` — same key space, different containers

**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:20-24`
**Confidence:** MEDIUM

Both structures use `cacheKey = assignmentId` as the key. The `Set` records "this key has a refresh in flight", the `Map` records "this key's last refresh failed at ms-time". They're correlated:

- A failed refresh transitions: `Set has key` (during compute) → on error: `Set delete key`, `Map set key=now`.
- A successful refresh: `Set has key` → `Set delete key`, `Map delete key`.

Using a single `Map<string, RefreshState>` where `RefreshState = { inFlight: boolean, lastFailureMs: number | null }` would consolidate the truth.

**Failure scenario:** No current bug. But two structures mean two places to forget to clean up — e.g., if a future refactor adds a code path that leaves `Set has key` but not `Map`, debugging the discrepancy is harder.

**Fix:** Defer to ARCH3-1 (analytics cache encapsulation). Track jointly.

---

### CRIT3-3: [LOW] Cycle-2 plan didn't include a stress test for the cooldown/dedup interaction at scale

**File:** `tests/unit/api/contests-analytics-route.test.ts`
**Confidence:** LOW

The 7 tests cover the happy path, dedup, cooldown, and DB-time fallback in isolation. They don't cover:
- 100 concurrent GETs hitting the same stale cache key (would `Set has` race? Should not, JS is single-threaded, but worth a test).
- Multiple distinct cache keys experiencing cooldown simultaneously (memory growth bound).
- TTL expiry during a stale-with-refresh-pending window (LRU eviction of the entry while the refresh is in flight — does the refresh write back end up resurrecting a key that should be evicted?).

**Failure scenario:** Theoretical — JS is single-threaded so the race in (1) is benign. (3) is the most interesting: if cache key X expires while refresh is in flight, the in-flight refresh's `analyticsCache.set(...)` will repopulate after eviction. Per LRU semantics this is fine; the entry just gets a new createdAt and resumes serving.

**Fix:** Defer. Current tests cover the well-known paths; deeper concurrency tests are a future hardening cycle.

---

### CRIT3-4: [INFO] cycle-3 review fan-out has a smaller actionable surface than cycle 1 or 2

**Confidence:** N/A (informational)

This is mathematically expected: each cycle's review pass fixes the high-severity items, leaving smaller residue. Cycles 1–2 cleaned the high-impact analytics + cookie clearing surface. Cycle 3 is a "background" cycle.

Three sensible cycle-3 priorities:
1. Plan archive cleanup (CRIT3-1).
2. Lightweight cosmetic items (CR3-2 underscore convention) IF time permits.
3. Workspace-to-public migration progress IF a clean slice surfaces during the broader review.

If none of these surface, defer cycle 3 implementation tasks and document the steady-state in the cycle plan.

## Verification Notes

- Verified: `npm run lint` clean, `npm run test:unit` green for the analytics suite, build passes (cycle 2 baseline still holds).
- Verified: cycle-2 plan correctly marks all 6 tasks `[x]` and references commit hashes that exist in `git log`.
- Plans/open count: 80 files (substantial).

## Confidence

- LOW: CRIT3-1 (plan dir cleanup), CRIT3-2 (cohesion deferred), CRIT3-3 (test coverage gap).
- INFO: CRIT3-4 (cycle steady-state observation).

No HIGH-severity findings. Cycle 3's "real" fixable item is the plan-directory cleanup; everything else is deferred carryover from earlier cycles.

# Perf Reviewer — RPF Cycle 5/100

**Date:** 2026-04-26
**Lens:** performance, concurrency, CPU/memory, UI responsiveness, deploy hot-paths
**Files inventoried:** Same as architect.md.

---

## PERF5-1: [LOW, actionable, NEW] Drizzle-kit `npm install` runs on every deploy

**Severity:** LOW
**Confidence:** HIGH

**Evidence:** `deploy-docker.sh:564`
```sh
sh -c 'npm install --no-save drizzle-kit drizzle-orm nanoid 2>&1 | tail -1 && npx drizzle-kit push'
```
This runs `npm install --no-save` for `drizzle-kit + drizzle-orm + nanoid` inside a fresh `node:24-alpine` container on every deploy. ~150 packages, 30-60s of network/CPU.

**Why it's a problem:** Every deploy slows by 30-60s for transitive dep install in a throwaway container. With per-cycle deploy mode this multiplies across the loop.

**Fix:** Mount the project's `node_modules` (the host already resolves `drizzle-kit` via `npm run db:push`) or build a small image with drizzle-kit pre-installed. Or use the app's own `next` image which already has it.

**Exit criteria:** Deploy runtime measurably faster (>20s shaved). No correctness regression (drizzle-kit version still matches the project's pinned version).

---

## PERF5-2: [LOW, NEW] `formatDetailsJson` parses + reformats JSON on every render of expanded row

**Severity:** LOW
**Confidence:** MEDIUM

**Evidence:** `src/components/contest/anti-cheat-dashboard.tsx:91-105,558-559`. `JSON.parse + JSON.stringify` invoked on every component render (sort, filter, polling refresh) for each event row that has details and is currently expanded.

**Why it's a problem:** With the page polling every 30s and 100-500 events potentially expanded, each render is N JSON parses. Negligible for 10 rows but cumulative for instructors who expand many.

**Fix:** Memoize per-event with a `useMemo` keyed on `filteredEvents`, or compute the formatted strings once at fetch time.

**Exit criteria:** A profile shows formatDetailsJson invocations no longer scale with re-render count.

---

## PERF5-3: [LOW, NEW] Tests `import @/app/...analytics/route` repeatedly via `vi.resetModules()` — slow cold-start path

**Severity:** LOW
**Confidence:** MEDIUM

**Evidence:** `tests/unit/api/contests-analytics-route.test.ts:74-79,127,146,182,207,234`. Each test calls `callRoute` once or twice with `vi.resetModules()` between, re-instantiating the route module + its transitive imports each time. The test file is slow relative to its assertion count.

**Why it's a problem:** Test suite drag. The pattern is correct (need fresh module-level cache per cooldown test) but expensive.

**Fix:** Either (a) use `__test_internals.cacheDelete()` to scope state-resets to a single key without `vi.resetModules()`, or (b) restructure tests to share a single module instance.

**Exit criteria:** Test file runs ≥30% faster. All cooldown/staleness invariants still asserted.

---

## PERF5-4: [LOW, deferred-carry] LRU `dispose` hook fires on `set` (overwrite) — cycle-4 docstring covers this

`src/app/api/v1/contests/[assignmentId]/analytics/route.ts:37-46` — comprehensive docstring. No action.

---

## Final Sweep

- No new perf regressions in the recently-touched code.
- The LRU + dispose hook + Date.now staleness check changes from cycles 2-3 are measurable wins (cache hits no longer take a DB round-trip).
- `loadPendingEvents.slice(0, 200)` cap from cycle 4 prevents pathological iteration cost.
- All gates green: lint 0 errors, test:unit 2232 pass, build EXIT=0.

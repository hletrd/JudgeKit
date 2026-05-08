# Aggregate Review — Cycle 47

**Date:** 2026-04-25
**Reviewers:** comprehensive-reviewer (fresh pass)
**Total findings:** 4 new (1 MEDIUM, 3 LOW) + 0 false positives + 24 carried deferred re-validated + prior cycle findings confirmed fixed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `Math.max(...array)` on unbounded data in frontend chart components — 4 remaining instances

**Sources:** NEW-1 | **Confidence:** MEDIUM

The same `Math.max(...array)` pattern that was fixed in `contest-scoring.ts` (cycle 46 AGG-3) still exists in 4 frontend locations:

1. `src/components/contest/analytics-charts.tsx:77` — `Math.max(...data.map((d) => d.value), 1)` in SVGBarChart
2. `src/components/contest/analytics-charts.tsx:308` — `Math.max(...data.flatMap((p) => [p.medianMinutes, p.meanMinutes]), 1)` in SolveTimeChart
3. `src/components/contest/score-timeline-chart.tsx:47` — `Math.max(...selected.points.map((point) => point.totalScore), 1)`
4. `src/app/(dashboard)/dashboard/contests/[assignmentId]/students/[userId]/page.tsx:114` — `Math.max(...problemSubs.map((s) => s.score ?? 0))`

**Concrete failure scenario:** A contest with an extremely large number of submissions or a data bug in the analytics API response with 100,000+ items causes `Math.max(...array)` to throw `RangeError: Maximum call stack size exceeded`. The analytics page or student detail page crashes with an unhandled error.

**Fix:** Replace `Math.max(...arr, fallback)` with `arr.reduce((max, v) => Math.max(max, v), fallback)` in all four locations, consistent with the fix applied to `contest-scoring.ts` in cycle 46.

---

### AGG-2: [LOW] `anti-cheat-monitor.tsx` inline retry callback duplicates flush logic

**Sources:** NEW-2 | **Confidence:** MEDIUM

`src/components/exam/anti-cheat-monitor.tsx:117-131` — The cycle 46 fix added an inline retry callback inside `flushPendingEvents` that duplicates the flush logic (load events, send, save remaining) rather than reusing `flushPendingEvents`. The comment explains this avoids a circular dependency, but the duplication means bug fixes to the flush logic must be applied in two places.

**Concrete failure scenario:** A future change to the flush logic (e.g., adding deduplication) is applied to `flushPendingEvents` but the inline retry callback is missed, causing inconsistent behavior between the initial flush and retries.

**Fix:** Extract the flush logic into a standalone function that both `flushPendingEvents` and the retry callback can call.

---

### AGG-3: [LOW] `image-processing.ts` `MAX_INPUT_BUFFER_BYTES` is not configurable

**Sources:** NEW-3 | **Confidence:** LOW

`src/lib/files/image-processing.ts:13` — The `MAX_INPUT_BUFFER_BYTES` constant is hardcoded at 10MB. Other system limits are configurable via `getConfiguredSettings()` backed by the database. This inconsistency means the image size limit cannot be adjusted without a code change and deployment.

**Concrete failure scenario:** A deployment needs to accept 20MB images for a photography course. They must modify the source code and redeploy, while all other limits can be changed via the admin settings UI.

**Fix:** Consider making `MAX_INPUT_BUFFER_BYTES` configurable via the system settings, or at minimum via an environment variable.

---

### AGG-4: [LOW] `bulk-delete/route.ts` does not enforce maximum number of file IDs

**Sources:** NEW-4 | **Confidence:** LOW

`src/app/api/v1/files/bulk-delete/route.ts:22` — The `fileDeleteSchema` validates the structure but has no upper bound on the number of file IDs in `body.ids`. An admin could send a request with thousands of file IDs, generating a large `IN` clause and sequential disk deletion loop.

**Concrete failure scenario:** An admin selects all files and clicks "delete all" — the request contains 10,000+ file IDs, causing a slow SQL query and disk I/O spike.

**Fix:** Add a maximum array length to `fileDeleteSchema` (e.g., `z.array(z.string()).max(500)`).

---

## Previously Fixed Items (confirmed in current code)

All prior cycle 46 fixes verified:
- AGG-1 (cycle 46): `anti-cheat-monitor.tsx` schedules retry after partial flush failure — confirmed
- AGG-2 (cycle 46): `image-processing.ts` has buffer size check and `limitInputPixels` — confirmed
- AGG-3 (cycle 46): `contest-scoring.ts` uses `reduce` instead of `Math.max(...)` spread — confirmed

---

## Carried Deferred Items (unchanged from cycle 46)

- DEFER-22: `.json()` before `response.ok` — 60+ instances
- DEFER-23: Raw API error strings without translation — partially fixed
- DEFER-24: `migrate/import` unsafe casts — Zod validation not yet built
- DEFER-27: Missing AbortController on polling fetches
- DEFER-28: `as { error?: string }` pattern — 22+ instances
- DEFER-29: Admin routes bypass `createApiHandler`
- DEFER-30: Recruiting validate token brute-force
- DEFER-32: Admin settings exposes DB host/port
- DEFER-33: Missing error boundaries — contests segment now fixed
- DEFER-34: Hardcoded English fallback strings
- DEFER-35: Hardcoded English strings in editor title attributes
- DEFER-36: `formData.get()` cast assertions
- DEFER-43: Docker client leaks `err.message` in build responses (addressed by cycle 39 AGG-1)
- DEFER-44: No documentation for timer pattern convention
- DEFER-45: Anti-cheat monitor captures user text snippets (design decision — partially fixed in cycle 38)
- DEFER-46: `error.message` as control-flow discriminator across 15+ API catch blocks
- DEFER-47: Import route JSON path uses unsafe `as JudgeKitExport` cast
- DEFER-48: CountdownTimer initial render uses uncorrected client time
- DEFER-49: SSE connection tracking uses O(n) scan for oldest-entry eviction
- DEFER-50: [LOW] `in-memory-rate-limit.ts` `maybeEvict` triggers on every rate-limit call
- DEFER-51: [LOW] `contest-scoring.ts` ranking cache mixes `Date.now()` staleness check with `getDbNowMs()` writes
- DEFER-52: [LOW] `buildDockerImageLocal` accumulates stdout/stderr up to 2MB with string slicing (partially addressed by cycle 45 AGG-2 head+tail)
- DEFER-53: [LOW] `in-memory-rate-limit.ts` `maybeEvict` double-scans expired entries on capacity overflow (addressed by cycle 45 AGG-1 single-pass)
- DEFER-54: [LOW] `recruiting/request-cache.ts` `setCachedRecruitingContext` mutates ALS store without userId match check

Cycle 46 new deferred items also carried:
- DEFER-55: [LOW] `countdown-timer.tsx` no retry on server time fetch failure
- DEFER-56: [LOW] `similarity-check/route.ts` fragile `AbortError` detection

Reason for deferral unchanged. See cycle 46 aggregate for details.

---

## No Agent Failures

The comprehensive review completed successfully.

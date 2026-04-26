# RPF Cycle 47 — Review Remediation Plan

**Date:** 2026-04-25
**Cycle:** 47/100
**Base commit:** 7d469aab (current HEAD)
**Review artifacts:** `.context/reviews/rpf-cycle-47-comprehensive-review.md` + `.context/reviews/_aggregate-cycle-47.md`

## Previously Completed Tasks (Verified in Current Code)

All prior cycle 46 tasks are complete:
- [x] Task A: Fix `image-processing.ts` input size validation and pixel limit — commit b2131977
- [x] Task B: Fix anti-cheat monitor retry gap after partial flush failure — commit 67c1ae2f
- [x] Task C: Replace `Math.max(...array)` with safe alternative in `contest-scoring.ts` — commit f4bf0649

## False Positive Withdrawn

- **AGG-4 (NEW-4):** `bulk-delete/route.ts` no max on file IDs — **WITHDRAWN**. Upon checking `src/lib/validators/files.ts:4`, `fileDeleteSchema` already has `.max(100)` on the `ids` array. The review incorrectly stated there was no upper bound.

## Tasks (priority order)

### Task A: Replace `Math.max(...array)` with safe alternative in frontend chart components [MEDIUM/MEDIUM]

**From:** AGG-1 (NEW-1)
**Severity / confidence:** MEDIUM / MEDIUM
**Files:**
- `src/components/contest/analytics-charts.tsx:77`
- `src/components/contest/analytics-charts.tsx:308`
- `src/components/contest/score-timeline-chart.tsx:47`
- `src/app/(dashboard)/dashboard/contests/[assignmentId]/students/[userId]/page.tsx:114`

**Problem:** The same `Math.max(...array)` pattern that was fixed in `contest-scoring.ts` (cycle 46 AGG-3) still exists in 4 frontend locations. The spread operator throws `RangeError` on arrays with more than ~65536 elements.

**Plan:**
1. In `analytics-charts.tsx:77`, replace `Math.max(...data.map((d) => d.value), 1)` with `data.map((d) => d.value).reduce((max, v) => Math.max(max, v), 1)`
2. In `analytics-charts.tsx:308`, replace `Math.max(...data.flatMap((p) => [p.medianMinutes, p.meanMinutes]), 1)` with `data.flatMap((p) => [p.medianMinutes, p.meanMinutes]).reduce((max, v) => Math.max(max, v), 1)`
3. In `score-timeline-chart.tsx:47`, replace `Math.max(...selected.points.map((point) => point.totalScore), 1)` with `selected.points.map((point) => point.totalScore).reduce((max, v) => Math.max(max, v), 1)`
4. In `students/[userId]/page.tsx:114`, replace `Math.max(...problemSubs.map((s) => s.score ?? 0))` with `problemSubs.map((s) => s.score ?? 0).reduce((max, v) => Math.max(max, v), 0)`
5. Verify all gates pass

**Status:** DONE — commit 88d96b1e

---

### Task B: Extract duplicated flush logic in anti-cheat monitor to eliminate maintenance risk [LOW/MEDIUM]

**From:** AGG-2 (NEW-2)
**Severity / confidence:** LOW / MEDIUM
**Files:**
- `src/components/exam/anti-cheat-monitor.tsx:96-131`

**Problem:** The cycle 46 fix added an inline retry callback inside `flushPendingEvents` (lines 117-131) that duplicates the flush logic rather than reusing it. The duplication means bug fixes to the flush logic must be applied in two places.

**Plan:**
1. Extract a standalone `performFlush(assignmentId: string, sendEvent: (e: PendingEvent) => Promise<boolean>)` function that takes the assignmentId and sendEvent as arguments, loads pending events, sends them, and saves the remaining ones. This function returns the remaining events.
2. Have `flushPendingEvents` call `performFlush` and then handle the retry scheduling if needed
3. Have the inline retry callback also call `performFlush` instead of duplicating the logic
4. Verify all gates pass

**Status:** DONE — commit 44ff047a

---

## Deferred Items

### Carried deferred items from cycle 46 (unchanged):

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
- DEFER-55: [LOW] `countdown-timer.tsx` no retry on server time fetch failure
- DEFER-56: [LOW] `similarity-check/route.ts` fragile `AbortError` detection

### New deferred items this cycle:

- AGG-3 (NEW-3): `image-processing.ts` `MAX_INPUT_BUFFER_BYTES` is not configurable — deferred as LOW severity and LOW confidence. The current hardcoded 10MB limit is reasonable for the educational platform use case. Making it configurable would add database query overhead to every image upload (via `getConfiguredSettings()`). An environment variable could work but adds operational complexity for a rarely needed change. Exit criterion: a deployment reports needing a different image size limit, or other system limits are migrated to env-var configuration as a batch effort.

---

## Progress log

- 2026-04-25: Plan created with 2 tasks (A, B). AGG-4 withdrawn (false positive — `.max(100)` already exists). 1 new deferred item.
- 2026-04-25: All 2 tasks implemented. Task A in commit 88d96b1e, Task B in commit 44ff047a. All gates pass.

# RPF Cycle 46 — Review Remediation Plan

**Date:** 2026-04-25
**Cycle:** 46/100
**Base commit:** 5d2fae2e (current HEAD)
**Review artifacts:** `.context/reviews/rpf-cycle-46-comprehensive-review.md` + `.context/reviews/_aggregate-cycle-46.md`

## Previously Completed Tasks (Verified in Current Code)

All prior cycle 45 tasks are complete:
- [x] Task A: Fix `auto-review.ts` source code size check to use `Buffer.byteLength` — commit c3173f69
- [x] Task B: Merge double-scan eviction in `in-memory-rate-limit.ts` into single pass — commit 1b4f0c49
- [x] Task C: Fix `buildDockerImageLocal` truncation to keep head+tail — commit 0a42eb89

## Tasks (priority order)

### Task A: Add input size validation and pixel limit to `image-processing.ts` [MEDIUM/MEDIUM]

**From:** AGG-2 (NEW-3)
**Severity / confidence:** MEDIUM / MEDIUM
**Files:**
- `src/lib/files/image-processing.ts:21-40`

**Problem:** The `processImage` function accepts a `Buffer` of any size and passes it directly to `sharp()`. A maliciously crafted "image bomb" (small compressed size, enormous decompressed pixel dimensions) can cause memory exhaustion before `sharp` rejects it or applies the resize.

**Plan:**
1. Add a `MAX_INPUT_BUFFER_BYTES` constant (10MB) and reject inputs exceeding it
2. Add `limitInputPixels` option to `sharp()` to cap decoded pixel count (e.g., 100 megapixels = 100_000_000)
3. Throw a descriptive error when limits are exceeded, so callers can return a 422/400
4. Check that callers of `processImage` propagate the error appropriately
5. Verify all gates pass

**Status:** DONE — commit b2131977

---

### Task B: Fix anti-cheat monitor retry gap after partial flush failure [MEDIUM/MEDIUM]

**From:** AGG-1 (NEW-2)
**Severity / confidence:** MEDIUM / MEDIUM
**Files:**
- `src/components/exam/anti-cheat-monitor.tsx:96-108, 130-136`

**Problem:** When `flushPendingEvents` is called by the retry timer, it does not schedule its own retry if some events still fail to flush. Pending events accumulate in localStorage without another retry attempt until the next `reportEvent` failure or visibility change.

**Plan:**
1. After `flushPendingEvents` processes pending events, check if `remaining.length > 0` and `remaining.some(e => e.retries < MAX_RETRIES)`
2. If there are still retriable events, schedule a new retry timer with exponential backoff: `RETRY_BASE_DELAY_MS * 2^retryCount` (capped at 30 seconds)
3. Clear the retry timer ref when it fires, same pattern as existing code
4. Ensure the retry timer is properly cleaned up on unmount
5. Verify all gates pass

**Status:** DONE — commit 67c1ae2f

---

### Task C: Replace `Math.max(...array)` with safe alternative in `contest-scoring.ts` [LOW/MEDIUM]

**From:** AGG-3 (NEW-4)
**Severity / confidence:** LOW / MEDIUM
**Files:**
- `src/lib/assignments/contest-scoring.ts:376-378`

**Problem:** The ICPC sort comparator uses `Math.max(...aSolvedTimes)` and `Math.max(...bSolvedTimes)`. The spread operator throws `RangeError` on arrays with more than ~65536 elements.

**Plan:**
1. Replace `Math.max(...aSolvedTimes)` with `aSolvedTimes.reduce((a, b) => Math.max(a, b), 0)` on line 376
2. Replace `Math.max(...bSolvedTimes)` with `bSolvedTimes.reduce((a, b) => Math.max(a, b), 0)` on line 378
3. Verify all gates pass

**Status:** DONE — commit f4bf0649

---

## Deferred Items

### Carried deferred items from cycle 45 (unchanged):

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

### New deferred items this cycle:

- AGG-4 (NEW-5): `countdown-timer.tsx` no retry on server time fetch failure — deferred as LOW severity and LOW confidence. The server time endpoint is lightweight and rarely fails; a retry adds UI complexity (loading state) for a marginal reliability gain. The current fallback (offset = 0) works correctly for students with accurate clocks, and for inaccurate clocks the error is bounded by the clock skew itself. Exit criterion: students report timer inaccuracy after network issues, or DEFER-48 is picked up (which would address the broader uncorrected-time problem).

- AGG-5 (NEW-6): `similarity-check/route.ts` fragile `AbortError` detection — deferred as LOW severity and LOW confidence. The current `error.name === "AbortError"` check works in all current Node.js LTS versions, and the secondary `error.message.includes("timed out")` fallback provides redundancy. Related to DEFER-46 (`error.message` as control-flow discriminator). Exit criterion: DEFER-46 is picked up (which would replace message-based discrimination with typed error classes across all catch blocks), or a Node.js update breaks the current detection.

---

## Progress log

- 2026-04-25: Plan created with 3 tasks (A, B, C). 2 new deferred items this cycle.
- 2026-04-25: All 3 tasks implemented. Task A in commit b2131977, Task B in commit 67c1ae2f, Task C in commit f4bf0649. All gates pass.

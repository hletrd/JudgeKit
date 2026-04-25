# RPF Cycle 44 — Review Remediation Plan

**Date:** 2026-04-26
**Cycle:** 44/100
**Base commit:** 7eaf09fb (current HEAD)
**Review artifacts:** `.context/reviews/comprehensive-reviewer-cycle-44.md` + `.context/reviews/_aggregate-cycle-44.md`

## Previously Completed Tasks (Verified in Current Code)

All prior cycle 43 tasks are complete:
- [x] Task A: Remove `recruit_` username prefix — commit a70c7b1d
- [x] Task B: Fix `getDbNowMs()` failure fallback in contest-scoring — commit b9c661be
- [x] Task C: Add deadline check on already-redeemed re-entry — commit a70c7b1d

## Tasks (priority order)

### Task A: Optimize SSE `addConnection` eviction from O(n^2) to O(n) [MEDIUM/MEDIUM]

**From:** AGG-1 (NEW-1)
**Severity / confidence:** MEDIUM / MEDIUM
**Files:**
- `src/app/api/v1/submissions/[id]/events/route.ts:44-55`

**Problem:** When `connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS` (1000), the `addConnection` function enters a `while` loop that does a full O(n) map scan on each iteration to find the oldest entry. Under burst load, this creates O(n^2) work on the event loop, blocking the Node.js process.

**Plan:**
1. Replace the while-loop + full-map-scan eviction with a single-pass approach: since connections are added roughly in chronological order (connection IDs encode timestamps), use `Map.keys().next().value` to evict the first-inserted entry (oldest by insertion order, which approximates oldest by `createdAt`)
2. Remove the inner `for (const [key, info] of connectionInfoMap)` scan entirely
3. If we need to evict N entries, just pop the first N keys from the Map (O(N) instead of O(N * map.size))
4. Verify all gates pass

**Status:** TODO

---

### Task B: Fix `runDocker` OOM/timeout race to correctly report `oomKilled` [MEDIUM/MEDIUM]

**From:** AGG-2 (NEW-2)
**Severity / confidence:** MEDIUM / MEDIUM
**Files:**
- `src/lib/compiler/execute.ts:444-449, 453-469`

**Problem:** When a container is OOM-killed by Docker and the Node.js timeout also fires, `inspectContainerState` may observe stale container state. The `stopContainer` call is fire-and-forget with `.unref()`, meaning Docker may not have finished processing the kill signal before the inspect runs.

**Plan:**
1. In the `finish` function, after `stopContainer` is called (if the timeout fired), add a short 500ms delay before calling `inspectContainerState` to give Docker time to update the container state
2. Alternatively, wrap `inspectContainerState` in a retry loop (up to 3 attempts with 200ms intervals) that checks whether the container's OOM status has been updated
3. The fix should be minimal — the goal is to give Docker a window to reflect the OOM state before we read it
4. Verify all gates pass

**Status:** TODO

---

### Task C: Add queue length bound to auto-review `reviewLimiter` [LOW/LOW]

**From:** AGG-3 (NEW-3)
**Severity / confidence:** LOW / LOW
**Files:**
- `src/lib/judge/auto-review.ts:12`

**Problem:** `pLimit(2)` limits concurrent AI review API calls to 2, but there is no limit on the number of pending reviews queued. A large contest can queue hundreds of reviews, causing memory pressure and AI API cost spikes.

**Plan:**
1. Add a `MAX_REVIEW_QUEUE_SIZE = 20` constant
2. Before calling `reviewLimiter(async () => {...})`, check the pending count using `reviewLimiter.pending` and `reviewLimiter.activeCount`. If `reviewLimiter.pending + reviewLimiter.activeCount >= MAX_REVIEW_QUEUE_SIZE`, skip the review and log a debug message
3. Verify all gates pass

**Status:** TODO

---

## Deferred Items

### Carried deferred items from cycle 43 (unchanged):

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
- DEFER-52: [LOW] `buildDockerImageLocal` accumulates stdout/stderr up to 2MB with string slicing
- DEFER-53: [LOW] `in-memory-rate-limit.ts` `maybeEvict` double-scans expired entries on capacity overflow
- DEFER-54: [LOW] `recruiting/request-cache.ts` `setCachedRecruitingContext` mutates ALS store without userId match check

### New deferred items this cycle:

- AGG-4 (NEW-4): `countdown-timer.ts` initial render flash — deferred as LOW severity. Related to DEFER-48. The flash is brief (~1 second) and the server time correction is already implemented. Fixing this would require either a loading state (adds UI complexity) or passing corrected deadline from server (requires prop drilling). Exit criterion: students report confusion from the time jump during exams.

- AGG-5 (NEW-5): `contest-scoring.ts` stale-while-revalidate consistency documentation — deferred as LOW severity and LOW confidence. This is a documentation-only finding. The stale-while-revalidate pattern is a well-understood trade-off. Exit criterion: next time the file is modified, add the JSDoc note.

---

## Progress log

- 2026-04-26: Plan created with 3 tasks (A, B, C). 2 new deferred items this cycle.

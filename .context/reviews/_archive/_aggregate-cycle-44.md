# Aggregate Review — Cycle 44

**Date:** 2026-04-25
**Reviewers:** comprehensive-reviewer (fresh pass)
**Total findings:** 5 new (2 MEDIUM, 3 LOW) + 0 false positives + 24 carried deferred re-validated + prior cycle findings confirmed fixed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] SSE events route `addConnection` eviction loop is O(n^2) when tracking map fills up

**Sources:** NEW-1 | **Confidence:** MEDIUM

`src/app/api/v1/submissions/[id]/events/route.ts:44-55` — When `connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS` (1000), the `addConnection` function enters a `while` loop that does a full O(n) map scan on each iteration to find the oldest entry (iterating all entries to find the one with the smallest `createdAt`). Each eviction triggers `removeConnection`, and if multiple entries need evicting (common under burst load), the loop runs multiple times, each with O(n) iteration. Under burst load, this creates O(n^2) work on the event loop.

This is related to DEFER-49 (SSE O(n) scan for stale cleanup) but is a distinct, worse variant: the eviction path does a full O(n) scan *per eviction* synchronously on every new SSE connection when the map is at capacity, whereas DEFER-49 tracks the periodic timer's O(n) scan.

**Concrete failure scenario:** A sudden burst of 200 new SSE connections arrives while the tracking map is at 1000 entries. The while loop runs 200 times, each doing a 1000-entry scan to find the oldest. Total work: 200,000 iterations, all synchronous, blocking the Node.js process for potentially hundreds of milliseconds.

**Fix:** Use a sorted data structure (e.g., a min-heap indexed by createdAt) to make oldest-entry lookup O(1). Alternatively, since connection IDs encode a timestamp component, use `Map.keys().next().value` as an approximation (entries are typically added in chronological order).

---

### AGG-2: [MEDIUM] `compiler/execute.ts` `runDocker` may report `timedOut` instead of `oomKilled` when OOM and timeout race

**Sources:** NEW-2 | **Confidence:** MEDIUM

`src/lib/compiler/execute.ts:444-449, 453-469` — When a container is OOM-killed by Docker and the Node.js timeout also fires (a race condition), the `killed` flag is set to true by the timeout, and `stopContainer` sends a SIGKILL. The `inspectContainerState` call in `finish` may then observe stale container state (if Docker hasn't finished processing the OOM kill) or no state at all (if the container was already removed). This can cause `oomKilled` to be reported as `false` and `timedOut` as `true`, which is misleading for the student.

**Concrete failure scenario:** A student submits memory-intensive C++ code that allocates past the 256MB limit. Docker OOM-kills the container. Before the `child.on("close")` event fires, the Node.js timeout also fires, calling `stopContainer`. The container is removed by Docker before `inspectContainerState` can observe the OOM state. The student sees "timed out" instead of "memory limit exceeded", which is misleading for debugging.

**Fix:** After `stopContainer`, add a small delay (e.g., `await new Promise(r => setTimeout(r, 500))`) before calling `inspectContainerState` to give Docker time to update the container state. Alternatively, use a retry loop for `inspectContainerState`.

---

### AGG-3: [LOW] `auto-review.ts` `reviewLimiter` has no queue length bound, allowing unbounded memory and cost accumulation

**Sources:** NEW-3 | **Confidence:** LOW

`src/lib/judge/auto-review.ts:12` — `pLimit(2)` limits concurrent AI review API calls to 2, but there is no limit on the number of pending reviews queued. If a large contest receives 500 accepted submissions in a short window, all 500 `triggerAutoCodeReview` calls will be queued. Each holds a closure over the submission ID, and when dequeued, it makes a DB query and AI API call. With no bound on queue length, this can lead to memory pressure, AI API cost spikes, and stale reviews for superseded submissions.

**Concrete failure scenario:** A large contest ends with 300 accepted submissions. All 300 trigger auto-review. The `pLimit(2)` queue has 298 pending items. Over the next ~2.5 hours (at ~30s per review with 2 concurrent), reviews are generated for submissions that students may have already improved upon.

**Fix:** Add a maximum queue size to the `reviewLimiter`. Before calling `reviewLimiter(async () => {...})`, check the current pending count. If the queue is full (e.g., > 20 pending), skip the review and log a debug message.

---

### AGG-4: [LOW] `countdown-timer.ts` initial render shows uncorrected client time, causing visible flash

**Sources:** NEW-4 | **Confidence:** MEDIUM (related to DEFER-48)

`src/components/exam/countdown-timer.tsx:46-47` — The initial `useState` calls compute `deadline - Date.now()` before the server time offset is fetched (which happens in the `useEffect` at line 62). The offset is applied in the `recalculate` function at line 97, but the initial render uses `Date.now()` directly. This means the first render shows an incorrect countdown, which then visibly jumps when the offset is applied.

**Concrete failure scenario:** A student taking an exam has a computer clock set 2 minutes behind. The initial render shows 2 extra minutes on the countdown. After ~1 second, the server time is fetched and the countdown adjusts down by 2 minutes. The student sees the time jump, which is confusing during an exam.

**Fix:** Render the timer in a loading/skeleton state until the server time offset is resolved, then show the corrected countdown. Alternatively, pass the server-time-corrected deadline from the server component as a prop.

---

### AGG-5: [LOW] `contest-scoring.ts` stale-while-revalidate may serve different data to concurrent requests during refresh window

**Sources:** NEW-5 | **Confidence:** LOW

`src/lib/assignments/contest-scoring.ts:96-147` — The stale-while-revalidate pattern returns stale data immediately and triggers a background refresh. Different concurrent requests may see different leaderboard data depending on exactly when they arrive relative to the cache update. This is the standard stale-while-revalidate trade-off but the code does not make this consistency model explicit.

**Concrete failure scenario:** Two students in the same contest both view the leaderboard. Student A's request arrives just after the cache is refreshed and sees updated scores. Student B's request arrives just before and sees stale scores. They compare screens and see different rankings.

**Fix:** Document the eventual consistency model in the JSDoc for `getCachedContestRanking`. No code change needed.

---

## Previously Fixed Items (confirmed in current code)

All prior cycle fixes verified:
- AGG-1 (cycle 43): `recruit_` username prefix removed — `username = nanoid(10)` at line 465
- AGG-2 (cycle 43): `getDbNowMs()` failure fallback — nested try-catch with `Date.now()` at lines 132-136
- AGG-3 (cycle 43): Deadline check on already-redeemed re-entry — SQL `deadline > NOW()` at lines 416-420
- AGG-1 (cycle 42): `normalizeSource()` unclosed string handling
- AGG-2 (cycle 42): Template literal handling in `normalizeSource()`
- AGG-1 (cycle 41): `auto-review.ts` source code size cap — `AUTO_REVIEW_MAX_SOURCE_CODE_BYTES = 8192`
- AGG-1 (cycle 40): `getRetentionCutoff` `Date.now()` default removed
- AGG-1 (cycle 39): Docker build stderr sanitized
- AGG-2 (cycle 39): `participant-status.ts` `Date.now()` default removed
- AGG-3 (cycle 39): `JUDGE_WORKER_URL` guard added

---

## Carried Deferred Items (unchanged from cycle 43)

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

Reason for deferral unchanged. See cycle 43 plan for details.

---

## No Agent Failures

The comprehensive review completed successfully.

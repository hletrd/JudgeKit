# Comprehensive Code Review — Cycle 44

**Date:** 2026-04-25
**Reviewer:** comprehensive-reviewer (fresh pass)
**Scope:** Full repository, all source files under `src/`, API routes, lib modules, components, security, and test coverage.

---

## Methodology

1. Built inventory of all review-relevant files (src/lib, src/app, src/components, tests/)
2. Read and analyzed every major module: auth, security, rate-limiting, data-retention, docker-client, realtime, submissions, assignments, recruiting, contest-scoring, exam-sessions, file storage, code-similarity, API handler, compiler/execute, SSE events, export, countdown-timer
3. Verified prior cycle fixes (cycle 43 tasks A, B, C — recruit_ prefix removal, getDbNowMs fallback, deadline check on re-entry)
4. Searched for common issue patterns: error.message control flow, unsafe casts, .json() before .ok, missing AbortController, Date.now() vs getDbNow misuse, setTimeout/setInterval leaks, unbounded data accumulation, race conditions
5. Final sweep for commonly missed issues

---

## NEW FINDINGS

### NEW-1: [MEDIUM] SSE events route `addConnection` eviction loop is O(n^2) when tracking map fills up

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`
**Confidence:** MEDIUM

**Problem:** When `connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS` (1000), the `addConnection` function enters a `while` loop that does a full map scan on each iteration to find the oldest entry (lines 47-52: iterating all entries to find the one with the smallest `createdAt`). Each eviction triggers `removeConnection`, and if multiple entries need evicting (common under burst load), the loop runs multiple times, each with O(n) iteration over the map. With MAX_TRACKED_CONNECTIONS = 1000, a burst of new connections could trigger tens of full-map scans in sequence.

This is related to DEFER-49 (SSE O(n) scan) but is a distinct, worse variant: the eviction path at line 44-55 does a full O(n) scan *per eviction*, whereas DEFER-49 tracks the stale-cleanup timer's O(n) scan. The eviction path is worse because it is synchronous and runs on every new SSE connection when the map is at capacity.

**Concrete failure scenario:** A sudden burst of 200 new SSE connections arrives while the tracking map is at 1000 entries. The while loop runs 200 times, each doing a 1000-entry scan to find the oldest. Total work: 200,000 iterations of the inner loop, all synchronous on the event loop, blocking the Node.js process for potentially hundreds of milliseconds.

**Fix:** Use a sorted data structure (e.g., a min-heap indexed by createdAt, or a Map with entries sorted by insertion time) to make oldest-entry lookup O(1). Alternatively, since connection IDs already encode a timestamp component (`${userId}-${Date.now()}-${random}`), the first entry in insertion order is likely the oldest, making `Map.keys().next().value` a sufficient approximation (assuming connections are added roughly in chronological order).

---

### NEW-2: [MEDIUM] `compiler/execute.ts` `runDocker` does not propagate `oomKilled` correctly when the container is killed by timeout

**File:** `src/lib/compiler/execute.ts:444-449`
**Confidence:** MEDIUM

**Problem:** When a container times out, the `killed` flag is set to true and the container is killed with `stopContainer` (SIGKILL). The `finish` function then inspects the container state. However, if the container was OOM-killed *before* the timeout (Docker's OOM killer and the Node.js timeout can race), the `child.on("close")` callback fires, `killed` is still false (since the timeout hasn't fired yet), and `inspectContainerState` is called. But if the container was already removed by the OOM cleanup path (unlikely but possible in rapid succession), the inspect returns `{ oomKilled: false, durationMs: null }`, and the result reports `timedOut: false` with `oomKilled: false` when the container actually died of OOM.

More critically: the `stopContainer` function (line 300-306) uses `spawn` with `.unref()`, meaning the kill signal is fire-and-forget. If `stopContainer` is called at line 448 and the Docker daemon is slow to respond, the `child.on("close")` event at line 471 can fire *before* the container is fully stopped, leading `inspectContainerState` to observe an intermediate state.

**Concrete failure scenario:** A student submits memory-intensive C++ code that allocates past the 256MB limit. Docker OOM-kills the container. Before the `child.on("close")` event fires, the Node.js timeout also fires, calling `stopContainer` which sends another SIGKILL. The container is removed by Docker's OOM cleanup before `inspectContainerState` runs. The inspect returns `{ oomKilled: false, durationMs: null }`. The student sees "timed out" instead of "memory limit exceeded", which is misleading for debugging.

**Fix:** After the `stopContainer` call at line 448, add a small delay (e.g., `await new Promise(r => setTimeout(r, 500))`) before calling `inspectContainerState` in the `finish` function to give Docker time to update the container state. Alternatively, move `inspectContainerState` into a retry loop that checks up to 3 times with 200ms intervals.

---

### NEW-3: [LOW] `auto-review.ts` `reviewLimiter` concurrency is not bounded in queue length

**File:** `src/lib/judge/auto-review.ts:12`
**Confidence:** LOW

**Problem:** `pLimit(2)` limits concurrent AI review API calls to 2, but there is no limit on the number of pending reviews queued. If a large contest receives 500 accepted submissions in a short window, all 500 `triggerAutoCodeReview` calls will be queued in the `pLimit` internal queue. Each queued call holds a closure over the submission ID, and when dequeued, it will make a DB query and an AI API call. With no bound on queue length, this can lead to: (a) memory pressure from 500+ queued closures, (b) AI API cost spikes as the reviews are processed over hours, (c) stale reviews for submissions that have since been superseded.

**Concrete failure scenario:** A large contest ends with 300 accepted submissions. All 300 trigger auto-review. The `pLimit(2)` queue has 298 pending items. Over the next ~2.5 hours (at ~30s per review with 2 concurrent), reviews are generated for submissions that students may have already improved upon. The AI API cost is $5-10 for reviews that are no longer timely.

**Fix:** Add a maximum queue size to the `reviewLimiter`. Before calling `reviewLimiter(async () => {...})`, check the current pending count. If the queue is full (e.g., > 20 pending), skip the review and log a debug message. This bounds memory usage and prevents stale reviews.

---

### NEW-4: [LOW] `countdown-timer.ts` initial state computation uses `Date.now()` without server time correction

**File:** `src/components/exam/countdown-timer.tsx:46-47`
**Confidence:** MEDIUM (related to DEFER-48, but this is a distinct aspect)

**Problem:** The initial `useState` calls at lines 46-47 compute `deadline - Date.now()` before the server time offset is fetched (which happens in the `useEffect` at line 62). The offset is applied in the `recalculate` function at line 97, but the initial render uses `Date.now()` directly. This means the first render can show an incorrect countdown (potentially off by seconds or minutes if the client clock is wrong). The `useEffect` that fetches server time runs after the first render, so there is a visible flash of incorrect time.

This is partially acknowledged by DEFER-48, but the specific issue here is the *visible flash* on the first render. The current implementation already fetches `/api/v1/time` to compute the offset, but the offset is not applied until the second render cycle.

**Concrete failure scenario:** A student taking an exam has a computer clock set 2 minutes behind. The initial render shows 2 extra minutes on the countdown. After ~1 second, the server time is fetched and the countdown adjusts. The student sees the time jump down by 2 minutes, which is confusing during an exam.

**Fix:** Render the timer in a loading/skeleton state until the server time offset is resolved, then show the corrected countdown. Alternatively, pass the server-time-corrected deadline from the server component as a prop, so the initial render is already correct.

---

### NEW-5: [LOW] `contest-scoring.ts` stale-while-revalidate may serve different data to concurrent requests during refresh

**File:** `src/lib/assignments/contest-scoring.ts:96-147`
**Confidence:** LOW

**Problem:** The stale-while-revalidate pattern returns stale data immediately and triggers a background refresh. However, the `_refreshingKeys` guard only prevents *starting* duplicate refreshes. If the refresh completes and sets the new cache, but a concurrent request reads the old cache between the cache-hit check and the return, it will get the old data. This is the standard stale-while-revalidate trade-off and is documented, but it means that during the ~15-second stale window, different users may see different leaderboard data depending on exactly when their request arrives relative to the cache update.

This is acceptable for a leaderboard (eventual consistency), but worth noting since the code does not make this consistency model explicit.

**Concrete failure scenario:** Two students in the same contest both view the leaderboard. Student A's request arrives just after the cache is refreshed and sees updated scores. Student B's request arrives just before the cache is refreshed and sees stale scores. This is confusing if they compare screens.

**Fix:** Document the eventual consistency model in the JSDoc for `getCachedContestRanking`. No code change needed — this is a documentation finding.

---

## VERIFIED PRIOR FIXES

All prior cycle 43 tasks confirmed in current code:

- **Cycle 43, Task A:** `recruit_` username prefix removed — verified: `username = nanoid(10)` at line 465 of `recruiting-invitations.ts`, no `recruit_` prefix
- **Cycle 43, Task B:** `getDbNowMs()` failure fallback — verified: nested try-catch with `Date.now()` fallback at lines 132-136 of `contest-scoring.ts`
- **Cycle 43, Task C:** Deadline check on already-redeemed re-entry — verified: SQL `deadline > NOW()` check at lines 416-420 of `recruiting-invitations.ts`

All prior cycle 42 tasks confirmed:
- **Cycle 42, AGG-1:** `normalizeSource()` unclosed string handling
- **Cycle 42, AGG-2:** Template literal handling in `normalizeSource()`

---

## CARRIED DEFERRED ITEMS (unchanged from cycle 43)

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
- DEFER-53 (cycle 43): [LOW] `in-memory-rate-limit.ts` `maybeEvict` double-scans expired entries on capacity overflow
- DEFER-54 (cycle 43): [LOW] `recruiting/request-cache.ts` `setCachedRecruitingContext` mutates ALS store without userId match check

---

## FINAL SWEEP — ADDITIONAL OBSERVATIONS

1. **SSE cleanup timer guard (line 106-129):** The `__sseCleanupInitialized` flag prevents double-registration during HMR, which is good. However, the flag is never reset, so if the timer module is re-evaluated after a crash, the timer won't be re-registered. This is acceptable since process restart clears the global.

2. **`compiler/execute.ts` workspace symlink check (line 646):** The `isSymbolicLink()` check is correct but incomplete — it doesn't check for symlink traversal in the workspace base path itself. However, `mkdtemp` creates a unique directory, so the risk is minimal.

3. **`auto-review.ts` source code size cap (line 52):** The cap uses `submission.sourceCode.length` which counts UTF-16 code units, not bytes. The `execute.ts` uses `Buffer.byteLength` for its 64KB cap. The auto-review cap at 8192 characters may admit slightly more than 8KB of UTF-8 data (e.g., CJK characters). Low risk since the AI context window has significant headroom.

4. **`db/export.ts` streaming export:** The `waitForReadableStreamDemand` function uses a 50ms polling loop with `setTimeout(resolve, 50)`. Under backpressure, this adds 50ms latency per chunk. A more efficient approach would use `requestAnimationFrame` or `scheduler.yield()`, but since this is a server-side admin-only operation, the latency is acceptable.

5. **`sanitize-html.ts` image src validation:** The hook at line 10-15 removes non-root-relative image sources. This prevents external image loading in problem descriptions, which is correct. The `ALLOWED_URI_REGEXP` at line 72 also constrains href/src to `https?`, `mailto`, or root-relative paths.

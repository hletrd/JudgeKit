# Comprehensive Code Review — RPF Cycle 45

**Date:** 2026-04-26
**Reviewer:** comprehensive-reviewer (fresh pass)
**Scope:** Full `src/` tree, with focus on recently modified files (cycle 44 changes) and core infrastructure

## Files Reviewed

### Core Infrastructure
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE events, connection tracking
- `src/lib/compiler/execute.ts` — Docker-sandboxed code execution
- `src/lib/judge/auto-review.ts` — AI code review pipeline
- `src/lib/assignments/contest-scoring.ts` — Contest ranking computation
- `src/lib/security/api-rate-limit.ts` — Two-tier API rate limiting
- `src/lib/security/in-memory-rate-limit.ts` — Fast in-memory rate limiting
- `src/lib/realtime/realtime-coordination.ts` — Multi-instance SSE coordination
- `src/lib/recruiting/request-cache.ts` — Per-request ALS cache for recruiting
- `src/lib/docker/client.ts` — Docker image management (local + remote)
- `src/proxy.ts` — Middleware (auth, CSP, locale, routing)
- `src/components/exam/countdown-timer.tsx` — Exam countdown timer
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts` — Exam session API

### Supporting Files
- `src/lib/api/client.ts`, `src/lib/api/handler.ts`, `src/lib/api/responses.ts`
- `src/lib/db/schema.ts`, `src/lib/db/queries.ts`
- `src/lib/auth/` — auth modules
- `src/lib/security/` — security modules

---

## New Findings

### NEW-1: [MEDIUM] `in-memory-rate-limit.ts` `maybeEvict` does a double-scan of all entries when over capacity — but the first scan also triggers on every rate-limit call

**Confidence:** MEDIUM
**File:** `src/lib/security/in-memory-rate-limit.ts:23-51`

The `maybeEvict()` function is called at the top of both `isRateLimitedInMemory` and `recordAttemptInMemory` (and indirectly `recordFailureInMemory`). The time-based gate (`now - lastEviction < 60_000`) prevents running more than once per minute, but when it does run with `store.size > MAX_ENTRIES`, it does a full O(n) scan to evict expired entries (lines 37-41), then a SECOND full iteration if still over capacity (lines 42-49). For a map with 10,000 entries near capacity, this is two O(n) passes on the same eviction tick.

While this is documented in DEFER-50 and DEFER-53, the specific concern here is slightly different: the two-pass approach is unnecessary because Map insertion order means expired entries and excess entries can be evicted in a single pass. The FIFO eviction (deleting from front) already handles both cases.

**Concrete failure scenario:** A burst of requests fills the in-memory rate limiter to 10,000+ entries. The next call to any rate-limit function triggers `maybeEvict`, which does two full scans of the map. If many entries are expired AND the map is over capacity, both scans run, blocking the event loop for potentially 10-20ms on a large map.

**Fix:** Combine the two eviction passes into one. In the single iteration, delete any expired entry. After the iteration, if still over capacity, pop from the front (FIFO) as already done.

---

### NEW-2: [MEDIUM] `buildDockerImageLocal` accumulates stdout/stderr up to 2MB with string slicing, but the `.slice(-2MB)` truncation loses the beginning (build context) which contains the most useful diagnostic info

**Confidence:** MEDIUM
**File:** `src/lib/docker/client.ts:159-166`

When `buildDockerImageLocal` runs, stdout and stderr are accumulated as strings and truncated to 2MB by keeping only the last 2MB (`stdout.slice(-2 * 1024 * 1024)`). This is noted in DEFER-52, but the specific issue is that the beginning of Docker build output contains the most important diagnostic information: the Dockerfile content, build context size, and early compilation steps. The truncation strategy loses this critical prefix while preserving potentially repetitive later steps.

**Concrete failure scenario:** A Docker image build fails with a cryptic error. The developer requests build logs to diagnose the issue. The logs show only the last 2MB, which is the tail of the build — mostly `npm install` progress bars and repeated warnings. The actual Dockerfile commands and early-stage errors (which typically appear at the beginning) have been truncated away.

**Fix:** Use a ring buffer or a two-buffer strategy: keep the first N KB (e.g., 32KB containing the Dockerfile and early build steps) plus the last (2MB - N) KB. Alternatively, switch to a streaming approach that pipes logs directly to the response for remote builds.

---

### NEW-3: [LOW] `auto-review.ts` source code size check uses `String.length` instead of `Buffer.byteLength` for byte comparison

**Confidence:** HIGH
**File:** `src/lib/judge/auto-review.ts:67`

The constant `AUTO_REVIEW_MAX_SOURCE_CODE_BYTES = 8192` suggests a byte limit, but the comparison on line 67 uses `submission.sourceCode.length`, which counts UTF-16 code units, not bytes. For ASCII source code, these are equivalent. But for source code containing non-BMP characters (e.g., mathematical symbols in Python, CJK comments), `String.length` undercounts the actual byte count. A string with 8,000 CJK characters has `length = 8000` but `Buffer.byteLength(str, "utf8") = 24000` bytes — three times the intended limit.

Note that `execute.ts:614` correctly uses `Buffer.byteLength(options.sourceCode, "utf8")` for the same type of check. The inconsistency between the two files is also notable.

**Concrete failure scenario:** A student submits Python code with extensive Korean comments. The source code is 7,000 characters but 14,000 bytes (UTF-8). The `length < 8192` check passes, but the actual byte payload sent to the AI API is 14,000 bytes — nearly double the intended cap. For AI providers that bill by token count (which is proportional to byte count for UTF-8 text), this causes unexpected cost overruns.

**Fix:** Replace `submission.sourceCode.length > AUTO_REVIEW_MAX_SOURCE_CODE_BYTES` with `Buffer.byteLength(submission.sourceCode, "utf8") > AUTO_REVIEW_MAX_SOURCE_CODE_BYTES` to match the semantics of the constant name and the pattern used in `execute.ts`.

---

### NEW-4: [LOW] `countdown-timer.tsx` `prePopulateThresholds` uses uncorrected client time on initial render

**Confidence:** MEDIUM (related to DEFER-48)
**File:** `src/components/exam/countdown-timer.tsx:34,46-47`

The `prePopulateThresholds` function on line 34 is called with `deadline - Date.now()` on line 49 during the `useRef` initialization. This means the threshold tracking starts with an uncorrected client time, the same issue as DEFER-48 (initial render flash). If the server offset correction (fetched in the `useEffect` at line 62) shifts the effective deadline by more than a threshold boundary (e.g., from 16 minutes remaining to 14 minutes remaining), the 15-minute warning toast will fire immediately on the first recalculate after the offset is applied, even though the student has already been past that threshold for some time.

**Concrete failure scenario:** A student's computer clock is 2 minutes behind. The true remaining time is 14 minutes, but the initial render computes 16 minutes. `prePopulateThresholds` does not add the 15-minute threshold. When the server offset is applied, remaining drops to 14 minutes, the 15-minute threshold fires, and the student sees a "15 minutes remaining" warning even though they actually have 14 minutes — and they never saw the warning at the actual 15-minute mark.

**Fix:** Defer threshold tracking until after the server time offset is resolved, or pass a server-corrected deadline from the parent component.

---

### NEW-5: [LOW] `exam-session/route.ts` GET handler re-queries the group for instructorId even though the assignment already contains groupId

**Confidence:** LOW
**File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts:110-113`

The GET handler queries `groups` by `id` to get `instructorId`, but then passes this to `canManageGroupResourcesAsync` which itself likely queries the group again. Additionally, the assignment was already fetched on line 101 with `groupId: true`, so the group query is redundant — the `instructorId` could be fetched alongside the assignment query or from the assignment's group relation.

**Concrete failure scenario:** Under load, each exam session GET request triggers 4 separate DB queries: assignment lookup, group lookup, enrollment lookup, and exam session lookup. The group lookup is unnecessary if the assignment relation includes the group's instructorId.

**Fix:** Fetch the assignment with its group relation included (e.g., `with: { group: { columns: { instructorId: true } } }`) to eliminate the separate group query.

---

### NEW-6: [LOW] `proxy.ts` auth cache eviction iterates all entries at 90% capacity even on set

**Confidence:** LOW
**File:** `src/proxy.ts:71-78`

When `authUserCache.size >= 90% of AUTH_CACHE_MAX_SIZE`, the `setCachedAuthUser` function iterates all entries to find and delete expired ones. Under high login volume (e.g., a school-wide exam start), many new cache entries are created rapidly. Each `set` call triggers a full O(n) scan when near capacity. With 500 max entries, this is a minor cost but the approach could be improved with a sorted data structure or periodic cleanup timer instead of inline eviction.

**Concrete failure scenario:** 450 concurrent users log in within a 2-second window. Each login triggers `setCachedAuthUser`, and since the cache is at 90% capacity, each call does a 450-entry scan. Total work: ~450 * 450 = ~200,000 iterations, all in the Edge Runtime middleware.

**Fix:** Consider a periodic cleanup approach (similar to the SSE route's cleanup timer) or an LRU cache library that handles eviction internally without full scans.

---

## Previously Fixed Items (confirmed in current code)

All prior cycle 44 fixes verified:
- AGG-1 (cycle 44): SSE `addConnection` eviction optimized from O(n^2) to O(n) — two-phase approach with FIFO fallback at lines 48-71
- AGG-2 (cycle 44): `runDocker` OOM/timeout race — retry loop at lines 462-468
- AGG-3 (cycle 44): Auto-review queue bound — `MAX_REVIEW_QUEUE_SIZE = 20` at line 17

All prior cycle 43 fixes verified:
- AGG-1 (cycle 43): `recruit_` username prefix removed
- AGG-2 (cycle 43): `getDbNowMs()` failure fallback
- AGG-3 (cycle 43): Deadline check on already-redeemed re-entry

---

## No New Security Findings

The codebase continues to demonstrate solid security practices:
- Docker container sandboxing with `--network=none`, `--cap-drop=ALL`, `--read-only`, seccomp profiles, and uid/gid 65534
- Shell command validation with denylist and allowed-command-prefix checks
- Two-tier rate limiting (sidecar + PostgreSQL with SELECT FOR UPDATE)
- CSP headers with nonce-based script-src
- Auth session cookie handling with secure flag and path scoping
- Server-time usage for schedule/rate-limit checks to prevent clock skew attacks

---

## Final Sweep

Examined the following additional areas for commonly missed issues:
- **Race conditions in SSE polling:** The `sharedPollTick` function is called from a `setInterval` and uses `Array.from(submissionSubscribers.keys())` to snapshot the subscriber map before querying, which is correct. No concurrent mutation risk since Node.js is single-threaded for the event loop.
- **Memory leaks in connection tracking:** The cleanup timer runs every 60s and evicts stale entries. The FIFO eviction on capacity overflow is now O(n) instead of O(n^2). No leak risk.
- **Error handling in AI review:** The `reviewLimiter` queue now has a bounded size. The `AbortController` timeout prevents hanging API calls. Error logging is comprehensive.
- **Type safety:** The `as` type assertions (e.g., `as CompilerRunResult | null` in `execute.ts:545`) are used only after `.catch(() => null)` guards, which is safe.
- **Server action rate limiting:** Uses `getDbNowUncached()` for consistent time comparisons.

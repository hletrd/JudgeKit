# Aggregate Review — Cycle 45

**Date:** 2026-04-26
**Reviewers:** comprehensive-reviewer (fresh pass)
**Total findings:** 6 new (2 MEDIUM, 4 LOW) + 0 false positives + 24 carried deferred re-validated + prior cycle findings confirmed fixed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `in-memory-rate-limit.ts` `maybeEvict` double-scans on capacity overflow

**Sources:** NEW-1 | **Confidence:** MEDIUM

`src/lib/security/in-memory-rate-limit.ts:23-51` — When `maybeEvict` runs and `store.size > MAX_ENTRIES`, it does two full O(n) passes: first to evict expired entries (lines 37-41), then to evict FIFO entries if still over capacity (lines 42-49). These two passes can be combined into one since both are doing full iterations of the same Map.

Related to DEFER-50 and DEFER-53 but is a distinct optimization: the fix is to merge the two passes rather than eliminate the eviction entirely or change the trigger frequency.

**Concrete failure scenario:** A burst of requests fills the in-memory rate limiter to 10,000+ entries. The next rate-limit call triggers `maybeEvict`, which does two full scans. If many entries are expired AND the map is over capacity, both scans run, blocking the event loop for 10-20ms.

**Fix:** Combine the two eviction passes into one: iterate once, delete expired entries. After the iteration, if still over capacity, pop from the front (FIFO).

---

### AGG-2: [MEDIUM] `buildDockerImageLocal` truncation keeps tail instead of head+tail

**Sources:** NEW-2 | **Confidence:** MEDIUM

`src/lib/docker/client.ts:159-166` — The `.slice(-2 * 1024 * 1024)` truncation keeps only the last 2MB of build output, discarding the beginning which contains the most useful diagnostic information (Dockerfile content, build context size, early compilation steps).

Related to DEFER-52 but with a specific improvement suggestion: use a head+tail strategy rather than just tail truncation.

**Concrete failure scenario:** A Docker build fails with a cryptic error. The developer requests logs but sees only the tail — mostly `npm install` progress bars. The Dockerfile commands and early-stage errors have been truncated.

**Fix:** Use a ring buffer or two-buffer strategy: keep the first 32KB plus the last ~2MB-32KB. Alternatively, pipe logs directly to the response for remote builds.

---

### AGG-3: [LOW] `auto-review.ts` source code size check uses `String.length` instead of `Buffer.byteLength`

**Sources:** NEW-3 | **Confidence:** HIGH

`src/lib/judge/auto-review.ts:67` — `AUTO_REVIEW_MAX_SOURCE_CODE_BYTES = 8192` suggests a byte limit, but `submission.sourceCode.length` counts UTF-16 code units, not bytes. For CJK characters, this undercounts by 2-3x. In contrast, `execute.ts:614` correctly uses `Buffer.byteLength(options.sourceCode, "utf8")`.

**Concrete failure scenario:** Source code with extensive Korean comments: 7,000 characters but 14,000 bytes. The `length < 8192` check passes, but the actual byte payload sent to the AI API is 14,000 bytes — double the intended cap, causing cost overruns.

**Fix:** Replace `submission.sourceCode.length > AUTO_REVIEW_MAX_SOURCE_CODE_BYTES` with `Buffer.byteLength(submission.sourceCode, "utf8") > AUTO_REVIEW_MAX_SOURCE_CODE_BYTES`.

---

### AGG-4: [LOW] `countdown-timer.tsx` `prePopulateThresholds` uses uncorrected client time

**Sources:** NEW-4 | **Confidence:** MEDIUM (related to DEFER-48)

`src/components/exam/countdown-timer.tsx:34,46-47` — The `prePopulateThresholds` function is initialized with `deadline - Date.now()` before the server time offset is fetched. If the offset correction shifts the effective deadline across a threshold boundary, the warning toast fires at the wrong time.

**Concrete failure scenario:** Student's clock is 2 minutes behind. True remaining time is 14 minutes, but initial render computes 16 minutes. The 15-minute threshold is not pre-populated. When offset is applied, remaining drops to 14 minutes and the 15-minute warning fires — but the student never saw it at the actual 15-minute mark.

**Fix:** Defer threshold tracking until after the server time offset is resolved, or pass a server-corrected deadline from the parent component.

---

### AGG-5: [LOW] `exam-session/route.ts` GET handler makes redundant group DB query

**Sources:** NEW-5 | **Confidence:** LOW

`src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts:110-113` — The GET handler queries the `groups` table to get `instructorId`, but the assignment was already fetched with its `groupId`. The group relation could be included in the assignment query to eliminate the separate group lookup.

**Concrete failure scenario:** Under load, each exam session GET request triggers 4 DB queries when 3 would suffice. The extra query adds latency and DB load.

**Fix:** Fetch the assignment with its group relation included (`with: { group: { columns: { instructorId: true } } }`).

---

### AGG-6: [LOW] `proxy.ts` auth cache eviction iterates all entries at 90% capacity on every set

**Sources:** NEW-6 | **Confidence:** LOW

`src/proxy.ts:71-78` — When `authUserCache.size >= 90% of AUTH_CACHE_MAX_SIZE`, each `setCachedAuthUser` call does a full O(n) scan of all entries to find and delete expired ones. Under high login volume, many `set` calls trigger repeated full scans.

**Concrete failure scenario:** 450 concurrent users log in within 2 seconds. Each `set` call does a ~450-entry scan. Total: ~200,000 iterations in Edge Runtime middleware.

**Fix:** Consider a periodic cleanup timer or an LRU cache library that handles eviction internally.

---

## Previously Fixed Items (confirmed in current code)

All prior cycle fixes verified:
- AGG-1 (cycle 44): SSE `addConnection` eviction optimized from O(n^2) to O(n)
- AGG-2 (cycle 44): `runDocker` OOM/timeout race retry loop
- AGG-3 (cycle 44): Auto-review queue bound (`MAX_REVIEW_QUEUE_SIZE = 20`)
- AGG-1 (cycle 43): `recruit_` username prefix removed
- AGG-2 (cycle 43): `getDbNowMs()` failure fallback
- AGG-3 (cycle 43): Deadline check on already-redeemed re-entry
- AGG-1 (cycle 42): `normalizeSource()` unclosed string handling
- AGG-2 (cycle 42): Template literal handling in `normalizeSource()`
- AGG-1 (cycle 41): `auto-review.ts` source code size cap
- AGG-1 (cycle 40): `getRetentionCutoff` `Date.now()` default removed
- AGG-1 (cycle 39): Docker build stderr sanitized
- AGG-2 (cycle 39): `participant-status.ts` `Date.now()` default removed
- AGG-3 (cycle 39): `JUDGE_WORKER_URL` guard added

---

## Carried Deferred Items (unchanged from cycle 44)

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

Reason for deferral unchanged. See cycle 44 plan for details.

---

## No Agent Failures

The comprehensive review completed successfully.

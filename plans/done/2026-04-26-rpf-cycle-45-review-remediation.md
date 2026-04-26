# RPF Cycle 45 — Review Remediation Plan

**Date:** 2026-04-26
**Cycle:** 45/100
**Base commit:** 2108d546 (current HEAD)
**Review artifacts:** `.context/reviews/rpf-cycle-45-comprehensive-review.md` + `.context/reviews/_aggregate-cycle-45.md`

## Previously Completed Tasks (Verified in Current Code)

All prior cycle 44 tasks are complete:
- [x] Task A: Optimize SSE `addConnection` eviction from O(n^2) to O(n) — commit 441255d5
- [x] Task B: Fix `runDocker` OOM/timeout race to correctly report `oomKilled` — commit 13af6ad2
- [x] Task C: Add queue length bound to auto-review `reviewLimiter` — commit 33590051

## Tasks (priority order)

### Task A: Fix `auto-review.ts` source code size check to use `Buffer.byteLength` [LOW/HIGH]

**From:** AGG-3 (NEW-3)
**Severity / confidence:** LOW / HIGH
**Files:**
- `src/lib/judge/auto-review.ts:67`

**Problem:** `AUTO_REVIEW_MAX_SOURCE_CODE_BYTES = 8192` suggests a byte limit, but `submission.sourceCode.length` counts UTF-16 code units, not bytes. For CJK characters, this undercounts by 2-3x. The `execute.ts:614` equivalent correctly uses `Buffer.byteLength()`.

**Plan:**
1. Replace `submission.sourceCode.length > AUTO_REVIEW_MAX_SOURCE_CODE_BYTES` with `Buffer.byteLength(submission.sourceCode, "utf8") > AUTO_REVIEW_MAX_SOURCE_CODE_BYTES`
2. Add `import { Buffer } from "buffer";` if not already available (Buffer is global in Node.js, so no import needed)
3. Update the debug log to also report byte count: `sourceCodeBytes: Buffer.byteLength(submission.sourceCode, "utf8")`
4. Verify all gates pass

**Status:** DONE — commit c3173f69

---

### Task B: Merge double-scan eviction in `in-memory-rate-limit.ts` into a single pass [MEDIUM/MEDIUM]

**From:** AGG-1 (NEW-1), related to DEFER-50, DEFER-53
**Severity / confidence:** MEDIUM / MEDIUM
**Files:**
- `src/lib/security/in-memory-rate-limit.ts:23-51`

**Problem:** When `store.size > MAX_ENTRIES`, `maybeEvict` does two full O(n) passes: first to evict expired entries (lines 37-41), then to evict FIFO entries if still over capacity (lines 42-49). These can be merged into one.

**Plan:**
1. Refactor `maybeEvict` to do a single iteration that collects expired keys to delete
2. After deleting expired entries, if still over capacity, pop from the front (FIFO) — this is already O(1) per entry since Map preserves insertion order
3. The overall complexity stays O(n) for the scan + O(excess) for FIFO, but we eliminate one full pass
4. Verify all gates pass

**Status:** DONE — commit 1b4f0c49

---

### Task C: Fix `buildDockerImageLocal` truncation to keep head+tail [MEDIUM/MEDIUM]

**From:** AGG-2 (NEW-2), related to DEFER-52
**Severity / confidence:** MEDIUM / MEDIUM
**Files:**
- `src/lib/docker/client.ts:159-166`

**Problem:** The `.slice(-2 * 1024 * 1024)` truncation keeps only the last 2MB, discarding the beginning which contains the most useful diagnostic information.

**Plan:**
1. Replace the string accumulation + slice with a two-buffer strategy:
   - Keep a `head` buffer (first 32KB) and a `tail` buffer (last ~2MB - 32KB)
   - On each data event, append to `tail`. If `tail` exceeds the limit, truncate from the front.
   - If `head` hasn't been finalized yet, keep appending to it until it reaches 32KB
2. On build completion, concatenate `head + "...\n[truncated]\n...\n" + tail` for the logs
3. This preserves the Dockerfile commands and early-stage output while still keeping recent output
4. Verify all gates pass

**Status:** DONE — commit 0a42eb89

---

## Deferred Items

### Carried deferred items from cycle 44 (unchanged):

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

- AGG-4 (NEW-4): `countdown-timer.tsx` `prePopulateThresholds` uses uncorrected client time — deferred as LOW severity. Related to DEFER-48. The visual flash is brief (~1 second) and the threshold misfire is a cosmetic timing issue, not a data loss or safety problem. Fixing would require either a loading state (adds UI complexity) or passing corrected deadline from server (requires prop drilling). Exit criterion: students report confusion from the threshold warning timing during exams, or DEFER-48 is picked up.

- AGG-5 (NEW-5): `exam-session/route.ts` GET handler makes redundant group DB query — deferred as LOW severity and LOW confidence. The extra query adds minimal latency and the code is clear as-is. Exit criterion: next time the file is modified, fold the group query into the assignment relation.

- AGG-6 (NEW-6): `proxy.ts` auth cache eviction iterates all entries at 90% capacity on every set — deferred as LOW severity and LOW confidence. With only 500 max entries, the scan cost is negligible. The approach is correct and simple. Exit criterion: auth cache max size is increased significantly or profile shows this path as a bottleneck.

---

## Progress log

- 2026-04-26: Plan created with 3 tasks (A, B, C). 3 new deferred items this cycle.
- 2026-04-26: All 3 tasks implemented. Task A in commit c3173f69, Task B in commit 1b4f0c49, Task C in commit 0a42eb89. All gates pass.

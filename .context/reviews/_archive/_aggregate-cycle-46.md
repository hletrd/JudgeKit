# Aggregate Review — Cycle 46

**Date:** 2026-04-25
**Reviewers:** comprehensive-reviewer (fresh pass)
**Total findings:** 5 new (2 MEDIUM, 3 LOW) + 0 false positives + 24 carried deferred re-validated + prior cycle findings confirmed fixed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `anti-cheat-monitor.tsx` retry timer gap — pending events may be lost after partial flush failure

**Sources:** NEW-2 | **Confidence:** MEDIUM

`src/components/exam/anti-cheat-monitor.tsx:130-136, 243-254` — When a `reportEvent` send fails, a retry timer is scheduled via `retryTimerRef`. However, `flushPendingEvents` (called by the retry timer) does not schedule its own retry if some events still fail to flush. Pending events accumulate in localStorage without another retry attempt until the next `reportEvent` failure or visibility change.

Related to DEFER-45 (anti-cheat monitor captures user text snippets) but is a distinct issue: the data loss concern here is about event delivery reliability, not privacy.

**Concrete failure scenario:** Student's network drops briefly. They switch tabs (triggering `tab_switch`). The event fails to send, goes to localStorage, and a retry timer fires `flushPendingEvents`. The network is still flaky — some events fail to flush. `flushPendingEvents` returns without scheduling another retry. The student closes the browser. The anti-cheat events are lost until the next exam session.

**Fix:** After `flushPendingEvents`, if there are still pending events in localStorage, schedule another retry with exponential backoff (capped at MAX_RETRIES).

---

### AGG-2: [MEDIUM] `image-processing.ts` does not validate input buffer size — allows unlimited memory allocation via sharp

**Sources:** NEW-3 | **Confidence:** MEDIUM

`src/lib/files/image-processing.ts:21-40` — The `processImage` function accepts a `Buffer` of any size and passes it directly to `sharp()`. A maliciously crafted "image bomb" (small compressed size, enormous decompressed pixel dimensions) can cause memory exhaustion before `sharp` rejects it or applies the resize. While HTTP body size limits exist at the proxy level, they typically allow 10-50MB uploads, which can decompress to hundreds of MB of pixel data.

**Concrete failure scenario:** An attacker uploads a 10MB "image bomb" — a PNG that decompresses to 100,000 x 100,000 pixels. The `sharp` pipeline allocates memory for the full decoded image before resizing, consuming ~40GB of RAM. The server runs out of memory and the process crashes, affecting all users.

**Fix:** Add an input buffer size check (e.g., reject buffers larger than 10MB) and use `sharp`'s `limitInputPixels` option to cap the decoded pixel count before processing.

---

### AGG-3: [LOW] `contest-scoring.ts` ICPC tie-breaking uses `Math.max(...array)` which throws on very large arrays

**Sources:** NEW-4 | **Confidence:** MEDIUM

`src/lib/assignments/contest-scoring.ts:376-378` — The ICPC sort comparator uses `Math.max(...aSolvedTimes)` and `Math.max(...bSolvedTimes)`. The spread operator passes each element as a separate argument. JavaScript engines limit function arguments — `Math.max` with more than ~65536 arguments throws `RangeError: Maximum call stack size exceeded`. In practice, this requires a single user to have solved 65,000+ problems in one contest, which is unrealistic.

**Concrete failure scenario:** Extremely unlikely — would need a contest with 65,000+ problems per user.

**Fix:** Replace `Math.max(...arr)` with `arr.reduce((a, b) => Math.max(a, b), 0)` or a simple loop.

---

### AGG-4: [LOW] `countdown-timer.tsx` no retry on server time fetch failure

**Sources:** NEW-5 | **Confidence:** LOW

`src/components/exam/countdown-timer.tsx:67-93` — The server time fetch has a 5-second abort timeout and no retry logic. If `/api/v1/time` fails, the offset remains 0 for the entire exam session. Related to DEFER-48 (initial render uses uncorrected client time) but specifically about the fetch failure scenario.

**Concrete failure scenario:** Student's clock is 3 minutes behind. Server time fetch fails during page load. Timer shows 33 minutes when only 30 remain. Student sees the "1 minute remaining" warning 3 minutes late.

**Fix:** Add 1-2 retries with exponential backoff for server time fetch. If all retries fail, show a subtle warning.

---

### AGG-5: [LOW] `similarity-check/route.ts` fragile `AbortError` detection

**Sources:** NEW-6 | **Confidence:** LOW

`src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:36` — The catch block checks `error.name === "AbortError"` which works in current Node.js but is fragile across environments. The secondary `error.message.includes("timed out")` provides a fallback, but the message string could change if upstream code is refactored. Related to DEFER-46 (`error.message` as control-flow discriminator).

**Concrete failure scenario:** On a Node.js version where `AbortController` throws a plain `Error` with a different message format, the timeout is not caught as an `AbortError`, causing a 500 instead of a graceful `timed_out` response.

**Fix:** Use `error instanceof DOMException && error.name === "AbortError"` as primary check, with message fallback.

---

## Previously Fixed Items (confirmed in current code)

All prior cycle 45 fixes verified:
- AGG-3 (cycle 45): `auto-review.ts` uses `Buffer.byteLength()` — confirmed
- AGG-1 (cycle 45): `in-memory-rate-limit.ts` single-pass eviction — confirmed
- AGG-2 (cycle 45): `buildDockerImageLocal` head+tail buffer — confirmed

---

## Carried Deferred Items (unchanged from cycle 45)

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

Reason for deferral unchanged. See cycle 45 aggregate for details.

---

## No Agent Failures

The comprehensive review completed successfully.

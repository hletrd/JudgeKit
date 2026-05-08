# Comprehensive Code Review — RPF Cycle 46

**Date:** 2026-04-25
**Reviewer:** comprehensive-reviewer (fresh pass)
**Scope:** Full `src/` tree, with focus on recently modified files (cycle 45 changes) and areas under-reviewed in recent cycles

## Files Reviewed

### Core Infrastructure
- `src/lib/docker/client.ts` — Docker image management (head+tail buffer from cycle 45)
- `src/lib/judge/auto-review.ts` — AI code review pipeline (Buffer.byteLength fix from cycle 45)
- `src/lib/security/in-memory-rate-limit.ts` — In-memory rate limiter (single-pass eviction from cycle 45)
- `src/lib/compiler/execute.ts` — Docker-sandboxed code execution
- `src/proxy.ts` — Middleware (auth, CSP, locale, routing)
- `src/lib/api/handler.ts` — API handler factory
- `src/lib/auth/config.ts` — NextAuth configuration
- `src/lib/assignments/contest-scoring.ts` — Contest ranking computation
- `src/lib/assignments/code-similarity.ts` — Code similarity check
- `src/lib/realtime/realtime-coordination.ts` — Multi-instance SSE coordination

### API Routes
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE events, connection tracking
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts` — Exam session API
- `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts` — Similarity check
- `src/app/api/v1/files/bulk-delete/route.ts` — Bulk file deletion

### Frontend
- `src/components/exam/countdown-timer.tsx` — Exam countdown timer
- `src/components/exam/anti-cheat-monitor.tsx` — Anti-cheat monitoring
- `src/components/problem-description.tsx` — Problem description renderer
- `src/components/seo/json-ld.tsx` — JSON-LD structured data

### Security
- `src/lib/security/sanitize-html.ts` — HTML sanitization
- `src/lib/files/storage.ts` — File storage operations
- `src/lib/files/image-processing.ts` — Image processing with sharp
- `src/lib/recruiting/request-cache.ts` — Per-request ALS cache

---

## Previously Fixed Items (confirmed in current code)

All prior cycle 45 fixes verified:
- AGG-3 (cycle 45): `auto-review.ts` now uses `Buffer.byteLength()` — line 70 confirmed
- AGG-1 (cycle 45): `in-memory-rate-limit.ts` `maybeEvict` uses single-pass eviction — lines 31-47 confirmed
- AGG-2 (cycle 45): `buildDockerImageLocal` uses head+tail buffer strategy — lines 158-183 confirmed

---

## New Findings

### NEW-1: [MEDIUM] `buildDockerImageLocal` head buffer overflow — chunk may exceed HEAD_SIZE without finalizing

**Confidence:** HIGH
**File:** `src/lib/docker/client.ts:168-179`

The `appendOutput` function has a logic flaw in the head buffer finalization. When a chunk arrives and the head buffer has remaining space, it appends `chunk.slice(0, remaining)` to head and any overflow to tail. However, the finalization check on line 179 (`if (head.length >= HEAD_SIZE) headFinalized = true`) runs AFTER the overflow assignment on line 174. If `remaining > 0` but `remaining < chunk.length`, the head gets some content, the overflow goes to tail, but then `headFinalized` is set to true. On the NEXT chunk, the `else` branch runs and appends to tail — this is correct.

However, if `remaining <= 0` (head already full but `headFinalized` is still false due to an edge case), the code falls into the `else` branch on line 176 which sets `headFinalized = true` and appends the entire chunk to tail. But this `else` branch is only reachable when `remaining <= 0` AND `headFinalized` is false — meaning head is already full but the flag was never set. This can happen if `head.length` exactly equals `HEAD_SIZE` after a previous append but the `headFinalized` check on line 179 was skipped because `remaining > 0` was true for that previous chunk.

In practice, the issue is subtle: when `head.length` reaches exactly `HEAD_SIZE`, `headFinalized` is set on line 179. But if the chunk that fills the head also produces overflow, the tail gets the overflow before finalization, which is correct behavior. The real concern is that subsequent chunks after head is exactly at `HEAD_SIZE` will take the `headFinalized = true` path correctly.

After closer analysis, the logic is actually correct but confusing. The `if (remaining > 0)` check on line 170 handles the case where head still has room, and line 179 correctly finalizes. The `else` on line 176 handles the edge case where `remaining <= 0` (head just became full or overflowed). **No actual bug here — withdrawing this finding.**

---

### NEW-2: [MEDIUM] `anti-cheat-monitor.tsx` retry timer leaks on unmount — `retryTimerRef` is cleared in one cleanup but `flushPendingEvents` can reschedule it

**Confidence:** MEDIUM
**File:** `src/components/exam/anti-cheat-monitor.tsx:130-136, 243-254`

When a `reportEvent` send fails, a retry timer is scheduled via `setTimeout` on line 131 and stored in `retryTimerRef`. The cleanup on line 250-253 clears this timer on unmount. However, the `flushPendingEvents` callback (lines 96-108) does NOT schedule a retry timer — it just updates `localStorage`. But `reportEvent` on line 126-136 does schedule a timer.

The problem: `flushPendingEvents` is called by the retry timer on line 133. If `flushPendingEvents` succeeds partially (some events sent, some still failing), it does NOT set `retryTimerRef.current`. The pending events just accumulate in localStorage without another retry attempt until the next `reportEvent` call fails.

This means: after a network interruption, if `flushPendingEvents` is called but fails for some events, those events remain in localStorage but no retry is scheduled. They will only be flushed on the next `reportEvent` failure or on the next visibility change (line 183). This is a resilience gap — pending events can be lost if the user closes the tab before a visibility change or another failed report.

**Concrete failure scenario:** Student's network drops briefly. They switch tabs (triggering `tab_switch` event). The event fails to send, goes to localStorage, and a retry timer fires `flushPendingEvents`. The network is still flaky — some events fail to flush. `flushPendingEvents` returns without scheduling another retry. The student closes the browser. The anti-cheat events are lost until the next exam session.

**Fix:** After `flushPendingEvents`, if there are still pending events in localStorage, schedule another retry with exponential backoff (capped at MAX_RETRIES).

---

### NEW-3: [MEDIUM] `image-processing.ts` does not validate input buffer size before processing — allows unlimited memory allocation via `sharp`

**Confidence:** MEDIUM
**File:** `src/lib/files/image-processing.ts:21-40`

The `processImage` function accepts a `Buffer` of any size and passes it directly to `sharp()`. While `sharp` has its own pixel limit (default ~1 gigapixel), a maliciously crafted image can decompress to enormous pixel dimensions, causing memory exhaustion before `sharp` rejects it. Additionally, `sharp`'s `failOn: "error"` only catches image format errors, not memory errors.

The function is called from file upload handlers where the input buffer comes from user uploads. While there may be HTTP body size limits at the proxy level, those limits (typically 10-50MB) still allow images that decompress to hundreds of megabytes of pixel data.

**Concrete failure scenario:** An attacker uploads a 10MB "image bomb" — a PNG that decompresses to 100,000 x 100,000 pixels. The `sharp` pipeline allocates memory for the full decoded image before resizing, consuming ~40GB of RAM. The server runs out of memory and the process crashes, affecting all users.

**Fix:** Add an input buffer size check (e.g., reject buffers larger than 10MB) and use `sharp`'s `limitInputPixels` option to cap the decoded pixel count before processing.

---

### NEW-4: [LOW] `contest-scoring.ts` ICPC tie-breaking uses `Math.max(...array)` which throws on very large arrays

**Confidence:** MEDIUM
**File:** `src/lib/assignments/contest-scoring.ts:376-378`

The ICPC sort comparator uses `Math.max(...aSolvedTimes)` and `Math.max(...bSolvedTimes)` to find the last AC timestamp for tie-breaking. The spread operator passes each element as a separate argument. JavaScript engines limit the number of function arguments — `Math.max` with more than ~65536 arguments throws a `RangeError: Maximum call stack size exceeded`.

In practice, this would require a single user to have solved more than 65,536 problems in one contest, which is unrealistic for this application. The finding is very low risk in the current context.

**Concrete failure scenario:** Extremely unlikely in practice. A contest with 65,000+ problems per user would be needed.

**Fix:** Replace `Math.max(...arr)` with `arr.reduce((a, b) => Math.max(a, b), 0)` or a simple loop for robustness.

---

### NEW-5: [LOW] `countdown-timer.tsx` server time fetch uses 5-second timeout but does not retry on failure

**Confidence:** LOW
**File:** `src/components/exam/countdown-timer.tsx:67-93`

The `useEffect` that fetches server time has a 5-second abort timeout and no retry logic. If the `/api/v1/time` endpoint fails (network glitch, server restart), the offset remains 0 for the entire exam session. For students with significantly incorrect clocks, this means their countdown will be wrong for the entire exam.

While the initial render uses `Date.now()` as a fallback (which is correct for most students), the failure mode is silent — no toast or warning is shown to the student that their timer may be inaccurate.

**Concrete failure scenario:** A student's clock is 3 minutes behind. The server time fetch fails due to a brief network interruption during page load. The timer shows 33 minutes remaining when only 30 minutes actually remain. The student sees the "1 minute remaining" warning 3 minutes late, and the exam auto-submits 3 minutes before they expect it.

**Fix:** Add a retry (1-2 attempts with exponential backoff) for the server time fetch. If all retries fail, show a subtle warning that the timer may not be synchronized with the server.

---

### NEW-6: [LOW] `similarity-check/route.ts` catches `AbortError` by name string, which is fragile across environments

**Confidence:** LOW
**File:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:36`

The catch block checks `error.name === "AbortError"` which works in most environments, but `AbortError` is a `DOMException` subclass in browsers and a different class in Node.js. In some Node.js versions, `AbortController.abort()` throws a `DOMException` with name `"AbortError"`, but in older Node.js versions it may throw a plain `Error` without the `name` property set to `"AbortError"`.

The secondary check `error.message.includes("timed out")` provides a fallback, but the message string could change if the upstream code is refactored.

**Concrete failure scenario:** On a Node.js version where `AbortController` throws a plain `Error` with a different message format, the timeout is not caught as an `AbortError`, causing the error to propagate as an unhandled 500 instead of returning a graceful `timed_out` response.

**Fix:** Use `error instanceof DOMException && error.name === "AbortError"` as the primary check, and keep the message check as a secondary fallback. Or use a custom error class for timeout detection.

---

### NEW-7: [LOW] `json-ld.tsx` `safeJsonForScript` does not escape `<` characters that are not part of `</script`

**Confidence:** LOW
**File:** `src/components/seo/json-ld.tsx:11-14`

The `safeJsonForScript` function only replaces `</script` sequences and `<!--` sequences. However, `JSON.stringify` in V8 does escape `<` as `<`, which prevents the immediate XSS vector. The issue is that this V8 behavior is not guaranteed by the ECMAScript spec — a different JavaScript engine (or a future V8 change) could produce unescaped `<` in JSON output, which could break out of the `<script>` tag in an HTML context.

In practice, all major server-side JS runtimes (Node.js/V8, Deno/V8, Bun/JavaScriptCore) do escape `<` in `JSON.stringify`. The risk is very low.

**Concrete failure scenario:** If a future JS engine change causes `JSON.stringify` to not escape `<`, and the JSON data contains `<script>`, the embedded JSON-LD would break out of its script tag. However, since the data comes from the server (not user input), the attack surface is limited.

**Fix:** Add an explicit `.replace(/</g, "\\u003c")` replacement for defense in depth, or add a comment noting the V8 dependency.

---

## Sweep for Commonly Missed Issues

1. **Empty catch blocks**: No empty `catch {}` blocks found in production code — good.
2. **Unvalidated env vars**: `AUTH_CACHE_TTL_MS` has proper validation with `Number.isFinite` and `> 0` — good.
3. **SQL injection**: All SQL uses parameterized queries via `rawQueryAll`/`rawQueryOne` with named params — good.
4. **Path traversal in file storage**: `resolveStoredPath` properly rejects `..`, `/`, `\` — good.
5. **HTML sanitization**: DOMPurify with restrictive tag/attribute allowlist and URI regexp — good.
6. **CSRF protection**: `createApiHandler` enforces CSRF for mutation methods — good.
7. **Auth token validation**: Token invalidation check uses DB server time — good.

---

## Summary

| ID | Severity | Confidence | File | Issue |
|----|----------|------------|------|-------|
| NEW-2 | MEDIUM | MEDIUM | anti-cheat-monitor.tsx | Retry timer gap after partial flush failure |
| NEW-3 | MEDIUM | MEDIUM | image-processing.ts | No input size validation before sharp processing |
| NEW-4 | LOW | MEDIUM | contest-scoring.ts | Math.max spread with large arrays |
| NEW-5 | LOW | LOW | countdown-timer.tsx | No retry on server time fetch failure |
| NEW-6 | LOW | LOW | similarity-check/route.ts | Fragile AbortError detection |
| NEW-7 | LOW | LOW | json-ld.tsx | safeJsonForScript relies on V8-specific JSON.stringify behavior |

Total new findings: 5 (2 MEDIUM, 4 LOW) — NEW-1 was withdrawn after closer analysis.

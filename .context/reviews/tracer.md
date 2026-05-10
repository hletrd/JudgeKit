# Tracer Review — Cycle 34

**Reviewer:** tracer
**Date:** 2026-05-10
**Scope:** Causal tracing of suspicious flows, competing hypotheses

---

## Findings

### C34-TR-1: [MEDIUM] Hypothesis: Rate limit eviction timer causes test flakiness

**File:** `src/lib/security/rate-limit.ts:68-80`
**Confidence:** HIGH

**Trace:**
1. Test file imports module that transitively imports `rate-limit.ts`
2. `startRateLimitEviction()` is called (likely in app init or middleware)
3. Test completes and asserts no open handles
4. `setInterval` timer is still running → test fails with open handle warning

This hypothesis is confirmed by the presence of `evictionTimer.unref()` (line 78-79), which was added precisely to mitigate this issue. However, `unref()` only works in Node.js — in jsdom/Vitest browser environments, the timer remains referenced.

**Fix:** Export `stopRateLimitEviction()` for explicit test teardown.

---

### C34-TR-2: [LOW] Hypothesis: `apiFetchJson` silent parse failures hide server misconfigurations

**File:** `src/lib/api/client.ts:138-144`
**Confidence:** MEDIUM

**Trace:**
1. Developer adds new API endpoint
2. Endpoint accidentally returns HTML instead of JSON (e.g., middleware misconfiguration)
3. Client calls `apiFetchJson(endpoint, ..., fallback)`
4. `fetch()` succeeds (returns 200 with HTML body)
5. `res.json()` throws SyntaxError
6. Catch block silently swallows error, returns `{ ok: false, data: fallback }`
7. Developer sees "request failed" toast but has no idea the server returned HTML
8. Time wasted debugging client-side code when the issue is server-side

**Fix:** Add development-only warning to surface the actual error.

---

## Previously Addressed (cycle 33)

- C33-TR-1 (timer leak in submission-list-auto-refresh): **FIXED** — `mountedRef` guard added
- C33-TR-2 (sign-out key iteration race): **FIXED** — keys snapshotted before iteration

## Positive Observations

1. Anti-cheat retry scheduling uses ref-based delegation correctly.
2. Timer cleanup patterns are consistent across components.

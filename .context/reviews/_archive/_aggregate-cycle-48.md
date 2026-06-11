# Aggregate Review — Cycle 48

**Date:** 2026-04-25
**Reviewers:** comprehensive-reviewer (fresh pass)
**Total findings:** 4 new (1 MEDIUM, 3 LOW) + 0 false positives + 22 carried deferred re-validated + prior cycle findings confirmed fixed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `analytics/route.ts` catch block calls `getDbNowMs()` without fallback — same thundering-herd bug fixed in `contest-scoring.ts`

**Sources:** NEW-1 | **Confidence:** HIGH

`src/app/api/v1/contests/[assignmentId]/analytics/route.ts:75-76` — In the stale-while-revalidate background refresh, if `computeContestAnalytics` throws and then `getDbNowMs()` also fails inside the catch block (line 76: `_lastRefreshFailureAt.set(cacheKey, await getDbNowMs())`), the outer `.catch(() => {})` at line 81 silently swallows the error. The `_lastRefreshFailureAt` entry is never set, so the 5-second cooldown never engages. This is the **exact same bug** that was fixed in `contest-scoring.ts` in cycle 43.

Additionally, line 56 calls `await getDbNowMs()` on every cache-hit request for the staleness check, adding a DB round-trip to every analytics request — the same performance issue that was already addressed in `contest-scoring.ts` by using `Date.now()` for staleness checks.

**Concrete failure scenario:** Database becomes unreachable. The analytics cache becomes stale after 30 seconds. On every request, the background refresh is triggered (since `_lastRefreshFailureAt` never gets set). Each refresh attempt hits the DB, amplifying the outage. Under high traffic, this creates a self-reinforcing load spike.

**Fix:** Apply the same two-part fix from `contest-scoring.ts`:
1. Replace line 56 `const nowMs = await getDbNowMs()` with `const nowMs = Date.now()` for the staleness check (clock skew of 1-2s is acceptable for a 30s staleness window).
2. Wrap line 76 `_lastRefreshFailureAt.set(cacheKey, await getDbNowMs())` in a try-catch with `Date.now()` fallback, matching the pattern in `contest-scoring.ts:132-135`.

---

### AGG-2: [LOW] `anti-cheat-monitor.tsx` retry scheduling logic is duplicated in three places

**Sources:** NEW-2 | **Confidence:** MEDIUM

`src/components/exam/anti-cheat-monitor.tsx:120-156` — The retry scheduling logic appears in three places: (1) inside `flushPendingEvents` (lines 127-137), (2) inside the `useEffect` that keeps `scheduleRetryRef` in sync (lines 142-155), and (3) inside `reportEvent` (lines 178-183). If the backoff formula or timer logic changes, all three copies must be updated.

**Concrete failure scenario:** A developer changes the backoff cap from 30 seconds to 60 seconds in `flushPendingEvents` but forgets to update the same cap in the `useEffect` copy. The retry behavior becomes inconsistent.

**Fix:** Extract a single `scheduleRetry(remaining: PendingEvent[])` function that encapsulates the has-retriable check, backoff calculation, and timer scheduling. Both `flushPendingEvents` and the `useEffect` can then call this single function through the ref, eliminating the duplication.

---

### AGG-3: [LOW] `proxy.ts` `clearAuthSessionCookies` hardcodes cookie names instead of using the dynamic session cookie name

**Sources:** NEW-3 | **Confidence:** MEDIUM

`src/proxy.ts:88-93` — `clearAuthSessionCookies` hardcodes `"authjs.session-token"` and `"__Secure-authjs.session-token"`, but the actual session cookie name is determined dynamically by `getAuthSessionCookieName()`. If the cookie name ever changes, the proxy would clear the wrong cookies, leaving stale session cookies on the client.

**Concrete failure scenario:** A deployment sets `AUTH_SESSION_COOKIE_NAME=custom-session`. The `authConfig` correctly uses the custom name. But when the proxy needs to clear cookies, it clears the default `authjs.session-token` instead of `custom-session`. The browser retains the old valid session cookie.

**Fix:** Import `getAuthSessionCookieName()` and use it to determine both the non-secure and secure cookie names for clearing.

---

### AGG-4: [LOW] `rate-limiter-client.ts` circuit breaker state is per-instance — not shared across deployments

**Sources:** NEW-4 | **Confidence:** LOW

`src/lib/security/rate-limiter-client.ts:43-44` — `consecutiveFailures` and `circuitOpenUntil` are module-level variables. In multi-instance deployments, each instance has its own circuit breaker state. This is a known trade-off for the in-process circuit breaker pattern.

**Concrete failure scenario:** Three app instances behind a load balancer. The sidecar goes down. Instance 1 opens its breaker, instances 2-3 keep hammering until they independently trip.

**Fix:** Document the trade-off. If shared state becomes necessary, use the same PostgreSQL coordination as SSE connections. No code change needed now — this is informational.

---

## Previously Fixed Items (confirmed in current code)

All prior cycle fixes verified:
- AGG-1 (cycle 43): `contest-scoring.ts` `Date.now()` fallback in catch + `getDbNowMs()` for cache writes
- AGG-2 (cycle 43): `contest-scoring.ts` ranking cache staleness uses `Date.now()` instead of `getDbNowMs()`
- All earlier fixes from cycles 39-42 remain in place

---

## Carried Deferred Items (unchanged from cycle 47)

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
- DEFER-55: [LOW] `countdown-timer.tsx` no retry on server time fetch failure
- DEFER-56: [LOW] `similarity-check/route.ts` fragile `AbortError` detection
- DEFER-57: [LOW] `image-processing.ts` `MAX_INPUT_BUFFER_BYTES` is not configurable (cycle 47 new)

---

## No Agent Failures

The comprehensive review completed successfully.

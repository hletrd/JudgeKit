# Comprehensive Review — Cycle 48

**Date:** 2026-04-25
**Reviewer:** comprehensive-reviewer
**Scope:** Full repository, with focus on files changed since cycle 43 and previously deferred items

## New Findings

### NEW-1: [MEDIUM] `analytics/route.ts` catch block calls `getDbNowMs()` without fallback — same thundering-herd bug that was fixed in `contest-scoring.ts`

**Confidence:** HIGH

`src/app/api/v1/contests/[assignmentId]/analytics/route.ts:75-76` — In the stale-while-revalidate background refresh, if `computeContestAnalytics` throws and then `getDbNowMs()` also fails inside the catch block (line 76: `_lastRefreshFailureAt.set(cacheKey, await getDbNowMs())`), the outer `.catch(() => {})` at line 81 silently swallows the error. The `_lastRefreshFailureAt` entry is never set, so the 5-second cooldown never engages. This is the **exact same bug** that was fixed in `contest-scoring.ts` in cycle 43 (commit 8af86fab region).

Additionally, line 56 calls `await getDbNowMs()` on every cache-hit request for the staleness check, adding a DB round-trip to every analytics request — the same performance issue that was already addressed in `contest-scoring.ts` by using `Date.now()` for staleness checks.

**Concrete failure scenario:** Database becomes unreachable. The analytics cache becomes stale after 30 seconds. On every request, the background refresh is triggered (since `_lastRefreshFailureAt` never gets set). Each refresh attempt hits the DB, amplifying the outage. Under high traffic, this creates a self-reinforcing load spike on an already-struggling DB.

**Fix:** Apply the same two-part fix from `contest-scoring.ts`:
1. Replace line 56 `const nowMs = await getDbNowMs()` with `const nowMs = Date.now()` for the staleness check (clock skew of 1-2s is acceptable for a 30s staleness window).
2. Wrap line 76 `_lastRefreshFailureAt.set(cacheKey, await getDbNowMs())` in a try-catch with `Date.now()` fallback, matching the pattern in `contest-scoring.ts:132-135`.

---

### NEW-2: [LOW] `anti-cheat-monitor.tsx` `scheduleRetryRef` pattern duplicates `scheduleRetry` logic in both `flushPendingEvents` callback and `useEffect`

**Confidence:** MEDIUM

`src/components/exam/anti-cheat-monitor.tsx:120-156` — The retry scheduling logic appears in three places: (1) inside `flushPendingEvents` (lines 127-137), (2) inside the `useEffect` that keeps `scheduleRetryRef` in sync (lines 142-155), and (3) inside `reportEvent` (lines 178-183). The `scheduleRetryRef` pattern was introduced in cycle 47 to extract the flush logic, but the retry scheduling itself is still duplicated. If the backoff formula or timer logic changes, all three copies must be updated.

**Concrete failure scenario:** A developer changes the backoff cap from 30 seconds to 60 seconds in `flushPendingEvents` but forgets to update the same cap in the `useEffect` copy. The retry behavior becomes inconsistent — some retries cap at 30s, others at 60s.

**Fix:** Extract a single `scheduleRetry(remaining: PendingEvent[])` function that encapsulates the has-retriable check, backoff calculation, and timer scheduling. Both `flushPendingEvents` and the `useEffect` can then call this single function through the ref, eliminating the duplication.

---

### NEW-3: [LOW] `proxy.ts` `clearAuthSessionCookies` hardcodes cookie names instead of using the dynamic session cookie name

**Confidence:** MEDIUM

`src/proxy.ts:88-93` — `clearAuthSessionCookies` hardcodes `"authjs.session-token"` and `"__Secure-authjs.session-token"`, but the actual session cookie name is determined dynamically by `getAuthSessionCookieName()` (used in `authConfig.cookies.sessionToken.name`). If the cookie name ever changes (e.g., via environment variable), the proxy would clear the wrong cookies, leaving stale session cookies on the client.

**Concrete failure scenario:** A deployment sets `AUTH_SESSION_COOKIE_NAME=custom-session` via environment variable. The `authConfig` correctly uses the custom name for setting cookies. But when the proxy needs to clear cookies (e.g., user is inactive), it clears the default `authjs.session-token` instead of `custom-session`. The browser retains the old valid session cookie, and the user appears logged in despite being deactivated in the DB.

**Fix:** Import `getAuthSessionCookieName()` and use it to determine both the non-secure and secure cookie names for clearing, matching the pattern used in `authConfig`.

---

### NEW-4: [LOW] `rate-limiter-client.ts` circuit breaker state is module-level singletons — resets on HMR, not shared across instances

**Confidence:** LOW

`src/lib/security/rate-limiter-client.ts:43-44` — `consecutiveFailures` and `circuitOpenUntil` are module-level variables. In development with HMR, module re-evaluation resets these to 0, temporarily bypassing the circuit breaker. In multi-instance production deployments, each instance has its own circuit breaker state, so one instance may keep hammering the sidecar while another has already opened its breaker.

**Concrete failure scenario:** Three app instances behind a load balancer. The sidecar goes down. Instance 1 opens its circuit breaker after 3 failures. Instance 2 and 3 each still have `consecutiveFailures = 0` and keep sending requests. The sidecar receives 2/3 of the normal traffic until all instances independently trip their breakers.

**Fix:** This is a known trade-off for the in-process circuit breaker pattern. Documenting it is sufficient — the sidecar is explicitly designed as a best-effort fast path. If shared circuit breaker state becomes necessary, it should use the same PostgreSQL-backed coordination as the SSE connection tracking.

---

### NEW-5: [INFO] `contest-scoring.ts` background refresh uses `Date.now()` for staleness check but `getDbNowMs()` for cache writes — mixed clocks

**Confidence:** INFO (already known as DEFER-51)

This is already tracked as DEFER-51. The mixed-clock pattern is intentional: staleness checks use `Date.now()` to avoid a DB round-trip on every cache-hit, while cache writes use `getDbNowMs()` for authoritative timestamps. The 1-2s clock skew is acceptable for the 15-second staleness window. No action needed beyond the existing deferral.

---

## Re-validated Deferred Items

All deferred items from cycle 43 remain valid and unchanged:
- DEFER-22 through DEFER-56 (see aggregate for full list)

## Previously Fixed Items (confirmed)

All prior cycle fixes remain in place:
- `contest-scoring.ts` — `Date.now()` fallback in catch, `getDbNowMs()` for cache writes
- `normalizeSource()` — unclosed string handling, `MAX_STRING_LITERAL_LENGTH` cap
- `auto-review.ts` — source code size cap
- `getRetentionCutoff` — `Date.now()` default removed
- Docker build stderr sanitized
- `participant-status.ts` — `Date.now()` default removed
- `JUDGE_WORKER_URL` guard added
- `Math.max(...array)` — all instances replaced with `reduce`

## Files Reviewed

- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` (NEW-1)
- `src/lib/assignments/contest-scoring.ts` (re-validated)
- `src/lib/assignments/recruiting-invitations.ts` (re-validated)
- `src/lib/security/in-memory-rate-limit.ts` (re-validated)
- `src/lib/recruiting/request-cache.ts` (re-validated)
- `src/lib/docker/client.ts` (re-validated)
- `src/lib/security/sanitize-html.ts` (re-validated)
- `src/app/api/v1/submissions/[id]/events/route.ts` (re-validated)
- `src/lib/db-time.ts` (re-validated)
- `src/lib/auth/config.ts` (re-validated)
- `src/proxy.ts` (NEW-3)
- `src/lib/security/rate-limiter-client.ts` (NEW-4)
- `src/lib/realtime/realtime-coordination.ts` (re-validated)
- `src/lib/compiler/execute.ts` (re-validated)
- `src/components/exam/countdown-timer.tsx` (re-validated)
- `src/components/exam/anti-cheat-monitor.tsx` (NEW-2)
- `src/lib/api/handler.ts` (re-validated)
- `src/lib/api/auth.ts` (re-validated)

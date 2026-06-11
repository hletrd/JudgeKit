# Tracer Pass — RPF Cycle 3/100

**Date:** 2026-04-27
**Lane:** tracer
**Scope:** Causal tracing of suspicious flows, competing hypotheses

## Summary

I traced two flows this cycle:
1. **Analytics cache → background refresh → cooldown** (cycle-2 surface): the new `refreshAnalyticsCacheInBackground` is correctly called, cleaned up, and the cooldown is correctly read against `Date.now()`. No causal anomalies.
2. **Logout → cookie clearing**: the `getAuthSessionCookieNames` factory is correctly called from `proxy.ts:92` in `clearAuthSessionCookies`. The two `response.cookies.set(..., "", { maxAge: 0 })` calls clear the right cookies.

No anomalies surfaced. The investigation cleared the cycle-2 commit traces.

## Findings

### TRC3-1: [LOW] Analytics route — verified flow

**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:80-110`
**Confidence:** HIGH

Trace of GET request flow:
1. `assignment` fetched via `rawQueryOne` (line 64). If null or `examMode === "none"` → 404.
2. `canViewAssignmentSubmissions` checked (line 74). If false → 403.
3. `cached = analyticsCache.get(cacheKey)` (line 81). If cache hit:
   - `nowMs = Date.now()` (line 89). `age = nowMs - cached.createdAt` (line 90).
   - If `age <= STALE_AFTER_MS (30_000)` → return cached, no refresh (line 91-93).
   - Else (stale-but-within-TTL): check `_refreshingKeys` and `_lastRefreshFailureAt` cooldown. If both clear, schedule `refreshAnalyticsCacheInBackground(...).catch(logger.warn)`.
   - Return cached (line 110).
4. Cache miss (line 113): `analytics = await computeContestAnalytics(...)`, `analyticsCache.set(...)`, return fresh.

**No anomalies.** The decision tree is exhaustive and the dedup + cooldown guards are correctly composed.

---

### TRC3-2: [LOW] Logout / cookie-clearing — verified flow

**File:** `src/proxy.ts:294-318`, `src/proxy.ts:87-97`, `src/lib/security/env.ts:178-180`
**Confidence:** HIGH

Trace:
1. `proxy(request)` is called (line 240). `token` is fetched via `getToken(...)` (line 242).
2. If `isAuthPage && token && !activeUser` → call `clearAuthSessionCookies(createSecuredNextResponse(request))` (line 295). This clears stale session cookies on the login page when the user record is gone (e.g., deactivated).
3. If protected route and `!activeUser` → API: `clearAuthSessionCookies(NextResponse.json({ error: "unauthorized" }, { status: 401 }))` (line 311). Page: redirect-to-login + `clearAuthSessionCookies` (line 318).
4. `clearAuthSessionCookies` (line 87) calls `getAuthSessionCookieNames()` and sets both `name` and `secureName` cookies to empty with `maxAge: 0`.

**No anomalies.** The cookie names are sourced from the factory, not hardcoded. The two paths (auth page vs. protected route) both correctly invoke the clearing.

---

### TRC3-3: [INFO] Anti-cheat retry timer cleanup trace

**File:** `src/components/exam/anti-cheat-monitor.tsx:298-302`
**Confidence:** HIGH

Trace:
1. Component mounts. The cleanup effect (line 291) registers a return cleanup that includes:
   ```ts
   if (retryTimerRef.current) {
     clearTimeout(retryTimerRef.current);
     retryTimerRef.current = null;
   }
   ```
2. On unmount, the cleanup runs. The retry timer (if scheduled) is cleared.
3. `scheduleRetryRef.current` is reassigned in a separate effect (line 142) on `[performFlush]` change. The reassignment happens during render, so any in-flight timer body that reads `scheduleRetryRef.current` gets the latest closure.

**No anomalies.** The two effects are independent but co-coordinated through the ref.

## Hypotheses Ruled Out

- **Hypothesis: Background refresh could leak `_refreshingKeys` if `refreshAnalyticsCacheInBackground` throws synchronously before the `try` block.** Verified: the `_refreshingKeys.add(cacheKey)` happens BEFORE the function call (line 99), and the function body's `try/finally` ensures `_refreshingKeys.delete(cacheKey)` even on `throw`. ✓
- **Hypothesis: Cookie clearing could miss the `__Host-` variant if next-auth ever changes naming.** Verified: the `getAuthSessionCookieNames` factory is the single source of truth; if next-auth changes, only env.ts needs updating. The proxy.ts caller is name-agnostic. ✓
- **Hypothesis: `vi.runAllTimersAsync()` doesn't drain the detached `.catch` chain in the cooldown test.** Verified: Vitest 4.x `runAllTimersAsync` drains both timers and pending microtasks. The test asserts `loggerErrorMock` was called, which only happens if the `.catch` ran — confirming the chain is drained. ✓

## Verification Notes

- Tests pass cleanly (7/7 analytics, no leaked timers).
- Lint clean.
- No suspicious behavior surfaced via `grep -n "@ts-expect-error\|@ts-ignore"` in the cycle-2 surface (none).

## Confidence

All findings: HIGH confidence in correctness. No causal anomalies surfaced. Cycle-2 commits behave as documented.

No HIGH-severity findings. Cycle-3 tracer surface is clean — no actionable items emerged from this lane.

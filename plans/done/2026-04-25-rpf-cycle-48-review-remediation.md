# RPF Cycle 48 — Review Remediation Plan

**Date:** 2026-04-25
**Cycle:** 48/100
**Base commit:** HEAD
**Review artifacts:** `.context/reviews/comprehensive-cycle-48.md` + `.context/reviews/_aggregate-cycle-48.md`

## Previously Completed Tasks (Verified in Current Code)

All prior cycle 47 tasks are complete:
- [x] Task A: Replace `Math.max(...array)` with safe alternative in frontend chart components — commit 88d96b1e
- [x] Task B: Extract duplicated flush logic in anti-cheat monitor — commit 44ff047a

## Tasks (priority order)

### Task A: Fix `analytics/route.ts` thundering-herd bug — `getDbNowMs()` in catch without fallback + unnecessary DB round-trip on cache hits [MEDIUM/HIGH]

**From:** AGG-1 (NEW-1)
**Severity / confidence:** MEDIUM / HIGH
**Files:**
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`

**Problem:** Two related issues, both already fixed in `contest-scoring.ts` but missed in `analytics/route.ts`:

1. **Line 56:** `const nowMs = await getDbNowMs()` is called on every cache-hit request for the staleness check. This adds a DB round-trip to every analytics request. `Date.now()` is sufficient because the 30-second staleness window tolerates 1-2s of clock skew.

2. **Line 76:** `_lastRefreshFailureAt.set(cacheKey, await getDbNowMs())` inside the catch block will itself throw if the DB is unreachable. Since the outer `.catch(() => {})` at line 81 swallows this secondary error, the failure timestamp is never set, the 5-second cooldown never engages, and a persistent DB outage causes a thundering herd on every request after the 30-second stale window.

**Plan:**
1. Replace line 56 `const nowMs = await getDbNowMs()` with `const nowMs = Date.now()` (matching `contest-scoring.ts:107`)
2. Wrap line 76 `_lastRefreshFailureAt.set(cacheKey, await getDbNowMs())` in a try-catch with `Date.now()` fallback (matching `contest-scoring.ts:132-135`)
3. Add a comment explaining the `Date.now()` choice, matching the existing comment in `contest-scoring.ts:101-106`
4. Verify all gates pass

**Status:** PENDING

---

### Task B: Extract duplicated retry scheduling logic in `anti-cheat-monitor.tsx` [LOW/MEDIUM]

**From:** AGG-2 (NEW-2)
**Severity / confidence:** LOW / MEDIUM
**Files:**
- `src/components/exam/anti-cheat-monitor.tsx`

**Problem:** The retry scheduling logic appears in three places: inside `flushPendingEvents` (lines 127-137), inside the `useEffect` keeping `scheduleRetryRef` in sync (lines 142-155), and inside `reportEvent` (lines 178-183). If the backoff formula or timer logic changes, all three copies must be updated consistently.

**Plan:**
1. Create a `scheduleRetry(remaining: PendingEvent[])` function that encapsulates: (a) checking if any event has retries left, (b) computing the backoff delay from the max retry count, (c) setting a `setTimeout` that calls `performFlush` and then recursively schedules the next retry via `scheduleRetryRef.current`.
2. Store this function in a ref (`scheduleRetryRef`) and update it via a `useEffect` that depends on `performFlush`.
3. Replace the inline retry scheduling in `flushPendingEvents` with a call to `scheduleRetryRef.current(remaining)`.
4. Replace the inline retry scheduling in `reportEvent` with a call to `scheduleRetryRef.current(pending)`.
5. Remove the `useEffect` that currently keeps `scheduleRetryRef` in sync with the duplicated scheduling code (it will now be kept in sync with the single `scheduleRetry` function).
6. Verify all gates pass

**Status:** PENDING

---

### Task C: Fix `proxy.ts` hardcoded cookie names to use dynamic `getAuthSessionCookieName()` [LOW/MEDIUM]

**From:** AGG-3 (NEW-3)
**Severity / confidence:** LOW / MEDIUM
**Files:**
- `src/proxy.ts`

**Problem:** `clearAuthSessionCookies` hardcodes `"authjs.session-token"` and `"__Secure-authjs.session-token"`, but the actual session cookie name is determined dynamically by `getAuthSessionCookieName()`. If the cookie name ever changes, the proxy would clear the wrong cookies.

**Plan:**
1. Import `getAuthSessionCookieName` from `@/lib/auth/secure-cookie`
2. In `clearAuthSessionCookies`, derive the base name from `getAuthSessionCookieName()` instead of hardcoding `"authjs.session-token"`
3. Use the derived name for both the non-secure and secure variants (prepending `__Secure-` for the secure one)
4. Verify all gates pass

**Status:** PENDING

---

## Deferred Items

### Carried deferred items from cycle 47 (unchanged):

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

### New deferred items this cycle:

- AGG-4 (NEW-4): `rate-limiter-client.ts` circuit breaker state is per-instance — not shared across deployments. Deferred as LOW severity and LOW confidence. The per-instance circuit breaker is a known trade-off for the in-process pattern; the sidecar is explicitly designed as a best-effort fast path. If shared circuit breaker state becomes necessary, it should use the same PostgreSQL-backed coordination as SSE connections. Exit criterion: a multi-instance deployment reports sidecar overload due to uncoordinated circuit breakers, or shared coordination is implemented for another feature.

---

## Progress log

- 2026-04-25: Plan created with 3 tasks (A, B, C). 1 new deferred item (AGG-4).

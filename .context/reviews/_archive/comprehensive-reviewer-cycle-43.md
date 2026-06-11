# Comprehensive Code Review — Cycle 43

**Date:** 2026-04-25
**Reviewer:** comprehensive-reviewer (fresh pass)
**Scope:** Full repository, all source files under `src/`, API routes, lib modules, components, security, and test coverage.

---

## Methodology

1. Built inventory of all review-relevant files (src/lib, src/app, src/components, tests/)
2. Read and analyzed every major module: auth, security, rate-limiting, data-retention, docker-client, realtime, submissions, assignments, recruiting, contest-scoring, exam-sessions, file storage, code-similarity, API handler
3. Verified prior cycle fixes (cycle 42 tasks A & B — unclosed strings + template literals in normalizeSource)
4. Searched for common issue patterns: error.message control flow, unsafe casts, .json() before .ok, missing AbortController
5. Final sweep for commonly missed issues

---

## NEW FINDINGS

### NEW-1: [MEDIUM] `recruiting-invitations.ts` — `redeemRecruitingToken` creates user with predictable `recruit_` username prefix enabling enumeration

**File:** `src/lib/assignments/recruiting-invitations.ts:463`
**Confidence:** MEDIUM

**Problem:** When a new user is created via `redeemRecruitingToken`, the username is set to `recruit_${nanoid(8)}`. The `recruit_` prefix makes it trivial to enumerate all recruiting-created accounts via the user list API or username-based lookup. If an attacker gains any authenticated access, they can identify and target recruiting candidates specifically.

**Concrete failure scenario:** A malicious student with regular access queries the user list or tries usernames like `recruit_*` to discover all recruiting candidates and their associated contest assignment IDs, potentially leaking confidential recruiting assessment information.

**Fix:** Remove the `recruit_` prefix or use a non-distinguishing prefix pattern. For example, use a random prefix from a small pool of common prefixes, or simply use `nanoid(10)` without any prefix, and rely on the `role` field for access control instead of encoding origin in the username.

---

### NEW-2: [MEDIUM] `contest-scoring.ts` — Background refresh swallows `getDbNowMs()` failures silently, leaving stale data indefinitely

**File:** `src/lib/assignments/contest-scoring.ts:121-135`
**Confidence:** HIGH

**Problem:** In the stale-while-revalidate background refresh, the inner async IIFE catches errors from `_computeContestRankingInner` and `rankingCache.set`. However, if `getDbNowMs()` throws inside the `catch` block (line 127: `_lastRefreshFailureAt.set(cacheKey, await getDbNowMs())`), the outer `.catch(() => {})` at line 132 silently swallows the error. More critically, if `getDbNowMs()` itself fails, the `_lastRefreshFailureAt` entry is never set, so the cooldown mechanism doesn't engage. This means a persistent DB outage causes the background refresh to be retried on every cache-hit request (after the 15s stale window), potentially amplifying DB load during an outage.

**Concrete failure scenario:** Database becomes unreachable. The contest ranking cache becomes stale after 15s. On every request, the background refresh is triggered (since `_lastRefreshFailureAt` never gets set). Each refresh attempt hits the DB, amplifying the outage. With high traffic, this creates a thundering herd against the already-struggling DB.

**Fix:** Use `Date.now()` as a fallback for `_lastRefreshFailureAt.set()` instead of `await getDbNowMs()`, since this timestamp is only used for a 5-second cooldown (where 1-2 seconds of clock skew is acceptable). Alternatively, wrap the `getDbNowMs()` call in a try-catch within the error handler.

---

### NEW-3: [LOW] `recruiting-invitations.ts` — Already-redeemed path does not atomically verify assignment deadline, allowing access to closed contests

**File:** `src/lib/assignments/recruiting-invitations.ts:404-428`
**Confidence:** MEDIUM

**Problem:** When a recruiting token is already redeemed and the user re-enters with a password, the code at lines 404-428 verifies that the assignment exists but explicitly does NOT check the deadline (the comment at line 416-420 acknowledges this). For the initial redeem, the atomic SQL claim step validates `deadline > NOW()`, but for re-entry, there is no such gate. This means a candidate can re-enter a contest after its deadline has passed.

**Concrete failure scenario:** A recruiting contest closes at 5pm. At 5:01pm, a candidate re-uses their invitation token with a valid password. The `redeemRecruitingToken` function returns `{ ok: true, alreadyRedeemed: true }`, giving the candidate a session. While submission enforcement still applies at the submission level, the candidate can see the contest UI and any previously submitted code, which may contain privileged problem descriptions.

**Fix:** Add an atomic SQL deadline check to the already-redeemed path, similar to the one used in the initial redeem. The check should use `NOW()` to avoid clock skew, matching the pattern in the initial claim step.

---

### NEW-4: [LOW] `docker/client.ts` — `buildDockerImageLocal` accumulates stdout/stderr up to 2MB with string slicing on every data event

**File:** `src/lib/docker/client.ts:159-165`
**Confidence:** LOW (already tracked as DEFER-52)

**Problem:** Already noted as DEFER-52, but re-confirmed. The `stdout += chunk.toString()` followed by `stdout = stdout.slice(-2 * 1024 * 1024)` pattern allocates a new 2MB+ string on every data event. For long builds with verbose output, this causes frequent GC pressure.

**Note:** This is a re-confirmation of the existing deferred item, not a new finding.

---

### NEW-5: [LOW] `in-memory-rate-limit.ts` — `maybeEvict` double-scans expired entries on capacity overflow

**File:** `src/lib/security/in-memory-rate-limit.ts:23-51`
**Confidence:** MEDIUM

**Problem:** When `store.size > MAX_ENTRIES`, the function does a first pass to evict expired entries (lines 37-41), then a second pass for FIFO eviction (lines 44-49). The first pass iterates the entire map, and if it's still over capacity, the second pass also iterates from the front. The expired-entry scan in the first pass is redundant because it was already done in the periodic eviction at lines 27-29. The periodic eviction already deletes expired entries every 60 seconds, so the capacity-overflow first pass is only useful if many entries expired within the last 60 seconds.

**Concrete failure scenario:** Under high load with 10,000 rate-limit entries, every call to `isRateLimitedInMemory` / `recordAttemptInMemory` / `recordFailureInMemory` triggers `maybeEvict()`. If the store is at capacity, each call performs two full-map iterations. This adds unnecessary latency to every rate-limited request.

**Fix:** Remove the duplicate expired-entry scan from the capacity-overflow path (lines 37-41), since the periodic eviction at lines 27-29 already handles this. Only the FIFO eviction (lines 44-49) is needed for the capacity-overflow case.

---

### NEW-6: [LOW] `recruiting/request-cache.ts` — `setCachedRecruitingContext` mutates existing ALS store in-place without checking userId match

**File:** `src/lib/recruiting/request-cache.ts:44-58`
**Confidence:** LOW

**Problem:** `setCachedRecruitingContext` writes to the ALS store without verifying that the current store's `userId` matches the one being cached. If `getCachedRecruitingContext` is called for user A, then `setCachedRecruitingContext` is called for user B, it will overwrite user A's context with user B's. In practice this is unlikely because each request is scoped to a single user, but it violates the principle of least surprise.

**Concrete failure scenario:** If a bug or middleware inadvertently causes two different userId lookups in the same request context, the second `setCachedRecruitingContext` call silently overwrites the first, potentially returning wrong access context for user A on subsequent `getCachedRecruitingContext(userIdA)` calls.

**Fix:** Add a guard in `setCachedRecruitingContext` that checks if `store.userId` is already set to a different userId, and either warn or skip the write in that case.

---

## VERIFIED PRIOR FIXES

All prior cycle fixes confirmed in current code:

- **Cycle 42, AGG-1:** `normalizeSource()` unclosed string handling — verified: unclosed strings are discarded (no opening quote output), template literals handled, `MAX_STRING_LITERAL_LENGTH = 10_000` cap in place.
- **Cycle 42, AGG-2:** Template literal handling in `normalizeSource()` — verified: backtick-delimited strings are properly stripped.
- **Cycle 41, AGG-1:** Auto-review source code size cap — `AUTO_REVIEW_MAX_SOURCE_CODE_BYTES = 8192` at line 18.
- **Cycle 40, AGG-1:** `getRetentionCutoff` `Date.now()` default removed — `now` is now a required parameter.
- **Cycle 39, AGG-1:** Docker build stderr sanitized — `error: "Docker build failed"` at line 181.
- **Cycle 39, AGG-2:** `participant-status.ts` `Date.now()` default removed — `now` is now a required parameter.
- **Cycle 39, AGG-3:** `JUDGE_WORKER_URL` guard added to `callWorkerJson` and `callWorkerNoContent`.

---

## CARRIED DEFERRED ITEMS (unchanged from cycle 42)

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

---

## FINAL SWEEP — ADDITIONAL OBSERVATIONS

1. **`apiFetch` client (src/lib/api/client.ts):** The `.json()` before `response.ok` pattern is documented as a known issue (DEFER-22) but the code at line 46 contains only a comment warning, not a fix. No new instances found beyond the known 60+.

2. **`data-retention-maintenance.ts`:** The `pruneSensitiveOperationalData` function catches all errors at line 99, which is correct for a maintenance task. No issue found.

3. **`exam-session/route.ts`:** Uses `error.message` as a control-flow discriminator (DEFER-46 pattern), but this is a small, bounded set of known errors. No new concern beyond the existing deferred item.

4. **`files/[id]/route.ts`:** DELETE handler checks rate limit before auth (known DEFER from cycle 42). GET handler does NOT have rate limiting, which is intentional for file serving but could be abused for expensive file reads. Low risk.

5. **`quick-create/route.ts`:** The `problemPoints` length mismatch is now validated via `.refine()` (cycle 42 fix confirmed). The `Number.isFinite` guards for `startsAt` and `deadline` are properly in place.

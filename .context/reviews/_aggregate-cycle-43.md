# Aggregate Review — Cycle 43

**Date:** 2026-04-25
**Reviewers:** comprehensive-reviewer (fresh pass)
**Total findings:** 5 new (2 MEDIUM, 3 LOW) + 0 false positives + 22 carried deferred re-validated + prior cycle findings confirmed fixed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `redeemRecruitingToken` creates users with predictable `recruit_` username prefix enabling enumeration

**Sources:** NEW-1 | **Confidence:** MEDIUM

`src/lib/assignments/recruiting-invitations.ts:463` — When a new user is created via `redeemRecruitingToken`, the username is set to `recruit_${nanoid(8)}`. The `recruit_` prefix makes it trivial to enumerate all recruiting-created accounts via the user list API or username-based lookup. If an attacker gains any authenticated access, they can identify and target recruiting candidates specifically.

**Concrete failure scenario:** A malicious student with regular access queries the user list or tries usernames like `recruit_*` to discover all recruiting candidates and their associated contest assignment IDs, potentially leaking confidential recruiting assessment information.

**Fix:** Remove the `recruit_` prefix or use a non-distinguishing prefix pattern. Use `nanoid(10)` without any role-revealing prefix, and rely on the `role` field for access control instead of encoding origin in the username.

---

### AGG-2: [MEDIUM] `contest-scoring.ts` background refresh swallows `getDbNowMs()` failures silently, disabling the cooldown and amplifying DB load during outages

**Sources:** NEW-2 | **Confidence:** HIGH

`src/lib/assignments/contest-scoring.ts:121-135` — In the stale-while-revalidate background refresh, if `_computeContestRankingInner` throws and then `getDbNowMs()` also fails inside the catch block (line 127: `_lastRefreshFailureAt.set(cacheKey, await getDbNowMs())`), the outer `.catch(() => {})` at line 132 silently swallows the error. The `_lastRefreshFailureAt` entry is never set, so the 5-second cooldown never engages. This means a persistent DB outage causes the background refresh to be retried on every cache-hit request after the 15-second stale window, creating a thundering herd against the already-struggling DB.

**Concrete failure scenario:** Database becomes unreachable. The contest ranking cache becomes stale after 15 seconds. On every request, the background refresh is triggered (since `_lastRefreshFailureAt` never gets set). Each refresh attempt hits the DB, amplifying the outage. Under high traffic, this creates a self-reinforcing load spike.

**Fix:** Use `Date.now()` as a fallback for `_lastRefreshFailureAt.set()` instead of `await getDbNowMs()`, since this timestamp is only used for a 5-second cooldown where 1-2 seconds of clock skew is acceptable. Alternatively, wrap the `getDbNowMs()` call in a try-catch within the error handler and fall back to `Date.now()`.

---

### AGG-3: [LOW] `redeemRecruitingToken` already-redeemed path does not atomically verify assignment deadline, allowing access to closed contests

**Sources:** NEW-3 | **Confidence:** MEDIUM

`src/lib/assignments/recruiting-invitations.ts:404-428` — When a recruiting token is already redeemed and the user re-enters with a password, the code verifies that the assignment exists but explicitly does NOT check the deadline (the comment at lines 416-420 acknowledges this). For the initial redeem, the atomic SQL claim step validates `deadline > NOW()`, but for re-entry, there is no such gate. This means a candidate can re-enter a contest after its deadline has passed.

**Concrete failure scenario:** A recruiting contest closes at 5pm. At 5:01pm, a candidate re-uses their invitation token with a valid password. The function returns `{ ok: true, alreadyRedeemed: true }`, giving the candidate a session. While submission enforcement still applies at the submission level, the candidate can see the contest UI and any previously submitted code, which may contain privileged problem descriptions.

**Fix:** Add an atomic SQL deadline check to the already-redeemed path, similar to the one used in the initial redeem. The check should use `NOW()` to avoid clock skew, matching the pattern in the initial claim step.

---

### AGG-4: [LOW] `in-memory-rate-limit.ts` `maybeEvict` double-scans expired entries on capacity overflow

**Sources:** NEW-5 | **Confidence:** MEDIUM

`src/lib/security/in-memory-rate-limit.ts:23-51` — When `store.size > MAX_ENTRIES`, the function does a first pass to evict expired entries (lines 37-41), then a second pass for FIFO eviction (lines 44-49). The expired-entry scan in the first pass is redundant because the periodic eviction at lines 27-29 already handles this. Under high load with 10,000 entries, every rate-limit call triggers `maybeEvict()`, and if the store is at capacity, each call performs two full-map iterations, adding unnecessary latency.

**Concrete failure scenario:** Under high load, the in-memory rate limiter processes thousands of requests per second. Each call triggers `maybeEvict()` with two full-map scans when at capacity. This adds O(n) latency to every rate-limited request.

**Fix:** Remove the duplicate expired-entry scan from the capacity-overflow path (lines 37-41), since the periodic eviction at lines 27-29 already handles this. Only the FIFO eviction (lines 44-49) is needed for the capacity-overflow case.

---

### AGG-5: [LOW] `recruiting/request-cache.ts` `setCachedRecruitingContext` mutates existing ALS store in-place without checking userId match

**Sources:** NEW-6 | **Confidence:** LOW

`src/lib/recruiting/request-cache.ts:44-58` — `setCachedRecruitingContext` writes to the ALS store without verifying that the current store's `userId` matches the one being cached. If `getCachedRecruitingContext` is called for user A, then `setCachedRecruitingContext` is called for user B, it will overwrite user A's context with user B's.

**Concrete failure scenario:** If a bug or middleware inadvertently causes two different userId lookups in the same request context, the second `setCachedRecruitingContext` call silently overwrites the first, potentially returning wrong access context for user A on subsequent `getCachedRecruitingContext(userIdA)` calls.

**Fix:** Add a guard in `setCachedRecruitingContext` that checks if `store.userId` is already set to a different userId, and either warn or skip the write in that case.

---

## Previously Fixed Items (confirmed in current code)

All prior cycle fixes verified:
- AGG-1 (cycle 42): `normalizeSource()` unclosed string handling — properly discards unclosed strings, template literals handled, `MAX_STRING_LITERAL_LENGTH` cap in place
- AGG-2 (cycle 42): Template literal handling in `normalizeSource()` — backtick-delimited strings properly stripped
- AGG-1 (cycle 41): `auto-review.ts` source code size cap — `AUTO_REVIEW_MAX_SOURCE_CODE_BYTES = 8192` at line 18
- AGG-1 (cycle 40): `getRetentionCutoff` `Date.now()` default removed — `now` is now a required parameter
- AGG-1 (cycle 39): Docker build stderr sanitized — `error: "Docker build failed"` at line 181
- AGG-2 (cycle 39): `participant-status.ts` `Date.now()` default removed — `now` is now a required parameter
- AGG-3 (cycle 39): `JUDGE_WORKER_URL` guard added to `callWorkerJson` and `callWorkerNoContent`

---

## Carried Deferred Items (unchanged from cycle 42)

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

Reason for deferral unchanged. See cycle 42 plan for details.

---

## No Agent Failures

The comprehensive review completed successfully.

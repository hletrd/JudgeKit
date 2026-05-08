# Comprehensive Review — Cycle 41

**Date:** 2026-04-25
**Reviewer:** comprehensive-reviewer
**Scope:** Full repository — src/, judge-worker-rs/, docker/, tests/

## Methodology

Searched for: Date.now() misuse, error.message control-flow, unsafe type assertions, missing AbortController, console.* in production code, innerHTML/dangerouslySetInnerHTML, eval/Function(), catch-and-swallow, env var handling, race conditions in shared state, memory leaks in long-lived maps, and clock-skew patterns. Examined critical files: proxy.ts, execute.ts, events/route.ts, contest-scoring.ts, countdown-timer.tsx, anti-cheat-monitor.tsx, realtime-coordination.ts, docker/client.ts, encryption.ts, rate-limiter-client.ts, capabilities/cache.ts, system-settings-config.ts, data-retention.ts, db-time.ts, auto-review.ts.

---

## Findings

### NEW-1: [MEDIUM] `system-settings-config.ts` uses `Date.now()` for cache timestamps mixed with DB-time-dependent settings

**File:** `src/lib/system-settings-config.ts:142,159,169`
**Confidence:** HIGH

`initializeSettings()` at line 142 and `getConfiguredSettings()` at lines 159/169 use `Date.now()` for `cachedAt`. The settings themselves control rate-limit windows, claim timeouts, and session max ages — all of which are compared against DB-stored timestamps using `getDbNowMs()` by downstream consumers. If the app server clock drifts relative to the DB, the cache could appear fresh or stale incorrectly.

However, the impact is limited: the cache TTL is only 60 seconds, and a few seconds of clock skew would at worst cause a one-cycle delay in picking up a settings change. This is similar to DEFER-51 (contest-scoring ranking cache) but with lower severity because settings changes are rare and the stale-while-revalidate pattern is intentional.

**Concrete failure scenario:** Admin changes `staleClaimTimeoutMs` from 300s to 120s. The settings cache has `cachedAt` set 55s ago using app-server time. The DB server is 3s ahead. The next `getConfiguredSettings()` call computes `Date.now() - cachedAt = 55s` and considers the cache fresh (60s TTL). But in DB time, 58s have elapsed, so the cache is nearly expired. A claim request at exactly the boundary could use the old setting for up to ~5 additional seconds.

**Fix:** Low priority. The 60s TTL provides sufficient buffer. If precision is needed, use `getDbNowMs()` for cache timestamps (adds a DB query on cache writes only, not reads).

**Verdict:** Defer — low-impact variant of the known clock-skew pattern, bounded by short TTL.

---

### NEW-2: [MEDIUM] `capabilities/cache.ts` uses `Date.now()` for role cache TTL while role levels control security decisions

**File:** `src/lib/capabilities/cache.ts:66,71`
**Confidence:** HIGH

`ensureLoaded()` at line 66 checks `Date.now() - roleCacheLoadedAt < ROLE_CACHE_TTL_MS` (60s). If an admin revokes a role's capabilities, the in-memory cache may persist the old capabilities for up to 60s. This is by design (stale-while-revalidate), but unlike `system-settings-config.ts`, the `roleCacheLoadedAt` timestamp at line 71 is also set with `Date.now()`.

The real concern: `invalidateRoleCache()` (line 83) sets `roleCache = null` but does NOT reset `roleCacheLoadedAt`. After invalidation, `ensureLoaded()` at line 66 sees `roleCache` is null (falsy), so it proceeds to reload regardless of `roleCacheLoadedAt`. This means the `Date.now()` vs `getDbNowMs()` distinction doesn't matter here because the null-check short-circuits the TTL check.

**Verdict:** Not a real issue — the null-check on `roleCache` makes the TTL check unreachable after invalidation. No fix needed.

---

### NEW-3: [MEDIUM] `auto-review.ts` passes full `problem.description` (up to 2000 chars) and full `sourceCode` to AI prompt without sanitization

**File:** `src/lib/judge/auto-review.ts:89,129,131`
**Confidence:** MEDIUM

The auto-review feature:
1. Slices `problemDescription` to 2000 chars (line 129) — reasonable truncation.
2. Passes full `sourceCode` without any size limit (line 131) — could be very large (up to 256KB per `maxSourceCodeSizeBytes`).
3. The `config` object is cast with `as` at line 57 without runtime validation.

**Concrete failure scenario:** A student submits a 256KB source file. The auto-review sends the entire file to the AI provider in the prompt, which (a) could exceed the model's context window, causing a wasted API call and billing, or (b) could produce a truncated/unhelpful review.

**Fix:** Add a source code size limit for auto-review (e.g., 8KB) and skip auto-review for files exceeding it. Consider validating the `config` shape with Zod instead of `as`.

**Verdict:** Actionable — add source code size cap for auto-review.

---

### NEW-4: [LOW] `docker/client.ts` `buildDockerImageLocal` accumulates stdout/stderr up to 2MB with string slicing

**File:** `src/lib/docker/client.ts:159-166`
**Confidence:** HIGH

Already tracked as DEFER-52. String concatenation + slicing on every `data` event is O(n^2) in the worst case for large builds. The 2MB cap prevents unbounded memory growth, but the slicing approach is inefficient. Already deferred.

---

### NEW-5: [MEDIUM] SSE events route O(n) scan for oldest-entry eviction when `connectionInfoMap` exceeds `MAX_TRACKED_CONNECTIONS`

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`
**Confidence:** HIGH

Already tracked as DEFER-49. The eviction loop at lines 46-53 iterates all entries to find the oldest by `createdAt`. This is O(n) and runs under the `addConnection` path which is called on every new SSE connection. With `MAX_TRACKED_CONNECTIONS = 1000`, this is unlikely to be a bottleneck, but could be improved with a sorted data structure.

Already deferred.

---

### NEW-6: [LOW] Multiple client components use `console.error` instead of the structured `logger`

**File:** Multiple client components (see grep results)
**Confidence:** HIGH

30+ instances of `console.error/warn/log` in client components. In production, these are not captured by the server-side pino logger and are only visible in the browser devtools. For client-side code, `console.error` is acceptable (no pino access in browser), but some instances leak API error codes to the console that could assist attackers.

**Concrete failure scenario:** `edit-group-dialog.tsx:67` logs `"Unmapped error in edit-group-dialog:", error` which could include server error messages containing internal details.

**Fix:** Replace sensitive `console.error` calls with user-facing toast messages and avoid logging raw error objects. Low priority since these are client-side only.

**Verdict:** Defer — low-severity, client-side only.

---

### NEW-7: [MEDIUM] `in-memory-rate-limit.ts` `maybeEvict` triggers on every rate-limit call

**File:** `src/lib/security/in-memory-rate-limit.ts:22-51`
**Confidence:** HIGH

Already tracked as DEFER-50. `maybeEvict()` is called at the top of `isRateLimitedInMemory`, `recordAttemptInMemory`, and `recordFailureInMemory`. It has a 60s time guard, but the time check itself runs on every call. The real cost is the iteration when eviction does trigger — it iterates all 10,000 max entries.

Already deferred.

---

### Previously Verified Fixes (no regression)

- `data-retention.ts` `getRetentionCutoff` — `now` is now a required parameter (cycle 40 fix confirmed)
- `participant-status.ts` — `Date.now()` default removed (cycle 39 fix confirmed)
- Docker build stderr sanitized (cycle 39 fix confirmed)
- `JUDGE_WORKER_URL` guard in `callWorkerJson`/`callWorkerNoContent` (cycle 39 fix confirmed)
- `db/import.ts` error messages sanitized (cycle 38 fix confirmed)
- Anti-cheat monitor text content capture removed (cycle 38 fix confirmed)

---

## Summary of Actionable New Findings

| # | Severity | Confidence | Summary | Action |
|---|----------|------------|---------|--------|
| NEW-1 | MEDIUM | HIGH | system-settings-config Date.now() for cache timestamps | Defer (low-impact, short TTL) |
| NEW-3 | MEDIUM | MEDIUM | auto-review sends unlimited sourceCode to AI | Fix — add size cap |
| NEW-6 | LOW | HIGH | console.error in client components | Defer (low-severity) |

Only NEW-3 is actionable this cycle. The rest are deferrals of known patterns or low-severity.

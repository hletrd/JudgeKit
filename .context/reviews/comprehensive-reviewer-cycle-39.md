# Comprehensive Review — Cycle 39

**Date:** 2026-04-25
**Reviewer:** comprehensive-reviewer (code quality, security, performance, architecture, correctness)
**Scope:** Full repository — src/, tests/, configuration

---

## NEW-1: [MEDIUM] `docker/client.ts` `buildDockerImageLocal` leaks full stderr/stdout from Docker build to admin API response

**Confidence:** HIGH
**File:** `src/lib/docker/client.ts:176`

When a local Docker build fails, line 176 resolves with `{ success: false, error: stderr.trim() || stdout.trim() }`. The `stderr` from Docker builds often contains internal paths, environment variable names from build args, layer IDs, and registry URLs. This error string propagates through the admin API to the client browser.

**Concrete failure scenario:** An admin triggers a Docker image build. The Dockerfile has a broken RUN step. The stderr contains `RUN npm install` failure output with the full path `/app/src/lib/security/encryption.ts` and a reference to the `NODE_ENCRYPTION_KEY` env var needed at build time. The admin UI displays this error in a toast, and the browser DevTools capture the full response body including the path and env var name.

**Fix:** Replace `error: stderr.trim() || stdout.trim()` with a generic message like `error: "Docker build failed"`, and log the full stderr/stdout server-side only (which already happens via `proc.stderr.on('data', ...)`).

---

## NEW-2: [MEDIUM] `participant-status.ts` `hasActiveExamSession` and `getAssignmentParticipantStatus` use client-clock `Date.now()` for exam session deadline checks

**Confidence:** HIGH
**File:** `src/lib/assignments/participant-status.ts:42,65`

Both `hasActiveExamSession` and `getAssignmentParticipantStatus` default their `now` parameter to `Date.now()`. These functions determine whether a student's exam session is still active, which controls whether they can continue working. This is inconsistent with the established pattern in `leaderboard.ts`, `contest-scoring.ts`, and `data-retention-maintenance.ts` where `getDbNowMs()` is used for deadline comparisons.

**Concrete failure scenario:** The app server's clock is 5 seconds behind the DB server. A student's personal deadline is 14:00:00 DB time. At 14:00:03 DB time, `hasActiveExamSession` with `Date.now()` returns 13:59:58, which is before the deadline. The student continues working for 5 seconds past the actual deadline, potentially submitting answers that should be penalized.

**Note:** These functions may be called from client-side code where `Date.now()` is the only option. If so, the server-side callers should explicitly pass `getDbNowMs()`.

**Fix:** Audit all call sites. For server-side callers, pass `await getDbNowMs()`. For client-side callers (if any), document the clock-skew limitation. Change the default parameter signature to require explicit `now` (remove the default) so callers must be intentional.

---

## NEW-3: [LOW] `docker/client.ts` `callWorkerJson` and `callWorkerNoContent` do not validate `JUDGE_WORKER_URL` before making fetch requests

**Confidence:** MEDIUM
**File:** `src/lib/docker/client.ts:41-57,63-77`

If `JUDGE_WORKER_URL` is empty (the default is `""`), `callWorkerJson` and `callWorkerNoContent` will attempt to fetch from a relative URL like `/docker/images`, which would hit the app's own API routes. While `USE_WORKER_DOCKER_API` is gated on both `JUDGE_WORKER_URL` and `RUNNER_AUTH_TOKEN`, the individual functions don't have that guard.

**Concrete failure scenario:** A developer calls `callWorkerJson` directly (bypassing the `USE_WORKER_DOCKER_API` check) with a misconfigured env. The fetch hits the app's own `/docker/images` endpoint, potentially causing unexpected auth failures or infinite loops if the request goes through the proxy middleware.

**Fix:** Add a runtime check at the top of `callWorkerJson` and `callWorkerNoContent`: `if (!JUDGE_WORKER_URL) throw new Error("JUDGE_WORKER_URL is not configured");`

---

## NEW-4: [LOW] `in-memory-rate-limit.ts` `maybeEvict` runs on every `isRateLimitedInMemory` and `recordAttemptInMemory` call

**Confidence:** MEDIUM
**File:** `src/lib/security/in-memory-rate-limit.ts:24-51`

`maybeEvict()` checks `Date.now() - lastEviction < 60_000` on every rate-limit check. While the early return is fast, this is called on every API request that hits rate-limited endpoints. The eviction logic itself (iterating all entries when the 60s threshold is passed) is O(n).

**Concrete failure scenario:** 10,000 rate limit entries. After 60 seconds, the next request triggers a full scan of all 10,000 entries. This adds ~1ms latency to that single request. Under normal operation this is acceptable, but the pattern could be improved.

**Fix:** Consider using a separate `setInterval` for eviction (similar to the SSE cleanup pattern in `events/route.ts`), or at minimum, make the eviction check a cheap timestamp comparison without entering the function body. LOW because the 60s guard prevents frequent full scans.

---

## NEW-5: [LOW] `contest-scoring.ts` ranking cache uses `Date.now()` for staleness check while `getDbNowMs()` is used for cache writes

**Confidence:** MEDIUM
**File:** `src/lib/assignments/contest-scoring.ts:101-108`

The ranking cache checks staleness using `Date.now()` (line 107) but cache entries are written with timestamps from `getDbNowMs()` (per the code comments at lines 101-106). Under significant clock skew, a cache entry could be considered fresh when it's actually stale, or vice versa. The code comment acknowledges this and says the 15-second tolerance makes 1-2 seconds of skew acceptable, which is reasonable for a stale-while-revalidate pattern.

**Fix:** No action needed. The code already has an extensive comment explaining the tradeoff. Document in the aggregate as a known, accepted tradeoff.

---

## NEW-6: [LOW] `buildDockerImageLocal` accumulates stdout/stderr up to 2MB without any stream-level timeout

**Confidence:** LOW
**File:** `src/lib/docker/client.ts:157-164,166-169`

The build process has a 600s wall-clock timeout (line 166), but stdout/stderr are accumulated into strings capped at 2MB each (lines 159, 163). For very verbose builds (e.g., npm install with many dependencies), this could consume significant memory. The 2MB cap prevents unbounded growth, but the string slicing (`stdout.slice(-2 * 1024 * 1024)`) creates a new 2MB string on each overflow, which could cause GC pressure during a 10-minute build.

**Fix:** LOW — the memory cap prevents unbounded growth. Consider using a circular buffer or discarding output after a threshold is reached rather than keeping the last 2MB. Not urgent.

---

## Previously Fixed Items (confirmed in current code)

All cycle 38 fixes verified:
- AGG-3 (cycle 38): `db/import.ts` error messages sanitized before API response — confirmed at lines 136, 200, 217
- AGG-4 (cycle 38): Anti-cheat monitor text content capture removed — confirmed at lines 204-211 (no text capture)

All cycle 37 fixes verified:
- AGG-1 (cycle 37): `parseInt || default` — fixed with `Number.isFinite`
- AGG-2 (cycle 37): `parseFloat || 0` — fixed with `Number.isFinite`
- AGG-3 (cycle 37): Flaky public-seo-metadata test — fixed with 15s timeout

## Positive Observations

- `escapeLikePattern` is used consistently everywhere LIKE queries appear — no SQL injection risk
- `createApiHandler` provides a clean, composable middleware pipeline (auth, CSRF, rate limit, Zod validation)
- Encryption module is well-designed: no dev fallback key, `getKey()` throws when `NODE_ENCRYPTION_KEY` is missing
- `ALWAYS_REDACT` and `SANITIZED_COLUMNS` now include `hcaptchaSecret` — the cycle-19 AGG-1 issue is fixed
- Proxy auth cache uses FIFO eviction with a 90% capacity cleanup threshold — the cycle-19 AGG-3 fix is in place
- `leaderboard.ts` correctly uses `getDbNowMs()` for freeze boundary checks — the cycle-19 AGG-2 fix is in place
- CSP headers are comprehensive and properly configured
- IP extraction properly validates proxy hop counts to prevent spoofing
- No `eval()`, `innerHTML`, or `document.write()` usage found
- `dangerouslySetInnerHTML` usage is properly guarded with `sanitizeHtml` and `safeJsonForScript`

## Carried Deferred Items (unchanged from cycle 38)

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
- DEFER-43: Docker client leaks `err.message` in build responses (partially overlaps NEW-1)
- DEFER-44: No documentation for timer pattern convention
- DEFER-45: Anti-cheat monitor captures user text snippets (design decision — partially fixed in cycle 38)
- DEFER-46: `error.message` as control-flow discriminator across 15+ API catch blocks
- DEFER-47: Import route JSON path uses unsafe `as JudgeKitExport` cast
- DEFER-48: CountdownTimer initial render uses uncorrected client time
- DEFER-49: SSE connection tracking uses O(n) scan for oldest-entry eviction

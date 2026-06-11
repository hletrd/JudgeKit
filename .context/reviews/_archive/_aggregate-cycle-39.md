# Aggregate Review — Cycle 39

**Date:** 2026-04-25
**Reviewers:** comprehensive-reviewer
**Total findings:** 6 new (2 MEDIUM, 4 LOW) + 0 false positives + 19 carried deferred re-validated + 3 cycle-38 fixes confirmed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `docker/client.ts` `buildDockerImageLocal` leaks full Docker build stderr to admin API response

**Sources:** NEW-1, DEFER-43 (partial overlap) | **Confidence:** HIGH
**Cross-agent signal:** Also tracked as DEFER-43 (Docker client leaks `err.message` in build responses)

When a local Docker build fails, line 176 resolves with `{ success: false, error: stderr.trim() || stdout.trim() }`. The stderr from Docker builds can contain internal paths, environment variable names, layer IDs, and registry URLs. This propagates through the admin API to the client browser. DEFER-43 was previously deferred because Docker builds are admin-only, but the specific risk of leaking env var names and internal paths from build output was not called out.

**Concrete failure scenario:** An admin triggers a Docker image build. The Dockerfile has a broken RUN step. The stderr contains `RUN npm install` failure output referencing the path `/app/src/lib/security/encryption.ts` and the `NODE_ENCRYPTION_KEY` env var needed at build time. The admin UI displays this error in a toast, and the browser DevTools capture the full response body including the path and env var name.

**Fix:** Replace `error: stderr.trim() || stdout.trim()` with `error: "Docker build failed"`, and log the full output server-side (already done via `proc.stderr.on('data', ...)`).

---

### AGG-2: [MEDIUM] `participant-status.ts` uses client-clock `Date.now()` default for exam session deadline checks

**Sources:** NEW-2 | **Confidence:** HIGH

Both `hasActiveExamSession` (line 42) and `getAssignmentParticipantStatus` (line 65) default their `now` parameter to `Date.now()`. These functions determine whether a student's exam session is still active. This is inconsistent with the established pattern in `leaderboard.ts`, `contest-scoring.ts`, and `data-retention-maintenance.ts` where `getDbNowMs()` is used for deadline comparisons.

**Concrete failure scenario:** The app server's clock is 5 seconds behind the DB server. A student's personal deadline is 14:00:00 DB time. At 14:00:03 DB time, `hasActiveExamSession` with `Date.now()` returns 13:59:58, which is before the deadline. The student continues working for 5 seconds past the actual deadline.

**Note:** These functions may be called from client-side code where `Date.now()` is the only option. If so, server-side callers must explicitly pass `getDbNowMs()`.

**Fix:** Audit all call sites. For server-side callers, pass `await getDbNowMs()`. For client-side callers, document the clock-skew limitation. Consider removing the `Date.now()` default so callers must be intentional.

---

### AGG-3: [LOW] `docker/client.ts` worker API functions don't validate `JUDGE_WORKER_URL` before fetch

**Sources:** NEW-3 | **Confidence:** MEDIUM

If `JUDGE_WORKER_URL` is empty (default `""`), `callWorkerJson` and `callWorkerNoContent` will attempt to fetch from a relative URL like `/docker/images`, hitting the app's own API routes. While `USE_WORKER_DOCKER_API` is gated on both variables, the individual functions don't have that guard.

**Concrete failure scenario:** A developer calls `callWorkerJson` directly (bypassing the `USE_WORKER_DOCKER_API` check) with a misconfigured env. The fetch hits the app's own endpoint, potentially causing auth failures or infinite loops through the proxy middleware.

**Fix:** Add a runtime check at the top of `callWorkerJson` and `callWorkerNoContent`: `if (!JUDGE_WORKER_URL) throw new Error("JUDGE_WORKER_URL is not configured");`

---

### AGG-4: [LOW] `in-memory-rate-limit.ts` `maybeEvict` triggers on every rate-limit call

**Sources:** NEW-4 | **Confidence:** MEDIUM

`maybeEvict()` checks `Date.now() - lastEviction < 60_000` on every rate-limit check. When the 60s threshold passes, it runs a full O(n) scan of all entries. Under high traffic with 10,000 entries, this adds ~1ms latency to the first request after each 60s window.

**Fix:** Consider using a separate `setInterval` for eviction (similar to the SSE cleanup pattern), or accept the current behavior as the 60s guard prevents frequent full scans. LOW because impact is negligible under normal load.

---

### AGG-5: [LOW] `contest-scoring.ts` ranking cache mixes `Date.now()` staleness check with `getDbNowMs()` writes

**Sources:** NEW-5 | **Confidence:** MEDIUM

The ranking cache checks staleness using `Date.now()` (line 107) but cache entries are written with timestamps from `getDbNowMs()`. Under significant clock skew, a cache entry could be considered fresh when it's actually stale, or vice versa. The code comment at lines 101-106 explicitly acknowledges this and says the 15-second tolerance makes 1-2 seconds of skew acceptable.

**Fix:** No action needed. The tradeoff is already documented and acceptable for a stale-while-revalidate pattern. Record as accepted risk.

---

### AGG-6: [LOW] `buildDockerImageLocal` accumulates stdout/stderr up to 2MB with string slicing

**Sources:** NEW-6 | **Confidence:** LOW

For very verbose builds, the string slicing (`stdout.slice(-2 * 1024 * 1024)`) creates a new 2MB string on each overflow, which could cause GC pressure during a 10-minute build. The 2MB cap prevents unbounded growth.

**Fix:** Consider using a circular buffer or discarding output after a threshold is reached. LOW — the memory cap prevents unbounded growth and Docker builds are infrequent admin operations.

---

## Previously Fixed Items (confirmed in current code)

All cycle 38 fixes verified:
- AGG-3 (cycle 38): `db/import.ts` error messages sanitized before API response
- AGG-4 (cycle 38): Anti-cheat monitor text content capture removed

All cycle 37 fixes verified:
- AGG-1 (cycle 37): `parseInt || default` fixed with `Number.isFinite`
- AGG-2 (cycle 37): `parseFloat || 0` fixed with `Number.isFinite`
- AGG-3 (cycle 37): Flaky public-seo-metadata test fixed with 15s timeout

---

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
- DEFER-43: Docker client leaks `err.message` in build responses (partially addressed by AGG-1)
- DEFER-44: No documentation for timer pattern convention
- DEFER-45: Anti-cheat monitor captures user text snippets (design decision — partially fixed in cycle 38)
- DEFER-46: `error.message` as control-flow discriminator across 15+ API catch blocks
- DEFER-47: Import route JSON path uses unsafe `as JudgeKitExport` cast
- DEFER-48: CountdownTimer initial render uses uncorrected client time
- DEFER-49: SSE connection tracking uses O(n) scan for oldest-entry eviction

Reason for deferral unchanged. See cycle 38 plan for details.

---

## No Agent Failures

The comprehensive review completed successfully.

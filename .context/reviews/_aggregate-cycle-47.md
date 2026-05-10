# Aggregate Review — Cycle 47

**Date:** 2026-05-10
**Reviewers:** comprehensive-reviewer (fresh pass)
**Total findings:** 0 new + 0 false positives + 26 carried deferred re-validated + prior cycle findings confirmed fixed

---

## New Findings

No new findings identified in this cycle.

## Review Coverage

- Examined 580+ source files (`.ts`, `.tsx`)
- Focus areas: timer lifecycle, error handling, race conditions, memory leaks, type safety, API route security
- Verified all cycle 46 fixes remain in place:
  - `use-visibility-polling.ts` try/catch guard around callback — confirmed
  - `docker/client.ts` `cleanupWithTimeout` in `callWorkerJson`/`callWorkerNoContent` — confirmed
  - `problem-submission-form.tsx` snapshot timer unmount race guard — confirmed
  - `abort.ts` `cleanupWithTimeout` added to `withTimeout` — confirmed
- Checked recently modified files since cycle 46:
  - `src/hooks/use-visibility-polling.ts` — fixed, correct
  - `src/lib/docker/client.ts` — fixed, correct
  - `src/lib/api/client.ts` — reviewed; `AbortSignal.timeout()` auto-cleans in all supported environments
  - `src/components/exam/countdown-timer.tsx` — reviewed; timer cleanup correct
  - `src/components/exam/anti-cheat-monitor.tsx` — reviewed; retry extraction correct
  - `src/lib/files/image-processing.ts` — reviewed; buffer size check and `limitInputPixels` in place
  - `src/app/api/v1/files/bulk-delete/route.ts` — reviewed; schema already has `.max(100)` bound
  - `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` — reviewed; uses `Date.now()` for staleness, proper error handling
  - `src/proxy.ts` — reviewed; uses `getAuthSessionCookieNames()` for dynamic cookie clearing
- Stale cycle-47 findings from prior session re-verified:
  - Cycle 47 AGG-1 (Math.max spread in frontend charts) — **FIXED** in current code, no remaining instances
  - Cycle 47 AGG-2 (anti-cheat retry duplication) — **FIXED** in current code, `performFlush` extracted
  - Cycle 47 AGG-3 (image-processing hardcoded limit) — **DEFERRED** as DEFER-57, unchanged
  - Cycle 47 AGG-4 (bulk-delete max IDs) — **FIXED** in current code, schema has `.max(100)`
- Stale cycle-48 findings from prior session re-verified:
  - Cycle 48 AGG-1 (analytics route getDbNowMs in catch) — **FIXED** in current code, uses `Date.now()` in catch
  - Cycle 48 AGG-2 (anti-cheat retry scheduling duplication) — **FIXED** in current code, single `scheduleRetryRef`
  - Cycle 48 AGG-3 (proxy.ts hardcoded cookie names) — **FIXED** in current code, uses `getAuthSessionCookieNames()`
  - Cycle 48 AGG-4 (rate-limiter-client per-instance circuit breaker) — **DOCUMENTED** as known trade-off

## Previously Fixed Items (confirmed in current code)

All prior cycle fixes verified:
- Cycle 46 AGG-1: `anti-cheat-monitor.tsx` schedules retry after partial flush failure — confirmed
- Cycle 46 AGG-2: `image-processing.ts` buffer size check + `limitInputPixels` — confirmed
- Cycle 46 AGG-3: `contest-scoring.ts` uses `reduce` instead of `Math.max(...)` spread — confirmed
- Cycle 45 AGG-1: `in-memory-rate-limit.ts` single-pass eviction — confirmed
- Cycle 45 AGG-2: `buildDockerImageLocal` head+tail buffer — confirmed
- Cycle 45 AGG-3: `auto-review.ts` uses `Buffer.byteLength()` — confirmed
- All earlier fixes from cycles 39-44 remain in place

## Carried Deferred Items (unchanged from cycle 46)

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

Reason for deferral unchanged. See prior aggregates for details.

## No Agent Failures

The comprehensive review completed successfully. No subagents were used (none registered in this environment); review was performed directly.

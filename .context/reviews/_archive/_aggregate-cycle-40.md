# Aggregate Review — Cycle 40

**Date:** 2026-04-25
**Reviewers:** comprehensive-reviewer
**Total findings:** 1 new (1 MEDIUM) + 0 false positives + 19 carried deferred re-validated + previous cycle fixes confirmed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `data-retention.ts` `getRetentionCutoff` uses `Date.now()` default — same clock-skew trap fixed in `participant-status.ts` in cycle 39

**Sources:** NEW-5 | **Confidence:** HIGH

`getRetentionCutoff(days, now = Date.now())` at `src/lib/data-retention.ts:38` has a `Date.now()` default parameter. All current server-side callers pass `getDbNowMs()` explicitly, but the default creates a latent maintenance trap: a future caller that forgets to pass `now` will silently use app-server time instead of DB time for data deletion decisions.

This is the exact same class of bug that was fixed in `participant-status.ts` in cycle 39 (commit aa1fca67), where `Date.now()` defaults were removed from exam session deadline checks. The data retention case is more severe because an incorrect cutoff could cause premature data deletion.

**Concrete failure scenario:** A developer adds a "dry-run retention preview" endpoint and calls `getRetentionCutoff(90)` without passing `now`. The app server clock is 30 seconds ahead of the DB server. The returned cutoff is 30 seconds earlier than it should be, causing the preview to show data as eligible for pruning that hasn't actually passed its retention deadline in the DB.

**Fix:** Remove the `Date.now()` default from `getRetentionCutoff`, making `now` a required parameter. Update all callers (already passing `getDbNowMs()` — no change needed). Add a JSDoc comment requiring `getDbNowMs()`. This function has no client-side callers (data retention is always server-side), so removing the default is safe.

---

## Previously Fixed Items (confirmed in current code)

All cycle 39 fixes verified:
- AGG-1 (cycle 39): Docker build stderr sanitized — `error: "Docker build failed"` at line 181
- AGG-2 (cycle 39): `participant-status.ts` `Date.now()` default removed — `now` is now a required parameter
- AGG-3 (cycle 39): `JUDGE_WORKER_URL` guard added to `callWorkerJson` and `callWorkerNoContent`

All cycle 38 fixes verified:
- AGG-3 (cycle 38): `db/import.ts` error messages sanitized before API response
- AGG-4 (cycle 38): Anti-cheat monitor text content capture removed

---

## Carried Deferred Items (unchanged from cycle 39)

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

Reason for deferral unchanged. See cycle 39 plan for details.

---

## No Agent Failures

The comprehensive review completed successfully.

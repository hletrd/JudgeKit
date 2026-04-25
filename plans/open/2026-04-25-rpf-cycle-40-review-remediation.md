# RPF Cycle 40 — Review Remediation Plan

**Date:** 2026-04-25
**Cycle:** 40/100
**Base commit:** (current HEAD)
**Review artifacts:** `.context/reviews/comprehensive-reviewer-cycle-40.md` + `.context/reviews/_aggregate-cycle-40.md`

## Previously Completed Tasks (Verified in Current Code)

All cycle 39 tasks are complete:
- [x] Task A: Sanitize Docker build error output — commit 3268cd09
- [x] Task B: Remove `Date.now()` default from `participant-status.ts` — commit aa1fca67
- [x] Task C: Add `JUDGE_WORKER_URL` guard — commit 3268cd09

All cycle 38 tasks are complete:
- [x] Task A: Sanitize `db/import.ts` error messages — commit 76f253bb
- [x] Task B: Remove text content capture from anti-cheat copy/paste events — commit 66dcad78

## Tasks (priority order)

### Task A: Remove `Date.now()` default from `getRetentionCutoff` in `data-retention.ts` [MEDIUM/HIGH]

**From:** AGG-1 (NEW-5)
**Severity / confidence:** MEDIUM / HIGH
**Files:**
- `src/lib/data-retention.ts:38`
- `src/lib/data-retention-maintenance.ts` (caller — already passes `nowMs` explicitly)

**Problem:** `getRetentionCutoff(days, now = Date.now())` has a `Date.now()` default parameter. All current server-side callers pass `getDbNowMs()` explicitly, but the default creates a latent maintenance trap identical to the one fixed in `participant-status.ts` in cycle 39. The data retention case is more severe because an incorrect cutoff could cause premature data deletion.

**Plan:**
1. Remove the `Date.now()` default from `getRetentionCutoff`, making `now` a required parameter
2. Update the JSDoc to require `getDbNowMs()` for server-side callers
3. Verify all callers already pass the `now` parameter explicitly (no changes expected)
4. Verify all gates pass

**Status:** DONE (commit 2d4d9a62)

---

## Deferred Items

### Carried deferred items from cycle 39 (unchanged):

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

## Progress log

- 2026-04-25: Plan created with 1 task (A). No new deferred items this cycle.
- 2026-04-25: Task A DONE — remove Date.now() default from getRetentionCutoff (commit 2d4d9a62).
- 2026-04-25: All gates green (eslint 0, tsc clean, vitest 302/302 pass 2197 tests, next build success).

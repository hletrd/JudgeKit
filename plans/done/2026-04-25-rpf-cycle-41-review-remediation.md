# RPF Cycle 41 — Review Remediation Plan

**Date:** 2026-04-25
**Cycle:** 41/100
**Base commit:** (current HEAD)
**Review artifacts:** `.context/reviews/comprehensive-reviewer-cycle-41.md` + `.context/reviews/_aggregate-cycle-41.md`

## Previously Completed Tasks (Verified in Current Code)

All cycle 40 tasks are complete:
- [x] Task A: Remove `Date.now()` default from `getRetentionCutoff` — commit 2d4d9a62

All cycle 39 tasks are complete:
- [x] Task A: Sanitize Docker build error output — commit 3268cd09
- [x] Task B: Remove `Date.now()` default from `participant-status.ts` — commit aa1fca67
- [x] Task C: Add `JUDGE_WORKER_URL` guard — commit 3268cd09

All cycle 38 tasks are complete:
- [x] Task A: Sanitize `db/import.ts` error messages — commit 76f253bb
- [x] Task B: Remove text content capture from anti-cheat copy/paste events — commit 66dcad78

## Tasks (priority order)

### Task A: Add source code size cap for auto-review to prevent AI context overflow [MEDIUM/MEDIUM]

**From:** AGG-1 (NEW-3)
**Severity / confidence:** MEDIUM / MEDIUM
**Files:**
- `src/lib/judge/auto-review.ts:42,131`

**Problem:** `auto-review.ts` passes the full `sourceCode` (up to 256KB per `maxSourceCodeSizeBytes`) directly into the AI prompt without any size limit. The `problemDescription` is already truncated to 2000 chars (line 129), but `sourceCode` is not truncated. This could (a) exceed the model's context window, causing a wasted API call and billing charge with no review output, or (b) produce a truncated/unhelpful review.

**Plan:**
1. Add a constant `AUTO_REVIEW_MAX_SOURCE_CODE_BYTES = 8192` (8KB, roughly 200 lines)
2. After fetching the submission, check `sourceCode.length` against the cap
3. If exceeded, log at debug level and return early (skip auto-review silently)
4. Verify all gates pass

**Status:** DONE (commit 69fa3218)

---

## Deferred Items

### Carried deferred items from cycle 40 (unchanged):

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

Reason for deferral unchanged. See cycle 40 plan for details.

### New deferred items this cycle:

- NEW-1 (from review): `system-settings-config.ts` uses `Date.now()` for cache timestamps — deferred due to low impact (60s TTL provides sufficient buffer; settings changes are rare)
- NEW-6 (from review): `console.error` in client components — deferred due to low severity (client-side only, no pino access in browser)

---

## Progress log

- 2026-04-25: Plan created with 1 task (A). 2 new deferred items this cycle.
- 2026-04-25: Task A DONE — add source code size cap for auto-review (commit 69fa3218).
- 2026-04-25: All gates green (eslint 0, tsc clean, vitest 302/302 pass 2197 tests, next build success).

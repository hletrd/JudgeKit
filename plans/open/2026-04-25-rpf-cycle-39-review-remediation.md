# RPF Cycle 39 — Review Remediation Plan

**Date:** 2026-04-25
**Cycle:** 39/100
**Base commit:** (current HEAD)
**Review artifacts:** `.context/reviews/comprehensive-reviewer-cycle-39.md` + `.context/reviews/_aggregate-cycle-39.md`

## Previously Completed Tasks (Verified in Current Code)

All cycle 38 tasks are complete:
- [x] Task A: Sanitize `db/import.ts` error messages — commit 76f253bb
- [x] Task B: Remove text content capture from anti-cheat copy/paste events — commit 66dcad78

## Tasks (priority order)

### Task A: Sanitize Docker build error output in `docker/client.ts` [MEDIUM/HIGH]

**From:** AGG-1 (NEW-1), partial overlap with DEFER-43
**Severity / confidence:** MEDIUM / HIGH
**Files:**
- `src/lib/docker/client.ts:176`

**Problem:** When a local Docker build fails, line 176 resolves with `{ success: false, error: stderr.trim() || stdout.trim() }`. The stderr from Docker builds can contain internal paths, environment variable names from build args, layer IDs, and registry URLs. This propagates through the admin API to the client browser.

**Plan:**
1. Line 176: Replace `error: stderr.trim() || stdout.trim()` with `error: "Docker build failed"` — the full output is already logged server-side via the `proc.stdout.on('data', ...)` and `proc.stderr.on('data', ...)` handlers
2. Verify all gates pass

**Status:** DONE (commit 3268cd09)

---

### Task B: Fix `participant-status.ts` exam session deadline checks to use DB-consistent time [MEDIUM/HIGH]

**From:** AGG-2 (NEW-2)
**Severity / confidence:** MEDIUM / HIGH
**Files:**
- `src/lib/assignments/participant-status.ts:42,65`

**Problem:** `hasActiveExamSession` and `getAssignmentParticipantStatus` default `now` to `Date.now()`. These determine whether a student's exam session is still active. This is inconsistent with the established pattern where `getDbNowMs()` is used for deadline comparisons.

**Plan:**
1. Audit all call sites of `hasActiveExamSession` and `getAssignmentParticipantStatus` to determine which are server-side vs. client-side
2. For server-side callers: pass `await getDbNowMs()` explicitly
3. For client-side callers (if any): document the clock-skew limitation in a code comment
4. Consider removing the `Date.now()` default to force callers to be intentional about time source
5. Verify all gates pass

**Status:** DONE (commit aa1fca67)

---

### Task C: Add `JUDGE_WORKER_URL` guard to `callWorkerJson` and `callWorkerNoContent` [LOW/MEDIUM]

**From:** AGG-3 (NEW-3)
**Severity / confidence:** LOW / MEDIUM
**Files:**
- `src/lib/docker/client.ts:41-57,63-77`

**Problem:** If `JUDGE_WORKER_URL` is empty (default `""`), `callWorkerJson` and `callWorkerNoContent` will attempt to fetch from a relative URL like `/docker/images`, hitting the app's own API routes. While `USE_WORKER_DOCKER_API` is gated on both variables, the individual functions lack this guard.

**Plan:**
1. Add a runtime check at the top of both functions: `if (!JUDGE_WORKER_URL) throw new Error("JUDGE_WORKER_URL is not configured");`
2. Verify all gates pass

**Status:** DONE (commit 3268cd09 — bundled with Task A)

---

## Deferred Items

### New deferrals from this cycle:

- **DEFER-50: [LOW] `in-memory-rate-limit.ts` `maybeEvict` triggers on every rate-limit call** (AGG-4 / NEW-4)
  - **File+line:** `src/lib/security/in-memory-rate-limit.ts:24-51`
  - **Original severity/confidence:** LOW / MEDIUM
  - **Reason for deferral:** The 60s guard prevents frequent full scans. Under normal load (well under 10,000 entries), the impact is negligible. The eviction logic is functionally correct.
  - **Exit criterion:** If the rate limit store grows past 10,000 entries regularly, or if profiling shows eviction as a bottleneck.

- **DEFER-51: [LOW] `contest-scoring.ts` ranking cache mixes `Date.now()` staleness check with `getDbNowMs()` writes** (AGG-5 / NEW-5)
  - **File+line:** `src/lib/assignments/contest-scoring.ts:101-108`
  - **Original severity/confidence:** LOW / MEDIUM
  - **Reason for deferral:** The code already has an extensive comment at lines 101-106 explaining the tradeoff. The 15-second stale-while-revalidate tolerance makes 1-2 seconds of clock skew acceptable. Using `getDbNowMs()` for every cache-hit check would add a DB round-trip per request, which defeats the purpose of the cache.
  - **Exit criterion:** If clock skew reports indicate the 15-second tolerance is insufficient, or if the caching strategy is redesigned.

- **DEFER-52: [LOW] `buildDockerImageLocal` accumulates stdout/stderr up to 2MB with string slicing** (AGG-6 / NEW-6)
  - **File+line:** `src/lib/docker/client.ts:157-164`
  - **Original severity/confidence:** LOW / LOW
  - **Reason for deferral:** The 2MB cap prevents unbounded growth. Docker builds are infrequent admin operations. The string slicing GC pressure is negligible compared to the Docker build process itself.
  - **Exit criterion:** If Docker build output causes memory issues, or if build frequency increases significantly.

### Carried deferred items from cycle 38 (unchanged):

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
- DEFER-43: Docker client leaks `err.message` in build responses (partially addressed by Task A)
- DEFER-44: No documentation for timer pattern convention
- DEFER-45: Anti-cheat monitor captures user text snippets (design decision — partially fixed in cycle 38)
- DEFER-46: `error.message` as control-flow discriminator across 15+ API catch blocks
- DEFER-47: Import route JSON path uses unsafe `as JudgeKitExport` cast
- DEFER-48: CountdownTimer initial render uses uncorrected client time
- DEFER-49: SSE connection tracking uses O(n) scan for oldest-entry eviction

Reason for deferral unchanged. See cycle 38 plan for details.

---

## Progress log

- 2026-04-25: Plan created with 3 tasks (A-C). 3 new findings deferred (DEFER-50 through DEFER-52).
- 2026-04-25: Task A DONE — sanitize Docker build error output (commit 3268cd09).
- 2026-04-25: Task B DONE — remove Date.now() default from participant-status (commit aa1fca67).
- 2026-04-25: Task C DONE — add JUDGE_WORKER_URL guard (bundled in commit 3268cd09).
- 2026-04-25: All gates green (eslint 0, tsc clean, vitest 302/302 pass 2197 tests, next build success).

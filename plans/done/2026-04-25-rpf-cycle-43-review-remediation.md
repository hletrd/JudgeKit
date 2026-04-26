# RPF Cycle 43 — Review Remediation Plan

**Date:** 2026-04-25
**Cycle:** 43/100
**Base commit:** 5abd88c7 (current HEAD)
**Review artifacts:** `.context/reviews/comprehensive-reviewer-cycle-43.md` + `.context/reviews/_aggregate-cycle-43.md`

## Previously Completed Tasks (Verified in Current Code)

All prior cycle 42 tasks are complete:
- [x] Task A: Fix `normalizeSource()` unclosed string literal handling — commit 95f14e9f
- [x] Task B: Add template literal (backtick) handling to `normalizeSource()` — commit 95f14e9f

All prior cycle 41 tasks are complete:
- [x] Task A: Add source code size cap for auto-review — commit 69fa3218

## Tasks (priority order)

### Task A: Remove `recruit_` username prefix to prevent candidate enumeration [MEDIUM/MEDIUM]

**From:** AGG-1 (NEW-1)
**Severity / confidence:** MEDIUM / MEDIUM
**Files:**
- `src/lib/assignments/recruiting-invitations.ts:463`

**Problem:** When a new user is created via `redeemRecruitingToken`, the username is set to `recruit_${nanoid(8)}`. The `recruit_` prefix makes it trivial to enumerate all recruiting-created accounts via the user list API or username-based lookup, potentially leaking confidential recruiting assessment information.

**Plan:**
1. Change the username generation from `recruit_${nanoid(8)}` to just `nanoid(10)` — no prefix
2. Verify all existing references to `recruit_` prefix in the codebase (login flows, admin panels) still work with the new format
3. Ensure the `nanoid(10)` length provides sufficient entropy for uniqueness (10 chars of base62 = ~59 bits, sufficient for this use case)
4. Verify all gates pass

**Status:** DONE — commit a70c7b1d

---

### Task B: Fix `contest-scoring.ts` background refresh `getDbNowMs()` failure handling to prevent thundering herd [MEDIUM/HIGH]

**From:** AGG-2 (NEW-2)
**Severity / confidence:** MEDIUM / HIGH
**Files:**
- `src/lib/assignments/contest-scoring.ts:121-135`

**Problem:** In the stale-while-revalidate background refresh, if `getDbNowMs()` fails inside the catch block (line 127), the `_lastRefreshFailureAt` cooldown entry is never set. This disables the 5-second cooldown, causing the background refresh to be retried on every cache-hit request during a DB outage, creating a thundering herd.

**Plan:**
1. In the catch block at line 127, wrap `await getDbNowMs()` in a try-catch and fall back to `Date.now()` if it fails
2. The `Date.now()` fallback is acceptable here because this timestamp is only used for a 5-second cooldown (1-2 seconds of clock skew is tolerable)
3. Verify all gates pass

**Status:** DONE — commit b9c661be

---

### Task C: Add atomic deadline check to recruiting token already-redeemed re-entry path [LOW/MEDIUM]

**From:** AGG-3 (NEW-3)
**Severity / confidence:** LOW / MEDIUM
**Files:**
- `src/lib/assignments/recruiting-invitations.ts:404-428`

**Problem:** When a recruiting token is already redeemed and the user re-enters with a password, the code does NOT check the assignment deadline. The initial redeem has an atomic SQL `deadline > NOW()` gate, but the already-redeemed path lacks this, allowing candidates to access closed contests.

**Plan:**
1. Add a SQL-level deadline check in the already-redeemed path, similar to the atomic claim step in the initial redeem
2. Use `sql`${assignments.deadline} IS NULL OR ${assignments.deadline} > NOW()`` in the WHERE clause when looking up the assignment
3. If the deadline has passed, return `{ ok: false, error: "assignmentClosed" }`
4. Verify all gates pass

**Status:** DONE — commit a70c7b1d

---

## Deferred Items

### Carried deferred items from cycle 42 (unchanged):

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

### New deferred items this cycle:

- AGG-4 (NEW-5): `in-memory-rate-limit.ts` `maybeEvict` double-scans expired entries on capacity overflow — deferred as LOW severity. The double-scan is redundant but harmless; the periodic eviction at lines 27-29 already handles expired entries. Exit criterion: performance profiling shows rate-limit latency is a bottleneck.

- AGG-5 (NEW-6): `recruiting/request-cache.ts` `setCachedRecruitingContext` mutates ALS store without userId match check — deferred as LOW severity and LOW confidence. In practice each request is scoped to a single user, so cross-user contamination is extremely unlikely. Exit criterion: evidence of cross-user request handling in the same ALS context.

---

## Progress log

- 2026-04-25: Plan created with 3 tasks (A, B, C). 2 new deferred items this cycle.
- 2026-04-25: All 3 tasks implemented. Task A+C in commit a70c7b1d, Task B in commit b9c661be. All gates pass.

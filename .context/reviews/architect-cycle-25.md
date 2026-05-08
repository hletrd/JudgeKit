# Architect — Cycle 25

**Date:** 2026-04-24
**Scope:** Architecture and design review

---

## A-1: [MEDIUM] Late-penalty scoring logic is duplicated in three places — single source of truth violation

**Confidence:** HIGH
**Citations:**
- `src/lib/assignments/scoring.ts:54-76` — `buildIoiLatePenaltyCaseExpr()` (canonical)
- `src/lib/assignments/submissions.ts:568-578` — inline CASE (missing windowed branch)
- `src/lib/assignments/scoring.ts:13-28` — `mapSubmissionPercentageToAssignmentPoints()` (TypeScript version)

The IOI late-penalty scoring logic exists in three forms:
1. `buildIoiLatePenaltyCaseExpr()` — SQL fragment, handles both non-windowed and windowed modes
2. Inline CASE in `getAssignmentStatusRows` — SQL fragment, only handles non-windowed mode
3. `mapSubmissionPercentageToAssignmentPoints()` — TypeScript function, only handles non-windowed mode (compares `submittedAt > deadline`)

Forms (2) and (3) are missing the windowed-exam branch. This is a design risk: any change to the penalty formula must be applied in three places, and two of them are already out of sync.

**Fix:**
1. Replace the inline CASE in `getAssignmentStatusRows` with a call to `buildIoiLatePenaltyCaseExpr()`.
2. Update `mapSubmissionPercentageToAssignmentPoints()` to accept an optional `personalDeadline` parameter and apply the windowed-branch logic, or deprecate it in favor of SQL-level scoring.

---

## A-2: [LOW] `rateLimits` table overloaded for SSE connections and heartbeat dedup — carried from prior cycles

**Confidence:** MEDIUM
**Citations:** `src/lib/realtime/realtime-coordination.ts:75-136`, `src/lib/db/schema.pg.ts:593-611`

This finding was already identified in cycle 24 (AGG-5 / DEFER-14). The `rateLimits` table serves three purposes: rate limiting, SSE connection tracking, and anti-cheat heartbeat dedup. The global advisory lock on SSE acquisition serializes connection setups. No new findings this cycle.

---

## Positive Observations

- Clean separation of concerns: `createApiHandler` wraps auth, CSRF, rate limiting, validation, and error handling
- Consistent use of `getDbNowMs()` / `getDbNowUncached()` for all clock-skew-sensitive paths
- `namedToPositional()` provides a clean abstraction for parameterized raw SQL queries
- Capability-based authorization system is well-designed with cached resolution
- Audit event buffer with batched inserts is a good pattern for write-heavy paths
- Stale-while-revalidate caching on leaderboard and analytics prevents thundering herd

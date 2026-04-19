# Aggregate Review — Cycle 19 Deep Code Review

**Date:** 2026-04-19
**Source reviews:**
- `cycle-19-comprehensive-review.md` (comprehensive multi-angle review covering code quality, security, performance, architecture, correctness, data integrity, UI/UX)
- `cycle-18-comprehensive-review.md` (previous cycle — all findings addressed or deferred)
- Prior cycles 1-16 reviews (findings already addressed or deferred in prior plan documents)

---

## CRITICAL (Immediate Action Required)

None.

---

## HIGH (Should Fix This Cycle)

None.

---

## MEDIUM (Should Fix Soon)

### M1: `computeSingleUserLiveRank` returns rank 1 for users with no submissions — misleading frozen leaderboard badge
- **Source**: cycle-19 F1
- **Files**: `src/lib/assignments/leaderboard.ts:131-137` (ICPC), `src/lib/assignments/leaderboard.ts:161-166` (IOI)
- **Confidence**: HIGH
- **Description**: Both ICPC and IOI branches use a `target` CTE that returns zero rows for users with no submissions. The cross-join `FROM user_totals ut, target t` then produces zero rows, and `COALESCE(1 + COUNT(*), 1)` returns 1. A student with zero submissions sees "Live Rank: #1" on the frozen leaderboard.
- **Fix**: Check if the target user appears in the scoring CTE before computing rank. Return `null` if the user has no scored submissions.

---

## LOW (Best Effort / Track)

### L1: `computeContestAnalytics` student progression does not apply IOI late penalties
- **Source**: cycle-19 F2
- **Files**: `src/lib/assignments/contest-analytics.ts:236`
- **Confidence**: HIGH
- **Description**: The student progression calculation uses raw scores without late penalties, while the leaderboard uses adjusted scores. For IOI contests with late penalties, the progression graph can show higher scores than the leaderboard.
- **Fix**: Either include late penalty computation in the progression query/JS, or document that progression shows raw scores.

### L2: `participant-timeline.ts` uses `status === "accepted"` for first AC — misses IOI full-score submissions
- **Source**: cycle-19 F3
- **Files**: `src/lib/assignments/participant-timeline.ts:195`
- **Confidence**: MEDIUM
- **Description**: IOI submissions typically have status "scored" rather than "accepted", so `firstAcAt`, `timeToFirstAc`, and `wrongBeforeAc` are always null/0 for IOI contests even when students achieve maximum score.
- **Fix**: For IOI, use `score >= problemPoints` as the "first AC" condition, consistent with `contest-scoring.ts`.

### L3: `LeaderboardTable` uses O(n*m^2) `find()` per problem cell
- **Source**: cycle-19 F4
- **Files**: `src/components/contest/leaderboard-table.tsx:433-434`
- **Confidence**: HIGH
- **Description**: `entry.problems.find()` is called for every cell in the problem grid. Not a practical issue for typical contest sizes but could slow rendering for very large contests.
- **Fix**: Pre-build a `Map` or `Record` per entry for O(1) lookup.

### L4: `code-similarity.ts` uses JS `new Date()` for batch `createdAt` — already covered by deferred A19
- **Source**: cycle-19 F5
- **Files**: `src/lib/assignments/code-similarity.ts:397`
- **Confidence**: LOW
- **Description**: Minor clock skew between JS-side `new Date()` and actual DB insert time. Already tracked as deferred A19. No new action needed.

---

## Previously Deferred Items (Still Active)

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| A19 | `new Date()` clock skew risk | LOW | Deferred — only affects distributed deployments with unsynchronized clocks |
| A7 | Dual encryption key management | MEDIUM | Deferred — consolidation requires migration |
| A12 | Inconsistent auth/authorization patterns | MEDIUM | Deferred — existing routes work correctly |
| A2 | Rate limit eviction could delete SSE slots | MEDIUM | Deferred — unlikely with heartbeat refresh |
| A17 | JWT contains excessive UI preference data | LOW | Deferred — requires session restructure |
| A25 | Timing-unsafe bcrypt fallback | LOW | Deferred — bcrypt-to-argon2 migration in progress |
| A26 | Polling-based backpressure wait | LOW | Deferred — no production reports |
| L2(c13) | Anti-cheat LRU cache single-instance limitation | LOW | Deferred — already guarded by getUnsupportedRealtimeGuard |
| L5(c13) | Bulk create elevated roles warning | LOW | Deferred — server validates role assignments |
| D16 | `sanitizeSubmissionForViewer` unexpected DB query | LOW | Deferred — only called from one place, no N+1 risk |
| D17 | Exam session `new Date()` clock skew | LOW | Deferred — same as A19 |
| D18 | Contest replay top-10 limit | LOW | Deferred — likely intentional, requires design input |

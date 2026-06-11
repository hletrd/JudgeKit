# Cycle 21 Code Reviewer

**Date:** 2026-04-19
**Base commit:** 5a2ce6b4
**Angle:** Code quality, logic, SOLID, maintainability

---

## F1: `participant-audit.ts` computes full leaderboard to find one user — O(n) waste for O(1) need

- **File**: `src/lib/assignments/participant-audit.ts:13`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: `getParticipantAuditData` calls `computeContestRanking(assignmentId)` which computes the entire leaderboard, then uses `entries.find()` to extract a single user's entry. For a contest with 1000 participants, this runs a heavy SQL query + JS sort + rank assignment for all 1000 users, only to use 1 entry. The contest-scoring cache mitigates repeated calls, but the first call per cache window is still wasteful.
- **Concrete failure scenario**: An instructor opens the participant audit view for a student in a 2000-person contest. The server computes the full 2000-entry leaderboard (with per-problem breakdowns, ICPC penalty calculations, etc.) just to extract one row.
- **Fix**: Create a lightweight query that fetches only the target user's per-problem data and computes their entry directly, similar to how `computeSingleUserLiveRank` avoids computing the full leaderboard.

## F2: `contest-analytics.ts` `studentProgressions` uses raw scores without late penalty — inconsistent with leaderboard

- **File**: `src/lib/assignments/contest-analytics.ts:224-258`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The student progression query computes `adjustedScore` as `Math.round(Math.min(Math.max(Number(sub.score), 0), 100) / 100 * Number(sub.points) * 100) / 100` — this clamps the raw score to [0,100] and scales by points, but does NOT apply the late penalty that the main leaderboard applies. The existing comment at lines 216-221 documents this, but the variable name `adjustedScore` is misleading because it is NOT the same "adjusted score" as the leaderboard's adjusted score (which includes late penalties).
- **Concrete failure scenario**: An instructor views the analytics for an IOI contest with a 20% late penalty. A student who submitted after the deadline with raw score 100 sees a progression chart value of 100, but the leaderboard shows 80. The variable name `adjustedScore` suggests it matches the leaderboard, but it doesn't.
- **Fix**: Rename `adjustedScore` to `rawScaledScore` to avoid confusion with the leaderboard's adjusted score. The existing comment already explains the discrepancy.

## F3: Anti-cheat GET endpoint `limit`/`offset` parsed without validation for NaN

- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:148-149`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: `limit` and `offset` are parsed via `Number(searchParams.get("limit"))` and `Number(searchParams.get("offset"))`. If the query param is a non-numeric string like "abc", `Number("abc")` returns `NaN`, and `Math.max(1, NaN)` returns `NaN`. The `limit` would then be `NaN`, which Drizzle's `.limit(NaN)` might interpret as 0 or cause unexpected behavior.
- **Concrete failure scenario**: A request with `?limit=abc` results in `NaN` being passed to `.limit()`. Depending on the Drizzle/PG driver, this could cause a query error or return zero results.
- **Fix**: Use `parseInt` with a fallback: `const limit = Math.max(1, Math.min(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 500))`. Same for offset.

## F4: `contest-scoring.ts` cache uses single-instance LRU — not shared across Next.js workers

- **File**: `src/lib/assignments/contest-scoring.ts:56`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The `rankingCache` is an in-memory LRU cache. In production with multiple Next.js server workers (e.g., via cluster mode or multiple containers), each worker has its own cache instance. A stale-while-revalidate refresh on worker A does not update the cache on worker B. This means different workers can serve different ranking data for the same contest during the stale window.
- **Concrete failure scenario**: Worker A refreshes the ranking cache at T=15s and gets fresh data. Worker B still has stale data from T=0s and serves it until its own stale threshold triggers. For 15s, users hitting worker B see outdated rankings.
- **Fix**: This is a known limitation of single-instance caching. Already partially mitigated by the short TTL (30s). For full consistency, use a shared cache (Redis) — but this is a large architectural change.

## Previously Verified Safe (Cycle 20)

- `computeSingleUserLiveRank` windowed exam mode late penalty — correctly implemented (cycle 20 fix)
- `LeaderboardTable` live rank badge — correctly uses both `isCurrentUser` and `currentUserId` check (cycle 20 fix)
- `participant-timeline.ts` `wrongBeforeAc` — correctly excludes full-score submissions via `!isFirstAc(submission)` guard

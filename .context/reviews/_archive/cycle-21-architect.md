# Cycle 21 Architect Review

**Date:** 2026-04-19
**Base commit:** 5a2ce6b4
**Angle:** Architectural/design risks, coupling, layering

---

## F1: Leaderboard API couples identity disclosure to anonymous mode flag — potential for PII leaks

- **File**: `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts:70-82`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The leaderboard API anonymizes entries for non-instructors when `isAnonymous` is true, replacing `username`, `name`, and `className` with generic values. However, the `userId` is always cleared (`userId: ""`) for non-instructors regardless of anonymity mode. This means even in a non-anonymous leaderboard, the client-side code cannot determine which entry belongs to the current user via `userId` matching. Instead, the API sets `isCurrentUser: true` and provides `liveRank` only for the current user's entry.

  The concern: if a future developer changes the non-instructor branch to include `userId` (e.g., for client-side sorting), they would inadvertently leak all student IDs. The current design is safe, but the `userId: ""` pattern is fragile — it's easy to accidentally include the userId in a refactor.

- **Concrete failure scenario**: A developer refactors the leaderboard API to pass `userId` through for "non-anonymous" contests, thinking it's safe since the leaderboard is visible. This leaks the internal user IDs of all students to any enrolled student viewing the leaderboard.
- **Fix**: Add a comment explaining why `userId` is always cleared for non-instructors. Consider using a more explicit approach like `userId: undefined` or omitting the field entirely instead of empty string.

## F2: `contest-scoring.ts` and `leaderboard.ts` duplicate scoring SQL for IOI late penalty

- **File**: `src/lib/assignments/contest-scoring.ts:139-197` and `src/lib/assignments/leaderboard.ts:149-188`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The IOI scoring SQL with late penalty handling (non-windowed vs windowed exam mode) is duplicated between `contest-scoring.ts` (in `buildScoringQuery`) and `leaderboard.ts` (in `computeSingleUserLiveRank`). The two implementations must stay in sync — if a new scoring mode is added or the penalty formula changes, both must be updated. The cycle 20 fix (commit fde17ebb) specifically addressed a case where `leaderboard.ts` was missing the windowed late penalty that `contest-scoring.ts` already had.
- **Concrete failure scenario**: A new exam mode (e.g., "flexible_windowed") is added to `contest-scoring.ts` but the `computeSingleUserLiveRank` query in `leaderboard.ts` is not updated. The live rank badge shows incorrect ranks for students in this new mode.
- **Fix**: Extract the IOI scoring SQL fragment (the CASE expression for late penalties) into a shared helper function that both modules use. This ensures they stay in sync by construction.

## F3: SSE route not migrated to `createApiHandler` — inconsistent API pattern

- **File**: `src/app/api/v1/submissions/[id]/events/route.ts`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The SSE route is the only API route not using `createApiHandler`. The route comment says "not migrated to createApiHandler due to streaming response." This creates an inconsistency: auth checks, rate limiting, and error handling are manually implemented rather than using the shared infrastructure. Any improvements to `createApiHandler` (e.g., adding request logging) would not apply to this route.
- **Concrete failure scenario**: A new security middleware is added to `createApiHandler` (e.g., CSRF protection for non-GET requests). The SSE route bypasses this middleware because it doesn't use `createApiHandler`. Since SSE is GET-only, this particular scenario is low risk.
- **Fix**: Either extend `createApiHandler` to support streaming responses (widen the handler return type), or document the SSE route as an explicit exception with a clear reason.

## Previously Verified Safe (Cycle 20)

- `computeSingleUserLiveRank` now correctly mirrors `contest-scoring.ts` late penalty logic (after cycle 20 fix)
- Stale-while-revalidate cache pattern is consistent between `contest-scoring.ts` and `analytics/route.ts`

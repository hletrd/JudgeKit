# Cycle 17 Review Remediation Plan

**Date:** 2026-04-19
**Source:** `.context/reviews/cycle-17-comprehensive-review.md` and `.context/reviews/_aggregate.md`
**Status:** In Progress

---

## MEDIUM Priority

### M1: Fix `firstAcMap` key lookup to use exact matching instead of `endsWith`
- **File**: `src/lib/assignments/contest-analytics.ts:187,251`
- **Status**: PENDING
- **Plan**:
  1. Restructure `firstAcMap` from `Map<string, number>` (keyed by `"userId:problemId"`) to `Map<string, Map<string, number>>` (keyed by `problemId`, then `userId`)
  2. Update the population loop (lines 173-179) to use the new structure
  3. Replace both `key.endsWith(...)` lookups (lines 187 and 251) with direct `firstAcMap.get(p.problemId)` access
  4. This also improves performance: O(1) per-problem lookup instead of iterating the entire map
  5. Verify the analytics tests still pass
- **Exit criterion**: No `endsWith` usage for `firstAcMap` lookups. All lookups use direct key access. Analytics output unchanged for existing test cases.

### M2: Add limit to participant timeline code snapshots query
- **File**: `src/lib/assignments/participant-timeline.ts:151-161`
- **Status**: PENDING
- **Plan**:
  1. Add `.limit(1000)` to the code snapshots query at line 160 (after `.orderBy(asc(codeSnapshots.createdAt))`)
  2. Add a code comment explaining the limit: 1000 snapshots covers ~16 hours of minute-by-minute saving, which is sufficient for the timeline view
  3. For the `snapshotCount` in the summary, rely on the count of the limited results. This is acceptable because the timeline view only shows recent activity
  4. Alternatively, add a separate `COUNT(*)` query for the accurate total and use the limited query for the actual timeline events
  5. Verify the participant timeline still renders correctly
- **Exit criterion**: Code snapshots query has a limit. No unbounded query on the `code_snapshots` table in the participant timeline function.

---

## LOW Priority

### L1: Replace anti-cheat events full SELECT with aggregation query in participant timeline
- **File**: `src/lib/assignments/participant-timeline.ts:161-168`
- **Status**: PENDING
- **Plan**:
  1. Replace the current query (which selects all event rows) with a `GROUP BY` + `COUNT(*)` aggregation:
     ```ts
     const antiCheatRows = await db
       .select({
         eventType: antiCheatEvents.eventType,
         count: sql<number>`count(*)`,
       })
       .from(antiCheatEvents)
       .where(and(eq(antiCheatEvents.assignmentId, assignmentId), eq(antiCheatEvents.userId, userId)))
       .groupBy(antiCheatEvents.eventType);
     ```
  2. Update the `antiCheatSummary` construction to use the aggregated results directly
  3. This removes the need to fetch and iterate over potentially thousands of individual event rows
- **Exit criterion**: Anti-cheat summary is computed via a single aggregation query instead of fetching all rows.

### L2: Add stale-while-revalidate to contest analytics cache
- **File**: `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:39-45`
- **Status**: PENDING
- **Plan**:
  1. Add a `CacheEntry` type with `data` and `createdAt` fields
  2. Change the cache to store `CacheEntry` objects
  3. Add `STALE_AFTER_MS` and `CACHE_TTL_MS` constants (e.g., 30s stale, 60s TTL)
  4. When cached data is stale but within TTL, return stale data and trigger a background refresh
  5. Add a `_refreshingKeys` Set to prevent duplicate refreshes (same pattern as `contest-scoring.ts`)
  6. On cache miss, compute synchronously and populate cache
- **Exit criterion**: Analytics cache serves stale data during background refresh. No duplicate concurrent computations for the same assignment.

### L3: Remove JS-side expiry check in `redeemRecruitingToken`, rely on SQL `NOW()`
- **File**: `src/lib/assignments/recruiting-invitations.ts:410`
- **Status**: PENDING
- **Plan**:
  1. Remove the JS-side expiry check at line 410 (`if (invitation.expiresAt && invitation.expiresAt < new Date())`)
  2. The SQL WHERE clause at line 485 already handles expiry atomically
  3. When the atomic update returns no rows (the invitation expired or was already redeemed), differentiate the error:
     - If `invitation.status !== "pending"`, return `"alreadyRedeemed"` 
     - If `invitation.status === "pending"`, check `invitation.expiresAt` against `new Date()` for the error message only (not for the gate), returning `"tokenExpired"`
  4. This removes the TOCTOU race between the JS check and the SQL check
- **Exit criterion**: No JS-side expiry gate before the atomic SQL claim. Error messages correctly differentiate between expired and already-redeemed.

### L4: Use epsilon comparison for IOI score tie detection
- **File**: `src/lib/assignments/contest-scoring.ts:375`
- **Status**: PENDING
- **Plan**:
  1. Replace `prev.totalScore === curr.totalScore` with `Math.abs(prev.totalScore - curr.totalScore) < 0.01`
  2. Add a helper function `isScoreTied(a: number, b: number): boolean` to centralize the comparison logic
  3. Use this helper in both the sort comparator and the tie detection loop
  4. Verify leaderboard tests still pass
- **Exit criterion**: Tie detection uses epsilon comparison instead of strict floating-point equality.

### L5: Add concurrency limiter to `triggerAutoCodeReview`
- **File**: `src/lib/judge/auto-review.ts:13`
- **Status**: PENDING
- **Plan**:
  1. Import `pLimit` from `"p-limit"`
  2. Add `const reviewLimiter = pLimit(2)` at module level
  3. Wrap the `triggerAutoCodeReview` body in `reviewLimiter(async () => { ... })`
  4. This ensures at most 2 concurrent AI review requests, preventing burst API usage
  5. Verify that auto-review still works for single submissions
- **Exit criterion**: Auto-review calls are bounded to 2 concurrent executions.

---

## Deferred Items

| Finding | Severity | Reason | Exit Criterion |
|---------|----------|--------|----------------|
| L6 (sanitizeSubmissionForViewer DB query) | LOW | Same as D16/L6(c16) — only called from one place, no N+1 risk today | Re-open if function is added to list endpoints |

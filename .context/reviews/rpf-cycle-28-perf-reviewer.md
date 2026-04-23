# RPF Cycle 28 — Performance Reviewer Report

**Reviewer:** perf-reviewer
**Date:** 2026-04-23
**Base commit:** ca62a45d
**Scope:** Full repository performance audit — DB, API routes, components, SSE/realtime, auth, bundle

---

## Executive Summary

The codebase demonstrates solid foundational engineering: cursor-based pagination is implemented where it matters, transactions use advisory locks correctly, the judge claim CTE uses `FOR UPDATE SKIP LOCKED`, and the schema has thoughtful indexing. The audit buffer, capabilities cache, and system settings cache are all well-designed. However, there are real performance problems that will bite under production load at scale:

- **4 P0** issues (correctness/OOM risks)
- **15 P1** issues that scale linearly with data size
- **18 P2** optimization opportunities
- **9 P3** minor improvements

The architecture is sound. The issues are at the query level, not the design level. Fix the P0s, address the P1s, and this system will handle order-of-magnitude growth without choking.

---

## P0 — Critical

### P0-1: Race Condition in Deregister Submission Release

**File:** `src/app/api/v1/judge/deregister/route.ts:63-85`
**Confidence:** High

The submission release uses a non-atomic SELECT-then-UPDATE pattern. Between the SELECT and the UPDATE, a worker could claim new submissions with `judgeWorkerId = workerId`. Those new claims would be missed by the SELECT. More critically, if the SELECT fails (caught at line 92), the submissions remain stuck with `judgeWorkerId` pointing to an offline worker — they will never be reclaimed until the stale claim timeout expires (5 minutes by default).

**Failure scenario:** During a contest with rapid rejudge cycles, a worker deregisters. 20 in-flight submissions get stuck in `queued`/`judging` state for the full stale timeout. Students see "pending" for 5 minutes after re-submission.

**Fix:** Replace the SELECT+UPDATE with a single atomic `UPDATE...RETURNING`:
```ts
const released = await db
  .update(submissions)
  .set({ status: "pending", judgeClaimToken: null, judgeClaimedAt: null, judgeWorkerId: null })
  .where(and(
    eq(submissions.judgeWorkerId, workerId),
    inArray(submissions.status, ["pending", "queued", "judging"])
  ))
  .returning({ id: submissions.id });
```

### P0-2: Unbounded Analytics Progression Query — OOM Risk

**File:** `src/lib/assignments/contest-analytics.ts:242-251`
**Confidence:** High

The student progressions query loads EVERY submission row for the entire contest into Node.js memory with no LIMIT. For a 500-student, 10-problem contest with 50 submissions per student per problem, this is 250,000 rows (~50-100 MB). The analytics route always passes `includeTimeline: true` (analytics/route.ts:65,82).

**Failure scenario:** On a serverless function with 256-512 MB heap, this WILL cause OOM crashes. The process dies, the request fails with a 500, and the user sees nothing. No recovery is possible; the query itself is the problem.

**Fix:** Add a LIMIT or stream results. For the progression chart, consider sampling (e.g., at most 1 data point per minute per user) or computing the progression server-side in SQL with a window function. At minimum, add a guard:
```ts
if (rows.length > 50_000) {
  studentProgressions = undefined; // skip for very large contests
}
```

### P0-3: Unbounded Source Code Load in Similarity Check — OOM Risk

**File:** `src/lib/assignments/code-similarity.ts:316-325`
**Confidence:** High

The similarity check loads the full `source_code` of every best submission into memory. Source code blobs are typically 2-50 KB each. For 500 students x 10 problems x 1.5 languages = 7,500 rows, that is 15-375 MB of raw source text BEFORE n-gram generation doubles or triples the working set. The 30-second abort timeout does not protect against OOM.

**Failure scenario:** For a medium-to-large contest, this query alone can exhaust the Node.js heap. The n-gram generation then multiplies memory usage by 3-5x. The process crashes before the timeout fires.

**Fix:** Process submissions in batches by `(problemId, language)` key. Load source code for one group at a time, compare pairs, then discard n-gram data before loading the next group. The existing grouping logic (`byKey` map on line 257) already partitions by key; the fix is to change the DB query to load one group at a time instead of all at once.

### P0-4: Contest Scoring Full-Table Scan Under Concurrent Load

**File:** `src/lib/assignments/contest-scoring.ts:200-205`
**Confidence:** High

The scoring query's inner CTE "base" scans every terminal submission for the assignment before grouping. For a contest with 500 students, 10 problems, and 50 attempts each, the CTE scans 250,000 rows before the GROUP BY reduces them to 5,000. This query is called from the leaderboard, export, analytics routes, and analytics cache refresh. Multiple concurrent requests each execute this full scan.

**Failure scenario:** Under concurrent load during a live contest, the database processes the same full-table scan 5-10 times per second. This causes latency spikes for the student submission endpoint. Students experience 5-10 second submission response times during the last 10 minutes when everyone refreshes the leaderboard.

**Fix:** The LRU cache (rankingCache) mitigates this for cache hits, but the cache is module-scoped and lost on cold starts in serverless deployments. Add a composite index on `(assignment_id, status, user_id, problem_id)` covering the CTE's WHERE and PARTITION BY clauses. Consider a materialized view or a pre-computed ranking table updated on submission insert.

---

## P1 — High

### P1-1: Unbounded Submission Comments — No Pagination

**File:** `src/app/api/v1/submissions/[id]/comments/route.ts:31-39`
**Confidence:** High

The GET handler fetches ALL comments for a submission with no limit, offset, or cursor. If a TA provides line-by-line feedback creating 500+ comments, every comment row plus the author relation is loaded and serialized.

**Fix:** Add cursor-based pagination matching the submissions list pattern.

### P1-2: Unnecessary sourceCode Transfer on Submission GET

**File:** `src/app/api/v1/submissions/[id]/route.ts:15-38`
**Confidence:** High

The `findFirst` query does NOT specify a `columns` filter, so ALL columns including `sourceCode` (50-100 KB) are fetched. `sanitizeSubmissionForViewer` then discards sourceCode for non-owners. Data was transferred from PostgreSQL just to be thrown away.

**Failure scenario:** During a contest with 500 concurrent viewers of a single submission, each non-owner GET wastes 50-100 KB of DB transfer — tens of MB/s of wasted I/O.

**Fix:** Add `columns: { sourceCode: false }` to the initial query, then conditionally fetch sourceCode only when the viewer has access.

### P1-3: Full Table Scan on Every Submission POST (Rate Limit Query)

**File:** `src/app/api/v1/submissions/route.ts:255-261`
**Confidence:** High

The per-user rate limit query scans ALL submissions for a user with no date filter on the outer WHERE clause. A prolific user with 10,000 submissions forces PostgreSQL to read 10,000 index entries and evaluate CASE expressions for each, inside a transaction holding an advisory lock.

**Fix:** Add a date filter: `.where(and(eq(submissions.userId, user.id), gte(submissions.submittedAt, oneMinuteAgo)))`. Split `recentCount` and `pendingCount` into two targeted queries.

### P1-4: Global Queue Count Full Scan Inside Transaction

**File:** `src/app/api/v1/submissions/route.ts:277-283`
**Confidence:** High

The global pending count query `SELECT COUNT(*) FROM submissions WHERE status IN ('pending', 'queued')` counts ALL pending/queued submissions across ALL users, inside the advisory-lock transaction.

**Fix:** Move the global queue check BEFORE the transaction. It is a coarse gate that does not need transactional consistency with the insert.

### P1-5: Missing Composite Index for Queue Position & Claim CTE

**File:** `src/lib/db/schema.pg.ts:482-495`
**Confidence:** High

The queue-status endpoint and the judge claim CTE both filter on `(status, submitted_at)`. The schema has indexes on (status) and (submitted_at) separately, but no composite index. PostgreSQL must scan all rows of each status value and sort by submittedAt in memory.

**Failure scenario:** During a contest with 2,000+ pending submissions, 1,000 students polling queue position = 1,000 full index scans per poll cycle.

**Fix:** Add: `index("submissions_status_submitted_idx").on(table.status, table.submittedAt)`

### P1-6: Heartbeat Triggers Full Staleness Sweep on Every Request

**File:** `src/app/api/v1/judge/heartbeat/route.ts:73-83`
**Confidence:** High

Every heartbeat POST from ANY worker triggers a staleness sweep that updates ALL workers with `status='online'` and `lastHeartbeatAt < threshold`. With N workers sending heartbeats every 30 seconds, this is N redundant UPDATE queries per 30-second interval, each acquiring row locks.

**Fix:** Rate-limit the sweep to once per HEARTBEAT_INTERVAL_MS per server instance using a simple in-memory timestamp guard.

### P1-7: SSE Connection Eviction is O(n) Linear Scan

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`
**Confidence:** Medium

When the connection tracking map exceeds `MAX_TRACKED_CONNECTIONS` (1000), the eviction loop iterates all entries to find the oldest-by-age connection. This is O(n) on every new SSE connection when the map is near capacity.

**Fix:** Use an ordered structure (min-heap or LRU cache with eviction by age) so eviction is O(1).

### P1-8: Missing Pagination — Announcements

**File:** `src/app/api/v1/contests/[assignmentId]/announcements/route.ts:49-52`
**Confidence:** High

`findMany` with no limit or offset. Returns ALL announcements for an assignment. In a long-running course with 100+ announcements, every GET transfers the entire list.

**Fix:** Add `parsePagination` and apply limit/offset. Return `apiPaginated`.

### P1-9: Missing Pagination + In-Memory Filter — Clarifications

**File:** `src/app/api/v1/contests/[assignmentId]/clarifications/route.ts:49-56`
**Confidence:** High

Two problems: (a) `findMany` with no limit returns ALL clarifications, (b) Post-fetch filtering in JavaScript (`rows.filter((row) => row.userId === user.id || (row.isPublic && row.answer))`). For a student, the DB returns ALL clarifications (potentially thousands) and then discards most of them in JS.

**Fix:** For non-managers, add WHERE conditions to the DB query: `WHERE (user_id = @userId OR (is_public AND answer IS NOT NULL))`. Also add pagination.

### P1-10: Missing Pagination — Exam Sessions

**File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/route.ts:34`
**Confidence:** High

`getExamSessionsForAssignment` returns ALL exam sessions with no limit. A large class of 500+ students produces 500+ rows loaded at once.

**Fix:** Add pagination parameters to `getExamSessionsForAssignment` and expose them from the route.

### P1-11: Missing Pagination — Recruiting Invitations

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:17-30`
**Confidence:** Medium

The underlying function supports pagination (limit defaults to 100) but the route does not parse or pass limit/offset from query params. The route also does not return a total count, so the client cannot render pagination controls.

**Fix:** Parse limit/offset from query params. Add a total count query. Return `apiPaginated`.

### P1-12: Unbounded Submissions Query — Participant Timeline

**File:** `src/lib/assignments/participant-timeline.ts:144-157`
**Confidence:** Medium

The submissions query has no LIMIT. A single user with a stuck auto-submit loop could have 10,000+ submissions for one assignment.

**Fix:** Add `.limit(5000)` as a generous but bounded cap, matching the snapshot limit pattern.

### P1-13: Unbounded All-AC-Submissions in Analytics

**File:** `src/lib/assignments/contest-analytics.ts:181-186`
**Confidence:** Medium

No LIMIT on the AC submissions query. Combined with the studentProgressions query running in the same Promise.all, three large result sets are in memory simultaneously.

**Fix:** Rewrite as `SELECT DISTINCT ON (user_id, problem_id)` which returns at most (users * problems) rows instead of all AC submissions.

### P1-14: Redundant DB Queries in Leaderboard Route

**File:** `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts:22-61`
**Confidence:** High

The leaderboard route makes 5-7 sequential DB queries. Two are redundant with queries inside called library functions: (a) `computeContestRanking` internally re-fetches assignment metadata already fetched at line 22-28, (b) `computeContestRanking` re-fetches assignment problems already fetched at line 56.

**Fix:** Pass the assignment metadata and problems already fetched into `computeLeaderboard`/`computeContestRanking` to avoid re-querying.

### P1-15: Virtualize Leaderboard Table

**File:** `src/components/contest/leaderboard-table.tsx:354-484`
**Confidence:** High

The leaderboard renders all rows without virtualization. During a contest with 200+ participants, the table re-renders on every 30-second refresh cycle, creating 200+ DOM nodes each time.

**Fix:** Use `@tanstack/react-virtual` for virtualized rendering.

---

## P2 — Medium

### P2-1: Sequential Queries After Judge Claim

**File:** `src/app/api/v1/judge/claim/route.ts:285-321`
**Confidence:** High

After a successful claim, three independent queries (problem config, test cases, language config) are issued sequentially. These can run in parallel with `Promise.all`.

**Fix:** `const [problem, cases, langConfigs] = await Promise.all([...]);`

### P2-2: COUNT(*) OVER() Full Scan on Offset Pagination

**File:** `src/app/api/v1/submissions/route.ts:114-133`
**Confidence:** High

The offset-based pagination mode uses `count(*) over()` as a window function. PostgreSQL must evaluate this for every matching row, not just the returned page. With no selective filters, this is a full index scan on every page turn.

**Fix:** Deprecate offset-based pagination in favor of cursor-based (already implemented). For backward compatibility, cache the total count with a TTL or use `pg_class.reltuples` for an approximate count.

### P2-3: Double Full Scan for includeSummary

**File:** `src/app/api/v1/submissions/route.ts:139-160`
**Confidence:** High

When `includeSummary=1`, a SECOND query with GROUP BY is issued against the submissions table with the same WHERE clause. The same set of rows is scanned twice.

**Fix:** Combine using GROUPING SETS: `GROUP BY GROUPING SETS ((), (status))` returns total + per-status counts in a single scan.

### P2-4: Hidden DB Query in sanitizeSubmissionForViewer

**File:** `src/app/api/v1/submissions/[id]/route.ts:53`
**Confidence:** Medium

The GET handler calls `sanitizeSubmissionForViewer(submission, ...)` without passing `assignmentVisibility`. When the viewer is not the owner and not an admin, the function makes an additional DB query to fetch assignment visibility settings.

**Fix:** Include the assignment relation in the initial query and pass visibility fields to the sanitizer.

### P2-5: getDbNowUncached() Round Trips Inside Transactions

**File:** `src/app/api/v1/submissions/route.ts:318`, `src/app/api/v1/judge/poll/route.ts:76,143`
**Confidence:** High

`await getDbNowUncached()` makes a separate `SELECT NOW()` round trip inside transactions. Inside a PostgreSQL transaction, `NOW()` returns the transaction start timestamp, so it can be used directly in the INSERT SQL.

**Fix:** Inside transactions, use `submittedAt: sql\`NOW()\`` directly. Keep `getDbNowUncached()` for non-transactional contexts.

### P2-6: Redundant Post-Insert Re-Read on Submission Create

**File:** `src/app/api/v1/submissions/route.ts:331-344`
**Confidence:** High

After inserting the submission inside the transaction, the code makes a separate SELECT to fetch the inserted row for the response. The INSERT could use RETURNING.

**Fix:** Use `RETURNING` or construct the response from known input values.

### P2-7: LIKE with Leading Wildcard in Export

**File:** `src/app/api/v1/admin/submissions/export/route.ts:54-58`
**Confidence:** Medium

`LIKE '%pattern%'` on users.name and problems.title prevents PostgreSQL from using B-tree indexes. Without pg_trgm GIN indexes, this triggers sequential scans.

**Fix:** Install pg_trgm extension and create GIN indexes, or use full-text search with tsvector indexes.

### P2-8: Unbounded Test Case Fetch on Judge Claim

**File:** `src/app/api/v1/judge/claim/route.ts:301-311`
**Confidence:** Medium

The claim endpoint fetches ALL test cases including full `input` and `expectedOutput` (potentially multi-MB each). A problem with 50 test cases of 1 MB each loads 100 MB per claim.

**Fix:** Consider streaming test cases to the worker. At minimum, document memory implications and consider a per-problem test case size cap.

### P2-9: Anti-Cheat Heartbeat Gaps — 5000-Row Fetch vs SQL Window Function

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:189-224`
**Confidence:** Medium

Loads up to 5,000 heartbeat rows and detects gaps in JavaScript. This could be a single SQL LAG window function returning only the gaps.

**Fix:** Rewrite as SQL:
```sql
WITH gaps AS (
  SELECT createdAt, LAG(createdAt) OVER (ORDER BY createdAt) AS prevCreatedAt
  FROM anti_cheat_events WHERE assignment_id = @id AND user_id = @uid AND event_type = 'heartbeat'
)
SELECT prevCreatedAt AS "gapStartedAt", createdAt AS "gapEndedAt",
       EXTRACT(EPOCH FROM createdAt - prevCreatedAt)::int AS "gapSeconds"
FROM gaps WHERE EXTRACT(EPOCH FROM createdAt - prevCreatedAt) > 120
```

### P2-10: Virtualize Anti-Cheat Event List

**File:** `src/components/exam/anti-cheat-monitor.tsx`, `src/components/contest/anti-cheat-dashboard.tsx:492-557`
**Confidence:** High

Anti-cheat dashboards render 300+ DOM rows on each polling tick without virtualization.

**Fix:** Use `@tanstack/react-virtual`.

### P2-11: Virtualize Recruiting Invitations Table

**File:** `src/components/contest/recruiting-invitations-panel.tsx:514-609`
**Confidence:** Medium

Per-row dialog portals create heavy DOM. Virtualize the table.

### P2-12: Debounce Search Input in Recruiting Panel

**File:** `src/components/contest/recruiting-invitations-panel.tsx:368,112-128`
**Confidence:** Medium

Every keystroke in the search input fires an API call. Add debouncing (300ms).

### P2-13: O(N*M) Problem Lookup in CSV Export Inner Loop

**File:** `src/app/api/v1/contests/[assignmentId]/export/route.ts:158-163`
**Confidence:** Medium

For each entry row, `problems.find()` is called twice. For 10,000 entries x 20 problems, that's 400,000 linear scans.

**Fix:** Convert `entry.problems` to a Map before the outer loop: `const epMap = new Map(entry.problems.map(ep => [ep.problemId, ep]));`

### P2-14: Bulk User Create — Sequential Inserts with Savepoints

**File:** `src/app/api/v1/users/bulk/route.ts:114-153`
**Confidence:** Medium

Each user is inserted individually with SAVEPOINT/RELEASE/ROLLBACK. For 100 users, this is 300+ SQL statements.

**Fix:** Batch inserts into groups of 25-50, using `ON CONFLICT DO NOTHING` with `RETURNING`.

### P2-15: Analytics Cache Lost on Cold Starts

**File:** `src/lib/assignments/contest-analytics.ts:16`, `src/lib/assignments/contest-scoring.ts:57`
**Confidence:** Medium

Both `analyticsCache` (max: 100) and `rankingCache` (max: 50) are module-scoped LRU caches. In serverless deployments, each cold start gets a fresh empty cache, meaning the first request always hits the DB with the full expensive query.

**Fix:** Move the cache to Redis or a shared cache backend so it persists across instances and cold starts. Alternatively, use a materialized view for the ranking.

### P2-16: Anti-Cheat POST Queries DB Time Per Request

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:63`
**Confidence:** Medium

Every anti-cheat event POST executes `SELECT NOW()::timestamptz`. With 500 students sending heartbeats every 60 seconds, that's ~8 NOW() queries per second just for timestamping.

**Fix:** Cache DB time with a local offset. Fetch NOW() once per 10-second interval and compute `dbNow = Date.now() - offset` for subsequent requests.

### P2-17: normalizePage Allows Scientific Notation — Extreme OFFSET

**File:** `src/lib/pagination.ts:6`
**Confidence:** High

`Number("1e7")` = 10,000,000 passes all guards. A `?page=1e7` query results in `OFFSET 499999950` (with pageSize=50), which is extremely slow on large tables.

**Fix:** Use `parseInt(value, 10)` and add an upper bound (e.g., 10000).

### P2-18: Assignment Export Loads Full Dataset Before Truncating

**File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:48-56`
**Confidence:** Medium

The route loads ALL enrolled students, assignment problems, and scoring data into memory, then truncates to MAX_EXPORT_ROWS for CSV output. The truncation only saves CSV rendering time, not DB query time or memory.

**Fix:** Push the LIMIT into `getAssignmentStatusRows` via an optional `maxRows` parameter.

---

## P3 — Low

### P3-1: Redundant Worker Query on Empty Claim

**File:** `src/app/api/v1/judge/claim/route.ts:241-258`
**Confidence:** Medium

When the CTE claim returns no rows, the handler makes ANOTHER query to check worker status. But the worker was already verified as online with capacity. Return `apiSuccess(null)` immediately.

### P3-2: Comments POST Double Query

**File:** `src/app/api/v1/submissions/[id]/comments/route.ts:66-98`
**Confidence:** Low

After `INSERT...RETURNING`, a separate `findFirst` fetches the comment with the author relation. Author data for the current user is available from the session.

**Fix:** Construct the response from the INSERT result + session data.

### P3-3: Missing Composite Index for User Rate Limit

**File:** `src/lib/db/schema.pg.ts:483`
**Confidence:** Low

A composite index on `(user_id, submitted_at)` would allow `recentCount` to be computed via an index-only scan.

**Fix:** Add: `index("submissions_user_submitted_idx").on(table.userId, table.submittedAt)`

### P3-4: Cursor Resolution Extra Round Trip

**File:** `src/app/api/v1/submissions/route.ts:61-64`
**Confidence:** Low

Cursor-based pagination requires resolving `submittedAt` via a separate DB query. Encode `submittedAt` into the cursor token to eliminate the resolution query.

### P3-5: discussion-vote-buttons.tsx Calls router.refresh() After Every Vote

**File:** `src/components/discussions/discussion-vote-buttons.tsx:57`
**Confidence:** Low

After a successful vote, the component updates local state and then calls `router.refresh()`, triggering a full server component refetch. The local state update already reflects the change.

**Fix:** Remove `router.refresh()` or use targeted revalidation.

### P3-6: Recruiter Candidates Panel Fetches Full Export

**File:** `src/components/contest/recruiter-candidates-panel.tsx:50-55`
**Confidence:** Low

Fetches the export endpoint which includes per-problem details. The panel only uses summary fields.

**Fix:** Add a dedicated candidates summary endpoint.

### P3-7: useVisibilityPolling Jitter setTimeout Not Cleared on Unmount

**File:** `src/hooks/use-visibility-polling.ts:47-49`
**Confidence:** Low

The jitter setTimeout (0-500ms) is not tracked and not cleared in the cleanup function. If the component unmounts within the jitter window, the tick fires after unmount.

**Fix:** Track the jitter timeout and clear it on cleanup.

### P3-8: Community Threads POST — Separate Existence + Access Check

**File:** `src/app/api/v1/community/threads/route.ts:18-29`
**Confidence:** Low

Two sequential queries: first check if the problem exists, then check if the user can access it. `canAccessProblem` returning false implies either non-existence or no access — both return the same error to the client.

**Fix:** Remove the separate existence check.

### P3-9: Rejudge Makes Three Sequential DB Round Trips

**File:** `src/app/api/v1/submissions/[id]/rejudge/route.ts:53-80`
**Confidence:** Low

After the transaction: (1) findFirst for updated submission, (2) findFirst for assignment, (3) getDbNowUncached(). Combine the assignment fetch and deadline check into a single SQL query with `NOW()`.

---

## Infrastructure Findings

### INF-1: JWT Callback Hits DB on Every Refresh

**File:** `src/lib/auth/config.ts:391-404`
**Confidence:** High

The `jwt` callback fires on every token refresh and queries `users` via `db.query.users.findFirst()`. With 1,000 concurrent users, that's significant DB load during token refresh clusters.

**Fix:** Consider caching user lookups with a short TTL (30-60s) keyed on userId. The `tokenInvalidatedAt` check can remain uncached since it's a revocation gate.

### INF-2: Auth Login Sequential Queries

**File:** `src/lib/auth/config.ts:247-254`
**Confidence:** Medium

The `authorize` function tries username lookup, then falls back to email lookup — two sequential DB queries. Combine into a single query with OR.

### INF-3: Capabilities Cache — Well-Designed

**File:** `src/lib/capabilities/cache.ts`

60-second TTL with deduplication (`loadPromise`) to avoid thundering herd. No issues found.

### INF-4: System Settings Cache — Well-Designed

**File:** `src/lib/system-settings-config.ts`

60-second TTL with stale-while-revalidate pattern. Returns cached or defaults immediately while triggering async reload. No issues found.

### INF-5: Audit Event Buffer — Well-Designed

**File:** `src/lib/audit/events.ts`

Batches inserts with 5-second flush interval and 50-event threshold. Failed flushes re-buffer with a cap. No issues found.

### INF-6: Rate Limit Eviction — Well-Designed

**File:** `src/lib/security/rate-limit.ts:38-64`

Stale entry eviction runs periodically (every 60 seconds) instead of on every check. Timer uses `unref()`. No issues found.

### INF-7: SSE Shared Polling — Well-Designed

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:103-183`

Single `setInterval` queries ALL active submission IDs in a batch, then dispatches results to per-connection callbacks. Auto-starts/stops based on subscriber count. No issues found.

### INF-8: Submission Polling Hook — Proper Cleanup

**File:** `src/hooks/use-submission-polling.ts`

Properly cleans up SSE connections, fetch polling intervals, abort controllers, and visibility change listeners. Exponential backoff on errors is well-designed. No memory leak issues found.

---

## DB Schema Indexing Gaps

| Table | Missing Index | Used By | Impact |
|-------|--------------|---------|--------|
| submissions | (status, submittedAt) | queue-status, claim CTE | Full status scan per poll/claim |
| submissions | (userId, submittedAt) | rate limit query | Full user scan on every POST |
| anti_cheat_events | (assignment_id, user_id, event_type) | analytics GROUP BY | Sort/hash for grouping |
| users | GIN trgm on name | admin export search | Sequential scan on LIKE '%...%' |
| problems | GIN trgm on title | admin export search | Sequential scan on LIKE '%...%' |

---

## Summary Table

| Severity | Count | Key Categories |
|----------|-------|----------------|
| P0 | 4 | Race condition, OOM risks (analytics, similarity, scoring) |
| P1 | 15 | Unbounded queries, full scans, missing indexes, missing pagination, heartbeat amplification, missing virtualization |
| P2 | 18 | Sequential queries, double scans, hidden queries, unnecessary round trips, cache cold-start, extreme OFFSET |
| P3 | 9 | Minor redundant queries, missing minor indexes, router.refresh, jitter cleanup |

---

## Recommended Fix Priority

1. **P0-1** — Deregister race condition (correctness)
2. **P0-2** — Analytics progression OOM (add LIMIT/guard)
3. **P0-3** — Similarity check OOM (batch by problem+language)
4. **P0-4** — Contest scoring full scan (add composite index, consider materialized view)
5. **P1-5** — Add composite index `(status, submittedAt)` (single migration, high impact)
6. **P1-3** — Fix rate limit query to filter by date (reduces lock hold time)
7. **P1-4** — Move global queue check outside transaction (reduces lock hold time)
8. **P1-2** — Exclude sourceCode from non-owner queries (reduces DB I/O)
9. **P1-8/9/10/11** — Add pagination to announcements, clarifications, exam-sessions, invitations
10. **P1-15** — Virtualize leaderboard table (reduces DOM churn)
11. **P2-17** — Fix normalizePage scientific notation (simple, prevents abuse)
12. **Remaining P1** and **P2** items — Batch in next performance pass

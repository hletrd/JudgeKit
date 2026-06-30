# Database Performance Review

Date: 2026-06-30
Scope: entire repository
Summary: JudgeKit's database layer is generally well-indexed for the core submission queue and contest scoring, but several read paths fetch unbounded result sets, build large in-memory structures, or lack supporting indexes for common filter/sort patterns. The highest-risk areas are public catalog listing, discussion threads, code-snapshot timelines, similarity checks, gradebook/analytics aggregation, and the DB-backed API rate limiter.
Findings count: 16

## CRITICAL: Public contest list loads every public contest and all nested problems (confidence: High)
- **File**: `src/lib/assignments/public-contests.ts` (lines 33-50)
- **Problem**: `getPublicContests()` calls `db.query.assignments.findMany` with `visibility='public'` and no `LIMIT`, eagerly loading `assignmentProblems → problem` rows.
- **Failure scenario**: As the public contest catalog grows, every visit to the contests page pulls the entire catalog and every linked problem row into the app, increasing DB I/O, JSON serialization time, and memory use until the request worker OOMs.
- **Suggested fix**: Add `LIMIT`/`OFFSET` pagination to the catalog query, select only the columns needed for the list view, and avoid eager-loading full problem rows; fetch problem counts via a separate aggregate query.
- **Cross-references**: `src/app/(public)/contests/page.tsx`, `src/lib/db/schema.pg.ts` (assignments indexes).

## CRITICAL: Discussion thread view loads every post for a thread (confidence: High)
- **File**: `src/lib/discussions/data.ts` (lines 270-283)
- **Problem**: `getDiscussionThreadById()` eager-loads `posts` for a single thread with no `LIMIT`.
- **Failure scenario**: A popular thread with thousands of replies loads every post (and author) into memory and returns a multi-megabyte JSON response.
- **Suggested fix**: Paginate posts (e.g., 50 per page) and load only the requested page; return a total count separately.
- **Cross-references**: `src/app/(public)/community/threads/[id]/page.tsx`.

## CRITICAL: Code-similarity check fetches all best submissions before the cap (confidence: High)
- **File**: `src/lib/assignments/code-similarity.ts` (lines 330-339)
- **Problem**: The raw CTE returns the best submission per `(user, problem, language)` for the whole assignment with no `LIMIT`. The `MAX_SUBMISSIONS_FOR_SIMILARITY` guard is applied only after the rows are materialized.
- **Failure scenario**: A large contest with tens of thousands of source-code rows causes the app process to OOM before the similarity engine can run.
- **Suggested fix**: Apply the cap in SQL (e.g., wrap the CTE in a `SELECT ... LIMIT @max`) or sample in the database so only a bounded number of submissions is pulled into the app.
- **Cross-references**: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`, `tests/unit/assignments/code-similarity.test.ts`.

## HIGH: Contest replay recomputes ranking up to 40 times per request (confidence: High)
- **File**: `src/lib/assignments/contest-replay.ts` (lines 38-83)
- **Problem**: `computeContestReplay` samples up to 40 replay cutoffs and invokes `computeContestRanking` for each one, each of which runs multiple heavy raw-SQL aggregations, throttled only by `pLimit(2)`.
- **Failure scenario**: A large contest can trigger 40+ sequential heavy ranking queries, monopolizing pool connections and causing 504s or connection-pool exhaustion.
- **Suggested fix**: Precompute or cache snapshot rankings, or compute all cutoffs in a single set-based SQL query instead of re-running the full ranking function per cutoff.
- **Cross-references**: `src/lib/assignments/contest-scoring.ts`, `src/app/(public)/contests/manage/[assignmentId]/analytics/page.tsx`.

## HIGH: Contest analytics builds full ranking plus large in-memory structures (confidence: High)
- **File**: `src/lib/assignments/contest-analytics.ts` (lines 93-163)
- **Problem**: `computeContestAnalytics` first calls `computeContestRanking` and then builds `entryProblemMaps` (one Map per entry), iterates all entries per problem for solve rates, and, when `includeTimeline=true`, loads every record-breaking submission row into memory.
- **Failure scenario**: Large contests with many participants and problems create quadratic or near-quadratic memory/time usage in the analytics endpoint.
- **Suggested fix**: Push problem-solve-rate aggregation into SQL, paginate or limit student progressions, and avoid holding the full ranking breakdown in memory for analytics-only views.
- **Cross-references**: `src/lib/assignments/contest-scoring.ts`.

## HIGH: Admin chat transcript fetches all messages for a session (confidence: High)
- **File**: `src/app/api/v1/admin/chat-logs/route.ts` (lines 24-48)
- **Problem**: When `sessionId` is provided, the handler loads every chat message for that session with no `LIMIT`/`OFFSET`.
- **Failure scenario**: A long support session with thousands of messages returns a multi-megabyte response and can OOM the app worker.
- **Suggested fix**: Add pagination to the transcript query (reuse the same `page`/`limit` parameters already used for the session list).
- **Cross-references**: `src/lib/plugins/chat-widget/tools.ts`, `src/lib/db/schema.pg.ts` (chatMessages table).

## HIGH: Code-snapshot timeline returns full sourceCode for up to 200 rows (confidence: High)
- **File**: `src/app/api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts` (lines 20-23, 41-47)
- **Problem**: The paginated endpoint allows up to 200 rows per page and selects `sourceCode: codeSnapshots.sourceCode` for every row.
- **Failure scenario**: A single page can return hundreds of megabytes of source code, stalling JSON serialization, response transfer, and the DB.
- **Suggested fix**: Cap the page size lower (e.g., 20-50) for source-code-heavy endpoints, or offer a summary endpoint without `sourceCode` and a separate fetch for individual snapshots.
- **Cross-references**: `src/components/contest/code-timeline-panel.tsx`.

## HIGH: Gradebook loads all enrolled students and all per-student problem statuses into memory (confidence: High)
- **File**: `src/lib/assignments/submissions.ts` (lines 609-845)
- **Problem**: `getAssignmentStatusRows()` fetches every enrolled student, every assignment problem, a raw per-(user,problem) aggregate, and then builds a full `problems` array per student in JavaScript. There is no pagination.
- **Failure scenario**: A large class (thousands of students) with many problems produces an enormous in-memory result and a huge JSON payload for the assignment status page.
- **Suggested fix**: Provide paginated gradebook endpoints and/or server-side aggregate-only exports; avoid expanding one row per student per problem in the app.
- **Cross-references**: `src/app/(protected)/assignments/[assignmentId]/status/page.tsx`.

## HIGH: DB pool has fixed max 20 connections and no statement timeout (confidence: High)
- **File**: `src/lib/db/index.ts` (lines 41-54)
- **Problem**: The PostgreSQL pool defaults to `max: 20` with no `statement_timeout` configured on new connections.
- **Failure scenario**: Bursty workloads (replay + analytics + leaderboard refreshes + exports) queue for >10s and return connection-timeout errors; a single runaway query can hold a connection indefinitely.
- **Suggested fix**: Make pool size and timeouts env-driven, set a reasonable `statement_timeout` (e.g., 30-60s), and add pool-saturation alerting via the existing `pool-health.ts` diagnostics.
- **Cross-references**: `src/lib/db/pool-health.ts`, `tests/unit/db/pool-health.test.ts`.

## HIGH: API rate limiter writes to Postgres on every request (confidence: High)
- **File**: `src/lib/security/api-rate-limit.ts` (lines 69-129)
- **Problem**: Every API request opens a transaction, `SELECT ... FOR UPDATE` on the `rate_limits` row, and updates it, even when the request is well under its limit.
- **Failure scenario**: Under high load the `rate_limits` table becomes a hot write bottleneck; concurrent updates to the same key serialize behind row locks and can outlast the connection timeout.
- **Suggested fix**: Make the sidecar the authoritative counter and only periodically sync state to Postgres, or batch writes with a short in-memory accumulator; keep Postgres as the source of truth for blocked windows only.
- **Cross-references**: `src/lib/security/rate-limit-core.ts`, `src/lib/db/schema.pg.ts` (rateLimits table).

## MEDIUM: Missing supporting indexes for common filters (confidence: Medium)
- **File**: `src/lib/db/schema.pg.ts` (problems lines 287-289; assignments lines 369-371; chatMessages lines 916-919; antiCheatEvents lines 1206-1210)
- **Problem**: Several frequently filtered columns lack indexes:
  - `problems` only indexes `createdAt`; common filters on `authorId` and `visibility` are unindexed.
  - `assignments` only indexes `groupId`; the public-contests filter on `visibility + examMode` is unindexed.
  - `chatMessages` has `session_id` indexed but not `session_id, created_at`, forcing a sort after filtering.
  - `antiCheatEvents` indexes do not cover the heartbeat query's `(assignment_id, user_id, event_type, created_at)` pattern.
- **Failure scenario**: As tables grow, permission checks (`canAccessProblem`), public contest listing, transcript sorting, and anti-cheat heartbeat probes degrade to sequential scans or in-memory sorts.
- **Suggested fix**: Add composite indexes for the common filter/sort patterns, e.g., `(author_id, visibility)`, `(visibility, exam_mode, starts_at)`, `(session_id, created_at)`, and `(assignment_id, user_id, event_type, created_at)`.
- **Cross-references**: `src/lib/auth/permissions.ts`, `src/lib/assignments/public-contests.ts`, `src/lib/assignments/submissions.ts`.

## MEDIUM: Org-wide admin problem picker selects all problems with no limit (confidence: Medium)
- **File**: `src/lib/assignments/management.ts` (lines 145-153)
- **Problem**: When the actor has `groups.view_all`, `getManageableProblemsForGroup` returns every row in the `problems` table with no `LIMIT`.
- **Failure scenario**: A large problem library causes a large response and memory spike whenever an admin opens the assignment problem picker.
- **Suggested fix**: Add pagination or a search filter to the picker query; return only matching problems for the typed query.
- **Cross-references**: `src/app/(protected)/assignments/create/page.tsx`, `src/app/(protected)/assignments/[assignmentId]/edit/page.tsx`.

## MEDIUM: Student problem statuses query has no LIMIT (confidence: Medium)
- **File**: `src/lib/assignments/submissions.ts` (lines 479-490)
- **Problem**: `getStudentProblemStatuses()` loads every submission row for `(assignmentId, userId)` to determine per-problem progress.
- **Failure scenario**: A prolific student with many submissions on one assignment fetches a large result set even though only the set of distinct `(problemId, status)` pairs is needed.
- **Suggested fix**: Use `SELECT DISTINCT problem_id, status` or aggregate status in SQL instead of returning every submission row.
- **Cross-references**: `src/lib/assignments/submissions.ts` (callers of `getStudentProblemStatuses`).

## MEDIUM: Raw query helpers do not participate in Drizzle transactions (confidence: High)
- **File**: `src/lib/db/queries.ts` (lines 50-91)
- **Problem**: `rawQueryOne`/`rawQueryAll` always run on the global pool and warn when called inside a transaction, but the warning is easy to miss.
- **Failure scenario**: Code that mixes Drizzle `tx` updates with these raw helpers can produce non-atomic operations or read uncommitted state from the global pool.
- **Suggested fix**: Provide `tx.execute()` wrappers for raw SQL, or make the helpers accept an optional client/transaction parameter and use it when supplied.
- **Cross-references**: `src/lib/db/index.ts` (transactionContext), `src/lib/assignments/contest-scoring.ts`, `src/lib/assignments/leaderboard.ts`.

## MEDIUM: Export/import hold a single REPEATABLE READ transaction for the whole stream (confidence: Medium)
- **File**: `src/lib/db/export.ts` (lines 88-180); `src/lib/db/import.ts` (lines 134-234)
- **Problem**: `streamDatabaseExport` wraps all table scans in one long-running `REPEATABLE READ` transaction. `importDatabase` wraps the entire import (truncate + batched inserts) in one transaction.
- **Failure scenario**: A large export keeps a snapshot alive for the full duration, holding dead tuples and bloating the DB. A large import transaction produces a huge WAL and long lock duration.
- **Suggested fix**: For exports, consider per-table consistent snapshots or `pg_dump`-style dump; for imports, split large tables into smaller independent transactions with documented trade-offs.
- **Cross-references**: `src/app/api/v1/admin/migrate/export/route.ts`, `src/app/api/v1/admin/migrate/import/route.ts`.

## LOW: Data-retention prunes run all tables concurrently (confidence: Low)
- **File**: `src/lib/data-retention-maintenance.ts` (lines 131-164)
- **Problem**: Eight independent `batchedDelete` prunes run concurrently via `Promise.allSettled`.
- **Failure scenario**: On a large database, concurrent batched deletes on heavy tables can spike I/O, WAL, and lock contention.
- **Suggested fix**: Serialize prunes or limit concurrency, and schedule them during a low-traffic maintenance window.
- **Cross-references**: `src/lib/data-retention.ts`, `src/instrumentation.ts`.

## Final sweep
- **Skipped / not exhaustively audited**: Full-text search patterns, Drizzle relation-loading plan across all 900+ files, all admin CSV export queries beyond the chat-logs/session-list paths, and live migration/DDL operations.
- **Manual validation recommended**:
  - Run `EXPLAIN ANALYZE` on `computeContestRanking`, `computeContestReplay`, and `getAssignmentStatusRows` with a 10k-student synthetic contest.
  - Verify index usage for the public-contests query, anti-cheat heartbeat query, and chat transcript query under production-like volume.
  - Load-test the API rate-limiter path to measure row-lock contention and connection-pool saturation.

# perf-reviewer Review - Cycle 2

Date: 2026-06-23

Scope: performance, concurrency, CPU/memory pressure, database query shape, Docker and judge throughput, and UI responsiveness for `/Users/hletrd/flash-shared/judgekit`. The worktree was intentionally dirty from cycle 1; this pass did not revert or modify source files.

## Inventory

I first built a review inventory with `rg --files`, `find`, `git status --short`, targeted `rg`, and line-numbered reads. The relevant source inventory contains 1,935 tracked/untracked paths visible to ripgrep, including:

- API hot paths: 113 `src/app/api/**/route.ts` files, especially judge claim/report, submissions, contest stats, anti-cheat, admin Docker, backup/import/export, files, and compiler routes.
- UI paths: 277 app/page/component TypeScript/TSX files under `src/app`, plus submission polling/SSE, contest widgets, status boards, problem/practice listing, diff rendering, admin language/image UI, and exam anti-cheat monitors.
- Query/data layer: `src/lib/db/schema.pg.ts`, query helpers, assignment/contest aggregation helpers, problem-set/public list helpers, realtime coordination, retention, export/import, Docker client, validators, and judge helper modules.
- Worker/runtime: `judge-worker-rs/src/{api,config,docker,executor,languages,main,runner,types,validation}.rs`, `code-similarity-rs/src/**`, `rate-limiter-rs/src/**`, worker manifests, and Dockerfiles.
- Docker/deploy: `deploy-docker.sh`, `deploy.sh`, `docker-compose*.yml`, `.dockerignore`, `Dockerfile*`, and `docker/Dockerfile.judge-*`.
- Tests/docs used as interaction cross-checks: `tests/**`, `docs/**`, `drizzle/pg/**`, and existing `.context/reviews/**` provenance. Generated/dependency output (`node_modules`, `.next`, `target`, caches) was skipped except for ignore/deploy implications.

## Findings

### PERF2-01 - Queue claim and queue-position queries lack covering queue indexes

- Severity: High
- Confidence: High
- Status: Confirmed
- Location: `src/lib/judge/claim-query.ts:38-52`, `src/lib/judge/claim-query.ts:133-147`, `src/app/api/v1/submissions/[id]/queue-status/route.ts:40-51`, `src/app/api/v1/submissions/route.ts:373-379`, `src/lib/db/schema.pg.ts:500-513`
- Evidence: worker claim scans `pending` plus stale `queued`/`judging`, joins `problems`, orders by `submitted_at, id`, and uses `FOR UPDATE SKIP LOCKED`. Queue-status and submission-create global queue checks count `pending`/`queued` rows. The schema has separate `status`, `submitted_at`, `assignment`, and `judge_worker` indexes, but no partial/composite index matching the queue scan order, the stale-claim predicate, or the queue count.
- Concrete failure scenario: at a deadline rush, hundreds or thousands of submissions enter `pending` while workers poll and students keep live result pages open. PostgreSQL can use single-column indexes, but it still has to filter/sort/count more rows than a queue-shaped index would require. Queue pickup latency and DB CPU rise exactly when workers should be claiming quickly.
- Suggested fix: add partial composite indexes for the hot queue paths, for example `(status, submitted_at, id) WHERE status IN ('pending','queued')`, plus a stale-claim index that includes `judge_claimed_at` for `queued`/`judging`. Consider a partial count-friendly active queue index for the global queue limit. Validate with `EXPLAIN (ANALYZE, BUFFERS)` on production-scale row counts.

### PERF2-02 - Submission creation scans full per-user history while holding the advisory lock

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Location: `src/app/api/v1/submissions/route.ts:345-358`, `src/app/api/v1/submissions/route.ts:373-379`, `src/lib/db/schema.pg.ts:500-513`
- Evidence: the create route enters a transaction, takes a per-user `pg_advisory_xact_lock`, then computes `recentCount` and `pendingCount` with `SUM(CASE ...)` over all rows for that user. The one-minute predicate is inside the aggregate rather than in `WHERE`, and the schema lacks `(user_id, submitted_at)` or partial per-user active-status indexes.
- Concrete failure scenario: a student with thousands of historical attempts submits during the last minute of a contest. Every attempt scans that student's full history inside the serialized lock section, so browser retries or double-clicks wait longer and any concurrent submission by that user is blocked for unnecessary DB work.
- Suggested fix: split the aggregate into targeted indexed counts: `COUNT(*) WHERE user_id = ? AND submitted_at > ?`, `COUNT(*) WHERE user_id = ? AND status IN (...)`, plus the global queue count backed by the queue index from PERF2-01. Add `(user_id, submitted_at)` and a partial active-status index if row counts justify it.

### PERF2-03 - Judge and playground execution still capture up to 128 MiB per stream before truncation

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Location: `judge-worker-rs/src/docker.rs:352-400`, `judge-worker-rs/src/executor.rs:80-104`, `judge-worker-rs/src/executor.rs:472-480`, `judge-worker-rs/src/executor.rs:613-625`, `judge-worker-rs/src/config.rs:213-226`, `src/lib/compiler/execute.ts:18`, `src/lib/compiler/execute.ts:451-461`, `src/lib/validators/api.ts:5-6`, `src/lib/validators/api.ts:34-55`
- Evidence: the app-side judge report validator now caps compile output/result diagnostics at 64 KiB and max 100 results, and the worker truncates reportable diagnostics to 16 KiB. However, the worker still reads up to `JUDGE_MAX_OUTPUT_BYTES`, default 128 MiB, for stdout and stderr before building the small report. The local compiler fallback uses the same 128 MiB cap per stdout/stderr string.
- Concrete failure scenario: a malicious or buggy solution prints until the cap on several concurrent jobs. With `JUDGE_CONCURRENCY` allowed up to 16, worst-case capture memory can reach roughly `128 MiB * 2 streams * active jobs`, before container/runtime overhead and report objects. The final report is small, but the worker or local playground process can stall or OOM first.
- Suggested fix: separate the comparison/drain cap from the diagnostic capture cap. Keep draining to avoid EPIPE, but only retain a small head/tail sample needed for verdict display. For exact-output comparison, stream through the comparator or cap retained bytes to the maximum expected-output budget. Lower the default `JUDGE_MAX_OUTPUT_BYTES` or make output-limit verdicts trigger far earlier for retained buffers.

### PERF2-04 - Claimed worker capacity is consumed before post-claim DB reads and harness assembly

- Severity: Medium
- Confidence: Medium
- Status: Likely
- Location: `src/app/api/v1/judge/claim/route.ts:221-228`, `src/app/api/v1/judge/claim/route.ts:303-418`, `judge-worker-rs/src/main.rs:496-552`
- Evidence: the worker acquires a semaphore permit before polling; the claim SQL then increments the worker's active task count. Only after that does the app fetch the problem, test cases, language config, assignment scoring model, and possibly assemble a function-judging harness before returning the job payload.
- Concrete failure scenario: for short A+B style jobs at a deadline rush, a worker slot is marked active while the app performs several DB round trips and source assembly. The overhead is small per job, but with many tiny submissions it reduces effective judge throughput and makes active task counters include "preparing payload" time rather than only worker execution time.
- Suggested fix: reduce post-claim work after the capacity bump. Options include including needed problem/language fields in the claim query, batching the independent reads with `Promise.all`, caching language config/test-case metadata briefly, or changing accounting so the worker slot is consumed only when the payload is ready. Preserve atomic claim/reclaim semantics when moving this work.

### PERF2-05 - Remote Docker image builds bypass runner concurrency and capture unbounded logs

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Location: `judge-worker-rs/src/runner.rs:218-239`, `judge-worker-rs/src/runner.rs:313-333`, `judge-worker-rs/src/runner.rs:590-622`, `judge-worker-rs/src/runner.rs:720-732`, `src/lib/docker/client.ts:443-450`, `src/app/api/v1/admin/docker/images/build/route.ts:101-123`
- Evidence: `/run` requests acquire the runner semaphore, but `/docker/build` does not. The Docker build path calls `Command::output()`, then returns `stdout + stderr` as one string. The app waits up to 600 seconds for the remote build and returns the logs in the HTTP response.
- Concrete failure scenario: an admin starts multiple heavy language-image builds during a live exam, or double-clicks Build after a slow response. The builds can run concurrently outside the runner/judge semaphore, consume CPU, disk, network, and BuildKit cache, and allocate large build logs in the worker process.
- Suggested fix: make Docker image builds asynchronous and single-flight per image tag. Gate them behind a dedicated build semaphore, cap logs with head/tail retention, stream logs to a file, and expose build status polling/cancel endpoints. Consider rejecting admin builds while judging load is above a threshold.

### PERF2-06 - Function expected-output computation recompiles the reference solution for every test case

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Location: `src/app/api/v1/problems/[id]/compute-expected/route.ts:21-27`, `src/app/api/v1/problems/[id]/compute-expected/route.ts:113-139`, `src/lib/compiler/execute.ts:763-819`
- Evidence: the endpoint advertises that it runs the assembled reference solution against every test case using `executeCompilerRun`. It then loads all test cases, loops over `cases.entries()`, and awaits `executeCompilerRun` once per case. `executeCompilerRun` creates a fresh workspace and, when `compileCommand` is present, runs the compile Docker phase before the run phase on every invocation.
- Concrete failure scenario: an author computes expected outputs for a function problem with a C++/Java/C# reference and 100 tests. The API request performs 100 compile containers plus 100 run containers for the same source, occupying the compiler runner for minutes and making the authoring UI look hung. On shared deployments this competes with playground runs and admin Docker operations even though one compile artifact would suffice.
- Suggested fix: compile once per reference solution and run all cases against that artifact. Practical options are a batched function harness that reads all serialized inputs and emits one expected output per case, or a compiler-runner API that preserves the compiled workspace for N run inputs. Also cap test-case count/output for this synchronous endpoint or move large computations to an async job with progress polling.

### PERF2-07 - Live submission fallback polling repeatedly fetches full submission detail plus queue status

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Location: `src/hooks/use-submission-polling.ts:151-209`, `src/hooks/use-submission-polling.ts:248-285`, `src/app/api/v1/submissions/[id]/route.ts:15-40`, `src/lib/submissions/visibility.ts:103-140`, `src/components/submissions/submission-detail-client.tsx:115-182`, `src/app/api/v1/submissions/[id]/queue-status/route.ts:40-67`
- Evidence: SSE is attempted first, but fallback polling fetches `/api/v1/submissions/:id` every 3 seconds. The detail route loads user, problem, results, test-case metadata, and default submission columns including owner-visible `sourceCode`. The same page separately polls `/queue-status` every 5 seconds while the submission is live.
- Concrete failure scenario: EventSource is blocked by a classroom proxy or intermittently fails. Each active result tab repeatedly transfers immutable source code and relational result data, while also issuing queue count/progress requests. During deadline rush this creates avoidable DB reads, JSON parsing, and React state churn.
- Suggested fix: add a lightweight live-status endpoint or `?lite=1` mode that omits `sourceCode`, stable problem/user fields, and full result payloads until terminal status. Merge queue position and grading progress into the same live-status response. Do one terminal full-detail fetch.

### PERF2-08 - Problem and practice progress filters materialize whole catalogs before pagination

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Location: `src/app/(public)/problems/page.tsx:356-405`, `src/app/(public)/practice/page.tsx:423-466`
- Evidence: when a solved/attempted/unsolved filter is active, both pages fetch all matching problem IDs, fetch all of the current user's submissions for those IDs, compute progress in JavaScript, and only then slice the requested page.
- Concrete failure scenario: with a 10k+ public catalog, a user selects "unsolved" during class. The server builds a large `IN (...)` list, pulls many submission rows, and allocates maps/lists proportional to the whole catalog instead of the page size.
- Suggested fix: push progress filtering into SQL with `EXISTS`/anti-joins or a CTE that derives solved/attempted status for the current user. Apply `ORDER BY`, `LIMIT`, and `OFFSET` after the progress predicate in the database.

### PERF2-09 - Assignment and contest status boards build and render the full student-by-problem matrix

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Location: `src/lib/assignments/submissions.ts:636-659`, `src/lib/assignments/submissions.ts:691-740`, `src/lib/assignments/submissions.ts:782-844`, `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:351-607`
- Evidence: the server fetches all assignment problems and all enrolled students, aggregates all terminal submissions, and builds every enrolled-student x problem cell in memory. The UI renders the full desktop table and maps the same filtered rows again for the mobile card representation.
- Concrete failure scenario: a contest with 2,000 participants and 12 problems creates 24,000 per-problem cell objects plus a large React tree. Staff opening the board near the deadline pay the cost before any search/filter interaction, and mobile users still pay for the same full data shape.
- Suggested fix: split summary stats from row data, add server-side pagination/search/status filters, and render one page/window at a time. For the desktop matrix, use virtualization or a paged problem-column view for large contests.

### PERF2-10 - Contest quick stats polling recomputes aggregate submission CTEs every 15 seconds

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Location: `src/components/contest/contest-quick-stats.tsx:31-36`, `src/components/contest/contest-quick-stats.tsx:49-85`, `src/app/api/v1/contests/[assignmentId]/stats/route.ts:92-140`, `src/lib/assignments/contest-scoring.ts:49-190`
- Evidence: `ContestQuickStats` defaults to 15-second polling. Each stats request recomputes participant count, per-user best scores, totals, averages, and solved-problem counts from submissions/enrollments. The leaderboard path already has a stale-while-revalidate cache, but quick stats does not reuse it.
- Concrete failure scenario: several staff keep the contest management page open during a live contest. The same aggregate scan repeats every 15 seconds per browser and competes with judge finalization writes, queue claims, and leaderboard reads.
- Suggested fix: cache quick stats per assignment with the same stale-while-revalidate pattern as contest rankings, invalidating on judge finalization, rejudge, and score override. Alternatively derive quick stats from the cached leaderboard/status data.

### PERF2-11 - Browser output diff is quadratic on the main thread

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Location: `src/lib/diff.ts:26-41`, `src/lib/diff.ts:74-78`, `src/components/submissions/output-diff-view.tsx:13-16`, `src/components/submissions/output-diff-view.tsx:41-63`, `src/components/submissions/output-diff-view.tsx:80-132`
- Evidence: `computeDiff` synchronously builds an `(m + 1) * (n + 1)` LCS table in render-time `useMemo`, and both unified and side-by-side views render all diff rows.
- Concrete failure scenario: a visible wrong-answer test contains thousands of expected and actual lines. Opening the submission blocks the browser main thread while filling the DP table, then renders thousands of rows, making navigation and tab switching unresponsive.
- Suggested fix: guard by byte and line count before diffing. For large outputs, show bounded raw excerpts and skip LCS, or run a capped/windowed diff in a Web Worker with row virtualization.

### PERF2-12 - Similarity checks load and serialize all best source code before enforcing fallback limits

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Location: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:27-49`, `src/lib/assignments/code-similarity.ts:329-339`, `src/lib/assignments/code-similarity.ts:354-390`, `src/lib/assignments/code-similarity-client.ts:45-54`, `src/lib/assignments/code-similarity.ts:441-454`
- Evidence: the checker first selects best `source_code` for every `(user, problem, language)` bucket. It sends the full row array to the Rust sidecar with `JSON.stringify` before the TypeScript fallback's `MAX_SUBMISSIONS_FOR_SIMILARITY` guard runs. The route also has no per-assignment single-flight lock, so concurrent admin requests can run the same expensive check simultaneously; the delete/insert write is atomic, but the compute work is duplicated.
- Concrete failure scenario: two instructors click "run similarity check" on a large contest near deadline. The app loads all best source rows twice, serializes two large JSON bodies, and the sidecar or TypeScript fallback does duplicated pairwise work while the main app handles live contest traffic.
- Suggested fix: add an advisory/single-flight lock per assignment and return the in-progress/latest result to duplicate callers. Preflight with counts and total source bytes before loading `source_code`; enforce limits before sidecar serialization. Consider an async job model for large contests.

### PERF2-13 - Shared SSE poll timer can overlap ticks under slow DB responses

- Severity: Medium
- Confidence: Medium
- Status: Risk
- Location: `src/app/api/v1/submissions/[id]/events/route.ts:180-216`, `src/app/api/v1/submissions/[id]/events/route.ts:223-253`
- Evidence: active SSE connections share one in-process `setInterval` that calls `void sharedPollTick()`. There is no `isPolling` guard or self-scheduling wait. If one tick is still awaiting the batched DB query when the next interval fires, another tick can start against the same subscriber map.
- Concrete failure scenario: the database stalls for longer than the configured poll interval during a deadline rush. Overlapping ticks query the same active submission IDs and invoke callbacks redundantly, amplifying load and potentially sending duplicate status events.
- Suggested fix: replace `setInterval` with a self-scheduling `setTimeout` after each tick completes, or add an `inFlight` guard with a missed-tick flag. Snapshot subscribers at tick start and avoid callback dispatch from concurrent ticks.

### PERF2-14 - PostgreSQL realtime coordination serializes all SSE slot acquisition through one lock and prefix scans

- Severity: Medium
- Confidence: Medium
- Status: Risk
- Location: `src/lib/realtime/realtime-coordination.ts:73-139`, `src/lib/realtime/realtime-coordination.ts:146-202`, `src/lib/db/schema.pg.ts:660-670`
- Evidence: shared SSE slot acquisition takes a single advisory lock key, deletes expired `realtime:sse:user:%` rows, and counts active global/user slots with prefix `LIKE`. The table schema has primary key `key` and an `expires_at` index, but no typed columns for connection kind or user ID.
- Concrete failure scenario: after a network flap, many clients reconnect at once. Every SSE acquisition serializes behind `realtime:sse:acquire`; each lock holder runs cleanup/count queries with prefix predicates. This can delay legitimate live-result connections and add DB pressure during the same deadline-rush window.
- Suggested fix: split `realtime_coordination` into structured columns such as `kind`, `user_id`, `connection_id`, `expires_at`, with indexes on `(kind, expires_at)` and `(kind, user_id, expires_at)`. Move cleanup out of the acquisition critical section or rate-limit it, and narrow locks to user-level or lockless insert/count semantics where possible.

### PERF2-15 - Dynamic sitemap accumulates all rows and locale-expanded entries in memory

- Severity: Low
- Confidence: High
- Status: Confirmed
- Location: `src/app/sitemap.ts:21-34`, `src/app/sitemap.ts:48-71`, `src/app/sitemap.ts:73-94`
- Evidence: `fetchAllInBatches` accumulates all public problems, contests, and general threads into arrays, then the returned sitemap expands every URL across all supported locales in one response.
- Concrete failure scenario: as public problems/community threads grow, crawler hits to `/sitemap.xml` allocate arrays for all rows and all locale variants. Multiple crawler requests can add avoidable DB and heap pressure to the same app process serving users.
- Suggested fix: shard sitemap generation by resource type/page (`/sitemap/problems/0.xml`, etc.), cache responses, and avoid offset pagination for very large tables by using cursor/keyset batches.

### PERF2-16 - Instructor audit-log filtering materializes every scoped submission ID before pagination

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Location: `src/app/api/v1/admin/audit-logs/route.ts:73-147`, `src/app/api/v1/admin/audit-logs/route.ts:187-190`, `src/app/api/v1/admin/audit-logs/route.ts:270-275`, `src/lib/db/schema.pg.ts:140-144`
- Evidence: for non-admin instructors, the route fetches all owned group IDs, all assignment IDs for those groups, all submission IDs for those assignments, and all authored problem IDs, then constructs `resource_type/resource_id IN (...)` filters. It does this before both the count query and the paginated data query. The audit schema has separate `resource_type` and `created_at` indexes, but no composite `(resource_type, resource_id, created_at)` index to match the generated predicate/order.
- Concrete failure scenario: an instructor with several large contests opens audit logs after a semester. The app pulls tens or hundreds of thousands of submission IDs into memory, generates a huge `IN` list, then asks PostgreSQL to count and page audit rows through predicates that are not covered by the current indexes. CSV export hits the same scope-building path before applying its row cap.
- Suggested fix: avoid pre-materializing submission IDs. Filter audit events with `EXISTS`/joins against assignments/enrollments/groups by `resource_type`, or denormalize `group_id`/`assignment_id` onto audit events that need instructor scoping. Add a composite index on `(resource_type, resource_id, created_at DESC, id DESC)` or narrower partial indexes for high-volume resource types, and apply date filters before any fallback ID materialization.

### PERF2-17 - Backup-with-files is named as streaming but buffers the database, every upload, and final ZIP

- Severity: Low
- Confidence: High
- Status: Confirmed
- Location: `src/lib/db/export-with-files.ts:162-249`, `src/lib/files/storage.ts:40-42`, `src/lib/db/export-with-files.ts:267-340`, `src/app/api/v1/admin/backup/route.ts:90-100`
- Evidence: `streamBackupWithFiles` reads the streaming database export into chunks, concatenates and parses it, reads every uploaded file into a `Buffer`, adds all files to JSZip, then `generateAsync({ type: "uint8array" })` builds the complete archive before returning a one-chunk `ReadableStream`. Restore parsing similarly loads all ZIP uploads into memory before writing.
- Concrete failure scenario: an admin runs a full backup with uploads during a live contest. A large database export plus uploaded files and compressed ZIP bytes coexist in the Node heap, competing with API requests and judge report processing.
- Suggested fix: use a true streaming ZIP writer or spool the archive to a temp file outside the Node heap. For restore, stage uploads to temp files while validating manifest hashes instead of keeping all upload buffers in memory.

## Final Sweep

- Verified that the stale cycle-1 issue about unbounded judge report payloads has been partly fixed: `src/lib/validators/api.ts:5-6` and `src/lib/validators/api.ts:34-55` cap reported diagnostics/results, while `judge-worker-rs/src/executor.rs:80-104` truncates reportable diagnostics. PERF2-03 is therefore scoped to internal capture memory, not DB/report storage.
- Reviewed generic client polling. `src/hooks/use-visibility-polling.ts:56-66` uses recursive timers instead of interval catch-up, and major callers abort in-flight requests before starting a new one; I did not raise a broad client-polling overlap finding. The remaining overlap risk is the server-side shared SSE timer in PERF2-13.
- Reviewed anti-cheat timeline polling and heartbeat-gap detection. `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:304-325` makes the gap scan opt-in, user-scoped, and capped at 5000 rows; `src/components/contest/participant-anti-cheat-timeline.tsx:86-161` aborts stale refreshes and dedupes page appends. No additional finding.
- Reviewed worker polling loop. `judge-worker-rs/src/main.rs:496-552` acquires a semaphore permit before polling, reaps finished task handles, and releases the permit on empty polls. No worker-side overclaim finding beyond the app-side post-claim slot accounting in PERF2-04.
- Reviewed data retention maintenance. `src/lib/data-retention-maintenance.ts:21-35` deletes in batches with delay and `src/lib/data-retention-maintenance.ts:146-150` runs independent tables concurrently; no deadline-hot-path finding.
- Reviewed dirty deploy/test changes. `deploy-docker.sh` now fails closed on destructive Drizzle prompts, worker restart failure, and nginx config failure; `scripts/playwright-local-webserver.sh` skips rebuilds when a standalone build exists; `playwright.config.ts:72-117` remains intentionally serialized with a longer web-server timeout. I did not raise a separate test/build finding.

## Summary

I found 17 performance/concurrency issues: 1 High, 14 Medium, and 2 Low. The most deadline-sensitive items are the queue indexes, submission-create locked scans, live submission polling amplification, full status-board rendering, repeated function reference compilation, instructor audit-log scope materialization, and Docker build concurrency outside the runner limiter.

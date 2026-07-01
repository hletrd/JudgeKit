# Performance Review — JudgeKit

**Scope:** `/tmp/judgekit-local` (review performed exclusively in this clone; no files under `/Users/hletrd/flash-shared/judgekit` were read or modified).  
**Date:** 2026-07-01  
**Perspective:** performance engineering — concurrency, CPU/memory, database/query efficiency, caching, resource limits, UI responsiveness, blocking operations.

## Summary

JudgeKit has local safety valves (output caps, semaphores, batched deletes, buffered audit writes) but several hot paths are unbounded as the data set grows. The highest-impact risks are:

1. **Unbounded input/output materialization** — API routes that parse multi-megabyte JSON bodies, load whole files into Buffers, return every chat/discussion message, or stream hundreds of source-code snapshots per page.
2. **Unbounded catalog/list endpoints** — public contests, problem sets, groups, and dashboards that load every visible row and eager-load nested relations, then paginate or filter in JavaScript.
3. **Full-table recomputation** — leaderboard, contest replay (up to 40 ranking recomputations), and analytics that aggregate the entire `submissions` table for an assignment on each request.
4. **Database index gaps** — heavily filtered columns (`problems.visibility`, `sessions.userId`/`expires`, `antiCheatEvents.ipAddress`, `problemSets.isPublic`, etc.) lack supporting indexes.
5. **Resource limits missing** — production Docker Compose and the dedicated worker compose declare no `mem_limit`, `cpus`, or `ulimits`; nginx has no upstream timeouts/keepalive; sandbox output buffers default to 128 MiB per stream.

No fixes were implemented; only findings are recorded below.

---

## Findings

### 1. Unbounded JSON body parsing in the shared API handler

- **File:** `src/lib/api/handler.ts`
- **Lines:** `157-162`
- **Explanation:** `createApiHandler` calls `raw = await req.json()` before any body-size guard. Next.js buffers the entire body into memory and parses it before the Zod schema can reject an oversized payload.
- **Failure scenario under load:** A few concurrent malicious POSTs with multi-megabyte JSON bodies to `/api/v1/submissions`, `/api/v1/admin/migrate/import`, or `/api/v1/contests/[id]/anti-cheat` can exhaust the Node.js heap and crash the app container.
- **Suggested fix:** Reject requests whose `Content-Length` exceeds a route-specific cap before calling `req.json()`, or add a global body-size limit in nginx/Next.js middleware. Use streaming parsers for large import routes.
- **Confidence:** High
- **Classification:** Memory / Security

---

### 2. Code-similarity check loads every best submission before the cap is enforced

- **File:** `src/lib/assignments/code-similarity.ts`
- **Lines:** `330-339` (CTE), `379` (fallback guard)
- **Explanation:** `runSimilarityCheck` fetches the best submission per `(user, problem, language)` for the whole assignment via a raw CTE with no `LIMIT`. The `MAX_SUBMISSIONS_FOR_SIMILARITY = 500` guard is applied only to the TypeScript fallback after the rows are materialized in memory.
- **Failure scenario under load:** A large contest with tens of thousands of source-code rows causes the app process to allocate a huge array before the Rust sidecar or fallback guard can run, leading to OOM.
- **Suggested fix:** Apply the cap in SQL (e.g., wrap the CTE in `SELECT ... LIMIT $1`) or sample in the database. Move the row-count guard before the fetch when the sidecar is unavailable.
- **Confidence:** High
- **Classification:** Database / Memory

---

### 3. Contest export builds the full ranking before truncation

- **File:** `src/app/api/v1/contests/[assignmentId]/export/route.ts`
- **Lines:** `60-62`
- **Explanation:** `computeContestRanking(assignmentId)` is invoked with no row limit. The `MAX_EXPORT_ENTRIES` cap is applied only after the full ranking array, anti-cheat counts, and IP aggregates are computed and held in memory.
- **Failure scenario under load:** Exporting a contest with tens of thousands of participants allocates huge intermediate structures (ranking entries, per-user anti-cheat counts, IP strings) and can OOM or hang the request worker.
- **Suggested fix:** Push the entry limit into `computeContestRanking` so aggregation stops early, or compute ranking in a streaming/paginated fashion for exports.
- **Confidence:** High
- **Classification:** Memory / CPU

---

### 4. Public contests listing is unbounded and eagerly loads every problem

- **File:** `src/lib/assignments/public-contests.ts`
- **Lines:** `33-64`
- **Explanation:** `getPublicContests()` calls `db.query.assignments.findMany` with no `limit` and `with: { assignmentProblems: { with: { problem: { columns: { id, visibility } } } } }`. It then counts public/private problems in JavaScript.
- **Failure scenario under load:** As the public contest catalog grows, each request loads every public contest row and every associated problem. Network transfer and JS object allocation grow linearly and can block the event loop.
- **Suggested fix:** Add pagination (`limit`/`offset` or cursor), push the public-problem count into SQL with a subquery/lateral join, and avoid eager-loading nested problem rows just to count visibility.
- **Confidence:** High
- **Classification:** Database / Memory / UI

---

### 5. Practice-page progress filter fetches all matching problem IDs and submissions

- **File:** `src/app/(public)/practice/page.tsx`
- **Lines:** `432-452`
- **Explanation:** When a progress filter other than "all" is selected, the page loads every matching problem `id` and then loads all of the current user's submissions for those problem IDs. Filtering happens in JavaScript; the file itself contains a TODO noting this should be moved to SQL.
- **Failure scenario under load:** For a 10k-problem catalog this pulls 10k IDs plus every submission the user has ever made against those problems into the Next.js server process, spiking memory and risking response timeouts.
- **Suggested fix:** Push the progress filter into SQL using `NOT EXISTS` / `EXISTS` subqueries or a CTE that computes the user's latest submission status per problem before pagination.
- **Confidence:** Medium
- **Classification:** Database / UI

---

### 6. Groups page loads all visible groups and filters/paginates in JavaScript

- **File:** `src/app/(public)/groups/page.tsx`
- **Lines:** `93-208`
- **Explanation:** For non-admin users the page fetches all instructional groups and all enrollments into memory, merges them in a `Map`, then applies search/state filters and slices to a page size in JS.
- **Failure scenario under load:** A user enrolled in many groups over several semesters causes the server to load and serialize every group on each visit, wasting DB and CPU resources.
- **Suggested fix:** Push pagination, search, and state filtering into SQL. Return only the requested page to the client.
- **Confidence:** Medium
- **Classification:** Database / UI

---

### 7. Discussion thread view loads all posts without limit

- **File:** `src/lib/discussions/data.ts`
- **Lines:** `270-283`
- **Explanation:** `getDiscussionThreadById()` eagerly loads `posts` for a thread with no `LIMIT`.
- **Failure scenario under load:** A popular editorial or solution thread with thousands of posts loads the entire thread into memory and returns a huge JSON response.
- **Suggested fix:** Paginate posts in the thread query and add a per-page limit.
- **Confidence:** High
- **Classification:** Database / UI

---

### 8. Admin chat-log transcript returns every message for a session

- **File:** `src/app/api/v1/admin/chat-logs/route.ts`
- **Lines:** `24-48`
- **Explanation:** When `sessionId` is provided, the route loads every chat message for that session with no `limit`. The route also has no `rateLimit` key.
- **Failure scenario under load:** A long support session with thousands of messages returns a multi-megabyte response; an admin/API key can repeatedly trigger this without throttling.
- **Suggested fix:** Add pagination to the transcript query and a `rateLimit` key (e.g., `chat-logs:view`).
- **Confidence:** High
- **Classification:** Database / Memory

---

### 9. Code-snapshot list returns full source code for up to 200 rows per page

- **File:** `src/app/api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts`
- **Lines:** `20-23`, `41-47`
- **Explanation:** The paginated endpoint allows up to 200 rows per page and selects `sourceCode: codeSnapshots.sourceCode` for every row. The route has no `rateLimit` key.
- **Failure scenario under load:** A single page can return hundreds of megabytes of source code, stalling JSON serialization, response transfer, and the DB. Repeated fetches are unthrottled.
- **Suggested fix:** Cap the page size lower (e.g., 20-50) for source-code-heavy endpoints, or offer a summary endpoint without `sourceCode` and a separate fetch for individual snapshots. Add rate limiting.
- **Confidence:** High
- **Classification:** Database / Memory

---

### 10. Leaderboard recomputes over the full assignment submissions table on every cache miss

- **File:** `src/lib/assignments/contest-scoring.ts`
- **Lines:** `201-244` (scoring CTE), `132-191` (cache logic)
- **Explanation:** `_computeContestRankingInner` builds a CTE over `submissions` filtered only by `assignment_id` and terminal statuses, then applies window functions over the full per-assignment set. The 30-second in-process cache is invalidated by every judge verdict (`src/app/api/v1/judge/poll/route.ts:198-200`).
- **Failure scenario under load:** In a large contest with thousands of participants and many re-submissions, the CTE scans/aggregates a very wide intermediate set on every leaderboard request and after every submission update. Under burst judging the cache is constantly cold and DB CPU saturates.
- **Suggested fix:** Maintain a materialized/incremental per-user/problem best-score table updated when a verdict lands, and have the leaderboard read from that summary. Alternatively extend cache TTL and use stale-while-revalidate more aggressively.
- **Confidence:** High
- **Classification:** Database / CPU / Caching

---

### 11. Contest replay recomputes ranking up to 40 times per request

- **File:** `src/lib/assignments/contest-replay.ts`
- **Lines:** `38-83`
- **Explanation:** `computeContestReplay` samples up to 40 replay cutoffs and invokes `computeContestRanking` for each one. Each ranking invocation runs multiple heavy raw-SQL aggregations, throttled only by `pLimit(2)`.
- **Failure scenario under load:** A large contest can trigger 40+ sequential heavy ranking queries, monopolizing pool connections and causing 504s or connection-pool exhaustion.
- **Suggested fix:** Cache snapshot rankings, precompute them in the background, or compute all cutoffs in a single set-based SQL query instead of re-running the full ranking function per cutoff.
- **Confidence:** High
- **Classification:** Database / CPU / Caching

---

### 12. Contest analytics performs nested loops in JavaScript over entries × problems

- **File:** `src/lib/assignments/contest-analytics.ts`
- **Lines:** `126-162` (per-problem solve rates), `245-270` (record-breaker window function)
- **Explanation:** After calling `computeContestRanking` (already expensive), the code builds `entryProblemMaps` and loops over every entry for every problem. When `includeTimeline` is true, a second window-function CTE scans all submissions to find record-breakers.
- **Failure scenario under load:** A contest with 1,000 users and 10 problems already does 10,000 map lookups; with 10,000 users it reaches 100,000. The timeline path adds another full scan of `submissions`.
- **Suggested fix:** Push solve-rate aggregation into SQL (`COUNT`/`SUM` grouped by problem). For timelines, pre-aggregate first-AC counts into buckets rather than returning per-event points, or paginate the timeline.
- **Confidence:** High
- **Classification:** CPU / Memory / Database

---

### 13. Problem-set visibility helpers load all visible IDs into memory

- **File:** `src/lib/problem-sets/visibility.ts`
- **Lines:** `162-188`
- **Explanation:** `countVisibleProblemSetsForUser()` selects every visible problem-set ID into an array; `listVisibleProblemSetsForUser()` then passes that array to `inArray(problemSets.id, visibleIds)`.
- **Failure scenario under load:** A staff member with access to many groups can have tens of thousands of visible problem-set IDs. The query planner often degrades for very large `IN` lists, and the application serializes/deserializes a huge ID list.
- **Suggested fix:** Rewrite the list query as a single SQL statement using `EXISTS` or joins against the visibility rules (createdBy, group access) instead of materializing IDs.
- **Confidence:** High
- **Classification:** Database / Memory

---

### 14. `listPublicProblemSetTags()` loads every public problem set and all nested tags

- **File:** `src/lib/problem-sets/public.ts`
- **Lines:** `143-165`
- **Explanation:** This function queries every public problem set (`where: eq(problemSets.isPublic, true)`) with no `limit`, eager-loading `problems.problemTags.tag`. It then deduplicates tags in JavaScript.
- **Failure scenario under load:** With many public problem sets, the query returns a large cartesian product of sets × problems × tags. Serialization and DB time grow linearly even though the caller only needs a list of unique tags.
- **Suggested fix:** Either cap the result with a `limit`, or compute the tag list directly from `tags` joined through `problemTags` and `problemSets` with `DISTINCT`/`GROUP BY`.
- **Confidence:** High
- **Classification:** Database / Memory

---

### 15. API rate limiter still performs a DB transaction on every allowed request

- **File:** `src/lib/security/api-rate-limit.ts`
- **Lines:** `69-129` (`atomicConsumeRateLimit`), `156-179` (`consumeApiRateLimit`)
- **Explanation:** The sidecar only short-circuits when the caller is already blocked; allowed requests still execute a PostgreSQL transaction with `SELECT ... FOR UPDATE` and an update. `consumeRateLimitAttemptMulti` in `src/lib/security/rate-limit.ts:178-209` serially updates each key inside the transaction.
- **Failure scenario under load:** High-traffic authenticated endpoints create hot rows in `rate_limits`. `FOR UPDATE` row locks serialize requests sharing an IP/user key, turning the rate-limit table into a bottleneck under load tests or DDoS-like traffic.
- **Suggested fix:** Use the sidecar as the primary increment authority for allowed requests and asynchronously sync counters to Postgres for persistence/audit, or shard keys by a small time bucket to spread lock contention.
- **Confidence:** Medium
- **Classification:** Concurrency / Database

---

### 16. Audit-event buffer can grow unbounded during DB back-pressure

- **File:** `src/lib/audit/events.ts`
- **Lines:** `163-262`
- **Explanation:** `recordAuditEvent()` synchronously pushes rows into an in-memory buffer and triggers an async flush. On flush failure, the failed batch is re-buffered unless the total exceeds `FLUSH_SIZE_THRESHOLD * 2`, at which point events are dropped silently.
- **Failure scenario under load:** If the DB slows down (slow disk, lock contention), high-frequency events (judge claims, heartbeats, submissions) keep arriving faster than flushes complete. The buffer balloons until the drop threshold is hit, losing audit trail entries and increasing GC pressure.
- **Suggested fix:** Apply a hard upper bound on `_auditBuffer.length` with a documented drop policy, or switch to a bounded queue with backpressure for critical events. Consider separating high-frequency judge events from security events into different buffers.
- **Confidence:** Medium
- **Classification:** Memory / Reliability

---

### 17. Anti-cheat event ingestion performs one INSERT per event

- **File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
- **Lines:** `180-190`
- **Explanation:** Non-heartbeat telemetry events are inserted one row at a time with no batching or queue.
- **Failure scenario under load:** A burst of client telemetry (focus/blur/tab-switch/copy/paste) creates a synchronous DB round-trip per request and can backlog the connection pool.
- **Suggested fix:** Batch insert events (e.g., accept an array of events and use `INSERT ... VALUES ...`) or add a small in-memory queue flushed periodically, similar to the audit-event buffer.
- **Confidence:** Medium
- **Classification:** Concurrency / Database

---

### 18. Anti-cheat localStorage keys are never garbage-collected

- **File:** `src/components/exam/anti-cheat-storage.ts`
- **Lines:** `45-111`
- **Explanation:** Pending and in-flight event keys are scoped per `assignmentId` but are never expired or cleaned up. `savePendingEvents` removes the key only when the queue is empty.
- **Failure scenario under load:** A student participating in many exams over time accumulates `judgekit_anticheat_pending_<id>` and `judgekit_anticheat_inflight_<id>` keys, growing `localStorage` without bound and slowing flush loops.
- **Suggested fix:** Add a TTL or max-key-count eviction policy, and prune stale keys on component mount.
- **Confidence:** Medium
- **Classification:** UI / Memory

---

### 19. Audit flush interval starts once and is never stopped

- **File:** `src/lib/audit/events.ts`
- **Lines:** `167-178`
- **Explanation:** `ensureFlushTimer` starts a 5-second interval on the first audit event and never stops it. The timer fires for the process lifetime and survives HMR/test module reloads.
- **Failure scenario under load:** Empty-buffer flushes waste CPU and can retain the module closure in long-running dev/test processes.
- **Suggested fix:** Provide a `stopAuditFlushTimer` export and call it during graceful shutdown/HMR; only arm the timer when the buffer is non-empty and stop it after a flush if the buffer is empty.
- **Confidence:** Medium
- **Classification:** Concurrency / Reliability

---

### 20. Data-retention prunes run eight large table deletes concurrently

- **File:** `src/lib/data-retention-maintenance.ts`
- **Lines:** `8-35` (batched delete helper), `146-155` (concurrent prune invocation)
- **Explanation:** Eight independent prunes run via `Promise.allSettled`, each deleting batches of 5,000 rows with a fixed 100 ms sleep. There is no per-run row cap or adaptive backoff.
- **Failure scenario under load:** On a system with years of submissions/audit/chat data, a single daily window can run for hours, generating WAL traffic and lock contention that overlaps with peak write load. The fixed sleep is also too coarse for small tables and too aggressive for huge ones.
- **Suggested fix:** Add a per-prune row cap (e.g., delete at most N rows per run), make sleep adaptive based on recent delete throughput, and run prunes during a configurable low-traffic window.
- **Confidence:** Medium
- **Classification:** Database / Maintenance

---

### 21. DB pool has a fixed max of 20 connections and no statement timeout

- **File:** `src/lib/db/index.ts`
- **Lines:** `41-54`
- **Explanation:** The PostgreSQL pool defaults to `max: 20`, `connectionTimeoutMillis: 10s`, `idleTimeoutMillis: 30s`, with no `statement_timeout` configured.
- **Failure scenario under load:** Bursty workloads (replay + analytics + leaderboard refreshes + exports) queue for more than 10 seconds and return connection-timeout errors; a single runaway query can hold a connection indefinitely.
- **Suggested fix:** Make pool size and timeouts env-driven, set a reasonable `statement_timeout` on new connections (e.g., 30-60s), and add pool-saturation alerting via the existing `pool-health.ts` diagnostics.
- **Confidence:** High
- **Classification:** Database / Concurrency

---

### 22. File download reads the entire stored file into a Buffer

- **File:** `src/app/api/v1/files/[id]/route.ts`
- **Lines:** `100-102`, `123`
- **Explanation:** The GET handler reads the whole uploaded file into memory with `buffer = await readUploadedFile(file.storedName)` and then wraps it in a `Uint8Array` for the response. There is no streaming.
- **Failure scenario under load:** Concurrent downloads of a few large test-case attachments or PDFs can exhaust the Node.js heap and crash the app.
- **Suggested fix:** Stream files from disk through the response (e.g., `ReadableStream` or `fs.createReadStream`) without loading the full content into memory.
- **Confidence:** High
- **Classification:** Memory

---

### 23. File storage helpers read and write whole files into `Buffer`

- **File:** `src/lib/files/storage.ts`
- **Lines:** `27-42`
- **Explanation:** `writeUploadedFile` and `readUploadedFile` operate on complete `Buffer`s. The callers have no size enforcement at the storage layer.
- **Failure scenario under load:** Downloading or importing a large attachment (image, PDF, export archive) loads the entire object into the Node process. A few concurrent large-file downloads can exhaust heap.
- **Suggested fix:** Provide streaming variants (`createReadStream`/`createWriteStream`) and route large files through streams; enforce a global upload size limit at the storage/API layer.
- **Confidence:** Medium
- **Classification:** Memory

---

### 24. Local compiler runner buffers stdout/stderr as strings up to 128 MiB per stream

- **File:** `src/lib/compiler/execute.ts`
- **Lines:** `18` (`MAX_OUTPUT_BYTES`), `455-465` (string concatenation in `data` handlers), `497-498` (response)
- **Explanation:** The local fallback uses `pLimit(cpus-1)` but then accumulates output chunks into JavaScript strings. Each container can contribute up to 256 MiB of buffered text (128 MiB stdout + 128 MiB stderr), and repeated `stdout += chunk` creates intermediate string copies.
- **Failure scenario under load:** If several compiler-run requests run in parallel, worker memory can climb to multiple gigabytes. Memory pressure triggers GC pauses and can OOM the Node process, especially on smaller hosts.
- **Suggested fix:** Lower the default cap, stream outputs directly where they are only being returned, and use `Buffer` concatenation instead of string `+=`.
- **Confidence:** High
- **Classification:** Memory

---

### 25. Rust judge worker also buffers up to 128 MiB per stream per sandbox

- **File:** `judge-worker-rs/src/docker.rs`
- **Lines:** `420-464` (output reader tasks)
- **Explanation:** Each judged container spawns two Tokio tasks that read stdout/stderr into memory until `max_output_bytes` (default 128 MiB per stream). Worst-case worker RAM is approximately `128 MiB × 2 × JUDGE_CONCURRENCY` plus container overhead.
- **Failure scenario under load:** A `JUDGE_CONCURRENCY` of 8 already reserves ~2 GiB just for output buffers. A malicious submission that prints in a tight loop will fill these buffers, leaving little headroom for the Docker daemon and language runtimes.
- **Suggested fix:** Consider a lower default (e.g., 8-32 MiB) and stream outputs to the comparator without fully materializing them in memory.
- **Confidence:** High
- **Classification:** Memory

---

### 26. Run-phase memory cap differs between Rust worker and Node fallback

- **File:** `judge-worker-rs/src/executor.rs` (line 23, 579); `src/lib/compiler/execute.ts` (line 15)
- **Explanation:** The Rust worker silently clamps per-submission memory to `MAX_MEMORY_LIMIT_MB = 1024`, while the Node local fallback hard-codes `MEMORY_LIMIT_MB = 2048`.
- **Failure scenario under load:** Problems authored with a memory limit between 1024 MB and 2048 MB produce inconsistent verdicts: submissions may pass on the local fallback path but fail with `MemoryLimit` on the production Rust worker, or vice versa.
- **Suggested fix:** Make both runners use the same configurable ceiling and surface the clamp in logs/metrics. Prefer making the cap env-driven and identical across runners.
- **Confidence:** High
- **Classification:** Concurrency / Resource Limits

---

### 27. Node fallback run timeout counts container startup against the user budget

- **File:** `src/lib/compiler/execute.ts`
- **Lines:** `468-473`, `828`
- **Explanation:** The run phase uses the raw `timeLimitMs` as the wall-clock kill timeout, unlike the Rust worker which adds `DOCKER_RUN_OVERHEAD_BUDGET_MS` (2 s).
- **Failure scenario under load:** Near-limit legitimate submissions receive spurious timeouts because Docker container startup overhead is counted against the user's time budget.
- **Suggested fix:** Add the same startup-overhead buffer to the Node fallback kill timeout, keeping CPU-time verdict semantics based on the container runtime.
- **Confidence:** Medium
- **Classification:** Concurrency / Resource Limits

---

### 28. Compile tmpfs is smaller than the compile memory limit

- **File:** `src/lib/compiler/execute.ts` (lines 20, 357-366); `judge-worker-rs/src/docker.rs` (line 17)
- **Explanation:** The compile phase is granted 2048 MB of memory but only a 1024 MB `/tmp` tmpfs. The extra memory cannot be used for tmpfs-backed compiler caches or temporary files.
- **Failure scenario under load:** Compilers that write large intermediate files to `/tmp` (e.g., Java, Scala, C++ modules) hit `ENOSPC` on tmpfs while the container memory limit still shows headroom.
- **Suggested fix:** Make the compile tmpfs size configurable and at least as large as the compile memory limit, or default both to the same value.
- **Confidence:** Medium
- **Classification:** Resource Limits

---

### 29. Judge claim endpoint fetches every test case for the problem after claiming

- **File:** `src/app/api/v1/judge/claim/route.ts`
- **Lines:** `319-329`
- **Explanation:** The claim response loads all test-case `input` and `expectedOutput` columns for the claimed problem in one query. There is no count or size cap.
- **Failure scenario under load:** Problems with hundreds of test cases or very large generated inputs/outputs transfer multi-megabyte payloads from DB to app server to worker. This inflates claim latency and worker memory, and can be exploited by uploading a problem with oversized test cases.
- **Suggested fix:** Enforce a maximum number of test cases and a per-case size limit at problem-import time, or stream/lazy-load test cases to the worker in chunks.
- **Confidence:** Medium
- **Classification:** Database / Network

---

### 30. Heartbeat endpoint runs the worker staleness sweep inline

- **File:** `src/app/api/v1/judge/heartbeat/route.ts`
- **Lines:** `80`
- **Explanation:** Every worker heartbeat awaits `sweepStaleWorkers(now)`, which updates the status of stale workers in the same request handler.
- **Failure scenario under load:** With many workers heartbeating frequently, the sweep runs repeatedly and serializes updates to `judgeWorkers`. Under a worker churn event, heartbeats pile up behind the sweep and response times spike, causing workers to be marked stale precisely when they are reporting.
- **Suggested fix:** Move the staleness sweep to a single background interval/cron and make the heartbeat path a minimal `UPDATE` of the calling worker.
- **Confidence:** Medium
- **Classification:** Concurrency / Database

---

### 31. Docker image build blocks a Next.js request worker for up to 600s

- **File:** `src/app/api/v1/admin/docker/images/build/route.ts`
- **Lines:** `119`
- **Explanation:** The handler awaits `buildDockerImage(...)` synchronously in the request thread with only the underlying build timeout.
- **Failure scenario under load:** A slow multi-GB language image build occupies a request worker for up to 10 minutes, reducing capacity for other admin requests.
- **Suggested fix:** Move image builds to an asynchronous job queue or background worker and return a build-id/job-status response; alternatively cap the build time lower for the API path.
- **Confidence:** Medium
- **Classification:** Blocking / Concurrency

---

### 32. Bulk file delete performs sequential disk I/O

- **File:** `src/app/api/v1/files/bulk-delete/route.ts`
- **Lines:** `33-39`
- **Explanation:** After the DB delete, the handler loops over deleted files and awaits `deleteUploadedFile` sequentially.
- **Failure scenario under load:** Bulk-deleting the maximum allowed files spends most of the request waiting on serial I/O, holding the connection open.
- **Suggested fix:** Run disk deletions in parallel with `Promise.all` (or a bounded `p-limit`) and return success based on the DB delete.
- **Confidence:** Medium
- **Classification:** Blocking / Concurrency

---

### 33. Admin CSV exports load up to 10,000 wide rows into memory

- **File:** `src/app/api/v1/admin/audit-logs/route.ts` (line 208); `src/app/api/v1/admin/login-logs/route.ts` (line 95); `src/app/api/v1/admin/submissions/export/route.ts` (lines 94-111)
- **Explanation:** CSV export routes load up to 10,000 rows into memory before serializing. Audit logs include the `details` JSONB column; login logs search across multiple coalesced columns with no supporting index.
- **Failure scenario under load:** Wide `details` payloads or broad date ranges can still produce large memory use and slow query times despite the 10k cap.
- **Suggested fix:** Stream CSV generation row-by-row instead of building the full response in memory. Add a composite index for common log filters (date + resourceType / outcome).
- **Confidence:** Medium
- **Classification:** Memory / Database

---

### 34. Judge system snapshot rebuilds the language catalog on every call

- **File:** `src/lib/judge/dashboard-data.ts`
- **Lines:** `23-68`
- **Explanation:** `getJudgeSystemSnapshot()` queries all enabled language configs and rebuilds the full catalog on every call. This data changes only when an admin edits languages.
- **Failure scenario under load:** Homepage, public dashboard, and languages-page traffic repeatedly re-query and reconstruct the catalog, wasting DB CPU and increasing response latency.
- **Suggested fix:** Cache the catalog (e.g., React `cache()` for request-level or a short-lived in-memory TTL cache) and invalidate it only when `language_configs` is mutated.
- **Confidence:** Medium
- **Classification:** Caching / Database

---

### 35. Missing indexes on IP-address columns used by anti-cheat aggregation

- **File:** `src/lib/db/schema.pg.ts`
- **Lines:** `1186-1210` (`antiCheatEvents`) and `381-402` (`examSessions`)
- **Explanation:** Both tables store `ip_address`/`ipAddress` text columns but only index `assignmentId`, `userId`, and `eventType`. The IP-overlap report in `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:226-262` builds a CTE that selects distinct `ip_address`/`user_id` from both tables and then aggregates with `json_agg`/`array_agg`.
- **Failure scenario under load:** During a large exam, `anti_cheat_events` can contain hundreds of thousands of heartbeats/events per assignment. Without a selective index on `(assignment_id, ip_address)` the planner must scan the whole table, hash the distinct set, and then join to `users`. Concurrent staff opening the monitoring page during the exam can pin CPU/IO and slow heartbeat ingestion.
- **Suggested fix:** Add composite indexes:
  - `index("ace_assignment_ip_idx").on(table.assignmentId, table.ipAddress)`
  - `index("exam_sessions_assignment_ip_idx").on(table.assignmentId, table.ipAddress)`
  Use partial indexes with `where isNotNull(table.ipAddress)` if supported.
- **Confidence:** High
- **Classification:** Database / Query

---

### 36. Missing indexes on public-listing and auth filter columns

- **File:** `src/lib/db/schema.pg.ts`
- **Lines:** `65-71` (`sessions`), `250-290` (`problems`), `329-378` (`assignments`), `800-816` (`problemSets`), `922-947` (`discussionThreads`)
- **Explanation:** Several high-cardinality filter columns lack indexes:
  - `sessions.userId`, `sessions.expires` — used by the auth layer to look up and expire sessions.
  - `problems.visibility` — filtered in almost every public catalog query.
  - `assignments.visibility`, `assignments.examMode` — used by public-contests listing.
  - `problemSets.isPublic`, `problemSets.createdBy` — public listings and ownership checks.
  - `discussionThreads.authorId` — used by author-scoped discussion queries.
- **Failure scenario under load:** Public pages that filter `visibility = 'public'` will scan the entire `problems` table. With 50k+ problems, query latency crosses the 100 ms mark and worsens linearly. Session lookups without an index on `userId` also degrade as the session table grows.
- **Suggested fix:** Add:
  - `index("problems_visibility_created_idx").on(table.visibility, table.createdAt)`
  - `index("sessions_user_expires_idx").on(table.userId, table.expires)`
  - `index("assignments_visibility_exam_mode_idx").on(table.visibility, table.examMode)`
  - `index("problem_sets_is_public_created_idx").on(table.isPublic, table.createdAt)`
  - `index("dt_author_idx").on(table.authorId)`
- **Confidence:** High
- **Classification:** Database / Query

---

### 37. Production Docker Compose declares no service resource limits

- **File:** `docker-compose.production.yml`
- **Lines:** `17-194`
- **Explanation:** The `db`, `app`, `judge-worker`, `docker-proxy`, `code-similarity`, and `rate-limiter` services define no `mem_limit`, `cpus`, `ulimits`, or `deploy.resources` constraints.
- **Failure scenario under load:** A runaway judge container, a build step, a memory-leaking app, or a Postgres vacuum/analyze can consume all host CPU/RAM and trigger OOM kills or total host unresponsiveness.
- **Suggested fix:** Add memory and CPU limits to every production service, matching the documented worst-case sizing (e.g., `JUDGE_MAX_OUTPUT_BYTES × 2 × JUDGE_CONCURRENCY` for the worker). Add `ulimits` for nofile/nproc on the worker.
- **Confidence:** High
- **Classification:** Infrastructure

---

### 38. Dedicated worker compose has no resource caps with default concurrency of 4

- **File:** `docker-compose.worker.yml`
- **Lines:** `48-93`
- **Explanation:** The worker service has no memory or CPU limits, yet defaults to `JUDGE_CONCURRENCY=4` and `RUNNER_CONCURRENCY=4`, each container using up to 2 GB of memory.
- **Failure scenario under load:** On a 4-8 GB worker host, default concurrency causes OOM kills, a wedged Docker daemon, and lost verdicts.
- **Suggested fix:** Add `mem_limit`/`cpus` to the worker service and document minimum host sizing. Consider deriving default concurrency from detected host memory/CPU instead of a fixed 4.
- **Confidence:** High
- **Classification:** Infrastructure

---

### 39. App nginx reverse proxy lacks timeouts, compression, and upstream keepalive

- **File:** `scripts/online-judge.nginx.conf`
- **Lines:** `56-103`
- **Explanation:** Proxy locations have no `proxy_connect_timeout`, `proxy_send_timeout`, `proxy_read_timeout`, or buffer settings; no `gzip`/`brotli` is enabled for the application; and no `keepalive` connections are configured to the upstream.
- **Failure scenario under load:** A stalled Next.js response can hold nginx workers open indefinitely, causing cascading queueing and 502/504 storms. Large HTML/JSON responses travel uncompressed, and every request pays the full TCP/TLS handshake cost.
- **Suggested fix:** Add explicit proxy timeouts (e.g., 60s read/30s connect), enable gzip for JSON/HTML/text responses, and configure a small `keepalive` pool to the upstream app.
- **Confidence:** High
- **Classification:** Infrastructure

---

### 40. Static-site nginx config lacks rate-limiting and worker tuning

- **File:** `static-site/nginx.conf`
- **Lines:** `1-24`
- **Explanation:** The static-site server enables gzip and sets 7-day immutable caching for assets, but it has no `limit_req`, no worker-process tuning, and no page-cache configuration.
- **Failure scenario under load:** A traffic spike or cache-busting crawl can spawn unlimited worker connections; without rate limiting the static site can still saturate CPU or file descriptors.
- **Suggested fix:** Add `limit_req_zone`/`limit_req`, tune `worker_processes`/`worker_connections`, and consider serving the static site through the same CDN/reverse proxy used for the app.
- **Confidence:** Low
- **Classification:** Infrastructure

---

### 41. LLM provider tool responses are buffered entirely into memory

- **File:** `src/lib/plugins/chat-widget/providers.ts`
- **Lines:** `79` (timeout), `119-172` (OpenAI), `225-296` (Claude), `356-431` (Gemini)
- **Explanation:** Non-streaming tool-call paths use `fetch`, read the full response body, parse JSON, and then run Zod `.safeParse` filters over content arrays multiple times. There is no response-size cap.
- **Failure scenario under load:** A misbehaving or unusually verbose LLM response (large tool result or many repeated tool-use blocks) can create multi-megabyte objects. The provider parsing also iterates arrays twice (filter + map), increasing CPU and GC pressure.
- **Suggested fix:** Add a `Content-Length`/max-size guard before parsing, and avoid repeated full-array `.safeParse` passes by parsing the response once and branching on shape.
- **Confidence:** Low
- **Classification:** Memory / CPU

---

## Observations That Are Currently Acceptable

- **Code-similarity Rust sidecar first:** The TypeScript fallback is capped at 500 submissions and yields every 8 ms, which is reasonable for a fallback path. The main risk is the SQL query loading unbounded rows before the cap.
- **Submission list pagination:** Both cursor and offset modes use database-level limits and sort on a total order (`submittedAt`, `id`).
- **Worker concurrency is bounded** by a semaphore in both the Rust worker and the local compiler runner.
- **Output caps exist** in both runners; the issue is the cap size and in-memory buffering, not the absence of limits.

---

## Recommended Priority Order

1. Add the missing database indexes (Findings 35, 36).
2. Bound public-list endpoints and push pagination/filtering into SQL (Findings 4, 6, 13, 14).
3. Cap input/output materialization (Findings 1, 2, 3, 8, 9, 22, 23, 33).
4. Reduce or stream per-sandbox output buffers (Findings 24, 25).
5. Make leaderboard/analytics/replay incremental or longer-cached (Findings 10, 11, 12).
6. Add Docker Compose resource constraints (Findings 37, 38).
7. Harden audit buffering and rate-limit hot rows (Findings 15, 16, 19).
8. Move heartbeat sweep and image builds out of the request path (Findings 30, 31).
9. Cap test-case transfer sizes and file-upload memory use (Findings 29, 23).
10. Tune nginx timeouts/compression/keepalive (Findings 39, 40).

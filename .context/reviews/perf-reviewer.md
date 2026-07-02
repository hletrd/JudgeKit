# Performance Review — JudgeKit

**Scope:** `/tmp/judgekit-local` (review performed exclusively in this clone; no files under `/Users/hletrd/flash-shared/judgekit` were read or modified).  
**Date:** 2026-07-02  
**Perspective:** performance engineering — concurrency, CPU/memory, database/query efficiency, caching, resource limits, UI responsiveness, blocking operations, serialization, Docker/judge sandbox overhead, and test/benchmark gaps.

## Summary

JudgeKit has local safety valves (output caps, semaphores, batched deletes, buffered audit writes) but several hot paths remain unbounded as data sets grow. The highest-impact risks are:

1. **Unbounded queues, buffers, and fan-out** — the compiler runner uses an uncapped `p-limit` queue, SSE shared polling keeps an unbounded subscriber map and issues unbounded `IN (...)` queries, file uploads are fully materialised in memory, and similarity checks ship all source code in one JSON body.
2. **Full-table recomputation** — leaderboard, contest replay (up to 40 ranking recomputations), analytics, and similarity scans re-aggregate large slices of `submissions` on every request/cache miss.
3. **Database index and query gaps** — heavily filtered columns (`source_drafts.updated_at`, `anti_cheat_events.ip_address`, `sessions.userId`/`expires`, `problems.visibility`, etc.) lack supporting indexes; several endpoints materialise large ID lists in JavaScript.
4. **Blocking I/O inside async runtimes** — the Rust judge worker calls `chown` synchronously inside Tokio tasks; the Node fallback concatenates stdout/stderr strings; LLM providers parse response arrays twice.
5. **Missing infrastructure resource guards** — production Docker Compose and the dedicated worker compose declare no `mem_limit`/`cpus`/`ulimits`; generated nginx lacks upstream timeouts/keepalive/compression; Docker build caches are intentionally disabled.
6. **No performance or load-test coverage** — there are no benchmarks, load tests, or throughput regression gates for hot paths, so performance regressions are typically discovered in production.

No fixes were implemented; only findings are recorded below.

---

## File Inventory Reviewed

- **Total files examined:** 1,433 under the target directories.
- Breakdown:
  - `src/` — 638 files (App Router routes, components, lib, hooks)
  - `judge-worker-rs/` — 13 files (Rust source + Cargo config)
  - `docker/` — 106 files (language Dockerfiles, seccomp profile, interpreters)
  - `scripts/` — 43 files (deploy scripts, systemd units, helpers)
  - `tests/` — 532 files (unit, integration, component, E2E, harness)
  - `static-site/` — 101 files (nginx config + static HTML assets)
- **Root configuration files reviewed in addition:**
  - `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`
  - `docker-compose.yml`, `docker-compose.production.yml`, `docker-compose.worker.yml`, `docker-compose.test-backends.yml`
  - `Dockerfile`, `Dockerfile.judge-worker`, `Dockerfile.code-similarity`, `Dockerfile.rate-limiter-rs`, `.dockerignore`
  - `deploy-docker.sh`, `deploy.sh`
  - `playwright.config.ts`, `vitest.config.ts`, `vitest.config.integration.ts`, `vitest.config.component.ts`, `vitest.config.harness.ts`

Language Dockerfiles were sampled for repeated patterns; unique/interesting images and all scripts, nginx configs, compose files, and root config files were examined directly.

---

## Findings

### A. App / API Layer (Node.js / Next.js)

#### A1. Unbounded JSON body parsing in the shared API handler
- **Severity:** Critical
- **Confidence:** High
- **File / region:** `src/lib/api/handler.ts` (~157–162)
- **Problem:** `createApiHandler` calls `raw = await req.json()` before any body-size guard. Next.js buffers the entire body and parses it before the Zod schema can reject an oversized payload.
- **Failure scenario:** A few concurrent malicious POSTs with multi-megabyte JSON bodies to `/api/v1/submissions`, `/api/v1/admin/migrate/import`, or `/api/v1/contests/[id]/anti-cheat` can exhaust the Node.js heap and crash the app container.
- **Fix:** Reject requests whose `Content-Length` exceeds a route-specific cap before calling `req.json()`, or add a global body-size limit in nginx/Next.js middleware. Use streaming parsers for large import routes.

#### A2. Compiler-run `p-limit` queue is unbounded
- **Severity:** Critical
- **Confidence:** High
- **File / region:** `src/lib/compiler/execute.ts:32`
- **Problem:** `executionLimiter = pLimit(Math.max(cpus().length - 1, 1))` caps *concurrent* Docker containers but places no cap on the number of *queued* requests. Each queued call retains `sourceCode`, `stdin`, buffers, closure state, and the in-flight HTTP request/response objects.
- **Failure scenario:** A contest with 500+ concurrent compiler-run calls hits the container limit; subsequent requests pile up in the `p-limit` internal queue. Resident memory grows linearly until the Node process OOMs.
- **Fix:** Add a bounded queue with explicit `maxQueueSize` and reject with `503` when exceeded, or switch to a semaphore that throws immediately when no slot is available.

#### A3. Compiler-run output accumulated as strings up to 128 MiB per stream
- **Severity:** Critical
- **Confidence:** High
- **File / region:** `src/lib/compiler/execute.ts:18`, `455–465`
- **Problem:** `MAX_OUTPUT_BYTES = 134_217_728` per stream. The local fallback uses `stdout += chunk.toString(...)` on every chunk, creating intermediate string copies and garbage.
- **Failure scenario:** A pathological program prints a 100 MiB line/second. The local fallback keeps appending strings, causing long GC pauses and possible OOM before truncation kicks in.
- **Fix:** Accumulate output in a `Buffer[]` and only stringify once at the end, or use a fixed-size buffer/drop policy. Consider lowering the per-container cap or making it configurable.

#### A4. File uploads load the entire payload into memory
- **Severity:** Critical
- **Confidence:** High
- **File / region:** `src/app/api/v1/files/route.ts:40`, `52–58`
- **Problem:** `Buffer.from(await file.arrayBuffer())` holds the complete uploaded file in heap. ZIP decompression (`validateZipDecompressedSize`) is also performed on the in-memory buffer. There is no streaming path.
- **Failure scenario:** A 100 MiB ZIP upload is decompressed to inspect total size; the buffer plus decompressed working set can OOM the request worker. With concurrent uploads, the app server exhausts memory before the judge worker is involved.
- **Fix:** Stream uploads to temporary disk and validate ZIP size via streaming entry iteration (e.g., `yauzl`/`unzipper`). Keep only metadata in memory.

#### A5. SSE shared poll and connection tracking are unbounded
- **Severity:** Critical
- **Confidence:** High
- **File / region:** `src/app/api/v1/submissions/[id]/events/route.ts:39–75`, `159–234`, `275–294`
- **Problem:** `submissionSubscribers` maps submission IDs to unbounded `Set<PollCallback>`; a single popular submission can accumulate thousands of subscribers. `sharedPollTick` issues `inArray(submissions.id, submissionIds)` with no upper bound on the ID list. `connectionInfoMap` eviction only runs when a new connection is added; stale entries can linger until then.
- **Failure scenario:** During a large contest, thousands of students open the results page for a few popular problems. Each SSE tick fans out to all subscribers and issues a multi-thousand-element `IN (...)` query, spiking DB CPU and event-loop latency.
- **Fix:** Cap subscribers per submission ID and total active connection IDs; truncate `inArray` batch size and paginate the poll query; run periodic eviction independent of new connections.

#### A6. Global advisory lock serialises every SSE connection acquisition
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/lib/realtime/realtime-coordination.ts:73–140`
- **Problem:** `acquireSharedSseConnectionSlot` takes a single advisory lock key `"realtime:sse:acquire"` for all SSE connection openings across the deployment.
- **Failure scenario:** During contest start, hundreds of students open the results page simultaneously; the advisory lock forces serialised DB transactions, creating a bottleneck and slow connection establishment.
- **Fix:** Use an atomic `INSERT ... ON CONFLICT` with a pre-check, or partition locks by user/hash. Avoid a global serialisation point.

#### A7. `/judge/claim` fetches every test case for the problem, including hidden/large ones
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/app/api/v1/judge/claim/route.ts:319–329`
- **Problem:** The claim query selects `input`, `expectedOutput`, `isVisible`, `sortOrder` for **all** test cases of a problem with no limit.
- **Failure scenario:** A problem with 200 test cases, each with 1 MiB of I/O, causes the claim response to serialise ~200 MiB of hidden test data and blocks the worker until received.
- **Fix:** Paginate or stream test cases, or have the worker fetch test cases separately in chunks. At minimum, cap the number of cases returned per claim and document the limit.

#### A8. `/judge/poll` replaces submission results in a single unbounded batch
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/app/api/v1/judge/poll/route.ts:104–109`, `175–179`
- **Problem:** For every judged submission, the route deletes existing `submissionResults` and inserts all new rows in one `values(rows)` call. A problem with many test cases can produce thousands of rows.
- **Failure scenario:** A problem with 1,000 test cases returns 1,000 result rows; the insert statement binds thousands of parameters, causing the query to fail or consume excessive DB resources.
- **Fix:** Batch inserts in chunks (e.g., 500 rows) and process deletes/inserts inside the transaction.

#### A9. Leaderboard cache miss materialises all terminal submissions and processes them in JavaScript
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/lib/assignments/contest-scoring.ts:197–494`
- **Problem:** `_computeContestRankingInner` issues a CTE that returns every terminal submission for the assignment, then builds maps, sorts, and ranks in JavaScript. For a large contest this can be tens of thousands of rows.
- **Failure scenario:** A 1,000-participant contest with 10 problems and ~5 submissions each produces 50,000 rows; the JS grouping and sorting step blocks the event loop.
- **Fix:** Push ranking computation into SQL where possible, or compute incrementally. The existing LRU cache with SWR is good, but the miss path needs back-pressure or background-only computation.

#### A10. Contest analytics recomputes expensive ranking and additional heavy aggregates
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/lib/assignments/contest-analytics.ts:93–309`
- **Problem:** `computeContestAnalytics` calls `computeContestRanking` (full leaderboard), then runs several more raw queries. With `includeTimeline=true`, it fetches all record-breaker submissions and materialises per-user progression maps in JS.
- **Failure scenario:** An instructor refreshes the analytics page during a 500-participant contest; the first request computes the leaderboard, first-AC map, solve timelines, and student progressions, blocking a DB connection and event loop for seconds.
- **Fix:** Pre-aggregate or materialise analytics in the DB, or compute heavy timelines asynchronously and cache for minutes. Add a request-level timeout and degrade gracefully.

#### A11. Contest replay recomputes ranking up to 40 times per request
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/lib/assignments/contest-replay.ts:38–83`
- **Problem:** `computeContestReplay` samples up to 40 replay cutoffs and invokes `computeContestRanking` for each one. Each ranking invocation runs multiple heavy raw-SQL aggregations, throttled only by `pLimit(2)`.
- **Failure scenario:** A large contest can trigger 40+ sequential heavy ranking queries, monopolising pool connections and causing 504s or connection-pool exhaustion.
- **Fix:** Cache snapshot rankings, precompute them in the background, or compute all cutoffs in a single set-based SQL query instead of re-running the full ranking function per cutoff.

#### A12. Code-similarity SQL loads every best submission before the cap is enforced
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/lib/assignments/code-similarity.ts:330–339`
- **Problem:** `runSimilarityCheck` fetches the best submission per `(user, problem, language)` for the whole assignment via a raw CTE with no `LIMIT`. The `MAX_SUBMISSIONS_FOR_SIMILARITY = 500` guard is applied only after the rows are materialised in memory.
- **Failure scenario:** A large contest with tens of thousands of source-code rows causes the app process to allocate a huge array before the Rust sidecar or fallback guard can run, leading to OOM.
- **Fix:** Apply the cap in SQL (e.g., wrap the CTE in `SELECT ... LIMIT $1`) or sample in the database. Move the row-count guard before the fetch when the sidecar is unavailable.

#### A13. Similarity sidecar uploads all source code in one JSON body
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/lib/assignments/code-similarity-client.ts:45–52`
- **Problem:** `computeSimilarityRust` sends up to 500 source codes (64 KiB each = 32 MiB) as a single JSON POST body with a 25 s timeout.
- **Failure scenario:** Network serialisation of a 32 MiB JSON payload blocks the event loop and can exceed the 25 s sidecar timeout even when the Rust computation is fast.
- **Fix:** Stream the request body, compress it, or cap the per-request payload size and paginate the similarity job.

#### A14. Similarity-check TypeScript fallback has high memory growth for 500 submissions
- **Severity:** Medium
- **Confidence:** Medium
- **File / region:** `src/lib/assignments/code-similarity.ts:15–310`
- **Problem:** Up to 500 submissions are normalised, tokenised into n-grams (`Set<string>`), and compared pairwise. Each source can be 64 KiB; normalised strings plus n-gram sets can consume tens of MiB per submission. The O(n²) comparison has time-slicing but no memory ceiling.
- **Failure scenario:** A large contest triggers the TS fallback (Rust sidecar down). The route builds ~500 `Set<string>` objects and compares ~125k pairs, spiking memory and causing the 30 s timeout handler to fire.
- **Fix:** Bound memory by sampling submissions or using a streaming/min-hash algorithm. Add a hard memory check before entering the O(n²) loop.

#### A15. Public contests listing is unbounded and eagerly loads every problem
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/lib/assignments/public-contests.ts:33–64`
- **Problem:** `getPublicContests()` calls `db.query.assignments.findMany` with no `limit` and `with: { assignmentProblems: { with: { problem: { columns: { id, visibility } } } } }`. It then counts public/private problems in JavaScript.
- **Failure scenario:** As the public contest catalog grows, each request loads every public contest row and every associated problem. Network transfer and JS object allocation grow linearly and can block the event loop.
- **Fix:** Add pagination (`limit`/`offset` or cursor), push the public-problem count into SQL with a subquery/lateral join, and avoid eager-loading nested problem rows just to count visibility.

#### A16. Problem-set visibility helpers load all visible IDs into memory
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/lib/problem-sets/visibility.ts:162–188`
- **Problem:** `countVisibleProblemSetsForUser()` selects every visible problem-set ID into an array; `listVisibleProblemSetsForUser()` then passes that array to `inArray(problemSets.id, visibleIds)`.
- **Failure scenario:** A staff member with access to many groups can have tens of thousands of visible problem-set IDs. The query planner often degrades for very large `IN` lists, and the application serialises/deserialises a huge ID list.
- **Fix:** Rewrite the list query as a single SQL statement using `EXISTS` or joins against the visibility rules (createdBy, group access) instead of materialising IDs.

#### A17. `listPublicProblemSetTags()` loads every public problem set and all nested tags
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/lib/problem-sets/public.ts:143–165`
- **Problem:** This function queries every public problem set (`where: eq(problemSets.isPublic, true)`) with no `limit`, eager-loading `problems.problemTags.tag`. It then deduplicates tags in JavaScript.
- **Failure scenario:** With many public problem sets, the query returns a large cartesian product of sets × problems × tags. Serialisation and DB time grow linearly even though the caller only needs a list of unique tags.
- **Fix:** Either cap the result with a `limit`, or compute the tag list directly from `tags` joined through `problemTags` and `problemSets` with `DISTINCT`/`GROUP BY`.

#### A18. Discussion thread view loads all posts without limit
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/lib/discussions/data.ts:270–283`
- **Problem:** `getDiscussionThreadById()` eagerly loads `posts` for a thread with no `LIMIT`.
- **Failure scenario:** A popular editorial or solution thread with thousands of posts loads the entire thread into memory and returns a huge JSON response.
- **Fix:** Paginate posts in the thread query and add a per-page limit.

#### A19. Admin chat-log transcript returns every message for a session
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/app/api/v1/admin/chat-logs/route.ts:24–48`
- **Problem:** When `sessionId` is provided, the route loads every chat message for that session with no `limit`. The route also has no `rateLimit` key.
- **Failure scenario:** A long support session with thousands of messages returns a multi-megabyte response; an admin/API key can repeatedly trigger this without throttling.
- **Fix:** Add pagination to the transcript query and a `rateLimit` key (e.g., `chat-logs:view`).

#### A20. Code-snapshot list returns full source code for up to 200 rows per page
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/app/api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts:20–23`, `41–47`
- **Problem:** The paginated endpoint allows up to 200 rows per page and selects `sourceCode: codeSnapshots.sourceCode` for every row. The route has no `rateLimit` key.
- **Failure scenario:** A single page can return hundreds of megabytes of source code, stalling JSON serialisation, response transfer, and the DB. Repeated fetches are unthrottled.
- **Fix:** Cap the page size lower (e.g., 20–50) for source-code-heavy endpoints, or offer a summary endpoint without `sourceCode` and a separate fetch for individual snapshots. Add rate limiting.

#### A21. File download reads the entire stored file into a Buffer
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/app/api/v1/files/[id]/route.ts:100–102`, `123`
- **Problem:** The GET handler reads the whole uploaded file into memory with `buffer = await readUploadedFile(file.storedName)` and then wraps it in a `Uint8Array` for the response. There is no streaming.
- **Failure scenario:** Concurrent downloads of a few large test-case attachments or PDFs can exhaust the Node.js heap and crash the app.
- **Fix:** Stream files from disk through the response (e.g., `ReadableStream` or `fs.createReadStream`) without loading the full content into memory.

#### A22. Audit-event buffer can grow unbounded during DB back-pressure
- **Severity:** Medium
- **Confidence:** Medium
- **File / region:** `src/lib/audit/events.ts:184–220`, `252–261`
- **Problem:** `recordAuditEvent` pushes to `_auditBuffer` synchronously. `flushAuditBuffer` is triggered at 50 events or every 5 s. If the DB insert is slow, concurrent `recordAuditEvent` calls keep appending during the `await`; the buffer can grow well beyond `FLUSH_SIZE_THRESHOLD` before the swap happens.
- **Failure scenario:** A high-traffic period (many submissions/judge claims) coincides with DB latency; the audit buffer grows to thousands of events, increasing memory and worsening GC.
- **Fix:** Use a ring buffer or cap `_auditBuffer` size and drop/compact events when full instead of allowing unbounded growth.

#### A23. Data-retention prunes run eight large table deletes concurrently
- **Severity:** Medium
- **Confidence:** Medium
- **File / region:** `src/lib/data-retention-maintenance.ts:131–163`
- **Problem:** `pruneSensitiveOperationalData` runs eight independent `batchedDelete` loops inside `Promise.allSettled`. Each loop holds a DB connection and performs many `DELETE ... LIMIT 5000` iterations.
- **Failure scenario:** The daily maintenance window spikes connection-pool usage and I/O, starving regular API requests and causing 503s or slowdowns during the prune.
- **Fix:** Stagger table prunes sequentially or with limited concurrency, and run them in a low-priority maintenance window with connection-limit isolation.

#### A24. API rate limiter still performs a DB transaction on every allowed request
- **Severity:** Medium
- **Confidence:** Medium
- **File / region:** `src/lib/security/api-rate-limit.ts:69–129`, `156–179`
- **Problem:** The sidecar only short-circuits when the caller is already blocked; allowed requests still execute a PostgreSQL transaction with `SELECT ... FOR UPDATE` and an update. `consumeRateLimitAttemptMulti` in `src/lib/security/rate-limit.ts:178–209` serially updates each key inside the transaction.
- **Failure scenario:** High-traffic authenticated endpoints create hot rows in `rate_limits`. `FOR UPDATE` row locks serialise requests sharing an IP/user key, turning the rate-limit table into a bottleneck under load tests or DDoS-like traffic.
- **Fix:** Use the sidecar as the primary increment authority for allowed requests and asynchronously sync counters to Postgres for persistence/audit, or shard keys by a small time bucket to spread lock contention.

#### A25. Anti-cheat event ingestion performs one INSERT per event
- **Severity:** Medium
- **Confidence:** Medium
- **File / region:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:180–190`
- **Problem:** Non-heartbeat telemetry events are inserted one row at a time with no batching or queue.
- **Failure scenario:** A burst of client telemetry (focus/blur/tab-switch/copy/paste) creates a synchronous DB round-trip per request and can backlog the connection pool.
- **Fix:** Batch insert events (e.g., accept an array of events and use `INSERT ... VALUES ...`) or add a small in-memory queue flushed periodically, similar to the audit-event buffer.

#### A26. Heartbeat endpoint runs worker staleness sweep inline
- **Severity:** Medium
- **Confidence:** Medium
- **File / region:** `src/app/api/v1/judge/heartbeat/route.ts:80`
- **Problem:** Every worker heartbeat awaits `sweepStaleWorkers(now)`, which updates the status of stale workers in the same request handler.
- **Failure scenario:** With many workers heartbeating frequently, the sweep runs repeatedly and serialises updates to `judgeWorkers`. Under a worker churn event, heartbeats pile up behind the sweep and response times spike, causing workers to be marked stale precisely when they are reporting.
- **Fix:** Move the staleness sweep to a single background interval/cron and make the heartbeat path a minimal `UPDATE` of the calling worker.

#### A27. Docker image build blocks a Next.js request worker for up to 600 s
- **Severity:** Medium
- **Confidence:** Medium
- **File / region:** `src/app/api/v1/admin/docker/images/build/route.ts:119`
- **Problem:** The handler awaits `buildDockerImage(...)` synchronously in the request thread with only the underlying build timeout.
- **Failure scenario:** A slow multi-GB language image build occupies a request worker for up to 10 minutes, reducing capacity for other admin requests.
- **Fix:** Move image builds to an asynchronous job queue or background worker and return a build-id/job-status response; alternatively cap the build time lower for the API path.

#### A28. Bulk file delete performs sequential disk I/O
- **Severity:** Medium
- **Confidence:** Medium
- **File / region:** `src/app/api/v1/files/bulk-delete/route.ts:33–39`
- **Problem:** After the DB delete, the handler loops over deleted files and awaits `deleteUploadedFile` sequentially.
- **Failure scenario:** Bulk-deleting the maximum allowed files spends most of the request waiting on serial I/O, holding the connection open.
- **Fix:** Run disk deletions in parallel with `Promise.all` (or a bounded `p-limit`) and return success based on the DB delete.

#### A29. Admin CSV exports load up to 10,000 wide rows into memory
- **Severity:** Medium
- **Confidence:** Medium
- **File / region:** `src/app/api/v1/admin/audit-logs/route.ts:208`; `src/app/api/v1/admin/login-logs/route.ts:95`; `src/app/api/v1/admin/submissions/export/route.ts:94–111`
- **Problem:** CSV export routes load up to 10,000 rows into memory before serialising. Audit logs include the `details` JSONB column; login logs search across multiple coalesced columns with no supporting index.
- **Failure scenario:** Wide `details` payloads or broad date ranges can still produce large memory use and slow query times despite the 10k cap.
- **Fix:** Stream CSV generation row-by-row instead of building the full response in memory. Add a composite index for common log filters (date + resourceType / outcome).

#### A30. Judge system snapshot rebuilds the language catalog on every call
- **Severity:** Medium
- **Confidence:** Medium
- **File / region:** `src/lib/judge/dashboard-data.ts:23–68`
- **Problem:** `getJudgeSystemSnapshot()` queries all enabled language configs and rebuilds the full catalog on every call. This data changes only when an admin edits languages.
- **Failure scenario:** Homepage, public dashboard, and languages-page traffic repeatedly re-query and reconstruct the catalog, wasting DB CPU and increasing response latency.
- **Fix:** Cache the catalog (e.g., React `cache()` for request-level or a short-lived in-memory TTL cache) and invalidate it only when `language_configs` is mutated.

#### A31. Submission polling creates new objects on every update, causing re-renders
- **Severity:** Medium
- **Confidence:** Medium
- **File / region:** `src/hooks/use-submission-polling.ts:195`, `317`
- **Problem:** Every SSE/fetch update calls `setSubmission((prev) => ({ ...normalised, sourceCode: ... }))`, producing a new object reference. Downstream components memoised on `submission` will re-render every poll.
- **Failure scenario:** A complex results page re-renders every 3 s while polling, wasting CPU and causing jank.
- **Fix:** Normalise only changed fields, or use a deep-equality check / stable selector before calling `setSubmission`.

#### A32. Chat-widget provider parses each content block twice
- **Severity:** Low
- **Confidence:** Medium
- **File / region:** `src/lib/plugins/chat-widget/providers.ts:265–266`, `408–409`
- **Problem:** For Claude and Gemini responses, the code calls `safeParse` once to filter tool-use blocks and again to filter text blocks, parsing the same objects twice.
- **Failure scenario:** Long tool-use/tool-result responses add minor CPU overhead on every chat turn.
- **Fix:** Parse once and partition by type.

---

### B. Database / Schema

#### B1. Missing index on `source_drafts.updated_at`
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/lib/db/schema.pg.ts:1083–1093`
- **Problem:** `source_drafts` is pruned by `updatedAt` (`src/lib/data-retention-maintenance.ts:96`), but the table only has a unique index on `(userId, problemId, language)`. Autosaves create one row per user × problem × language, so the table can become very large.
- **Failure scenario:** Daily data-retention pruning issues `DELETE ... WHERE updated_at < $1` with no usable index, performing a full sequential scan and holding a long-running lock.
- **Fix:** Add `index("source_drafts_updated_at_idx").on(table.updatedAt)`.

#### B2. Missing indexes on IP-address columns used by anti-cheat aggregation
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/lib/db/schema.pg.ts:1186–1210` (`antiCheatEvents`) and `381–402` (`examSessions`)
- **Problem:** Both tables store `ip_address`/`ipAddress` text columns but only index `assignmentId`, `userId`, and `eventType`. The IP-overlap report builds a CTE that selects distinct `ip_address`/`user_id` from both tables and then aggregates.
- **Failure scenario:** During a large exam, `anti_cheat_events` can contain hundreds of thousands of heartbeats/events per assignment. Without a selective index on `(assignment_id, ip_address)` the planner must scan the whole table.
- **Fix:** Add composite indexes: `index("ace_assignment_ip_idx").on(table.assignmentId, table.ipAddress)` and `index("exam_sessions_assignment_ip_idx").on(table.assignmentId, table.ipAddress)`. Use partial indexes with `where isNotNull(table.ipAddress)` if supported.

#### B3. Missing indexes on public-listing and auth filter columns
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/lib/db/schema.pg.ts:65–71` (`sessions`), `250–290` (`problems`), `329–378` (`assignments`), `800–816` (`problemSets`), `922–947` (`discussionThreads`)
- **Problem:** Several high-cardinality filter columns lack indexes:
  - `sessions.userId`, `sessions.expires` — used by the auth layer.
  - `problems.visibility` — filtered in almost every public catalog query.
  - `assignments.visibility`, `assignments.examMode` — used by public-contests listing.
  - `problemSets.isPublic`, `problemSets.createdBy` — public listings and ownership checks.
  - `discussionThreads.authorId` — author-scoped discussion queries.
- **Failure scenario:** Public pages that filter `visibility = 'public'` will scan the entire `problems` table. With 50k+ problems, query latency crosses the 100 ms mark and worsens linearly. Session lookups without an index on `userId` also degrade as the session table grows.
- **Fix:** Add targeted indexes such as `problems_visibility_created_idx`, `sessions_user_expires_idx`, `assignments_visibility_exam_mode_idx`, `problem_sets_is_public_created_idx`, `dt_author_idx`.

#### B4. DB pool has a fixed max of 20 connections and no statement timeout
- **Severity:** High
- **Confidence:** High
- **File / region:** `src/lib/db/index.ts:41–54`
- **Problem:** The PostgreSQL pool defaults to `max: 20`, `connectionTimeoutMillis: 10s`, `idleTimeoutMillis: 30s`, with no `statement_timeout` configured.
- **Failure scenario:** Bursty workloads (replay + analytics + leaderboard refreshes + exports) queue for more than 10 seconds and return connection-timeout errors; a single runaway query can hold a connection indefinitely.
- **Fix:** Make pool size and timeouts env-driven, set a reasonable `statement_timeout` on new connections (e.g., 30–60 s), and add pool-saturation alerting via the existing pool-health diagnostics.

---

### C. Rust Judge Worker

#### C1. Blocking synchronous `chown` syscalls in the async submission hot path
- **Severity:** Critical
- **Confidence:** High
- **File / region:** `judge-worker-rs/src/executor.rs:327`, `393`; `judge-worker-rs/src/runner.rs:755`, `785`
- **Problem:** `std::os::unix::fs::chown` is a blocking filesystem syscall executed directly inside async Tokio tasks. Tokio worker threads are pinned until the syscall returns.
- **Failure scenario:** Under concurrent load with `JUDGE_CONCURRENCY=16`, every submission blocks a worker thread twice (workspace + source file). If the underlying filesystem or container-mounted volume is slow, all runtime threads can stall, collapsing throughput and spiking tail latency even though CPU is idle.
- **Fix:** Wrap each `chown` in `tokio::task::spawn_blocking`, or introduce a small async-capable ownership helper that performs the syscall on the blocking pool.

#### C2. Per-stream output buffers default to 128 MiB with no submission-level cap
- **Severity:** Critical
- **Confidence:** High
- **File / region:** `judge-worker-rs/src/docker.rs:420–447` (stdout reader), `449–464` (stderr reader)
- **Problem:** Each container stdout and stderr reader allocates a `Vec` and reads up to `JUDGE_MAX_OUTPUT_BYTES` (default 134,217,728) per stream. A single submission therefore needs up to ~256 MiB just for output buffers, plus the same again for the compile phase.
- **Failure scenario:** With the default cap and `JUDGE_CONCURRENCY=16`, output buffers alone can consume ~8 GiB RAM. A burst of submissions printing near the cap OOM-kills the worker before any container memory limit is reached.
- **Fix:** Apply a single per-submission output budget shared across streams/phases; stream large outputs to a bounded ring buffer or temporary file rather than buffering the full byte stream in RAM.

#### C3. Test cases execute sequentially within each submission
- **Severity:** High
- **Confidence:** High
- **File / region:** `judge-worker-rs/src/executor.rs:564–671`
- **Problem:** Every test case pays the full Docker container create/start/stop/inspect/remove cost in series. The compiled artifact is already read-only, so the run phase is embarrassingly parallel.
- **Failure scenario:** A problem with 20 small test cases takes ~20 × container overhead (often 100–300 ms each) instead of ~1 × overhead with parallel runs; a 1-second solution can take 5–10 seconds of wall time, severely limiting throughput.
- **Fix:** After a successful compile, run test cases concurrently with a per-submission semaphore (e.g., bounded by a fraction of `judge_concurrency`) and aggregate results.

#### C4. No container reuse / warm pool
- **Severity:** High
- **Confidence:** High
- **File / region:** `judge-worker-rs/src/docker.rs:314–541` (`run_docker_once`)
- **Problem:** A brand-new `docker run` is spawned for every compile and every test-case run. Container creation, image layer setup, and cgroup provisioning dominate latency for short-lived submissions.
- **Failure scenario:** “Hello world” Python submissions spend far more time in Docker overhead than in user code; fleet throughput is bounded by Docker daemon create/rm rate rather than by CPU.
- **Fix:** Maintain a small warm pool of paused containers per language image. Reset filesystem state (e.g., re-mount a fresh workspace tmpfs) between uses. This is a large security-sensitive change and must be validated end-to-end before production.

#### C5. `compare_float_output` allocates strings and token vectors for entire outputs
- **Severity:** High
- **Confidence:** High
- **File / region:** `judge-worker-rs/src/comparator.rs:107–121`
- **Problem:** The function converts both `expected` and `actual` byte slices to `String` via `String::from_utf8_lossy`, then collects all whitespace-separated tokens into two `Vec<&str>` on every call.
- **Failure scenario:** A problem with a multi-MB float output triggers repeated large allocations and UTF-8 scans per test case, consuming CPU and heap that could be avoided with byte-level tokenisation.
- **Fix:** Tokenise byte slices in place without converting to `String`; compare tokens by parsing `f64` directly from byte windows.

#### C6. Compilation stdout/runtime stderr copied into owned `String` unnecessarily
- **Severity:** Medium
- **Confidence:** High
- **File / region:** `judge-worker-rs/src/executor.rs:493`; `judge-worker-rs/src/docker.rs:462`; `judge-worker-rs/src/executor.rs:643`
- **Problem:** Binary or large outputs are lossily converted and copied into owned strings even when only a small diagnostic snippet is ultimately reported.
- **Failure scenario:** A submission that emits a 10 MiB compile warning or runtime stderr causes a full copy and UTF-8 replacement scan, increasing memory pressure.
- **Fix:** Keep outputs as `Vec<u8>` until the final reporting step; truncate to the report limit first, then lossily convert only the retained prefix.

#### C7. Environment variables read repeatedly on hot paths
- **Severity:** Medium
- **Confidence:** High
- **File / region:** `judge-worker-rs/src/docker.rs:84–89`; `judge-worker-rs/src/executor.rs:28–56`; `judge-worker-rs/src/validation.rs:68–82`
- **Problem:** `std::env::var` is invoked on every Docker run, compile, and image validation, re-parsing and allocating each time.
- **Failure scenario:** At high submission rates, repeated env lookups and string parsing add minor but measurable CPU overhead and prevent the compiler from hoisting values.
- **Fix:** Read these values once during `Config::from_env` and store them in `Config` or a lazily initialised static.

#### C8. Prewarm loop runs image pulls sequentially
- **Severity:** Medium
- **Confidence:** High
- **File / region:** `judge-worker-rs/src/main.rs:274–319`
- **Problem:** Startup prewarming iterates `for image in images` and runs `docker run --rm` one image at a time, each with a 10-second timeout.
- **Failure scenario:** With the default six-image list and slow disk, prewarm can take tens of seconds before the worker is warm, even though the images are independent.
- **Fix:** Drive prewarming with a `FuturesUnordered` or `tokio::task::JoinSet` capped at a small concurrency (e.g., 2–3) to bound Docker daemon load.

#### C9. `report_with_retry` re-serialises large payloads on every retry
- **Severity:** Medium
- **Confidence:** Medium
- **File / region:** `judge-worker-rs/src/executor.rs:1016–1111`
- **Problem:** On each of the three report attempts, `ApiClient::report_result` re-serialises the `results` slice to JSON.
- **Failure scenario:** A partial-scoring submission with hundreds of test cases produces a large JSON body; network blips cause the body to be re-serialised repeatedly, wasting CPU and memory.
- **Fix:** Serialise the report body once and reuse the bytes/`reqwest::Body` across retries.

#### C10. `compare_output` normalises both outputs into new heap buffers
- **Severity:** Medium
- **Confidence:** High
- **File / region:** `judge-worker-rs/src/comparator.rs:70–72`, `79–100`
- **Problem:** `normalize_exact_output` allocates a new `Vec<u8>` with the full input capacity for both `expected` and `actual`, then copies into a third result slice.
- **Failure scenario:** Large outputs cause 2× allocation + copy per test case. For exact-match mode, a streaming line-by-line comparison would avoid most of this.
- **Fix:** Implement a streaming comparator that walks both byte slices in lockstep, or reuse a scratch buffer allocated per submission.

#### C11. `reportable_test_case_output` converts full stdout even when truncated
- **Severity:** Medium
- **Confidence:** High
- **File / region:** `judge-worker-rs/src/executor.rs:92–104`
- **Problem:** For non-runtime-error verdicts, the entire stdout byte slice is converted via `String::from_utf8_lossy` before truncation to `REPORT_DIAGNOSTIC_OUTPUT_LIMIT_BYTES`.
- **Failure scenario:** A 128 MiB stdout payload is fully scanned and copied just to report a 16 KiB snippet.
- **Fix:** Truncate the byte slice to the report limit plus one character before performing lossy conversion.

#### C12. `active_tasks` counter uses `Relaxed` ordering
- **Severity:** Low
- **Confidence:** Medium
- **File / region:** `judge-worker-rs/src/main.rs:231`, `374`, `592`, `625`
- **Problem:** The counter is incremented/decremented with `Ordering::Relaxed`, so heartbeats may observe stale values on weakly-ordered architectures.
- **Failure scenario:** A heartbeat sent just after a task finishes may over-report active tasks, causing the app server to under-load the worker.
- **Fix:** Use `AcqRel`/`Release` for updates and `Acquire` for reads, or `SeqCst` if cross-task ordering must be strict.

#### C13. CPU model detection blocks the async runtime at startup
- **Severity:** Low
- **Confidence:** High
- **File / region:** `judge-worker-rs/src/main.rs:81–158`
- **Problem:** Synchronous file reads and `lscpu`/`sysctl` subprocess invocations run on the main Tokio thread before the runtime is fully utilised.
- **Failure scenario:** Adds a small, fixed startup delay; negligible after startup.
- **Fix:** Move detection into `spawn_blocking` or cache it across restarts.

#### C14. Runner and judge concurrency are independently limited
- **Severity:** Low
- **Confidence:** High
- **File / region:** `judge-worker-rs/src/main.rs:459`; `judge-worker-rs/src/runner.rs:31–38`
- **Problem:** The HTTP runner and the main judge loop each have their own semaphore, so runner load can starve judge containers for CPU, disk, or Docker daemon capacity.
- **Failure scenario:** Heavy use of `/docker/build` or `/run` endpoints delays judging for unrelated submissions.
- **Fix:** Optionally share a global resource budget or rate-limit runner Docker operations.

---

### D. Docker / Deployment / Infrastructure

#### D1. Production Docker Compose declares no service resource limits
- **Severity:** Critical
- **Confidence:** High
- **File / region:** `docker-compose.production.yml:17–194`
- **Problem:** None of the six services (`db`, `docker-proxy`, `app`, `judge-worker`, `code-similarity`, `rate-limiter`) set `mem_limit`, `cpus`, `ulimits`, or `deploy.resources`.
- **Failure scenario:** A runaway build step, a memory-leaking app container, a Postgres vacuum, or a burst of judge sandboxes can consume all host CPU/RAM and trigger OOM kills or total host unresponsiveness.
- **Fix:** Add `mem_limit`, `cpus`, and `ulimits` to every service. Size the worker using `JUDGE_MAX_OUTPUT_BYTES × 2 × JUDGE_CONCURRENCY` plus container overhead; size the DB according to existing `PG_SHARED_BUFFERS` / `PG_EFFECTIVE_CACHE_SIZE` env tuning.

#### D2. Dedicated worker compose has no resource caps with default concurrency of 4
- **Severity:** Critical
- **Confidence:** High
- **File / region:** `docker-compose.worker.yml:48–93`
- **Problem:** The worker defaults to `JUDGE_CONCURRENCY=4` and `RUNNER_CONCURRENCY=4` with no `mem_limit` or `cpus`. Each sandbox can use up to 2 GB of memory; worst-case output buffering is ~128 MiB × 2 × concurrency.
- **Failure scenario:** On a 4–8 GB worker host, default concurrency exhausts RAM during a judging burst, the worker container is OOM-killed, and the central app loses all connected workers.
- **Fix:** Add `mem_limit`/`cpus` to the worker service and document minimum host sizing. Derive default concurrency from detected host memory when no value is supplied.

#### D3. Deploy script forces `--no-cache` builds for app and worker images
- **Severity:** High
- **Confidence:** High
- **File / region:** `deploy-docker.sh` (~945, 951, 1409)
- **Problem:** The app and judge-worker images are built with `docker build --no-cache`. This invalidates every layer, forcing rebuild of `npm ci`, native module compilation, and `cargo build --release` on every deploy.
- **Failure scenario:** A minor source-only hotfix triggers a 5–15 minute full rebuild instead of a 30-second layer reuse, slowing incident response and increasing the window where the old image is still running.
- **Fix:** Remove `--no-cache` for routine deploys. Add an optional `DEPLOY_NO_CACHE=1` escape hatch for the rare case where layer cache is suspected to be corrupt. The existing BuildKit history corruption auto-recovery already handles the known bad-cache case.

#### D4. Judge worker Dockerfile runs `cargo clean`, defeating layer caching
- **Severity:** High
- **Confidence:** High
- **File / region:** `Dockerfile.judge-worker:17`
- **Problem:** `RUN cargo clean && cargo build --release` removes previously compiled artifacts before every build. Even a one-line source change forces a full Rust rebuild.
- **Failure scenario:** Worker image rebuilds on every deploy take several minutes, and the `WORKER_HOSTS` step in `deploy-docker.sh` becomes a deploy bottleneck.
- **Fix:** Drop `cargo clean` from the Dockerfile and rely on Docker layer caching. If cross-arch stale-binary concerns remain, gate the Dockerfile with `ARG FORCE_CLEAN_BUILD` and pass `--build-arg FORCE_CLEAN_BUILD=1` only when needed.

#### D5. Root Dockerfile uses `COPY . .` before build, invalidating dependency cache
- **Severity:** High
- **Confidence:** High
- **File / region:** `Dockerfile:30`
- **Problem:** After restoring `node_modules` from the `deps` stage, the Dockerfile copies the entire source tree before `npm run build`. Any change to any source file invalidates the build layer.
- **Failure scenario:** A README or translation change causes `npm run build` to rerun from scratch instead of reusing the Next.js build cache.
- **Fix:** Copy only files needed for the build first (`next.config.ts`, `tsconfig.json`, `src/`, `public/`, `messages/`, `drizzle/`), then run `npm run build`. Keep the full `COPY . .` only if required for a final validation step.

#### D6. No BuildKit cache mounts used for dependency installation
- **Severity:** High
- **Confidence:** High
- **File / region:** `Dockerfile`, `Dockerfile.judge-worker`, `Dockerfile.code-similarity`, `Dockerfile.rate-limiter-rs`, and several language Dockerfiles (e.g., `docker/Dockerfile.judge-node:3`)
- **Problem:** `npm ci`, `cargo build`, and `apk add` run without `RUN --mount=type=cache`. Dependency downloads and compiler object files are not persisted across builds.
- **Failure scenario:** Rebuilding the app image re-downloads all npm packages and recompiles native modules; rebuilding Rust images re-downloads crates and rebuilds all `.rlib` files.
- **Fix:** Use BuildKit cache mounts. Example: `RUN --mount=type=cache,target=/root/.npm npm ci` and `RUN --mount=type=cache,target=/usr/local/cargo/registry --mount=type=cache,target=/build/target cargo build --release`.

#### D7. No container log rotation configured in compose files
- **Severity:** High
- **Confidence:** High
- **File / region:** `docker-compose.production.yml`, `docker-compose.worker.yml`, `docker-compose.test-backends.yml`, `static-site/docker-compose.yml`
- **Problem:** None of the compose files set `logging.driver` or `logging.options`. Docker's default `json-file` driver grows without bound unless the daemon is reconfigured.
- **Failure scenario:** A chatty worker or a stuck restart loop fills `/var/lib/docker/containers` and exhausts disk, causing Docker to become unresponsive and breaking new deploys.
- **Fix:** Add a default logging block to every service:
  ```yaml
  logging:
    driver: json-file
    options:
      max-size: 50m
      max-file: 5
  ```

#### D8. Generated nginx config lacks upstream keepalive, proxy timeouts, and compression
- **Severity:** High
- **Confidence:** High
- **File / region:** `deploy-docker.sh` (generated config, ~1470–1635); `scripts/online-judge.nginx.conf`
- **Problem:** The generated HTTPS and HTTP nginx configs set `proxy_pass` to `127.0.0.1:3100` but omit `proxy_connect_timeout`, `proxy_send_timeout`, `proxy_read_timeout`, buffer sizes, `keepalive` connections, and gzip for upstream responses.
- **Failure scenario:** A stalled Next.js request holds nginx workers open indefinitely. Every request creates a fresh TCP connection to the app, increasing latency under load, and large HTML/JSON responses travel uncompressed.
- **Fix:** Add an upstream block with keepalive, set explicit timeouts (e.g., 30 s connect / 60 s read), enable `gzip` for `text/html application/json`, and tune proxy buffers.

#### D9. `docker-proxy` service has no healthcheck
- **Severity:** High
- **Confidence:** High
- **File / region:** `docker-compose.production.yml:64–86`
- **Problem:** The `tecnativa/docker-socket-proxy` container is the only path between the worker and the Docker daemon, but it has no `healthcheck`. The worker depends on it with `condition: service_started`, which only waits for container start, not readiness.
- **Failure scenario:** The proxy starts but fails to bind or connect to `/var/run/docker.sock`. The worker immediately tries to spawn sandboxes, every `docker run` fails with 403/connection errors, and submissions are recorded as `compile_error`.
- **Fix:** Add a healthcheck that queries a proxy endpoint or verifies socket connectivity, and change the worker `depends_on` to `condition: service_healthy`.

#### D10. Several base images use unpinned or rolling tags
- **Severity:** High
- **Confidence:** High
- **File / region:** `docker/Dockerfile.judge-deno:1` (`denoland/deno:alpine`), `docker/Dockerfile.judge-bun:1` (`oven/bun:alpine`), `static-site/Dockerfile:1` (`nginx:alpine`), `docker-compose.test-backends.yml:60` (`tecnativa/docker-socket-proxy:latest`)
- **Problem:** Rolling tags can pull a newer base image on rebuild, changing compiler versions, runtime behaviour, or image size without code review.
- **Failure scenario:** A routine deploy pulls a newer `denoland/deno:alpine` that changes the standard library API or a newer `nginx:alpine` with a different default module set, breaking the judge or the static site.
- **Fix:** Pin to digest or to a specific semantic version tag (e.g., `denoland/deno:2.3.1`, `nginx:1.27.4-alpine`, `tecnativa/docker-socket-proxy@sha256:...`).

#### D11. App and worker images copy the entire `docker/` directory
- **Severity:** Medium
- **Confidence:** High
- **File / region:** `Dockerfile:73`; `Dockerfile.judge-worker:35`
- **Problem:** The runtime only needs `docker/seccomp-profile.json`, but both Dockerfiles copy the whole `docker/` tree.
- **Failure scenario:** Image layer invalidation on any Dockerfile or interpreter change, and unnecessary files present in the production app/worker images.
- **Fix:** Copy only the required file: `COPY --from=builder /app/docker/seccomp-profile.json ./docker/seccomp-profile.json`.

#### D12. Static-site cache headers are short for immutable assets
- **Severity:** Medium
- **Confidence:** High
- **File / region:** `static-site/nginx.conf:21–23`
- **Problem:** Static assets are served with `expires 7d` and `Cache-Control: public, immutable`. For files that are fingerprinted or versioned at deploy time, 7 days is conservative.
- **Failure scenario:** Repeat visitors re-download CSS/JS/fonts every week, increasing bandwidth and latency.
- **Fix:** Increase to `expires 1y` for fingerprinted assets; keep a short TTL only for `index.html` and non-fingerprinted entry points.

#### D13. `code-similarity-rs.service` lacks systemd resource limits
- **Severity:** Medium
- **Confidence:** High
- **File / region:** `scripts/code-similarity-rs.service`
- **Problem:** The systemd unit has no `MemoryMax`, `CPUQuota`, or `TasksMax`, unlike `online-judge.service` and `online-judge-worker-rs.service`.
- **Failure scenario:** A pathological similarity input can exhaust host memory.
- **Fix:** Add `MemoryMax=2G`, `CPUQuota=200%`, and `TasksMax=512` to match the other production services.

#### D14. PostgreSQL version mismatch between production and test-backends
- **Severity:** Medium
- **Confidence:** High
- **File / region:** `docker-compose.production.yml:18` (`postgres:18-alpine`) vs `docker-compose.test-backends.yml:21` (`postgres:17-alpine`)
- **Problem:** Production and the multi-backend test stack run different major PostgreSQL versions, so query plans, supported features, and behaviour may diverge.
- **Failure scenario:** A query or migration passes locally on PG 17 but fails or performs differently on production PG 18.
- **Fix:** Align both compose files on the same pinned major/minor image (preferably the production version).

#### D15. `deploy-worker.sh` transfers images via `docker save | gzip | ssh`
- **Severity:** Medium
- **Confidence:** Medium
- **File / region:** `scripts/deploy-worker.sh:89`
- **Problem:** The worker image is serialised, compressed, and piped over SSH. For a multi-hundred-megabyte Rust + Docker CLI image this is slow and sensitive to connection flakiness.
- **Failure scenario:** Deploying to a remote worker over a slower link takes minutes and cannot resume if the transfer fails.
- **Fix:** Push images to a registry and `docker pull` on the worker, or use `rsync --partial`/`zstd` for the saved tarball.

#### D16. Static-site nginx lacks worker-process tuning
- **Severity:** Low
- **Confidence:** Medium
- **File / region:** `static-site/nginx.conf:1–31`
- **Problem:** No `worker_processes auto`, `worker_connections`, `multi_accept`, `sendfile`, `tcp_nopush`, or `tcp_nodelay` directives are set.
- **Failure scenario:** Under a traffic spike the static site uses suboptimal connection handling.
- **Fix:** Add `worker_processes auto; events { worker_connections 4096; multi_accept on; }` and enable `sendfile`, `tcp_nopush`, `tcp_nodelay`.

---

### E. Tests

#### E1. No performance/load/benchmark tests anywhere
- **Severity:** Critical
- **Confidence:** High
- **File / region:** Entire `/tmp/judgekit-local/tests/` tree
- **Problem:** There is no automated way to catch regressions in similarity-check runtime, judge claim throughput, leaderboard computation, rate-limit hot path, or file-upload streaming.
- **Failure scenario:** A change to `runAndStoreSimilarityCheck` or `computeLeaderboard` could double latency in production and all tests would still pass.
- **Fix:** Add a `tests/perf/` suite (Vitest or `tinybench`) with pinned baselines for: similarity scan on 500 submissions, leaderboard aggregation, judge claim reclaim under contention, ZIP streaming cap, and rate-limit sidecar vs DB fallback.

#### E2. Integration tests create and migrate a fresh PostgreSQL database per `beforeEach`
- **Severity:** High
- **Confidence:** High
- **File / region:** `tests/integration/support/test-db.ts:38`; `tests/integration/db/user-crud.test.ts:18`; `tests/integration/db/submission-lifecycle.test.ts:33`
- **Problem:** `createTestDb()` runs `CREATE DATABASE`, creates a new pool, connects, and runs the full Drizzle migration folder for **every test**. `user-crud.test.ts` does this 16 times; `submission-lifecycle.test.ts` does it ~20 times.
- **Failure scenario:** CI integration job grows linearly with test count; each `beforeEach` can take hundreds of milliseconds to seconds, making the suite slow and flaky under DB load.
- **Fix:** Use `beforeAll` to create one DB per file and wrap each test in a transaction rolled back in `afterEach` (e.g., `BEGIN`/`ROLLBACK` or savepoints). Reserve per-test DB creation only for tests that truly need it.

#### E3. Heavy Next.js module imports dominate unit-test runtime
- **Severity:** High
- **Confidence:** High
- **File / region:** `vitest.config.ts:20` (30 s timeout comment); observed run output shows `import 30.42s`, `tests 69.89s`
- **Problem:** Importing route handlers/pages pulls in the full Next.js server/app graph. Aggregate import time is on par with total wall time.
- **Failure scenario:** Adding more route tests will super-linearly increase CI time; the 30 s timeout masks but does not fix the root cause.
- **Fix:** Extract pure business logic out of route handlers so unit tests import small modules instead of `src/app/api/v1/.../route.ts`. Use integration tests, not unit tests, for route wiring.

#### E4. E2E suite is forced serial
- **Severity:** Medium
- **Confidence:** High
- **File / region:** `playwright.config.ts:72–73`
- **Problem:** `fullyParallel: false` and `workers: 1` means 42 spec files run one after another even on multi-core CI runners.
- **Failure scenario:** A full local regression run takes many minutes; the remote-safe smoke subset is fine, but the `full` profile is unnecessarily slow.
- **Fix:** Make tests parallel-safe (isolated test users/contests per worker via the `runtimeSuffix` fixture) and raise `workers` to at least `process.env.CI ? 2 : 4`.

#### E5. Unit tests mock the database almost everywhere
- **Severity:** Medium
- **Confidence:** High
- **File / region:** Entire `tests/unit/` tree (~2,569 mock occurrences observed)
- **Problem:** Real query-plan, index, N+1, and locking behaviour is not exercised. For example, `api-rate-limit.test.ts` mocks `db.select`/`insert`/`update` completely, so a missing index on `rate_limits(key)` or a deadlock would not be caught.
- **Failure scenario:** A production performance regression from a missing index or an unbounded `SELECT *` slips through because tests assert only mock call counts.
- **Fix:** Add integration tests for rate-limit, leaderboard, and similarity-check that hit a real PostgreSQL instance with enough rows to expose index usage and query cost.

#### E6. No concurrency/throughput tests for critical hot paths
- **Severity:** High
- **Confidence:** High
- **File / region:** `tests/unit/assignments/access-codes-race-invariant.test.ts`; `tests/unit/assignments/recruiting-invitation-metadata-race.test.ts`
- **Problem:** Race-condition coverage is limited to source-grep assertions (e.g., “contains `FOR UPDATE`”). There is no actual concurrent-load test for claim reclaim, access-code redemption, or rate-limit window creation.
- **Failure scenario:** A refactor that removes row locking passes tests because the tests never actually run two transactions at the same time.
- **Fix:** In the gated integration suite, add `Promise.all`-driven concurrency tests (e.g., 10 parallel `redeemAccessCode` calls, 5 parallel judge claims) and assert correct serialisation/counts.

#### E7. `all-languages-judge.spec.ts` judges many languages sequentially
- **Severity:** Medium
- **Confidence:** High
- **File / region:** `tests/e2e/all-languages-judge.spec.ts`
- **Problem:** It contains solutions for many languages and polls each submission to completion. Because E2E is serial, this file alone can take many minutes when a worker is present.
- **Failure scenario:** A single language image issue blocks the entire E2E suite; there is no way to shard by language.
- **Fix:** Split into `e2e/languages/<lang>.spec.ts` files and use Playwright sharding, or run language coverage as a separate nightly job.

#### E8. Similarity-check route test sleeps 31 s to simulate a timeout
- **Severity:** Medium
- **Confidence:** High
- **File / region:** `tests/unit/api/similarity-check.route.test.ts:133–168`
- **Problem:** The test uses `setTimeout(..., 31_000)` and an `AbortSignal` listener, and overrides per-test timeout to 35 s.
- **Failure scenario:** One slow test adds 31+ seconds to any CI run that executes it; it also cannot be run in watch mode productively.
- **Fix:** Make `runAndStoreSimilarityCheck` accept an injected clock/deadline so the test can assert timeout behaviour without real sleep.

#### E9. `vi.resetModules()` is used 43 times across unit tests
- **Severity:** Medium
- **Confidence:** High
- **File / region:** 43 occurrences across `tests/unit/`
- **Problem:** Repeated module reloading defeats Vitest/V8 module caching and re-parses/re-executes heavy source files.
- **Failure scenario:** Tests that need fresh module state pay a multiplicative parse cost, inflating the 30 s import wall.
- **Fix:** Refactor modules to accept env/config via parameters so tests can mutate inputs without reloading the module. Where reload is unavoidable, group such tests together so the cache invalidation is localised.

#### E10. Component tests run every test in jsdom with a blanket 30 s timeout
- **Severity:** Medium
- **Confidence:** High
- **File / region:** `vitest.config.component.ts:11–19`
- **Problem:** 76 component test files share one jsdom environment with a 30 s timeout. Heavy pages render full page trees.
- **Failure scenario:** A single slow-mount component can push the whole file near the timeout under CPU contention; no per-test timeout differentiation.
- **Fix:** Add `testTimeout` overrides only for tests that compile/run code. Mock heavy server-fetched children in page-level component tests.

#### E11. No test-time regression gates or CI profiling artifacts
- **Severity:** Medium
- **Confidence:** High
- **File / region:** `.github/workflows/` (inferred from configs)
- **Problem:** Vitest outputs `import 30.42s` and `tests 69.89s`, but there is no stored baseline to fail a PR when import duration grows by, say, 20%.
- **Failure scenario:** A new heavy dependency silently increases unit-test CI time.
- **Fix:** Store `vitest --reporter=json` timing in CI artifacts and fail if `import` or `tests` duration exceeds a rolling baseline.

---

### F. UI / React

#### F1. Anti-cheat `localStorage` keys are never garbage-collected
- **Severity:** Medium
- **Confidence:** Medium
- **File / region:** `src/components/exam/anti-cheat-storage.ts:45–111`
- **Problem:** Pending and in-flight event keys are scoped per `assignmentId` but are never expired or cleaned up. `savePendingEvents` removes the key only when the queue is empty.
- **Failure scenario:** A student participating in many exams over time accumulates `judgekit_anticheat_pending_<id>` and `judgekit_anticheat_inflight_<id>` keys, growing `localStorage` without bound and slowing flush loops.
- **Fix:** Add a TTL or max-key-count eviction policy, and prune stale keys on component mount.

---

## Benchmark / Performance Test Gaps

1. **Compiler execution** — no throughput benchmark for local fallback vs Rust runner under concurrent load.
2. **Code similarity** — no benchmark for the TS fallback at `MAX_SUBMISSIONS_FOR_SIMILARITY` (500) or for the Rust sidecar payload serialisation.
3. **Leaderboard / analytics / replay** — no benchmark for `computeContestRanking` cache miss, `computeContestAnalytics(includeTimeline=true)`, or `computeContestReplay` on large contests.
4. **SSE events** — no load test for subscriber fan-out or shared poll timer behaviour.
5. **File upload/download** — no memory/throughput test for large ZIP or image uploads, and no streaming download test.
6. **Data retention** — no test verifying prune batching behaviour or runtime on large tables.
7. **Submission creation / judge claim** — no load test for the per-user advisory lock contention path or worker claim throughput.
8. **Container lifecycle** — no automated measurement of Docker create/start/inspect/remove latency or throughput in the Rust worker.
9. **Rust hot paths** — no `criterion` or `#[bench]` tests for `compare_output`, `compare_float_output`, or container lifecycle.
10. **Deployment/build** — no benchmark tracking image build times with/without cache, or deploy-script runtime.

---

## Final Sweep Notes

- **Coverage:** All files under `src/`, `judge-worker-rs/`, `docker/`, `scripts/`, `tests/`, `static-site/`, and the root config files listed above were inventoried and reviewed either directly or via targeted parallel sub-reviews. No major review-relevant directory was skipped.
- **Commonly missed issues checked:**
  - Unbounded `IN (...)` / `inArray` batches — confirmed in SSE shared polling and problem-set visibility helpers.
  - Missing resource limits — confirmed in both production and worker compose files; also absent in `code-similarity-rs.service`.
  - Blocking syscalls in async runtimes — confirmed `chown` in Rust worker; string concatenation in Node compiler fallback.
  - Repeated env var lookups — confirmed in Rust worker hot paths.
  - Cache misses causing full-table scans — confirmed in leaderboard, analytics, replay, and language-catalog snapshot.
  - Build-cache invalidation — confirmed `--no-cache`, `cargo clean`, `COPY . .`, and lack of BuildKit cache mounts.
  - Test gaps — confirmed no perf/load/concurrency tests, per-test DB provisioning, serial E2E, and heavy mocking.
- **Positive observations:**
  - Output caps exist in both runners; the issue is the cap size and in-memory buffering, not the absence of limits.
  - The Rust worker enforces per-sandbox `--memory`, `--cpus`, `--pids-limit`, and `--ulimit` on spawned judge containers.
  - PostgreSQL in production has explicit memory tuning (`shared_buffers`, `effective_cache_size`, `work_mem`, etc.).
  - Most long-running services declare `healthcheck` blocks, and `deploy-docker.sh` waits for `db` and `app` health before proceeding.
  - `docker-disk-cleanup.sh` is designed to never prune volumes and uses `Nice=10` / `IOSchedulingClass=idle` in its systemd unit.
  - The harness smoke suite is correctly isolated in its own config with serial execution and toolchain gating.

---

## Recommended Priority Order

1. Cap unbounded queues/buffers in the compiler runner, SSE events, and file uploads (A2, A3, A4, A5, A6, C2).
2. Add the missing database indexes (B1, B2, B3) and tune the DB pool/statement timeout (B4).
3. Bound public-list endpoints and push pagination/filtering into SQL (A15, A16, A17, A18, A19, A20).
4. Reduce or stream per-sandbox output buffers in both runners (A3, C2, C11).
5. Make leaderboard/analytics/replay incremental or longer-cached (A9, A10, A11).
6. Move blocking `chown` calls off the Tokio runtime (C1).
7. Add Docker Compose resource constraints and tune nginx (D1, D2, D8, D9).
8. Restore Docker build caching and add BuildKit cache mounts / log rotation (D3, D4, D5, D6, D7).
9. Harden audit buffering and rate-limit hot rows (A22, A24).
10. Move heartbeat sweep and image builds out of the request path (A26, A27).
11. Add a dedicated performance/load-test suite and concurrency tests (E1, E6, E11).
12. Improve integration test efficiency (E2, E3, E4, E9).

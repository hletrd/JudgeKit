# Performance Review — JudgeKit Cycle 3

**Scope:** `/tmp/judgekit-local` (review performed exclusively in this clone; no files under `/Users/hletrd/flash-shared/judgekit` were read or modified).  
**Date:** 2026-07-03  
**Perspective:** performance engineering — CPU/memory, concurrency, database/query efficiency, caching, UI responsiveness, blocking operations, serialization, Docker/judge sandbox overhead, and deployment build performance.

## Summary

This review re-examines the Cycle 2 aggregate and the previous `perf-reviewer.md`, then adds fresh findings from a full sweep of the current code. The highest-impact risks are unchanged and largely unaddressed:

1. **Unbounded queues, buffers, and fan-out** — compiler runner uses an uncapped `p-limit` queue, SSE shared polling keeps an unbounded subscriber map and issues unbounded `IN (...)` queries, file uploads are fully materialised in memory, and similarity checks ship all source code in one JSON body.
2. **Full-table recomputation** — leaderboard, contest replay, analytics, and similarity scans re-aggregate large slices of `submissions` on every cache miss.
3. **Database hot spots** — real-time coordination and rate-limit updates serialize through PostgreSQL locks; several list endpoints use `COUNT(*) OVER()` over large tables; leading-wildcard searches lack trigram indexes.
4. **Blocking I/O inside async runtimes** — Rust workspace cleanup and comparator output copying run synchronously inside Tokio tasks; the Node compiler fallback concatenates stdout/stderr strings.
5. **Missing infrastructure resource guards** — production Docker Compose and the dedicated worker compose declare no `mem_limit`/`cpus`/`ulimits`; generated nginx lacks upstream timeouts/keepalive/compression; Docker build caches are intentionally disabled.
6. **UI/server waterfalls and render jank** — dashboard layouts and public pages run sequential dependent queries; large catalog pages filter in JavaScript after fetching all IDs; `ReactMarkdown` remounts subtrees every render.

## Approach

1. Read `/tmp/judgekit-local/.context/reviews/_aggregate.md` and the existing `/tmp/judgekit-local/.context/reviews/perf-reviewer.md`.
2. Inventoried all performance-relevant files under `src/`, `judge-worker-rs/`, `code-similarity-rs/`, `rate-limiter-rs/`, `drizzle/`, `docker-compose*.yml`, Dockerfiles, nginx configs, and deploy scripts.
3. Ran focused parallel reviews across DB/schema, backend execution, Rust worker/sidecars, UI/real-time, and infra/config.
4. Verified critical line numbers with `grep` and spot-reads.
5. Performed a final sweep for commonly missed performance issues (unbounded `IN (...)`, missing resource limits, blocking syscalls, repeated env lookups, cache misses, build-cache invalidation, test gaps).

## File Inventory Reviewed

- `src/` — 283+ UI/app files, 90+ API routes, 120+ lib modules (DB, compiler, judge, assignments, security, files, audit, discussions, problem-sets, realtime, hooks).
- `judge-worker-rs/src/` — 12 Rust source files + `Cargo.toml`.
- `code-similarity-rs/src/` — 3 Rust source files + `Cargo.toml`.
- `rate-limiter-rs/src/` — 1 Rust source file + `Cargo.toml`.
- `drizzle/` — schema, relations, recent migrations (`0033_*.sql` through `0036_*.sql`).
- `docker-compose*.yml` — 4 files.
- `Dockerfile*`, `deploy-docker.sh`, `deploy.sh`, `deploy-test-backends.sh`, nginx configs.
- `tests/unit/`, `tests/integration/`, `tests/e2e/`, `playwright.config.ts`, `vitest.config*.ts`.

## Validation / Upgrade of Prior Findings

| Prior finding | Current status | Notes |
|---|---|---|
| Real-time coordination serialises SSE/heartbeat via PostgreSQL advisory locks (`realtime-coordination.ts`) | **Still HIGH** | `acquireSharedSseConnectionSlot` still takes the global advisory lock key `"realtime:sse:acquire"`. |
| Code-similarity Rust sidecar ignored caller `AbortSignal` | **Partially fixed / remaining MEDIUM-HIGH** | `code-similarity-client.ts` now threads the caller signal, but the sidecar compute loop still uses a hard-coded 25 s timeout and cannot be cancelled mid-computation. |
| Rate-limiter sidecar used wall-clock time | **Fixed** | Now uses monotonic `Instant`. |
| Compiler local-fallback workspace leaked after `chown` (Node) | **Fixed** | `execute.ts` re-chowns back to the process UID before `rm`. |
| Rust worker temp workspace leaked after `chown` | **Fixed** | `SandboxWorkspace` re-chowns before removal. |
| Rate-limit DB path still uses `SELECT ... FOR UPDATE` hot rows | **Still HIGH** | Every allowed request locks the same `rate_limits` row. |
| `deploy-docker.sh` nginx lacked `client_max_body_size` on catch-all | **Fixed in cycle 2/3** | `client_max_body_size 50M` is now present. |
| Similarity-check concurrent runs could delete each other's events | **Fixed** | Cycle 3 serialised runs with an advisory lock. |
| Docker Compose lacked network segmentation | **Fixed** | Production compose now uses `frontend`/`backend`/`judge`/`db` networks. |

## Findings

### CRITICAL

#### C1. Unbounded JSON body parsing in the shared API handler
- **File / region:** `src/lib/api/handler.ts:232`
- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `createApiHandler` calls `raw = await req.json()` before any body-size guard. Next.js buffers the entire body and parses it before Zod can reject an oversized payload.
- **Failure scenario:** A few concurrent malicious POSTs with multi-megabyte JSON bodies to `/api/v1/submissions`, `/api/v1/admin/migrate/import`, or `/api/v1/contests/[id]/anti-cheat` exhaust the Node.js heap and crash the app container.
- **Fix:** Reject requests whose `Content-Length` exceeds a route-specific cap before calling `req.json()`, or add a global body-size limit in nginx/Next.js middleware. Use streaming parsers for large import routes.

#### C2. Compiler-run `p-limit` queue is unbounded
- **File / region:** `src/lib/compiler/execute.ts:42`
- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `executionLimiter = pLimit(Math.max(cpus().length - 1, 1))` caps *concurrent* Docker containers but places no cap on the number of *queued* requests. Each queued call retains `sourceCode`, `stdin`, buffers, closures, and in-flight HTTP request/response objects.
- **Failure scenario:** A contest with 500+ concurrent compiler-run calls hits the container limit; subsequent requests pile up in the `p-limit` internal queue until the Node process OOMs.
- **Fix:** Add a bounded queue with explicit `maxQueueSize` and reject with `503` when exceeded, or switch to a semaphore that throws immediately when no slot is available.

#### C3. Compiler-run output accumulated as strings up to 128 MiB per stream
- **File / region:** `src/lib/compiler/execute.ts:27`, `:571–578`, `:612–613`
- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `MAX_OUTPUT_BYTES = 134_217_728` per stream. The local fallback uses `stdout += chunk.toString("utf8", 0, remaining)` on every chunk, creating intermediate string copies and garbage.
- **Failure scenario:** A pathological program emits 100 MiB/s; the fallback keeps appending strings, causing long GC pauses and possible OOM before truncation.
- **Fix:** Accumulate output in a `Buffer[]` and stringify once at the end, or use a fixed-size buffer/drop policy. Lower the per-container cap or make it configurable.

#### C4. File uploads load the entire payload into memory
- **File / region:** `src/app/api/v1/files/route.ts:41`
- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `const rawBuffer = Buffer.from(await file.arrayBuffer())` holds the complete uploaded file in heap. ZIP validation is also performed on the in-memory buffer.
- **Failure scenario:** A 100 MiB ZIP upload is decompressed to inspect total size; the buffer plus decompression working set can OOM the request worker, especially under concurrent uploads.
- **Fix:** Stream uploads to temporary disk and validate ZIP size via streaming entry iteration (e.g., `yauzl`/`unzipper`). Keep only metadata in memory.

#### C5. SSE shared poll and connection tracking are unbounded
- **File / region:** `src/app/api/v1/submissions/[id]/events/route.ts:27`, `:48–73`, `:127–133`, `:159–220`
- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `connectionInfoMap` and `submissionSubscribers` grow without a hard per-submission cap. `sharedPollTick` issues `inArray(submissions.id, submissionIds)` with no upper bound on the ID list. Eviction only runs when a new connection is added.
- **Failure scenario:** During a large contest, thousands of students open results for a few popular problems. Each SSE tick fans out to all subscribers and issues a multi-thousand-element `IN (...)` query, spiking DB CPU and event-loop latency.
- **Fix:** Cap subscribers per submission ID and total active connection IDs; truncate `inArray` batch size and paginate the poll query; run periodic eviction independent of new connections.

#### C6. Rust judge worker buffers up to 128 MiB per stdout/stderr stream
- **File / region:** `judge-worker-rs/src/docker.rs:420–464`; `judge-worker-rs/src/executor.rs:581`, `643`
- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** Each container stdout/stderr reader allocates a `Vec` and reads up to `JUDGE_MAX_OUTPUT_BYTES` (default 134,217,728) per stream. A single submission can therefore need ~256 MiB just for output buffers, plus the same again for the compile phase.
- **Failure scenario:** With `JUDGE_CONCURRENCY=16`, output buffers alone can consume ~8 GiB RAM. A burst of submissions printing near the cap OOM-kills the worker before any container memory limit is reached.
- **Fix:** Apply a single per-submission output budget shared across streams/phases; stream large outputs to a bounded ring buffer or temporary file rather than buffering the full byte stream in RAM.

#### C7. Production and worker compose files declare no resource limits
- **File / region:** `docker-compose.production.yml:13–232`; `docker-compose.worker.yml:18–96`
- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** None of the services set `mem_limit`, `cpus`, `ulimits`, or `deploy.resources`. The worker defaults to `JUDGE_CONCURRENCY=4`/`RUNNER_CONCURRENCY=4` with no ceiling.
- **Failure scenario:** A runaway judge sandbox, Postgres autovacuum, or memory-leaking app container can consume all host CPU/RAM. The worker container is OOM-killed, and the central app loses all connected workers during a contest.
- **Fix:** Add `mem_limit`, `cpus`, `ulimits.nofile`, and `ulimits.nproc` to every service. Size the worker with `JUDGE_MAX_OUTPUT_BYTES × 2 × JUDGE_CONCURRENCY + per-sandbox overhead`.

#### C8. Deploy script intentionally disables build caching and serialises language builds
- **File / region:** `deploy-docker.sh:1009`, `:1015`, `:1057–1069`, `:1475`
- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** App/worker images are built with `--no-cache`; the default `LANGUAGE_BUILD_STRATEGY=sequential` rebuilds ~90 language images one at a time.
- **Failure scenario:** A one-line hotfix triggers a 5–15 minute full rebuild instead of a 30-second layer reuse, and language-image rebuilds add tens of minutes to every deploy.
- **Fix:** Remove `--no-cache` for routine deploys (keep `DEPLOY_NO_CACHE=1` escape hatch); make the `compose` strategy the default; add BuildKit cache mounts for `/root/.npm`, `/usr/local/cargo/registry`, and target dirs.

#### C9. Judge worker Dockerfile runs `cargo clean` before every build
- **File / region:** `Dockerfile.judge-worker:17`
- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `RUN cargo clean && cargo build --release` removes previously compiled artifacts before every build.
- **Failure scenario:** Worker image rebuilds recompile all Rust crates from scratch on every deploy, making the `WORKER_HOSTS` step a major bottleneck.
- **Fix:** Remove `cargo clean`. Add an optional `ARG FORCE_CLEAN_BUILD` for explicit cross-arch stale-binary busting only.

### HIGH

#### H1. Global advisory lock serialises every SSE connection acquisition
- **File / region:** `src/lib/realtime/realtime-coordination.ts:101` (`acquireSharedSseConnectionSlot`), `:163` (`shouldRecordSharedHeartbeat`)
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** A single advisory lock key `"realtime:sse:acquire"` is used for all SSE connection openings across the deployment.
- **Failure scenario:** At contest start, hundreds of students open results simultaneously; the advisory lock forces serialised DB transactions, creating a bottleneck and slow connection establishment.
- **Fix:** Replace advisory-lock coordination with lightweight TTL-based upserts (`INSERT … ON CONFLICT DO UPDATE`) plus a periodic cleanup job.

#### H2. Rate-limit updates serialise on a single hot row per key
- **File / region:** `src/lib/security/rate-limit-core.ts:43`; `src/lib/security/api-rate-limit.ts:76–129`, `:243–278`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** All requests sharing a rate-limit key contend for the same `rate_limits` row via `SELECT … FOR UPDATE`.
- **Failure scenario:** A popular endpoint (compiler run, contest join) creates a hot row under load; each request contends for the same DB row, serialising throughput.
- **Fix:** Replace the read-modify-write transaction with a single atomic upsert (`INSERT … ON CONFLICT (key) DO UPDATE SET attempts = …`), or move token-bucket state to Redis with Postgres persistence for audit only.

#### H3. Unbounded `COUNT(*) OVER()` forces full-table scans before pagination
- **File / region:** `src/app/api/v1/submissions/route.ts:165`; `src/app/api/v1/files/route.ts:200`; `src/app/api/v1/users/route.ts:42`; `src/app/api/v1/admin/chat-logs/route.ts:108`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** Each paged request computes the total over the entire filtered result set in a window function.
- **Failure scenario:** As `submissions`, `files`, `users`, and `chat_messages` grow, list endpoints degrade to full scans and high memory use regardless of the small `limit`.
- **Fix:** Replace `count(*) over()` with a separate `SELECT COUNT(*)` query (already done correctly in `/admin/audit-logs` and `/admin/login-logs`). Cache popular totals where consistency allows.

#### H4. Admin chat transcript endpoint loads an entire session without a row limit
- **File / region:** `src/app/api/v1/admin/chat-logs/route.ts:30–36`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `db.query.chatMessages.findMany({ where: eq(sessionId, …) })` has no `limit`.
- **Failure scenario:** A long-lived support session can return hundreds of thousands of rows, exhausting server memory and crashing the Node process.
- **Fix:** Add `limit`/`offset` pagination or a streaming cursor; add a `rateLimit` key.

#### H5. Leading-wildcard `LIKE`/`ILIKE` searches cannot use B-tree indexes
- **File / region:** `src/app/api/v1/files/route.ts:180`; `src/app/api/v1/admin/audit-logs/route.ts:146–158`; `src/app/api/v1/admin/login-logs/route.ts:42–51`; `src/app/api/v1/admin/submissions/export/route.ts:61–62`; `src/app/api/v1/tags/route.ts:18`; `src/app/api/v1/contests/[assignmentId]/invite/route.ts:48–49`; `src/lib/problem-sets/public.ts:74–75`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `%term%` searches perform full sequential scans over `audit_events`, `login_events`, `files`, etc.
- **Failure scenario:** Log tables grow to millions of rows; `%term%` searches take seconds and cause I/O spikes.
- **Fix:** Add PostgreSQL trigram GIN indexes (`gin_trgm_ops`) on searched text columns, or migrate high-volume search to `tsvector` full-text search.

#### H6. `/judge/claim` fetches every test case including hidden/large ones
- **File / region:** `src/app/api/v1/judge/claim/route.ts:319–329`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** The claim query selects `input`, `expectedOutput`, `isVisible`, `sortOrder` for all test cases of a problem with no limit.
- **Failure scenario:** A problem with 200 test cases, each with 1 MiB of I/O, causes the claim response to serialise ~200 MiB of hidden test data and blocks the worker until received.
- **Fix:** Paginate or stream test cases, or have the worker fetch test cases separately in chunks. Cap the number of cases returned per claim and document the limit.

#### H7. `/judge/poll` replaces submission results in a single unbounded batch
- **File / region:** `src/app/api/v1/judge/poll/route.ts:104–109`, `:175–179`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** For every judged submission, the route deletes existing `submissionResults` and inserts all new rows in one `values(rows)` call.
- **Failure scenario:** A problem with 1,000 test cases returns 1,000 result rows; the insert binds thousands of parameters, causing the query to fail or consume excessive DB resources.
- **Fix:** Batch inserts in chunks (e.g., 500 rows) and process deletes/inserts inside the transaction.

#### H8. Leaderboard cache miss materialises all terminal submissions in JavaScript
- **File / region:** `src/lib/assignments/contest-scoring.ts:197–494`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `_computeContestRankingInner` issues a CTE that returns every terminal submission for the assignment, then builds maps, sorts, and ranks in JavaScript.
- **Failure scenario:** A 1,000-participant contest with 10 problems and ~5 submissions each produces 50,000 rows; the JS grouping and sorting step blocks the event loop.
- **Fix:** Push ranking computation into SQL where possible, or compute incrementally. The miss path needs back-pressure or background-only computation.

#### H9. Contest analytics recomputes expensive ranking and additional heavy aggregates
- **File / region:** `src/lib/assignments/contest-analytics.ts:93–364`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `computeContestAnalytics` calls `computeContestRanking` (full leaderboard), then runs several more raw queries. With `includeTimeline=true`, it builds per-user progression maps in JS.
- **Failure scenario:** An instructor refreshes analytics during a 500-participant contest; the first request computes the leaderboard, first-AC map, solve timelines, and student progressions, blocking a DB connection and event loop for seconds.
- **Fix:** Pre-aggregate or materialise analytics in the DB, or compute heavy timelines asynchronously and cache for minutes.

#### H10. Contest replay recomputes ranking up to 40 times per request
- **File / region:** `src/lib/assignments/contest-replay.ts:38–95`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `computeContestReplay` samples up to 40 replay cutoffs and invokes `computeContestRanking` for each one, throttled only by `pLimit(2)`.
- **Failure scenario:** A large contest triggers 40+ sequential heavy ranking queries, monopolising pool connections and causing 504s or pool exhaustion.
- **Fix:** Cache snapshot rankings, precompute them in the background, or compute all cutoffs in a single set-based SQL query.

#### H11. Code-similarity SQL loads every best submission before the cap is enforced
- **File / region:** `src/lib/assignments/code-similarity.ts:330–339`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `runSimilarityCheck` fetches the best submission per `(user, problem, language)` for the whole assignment via a raw CTE with no `LIMIT`. The `MAX_SUBMISSIONS_FOR_SIMILARITY = 500` guard is applied only after rows are materialised in memory.
- **Failure scenario:** A large contest with tens of thousands of source-code rows causes the app process to allocate a huge array before the sidecar or fallback guard can run, leading to OOM.
- **Fix:** Apply the cap in SQL (wrap the CTE in `SELECT ... LIMIT $1`) or sample in the database. Move the row-count guard before the fetch when the sidecar is unavailable.

#### H12. Similarity sidecar uploads all source code in one JSON body
- **File / region:** `src/lib/assignments/code-similarity-client.ts:45–52`, `:69–73`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `computeSimilarityRust` sends up to 500 source codes (64 KiB each = 32 MiB) as a single JSON POST body with a 25 s timeout.
- **Failure scenario:** Network serialisation of a 32 MiB JSON payload blocks the event loop and can exceed the 25 s sidecar timeout even when the Rust computation is fast.
- **Fix:** Stream the request body, compress it, or cap the per-request payload size and paginate the similarity job.

#### H13. Public contests listing is unbounded and eagerly loads every problem
- **File / region:** `src/lib/assignments/public-contests.ts:33–64`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `getPublicContests()` calls `db.query.assignments.findMany` with no `limit` and eager-loads `assignmentProblems.problem` just to count public/private problems in JS.
- **Failure scenario:** As the public contest catalog grows, each request loads every public contest row and every associated problem. Network transfer and JS object allocation grow linearly.
- **Fix:** Add pagination; push the public-problem count into SQL with a subquery/lateral join.

#### H14. Problem-set visibility helpers load all visible IDs into memory
- **File / region:** `src/lib/problem-sets/visibility.ts:162–188`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `countVisibleProblemSetsForUser()` selects every visible problem-set ID into an array; `listVisibleProblemSetsForUser()` passes that array to `inArray(problemSets.id, visibleIds)`.
- **Failure scenario:** A staff member with access to many groups can have tens of thousands of visible IDs. Large `IN` lists degrade query plans and serialise huge ID lists.
- **Fix:** Rewrite as a single SQL statement using `EXISTS` or joins against visibility rules instead of materialising IDs.

#### H15. `listPublicProblemSetTags()` loads every public problem set and all nested tags
- **File / region:** `src/lib/problem-sets/public.ts:143–165`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** Queries every public problem set with no `limit`, eager-loading `problems.problemTags.tag`, then deduplicates tags in JavaScript.
- **Failure scenario:** The query returns a large cartesian product of sets × problems × tags; serialisation and DB time grow linearly.
- **Fix:** Compute the tag list directly from `tags` joined through `problemTags` and `problemSets` with `DISTINCT`/`GROUP BY`, or cap the result.

#### H16. Discussion thread view loads all posts without limit
- **File / region:** `src/lib/discussions/data.ts:270–298`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `getDiscussionThreadById()` eagerly loads `posts` for a thread with no `LIMIT`.
- **Failure scenario:** A popular editorial thread with thousands of posts loads the entire thread into memory and returns a huge JSON response.
- **Fix:** Paginate posts in the thread query and add a per-page limit.

#### H17. Code-snapshot list returns full source code for up to 200 rows per page
- **File / region:** `src/app/api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts:20–23`, `:41–47`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** The paginated endpoint allows up to 200 rows per page and selects `sourceCode: codeSnapshots.sourceCode` for every row.
- **Failure scenario:** A single page can return hundreds of megabytes of source code, stalling JSON serialisation, response transfer, and the DB.
- **Fix:** Lower page size for source-code-heavy endpoints, or offer a summary endpoint without `sourceCode` and a separate detail fetch. Add rate limiting.

#### H18. File download reads the entire stored file into a Buffer
- **File / region:** `src/app/api/v1/files/[id]/route.ts:100–102`, `:123`; `src/lib/files/storage.ts` (`readFile`)
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** The GET handler reads the whole uploaded file into memory with `buffer = await readUploadedFile(file.storedName)` and returns the full buffer.
- **Failure scenario:** Concurrent downloads of large test-case attachments or PDFs can exhaust the Node.js heap and crash the app.
- **Fix:** Add a streaming read API in `storage.ts` and pipe the stream to the `NextResponse`.

#### H19. Missing indexes on frequently filtered columns
- **File / region:** `src/lib/db/schema.pg.ts` (`problems.authorId`, `files.originalName`, `recruitingInvitations.candidateName`/`candidateEmail`, `problemSets.name`/`description`, `users.name`, `loginEvents.attemptedIdentifier`/`ipAddress`, `antiCheatEvents.ipAddress`, `sessions.userId`/`expires`, `problems.visibility`, `assignments.visibility`/`examMode`, `problemSets.isPublic`/`createdBy`, `discussionThreads.authorId`)
- **Severity:** HIGH
- **Confidence:** High (inferred from query patterns; verify with `EXPLAIN ANALYZE`)
- **Status:** Confirmed
- **Problem:** High-cardinality filter/JOIN columns and text search columns lack supporting indexes.
- **Failure scenario:** As tables grow, public listings and log searches degrade to sequential scans, increasing latency and lock contention.
- **Fix:** Add targeted B-tree indexes on foreign-key/filter columns and trigram GIN indexes on searched text columns.

#### H20. DB pool has a fixed max of 20 connections and no statement timeout
- **File / region:** `src/lib/db/index.ts:41–54`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `max: 20`, `connectionTimeoutMillis: 10s`, `idleTimeoutMillis: 30s`, no `statement_timeout`.
- **Failure scenario:** Bursty workloads queue for more than 10 seconds and return connection-timeout errors; a single runaway query can hold a connection indefinitely.
- **Fix:** Make pool size and timeouts env-driven, set a default `statement_timeout` (e.g., 30–60 s), and add pool-saturation alerting.

#### H21. Code-similarity Rust serialises all work inside a single problem/language group
- **File / region:** `code-similarity-rs/src/similarity.rs:337–383`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `groups.par_iter()` assigns a single `(problem_id, language)` group to one rayon thread, so normalization, n-gram generation, and the O(n²) pairwise loop run sequentially.
- **Failure scenario:** A typical run has one group containing all submissions. With the 500-submission cap this can take minutes instead of seconds, and concurrent requests queue behind each other.
- **Fix:** Parallelize within each group: use `subs.par_iter()` for n-gram generation and a parallel triangular loop or divide-and-conquer for pairwise comparisons.

#### H22. Rust workspace cleanup blocks the async runtime
- **File / region:** `judge-worker-rs/src/workspace.rs:31–65`; used from `judge-worker-rs/src/executor.rs:305` and `judge-worker-rs/src/runner.rs:841–842`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `SandboxWorkspace::drop` performs recursive `chown` and `remove_dir_all` synchronously inside the async task.
- **Failure scenario:** A sandboxed build can leave thousands of files; deleting them blocks a tokio worker thread for hundreds of milliseconds, reducing effective concurrency.
- **Fix:** Move cleanup into `tokio::task::spawn_blocking`, or add an explicit async `cleanup()` method awaited before the handler returns.

#### H23. Comparator copies full outputs before comparing
- **File / region:** `judge-worker-rs/src/comparator.rs:79–99`, `:116–120`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `compare_output` allocates fresh `Vec<u8>` buffers for both expected and actual outputs (up to 128 MiB each). `compare_float_output` copies both outputs via `String::from_utf8_lossy(...).into_owned()`.
- **Failure scenario:** With `JUDGE_CONCURRENCY` up to 16, a large-output problem can spike memory by several gigabytes and spend significant time copying bytes.
- **Fix:** Implement lazy/streaming normalization on byte slices; use `Cow` for UTF-8 conversion and avoid tokenising into an owned `Vec<&str>`.

#### H24. Similarity handler has no cancellation or concurrency cap
- **File / region:** `code-similarity-rs/src/main.rs:125–140`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** A `/compute` request is dispatched via `spawn_blocking` with no timeout, no abort check, and no Semaphore.
- **Failure scenario:** If the caller disconnects, the CPU-bound computation continues to completion. A burst of large requests exhausts the tokio blocking pool and rayon threads.
- **Fix:** Add a `tokio::sync::Semaphore` around compute, wire an abort flag into `compute_similarity`, and periodically check it during the pairwise loop.

#### H25. Dashboard layout blocks every admin page on sequential layout data
- **File / region:** `src/app/(dashboard)/layout.tsx:30–47`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** After an initial `Promise.all`, `getResolvedSystemSettings` is awaited alone. Every dashboard route waits for settings, auth, capabilities, and translations before streaming HTML.
- **Failure scenario:** All admin pages have elevated TTFB under load.
- **Fix:** Make the layout a thin shell; move independent fetches into `Suspense`-wrapped server components.

#### H26. StatusBoard recomputes expensive per-row data on every render
- **File / region:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:311–321`, `:376–386`, `:462–486`, `:487–551`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `examSessionMap`, score stats, and median/mean are rebuilt from `filteredRows` every render. Inline IIFEs create new function trees for exam-session cells. Desktop and mobile tables render without virtualization.
- **Failure scenario:** Large assignments cause jank and long render times on every poll/update.
- **Fix:** Memoize `examSessionMap` and score statistics with `useMemo`; move exam-session cell into a stable sub-component; add windowing/virtualization.

#### H27. ReactMarkdown `components` map defined inline, forcing subtree remount every render
- **File / region:** `src/components/problem-description.tsx:85–113`; `src/components/assistant-markdown.tsx:47–67`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** A fresh `components` object is passed to `ReactMarkdown` on every render; `a` and `pre` entries are arrow functions created inside the render function.
- **Failure scenario:** React sees different element types each time and unmounts/remounts every link and code block, re-running syntax highlighting and KaTeX repeatedly.
- **Fix:** Extract `Pre` and `Anchor` components to module scope and memoize the `components` object with `useMemo`.

#### H28. Problems and practice pages materialise every matching ID and submission in memory for progress filters
- **File / region:** `src/app/(public)/problems/page.tsx:356–458`; `src/app/(public)/practice/page.tsx:422–532`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** In progress-filter path, the page selects all matching problem IDs, fetches all of the user's submissions for those IDs, and applies solved/attempted/unsolved logic in JavaScript.
- **Failure scenario:** As the catalog grows this loads tens of thousands of rows into the request and blocks the event loop.
- **Fix:** Push progress filtering into SQL via a CTE/subquery joining `problems` with `submissions`, returning only the requested page of IDs.

#### H29. CreateProblemForm re-serialises large test-case/spec objects on every keystroke
- **File / region:** `src/app/(public)/problems/create/create-problem-form.tsx:154–182`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `isDirty` uses `JSON.stringify` over `testCases`, `currentTags`, `functionSpec`, and `referenceSolution` on every render.
- **Failure scenario:** Large test cases and reference solutions make `JSON.stringify` run on every render, causing visible typing lag.
- **Fix:** Memoize the dirty comparison with `useMemo` and use a stable structural comparator (e.g., `fast-deep-equal`). Debounce the comparison for large arrays.

#### H30. Generated and committed nginx configs lack upstream keepalive, timeouts, and compression
- **File / region:** `deploy-docker.sh:1538–1721`; `scripts/online-judge.nginx.conf:1–106`; `scripts/online-judge.nginx-http.conf:1–50`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** Every proxied request opens a fresh TCP connection; stalled Next.js requests hold nginx workers indefinitely; large HTML/JSON responses travel uncompressed.
- **Failure scenario:** Under contest load this increases latency, bandwidth, and the risk of nginx worker exhaustion.
- **Fix:** Define an `upstream` block with `keepalive 64`; set `proxy_connect_timeout 30s`, `proxy_send_timeout 60s`, `proxy_read_timeout 60s`; enable `gzip` for `text/html application/json`.

#### H31. No BuildKit cache mounts for dependency or compiler caches
- **File / region:** `Dockerfile:17–18`, `:28–29`, `:47`; `Dockerfile.judge-worker:12–17`; `Dockerfile.code-similarity:8–12`; `Dockerfile.rate-limiter-rs:9–13`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `npm ci`, `cargo build`, and `apk add` run without `RUN --mount=type=cache`.
- **Failure scenario:** Rebuilds re-download npm packages and Rust crates and recompile native modules/object files, inflating build times and network use.
- **Fix:** Add cache mounts for `/root/.npm`, `/usr/local/cargo/registry`, and `/build/target`.

#### H32. No container log rotation in any compose file
- **File / region:** `docker-compose.production.yml`, `docker-compose.worker.yml`, `docker-compose.test-backends.yml`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** Chatty services fill disk with unbounded `json-file` logs.
- **Failure scenario:** Disk exhaustion causes Docker to hang and breaks new deploys.
- **Fix:** Add `logging: { driver: json-file, options: { max-size: 50m, max-file: 5 } }` to every service.

#### H33. Migration step reinstalls npm packages on every deploy
- **File / region:** `deploy-docker.sh:1332–1342`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** Each deploy downloads `drizzle-kit`, `drizzle-orm`, and `nanoid` into a fresh `node:24-alpine` container.
- **Failure scenario:** Adds unpredictable registry latency and can fail the deploy if npm is unreachable, even though the app image already contains a full `node_modules`.
- **Fix:** Run `drizzle-kit push` from the built app image, or use a pre-built migration image with a BuildKit cache mount for `/root/.npm`.

#### H34. Dedicated worker hosts are processed sequentially
- **File / region:** `deploy-docker.sh:1396–1508`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** Fleets with multiple dedicated workers wait for each host's rsync, image build, compose restart, and health poll to finish before starting the next.
- **Failure scenario:** Deploy duration scales linearly with worker count.
- **Fix:** Parallelize worker-host deployment with a bounded concurrency pool and per-host failure isolation.

#### H35. Post-deploy cleanup removes all BuildKit cache
- **File / region:** `deploy-docker.sh:486`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `prune_old_docker_artifacts` runs `docker builder prune -af`, deleting the build cache that could accelerate the next deploy's language-image rebuilds.
- **Failure scenario:** Combined with `--no-cache` app/worker builds, every deploy is a full cold build.
- **Fix:** Use `docker builder prune -f` (dangling-only) or skip builder-cache pruning during frequent deploys.

### MEDIUM

#### M1. TypeScript similarity fallback performs O(n²) pairwise comparisons on the main thread
- **File / region:** `src/lib/assignments/code-similarity.ts:284–312`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** Up to 500 submissions are normalised, tokenised into n-gram `Set<string>`, and compared pairwise on the Node.js main thread.
- **Failure scenario:** A large contest triggers the TS fallback. The route builds ~500 `Set<string>` objects and compares ~125k pairs, monopolising the event loop and causing the 30 s timeout handler to fire.
- **Fix:** Offload the TS fallback to a Worker Thread, cap the fallback to a smaller N, or convert the route to an async job returning `202 Accepted`.

#### M2. Compiler workspace cleanup uses recursive synchronous `chown`/`rm`
- **File / region:** `src/lib/compiler/execute.ts:348–358`, `:365–384`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** Workspace cleanup runs recursive `chown` and deletion synchronously in the async path.
- **Failure scenario:** A deep or large workspace directory blocks the event loop for tens to hundreds of milliseconds per run.
- **Fix:** Use `fs.promises` recursive helpers and run cleanup after the response is sent, or offload to a background worker.

#### M3. Bulk file delete removes files sequentially in a loop
- **File / region:** `src/app/api/v1/files/bulk-delete/route.ts:33–39`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** After the DB delete, the handler loops over deleted files and awaits `deleteUploadedFile` sequentially.
- **Failure scenario:** Bulk-deleting the maximum allowed files spends most of the request waiting on serial I/O.
- **Fix:** Process deletes with `Promise.all` limited concurrency (e.g., `p-limit`) and return partial-failure details.

#### M4. Heartbeat endpoint runs worker staleness sweep inline
- **File / region:** `src/app/api/v1/judge/heartbeat/route.ts:80`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** Every worker heartbeat awaits `sweepStaleWorkers(now)`.
- **Failure scenario:** With many workers heartbeating frequently, the sweep runs repeatedly and serialises updates to `judgeWorkers`.
- **Fix:** Move the staleness sweep to a single background interval/cron and make the heartbeat path a minimal `UPDATE` of the calling worker.

#### M5. Contest join performs three rate-limit checks sequentially on the failure path
- **File / region:** `src/app/api/v1/contests/join/route.ts:33–42`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** On failed access-code redemption, the handler awaits three separate rate-limit consumption calls sequentially.
- **Failure scenario:** Each rate-limit call touches the DB; the sequential pattern adds latency and more hot-row contention.
- **Fix:** Run independent user-keyed and code-keyed limit checks concurrently where possible, or collapse them into a single composite key.

#### M6. Data-retention maintenance runs 8 batched deletes concurrently
- **File / region:** `src/lib/data-retention-maintenance.ts:131–164`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `pruneSensitiveOperationalData` runs 8 batched deletes concurrently via `Promise.allSettled`.
- **Failure scenario:** On a large dataset, eight concurrent large deletes monopolise pool connections and I/O, slowing user-facing queries.
- **Fix:** Limit concurrency (e.g., 2–3 at a time), run during a low-traffic window, or use smaller batch sizes with `DELETE ... LIMIT`.

#### M7. Docker image validation re-parses environment variables on every call
- **File / region:** `judge-worker-rs/src/validation.rs:68–75`, `:96–100`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `validate_docker_image()` calls `parse_trusted_registries()` for every submission and every `/run` request, allocating a `Vec<String>` from `TRUSTED_DOCKER_REGISTRIES` each time.
- **Failure scenario:** At high throughput this is unnecessary per-request allocation and string splitting.
- **Fix:** Parse and cache trusted registries once inside `Config` and pass the cached slice to the pure `validate_docker_image_with_config`.

#### M8. Keyword lookup in identifier normalization is linear
- **File / region:** `code-similarity-rs/src/similarity.rs:251`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `SIMILARITY_KEYWORDS.contains(&token)` scans a 160-item slice for every identifier in every submission.
- **Failure scenario:** With 500 submissions this adds up to tens of thousands of string comparisons.
- **Fix:** Replace the `&[&str]` slice with a `FxHashSet<&'static str>` or `ahash::AHashSet`.

#### M9. Image prewarming runs sequentially
- **File / region:** `judge-worker-rs/src/main.rs:278–319`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** Startup prewarming iterates `for image in images` and runs `docker run --rm` one image at a time, each with a 10-second timeout.
- **Failure scenario:** With the default six-image list and slow disk, prewarm can take tens of seconds before the worker begins claiming submissions.
- **Fix:** Run prewarm tasks concurrently under a small Semaphore (e.g., 2–3) and still respect the per-image timeout.

#### M10. Similarity result pairs clone problem/language strings
- **File / region:** `code-similarity-rs/src/similarity.rs:370–377`
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Confirmed
- **Problem:** `problem_id` and `language` are cloned into every `SimilarityPair`.
- **Failure scenario:** For a large result set these are many duplicate allocations.
- **Fix:** Use `Arc<String>` or references borrowed from the group key for the pair output.

#### M11. Audit-event buffer can grow during DB back-pressure
- **File / region:** `src/lib/audit/events.ts:202–262`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `_auditBuffer` can grow during DB back-pressure because `recordAuditEvent` pushes synchronously while flush is awaited.
- **Failure scenario:** A burst of audit events while the DB is slow causes the buffer to spike and then drop events.
- **Fix:** Apply back-pressure to callers or sample/discard lower-priority events before the hard cap.

#### M12. Submission polling creates new objects on every update, causing re-renders
- **File / region:** `src/hooks/use-submission-polling.ts:195`, `:317`
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Confirmed
- **Problem:** Every SSE/fetch update calls `setSubmission((prev) => ({ ...normalised, sourceCode: ... }))`, producing a new object reference.
- **Failure scenario:** A complex results page re-renders every 3 s while polling, wasting CPU and causing jank.
- **Fix:** Normalise only changed fields, or use a deep-equality check / stable selector before calling `setSubmission`.

#### M13. Audit-logs page over-fetches large `details` JSON for every row
- **File / region:** `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:333–341`, `:519–523`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** The list query selects the `details` JSONB column for every row.
- **Failure scenario:** Wide `details` payloads inflate DB transfer and JSON serialisation for list views.
- **Fix:** Omit `details` from the list query; fetch on demand when a row expands.

#### M14. Discussion thread list performs visibility checks problem-by-problem
- **File / region:** `src/lib/discussions/data.ts:177–181`
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Confirmed
- **Problem:** `listAllProblemDiscussionThreads` fetches 200 threads and then calls `canAccessProblem` once per distinct non-public problem.
- **Failure scenario:** Creates an N+1 burst of small permission queries.
- **Fix:** Batch the permission check into a single query or use a request-scoped permission cache keyed by `(userId, problemId)`.

#### M15. Participant timeline pulls thousands of rows per request into the application tier
- **File / region:** `src/lib/assignments/participant-timeline.ts:150–176`
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Confirmed
- **Problem:** The route loads up to 5,000 submissions and 1,000 code snapshots per `(assignment, user)` and then re-groups them in JS.
- **Failure scenario:** High latency and memory spikes for active participants.
- **Fix:** Lower the hard limits, add pagination, or stream rows from the cursor and aggregate incrementally.

#### M16. Admin CSV exports load up to 10,000 rows into memory
- **File / region:** `src/app/api/v1/admin/submissions/export/route.ts:94–111`; `src/app/api/v1/admin/audit-logs/route.ts:208`; `src/app/api/v1/admin/login-logs/route.ts:95`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** CSV export routes load up to 10,000 rows into memory before serialising.
- **Failure scenario:** Repeated exports of large tables create memory spikes and long-running requests.
- **Fix:** Stream rows from the database directly to the response with a cursor or chunked query.

#### M17. Docker image build blocks a Next.js request worker
- **File / region:** `src/app/api/v1/admin/docker/images/build/route.ts:119`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** The handler awaits `buildDockerImage(...)` synchronously in the request thread.
- **Failure scenario:** A slow multi-GB language image build occupies a request worker for up to 10 minutes.
- **Fix:** Enqueue the build in a background job queue and return a job ID, or stream progress via SSE.

#### M18. `docker-compose.yml` builds ~100 language images with no default parallelism cap
- **File / region:** `docker-compose.yml:16–604`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** Running `docker compose build` across all services with default parallelism can overwhelm BuildKit.
- **Failure scenario:** Contributes to the history-store corruption that forced the sequential default.
- **Fix:** Document `COMPOSE_PARALLEL_LIMIT` in the file header and default to a safe value (e.g., 4) when invoked via scripts.

#### M19. Static-site cache TTL is conservative for immutable assets
- **File / region:** `static-site/nginx.conf:38–40`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** Repeat visitors re-download fingerprinted CSS/JS/fonts every week.
- **Failure scenario:** Increased bandwidth and latency.
- **Fix:** Use `expires 1y` for fingerprinted assets; keep a short TTL only for `index.html` and non-fingerprinted entry points.

#### M20. Integration tests create and migrate a fresh PostgreSQL database per `beforeEach`
- **File / region:** `tests/integration/support/test-db.ts:38`; `tests/integration/db/user-crud.test.ts:18`; `tests/integration/db/submission-lifecycle.test.ts:33`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `createTestDb()` runs `CREATE DATABASE` and the full Drizzle migration folder for every test.
- **Failure scenario:** CI integration job grows linearly with test count; each `beforeEach` can take hundreds of milliseconds to seconds.
- **Fix:** Use `beforeAll` to create one DB per file and wrap each test in a transaction rolled back in `afterEach`.

#### M21. Unit-test suite import time is on par with test runtime
- **File / region:** `vitest.config.ts:20`; observed run output `import 30.42s`, `tests 69.89s`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** Importing route handlers/pages pulls in the full Next.js server/app graph.
- **Failure scenario:** Adding more route tests super-linearly increases CI time.
- **Fix:** Extract pure business logic out of route handlers so unit tests import small modules instead of `src/app/api/v1/.../route.ts`.

#### M22. E2E suite is forced serial
- **File / region:** `playwright.config.ts:72–73`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** `fullyParallel: false` and `workers: 1` means 42 spec files run one after another.
- **Failure scenario:** A full local regression run takes many minutes.
- **Fix:** Make tests parallel-safe and raise `workers` to at least `process.env.CI ? 2 : 4`.

### LOW

#### L1. Identifier map allocates even for repeated identifiers
- **File / region:** `code-similarity-rs/src/similarity.rs:256`
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Confirmed
- **Problem:** `identifiers.entry(token.to_string())` allocates an owned `String` for every identifier before checking whether it already exists.
- **Fix:** Check `identifiers.contains_key(token)` first, or use a hasher lookup with `&str` keys.

#### L2. Test-case inputs are cloned for each run
- **File / region:** `judge-worker-rs/src/executor.rs:581`; `judge-worker-rs/src/runner.rs:988`
- **Severity:** LOW
- **Confidence:** Low
- **Status:** Likely
- **Problem:** `DockerRunOptions.input` is `Option<String>`, so each test case clones its input.
- **Fix:** Change `input` to `Arc<str>` or `Cow<'_, str>`.

#### L3. Default tokio runtime is not sized for the workload
- **File / region:** `judge-worker-rs/src/main.rs:171`; `code-similarity-rs/src/main.rs:177`; `rate-limiter-rs/src/main.rs:425`
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Problem:** All three binaries use `#[tokio::main]` with default `worker_threads` and `max_blocking_threads`.
- **Fix:** Build a `tokio::runtime::Builder` with explicit `worker_threads` and `max_blocking_threads` based on expected load.

#### L4. `active_tasks` counter uses `Relaxed` ordering
- **File / region:** `judge-worker-rs/src/main.rs:231`, `:374`, `:592`, `:625`
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Problem:** The counter is incremented/decremented with `Ordering::Relaxed`.
- **Fix:** Use `AcqRel`/`Release` for updates and `Acquire` for reads.

#### L5. Recent index migrations are not created concurrently
- **File / region:** `drizzle/pg/0034_noisy_justin_hammer.sql`; `drizzle/pg/0035_queue_claim_indexes.sql`; `drizzle/pg/0036_submission_create_indexes.sql`
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Problem:** `CREATE INDEX` without `CONCURRENTLY` blocks writes on the target table.
- **Fix:** Generate migrations with `CREATE INDEX CONCURRENTLY` for production deployments.

#### L6. Queue-status issues three separate count queries per request
- **File / region:** `src/app/api/v1/submissions/[id]/queue-status/route.ts:41–63`
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Problem:** Three round-trips are made when one grouped status query could return the same counts.
- **Fix:** Combine the counts into a single `GROUP BY status` query.

#### L7. Submission POST serialises concurrent submissions per user with an advisory lock
- **File / region:** `src/app/api/v1/submissions/route.ts:349`
- **Severity:** LOW / MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Problem:** `pg_advisory_xact_lock(hashtextextended(user.id, 0)::bigint)` prevents duplicate submissions but also queues all concurrent submissions from the same user.
- **Fix:** Keep the lock only for the minimal anti-cheat/duplicate window and add a short `SET LOCAL lock_timeout`.

#### L8. `JUDGE_CONCURRENCY` default of 2 is conservative for production
- **File / region:** `.env.production.example:51`
- **Severity:** LOW
- **Confidence:** Low
- **Status:** Risk
- **Problem:** Production workers with more CPU/memory under-utilise capacity unless operators override the default.
- **Fix:** Document a sizing formula based on cores and memory, or auto-detect a safe default in the worker.

#### L9. Static-site nginx lacks worker-process and connection tuning
- **File / region:** `static-site/nginx.conf:1–47`
- **Severity:** LOW
- **Confidence:** High
- **Status:** Confirmed
- **Problem:** Default `worker_processes` and `worker_connections` under-utilise multi-core hosts during traffic spikes.
- **Fix:** Add `worker_processes auto;`, `events { worker_connections 4096; multi_accept on; }`, `sendfile on`, `tcp_nopush on`, `tcp_nodelay on`.

## Final Sweep — Commonly Missed Performance Issues

| Pattern | Result |
|---|---|
| Unbounded `IN (...)` / `inArray` batches | Confirmed in SSE shared polling (`events/route.ts`) and problem-set visibility helpers (`visibility.ts`). |
| Missing resource limits | Confirmed in `docker-compose.production.yml`, `docker-compose.worker.yml`, and `code-similarity-rs.service`. |
| Blocking syscalls in async runtimes | Confirmed synchronous `chown`/`remove_dir_all` in Rust worker (`workspace.rs`); string concatenation in Node compiler fallback (`execute.ts`). |
| Repeated env var lookups | Confirmed in Rust worker hot paths (`validation.rs`, `docker.rs`, `executor.rs`). |
| Cache misses causing full-table scans | Confirmed in leaderboard, analytics, replay, and language-catalog snapshot. |
| Build-cache invalidation | Confirmed `--no-cache`, `cargo clean`, `COPY . .`, and lack of BuildKit cache mounts. |
| No performance/load/benchmark tests | Confirmed no perf suite; unit tests heavily mock DB; integration suite provisions a fresh DB per test. |

## Positive Observations

- `SandboxWorkspace` correctly re-chowns the temp tree back to the worker UID before deletion, fixing the earlier Rust workspace leak.
- The Node compiler fallback now re-chowns before cleanup, fixing the earlier local-fallback leak.
- The rate-limiter sidecar uses monotonic `Instant` instead of wall-clock time.
- The similarity-check client now propagates the caller's `AbortSignal` to the HTTP request.
- Contest scoring uses an LRU cache with stale-while-refresh semantics to protect the DB from thundering herds.
- Judge claim uses `FOR UPDATE SKIP LOCKED` to avoid contention while atomically claiming submissions.
- Database export streams rows in `EXPORT_CHUNK_SIZE = 1000` chunks inside a `REPEATABLE READ READ ONLY` transaction.
- Cleanup jobs delete audit/login events in 5,000-row batches with a delay between batches.

## Recommended Priority Order

1. **Cap unbounded queues/buffers** — compiler `p-limit` queue, compiler output buffering, file upload streaming, SSE subscriber/poll caps, and `createApiHandler` body-size guard (C2–C5, C8, H30).
2. **Reduce database pressure** — real-time advisory locks, rate-limit hot rows, `COUNT(*) OVER()` pagination, missing indexes, and statement timeouts (H1–H5, H19–H20).
3. **Stop full-table/recomputation explosions** — `/judge/claim`, `/judge/poll`, leaderboard, analytics, replay, and similarity SQL `LIMIT` (H6–H12).
4. **Stream large transfers** — file downloads, CSV exports, and similarity JSON payloads (H18, M16, H12).
5. **Fix Rust worker hot spots** — similarity within-group parallelism, workspace cleanup off async runtime, comparator output copies, and sidecar cancellation/concurrency caps (H21–H24, C6).
6. **Harden infrastructure** — Docker Compose resource limits, nginx keepalive/timeouts/compression, BuildKit cache mounts, log rotation, and restore deploy caching (C7–C9, H30–H35).
7. **Improve UI/real-time responsiveness** — dashboard/public-page waterfalls, status-board memoization, `ReactMarkdown` remounts, catalog progress filters, and dirty-check `JSON.stringify` (H25–H29).
8. **Add observability and performance tests** — statement timeouts, p99 latency alerts, load tests for compiler/similarity/leaderboard, and DB integration tests that exercise real query plans (M20–M22).

---

## Addendum — Focused public / auth / change-password UI performance review

**Scope:** all `.ts` / `.tsx` files under `src/app/(public)/`, `src/app/(auth)/`, `src/app/change-password/`, plus root app files (`layout.tsx`, `page.tsx`, `not-found.tsx`).
**Files reviewed:** 108 unique source files.

### HIGH

#### F1. Public layout runs additional fetches sequentially after the initial `Promise.all`
- **File / region:** `src/app/(public)/layout.tsx:25–30`
- **Confidence:** High
- **Problem:** `capabilities`, `getUserPreferences`, and `getResolvedSystemSettings` are awaited in series after the initial parallel block.
- **Failure scenario:** Every public page waits for these three sequential round-trips before streaming HTML, raising TTFB.
- **Fix:** Run `getResolvedSystemSettings` and, when logged in, `resolveCapabilities` + `getUserPreferences` in a second `Promise.all`.

#### F2. Student dashboard runs progress, language, and recent-submission queries in series
- **File / region:** `src/app/(public)/dashboard/_components/student-dashboard.tsx:30–98`
- **Confidence:** High
- **Problem:** `progressStats`, `languageStats`, and `Promise.all([recentSubmissions, studentAssignments])` are awaited sequentially.
- **Failure scenario:** Three DB round-trips are summed on every dashboard load.
- **Fix:** Wrap the independent queries in a single `Promise.all`.

#### F3. Instructor dashboard chains group, assignment, and aggregate queries
- **File / region:** `src/app/(public)/dashboard/_components/instructor-dashboard.tsx:29–89`
- **Confidence:** High
- **Problem:** The component awaits teaching group IDs, then groups, then assignments, then aggregate counts/activity in sequence.
- **Failure scenario:** Dashboard load latency grows with the number of teaching groups and assignments.
- **Fix:** Fetch groups and assignments concurrently after IDs are known, then fetch aggregates in parallel with assignment data.

#### F4. Problems page progress filter materialises every matching ID and submission in memory
- **File / region:** `src/app/(public)/problems/page.tsx:356–458`
- **Confidence:** High
- **Problem:** Path B selects **all** matching problem IDs, fetches **all** of the user's submissions for those IDs, and applies solved/attempted/unsolved logic in JavaScript.
- **Failure scenario:** As the catalog grows this loads tens of thousands of rows into the request and blocks the event loop.
- **Fix:** Push progress filtering into SQL via a CTE/subquery joining `problems` with `submissions`, returning only the requested page of IDs.

#### F5. Practice page repeats the all-ID + all-submission progress-filter pattern
- **File / region:** `src/app/(public)/practice/page.tsx:422–532`
- **Confidence:** High
- **Problem:** Same anti-pattern as the problems page: all matching problem IDs are fetched, all user submissions for those IDs are loaded, and progress classification happens in JS.
- **Fix:** Replace the JS filter with a SQL-level CTE/subquery and `LIMIT`/`OFFSET` driven by the database.

#### F6. CreateProblemForm re-serialises large test-case/spec objects on every keystroke
- **File / region:** `src/app/(public)/problems/create/create-problem-form.tsx:154–182`
- **Confidence:** High
- **Problem:** `isDirty` uses `JSON.stringify` over `testCases`, `currentTags`, `functionSpec`, and `referenceSolution` on every render.
- **Failure scenario:** Large test cases and reference solutions make `JSON.stringify` run on every render, causing visible typing lag.
- **Fix:** Memoize the dirty comparison with `useMemo` and use a stable structural comparator (e.g., `fast-deep-equal`). Debounce the comparison for large arrays.

#### F7. Public contest list re-groups active/archived contests on every render
- **File / region:** `src/app/(public)/_components/public-contest-list.tsx:43–52`
- **Confidence:** High
- **Problem:** The list is split into active and archived arrays inside the render function without memoization.
- **Failure scenario:** Re-renders (e.g., from polling) repeatedly re-scan the full contest list.
- **Fix:** Wrap grouping in `useMemo`.

#### F8. PublicHomePage and DashboardJudgeSystemTabs are client components only for `useLocale`
- **File / region:** `src/app/(public)/_components/public-home-page.tsx:1–4`, `:65`; `src/app/(public)/dashboard/_components/dashboard-judge-system-tabs.tsx:1–4`, `:56`
- **Confidence:** High
- **Problem:** Both files start with `"use client"` solely to call `useLocale()`.
- **Failure scenario:** Their subtrees are rendered on the client, increasing bundle execution and hydration cost.
- **Fix:** Convert to server components and pass `locale` as a prop from the page/layout.

#### F9. Groups page fetches all visible groups then filters/paginates in JavaScript
- **File / region:** `src/app/(public)/groups/page.tsx:82–208`
- **Confidence:** High
- **Problem:** Every visible group is loaded and search/state filtering plus pagination is applied in JS.
- **Failure scenario:** Staff with many groups load a large result set only to discard most of it.
- **Fix:** Push search/filtering and pagination into SQL.

#### F10. Group detail page eagerly fetches manager-only data and builds large option arrays in render
- **File / region:** `src/app/(public)/groups/[id]/page.tsx:161–227`
- **Confidence:** High
- **Problem:** Dialog data (users, problem sets, contests) is fetched up-front even when dialogs are closed, and derived option arrays are rebuilt on every render.
- **Failure scenario:** Page load is slower for all viewers due to manager-only data, and renders are expensive.
- **Fix:** Defer dialog data to client-side fetch; memoize derived option arrays.

#### F11. Contest management list materialises all contests then filters in JavaScript
- **File / region:** `src/app/(public)/contests/manage/page.tsx:69–89`
- **Confidence:** High
- **Problem:** All contests are fetched and status filtering/pagination is done in JS.
- **Fix:** Push status filtering and pagination into SQL.

#### F12. Contest creation loads every problem and serial user-group fetch
- **File / region:** `src/app/(public)/contests/manage/create/page.tsx:28–47`
- **Confidence:** High
- **Problem:** The problem selector loads every problem and `userGroups` is fetched after other data.
- **Failure scenario:** Large problem catalogs cause slow initial load and large HTML.
- **Fix:** Use server-side search/pagination for the problem selector; fetch `userGroups` in parallel.

#### F13. Public problem list renders the full table without virtualization
- **File / region:** `src/app/(public)/_components/public-problem-list.tsx`
- **Confidence:** High
- **Problem:** Every row in the page is rendered to the DOM regardless of viewport.
- **Failure scenario:** Large pages cause long initial render and high memory use.
- **Fix:** Add windowing/virtualization or reduce default page size.

#### F14. Rankings page issues a redundant count and recomputes tier per row
- **File / region:** `src/app/(public)/rankings/page.tsx:141–150`, `:184`, `:292–295`, `:326–329`
- **Confidence:** High
- **Problem:** A separate count estimate is computed in addition to the window-function total, and tier is derived inline per row.
- **Fix:** Drop the redundant estimate and rely on the window-function total; memoize tier per row.

### MEDIUM

#### F15. Assignment form dialog recreates default state and inline handlers
- **File / region:** `src/app/(public)/groups/[id]/assignment-form-dialog.tsx`
- **Confidence:** Medium
- **Problem:** Default form state and inline `onClick` handlers are recreated each render.
- **Fix:** Memoize default state and split the form into smaller controlled sub-components or use a form library.

#### F16. Community pages build per-row action JSX without virtualization
- **File / region:** `src/app/(public)/community/page.tsx:196–238`; `src/app/(public)/community/threads/[id]/page.tsx`
- **Confidence:** Medium
- **Problem:** Long thread/reply lists are rendered in full, and stable item components are not extracted.
- **Fix:** Extract stable item components and paginate/virtualize long threads.

#### F17. Problems page renders 50 rows with fresh render helpers and no virtualization
- **File / region:** `src/app/(public)/problems/page.tsx:502`, `:621–721`
- **Confidence:** Medium
- **Problem:** Helper functions and row renderers are defined inline; the table is not virtualized.
- **Fix:** Hoist helpers out of the component; add virtualization or reduce default page size.

#### F18. Problem edit/duplicate pages pass the full problem payload into the client form
- **File / region:** `src/app/(public)/problems/create/page.tsx`; `src/app/(public)/problems/[id]/edit/page.tsx`
- **Confidence:** Medium
- **Problem:** The entire problem object (including test cases and reference solution) is passed to the client form.
- **Fix:** Pass only fields needed for the edit UI; lazy-load test cases and reference solution.

#### F19. Recruit page bypasses Next.js image optimization
- **File / region:** `src/app/(auth)/recruit/[token]/page.tsx:232–243`
- **Confidence:** Medium
- **Problem:** Uses an unoptimized `<img>` instead of `next/image`.
- **Fix:** Use `next/image` with `sizes` and a validated/same-origin loader.

#### F20. Candidate dashboard runs nested sequential queries in the non-recruiting branch
- **File / region:** `src/app/(public)/dashboard/_components/candidate-dashboard.tsx:97–145`
- **Confidence:** Medium
- **Problem:** Independent public/group/author ID queries are awaited in series.
- **Fix:** Run independent queries in parallel.

#### F21. CodeEditor passes new inline event handlers to CodeSurface every render
- **File / region:** `src/components/code/code-editor.tsx:110–116`, `:127–128`
- **Confidence:** Low
- **Problem:** `onChange` and `onKeyDown` are created inline each render.
- **Fix:** Use `useCallback`.

### Final sweep (UI scope)

| Check | Result |
|---|---|
| Sequential awaits after `Promise.all` | Confirmed in public layout and dashboards. |
| In-memory filtering of large catalogs | Confirmed in problems, practice, groups, and contests manage pages. |
| Client components only for `useLocale` | Confirmed in `public-home-page.tsx` and `dashboard-judge-system-tabs.tsx`. |
| Unmemoized derived arrays/maps | Confirmed in public-contest-list, status-board, and group detail page. |
| Large forms re-serialised on every render | Confirmed in `create-problem-form.tsx`. |
| Missing virtualization on long lists | Confirmed in public-problem-list, problems table, community threads. |

**All findings above are already reflected in the main report’s severity counts; this addendum provides the focused public/auth/change-password line-of-sight view.**

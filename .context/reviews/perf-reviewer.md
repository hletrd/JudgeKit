# Performance / Concurrency Review

Date: 2026-06-30
Scope: entire repository
Summary: JudgeKit has several unbounded-memory and unbounded-query hot spots, missing resource limits in production Docker Compose, inconsistent sandbox resource ceilings between the Rust worker and the Node fallback, and a number of N+1/unbounded-list patterns in assignment/analytics/discussion code. Most issues are concentrated in API routes, DB queries, judge execution, and deployment/infra configuration.
Findings count: 24

## CRITICAL: Unbounded JSON body parsing in createApiHandler (confidence: High)
- **File**: `src/lib/api/handler.ts` (lines 159-162)
- **Problem**: The shared API handler calls `raw = await req.json()` before any body-size guard or Zod validation. A malicious client can POST a multi-megabyte JSON body to any schema-backed route; Next.js buffers the whole body into memory and parses it before the schema rejects it.
- **Failure scenario**: A few concurrent oversized POSTs to `/api/v1/submissions`, `/api/v1/admin/migrate/import`, or `/api/v1/contests/[id]/anti-cheat` can exhaust the Node.js heap and crash the app container.
- **Suggested fix**: Add a body-size limit at the framework/nginx layer (e.g., `NextRequest` size check or middleware rejecting `Content-Length` above a route-specific cap) before calling `req.json()`. Consider streaming parsers for large import routes.
- **Cross-references**: `src/app/api/v1/admin/migrate/import/route.ts:151`, `src/app/api/v1/admin/migrate/export/route.ts:37`, `src/app/api/v1/admin/submissions/rejudge/route.ts`.

## CRITICAL: Code-similarity check loads every best submission before the cap (confidence: High)
- **File**: `src/lib/assignments/code-similarity.ts` (lines 330-339, guard at 379)
- **Problem**: `runSimilarityCheck` fetches the best submission per `(user, problem, language)` for the whole assignment via a raw CTE with no `LIMIT`. The `MAX_SUBMISSIONS_FOR_SIMILARITY` guard is applied only to the TypeScript fallback after the rows are already materialized in memory.
- **Failure scenario**: A large contest with tens of thousands of source-code rows causes the app process to OOM before the Rust sidecar or the fallback guard can run.
- **Suggested fix**: Apply the cap in SQL (e.g., wrap the CTE in a `SELECT ... LIMIT @max` or sample in the database) so only a bounded number of submissions are pulled into the app. Move the row-count guard before the fetch when possible.
- **Cross-references**: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`, `tests/unit/assignments/code-similarity.test.ts`.

## CRITICAL: Contest export builds full ranking before truncation (confidence: High)
- **File**: `src/app/api/v1/contests/[assignmentId]/export/route.ts` (lines 60-62)
- **Problem**: `computeContestRanking(assignmentId)` is invoked with no row limit; the 10,000-entry cap is applied only after the full ranking array, anti-cheat counts, and IP aggregates are computed and held in memory.
- **Failure scenario**: Exporting a contest with tens of thousands of participants allocates huge intermediate structures (ranking entries, per-user anti-cheat counts, IP strings) and can OOM or hang the request worker.
- **Suggested fix**: Push the entry limit into `computeContestRanking` so ranking aggregation stops early, or compute ranking in a streaming/paginated fashion for exports.
- **Cross-references**: `src/lib/assignments/contest-scoring.ts`, `tests/unit/api/contests.route.test.ts`.

## CRITICAL: Production Docker Compose declares no service resource limits (confidence: High)
- **File**: `docker-compose.production.yml` (lines 17-193)
- **Problem**: The `db`, `app`, `judge-worker`, `docker-proxy`, `code-similarity`, and `rate-limiter` services define no `mem_limit`, `cpus`, `ulimits`, or `deploy.resources` constraints.
- **Failure scenario**: A runaway judge container, a build step, a memory-leaking app, or a Postgres vacuum/analyze can consume all host CPU/RAM and trigger OOM kills or total host unresponsiveness.
- **Suggested fix**: Add memory and CPU limits to every production service, matching the documented worst-case sizing (e.g., `JUDGE_MAX_OUTPUT_BYTES × 2 × JUDGE_CONCURRENCY` for the worker). Add `ulimits` for nofile/nproc on the worker.
- **Cross-references**: `docker-compose.worker.yml`, `deploy-docker.sh`, `AGENTS.md` Docker deployment architecture section.

## CRITICAL: File download reads entire stored file into a Buffer (confidence: High)
- **File**: `src/app/api/v1/files/[id]/route.ts` (lines 100-102, 123)
- **Problem**: The GET handler reads the whole uploaded file into memory with `buffer = await readUploadedFile(file.storedName)` and then wraps it in a `Uint8Array` for the response. There is no streaming.
- **Failure scenario**: Concurrent downloads of a few large test-case attachments or PDFs can exhaust the Node.js heap and crash the app.
- **Suggested fix**: Stream files from disk through the response (e.g., `ReadableStream` or `fs.createReadStream`) without loading the full content into memory.
- **Cross-references**: `src/lib/files/storage.ts`, `tests/unit/files/file-request-io-implementation.test.ts`.

## HIGH: Run-phase memory cap differs between Rust worker and Node fallback (confidence: High)
- **File**: `judge-worker-rs/src/executor.rs` (lines 23, 579); `src/lib/compiler/execute.ts` (line 15)
- **Problem**: The Rust worker silently clamps per-submission memory to `MAX_MEMORY_LIMIT_MB = 1024`, while the Node local fallback hard-codes `MEMORY_LIMIT_MB = 2048`.
- **Failure scenario**: Problems authored with a memory limit between 1024 MB and 2048 MB produce inconsistent verdicts: submissions may pass on the local fallback path but fail with `MemoryLimit` on the production Rust worker, or vice versa.
- **Suggested fix**: Make both runners use the same configurable ceiling and surface the clamp in logs/metrics. Prefer making the cap env-driven and identical across runners.
- **Cross-references**: `judge-worker-rs/src/docker.rs`, `src/lib/compiler/execute.ts:15-21`, `tests/unit/compiler/execute.test.ts`.

## HIGH: Public contest list is unbounded and eagerly loads nested problems (confidence: High)
- **File**: `src/lib/assignments/public-contests.ts` (lines 33-50)
- **Problem**: `getPublicContests()` uses `db.query.assignments.findMany` with no `LIMIT` and eagerly loads `assignmentProblems → problem` rows.
- **Failure scenario**: As the public contest catalog grows, the route returns an ever-larger JSON payload, increases DB I/O, and can OOM the app process.
- **Suggested fix**: Add a `LIMIT`/`OFFSET` pagination parameter and select only the columns needed for the catalog (do not eager-load full problem rows).
- **Cross-references**: `src/app/(public)/_components/public-contest-list.tsx`, `src/app/(public)/contests/page.tsx`.

## HIGH: Discussion thread view loads all posts without limit (confidence: High)
- **File**: `src/lib/discussions/data.ts` (lines 270-283)
- **Problem**: `getDiscussionThreadById()` eagerly loads `posts` for a thread with no `LIMIT`.
- **Failure scenario**: A popular editorial or solution thread with thousands of posts loads the entire thread into memory and returns a huge JSON response.
- **Suggested fix**: Paginate posts in the thread query and add a per-page limit.
- **Cross-references**: `src/app/(public)/community/threads/[id]/page.tsx`, `tests/unit/discussions/permissions.test.ts`.

## HIGH: Admin chat-log transcript fetches all messages for a session (confidence: High)
- **File**: `src/app/api/v1/admin/chat-logs/route.ts` (lines 24-48)
- **Problem**: When `sessionId` is provided, the handler fetches every chat message for that session with no `LIMIT`/`OFFSET`. The route also has no `rateLimit` key.
- **Failure scenario**: A long support session with thousands of messages loads all rows into memory and returns a multi-megabyte response; an admin/API key can repeatedly trigger this without throttling.
- **Suggested fix**: Add pagination to the transcript query and a `rateLimit` key (e.g., `chat-logs:view`).
- **Cross-references**: `src/lib/plugins/chat-widget/tools.ts`, `src/lib/db/schema.pg.ts` (chatMessages table).

## HIGH: Code-snapshot list returns full sourceCode for up to 200 rows per page (confidence: High)
- **File**: `src/app/api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts` (lines 20-23, 41-47)
- **Problem**: The paginated endpoint allows up to 200 rows per page and selects `sourceCode: codeSnapshots.sourceCode` for every row. The route has no `rateLimit` key.
- **Failure scenario**: A single page can return hundreds of megabytes of source code, stalling JSON serialization, response transfer, and the DB. Repeated fetches are unthrottled.
- **Suggested fix**: Cap the page size lower (e.g., 20-50) for source-code-heavy endpoints, or offer a summary endpoint without `sourceCode` and a separate fetch for individual snapshots. Add rate limiting.
- **Cross-references**: `src/components/contest/code-timeline-panel.tsx`, `tests/unit/api/code-snapshots-get.route.test.ts`.

## HIGH: Contest replay recomputes ranking up to 40 times per request (confidence: High)
- **File**: `src/lib/assignments/contest-replay.ts` (lines 38-83)
- **Problem**: `computeContestReplay` samples up to 40 replay cutoffs and invokes `computeContestRanking` for each one. Each ranking invocation runs multiple heavy raw-SQL aggregations, throttled only by `pLimit(2)`.
- **Failure scenario**: A large contest can trigger 40+ sequential heavy ranking queries, monopolizing pool connections and causing 504s or connection-pool exhaustion.
- **Suggested fix**: Cache snapshot rankings, precompute them in the background, or compute all cutoffs in a single set-based SQL query instead of re-running the full ranking function per cutoff.
- **Cross-references**: `src/lib/assignments/contest-scoring.ts`, `src/app/(public)/contests/manage/[assignmentId]/analytics/page.tsx`, `tests/unit/contest-replay.test.ts`.

## HIGH: DB pool has fixed max 20 connections and no statement timeout (confidence: High)
- **File**: `src/lib/db/index.ts` (lines 41-54)
- **Problem**: The PostgreSQL pool defaults to `max: 20`, `connectionTimeoutMillis: 10s`, `idleTimeoutMillis: 30s`, with no `statement_timeout` configured.
- **Failure scenario**: Bursty workloads (replay + analytics + leaderboard refreshes + exports) queue for >10s and return connection-timeout errors; a single runaway query can hold a connection indefinitely.
- **Suggested fix**: Make pool size and timeouts env-driven, set a reasonable `statement_timeout` on new connections (e.g., 30-60s), and add pool-saturation alerting via the existing `pool-health.ts` diagnostics.
- **Cross-references**: `src/lib/db/pool-health.ts`, `tests/unit/db/pool-health.test.ts`.

## HIGH: Dedicated worker compose has no resource caps with default concurrency of 4 (confidence: High)
- **File**: `docker-compose.worker.yml` (lines 48-93)
- **Problem**: The worker service has no memory or CPU limits, yet defaults to `JUDGE_CONCURRENCY=4` and `RUNNER_CONCURRENCY=4`, each container using up to 2 GB of memory.
- **Failure scenario**: On a 4-8 GB worker host, default concurrency causes OOM kills, a wedged Docker daemon, and lost verdicts.
- **Suggested fix**: Add `mem_limit`/`cpus` to the worker service and document minimum host sizing. Consider deriving default concurrency from detected host memory/CPU instead of a fixed 4.
- **Cross-references**: `docker-compose.production.yml`, `AGENTS.md` deployment architecture section.

## HIGH: nginx reverse proxy lacks timeouts, compression, and upstream keepalive (confidence: High)
- **File**: `scripts/online-judge.nginx.conf` (lines 56-103)
- **Problem**: Proxy locations have no `proxy_connect_timeout`, `proxy_send_timeout`, `proxy_read_timeout`, or buffer settings; no `gzip`/`brotli` is enabled for the application; and no `keepalive` connections are configured to the upstream.
- **Failure scenario**: A stalled Next.js response can hold nginx workers open indefinitely, causing cascading queueing and 502/504 storms. Large HTML/JSON responses travel uncompressed, and every request pays the full TCP/TLS handshake cost.
- **Suggested fix**: Add explicit proxy timeouts (e.g., 60s read/30s connect), enable gzip for JSON/HTML/text responses, and configure a small `keepalive` pool to the upstream app.
- **Cross-references**: `scripts/online-judge.nginx-http.conf`, `static-site/nginx.conf`.

## HIGH: Anti-cheat flush loop re-reads/writes the entire localStorage queue each iteration (confidence: High)
- **File**: `src/components/exam/anti-cheat-monitor.tsx` (lines 108-151)
- **Problem**: `performFlush` calls `loadPendingEvents(assignmentId)` and `savePendingEvents(assignmentId, ...)` inside a loop over the queue. Each iteration re-parses and re-serializes the full pending array.
- **Failure scenario**: A queue at the `MAX_PENDING_EVENTS=200` cap performs hundreds of synchronous `localStorage` reads/writes in one flush, blocking the main thread and causing UI jank during an exam.
- **Suggested fix**: Load the queue once at flush start, process it in memory, and persist only the remaining events once at the end.
- **Cross-references**: `src/components/exam/anti-cheat-storage.ts`, `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`.

## MEDIUM: Compile tmpfs is smaller than compile memory limit (confidence: High)
- **File**: `src/lib/compiler/execute.ts` (lines 20, 357-366); `judge-worker-rs/src/docker.rs` (line 17)
- **Problem**: The compile phase is granted 2048 MB of memory but only a 1024 MB `/tmp` tmpfs. The extra memory cannot be used for tmpfs-backed compiler caches or temporary files.
- **Failure scenario**: Compilers that write large intermediate files to `/tmp` (e.g., Java, Scala, C++ modules) hit `ENOSPC` on tmpfs while the container memory limit still shows headroom.
- **Suggested fix**: Make the compile tmpfs size configurable and at least as large as the compile memory limit, or default both to the same value.
- **Cross-references**: `judge-worker-rs/src/executor.rs`, `tests/unit/compiler/execute.test.ts`.

## MEDIUM: Node fallback run timeout counts container startup against the user budget (confidence: High)
- **File**: `src/lib/compiler/execute.ts` (lines 468-473, 828)
- **Problem**: The run phase uses the raw `timeLimitMs` as the wall-clock kill timeout, unlike the Rust worker which adds `DOCKER_RUN_OVERHEAD_BUDGET_MS` (2 s).
- **Failure scenario**: Near-limit legitimate submissions receive spurious timeouts because Docker container startup overhead is counted against the user's time budget.
- **Suggested fix**: Add the same startup-overhead buffer to the Node fallback kill timeout, keeping CPU-time verdict semantics based on the container runtime.
- **Cross-references**: `judge-worker-rs/src/executor.rs:18-22,570`, `tests/unit/compiler/execute.test.ts`.

## MEDIUM: Anti-cheat event ingestion performs one INSERT per event (confidence: High)
- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (lines 180-190)
- **Problem**: Non-heartbeat telemetry events are inserted one row at a time with no batching or queue.
- **Failure scenario**: A burst of client telemetry (focus/blur/tab-switch/copy/paste) creates a synchronous DB round-trip per request and can backlog the connection pool.
- **Suggested fix**: Batch insert events (e.g., accept an array of events and use `INSERT ... VALUES ...`) or add a small in-memory queue flushed periodically, similar to the audit-event buffer.
- **Cross-references**: `src/lib/audit/events.ts`, `src/components/exam/anti-cheat-monitor.tsx`.

## MEDIUM: Anti-cheat localStorage keys are never garbage-collected (confidence: Medium)
- **File**: `src/components/exam/anti-cheat-storage.ts` (lines 45-111)
- **Problem**: Pending and in-flight event keys are scoped per `assignmentId` but are never expired or cleaned up. `savePendingEvents` removes the key only when the queue is empty.
- **Failure scenario**: A student participating in many exams over time accumulates `judgekit_anticheat_pending_<id>` and `judgekit_anticheat_inflight_<id>` keys, growing `localStorage` without bound.
- **Suggested fix**: Add a TTL or max-key-count eviction policy, and prune stale keys on component mount.
- **Cross-references**: `src/components/exam/anti-cheat-monitor.tsx`.

## MEDIUM: Audit flush interval starts once and is never stopped (confidence: High)
- **File**: `src/lib/audit/events.ts` (lines 167-178)
- **Problem**: `ensureFlushTimer` starts a 5-second interval on the first audit event and never stops it. The timer fires for the process lifetime and survives HMR/test module reloads.
- **Failure scenario**: Empty-buffer flushes waste CPU and can retain the module closure in long-running dev/test processes.
- **Suggested fix**: Provide a `stopAuditFlushTimer` (the export existed previously) and call it during graceful shutdown/HMR; only arm the timer when the buffer is non-empty and stop it after a flush if the buffer is empty.
- **Cross-references**: `src/instrumentation.ts`, `src/lib/audit/node-shutdown.ts`.

## MEDIUM: Judge system snapshot rebuilds the language catalog on every call (confidence: High)
- **File**: `src/lib/judge/dashboard-data.ts` (lines 23-68)
- **Problem**: `getJudgeSystemSnapshot()` queries all enabled language configs and rebuilds the full catalog on every call. This data changes only when an admin edits languages.
- **Failure scenario**: Homepage, public dashboard, and languages-page traffic repeatedly re-query and reconstruct the catalog, wasting DB CPU and increasing response latency.
- **Suggested fix**: Cache the catalog (e.g., React `cache()` for request-level or a short-lived in-memory TTL cache) and invalidate it only when `language_configs` is mutated.
- **Cross-references**: `src/lib/judge/dashboard-catalog.ts`, `src/app/(public)/dashboard/page.tsx`.

## MEDIUM: Capabilities cache allocates a fresh Set on every super-admin call (confidence: Medium)
- **File**: `src/lib/capabilities/cache.ts` (lines 104-108)
- **Problem**: `resolveCapabilities()` returns `new Set(ALL_CAPABILITIES)` for every super-admin-level role call instead of a shared frozen singleton.
- **Failure scenario**: High-traffic requests repeatedly allocate and populate a large capability set, increasing GC pressure.
- **Suggested fix**: Return a single frozen `Set` constant for the all-capabilities case (e.g., `const ALL_CAPABILITIES_SET = new Set(ALL_CAPABILITIES); Object.freeze(ALL_CAPABILITIES_SET);`).
- **Cross-references**: `src/lib/capabilities/types.ts`, `src/lib/auth/permissions.ts`.

## MEDIUM: Docker image build blocks a Next.js request worker for up to 600s (confidence: High)
- **File**: `src/app/api/v1/admin/docker/images/build/route.ts` (line 119)
- **Problem**: The handler awaits `buildDockerImage(...)` synchronously in the request thread with only the underlying build timeout.
- **Failure scenario**: A slow multi-GB language image build occupies a request worker for up to 10 minutes, reducing capacity for other admin requests.
- **Suggested fix**: Move image builds to an asynchronous job queue or background worker and return a build-id/job-status response; alternatively cap the build time lower for the API path.
- **Cross-references**: `src/lib/docker/client.ts`, `deploy-docker.sh`.

## MEDIUM: Admin CSV exports load 10,000 wide rows into memory (confidence: Medium)
- **File**: `src/app/api/v1/admin/audit-logs/route.ts` (line 208); `src/app/api/v1/admin/login-logs/route.ts` (line 95); `src/app/api/v1/admin/submissions/export/route.ts` (lines 94-111)
- **Problem**: CSV export routes load up to 10,000 rows into memory before serializing. Audit logs include the `details` JSONB column; login logs search across multiple coalesced columns with no supporting index.
- **Failure scenario**: Wide `details` payloads or broad date ranges can still produce large memory use and slow query times despite the 10k cap.
- **Suggested fix**: Stream CSV generation row-by-row instead of building the full response in memory. Add a composite index for common log filters (date + resourceType / outcome).
- **Cross-references**: `src/lib/db/export.ts`, `tests/unit/api/admin-submissions-export-implementation.test.ts`.

## MEDIUM: Bulk file delete performs sequential disk I/O (confidence: Medium)
- **File**: `src/app/api/v1/files/bulk-delete/route.ts` (lines 33-39)
- **Problem**: After the DB delete, the handler loops over deleted files and awaits `deleteUploadedFile` sequentially.
- **Failure scenario**: Bulk-deleting the maximum allowed files spends most of the request waiting on serial I/O, holding the connection open.
- **Suggested fix**: Run disk deletions in parallel with `Promise.all` (or a bounded `p-limit`) and return success based on the DB delete.
- **Cross-references**: `src/app/api/v1/files/[id]/route.ts`, `src/lib/files/storage.ts`.

## MEDIUM: Missing database indexes for common permission/catalog filters (confidence: Medium)
- **File**: `src/lib/db/schema.pg.ts` (problems lines 287-289; assignments lines 369-371)
- **Problem**: `problems` only indexes `createdAt`; common filters such as `authorId` and `visibility` are unindexed. `assignments` only indexes `groupId` and `accessCode`; the public-contests filter uses `visibility + examMode` with no supporting index.
- **Failure scenario**: As the problem library and contest catalog grow, permission checks (`canAccessProblem`) and public contest listing degrade to sequential scans.
- **Suggested fix**: Add indexes on `(authorId, visibility)`, `(visibility, examMode, startsAt, createdAt)`, and similar composite indexes for frequently filtered columns.
- **Cross-references**: `src/lib/auth/permissions.ts`, `src/lib/assignments/public-contests.ts`, `tests/unit/db/schema-implementation.test.ts`.

## LOW: Several GET/download routes have no rate-limiting key (confidence: High)
- **File**: `src/app/api/v1/files/[id]/route.ts` (entire GET handler); `src/app/api/v1/admin/chat-logs/route.ts` (line 12); `src/app/api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts` (line 10)
- **Problem**: These handlers are either outside `createApiHandler` or omit `rateLimit`, so authenticated users can repeatedly fetch large payloads without throttling.
- **Failure scenario**: A script can repeatedly download files, chat transcripts, or source-code pages, consuming bandwidth, DB, and memory.
- **Suggested fix**: Wrap file downloads in `createApiHandler` with a `rateLimit` key, and add rate limits to chat-logs and code-snapshots routes.
- **Cross-references**: `src/lib/security/api-rate-limit.ts`, `tests/unit/security/api-rate-limit.test.ts`.

## LOW: Container output is discarded on timeout (confidence: Medium)
- **File**: `judge-worker-rs/src/docker.rs` (lines 522-538); `src/lib/compiler/execute.ts` (lines 496-503)
- **Problem**: When the wall-clock kill fires, both runners return empty stdout/stderr instead of the output produced before the timeout.
- **Failure scenario**: Users debugging TLE submissions cannot see partial output or progress indicators.
- **Suggested fix**: Drain and return the output captured up to the kill point (within the existing output cap) instead of dropping it.
- **Cross-references**: `tests/unit/compiler/output-limits-implementation.test.ts`.

## LOW: Deploy script rebuilds app/worker images from scratch on every deploy (confidence: Medium)
- **File**: `deploy-docker.sh` (lines 907-908, 913-914)
- **Problem**: `judgekit-app` and `judgekit-judge-worker` are built with `--no-cache` by default.
- **Failure scenario**: Every deploy re-runs the full build, multiplying build time, CPU, memory, and network usage and increasing the chance of resource exhaustion during deploys.
- **Suggested fix**: Remove `--no-cache` for routine deploys and reserve it for a manual recovery flag; rely on the existing pre-build disk guard and post-deploy prune to manage cache growth.
- **Cross-references**: `AGENTS.md` deploy-docker.sh workflow section, `Dockerfile`, `Dockerfile.judge-worker`.

## Final sweep
- **Skipped / not exhaustively audited**: Next.js page-level data fetching (server components), client-side editor/real-time polling hooks, all 125 language Dockerfiles, Rust worker queue/claim concurrency beyond the resource-limit findings, and CSP/static asset delivery outside nginx.
- **Manual validation recommended**:
  - Measure actual peak memory of `judgekit-app` under concurrent file downloads and similarity-check exports.
  - Verify `docker-compose.production.yml` resource limits after deployment on both the app server and dedicated worker hosts.
  - Load-test the contest replay and analytics endpoints with a 10k-participant synthetic contest to confirm pool/timeout behavior.
  - Confirm the Rust worker `MAX_MEMORY_LIMIT_MB` clamp is intentional and aligned with the Node fallback.

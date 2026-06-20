# perf-reviewer Review - Cycle 2

Scope: performance, concurrency, CPU/memory pressure, database access paths, Docker/build cost, and UI responsiveness. I reviewed the current repository state including the dirty worktree and did not implement fixes.

## Inventory

Review-relevant inventory was built with `rg --files`, `git status --short`, `git diff --name-only`, targeted `rg`, and line reads. The source inventory contains about 1,457 files across `src/`, `judge-worker-rs/`, `code-similarity-rs/`, `rate-limiter-rs/`, `scripts/`, `docker/`, `tests/`, `docs/`, and `drizzle/`, excluding generated `target/`, `.next/`, and dependency folders.

Examined areas:

- API hot paths: judge claim/report/heartbeat, submission create/detail/SSE/queue-status/rejudge, contests stats/analytics/leaderboard, Docker image management, compiler runner.
- Database/query layer: PostgreSQL schema/indexes, raw claim SQL, assignment/contest aggregation helpers, progress filters, sitemap DB reads, migration/deploy behavior.
- Rust worker: polling loop, claim concurrency, Docker execution, output capture, result reporting, runner sidecar, Docker admin endpoints.
- Frontend/UI responsiveness: submission detail polling/diff rendering, problem/practice filters, problem editor, assignment/contest status boards, quick stats polling.
- Docker/build/deploy: app/worker Dockerfiles, `.dockerignore`, `docker-compose*.yml`, `deploy-docker.sh`, admin build API, Rust runner Docker build endpoint.
- Tests/docs cross-check: component/e2e coverage, judge-worker docs, deploy/operator docs, repo rules in `AGENTS.md`, `CLAUDE.md`, and `.context/`.

## Findings

### PERF2-01 - Judge output is bounded too late and still permits large worker/app memory spikes

- Severity: High
- Confidence: High
- Status: Confirmed
- Evidence:
  - `judge-worker-rs/src/docker.rs:352-362` defaults `JUDGE_MAX_OUTPUT_BYTES` to 128 MiB per stream.
  - `judge-worker-rs/src/docker.rs:370-401` reads stdout into a `Vec<u8>` and stderr into a `String` up to that cap before draining the rest.
  - `judge-worker-rs/src/executor.rs:78-90` converts full captured stdout into the per-test report for non-runtime-error verdicts.
  - `judge-worker-rs/src/executor.rs:599-618` stores that output in every `TestResult`; IOI/run-all cases can accumulate one such string per test.
  - `src/app/api/v1/judge/poll/route.ts:34-46` parses and validates the whole JSON report before any truncation.
  - `src/lib/validators/api.ts:27-45` has no `.max()` bound for `actualOutput`, `compileOutput`, or result count.
  - `src/lib/judge/verdict.ts:16-28` and `src/lib/judge/verdict.ts:86-102` truncate before DB insertion, but only after the app has already received and parsed the large payload.
- Concrete failure scenario: a malicious or buggy submission prints 128 MiB on stdout and stderr for each visible test. With `JUDGE_CONCURRENCY` allowed up to 16, the worker can allocate multiple gigabytes in captured buffers and report strings; then the Next.js route must parse a very large JSON payload only to truncate it afterward. The database is protected by the 16 KiB truncation, but the worker and app request path are still exposed to OOM and long GC pauses.
- Suggested fix: add a much smaller report cap in the worker, separate from the execution drain cap. Send only bounded diagnostic snippets, plus `stdoutTruncated`/`stderrTruncated` flags, and align the app schema with `.max()` bounds and a max result count. Keep full-output comparison internal to the worker if needed, but never serialize 128 MiB per stream into the status report.

### PERF2-02 - Queue claim and queue-position queries lack composite queue indexes

- Severity: High
- Confidence: High
- Status: Confirmed
- Evidence:
  - Claim SQL filters `pending` or stale `queued`/`judging` rows and orders by `submitted_at, id`: `src/lib/judge/claim-query.ts:38-52` and `src/lib/judge/claim-query.ts:133-147`.
  - Queue status counts older pending/queued submissions: `src/app/api/v1/submissions/[id]/queue-status/route.ts:40-51`.
  - The submission detail page polls queue status every 5 s while live: `src/components/submissions/submission-detail-client.tsx:115-182`.
  - Current indexes are single-column/non-covering for these access patterns: `src/lib/db/schema.pg.ts:500-513`.
- Concrete failure scenario: during a contest, thousands of submissions are pending while many workers poll and many students keep live submission pages open. PostgreSQL can use `submissions_status_idx` and `submissions_submitted_at_idx` separately, but still has to filter/sort/count more rows than a purpose-built queue index would require. Queue pickup latency and status-polling DB CPU rise with queue depth.
- Suggested fix: add partial/composite indexes for the hot paths, for example `(status, submitted_at, id) WHERE status IN ('pending','queued')` for queue scans and a stale-claim index that includes `judge_claimed_at` for `queued`/`judging` reclaim checks. Verify with `EXPLAIN (ANALYZE, BUFFERS)` on production-scale row counts.

### PERF2-03 - Submission creation scans all historical submissions for the user inside the transaction

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Evidence:
  - `src/app/api/v1/submissions/route.ts:345-358` takes a per-user advisory transaction lock, then computes `recentCount` and `pendingCount` with `SUM(CASE ...)` over all rows where `user_id = user.id`.
  - The recent one-minute predicate is inside the aggregate expression, not the `WHERE` clause, so the query must consider every historical submission for that user.
  - The same transaction also counts the global pending queue at `src/app/api/v1/submissions/route.ts:373-379`.
  - Existing indexes include `submissions_user_idx` and `submissions_user_problem_idx`, but no `(user_id, submitted_at)` or partial per-user active-status index: `src/lib/db/schema.pg.ts:500-513`.
- Concrete failure scenario: a candidate with thousands of historical attempts submits during a high-traffic contest. Every submit scans that user's whole submission history while holding the advisory lock, increasing submit latency and extending the locked section that serializes that user's concurrent submissions.
- Suggested fix: split this into indexed queries with predicates in `WHERE`: one `COUNT(*) WHERE user_id = ? AND submitted_at > ?`, one `COUNT(*) WHERE user_id = ? AND status IN (...)`, backed by `(user_id, submitted_at)` and a partial `(user_id, status)` active-submission index. The global queue count can reuse the queue index from PERF2-02.

### PERF2-04 - Live submission fallback polling fetches full submission payloads repeatedly

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Evidence:
  - SSE is attempted first, but fetch polling falls back to `/api/v1/submissions/:id` every 3 s: `src/hooks/use-submission-polling.ts:151-209` and `src/hooks/use-submission-polling.ts:248-285`.
  - The REST detail route fetches the submission with user, problem, all results, test-case metadata, and default columns including `sourceCode`: `src/app/api/v1/submissions/[id]/route.ts:15-40`.
  - Owners keep `sourceCode` after sanitization: `src/lib/submissions/visibility.ts:151-153`.
  - The same page also polls the queue-status endpoint every 5 s while live: `src/components/submissions/submission-detail-client.tsx:115-182`.
- Concrete failure scenario: if EventSource is blocked by a proxy or browser setting, each live submission tab fetches immutable source code plus result rows every 3 s, while also polling queue status. A classroom with many active tabs produces avoidable DB reads, JSON parse work, and client rerenders even though most fields do not change during judging.
- Suggested fix: add a lightweight live-status endpoint or a `?lite=1` mode that omits `sourceCode`, stable problem/user fields, and hidden result payloads. The client already preserves previous `sourceCode`, so fallback polling can merge slim status updates and perform one terminal full fetch only when needed.

### PERF2-05 - Problem/practice progress filters load the full catalog into memory

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Evidence:
  - Problems page progress-filter path fetches all matching problem IDs: `src/app/(public)/problems/page.tsx:356-365`.
  - It then fetches all of the user's submissions for those IDs and filters/slices in JavaScript: `src/app/(public)/problems/page.tsx:366-405`.
  - Practice page has the same shape and explicitly notes the 10k+ problem concern: `src/app/(public)/practice/page.tsx:423-446`.
  - Practice then computes `matchingIds` in memory before pagination: `src/app/(public)/practice/page.tsx:454-465`.
- Concrete failure scenario: a user selects "unsolved" on a large public catalog. The server loads every matching problem ID and a large `IN (...)` submission query before slicing one page. This adds DB CPU, network transfer, and Node heap use proportional to total catalog size rather than page size.
- Suggested fix: push progress filtering into SQL with `EXISTS`/anti-join or a CTE that computes solved/attempted status per problem for the current user, then apply `ORDER BY`, `LIMIT`, and `OFFSET` in the database. Avoid building large `IN` lists in the request path.

### PERF2-06 - Wrong-answer diff remains quadratic on the browser main thread

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Evidence:
  - `src/lib/diff.ts:26-41` allocates an `(m + 1) * (n + 1)` LCS table.
  - `src/lib/diff.ts:74-78` splits full expected/actual strings and computes the LCS synchronously.
  - `src/components/submissions/output-diff-view.tsx:13-16` runs the diff in `useMemo` during render.
- Concrete failure scenario: an instructor exposes a visible test with thousands of expected lines and a student prints thousands of different lines. Opening the submission tries to allocate and fill a huge DP matrix in the tab, freezing the UI before the user can switch views or navigate away.
- Suggested fix: add byte/line-count guards before diffing. For large outputs, render truncated raw expected/actual text and skip LCS, or use a capped/windowed diff in a Web Worker. Add a component/unit test that proves large output does not enter the quadratic path.

### PERF2-07 - Assignment and contest status boards build/render the full student x problem matrix

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Evidence:
  - `getAssignmentStatusRows` fetches all assignment problems and enrolled students: `src/lib/assignments/submissions.ts:636-659`.
  - It aggregates all terminal submissions for the assignment in one raw query: `src/lib/assignments/submissions.ts:691-731`.
  - It assembles every enrolled-student x problem cell in memory: `src/lib/assignments/submissions.ts:781-832`.
  - The desktop board renders all filtered rows and all problem cells: `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:351-567`.
  - The mobile representation maps the same `filteredRows` again: `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:569-607`.
- Concrete failure scenario: a contest with 2,000 participants and 12 problems produces 24,000 per-problem cell objects server-side and a very large table/client tree. Searching or changing filters still starts from the full in-memory matrix, so the first page load and hydration cost grow with the entire roster.
- Suggested fix: split summary stats from row data, add server-side pagination/search/status filtering, and render only the active page. For large desktop tables, use virtualization or a paged API; avoid rendering the mobile and desktop full representations from the same full dataset.

### PERF2-08 - Contest quick stats polling recomputes uncached aggregates

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Evidence:
  - `ContestQuickStats` defaults to a 15 s refresh interval: `src/components/contest/contest-quick-stats.tsx:31-36`.
  - It polls `/api/v1/contests/:assignmentId/stats` through visibility polling: `src/components/contest/contest-quick-stats.tsx:49-85`.
  - The stats route recomputes participants, per-user best scores, totals, averages, and solved-problem counts on every request: `src/app/api/v1/contests/[assignmentId]/stats/route.ts:99-140`.
- Concrete failure scenario: several admins keep the management page open during a large contest. Every browser triggers the same aggregate scan every 15 s, duplicating work that competes with judge report writes and leaderboard reads.
- Suggested fix: cache stats per assignment with the same stale-while-revalidate approach used by the analytics path, and invalidate on judge report completion where leaderboard caches are already invalidated. Alternatively derive quick stats from the cached leaderboard/status data.

### PERF2-09 - Remote Docker image build API is synchronous with a 30 s app timeout

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Evidence:
  - Admin build route waits for `buildDockerImage` before responding: `src/app/api/v1/admin/docker/images/build/route.ts:61-82`.
  - Worker-backed JSON calls time out after 30 s: `src/lib/docker/client.ts:104-117`.
  - Remote image build uses that helper: `src/lib/docker/client.ts:419-448`.
  - The Rust runner runs `docker build` and returns the combined build log synchronously: `judge-worker-rs/src/runner.rs:313-333` and `judge-worker-rs/src/runner.rs:590-620`.
  - The local build path uses a 600 s timeout and bounded head/tail logs, which is much closer to real language image build cost: `src/lib/docker/client.ts:248-300`.
- Concrete failure scenario: an admin clicks Build for a heavy language image on a split app/worker deployment. The app aborts after 30 s and reports failure while the worker-side Docker build may continue consuming CPU, disk, and network. Retrying from the UI can start duplicate expensive builds and worsen disk pressure.
- Suggested fix: make builds asynchronous jobs with build IDs, status polling, cancellation, and bounded logs. As an interim fix, use a build-specific timeout consistent with the local 600 s path and cap logs in the Rust runner as well.

### PERF2-10 - Sitemap generation accumulates all rows and locale-expands them in memory

- Severity: Low
- Confidence: High
- Status: Confirmed
- Evidence:
  - `src/app/sitemap.ts:21-34` fetches all batches into one array.
  - It concurrently fetches all public problems, public contests, and general discussion threads using offset pagination: `src/app/sitemap.ts:48-71`.
  - It expands each route across every supported locale before returning: `src/app/sitemap.ts:73-94`.
- Concrete failure scenario: as public problems and community threads grow, one sitemap request loads all IDs, pays increasingly expensive offset scans, and multiplies the result by locale count in memory. The route can exceed sitemap size limits or time out under crawler traffic.
- Suggested fix: split into sitemap index segments, use cursor/keyset pagination, cap each sitemap below the standard 50,000 URL limit, and cache or precompute entries where possible.

### PERF2-11 - Local compiler fallback output cap counts JavaScript string length, not bytes

- Severity: Low
- Confidence: High
- Status: Confirmed
- Evidence:
  - `src/lib/compiler/execute.ts:15-19` sets `MAX_OUTPUT_BYTES` to 128 MiB.
  - The local Docker path stores stdout/stderr as strings: `src/lib/compiler/execute.ts:392-397`.
  - Data handlers compare `stdout.length`/`stderr.length` with a byte constant and append `chunk.toString(...)`: `src/lib/compiler/execute.ts:441-450`.
  - The final result slices strings by the same byte constant: `src/lib/compiler/execute.ts:482-484`.
  - Local fallback is still reachable when the Rust runner is unavailable and fallback is allowed: `src/lib/compiler/execute.ts:624-648`.
- Concrete failure scenario: a local fallback run prints multibyte output. The cap is intended to be bytes, but JavaScript string length is UTF-16 code units, so memory use can exceed the intended byte budget. Repeated string concatenation on large outputs also creates avoidable copying and GC churn.
- Suggested fix: accumulate `Buffer` chunks with an explicit byte counter, truncate by bytes, and decode once at the end. Prefer the smaller report/output cap from PERF2-01.

### PERF2-12 - Claim response performs several sequential DB reads after reserving a worker slot

- Severity: Low
- Confidence: Medium
- Status: Confirmed
- Evidence:
  - The route authenticates, checks worker status, fetches DB time, then runs the atomic claim: `src/app/api/v1/judge/claim/route.ts:168-228`.
  - After a row is claimed, it records an audit event and then fetches problem metadata, test cases, language config, and assignment scoring model in sequence: `src/app/api/v1/judge/claim/route.ts:268-356`.
- Concrete failure scenario: with many very short submissions, the worker slot is already reserved and the submission is marked `queued`, but execution cannot start until multiple round trips complete. On a remote DB or during write contention, this serialized post-claim work becomes a measurable fraction of total job latency.
- Suggested fix: parallelize independent post-claim reads with `Promise.all`, and consider returning stable problem/language fields from the claim query or caching language configs. Keep the claim transaction narrow, but avoid unnecessary serial dependency after the row is claimed.

### PERF2-13 - Problem editor dirty check stringifies large test cases on every render

- Severity: Medium
- Confidence: High
- Status: Confirmed
- Evidence:
  - The problem editor accepts large test-case input/output loaded from files: `src/app/(public)/problems/create/create-problem-form.tsx:441-456`.
  - The `isDirty` calculation serializes every current and initial test case body with `JSON.stringify` during render: `src/app/(public)/problems/create/create-problem-form.tsx:160-182`.
  - Large textareas are collapsed in the UI after 5 KB, but the dirty check still serializes the full content: `src/app/(public)/problems/create/create-problem-form.tsx:44` and `src/app/(public)/problems/create/create-problem-form.tsx:1040-1085`.
- Concrete failure scenario: an instructor edits a problem with many uploaded test cases, each hundreds of KB. Typing in the title or description still causes React to allocate and compare megabytes of JSON strings for unchanged test-case bodies, causing input jank and unnecessary memory churn.
- Suggested fix: track dirty state incrementally when fields change, or memoize stable hashes/revision counters for large test cases. Avoid serializing full test-case bodies during unrelated renders.

## Final Missed-Issues Sweep

- Rechecked Rust worker concurrency: `judge-worker-rs/src/main.rs` acquires a semaphore permit before polling and moves it into the spawned judge task, so the worker does not intentionally claim more jobs than configured.
- Rechecked runner request size: `judge-worker-rs/src/runner.rs:27` and `judge-worker-rs/src/runner.rs:920-930` apply a 4 MiB body limit, so runner request payload size is not a separate finding.
- Rechecked DB result storage: current `src/lib/judge/verdict.ts` truncates compile/output diagnostics before insertion, so the remaining high-severity issue is pre-truncation worker/app memory and network pressure, not unbounded DB text rows.
- Rechecked Docker deploy cleanup: `.dockerignore` excludes heavy generated artifacts, and `deploy-docker.sh` uses disk guards/pruning without `docker system prune --volumes`; no new deploy-prune performance issue was found.
- Rechecked Rust workspace changes: the new root Cargo workspace centralizes release profile settings for the Rust crates; I did not find a current build-regression finding there.
- Rechecked previous server-side large-test-case sync concern: `src/lib/problem-management.ts:37-52` now hashes test-case content instead of using `JSON.stringify`, so I did not carry that older issue forward.
- Rechecked analytics route behavior: contest analytics already has caching; the uncached path is specifically the quick stats endpoint in PERF2-08.
- Rechecked tests for UI diff: component tests mock `OutputDiffView`, so large-output diff behavior is not covered; this is captured under PERF2-06 rather than as a separate runtime issue.

# Causal-Tracing Review — `/tmp/judgekit-local`

**Date:** 2026-07-03
**Scope:** auth, contest join, file upload/download, judge claim/report, compiler/run, similarity check, real-time SSE, rate limiting, deployment
**Method:** end-to-end code trace with competing hypotheses; no sampling; line-level citations

---

## Executive Summary

This review traces the critical flows of the JudgeKit codebase from the edge (nginx/Next.js routes) through the application layer, database, Rust worker, and sidecars. The highest-confidence causal failures are:

1. **Host-header trust chain is unsafe in production.** `AUTH_TRUST_HOST=true` is forced by the deploy script while the generated nginx config forwards the attacker-controllable `X-Forwarded-Host` header to the app. A malicious client can influence NextAuth callback URLs.
2. **Global submission queue cap is racy.** The cap is checked inside a per-user advisory-locked transaction without a global lock, so concurrent users can overshoot `SUBMISSION_GLOBAL_QUEUE_LIMIT`.
3. **In-progress judge reports can extend a claim forever.** There is no absolute ceiling on total judging time; a compromised, hung, or slow worker can keep a submission claimed by sending periodic in-progress reports.
4. **Rust runner `/run` accepts work while unhealthy.** The periodic docker-capability probe can flip `docker_capability_ok` to `false`, but the `/run` handler does not consult it, recreating the silent `compile_error` sweep failure mode.
5. **Similarity check does not hold the advisory lock over read+compute.** Concurrent runs for the same assignment duplicate work and the last writer overwrites anti-cheat events.
6. **SSE slot acquisition uses one global advisory lock.** All SSE connection attempts serialize through a single lock key, creating a head-of-line bottleneck under load.

Each issue below includes the exact file and line range, the causal path, a concrete failure scenario, a confidence rating, and a suggested fix.

---

## Flow Inventory

| Flow | Entry Point | Key Files |
|------|-------------|-----------|
| Auth / session | `[...nextauth]/route.ts`, `src/lib/auth/config.ts` | `src/lib/api/handler.ts`, `src/lib/security/env.ts`, `src/lib/security/csrf.ts` |
| Contest join | `POST /api/v1/contests/join` | `src/app/api/v1/contests/join/route.ts`, `src/lib/assignments/access-codes.ts` |
| File upload/download | `POST /api/v1/files`, `GET /api/v1/files/[id]`, `DELETE /api/v1/files/[id]` | `src/app/api/v1/files/route.ts`, `src/app/api/v1/files/[id]/route.ts`, `src/lib/files/storage.ts` |
| Judge claim/report | `POST /api/v1/judge/claim`, `POST /api/v1/judge/poll` | `src/app/api/v1/judge/claim/route.ts`, `src/app/api/v1/judge/poll/route.ts`, `src/lib/judge/claim-query.ts`, `src/lib/judge/auth.ts`, `judge-worker-rs/src/main.rs`, `judge-worker-rs/src/executor.rs` |
| Compiler/run | `executeCompilerRun`, `/run` sidecar | `src/lib/compiler/execute.ts`, `judge-worker-rs/src/runner.rs`, `judge-worker-rs/src/workspace.rs` |
| Similarity check | `POST /api/v1/contests/[assignmentId]/similarity-check` | `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`, `src/lib/assignments/code-similarity.ts`, `code-similarity-rs/src/main.rs` |
| Real-time SSE | `GET /api/v1/submissions/[id]/events` | `src/app/api/v1/submissions/[id]/events/route.ts`, `src/lib/realtime/realtime-coordination.ts` |
| Rate limiting | `createApiHandler`, `consumeApiRateLimit`, `consumeUserApiRateLimit` | `src/lib/security/api-rate-limit.ts`, `src/lib/security/rate-limit.ts`, `rate-limiter-rs/src/main.rs` |
| Deployment | `deploy-docker.sh`, `deploy.sh`, `deploy-test-backends.sh` | `deploy-docker.sh`, `docker-compose.production.yml`, `scripts/online-judge.nginx.conf`, `scripts/pg-volume-safety-check.sh` |

---

## Findings

### 1. Auth / API handler

#### A. `createApiHandler` rejects custom roles before checking route-specific role membership
- **Location:** `src/lib/api/handler.ts:201-203`
- **Causal path:** The role guard runs `isUserRole(user.role)` before it checks `auth.roles.includes(user.role)`. `isUserRole` is a narrow type guard that returns `false` for any role value not in the built-in enum. If a route declares `auth: { roles: ["customRole"] }`, a user whose DB role is `"customRole"` is rejected by the type guard before the route-specific membership check can allow them.
- **Failure scenario:** A site adds a custom instructor-like role and lists it in a route's `auth.roles`. Users with that role get 403 even though the route explicitly intended to admit them. The bug is silent because the second half of the expression is short-circuited.
- **Confidence:** Medium
- **Fix:** Evaluate `auth.roles.includes(user.role)` first, then optionally narrow with `isUserRole` only when needed for downstream typing.

#### B. Production auth config trusts `X-Forwarded-Host`, and nginx forwards it
- **Location:**
  - `src/lib/security/env.ts:260-266`
  - `src/lib/auth/config.ts:317`
  - `deploy-docker.sh:878` (`ensure_env_literal AUTH_TRUST_HOST true`)
  - `deploy-docker.sh:1647-1739` (generated nginx `location /` blocks; no `X-Forwarded-Host` stripping)
- **Causal path:** `shouldTrustAuthHost()` returns `true` in production whenever `AUTH_TRUST_HOST=true`. `authConfig` passes `trustHost: shouldTrustAuthHost()` to NextAuth. The deploy script hard-codes `AUTH_TRUST_HOST=true` and the generated nginx proxy sets `Host $host` but does not strip or override `X-Forwarded-Host`. A client can therefore supply an arbitrary `X-Forwarded-Host` that NextAuth uses when building callback URLs.
- **Failure scenario:** An attacker sends `X-Forwarded-Host: evil.example` to the login page. The OAuth/email callback URL generated by NextAuth points to `evil.example`, stealing the callback token or session cookie on redirect. This is a host-header trust regression.
- **Confidence:** High
- **Fix:** Either (1) set `proxy_set_header X-Forwarded-Host "";` in nginx before proxying to the app, or (2) stop forcing `AUTH_TRUST_HOST=true` and instead make NextAuth trust only the configured `AUTH_URL` domain.

#### C. Generic 500 handler returns only an opaque error code
- **Location:** `src/lib/api/handler.ts:303-310`
- **Causal path:** All unhandled exceptions are caught and returned as `{ error: "internalServerError", requestId }` with no message or stack exposed to the client.
- **Failure scenario:** A UI bug or integration failure surfaces only `internalServerError`. Operators must grep logs by `requestId` to diagnose, which slows incident response and makes client-side error reporting less useful.
- **Confidence:** Low
- **Fix:** Keep the response body minimal but include a stable `code` and, for non-production environments, a sanitized message field.

---

### 2. Contest join

#### D. Invalid-code rate-limit buckets are not cleared on success
- **Location:** `src/app/api/v1/contests/join/route.ts:30-49`
- **Causal path:** When a code is invalid, the route consumes `contest:join:invalid` and `contest:join:invalid-code` buckets. If the next attempt succeeds, nothing resets those buckets.
- **Failure scenario:** A user mistypes a code three times, then enters the correct code. The invalid-attempt buckets remain full. If the same code is shared with another user whose attempts are also counted under the code-keyed bucket, legitimate users may be blocked even though the previous successful join should have ended the attack window.
- **Confidence:** Low
- **Fix:** On a successful redeem, clear the per-user and per-code invalid-attempt rate-limit entries for that code.

---

### 3. Similarity check

#### E. Advisory lock does not cover read + compute
- **Location:**
  - `src/lib/assignments/code-similarity.ts:321-422` (`runSimilarityCheck` reads rows outside any lock)
  - `src/lib/assignments/code-similarity.ts:447-509` (`runAndStoreSimilarityCheck` locks only delete+insert)
- **Causal path:** `runSimilarityCheck` executes the raw CTE to read best submissions, then calls the Rust sidecar or the TypeScript fallback, all before `withPgAdvisoryLock` is acquired. The lock only protects the final delete+insert of `antiCheatEvents`.
- **Failure scenario:** Two instructors click "Run similarity check" for the same assignment at nearly the same time. Both read the same snapshot of submissions, both compute O(n²) similarity matrices, then each acquires the advisory lock in turn and deletes+inserts events. The second run overwrites the first. The system wastes CPU and, if new submissions arrived between the two reads, the final stored result may be from the older snapshot.
- **Confidence:** Medium
- **Fix:** Move the advisory lock acquisition to the start of `runAndStoreSimilarityCheck` so the read, compute, and store are serialized per assignment.

#### F. Rust similarity sidecar cannot cancel CPU work when the client aborts
- **Location:** `code-similarity-rs/src/main.rs:125-140`
- **Causal path:** The `/compute` handler spawns `compute_similarity` via `tokio::task::spawn_blocking`. Dropping the caller's HTTP request (e.g., the 30-second route timeout aborts the fetch) does not abort the spawned blocking task.
- **Failure scenario:** A large assignment triggers a sidecar computation that exceeds the 30-second route timeout. The route returns `timed_out`, but the sidecar keeps the CPU pinned. Repeated timeouts from multiple instructors can exhaust the sidecar container's CPU and delay legitimate checks.
- **Confidence:** Medium
- **Fix:** Use a tokio `JoinHandle` that is awaited inside the handler, or check an atomic cancellation flag periodically inside `compute_similarity` and stop early when the request is dropped.

#### G. Client abort can still be followed by a later store attempt
- **Location:** `src/lib/assignments/code-similarity.ts:374-411` and `src/lib/assignments/code-similarity.ts:490-493`
- **Causal path:** `computeSimilarityRust` propagates `AbortError` when the fetch aborts, but the route only checks the signal once before the transaction. If the signal aborts between the sidecar return and the transaction, the transaction may still run.
- **Failure scenario:** The sidecar returns quickly at the exact moment the route timeout fires. The signal flips after the array result is received but before `withPgAdvisoryLock` runs. The check aborts late and stores events even though the caller received a timeout.
- **Confidence:** Low
- **Fix:** Re-check `signal.aborted` immediately before acquiring the lock and after acquiring it inside the transaction function.

---

### 4. Compiler / run

#### H. Rust runner `/run` accepts requests while docker capability is unhealthy
- **Location:** `judge-worker-rs/src/runner.rs:734-830`
- **Causal path:** `RunnerState.docker_capability_ok` is set by the startup probe and a periodic 60-second probe. `/health` returns 503 when it is `false`. However, the `/run` handler only validates auth, input sizes, and commands; it never reads `docker_capability_ok`.
- **Failure scenario:** The docker-socket-proxy is reconfigured mid-life (e.g., `POST=0`). Within ~60 seconds the health endpoint turns red, but the app server's local compiler fallback is disabled, so it keeps delegating to the runner. Each `/run` request fails at the Docker layer and returns `compile_error`, recreating the 14-hour silent sweep failure mode that the probe was added to prevent.
- **Confidence:** High
- **Fix:** Reject `/run` with 503 when `state.docker_capability_ok.load(Ordering::Relaxed)` is `false`.

#### I. Worker continues judging after the app rejects the claim token
- **Location:**
  - `src/app/api/v1/judge/poll/route.ts:82-118` returns `invalidJudgeClaim` 403 when the token no longer matches
  - `judge-worker-rs/src/executor.rs:291-302` logs the error but continues
  - `judge-worker-rs/src/executor.rs:1018-1054` retries and dead-letters on any non-success
- **Causal path:** If a stale claim is reclaimed by another worker, the first worker's `report_status` and `report_result` calls return 403. `report_status` only logs the error. `report_with_retry` retries three times and then writes a dead-letter file, but the executor still compiles and runs the submission.
- **Failure scenario:** Worker A crashes briefly. Its claim becomes stale and worker B reclaims the submission. Worker A resumes and sends an in-progress report, receives 403, but continues execution. Both workers now run Docker containers for the same submission, wasting CPU and creating a race to report the final result.
- **Confidence:** Medium
- **Fix:** Treat `invalidJudgeClaim` (and possibly 403/410) as a fatal signal in the worker. Abort the executor task, clean up the sandbox/container, and do not write a dead-letter file.

#### J. Non-root workspace cleanup can leak when Docker is unreachable
- **Location:**
  - `src/lib/compiler/execute.ts:382-428`
  - `judge-worker-rs/src/workspace.rs:79-116`
- **Causal path:** The sandbox runs as uid/gid 65534 and creates files owned by that user. When the app/worker process is not root, `rm`/ `remove_dir_all` may fail with `EACCES`. Both implementations fall back to a privileged Docker container (`alpine rm -rf`), but if the Docker socket is unavailable or the worker is running in a non-Docker environment, the fallback fails and the directory leaks.
- **Failure scenario:** A local development setup runs the worker outside Docker. A sandboxed run creates root-owned artifacts. `SandboxWorkspace::drop` tries direct removal, fails, tries Docker cleanup, fails because Docker is not running, and logs a warning. The workspace directory remains in `/tmp` indefinitely.
- **Confidence:** Medium
- **Fix:** As a last resort, schedule an OS-level cleanup on startup (e.g., delete `compiler-*` and `.tmp*` directories older than a configured age) and emit a metric/alert when cleanup falls back to this path.

---

### 5. Judge claim / report

#### K. In-progress reports reset `judgeClaimedAt` with no absolute ceiling
- **Location:** `src/app/api/v1/judge/poll/route.ts:82-145`
- **Causal path:** For `IN_PROGRESS_JUDGE_STATUSES`, the route updates `status`, `judgeClaimedAt`, and diagnostic fields inside a transaction guarded by the claim token. `judgeClaimedAt` is reset to the current DB time. The stale-claim reclaim logic in `src/lib/judge/claim-query.ts:47-48` only reclaims when `judge_claimed_at < NOW() - staleClaimTimeoutMs`.
- **Failure scenario:** A compromised worker, a worker with a runaway container, or a malicious insider sends `judging` reports every few seconds. Because `judgeClaimedAt` is refreshed each time, the claim never goes stale and no other worker can reclaim the submission. The submission is stuck, the worker's `activeTasks` counter remains inflated, and the queue stops draining.
- **Confidence:** High
- **Fix:** Add a `judgeStartedAt` column set once at claim time. Reject in-progress reports when `NOW() - judgeStartedAt` exceeds a global maximum judging duration (e.g., 5 minutes).

#### L. `activeTasks` can remain inflated if the final report is lost and reclaim never happens
- **Location:** `src/lib/judge/claim-query.ts:111-127` and `src/app/api/v1/judge/poll/route.ts:182-189`
- **Causal path:** `worker_bump` increments `activeTasks` at claim time and the final poll decrements it. If the worker loses network access after claiming and before any report, and the claim never becomes stale because the stale timeout is misconfigured or `judgeClaimedAt` is refreshed by another mechanism, the counter stays high.
- **Failure scenario:** A worker's network cable is pulled immediately after claim. With a very long `staleClaimTimeoutMs`, the submission remains `queued`/`judging` and `activeTasks` is never decremented. The worker eventually hits its concurrency limit and stops claiming new work even though it has zero real tasks.
- **Confidence:** Medium
- **Fix:** Add a periodic reconciler that compares `activeTasks` against the count of `submissions` rows actually owned by that worker and corrects drift.

---

### 6. File upload / download

#### M. File download endpoint lacks rate limiting
- **Location:** `src/app/api/v1/files/[id]/route.ts:62-140`
- **Causal path:** The route is not wrapped in `createApiHandler` and does not call `consumeUserApiRateLimit`. It performs auth and access checks, then reads the entire file into a `Buffer` and streams it.
- **Failure scenario:** An authenticated user with access to a 50 MB file downloads it in a tight loop. Each request allocates a full `Buffer`, saturates memory, and consumes bandwidth. The B3 fix added a rate limit to `GET /api/v1/files` (list) but not to this download endpoint.
- **Confidence:** Medium
- **Fix:** Add `consumeUserApiRateLimit(request, user.id, "files:download")` after auth, similar to the file-list route.

#### N. DELETE removes the DB row before deleting disk, risking orphan files
- **Location:** `src/app/api/v1/files/[id]/route.ts:186-207`
- **Causal path:** The route deletes the `files` row, records an audit event, and then best-effort deletes the stored file. If disk deletion fails (permissions, mounted volume hiccup), the row is gone and there is no retry or reconciliation.
- **Failure scenario:** An admin deletes a large attachment. The DB delete succeeds, but the underlying NFS/ZFS volume is briefly read-only. The file remains on disk with no DB reference and is never cleaned up.
- **Confidence:** Low
- **Fix:** Move disk deletion before the DB delete, or perform both inside a single idempotent cleanup job that can reconcile orphaned files by scanning the upload directory against `files.storedName`.

#### O. Upload writes disk before DB, with best-effort cleanup
- **Location:** `src/app/api/v1/files/route.ts:97-122`
- **Causal path:** `writeUploadedFile` runs before the `db.insert`. If the insert fails, `deleteUploadedFile` is called inside a catch block.
- **Failure scenario:** A DB connection error occurs after the file is written. The cleanup catch swallows its own errors. The file becomes an unreferenced orphan.
- **Confidence:** Low
- **Fix:** Make the cleanup error non-fatal but log it as a structured event/metric, and run a periodic orphan-file scanner.

---

### 7. Real-time SSE

#### P. Single global advisory lock serializes every SSE slot acquisition
- **Location:** `src/lib/realtime/realtime-coordination.ts:101`
- **Causal path:** `acquireSharedSseConnectionSlot` calls `withPgAdvisoryLock("realtime:sse:acquire", ...)`. Every SSE connection request for every user and every submission acquires the same 64-bit advisory lock.
- **Failure scenario:** During a contest start, hundreds of users open the submission events page. Each `GET /api/v1/submissions/[id]/events` blocks behind the same lock. One slow query (e.g., stale-row cleanup or a large count) delays all new SSE connections, causing timeouts and cascading reconnects.
- **Confidence:** High
- **Fix:** Shard the lock by user id, e.g., `realtime:sse:acquire:${userId.slice(0, 4)}`, so that contention for different users is spread across many lock keys.

#### Q. Process-local mode cannot enforce global/per-user limits across instances
- **Location:** `src/app/api/v1/submissions/[id]/events/route.ts:286-294`
- **Causal path:** When `REALTIME_COORDINATION_BACKEND` is not `postgresql`, the route uses in-memory `activeConnectionSet` and `userConnectionCounts`. These are per-process.
- **Failure scenario:** With two app instances behind a load balancer, each instance allows `MAX_GLOBAL_SSE_CONNECTIONS` (500) connections. The effective global cap becomes 1000, exhausting database connections or memory.
- **Confidence:** Medium
- **Fix:** Default `REALTIME_COORDINATION_BACKEND` to `postgresql` in production and add a startup warning/failure when the backend is `none` and `APP_INSTANCE_COUNT` > 1.

---

### 8. Rate limiting

#### R. Global submission queue cap is checked without a global lock
- **Location:** `src/app/api/v1/submissions/route.ts:345-392`
- **Causal path:** The transaction acquires `pg_advisory_xact_lock(hashtextextended(user.id, 0))`, which serializes only that user's submissions. The global pending count (`status IN ('pending','queued')`) is a plain `COUNT(*)` with no global advisory lock.
- **Failure scenario:** `SUBMISSION_GLOBAL_QUEUE_LIMIT` is 200. One hundred users submit simultaneously. Each transaction sees a count of, say, 50 and inserts. The final global count can exceed 200 by up to the number of concurrent transactions.
- **Confidence:** High
- **Fix:** Acquire a second advisory lock on a fixed global key (e.g., `pg_advisory_xact_lock('submission:global:queue'::bigint)`) before checking the global cap.

#### S. Sidecar fast path can block without writing to the DB authority
- **Location:** `src/lib/security/api-rate-limit.ts:48-55` and `src/lib/security/api-rate-limit.ts:156-179`
- **Causal path:** `sidecarConsume` returns `true` (blocked) based on in-memory state. When the sidecar says blocked, the DB path is skipped entirely. The DB never records the blocked attempt.
- **Failure scenario:** The rate-limiter container restarts after a crash. Its counters are reset, so a client that was previously blocked can now burst through until the DB path catches up. Additionally, audit events that depend on DB rate-limit rows miss the blocked request.
- **Confidence:** Medium
- **Fix:** Always run the DB path, even when the sidecar says blocked, but make it a lightweight read-only check that does not increment if already blocked.

#### T. Sidecar increments attempts beyond the limit, diverging from DB behavior
- **Location:** `rate-limiter-rs/src/main.rs:247-275`
- **Causal path:** The `check` handler increments `attempts` before testing the limit. After the limit is reached, every subsequent request still increments `attempts` further. The DB path in `src/lib/security/api-rate-limit.ts:110` returns `true` (blocked) without incrementing when `existing.attempts >= apiMax`.
- **Failure scenario:** Under heavy load the sidecar's `attempts` counter grows much larger than the DB counter. If the sidecar restarts, the lost count is larger than it should be, allowing a bigger post-restart burst. Metrics that compare sidecar and DB counters will also diverge.
- **Confidence:** Low
- **Fix:** In the sidecar, do not increment `attempts` when the entry is already at or over the limit.

---

### 9. Deployment / infrastructure

#### U. Generated nginx forwards `X-Forwarded-Host` while auth trusts it
- **Location:** `deploy-docker.sh:1647-1739` (generated nginx)
- **Causal path:** See finding B. The nginx template sets `proxy_set_header Host $host` and forwards `X-Forwarded-For`, but it leaves `X-Forwarded-Host` untouched.
- **Failure scenario:** Same as B — callback URL manipulation. This is listed separately because the fix belongs in the deploy script's nginx template.
- **Confidence:** High
- **Fix:** Add `proxy_set_header X-Forwarded-Host "";` and `proxy_set_header X-Forwarded-Port "";` in the upstream location blocks, or explicitly set them to the canonical values.

#### V. Committed static-site nginx template still limits uploads to 1 MiB
- **Location:** `scripts/online-judge.nginx.conf:85` and `scripts/online-judge.nginx.conf:95`
- **Causal path:** The committed template sets `client_max_body_size 1m` in both the `/api/v1/judge/` and catch-all `location /` blocks. The deploy script generates a 50 MiB config, but an operator who copies this committed template directly will enforce 1 MiB.
- **Failure scenario:** A deployment that uses the committed template rejects the 50 MiB file uploads that the app is designed to accept. Users see 413 errors and cannot submit files.
- **Confidence:** Medium
- **Fix:** Update the committed template to `client_max_body_size 50M;` and add a comment warning that it must stay in sync with `deploy-docker.sh`.

#### W. Worker source sync excludes `.env*` and only updates `JUDGE_BASE_URL`
- **Location:** `deploy-docker.sh:1464-1498`
- **Causal path:** The rsync excludes `.env*`, and the post-sync step calls `_worker_upsert_env_literal JUDGE_BASE_URL ...` only. Other environment variables such as `JUDGE_AUTH_TOKEN`, `JUDGE_CONCURRENCY`, or `RUNNER_AUTH_TOKEN` are not synchronized from the app host's `.env.production`.
- **Failure scenario:** An operator rotates `RUNNER_AUTH_TOKEN` in `.env.production` and deploys. The app server gets the new token, but the dedicated worker host keeps the old token in its `.env`. The worker's runner sidecar requests are rejected as unauthorized, causing all delegated compiler runs to fail.
- **Confidence:** Medium
- **Fix:** After rsync, copy or diff-merge the relevant variables from the app host's `.env.production` into the worker host's env file, not just `JUDGE_BASE_URL`.

#### X. Migration container installs unpinned Drizzle packages
- **Location:** `deploy-docker.sh:1351-1361`
- **Causal path:** The migration step runs `npm install --no-save drizzle-kit drizzle-orm nanoid` inside a fresh `node:24-alpine` container. No `package-lock.json` is used and no version pins are specified.
- **Failure scenario:** A new Drizzle release introduces a breaking change in `push` behavior or column-type inference. The deploy runs the latest version and corrupts/migrates the schema differently than the pinned app image.
- **Confidence:** Medium
- **Fix:** Pin exact versions matching `package.json`/`package-lock.json` and install from the lockfile, or build a dedicated migration image with the same dependencies as the app.

#### Y. PG volume safety check uses unvalidated `rm -rf`
- **Location:** `scripts/pg-volume-safety-check.sh:285-287`
- **Causal path:** After computing `NAMED_SRC` from `docker volume inspect`, the script runs `sudo bash -c "shopt -s dotglob; rm -rf ${NAMED_SRC}/*"`.
- **Failure scenario:** If `docker volume inspect` returns an empty string due to a plugin error, or if `NAMED_SRC` is ever set to `/`, the script recursively deletes the root filesystem. The variable is not validated against a known prefix.
- **Confidence:** Medium
- **Fix:** Validate that `NAMED_SRC` starts with the expected Docker volume mount prefix (e.g., `/var/lib/docker/volumes/`) before running `rm -rf`.

#### Z. Test-backends script stops the production compose stack
- **Location:** `deploy-test-backends.sh:195-197`
- **Causal path:** The script brings down the production compose stack before starting the test stack.
- **Failure scenario:** An operator runs the test-backends script against the wrong host or forgets to set a target override. Production stops, causing downtime and possibly orphaning in-flight judging containers.
- **Confidence:** Medium
- **Fix:** Require an explicit `--target=test` flag and refuse to operate on hosts/domains that match the production inventory unless `FORCE_TEST_BACKENDS=1` is set.

#### AA. Raw SQL backfill/drop is destructive even when gated
- **Location:** `deploy-docker.sh:1253-1311`
- **Causal path:** When `ALLOW_SECRET_TOKEN_BACKFILL=1`, the script runs `UPDATE ...` and `ALTER TABLE ... DROP COLUMN secret_token` directly against the production database.
- **Failure scenario:** An operator sets the flag on the wrong environment or before all workers have re-registered. Rows with non-null `secret_token` and null `secret_token_hash` lose their authentication secret and cannot authenticate until manually re-registered.
- **Confidence:** Low
- **Fix:** Add a pre-check that counts rows needing backfill and aborts if any worker has not yet migrated; require the operator to confirm the count interactively.

---

## Final Sweep: Race Conditions, Ordering Bugs, and Latent Failure Modes

### Race conditions

1. **Global submission queue limit (R).** The per-user advisory lock does not protect the global `COUNT(*)` query. Concurrent inserts can overshoot the configured limit.
2. **Similarity check last-writer overwrite (E).** Two concurrent runs read the same snapshot and the second deletes+inserts after the first finishes, duplicating work.
3. **Judge claim reclaim vs. in-flight worker (I).** A stale claim can be reclaimed while the original worker is still executing. The original worker ignores 403 responses and continues running.
4. **Rate-limit first-insert race in DB path.** `insertRateLimitEntryIfAbsent` is correctly guarded, but the sidecar and DB counters can diverge under load (T).

### Ordering bugs

1. **Role type guard before membership check (A).** `isUserRole` short-circuits custom role authorization.
2. **File DELETE DB before disk (N).** A successful DB delete followed by a failed disk delete creates orphan files.
3. **File upload disk before DB (O).** A DB failure after disk write relies on best-effort cleanup.

### Latent failure modes

1. **Unbounded judging time via in-progress reports (K).** No absolute duration ceiling means a single misbehaving worker can monopolize a submission indefinitely.
2. **`activeTasks` drift (L).** Without a periodic reconciler, capacity counters can become permanently wrong.
3. **Rust runner accepting work while unhealthy (H).** The health endpoint can be red while `/run` keeps returning failures.
4. **SSE global lock bottleneck (P).** Under load the single advisory lock becomes a global throughput limiter.
5. **Host-header trust chain (B, U).** The combination of forced `AUTH_TRUST_HOST=true` and unfiltered `X-Forwarded-Host` is an open invitation to callback manipulation.
6. **Sidecar state loss on restart (S).** The in-memory sidecar is not the authority, but its block decisions are not persisted.

---

## Recommended Priority Order

1. **Fix host-header trust chain** (B, U) — High confidence, security impact.
2. **Add global lock for submission queue cap** (R) — High confidence, correctness impact.
3. **Cap total judging time** (K) — High confidence, queue health impact.
4. **Reject `/run` when docker capability is unhealthy** (H) — High confidence, prevents silent sweeps.
5. **Shard SSE advisory lock** (P) — High confidence, scalability impact.
6. **Extend similarity advisory lock over compute** (E) — Medium confidence, correctness/efficiency.
7. **Abort worker judging on invalid claim** (I) — Medium confidence, resource waste.
8. **Add rate limit to file download** (M) — Medium confidence, DoS resilience.
9. **Sync worker env variables beyond `JUDGE_BASE_URL`** (W) — Medium confidence, prevents auth drift.
10. **Pin migration dependencies** (X), **validate PG volume path** (Y), **update static nginx template** (V) — Medium confidence, operational safety.

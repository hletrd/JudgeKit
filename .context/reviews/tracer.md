# Causal Tracer Review — /tmp/judgekit-local

**Scope:** Suspicious or complex flows in JudgeKit: contest join, similarity check, compiler execute, IP security/rate limiting, judge claim/poll/heartbeat/deregister, file upload/download, API authorization, real-time coordination, and deployment scripts.  
**Constraints:** Read-only review; no fixes applied. All work performed only in `/tmp/judgekit-local`.  
**Date:** 2026-07-03  
**Evidence base:** Source code, project docs (`CLAUDE.md`, `AGENTS.md`), the Cycle 2 aggregate at `.context/reviews/_aggregate.md`, the previous tracer review, focused subagent traces, and spot-test runs.

---

## 1. Methodology

1. **Inventory** — Map each target flow from the public API surface through middleware, business logic, DB, sidecars, and (where relevant) the Rust worker.
2. **Causal trace** — Follow data transformations, trust boundaries, concurrency primitives, and failure-handling paths end-to-end.
3. **Competing hypotheses** — For every suspicious observation, formulate a benign/intended hypothesis and a failure/exploit hypothesis, then weigh evidence for and against each.
4. **Confidence classification** — `High` = directly observable in code/tests; `Medium` = inferential but strongly supported; `Low` = edge-case or contingent on operator/environmental factors.
5. **Final sweep** — Re-scan for unawaited side effects, global locks, shared `unknown` buckets, fire-and-forget cleanup, and commonly missed distributed-state gaps.

---

## 2. Flow Trace Summaries

### 2.1 Contest Join (`POST /api/v1/contests/join`)

`/tmp/judgekit-local/src/app/api/v1/contests/join/route.ts` → recruiting-access rejection (before rate limit) → `createApiHandler` IP-keyed `contest:join` rate limit → `redeemAccessCode` (`src/lib/assignments/access-codes.ts`). On failure, consumes per-user `contest:join:invalid` then per-code `contest:join:invalid-code`. Success does not clear the failure buckets.

### 2.2 Similarity Check (`POST /api/v1/contests/[id]/similarity-check`)

`route.ts` → `canRunSimilarityCheck` (manager → capability → group-TA → assigned instructor) → 30 s `AbortController` → `runAndStoreSimilarityCheck` (`code-similarity.ts`). The raw CTE query runs before the timer is effectively bounded; the Rust sidecar now receives the composed signal; the delete+insert store is serialized per assignment with `pg_advisory_xact_lock`.

### 2.3 Compiler Execute (`/lib/compiler/execute.ts`)

`executeCompilerRun` → source-code null-byte + size checks → Docker image allowlist → `validateShellCommandStrict` → Rust runner (`COMPILER_RUNNER_URL`) with hard-coded `max(timeLimitMs * 4, 120_000)` timeout → local Docker fallback with `--network=none`, `--cap-drop=ALL`, seccomp, unprivileged user. Workspace cleanup now `chown`s back to the app UID before removal.

### 2.4 IP Security & Rate Limiting

`extractClientIp` (`ip.ts`) validates `X-Forwarded-For` hop count, unwraps IPv4-mapped IPv6, returns `null` in production when the chain is missing or too short. Rate-limit keys use `extractClientIp(headers) ?? "unknown"` (`rate-limit.ts`). The sidecar fast path (`rate-limiter-client.ts`) is circuit-breakered and fail-open; when it returns `allowed=false`, the DB path is skipped.

### 2.5 Judge Claim Lifecycle

- **Register:** `/api/v1/judge/register` accepts shared `JUDGE_AUTH_TOKEN`, IP-rate-limited, creates worker row with `secretTokenHash`.  
- **Claim:** `/api/v1/judge/claim` requires `workerId` + `workerSecret`, enforces IP allowlist, runs atomic `buildClaimSql` with `FOR UPDATE SKIP LOCKED` and stale-claim reclamation.  
- **Poll:** `/api/v1/judge/poll` accepts only per-worker auth; in-progress reports reset `judgeClaimedAt` with no absolute ceiling.  
- **Heartbeat:** `/api/v1/judge/heartbeat` updates `lastHeartbeatAt` and triggers inline stale-worker sweep.  
- **Deregister:** `/api/v1/judge/deregister` atomically marks worker offline and releases claimed submissions.

### 2.6 File Upload / Download

- **Upload:** `POST /api/v1/files` → validation → `writeUploadedFile` with mode `0o600`, then DB insert.  
- **Download:** `GET /api/v1/files/[id]` → auth, access check, full file read into a `Buffer`, then response. No rate limit.

### 2.7 API Authorization (`createApiHandler`)

`createApiHandler` (`handler.ts`) wraps routes with rate limiting, auth, CSRF, body parsing, Zod validation, and role/capability checks. The role check validates the user's role against a built-in enum before honoring the route's `auth.roles` array.

### 2.8 Real-Time Coordination

`src/lib/realtime/realtime-coordination.ts` provides process-local mode (single instance) and PostgreSQL advisory-lock mode (`REALTIME_COORDINATION_BACKEND=postgresql`). SSE slot acquisition uses a single global advisory lock (`realtime:sse:acquire`). Release deletes the coordination row without holding the same lock.

### 2.9 Deploy Scripts (`deploy-docker.sh`)

`deploy-docker.sh` → local env profile hardening → app-only guard for `algo.xylolabs.com` → SSH multiplexing → pre-deploy DB backup + PG volume safety check → raw SQL additive patches (`secret_token` backfill/drop) → app-only compose up → dedicated worker sync → generated nginx with catch-all `client_max_body_size 50M` and security headers.

---

## 3. Findings

### 3.1 Findings Table

| ID | Flow | Observation | Severity | Confidence | Status |
|---|---|---|---|---|---|
| **T-JUDGE-2** | Judge poll | In-progress reports reset `judgeClaimedAt`, allowing a worker to extend a claim indefinitely. | **HIGH** | High | Confirmed |
| **T-AUTH-1** | API handler | `createApiHandler` role check rejects custom roles via `isUserRole()`, breaking `auth.roles` for non-built-in roles. | **HIGH** | High | Confirmed |
| **T-DEPLOY-7** | Deploy | Fresh production deployments set neither `JUDGE_ALLOWED_IPS` nor `JUDGE_STRICT_IP_ALLOWLIST`, so judge API allowlist is open to all IPs. | **HIGH** | High | Confirmed |
| **T-DEPLOY-4** | Deploy / auth | `AUTH_TRUST_HOST=true` in production; nginx does not strip a client-supplied `X-Forwarded-Host`. | **HIGH** | High | Confirmed |
| **T-FILES-1** | File download | `GET /api/v1/files/[id]` loads the entire file into memory and has no rate limit. | **HIGH** | High | Confirmed |
| **RT-1** | Real-time | SSE connection acquisition uses a single global PostgreSQL advisory lock. | **HIGH** | High | Confirmed |
| **SIM-1** | Similarity | Rust sidecar `spawn_blocking` task is not cancellable; client disconnect leaves CPU pinned. | **HIGH** | Medium | Likely |
| **DEPLOY-3** | Deploy | Migration containers run unpinned `npm install --no-save drizzle-kit ...` with full DB secrets. | **HIGH** | High | Confirmed |
| **DEPLOY-5** | Deploy | `deploy-test-backends.sh` can stop the production compose stack without a production guard. | **HIGH** | Medium | Confirmed |
| **DEPLOY-6** | Deploy | `pg-volume-safety-check.sh` auto-migrate uses `rm -rf ${NAMED_SRC}/*` without path validation. | **HIGH** | Medium | Confirmed |
| **DEPLOY-7** | Deploy | Legacy `deploy.sh` remains executable and bypasses hardened deploy path. | **HIGH** | Medium | Confirmed |
| **SUB-1** | Submissions | Global pending-queue cap is checked without a global lock, allowing cross-user races to exceed `maxGlobalQueue`. | **MEDIUM** | Medium | Likely |
| **RT-2** | Real-time | `releaseSharedSseConnectionSlot` deletes rows without acquiring the advisory lock used by acquisition. | **MEDIUM** | Medium | Confirmed |
| **RATE-1** | Rate limit | Sidecar `allowed=false` verdict returns 429 without recording the attempt in Postgres. | **MEDIUM** | High | Confirmed |
| **RATE-2** | Rate limit | Sidecar `/check` increments its own counter, duplicating the authoritative DB increment. | **MEDIUM** | High | Confirmed |
| **COMP-1** | Compiler | `/api/v1/compiler/run` has no overall request timeout; runner connect can hang for up to 2 minutes. | **MEDIUM** | Medium | Confirmed |
| **COMP-2** | Compiler | Rust runner `/run` does not check `docker_capability_ok` before accepting work. | **MEDIUM** | Medium | Confirmed |
| **JOIN-1** | Contest join | Per-user failure limiter runs before per-code limiter, giving multi-account attackers N independent budgets. | **MEDIUM** | High | Confirmed |
| **JOIN-2** | Contest join | Failure-rate-limit buckets are never reset on a successful redemption. | **MEDIUM** | High | Confirmed |
| **IP-RL-1** | IP / rate limit | Missing/short XFF collapses traffic into the shared `api:*:unknown` bucket. | **MEDIUM** | High | Confirmed |
| **SIM-2** | Similarity | Raw CTE query is not abort-aware and runs inside the 30 s route budget. | **MEDIUM** | High | Confirmed |
| **SIM-3** | Similarity | Advisory lock covers only the delete+insert store, not the read+compute phase. | **MEDIUM** | High | Likely |
| **SIM-4** | Similarity | Capability check precedes group-TA check; pure group TA without the capability is denied. | **MEDIUM** | Medium | Risk |
| **AUTH-3** | Auth | Role/capability cache is module-local with no cross-instance invalidation. | **MEDIUM** | High | Confirmed |
| **AUTH-4** | Auth | CSRF check reads `allowedHosts` from the DB on every mutation. | **MEDIUM** | High | Confirmed |
| **AUTH-5** | Auth | Generic 500 catch-all returns identical `internalServerError` for all unhandled exceptions. | **MEDIUM** | High | Residual |
| **FILES-2** | Files | `GET /api/v1/files` (list) has no `rateLimit` key and performs expensive `COUNT(*) OVER()` + `LIKE` search. | **MEDIUM** | High | Confirmed |
| **T-JUDGE-3** | Rust worker | Runner HTTP server handle is aborted during shutdown without draining in-flight `/run` requests. | **MEDIUM** | Medium | Confirmed |
| **DEPLOY-8** | Deploy | Deploy is not atomic: old containers are stopped before migrations/health checks pass; no auto-rollback. | **MEDIUM** | Medium | Confirmed |
| **DEPLOY-9** | Deploy | Worker sync excludes `.env*` and only upserts `JUDGE_BASE_URL`; worker tokens may be missing on fresh hosts. | **MEDIUM** | Medium | Confirmed |
| **DEPLOY-10** | Deploy | Committed `scripts/online-judge.nginx.conf` still sets `client_max_body_size 1m` in catch-all `location /`. | **MEDIUM** | High | Confirmed |
| **DEPLOY-11** | Deploy | No `stop_grace_period` in compose; Docker kills containers after 10 s. | **MEDIUM** | Medium | Confirmed |
| **DEPLOY-12** | Deploy | Raw SQL additive patches (`secret_token` backfill/drop) bypass the Drizzle migration journal. | **MEDIUM** | Medium | Confirmed |
| **DEPLOY-13** | Deploy | Post-deploy Playwright smoke runs after all remote mutations; failure leaves broken state live. | **MEDIUM** | Medium | Confirmed |
| **DEPLOY-14** | Deploy | `deploy-test-backends.sh` falls back to hard-coded `judgekit_test` password if grep fails. | **MEDIUM** | Medium | Confirmed |
| **DEPLOY-15** | Deploy | No mutex prevents concurrent deploys to the same host. | **MEDIUM** | Medium | Confirmed |
| **COMP-3** | Compiler | Language validation runs after the sandbox-quota gate; invalid languages can consume daily quota. | **LOW** | Medium | Confirmed |
| **COMP-4** | Compiler | Container cleanup is fire-and-forget; `cleanup()` does not await `docker rm`. | **LOW** | Medium | Confirmed |
| **COMP-5** | Compiler | Workspace cleanup depends on `CAP_CHOWN`/`CAP_DAC_OVERRIDE`; hardened runtimes may still leak. | **LOW** | Medium | Risk |
| **FILES-3** | Files | `DELETE` removes the DB row before disk object; disk orphan possible. | **LOW** | Medium | Confirmed |
| **FILES-4** | Files | Upload writes disk before DB insert; crash between the two leaves orphan file. | **LOW** | Medium | Confirmed |
| **RT-3** | Real-time | `shouldRecordSharedHeartbeat` fetches DB time before acquiring the advisory lock. | **LOW** | Medium | Risk |
| **RT-4** | Real-time | `acquireSharedSseConnectionSlot` computes `expiresAt` from a timestamp fetched before the global lock. | **LOW** | Medium | Risk |
| **DEPLOY-16** | Deploy | Backup retention `find ... -delete` has no lower-bound validation. | **LOW** | Medium | Confirmed |
| **DEPLOY-17** | Deploy | `docker builder prune -af` deletes all unused build cache during deploy. | **LOW** | High | Confirmed |

---

## 4. Detailed Findings

### T-JUDGE-2 — In-progress judging can extend a claim indefinitely

**Observation:** In `/tmp/judgekit-local/src/app/api/v1/judge/poll/route.ts:82-112`, when a worker reports any status in `IN_PROGRESS_JUDGE_STATUSES`, the handler updates `judgeClaimedAt` to the current DB time. There is no absolute ceiling on total judging time.

**Hypothesis A (benign/intended):** Periodic in-progress reports are the intended heartbeat mechanism; resetting the timestamp proves the worker is alive.

**Hypothesis B (failure/exploit):** A buggy or compromised worker can keep a submission in `judging` forever by posting in-progress status before the stale timeout. The submission is never re-queued, so the user sees a stuck submission and the queue slot is permanently occupied.

**Evidence:**
- `poll/route.ts:91-92`: `judgeClaimedAt: dbNow` is set for every in-progress update.
- `claim-query.ts` / stale sweep compares `judge_claimed_at < NOW() - staleClaimTimeoutMs`.
- No `maxJudgingDurationMs` or `judgeStartedAt` absolute ceiling exists.

**Severity:** HIGH. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Add a `maxJudgingDurationMs` guard. Reject in-progress updates (or force-reset the submission to `pending`) when the total time since the original claim exceeds the ceiling. Persist the original claim timestamp or add a `judgeStartedAt` column.

---

### T-AUTH-1 — `createApiHandler` rejects custom roles

**Observation:** `/tmp/judgekit-local/src/lib/api/handler.ts:201-202` calls `isUserRole(user.role)` before checking whether the user's role is in the route's `auth.roles` array. `isUserRole()` only accepts the five built-in roles.

**Hypothesis A (benign/intended):** Only built-in roles are expected; custom roles should be modeled via capabilities.

**Hypothesis B (failure/exploit):** A deployment introduces a custom role (e.g., `external_instructor`) and restricts an admin route to it. The route becomes unreachable for that role, silently breaking authorization policy.

**Evidence:**
- `handler.ts:201-202`: `if (!isUserRole(user.role) || !auth.roles.includes(user.role)) return forbidden(...);`.
- `src/lib/security/constants.ts`: `isUserRole` accepts only built-in enum values.

**Severity:** HIGH. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Remove the `isUserRole` guard from the handler role check; verify only `auth.roles.includes(user.role)`. Update `assertRole()` in server actions similarly.

---

### T-DEPLOY-7 — Judge allowlist defaults to allow-all on fresh deploys

**Observation:** `/tmp/judgekit-local/src/lib/judge/ip-allowlist.ts:209-232` returns `true` for every IP when `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `"1"`. Neither variable is generated by `deploy-docker.sh` or set in `docker-compose.production.yml`.

**Failure scenario:** A leaked `JUDGE_AUTH_TOKEN` allows any internet host to register fake workers, claim submissions (reading `sourceCode` and hidden test cases), and inject arbitrary verdicts.

**Severity:** HIGH. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Generate `.env.production` with `JUDGE_ALLOWED_IPS` restricted to worker subnets, or set `JUDGE_STRICT_IP_ALLOWLIST=1` by default and require explicit allowlist configuration.

---

### T-DEPLOY-4 — `AUTH_TRUST_HOST=true` in production with no `X-Forwarded-Host` stripping

**Observation:** `deploy-docker.sh` writes `AUTH_TRUST_HOST=true` into `.env.production` (`deploy-docker.sh:952`). `src/lib/security/env.ts:260-266` returns `true` in production when the env var is `"true"`. Generated nginx comments explicitly say "Do NOT set X-Forwarded-Host" but do not strip a client-supplied one.

**Failure scenario:** A direct HTTPS request to the origin with `Host: attacker.com` or `X-Forwarded-Host: attacker.com` can cause NextAuth to generate password-reset / email-verification links and session state bound to an attacker-controlled domain.

**Severity:** HIGH. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Default `AUTH_TRUST_HOST=false` when `AUTH_URL` is explicitly set; have nginx explicitly overwrite or remove `X-Forwarded-Host` before proxying to the app.

---

### T-FILES-1 — File download lacks rate limiting and streams from memory

**Observation:** `/tmp/judgekit-local/src/app/api/v1/files/[id]/route.ts:100-105` reads the entire uploaded file into a `Buffer` before responding. The `GET` handler has no `rateLimit` config.

**Failure scenario:** An authenticated caller requests several large files concurrently (default upload limit is 50 MiB). Each request allocates a full Buffer, spiking the Node.js heap and potentially OOM-ing the app server. An attacker can also enumerate file IDs without throttling.

**Severity:** HIGH. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Stream from disk (`fs.createReadStream` / web `ReadableStream`) and add `rateLimit: "files:download"` to the `GET` handler.

---

### RT-1 — SSE coordination uses a single global advisory lock

**Observation:** `/tmp/judgekit-local/src/lib/realtime/realtime-coordination.ts:101` acquires `pg_advisory_xact_lock(('x' || md5('realtime:sse:acquire'))::bit(64)::bigint)` for every `acquireSharedSseConnectionSlot` call.

**Failure scenario:** A contest with 1,000 concurrent students opening the submissions page serializes every SSE connection acquisition through one DB lock. Lock wait times spike, connection setup latency degrades, and legitimate clients receive `serverBusy` (503) or timeout.

**Severity:** HIGH. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Shard the lock by `userId` or `connectionId`, or replace the lock with an atomic INSERT-based quota check using a partial unique index on active slots.

---

### SIM-1 — Rust sidecar `spawn_blocking` task is not cancellable

**Observation:** `/tmp/judgekit-local/code-similarity-rs/src/main.rs:126-128` spawns the CPU-intensive `compute_similarity` via `tokio::task::spawn_blocking` with no cancellation token. Axum dropping the handler future on client disconnect does **not** abort the blocking task.

**Failure scenario:** A caller aborts after the 30 s route timeout. The HTTP request is cancelled on the Node side, but the Rust sidecar thread continues the full O(n²) comparison until completion, pinning CPU and delaying subsequent requests.

**Severity:** HIGH. **Confidence:** Medium. **Status:** Likely.

**Suggested fix:** Add an abort token checked inside the pairwise loops, or break work into smaller async-cancellable chunks instead of a single `spawn_blocking`.

---

### DEPLOY-3 — Unpinned migration npm install with DB secrets

**Observation:** `/tmp/judgekit-local/deploy-docker.sh:1336-1341` runs `npm install --no-save drizzle-kit drizzle-orm ...` inside a transient container that mounts `.env.production` with full DB credentials.

**Failure scenario:** A compromised `drizzle-kit` release, registry MITM, or accidental breaking change runs attacker-controlled code inside a container holding `DATABASE_URL` and `POSTGRES_PASSWORD`.

**Severity:** HIGH. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Pin versions from `package-lock.json`; use `npm ci` or a locked migration image; never install `@latest` with DB secrets.

---

### DEPLOY-5 — `deploy-test-backends.sh` can stop production

**Observation:** `/tmp/judgekit-local/deploy-test-backends.sh:194-201` stops the production compose stack (`docker-compose.production.yml down --remove-orphans`) before starting the test stack, with no guard against production targets.

**Failure scenario:** An operator runs `deploy-test-backends.sh` with production env vars; `algo.xylolabs.com` production app is taken down and replaced by a test stack.

**Severity:** HIGH. **Confidence:** Medium. **Status:** Confirmed.

**Suggested fix:** Refuse to run against known production hosts unless `TESTING_ON_PRODUCTION=1` is explicitly set.

---

### DEPLOY-6 — Unvalidated `rm -rf` in PG volume safety check

**Observation:** `/tmp/judgekit-local/scripts/pg-volume-safety-check.sh:286-287` auto-migrates using `sudo bash -c "rm -rf ${NAMED_SRC}/*"` without validating that `NAMED_SRC` is a non-empty path under `/var/lib/docker/volumes`.

**Failure scenario:** A bug or unexpected `docker volume inspect` output leaves `NAMED_SRC` empty; `rm -rf /*` destroys the host filesystem.

**Severity:** HIGH. **Confidence:** Medium. **Status:** Confirmed.

**Suggested fix:** Validate `NAMED_SRC` matches `/var/lib/docker/volumes/*/_data` before `rm`; fail closed if validation fails.

---

### DEPLOY-7 — Legacy `deploy.sh` remains executable and dangerous

**Observation:** `/tmp/judgekit-local/deploy.sh` is deprecated but still executable. It builds worker/language images locally, save/load transfers them, generates nginx with `$remote_addr` for XFF, omits security headers, and has no app-only target guard.

**Failure scenario:** An operator uses `deploy.sh` on `algo.xylolabs.com`; worker images are built on the app server, the XFF chain is overwritten, security headers are missing, and DB safety checks are bypassed.

**Severity:** HIGH. **Confidence:** Medium. **Status:** Confirmed.

**Suggested fix:** Remove or hard-disable `deploy.sh`; require `LEGACY_DEPLOY_ACK=1` and refuse production targets if kept.

---

### SUB-1 — Global submission queue cap has no cross-user serialization

**Observation:** `/tmp/judgekit-local/src/app/api/v1/submissions/route.ts:345-430` acquires a per-user advisory lock but checks the global pending/queued count without any global lock.

**Failure scenario:** During a contest start, many users submit simultaneously. The global queue can briefly exceed `maxGlobalQueue`, causing unexpected back-pressure or memory pressure.

**Severity:** MEDIUM. **Confidence:** Medium. **Status:** Likely.

**Suggested fix:** Acquire a global advisory lock around the global-queue check, or move cap enforcement to a DB-level counter/sequence.

---

### RT-2 — SSE release races with acquisition

**Observation:** `/tmp/judgekit-local/src/lib/realtime/realtime-coordination.ts:142-144` deletes the coordination row without acquiring the advisory lock used by acquisition.

**Failure scenario:** A connection is released while another request is inside `acquireSharedSseConnectionSlot` counting active rows. The counter sees a row that is deleted a moment later, allowing a transient 1-slot over-allocation beyond the cap.

**Severity:** MEDIUM. **Confidence:** Medium. **Status:** Confirmed.

**Suggested fix:** Acquire the same advisory lock in `releaseSharedSseConnectionSlot`, or switch to atomic quota enforcement that makes release safe without a lock.

---

### RATE-1 — Sidecar-blocked requests bypass the authoritative DB store

**Observation:** `/tmp/judgekit-local/src/lib/security/api-rate-limit.ts:164-171` returns 429 immediately when the sidecar says blocked, without running `atomicConsumeRateLimit`.

**Failure scenario:** An attacker exhausts the sidecar budget. The sidecar restarts, losing counters. Postgres has no record of the blocked traffic, so the attacker receives a fresh budget until the DB path catches up.

**Severity:** MEDIUM. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Run `atomicConsumeRateLimit` even when the sidecar blocks, or record blocked attempts in the DB before returning 429.

---

### RATE-2 — Rate-limiter sidecar duplicates authoritative counters

**Observation:** `/tmp/judgekit-local/rate-limiter-rs/src/main.rs:262-264` increments `attempts` for every allowed `/check` request. The TypeScript path also increments the DB row.

**Failure scenario:** Every API request causes a write to the sidecar's in-memory store and then a separate DB transaction, doubling increment work and creating drift between the two stores.

**Severity:** MEDIUM. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Make `/check` read-only (no increment) and have the DB path be the sole writer; use the sidecar only to cache block status.

---

### COMP-1 — Compiler run route has no overall timeout

**Observation:** `/tmp/judgekit-local/src/lib/compiler/execute.ts:621-638` uses a hard-coded fetch timeout of `max(timeLimitMs * 4, 120_000)`. `/api/v1/compiler/run` has no overall request timeout.

**Failure scenario:** If the runner sidecar is unreachable, every `/api/v1/compiler/run` request hangs for up to 2 minutes, exhausting Next.js request capacity.

**Severity:** MEDIUM. **Confidence:** Medium. **Status:** Confirmed.

**Suggested fix:** Wrap the route handler in a shorter `AbortSignal.timeout` (e.g., 30 s) or lower the runner connect timeout and fail fast when the runner is unhealthy.

---

### COMP-2 — Rust runner accepts `/run` without Docker capability check

**Observation:** `/tmp/judgekit-local/judge-worker-rs/src/runner.rs:734-830` validates auth and runs the job but does not check `state.docker_capability_ok`.

**Failure scenario:** A worker whose Docker capability probe is failing still accepts `/run` requests, wastes resources, and returns 500 after the Docker call fails instead of rejecting early with 503.

**Severity:** MEDIUM. **Confidence:** Medium. **Status:** Confirmed.

**Suggested fix:** Return `503 SERVICE_UNAVAILABLE` from `/run` when `state.docker_capability_ok` is false.

---

### JOIN-1 — Per-user failure limiter runs before per-code limiter

**Observation:** `/tmp/judgekit-local/src/app/api/v1/contests/join/route.ts:34-41` consumes `contest:join:invalid` (per-user) before `contest:join:invalid-code` (per-code).

**Failure scenario:** An attacker with M accounts gets M independent per-user budgets before the shared per-code bucket becomes the binding constraint, multiplying distributed brute-force attempts against a single access code.

**Severity:** MEDIUM. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Consume the per-code bucket unconditionally before returning the per-user limit response, or reorder so the shared code bucket is checked first.

---

### JOIN-2 — Failure rate limits are never reset on success

**Observation:** On failed redemption, `join/route.ts` consumes invalid buckets. A later successful redemption does not decrement or reset them.

**Failure scenario:** A student who mistypes a code several times, then obtains the correct code, may remain blocked by the per-user invalid bucket for the remainder of the window.

**Severity:** MEDIUM. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Clear the relevant invalid buckets on a successful `redeemAccessCode` result.

---

### IP-RL-1 — Shared `unknown` rate-limit bucket for missing XFF

**Observation:** `/tmp/judgekit-local/src/lib/security/rate-limit.ts:46` builds keys like `${action}:${extractClientIp(headers) ?? "unknown"}`. In production, `extractClientIp` returns `null` when the chain is too short.

**Failure scenario:** A single actor that can bypass the proxy or submit a shorter XFF chain lands in the same `api:contest:join:unknown` bucket. One attacker can exhaust the endpoint limit and block all such traffic.

**Severity:** MEDIUM. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** For sensitive endpoints, reject requests with undeterminable IP (return 429 or 403) instead of using a shared bucket; or configure a separate, tighter limit for the `unknown` bucket.

---

### SIM-2 — Similarity raw query is not abort-aware

**Observation:** `/tmp/judgekit-local/src/lib/assignments/code-similarity.ts:332-341` calls `rawQueryAll` between `signal?.aborted` checks, with no query cancellation mechanism. The 30 s route timer covers the whole request.

**Failure scenario:** A large assignment's CTE query consumes most of the budget before similarity computation begins; the route returns `timed_out` and the operator cannot tell whether the DB or the engine was slow.

**Severity:** MEDIUM. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Move the timer start to after the query, or wrap the query in a PostgreSQL `statement_timeout` with a distinct error reason.

---

### SIM-3 — Advisory lock covers only the store phase

**Observation:** `/tmp/judgekit-local/src/lib/assignments/code-similarity.ts:456, 490` awaits `runSimilarityCheck` (read + compute) before wrapping the delete+insert in `withPgAdvisoryLock`.

**Failure scenario:** Two concurrent scans both read submissions and compute pairs (possibly hitting the sidecar twice), then serialize only at store time. The second transaction overwrites the first; CPU is wasted and snapshot differences are silently resolved by last-writer-wins.

**Severity:** MEDIUM. **Confidence:** High. **Status:** Likely.

**Suggested fix:** Extend the lock to cover read+compute+store, or introduce an assignment-level "running" marker to deduplicate concurrent requests.

---

### SIM-4 — Similarity capability check precedes group-TA check

**Observation:** `/tmp/judgekit-local/src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24` checks `anti_cheat.run_similarity` before `isGroupTA` / `getAssignedTeachingGroupIds`.

**Failure scenario:** A pure group TA whose role lacks `anti_cheat.run_similarity` is denied. If the UI shows the affordance based on group membership, the route silently contradicts it.

**Severity:** MEDIUM. **Confidence:** Medium. **Status:** Risk.

**Suggested fix:** Add a route test for pure group-TA access; clarify whether the capability or group role is the canonical gate.

---

### AUTH-3 — Role/capability cache has no cross-instance invalidation

**Observation:** `/tmp/judgekit-local/src/lib/capabilities/cache.ts:17-20` holds module-level `roleCache` with a 60 s TTL. `invalidateRoleCache()` only mutates the local process.

**Failure scenario:** In a horizontally scaled deployment, an admin revokes a capability from a role on instance A. Instance B continues to authorize that capability for up to 60 seconds.

**Severity:** MEDIUM. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Use a shared cache-buster row / Redis pub-sub / or reduce TTL and add stampede-safe reload so role changes propagate to all instances.

---

### AUTH-4 — CSRF check queries DB `allowedHosts` on every mutation

**Observation:** `/tmp/judgekit-local/src/lib/security/csrf.ts:57` awaits `getExpectedHosts(request)`, which calls `getAllowedHostsFromDb()` (`env.ts:243-252`) on every POST/PUT/PATCH/DELETE.

**Failure scenario:** A slow `system_settings` query (DB overload, lock contention) delays every state-changing API request, turning a partial DB slowdown into a site-wide mutation outage.

**Severity:** MEDIUM. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Cache `allowedHosts` for a short TTL (5–15 s) or read from an already-cached system settings snapshot; add a bounded timeout and fail-closed.

---

### AUTH-5 — Generic 500 catch-all can drive retry storms

**Observation:** `/tmp/judgekit-local/src/lib/api/handler.ts:303-310` returns `{ error: "internalServerError", requestId }` with HTTP 500 for every unhandled exception. There is no transient/permanent classification.

**Failure scenario:** A transient DB connection-pool exhaustion causes 500s. Clients and workers retry, increasing load and prolonging the outage.

**Severity:** MEDIUM. **Confidence:** High. **Status:** Residual.

**Suggested fix:** Map known transient errors (pool exhaustion, query timeout) to `OperationalError("serviceUnavailable", ..., 503)` with a `Retry-After` header; reserve `internalServerError` for unexpected bugs.

---

### FILES-2 — File list endpoint lacks rate limiting

**Observation:** `/tmp/judgekit-local/src/app/api/v1/files/route.ts:155-208` has no `rateLimit` key and performs a `LEFT JOIN`, `COUNT(*) OVER()`, and optional `LIKE` search.

**Failure scenario:** An authenticated attacker scrapes paginated file metadata without throttling, driving sustained DB load and enumerating all uploaded files' metadata.

**Severity:** MEDIUM. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Add `rateLimit: "files:list"` (or reuse `"files:upload"`) to the `GET` handler config.

---

### T-JUDGE-3 — Rust worker runner server aborts without draining

**Observation:** `/tmp/judgekit-local/judge-worker-rs/src/main.rs:686-690` aborts the runner HTTP server handle during graceful shutdown.

**Failure scenario:** In-flight verdict submissions or `/run` requests may be lost or orphaned containers left running during a restart.

**Severity:** MEDIUM. **Confidence:** Medium. **Status:** Confirmed.

**Suggested fix:** Add a graceful shutdown handler that waits for active requests to complete within a bounded timeout.

---

### DEPLOY-8 — Deploy is not atomic and has no rollback

**Observation:** `/tmp/judgekit-local/deploy-docker.sh:1182-1384` stops old containers before migrations and health checks run. There is no automatic rollback if a migration or health check fails.

**Failure scenario:** A bad migration or slow app startup causes the deploy to die after `down`; the old containers are already gone, leaving the service down until manual recovery.

**Severity:** MEDIUM. **Confidence:** Medium. **Status:** Confirmed.

**Suggested fix:** Tag the previous running image/container set before `down`; on failure, automatically roll back.

---

### DEPLOY-9 — Worker env sync may omit required tokens

**Observation:** `/tmp/judgekit-local/deploy-docker.sh:1446-1482` excludes `.env*` and only upserts `JUDGE_BASE_URL`. Required worker tokens must already exist in the remote `.env`.

**Failure scenario:** First use of `WORKER_HOSTS` on a fresh worker leaves `JUDGE_AUTH_TOKEN`/`RUNNER_AUTH_TOKEN` unset; the worker fails to start and the health check dies.

**Severity:** MEDIUM. **Confidence:** Medium. **Status:** Confirmed.

**Suggested fix:** Backfill `JUDGE_AUTH_TOKEN`, `RUNNER_AUTH_TOKEN`, etc. from the app `.env.production` into the worker `.env` during sync.

---

### DEPLOY-10 — Committed nginx template still has 1 MiB catch-all body limit

**Observation:** `/tmp/judgekit-local/scripts/online-judge.nginx.conf:94` sets `client_max_body_size 1m` in the catch-all `location /`.

**Failure scenario:** Manual installs using the committed template reject file uploads, admin restore ZIPs, or imports >1 MiB with `413 Payload Too Large`.

**Severity:** MEDIUM. **Confidence:** High. **Status:** Confirmed.

**Suggested fix:** Update the template's `location /` to `client_max_body_size 50M;` (or align with `MAX_IMPORT_BYTES`).

---

### DEPLOY-11 — No `stop_grace_period` in production compose

**Observation:** `/tmp/judgekit-local/docker-compose.production.yml` does not configure `stop_grace_period`; Docker defaults to 10 s before SIGKILL.

**Failure scenario:** A deploy `down` stops the app/worker mid-request; in-flight judge results or similarity checks are aborted, causing inconsistent submission state.

**Severity:** MEDIUM. **Confidence:** Medium. **Status:** Confirmed.

**Suggested fix:** Add `stop_grace_period: 30s` (or longer) to `app`, `judge-worker`, and `db` services.

---

### DEPLOY-12 — Raw SQL additive patches bypass Drizzle journal

**Observation:** `/tmp/judgekit-local/deploy-docker.sh:1246-1293` applies `secret_token` backfill/drop via raw `psql` after `drizzle-kit push`. Because the column is already absent by the time `push` runs, the journal does not capture the transition.

**Failure scenario:** A DR replay from the journal produces a schema inconsistent with current app expectations (still containing `secret_token` or missing hash cleanup).

**Severity:** MEDIUM. **Confidence:** Medium. **Status:** Confirmed.

**Suggested fix:** Convert the backfill/drop into a numbered, idempotent Drizzle migration; sunset the script step only after all envs are verified clean.

---

### DEPLOY-13 — Smoke tests run after all mutations

**Observation:** `/tmp/judgekit-local/deploy-docker.sh:1776-1801` runs Playwright smoke tests after images, migrations, and nginx config are already live.

**Failure scenario:** Smoke catches a bug after the new stack is live; the site is left in a broken deployed state.

**Severity:** MEDIUM. **Confidence:** Medium. **Status:** Confirmed.

**Suggested fix:** Roll back to previous image tags on smoke failure, or run smoke before nginx reload and final cutover.

---

### DEPLOY-14 — Test-backend password fallback

**Observation:** `/tmp/judgekit-local/deploy-test-backends.sh:246-252` falls back to the hard-coded guess `judgekit_test` if the grep from `.env.production` fails.

**Failure scenario:** Wrong password causes `drizzle-kit push` to fail; the test backend starts with no schema and 500s on every DB query.

**Severity:** MEDIUM. **Confidence:** Medium. **Status:** Confirmed.

**Suggested fix:** Die if `POSTGRES_PASSWORD` cannot be read; remove the fallback password.

---

### DEPLOY-15 — No mutex prevents concurrent deploys

**Observation:** `/tmp/judgekit-local/deploy-docker.sh` has no remote lock file or CI-level mutex.

**Failure scenario:** Two CI jobs or operators deploy simultaneously; `docker compose` state interleaves, worker sync races, or nginx temp path logic is stressed.

**Severity:** MEDIUM. **Confidence:** Medium. **Status:** Confirmed.

**Suggested fix:** Add a remote `flock`-based deploy lock (e.g., `/var/lock/judgekit-deploy`) or a CI-level mutex.

---

## 5. Fixed / Changed Findings (Cross-Check)

| Prior ID / Source | Topic | Status in Current Tree | Evidence |
|---|---|---|---|
| Aggregate HIGH | Public auth routes bypass CSRF | **Fixed** | `forgot-password`, `verify-email`, `reset-password` now call `validateCsrf`. |
| Aggregate HIGH | Token revocation 1-second grace | **Fixed** | `session-security.ts:36-41` compares millisecond precision. |
| Aggregate HIGH | Rust `deregister` returns `Ok` on non-2xx | **Fixed** | `judge-worker-rs/src/api.rs:154-158` now returns `Err`. |
| Aggregate HIGH | Compiler workspace leak after `chown` | **Fixed** | `execute.ts:cleanupCompilerWorkspace` chowns back before `rm`. |
| Aggregate HIGH | Rust executor/runner workspace leaks | **Fixed** | `judge-worker-rs/src/workspace.rs` implements `SandboxWorkspace` drop. |
| Aggregate HIGH | Rate-limiter wall-clock time | **Fixed** | `rate-limiter-rs/src/main.rs` uses monotonic `Instant`. |
| Aggregate HIGH | Similarity concurrent delete/insert race | **Fixed** | `code-similarity.ts:490-508` uses `pg_advisory_xact_lock`. |
| Aggregate HIGH | Similarity sidecar ignores signal | **Fixed** | `code-similarity-client.ts:57-58` uses `AbortSignal.any`. |
| Aggregate HIGH | Similarity "timed out" string match | **Fixed** | `similarity-check/route.ts:56` checks only `AbortError`. |
| Aggregate HIGH | Standalone nginx XFF overwrite | **Fixed in templates** | Committed templates now use `$proxy_add_x_forwarded_for`; legacy `deploy.sh:257` still uses `$remote_addr`. |
| Aggregate CRITICAL | Catch-all `client_max_body_size` | **Fixed in deploy** | Generated config has 50M catch-all; committed `scripts/online-judge.nginx.conf` still has 1m (DEPLOY-10). |
| Aggregate HIGH | `deploy-test-backends.sh` migrations in app container | **Fixed** | Uses dedicated migration containers. |
| Aggregate MEDIUM | Docker network segmentation | **Fixed** | `docker-compose.production.yml` defines isolated networks. |
| Aggregate MEDIUM | Worker container runs as root | **Fixed** | `Dockerfile.judge-worker` sets `USER judge`. |
| Aggregate MEDIUM | Generated nginx security headers | **Fixed** | Generated config includes baseline headers. |
| T-DEPLOY-1 | Unfiltered `docker container prune -f` | **Fixed** | Now uses `--filter 'until=24h'`. |
| T-DEPLOY-5 | `sshpass -p` password in process list | **Changed** | Now uses `sshpass -e`, but `SSH_PASSWORD` is still exported into process env. |
| T-COMP-1 / T-COMP-3 | Shell interpreters in command whitelist / env-var prefixes | **Fixed** | `ALLOWED_COMMAND_PREFIXES` no longer contains shell interpreters; `validateShellCommandStrict` strips leading `KEY=VALUE`. |
| T-JOIN-3 | Recruiting candidate before rate limit | **Fixed** | Recruiting check occurs before `consumeUserApiRateLimit`. |

---

## 6. Positive Controls Observed

- **Judge auth separation:** Shared `JUDGE_AUTH_TOKEN` is accepted only on `/register`; `/claim`, `/poll`, `/heartbeat`, `/deregister` require per-worker `secretTokenHash` and use `safeTokenCompare`.  
- **Atomic claim SQL:** `buildClaimSql` uses `FOR UPDATE SKIP LOCKED`, stale-claim reclamation, and optimistic-lock claim token.  
- **Claim-token optimistic locking:** `/poll` only updates rows whose `judgeClaimToken` matches.  
- **IP allowlist fail-closed:** `isJudgeIpAllowed` denies unknown IPs when an allowlist exists.  
- **Compiler sandbox:** Local fallback uses `--network=none`, `--cap-drop=ALL`, seccomp, unprivileged user, and workspace `chown`/`chmod`.  
- **Deploy guards:** `algo.xylolabs.com` deploy enforces app-only build; pre-deploy DB backups; no `docker system prune --volumes`.  
- **Secret redaction:** `judgeClaimToken`, `workerSecret`, `RUNNER_AUTH_TOKEN`, etc. are listed in `LOGGER_REDACT_PATHS`.  
- **Rate-limiter fail-open:** Sidecar failures fall back to the authoritative DB path.  
- **XFF chain preserved:** Generated nginx config now uses `$proxy_add_x_forwarded_for`.  
- **Raw query transaction routing:** `rawQueryAll`/`rawQueryOne` read `transactionContext` and route through the active transaction client when inside `execTransaction`.  
- **Code-similarity auth fail-closed:** Sidecar refuses to start without `CODE_SIMILARITY_AUTH_TOKEN` unless explicit opt-out flag is set.

---

## 7. Final Sweep

Additional checks performed to surface missed causal issues:

1. **Unawaited side effects** — `recordAuditEvent`, `invalidateRankingCache`, `triggerAutoCodeReview`, `sweepStaleWorkers`, and `refreshStatsCacheInBackground` are commonly fire-and-forget. A process crash or OOM before these complete can lose audit events, cache invalidation, auto-review triggers, and stale-worker sweeps.
2. **Global locks** — `realtime:sse:acquire` is a single global advisory lock; `submissions` global queue cap has no global lock; `code-similarity` lock is per-assignment but scoped too late.
3. **Shared `unknown` buckets** — Rate-limit keys fall back to `unknown` for missing/short XFF, creating a shared global quota for endpoints such as `contest:join` and `submissions:create`.
4. **Fire-and-forget cleanup** — `execute.ts` cleanup is fire-and-forget; file `DELETE` is DB-first; upload is disk-first.
5. **Cross-instance caches** — Role/capability cache, system-settings cache, and analytics caches are module-level singletons with no cross-instance invalidation.
6. **Process-local timers** — Rate-limit eviction runs from a process-local `setInterval`; in multi-instance/serverless deployments cleanup is uneven.
7. **Abort propagation** — Similarity Rust sidecar uses `spawn_blocking` with no cancellation token; compiler run route has no overall timeout.
8. **Destructive Docker commands** — `docker system prune --volumes` is absent; image prune uses dangling-only; volume prune is not called. Remaining risks are unvalidated `rm -rf`, aggressive builder prune, and legacy `deploy.sh`.
9. **Secret logging** — `JUDGE_AUTH_TOKEN`, `RUNNER_AUTH_TOKEN`, `CODE_SIMILARITY_AUTH_TOKEN`, `judgeClaimToken`, and `workerSecret` are covered by logger redaction paths.
10. **Template drift** — `scripts/online-judge.nginx.conf` still uses 1m catch-all body size, diverging from the generated config.

---

## 8. Conclusion & Recommended Next Probes

The traced flows show substantial iterative hardening (per-worker secrets, atomic claim SQL, composed abort signals, advisory-lock similarity store, cross-instance rate limits, workspace cleanup). The remaining risk is concentrated in a few persistent defaults (`AUTH_TRUST_HOST=true`, open judge allowlist), second-order distributed-state gaps (cross-instance caches, global SSE lock), and operational footguns in deploy scripts.

**Highest-priority fixes:**
1. Cap in-progress judging duration (T-JUDGE-2).\n2. Fix `createApiHandler` custom-role rejection (T-AUTH-1).\n3. Generate `JUDGE_ALLOWED_IPS` or enable strict allowlist by default (T-DEPLOY-7).\n4. Default `AUTH_TRUST_HOST=false` and strip `X-Forwarded-Host` in nginx (T-DEPLOY-4).\n5. Add rate limiting and streaming to file downloads (T-FILES-1).\n6. Remove or shard the global SSE advisory lock (RT-1).\n7. Make the Rust similarity sidecar task cancellable (SIM-1).\n8. Pin migration-container dependencies and stop installing `@latest` with DB secrets (DEPLOY-3).\n9. Guard `deploy-test-backends.sh` against production targets (DEPLOY-5).\n10. Validate `NAMED_SRC` before `rm -rf` (DEPLOY-6).\n11. Remove or hard-disable legacy `deploy.sh` (DEPLOY-7).\n
**Recommended next probes:**
1. Simulate two concurrent cross-user submissions against a global cap to confirm SUB-1 overflow.\n2. Load-test 1,000 concurrent SSE acquisitions with `REALTIME_COORDINATION_BACKEND=postgresql` to measure RT-1 lock contention.\n3. Abort a similarity request after 2 s and monitor `code-similarity-rs` CPU to confirm SIM-1.\n4. Run `./deploy-docker.sh --dry-run` for each target and inspect generated `.env.production` and nginx config.\n5. Audit production topology: is the app horizontally scaled, and is the rate-limiter sidecar enabled?\n6. Verify required Docker capabilities (`CAP_CHOWN`, `CAP_DAC_OVERRIDE`) in production-like CI and document them.\n7. Add route tests for pure group-TA similarity access (SIM-4) and custom-role handler access (T-AUTH-1).\n8. Measure `/api/v1/compiler/run` hang time when `COMPILER_RUNNER_URL` is unreachable.\n9. Review all fire-and-forget audit/cache calls for durable-queue fallback.\n10. Add a deploy lock and automatic rollback test for DEPLOY-8/DEPLOY-15.\n
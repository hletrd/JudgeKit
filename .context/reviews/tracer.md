# Causal Tracer Review — /tmp/judgekit-local

**Scope:** Suspicious or complex flows in JudgeKit: contest join, similarity check, compiler execute, IP security/rate limiting, judge claim/poll/heartbeat/deregister, file upload/download, API authorization, and deployment scripts.  
**Constraints:** Read-only review; no fixes applied. All work performed only in `/tmp/judgekit-local`.  
**Date:** 2026-07-02  
**Evidence base:** Source code, project docs (`CLAUDE.md`, `AGENTS.md`), the previous tracer review, and focused test runs.

---

## 1. Methodology

1. **Inventory** — Map each target flow from the public API surface through middleware, business logic, DB, sidecars, and (where relevant) the Rust worker.
2. **Causal trace** — Follow data transformations, trust boundaries, concurrency primitives, and failure-handling paths end-to-end.
3. **Competing hypotheses** — For every suspicious observation, formulate a benign/intended hypothesis and a failure/exploit hypothesis, then weigh evidence for and against each.
4. **Confidence classification** — `High` = directly observable in code/tests; `Medium` = inferential but strongly supported; `Low` = edge-case or contingent on operator/environmental factors.
5. **Final sweep** — Re-scan for TODO/FIXME markers, secret logging, destructive Docker commands, and `JUDGE_AUTH_TOKEN` leakage outside registration.

---

## 2. Flow Trace Summaries

### 2.1 Contest Join (`POST /api/v1/contests/join`)

`/tmp/judgekit-local/src/app/api/v1/contests/join/route.ts:15` → `getRecruitingAccessContext` (blocks recruiting candidates) → `extractClientIp` → `redeemAccessCode` (`/tmp/judgekit-local/src/lib/assignments/access-codes.ts:96`) → on failure, `consumeUserApiRateLimit` keyed by `user.id` and then by `code:${sha256(code).slice(0,32)}`. The `createApiHandler` IP-based rate limit `contest:join` runs before the handler.

### 2.2 Similarity Check (`POST /api/v1/contests/[id]/similarity-check`)

`/tmp/judgekit-local/src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:26` → `canRunSimilarityCheck` (`route.ts:12`) checks contest management, then `anti_cheat.run_similarity` capability, then group TA / assigned instructor status → 30 s `AbortController` timeout → `runAndStoreSimilarityCheck` (`/tmp/judgekit-local/src/lib/assignments/code-similarity.ts:404`) → tries Rust sidecar; falls back to TS O(n²) engine capped at 500 submissions → deletes old `antiCheatEvents` for the assignment and inserts new flagged pairs in a transaction.

### 2.3 Compiler Execute (`/lib/compiler/execute.ts`)

`executeCompilerRun` (`/tmp/judgekit-local/src/lib/compiler/execute.ts:623`) → source-code null-byte + size checks → Docker image allowlist → `validateShellCommandStrict` → tries Rust runner (`COMPILER_RUNNER_URL`) → local Docker fallback with `--network=none`, `--cap-drop=ALL`, `--read-only`, seccomp, `--user 65534:65534`, memory/CPU/pids limits, workspace `chown 65534:65534 chmod 0700/0600`.

### 2.4 IP Security & Rate Limiting

`extractClientIp` (`/tmp/judgekit-local/src/lib/security/ip.ts:68`) validates `X-Forwarded-For` hop count against `TRUSTED_PROXY_HOPS`, unwraps IPv4-mapped IPv6, and returns `null` in production when the chain is missing or too short. `isJudgeIpAllowed` (`/tmp/judgekit-local/src/lib/judge/ip-allowlist.ts:182`) fail-closed when an allowlist is set. Rate-limit keys use `extractClientIp(headers) ?? "unknown"` (`/tmp/judgekit-local/src/lib/security/rate-limit.ts:46`). The sidecar fast path (`/tmp/judgekit-local/src/lib/security/rate-limiter-client.ts:53`) is circuit-breakered and fail-open.

### 2.5 Judge Claim Lifecycle

- **Register:** `/tmp/judgekit-local/src/app/api/v1/judge/register/route.ts:25` accepts shared `JUDGE_AUTH_TOKEN`, IP-rate-limited, creates worker row with `secretTokenHash`.
- **Claim:** `/tmp/judgekit-local/src/app/api/v1/judge/claim/route.ts:130` requires `workerId` + `workerSecret`, enforces IP allowlist, per-worker rate limit, per-worker auth, then runs atomic `buildClaimSql` (`/tmp/judgekit-local/src/lib/judge/claim-query.ts:27`) with `FOR UPDATE SKIP LOCKED`, stale-claim reclamation, optimistic-lock claim token, and self-reclaim compensation.
- **Poll:** `/tmp/judgekit-local/src/app/api/v1/judge/poll/route.ts:28` accepts only per-worker auth; updates submission only when `judgeClaimToken` matches.
- **Heartbeat:** `/tmp/judgekit-local/src/app/api/v1/judge/heartbeat/route.ts:22` updates `lastHeartbeatAt` and triggers stale-worker sweep; does **not** overwrite `active_tasks` from worker telemetry.
- **Deregister:** `/tmp/judgekit-local/src/app/api/v1/judge/deregister/route.ts:18` atomically marks worker offline, resets `active_tasks` to 0, and releases claimed submissions.

### 2.6 File Upload / Download

- **Upload:** `POST /api/v1/files` → validation → `writeUploadedFile` with mode `0o600`.
- **Download:** `GET /api/v1/files/[id]` → auth, access check, full file read into memory, then response.

### 2.7 API Authorization (`createApiHandler`)

`createApiHandler` (`/tmp/judgekit-local/src/lib/api/handler.ts`) wraps routes with rate limiting, auth, CSRF, body parsing, Zod validation, and role/capability checks. The role check currently validates the user's role against a built-in enum before honoring the route's `auth.roles` array.

### 2.8 Deploy Scripts (`deploy-docker.sh`)

`/tmp/judgekit-local/deploy-docker.sh` → local env profile hardening (`chmod 600`) → app-only guard for `algo.xylolabs.com` → SSH multiplexing → pre-deploy DB backup + PG volume safety check → `secret_token` backfill/drop before `drizzle-kit push` → app-only compose up → dedicated worker sync/restart with HTTPS enforcement → nginx `client_max_body_size` scoped to `/api/v1/judge/poll` (50 M) and `/api/v1/judge/` (1 m).

---

## 3. Findings

| ID | Flow | Observation | Severity | Confidence |
|---|---|---|---|---|
| **T-JUDGE-2** | Judge poll | In-progress reports reset `judgeClaimedAt`, allowing a worker to extend a claim indefinitely. | **High** | High |
| **T-AUTH-1** | API handler | `createApiHandler` role check rejects custom roles via `isUserRole()`, breaking `auth.roles` for non-built-in roles. | **High** | High |
| **T-DEPLOY-6** | Deploy | `scripts/online-judge.nginx.conf` still uses `$remote_addr` for `X-Forwarded-For`, diverging from the fixed deploy script. | **High** | High |
| **T-DEPLOY-7** | Deploy | Fresh production deployments set neither `JUDGE_ALLOWED_IPS` nor `JUDGE_STRICT_IP_ALLOWLIST`, so judge API allowlist is open to all IPs. | **High** | High |
| **T-SIM-4** | Similarity check | Rust sidecar ignores the caller's `AbortSignal` and uses its own hard-coded 25 s timeout; aborts are swallowed and fall back to TS. | **High** | High |
| **T-SIM-1** | Similarity check | No per-assignment concurrency lock; concurrent runs race and last-write-wins. | **High** | High |
| T-JOIN-1 | Contest join | Access codes stored as plaintext in `assignments.accessCode`. | Medium | High |
| T-JOIN-2 | Contest join | Global `:unknown` rate-limit bucket when `X-Forwarded-For` is missing in production. | Medium | Medium |
| T-JOIN-3 | Contest join | Per-user failure limiter runs before per-code limiter, giving multi-account attackers N independent budgets. | Medium | Medium |
| T-JOIN-4 | Contest join | `23505` recovery in `redeemAccessCode` assumes the conflict is `(assignmentId, userId)` without checking the constraint. | Medium | Medium |
| **T-JOIN-5** | Contest join | Failure-rate-limit buckets are never reset on a successful redemption, so a user who fat-fingers a code may remain blocked after receiving the correct code. | Medium | Medium |
| T-SIM-2 | Similarity check | TS fallback O(n²) with 500 cap and hard 30 s route timeout can return `timed_out` with no stored results. | Medium | Medium |
| T-SIM-3 | Similarity check | Capability check runs before group-TA check, leaving the pure-TA path untested and possibly dead. | Medium | Medium |
| **T-SIM-5** | Similarity check | Route timeout is armed before authorization and the expensive DB query; query slowness can masquerade as computation timeout. | Medium | Medium |
| **T-FILES-1** | File download | No rate limit on `GET /api/v1/files/[id]` and the full file is read into memory before streaming. | Medium | High |
| T-IPRL-1 | IP / rate limit | Same IP-extraction logic is fail-open for rate limiting (`unknown`) but fail-closed for judge allowlist. | Medium | Medium |
| T-IPRL-2 | Rate limiter | In-memory sidecar resets counters on restart; DB path corrects only after the sidecar allows the request. | Low | Low |
| T-COMP-1 | Compiler execute | `bash`/`sh` are in the allowed command-prefix whitelist, so admin-supplied `sh -c` scripts pass strict validation. | Medium | High |
| T-COMP-2 | Compiler execute | Validation failures return `exitCode: null`; consumers must handle null explicitly. | Low | Low |
| T-COMP-3 | Compiler execute | `validateShellCommandStrict` rejects environment-variable-prefixed segments despite the trust-boundary comment claiming they are supported. | Medium | Medium |
| T-JUDGE-1 | Judge poll | Claim-token mismatch returns 403; no API-side dead-letter beyond the Rust worker's local file. | Low | Low |
| **T-JUDGE-3** | Rust worker | Runner HTTP server handle is aborted during shutdown without draining in-flight `/run` requests. | Medium | Medium |
| T-DEPLOY-1 | Deploy | `docker container prune -f` on the app host has no `--filter` and could delete other stopped containers on a shared host. | Low | Low |
| T-DEPLOY-2 | Deploy | `docker builder prune -af` under disk pressure wipes all unused build cache. | Low | Low |
| T-DEPLOY-3 | Deploy | Migration container runs unpinned `npm install --no-save drizzle-kit@latest pg`. | Medium | Medium |
| T-DEPLOY-4 | Deploy | `.env.production` sets `AUTH_TRUST_HOST=true`; relies on nginx for host-header discipline. | Medium | High |
| T-DEPLOY-5 | Deploy | `sshpass -p "$SSH_PASSWORD"` exposes the SSH password in the local process list. | Low | Low |
| **T-SIM-6** | Similarity check | Timeout handler treats any error message containing "timed out" as a scan timeout. | Low | High |
| **T-LOG-1** | Logging | `code-similarity-client.ts` logs a missing-auth warning with `console.warn` instead of the structured logger. | Low | High |

---

### T-JUDGE-2 — In-progress judging can extend a claim indefinitely

**Observation:** In `/tmp/judgekit-local/src/app/api/v1/judge/poll/route.ts:82-145`, when a worker posts `status: "judging"` with a valid `claimToken`, the handler updates the submission status and resets `judgeClaimedAt` to the current DB time. There is no maximum-judging-time guard independent of these heartbeats.

**Hypothesis A (benign/intended):** Workers are trusted; a long-running judgement is legitimate and resetting the timestamp is exactly how the stale-claim sweep knows the worker is still alive.

**Hypothesis B (failure/exploit):** A buggy or compromised worker can keep a submission in `judging` forever by posting `judging` status before the stale timeout. The submission is never re-queued, so the user sees a stuck submission and no final verdict. This is an availability failure for the submitter and a denial of the queue slot.

**Evidence:**
- `poll/route.ts:95-108` resets `judgeClaimedAt` for every `IN_PROGRESS_JUDGE_STATUSES` update.
- `claim-query.ts` / stale sweep compares `judge_claimed_at < NOW() - staleClaimTimeoutMs`.
- No `maxJudgingDurationMs` or `judgeStartedAt` absolute ceiling exists in the poll path.

**Confidence:** High.  
**Next probe:** Add a `maxJudgingDurationMs` guard; reject in-progress updates when total time since the original claim exceeds the ceiling, and reset the submission to `pending`.

---

### T-AUTH-1 — `createApiHandler` rejects custom roles

**Observation:** `createApiHandler` (`/tmp/judgekit-local/src/lib/api/handler.ts:131-132`) calls `isUserRole(user.role)` before checking whether the user's role is in the route's `auth.roles` array. `isUserRole()` only accepts the five built-in roles.

**Hypothesis A (benign/intended):** Only built-in roles are expected; custom roles should be modeled as capabilities or role assignments.

**Hypothesis B (failure/exploit):** A deployment introduces a custom role (e.g., `external_instructor`) and restricts an admin route to it. The route becomes unreachable for that role, or operators may misread the config and assume the role gate works. This silently breaks authorization policy.

**Evidence:**
- `handler.ts:131-132`: `if (!isUserRole(user.role)) return forbidden(...);`.
- `permissions.ts` / role types define the built-in whitelist.

**Confidence:** High.  
**Next probe:** Remove the `isUserRole` guard from the role check, or allow any role string listed in the route's `auth.roles`.

---

### T-DEPLOY-6 — Template drift in `scripts/online-judge.nginx.conf`

**Observation:** `deploy-docker.sh` now uses `$proxy_add_x_forwarded_for` for `X-Forwarded-For`, but the standalone template `scripts/online-judge.nginx.conf` still uses `$remote_addr` in every location block.

**Hypothesis A (benign/intended):** The template is for local reference only; operators always use the deploy script.

**Hypothesis B (failure/exploit):** An operator copies the template to a host. `extractClientIp` with `TRUSTED_PROXY_HOPS=1` requires `parts.length >= trustedHops + 1`; a single-element XFF returns `null`. Rate limits collapse into the shared `unknown` bucket, and judge IP allowlists would deny legitimate workers.

**Evidence:**
- `scripts/online-judge.nginx.conf` lines 63, 77, 88, 100 use `$remote_addr`.
- `deploy-docker.sh` uses `$proxy_add_x_forwarded_for`.
- `ip.test.ts` confirms `null` is returned for short chains.

**Confidence:** High.  
**Next probe:** Update the template to match the deploy script and add a regression test.

---

### T-DEPLOY-7 — Judge allowlist defaults to allow-all on fresh deploys

**Observation:** `isJudgeIpAllowed` (`/tmp/judgekit-local/src/lib/judge/ip-allowlist.ts:17-25,182-210`) returns `true` for every IP when `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`. Neither variable is generated by `deploy-docker.sh` or set in `docker-compose.production.yml`.

**Hypothesis A (benign/intended):** Backward compatibility; operators must opt into strict allowlisting.

**Hypothesis B (failure/exploit):** A fresh production deployment is allow-all. A leaked `JUDGE_AUTH_TOKEN` allows any internet host to register fake workers, claim submissions (reading source code and hidden test cases), and inject arbitrary verdicts.

**Evidence:**
- `ip-allowlist.ts:207`: denies only when an allowlist is configured.
- `deploy-docker.sh:696-720` generates `.env.production` but does not include `JUDGE_ALLOWED_IPS` or `JUDGE_STRICT_IP_ALLOWLIST`.

**Confidence:** High.  
**Next probe:** Generate `.env.production` with worker-subnet allowlists or set `JUDGE_STRICT_IP_ALLOWLIST=1` by default.

---

### T-SIM-4 — Rust sidecar ignores caller abort signal

**Observation:** `computeSimilarityRust` (`/tmp/judgekit-local/src/lib/assignments/code-similarity-client.ts:35-62`) uses a hard-coded `AbortSignal.timeout(25_000)` and does not accept the caller's signal. It catches all exceptions and returns `null`.

**Hypothesis A (benign/intended):** The sidecar has its own timeout; callers fall back to TS if it fails.

**Hypothesis B (failure/exploit):** The route's 30-second controller cannot cancel the sidecar. A slow sidecar keeps consuming resources after the caller has moved on. A sidecar timeout returns `null`, the TS fallback runs, and the 30-second route timer may expire before any result is returned.

**Evidence:**
- `code-similarity-client.ts`: no `signal` parameter; hard-coded timeout; catch-all returns `null`.
- `similarity-check/route.ts:44-64`: passes signal only as far as `runSimilarityCheck`.

**Confidence:** High.  
**Next probe:** Compose the caller's signal with the internal timeout and re-throw `AbortError` instead of returning `null`.

---

### T-SIM-1 — No concurrency guard for similarity scans

**Observation:** `runAndStoreSimilarityCheck` (`/tmp/judgekit-local/src/lib/assignments/code-similarity.ts:404-454`) reads submissions, computes pairs (possibly via the Rust sidecar), then executes a transaction that deletes existing `code_similarity` events for the assignment and inserts the new set. There is no advisory lock, unique constraint, or row-level lock on an assignment-level coordinator row.

**Hypothesis A (benign/intended):** Similarity checks are operator-initiated and infrequent; the chance of two authorized users triggering the same scan simultaneously is low.

**Hypothesis B (failure/exploit):** Two concurrent scans for the same assignment can both read the same submission set, consume CPU, then race to delete/insert. The later transaction overwrites the earlier one; intermediate states may be invisible, and CPU/memory is wasted. Under the 30 s route timeout, a slow race could also tip one request into `timed_out`.

**Evidence:**
- `code-similarity.ts:442-453`: `tx.delete(...).where(assignmentId, eventType=code_similarity)` followed by `tx.insert(...)`.
- No `pg_advisory_lock`, `SELECT ... FOR UPDATE`, or `assignment` row lock precedes the read.
- Route timeout: `similarity-check/route.ts:48`.

**Confidence:** High.  
**Next probe:** Add `pg_advisory_xact_lock(hashtextextended(assignmentId, 1)::bigint)` around the compute-and-store path, or add an assignment-level version/timestamp guard.

---

### T-FILES-1 — File download lacks rate limiting and streams from memory

**Observation:** `GET /api/v1/files/[id]` (`/tmp/judgekit-local/src/app/api/v1/files/[id]/route.ts:62-140`) performs auth and access checks but never calls `consumeApiRateLimit`. It reads the entire uploaded file into memory with `buffer = await readUploadedFile(file.storedName)`.

**Hypothesis A (benign/intended):** File downloads are infrequent and files are small; auth is sufficient.

**Hypothesis B (failure/exploit):** An authenticated user can enumerate file IDs and repeatedly download large test-case attachments, abusing bandwidth and probing hidden files. Concurrent large downloads can exhaust the Node.js heap.

**Evidence:**
- `[id]/route.ts`: no `rateLimit` config or manual rate-limit call; `readUploadedFile` returns a Buffer.
- `handler.ts` applies rate limits only when configured.

**Confidence:** High.  
**Next probe:** Add `rateLimit: "files:download"` and stream files from disk instead of loading them into memory.

---

### T-JOIN-5 — Failure rate limits never reset on success

**Observation:** On a failed redemption, `join/route.ts:28-37` consumes `contest:join:invalid` (per-user) and `contest:join:invalid-code` (per-code). A later successful redemption does not decrement or reset these buckets.

**Hypothesis A (benign/intended):** Invalid attempts should remain penalized to discourage guessing.

**Hypothesis B (failure/exploit):** A student who mistypes a code many times, then receives the correct code, may still be blocked by the per-user invalid bucket for the remainder of the window.

**Evidence:**
- `join/route.ts:28-37`: both failure buckets consumed; no success-path reset.
- `api-rate-limit.ts:198-222`: no reset-on-success semantics for these keys.

**Confidence:** Medium.  
**Next probe:** Treat invalid-code attempts as part of the same `contest:join` bucket, or reset the invalid counters on a successful redemption.

---

### T-JUDGE-3 — Rust worker runner server aborts without draining

**Observation:** `judge-worker-rs/src/main.rs:686-688` aborts the runner HTTP server handle during graceful shutdown.

**Hypothesis A (benign/intended):** The runner is an internal sidecar; losing in-flight local runs is acceptable during restart.

**Hypothesis B (failure/exploit):** In-flight verdict submissions may be lost or orphaned containers left running during a restart.

**Evidence:**
- `main.rs:686-688`: `handle.abort()` after the main loop exits.
- No bounded drain of active `/run` requests.

**Confidence:** Medium.  
**Next probe:** Add a graceful shutdown handler that waits for active requests to complete within a bounded timeout.

---

### T-SIM-5 — Similarity timeout starts before expensive work

**Observation:** The route arms a 30-second `AbortController` timeout, then awaits `getContestAssignment`, authorization checks, and the raw CTE query before starting `runAndStoreSimilarityCheck`. The CTE at `code-similarity.ts:330-339` has no `LIMIT` and is not abort-aware.

**Hypothesis A (benign/intended):** The 30-second budget covers the whole request.

**Hypothesis B (failure/exploit):** On a large assignment, the CTE query can consume most of the budget before similarity computation begins. The route returns `timed_out` and the operator cannot tell whether the engine or the database was slow.

**Evidence:**
- `similarity-check/route.ts:44-64`: timer starts early.
- `code-similarity.ts:330-339`: unbounded `rawQueryAll` not observing the abort signal.

**Confidence:** Medium.  
**Next probe:** Start the timer closer to the computation, or add a separate query timeout with a distinct error status.

---

### T-SIM-6 — Broad "timed out" string match in timeout handler

**Observation:** The similarity route catch block returns the `timed_out` envelope if `error.name === "AbortError"` OR `error.message.includes("timed out")`.

**Hypothesis A (benign/intended):** Any downstream timeout should be reported as a scan timeout.

**Hypothesis B (failure/exploit):** A database query timeout or other error whose message contains "timed out" is surfaced as a scan timeout, masking database health issues.

**Evidence:**
- `similarity-check/route.ts:51-62`: string-includes check.

**Confidence:** High.  
**Next probe:** Only treat `AbortError` as scan timeout; let other errors propagate to the generic handler.

---

### T-LOG-1 — `console.warn` in similarity client

**Observation:** `code-similarity-client.ts:6` imports no project logger and uses `console.warn` for a missing-auth warning.

**Hypothesis A (benign/intended):** It's a single diagnostic line.

**Hypothesis B (failure/exploit):** In production, this warning bypasses the structured logger and may be lost or formatted inconsistently.

**Evidence:**
- `code-similarity-client.ts`: `console.warn("WARN: no auth token");`.
- Other `src/lib` modules use `@/lib/logger`.

**Confidence:** High.  
**Next probe:** Replace with `logger.warn(...)`.

---

### T-JOIN-1 — Plaintext access codes in `assignments.accessCode`

**Observation:** `setAccessCode` (`/tmp/judgekit-local/src/lib/assignments/access-codes.ts:31`) persists the raw 8-character code; `redeemAccessCode` (`/tmp/judgekit-local/src/lib/assignments/access-codes.ts:101`) compares the normalized user input directly against that column.

**Hypothesis A (benign/intended):** Instructors need to read and distribute the code; hashing would force regeneration on every lookup and break the "show code" UI. This is a deliberate usability trade-off.

**Hypothesis B (failure/exploit):** A read-only DB breach (e.g., via SQL injection or backup leak) exposes every active contest access code, allowing mass unauthorized enrollment.

**Evidence:**
- Code path: `access-codes.ts:31-44` writes `accessCode` unchanged; `access-codes.ts:118` reads `assignments.accessCode`.
- `generateAccessCode` uses `crypto.randomBytes` with rejection sampling, so the codes themselves are strong.
- No hashing, HMAC, or encryption is applied before storage.

**Confidence:** High — this is an explicit design choice, but the residual risk is real.  
**Next probe:** Confirm whether DB backups/export tooling redacts this column; `EXPORT_SANITIZED_COLUMNS` does not currently include `assignments.accessCode`.

---

### T-JOIN-2 — Global `:unknown` rate-limit bucket when `X-Forwarded-For` is absent

**Observation:** `getRateLimitKey` builds keys like `${action}:${extractClientIp(headers) ?? "unknown"}` (`/tmp/judgekit-local/src/lib/security/rate-limit.ts:45-47`). In production, `extractClientIp` returns `null` if `X-Forwarded-For` is missing or shorter than `TRUSTED_PROXY_HOPS` (`/tmp/judgekit-local/src/lib/security/ip.ts`; tests at `/tmp/judgekit-local/tests/unit/security/ip.test.ts:65,103`). `createApiHandler` applies `consumeApiRateLimit(req, "contest:join")` before the handler runs (`/tmp/judgekit-local/src/lib/api/handler.ts:118-120`).

**Hypothesis A (benign/intended):** Production always sits behind Nginx, which always injects `X-Forwarded-For`; the `unknown` bucket is a safe fallback for misconfiguration rather than a shared quota.

**Hypothesis B (failure/exploit):** Any request that bypasses the proxy, or any client that can submit a shorter XFF chain than configured, lands in the same `api:contest:join:unknown` bucket. A single actor can exhaust the endpoint limit and block all such traffic.

**Evidence:**
- `rate-limit.ts:46`: `extractClientIp(headers) ?? "unknown"`.
- `ip.test.ts:65`: expects `null` in production when chain is too short.
- `join/route.ts:17`: `rateLimit: "contest:join"`.

**Confidence:** Medium — the behavior is observable, but the exploit window depends on proxy configuration.  
**Next probe:** Review production Nginx config to confirm `X-Forwarded-For` is always appended and `TRUSTED_PROXY_HOPS` matches the actual hop count.

---

### T-JOIN-3 — Per-user failure limiter runs before per-code limiter

**Observation:** In `join/route.ts:28-42`, a failed redemption first consumes the per-user bucket (`contest:join:invalid`), then the per-code bucket (`contest:join:invalid-code:<hash>`). If the user bucket blocks, the code bucket is never incremented.

**Hypothesis A (benign/intended):** Legitimate users should not be penalized for a shared code; the per-user bucket protects individual users from brute-force lockout.

**Hypothesis B (failure/exploit):** An attacker with M accounts gets M independent user budgets before the shared per-code bucket becomes the binding constraint. Distributed brute-force against a single access code is slowed only by the (likely larger) per-user budget repeated across accounts.

**Evidence:**
- `join/route.ts:29-36`: `consumeUserApiRateLimit(req, user.id, "contest:join:invalid")` followed by `consumeUserApiRateLimit(req, "code:${hash}", "contest:join:invalid-code")`.
- `tests/unit/api/contests.route.test.ts:315-325` exercises the failure path but not multi-account distribution.

**Confidence:** Medium.  
**Next probe:** Compare the configured per-user and per-code budgets; consider consuming the code-scoped bucket unconditionally so distributed attempts converge immediately.

---

### T-JOIN-4 — Unique-violation recovery assumes `(assignmentId, userId)` conflict

**Observation:** `redeemAccessCode` (`/tmp/judgekit-local/src/lib/assignments/access-codes.ts:207-221`) catches Postgres `23505` and returns `alreadyEnrolled: true`. It does not inspect the constraint name or verify that the conflicting row belongs to the calling user.

**Hypothesis A (benign/intended):** The current unique constraint is on `(assignmentId, userId)`, so any `23505` here can only mean the same user already redeemed.

**Hypothesis B (failure/exploit):** A future schema change (e.g., a unique index on `accessCode` or `contestAccessTokens.access_code`) would make the recovery branch misleading: a user could be told they are already enrolled when the conflict was actually on the code itself, hiding a real race condition.

**Evidence:**
- `access-codes.ts:209-217`: catches `23505`, re-fetches assignment by code, returns `alreadyEnrolled: true`.
- The function does not compare the caught constraint name or re-check `(assignmentId, userId)`.

**Confidence:** Medium — defensive future-proofing.  
**Next probe:** In the recovery branch, assert the constraint name matches the expected `(assignmentId, userId)` index or re-run the existing-token check for the specific user.

---

### T-SIM-2 — TS fallback can time out before storing partial results

**Observation:** If the Rust sidecar is unavailable, `runSimilarityCheck` falls back to `runSimilarityCheckTS` (`/tmp/judgekit-local/src/lib/assignments/code-similarity.ts:259-310`), which performs pairwise Jaccard comparisons grouped by `(problemId, language)`. The route aborts after 30 s (`similarity-check/route.ts:48`) and returns `status: "timed_out"` without storing any events.

**Hypothesis A (benign/intended):** The Rust sidecar is the production path; the TS fallback is only for dev/CI and is capped at 500 submissions (`MAX_SUBMISSIONS_FOR_SIMILARITY`, `code-similarity.ts:236`).

**Hypothesis B (failure/exploit):** If the sidecar is down and a contest is near the 500 cap with dense same-language groups, the 30 s timeout may fire before completion. The operator sees `timed_out` and no stored results; retrying repeats the same work.

**Evidence:**
- `code-similarity.ts:390`: TS fallback only runs when `rows.length <= 500`.
- `code-similarity.ts:280-305`: nested loops with 8 ms event-loop yields but no hard time-budget check.
- `similarity-check.route.test.ts:133-168`: confirms the route returns `timed_out` on abort.

**Confidence:** Medium.  
**Next probe:** Benchmark TS fallback with 500 submissions × average group size and measure time-to-abort.

---

### T-SIM-3 — Capability check runs before group-TA check

**Observation:** `canRunSimilarityCheck` (`/tmp/judgekit-local/src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24`) returns early for managers, then rejects non-managers who lack `anti_cheat.run_similarity`, and only afterward checks group TA / assigned instructor status. A pure group TA whose role does not carry the capability is denied.

**Hypothesis A (benign/intended):** The capability is the canonical gate; group TA status is only a fallback for users who already have the capability. The current `assistant` role includes it, so the path works today.

**Hypothesis B (failure/exploit):** A custom role named "ta" or a future capability edit that removes `anti_cheat.run_similarity` from the TA role will silently deny group TAs, while the UI may still show the affordance based on group membership. The route test covers the assigned-assistant case but not the pure group-TA case, so the regression would not be caught.

**Evidence:**
- `similarity-check/route.ts:12-24`: ordering is `canManageContest` → `caps.has(...)` → `isGroupTA` → `assignedGroupIds`.
- `tests/unit/api/similarity-check.route.test.ts:170-192`: tests an assigned assistant with the capability, not a pure group TA.

**Confidence:** Medium.  
**Next probe:** Add a route test for a pure group TA without `anti_cheat.run_similarity`; confirm whether denial is intended policy or dead code.

---

### T-IPRL-1 — Inconsistent fail-open/fail-closed posture for missing client IP

**Observation:** The same `extractClientIp` return value (`null` in production) is treated differently by two security controls:
- `isJudgeIpAllowed` denies when `!clientIp` and an allowlist exists (`/tmp/judgekit-local/src/lib/judge/ip-allowlist.ts:207`).
- Rate limiting coalesces missing IPs into the shared `unknown` bucket (`/tmp/judgekit-local/src/lib/security/rate-limit.ts:46`).

**Hypothesis A (benign/intended):** These are separate concerns: judge APIs are high-sensitivity and should fail closed; public rate limiting should not hard-block all traffic on a proxy misconfiguration.

**Hypothesis B (failure/exploit):** The divergence is an implicit policy that can be abused: an attacker who can trigger the `unknown` bucket (e.g., by omitting XFF) gets a shared global quota rather than being blocked, making per-IP rate limits ineffective for that vector.

**Evidence:**
- `rate-limit.ts:45-47`: `getRateLimitKey`.
- `ip-allowlist.ts:206-207`: `if (!clientIp || clientIp === "0.0.0.0") return false`.
- `ip.test.ts:65,103`: production null behavior.

**Confidence:** Medium.  
**Next probe:** Audit all endpoints that rely on `consumeApiRateLimit` and assess whether the `unknown` bucket should be rate-limited separately or rejected.

---

### T-IPRL-2 — Sidecar counter reset on restart

**Observation:** `rate-limiter-rs` keeps counters in memory. If the sidecar restarts, its counters reset. The TypeScript client falls back to the authoritative DB path only when the sidecar is unreachable or returns `allowed=true`; if a restarted sidecar allows a request, the DB path is skipped for that request.

**Hypothesis A (benign/intended):** The sidecar is a best-effort fast path; transient over-allowance after a restart is bounded by the request rate before the DB path re-synchronizes on the next sidecar miss.

**Hypothesis B (failure/exploit):** An attacker who can cause or time a sidecar restart (e.g., by triggering an OOM) could exploit the reset to issue a burst of requests within the same window before the DB catches up.

**Evidence:**
- `rate-limiter-client.ts:53-108`: sidecar call returns `null` on any error/failure, causing DB fallback; otherwise sidecar verdict is trusted.
- `api-rate-limit.ts:164-173`: sidecar allowed → DB path runs; sidecar blocked → returns 429 immediately.

**Confidence:** Low — requires sidecar restart and tight timing.  
**Next probe:** Verify whether `rate-limiter-rs` persists counters to Redis/Postgres or only memory.

---

### T-COMP-1 — `sh -c` commands pass strict validation via prefix whitelist

**Observation:** `validateShellCommandStrict` (`/tmp/judgekit-local/src/lib/compiler/execute.ts:243-251`) splits on `&&`/`;`, then checks the first token of each segment against `ALLOWED_COMMAND_PREFIXES`, which includes `bash` and `sh` (`execute.ts:208`). `validateShellCommand` (`execute.ts:180-181`) rejects backticks, `$()`, `${}`, positional params, pipes, redirections, `eval`, and `source`, but not semicolons or `&&` themselves. The local fallback then runs the command as `["sh", "-c", options.language.compileCommand]` (`execute.ts:775`).

**Hypothesis A (benign/intended):** `compileCommand`/`runCommand` come from admin-controlled `language_configs`, not user input. The sandbox (`--network=none`, `--cap-drop=ALL`, read-only rootfs, seccomp, unprivileged user) limits the blast radius to the ephemeral workspace.

**Hypothesis B (failure/exploit):** If an attacker can modify `language_configs` (e.g., via a compromised admin account or an injection bug in the admin language editor), they can execute arbitrary shell inside the sandbox. While the sandbox is strong, it is still a broader attack surface than a simple argv-based compiler invocation.

**Evidence:**
- `execute.ts:189-251`: prefix whitelist and strict validator.
- `execute.ts:775,817`: commands wrapped in `sh -c`.
- `execute.test.ts:81-109`: tests reject pipes and `||`, but do not test arbitrary `sh -c` payloads.

**Confidence:** High — the design is intentional, but the trust boundary is worth documenting explicitly.  
**Next probe:** Review admin endpoints that write `language_configs` for authorization and input validation.

---

### T-COMP-2 — `exitCode: null` for validation failures

**Observation:** When `validateShellCommandStrict` rejects a command, `executeCompilerRun` returns `{ ..., exitCode: null, stderr: "Invalid compile command" | "Invalid run command" }` (`/tmp/judgekit-local/src/lib/compiler/execute.ts:667-687`).

**Hypothesis A (benign/intended):** Callers are expected to treat `null` as a non-execution failure; tests assert this shape.

**Hypothesis B (failure/exploit):** A downstream component that assumes `exitCode` is always a number may classify `null` as a system error or unexpected state, leading to confusing UI messages or incorrect verdict logic.

**Evidence:**
- `execute.ts:667-687`: validation returns `exitCode: null`.
- `execute.test.ts:92-108`: asserts `exitCode: null`.

**Confidence:** Low — no observed misclassification in the traced callers.  
**Next probe:** Static-type or runtime audit all consumers of `CompilerRunResult.exitCode` for null handling.

---

### T-COMP-3 — Environment-variable-prefixed commands rejected despite documentation

**Observation:** The trust-boundary comment at `execute.ts:764-767` states that compile commands may include "env var prefixes" and `&&` chains. However, `validateShellCommandStrict` splits each chained segment by whitespace and checks the first token against `ALLOWED_COMMAND_PREFIXES`. A segment such as `FOO=bar gcc ...` has first token `FOO=bar`, which is not a known prefix and is rejected.

**Hypothesis A (benign/intended):** The comment is stale; env-var prefixes are not actually supported in local fallback, and admins should embed environment setup inside `sh -c` strings.

**Hypothesis B (failure/exploit):** An admin sets a language config compile command with an environment prefix (e.g., `VMODULES=/tmp v build`). Local fallback rejects it as "Invalid compile command" even though the comment says such commands are supported. The Rust runner may still accept it (it has its own validator), creating inconsistent behavior between runner and fallback modes.

**Evidence:**
- `execute.ts:184-251`: validator rejects any first token not in the prefix list; `FOO=bar` does not match.
- `execute.ts:764-767`: comment explicitly mentions "env var prefixes" as allowed.
- `execute.ts:775`: compile command passed to `sh -c`.

**Confidence:** Medium.  
**Next probe:** Either update the comment to remove the env-var-prefix claim, or enhance `isValidCommandPrefix` / segment parsing to strip leading `KEY=VALUE` assignments before checking the command prefix. Verify parity with `judge-worker-rs/src/runner.rs#validate_shell_command`.

---

### T-JUDGE-1 — No API-side dead-letter for mismatched claim tokens

**Observation:** `/poll` returns 403 when the claim token no longer matches (`/tmp/judgekit-local/src/app/api/v1/judge/poll/route.ts:113-118` and `:191-196`). The Rust worker retries with backoff and ultimately writes a local dead-letter file (`judge-worker-rs/src/executor.rs`), but the API never records that a worker attempted to report a result for a reclaimed submission.

**Hypothesis A (benign/intended):** The optimistic-lock mismatch is a normal, self-healing race; the stale submission is re-claimed by another worker. Logging every mismatch would be noisy.

**Hypothesis B (failure/exploit):** During a worker partition or long GC pause, a worker may accumulate multiple completed results that all fail the claim-token check. Without an API-side dead-letter or metric, operators cannot distinguish a benign race from a systemic worker lag or replay attack.

**Evidence:**
- `poll/route.ts:97-101,168-172`: `rowCount === 0` throws `invalidJudgeClaim`, converted to 403.
- `executor.rs` (read during review): worker-side dead-letter after retries.
- No audit event or metric is emitted for the mismatch.

**Confidence:** Low.  
**Next probe:** Add a metric/audit event for claim-token mismatches and observe baseline rate under load.

---

### T-DEPLOY-1 — Unfiltered `docker container prune -f` on app host

**Observation:** `prune_old_docker_artifacts` runs `docker container prune -f` without `--filter` on the app host (`/tmp/judgekit-local/deploy-docker.sh:459`). The worker variant uses `--filter 'until=24h'` (`deploy-docker.sh:530`).

**Hypothesis A (benign/intended):** `algo.xylolabs.com` is a dedicated app server (per `CLAUDE.md`); no non-judgekit stopped containers should exist.

**Hypothesis B (failure/exploit):** If the host is ever shared or an operator runs a one-off stopped container, the deploy will silently delete it, potentially destroying forensic evidence or manual debug state.

**Evidence:**
- `deploy-docker.sh:459`: `"$runner" "docker container prune -f ..."`.
- `CLAUDE.md`: "algo.xylolabs.com is the app server".

**Confidence:** Low — topology-specific.  
**Next probe:** Apply the same `--filter until=24h` guard to the app-host prune for defense in depth.

---

### T-DEPLOY-2 — Aggressive build-cache purge under disk pressure

**Observation:** `safe_docker_storage_cleanup` runs `docker builder prune -af` (`/tmp/judgekit-local/deploy-docker.sh:532`) when disk usage exceeds the warning threshold.

**Hypothesis A (benign/intended):** This is an intentional recovery path; `-af` removes only unused cache, and the comment explicitly says "no volumes".

**Hypothesis B (failure/exploit):** A concurrent build on the same Docker daemon (e.g., a manual worker image build) could lose its cache mid-build, causing flakiness or longer build times.

**Evidence:**
- `deploy-docker.sh:532`: `"$runner" "docker builder prune -af ..."`.
- `deploy-docker.sh:526-534`: comment emphasizes no volume prune.

**Confidence:** Low.  
**Next probe:** Measure build time impact after a cache purge and consider whether `--filter until=24h` is sufficient.

---

### T-DEPLOY-3 — Unpinned npm install inside migration container

**Observation:** The migration step runs a transient container that executes `npm install --no-save drizzle-kit@latest pg` (`/tmp/judgekit-local/deploy-docker.sh:~1237`). There is no `package-lock.json` or version pin.

**Hypothesis A (benign/intended):** Using `@latest` ensures migrations run with the newest compatible `drizzle-kit`, avoiding version drift between local dev and deploy.

**Hypothesis B (failure/exploit):** A compromised npm registry, a malicious takeover of the `drizzle-kit` package, or an accidental breaking release could cause the migration container to execute attacker-controlled code with full database credentials (`DATABASE_URL`, `POSTGRES_PASSWORD`) mounted as environment variables.

**Evidence:**
- `deploy-docker.sh` migration block: `npm install --no-save drizzle-kit@latest pg` inside a Docker container that also runs `drizzle-kit push`.
- The container is launched with `--env-file .env.production`, giving it access to all secrets.

**Confidence:** Medium — supply-chain risk is inherent to unpinned installs.  
**Next probe:** Pin `drizzle-kit` and `pg` to exact versions in `package.json` or the deploy script, and install from the locked dependency tree instead of `@latest`.

---

### T-DEPLOY-4 — `AUTH_TRUST_HOST=true` in production

**Observation:** The deploy script writes `AUTH_TRUST_HOST=true` into `.env.production` (`/tmp/judgekit-local/deploy-docker.sh:856`). `src/lib/security/env.ts:260-266` returns `true` in production unless the env var is explicitly `"false"`.

**Hypothesis A (benign/intended):** Auth.js needs this behind a reverse proxy because `X-Forwarded-Host` is intentionally not set for RSC navigation; Nginx enforces the canonical host.

**Hypothesis B (failure/exploit):** If Nginx host validation is ever relaxed or a client can reach the app directly, `AUTH_TRUST_HOST=true` may allow host-header spoofing of callback URLs or password-reset links.

**Evidence:**
- `deploy-docker.sh:856`: `upsert_env_literal AUTH_TRUST_HOST true`.
- `CLAUDE.md` and nginx config enforce HTTPS/canonical domains.
- The generated nginx config no longer sets `X-Forwarded-Host`, but it also does not strip a client-supplied one.

**Confidence:** Medium-High.  
**Next probe:** Default `AUTH_TRUST_HOST=false` when `AUTH_URL` is set; have nginx explicitly overwrite or remove `X-Forwarded-Host`.

---

### T-DEPLOY-5 — SSH password visible in local process list

**Observation:** When `SSH_PASSWORD` is set, the deploy script invokes `sshpass -p "$SSH_PASSWORD" ssh ...` (`/tmp/judgekit-local/deploy-docker.sh:595`). The password appears as a command-line argument to `sshpass`.

**Hypothesis A (benign/intended):** This is how `sshpass` works; deployments run on a trusted operator workstation.

**Hypothesis B (failure/exploit):** On a multi-user build host, another local user can see the password via `ps` while the deploy is running.

**Evidence:**
- `deploy-docker.sh:595`: `printf '%s\n' "$sudo_pw" | sshpass -p "$SSH_PASSWORD" ssh ...`.

**Confidence:** Low — environment-dependent.  
**Next probe:** Prefer key-based SSH for deploy hosts and remove `SSH_PASSWORD` usage where possible; if password auth is required, use a short-lived SSH agent or `sshpass` from an env file with restricted visibility.

---

## 4. Positive Controls Observed

These are deliberate, well-implemented safeguards that mitigate the findings above and were confirmed during tracing.

- **Judge auth separation:** The shared `JUDGE_AUTH_TOKEN` is accepted only on `/register` (`/tmp/judgekit-local/src/app/api/v1/judge/register/route.ts`). `/claim`, `/poll`, `/heartbeat`, and `/deregister` require per-worker `secretTokenHash` and use `safeTokenCompare` (`/tmp/judgekit-local/src/lib/security/timing.ts:9`).
- **Atomic claim SQL:** `buildClaimSql` (`/tmp/judgekit-local/src/lib/judge/claim-query.ts:27`) uses `FOR UPDATE`, `FOR UPDATE SKIP LOCKED`, stale-claim reclamation, and a self-reclaim compensation term, preventing double claims and capacity leaks.
- **Claim-token optimistic locking:** `/poll` only updates rows whose `judgeClaimToken` matches (`/tmp/judgekit-local/src/app/api/v1/judge/poll/route.ts:97,168`).
- **IP allowlist fail-closed:** `isJudgeIpAllowed` denies unknown IPs when an allowlist exists (`/tmp/judgekit-local/src/lib/judge/ip-allowlist.ts:207`).
- **Compiler sandbox:** Local fallback uses `--network=none`, `--cap-drop=ALL`, `--read-only`, custom seccomp, unprivileged user, and workspace `chown`/`chmod` fail-closed (`/tmp/judgekit-local/src/lib/compiler/execute.ts:350-388,744-758`).
- **Deploy guards:** `algo.xylolabs.com` deploy enforces `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false` (`/tmp/judgekit-local/deploy-docker.sh:312`), uses pre-deploy DB backups, PG volume safety checks, and never runs `docker system prune --volumes`.
- **Secret redaction:** `judgeClaimToken`, `workerSecret`, `RUNNER_AUTH_TOKEN`, etc. are listed in `LOGGER_REDACT_PATHS` (`/tmp/judgekit-local/src/lib/security/secrets.ts:48-73`).
- **Rate-limiter fail-open:** Sidecar failures fall back to the authoritative DB path (`/tmp/judgekit-local/src/lib/security/rate-limiter-client.ts:53-108`).
- **XFF chain preserved in deploy script:** Generated nginx config now uses `$proxy_add_x_forwarded_for`, correctly preserving the client IP chain behind trusted proxies.

---

## 5. Final Sweep

Additional checks performed to surface missed issues:

1. **TODO/FIXME grep** across `src/`, `judge-worker-rs/src/`, and `deploy-docker.sh` — only unrelated stub comments found.
2. **Secret logging audit** — `judgeClaimToken`, `workerSecret`, `RUNNER_AUTH_TOKEN`, and `JUDGE_AUTH_TOKEN` are covered by logger redaction paths.
3. **JUDGE_AUTH_TOKEN leakage check** — the shared token is used only for `/register` in the app and for initial worker config validation in Rust; it is not honored on claim/poll/heartbeat/deregister.
4. **Destructive Docker command audit** — `docker system prune --volumes` is absent; image prune uses dangling-only `-f`; volume prune is not called. The only unfiltered container prune is on the dedicated app host (T-DEPLOY-1).
5. **Rate-limit key generation** — confirmed fallback to `unknown` bucket (T-JOIN-2, T-IPRL-1).
6. **Cross-instance state audit** — rate-limiter buckets, capability cache, system-settings cache, and analytics cache are module-level singletons with no cross-instance invalidation. In a horizontally scaled deployment, changes propagate only to the replica that handled the write.
7. **Template audit** — `scripts/online-judge.nginx.conf` still uses `$remote_addr`, creating regression risk (T-DEPLOY-6).
8. **Tests run** — Focused unit-test files passed (`tests/unit/api/contests.route.test.ts`, `similarity-check.route.test.ts`, `compiler/execute.test.ts`, `security/ip.test.ts`, `infra/deploy-security.test.ts`, `infra/deploy-storage-safety.test.ts`, `infra/judge-report-nginx.test.ts`); `cargo test` in `judge-worker-rs` passed.

No additional exploitable bugs beyond the findings above were identified in the traced flows.

---

## 6. Conclusion & Recommended Next Probes

The traced flows are architecturally sound and show evidence of iterative hardening (per-worker secrets, atomic claim SQL, sandboxed compiler, deploy guards). The remaining risk is mostly residual design/operational rather than active vulnerabilities, with a few new high-severity causal defects identified in this pass.

**Highest-priority fixes:**
1. Cap in-progress judging duration so a worker cannot extend a claim forever (T-JUDGE-2).
2. Fix `createApiHandler` custom-role rejection (T-AUTH-1).
3. Generate `JUDGE_ALLOWED_IPS` or enable strict allowlist by default in production env (T-DEPLOY-7).
4. Update `scripts/online-judge.nginx.conf` to use `$proxy_add_x_forwarded_for` and add regression test (T-DEPLOY-6).
5. Compose the caller's abort signal with the Rust sidecar's internal timeout (T-SIM-4).
6. Add a per-assignment advisory lock to `runAndStoreSimilarityCheck` (T-SIM-1).
7. Add rate limiting and streaming to file downloads (T-FILES-1).

**Recommended next probes:**
1. Verify production Nginx `X-Forwarded-For` handling and decide whether the `unknown` rate-limit bucket should be rejected or separately bounded (T-JOIN-2, T-IPRL-1).
2. Reorder or clarify the join-route failure limiters so the per-code bucket is consumed unconditionally (T-JOIN-3).
3. Reset invalid-code rate-limit counters on successful redemption (T-JOIN-5).
4. Add a route test for the pure group-TA similarity-check path and confirm intended policy (T-SIM-3).
5. Benchmark the TS similarity fallback near the 500-submission cap under the 30 s timeout (T-SIM-2).
6. Review the admin surface for `language_configs` writes to ensure the `sh -c` trust boundary cannot be crossed by lower-privilege users (T-COMP-1).
7. Resolve the env-var-prefix documentation/implementation inconsistency in compiler validation (T-COMP-3).
8. Add graceful shutdown draining for the Rust worker runner HTTP server (T-JUDGE-3).
9. Audit cross-instance caches for horizontal-scaling consistency.
10. Pin migration container dependencies (T-DEPLOY-3).

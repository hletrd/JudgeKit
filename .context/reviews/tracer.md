# Causal Tracer Review — /tmp/judgekit-local

**Scope:** Suspicious or complex flows in JudgeKit: contest join, similarity check, compiler execute, IP security/rate limiting, judge claim/poll/heartbeat/deregister, and deployment scripts.  
**Constraints:** Read-only review; no fixes applied. All work performed only in `/tmp/judgekit-local`.  
**Date:** 2026-07-01  
**Evidence base:** Source code, project docs (`CLAUDE.md`, `AGENTS.md`), the previous tracer review in this file, and focused test runs (90 TypeScript unit tests passed across the target files; 80 Rust `cargo test` suites passed for `judge-worker-rs`).

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

### 2.6 Deploy Scripts (`deploy-docker.sh`)

`/tmp/judgekit-local/deploy-docker.sh` → local env profile hardening (`chmod 600`) → app-only guard for `algo.xylolabs.com` → SSH multiplexing → pre-deploy DB backup + PG volume safety check → `secret_token` backfill/drop before `drizzle-kit push` → app-only compose up → dedicated worker sync/restart with HTTPS enforcement → nginx `client_max_body_size` scoped to `/api/v1/judge/poll` (50 M) and `/api/v1/judge/` (1 m).

---

## 3. Findings

| ID | Flow | Observation | Classification | Confidence |
|---|---|---|---|---|
| T-JOIN-1 | Contest join | Access codes stored as plaintext in `assignments.accessCode`. | Security / data-at-rest | High |
| T-JOIN-2 | Contest join | Global IP rate-limit bucket (`:unknown`) when `X-Forwarded-For` is missing in production. | Security / availability | Medium |
| T-JOIN-3 | Contest join | Per-user failure limiter runs before per-code limiter, giving multi-account attackers N independent budgets. | Security / rate limiting | Medium |
| T-JOIN-4 | Contest join | `23505` recovery in `redeemAccessCode` assumes the conflict is `(assignmentId, userId)` without checking the constraint. | Reliability / future-proofing | Medium |
| T-SIM-1 | Similarity check | No per-assignment concurrency lock; concurrent runs race and last-write-wins. | Reliability | Medium |
| T-SIM-2 | Similarity check | TS fallback O(n²) with 500 cap and hard 30 s route timeout can return `timed_out` with no stored results. | Reliability | Medium |
| T-SIM-3 | Similarity check | Capability check runs before group-TA check, leaving the pure-TA path untested and possibly dead. | Authorization / consistency | Medium |
| T-IPRL-1 | IP / rate limit | Same IP-extraction logic is fail-open for rate limiting (`unknown`) but fail-closed for judge allowlist. | Security / consistency | Medium |
| T-IPRL-2 | Rate limiter | In-memory sidecar resets counters on restart; DB path corrects only after the sidecar allows the request. | Security / reliability | Low |
| T-COMP-1 | Compiler execute | `bash`/`sh` are in the allowed command-prefix whitelist, so admin-supplied `sh -c` scripts pass strict validation. | Security / trust boundary | High |
| T-COMP-2 | Compiler execute | Validation failures return `exitCode: null`; consumers must handle null explicitly. | Reliability | Low |
| T-COMP-3 | Compiler execute | `validateShellCommandStrict` rejects environment-variable-prefixed segments despite the trust-boundary comment claiming they are supported. | Reliability / consistency | Medium |
| T-JUDGE-1 | Judge poll | Claim-token mismatch returns 403; no API-side dead-letter beyond the Rust worker's local file. | Reliability / observability | Low |
| T-DEPLOY-1 | Deploy | `docker container prune -f` on the app host has no `--filter` and could delete other stopped containers on a shared host. | Operations | Low |
| T-DEPLOY-2 | Deploy | `docker builder prune -af` under disk pressure wipes all unused build cache. | Operations | Low |
| T-DEPLOY-3 | Deploy | Migration container runs unpinned `npm install --no-save drizzle-kit@latest pg`. | Security / supply chain | Medium |
| T-DEPLOY-4 | Deploy | `.env.production` sets `AUTH_TRUST_HOST=true`; relies on nginx for host-header discipline. | Security | Low |
| T-DEPLOY-5 | Deploy | `sshpass -p "$SSH_PASSWORD"` exposes the SSH password in the local process list. | Security | Low |

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

### T-SIM-1 — No concurrency guard for similarity scans

**Observation:** `runAndStoreSimilarityCheck` (`/tmp/judgekit-local/src/lib/assignments/code-similarity.ts:404-454`) reads submissions, computes pairs (possibly via the Rust sidecar), then executes a transaction that deletes existing `code_similarity` events for the assignment and inserts the new set. There is no advisory lock, unique constraint, or row-level lock on an assignment-level coordinator row.

**Hypothesis A (benign/intended):** Similarity checks are operator-initiated and infrequent; the chance of two authorized users triggering the same scan simultaneously is low.

**Hypothesis B (failure/exploit):** Two concurrent scans for the same assignment can both read the same submission set, consume CPU, then race to delete/insert. The later transaction overwrites the earlier one; intermediate states may be invisible, and CPU/memory is wasted. Under the 30 s route timeout, a slow race could also tip one request into `timed_out`.

**Evidence:**
- `code-similarity.ts:442-453`: `tx.delete(...).where(assignmentId, eventType=code_similarity)` followed by `tx.insert(...)`.
- No `pg_advisory_lock`, `SELECT ... FOR UPDATE`, or `assignment` row lock precedes the read.
- Route timeout: `similarity-check/route.ts:48`.

**Confidence:** Medium.  
**Next probe:** Add a load test that fires two similarity-check POSTs concurrently and verify event count/duplication.

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

**Observation:** The deploy script writes `AUTH_TRUST_HOST=true` into `.env.production` (`/tmp/judgekit-local/deploy-docker.sh:856`).

**Hypothesis A (benign/intended):** Auth.js needs this behind a reverse proxy because `X-Forwarded-Host` is intentionally not set for RSC navigation; Nginx enforces the canonical host.

**Hypothesis B (failure/exploit):** If Nginx host validation is ever relaxed or a client can reach the app directly, `AUTH_TRUST_HOST=true` may allow host-header spoofing of callback URLs or password-reset links.

**Evidence:**
- `deploy-docker.sh:856`: `upsert_env_literal AUTH_TRUST_HOST true`.
- `CLAUDE.md` and nginx config enforce HTTPS/canonical domains.

**Confidence:** Low — contingent on nginx misconfiguration.  
**Next probe:** Verify that Nginx rejects non-canonical `Host` headers and does not forward arbitrary `X-Forwarded-Host`.

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

---

## 5. Final Sweep

Additional checks performed to surface missed issues:

1. **TODO/FIXME grep** across `src/`, `judge-worker-rs/src/`, and `deploy-docker.sh` — only unrelated stub comments found.
2. **Secret logging audit** — `judgeClaimToken`, `workerSecret`, `RUNNER_AUTH_TOKEN`, and `JUDGE_AUTH_TOKEN` are covered by logger redaction paths.
3. **JUDGE_AUTH_TOKEN leakage check** — the shared token is used only for `/register` in the app and for initial worker config validation in Rust; it is not honored on claim/poll/heartbeat/deregister.
4. **Destructive Docker command audit** — `docker system prune --volumes` is absent; image prune uses dangling-only `-f`; volume prune is not called. The only unfiltered container prune is on the dedicated app host (T-DEPLOY-1).
5. **Rate-limit key generation** — confirmed fallback to `unknown` bucket (T-JOIN-2, T-IPRL-1).
6. **Tests run** — Focused unit-test files passed (`tests/unit/api/contests.route.test.ts`, `similarity-check.route.test.ts`, `compiler/execute.test.ts`, `security/ip.test.ts`, `infra/deploy-security.test.ts`, `infra/deploy-storage-safety.test.ts`, `infra/judge-report-nginx.test.ts`); `cargo test` in `judge-worker-rs` passed.

No additional exploitable bugs beyond the findings above were identified in the traced flows.

---

## 6. Conclusion & Recommended Next Probes

The traced flows are architecturally sound and show evidence of iterative hardening (per-worker secrets, atomic claim SQL, sandboxed compiler, deploy guards). The remaining risk is mostly residual design/operational rather than active vulnerabilities.

**Highest-value probes:**
1. Verify production Nginx `X-Forwarded-For` handling and decide whether the `unknown` rate-limit bucket should be rejected or separately bounded (T-JOIN-2, T-IPRL-1).
2. Reorder or clarify the join-route failure limiters so the per-code bucket is consumed unconditionally (T-JOIN-3).
3. Add a concurrency lock or idempotency key to `runAndStoreSimilarityCheck` (T-SIM-1).
4. Pin the migration container's `drizzle-kit`/`pg` versions or install from the project lockfile (T-DEPLOY-3).
5. Add a route test for the pure group-TA similarity-check path and confirm intended policy (T-SIM-3).
6. Benchmark the TS similarity fallback near the 500-submission cap under the 30 s timeout (T-SIM-2).
7. Review the admin surface for `language_configs` writes to ensure the `sh -c` trust boundary cannot be crossed by lower-privilege users (T-COMP-1).
8. Resolve the env-var-prefix documentation/implementation inconsistency in compiler validation (T-COMP-3).

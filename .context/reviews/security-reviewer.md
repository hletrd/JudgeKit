# Security Review — JudgeKit (Cycle 4, post-Cycle-3 remediation)

**Date:** 2026-07-03  
**Scope:** Entire `/tmp/judgekit-local` repository — Next.js 16 App Router API, authentication/authorization, secrets handling, input validation/injection, Docker sandboxing, Rust judge worker coordination, deployment/nginx hardening, and operational security.  
**Method:** Code inspection of every security-relevant file, path tracing, targeted greps for dangerous patterns, and re-validation of findings from the Cycle 3 final security review.  
**Summary:** No CRITICAL remote-code-execution or authentication-bypass issues were found in the current code. Cycle 3 remediated many serious gaps (CSRF origin checks, IP canonicalization, sandbox gating order, worker per-token auth, similarity-check abort propagation, file-list rate limiting, snapshot-path redaction, nginx hardening, Docker network segmentation). The dominant residual risks remain insecure-by-default production values (`AUTH_TRUST_HOST`, `JUDGE_ALLOWED_IPS`), information-disclosure leaks in the admin worker inventory, and plaintext internal service traffic on shared Docker networks.

**Findings count:** 11 (HIGH 2, MEDIUM 5, LOW 4)

---

## File inventory reviewed

| Area | Key files |
|------|-----------|
| Project context | `CLAUDE.md`, `AGENTS.md`, `.context/reviews/_aggregate.md`, `.context/reviews/security-reviewer.md` (prior) |
| API handler / auth wrapper | `src/lib/api/handler.ts`, `src/lib/api/auth.ts`, `src/lib/auth/config.ts`, `src/lib/security/env.ts`, `src/lib/security/csrf.ts` |
| API keys | `src/lib/api/api-key-auth.ts`, `src/lib/security/token-hash.ts`, `src/lib/security/timing.ts` |
| IP / rate limiting | `src/lib/security/ip.ts`, `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`, `src/lib/judge/ip-allowlist.ts` |
| Sandbox gating | `src/lib/security/sandbox-gate.ts` |
| Compiler / executor | `src/lib/compiler/execute.ts`, `src/app/api/v1/compiler/run/route.ts`, `src/app/api/v1/playground/run/route.ts` |
| Judge worker (Rust) | `judge-worker-rs/src/runner.rs`, `judge-worker-rs/src/docker.rs`, `judge-worker-rs/src/executor.rs`, `judge-worker-rs/src/workspace.rs` |
| Judge API / auth | `src/app/api/v1/judge/register/route.ts`, `src/app/api/v1/judge/claim/route.ts`, `src/lib/judge/auth.ts`, `src/lib/judge/docker-image-validation.ts` |
| Languages | `src/lib/judge/languages.ts` |
| Contests / assignments | `src/app/api/v1/contests/join/route.ts`, `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`, `src/lib/assignments/code-similarity.ts`, `src/lib/assignments/code-similarity-client.ts` |
| Files | `src/app/api/v1/files/route.ts`, `src/app/api/v1/files/[id]/route.ts`, `src/lib/files/storage.ts`, `src/lib/files/validation.ts`, `src/lib/db/export-with-files.ts` |
| Admin / workers / import / restore | `src/app/api/v1/admin/workers/route.ts`, `src/app/api/v1/admin/restore/route.ts`, `src/app/api/v1/admin/migrate/import/route.ts`, `src/app/api/v1/admin/settings/route.ts` |
| Docker / deployment | `Dockerfile.judge-worker`, `docker-compose.production.yml`, `deploy-docker.sh`, `static-site/nginx.conf`, `next.config.ts` |
| Backup / ops | `scripts/backup-db.sh` |
| Encryption / secrets | `src/lib/security/encryption.ts`, `src/lib/security/secrets.ts` |

---

## HIGH: `AUTH_TRUST_HOST` is hardcoded/enforced to `true` in production

- **Classification:** Authentication / Session security / Host trust
- **Confidence:** High
- **File(s):** `src/lib/security/env.ts:260-265`, `src/lib/auth/config.ts:317`, `deploy-docker.sh:750,878,952`
- **Problem:** `shouldTrustAuthHost()` returns `true` whenever `AUTH_TRUST_HOST === "true"`. The deploy script generates `.env.production` with `AUTH_TRUST_HOST=true` and actively enforces the literal value during post-backfill assertions. With NextAuth's `trustHost` enabled, Auth.js derives canonical URLs from the incoming `Host` / `X-Forwarded-Host` headers. The generated nginx template does not set `X-Forwarded-Host`, but it also does not strip a client-supplied one, and it proxies the client `Host` through to the app.
- **Concrete exploit/failure scenario:** An attacker making direct requests to the origin with `Host: attacker.com` or `X-Forwarded-Host: attacker.com` can cause Auth.js to generate callback URLs, email links, or session state bound to an attacker-controlled host. If OAuth providers or magic-link flows are enabled later, this becomes an account-takeover vector; today it weakens the host-bound security boundary that CSRF origin checks and email links rely on.
- **Suggested fix:** Default `AUTH_TRUST_HOST=false` in production when `AUTH_URL` is explicitly set, and rely on `AUTH_URL` plus the DB `allowedHosts` list as the trusted-host set. In nginx, explicitly strip or overwrite `X-Forwarded-Host` before proxying to the app.
- **Cross-references:** `src/lib/security/csrf.ts:7-30`, `src/lib/security/env.ts:213-241`

## HIGH: Judge API IP allowlist defaults to allow-all

- **Classification:** Authorization / Network access control
- **Confidence:** High
- **File(s):** `src/lib/judge/ip-allowlist.ts:20-48`; `.env.production.example:89-93` (commented-out defaults); `src/app/api/v1/judge/register/route.ts:27-41`, `src/app/api/v1/judge/claim/route.ts:13`
- **Problem:** When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed()` returns `true` for every IP. The production compose file and generated `.env.production` do not populate an allowlist. The code logs a one-time warning, but the open posture ships by default.
- **Concrete exploit/failure scenario:** A leaked `JUDGE_AUTH_TOKEN` (via env backup, CI log, container inspect, or unencrypted backup) lets any internet host register fake workers, claim submissions (reading `sourceCode` and hidden `testCases`), and inject arbitrary judge verdicts. Even though per-worker secrets are required for `/claim`, the registration path is the critical chokepoint and remains unbounded by IP.
- **Suggested fix:** Generate `.env.production` with `JUDGE_ALLOWED_IPS` restricted to the worker subnet(s), or set `JUDGE_STRICT_IP_ALLOWLIST=1` and require operators to configure an explicit allowlist before workers can register.
- **Cross-references:** `src/lib/judge/auth.ts:26-35`, `src/lib/security/ip.ts:142-205`

---

## MEDIUM: Admin worker inventory exposes worker IP addresses

- **Classification:** Information disclosure / Reconnaissance aid
- **Confidence:** High
- **File(s):** `src/app/api/v1/admin/workers/route.ts:11-47` (especially `:21`)
- **Problem:** `GET /api/v1/admin/workers` returns the full `ipAddress` field for every judge worker to any user who holds the `system.settings` capability. The route has no rate limit and performs a simple `SELECT ... FROM judge_workers ORDER BY registeredAt`.
- **Concrete exploit/failure scenario:** A compromised admin account, malicious browser extension, or XSS on an admin session obtains the internal network topology of the judge worker fleet. This accelerates lateral movement: an attacker can target worker hosts directly, correlate IP ranges with cloud subnets, or plan internal service scanning. It also exposes the judge workers to social-engineering or targeted credential-reuse attacks.
- **Suggested fix:** Redact or omit `ipAddress` from the inventory response unless the caller holds a narrower capability such as `system.settings.workers.view_ips`. Log the full address server-side and in the audit event, and rate-limit the endpoint.
- **Cross-references:** `src/lib/capabilities/cache.ts`, `src/lib/audit/events.ts`

## MEDIUM: Internal service traffic is unencrypted HTTP

- **Classification:** Infrastructure / Transit encryption
- **Confidence:** High
- **File(s):** `docker-compose.production.yml:116-118,151`; `src/lib/compiler/execute.ts:665-681`; `src/lib/assignments/code-similarity-client.ts`; `src/lib/security/api-rate-limit.ts`
- **Problem:** The production compose sets `COMPILER_RUNNER_URL=${COMPILER_RUNNER_URL:-http://judge-worker:3001}`, `CODE_SIMILARITY_URL=${CODE_SIMILARITY_URL:-http://code-similarity:3002}`, `RATE_LIMITER_URL=http://rate-limiter:3001`, and `JUDGE_BASE_URL=http://app:3000/api/v1`. Although network segmentation isolates these services from the frontend and database networks, traffic on the shared `backend`/`judge` bridges is still plaintext. The Rust worker refuses remote HTTP unless `JUDGE_ALLOW_INSECURE_HTTP=1`, but it treats internal hostnames as local and accepts plain HTTP.
- **Concrete exploit/failure scenario:** A compromised sidecar or auxiliary container that gains access to the backend/judge network can sniff `JUDGE_AUTH_TOKEN`, per-worker `workerSecret`, `RUNNER_AUTH_TOKEN`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`, hidden test cases, and source code in transit. Because these tokens are long-lived static secrets, a single network sniff can grant persistent judge access.
- **Suggested fix:** Terminate TLS at an internal reverse proxy or enable mTLS between app, worker, code-similarity, and rate-limiter; at minimum, split the worker/judge network from the general backend network so only the worker and docker-proxy share the judge bridge.
- **Cross-references:** `judge-worker-rs/src/config.rs`, `rate-limiter-rs/src/main.rs`

## MEDIUM: Local compiler fallback can spawn judge containers on the app server in production

- **Classification:** Infrastructure / Architecture boundary violation
- **Confidence:** Medium
- **File(s):** `src/lib/compiler/execute.ts:68-105,649-726,819-848`; `docker-compose.production.yml:116`; `CLAUDE.md` ("algo.xylolabs.com is the app server ... Do NOT build judge/worker images on this server")
- **Problem:** `executeCompilerRun()` delegates to the Rust runner when `COMPILER_RUNNER_URL` is set, but it can fall back to local Docker container execution if the URL is unset or if `ENABLE_COMPILER_LOCAL_FALLBACK=1`. In production the fallback is gated by the presence of a custom seccomp profile, but it is still permitted. The project `CLAUDE.md` explicitly states that the app server should run only the Next.js app, PostgreSQL, and Nginx — judge images must be built only on the dedicated worker host.
- **Concrete exploit/failure scenario:** A misconfigured deploy that omits `COMPILER_RUNNER_URL` or an attacker who can set `ENABLE_COMPILER_LOCAL_FALLBACK=1` causes the app server to spawn untrusted student code inside Docker containers. Even with seccomp/cap-drop/network-none, this violates the declared architecture, increases the app-server attack surface, and can lead to resource exhaustion or container escape on the host that also holds the database.
- **Suggested fix:** Disable local compiler fallback entirely in production (`NODE_ENV === "production"`) regardless of the seccomp profile. Treat a missing `COMPILER_RUNNER_URL` as a fatal configuration error in production.
- **Cross-references:** `src/app/api/v1/compiler/run/route.ts`, `src/app/api/v1/playground/run/route.ts`

## MEDIUM: Deploy script still contains a destructive raw SQL backfill/drop block

- **Classification:** Operational / Database integrity
- **Confidence:** Medium
- **File(s):** `deploy-docker.sh:1246-1312` (backfill block); `drizzle/pg/0020_drop_judge_workers_secret_token.sql`
- **Problem:** The deploy script can execute destructive raw SQL (`UPDATE judge_workers SET secret_token_hash = ...`, `ALTER TABLE ... DROP COLUMN secret_token`) directly against the production database via `docker exec judgekit-db psql`. The block is now gated by `ALLOW_SECRET_TOKEN_BACKFILL=1` (default off) and verifies the column is gone afterwards, but it remains a manual DDL repair outside the normal migration tool. The documented sunset criterion is 2026-10-26.
- **Concrete exploit/failure scenario:** An operator who sets `ALLOW_SECRET_TOKEN_BACKFILL=1` on a stale branch, a quoting bug in the remote shell command, or a compromised deploy host could corrupt the `judge_workers` table or drop data unexpectedly. Because the block runs before `drizzle-kit push`, a mistake here can lock operators out of workers or destroy the only copy of legacy shared secrets.
- **Suggested fix:** Finish the migration everywhere, verify `secret_token` is absent in all environments, and remove the block before the 2026-10-26 sunset. The existing `ALLOW_SECRET_TOKEN_BACKFILL` guard is a good interim control — keep it off by default and document that it should only be enabled during a one-time cleanup.
- **Cross-references:** `src/lib/judge/auth.ts:52-97`

---

## LOW: Unencrypted database backups by default

- **Classification:** Operational / Data confidentiality
- **Confidence:** High
- **File(s):** `scripts/backup-db.sh:22-49,89-96`
- **Problem:** The backup script supports age encryption and rclone off-host sync, but both are optional. In the default host-exec or container-exec path, the gzip backup contains a full plaintext dump of the database (including password hashes, API keys, submissions, and hidden test cases). Backup file permissions are not explicitly tightened.
- **Concrete exploit/failure scenario:** A backup file left on the host with default permissions is readable by any local user or attacker who gains host access, bypassing application-level access controls and exposing all user data.
- **Suggested fix:** Require an `AGE_RECIPIENT` by default and exit with a clear error if it is unset, or tighten the backup file permissions to `0o600` and warn operators that the backup is unencrypted. Ensure the backup directory is created with mode `0o700`.
- **Cross-references:** `scripts/backup-db.sh:22-50`

## LOW: Deploy script sources per-target env files via shell

- **Classification:** Operational / Supply-chain
- **Confidence:** Medium
- **File(s):** `deploy-docker.sh:161-183`
- **Problem:** `deploy-docker.sh` sources `.env.deploy` and `.env.deploy.<target>` files through the shell (`source "${env_file}"`). These files can contain arbitrary shell commands, not just variable assignments. Although the script chmods them to `600`, it does not validate their contents.
- **Concrete exploit/failure scenario:** If a `.env.deploy.<target>` file is modified by a compromised operator account or an attacker with write access to the deployment host, executing the deploy script runs attacker-controlled commands with the deploy user's privileges. This could exfiltrate `POSTGRES_PASSWORD`, `NODE_ENCRYPTION_KEY`, or other production secrets.
- **Suggested fix:** Parse env files with a restricted parser (e.g., `grep '^[A-Z_][A-Z0-9_]*='` or a dedicated env parser) instead of `source`, and reject lines containing command substitution, backticks, semicolons, or newline continuations.
- **Cross-references:** `deploy-docker.sh:155-158`

## LOW: API key hash lookup is not constant-time and not keyed

- **Classification:** Authentication / Defense-in-depth
- **Confidence:** Medium
- **File(s):** `src/lib/api/api-key-auth.ts:54-67`, `src/lib/security/token-hash.ts:10-12`
- **Problem:** API keys are hashed with SHA-256 and the hash is looked up via Drizzle/SQL equality. The comparison is not constant-time and the hashing function is not keyed. A `safeTokenCompare` helper exists (`src/lib/security/timing.ts`) but is not used for the database lookup.
- **Concrete exploit/failure scenario:** An attacker who can measure precise query timing or who obtains a partial DB dump may be able to correlate API key hashes. In practice the key space (43-character `jk_` prefix + 40 hex chars) makes brute-force infeasible, so this is a hygiene issue, but it becomes more serious if the key hash is ever exposed.
- **Suggested fix:** Store an HMAC of the key (e.g., `HMAC-SHA256(key, domain-separated secret)`) and compare candidate rows in memory with `crypto.timingSafeEqual`, or keep the SHA-256 hash but perform the comparison in application code using `safeTokenCompare` after fetching candidate rows by prefix.
- **Cross-references:** `src/lib/security/timing.ts:9-18`

## LOW: Deprecated migrate/import JSON path still accepts password in request body when explicitly enabled

- **Classification:** Authentication / Secrets handling
- **Confidence:** Low
- **File(s):** `src/app/api/v1/admin/migrate/import/route.ts:146-220`
- **Problem:** The legacy JSON body path `{ password, data }` is now gated by `ALLOW_JSON_IMPORT_PASSWORD=1` and emits a security alert when used, but the code path remains functional. It also stores the full pre-restore snapshot path in the audit record details, although it no longer returns the path in the JSON response.
- **Concrete exploit/failure scenario:** If an operator enables the env flag, any reverse proxy, WAF, or debug middleware that logs request bodies will capture the admin password in plaintext. The remaining functional path also represents ongoing maintenance surface.
- **Suggested fix:** Remove the JSON path entirely before the stated Sunset date (2026-11-01), or keep it disabled by default and rotate the gating env var name/secret on each deploy so it cannot be silently re-enabled.
- **Cross-references:** `src/app/api/v1/admin/restore/route.ts:140-162`

---

## Hardened controls verified since Cycle 3 final review

The following findings from the previous Cycle 3 security review have been validated as fixed or substantially mitigated in the current code:

- **Capability-before-quota ordering in `/api/v1/compiler/run`:** `src/app/v1/compiler/run/route.ts` now checks `content.submit_solutions` before `gateSandboxEndpoint`, matching `/api/v1/playground/run`.
- **Recruiting-access rejection before rate limit in `/api/v1/contests/join`:** `src/app/api/v1/contests/join/route.ts` rejects recruiting candidates before consuming the user-keyed rate limit.
- **Rate limit on `GET /api/v1/files`:** `src/app/api/v1/files/route.ts:156-168` now declares `rateLimit: "files:list"` and consumes a user-keyed limit after authorization.
- **Restore response no longer leaks snapshot path:** `src/app/api/v1/admin/restore/route.ts:149-151` uses `snapshotIdFromPath()` and returns only a stable `snapshotId`; the full filesystem path is kept in server-side logs and audit records only.
- **Generated nginx `client_max_body_size`:** `deploy-docker.sh` sets `client_max_body_size 50M;` in the catch-all `location /` blocks, aligning with admin restore/file-upload needs.
- **Docker network segmentation:** `docker-compose.production.yml` defines isolated `frontend`, `backend`, `judge`, and `db` networks.
- **Judge worker non-root user:** `Dockerfile.judge-worker` creates a `judge` user (uid 1000) and runs the worker as that user.
- **Static-site HTTPS/hardening:** `static-site/nginx.conf` redirects HTTP to HTTPS and sets HSTS, CSP, XFO, Referrer-Policy, and `X-Content-Type-Options`.
- **Production fail-closed on missing seccomp profile:** `src/lib/compiler/execute.ts:834-848` rejects local fallback execution in production when the custom seccomp profile is missing.
- **Rust runner command-prefix whitelist:** `judge-worker-rs/src/runner.rs` enforces `ALLOWED_COMMAND_PREFIXES` in `/run`.
- **PostScript `-dSAFER`:** `src/lib/judge/languages.ts` uses `-dSAFER` instead of `-dNODISPLAY`/`-dNOSAFER`.
- **Random dummy password hash:** `src/lib/security/dummy-password-hash.ts` generates a per-process random Argon2id dummy hash.
- **Rate-limiter monotonic clock:** `rate-limiter-rs/src/main.rs` uses `Instant` for all window/block decisions.
- **CSRF origin check with DB `allowedHosts`:** `src/lib/security/csrf.ts` and `src/lib/security/env.ts:243-252` include DB/system `allowedHosts` in the trusted-host set.
- **Millisecond-precision token revocation:** `src/lib/auth/session-security.ts` compares `authenticatedAtSeconds * 1000 <= invalidatedAtMs`.
- **Similarity-check abort-only timeout:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:44-69` uses an `AbortController` with a 30-second timeout, clears it in `finally`, and only returns `timed_out` for actual aborts. The signal is now propagated through `runSimilarityCheck` to the Rust sidecar (`src/lib/assignments/code-similarity.ts:321-422`).
- **X-Forwarded-For chain preservation:** `deploy-docker.sh` generates `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` in every location block; `src/lib/security/ip.ts` validates hop counts and rejects spoofed chains.
- **Uploaded file permissions:** `src/lib/files/storage.ts` writes files with mode `0o600`.
- **Backup ZIP path traversal hardening:** `src/lib/db/export-with-files.ts` rejects `..`, slashes, and backslashes in restored upload names.
- **Rate-limiter fail-closed auth:** `rate-limiter-rs/src/main.rs` refuses to start unless `RATE_LIMITER_AUTH_TOKEN` is set or `RATE_LIMITER_ALLOW_UNAUTHENTICATED=1` is explicitly enabled.
- **Raw SQL backfill gated:** `deploy-docker.sh:1246-1253` now skips the `secret_token` backfill unless `ALLOW_SECRET_TOKEN_BACKFILL=1` is set.

---

## Final sweep

### Risks needing manual validation

- Real-world behavior of `AUTH_TRUST_HOST=true` under spoofed `Host` / `X-Forwarded-Host` requests (confirm nginx strips or overwrites the header).
- End-to-end validation of `JUDGE_ALLOWED_IPS` after the XFF nginx fix, especially for IPv4-mapped IPv6 and CIDR entries.
- Effectiveness and completeness of `docker/seccomp-profile.json` against current language runtimes.
- Correctness and overhead of `JUDGE_OCI_RUNTIME=runsc` if enabled in production.
- Whether `client_max_body_size 50M` is sufficient for the largest restore ZIP and file-upload payloads in staging.
- `npm audit` output (re-run and patch any moderate/high findings).
- Backup file permissions on the production host (`data/backups/` should be `0o700` or tighter).
- Whether `.env.production` / `.env.deploy.*` files are ever committed to git, copied to CI artifacts, or logged.
- Race conditions in submission claim/poll under high concurrency.
- Whether `COMPILER_RUNNER_URL` is always set in production and local fallback is truly unreachable.

### Commonly missed issues checked

- **SQL injection:** Drizzle parameterized queries are used throughout; raw SQL in `src/lib/db/named-params.ts` and the deploy backfill block are the only exceptions. Both are operator-controlled and not user-facing.
- **SSRF:** URLs for sidecars are configuration-driven, not user-controlled; the Rust runner validates Docker image names against an allowlist.
- **Path traversal:** File upload and backup restore paths validate stored names; uploaded files are written to a single directory with `0o600`.
- **Open redirect:** Auth.js callbacks derive from `AUTH_URL` or trusted hosts; no user-controlled redirect parameter was found.
- **Deserialization:** JSON parsing uses Zod or explicit validation; backup ZIP integrity is verified against a manifest.
- **Secrets in logs:** API keys, `workerSecret`, and `JUDGE_AUTH_TOKEN` are hashed before storage; one-time plaintext secrets are returned only at creation/registration.
- **CSRF:** Triple check (`X-Requested-With`, `Sec-Fetch-Site`, `Origin`) remains in place for all mutation endpoints, with API-key auth correctly exempted.
- **Verbose errors:** API errors return structured `error` codes rather than stack traces or internal details.
- **Insecure defaults:** The two remaining insecure defaults (`AUTH_TRUST_HOST=true`, open judge IP allowlist) are documented as HIGH findings above.
- **Audit gaps:** High-stakes actions (restore, import, worker registration, file upload, settings changes) record durable or buffered audit events.

---

*Report written by security-reviewer for the Cycle 4 post-remediation review. HIGH items should be treated as production-hardening blockers; MEDIUM items should be triaged into the next remediation cycle.*

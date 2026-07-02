# Security Review — JudgeKit (Cycle 3 final)

**Date:** 2026-07-03  
**Scope:** Entire `/tmp/judgekit-local` repository — Next.js 16 App Router API, authentication/authorization, input validation and injection vectors, Docker sandbox, Rust judge worker, deployment/nginx hardening, secrets handling, and operational security.  
**Method:** Code inspection, path tracing, and re-validation of findings from the Cycle 2 aggregate and prior Cycle 3 security review.  
**Summary:** No CRITICAL remote-code-execution or authentication-bypass issues were found in the current code. Most of the Cycle 2/Cycle 3 remediation items are now implemented and verified (CSRF origin checks, IP canonicalization, sandbox gating order, Rust command whitelisting, Docker network segmentation, non-root worker, static-site HTTPS/hardening). The dominant residual risks remain insecure-by-default production values (`AUTH_TRUST_HOST`, `JUDGE_ALLOWED_IPS`) and a few defense-in-depth gaps in admin/restore flows and deployment hygiene.  
**Findings count:** 11 (HIGH 2, MEDIUM 5, LOW 4)

---

## File inventory reviewed

| Area | Key files |
|------|-----------|
| Project context | `CLAUDE.md`, `AGENTS.md`, `.context/reviews/_aggregate.md`, `.context/reviews/security-reviewer.md` (prior) |
| API handler / auth wrapper | `src/lib/api/handler.ts`, `src/lib/api/auth.ts`, `src/lib/auth/config.ts`, `src/lib/security/env.ts`, `src/lib/security/csrf.ts` |
| IP / rate limiting | `src/lib/security/ip.ts`, `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`, `rate-limiter-rs/src/main.rs`, `src/lib/judge/ip-allowlist.ts` |
| Sandbox gating | `src/lib/security/sandbox-gate.ts` |
| Compiler / executor | `src/lib/compiler/execute.ts`, `src/app/api/v1/compiler/run/route.ts`, `src/app/api/v1/playground/run/route.ts` |
| Judge worker (Rust) | `judge-worker-rs/src/runner.rs`, `judge-worker-rs/src/docker.rs`, `judge-worker-rs/src/executor.rs`, `judge-worker-rs/src/workspace.rs` |
| Languages | `src/lib/judge/languages.ts` |
| Contests / assignments | `src/app/api/v1/contests/join/route.ts`, `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`, `src/lib/assignments/code-similarity.ts`, `src/lib/assignments/code-similarity-client.ts` |
| Files | `src/app/api/v1/files/route.ts`, `src/app/api/v1/files/[id]/route.ts`, `src/lib/files/storage.ts`, `src/lib/files/validation.ts`, `src/lib/db/export-with-files.ts` |
| Admin / import | `src/app/api/v1/admin/restore/route.ts`, `src/app/api/v1/admin/migrate/import/route.ts` |
| Docker / deployment | `Dockerfile.judge-worker`, `docker-compose.production.yml`, `deploy-docker.sh`, `static-site/nginx.conf`, `next.config.ts` |
| Backup / ops | `scripts/backup-db.sh` |

---

## HIGH: `AUTH_TRUST_HOST` is hardcoded/enforced to `true` in production

- **Classification:** Authentication / Session security  
- **Confidence:** High  
- **File(s):** `src/lib/security/env.ts:260-266`, `src/lib/auth/config.ts:317`, `docker-compose.production.yml:115`, `deploy-docker.sh:750,878,952`  
- **Problem:** `shouldTrustAuthHost()` returns `true` in production whenever `AUTH_TRUST_HOST === "true"`. The deploy script generates `.env.production` with `AUTH_TRUST_HOST=true` and actively enforces the literal value during backfill. With NextAuth's `trustHost` enabled, Auth.js derives canonical URLs from the incoming `Host` / `X-Forwarded-Host` headers. The generated nginx template intentionally does **not** set `X-Forwarded-Host`, but it also does not strip a client-supplied one, and it proxies the client `Host` through to the app.  
- **Concrete exploit/failure scenario:** An attacker making direct requests to the origin with `Host: attacker.com` or `X-Forwarded-Host: attacker.com` can cause Auth.js to generate callback URLs, email links, or session state bound to an attacker-controlled host. If OAuth providers or magic-link flows are enabled later, this becomes an account-takeover vector; today it weakens the host-bound security boundary that CSRF origin checks and email links rely on.  
- **Suggested fix:** Default `AUTH_TRUST_HOST=false` in production when `AUTH_URL` is explicitly set, and rely on `AUTH_URL` plus the DB `allowedHosts` list as the trusted-host set. In nginx, explicitly strip or overwrite `X-Forwarded-Host` before proxying to the app.  
- **Cross-references:** `src/lib/security/csrf.ts:7-30`, `src/lib/security/env.ts:213-241`

## HIGH: Judge API IP allowlist defaults to allow-all

- **Classification:** Authorization / Network access control  
- **Confidence:** High  
- **File(s):** `src/lib/judge/ip-allowlist.ts:17-25,213-241`; `.env.production.example` (no default `JUDGE_ALLOWED_IPS`); `src/app/api/v1/judge/register/route.ts:27-41`  
- **Problem:** When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed()` returns `true` for every IP. The production compose file and generated `.env.production` do not populate an allowlist. The code logs a one-time warning, but the open posture ships by default.  
- **Concrete exploit/failure scenario:** A leaked `JUDGE_AUTH_TOKEN` (via env backup, CI log, container inspect, or unencrypted backup) lets any internet host register fake workers, claim submissions (reading `sourceCode` and hidden `testCases`), and inject arbitrary judge verdicts.  
- **Suggested fix:** Generate `.env.production` with `JUDGE_ALLOWED_IPS` restricted to the worker subnet(s), or set `JUDGE_STRICT_IP_ALLOWLIST=1` and require operators to configure an explicit allowlist before workers can register.  
- **Cross-references:** `src/app/api/v1/judge/claim/route.ts`, `src/app/api/v1/judge/poll/route.ts`

---

## MEDIUM: `GET /api/v1/files` has no rate limit

- **Classification:** Availability / Information disclosure  
- **Confidence:** High  
- **File(s):** `src/app/api/v1/files/route.ts:155-208`  
- **Problem:** The file-list endpoint is wrapped with `createApiHandler` but omits a `rateLimit` key. It performs a `LEFT JOIN` against `users`, a `COUNT(*) OVER()` window function, pagination, and optional `LIKE` search over filenames.  
- **Concrete exploit/failure scenario:** An authenticated attacker can scrape or brute-force paginated file lists without throttling, driving unnecessary database load and potentially enumerating every uploaded file's metadata.  
- **Suggested fix:** Add `rateLimit: "files:list"` (or reuse `files:upload`) to the `GET` handler config.  
- **Cross-references:** `src/lib/security/api-rate-limit.ts`, `src/app/api/v1/files/[id]/route.ts`

## MEDIUM: Admin restore/import responses leak server-side snapshot path

- **Classification:** Information disclosure  
- **Confidence:** High  
- **File(s):** `src/app/api/v1/admin/restore/route.ts:170,196,207,229,239`; `src/app/api/v1/admin/migrate/import/route.ts:115,141`  
- **Problem:** The `preRestoreSnapshotPath` filesystem path is returned verbatim in JSON responses to authenticated admin callers, in both success and several error paths.  
- **Concrete exploit/failure scenario:** A compromised admin account, malicious browser extension, or accidentally shared API response reveals the exact host path layout (e.g., `/home/deployer/data/pre-restore-snapshots/...`), which aids lateral movement and targeted file access.  
- **Suggested fix:** Return only a snapshot ID or timestamp that operators can correlate with server logs; log the full path server-side.  
- **Cross-references:** `src/lib/db/pre-restore-snapshot.ts`

## MEDIUM: Deploy script still contains a raw SQL backfill/drop block

- **Classification:** Operational / Database integrity  
- **Confidence:** High  
- **File(s):** `deploy-docker.sh:1208-1291`  
- **Problem:** The deploy script executes destructive raw SQL (`UPDATE judge_workers SET secret_token_hash = ...`, `ALTER TABLE ... DROP COLUMN secret_token`) directly against the production database via `docker exec` + `psql`. The block is idempotent and guarded by an `information_schema` check, but it is still a manual DDL repair that lives outside the normal migration tool. The documented sunset criterion is 2026-10-26.  
- **Concrete exploit/failure scenario:** A bug in the grep/cut password extraction, a quoting issue in the remote shell command, or a compromised deploy host could corrupt the `judge_workers` table or drop data unexpectedly. Because the block runs before `drizzle-kit push`, a mistake here can lock operators out of workers or destroy the only copy of shared secrets.  
- **Suggested fix:** Finish the migration everywhere, verify `secret_token` is absent in all environments, and remove the block before the 2026-10-26 sunset. Until then, guard execution behind an explicit `ALLOW_SECRET_TOKEN_BACKFILL=1` flag that defaults to off.  
- **Cross-references:** `src/lib/judge/auth.ts`, `drizzle/pg/0020_drop_judge_workers_secret_token.sql`

## MEDIUM: Internal service traffic is unencrypted HTTP

- **Classification:** Infrastructure / Transit encryption  
- **Confidence:** Medium  
- **File(s):** `docker-compose.production.yml:116-118,151`; `judge-worker-rs/src/config.rs`  
- **Problem:** The production compose sets `COMPILER_RUNNER_URL=http://judge-worker:3001`, `JUDGE_BASE_URL=http://app:3000/api/v1`, `CODE_SIMILARITY_URL=http://code-similarity:3002`, and `RATE_LIMITER_URL=http://rate-limiter:3001`. Although network segmentation now isolates these services from the frontend and database networks, traffic on the shared `backend`/`judge` bridges is still plaintext. The Rust worker refuses remote HTTP unless `JUDGE_ALLOW_INSECURE_HTTP=1`, but it treats internal hostnames as local and accepts plain HTTP.  
- **Concrete exploit/failure scenario:** A compromised sidecar or auxiliary container that gains access to the backend/judge network can sniff `JUDGE_AUTH_TOKEN`, per-worker `workerSecret`, `RUNNER_AUTH_TOKEN`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`, hidden test cases, and source code in transit.  
- **Suggested fix:** Terminate TLS at an internal reverse proxy or enable mTLS between app, worker, code-similarity, and rate-limiter; at minimum, split the worker/judge network from the general backend network so only the worker and docker-proxy share the judge bridge.  
- **Cross-references:** `src/lib/compiler/execute.ts:621-637`, `src/lib/assignments/code-similarity-client.ts`

---

## LOW: Unencrypted database backups by default

- **Classification:** Operational / Data confidentiality  
- **Confidence:** Medium  
- **File(s):** `scripts/backup-db.sh:44-49,89-96`  
- **Problem:** The backup script supports age encryption and rclone off-host sync, but both are optional. In the default host-exec or container-exec path, the gzip backup contains a full plaintext dump of the database (including password hashes, API keys, submissions, and hidden test cases).  
- **Concrete exploit/failure scenario:** A backup file left on the host with default permissions is readable by any local user or attacker who gains host access, bypassing application-level access controls and exposing all user data.  
- **Suggested fix:** Require an `AGE_RECIPIENT` by default and exit with a clear error if it is unset, or tighten the backup file permissions to `0o600` and warn operators that the backup is unencrypted.  
- **Cross-references:** `scripts/backup-db.sh:22-50`

## LOW: Deploy script sources per-target env files via shell

- **Classification:** Operational / Supply-chain  
- **Confidence:** Low  
- **File(s):** `deploy-docker.sh:143-172`  
- **Problem:** `deploy-docker.sh` sources `.env.deploy` and `.env.deploy.<target>` files through the shell. These files can contain arbitrary shell commands, not just variable assignments.  
- **Concrete exploit/failure scenario:** If a `.env.deploy.<target>` file is modified by a compromised operator account or an attacker with write access to the deployment host, executing the deploy script runs attacker-controlled commands with the deploy user's privileges.  
- **Suggested fix:** Parse env files with a restricted parser (e.g., `grep '^[A-Z_][A-Z0-9_]*='` or a dedicated env parser) instead of `source`, and reject lines containing command substitution, backticks, or semicolons.  
- **Cross-references:** `deploy-docker.sh` env-loading section

## LOW: API key hash lookup is not constant-time

- **Classification:** Authentication / Defense-in-depth  
- **Confidence:** Low  
- **File(s):** `src/lib/api/api-key-auth.ts:56-67`, `src/lib/security/token-hash.ts:10-12`  
- **Problem:** API keys are hashed with SHA-256 and the hash is looked up via Drizzle/SQL equality. The comparison is not constant-time and the hashing function is not keyed.  
- **Concrete exploit/failure scenario:** An attacker who can measure precise query timing or who obtains a partial DB dump may be able to correlate API key hashes. In practice the key space (43-character `jk_` prefix + 40 hex chars) makes brute-force infeasible, so this is a hygiene issue.  
- **Suggested fix:** Store an HMAC of the key (e.g., `HMAC-SHA256(key, domain-separated secret)`) and compare with a constant-time helper, or keep the SHA-256 hash but compare candidate rows in memory with `crypto.timingSafeEqual`.  
- **Cross-references:** `src/lib/security/timing.ts`

## LOW: Deprecated migrate/import JSON path still accepts password in request body when explicitly enabled

- **Classification:** Authentication / Secrets handling  
- **Confidence:** Low  
- **File(s):** `src/app/api/v1/admin/migrate/import/route.ts:145-153,175-190`  
- **Problem:** The legacy JSON body path `{ password, data }` is now gated by `ALLOW_JSON_IMPORT_PASSWORD=1` and emits a security alert when used, but the code path remains functional. It also returns the snapshot path leak described above.  
- **Concrete exploit/failure scenario:** If an operator enables the env flag, any reverse proxy, WAF, or debug middleware that logs request bodies will capture the admin password in plaintext.  
- **Suggested fix:** Remove the JSON path entirely before the stated Sunset date (2026-11-01), or keep it disabled by default and rotate the gating env var name/secret on each deploy so it cannot be silently re-enabled.  
- **Cross-references:** `src/app/api/v1/admin/restore/route.ts`

---

## Hardened controls verified since prior review

The following findings from the previous Cycle 3 security review have been validated as fixed or substantially mitigated in the current code:

- **Capability-before-quota ordering in `/api/v1/compiler/run`:** `src/app/api/v1/compiler/run/route.ts:74-77` now checks `content.submit_solutions` before `gateSandboxEndpoint`, matching `/api/v1/playground/run`.
- **Recruiting-access rejection before rate limit in `/api/v1/contests/join`:** `src/app/api/v1/contests/join/route.ts:20-27` rejects recruiting candidates before consuming the user-keyed rate limit.
- **Generated nginx `client_max_body_size`:** `deploy-docker.sh` now sets `client_max_body_size 50M;` in the catch-all `location /` blocks, aligning with admin restore/file-upload needs.
- **Docker network segmentation:** `docker-compose.production.yml:62-223` now defines isolated `frontend`, `backend`, `judge`, and `db` networks.
- **Judge worker non-root user:** `Dockerfile.judge-worker:33-49` creates a `judge` user (uid 1000) and runs the worker as that user.
- **Static-site HTTPS/hardening:** `static-site/nginx.conf:1-47` redirects HTTP to HTTPS and sets HSTS, CSP, XFO, Referrer-Policy, and `X-Content-Type-Options`.
- **Production fail-closed on missing seccomp profile:** `src/lib/compiler/execute.ts:790-804` rejects local fallback execution in production when the custom seccomp profile is missing.
- **Rust runner command-prefix whitelist:** `judge-worker-rs/src/runner.rs:187-269,783-803` enforces `ALLOWED_COMMAND_PREFIXES` in `/run`.
- **PostScript `-dSAFER`:** `src/lib/judge/languages.ts:856` now uses `-dSAFER` instead of `-dNODISPLAY`/`-dNOSAFER`.
- **Random dummy password hash:** `src/lib/security/dummy-password-hash.ts:22-30` generates a per-process random Argon2id dummy hash.
- **Rate-limiter monotonic clock:** `rate-limiter-rs/src/main.rs:38-48,211-275` uses `Instant` for all window/block decisions and `SystemTime` only for external timestamp conversion.
- **CSRF origin check with DB `allowedHosts`:** `src/lib/security/csrf.ts:7-30` and `src/lib/security/env.ts:213-241` now include DB/system `allowedHosts` in the trusted-host set.
- **Millisecond-precision token revocation:** `src/lib/auth/session-security.ts:36-41` compares `authenticatedAtSeconds * 1000 <= invalidatedAtMs`.
- **Similarity-check abort-only timeout:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:44-69` uses an `AbortController` with a 30-second timeout, clears it in `finally`, and only returns `timed_out` for actual aborts.
- **X-Forwarded-For chain preservation:** `deploy-docker.sh` generates `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` in every location block; `src/lib/security/ip.ts:142-205` validates hop counts and rejects spoofed chains.
- **Uploaded file permissions:** `src/lib/files/storage.ts:29` writes files with mode `0o600`.
- **Backup ZIP path traversal hardening:** `src/lib/db/export-with-files.ts:104-118,320-324` rejects `..`, slashes, and backslashes in restored upload names.
- **Rate-limiter fail-closed auth:** `rate-limiter-rs/src/main.rs:441-471` refuses to start unless `RATE_LIMITER_AUTH_TOKEN` is set or `RATE_LIMITER_ALLOW_UNAUTHENTICATED=1` is explicitly enabled.

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

### Commonly missed issues checked

- **SQL injection:** Drizzle parameterized queries are used throughout; raw SQL in `src/lib/db/named-params.ts` and the deploy backfill block are the only exceptions.
- **SSRF:** URLs for sidecars are configuration-driven, not user-controlled; the Rust runner validates Docker image names against an allowlist.
- **Path traversal:** File upload and backup restore paths validate stored names; uploaded files are written to a single directory with `0o600`.
- **Open redirect:** Auth.js callbacks derive from `AUTH_URL` or trusted hosts; no user-controlled redirect parameter was found.
- **Deserialization:** JSON parsing uses Zod or explicit validation; backup ZIP integrity is verified against a manifest.
- **Secrets in logs:** API keys, `workerSecret`, and `JUDGE_AUTH_TOKEN` are hashed before storage; one-time plaintext secrets are returned only at creation/registration.
- **CSRF:** Triple check (`X-Requested-With`, `Sec-Fetch-Site`, `Origin`) remains in place for all mutation endpoints, with API-key auth correctly exempted.

---

*Report written by security-reviewer for the Cycle 3 final review. HIGH items should be treated as production-hardening blockers; MEDIUM items should be triaged into the next remediation cycle.*

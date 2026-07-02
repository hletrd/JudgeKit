# Security Review — JudgeKit (Cycle 3 continued)

**Date:** 2026-07-02  
**Scope:** Entire `/tmp/judgekit-local` repository — Next.js 16 App Router API, authentication/authorization, input validation and injection vectors, Docker sandbox, Rust judge worker, deployment/nginx hardening, secrets handling, and operational security.  
**Method:** Code inspection, path tracing, and verification of fixes applied since the previous cycle-3 review.  
**Summary:** No CRITICAL remote-code-execution or authentication-bypass issues were found in the current code. SQL parameterization, password hashing (Argon2id), CSRF checks, JWT revocation, API-key encryption, and sandbox isolation remain sound. The dominant residual risks are insecure-by-default production values (`AUTH_TRUST_HOST`, `JUDGE_ALLOWED_IPS`), ordering bugs that consume rate-limit or sandbox quota before authorization checks, and several defense-in-depth gaps in deployment/nginx configuration.  
**Findings count:** 17 (HIGH 2, MEDIUM 9, LOW 6)

---

## File inventory reviewed

| Area | Key files |
|------|-----------|
| Project context | `CLAUDE.md`, `AGENTS.md`, `.context/reviews/_aggregate.md` |
| API handler / auth wrapper | `src/lib/api/handler.ts`, `src/lib/api/auth.ts`, `src/lib/auth/config.ts`, `src/lib/security/env.ts`, `src/lib/security/csrf.ts` |
| IP / rate limiting | `src/lib/security/ip.ts`, `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`, `src/lib/judge/ip-allowlist.ts` |
| Sandbox gating | `src/lib/security/sandbox-gate.ts` |
| Compiler / executor | `src/lib/compiler/execute.ts`, `src/app/api/v1/compiler/run/route.ts`, `src/app/api/v1/playground/run/route.ts` |
| Judge worker (Rust) | `judge-worker-rs/src/runner.rs`, `judge-worker-rs/src/docker.rs`, `judge-worker-rs/src/executor.rs` |
| Languages | `src/lib/judge/languages.ts` |
| Contests / assignments | `src/app/api/v1/contests/join/route.ts`, `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`, `src/lib/assignments/code-similarity.ts` |
| Files | `src/app/api/v1/files/route.ts`, `src/app/api/v1/files/[id]/route.ts`, `src/lib/files/storage.ts`, `src/lib/files/validation.ts` |
| Admin / import | `src/app/api/v1/admin/restore/route.ts`, `src/app/api/v1/admin/migrate/import/route.ts` |
| Docker / deployment | `Dockerfile.judge-worker`, `docker-compose.production.yml`, `deploy-docker.sh`, `static-site/nginx.conf`, `next.config.ts` |
| Backup / ops | `scripts/backup-db.sh` |

---

## HIGH: `AUTH_TRUST_HOST` defaults to `true` in production

- **Classification:** Authentication / Session security  
- **Confidence:** High  
- **File(s):** `deploy-docker.sh:700, 828, 894`, `docker-compose.production.yml:106`, `src/lib/security/env.ts:260-266`, `src/lib/auth/config.ts:321`  
- **Problem:** `deploy-docker.sh` generates `.env.production` with `AUTH_TRUST_HOST=true` and enforces the literal value during backfill; `docker-compose.production.yml` defaults the same. `shouldTrustAuthHost()` returns `true` whenever the env var is set to `"true"`. With NextAuth’s `trustHost` enabled, Auth.js derives canonical URLs from the incoming `Host` / `X-Forwarded-Host` headers. The generated nginx template overwrites `Host` but does **not** strip a client-supplied `X-Forwarded-Host`.  
- **Concrete exploit/failure scenario:** An attacker making direct requests to the origin with `Host: attacker.com` or `X-Forwarded-Host: attacker.com` can cause Auth.js to generate callback URLs, email links, or session state bound to an attacker-controlled host. If OAuth providers or magic-link flows are enabled later, this becomes an account-takeover vector; today it weakens CSRF origin checks that rely on `AUTH_URL`.  
- **Suggested fix:** Default `AUTH_TRUST_HOST=false` in production when `AUTH_URL` is explicitly set; use `AUTH_URL` and DB `allowedHosts` as the trusted-host set. In nginx, explicitly overwrite or remove `X-Forwarded-Host` before proxying to the app.  
- **Cross-references:** `src/lib/security/csrf.ts`, `src/lib/security/env.ts:213-241`, `deploy-docker.sh` nginx template

## HIGH: Judge API IP allowlist defaults to allow-all

- **Classification:** Authorization / Network access control  
- **Confidence:** High  
- **File(s):** `src/lib/judge/ip-allowlist.ts:17-25, 178-210`; generated `.env.production` in `deploy-docker.sh:658-682`  
- **Problem:** When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed()` returns `true` for every IP. The production compose file does not set either variable, and the generated `.env.production` does not populate an allowlist. The code logs a one-time warning, but the open posture ships by default.  
- **Concrete exploit/failure scenario:** A leaked `JUDGE_AUTH_TOKEN` (via env backup, CI log, container inspect, or unencrypted backup) lets any internet host register fake workers, claim submissions (reading `sourceCode` and hidden `testCases`), and inject arbitrary judge verdicts.  
- **Suggested fix:** Generate `.env.production` with `JUDGE_ALLOWED_IPS` restricted to the worker subnet(s), or set `JUDGE_STRICT_IP_ALLOWLIST=1` and require operators to configure an explicit allowlist before workers can register.  
- **Cross-references:** `.env.example:176-182`, `src/app/api/v1/judge/register/route.ts`, `src/app/api/v1/judge/claim/route.ts`

---

## MEDIUM: `/api/v1/compiler/run` consumes sandbox quota before capability check

- **Classification:** Authorization / Resource exhaustion  
- **Confidence:** High  
- **File(s):** `src/app/api/v1/compiler/run/route.ts:77-88`  
- **Problem:** The route calls `gateSandboxEndpoint` (email verification + daily quota) before checking whether the caller has the `content.submit_solutions` capability. By contrast, `/api/v1/playground/run` checks the capability in the `auth` config first.  
- **Concrete exploit/failure scenario:** An authenticated user whose role lacks `content.submit_solutions` (e.g., a recruiting candidate or suspended account) can still consume their 500-run daily compiler quota. Once the quota is exhausted, the same user cannot use legitimate compiler endpoints even after the capability is granted until the rolling 24-hour window resets.  
- **Suggested fix:** Move the capability check before `gateSandboxEndpoint`, or add the capability requirement to the route’s `auth` config so the wrapper rejects unauthorized callers before any quota or sandbox bookkeeping.  
- **Cross-references:** `src/app/api/v1/playground/run/route.ts`, `src/lib/security/sandbox-gate.ts:38-108`

## MEDIUM: `/api/v1/contests/join` applies rate limit before recruiting-access rejection

- **Classification:** Availability / Rate-limit bypass-by-exhaustion  
- **Confidence:** Medium  
- **File(s):** `src/app/api/v1/contests/join/route.ts:15-29`  
- **Problem:** The route declares `rateLimit: "contest:join"` at the handler-config level. `createApiHandler` consumes this limit before the handler body rejects recruiting candidates with `forbidden`.  
- **Concrete exploit/failure scenario:** A recruiting candidate who is never allowed to join contests can still consume the per-endpoint rate-limit budget. Because the key is global to the endpoint, a coordinated set of candidate accounts can exhaust the limit and deny legitimate users the ability to redeem access codes.  
- **Suggested fix:** Move the `recruitingAccess` check before the rate-limit consumption, or split the rate-limit key so that recruiting candidates are bucketed separately from normal users.  
- **Cross-references:** `src/lib/api/handler.ts:117-119`, `src/lib/recruiting/access.ts`

## MEDIUM: `GET /api/v1/files` has no rate limit

- **Classification:** Availability / Information disclosure  
- **Confidence:** High  
- **File(s):** `src/app/api/v1/files/route.ts:155-208`  
- **Problem:** The file-list endpoint is wrapped with `createApiHandler` but omits a `rateLimit` key. It performs a `LEFT JOIN` against `users`, a `COUNT(*) OVER()` window function, pagination, and optional `LIKE` search over filenames.  
- **Concrete exploit/failure scenario:** An authenticated attacker can scrape or brute-force paginated file lists without throttling, driving unnecessary database load and potentially enumerating every uploaded file’s metadata.  
- **Suggested fix:** Add `rateLimit: "files:list"` (or reuse `files:upload`) to the `GET` handler config.  
- **Cross-references:** `src/lib/security/api-rate-limit.ts`, `src/app/api/v1/files/[id]/route.ts`

## MEDIUM: Generated nginx drops global `client_max_body_size` for non-judge routes

- **Classification:** Infrastructure / Availability  
- **Confidence:** High  
- **File(s):** `deploy-docker.sh` nginx template (catch-all `location /`)  
- **Problem:** The hardened nginx config sets `client_max_body_size` only on `/api/auth/` (1m) and `/api/v1/judge/poll` (50M). The catch-all `location /` has no explicit limit, so it falls back to the nginx default of 1 MiB.  
- **Concrete exploit/failure scenario:** Admin restore/import accepts backup ZIPs and JSON exports that can be tens of megabytes (`src/app/api/v1/admin/restore/route.ts:69`, `src/app/api/v1/admin/migrate/import/route.ts:76`). File uploads through the generic API are also likely to exceed 1 MiB. nginx will reject them with `413 Payload Too Large` before the application sees them, forcing operators to bypass the restore workflow.  
- **Suggested fix:** Add `client_max_body_size 50M;` to the `location /` block (or scope it to `/api/v1/admin/*` and `/api/v1/files/*`) and keep it aligned with `MAX_IMPORT_BYTES`.  
- **Cross-references:** `src/lib/db/import-transfer.ts`, `src/app/api/v1/files/[id]/route.ts`

## MEDIUM: Admin restore/import responses leak server-side snapshot path

- **Classification:** Information disclosure  
- **Confidence:** High  
- **File(s):** `src/app/api/v1/admin/restore/route.ts:170, 196, 207, 229, 239`; `src/app/api/v1/admin/migrate/import/route.ts:115-142`  
- **Problem:** The `preRestoreSnapshotPath` filesystem path is returned verbatim in JSON responses to authenticated admin callers.  
- **Concrete exploit/failure scenario:** A compromised admin account, malicious browser extension, or accidentally shared API response reveals the exact host path layout (e.g., `/home/deployer/data/pre-restore-snapshots/...`), which aids lateral movement and targeted file access.  
- **Suggested fix:** Return only a snapshot ID or timestamp that operators can correlate with server logs; log the full path server-side.  
- **Cross-references:** `src/lib/db/pre-restore-snapshot.ts`

## MEDIUM: Deprecated migrate/import JSON path still accepts password in request body

- **Classification:** Authentication / Secrets handling  
- **Confidence:** High  
- **File(s):** `src/app/api/v1/admin/migrate/import/route.ts:145-185`  
- **Problem:** The endpoint still supports a JSON body of `{ password, data }` and validates the admin password from the request body. It logs a deprecation warning and adds `Deprecation`/`Sunset` headers, but the path remains functional until November 2026.  
- **Concrete exploit/failure scenario:** Any reverse proxy, WAF, or debug middleware that logs request bodies will capture the admin password in plaintext. This is exactly the scenario the multipart path was introduced to avoid.  
- **Suggested fix:** Remove the JSON path, or gate it behind an env flag that defaults to off before the stated sunset. Emit a rate-limited `SECURITY_ALERT` log if the legacy path is used.  
- **Cross-references:** `src/app/api/v1/admin/restore/route.ts` (multipart-only)

## MEDIUM: Docker Compose lacks internal network segmentation

- **Classification:** Infrastructure / Container isolation  
- **Confidence:** High  
- **File(s):** `docker-compose.production.yml` (no `networks:` block, services defined at lines 13-180)  
- **Problem:** All services (`db`, `app`, `judge-worker`, `docker-proxy`, `code-similarity`, `rate-limiter`) share the default bridge network.  
- **Concrete exploit/failure scenario:** A compromised sidecar or auxiliary container can reach `db:5432`, `app:3000`, and `judge-worker:3001`, enabling lateral movement and expanding the blast radius of a single container breach.  
- **Suggested fix:** Define isolated networks (`frontend`, `backend`, `judge`, `db`) and attach each service only to the networks it needs.  
- **Cross-references:** `docker-compose.production.yml` services block

## MEDIUM: Judge worker container runs as root

- **Classification:** Infrastructure / Container hardening  
- **Confidence:** High  
- **File(s):** `Dockerfile.judge-worker` (lines 27-42, no `USER` directive)  
- **Problem:** The final `runner` stage does not drop to a non-root user. It runs the worker process as root inside the container.  
- **Concrete exploit/failure scenario:** A sandbox escape, supply-chain compromise, or bug in the worker gives root privileges inside the container, making host compromise via the Docker socket proxy or workspace mounts easier.  
- **Suggested fix:** Add a non-root user/group in the final stage, `chown` the binary and `/judge-workspaces`, and end with `USER <uid>:<gid>`. Ensure the user can still reach `docker-proxy:2375` and write to `/judge-workspaces`.  
- **Cross-references:** `Dockerfile` (app uses `USER nextjs`), `docker-compose.production.yml` judge-worker service

---

## LOW: Static-site nginx still lacks HSTS and CSP

- **Classification:** Infrastructure / Security headers  
- **Confidence:** Medium  
- **File(s):** `static-site/nginx.conf:1-23`  
- **Problem:** The static site now sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `server_tokens off`, but it still does not set `Strict-Transport-Security` or a `Content-Security-Policy`. It also serves only HTTP with no redirect to HTTPS.  
- **Concrete exploit/failure scenario:** If this config is used in production, users connect over plaintext and miss HSTS/CSP protections, exposing cookies and enabling MIME-sniffing/clickjacking on user-contributed or polyglot static assets.  
- **Suggested fix:** Serve static assets behind the same TLS-terminated reverse proxy as the app, or add a TLS server block, redirect HTTP to HTTPS, set HSTS, and add a CSP.  
- **Cross-references:** `next.config.ts:141-183`, `deploy-docker.sh` nginx template

## LOW: Internal worker-to-app traffic is unencrypted HTTP

- **Classification:** Infrastructure / Transit encryption  
- **Confidence:** Medium  
- **File(s):** `docker-compose.production.yml:107, 138`; `judge-worker-rs/src/config.rs:validate_secure_judge_urls`  
- **Problem:** The production compose sets `JUDGE_BASE_URL=http://app:3000/api/v1` and `COMPILER_RUNNER_URL=http://judge-worker:3001`. Although the Rust worker refuses remote HTTP unless `JUDGE_ALLOW_INSECURE_HTTP=1`, it treats internal hostnames as local and accepts plain HTTP. Bearer tokens, worker secrets, and hidden test cases therefore traverse the internal bridge unencrypted.  
- **Concrete exploit/failure scenario:** A compromised sidecar container on the default bridge can sniff worker registration, claim responses containing hidden test cases, or capture `RUNNER_AUTH_TOKEN`/`JUDGE_AUTH_TOKEN` from inter-service HTTP traffic.  
- **Suggested fix:** Terminate TLS at an internal reverse proxy or enable mTLS between app and worker; at minimum, place app and worker on an isolated backend network with no access for auxiliary services.  
- **Cross-references:** `docker-compose.production.yml`, `judge-worker-rs/src/api.rs`, `src/app/api/v1/judge/claim/route.ts`

## LOW: Local compiler fallback runs with default seccomp if custom profile is missing

- **Classification:** Sandboxing / Defense-in-depth  
- **Confidence:** Medium  
- **File(s):** `src/lib/compiler/execute.ts:379-388`  
- **Problem:** When `SECCOMP_PROFILE_PATH` is missing, the local Docker fallback logs a one-time warning and proceeds with Docker’s default seccomp policy instead of the project-specific restricted profile.  
- **Concrete exploit/failure scenario:** A mis-packaged deployment (missing `docker/seccomp-profile.json` from the image or a wrong `JUDGE_SECCOMP_PROFILE` override) silently weakens the sandbox for local fallback compilations, potentially exposing syscalls that the custom profile intentionally blocks.  
- **Suggested fix:** Fail closed when the configured custom seccomp profile is missing, or require an explicit opt-out environment variable before falling back to the default policy.  
- **Cross-references:** `docker/seccomp-profile.json`, `judge-worker-rs/src/docker.rs:330-397`

## LOW: Rust runner shell validation lacks the TS allowed-prefix guard

- **Classification:** Sandboxing / Command validation  
- **Confidence:** Medium  
- **File(s):** `judge-worker-rs/src/runner.rs:124-176` and `690-710`; compare `src/lib/compiler/execute.ts:189-251`  
- **Problem:** The TypeScript executor now runs `validateShellCommandStrict` (denylist + known-compiler-prefix check) before calling the Rust runner. The Rust `/run` endpoint validates only shell metacharacters and does not require the first token of each command segment to match a known compiler/tool prefix.  
- **Concrete exploit/failure scenario:** If an attacker obtains the `RUNNER_AUTH_TOKEN`, they can send arbitrary allowed-shell commands (e.g., `bash -c '...'`) directly to the worker, making sandbox probing and side-channel exfiltration easier. The prefix guard is a worthwhile defense-in-depth layer on the Rust side as well.  
- **Suggested fix:** Port `ALLOWED_COMMAND_PREFIXES`/`isValidCommandPrefix` from `execute.ts` to Rust and apply it in `run_handler` before `execute_run`.  
- **Cross-references:** `src/lib/compiler/execute.ts:189-251`, `judge-worker-rs/src/docker.rs:330-397`

## LOW: PostScript runner disables SAFER mode

- **Classification:** Sandboxing / Language runtime hardening  
- **Confidence:** Medium  
- **File(s):** `src/lib/judge/languages.ts:854`  
- **Problem:** The PostScript run command passes `-dNOSAFER`, which disables Ghostscript’s file-access sandbox.  
- **Concrete exploit/failure scenario:** Although the container is still constrained by `--read-only`, `--cap-drop=ALL`, and `--network=none`, a PostScript submission can read or write any file reachable in the writable tmpfs or mounted workspace, increasing the impact of a container breakout or information leak.  
- **Suggested fix:** Use `-dSAFER` for normal submissions and only allow `NOSAFER` for specific problems that require file I/O, gated by a problem-level flag.  
- **Cross-references:** `src/lib/judge/languages.ts`, `judge-worker-rs/src/docker.rs`

## LOW: Unencrypted database backups when age/rclone are not configured

- **Classification:** Operational / Data confidentiality  
- **Confidence:** Medium  
- **File(s):** `scripts/backup-db.sh:41-119`  
- **Problem:** The backup script supports age encryption and rclone off-host sync, but both are optional. In the default host-exec or container-exec path, the gzip backup contains a full plaintext dump of the database (including password hashes, API keys, submissions, and hidden test cases).  
- **Concrete exploit/failure scenario:** A backup file left on the host with default permissions is readable by any local user or attacker who gains host access, bypassing application-level access controls and exposing all user data.  
- **Suggested fix:** Require an `AGE_RECIPIENT` by default and exit with a clear error if it is unset, or tighten the backup file permissions to `0o600` and warn operators that the backup is unencrypted.  
- **Cross-references:** `scripts/backup-db.sh:90-103`

## LOW: Dummy password hash uses a static, identifiable salt

- **Classification:** Authentication / Hygiene  
- **Confidence:** Low  
- **File(s):** `src/lib/auth/config.ts:51-52`  
- **Problem:** The `DUMMY_PASSWORD_HASH` constant embeds the salt `Y2xhdWRlZHVtbXloYXNo`, which base64-decodes to `claudedummyhash`.  
- **Concrete exploit/failure scenario:** The sentinel hash is immediately recognizable in a source leak or DB dump. It is used only for timing-safe comparison, so this is a hygiene issue rather than an exploitable weakness.  
- **Suggested fix:** Replace the constant with a random Argon2id hash generated offline and documented as a deployment artifact, or generate a per-process dummy hash at startup.  
- **Cross-references:** `src/lib/security/password-hash.ts`

## LOW: Deploy script sources per-target env files without validation

- **Classification:** Operational / Supply-chain  
- **Confidence:** Low  
- **File(s):** `deploy-docker.sh:134-166`  
- **Problem:** `deploy-docker.sh` sources `.env.deploy.*` files through the shell. These files can contain arbitrary shell commands, not just variable assignments.  
- **Concrete exploit/failure scenario:** If a `.env.deploy.<target>` file is modified by a compromised operator account or an attacker with write access to the deployment host, executing the deploy script runs attacker-controlled commands with the deploy user’s privileges.  
- **Suggested fix:** Parse env files with a restricted parser (e.g., `grep '^[A-Z_][A-Z0-9_]*='` or a dedicated env parser) instead of `source`, and reject lines containing command substitution, backticks, or semicolons.  
- **Cross-references:** `deploy-docker.sh` env-loading section

---

## Final sweep

### Cleared or already-mitigated controls

- **X-Forwarded-For chain preservation:** `deploy-docker.sh` now generates `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` in every location block (`deploy-docker.sh:1520, 1535, 1547, 1559, 1590, 1605, 1617, 1629`). With `TRUSTED_PROXY_HOPS` set correctly, `extractClientIp` can now derive a stable client IP.
- **Leading-zero IPv4 rejection:** `src/lib/security/ip.ts:21-25` rejects octets with leading zeros.
- **Uploaded file permissions:** `src/lib/files/storage.ts:29` writes files with mode `0o600`.
- **Similarity-check timeout handling:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:48-65` now uses an `AbortController` with a 30-second timeout and clears it in `finally`, returning a `timed_out` payload instead of leaking timers or throwing.
- **CSRF protection remains sound:** triple check of `X-Requested-With`, `Sec-Fetch-Site`, and `Origin` in `src/lib/security/csrf.ts`.
- **SQL injection risk remains low:** Drizzle `sql` tagged templates are used safely, and raw SQL via `rawQueryOne`/`rawQueryAll` uses named/positional parameter binding (`src/lib/db/named-params.ts`).
- **Password storage uses Argon2id** with transparent rehashing (`src/lib/security/password-hash.ts`).
- **Session revocation via `tokenInvalidatedAt`** is enforced in the JWT refresh path (`src/lib/auth/config.ts`).
- **API keys are hashed (SHA-256)** and the one-time reveal is encrypted with AES-256-GCM (`src/lib/api/api-key-auth.ts`).
- **Docker sandbox uses `--network=none`, `--cap-drop=ALL`, `--read-only`, tmpfs, PID/CPU limits, non-root `65534:65534`, and a custom seccomp profile** (`judge-worker-rs/src/docker.rs`).
- **Docker socket proxy is restricted** to container/image list/start/stop/delete; image builds are disabled (`docker-compose.production.yml:64-86`).
- **Image validation restricts containers** to the `judge-*` namespace and optionally trusted registry prefixes (`src/lib/judge/docker-image-validation.ts`, `judge-worker-rs/src/validation.rs`).

### Risks needing manual validation

- Effectiveness and completeness of `docker/seccomp-profile.json` against current language runtimes.
- Correctness and overhead of `JUDGE_OCI_RUNTIME=runsc` if enabled in production.
- Real-world behavior of `AUTH_TRUST_HOST=true` under spoofed `Host`/`X-Forwarded-Host` requests.
- End-to-end validation of `JUDGE_ALLOWED_IPS` after the XFF nginx fix.
- Whether `client_max_body_size` changes have already broken admin restore/file-upload flows in staging.
- `npm audit` output (re-run and patch any moderate/high findings).
- Race conditions in submission claim/poll under high concurrency.
- Whether the `.env.production` file (now `chmod 0600`) is ever committed or copied to logs/CI artifacts.

---

*Report written by security-reviewer agent for cycle-3 continuation. Findings should be triaged into the next remediation plan, with HIGH items treated as blockers for production hardening.*

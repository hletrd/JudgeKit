# Security Review — JudgeKit (Cycle 3)

**Date:** 2026-07-01  
**Scope:** Entire repository — authentication/authorization, API routes, input validation, sandbox/judge pipeline, Docker/nginx/deployment hardening, secrets handling, operational security  
**Summary:** No CRITICAL findings. Auth, CSRF, SQL parameterization, secret encryption, and sandbox isolation are substantially sound. The highest risks are deployment defaults and reverse-proxy header handling that can degrade security or availability in production. All issues are configuration or defense-in-depth gaps rather than direct remote-code-execution vulnerabilities.

**Findings count:** 17 (HIGH 3, MEDIUM 8, LOW 6)

---

## HIGH: Generated nginx overwrites `X-Forwarded-For` with the proxy IP
- **Classification:** Infrastructure / Reverse-proxy hardening
- **Confidence:** High
- **File(s):** `deploy-docker.sh` (lines 1483, 1498, 1510, 1522, 1553, 1568, 1580, 1592)
- **Problem:** Every generated `location` block sets `proxy_set_header X-Forwarded-For $remote_addr;`, which replaces any existing forwarded-for chain with a single entry — the immediate upstream proxy. The application defaults to `TRUSTED_PROXY_HOPS=1` (`.env.example:175`) and `extractClientIp` requires at least `trustedHops + 1` entries before it trusts an XFF-derived IP (`src/lib/security/ip.ts:99`). With only one entry, the function returns `null` in production.
- **Concrete exploit/failure scenario:**
  - Rate limiting collapses to a single global bucket (`api:<endpoint>:unknown`) because `getRateLimitKey` falls back to `"unknown"` (`src/lib/security/rate-limit.ts:45-47`). A single attacker can exhaust per-endpoint limits and deny service to all users behind the same proxy.
  - If an operator sets `JUDGE_ALLOWED_IPS`, `isJudgeIpAllowed` receives a `null` client IP and denies every legitimate worker (`src/lib/judge/ip-allowlist.ts:204-207`).
- **Suggested fix:** Change the generated directive to `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` and ensure `TRUSTED_PROXY_HOPS` matches the actual number of trusted proxies. Alternatively, use nginx `set_real_ip_from` + `real_ip_recursive on` and rely on `X-Real-IP` with `TRUSTED_PROXY_HOPS=0`.
- **Cross-references:** `src/lib/security/ip.ts:68-131`, `src/lib/security/rate-limit.ts:45-47`, `src/lib/judge/ip-allowlist.ts:182-210`, `.env.example:175`

## HIGH: `AUTH_TRUST_HOST` defaults to true in production
- **Classification:** Authentication / Session security
- **Confidence:** High
- **File(s):** `deploy-docker.sh:662`, `docker-compose.production.yml:106`, `src/lib/security/env.ts:260-266`, `src/lib/auth/config.ts:321`
- **Problem:** `deploy-docker.sh` writes `AUTH_TRUST_HOST=true` into freshly generated `.env.production`, and `docker-compose.production.yml` defaults the same. `shouldTrustAuthHost()` returns `true` in production whenever the env var is not explicitly set to `"false"`. With NextAuth’s `trustHost` enabled, Auth.js derives canonical URLs from the `Host` / `X-Forwarded-Host` request headers. The generated nginx config sets `Host $host` but does **not** strip a client-supplied `X-Forwarded-Host` header.
- **Concrete exploit/failure scenario:** An attacker making direct HTTPS requests to the server with `Host: attacker.com` or `X-Forwarded-Host: attacker.com` can cause Auth.js to generate session state, callback URLs, or email links bound to an attacker-controlled domain. This becomes critical if OAuth providers or magic-link flows are enabled later, and it weakens CSRF origin checks that rely on `AUTH_URL`.
- **Suggested fix:** Default `AUTH_TRUST_HOST=false` in production when `AUTH_URL` is set; have nginx explicitly overwrite or remove `X-Forwarded-Host` before proxying; rely on `AUTH_URL` and DB `allowedHosts` as the trusted-host set.
- **Cross-references:** `src/lib/security/csrf.ts:7-17`, `src/lib/security/env.ts:213-241`, `deploy-docker.sh` nginx template lines 1446-1598

## HIGH: Judge API IP allowlist defaults to allow-all
- **Classification:** Authorization / Network access control
- **Confidence:** High
- **File(s):** `src/lib/judge/ip-allowlist.ts:17-25`, `src/lib/judge/ip-allowlist.ts:182-202`; generated `.env.production` in `deploy-docker.sh:658-682`
- **Problem:** When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed()` returns `true` for every IP. The production compose file does not set either variable. The code logs a one-time warning, but the open posture ships by default.
- **Concrete exploit/failure scenario:** A leaked `JUDGE_AUTH_TOKEN` — via env backup, CI log, or container inspect — lets any internet host register fake workers, claim submissions (reading `sourceCode` and hidden `testCases`), and inject arbitrary judge verdicts.
- **Suggested fix:** Generate `.env.production` with `JUDGE_ALLOWED_IPS` restricted to the worker subnet(s), or set `JUDGE_STRICT_IP_ALLOWLIST=1` and require operators to configure an explicit allowlist before workers can register.
- **Cross-references:** `.env.example:176-182`, `src/app/api/v1/judge/register/route.ts`, `src/app/api/v1/judge/claim/route.ts`

---

## MEDIUM: Generated nginx drops global `client_max_body_size` for non-judge routes
- **Classification:** Infrastructure / Availability
- **Confidence:** High
- **File(s):** `deploy-docker.sh` nginx template (lines 1476-1597)
- **Problem:** The hardened nginx config sets `client_max_body_size` only on `/api/auth/` (1m) and `/api/v1/judge/poll` (50M). The catch-all `location /` has no explicit limit, so it falls back to the nginx default of 1 MiB.
- **Concrete exploit/failure scenario:** Admin restore/import accepts backup ZIPs and JSON exports that can be tens of megabytes (`src/app/api/v1/admin/restore/route.ts:69`, `src/app/api/v1/admin/migrate/import/route.ts:76`). File uploads through the generic API are also likely to exceed 1 MiB. nginx will reject them with `413 Payload Too Large` before the application sees them, forcing operators to bypass the restore workflow.
- **Suggested fix:** Add `client_max_body_size 50M;` to the `location /` block (or scoped to `/api/v1/admin/*` and `/api/v1/files/*`) and keep it aligned with `MAX_IMPORT_BYTES`.
- **Cross-references:** `src/lib/db/import-transfer.ts`, `src/app/api/v1/files/[id]/route.ts`

## MEDIUM: Admin restore/import responses leak server-side snapshot path
- **Classification:** Information disclosure
- **Confidence:** High
- **File(s):** `src/app/api/v1/admin/restore/route.ts:149-171`; `src/app/api/v1/admin/migrate/import/route.ts:115-142`
- **Problem:** The `preRestoreSnapshotPath` filesystem path is returned verbatim in JSON responses to authenticated admin callers.
- **Concrete exploit/failure scenario:** A compromised admin account, malicious browser extension, or accidentally shared API response reveals the exact host path layout (e.g., `/home/deployer/data/pre-restore-snapshots/...`), which aids lateral movement and targeted file access.
- **Suggested fix:** Return only a snapshot ID or timestamp that operators can correlate with server logs; log the full path server-side.
- **Cross-references:** `src/lib/db/pre-restore-snapshot.ts`

## MEDIUM: Deprecated migrate/import JSON path still accepts password in request body
- **Classification:** Authentication / Secrets handling
- **Confidence:** High
- **File(s):** `src/app/api/v1/admin/migrate/import/route.ts:145-252`
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

## MEDIUM: Static-site and generated app nginx missing HSTS/CSP/security headers
- **Classification:** Infrastructure / Security headers
- **Confidence:** Medium
- **File(s):** `static-site/nginx.conf:1-23`; generated app nginx in `deploy-docker.sh` (lines 1446-1598); `src/lib/api/handler.ts:199-207`
- **Problem:** Neither the static site nor the generated app-server nginx config sets `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Referrer-Policy`, or `Strict-Transport-Security`. The app-level handler only adds `Cache-Control` and `X-Content-Type-Options`.
- **Concrete exploit/failure scenario:** Clickjacking, MIME-sniffing attacks, referrer leakage, and downgrade attacks become possible, especially if the static site ever serves user-contributed HTML or if an attacker can upload polyglot files.
- **Suggested fix:** Add `add_header` directives in both nginx configs. For example:
  ```nginx
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" always;
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
  ```
  Also set `server_tokens off;` in `static-site/nginx.conf`.
- **Cross-references:** `static-site/nginx.conf`, `deploy-docker.sh` nginx template, `src/lib/api/handler.ts:199-207`

## MEDIUM: Local compiler fallback runs with default seccomp if custom profile is missing
- **Classification:** Sandboxing / Defense-in-depth
- **Confidence:** Medium
- **File(s):** `src/lib/compiler/execute.ts:379-388`
- **Problem:** When `SECCOMP_PROFILE_PATH` is missing, the local Docker fallback logs a one-time warning and proceeds with Docker’s default seccomp policy instead of the project-specific restricted profile.
- **Concrete exploit/failure scenario:** A mis-packaged deployment (missing `docker/seccomp-profile.json` from the image or a wrong `JUDGE_SECCOMP_PROFILE` override) silently weakens the sandbox for local fallback compilations, potentially exposing syscalls that the custom profile intentionally blocks.
- **Suggested fix:** Fail closed when the configured custom seccomp profile is missing, or require an explicit opt-out environment variable before falling back to the default policy.
- **Cross-references:** `docker/seccomp-profile.json`, `judge-worker-rs/src/docker.rs:330-397`

## MEDIUM: Internal worker-to-app traffic is unencrypted HTTP
- **Classification:** Infrastructure / Transit encryption
- **Confidence:** Medium
- **File(s):** `docker-compose.production.yml:138`; `src/lib/compiler/execute.ts` (local fallback default URL); `judge-worker-rs/src/config.rs:validate_secure_judge_urls`
- **Problem:** The production compose sets `JUDGE_BASE_URL=http://app:3000/api/v1` and `COMPILER_RUNNER_URL=http://judge-worker:3001`. Although the Rust worker refuses remote HTTP unless `JUDGE_ALLOW_INSECURE_HTTP=1`, it treats internal hostnames as local and accepts plain HTTP. Bearer tokens, worker secrets, and hidden test cases therefore traverse the internal bridge unencrypted.
- **Concrete exploit/failure scenario:** A compromised sidecar container on the default bridge can sniff worker registration, claim responses containing hidden test cases, or capture `RUNNER_AUTH_TOKEN`/`JUDGE_AUTH_TOKEN` from inter-service HTTP traffic.
- **Suggested fix:** Terminate TLS at an internal reverse proxy or enable mTLS between app and worker; at minimum, place app and worker on an isolated backend network with no access for auxiliary services.
- **Cross-references:** `docker-compose.production.yml`, `judge-worker-rs/src/api.rs`, `src/app/api/v1/judge/claim/route.ts`

---

## LOW: Rust runner shell validation lacks the TS allowed-prefix guard
- **Classification:** Sandboxing / Command validation
- **Confidence:** Medium
- **File(s):** `judge-worker-rs/src/runner.rs:124-176` and `690-710`; compare `src/lib/compiler/execute.ts:189-251`
- **Problem:** The TypeScript executor now runs `validateShellCommandStrict` (denylist + known-compiler-prefix check) before calling the Rust runner (`src/lib/compiler/execute.ts:667-680`). The Rust `/run` endpoint validates only shell metacharacters and does not require the first token of each command segment to match a known compiler/tool prefix.
- **Concrete exploit/failure scenario:** If an attacker obtains the `RUNNER_AUTH_TOKEN`, they can send arbitrary allowed-shell commands (e.g., `bash -c '...'`) directly to the worker, making sandbox probing and side-channel exfiltration easier. The prefix guard is a worthwhile defense-in-depth layer on the Rust side as well.
- **Suggested fix:** Port `ALLOWED_COMMAND_PREFIXES`/`isValidCommandPrefix` from `execute.ts` to Rust and apply it in `run_handler` before `execute_run`.
- **Cross-references:** `src/lib/compiler/execute.ts:189-251`, `judge-worker-rs/src/docker.rs:330-397`

## LOW: Uploaded files written with world-readable permissions
- **Classification:** Filesystem / Data confidentiality
- **Confidence:** High
- **File(s):** `src/lib/files/storage.ts:27-30`
- **Problem:** `writeUploadedFile` passes `{ mode: 0o644 }`, so uploaded files are readable by group and other on the host filesystem.
- **Concrete exploit/failure scenario:** If the data volume is accessible to other users on the host, submission source code, test data, or problem attachments can be read outside the application.
- **Suggested fix:** Use `{ mode: 0o600 }` for uploaded files.
- **Cross-references:** `src/lib/files/validation.ts`, `src/app/api/v1/files/[id]/route.ts`

## LOW: PostScript runner disables SAFER mode
- **Classification:** Sandboxing / Language runtime hardening
- **Confidence:** Medium
- **File(s):** `src/lib/judge/languages.ts:854`
- **Problem:** The PostScript run command passes `-dNOSAFER`, which disables Ghostscript’s file-access sandbox.
- **Concrete exploit/failure scenario:** Although the container is still constrained by `--read-only`, `--cap-drop=ALL`, and `--network=none`, a PostScript submission can read or write any file reachable in the writable tmpfs or mounted workspace, increasing the impact of a container breakout or information leak.
- **Suggested fix:** Use `-dSAFER` for normal submissions and only allow `NOSAFER` for specific problems that require file I/O, gated by a problem-level flag.
- **Cross-references:** `src/lib/judge/languages.ts`, `judge-worker-rs/src/docker.rs`

## LOW: Static site nginx serves only HTTP with no redirect or HSTS
- **Classification:** Infrastructure / Transport security
- **Confidence:** Medium
- **File(s):** `static-site/nginx.conf:1-23`
- **Problem:** The static-site config listens only on port 80, has no HTTPS server, no HSTS, and no redirect to HTTPS. It also omits `server_tokens off`, so the nginx version may be leaked.
- **Concrete exploit/failure scenario:** If this config is used in production, users connect over plaintext, exposing cookies and static assets to interception and downgrade. Version leakage assists fingerprinting for targeted exploits.
- **Suggested fix:** Serve static assets behind the same TLS-terminated reverse proxy as the app, or add a TLS server block, redirect HTTP to HTTPS, set HSTS, and add `server_tokens off;` plus the security headers listed in MEDIUM #9.
- **Cross-references:** `static-site/nginx.conf`, `scripts/online-judge.nginx.conf`

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
- **File(s):** `deploy-docker.sh` (per-target `source .env.deploy.<target>` logic)
- **Problem:** `deploy-docker.sh` sources `.env.deploy.*` files through the shell. These files can contain arbitrary shell commands, not just variable assignments.
- **Concrete exploit/failure scenario:** If a `.env.deploy.<target>` file is modified by a compromised operator account or an attacker with write access to the deployment host, executing the deploy script runs attacker-controlled commands with the deploy user’s privileges.
- **Suggested fix:** Parse env files with a restricted parser (e.g., `grep '^[A-Z_][A-Z0-9_]*='` or a dedicated env parser) instead of `source`, and reject lines containing command substitution, backticks, or semicolons.
- **Cross-references:** `deploy-docker.sh` env-loading section

---

## Final sweep

### Cleared or already-mitigated controls
- No use of `eval()` or `new Function()` was found in the TypeScript source.
- CSRF protection remains a sound triple check (`X-Requested-With`, `Sec-Fetch-Site`, `Origin`) in `src/lib/security/csrf.ts`.
- SQL injection risk is low: Drizzle `sql` tagged templates are used safely, and raw SQL via `rawQueryOne`/`rawQueryAll` uses named/positional parameter binding (`src/lib/db/queries.ts`).
- Password storage uses Argon2id with transparent rehashing (`src/lib/security/password-hash.ts`).
- Session revocation via `tokenInvalidatedAt` is enforced in the JWT refresh path (`src/lib/auth/config.ts:413-418`).
- API keys are hashed (SHA-256) and the one-time reveal is encrypted with AES-256-GCM (`src/lib/api/api-key-auth.ts`).
- Docker sandbox uses `--network=none`, `--cap-drop=ALL`, `--read-only`, tmpfs, PID/CPU limits, non-root `65534:65534`, and a custom seccomp profile (`judge-worker-rs/src/docker.rs`).
- The Docker socket proxy is restricted to container/image list/start/stop/delete; image builds are disabled (`docker-compose.production.yml:64-86`).
- Image validation restricts containers to the `judge-*` namespace and optionally trusted registry prefixes (`src/lib/judge/docker-image-validation.ts`, `judge-worker-rs/src/validation.rs`).

### Risks needing manual validation
- Effectiveness and completeness of `docker/seccomp-profile.json` against current language runtimes.
- Correctness and overhead of `JUDGE_OCI_RUNTIME=runsc` if enabled in production.
- Real-world behavior of `AUTH_TRUST_HOST=true` under spoofed `Host`/`X-Forwarded-Host` requests.
- End-to-end validation of `JUDGE_ALLOWED_IPS` after fixing the XFF nginx directive.
- Whether `client_max_body_size` changes have already broken admin restore/file-upload flows in staging.
- npm audit output (re-run and patch any moderate/high findings).
- Race conditions in submission claim/poll under high concurrency.

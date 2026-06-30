# Security Review — JudgeKit Cycle 1

**Date:** 2026-06-30  
**Scope:** Entire repository — auth/authz, API routes, sandbox/judge pipeline, Docker/nginx config, deployment scripts, secrets handling  
**Summary:** No CRITICAL findings. Authentication, CSRF, and sandbox isolation are substantially sound, and several Cycle-3 hardening fixes are already in place. The remaining issues are configuration gaps and information-disclosure risks, with the highest severity centered on nginx-generated reverse-proxy headers and default trust settings.

**Findings count:** 12 (HIGH 3, MEDIUM 5, LOW 4)

---

## HIGH: Generated nginx overwrites X-Forwarded-For with the proxy IP (confidence: High)
- **File**: `deploy-docker.sh` (lines 1483, 1498, 1510, 1522, 1553, 1568, 1580, 1592)
- **Problem**: Every generated `location` block sets `proxy_set_header X-Forwarded-For \$remote_addr;`, which replaces any existing forwarded-for chain with a single entry — the immediate upstream proxy. The application is configured with `TRUSTED_PROXY_HOPS=1` (`.env.example:175`) and `extractClientIp` expects at least `trustedHops + 1` entries before it will trust an XFF-derived IP (`src/lib/security/ip.ts:99`). With only one entry, the function returns `null` in production.
- **Failure scenario**: 
  - Rate limiting collapses to a single global bucket (`api:<endpoint>:unknown`) because `getRateLimitKey` falls back to `"unknown"` (`src/lib/security/rate-limit.ts:45-47`). A single attacker can exhaust per-endpoint limits and deny service to all users behind the same proxy.
  - If an operator sets `JUDGE_ALLOWED_IPS`, `isJudgeIpAllowed` receives a `null` client IP and denies every legitimate worker (`src/lib/judge/ip-allowlist.ts:204-207`).
- **Suggested fix**: Change the generated directive to `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` and ensure `TRUSTED_PROXY_HOPS` matches the actual number of trusted proxies. Alternatively, use nginx `set_real_ip_from` + `real_ip_recursive on` and rely on `X-Real-IP` with `TRUSTED_PROXY_HOPS=0`.
- **Cross-references**: `src/lib/security/ip.ts:68-131`, `src/lib/security/rate-limit.ts:45-47`, `src/lib/judge/ip-allowlist.ts:182-210`, `.env.example:175`

## HIGH: `AUTH_TRUST_HOST` defaults to true in production (confidence: High)
- **File**: `deploy-docker.sh:662`, `docker-compose.production.yml:106`, `src/lib/security/env.ts:260-266`, `src/lib/auth/config.ts:321`
- **Problem**: `deploy-docker.sh` writes `AUTH_TRUST_HOST=true` into freshly generated `.env.production`, and `docker-compose.production.yml` defaults the same. `shouldTrustAuthHost()` returns `true` in production whenever the env var is not explicitly set to `"false"`. With NextAuth’s `trustHost` enabled, Auth.js derives canonical URLs from the `Host` / `X-Forwarded-Host` request headers. The generated nginx config sets `Host $host` but does **not** strip a client-supplied `X-Forwarded-Host` header.
- **Failure scenario**: An attacker making direct HTTPS requests to the server with `Host: attacker.com` or `X-Forwarded-Host: attacker.com` can cause Auth.js to generate session state, callback URLs, or email links bound to an attacker-controlled domain. This becomes critical if OAuth providers or magic-link flows are enabled later.
- **Suggested fix**: Default `AUTH_TRUST_HOST=false` in production when `AUTH_URL` is set; have nginx explicitly overwrite or remove `X-Forwarded-Host` before proxying; rely on `AUTH_URL` and DB `allowedHosts` as the trusted-host set.
- **Cross-references**: `src/lib/security/csrf.ts:7-17`, `src/lib/security/env.ts:213-241`, `deploy-docker.sh` nginx template lines 1446-1598

## HIGH: Judge API IP allowlist defaults to allow-all (confidence: High)
- **File**: `src/lib/judge/ip-allowlist.ts:17-25`, `src/lib/judge/ip-allowlist.ts:182-202`; generated `.env.production` in `deploy-docker.sh:658-682`
- **Problem**: When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed()` returns `true` for every IP. The production compose file does not set either variable. The code logs a one-time warning, but the open posture ships by default.
- **Failure scenario**: A leaked `JUDGE_AUTH_TOKEN` — via env backup, CI log, or container inspect — lets any internet host register fake workers, claim submissions (reading `sourceCode` and hidden `testCases`), and inject arbitrary judge verdicts.
- **Suggested fix**: Generate `.env.production` with `JUDGE_ALLOWED_IPS` restricted to the worker subnet(s), or set `JUDGE_STRICT_IP_ALLOWLIST=1` and require operators to configure an explicit allowlist before workers can register.
- **Cross-references**: `.env.example:176-182`, `src/app/api/v1/judge/register/route.ts`, `src/app/api/v1/judge/claim/route.ts`

## MEDIUM: Generated nginx drops global `client_max_body_size` for non-judge routes (confidence: High)
- **File**: `deploy-docker.sh` nginx template (lines 1478-1597)
- **Problem**: The hardened nginx config now sets `client_max_body_size` only on `/api/auth/` (1m) and `/api/v1/judge/poll` (50M). The catch-all `location /` has no explicit limit, so it falls back to the nginx default of 1 MiB.
- **Failure scenario**: Admin restore/import accepts backup ZIPs and JSON exports that can be tens of megabytes (`src/app/api/v1/admin/restore/route.ts:69`, `src/app/api/v1/admin/migrate/import/route.ts:76`). File uploads through the generic API are also likely to exceed 1 MiB. nginx will reject them with `413 Payload Too Large` before the application sees them, forcing operators to bypass the restore workflow.
- **Suggested fix**: Add `client_max_body_size 50M;` to the `location /` block (or scoped to `/api/v1/admin/*` and `/api/v1/files/*`) and keep it aligned with `MAX_IMPORT_BYTES`.
- **Cross-references**: `src/lib/db/import-transfer.ts`, `src/app/api/v1/files/[id]/route.ts`

## MEDIUM: Admin restore/import responses leak server-side snapshot path (confidence: High)
- **File**: `src/app/api/v1/admin/restore/route.ts:149` and success response; `src/app/api/v1/admin/migrate/import/route.ts:115`, `141`, `228`, `251`
- **Problem**: The `preRestoreSnapshotPath` filesystem path is returned verbatim in JSON responses to authenticated admin callers.
- **Failure scenario**: A compromised admin account, malicious browser extension, or accidentally shared API response reveals the exact host path layout (e.g., `/home/deployer/data/pre-restore-snapshots/...`), which aids lateral movement and targeted file access.
- **Suggested fix**: Return only a snapshot ID or timestamp that operators can correlate with server logs; log the full path server-side.
- **Cross-references**: `src/lib/db/pre-restore-snapshot.ts`

## MEDIUM: Deprecated migrate/import JSON path still accepts password in request body (confidence: High)
- **File**: `src/app/api/v1/admin/migrate/import/route.ts:145-252`
- **Problem**: The endpoint still supports a JSON body of `{ password, data }` and validates the admin password from the request body. It logs a deprecation warning and adds `Deprecation`/`Sunset` headers, but the path remains functional until November 2026.
- **Failure scenario**: Any reverse proxy, WAF, or debug middleware that logs request bodies will capture the admin password in plaintext. This is exactly the scenario the multipart path was introduced to avoid.
- **Suggested fix**: Remove the JSON path, or gate it behind an env flag that defaults to off before the stated sunset. Emit a rate-limited `SECURITY_ALERT` log if the legacy path is used.
- **Cross-references**: `src/app/api/v1/admin/restore/route.ts` (multipart-only)

## MEDIUM: Docker Compose lacks internal network segmentation (confidence: High)
- **File**: `docker-compose.production.yml` (no `networks:` block)
- **Problem**: All services (`db`, `app`, `judge-worker`, `docker-proxy`, `code-similarity`, `rate-limiter`) share the default bridge network.
- **Failure scenario**: A compromised sidecar or auxiliary container can reach `db:5432`, `app:3000`, and `judge-worker:3001`, enabling lateral movement and expanding the blast radius of a single container breach.
- **Suggested fix**: Define isolated networks (`frontend`, `backend`, `judge`, `db`) and attach each service only to the networks it needs.
- **Cross-references**: `docker-compose.production.yml` services block

## MEDIUM: Judge worker container runs as root (confidence: High)
- **File**: `Dockerfile.judge-worker` (lines 27-38, no `USER` directive)
- **Problem**: The final `runner` stage does not drop to a non-root user. It runs the worker process as root inside the container.
- **Failure scenario**: A sandbox escape, supply-chain compromise, or bug in the worker gives root privileges inside the container, making host compromise via the Docker socket proxy or workspace mounts easier.
- **Suggested fix**: Add a non-root user/group in the final stage, `chown` the binary and `/judge-workspaces`, and end with `USER <uid>:<gid>`. Ensure the user can still reach `docker-proxy:2375` and write to `/judge-workspaces`.
- **Cross-references**: `Dockerfile` (app uses `USER nextjs`), `docker-compose.production.yml` judge-worker service

## LOW: Uploaded files written with world-readable permissions (confidence: High)
- **File**: `src/lib/files/storage.ts:27-30`
- **Problem**: `writeUploadedFile` passes `{ mode: 0o644 }`, so uploaded files are readable by group and other on the host filesystem.
- **Failure scenario**: If the data volume is accessible to other users on the host, submission source code, test data, or problem attachments can be read outside the application.
- **Suggested fix**: Use `{ mode: 0o600 }` for uploaded files.
- **Cross-references**: `src/lib/files/validation.ts`, `src/app/api/v1/files/[id]/route.ts`

## LOW: Rust runner shell validation lacks the TS allowed-prefix guard (confidence: Medium)
- **File**: `judge-worker-rs/src/runner.rs:124-176` and `690-710`; compare `src/lib/compiler/execute.ts:189-251`
- **Problem**: The TypeScript executor now runs `validateShellCommandStrict` (denylist + known-compiler-prefix check) **before** calling the Rust runner (`src/lib/compiler/execute.ts:667-680`). The Rust `/run` endpoint validates only shell metacharacters and does not require the first token of each command segment to match a known compiler/tool prefix.
- **Failure scenario**: If an attacker obtains the `RUNNER_AUTH_TOKEN`, they can send arbitrary allowed-shell commands (e.g., `bash -c '...'`) directly to the worker, making sandbox probing and side-channel exfiltration easier. The prefix guard is a worthwhile defense-in-depth layer on the Rust side as well.
- **Suggested fix**: Port `ALLOWED_COMMAND_PREFIXES`/`isValidCommandPrefix` from `execute.ts` to Rust and apply it in `run_handler` before `execute_run`.
- **Cross-references**: `src/lib/compiler/execute.ts:189-251`, `judge-worker-rs/src/docker.rs:330-397`

## LOW: Static-site and app nginx missing security response headers (confidence: Medium)
- **File**: `static-site/nginx.conf:1-23`; generated app nginx in `deploy-docker.sh` (lines 1446-1598)
- **Problem**: Neither the static site nor the generated app-server nginx config sets `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, or `Referrer-Policy`.
- **Failure scenario**: Clickjacking, MIME-sniffing attacks, and referrer leakage become possible, especially if the static site ever serves user-contributed HTML or if an attacker can upload polyglot files.
- **Suggested fix**: Add `add_header` directives in both configs. For example:
  ```nginx
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" always;
  ```
- **Cross-references**: `static-site/nginx.conf`, `deploy-docker.sh` nginx template

## LOW: Dummy password hash uses a static, identifiable salt (confidence: Low)
- **File**: `src/lib/auth/config.ts:51-52`
- **Problem**: The `DUMMY_PASSWORD_HASH` constant embeds the salt `Y2xhdWRlZHVtbXloYXNo`, which base64-decodes to `claudedummyhash`.
- **Failure scenario**: The sentinel hash is immediately recognizable in a source leak or DB dump. It is used only for timing-safe comparison, so this is a hygiene issue rather than an exploitable weakness.
- **Suggested fix**: Replace the constant with a random Argon2id hash generated offline and documented as a deployment artifact, or generate a per-process dummy hash at startup.
- **Cross-references**: `src/lib/security/password-hash.ts`

---

## Final sweep

### Cleared or mitigated since earlier review passes
- `autoindex` is now `off` in `static-site/nginx.conf:21`.
- Strict shell-command validation is now performed **before** the Rust runner/local fallback in `src/lib/compiler/execute.ts:667-680`.
- The XFF/X-Real-IP fallback bug was fixed in `src/lib/security/ip.ts:99-119` so a spoofed XFF no longer bypasses hop validation.
- CSRF protection remains a sound triple check (`X-Requested-With`, `Sec-Fetch-Site`, `Origin`) in `src/lib/security/csrf.ts`.
- Similarity-check authorization was expanded to require contest management, capability, or assigned TA status.
- Contest join invalid-code paths now apply additional per-user and per-code rate limits.

### Risks needing manual validation
- Effectiveness and completeness of `docker/seccomp-profile.json` against current language runtimes.
- Correctness and overhead of `JUDGE_OCI_RUNTIME=runsc` if enabled in production.
- Real-world behavior of `AUTH_TRUST_HOST=true` under spoofed `Host`/`X-Forwarded-Host` requests.
- End-to-end validation of `JUDGE_ALLOWED_IPS` after fixing the XFF nginx directive.
- Whether `client_max_body_size` changes have already broken admin restore/file-upload flows in staging.
- npm audit output (2 moderate findings were noted previously; re-run and patch).
- Race conditions in submission claim/poll under high concurrency.

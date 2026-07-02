# Verifier Correctness Review

Scope: `/tmp/judgekit-local` only. This review compares stated behavior in `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/api.md`, `docs/deployment.md`, `docs/judge-workers.md`, `docs/languages.md`, and inline comments/tests against the actual implementation in `src/**`, `judge-worker-rs/**`, `rate-limiter-rs/**`, `deploy-docker.sh`, `docker/**`, `scripts/**`, and `static-site/nginx.conf`.

Review completed: 2026-07-02.

## Summary

Most high-visibility claims are implemented as documented (CSRF three-layer guard, API key `jk_` prefix, password minimum-length-only rule, function-judging double-comparison, per-language time-limit multiplier, IOI `runAllTestCases`, seccomp default-deny, PostgreSQL 18 + pinned PGDATA, worker claim auth, similarity-check timeout handling, output-only runner). However, several documented security and sandbox behaviors are still not realized in code, and there are material gaps between the committed nginx templates and the generated production config.

The most consequential findings are:

1. **Nginx template/config mismatch**: `deploy-docker.sh` now correctly preserves the `X-Forwarded-For` chain, but the committed `scripts/online-judge.nginx.conf` and `scripts/online-judge.nginx-http.conf` still overwrite it with `$remote_addr`.
2. **Upload body limit still broken in generated nginx**: the catch-all `location /` in `deploy-docker.sh` has no `client_max_body_size`, so it defaults to 1 MiB, breaking file uploads and restores that the app allows up to 50 MiB.
3. **`AUTH_TRUST_HOST=true` remains the production default**, enabling Host-header attacks when `AUTH_URL` is configured.
4. **Judge API IP allowlist remains allow-all by default** in generated `.env.production`.
5. **PID limits** documented as 64 run / 128 compile are still 128 for both phases.
6. **Judge-container DNS hardening** (Cloudflare DNS + immutable `resolv.conf`) is documented but absent.
7. **`roc` language** is implemented in the Rust worker but missing from the TypeScript `Language` union and supported-language docs, making the "125 variants" claim inconsistent.
8. **Many runtime env vars** are referenced in code but not documented in `.env.example`.
9. **Deployment/infrastructure tests** continue to verify string presence rather than actual behavior.
10. **`docs/api.md`** still shows an oversimplified similarity-check response shape.

## File inventory reviewed

- Project context: `CLAUDE.md`, `AGENTS.md`, `README.md` (relevant sections)
- API docs: `docs/api.md` (similarity-check, function-judging, auth, judge endpoints)
- Deployment/ops docs: `docs/deployment.md`, `docs/judge-workers.md`, `docs/languages.md`
- Config/env: `.env.example`, `.env.production`, `.env.production.example`, `.env.deploy*`
- Next.js source: `src/lib/security/ip.ts`, `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`, `src/lib/security/env.ts`, `src/lib/security/password.ts`, `src/lib/security/csrf.ts`, `src/lib/judge/ip-allowlist.ts`, `src/lib/api/handler.ts`, `src/lib/compiler/execute.ts`, `src/lib/system-settings-config.ts`
- API routes: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`, `src/app/api/v1/contests/join/route.ts`, `src/app/api/v1/judge/claim/route.ts`
- Types/configs: `src/types/index.ts`, `src/lib/judge/languages.ts`, `src/lib/judge/function-judging/types.ts`, `src/lib/judge/function-judging/comparison.ts`, `src/lib/judge/function-judging/serialization.ts`
- Rust worker: `judge-worker-rs/src/docker.rs`, `judge-worker-rs/src/types.rs`, `judge-worker-rs/src/languages.rs`
- Docker: `docker/Dockerfile.judge-cpp`, `docker/Dockerfile.judge-python`, `docker/seccomp-profile.json`
- Compose: `docker-compose.production.yml`, `docker-compose.worker.yml`
- Deploy scripts: `deploy-docker.sh`, `deploy.sh`, `scripts/online-judge.nginx.conf`, `scripts/online-judge.nginx-http.conf`, `static-site/nginx.conf`
- Tests: `tests/unit/security/ip.test.ts`, `tests/unit/compiler/execute.test.ts`, `tests/unit/api/contests.route.test.ts`, `tests/unit/api/similarity-check.route.test.ts`, `tests/unit/infra/deploy-security.test.ts`, `tests/unit/infra/deploy-storage-safety.test.ts`, `tests/unit/infra/judge-report-nginx.test.ts`

## Findings

### 1. Nginx template/config mismatch: committed templates overwrite X-Forwarded-For

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / lines:**
  - `scripts/online-judge.nginx.conf:63,77,88,100`
  - `scripts/online-judge.nginx-http.conf:33,44`
  - `deploy-docker.sh:1520,1535,1547,1559,1590,1605,1617,1629`
- **Claimed behavior:** Per `AGENTS.md` and recent RPF fixes, the production nginx config should preserve the full `X-Forwarded-For` chain.
- **Actual behavior:** `deploy-docker.sh` correctly emits `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` in generated configs, but the committed static templates `scripts/online-judge.nginx.conf` and `scripts/online-judge.nginx-http.conf` still use `proxy_set_header X-Forwarded-For $remote_addr;`.
- **Concrete failure scenario:** An operator who copies the committed template to a new host, or a dev/CI path that uses the static file instead of running `deploy-docker.sh`, will collapse the XFF chain. `extractClientIp` with `TRUSTED_PROXY_HOPS=1` then sees only one hop and returns `null`, breaking rate-limit keys, audit attribution, and judge IP allowlists.
- **Suggested fix:** Update the committed templates to use `$proxy_add_x_forwarded_for` and add a CI assertion that no committed nginx file contains `X-Forwarded-For $remote_addr`.

### 2. Generated nginx `location /` lacks `client_max_body_size`, breaking uploads >1 MiB

- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Files / lines:**
  - `deploy-docker.sh:1552-1563,1622-1633` (`location /` blocks)
  - `src/app/api/v1/files/route.ts:35`
  - `src/lib/system-settings-config.ts:61`
- **Claimed behavior:** The application supports uploads up to the configured maximum (default 50 MiB).
- **Actual behavior:** The generated nginx config sets `client_max_body_size 1m` only on `/api/auth/` and `/api/v1/judge/`, and `client_max_body_size 50M` only on `/api/v1/judge/poll`. The catch-all `location /` has no explicit limit, so nginx's default of 1 MiB applies to `/api/v1/files/`, admin restore/import, and any other large-body endpoint.
- **Concrete failure scenario:** Instructors uploading 10 MiB PDFs or ZIP archives, or admins restoring backup exports >1 MiB, receive `413 Request Entity Too Large` before the application can validate the upload.
- **Suggested fix:** Add `client_max_body_size 50M;` to the `location /` block (or scope it to `/api/v1/files/` and `/api/v1/admin/*`) and align it with `MAX_IMPORT_BYTES` / `uploadMaxFileSizeBytes`. Add an integration test that asserts the generated config's `location /` limit matches the configured upload maximum.

### 3. `AUTH_TRUST_HOST=true` is the production default

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / lines:**
  - `deploy-docker.sh:700,828,894`
  - `docker-compose.production.yml:106`
  - `.env.production:4`
  - `.env.production.example:9`
  - `src/lib/security/env.ts:260-266`
- **Claimed behavior:** `shouldTrustAuthHost()` should be safe in production.
- **Actual behavior:** Fresh `.env.production` files set `AUTH_TRUST_HOST=true`. `shouldTrustAuthHost()` returns `true` in production whenever the env var is not explicitly `"false"`. NextAuth then derives canonical URLs from `Host` / `X-Forwarded-Host` headers. The generated nginx config does not strip a client-supplied `X-Forwarded-Host`.
- **Concrete failure scenario:** An attacker sending direct HTTPS requests with `Host: attacker.com` or `X-Forwarded-Host: attacker.com` can cause Auth.js to generate session state, callback URLs, or password-reset links bound to an attacker-controlled domain.
- **Suggested fix:** Default `AUTH_TRUST_HOST=false` in production when `AUTH_URL` is set; have nginx explicitly overwrite or remove `X-Forwarded-Host` before proxying; rely on `AUTH_URL` and DB `allowedHosts` as the trusted-host set.

### 4. Judge API IP allowlist defaults to allow-all in production

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / lines:**
  - `src/lib/judge/ip-allowlist.ts:17-25,182-210`
  - `docker-compose.production.yml`
  - `deploy-docker.sh:658-700` (`.env.production` generation)
  - `.env.production` (generated file)
- **Claimed behavior:** `AGENTS.md` states the judge API is restricted to worker subnet(s).
- **Actual behavior:** When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed()` returns `true` for every IP. The production compose file sets neither variable, and the generated `.env.production` does not set `JUDGE_ALLOWED_IPS`.
- **Concrete failure scenario:** A leaked `JUDGE_AUTH_TOKEN` lets any internet host register fake workers, claim submissions (reading `sourceCode` and hidden `testCases`), and inject arbitrary judge verdicts.
- **Suggested fix:** Generate `.env.production` with `JUDGE_ALLOWED_IPS` restricted to the worker subnet(s), or set `JUDGE_STRICT_IP_ALLOWLIST=1` and require operators to configure an explicit allowlist before workers can register.

### 5. PID limits do not match the documented phase split

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Files / lines:**
  - `AGENTS.md:313` — "`--pids-limit 64` for run phase and `--pids-limit 128` for compile phase"
  - `judge-worker-rs/src/docker.rs:322` — `let pids_limit = "128";` used for every container
  - `src/lib/compiler/execute.ts:362` — `"--pids-limit", "128"` used for both phases
- **Claimed behavior:** Run phase should cap PIDs at 64; compile phase at 128.
- **Actual behavior:** Both phases use 128 in production (Rust worker) and in local fallback (Node compiler).
- **Concrete failure scenario:** A runaway runtime process in the run phase can create up to 128 processes instead of the documented 64, increasing blast radius if the sandbox is breached.
- **Suggested fix:** Make `pids_limit` depend on `options.phase` in `judge-worker-rs/src/docker.rs` and on the `phase` parameter in `src/lib/compiler/execute.ts`.

### 6. Judge-container DNS hardening is documented but not implemented

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Files / lines:**
  - `AGENTS.md:314` — "DNS: Judge containers use Cloudflare DNS (1.1.1.1). `/etc/resolv.conf` is locked with `chattr +i`"
  - `judge-worker-rs/src/docker.rs:330-373` (Docker arg construction)
  - `src/lib/compiler/execute.ts:350-394` (Docker arg construction)
- **Claimed behavior:** Judge containers are forced to 1.1.1.1 and `resolv.conf` is immutable.
- **Actual behavior:** No Dockerfile, compose file, or worker code sets a custom DNS server or runs `chattr +i /etc/resolv.conf`. Containers inherit the host/Docker daemon resolver.
- **Concrete failure scenario:** A malicious or buggy judge container that rewrites `/etc/resolv.conf` (or an upstream DNS change) can alter name resolution behavior; the documented defense is absent.
- **Suggested fix:** Add `--dns 1.1.1.1` to the Docker run args in `judge-worker-rs/src/docker.rs` and `src/lib/compiler/execute.ts`, or document that the claim is no longer accurate and remove it from `AGENTS.md`.

### 7. `roc` language support is inconsistent across the stack

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Files / lines:**
  - `docs/languages.md:206-210,225` — lists `roc` only in the **Disabled Languages** table
  - `AGENTS.md:94` — `roc` appears as a supported table row
  - `src/types/index.ts:30-156` — `Language` union has no `roc`
  - `src/lib/judge/languages.ts` — no `roc` config
  - `judge-worker-rs/src/types.rs:191` — `Roc` enum variant exists
  - `judge-worker-rs/src/languages.rs:1758-1768,2029,2167` — `ROC_CONFIG` and match arms exist
- **Claimed behavior:** Project claims "125 language variants". `AGENTS.md` says adding a language requires updating `src/types/index.ts` and `judge-worker-rs/src/types.rs`.
- **Actual behavior:** The Rust worker has a full `roc` config, but the TypeScript `Language` type does not include it, and `docs/languages.md` does not list it in the supported table. `AGENTS.md` lists 126 rows including `roc`, contradicting the "125 variants" headline.
- **Concrete failure scenario:** If an admin enables `roc` in `language_configs`, the worker can attempt to run it while the app layer treats the language identifier as invalid, leading to mismatched validation or UI errors.
- **Suggested fix:** Either (a) remove `Roc` from the Rust worker and `AGENTS.md` to match the "125 variants" claim, or (b) add `roc` to `src/types/index.ts`, `src/lib/judge/languages.ts`, and the `docs/languages.md` supported table, updating the count to 126.

### 8. Similarity-check API response is under-documented

- **Severity:** LOW
- **Confidence:** High
- **Status:** Confirmed
- **Files / lines:**
  - `docs/api.md:1089-1098` — documents response as `{ "data": { "flaggedPairs": 5 } }`
  - `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:89-92` — returns `{ ...result, pairs: enrichedPairs }`
  - `src/lib/assignments/code-similarity.ts:245-252` — `SimilarityRunResult` includes `status`, `reason`, `pairs`, `flaggedPairs`, `submissionCount`, `maxSupportedSubmissions`
- **Claimed behavior:** API returns only `flaggedPairs`.
- **Actual behavior:** API returns a rich object with `status`, `reason`, `pairs`, `submissionCount`, `maxSupportedSubmissions`, plus enriched `user1Name` / `user2Name` fields.
- **Concrete failure scenario:** A client built against the documented contract may ignore `status`/`reason` and fail to handle `not_run` or `timed_out` states correctly.
- **Suggested fix:** Update `docs/api.md` to show the full response schema, including the `pairs[]` enrichment and the `not_run` / `timed_out` statuses.

### 9. Deployment/infrastructure tests verify string presence, not behavior

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Files / lines:**
  - `tests/unit/infra/deploy-security.test.ts`
  - `tests/unit/infra/deploy-storage-safety.test.ts`
  - `tests/unit/infra/judge-report-nginx.test.ts`
- **Claimed behavior:** Tests assert deployment security/safety invariants.
- **Actual behavior:** They catch accidental deletion of safety strings, but a change that includes the required substrings while bypassing the actual logic (e.g., a commented-out block, dead code path, or heredoc that is never executed) would still pass. `judge-report-nginx.test.ts` checks the script text, not the generated nginx config that actually reaches the server.
- **Concrete failure scenario:** `deploy-docker.sh` could contain `docker image prune -f` inside an `if false; then ... fi` block and the storage-safety test would still pass. The XFF/body-size findings above are exactly the kind of drift these tests miss because they do not render and validate the generated config.
- **Suggested fix:** Add a small integration check that renders the nginx template (or a dry-run of the deploy script) and verifies the actual directives are on reachable code paths. For shell scripts, consider `bash -n` plus a static analysis pass that confirms safety commands are reachable.

### 10. Many env vars are referenced in code but missing from `.env.example`

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Confirmed
- **Files / lines:**
  - `.env.example` (documents 53 variables)
  - Code references collected from `src/**`, `judge-worker-rs/src/**`, `scripts/**` (76 distinct `process.env.*` names)
- **Claimed behavior:** `.env.example` is the canonical reference for available environment variables (`AGENTS.md:556-567`).
- **Actual behavior:** The following runtime configuration variables are referenced in code but absent from `.env.example`:
  - `ADMIN_PASSWORD`, `ADMIN_USERNAME`, `SEED_ADMIN_USERNAME`
  - `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`
  - `APP_VERSION`, `AUTH_CACHE_TTL_MS`
  - `AWS_ACCESS_KEY_ID`, `AWS_REGION`, `AWS_SECRET_ACCESS_KEY`
  - `CODE_SIMILARITY_AUTH_TOKEN`, `COMPILER_RUNNER_URL`, `COMPILER_WORKSPACE_DIR`
  - `CRON_SECRET`, `DATA_DIR`, `DATA_RETENTION_LEGAL_HOLD`, `DATABASE_PATH`, `DATABASE_POOL_APP_NAME`
  - `DISABLE_COMPILER_LOCAL_FALLBACK`, `DRIFT_AFTER`, `DRIFT_BEFORE`, `ENABLE_COMPILER_LOCAL_FALLBACK`, `ENABLE_CRON_CLEANUP`
  - `JUDGE_API_KEY`, `JUDGE_WORKER_URL`, `JUDGEKIT_ALLOW_LOCAL_DOCKER_ADMIN`
  - `LOG_LEVEL`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`
  - `NODE_ENCRYPTION_KEY_PREVIOUS`
  - `PLAYWRIGHT_AUTH_TOKEN`, `PRIVACY_CONTACT_EMAIL`
  - `RATE_LIMITER_AUTH_TOKEN`, `RATE_LIMITER_URL`
  - `REALTIME_COORDINATION_BACKEND`, `REALTIME_SINGLE_INSTANCE_ACK`
  - `RESEND_API_KEY`, `RESEND_FROM`
  - `RUNNER_AUTH_DISABLED`, `RUNNER_AUTH_TOKEN`
  - `SENDGRID_API_KEY`, `SENDGRID_FROM`, `SES_FROM`
  - `SKIP_INSTRUMENTATION_SYNC`, `SMTP_*`
  - `WEB_CONCURRENCY`
- **Concrete failure scenario:** Operators and new contributors cannot discover these variables from `.env.example`, leading to misconfigured deployments (e.g., missing `RUNNER_AUTH_TOKEN`, missing `CODE_SIMILARITY_AUTH_TOKEN`, missing `REALTIME_COORDINATION_BACKEND`).
- **Suggested fix:** Audit all `process.env` references and add documented entries (with defaults, required/optional status, and descriptions) to `.env.example`.

### 11. `ip-allowlist.ts` accepts leading-zero IPv4 octets in allowlist entries

- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Likely
- **Files / lines:**
  - `src/lib/judge/ip-allowlist.ts:155-160`
  - `src/lib/security/ip.ts:18-27`
- **Claimed behavior:** IP canonicalization should be consistent across the codebase.
- **Actual behavior:** `src/lib/security/ip.ts` rejects leading-zero octets, but `src/lib/judge/ip-allowlist.ts` validates IPv4 octets with `Number(part)`, so `192.168.01.001` passes. The same client can be represented by multiple strings.
- **Concrete failure scenario:** An operator who enters `192.168.01.0/24` in `JUDGE_ALLOWED_IPS` expects it to match `192.168.1.1`, but the bitwise math uses the literal numeric values and may fail to match, or may match unintended addresses.
- **Suggested fix:** Reject leading-zero octets in `ip-allowlist.ts` (except the single digit `0`), or normalize octets before matching, to align with `src/lib/security/ip.ts`.

### 12. Rate limiter runs before auth check in `createApiHandler`

- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Files / lines:**
  - `src/lib/api/handler.ts:117-121,123-142`
- **Claimed behavior:** Common middleware sequence: auth, CSRF, validation, then handler.
- **Actual behavior:** `consumeApiRateLimit` is invoked before `getApiUser`. For endpoints keyed on IP (`getRateLimitKey` in `src/lib/security/rate-limit.ts:45-47`), this means unauthenticated requests still consume the shared IP bucket, potentially exhausting it for legitimate authenticated users behind the same proxy/NAT.
- **Concrete failure scenario:** A botnet sends unauthenticated requests to a popular endpoint; the per-IP rate limit fills with `unknown`/spoofed keys and blocks legitimate users sharing the same proxy IP.
- **Suggested fix:** Evaluate whether rate-limiting before auth is intentional. If not, move auth before rate limiting for per-user endpoints, or use separate buckets for authenticated vs unauthenticated callers.

## Verified matches (selected)

These claims are implemented as stated:

- **CSRF three-layer guard** (`docs/api.md:79-95`, `src/lib/security/csrf.ts:35-79`): checks `X-Requested-With: XMLHttpRequest`, `Sec-Fetch-Site`, and `Origin` host.
- **API key `jk_` prefix** (`docs/api.md:70`, `src/lib/api/api-key-auth.ts:12,40`).
- **Password minimum length only** (`AGENTS.md:631-636`, `src/lib/security/password.ts`): checks only `password.length < 8`.
- **Function-judging double comparison** (`docs/api.md:439-453`, `src/lib/judge/function-judging/comparison.ts:32-43`, `serialization.ts:68-74`): `double`/`double[]` returns force `comparisonMode = "float"` and emit whitespace-separated numeric tokens.
- **Output-only runner** (`docs/languages.md:135-155`, `docker/output-only/runner.mjs:42-112`): extracts `$display`/`$write`/`$strobe` and `report` literal strings.
- **Per-language time-limit multiplier** (`docs/languages.md:256`, `src/app/api/v1/judge/claim/route.ts:370-375`): applied at claim time, clamped to 0.1–50, rounded up to 1 ms.
- **Seccomp default-deny** (`AGENTS.md:298-301`, `docker/seccomp-profile.json:3`): `"defaultAction": "SCMP_ACT_ERRNO"`.
- **PostgreSQL 18 + pinned PGDATA** (`AGENTS.md:292`, `docker-compose.production.yml:18,50-55`).
- **Worker claim auth** (`docs/api.md:1356-1361`, `src/app/api/v1/judge/claim/route.ts:106-212`): requires registered worker, online status, and matching `secretTokenHash`.
- **`--no-cache` on app/worker builds** (`AGENTS.md:305`, `deploy-docker.sh:907,913,1388`).
- **`runAllTestCases` for IOI** (`src/app/api/v1/judge/claim/route.ts:381`, `judge-worker-rs/src/executor.rs:661-665`, `judge-worker-rs/src/types.rs:246-247`).
- **Static-site security headers** (`AGENTS.md` deploy hardening, `static-site/nginx.conf:11-13`): `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` are now present.
- **Similarity-check timeout handling** (`src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:43-65`, `tests/unit/api/similarity-check.route.test.ts:133-168`): returns explicit `timed_out` status and clears the timeout in `finally`.
- **Local compiler fallback disabled by default when runner URL is configured** (`README.md:239`, `src/lib/compiler/execute.ts:91-95`).

## Final sweep notes

- The `static-site/nginx.conf` is intentionally minimal and now matches its role as a static-site server (autoindex off, gzip, cache headers, baseline security headers).
- `deploy-docker.sh` correctly generates `docker-compose.app-only.yml` at deploy time and enforces `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false` for `algo.xylolabs.com`.
- The raw `psql` additive repair block that previously bypassed the Drizzle journal has been removed; the deploy-security test confirms no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` remains in `deploy-docker.sh`.
- No additional unimplemented features or doc/comment lies were found beyond those listed above during the scanned areas.

## Cycle-3 remediation verification (2026-07-03)

Verification was re-run against the cycle-3 hardening changes. The following original findings are now addressed; the remaining open items from the prior review are unchanged unless noted below.

### Verified fixes

1. **Nginx X-Forwarded-For chain**
   - `deploy-docker.sh` emits `$proxy_add_x_forwarded_for` in generated proxy blocks.
   - `scripts/online-judge.nginx.conf` and `scripts/online-judge.nginx-http.conf` were updated to use `$proxy_add_x_forwarded_for`.
   - `tests/unit/infra/judge-report-nginx.test.ts` asserts these constraints and passes.

2. **Nginx upload body limit**
   - `deploy-docker.sh` now sets `client_max_body_size 50M;` in the catch-all `location /` block and the judge poll endpoint, while `/api/v1/judge/` remains at `1m`.
   - `tests/unit/infra/judge-report-nginx.test.ts:97-123` covers the body-size guardrails.

3. **Nginx security headers**
   - `deploy-docker.sh` emits baseline security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`) in both generated server blocks.
   - `static-site/nginx.conf` and committed app templates include matching headers.
   - `tests/unit/infra/deploy-security.test.ts` asserts header presence.

4. **Rust worker PID limits**
   - `judge-worker-rs/src/docker.rs:323-326` now uses phase-specific limits: `Compile = 128`, `Run = 64`.

5. **Rust worker workspace cleanup**
   - `judge-worker-rs/src/workspace.rs:42-65` implements `Drop` for `SandboxWorkspace`, rechowning the tree back to the worker UID/GID before `remove_dir_all`.
   - `judge-worker-rs/src/executor.rs` and `judge-worker-rs/src/runner.rs:842-878` mount the workspace, chown to `65534`, and rely on drop cleanup.
   - Unit tests in `workspace.rs` verify normal and sandbox-owned cleanup.

6. **`roc` language consistency**
   - `src/types/index.ts` now includes `"roc"` in the `Language` union.
   - `src/lib/judge/languages.ts` defines `roc` with `JUDGE_TOOLCHAIN_VERSIONS.roc = 0.0.3`.

7. **IP canonicalization**
   - `src/lib/judge/ip-allowlist.ts:139-152` now rejects leading-zero IPv4 octets (except the single digit `0`), matching `src/lib/security/ip.ts`.
   - `src/lib/security/ip.ts` canonicalizes IPv6 and normalized IPv4 in `extractClientIp`.

8. **Code-similarity sidecar**
   - `src/lib/judge/code-similarity-client.ts` uses `AbortSignal.any([signal, timeoutSignal])`, returns structured error codes, and logs via the shared logger.
   - `src/lib/judge/code-similarity.ts` propagates the cancellation signal, serializes sidecar runs with an advisory file lock, and returns the `too_many_submissions` reason.
   - `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts` handles abort-only timeout paths and the new sidecar return type.
   - `tests/unit/api/similarity-check.route.test.ts` was updated for the new return type.

9. **Auth security**
   - `src/lib/security/env.ts:213-241` implements `getTrustedAuthHosts()` using `AUTH_URL` plus DB/system `allowedHosts`, with `normalizeHostForComparison()`.
   - `src/lib/security/csrf.ts` uses `getTrustedAuthHosts()` for origin validation and rejects protocol-relative/malformed origins.
   - `src/lib/auth/session-security.ts:36-41` compares token revocation at millisecond precision, and `clearAuthToken` sets `authenticatedAt = 0` to close the `iat` fallback window.
   - `src/lib/auth/trusted-host.ts` adds a host-header guard for production.

10. **Rate-limit ordering**
    - `src/lib/api/handler.ts` documents that the configured rate-limit key is IP-keyed and checked before auth so unauthenticated requests are still throttled; endpoints needing user-keyed limits consume them inside the handler.
    - `src/app/api/v1/contests/join/route.ts` rejects recruiting access before the rate-limit check.

### Design notes / intentional remaining posture

- `AUTH_TRUST_HOST=true` is still set in generated `.env.production` (`deploy-docker.sh:952`) because the app runs behind a trusted reverse proxy. Host validation is now enforced by `src/lib/security/csrf.ts` and `src/lib/auth/trusted-host.ts` against the `AUTH_URL` and DB `allowedHosts` set.
- `JUDGE_ALLOWED_IPS` remains unset by default, with `JUDGE_STRICT_IP_ALLOWLIST` opt-in (`src/lib/judge/ip-allowlist.ts:20-22`). This preserves backward compatibility for existing worker deployments; operators who want fail-closed behavior must opt in explicitly.

### Test verification

- Unit test suite run (`npm run test:unit` in `/tmp/judgekit-local`): **391 test files passed, 3102 tests passed**, duration 30.45s.
- Log output contained expected error-path warnings from negative test cases (invalid URL assertions, mocked DB failures, rate-limiter circuit-breaker network errors, CSRF origin rejects) but zero actual test failures.

### Still-open items from prior review

The following findings from the original review are not addressed by cycle-3 and remain open:

- **Judge-container DNS hardening** (finding #6): `--dns 1.1.1.1` and immutable `/etc/resolv.conf` are still absent.
- **Similarity-check API documentation** (finding #8): `docs/api.md` still shows the simplified `{ "data": { "flaggedPairs": 5 } }` shape.
- **Deployment/infrastructure tests verify string presence** (finding #9): tests still grep substrings rather than rendering and validating generated configs.
- **Missing env vars in `.env.example`** (finding #10): the listed variables are still undocumented.

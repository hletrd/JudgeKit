# Verifier Evidence Review — /tmp/judgekit-local

**Date:** 2026-07-03  
**Scope:** Cycle-3 remediation claims in `plan/cycle-3-2026-06-30-nginx-env-hardening.md` (Phase A and Phase B), cross-checked against the actual source, tests, deployment scripts, nginx configs, env examples, and API docs. Prior verifier findings are re-checked where the refreshed aggregate (`_aggregate.md`) disputed them.

**Methodology:** Read source/config/docs directly. Do not treat comments or passing tests as proof of behavior. Cite exact file paths and line ranges. For each discrepancy, label confidence and describe a concrete failure scenario.

## File inventory reviewed

- Project context: `/tmp/judgekit-local/CLAUDE.md`, `/tmp/judgekit-local/AGENTS.md`, `/tmp/judgekit-local/README.md`
- Cycle plan: `/tmp/judgekit-local/plan/cycle-3-2026-06-30-nginx-env-hardening.md`
- Aggregate: `/tmp/judgekit-local/.context/reviews/_aggregate.md`
- API docs: `/tmp/judgekit-local/docs/api.md`
- Env/config: `/tmp/judgekit-local/.env.example`, `/tmp/judgekit-local/.env.production`, `/tmp/judgekit-local/.env.production.example`, `/tmp/judgekit-local/.env.deploy*`
- Deploy scripts: `/tmp/judgekit-local/deploy-docker.sh`, `/tmp/judgekit-local/deploy.sh`, `/tmp/judgekit-local/scripts/online-judge.nginx.conf`, `/tmp/judgekit-local/scripts/online-judge.nginx-http.conf`, `/tmp/judgekit-local/static-site/nginx.conf`, `/tmp/judgekit-local/static-site/static.nginx.conf`
- Source:
  - `/tmp/judgekit-local/src/lib/compiler/execute.ts`
  - `/tmp/judgekit-local/src/lib/security/ip.ts`
  - `/tmp/judgekit-local/src/lib/judge/ip-allowlist.ts`
  - `/tmp/judgekit-local/src/lib/db/import.ts`
  - `/tmp/judgekit-local/src/lib/db/pre-restore-snapshot.ts`
  - `/tmp/judgekit-local/src/lib/api/handler.ts`
  - `/tmp/judgekit-local/src/app/api/v1/contests/join/route.ts`
  - `/tmp/judgekit-local/src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`
  - `/tmp/judgekit-local/src/app/api/v1/files/route.ts`
  - `/tmp/judgekit-local/src/app/api/v1/admin/restore/route.ts`
  - `/tmp/judgekit-local/src/app/api/v1/admin/migrate/import/route.ts`
  - `/tmp/judgekit-local/judge-worker-rs/src/workspace.rs`
  - `/tmp/judgekit-local/judge-worker-rs/src/docker.rs`
- Tests:
  - `/tmp/judgekit-local/tests/unit/infra/judge-report-nginx.test.ts`
  - `/tmp/judgekit-local/tests/unit/infra/deploy-security.test.ts`
  - `/tmp/judgekit-local/tests/unit/infra/deploy-storage-safety.test.ts`
  - `/tmp/judgekit-local/tests/unit/security/ip.test.ts`
  - `/tmp/judgekit-local/tests/unit/judge/ip-allowlist.test.ts`
  - `/tmp/judgekit-local/tests/unit/compiler/execute.test.ts`
  - `/tmp/judgekit-local/tests/unit/db/import-implementation.test.ts`
  - `/tmp/judgekit-local/tests/unit/api/files.route.test.ts`
  - `/tmp/judgekit-local/tests/unit/api/contests.route.test.ts`
  - `/tmp/judgekit-local/tests/unit/api/admin-backup-security.route.test.ts`
  - `/tmp/judgekit-local/tests/unit/db/pre-restore-snapshot.test.ts`
- CI: `/tmp/judgekit-local/.github/workflows/ci.yml`, `/tmp/judgekit-local/playwright.config.ts`, `/tmp/judgekit-local/scripts/playwright-local-webserver.sh`

## Phase A / Phase B claim verification

| ID | Claim | Evidence | Verdict |
|---|---|---|---|
| A1 | Replace `listen ... ssl http2` with `listen ... ssl` + `http2 on;`; support legacy fallback. | `/tmp/judgekit-local/deploy-docker.sh:625-672` detects nginx version and chooses modern/legacy; `/tmp/judgekit-local/deploy-docker.sh:1580-1591` emits the chosen syntax; `/tmp/judgekit-local/scripts/online-judge.nginx.conf:29,42` and `/tmp/judgekit-local/static-site/static.nginx.conf:12` use `http2 on;`; `/tmp/judgekit-local/tests/unit/infra/judge-report-nginx.test.ts:39-62` checks both. | **Verified** |
| A2 | `chmod 600` local deploy profiles before `source`. | `/tmp/judgekit-local/deploy-docker.sh:150-168` defines `secure_local_env_profile` + `source_local_env_profile` and sources `.env.deploy` and `TARGET_ENV_FILE` through them; `/tmp/judgekit-local/tests/unit/infra/deploy-security.test.ts:34-50` asserts ordering. | **Verified** |
| A3 | Remove server-block `client_max_body_size 50M`; keep only in `/api/v1/judge/poll`; add negative regression assertion. | `/tmp/judgekit-local/deploy-docker.sh:1608-1726` has no server-level directive; `location = /api/v1/judge/poll` keeps `50M` at `/tmp/judgekit-local/deploy-docker.sh:1625,1703`; `/tmp/judgekit-local/tests/unit/infra/judge-report-nginx.test.ts:104-107` asserts no stray `50M` outside allowed blocks. | **Verified with drift note** — the generated config also sets `client_max_body_size 50M;` in the catch-all `location /` (see Finding 1). |
| A4 | `oj.worv.ai` negative assertion is inside `if (worvEnv)`. | `/tmp/judgekit-local/tests/unit/infra/deploy-storage-safety.test.ts:66-69,80-81` guard Worv assertions with `if (worvEnv)`. | **Verified** |
| A5 | `autoindex on` changed to `autoindex off` in static-site nginx; regression test added. | `/tmp/judgekit-local/static-site/nginx.conf:45` has `autoindex off;`; `/tmp/judgekit-local/tests/unit/infra/deploy-security.test.ts:57-58` asserts it. | **Verified** |
| A6 | Docker image, source-size, compile/run-command validation moved before `tryRustRunner`; preserve error shapes; regression test added. | `/tmp/judgekit-local/src/lib/compiler/execute.ts:741-803` runs all four validations before `/tmp/judgekit-local/src/lib/compiler/execute.ts:806`; error strings match the plan; `/tmp/judgekit-local/tests/unit/compiler/execute.test.ts:90-165` covers invalid-command paths. | **Verified** |
| A7 | `X-Real-IP` accepted only when `X-Forwarded-For` is absent; updated tests. | `/tmp/judgekit-local/src/lib/security/ip.ts:145-199` checks XFF first and returns `null` on too-short XFF even with `X-Real-IP`; `/tmp/judgekit-local/tests/unit/security/ip.test.ts:68-103` covers the new behavior. | **Verified** |
| A8 | Code-scoped contest-join rate limit on failed redemption; 429 path tested. | `/tmp/judgekit-local/src/app/api/v1/contests/join/route.ts:24-40` consumes `contest:join`, `contest:join:invalid`, and `contest:join:invalid-code`; `/tmp/judgekit-local/tests/unit/api/contests.route.test.ts:249-329` tests 429 paths. | **Verified** |
| A9 | Similarity-check capability aligned; announcements/clarifications/exam-extension remain instructor-gated by design. | `/tmp/judgekit-local/src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24` requires `anti_cheat.run_similarity` plus group-TA/assignment; `/tmp/judgekit-local/tests/unit/api/similarity-check.route.test.ts:169-190` covers it. No `contests.manage_announcements` or `contests.manage_clarifications` capability exists in the codebase. | **Verified as documented design choice** |
| A10 | Deploy script has DockerRootDir-aware storage preflight and no destructive volume prune. | `/tmp/judgekit-local/deploy-docker.sh:546` checks `DockerRootDir`; no `docker system prune --volumes` or `docker volume prune`; `/tmp/judgekit-local/tests/unit/infra/deploy-storage-safety.test.ts:38-39,127-128` asserts the allowed cleanup strings and DockerRootDir check. | **Verified** |
| A11 | Remove `Reset SQLite database` from CI e2e job. | `/tmp/judgekit-local/.github/workflows/ci.yml:296-314` has no SQLite reset; `DATABASE_URL` defaults to Postgres in `/tmp/judgekit-local/playwright.config.ts:12` and `/tmp/judgekit-local/scripts/playwright-local-webserver.sh:12`. | **Verified** |
| B1 | Non-root workspace cleanup fallback via privileged Docker container in Node and Rust. | `/tmp/judgekit-local/src/lib/compiler/execute.ts:365-427` defines `cleanupWorkspaceWithDocker` and calls it from `cleanupCompilerWorkspace` when non-root `rm` fails; `/tmp/judgekit-local/judge-worker-rs/src/workspace.rs:43-77` defines `cleanup_with_docker` and `/tmp/judgekit-local/judge-worker-rs/src/workspace.rs:96-113` invokes it from `Drop` when non-root `remove_dir_all` fails. | **Verified with functional note** — the helper deletes the tree as root, but does not `chown -R <app_uid>` first as the plan text described; root deletion is equivalent, but the comment at `/tmp/judgekit-local/src/lib/compiler/execute.ts:360-364` is slightly stale. |
| B2 | Database import boolean coercion maps `"false"`, `"0"`, `"no"`, `"off"` to `false`. | `/tmp/judgekit-local/src/lib/db/import.ts:86-99` implements the mapper; `/tmp/judgekit-local/tests/unit/db/import-implementation.test.ts:58-94` covers true/false round-trips and non-boolean preservation. | **Verified** |
| B3 | `GET /api/v1/files` has IP-keyed config rate limit plus user-keyed `consumeUserApiRateLimit` after auth. | `/tmp/judgekit-local/src/app/api/v1/files/route.ts:156-168` sets `rateLimit: "files:list"` and calls `consumeUserApiRateLimit(req, user.id, "files:list")` after capability checks; `/tmp/judgekit-local/tests/unit/api/files.route.test.ts:100-174` tests the user-keyed limit. | **Verified** |
| B4 | `preRestoreSnapshotPath` removed from admin restore/import JSON responses; snapshot ID returned; full path kept in server logs/audit. | `/tmp/judgekit-local/src/app/api/v1/admin/restore/route.ts:166-172,203-211,234-241` returns `snapshotId` and keeps the path only inside `recordAuditEventDurable` details; `/tmp/judgekit-local/src/app/api/v1/admin/migrate/import/route.ts:112-143,232-238,266-273` does the same; `/tmp/judgekit-local/src/lib/db/pre-restore-snapshot.ts:57-61` derives `snapshotId` from the filename; `/tmp/judgekit-local/tests/unit/api/admin-backup-security.route.test.ts:455-496,535-578,621-654` asserts the path is absent from JSON. | **Verified** |
| B5 | Raw SQL `secret_token` backfill/drop block guarded by `ALLOW_SECRET_TOKEN_BACKFILL=1`; skipped by default with warning; infra test added. | `/tmp/judgekit-local/deploy-docker.sh:1246-1312` wraps the block behind `ALLOW_SECRET_TOKEN_BACKFILL`; `/tmp/judgekit-local/deploy-docker.sh:1251` defaults the variable; `/tmp/judgekit-local/tests/unit/infra/deploy-security.test.ts:337-365` asserts the guard pattern. | **Verified with note** — the destructive SQL is still present in the deploy script; it is only disabled by default. The sunset criterion remains 2026-10-26. |

## Discrepancies / findings

### 1. Generated nginx catch-all `location /` sets 50M, but committed standalone template still sets 1m

- **Severity:** HIGH  
- **Confidence:** High  
- **Files / lines:**
  - `/tmp/judgekit-local/deploy-docker.sh:1647-1648`, `/tmp/judgekit-local/deploy-docker.sh:1725-1726` — generated catch-all `location /` has `client_max_body_size 50M;`
  - `/tmp/judgekit-local/scripts/online-judge.nginx.conf:94-95` — committed template catch-all `location /` still has `client_max_body_size 1m;`
  - `/tmp/judgekit-local/tests/unit/infra/judge-report-nginx.test.ts:97-122` — checks the generated script and the judge poll/judge-prefix blocks in the committed template, but does **not** assert the catch-all `location /` body limit in the committed template.
- **Claimed behavior:** Plan A3 says preserve `50M` only in `/api/v1/judge/poll`; the aggregate (C3-020) says uploads/restore >1 MiB are rejected by the committed standalone template.
- **Actual behavior:** The generated production config now allows 50M in `location /`, which fixes the upload/restore break. The committed standalone template (`scripts/online-judge.nginx.conf`) still caps the catch-all at 1m.
- **Concrete failure scenario:** An operator or CI path that deploys from the committed template without running `deploy-docker.sh` will reject file uploads, admin restore, and admin import payloads larger than 1 MiB, even though the app and the generated config support 50M.
- **Suggested fix:** Update `scripts/online-judge.nginx.conf:94` to `client_max_body_size 50M;` and add a regression test that rejects `client_max_body_size 1m;` in any committed catch-all `location /` block.

### 2. Infra/nginx tests verify source substrings, not rendered configs or runtime behavior

- **Severity:** MEDIUM  
- **Confidence:** High  
- **Files / lines:**
  - `/tmp/judgekit-local/tests/unit/infra/judge-report-nginx.test.ts:23-123`
  - `/tmp/judgekit-local/tests/unit/infra/deploy-security.test.ts:279-333`
  - `/tmp/judgekit-local/tests/unit/infra/deploy-storage-safety.test.ts:30-128`
- **Claimed behavior:** Tests assert deployment security and nginx correctness invariants.
- **Actual behavior:** Tests grep for required substrings in shell source and static templates. They would pass if the strings were inside a dead code branch, a comment, or a heredoc that is never emitted.
- **Concrete failure scenario:** A regression that accidentally emits the legacy `listen ... http2` syntax on nginx 1.25+ would not be caught unless the test rendered the config for the detected mode. The Finding 1 drift above is exactly this class of gap.
- **Suggested fix:** Add a dry-run render of the nginx template (e.g., run `deploy-docker.sh` with `DRY_RUN=1` and a mocked version string) and assert the emitted directives with `nginx -t` where possible.

### 3. Workspace cleanup regression tests do not exercise the non-root Docker fallback

- **Severity:** MEDIUM  
- **Confidence:** High  
- **Files / lines:**
  - `/tmp/judgekit-local/tests/unit/compiler/execute.test.ts:225-301`
  - `/tmp/judgekit-local/judge-worker-rs/src/workspace.rs:119-255`
- **Claimed behavior:** B1 added non-root fallback cleanup so sandbox-owned workspaces do not leak in production.
- **Actual behavior:**
  - The TypeScript `sandbox-owned workspace tree` test at `/tmp/judgekit-local/tests/unit/compiler/execute.test.ts:228-232` is skipped unless the test runner is root.
  - The TypeScript `non-root workspace cleanup` test at `/tmp/judgekit-local/tests/unit/compiler/execute.test.ts:271-275` only creates files owned by the test runner, so it does not reach the `cleanupWorkspaceWithDocker` fallback.
  - The Rust `sandbox_owned_workspace_is_cleaned_up` test at `/tmp/judgekit-local/judge-worker-rs/src/workspace.rs:143-147` is also skipped unless root.
  - The Rust `docker_cleanup_helper_removes_workspace` test at `/tmp/judgekit-local/judge-worker-rs/src/workspace.rs:238-243` exercises `cleanup_with_docker` directly but only when a working Docker socket that can reach `/tmp` is available.
- **Concrete failure scenario:** A bug in the non-root fallback path (e.g., wrong volume mount path, Docker not reachable, UID mismatch) will not be caught in normal CI or developer runs, so production workspace leaks can still regress.
- **Suggested fix:** Add a non-root test that chowns files to uid 65534 and asserts the Docker fallback removes them, gated on Docker availability rather than root.

### 4. `AUTH_TRUST_HOST=true` and open judge IP allowlist remain production defaults

- **Severity:** HIGH  
- **Confidence:** High  
- **Files / lines:**
  - `/tmp/judgekit-local/deploy-docker.sh:750,878,952` — generates/enforces `AUTH_TRUST_HOST=true`
  - `/tmp/judgekit-local/docker-compose.production.yml:115` — `AUTH_TRUST_HOST=${AUTH_TRUST_HOST:-true}`
  - `/tmp/judgekit-local/.env.production:4` and `/tmp/judgekit-local/.env.production.example:9` — default `AUTH_TRUST_HOST=true`
  - `/tmp/judgekit-local/.env.production.example:89-93` — `JUDGE_ALLOWED_IPS` and `JUDGE_STRICT_IP_ALLOWLIST` are commented out
  - `/tmp/judgekit-local/src/lib/judge/ip-allowlist.ts:17-25` — `isJudgeIpAllowed` returns `true` for every IP when the allowlist is unset and strict mode is off
- **Claimed behavior:** Cycle plan design notes say these defaults are intentional for reverse-proxy/backward-compatibility reasons.
- **Actual behavior:** The defaults are unchanged. New production deployments trust arbitrary `Host`/`X-Forwarded-Host` headers and accept judge API registrations from any IP.
- **Concrete failure scenario:** A leaked `JUDGE_AUTH_TOKEN` lets any internet host register a worker and claim submissions. A direct request with `Host: attacker.com` can cause Auth.js to generate callbacks/password-reset links for an attacker-controlled domain.
- **Suggested fix:** This is a policy choice, but the verifier note is that the "hardened" cycle leaves the two highest-risk production defaults untouched. If the posture is intentional, document it as an accepted risk in the deployment runbook.

### 5. Judge-container DNS hardening documented in `AGENTS.md` is not implemented

- **Severity:** MEDIUM  
- **Confidence:** High  
- **Files / lines:**
  - `/tmp/judgekit-local/AGENTS.md:314` — "Judge containers use Cloudflare DNS (1.1.1.1). `/etc/resolv.conf` is locked with `chattr +i`"
  - `/tmp/judgekit-local/judge-worker-rs/src/docker.rs:330-373` — Docker arg construction has no `--dns` argument
  - `/tmp/judgekit-local/src/lib/compiler/execute.ts:350-394` — local fallback Docker arg construction has no `--dns` argument
  - `/tmp/judgekit-local/docker/Dockerfile*`, `/tmp/judgekit-local/docker-compose.production.yml` — no DNS override or `chattr +i` logic
- **Claimed behavior:** Judge containers are forced to 1.1.1.1 with an immutable `resolv.conf`.
- **Actual behavior:** No code or compose file sets a custom DNS server or locks `resolv.conf`. Containers inherit the host/Docker daemon resolver.
- **Concrete failure scenario:** A sandboxed submission that rewrites `/etc/resolv.conf` or an upstream resolver change can alter name resolution behavior in judge containers.
- **Suggested fix:** Add `--dns 1.1.1.1` to the Docker run args in both runners, or remove the claim from `AGENTS.md`.

### 6. `docs/api.md` still shows a simplified similarity-check response

- **Severity:** LOW  
- **Confidence:** High  
- **Files / lines:**
  - `/tmp/judgekit-local/docs/api.md:1089-1097` — documents `{ "data": { "flaggedPairs": 5 } }`
  - `/tmp/judgekit-local/src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:57-64` — returns `status`, `reason`, `flaggedPairs`, `submissionCount`, `maxSupportedSubmissions`, `pairs`
  - `/tmp/judgekit-local/src/lib/assignments/code-similarity.ts:245-252` — `SimilarityRunResult` includes the same richer fields
- **Claimed behavior:** API docs match the response shape.
- **Actual behavior:** Docs omit `status`, `reason`, `pairs`, `submissionCount`, and `maxSupportedSubmissions`, plus the `user1Name`/`user2Name` enrichment.
- **Concrete failure scenario:** A client built against the documented contract may ignore `status: "timed_out"` or `status: "not_run"` and mishandle partial results.
- **Suggested fix:** Update `/tmp/judgekit-local/docs/api.md:1089-1097` to show the full response schema.

### 7. Many referenced env vars remain undocumented in `.env.example`

- **Severity:** MEDIUM  
- **Confidence:** High  
- **Files / lines:**
  - `/tmp/judgekit-local/.env.example` — documents 53 variables
  - Source scan of `/tmp/judgekit-local/src/` — 67 distinct `process.env.*` names
- **Claimed behavior:** `.env.example` is the canonical reference for available environment variables (`AGENTS.md:556-567`).
- **Actual behavior:** At least the following runtime variables are referenced in `/tmp/judgekit-local/src/` but absent from `.env.example`: `ALLOW_JSON_IMPORT_PASSWORD`, `APP_VERSION`, `AUTH_CACHE_TTL_MS`, `AWS_ACCESS_KEY_ID`, `AWS_REGION`, `AWS_SECRET_ACCESS_KEY`, `CODE_SIMILARITY_AUTH_TOKEN`, `COMPILER_RUNNER_URL`, `COMPILER_WORKSPACE_DIR`, `CRON_SECRET`, `DATA_DIR`, `DATA_RETENTION_LEGAL_HOLD`, `DATABASE_PATH`, `DATABASE_POOL_APP_NAME`, `DISABLE_COMPILER_LOCAL_FALLBACK`, `ENABLE_COMPILER_LOCAL_FALLBACK`, `ENABLE_CRON_CLEANUP`, `JUDGE_WORKER_URL`, `JUDGEKIT_ALLOW_LOCAL_DOCKER_ADMIN`, `LOG_LEVEL`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NODE_ENCRYPTION_KEY_PREVIOUS`, `PLAYWRIGHT_AUTH_TOKEN`, `PRIVACY_CONTACT_EMAIL`, `RATE_LIMITER_AUTH_TOKEN`, `RATE_LIMITER_URL`, `REALTIME_COORDINATION_BACKEND`, `REALTIME_SINGLE_INSTANCE_ACK`, `RESEND_API_KEY`, `RESEND_FROM`, `RUNNER_AUTH_DISABLED`, `RUNNER_AUTH_TOKEN`, `SENDGRID_API_KEY`, `SENDGRID_FROM`, `SES_FROM`, `SKIP_INSTRUMENTATION_SYNC`, `SMTP_FROM`, `SMTP_HOST`, `SMTP_PASS`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_SKIP_TLS_VERIFY`, `SMTP_USER`, `WEB_CONCURRENCY`.
- **Concrete failure scenario:** Operators cannot discover required variables from `.env.example`. For example, missing `RUNNER_AUTH_TOKEN` or `CODE_SIMILARITY_AUTH_TOKEN` documentation can leave inter-service auth misconfigured.
- **Suggested fix:** Audit all `process.env` references and add documented entries (with defaults, required/optional status, and descriptions) to `.env.example`.

### 8. `deploy-docker.sh` still contains the raw `secret_token` backfill/drop SQL

- **Severity:** MEDIUM  
- **Confidence:** High  
- **Files / lines:**
  - `/tmp/judgekit-local/deploy-docker.sh:1208-1312`
- **Claimed behavior:** B5 guards the block with `ALLOW_SECRET_TOKEN_BACKFILL=1` and skips it by default.
- **Actual behavior:** The guard works as claimed (`/tmp/judgekit-local/deploy-docker.sh:1253,1303`), but the raw `UPDATE ... SET secret_token_hash = encode(sha256(secret_token::bytea), 'hex') ...` and `ALTER TABLE ... DROP COLUMN IF EXISTS secret_token` SQL is still shipped in the deploy script.
- **Concrete failure scenario:** An operator who sets `ALLOW_SECRET_TOKEN_BACKFILL=1` on a host where the column was already partially migrated could still trigger the destructive DDL path outside the Drizzle journal. The verifier concurs with the aggregate note that the block is present; it is merely disabled by default.
- **Suggested fix:** Track the 2026-10-26 sunset date and remove the block once all environments are verified column-free.

### 9. `scripts/online-judge.nginx.conf` is drifted from the generated production config

- **Severity:** MEDIUM  
- **Confidence:** High  
- **Files / lines:**
  - `/tmp/judgekit-local/scripts/online-judge.nginx.conf:50-56` — uses `X-Frame-Options DENY` and includes `Permissions-Policy`
  - `/tmp/judgekit-local/deploy-docker.sh:1601-1606` — uses `X-Frame-Options SAMEORIGIN` and omits `Permissions-Policy`
- **Claimed behavior:** Committed templates and generated config should stay aligned.
- **Actual behavior:** The generated HTTPS server uses `SAMEORIGIN` and does not emit `Permissions-Policy`, while the committed template uses `DENY` and emits `Permissions-Policy`.
- **Concrete failure scenario:** The static template and the production config expose different security header postures; an operator switching between them may unexpectedly relax or tighten framing/policy headers.
- **Suggested fix:** Reconcile the header sets and add a test that diffs the generated config (dry-run) against the committed template for the same server block.

## Verified matches (selected)

- **HTTP/2 syntax modernization** — generated config chooses modern/legacy based on remote version; static templates use `http2 on;`.
- **Local deploy profile permission hardening** — `secure_local_env_profile` chmods before sourcing.
- **Compiler validation order** — Docker image, source size, compile/run command validated before Rust runner.
- **IP extraction** — XFF-first with hop validation; X-Real-IP used only when XFF absent.
- **Contest join rate limits** — per-user and per-code failure buckets consumed on invalid access-code attempts.
- **Similarity-check capability guard** — `anti_cheat.run_similarity` + group TA/assignment check.
- **Static-site security headers and autoindex** — headers present; `autoindex off`.
- **Boolean import coercion** — `"false"`, `"0"`, `"no"`, `"off"` map to `false`.
- **Admin restore/import snapshot IDs** — `preRestoreSnapshotPath` no longer returned in JSON.
- **`GET /api/v1/files` rate limit** — config-level IP limit plus user-keyed limit after auth.
- **CI E2E SQLite cleanup removal** — no SQLite reset step; Postgres used throughout.
- **Phase-specific PID limits** — `Compile = 128`, `Run = 64` in Rust worker and Node fallback.
- **`roc` language consistency** — present in TypeScript `Language` union, `src/lib/judge/languages.ts`, and Rust worker.
- **Leading-zero IPv4 rejection** — consistent between `src/lib/security/ip.ts` and `src/lib/judge/ip-allowlist.ts`.

## Still-open items from the prior verifier review

The following were identified in the previous verifier review and remain unchanged in this working tree:

1. **Judge-container DNS hardening** — `AGENTS.md:314` claim is not implemented (Finding 5).
2. **Similarity-check API documentation** — `/tmp/judgekit-local/docs/api.md:1089-1097` is still simplified (Finding 6).
3. **Deployment tests are source-grep based** — no rendered-config validation (Finding 2).
4. **Missing env vars in `.env.example`** — gap persists (Finding 7).

## Final sweep notes

- The `secret_token` backfill block is correctly gated but still present; the verifier concurs with `_aggregate.md` that this is an active finding, not a removed one.
- The generated nginx config now preserves the XFF chain and allows 50M uploads in `location /`, but the committed standalone template does not, creating operator-facing drift.
- The two highest-risk production defaults (`AUTH_TRUST_HOST=true`, open judge IP allowlist) are unchanged and documented as intentional design choices.
- Workspace cleanup has the correct non-root fallback logic, but the regression tests skip the path that actually matters in production.
- No additional unimplemented features or doc/comment lies were found in the scanned areas beyond the findings listed above.

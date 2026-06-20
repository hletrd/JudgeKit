# Security Review - Cycle 2

Date: 2026-06-20
Role: security-reviewer
Scope: full repository static review, including uncommitted changes visible in the worktree. No fixes were implemented and no existing changes were reverted.

## Inventory Reviewed

- Authentication, session, CSRF, and host trust: `src/lib/auth/config.ts`, `src/lib/auth/trusted-host.ts`, `src/lib/security/env.ts`, `src/lib/security/csrf.ts`, `src/lib/api/handler.ts`, `src/app/api/auth/[...nextauth]/route.ts`, password-reset and verification routes.
- Authorization-sensitive API routes: `src/app/api/v1/admin/**`, `src/app/api/v1/judge/**`, `src/app/api/v1/compiler/run/route.ts`, `src/app/api/v1/playground/run/route.ts`, file APIs, contest anti-cheat APIs, metrics and cleanup endpoints.
- Judge worker and sandbox: `judge-worker-rs/src/config.rs`, `api.rs`, `executor.rs`, `docker.rs`, `runner.rs`, `validation.rs`, `types.rs`, Docker compose files, judge Dockerfiles, seccomp profile references.
- Backup, restore, import/export, file storage: `src/lib/db/export.ts`, `src/lib/db/import.ts`, `src/lib/db/export-with-files.ts`, `src/lib/db/pre-restore-snapshot.ts`, `src/lib/files/**`, restore/migrate/backup routes.
- Secrets and data retention: `src/lib/security/secrets.ts`, plugin secret handling, API-key handling, deployment env generation, `.dockerignore`, `.env.example`, deployment scripts.
- Deployment and data-loss controls: `deploy-docker.sh`, `deploy.sh`, `scripts/pg-volume-safety-check.sh`, `scripts/docker-disk-cleanup.sh`, compose files, `AGENTS.md`, `CLAUDE.md`, `SECURITY.md`.
- Supply chain: `npm audit --audit-level=high --omit=dev`, `cargo audit --file judge-worker-rs/Cargo.lock`, package and cargo lockfiles.

## Findings

### SEC2-1 - Production auth-host allowlist is bypassed by the default `AUTH_TRUST_HOST=true`

- Severity: High
- Confidence: High
- Status: confirmed issue
- Location: `src/lib/security/env.ts:186-192`, `src/lib/auth/trusted-host.ts:23-25`, `src/lib/auth/config.ts:347`, `src/app/api/auth/[...nextauth]/route.ts:5-22`, `docker-compose.production.yml:99-105`, `Dockerfile:55-57`
- Evidence: `shouldTrustAuthHost()` returns true in production when `AUTH_TRUST_HOST=true`; `validateTrustedAuthHost()` immediately returns success when that happens. Production compose defaults `AUTH_TRUST_HOST=${AUTH_TRUST_HOST:-true}`, and the runner image also sets `AUTH_TRUST_HOST=true`.
- Failure scenario: an edge proxy or direct internal caller forwards a spoofed `Host` / `X-Forwarded-Host` to `/api/auth/*`. The route wrapper exists, but the default trust flag disables its configured `AUTH_URL` / `allowedHosts` enforcement. This weakens defense against host-header poisoning and auth callback abuse in exactly the route family where host handling matters most.
- Suggested fix: separate Auth.js `trustHost` from JudgeKit's own allowed-host check. Keep `trustHost` only for the framework/proxy requirement, and always run `getTrustedAuthHosts()` validation in production. Default production compose to a safe value or add a distinct env var such as `AUTHJS_TRUST_PROXY_HOST`.

### SEC2-2 - Dedicated workers only warn on non-local HTTP control-plane URLs

- Severity: High
- Confidence: High
- Status: confirmed issue
- Location: `judge-worker-rs/src/config.rs:113-126`, `judge-worker-rs/src/api.rs:69-76`, `judge-worker-rs/src/api.rs:106-113`, `judge-worker-rs/src/api.rs:162-169`, `judge-worker-rs/src/api.rs:199-241`, `src/app/api/v1/judge/claim/route.ts:388-401`, `docker-compose.worker.yml:10-12`
- Evidence: the worker logs a warning when claim/report URLs use `http://` on a non-localhost address, then continues. The API client sends bearer auth, worker secret material, claim tokens, source code, compile output, and test-case payloads over those URLs.
- Failure scenario: a remote worker is configured with `JUDGE_BASE_URL=http://app.example.com/api/v1` during a production incident. Anyone on the network path can observe or tamper with `Authorization` headers, worker secrets, hidden tests, source code, claim tokens, and result reports.
- Suggested fix: fail startup in production for non-local HTTP unless an explicit emergency/development override such as `JUDGE_ALLOW_INSECURE_HTTP=1` is set and loudly logged. Document the override as temporary and unsafe.

### SEC2-3 - Runner/admin endpoints can still share the judge submission token

- Severity: High
- Confidence: High
- Status: confirmed issue
- Location: `judge-worker-rs/src/config.rs:142-180`, `judge-worker-rs/src/runner.rs:355-368`, `judge-worker-rs/src/runner.rs:919-928`, `docker-compose.worker.yml:55-58`, `docker-compose.worker.yml:77-80`
- Evidence: when `RUNNER_AUTH_TOKEN` is absent, the worker logs a warning and reuses `JUDGE_AUTH_TOKEN` as `runner_auth_token`. The same runner router exposes `/run`, Docker image list/inspect/pull/remove/build, and disk-usage endpoints. Dedicated compose renders `RUNNER_AUTH_TOKEN=${RUNNER_AUTH_TOKEN:-}`, which turns a missing compose env into an empty env and crash-loops, but direct binary launches and other deployment wrappers still hit the fallback path.
- Failure scenario: a leaked or over-broad `JUDGE_AUTH_TOKEN`, intended only for submission claim/report, also authorizes Docker-management APIs on a worker started outside the compose-empty-env path. The token blast radius expands from "judge queue API" to "execute code and manage local judge images".
- Suggested fix: remove the fallback in production. Require a distinct `RUNNER_AUTH_TOKEN` whenever the HTTP runner is enabled, update compose to `${RUNNER_AUTH_TOKEN:?}`, and keep any shared-token fallback behind an explicit local-development override.

### SEC2-4 - Sanitized exports include plaintext plugin provider secrets

- Severity: High
- Confidence: High
- Status: confirmed issue
- Location: `src/lib/plugins/secrets.ts:52-67`, `src/lib/plugins/secrets.ts:154-210`, `src/lib/db/schema.pg.ts:859-866`, `src/lib/db/export.ts:187-196`, `src/lib/security/secrets.ts:21-41`
- Evidence: plugin secret policy says new writes are stored verbatim/plaintext. The `plugins.config` JSONB table is included in every database export, but the export redaction maps only redact named table columns and do not include `plugins.config` or JSON subfields.
- Failure scenario: an admin downloads a "sanitized" portable export for support or migration. The JSON still contains plugin API keys such as chat-provider keys because they are nested in `plugins.config`, not column-level fields in `EXPORT_SANITIZED_COLUMNS`.
- Suggested fix: add structured export redaction for `plugins.config`, using each plugin definition's `secretConfigKeys` to redact nested fields. Consider also re-encrypting plugin secrets at rest; if plaintext storage remains a policy decision, sanitized exports still need to remove them.

### SEC2-5 - Pre-restore snapshots are documented as full-fidelity but are redacted and can be unrestorable

- Severity: High
- Confidence: High
- Status: confirmed data-loss issue
- Location: `SECURITY.md:52-73`, `src/lib/db/pre-restore-snapshot.ts:30-39`, `src/lib/db/pre-restore-snapshot.ts:84-90`, `src/lib/db/export.ts:103-105`, `src/lib/security/secrets.ts:31-41`, `src/lib/db/schema.pg.ts:65-70`, `src/lib/db/import.ts:185-204`
- Evidence: the snapshot code calls `streamDatabaseExport({ sanitize: false })`, and the docs promise full-fidelity rollback material. The exporter still applies `EXPORT_ALWAYS_REDACT_COLUMNS` when `sanitize` is false, nulling fields such as `sessions.sessionToken`. `sessions.sessionToken` is a primary key, and import maps row values directly into inserts.
- Failure scenario: an admin starts a destructive restore, relies on the pre-restore snapshot as the rollback artifact, then discovers it either fails to import due null primary-key session tokens or restores with missing passwords/API secrets/settings. The operator loses the rollback fidelity the security policy promises.
- Suggested fix: introduce a local-only snapshot mode that truly skips all export redaction and stores the file with strict permissions, or update policy/UI to state these are partial snapshots and cannot restore auth/secrets. Prefer encrypted local snapshots if full-fidelity secrets are retained.

### SEC2-6 - ZIP restore writes uploaded files before DB validation and DB import success

- Severity: High
- Confidence: High
- Status: confirmed data-loss issue
- Location: `src/app/api/v1/admin/restore/route.ts:81-99`, `src/app/api/v1/admin/restore/route.ts:119-130`, `src/app/api/v1/admin/restore/route.ts:158-166`, `src/lib/db/export-with-files.ts:255-292`, `src/lib/files/storage.ts:27-30`
- Evidence: the restore route calls `restoreFilesFromZip(zipBuffer)` before `validateExport(data)`, before `isSanitizedExport(data)`, and before `importDatabase(data)`. `restoreFilesFromZip()` writes each upload to the live upload directory during extraction.
- Failure scenario: an admin uploads a corrupt or wrong-environment backup ZIP. File contents are overwritten in `data/uploads` first, then DB validation or import fails and returns an error. The database transaction rolls back, but file changes do not, leaving DB rows pointing at overwritten or inconsistent files. The pre-restore snapshot only covers the DB.
- Suggested fix: parse and validate `database.json` before touching uploads; extract uploads into a staging directory; validate manifest, entry names, and sizes; run DB import; then atomically swap or copy staged uploads after import success. Snapshot or roll back uploads on failure.

### SEC2-7 - Backup/restore ZIP handling buffers full archives and lacks restore-side decompressed-size limits

- Severity: Medium
- Confidence: High
- Status: confirmed DoS risk
- Location: `src/app/api/v1/admin/restore/route.ts:68-87`, `src/lib/db/export-with-files.ts:123-210`, `src/lib/db/export-with-files.ts:219-235`, `src/lib/db/export-with-files.ts:266-291`, `src/lib/files/validation.ts:57-113`, `src/app/api/v1/files/route.ts:40-59`
- Evidence: normal uploads use `validateZipDecompressedSize()`, but backup restore loads the uploaded ZIP, `database.json`, manifest, and each upload entry into memory without an equivalent total/per-entry decompressed cap. Backup generation also buffers the whole DB JSON, each upload file, and the generated ZIP blob before returning a stream.
- Failure scenario: a compromised admin account or accidental oversized backup uploads a small ZIP that expands to very large `database.json` or upload entries. The Next.js process allocates large buffers and can OOM or stall, causing availability loss during an already-sensitive restore operation.
- Suggested fix: apply the same decompressed-size and entry-count validation to restore ZIPs before entry extraction. Add per-entry and total backup limits, stream ZIP creation/extraction where feasible, and reject archives whose manifest sizes exceed policy before decompression.

### SEC2-8 - Worker workspaces still fall back to world-writable/readable permissions

- Severity: Medium
- Confidence: High
- Status: confirmed issue
- Location: `judge-worker-rs/src/executor.rs:306-328`, `judge-worker-rs/src/executor.rs:378-382`, `judge-worker-rs/src/runner.rs:755-788`, `judge-worker-rs/src/docker.rs:272-313`
- Evidence: the main executor now tries to chown the workspace to uid/gid `65534` and use `0700`, but if chown fails it falls back to `0777`. It then sets source files to `0666`. The runner path always sets workspaces to `0777` and source files to `0666`. Docker containers run with `--user 65534:65534` and bind the workspace into `/workspace`.
- Failure scenario: on a shared worker host, rootless Docker setup, or development host where chown fails, in-flight submission source and build artifacts become readable/writable by other local users or compromised same-host processes for the lifetime of the temp directory. A malicious process can read source or modify artifacts before execution.
- Suggested fix: fail closed in production if safe ownership cannot be established, or create workspaces under a host path already owned by the runtime uid. Reuse the hardened workspace-preparation path in the HTTP runner, and avoid `0666` when `0640`/`0600` plus correct directory ownership is sufficient.

### SEC2-9 - Docker socket proxy image is mutable `latest` at a privileged boundary

- Severity: Medium
- Confidence: Medium
- Status: confirmed risk
- Location: `docker-compose.production.yml:63-85`, `docker-compose.worker.yml:18-43`, `docker-compose.test-backends.yml:59-74`
- Evidence: all compose files use `tecnativa/docker-socket-proxy:latest` for the only service with direct Docker socket access. The proxy is intentionally configured with container/image POST/DELETE-style capabilities needed by the worker.
- Failure scenario: a future upstream `latest` tag changes behavior, introduces a vulnerability, or relaxes request filtering. A normal deploy pulls the changed proxy image into the host Docker-control boundary without a reviewed dependency update.
- Suggested fix: pin the proxy image by immutable digest or a tested version tag, scan it as part of dependency updates, and update deliberately through a reviewed change.

### SEC2-10 - Docker image validation is inconsistent and the Rust trusted-registry check is prefix-spoofable

- Severity: Medium
- Confidence: High
- Status: confirmed issue
- Location: `src/app/api/v1/admin/languages/route.ts:11-20`, `src/app/api/v1/admin/languages/route.ts:64-78`, `src/app/api/v1/admin/languages/[language]/route.ts:11-18`, `src/app/api/v1/admin/languages/[language]/route.ts:46-57`, `src/lib/actions/language-configs.ts:17-25`, `src/lib/actions/language-configs.ts:109-119`, `src/lib/judge/docker-image-validation.ts:1-51`, `judge-worker-rs/src/validation.rs:1-49`, `judge-worker-rs/src/executor.rs:222-238`, `src/lib/compiler/execute.ts:654-662`
- Evidence: API and server-action language write paths accept broad Docker image strings and do not call the central `isAllowedJudgeDockerImage()` validator. Later execution paths validate differently: the TypeScript runtime has trusted-registry boundary checks, while Rust accepts any image that `starts_with(prefix)` for `TRUSTED_DOCKER_REGISTRIES`.
- Failure scenario: with `TRUSTED_DOCKER_REGISTRIES=registry.example.com`, a malicious or compromised admin/import can store `registry.example.com.evil/judge-python:latest`. The Rust validator treats it as trusted because it starts with the prefix, then runs an attacker-controlled image in the judge sandbox. Even where the runtime rejects the image, the inconsistent validation lets bad config persist and break judging.
- Suggested fix: centralize the exact same image validator at all DB write boundaries and in both runtimes. In Rust, enforce a delimiter boundary after trusted prefixes, matching the TypeScript `isTrustedRegistryImage()` logic.

### SEC2-11 - Worker lockfile contains vulnerable Rust TLS verification dependencies

- Severity: High
- Confidence: High
- Status: confirmed supply-chain issue
- Location: `judge-worker-rs/Cargo.toml:6-8`, `judge-worker-rs/Cargo.lock:848-883`, `judge-worker-rs/Cargo.lock:918-950`, `.github/workflows/ci.yml:125-129`
- Evidence: `cargo audit --file judge-worker-rs/Cargo.lock` reports four vulnerabilities in `rustls-webpki 0.103.9`: RUSTSEC-2026-0104, RUSTSEC-2026-0098, RUSTSEC-2026-0099, and RUSTSEC-2026-0049. The vulnerable dependency is pulled through `reqwest 0.12.28` and `rustls 0.23.37`.
- Failure scenario: a remote worker connecting to the app over HTTPS relies on this TLS stack for certificate validation. The advisories include name-constraints and CRL validation issues plus a reachable panic. That weakens the confidentiality/integrity of the worker control plane and can cause worker availability failures.
- Suggested fix: update `reqwest`/`rustls`/`rustls-webpki` so `rustls-webpki >=0.103.13` or another fixed range is selected. Audit every production lockfile or consolidate to the workspace lockfile so `cargo audit` cannot miss stale per-crate lockfiles.

### SEC2-12 - Docker image delete/prune failures are not consistently audit logged

- Severity: Low
- Confidence: Medium
- Status: confirmed auditability gap
- Location: `src/app/api/v1/admin/docker/images/route.ts:129-165`, `src/app/api/v1/admin/docker/images/prune/route.ts:48-66`
- Evidence: image delete logs rejected requests and successful removals, but a failed `removeDockerImage()` returns 500 without an audit event. The prune endpoint logs only when at least one image was removed; partial errors or no-op prune attempts are returned to the caller but not preserved in the audit log.
- Failure scenario: an operator investigates image-management misuse and sees successful removals but not failed attempts or partial failures. That hides repeated probing of image tags or failed destructive operations.
- Suggested fix: record audit events for remove failures, prune no-ops, and prune partial failures with sanitized error categories and counts.

## Audit Observations

- `npm audit --audit-level=high --omit=dev` exits successfully for high severity, but currently reports two moderate advisories for `next`'s nested `postcss 8.4.31` (`package-lock.json:10414-10435`). The forced npm fix proposes a breaking Next downgrade, so this should be tracked as a warning until a safe Next/PostCSS update is available or the vulnerable stringify path is proven unreachable for untrusted CSS.
- `cargo audit --file judge-worker-rs/Cargo.lock` exits non-zero because of SEC2-11. Root/workspace audit behavior should be clarified because this repo now has both a root workspace lockfile and per-crate lockfiles.

## Positive Controls Verified

- Most API mutation routes use `createApiHandler()`, which authenticates, checks role/capabilities, applies default mutation CSRF, validates bodies with Zod, and rate-limits where configured (`src/lib/api/handler.ts:92-148`).
- CSRF validation requires `X-Requested-With: XMLHttpRequest`, checks `Sec-Fetch-Site`, and compares `Origin` against configured `AUTH_URL` in production (`src/lib/security/csrf.ts:30-73`).
- Password reset and verification links now prefer canonical `AUTH_URL` instead of trusting request host headers (`src/lib/security/env.ts:81-107`, `src/app/api/v1/auth/forgot-password/route.ts:32-36`, `src/app/api/v1/auth/resend-verification/route.ts:35-39`).
- Judge claim/report uses per-worker token hashes when `workerId` is provided and rejects unknown or legacy no-hash workers (`src/lib/judge/auth.ts:52-90`, `src/app/api/v1/judge/claim/route.ts:168-209`).
- The container sandbox run path uses `--network none`, memory limits, pids limits, read-only rootfs, `--cap-drop=ALL`, `no-new-privileges`, non-root uid/gid, and optional seccomp/runtime hardening (`judge-worker-rs/src/docker.rs:272-323`).
- Normal user file uploads validate MIME, magic bytes, configured file size, and ZIP decompressed size before persistence (`src/app/api/v1/files/route.ts:30-59`, `src/lib/files/validation.ts:57-113`).
- File downloads re-check authorization and serve with `nosniff`, `default-src 'none'`, no-store caching, and MIME fallback on magic mismatch (`src/app/api/v1/files/[id]/route.ts:62-135`).
- `.dockerignore` excludes `.env*`, private key extensions, build artifacts, data, backups, and AppleDouble files (`.dockerignore:1-28`). The untracked `.npmrc` observed in this worktree contains only `legacy-peer-deps=true`.
- Deploy disk cleanup paths use dangling-only image prune and avoid `docker system prune --volumes`; `scripts/docker-disk-cleanup.sh` explicitly forbids volume pruning.

## Final Missed-Issues Sweep

- Enumerated `src/app/api/**` route handlers and checked non-`createApiHandler` routes for explicit auth/CSRF/token gates.
- Searched for dangerous HTML rendering. Confirmed markdown components skip raw HTML or sanitize before `dangerouslySetInnerHTML`; JSON-LD uses a safe serializer.
- Searched for shell/Docker execution and checked command validation, image validation, Docker socket boundaries, and worker Docker run arguments.
- Searched for obvious credential patterns outside ignored build directories. Hits were examples, docs, tests, generated static assets, and expected env-var names; no live secret was identified in the reviewable repository files.
- Checked destructive deployment/data-loss commands. Current deploy cleanup avoids volume pruning; `pg-volume-safety-check.sh` destructive steps are gated behind an unsafe-condition detector and backup steps.
- Limitations: this was a static review plus dependency-audit commands. I did not run a live penetration test, fuzz ZIP parsing, execute a restore against a disposable DB, or deploy.

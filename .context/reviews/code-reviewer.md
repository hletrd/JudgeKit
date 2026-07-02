# Code Review — JudgeKit (/tmp/judgekit-local)

**Reviewer:** code-reviewer agent  
**Scope:** Next.js 16 app/API (`src/`), Rust judge worker and sidecars (`judge-worker-rs/`, `code-similarity-rs/`, `rate-limiter-rs/`), Docker images, deployment scripts, static-site nginx, and unit/integration tests.  
**Date:** 2026-07-02  

---

## Summary

This review concentrated on **code quality, logic correctness, maintainability, type safety, error handling, and invariant violations** across the whole repository. The most severe new findings are:

1. The documented TypeScript quality gate (`npx tsc --noEmit`) currently fails because of a generated Next.js route-type conflict for `/contests/manage`.
2. Both the TypeScript local compiler fallback and the Rust runner sidecar leak temporary workspaces after `chown`ing them to the sandbox uid, because the cleanup path cannot remove files owned by `nobody`.
3. Token revocation has a one-second grace window due to second-level truncation.
4. Several public auth routes bypass the project's CSRF guard and silently swallow malformed JSON.
5. The test-backends deploy path runs `npx drizzle-kit push` inside the app container, but the production app image does not include `drizzle-kit`.

Several HIGH/MEDIUM issues already tracked in `.context/reviews/_aggregate.md` (nginx XFF chain in `deploy-docker.sh`, judge allowlist defaults, AUTH_TRUST_HOST, docker-compose network segmentation, etc.) are acknowledged and not re-raised here unless they appear in source files outside the aggregate's scope.

**Static checks run:**
- `npx tsc --noEmit` — **fails** (exit 1) due to `.next/types/validator.ts` route constraint error.
- `cargo check` in `judge-worker-rs/` — passes.
- `cargo clippy -- -W clippy::all` in `judge-worker-rs/` — passes.

**Verdict:** REQUEST CHANGES — the type-check gate failure, workspace leaks, and token-revocation race must be fixed before approval.

---

## File Inventory Reviewed

| Area | Path | Approx. Files |
|------|------|---------------|
| Project context | `CLAUDE.md`, `AGENTS.md`, `.context/reviews/_aggregate.md` | 3 |
| Next.js source | `src/lib/**`, `src/app/**`, `src/components/**`, `src/types/**` | ~630 TS/TSX |
| Rust crates | `judge-worker-rs/src/**`, `code-similarity-rs/src/**`, `rate-limiter-rs/src/**` | ~17 |
| Docker / build | `Dockerfile*`, `docker/**`, `docker-compose*.yml` | ~110 |
| Deployment / scripts | `deploy-docker.sh`, `deploy.sh`, `deploy-test-backends.sh`, `scripts/**`, `static-site/**` | ~50 |
| Tests | `tests/unit/**` (focused on core/API/infra) | ~60 reviewed |

The full inventory used by the review is preserved at `/tmp/judgekit-inventory.txt`.

---

## Findings

### HIGH

#### 1. `tsc --noEmit` gate fails on generated Next.js route validator
- **Severity:** HIGH  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **Files:** `src/app/(public)/contests/manage/layout.tsx`, `src/app/(public)/contests/manage/page.tsx`, `.next/types/validator.ts:25`  
- **Problem:** The route has a client layout (`"use client"`) and a server page. Next.js generates `AppPageConfig<"/contests/manage">` while simultaneously classifying `/contests/manage` only as a `LayoutRoute`, so the generated validator cannot satisfy the `Route` constraint `"/"`.  
- **Failure scenario:** `npm run lint` / `npx tsc --noEmit` (the documented quality gate) fails in CI even though `next build` succeeds, blocking merges and forcing developers to bypass the gate.  
- **Fix:** Convert the layout to a server component that renders a client component containing the `useEffect`/`usePathname` logic, or exclude `.next/types` from the standalone `tsc` include and rely on Next.js' own type-check pass. Add a CI regression test that asserts `npx tsc --noEmit` exits 0.

#### 2. Local compiler fallback leaks workspaces after sandbox `chown`
- **Severity:** HIGH  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **Files:** `src/lib/compiler/execute.ts:724-758`, `execute.ts:842-848`, `Dockerfile:108`  
- **Problem:** The local fallback `chown`s the workspace and source file to uid/gid `65534` (`nobody`) with modes `0o700`/`0o600`. The `finally` block then calls `rm(workspaceDir, { recursive: true })` from the Next.js process uid (`nextjs`, uid 1001 in production), which fails with `EACCES`. The caught warning masks the leak.  
- **Failure scenario:** Every local-fallback compile/run leaves a `compiler-*` directory under `/tmp`/`$COMPILER_WORKSPACE_DIR`; over time the app-server disk fills. Leaked workspaces may also contain student source or hidden test data.  
- **Fix:** Re-chown the workspace back to the process uid inside the `finally` block before deleting, or spawn a short-lived privileged cleanup helper. Add a unit test that exercises the full local-fallback lifecycle including cleanup.

#### 3. Rust runner sidecar also leaks temp workspaces after sandbox `chown`
- **Severity:** HIGH  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **Files:** `judge-worker-rs/src/runner.rs:748-766`, `runner.rs:785-796`, `runner.rs:924`  
- **Problem:** `execute_run` creates a `tempfile::TempDir`, then `chown`s it and the source file to `65534:65534` with mode `0o700`/`0o600`. `TempDir::drop` silently ignores cleanup failures, and if the worker process is not root it cannot delete the directory.  
- **Failure scenario:** A dedicated worker judging thousands of submissions per day leaves thousands of `/tmp/.tmp*` directories; disk exhaustion eventually alerts operators, but no operator-visible error is emitted.  
- **Fix:** Explicitly `chown` the workspace back to the worker process uid/gid before the `TempDir` goes out of scope, or run cleanup through a root-privileged container. Log and surface cleanup failures.

#### 4. Token revocation has a one-second grace window
- **Severity:** HIGH  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `src/lib/auth/session-security.ts:33-34`  
- **Problem:** `isTokenInvalidated` compares `authenticatedAtSeconds < Math.floor(tokenInvalidatedAt.getTime() / 1000)`. Both sides are truncated to whole seconds, so a token created in the same wall-clock second as revocation is still considered valid.  
- **Failure scenario:** An admin disables a user at 12:00:00.600. A token issued at 12:00:00.100 has `authenticatedAtSeconds = 0` and revocation also floors to `0`. The comparison `0 < 0` is false, so the revoked session remains usable until it expires or another second elapses.  
- **Fix:** Compare millisecond timestamps. Replace the `invalidatedAtSeconds` intermediate and the comparison with `authenticatedAtSeconds * 1000 <= tokenInvalidatedAt.getTime()`. Add unit tests that revoke a token within the same second it was issued.

#### 5. Public state-changing auth routes bypass the CSRF guard
- **Severity:** HIGH  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **Files:** `src/app/api/v1/auth/forgot-password/route.ts:11`, `src/app/api/v1/auth/reset-password/route.ts:12`, `src/app/api/v1/auth/verify-email/route.ts:10`  
- **Problem:** These `POST` handlers do not use `createApiHandler` and never call `validateCsrf`. The project baseline requires `X-Requested-With`, `Sec-Fetch-Site`, and Origin checks for all state-changing API routes.  
- **Failure scenario:** A malicious site can submit an HTML form to `/api/v1/auth/forgot-password` without JavaScript headers, causing password-reset email spam to arbitrary addresses and consuming the per-email rate-limit budget. The same cross-origin submission works against `/verify-email` and `/reset-password`.  
- **Fix:** Add `const csrf = validateCsrf(req); if (csrf) return csrf;` at the start of each `POST` handler, or refactor the routes to use `createApiHandler({ auth: false, schema: ... })` while preserving the existing custom rate-limit keys.

#### 6. Code-similarity client swallows all errors and bypasses the logger
- **Severity:** HIGH  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **Files:** `src/lib/assignments/code-similarity-client.ts:6-9`, `code-similarity-client.ts:35-62`  
- **Problem:** `computeSimilarityRust` hard-codes `AbortSignal.timeout(25_000)`, ignores the caller's signal, catches all errors, returns `null`, and uses `console.warn` instead of the project's `logger`.  
- **Failure scenario:** Centralized logging/formatter is bypassed; callers cannot distinguish network failure, timeout, auth failure, or malformed payload; the caller's abort signal is ignored.  
- **Fix:** Replace `console.warn` with `logger.warn`. Accept an optional `signal` and abort via `AbortSignal.any([callerSignal, AbortSignal.timeout(25_000)])` (or a polyfill). Return a discriminated union or throw typed errors so the route can report accurate status codes.

#### 7. Similarity-check route misclassifies arbitrary failures as timeouts
- **Severity:** HIGH  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:51-62`  
- **Problem:** The catch block returns `timed_out` whenever `error.name === "AbortError"` **or** `error.message.includes("timed out")`. Any downstream DB timeout, DNS failure, or network error whose message contains the substring `"timed out"` is reported as a scan timeout.  
- **Failure scenario:** False-positive timeout flags in UI/audit logs; real infrastructure failures are masked.  
- **Fix:** Only treat `AbortError` from the route's own `AbortController` as a timeout. For the Rust sidecar, return a structured error shape and inspect the HTTP status/JSON body instead of grepping the message. Log the original error with request context.

#### 8. Rust worker `deregister` returns success on non-2xx responses
- **Severity:** HIGH  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `judge-worker-rs/src/api.rs:154-158`  
- **Problem:** `deregister` logs a warning for non-success HTTP status but still returns `Ok(())`. Application-level failures (auth mismatch, stale worker id, 404, 500) are treated as success.  
- **Failure scenario:** Ghost worker registrations remain in the database; the orchestrator may believe capacity is still available.  
- **Fix:** Check `response.status().is_success()` and return an `Err` containing status and body, or retry deregistration with backoff before shutdown.

#### 9. Standalone nginx templates still overwrite the X-Forwarded-For chain
- **Severity:** HIGH  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **Files:** `scripts/online-judge.nginx.conf:63,77,88,100`, `scripts/online-judge.nginx-http.conf:33,44`  
- **Problem:** These standalone templates use `proxy_set_header X-Forwarded-For $remote_addr;`, replacing any existing forwarded-for chain with a single entry. `extractClientIp` with default `TRUSTED_PROXY_HOPS=1` requires `parts.length >= trustedHops + 1`, so it returns `null` in production.  
- **Failure scenario:** Rate limiting collapses to a single global bucket; legitimate judge workers may be denied if `JUDGE_ALLOWED_IPS` is configured; audit logs lose client attribution.  
- **Fix:** Change every application nginx `X-Forwarded-For` line to `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. Extend `tests/unit/infra/judge-report-nginx.test.ts` to assert the same for these files.

#### 10. `deploy-test-backends.sh` runs migrations inside the app container without `drizzle-kit`
- **Severity:** HIGH  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **Files:** `deploy-test-backends.sh:247-249`, `Dockerfile:75-104`  
- **Problem:** The script runs `docker exec -e DB_DIALECT=${dialect} ${container} npx drizzle-kit push` inside the `judgekit-app` container. The production `Dockerfile` does not copy `drizzle-kit` (a `devDependency`) into the runner stage, so `npx` will try to download it and will fail in an offline/air-gapped container. The script only `warn`s on failure.  
- **Failure scenario:** On a clean test deploy, PostgreSQL and MySQL backends start but have no schema. The deploy appears to succeed while backend endpoints 500 on every DB query.  
- **Fix:** Adopt the same temporary-container migration pattern used in `deploy-docker.sh` (install `drizzle-kit` on the fly in a one-shot container connected to the DB network), or explicitly copy `node_modules/drizzle-kit` and its runtime dependencies into the app image runner stage.

#### 11. Generic 500 catch-all hides root causes
- **Severity:** HIGH  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `src/lib/api/handler.ts:210-212`  
- **Problem:** Every unhandled exception returns `{ error: "internalServerError" }` with no request id, structured error code, or correlation id. The log includes method and path but no correlation handle.  
- **Failure scenario:** Harder incident response; clients cannot distinguish retryable vs non-retryable failures; repeated identical errors are hard to group.  
- **Fix:** Generate or propagate a `requestId` (e.g., `req.headers.get("x-request-id")`), include it in the response body, and log it with `err`, `method`, `path`, and `user.id`. Map known error classes (Zod, DB constraint, auth, timeout) to specific public codes before the final catch-all.

---

### MEDIUM

#### 12. Source-code size limit is inconsistent between worker executor and runner
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **Files:** `judge-worker-rs/src/executor.rs:57`, `judge-worker-rs/src/runner.rs:22`  
- **Problem:** The main executor allows `MAX_SOURCE_CODE_BYTES = 256 KiB`, while the runner sidecar allows only `64 KiB`. The two components are supposed to be interchangeable judging surfaces.  
- **Failure scenario:** A 200 KiB source queued through the normal `/claim` path is accepted, but the same source submitted via the runner `/run` endpoint returns `400 Bad Request`.  
- **Fix:** Define a single shared constant (e.g., in a `consts.rs` module) and use it in both places, or make the limit env-configurable with the same default.

#### 13. Runner run timeout omits Docker startup overhead
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **Files:** `judge-worker-rs/src/runner.rs:887-897`  
- **Problem:** The executor uses `effective_time_limit_ms + DOCKER_RUN_OVERHEAD_BUDGET_MS` for the wall-clock kill timeout so that container startup/teardown does not count against the user budget. The runner sidecar passes `time_limit_ms` directly to `docker::run_docker`.  
- **Failure scenario:** A near-limit legitimate run invoked through the runner gets a spurious timeout because Docker spawn overhead consumes part of the user budget.  
- **Fix:** Reuse the same overhead constant in `execute_run`, e.g. `timeout_ms: time_limit_ms.saturating_add(DOCKER_RUN_OVERHEAD_BUDGET_MS)`, or extract a shared helper.

#### 14. Shell-command validators diverge and both permit shell interpreter invocations
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **Files:** `src/lib/compiler/execute.ts:189-218`, `judge-worker-rs/src/runner.rs:124-176`  
- **Problem:** Both validators claim to be "kept in lock-step" but differ materially. More importantly, both allow the tokens `bash`/`sh`/`powershell`/`pwsh` as command prefixes and wrap the supplied command in `sh -c`, so a payload can be smuggled inside `-c` arguments.  
- **Failure scenario:** A leaked `RUNNER_AUTH_TOKEN` or a compromised `language_configs` row allows arbitrary command execution inside the judged container.  
- **Fix:** Do not accept raw shell strings from the HTTP API. Accept an argv array, reject shell metacharacters/quotes entirely, and execute with `execvp`-style semantics; or maintain a single canonical validator (shared crate or JSON schema) and remove shell interpreters from `ALLOWED_COMMAND_PREFIXES`.

#### 15. `validateShellCommandStrict` rejects legitimate environment-variable prefixes
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **Files:** `src/lib/compiler/execute.ts:189-251`  
- **Problem:** The stricter validator splits a command on `&&` or `;` and requires each segment's first token to match an allowed compiler prefix. If a segment begins with an environment assignment such as `CC=gcc gcc ...`, the first token `CC=gcc` does not match any prefix and the whole command is rejected.  
- **Failure scenario:** An admin who legitimately configures a language with an env-var prefix sees submissions failing with `"Invalid compile command"` even though `validateShellCommand` regex would have accepted it.  
- **Fix:** Strip leading `KEY=VALUE` assignments before checking the command prefix, or move the prefix check into the Rust runner and keep local fallback validation aligned with it. Update the comment that claims env-var prefixes are supported.

#### 16. `parseTimestampEpochMs` cannot parse nanosecond Docker timestamps
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `src/lib/compiler/execute.ts:254-266`  
- **Problem:** The JSDoc states the helper handles `"2024-01-15T10:30:45.123456789Z"`, but it delegates to `Date.parse`, which only supports millisecond precision and may return `NaN` for nine-digit fractional seconds.  
- **Failure scenario:** Container inspection loses accurate execution duration and falls back to wall-clock duration, skewing execution-time reporting.  
- **Fix:** Truncate the fractional seconds to three digits before calling `Date.parse`, or use a small regex/parser that explicitly handles nanoseconds.

#### 17. Java harness string escape assumes four hex digits after `\u`
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `src/lib/judge/function-judging/adapters/java.ts:113-115`  
- **Problem:** `Integer.parseInt(s.substring(i, i + 4), 16)` is called without checking that four characters remain. A malformed or adversarial test-case string ending with `\u` crashes the harness.  
- **Failure scenario:** A problem author accidentally saves a string literal ending in `\u`; all Java submissions for that problem fail with a harness runtime error.  
- **Fix:** Validate bounds before `substring`, or validate all string literals at problem/test-case creation time.

#### 18. Function-judging literal values are not validated against target-language ranges
- **Severity:** MEDIUM  
- **Confidence:** MEDIUM  
- **Status:** Risk  
- **Files:** `src/lib/judge/function-judging/serialization.ts:16-31`, `src/lib/judge/function-judging/types.ts`  
- **Problem:** The serialization layer preserves int64 precision, but the authoring UI/API does not reject values outside the target language's safe range (e.g., a Java `long` larger than `Long.MAX_VALUE`).  
- **Failure scenario:** An author enters a value that the target harness cannot represent, producing wrong verdicts or harness crashes.  
- **Fix:** Add per-language range validation when test cases and function signatures are saved.

#### 19. Admin problem-set count materializes the full table
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `src/lib/problem-sets/visibility.ts:162-169`  
- **Problem:** For admins, `countVisibleProblemSetsForUser` selects all rows and counts in JavaScript instead of using SQL `count()`.  
- **Failure scenario:** As the problem-set table grows, the query becomes an unnecessary memory and latency bottleneck.  
- **Fix:** Replace `db.select({ id }).from(problemSets)` with `db.select({ count: count() }).from(problemSets)`.

#### 20. Problem-set visibility helpers use `unknown` casts
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **Files:** `src/lib/problem-sets/visibility.ts:178, 187, 221`  
- **Problem:** `as unknown as Promise<VisibleProblemSetListItem[]>` and similar casts bypass Drizzle's typed query results. A schema change can silently break downstream consumers.  
- **Failure scenario:** A future schema change causes runtime shape mismatches that TypeScript would have caught.  
- **Fix:** Remove the casts and adjust the `with` clauses or types so Drizzle returns the correct inferred shape.

#### 21. IPv6 validation is permissive and does not canonicalize
- **Severity:** MEDIUM  
- **Confidence:** MEDIUM  
- **Status:** Risk  
- **File:** `src/lib/security/ip.ts:45-69`  
- **Problem:** The validator only checks hex characters, segment count, and compression rules. It does not reject all invalid compression forms or canonicalize equivalent forms.  
- **Failure scenario:** A determined client can bypass per-IP rate limits or allowlist entries by submitting syntactically different but semantically identical IPv6 strings in `X-Forwarded-For`.  
- **Fix:** Use a well-tested library such as `ipaddr.js` for parsing/normalization, or document supported formats and canonicalize before deriving rate-limit keys.

#### 22. Code-similarity inner pairwise loop is sequential
- **Severity:** MEDIUM  
- **Confidence:** MEDIUM  
- **Status:** Confirmed  
- **File:** `code-similarity-rs/src/similarity.rs:366-379`  
- **Problem:** `compute_similarity` groups submissions by `(problem_id, language)` and parallelizes across groups. The inner `for i`/`for j` pairwise loop for a single group runs on one thread.  
- **Failure scenario:** A contest with 500 submissions for one problem performs ~125k comparisons on a single core while other cores remain idle, increasing `/compute` latency.  
- **Fix:** Parallelize the inner pairwise loop (e.g., collect candidate pairs and use `par_iter`) while keeping the grouping boundary.

#### 23. Runner `chown`/`chmod` calls block the async runtime
- **Severity:** MEDIUM  
- **Confidence:** MEDIUM  
- **Status:** Risk  
- **Files:** `judge-worker-rs/src/runner.rs:755-766`, `runner.rs:785-796`  
- **Problem:** `execute_run` performs `std::os::unix::fs::chown` and `tokio::fs::set_permissions` synchronously while holding an Axum request context. `chown` is a privileged filesystem syscall that can stall under load.  
- **Failure scenario:** Under concurrent runner load, blocking ownership syscalls delay other `/run` requests and the `/health` probe, making the runner appear degraded.  
- **Fix:** Move the ownership changes into `tokio::task::spawn_blocking`, or run them before entering the async response path.

#### 24. Test-backends compose uses PostgreSQL 17 while claiming 18
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `docker-compose.test-backends.yml:21`  
- **Problem:** The file header says "PostgreSQL → :3101 (+ PG 18 container)", but the service uses `postgres:17-alpine`.  
- **Failure scenario:** Backend-specific behavior that differs between PG 17 and 18 is not caught in the multi-backend test environment, giving false confidence before production deploys.  
- **Fix:** Update to `postgres:18-alpine` and explicitly set `PGDATA: /var/lib/postgresql/data` to match production pinning.

#### 25. MySQL healthcheck hardcodes the default password
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `docker-compose.test-backends.yml:53`  
- **Problem:** The healthcheck uses `-pjudgekit_test` literally, even though `MYSQL_PASSWORD` can be overridden via `.env.production`.  
- **Failure scenario:** An operator sets a non-default `MYSQL_PASSWORD`. `db-mysql` never becomes healthy, blocking `app-mysql` from starting because of `depends_on: condition: service_healthy`.  
- **Fix:** Replace the literal healthcheck with a shell command that reads `MYSQL_PASSWORD` from the environment, or mount a small healthcheck script.

#### 26. Test-backends worker only polls the SQLite app queue
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `docker-compose.test-backends.yml:164-192`  
- **Problem:** The single worker service sets `JUDGE_BASE_URL=http://app-sqlite:3000/api/v1` and `depends_on` only `app-sqlite`. The PostgreSQL and MySQL app instances point their `COMPILER_RUNNER_URL` at this worker, but the worker never fetches from their queues.  
- **Failure scenario:** Submissions sent to the PostgreSQL or MySQL test backends stay unjudged while operators assume the multi-backend stack exercises end-to-end judging.  
- **Fix:** Either add per-backend worker instances, or add a prominent comment documenting that the test-backends stack validates DB compatibility only and judging must be verified separately.

#### 27. Static-site nginx drops security headers for static assets
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `static-site/nginx.conf:21-24`  
- **Problem:** `add_header` directives at the `server` level are completely overridden by the `location ~* \.(css|js|...)$` block that adds `Cache-Control` (nginx inheritance rule). Consequently, `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` are not sent with static-asset responses.  
- **Failure scenario:** Browsers fetch static assets without MIME-sniffing/clickjacking protection, which is where these headers are most needed.  
- **Fix:** Add the same three `add_header ... always;` directives inside the asset `location` block, or move cache headers to a `map`/include that does not override the server-level security headers.

#### 28. Public static-site reverse proxy lacks security headers and HSTS
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `static-site/static.nginx.conf:20-28`  
- **Problem:** The public-facing reverse-proxy config has TLS and an HTTP-to-HTTPS redirect, but the HTTPS server block sets no `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, CSP, or HSTS. The upstream `static-site/nginx.conf` now has some of these, but nginx `add_header` is not inherited through a proxy unless explicitly added at the proxy layer.  
- **Failure scenario:** Browsers fetch static assets without clickjacking/MIME-sniffing protection or HSTS.  
- **Fix:** Add the same baseline headers used in `static-site/nginx.conf`, plus HSTS, to the HTTPS server block.

#### 29. Backup script off-host rclone copy has no timeout and silently skips when rclone is missing
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **Files:** `scripts/backup-db.sh:100-102`  
- **Problem:** The PostgreSQL dump and Docker exec paths are wrapped in `timeout`, but the optional rclone copy is not. If `BACKUP_REMOTE` is set but `rclone` is not installed, the block is skipped without any output.  
- **Failure scenario:** A cron backup job can hang indefinitely if the remote destination is unreachable; an operator may believe off-site backups are occurring when they are not.  
- **Fix:** Wrap the rclone call in `timeout 600s rclone copy ...`, and emit an explicit warning when `BACKUP_REMOTE` is set but `rclone` is not found.

#### 30. Backup retention safety check ignores encrypted `.age` backups
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `scripts/backup-db.sh:108-110`  
- **Problem:** The deletion loop searches `.db`, `.db.age`, `.sql.gz`, and `.sql.gz.age`, but the `NEWER_COUNT` safety check only counts `.db` and `.sql.gz`.  
- **Failure scenario:** Once AGE encryption is enabled for all backups, only `.age` files exist. The script believes no newer backups exist and refuses to delete old encrypted backups, causing unbounded disk growth.  
- **Fix:** Include `.db.age` and `.sql.gz.age` in the `NEWER_COUNT` query.

#### 31. CSRF Origin check does not honor the database allowed-hosts list
- **Severity:** MEDIUM  
- **Confidence:** MEDIUM  
- **Status:** Risk  
- **Files:** `src/lib/security/csrf.ts:8-17`, `csrf.ts:61-76`  
- **Problem:** `validateCsrf` only compares the Origin host to `AUTH_URL` (or request headers in development). It does not consult the settings-driven `allowedHosts` list that the server-action origin validator uses.  
- **Failure scenario:** An operator adds a new front-end origin to `allowedHosts` via `/admin/settings`. Server actions from that origin succeed, but API calls receive `403 csrfValidationFailed` even though the host is explicitly trusted.  
- **Fix:** Reuse the trusted-host resolver already used by `src/app/api/auth/[...nextauth]/route.ts` so that `allowedHosts` entries are also accepted by `validateCsrf`.

#### 32. SQLite seed in test-backends silently swallows all migration errors
- **Severity:** MEDIUM  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `deploy-test-backends.sh:240`  
- **Problem:** The SQLite migration loop wraps every statement in `try { db.exec(t); } catch(e) {}`, discarding all errors.  
- **Failure scenario:** A malformed or conflicting migration file is merged. The deploy reports "SQLite schema ready" while the actual database is partially migrated, leading to obscure runtime 500s.  
- **Fix:** Count failures, log the error, and fail the seed step if any statement errors.

---

### LOW

#### 33. Invalid API keys are authenticated twice per request
- **Severity:** LOW  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `src/lib/api/auth.ts:66-82`  
- **Problem:** When the `Authorization` header starts with `Bearer jk_` but the key is invalid or revoked, `authenticateApiKey` runs at line 67, falls through to JWT extraction, fails, then runs `authenticateApiKey` again at line 82 with the same header.  
- **Failure scenario:** A revoked/malformed API key incurs two DB lookups and two crypto operations on every request instead of one.  
- **Fix:** Skip the fallback API-key call when the header is already known to be API-key style.

#### 34. Async role helper exports are unused
- **Severity:** LOW  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `src/lib/auth/role-helpers.ts:6, 15, 23`  
- **Problem:** `isAtLeastRoleAsync`, `canManageUsersAsync`, and `isInstructorOrAboveAsync` are exported but have zero callers. They duplicate logic already handled by `resolveCapabilities` and `getRoleLevel`.  
- **Failure scenario:** Future developers may import the stale helpers instead of the capability cache, leading to inconsistent authorization behavior and untested code paths.  
- **Fix:** Remove the file if it is dead, or add tests and migrate callers if it is intended for future use.

#### 35. Public auth routes silently swallow malformed JSON bodies
- **Severity:** LOW  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **Files:** `src/app/api/v1/auth/forgot-password/route.ts:12`, `reset-password/route.ts:13`, `verify-email/route.ts:11`  
- **Problem:** `await req.json().catch(() => ({}))` converts any JSON parse failure into an empty object, returning a generic schema error instead of indicating invalid JSON.  
- **Failure scenario:** A client sending a truncated or non-JSON payload cannot distinguish a transport/proxy problem from a validation problem.  
- **Fix:** Remove the silent catch, let `req.json()` throw, and return HTTP 400 with `error: "invalidJson"`. At minimum log the parse failure.

#### 36. Admin settings audit payload omits security-relevant fields
- **Severity:** LOW  
- **Confidence:** MEDIUM  
- **Status:** Risk  
- **File:** `src/app/api/v1/admin/settings/route.ts:190-202`  
- **Problem:** The durable audit event records only a hand-picked subset of fields. `allowedHosts`, `sessionMaxAgeSeconds`, `emailVerificationRequired`, and `allowStandaloneCompilerInRestrictedModes` are not included in the `details` payload.  
- **Failure scenario:** A malicious or mistaken change to trusted hosts or session lifetime cannot be fully reconstructed from the audit log.  
- **Fix:** Build the audit `details` object from the full validated update map after the `hasOwnInput` / `allowedConfigKeys` filtering step.

#### 37. `SecretString` does not zeroize memory on drop
- **Severity:** LOW  
- **Confidence:** MEDIUM  
- **Status:** Risk  
- **File:** `judge-worker-rs/src/types.rs:5-28`  
- **Problem:** The wrapper prevents accidental `Debug` leakage but the underlying `String` is freed normally. There is no `Drop` implementation that overwrites the buffer before deallocation.  
- **Failure scenario:** A host memory dump or swap inspection after a crash could reveal `JUDGE_AUTH_TOKEN` or `RUNNER_AUTH_TOKEN`.  
- **Fix:** Implement `Drop` for `SecretString` using a crate like `zeroize` to clear the bytes before the string is dropped.

#### 38. `Dockerfile.judge-worker` copies the entire `docker` build context
- **Severity:** LOW  
- **Confidence:** HIGH  
- **Status:** Confirmed  
- **File:** `Dockerfile.judge-worker:35`  
- **Problem:** `COPY docker ./docker` copies every language Dockerfile and build recipe into the worker image. The runtime only needs `docker/seccomp-profile.json` (already copied separately).  
- **Failure scenario:** Larger worker image, longer transfer times, and unnecessary exposure of build recipes inside the runtime image.  
- **Fix:** Copy only runtime-required files explicitly.

#### 39. Static-site deploy script hardcodes `docker-compose`
- **Severity:** LOW  
- **Confidence:** MEDIUM  
- **Status:** Risk  
- **File:** `static-site/deploy.sh:25,56`  
- **Problem:** `COMPOSE_CMD="docker-compose"`. Modern Docker installs provide `docker compose` as a plugin and may not ship the standalone binary.  
- **Failure scenario:** Deploy to a freshly bootstrapped host fails with `docker-compose: command not found`.  
- **Fix:** Detect availability: `if docker compose version >/dev/null 2>&1; then COMPOSE_CMD="docker compose"; else COMPOSE_CMD="docker-compose"; fi`.

#### 40. `scripts/bootstrap-instance.sh` `remote_sudo` helper has unquoted command substitution
- **Severity:** LOW  
- **Confidence:** MEDIUM  
- **Status:** Risk  
- **File:** `scripts/bootstrap-instance.sh:95`  
- **Problem:** `ssh $SSH_OPTS "${REMOTE}" "sudo bash -c $(printf '%q' "$1")"` leaves the substitution unquoted inside the remote command string, so the local shell applies word splitting/globbing before `ssh` receives the argument.  
- **Failure scenario:** A bootstrap script containing glob characters or certain whitespace can be split incorrectly.  
- **Fix:** Quote the substitution or pass the script via stdin with proper escaping.

#### 41. Zod validation only returns the first issue as the top-level `error`
- **Severity:** LOW  
- **Confidence:** MEDIUM  
- **Status:** Risk  
- **File:** `src/lib/api/handler.ts:167-176`  
- **Problem:** The response uses `issues[0]?.message` as `error` and returns all messages in `errors`. Consumers that only inspect `error` cannot map failures to form fields.  
- **Failure scenario:** API clients show a generic validation message instead of per-field errors.  
- **Fix:** Return a structured `details` array with `{ path, message, code }` for each issue.

---

## Static Checks

| Check | Command | Result | Notes |
|-------|---------|--------|-------|
| TypeScript | `cd /tmp/judgekit-local && npx tsc --noEmit` | **FAIL** (exit 1) | `.next/types/validator.ts:25` route constraint error for `/contests/manage` |
| Rust check | `cd /tmp/judgekit-local/judge-worker-rs && cargo check` | Pass |  |
| Rust clippy | `cd /tmp/judgekit-local/judge-worker-rs && cargo clippy -- -W clippy::all` | Pass |  |

---

## Final Sweep Notes

- Cross-checked all findings against `.context/reviews/_aggregate.md`. Known aggregate blockers (nginx XFF in `deploy-docker.sh`, `AUTH_TRUST_HOST` defaults, judge IP allowlist defaults, docker-compose network segmentation, worker container root, internal HTTP) are not duplicated here.
- Verified that every file path and line number above points to `/tmp/judgekit-local`, not to the sibling working tree that has uncommitted cycle-4 modifications.
- The standalone nginx templates (`scripts/online-judge.nginx.conf` and `scripts/online-judge.nginx-http.conf`) are **not** covered by the `deploy-docker.sh` XFF fix and still overwrite the chain; this was confirmed by direct file read.
- The reported empty "additive schema repair" block in `deploy-docker.sh` was **not** present in `/tmp/judgekit-local`; it appears to be a current-working-tree-only artifact and was excluded.
- No hardcoded secrets, SQL injection, XSS, or CSRF vectors were found in the reviewed Rust code. The Rust crates compile cleanly and pass clippy.
- Positive observations: `createApiHandler` centralizes cross-cutting concerns well; API keys use SHA-256 + AES-256-GCM with rotation support; IP extraction correctly unwraps IPv4-mapped IPv6 and rejects leading-zero octets; uploaded files are written with `0o600`; the code-similarity route now enforces `MAX_SUBMISSIONS_FOR_SIMILARITY` before invoking the sidecar.

---

## Recommendation

**REQUEST CHANGES.**

The repository has a clean Rust build and many well-centralized TypeScript patterns, but the following must be fixed before approval:

1. Resolve the `npx tsc --noEmit` failure (`/contests/manage` layout).
2. Fix local-fallback and Rust-runner workspace cleanup after sandbox `chown`.
3. Remove the one-second token-revocation race.
4. Add CSRF protection to the public auth routes and stop silently swallowing malformed JSON.
5. Bring `deploy-test-backends.sh` migrations into parity with the production deploy path.
6. Add a request/correlation id to the generic 500 path in `src/lib/api/handler.ts`.

The MEDIUM and LOW findings should be triaged and scheduled in the next review-plan-fix cycle.

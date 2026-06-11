# JudgeKit — Comprehensive Deep Code Review

**Reviewer:** Claude Opus 4.7 orchestrator + 5 parallel code-reviewer subagents (Opus)
**Date:** 2026-04-18
**Commit:** HEAD on `main`
**Scope:** Entire repository — Next.js app, Rust services (judge-worker-rs, rate-limiter-rs, code-similarity-rs), Dockerfiles, shell deploy scripts, CI, tests, SQL schema, server actions.
**Total files examined:** ~470 (Next.js/TS/TSX + Rust + Dockerfiles + shell + YAML + Go-through of every API route, every `src/lib/*` subsystem, every `.sh` in `scripts/`, every `.github/workflows/*`, and every `Dockerfile.judge-*` pattern).

---

## 1. Methodology

The review was performed by orchestrating **five parallel code-reviewer subagents**, each responsible for a separate subsystem, followed by an aggregation and targeted final sweep:

| Stream | Scope | Raw report |
|---|---|---|
| A. Auth / Session / Security | `src/lib/auth/**`, `src/lib/security/**`, `src/lib/api/auth.ts`, `src/lib/api/api-key-auth.ts`, `src/proxy.ts`, change-password flow | `wip-auth-security.md` (616 lines, 17 findings) |
| B. Judge / Sandbox / Rust | `src/lib/judge/**`, `src/lib/compiler/**`, `src/lib/docker/**`, `judge-worker-rs/**`, `rate-limiter-rs/**`, `code-similarity-rs/**`, seccomp profile, Dockerfiles, docker-compose | `wip-judge-sandbox.md` (840 lines, 33 findings) |
| C. API routes & handlers | Every `src/app/api/**/route.ts` (~95 files), `src/lib/api/handler.ts`, validators, plugins | `wip-api-routes.md` (756 lines, 24 findings) |
| D. DB / assignments / business logic | `src/lib/db/**`, `src/lib/assignments/**`, `src/lib/submissions/**`, anti-cheat, discussions, problem-management, scoring, data retention, server actions | `wip-db-logic.md` (739 lines, 33 findings) |
| E. Frontend / deploy / tests | `src/app/(*)/`, `src/components/**`, Dockerfiles, `deploy*.sh`, `scripts/**`, `docker-compose*.yml`, `.github/workflows/**`, `tests/**` | `wip-frontend-deploy-tests.md` (446 lines, 34 findings) |

The orchestrator then performed a final sweep for commonly-missed classes (`dangerouslySetInnerHTML`, child-process invocations, manual `req.json()` without schema validation, `active_tasks` counter update paths, `as any` usage, cross-subsystem invariant breaks) and cross-validated several HIGH findings against the actual code.

**Verdict: REQUEST CHANGES.** The codebase is well-engineered overall with strong security fundamentals (Argon2id, atomic rate limiting with `FOR UPDATE`, capability-based RBAC, CSP with nonces, DOMPurify allowlists, `--network=none` + seccomp + `no-new-privileges` sandbox, atomic `FOR UPDATE SKIP LOCKED` claim). However, the review surfaced **9 Critical**, **23 High**, **46 Medium**, and **41 Low** issues. A handful are immediately exploitable in production.

---

## 2. Headline Findings (fix before next deploy)

### 2.1 CRITICAL — exploitable now

| ID | File | One-liner |
|---|---|---|
| **CRIT-1** | `src/app/api/v1/judge/heartbeat/route.ts:45-51` | Heartbeat auth compares **plaintext** `secretToken` column — not `secretTokenHash` — while deregister correctly uses the hash. DB-at-rest exposure of all worker secrets. |
| **CRIT-2** | `src/app/api/v1/test/seed/route.ts:38-41` | "Localhost-only" gate trusts raw `X-Forwarded-For` — trivially spoofable (`curl -H "X-Forwarded-For: 127.0.0.1" …`). If `PLAYWRIGHT_AUTH_TOKEN` is set in a non-dev environment, remote users can seed/wipe users. |
| **CRIT-3** | `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:12-13` | `auth: false` on a route that returns full `sourceCode` + `userId` + `username` of other users' accepted submissions. Public scrapable plagiarism database. |
| **CRIT-4** | `src/app/api/v1/files/[id]/route.ts:122-130` | DELETE handler runs CSRF check **before** auth resolution, so API-key-authenticated deletes are rejected (they lack `X-Requested-With`). POST handler on the same file does this correctly — copy-paste drift. Authorized API clients cannot delete files. |
| **CRIT-5** | `judge-worker-rs/src/runner.rs:806-817`, `main.rs:336-359` | Axum runner HTTP server has **no request-body size limit**. Any authenticated caller (or SSRF'd app server) can POST a multi-GB JSON body; the worker OOMs before `source_code` length validation fires. |
| **CRIT-6** | `src/lib/db/schema.pg.ts:416, 919, 517` | Plaintext secrets (`judgeWorkers.secretToken`, `recruitingInvitations.token`, `systemSettings.hcaptchaSecret`) persist in columns alongside their hashed/encrypted counterparts. Any DB dump leaks them in cleartext. |
| **CRIT-7** | `src/lib/data-retention-maintenance.ts` + `src/lib/audit/events.ts:175` | `loginEvents` (IPs, user-agents, attempted identifiers — PII) have **no retention pruning at all**; `auditEvents` pruning ignores `DATA_RETENTION_LEGAL_HOLD`. GDPR/retention non-compliance. |
| **CRIT-8** | `code-similarity-rs/src/main.rs:112-113`, `rate-limiter-rs/src/main.rs:338-348` | Both Rust sidecar HTTP services have **no authentication**. Any process on the Docker network can consume rate-limit quota (DoS legitimate users) or submit unbounded similarity workloads (O(n²) memory bomb). |
| **CRIT-9** | `/key.pem` (repo root), `Dockerfile:31`, `.dockerignore` | `*.pem` is gitignored but lives on disk, and `.dockerignore` does **not** exclude `*.pem`. Docker builder stage `COPY . .` bakes the private key into the image layer; anyone with image pull access extracts it. Rotate immediately. |

### 2.2 HIGH — fix this sprint

| ID | File | One-liner |
|---|---|---|
| **HIGH-1** | `src/app/api/v1/submissions/[id]/events/route.ts:226-232, 300-311` | SSE terminal event bypasses the assignment-result visibility + hidden-test-case stripping that `GET /submissions/[id]` applies. Students in hidden-results contests can see their scores live via SSE. |
| **HIGH-2** | `src/proxy.ts:274-276` + `src/app/(auth)/login/login-form.tsx:12-18` | Post-login redirect only blocks `//evil`; allows `/\evil.com` (browser-normalized), `@`-based authority tricks, and CRLF. Open-redirect phishing. |
| **HIGH-3** | `src/lib/actions/change-password.ts:62-69` + `src/app/change-password/change-password-form.tsx:47-55` | `tokenInvalidatedAt` is set, then client does `signOut()`→`signIn()`. If re-login fails (rate limit, network blip) the user has no session and the old password no longer works. Silent lockout window. |
| **HIGH-4** | `src/app/api/v1/judge/heartbeat/route.ts:55-62` vs `claim/route.ts:197` and `poll/route.ts:163` | Claim and poll update `active_tasks` atomically via SQL (`active_tasks = active_tasks + 1` / `GREATEST(active_tasks - 1, 0)`). Heartbeat blindly overwrites with the worker's self-reported count. The SQL atomicity is therefore defeated on every 30s tick — counter drift breaks capacity gating. |
| **HIGH-5** | `src/lib/assignments/contest-scoring.ts:131-176` & `submissions.ts:548-578` | Contest/assignment scoring joins ALL submissions without filtering by status. `pending`, `queued`, `judging`, `cancelled`, `internal_error` inflate ICPC attempt counts and may dirty leaderboard tallies. |
| **HIGH-6** | `src/lib/assignments/contest-scoring.ts:160-165` | `examMode='windowed'` explicitly skips the global-deadline late-penalty but **never joins `exam_sessions`** — so `personalDeadline` is only enforced by the submission-time validator. A cached/bypassed submit-path validation path gives uncapped full credit. |
| **HIGH-7** | `src/lib/db/relations.pg.ts` | No `communityVotesRelations` defined. Future Drizzle relational queries silently produce empty joins. |
| **HIGH-8** | `docker/seccomp-profile.json:233` and adjacent | seccomp allows full socket syscall family. `--network=none` masks TCP/IP but AF_UNIX sockets remain. Narrow to `AF_UNIX` only or drop socket syscalls entirely. |
| **HIGH-9** | `src/lib/compiler/execute.ts:119-124` vs `judge-worker-rs/src/runner.rs:112-134` | TS validator allows `&&` and `;`; Rust validator blocks them. Compile commands with `&&` work locally but 500 via the worker. If the admin panel is compromised, the TS path is permissive while Rust is strict — admin-RCE blast radius is larger via TS. |
| **HIGH-10** | `src/app/api/v1/problem-sets/[id]/route.ts:36-63`, `problem-sets/route.ts:34`, `problem-sets/[id]/groups/route.ts:46`, `users/[id]/route.ts:295` | PATCH handlers use `createApiHandler` but manually call `req.json()` inside the handler, bypassing schema-level validation. Malformed JSON → 500 instead of 400 and (worse) any new future handler copying the pattern can silently drop Zod validation. |
| **HIGH-11** | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts:65-163` | All three handlers are raw `export async` — no `createApiHandler`. Manual auth/CSRF/rate-limit implementations duplicate handler logic without session-invalidation checks. High regression surface. |
| **HIGH-12** | `src/app/api/v1/judge/claim/route.ts:19-31` | Per-worker claim rate limiter is an in-memory `Map`. Horizontally scaled app server → each pod has its own counter. Misbehaving worker gets `N × 30` claims/minute with `N` pods. |
| **HIGH-13** | `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:77-90` | `acceptedSolutionsAnonymous` blanks out `username` but still returns `userId`. De-anonymization via `/api/v1/users/{id}`. |
| **HIGH-14** | `code-similarity-rs/src/main.rs` & `src/lib/assignments/code-similarity.ts:310-319` | Similarity partitions best submission per `(userId, problemId)` regardless of language, then compares normalized source. A C++ copycat pair can be hidden behind one student's higher-scoring Python attempt. |
| **HIGH-15** | `judge-worker-rs/src/runner.rs:698`, `src/lib/compiler/execute.ts:546` | Compile/run commands are wrapped in `sh -c "<string>"`. The string is built from DB config. Any code path that inserts into `language_configs` gives the inserter shell-metachar freedom inside a sandbox container. |
| **HIGH-16** | `.github/workflows/ci.yml:252-254` | E2E in CI runs on SQLite (`rm data/judge.db*`), not PostgreSQL. The production DB is PG with different isolation, locking, and advisory-lock semantics — critical paths (judge claim `FOR UPDATE SKIP LOCKED`, rate-limit `pg_advisory_xact_lock`) never exercised end-to-end. |
| **HIGH-17** | `docker-compose.test-backends.yml:63-69` | test-backends docker-proxy runs with `BUILD=1 DELETE=1`, unlike production. A compromised worker on that stack can build arbitrary images or delete any container. |
| **HIGH-18** | `tests/e2e/**` | 35+ `await page.waitForTimeout(Xms)` calls (six in `contest-nav-test.spec.ts` alone). Inherently flaky; every CI shake masks real regressions. |
| **HIGH-19** | Test gap | No tests for: access-code single-use guarantee under concurrency; file upload path traversal; admin IP allowlist enforcement; sandbox escape via seccomp-filtered syscalls. |
| **HIGH-20** | `src/lib/db/schema.pg.ts:822` | `chatMessages.problemId` has no FK and no index — referential integrity gap + slow filter. |
| **HIGH-21** | `src/lib/db/schema.pg.ts:419` + heartbeat | `activeTasks` has no `CHECK (active_tasks >= 0)` and is both atomically updated (claim, poll) and blindly overwritten (heartbeat) — see HIGH-4. |
| **HIGH-22** | `src/lib/db/schema.pg.ts:451-452` | `submissions.assignmentId` uses `onDelete: "set null"`. Deleting an assignment leaves orphan submissions with `assignmentId=NULL` that no retention policy touches; they grow unbounded. |
| **HIGH-23** | `src/lib/data-retention-maintenance.ts:32-38` | Retention `DELETE FROM submissions WHERE submittedAt < ? AND status NOT IN (...)` — no composite `(submittedAt, status)` index. Daily job takes long locks on large tables. |

Full per-finding excerpts, exploit scenarios, and fixes live in the five `wip-*.md` documents (see §6) and in the per-finding sections below.

---

## 3. Findings by Subsystem

### 3.1 Auth, Session, Security

*Source: `wip-auth-security.md` (17 findings, 0 Critical / 2 High / 7 Medium / 8 Low)*

Strong overall. Key issues:

- **HIGH-2 (HIGH-01 in wip-auth-security):** Open redirect via `callbackUrl` — `getSafeRedirectUrl` blocks only `//…` prefix; backslash/CRLF/`@`-authority variants slip through. `src/proxy.ts:274-276`, `src/app/(auth)/login/login-form.tsx:12-18`.
- **HIGH-3 (HIGH-02 in wip-auth-security):** Password-change TOCTOU — `signOut` then `signIn` with new password, no error recovery.
- **MED:** `isTokenInvalidated` **fails open** when both `authenticatedAt` and `iat` are absent (`src/lib/auth/session-security.ts:25-35`). A malformed JWT that should be revoked is treated as valid. **Fix:** invert the default; missing timestamp + `tokenInvalidatedAt` set → treat as invalidated.
- **MED:** Proxy auth cache TTL (`AUTH_CACHE_TTL_MS`) has no upper bound; an operator typo `AUTH_CACHE_TTL_MS=3600000` silently creates a 1-hour session-invalidation gap (`src/proxy.ts:22-26`).
- **MED:** hCaptcha verification doesn't validate `hostname` or `challenge_ts` — token from any co-tenant of the site key can be replayed (`src/lib/security/hcaptcha.ts:42-85`).
- **MED:** Password policy is length-only; `context` param is explicitly `void`-ed. Username-as-password is permitted (`src/lib/security/password.ts:1-19`).
- **MED:** Recruiting-token already-redeemed path has IP-only rate limit; no per-token throttle (`src/lib/auth/config.ts:143-172`, `src/lib/assignments/recruiting-invitations.ts:249-452`). Botnet bypasses.
- **MED:** `src/proxy.ts:145` deletes `X-Forwarded-Host` for all non-auth paths — comment claims auth routes are exempt because they're not in the matcher; no runtime guard if the matcher is later widened.
- **MED:** `src/lib/security/encryption.ts:28-39` — dev-mode returns plaintext when `NODE_ENCRYPTION_KEY` is unset. Values encrypted in dev then migrated to staging/prod remain plaintext.
- **LOW:** `src/lib/security/derive-key.ts:17` HKDF uses empty salt; domain-only separation. Cryptographically sound but reduced defense-in-depth.
- **LOW:** `src/lib/capabilities/cache.ts:17` — 60 s role cache ≈ 60 s privilege-retention window after role downgrade. Invalidate on role change.
- **LOW:** `users.manage_roles` capability is declared but never checked — role changes still gate on the legacy `canManageRole` level check (`src/lib/capabilities/types.ts:14`). Dead permission.
- **LOW:** `safeTokenCompare` is used correctly for judge auth, but API-key SHA-256 lookup relies on DB equality — acceptable given uniform hash distribution.

### 3.2 Judge Execution / Sandbox / Rust

*Source: `wip-judge-sandbox.md` (33 findings, 2 Critical / 5 High / 12 Medium / 8 Low / 6 Info)*

- **CRIT-1:** Heartbeat compares plaintext `secretToken` (not hash). Inconsistent with `deregister` which uses `secretTokenHash`. Confirmed by `src/app/api/v1/judge/heartbeat/route.ts:45-51` — `columns: { secretToken: true }`. Fix: switch to `secretTokenHash`, drop plaintext column.
- **CRIT-5:** Axum runner has no `DefaultBodyLimit` layer. Add:
  ```rust
  Router::new().route(...).layer(DefaultBodyLimit::max(2 * 1024 * 1024))
  ```
- **HIGH-8:** seccomp `socket` family allowed; AF_UNIX reachable inside container. Narrow via arg filter or drop.
- **HIGH-9:** TS `validateShellCommand` vs Rust `validate_shell_command` divergence (`&&`, `;`, `||`). Align or split the policy per source-of-command.
- **HIGH-15:** `sh -c "${cmd}"` for admin-supplied compile commands — shell metacharacter trust boundary is admin-write on `language_configs`. Array-form `exec` would remove interpretation.
- **HIGH:** Both `code-similarity-rs` and `rate-limiter-rs` expose unauthenticated HTTP routes on the Docker network; add Bearer auth parity with runner token.
- **MED:** `RUNNER_AUTH_TOKEN` silently falls back to `JUDGE_AUTH_TOKEN` (`judge-worker-rs/src/config.rs:152-172`). In production, require distinct tokens or fail-closed.
- **MED:** Docker image validation allows `:latest` — no digest pinning; registry/cache poisoning risk.
- **MED:** Workspace is `chmod 0o777` during compile. Restrict to a specific output subdir or run as a fixed host UID.
- **MED:** `docker inspect` in Rust worker has no wall-clock timeout (`judge-worker-rs/src/docker.rs:142-194`). TS path uses 5 s. Align.
- **MED:** `cleanup_orphaned_containers` batch-removes without chunking — `ARG_MAX` risk after crash loops.
- **MED:** `Submission.sourceCode` is deserialized before size check in Rust worker (`types.rs:218`, `executor.rs:258-269`). Add serde size limit or pre-check `Content-Length`.
- **MED:** seccomp allows `prctl` with no arg filter — narrow or accept-risk with `no-new-privileges`.
- **MED:** Dead-letter directory isn't symlink-checked before `create_dir_all` (`executor.rs:807`). Validate `metadata().file_type().is_symlink()` on creation.
- **MED:** Rust worker allows `--memory-swap = 4× mem` for compile; TS uses `1×` (no swap). Align.
- **MED:** `Dockerfile.judge-worker`, `Dockerfile.code-similarity`, `Dockerfile.rate-limiter-rs` all run as root. Add `USER app`.
- **MED:** Production compose passes `POSTGRES_PASSWORD` via env; visible in `docker inspect` and `/proc/*/environ`. Use Docker secrets.
- **LOW:** `USER judge` in language Dockerfiles is shadowed by `--user 65534:65534` at `docker run` time — effectively dead.
- **LOW:** `pids_limit` conditional at `judge-worker-rs/src/docker.rs:249` returns "128" in both branches (dead).
- **LOW:** `rate-limiter-rs/src/main.rs:91-96` `now_ms()` casts `u128` → `u64`; `unwrap_or_default()` returns 0 for pre-epoch clocks — windows would expire instantly.
- **LOW:** IP allowlist parser doesn't support IPv6 CIDR (`src/lib/judge/ip-allowlist.ts:50-68`).
- **LOW:** `scripts/deploy-worker.sh:38` passes `--token=<token>` on the command line — visible in `ps`.
- **LOW:** `MAX_TIME_LIMIT_MS` re-parsed per submission from env (`executor.rs:20-25`) — no practical issue but a TOCTOU surface. Move to `Config::from_env`.
- **LOW:** Orphan container cleanup runs only every 300 s — a worker crash leaves orphans for up to 5 min. Add startup cleanup.
- **LOW:** `comparator.rs:133-146` — two NaN values in float comparison return `WA` even when the test expects `NaN`.

**Positive observations (kept for balance):** strong sandbox layering (`--network=none`, `--cap-drop=ALL`, `no-new-privileges`, read-only rootfs, seccomp, `--init`, pids limit, 4 MiB output cap, 64/256 KB source limits); atomic claim `FOR UPDATE SKIP LOCKED`; dead-letter persistence for failed result reports; per-worker cryptographic secrets; image-prefix validation; constant-time token compare via `constant_time_eq`.

### 3.3 API Routes and Handlers

*Source: `wip-api-routes.md` (24 findings, 3 Critical / 5 High / 9 Medium / 7 Low)*

- **CRIT-2, CRIT-3, CRIT-4** as in §2.1.
- **HIGH-1, HIGH-10, HIGH-11, HIGH-12, HIGH-13** as in §2.2.
- **MED:** Plugin chat-widget test-connection constructs Gemini URL with user-supplied `model` (regex-validated). Timing-based API-key validation oracle is the residual risk.
- **MED:** Admin API-key PATCH handler logs the entire parsed `body` to `audit.details` — copy-paste hazard for any future handler accepting sensitive fields.
- **MED:** `src/lib/api/pagination.ts` allows `MAX_PAGE=10_000` × `limit=100` → offset up to 999,900. PG offset scans are O(N) — anyone can DoS paginated endpoints with `?page=10000`.
- **MED:** Judge register stores both `secretToken` (plaintext) and `secretTokenHash` — see CRIT-6.
- **MED:** `/api/v1/community/threads/route.ts` exports only POST — GET exists elsewhere or is absent; audit whether listing happens without auth in a server component.
- **MED:** `src/app/api/v1/files/route.ts:91-93` — `originalName: file.name` stored without length clamp; later used in `Content-Disposition: attachment; filename="${encodeURIComponent(...)}"` (line 101) — large header risk.
- **MED:** Several admin routes check capabilities manually inside the handler body instead of via `auth: { capabilities: [...] }` config — drift risk (`admin/workers`, `files` GET, `groups` GET).
- **MED:** `src/app/api/v1/recruiting/validate/route.ts:9` — unauthenticated POST with no CSRF. HTML form cross-site trigger can serve as a valid/invalid-token oracle. Either make it GET or add `Sec-Fetch-Site: same-origin` check.
- **MED:** `src/app/api/v1/admin/docker/images/route.ts:43-47` — `filter` param is regex-validated but passed to `listDockerImages(filter)`; verify the callee uses array-form spawn.
- **LOW:** Health endpoint exposes `APP_VERSION` and `uptime` unauthenticated — minor fingerprint.
- **LOW:** Error-response shape drift — some routes return `{error, message}` where the `ApiErrorResponse` type only defines `{error}`.
- **LOW:** SSE cleanup relies on periodic timer; ungraceful TCP termination leaves stale entries for `sseTimeoutMs + 30s` inflating per-user caps.
- **LOW:** `recordAuditEvent` is fire-and-forget everywhere; audit DB down → silent loss. Consider awaiting for high-value events.
- **LOW:** `src/app/api/v1/problem-sets/route.ts:20-58` POST has no `rateLimit` key.

**Positive observations:** `createApiHandler` factory used in ~80/95 routes; CSRF skipped cleanly for API-key-auth callers; `pg_advisory_xact_lock` on submission insert; `FOR UPDATE SKIP LOCKED` on judge claim; CSV formula-injection escape; ZIP bomb decompressed-size cap; plugin secrets AES-256-GCM + HKDF; capabilities-based authorization with async resolution.

### 3.4 DB Schema & Business Logic

*Source: `wip-db-logic.md` (33 findings, 4 Critical / 8 High / 12 Medium / 9 Low)*

- **CRIT-6, CRIT-7** as in §2.1.
- **HIGH-5, HIGH-6, HIGH-7, HIGH-20, HIGH-21, HIGH-22, HIGH-23** as in §2.2.
- **MED:** `scoreOverrides.createdAt` uses `new Date()` instead of the project convention `new Date(Date.now())` (`schema.pg.ts:644`) — masks test time-travel.
- **MED:** `files.problemId` uses `onDelete: "set null"` with no sweep of orphaned DB rows nor their on-disk files (`schema.pg.ts:1100-1101`).
- **MED:** Similarity partitions best submission per `(userId, problemId)` irrespective of language — see HIGH-14.
- **MED:** `groups.isArchived` is defined but no user-facing query filters on it; archived groups appear in listings, validations, dropdowns.
- **MED:** `src/lib/code-snapshots/diff.ts:28-30` allocates a full `O(n×m)` LCS matrix — ~400 MB for 10k×10k lines → OOM on generated lookup tables.
- **MED:** Contest ranking LRU cache is 50 entries; a single replay with 40 snapshots evicts most other cache keys (`contest-scoring.ts:55`).
- **MED:** `rateLimits` uses `bigint` for timestamps while the rest of the schema uses `timestamp with time zone` — can't join, can't use PG time fns. Intentional? Document.
- **MED:** `assignmentProblems` on update does unconditional DELETE+INSERT (`management.ts:305-307`) — regenerates every row's ID.
- **MED:** `syncProblemTags` is N+1 (`problem-management.ts:178-183`) — 1 DELETE + N INSERTs per tag.
- **MED:** `contest-replay.ts:61-75` runs `computeContestRanking` sequentially for each cutoff — 40 sequential round-trips.
- **MED:** `resolveTagIdsWithExecutor` does sequential lookups (`problem-management.ts:131-171`) — batch-lookup then bulk-insert.
- **MED:** `src/lib/audit/events.ts:118-119` — on flush failure the failed batch is prepended; concurrent additions during flush violate chronological order (mitigated by `createdAt` timestamps).
- **LOW:** `users.email` nullable with unique index — multiple NULL rows allowed (PG-correct); document.
- **LOW:** `assignments.accessCode` unique index allows multiple NULLs (PG-correct); document.
- **LOW:** Missing index on `problems.visibility` — used by homepage insights, practice search, public problem-set visibility.
- **LOW:** `discussionThreads.authorId` missing index; `listUserDiscussionThreads` filters on it.
- **LOW:** `jaccardSimilarity` returns 0 for `(∅, ∅)` — mathematically undefined, choice is fine, document.
- **LOW:** `SUBMISSION_ID_LENGTH=32` is hex-string length, not entropy bytes — rename to `SUBMISSION_ID_HEX_LENGTH` to avoid confusion.
- **LOW:** `getContestStatus` checks global `deadline` before personal `deadline` — returns "closed" where "expired" might be more accurate UX.
- **LOW:** `listModerationDiscussionThreads` fetches top 100 then filters in memory — push scope/state filters into `where`.
- **LOW:** `validateZipDecompressedSize` fully decompresses entry by entry — streaming would cap per-entry memory.

**Positive observations:** consistent transaction use for multi-table writes; `onConflictDoNothing` + re-fetch pattern for exam-session creation; `redeemAccessCode` TOCTOU guard; atomic recruiting claim; comprehensive audit coverage across server actions; capability-based RBAC with `resolveCapabilities`; rate-limited server actions; strict Zod schemas; stale-while-revalidate ranking cache with single-flight refresh; good index coverage for common paths.

### 3.5 Frontend, Deploy, Tests

*Source: `wip-frontend-deploy-tests.md` (34 findings, 2 Critical / 8 High / 14 Medium / 10 Low)*

- **CRIT-9** (`key.pem` → Docker image) as in §2.1. Note: the key is not in git history but IS on disk and would be present in any image builder caches created so far — rotate regardless.
- **HIGH-16, HIGH-17, HIGH-18, HIGH-19** as in §2.2.
- **MED:** `.env.production.example` contains a real-looking internal hostname `oj-internal.maum.ai` instead of a placeholder. Replace with `your-domain.example.com`.
- **MED:** `style-src 'unsafe-inline'` is required by Next.js CSS-in-JS — industry-wide limitation, not a regression.
- **MED:** CSP `'unsafe-eval'` gated on `NODE_ENV==='development'` — add a startup assertion in `instrumentation.ts` to refuse `AUTH_URL` non-localhost + `NODE_ENV=development`.
- **MED:** `(workspace)/` and `(control)/` route groups have no `error.tsx`/`loading.tsx` — blank page on thrown server component errors.
- **MED:** `deploy-test-backends.sh:20-21` sources `.env` with `set -a` then uses `sshpass -p "$SSH_PASSWORD"` — exposes in process table. Prefer `sshpass -e`.
- **MED:** `deploy.sh:52` sources `.env.deploy` with `set -a; source` — exports all vars to subshells. Deprecation banner present; ensure `.env.deploy` is in `.gitignore`.
- **MED:** `deploy-docker.sh:280`, `deploy-test-backends.sh:81` use `rsync --delete`; excludes cover `.env*`/`data/`. Document and review the exclude list.
- **MED:** `tests/component/contest-quick-stats.test.tsx:60,88,105` use `await new Promise(resolve => setTimeout(resolve, 35))` instead of `vi.useFakeTimers()`.
- **LOW:** `src/components/seo/json-ld.tsx:9` — `JSON.stringify(data)` inside `<script type="application/ld+json">`. If `data` ever contains user strings with `</script>`, the tag closes early. Add a `.replace(/<\//g, '<\\/')`.
- **LOW:** `src/app/layout.tsx:101-111` — GA `gtag('config', '${GA_MEASUREMENT_ID}')` is nonce-protected; `GA_MEASUREMENT_ID` is build-time only. Acceptable.
- **LOW:** Sparse `<Suspense>` usage — performance only.
- **LOW:** `tests/e2e/debug-login.cjs` has 5 `waitForTimeout` of up to 5 s. Confirm it's excluded from CI matcher.
- **LOW:** CI `AUTH_URL` has a `secrets.AUTH_URL || 'http://localhost:3110'` fallback — fine for CI.

**Positive observations:** per-request nonce CSP with proper frame-ancestors / object-src / base-uri; DOMPurify-restricted allowlist with 15 OWASP-vector tests in `tests/unit/security/sanitize-html.test.ts`; server-side auth gates in `(workspace)`/`(control)` layouts; capability-based nav gating; `DestructiveActionDialog` used consistently; pre-deploy `pg_dump` snapshot; PGDATA volume safety check; all shell scripts `set -euo pipefail`; non-root Docker for app; Playwright `remoteSafeSpecs` allowlist prevents mutation tests against live; Vitest coverage tiered to 90 %+ for `security/**` and `auth/**`; integration tests each get a temp DB with migrations applied; rate-limit unit test simulates DB faithfully.

---

## 4. Cross-Cutting Observations

### 4.1 Cross-subsystem invariant breaks (highest-leverage fixes)

1. **Judge worker secrets are stored, validated, and transmitted inconsistently.**
   - `register` stores both `secretToken` and `secretTokenHash`.
   - `deregister` + `isJudgeAuthorizedForWorker` correctly use `secretTokenHash`.
   - `heartbeat` reads `secretToken` plaintext column — blocks migration.
   - `claim` has a backward-compat plaintext fallback.
   → single fix (one migration + three call sites) closes CRIT-1, CRIT-6, and MED plaintext-storage.

2. **`active_tasks` atomicity is defeated by heartbeat.**
   - Claim (`+1`) and poll (`GREATEST(... -1, 0)`) are atomic SQL expressions.
   - Heartbeat sets `activeTasks: worker.report` — always.
   → Either drop `activeTasks` from heartbeat entirely (let SQL be the source of truth), or add a conditional: update only if `worker.report > db.active_tasks` (upper-bound reconciliation).

3. **Score correctness across non-terminal statuses.**
   - `contest-scoring.computeContestRanking` and `submissions.getAssignmentStatusRows` both omit a status filter.
   - `pending`, `queued`, `judging`, `cancelled`, `internal_error` all contaminate ICPC penalty/attempt counters.
   → One shared WHERE clause constant (`TERMINAL_SUBMISSION_STATUSES`) applied across both queries.

4. **Handler wrapper discipline.**
   - `createApiHandler` provides auth, CSRF, rate limiting, Zod validation, error normalization, audit-friendly logging.
   - ~80/95 routes use it. The exceptions (overrides, file-by-id, several PATCH handlers) drift in predictable ways: manual `req.json()` without schema, 500 instead of 400, CSRF-before-auth ordering bugs, missing `rateLimit` keys.
   → Enforce via a lint rule or CI grep: `src/app/api/**/route.ts` files that export an async function named POST/PATCH/DELETE without `createApiHandler` require review comment.

5. **TS compiler path and Rust runner path must be kept in lock-step.**
   - Shell validator rules diverge (HIGH-9).
   - Memory-swap factor diverges (`4x` vs `1x`) (judge MED-9).
   - `docker inspect` timeout diverges (`5s` vs unbounded) (judge MED-4).
   → Pull the shared contract into a single source-of-truth constants module and import from both sides (language-config JSON schema validated at startup in both Rust and TS).

6. **Data-retention policy is split-brain.**
   - `pruneSensitiveOperationalData` handles chatMessages, antiCheatEvents, recruitingInvitations, submissions.
   - `loginEvents` has no retention.
   - `pruneOldAuditEvents` is on its own timer with its own hard-coded 90 d and ignores `DATA_RETENTION_LEGAL_HOLD`.
   → Unify into `data-retention-maintenance.ts`, respect legal hold uniformly, pull retention days from `DATA_RETENTION_DAYS` map.

### 4.2 Likely-correct-but-should-be-validated

- **HCaptcha `hostname` binding** (auth MED-3): industry practice is to validate `hostname` matches expected — trivial patch, low risk of regression.
- **Recruiting-invitation plaintext `token` column** (CRIT-6): verify no code path reads the plaintext for operational purposes (only creation flow returns it); if so, null it after creation.
- **`users.manage_roles` capability is dead** (auth LOW-8): either wire it up to `canManageRoleAsync` or remove it from the capability catalog.
- **`communityVotesRelations` is undefined** (db HIGH-7): no current call paths rely on it, but it's a latent foot-gun for a future `db.query.communityVotes.findMany({ with: { user: … } })`.

### 4.3 Positive patterns worth preserving

- Argon2id (19 MiB, t=2, p=1) with transparent bcrypt-to-argon2id migration on login.
- `safeTokenCompare` = HMAC + `timingSafeEqual` — no length leak.
- Atomic rate limiting via `SELECT … FOR UPDATE` with exponential-block backoff capped at `32×`.
- Dummy password hash to constant-time the "user not found" path.
- Per-request CSP nonces with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
- Dual-layer CSRF: `X-Requested-With` + `Origin` + `Sec-Fetch-Site`.
- API-key auth correctly skips CSRF.
- Atomic submission claim with a CTE that simultaneously bumps `active_tasks` and flips `status` via `FOR UPDATE SKIP LOCKED`.
- `--network=none`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--read-only`, `--user 65534:65534`, `--pids-limit 128`, `--init`, per-container tempdir, seccomp-profile default-deny.
- Dead-letter JSON persistence for un-reportable results.
- Vitest tiered coverage thresholds (security/auth ≥ 90 %).
- Shell scripts uniformly `set -euo pipefail`.
- Integration tests use ephemeral PG databases per test.
- Playwright `remoteSafeSpecs` allowlist prevents destructive specs from running against live deployments.

---

## 5. Recommended Remediation Order

**Week 1 (pre-release blockers):**
1. CRIT-1 / CRIT-6: migration to drop `secretToken`, `recruitingInvitations.token` plaintext columns; rewrite heartbeat to use `secretTokenHash`.
2. CRIT-2: replace localhost `X-Forwarded-For` check with `extractClientIp()`.
3. CRIT-3: `auth: true` on `accepted-solutions` route; scrub `userId` when anonymous.
4. CRIT-4: reorder CSRF-vs-auth on file DELETE; migrate to `createApiHandler`.
5. CRIT-5: add `DefaultBodyLimit::max(2 MiB)` to `runner.rs` router.
6. CRIT-8: add Bearer auth to `code-similarity-rs` and `rate-limiter-rs`; size-limit `/compute` bodies and submissions array.
7. CRIT-9: add `*.pem` / `*.key` / `*.p12` to `.dockerignore`; rotate key; prune image builder caches.
8. CRIT-7: add `loginEvents` to retention + `DATA_RETENTION_LEGAL_HOLD` guard on audit pruning.

**Week 2 (high-impact):**
9. HIGH-1: share submission-sanitization between GET and SSE routes.
10. HIGH-4: make SQL the source of truth for `active_tasks`; drop the heartbeat overwrite.
11. HIGH-5 / HIGH-6: add status-filter CTE and windowed `personal_deadline` join to scoring queries.
12. HIGH-2: harden `getSafeRedirectUrl` (backslash, CRLF, authority, URL parse).
13. HIGH-3: add error-recovery UX and consider server-side session rotation for password change.
14. HIGH-9 / HIGH-15: unify shell validators; move compile commands to array form where possible.
15. HIGH-12: move judge claim rate-limit into the centralized store.
16. HIGH-16: run one CI job end-to-end against PostgreSQL.
17. HIGH-17: set `BUILD=0 DELETE=0` on test-backends docker-proxy.
18. HIGH-10 / HIGH-11: finish the handler-wrapper migration (eliminate manual `req.json()`).
19. HIGH-18 / HIGH-19: replace `waitForTimeout`; add tests for access-code race, file upload traversal, admin IP allowlist, seccomp enforcement.
20. HIGH-20 / HIGH-22 / HIGH-23: add FK + index to `chatMessages.problemId`; decide cascade policy on `submissions.assignmentId`; add `(submittedAt, status)` composite index.

**Ongoing (cleanup):**
21. Medium / Low findings from each of the five subsystem reports.
22. Unify the TS/Rust compile-execution contract; eliminate divergent constants.

---

## 6. Artifact Files

Each subagent's raw report is preserved alongside this aggregated review:

- `./.context/reviews/wip-auth-security.md` — Auth / Session / Security (17 findings)
- `./.context/reviews/wip-judge-sandbox.md` — Judge / Sandbox / Rust services (33 findings)
- `./.context/reviews/wip-api-routes.md` — API routes & handlers (24 findings)
- `./.context/reviews/wip-db-logic.md` — DB schema & business logic (33 findings)
- `./.context/reviews/wip-frontend-deploy-tests.md` — Frontend, deploy, tests (34 findings)
- `./.context/reviews/comprehensive-code-review-2026-04-18.md` — This aggregate

Each raw report lists the files actually read and explicitly notes files skipped with reason. Cross-referenced coverage (confirmed by the orchestrator sweep):

- **All** `src/lib/auth/**` and `src/lib/security/**`
- **All** `src/lib/judge/**`, `src/lib/compiler/**`, `src/lib/docker/**`
- **All** `src/lib/assignments/**`, `src/lib/problem*/**`, `src/lib/submissions/**`, `src/lib/code-snapshots/**`, `src/lib/data-retention*`, `src/lib/audit/**`, `src/lib/system-settings*`, `src/lib/actions/**`, `src/lib/files/**`, `src/lib/discussions/**`, `src/lib/recruiting/**`, `src/lib/practice/**`, `src/lib/anti-cheat/**`
- **Every** `src/app/api/**/route.ts` (~95 files)
- **All** `judge-worker-rs/src/**` (main, executor, docker, runner, api, config, types, comparator, validation); first 200 lines of `languages.rs` (remainder is repetitive table data)
- **All** `rate-limiter-rs/src/**` and `code-similarity-rs/src/**`
- **All** top-level Dockerfiles; seccomp profile; 4 sample `docker/Dockerfile.judge-*` (python, cpp, node, bash) representing the ~100-file family (confirmed same pattern)
- **All** `deploy*.sh`, `scripts/*.sh`, `scripts/*.ts`, `scripts/*.mjs` except `scripts/algo-problems/*.mjs` (problem data generators, explicitly out of scope)
- **All** `.github/workflows/*`
- `.env.example`, `.env.production.example` (only — `.env*` secrets never opened per instructions)
- Representative spans of `tests/unit/**`, `tests/integration/**`, `tests/component/**`, `tests/e2e/**`

Files deliberately **not** read (documented in each `wip-*.md`):
- `messages/**` (i18n JSON, no logic)
- `public/**`, `static-site/**` (static assets)
- `drizzle/` migration SQL (reviewed via schema file instead)
- `.env`, `.env.production`, `.env.worv` (excluded per instructions)
- Individual Dockerfiles after pattern was established
- Root-level data-generation scripts (`gen_test_cases.mjs`, `verify-problems.mjs`, `dedup-problems.mjs`, `stress-tests.mjs`, `tle-test.mjs`, `verify_*.py`) — test/data tooling, out of scope

---

## 7. Summary Counts

| Severity | Auth | Judge | API | DB | FE/Deploy/Tests | **Aggregate** |
|---|---|---|---|---|---|---|
| Critical | 0 | 2 | 3 | 4 | 2 | **11 reported → 9 unique** |
| High | 2 | 5 | 5 | 8 | 8 | **28 reported → 23 unique** |
| Medium | 7 | 12 | 9 | 12 | 14 | **54 reported → 46 unique** |
| Low | 8 | 8 | 7 | 9 | 10 | **42 reported → 41 unique** |
| **Total** | **17** | **27*** | **24** | **33** | **34** | **~119 unique** |

\* Judge report also includes 6 Info/positive observations not counted.

**Overall verdict: REQUEST CHANGES.** 9 Critical findings gate any production deployment; 23 High findings should be resolved in the next sprint. No finding represents a catastrophic architectural flaw — the codebase is fundamentally well-engineered, and the issues above are tractable patches rather than redesigns.

---

## 8. Confidence & Limitations

- **High confidence** in findings with exact line citations and file excerpts (≈75 % of findings).
- **Medium confidence** for findings labeled "Likely" or "Needs-validation" — behavior inferred from code but not end-to-end reproduced; callers annotated.
- **Low confidence** for a few findings that depend on production runtime configuration (e.g., whether `AUTH_CACHE_TTL_MS` is ever set beyond 2 s, whether `PLAYWRIGHT_AUTH_TOKEN` ships in production).
- **Not exercised:** live runtime behavior (no tests were executed; no containers built); LLM-based plugin responses (chat-widget/* black-box); visual regression suite output; auto-review AI responses.

Re-run this review after any major refactor of: (a) the judge auth migration, (b) the handler-wrapper coverage push, (c) the data-retention consolidation, (d) the TS/Rust contract unification.

*End of review.*

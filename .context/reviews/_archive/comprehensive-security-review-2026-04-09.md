# Comprehensive Security Review — JudgeKit

**Date:** 2026-04-09
**Scope:** Full repository — authentication, authorization, API routes (87+), database layer, Rust microservices, Docker sandbox, deployment, frontend/client, CI/CD
**Method:** 5 parallel Opus-tier security review agents covering auth/security core, API routes, infrastructure/Rust, database/data integrity, and frontend/client
**Baseline verification:** `tsc --noEmit` ✅, `npm run lint` ✅ (0 errors, 3 warnings)

---

## Executive Summary

**Overall Assessment: GOOD with targeted improvements needed**

The codebase demonstrates strong security fundamentals: Argon2id password hashing, timing-safe token comparisons, Docker sandboxing with seccomp/capabilities/network isolation, parameterized SQL via Drizzle ORM, nonce-based CSP, CSRF protection, and comprehensive audit logging. Prior remediation passes (6 rounds) have resolved the majority of critical issues.

This review identifies **remaining** issues organized by severity after deduplication across all 5 review lanes.

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 12 |
| MEDIUM | 18 |
| LOW | 12 |
| **Total** | **44** |

---

## CRITICAL Issues (Fix Immediately)

### C-01. Production Secrets in Plaintext `.env` Files on Disk

**Lane:** API Routes
**Files:** `.env`, `.env.production`, `.env.deploy`, `.env.worv`
**Confidence:** Confirmed

Multiple `.env` files contain real production secrets (AUTH_SECRET, JUDGE_AUTH_TOKEN, POSTGRES_PASSWORD, SSH_PASSWORD, admin passwords). While `.gitignore` excludes them from git, they exist on every machine that syncs this workspace directory.

**Fix:** Rotate all secrets immediately. Move production credentials to a vault or encrypted store. Add pre-commit hook scanning for high-entropy strings.

---

### C-02. Rust Judge Worker Executor Has No Docker Image Validation

**Lane:** Infrastructure
**File:** `judge-worker-rs/src/executor.rs:35-37`
**Confidence:** High

The executor accepts `submission.docker_image` from the API response (originating from DB language config) and passes it directly to `docker run` without any validation. The TypeScript `execute.ts` has `validateDockerImage()` with a `TRUSTED_DOCKER_REGISTRIES` allowlist, and the Rust runner has `validate_docker_image()`, but the polling executor has none. A compromised admin or upstream SQL injection could cause the worker to pull and execute an arbitrary attacker-controlled image.

**Fix:** Add `validate_docker_image()` matching the runner's implementation before executing any container.

---

## HIGH Issues

### H-01. Login Rate Limit TOCTOU Race Condition

**Lane:** Auth Core
**Files:** `src/lib/security/rate-limit.ts:62-100`, `src/lib/auth/config.ts:175-183`
**Confidence:** High

The login flow performs `isAnyKeyRateLimited()` (read) separately from `recordRateLimitFailureMulti()` (write). These are not atomic. The `getEntry` function uses a plain SELECT without `FOR UPDATE`. Concurrent login attempts all pass the check before any records a failure, multiplying the effective rate limit by the concurrency factor.

**Fix:** Use atomic check-and-increment in a single transaction with `SELECT FOR UPDATE`, matching the pattern in `consumeApiRateLimit` (`api-rate-limit.ts:36-90`).

---

### H-02. Inconsistent IP Extraction Across Routes

**Lane:** Auth Core + API Routes
**Files:** `src/app/api/v1/submissions/route.ts:203`, `src/app/api/v1/contests/join/route.ts:17`, `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:86,95`, `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts:38`
**Confidence:** High

Several routes extract IP from `req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()` instead of using the centralized `extractClientIp()` which correctly handles trusted proxy hops. The first entry of `X-Forwarded-For` is attacker-controlled.

**Fix:** Replace all instances with `extractClientIp(req.headers)`.

---

### H-03. Rust Runner Auth Token Comparison Is Not Constant-Time

**Lane:** Infrastructure
**File:** `judge-worker-rs/src/runner.rs:102`
**Confidence:** High

The runner's `check_auth` uses direct string equality (`token != config.auth_token.expose()`). The TypeScript side correctly uses `timingSafeEqual`. An attacker who can measure response times could recover the token byte-by-byte.

**Fix:** Use `subtle::ConstantTimeEq` for the comparison.

---

### H-04. Judge Worker Container Has SYS_ADMIN + apparmor:unconfined in Production

**Lane:** Infrastructure
**File:** `docker-compose.production.yml:111-113`
**Confidence:** High

The judge-worker container is granted `CAP_SYS_ADMIN` with AppArmor disabled. Since the production compose already routes Docker through `tcp://docker-proxy:2375`, the worker should not need these elevated capabilities. If student code escapes the sandbox, SYS_ADMIN provides a clear path to host compromise.

**Fix:** Remove `cap_add: SYS_ADMIN` and `apparmor:unconfined` from the judge-worker service. Test thoroughly.

---

### H-05. Database Export Leaks OAuth Tokens and Encrypted API Keys

**Lane:** DB/Data
**File:** `src/lib/db/export.ts:227-230`
**Confidence:** High

`REDACTED_COLUMNS` only redacts `users.passwordHash` and `judgeWorkers.secretToken`. It does not redact `accounts.refresh_token`/`access_token`/`id_token` or `apiKeys.encryptedKey`. An exported backup contains all OAuth tokens in plaintext.

**Fix:** Add `accounts` and `apiKeys` sensitive columns to `REDACTED_COLUMNS`.

---

### H-06. Migrate/Import Endpoint Lacks Password Re-confirmation

**Lane:** DB/Data
**File:** `src/app/api/v1/admin/migrate/import/route.ts:50-132`
**Confidence:** High

The `/admin/restore` route correctly requires password re-confirmation before destructive operations. The `/admin/migrate/import` route performs the same `importDatabase()` but has no password verification. A compromised super_admin session can silently replace all data.

**Fix:** Add the same password verification used in the restore route.

---

### H-07. Migrate/Export GET Route Vulnerable to Cross-Origin Exfiltration

**Lane:** DB/Data + API Routes
**File:** `src/app/api/v1/admin/migrate/export/route.ts:10-47`
**Confidence:** High

The export endpoint uses GET (which carries cookies automatically). The `csrfForbidden()` check on GET is a no-op (CSRF validators skip safe methods). A malicious page visited by a super_admin can trigger a full database dump via `<img>` tag or `fetch()`.

**Fix:** Change to POST with password re-confirmation, matching the backup route pattern.

---

### H-08. Test Backends Compose Mounts Docker Socket Directly

**Lane:** Infrastructure
**File:** `docker-compose.test-backends.yml:66,92,122,154`
**Confidence:** High

The test-backends compose mounts `/var/run/docker.sock` directly into containers without the `:ro` flag and without the docker-socket-proxy used in production. Any vulnerability becomes full host compromise.

**Fix:** Add a docker-proxy service matching the production pattern. At minimum, mount `:ro`.

---

### H-09. deploy.sh Sets /compiler-workspaces to chmod 1777

**Lane:** Infrastructure
**File:** `deploy.sh:119`
**Confidence:** High

World-writable sticky bit allows any process on the host to read/write all workspace files, enabling cross-container source code leakage and submission tampering.

**Fix:** `chmod 750` with `chown root:docker`.

---

### H-10. Deployment Scripts Leak Database Password into Shell Commands

**Lane:** Infrastructure
**File:** `deploy-docker.sh:363-399`
**Confidence:** High

`PGPASSWORD` is interpolated directly into `docker run` commands, visible in `ps aux` and shell history.

**Fix:** Pass via `--env-file` or Docker secrets instead of command-line interpolation.

---

### H-11. Chat Widget Prompt Injection via User-Controlled Context

**Lane:** Frontend
**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:119-129`, `src/app/api/v1/plugins/chat-widget/chat/route.ts:260-308`
**Confidence:** High

User messages are sent to the LLM alongside admin-configurable system prompts without injection mitigation. A student can craft messages to override system instructions and extract full solutions. Tool authorization (checking `context.userId`) provides some protection, but behavioral guardrails are trivially bypassed.

**Fix:** Add clear delimiters between platform/admin/user content. Implement output filtering for source code solutions.

---

### H-12. Chat Widget Tool Bypasses Group-Scoped Access Check

**Lane:** Third-pass review (verified still open)
**File:** `src/lib/plugins/chat-widget/tools.ts:170`
**Confidence:** High

`handleGetSubmissionDetail` uses `canViewAllSubmissions(context.userRole)` (role-level check) instead of `canAccessSubmission()` (group-scoped check). An instructor can access submissions from groups they don't manage.

**Fix:** Replace with `canAccessSubmission()`.

---

## MEDIUM Issues

### M-01. Auth Cache Serves Stale Results for 2s After User Deactivation

**File:** `src/proxy.ts:14-36` | **Confidence:** High

### M-02. No Network Isolation Between Compose Services

**File:** `docker-compose.production.yml` | **Confidence:** High

All services on default bridge network. Compromise of code-similarity container (no auth) gives direct PostgreSQL and docker-proxy access.

### M-03. Code Similarity Service Has No Authentication

**File:** `code-similarity-rs/src/main.rs:24` | **Confidence:** High

### M-04. Rate Limiter /reset Endpoint Has No Authentication

**File:** `rate-limiter-rs/src/main.rs:240-246` | **Confidence:** High

### M-05. Nginx Configs Missing Security Headers

**File:** `scripts/online-judge.nginx.conf` | **Confidence:** High

Missing `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`.

### M-06. SSH StrictHostKeyChecking=accept-new on First Connection

**Files:** `deploy-docker.sh:135`, `deploy.sh:25`, `deploy-test-backends.sh:41` | **Confidence:** Medium

### M-07. Seccomp Profile Allows Networking Syscalls Despite --network none

**File:** `docker/seccomp-profile.json` | **Confidence:** Medium

### M-08. `accounts` Table Missing Unique Constraint on (provider, providerAccountId)

**File:** `src/lib/db/schema.pg.ts:66-83` | **Confidence:** High

### M-09. Audit Buffer Can Lose Events on Ungraceful Shutdown (SIGKILL/OOM)

**File:** `src/lib/audit/events.ts:84-160` | **Confidence:** Medium

### M-10. Cleanup DELETE Unbounded — OOM Risk on Large Tables

**File:** `src/lib/db/cleanup.ts:7-27` | **Confidence:** Medium

### M-11. Import Replaces Current User's Credentials (Self-Lockout Risk)

**File:** `src/lib/db/import.ts:125-222` | **Confidence:** High

### M-12. `codeSnapshots` Table Excluded from Backup/Restore

**File:** `src/lib/db/export.ts:151-193` | **Confidence:** High

Backups silently drop all code snapshot data used for anti-cheat forensics.

### M-13. Docker Image Tag Validation Allows Arbitrary Registry Pulls

**File:** `src/lib/docker/client.ts:49` | **Confidence:** Medium

`evil.com/judge-trojan:latest` passes the current validation.

### M-14. Plugin Admin GET Returns Decrypted API Keys to All Admins

**File:** `src/app/api/v1/admin/plugins/route.ts:12-14` | **Confidence:** High

### M-15. Exam Countdown Timer Client-Side Only (Server Enforcement Required)

**File:** `src/components/exam/countdown-timer.tsx` | **Confidence:** High

### M-16. Anti-Cheat Monitor Trivially Bypassed Client-Side

**File:** `src/components/exam/anti-cheat-monitor.tsx` | **Confidence:** High

### M-17. Source Code Persisted in localStorage Without Exam-Mode Cleanup

**File:** `src/hooks/use-source-draft.ts:161-200` | **Confidence:** Medium

### M-18. `style-src 'unsafe-inline'` in CSP

**File:** `src/proxy.ts:69`, `next.config.ts:43` | **Confidence:** High

Known tradeoff for CSS-in-JS. No immediate action required.

---

## LOW Issues

### L-01. Workspace Permissions 0o777 in Rust Worker
### L-02. CI Missing `cargo audit` / `npm audit` Steps
### L-03. Dockerfile.judge-worker Uses Unpinned `rust:1-alpine`
### L-04. Backup Script Doesn't Verify Backup Before Retention Delete
### L-05. setup.sh Exposes Admin Password in Process Listing
### L-06. `chatMessages` CASCADE Delete Loses AI Usage Audit Trail
### L-07. `recruitingInvitations.createdBy` Missing `onDelete` Clause
### L-08. Tags LIKE Escape Missing Backslash
### L-09. File Download Content-Disposition Missing RFC 5987 Encoding
### L-10. esbuild Moderate Vulnerability (Dev-Only)
### L-11. Test Seed Endpoint Stale Comment (References bcrypt)
### L-12. Production Source Maps Controllable via Environment Variable

---

## Positive Security Observations

The codebase demonstrates strong security engineering across multiple dimensions:

1. **Argon2id password hashing** with OWASP parameters + transparent bcrypt migration
2. **Timing-safe token comparison** using HMAC + `timingSafeEqual` throughout
3. **Docker sandboxing** — `--network none`, `--read-only`, `--cap-drop=ALL`, `--no-new-privileges`, seccomp profiles, tmpfs mounts, PID/memory limits
4. **Per-request CSP nonces** with `crypto.randomBytes(16)` for script-src
5. **CSRF defense** via `X-Requested-With` + `Sec-Fetch-Site` + `Origin` validation
6. **SQL injection prevention** — all queries parameterized via Drizzle ORM; raw SQL uses named parameter conversion
7. **Session security** — HttpOnly cookies, SameSite=Lax, `tokenInvalidatedAt` for forced logout
8. **Comprehensive audit logging** with batch insertion reducing DB load
9. **Advisory locks** on submission creation preventing rate limit TOCTOU
10. **Judge claim** uses `FOR UPDATE SKIP LOCKED` for race-free submission claiming
11. **Recruiting token** uses transactional conditional UPDATE for race-safe redemption
12. **File storage** prevents path traversal via `resolveStoredPath()`
13. **Docker socket proxy** restricts container API access in production
14. **Plugin secrets** use AES-256-GCM with dedicated encryption key (no fallback)
15. **Role hierarchy** enforcement prevents self-promotion

---

## Priority Remediation Plan

### Phase 1 — Immediate (Before Next Deploy)

| ID | Description | Effort |
|----|-------------|--------|
| C-01 | Rotate all production secrets | Ops |
| C-02 | Add docker image validation in Rust executor | Small |
| H-03 | Constant-time auth in Rust runner | Small |
| H-05 | Redact OAuth tokens in export | Small |
| H-07 | Change migrate/export to POST with password | Small |
| H-12 | Fix chat tool group-scoped access | Small |

### Phase 2 — This Sprint (Data Integrity + Access Control)

| ID | Description | Effort |
|----|-------------|--------|
| H-01 | Atomic login rate limit check | Medium |
| H-02 | Use extractClientIp() everywhere | Small |
| H-04 | Remove SYS_ADMIN from production compose | Small |
| H-06 | Add password re-confirm to migrate/import | Small |
| H-08 | Add docker-proxy to test compose | Small |
| M-02 | Add network isolation to production compose | Medium |
| M-03 | Add auth to code-similarity service | Small |
| M-04 | Add auth to rate-limiter /reset | Small |
| M-12 | Add codeSnapshots to TABLE_ORDER | Small |

### Phase 3 — Next Sprint (Hardening)

| ID | Description | Effort |
|----|-------------|--------|
| H-09 | Fix workspace permissions in deploy.sh | Small |
| H-10 | Fix DB password leak in deploy scripts | Small |
| H-11 | Add prompt injection mitigations to chat | Medium |
| M-05 | Add security headers to nginx | Small |
| M-08 | Add unique constraint on accounts | Small |
| M-13 | Restrict docker image tag to known registries | Small |
| M-14 | Redact plugin API keys in list endpoint | Small |

---

## Review Coverage Confirmation

- [x] Authentication flow (login, session, password, tokens)
- [x] Authorization (roles, capabilities, groups, custom roles)
- [x] Rate limiting (login, API, submission, recruiting)
- [x] CSRF/CSP/cookie security
- [x] All 87+ API route handlers
- [x] Database schema, indexes, constraints, cascades
- [x] Import/export/backup/restore
- [x] Docker container sandbox (execute.ts)
- [x] Rust services (judge-worker, code-similarity, rate-limiter)
- [x] Deployment scripts (SSH, secrets, compose)
- [x] CI/CD pipeline
- [x] Nginx configuration
- [x] Frontend XSS vectors
- [x] Exam integrity (timer, anti-cheat)
- [x] Plugin system (chat widget, secrets)
- [x] File upload/download/storage
- [x] Client-side state management

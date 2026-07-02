# Cycle 3 (2026-07-03) Multi-Agent Aggregate Review

**Date:** 2026-07-02
**Scope:** /tmp/judgekit-local — full stack (Next.js app, Rust judge worker and sidecars, Docker/deployment, tests, docs, UI).
**Sources:** 11 per-agent review files under `.context/reviews/`.

## Executive Summary

This aggregate merges the outputs of code-reviewer, perf-reviewer, security-reviewer, critic, verifier, test-engineer, tracer, architect, debugger, document-specialist, and designer.
After deduplication, **168 unique findings** remain: 8 CRITICAL, 50 HIGH, 78 MEDIUM, 32 LOW.
Cross-agent agreement is strongest on the production-default risks (`AUTH_TRUST_HOST=true`, judge IP allowlist open-by-default), unbounded resource hot paths (SSE, file uploads, compiler queue), and missing rate limits on file endpoints.
Many Cycle 3 remediation items are already implemented in the current working tree; those are listed in the **Implemented / Verified** section below.

**Important caveats:**
- The **verifier** incorrectly marked several items as fixed in its review. The raw `secret_token` backfill block is still present in `deploy-docker.sh:1208-1293`; the committed `scripts/online-judge.nginx.conf` still caps the catch-all `location /` at `1m`; and the workspace cleanup logic exists but does not work for non-root production users. These remain active findings.
- No review file was empty or malformed; all 11 agents completed successfully.

## Findings Register

| ID | Severity | Confidence | Sources | Files | Title | Status |
|---|---|---|---|---|---|---|
| C3-001 | CRITICAL | High | critic | (see source review) | CRITICAL-1: Production defaults to `AUTH_TRUST_HOST=true` and nginx does not strip `X-Forwarded-Host` | Open |
| C3-002 | CRITICAL | High | critic | (see source review) | CRITICAL-2: Internal service traffic is unencrypted HTTP on a segmented but flat Docker network | Open |
| C3-003 | CRITICAL | High | critic | (see source review) | CRITICAL-3: Judge API IP allowlist defaults to allow-all in production | Open |
| C3-004 | CRITICAL | High | critic | (see source review) | CRITICAL-4: Raw SQL additive schema patch bypasses the Drizzle migration journal | Open |
| C3-005 | CRITICAL | High | verifier | (see source review) | 2. Generated nginx `location /` lacks `client_max_body_size`, breaking uploads >1 MiB | Open |
| C3-006 | CRITICAL | High | test-engineer | (see source review) | 1. CRITICAL: Integration tests are almost entirely skipped in default CI | Open |
| C3-007 | CRITICAL | High | debugger | (see source review) | 1. Workspace cleanup still leaks in production — Node.js local fallback relies on impossible `chown` | Open |
| C3-008 | CRITICAL | High | debugger | (see source review) | 2. Workspace cleanup still leaks in production — Rust worker `SandboxWorkspace::drop` has the same flaw | Open |
| C3-009 | HIGH | Medium | code-reviewer | `src/lib/db/import.ts:87-89` | Database import corrupts exported boolean strings (`"false"` → `true`) | Open |
| C3-010 | HIGH | Medium | code-reviewer | `src/lib/realtime/realtime-coordination.ts:101` | All SSE connection acquisitions are serialized on a single advisory lock | Open |
| C3-011 | HIGH | Medium | code-reviewer | `src/app/api/v1/files/route.ts:155-208` | File listing endpoint has no rate limiting | Open |
| C3-012 | HIGH | Medium | code-reviewer | `src/lib/api/handler.ts:288-310` | `createApiHandler` swallows details for unhandled exceptions | Open |
| C3-013 | HIGH | High | security-reviewer | `src/lib/security/env.ts:260-266`, `src/lib/auth/config.ts:317`, `docker-compose.production.yml:115`, `deploy-docker.sh:750,878,952` | `AUTH_TRUST_HOST` is hardcoded/enforced to `true` in production | Open |
| C3-014 | HIGH | High | security-reviewer | `src/lib/judge/ip-allowlist.ts:17-25,213-241`; `.env.production.example` (no default `JUDGE_ALLOWED_IPS`); `src/app/api/v1/judge/register/route.ts:27-41` | Judge API IP allowlist defaults to allow-all | Open |
| C3-015 | HIGH | High | critic | (see source review) | HIGH-1: Real-time coordination serializes every SSE acquisition and heartbeat through PostgreSQL advisory locks | Open |
| C3-016 | HIGH | High | critic | (see source review) | HIGH-2: Docker socket proxy still grants broad container lifecycle privileges | Open |
| C3-017 | HIGH | High | critic | (see source review) | HIGH-3: `deploy-docker.sh` exceeds modularization threshold and couples unrelated concerns | Open |
| C3-018 | HIGH | High | critic | (see source review) | HIGH-4: Rate-limiting has two sources of truth (sidecar + DB) | Open |
| C3-019 | HIGH | Medium | critic | (see source review) | HIGH-5: Role/capability authorization is split across role names and capability strings | Open |
| C3-020 | HIGH | High | critic | (see source review) | HIGH-6: Standalone nginx template still uses `client_max_body_size 1m` in catch-all `location /` | Open |
| C3-021 | HIGH | High | critic | (see source review) | HIGH-7: Admin restore/import responses still leak server-side snapshot path | Open |
| C3-022 | HIGH | High | critic | (see source review) | HIGH-8: `GET /api/v1/files` has no rate limit | Open |
| C3-023 | HIGH | High | critic | (see source review) | HIGH-9: Language configuration remains triplicated with only a partial contract test | Open |
| C3-024 | HIGH | Medium | critic | (see source review) | HIGH-10: Function-judging literal values are not validated against target-language ranges | Open |
| C3-025 | HIGH | High | verifier | (see source review) | 1. Nginx template/config mismatch: committed templates overwrite X-Forwarded-For | Open |
| C3-026 | HIGH | High | verifier | (see source review) | 3. `AUTH_TRUST_HOST=true` is the production default | Open |
| C3-027 | HIGH | High | verifier | (see source review) | 4. Judge API IP allowlist defaults to allow-all in production | Open |
| C3-028 | HIGH | High | test-engineer | (see source review) | 2. HIGH: `GET /api/v1/files` has no rate-limit test | Open |
| C3-029 | HIGH | High | test-engineer | (see source review) | 3. HIGH: Rust sidecars have no behavioral test harness in the TypeScript suite | Open |
| C3-030 | HIGH | High | test-engineer | (see source review) | 4. HIGH: Route tests mock `createApiHandler` instead of exercising it | Open |
| C3-031 | HIGH | High | test-engineer | (see source review) | 5. HIGH: `forgot-password` and public auth routes have CSRF tests but no rate-limit or abuse tests | Open |
| C3-032 | HIGH | High | test-engineer | (see source review) | 6. HIGH: No test verifies the request-ID / correlation-ID behavior on real routes | Open |
| C3-033 | HIGH | High | test-engineer | (see source review) | 7. HIGH: Source-grep tests dominate infra and security verification | Open |
| C3-034 | HIGH | Medium | test-engineer | (see source review) | 8. HIGH: No test exercises `AbortSignal.any` composition in `computeSimilarityRust` | Open |
| C3-035 | HIGH | High | tracer | (see source review) | T-JUDGE-2: In-progress reports reset `judgeClaimedAt`, allowing a worker to extend a claim indefinitely. | Open |
| C3-036 | HIGH | High | tracer | (see source review) | T-AUTH-1: `createApiHandler` role check rejects custom roles via `isUserRole()`, breaking `auth.roles` for non-built-in roles. | Open |
| C3-037 | HIGH | High | tracer | (see source review) | T-DEPLOY-7: Fresh production deployments set neither `JUDGE_ALLOWED_IPS` nor `JUDGE_STRICT_IP_ALLOWLIST`, so judge API allowlist is open to all IPs. | Open |
| C3-038 | HIGH | High | tracer | (see source review) | T-DEPLOY-4: `AUTH_TRUST_HOST=true` in production; nginx does not strip a client-supplied `X-Forwarded-Host`. | Open |
| C3-039 | HIGH | High | tracer | (see source review) | T-FILES-1: `GET /api/v1/files/[id]` loads the entire file into memory and has no rate limit. | Open |
| C3-040 | HIGH | High | tracer | (see source review) | RT-1: SSE connection acquisition uses a single global PostgreSQL advisory lock. | Open |
| C3-041 | HIGH | Medium | tracer | (see source review) | SIM-1: Rust sidecar `spawn_blocking` task is not cancellable; client disconnect leaves CPU pinned. | Open |
| C3-042 | HIGH | High | tracer | (see source review) | DEPLOY-3: Migration containers run unpinned `npm install --no-save drizzle-kit ...` with full DB secrets. | Open |
| C3-043 | HIGH | Medium | tracer | (see source review) | DEPLOY-5: `deploy-test-backends.sh` can stop the production compose stack without a production guard. | Open |
| C3-044 | HIGH | Medium | tracer | (see source review) | DEPLOY-6: `pg-volume-safety-check.sh` auto-migrate uses `rm -rf ${NAMED_SRC}/*` without path validation. | Open |
| C3-045 | HIGH | Medium | tracer | (see source review) | DEPLOY-7: Legacy `deploy.sh` remains executable and bypasses hardened deploy path. | Open |
| C3-046 | HIGH | High | architect | (see source review) | 1. PostgreSQL advisory locks are used for real-time coordination and similarity-check serialization | Open |
| C3-047 | HIGH | High | architect | (see source review) | 2. Language configuration is triplicated with no generated contract | Open |
| C3-048 | HIGH | High | architect | (see source review) | 3. `deploy-docker.sh` is a single monolithic script with no per-phase rollback | Open |
| C3-049 | HIGH | High | architect | (see source review) | 4. Internal service traffic is unencrypted HTTP on shared Docker bridge networks | Open |
| C3-050 | HIGH | High | architect | (see source review) | 5. `AUTH_TRUST_HOST` defaults to `true` in production | Open |
| C3-051 | HIGH | High | architect | (see source review) | 6. Judge API IP allowlist defaults to allow-all unless explicitly configured | Open |
| C3-052 | HIGH | High | architect | (see source review) | 7. Raw SQL additive patches bypass the Drizzle migration journal | Open |
| C3-053 | HIGH | High | architect | (see source review) | 10. Docker socket proxy still grants broad container lifecycle privileges | Open |
| C3-054 | HIGH | Medium | debugger | (see source review) | 3. `buildDockerImageLocal` leaves a running `docker build` process on timeout | Open |
| C3-055 | HIGH | Medium | debugger | (see source review) | 4. Backup restore keeps all uploaded files in memory before writing to disk | Open |
| C3-056 | HIGH | Low | debugger | (see source review) | 12. `TRUSTED_PROXY_HOPS` default may be unset in production | Open |
| C3-057 | HIGH | High | designer | (see source review) | 1. Empty `<SelectValue />` shows raw option values | Open |
| C3-058 | HIGH | High | designer | (see source review) | 2. Form labels not associated with their controls | Open |
| C3-059 | MEDIUM | Medium | code-reviewer | `src/lib/security/csrf.ts:7-30`, `src/lib/security/env.ts:213-252` | CSRF check performs a database read on every mutation | Open |
| C3-060 | MEDIUM | Medium | code-reviewer | `src/lib/compiler/execute.ts:187-277` | Shell validators still wrap commands in `sh -c` and the prefix whitelist is bypassable | Open |
| C3-061 | MEDIUM | Medium | code-reviewer | `src/lib/system-settings-config.ts:90-109` | Environment integer parsing accepts malformed strings (`"10abc"` → `10`) | Open |
| C3-062 | MEDIUM | Medium | code-reviewer | `src/lib/judge/ip-allowlist.ts:24-55`, `213-232` | Judge IP allowlist defaults to allow-all when unset | Open |
| C3-063 | MEDIUM | Medium | code-reviewer | `src/lib/system-settings-config.ts:162-173` | `getConfiguredSettings` is synchronous and can return stale values across instances | Open |
| C3-064 | MEDIUM | Medium | code-reviewer | (see source review) | Unsafe type casts proliferate in boundary layers | Open |
| C3-065 | MEDIUM | High | security-reviewer | `src/app/api/v1/files/route.ts:155-208` | `GET /api/v1/files` has no rate limit | Open |
| C3-066 | MEDIUM | High | security-reviewer | `src/app/api/v1/admin/restore/route.ts:170,196,207,229,239`; `src/app/api/v1/admin/migrate/import/route.ts:115,141` | Admin restore/import responses leak server-side snapshot path | Open |
| C3-067 | MEDIUM | High | security-reviewer | `deploy-docker.sh:1208-1291` | Deploy script still contains a raw SQL backfill/drop block | Open |
| C3-068 | MEDIUM | Medium | security-reviewer | `docker-compose.production.yml:116-118,151`; `judge-worker-rs/src/config.rs` | Internal service traffic is unencrypted HTTP | Open |
| C3-069 | MEDIUM | High | critic | (see source review) | MEDIUM-1: Deployment/infrastructure tests verify string presence, not rendered behavior | Open |
| C3-070 | MEDIUM | High | critic | (see source review) | MEDIUM-2: Deprecated migrate/import JSON path still accepts password in request body | Open |
| C3-071 | MEDIUM | Medium | critic | (see source review) | MEDIUM-3: Unit of work / transaction boundary discipline is inconsistent | Open |
| C3-072 | MEDIUM | Medium | critic | (see source review) | MEDIUM-4: Docker Compose lacks explicit bridge isolation from host networks | Open |
| C3-073 | MEDIUM | High | critic | (see source review) | MEDIUM-5: No documented operational rollback runbook for `deploy-docker.sh` | Open |
| C3-074 | MEDIUM | Medium | critic | (see source review) | MEDIUM-6: Judge worker IP allowlist auto-population is missing | Open |
| C3-075 | MEDIUM | High | critic | (see source review) | MEDIUM-7: Container lifecycle audit logging is absent | Open |
| C3-076 | MEDIUM | High | critic | (see source review) | MEDIUM-8: `AUTH_TRUST_HOST=true` comment conflates reverse-proxy use with trusting arbitrary Host headers | Open |
| C3-077 | MEDIUM | Medium | critic | (see source review) | MEDIUM-9: Real-time coordination warns but does not fail when multi-instance is undeclared | Open |
| C3-078 | MEDIUM | High | verifier | (see source review) | 5. PID limits do not match the documented phase split | Open |
| C3-079 | MEDIUM | High | verifier | (see source review) | 6. Judge-container DNS hardening is documented but not implemented | Open |
| C3-080 | MEDIUM | High | verifier | (see source review) | 7. `roc` language support is inconsistent across the stack | Open |
| C3-081 | MEDIUM | High | verifier | (see source review) | 9. Deployment/infrastructure tests verify string presence, not behavior | Open |
| C3-082 | MEDIUM | Medium | verifier | (see source review) | 10. Many env vars are referenced in code but missing from `.env.example` | Open |
| C3-083 | MEDIUM | High | test-engineer | (see source review) | 9. MEDIUM: Race-condition tests are mostly source-grep | Open |
| C3-084 | MEDIUM | High | test-engineer | (see source review) | 10. MEDIUM: `workspace leak regression` test in `execute.test.ts` is root-gated | Open |
| C3-085 | MEDIUM | High | test-engineer | (see source review) | 11. MEDIUM: No tests for the fallback path when `getTrustedAuthHosts` returns empty in production | Open |
| C3-086 | MEDIUM | High | test-engineer | (see source review) | 12. MEDIUM: No behavioral test for token invalidation millisecond precision | Open |
| C3-087 | MEDIUM | Medium | test-engineer | (see source review) | 13. MEDIUM: Many API routes without rate-limit keys have no tests explaining why | Open |
| C3-088 | MEDIUM | Medium | test-engineer | (see source review) | L1. Flaky timing in `similarity-check.route.test.ts` | Open |
| C3-089 | MEDIUM | Medium | test-engineer | (see source review) | L2. `waitFor` loops in component tests may be brittle under CI load | Open |
| C3-090 | MEDIUM | High | test-engineer | (see source review) | L4. Property-based/fuzz tests are missing for input validators and serialization | Open |
| C3-091 | MEDIUM | Medium | tracer | (see source review) | SUB-1: Global pending-queue cap is checked without a global lock, allowing cross-user races to exceed `maxGlobalQueue`. | Open |
| C3-092 | MEDIUM | Medium | tracer | (see source review) | RT-2: `releaseSharedSseConnectionSlot` deletes rows without acquiring the advisory lock used by acquisition. | Open |
| C3-093 | MEDIUM | High | tracer | (see source review) | RATE-1: Sidecar `allowed=false` verdict returns 429 without recording the attempt in Postgres. | Open |
| C3-094 | MEDIUM | High | tracer | (see source review) | RATE-2: Sidecar `/check` increments its own counter, duplicating the authoritative DB increment. | Open |
| C3-095 | MEDIUM | Medium | tracer | (see source review) | COMP-1: `/api/v1/compiler/run` has no overall request timeout; runner connect can hang for up to 2 minutes. | Open |
| C3-096 | MEDIUM | Medium | tracer | (see source review) | COMP-2: Rust runner `/run` does not check `docker_capability_ok` before accepting work. | Open |
| C3-097 | MEDIUM | High | tracer | (see source review) | JOIN-1: Per-user failure limiter runs before per-code limiter, giving multi-account attackers N independent budgets. | Open |
| C3-098 | MEDIUM | High | tracer | (see source review) | JOIN-2: Failure-rate-limit buckets are never reset on a successful redemption. | Open |
| C3-099 | MEDIUM | High | tracer | (see source review) | IP-RL-1: Missing/short XFF collapses traffic into the shared `api:*:unknown` bucket. | Open |
| C3-100 | MEDIUM | High | tracer | (see source review) | SIM-2: Raw CTE query is not abort-aware and runs inside the 30 s route budget. | Open |
| C3-101 | MEDIUM | High | tracer | (see source review) | SIM-3: Advisory lock covers only the delete+insert store, not the read+compute phase. | Open |
| C3-102 | MEDIUM | Medium | tracer | (see source review) | SIM-4: Capability check precedes group-TA check; pure group TA without the capability is denied. | Open |
| C3-103 | MEDIUM | High | tracer | (see source review) | AUTH-3: Role/capability cache is module-local with no cross-instance invalidation. | Open |
| C3-104 | MEDIUM | High | tracer | (see source review) | AUTH-4: CSRF check reads `allowedHosts` from the DB on every mutation. | Open |
| C3-105 | MEDIUM | High | tracer | (see source review) | AUTH-5: Generic 500 catch-all returns identical `internalServerError` for all unhandled exceptions. | Open |
| C3-106 | MEDIUM | High | tracer | (see source review) | FILES-2: `GET /api/v1/files` (list) has no `rateLimit` key and performs expensive `COUNT(*) OVER()` + `LIKE` search. | Open |
| C3-107 | MEDIUM | Medium | tracer | (see source review) | T-JUDGE-3: Runner HTTP server handle is aborted during shutdown without draining in-flight `/run` requests. | Open |
| C3-108 | MEDIUM | Medium | tracer | (see source review) | DEPLOY-8: Deploy is not atomic: old containers are stopped before migrations/health checks pass; no auto-rollback. | Open |
| C3-109 | MEDIUM | Medium | tracer | (see source review) | DEPLOY-9: Worker sync excludes `.env*` and only upserts `JUDGE_BASE_URL`; worker tokens may be missing on fresh hosts. | Open |
| C3-110 | MEDIUM | High | tracer | (see source review) | DEPLOY-10: Committed `scripts/online-judge.nginx.conf` still sets `client_max_body_size 1m` in catch-all `location /`. | Open |
| C3-111 | MEDIUM | Medium | tracer | (see source review) | DEPLOY-11: No `stop_grace_period` in compose; Docker kills containers after 10 s. | Open |
| C3-112 | MEDIUM | Medium | tracer | (see source review) | DEPLOY-12: Raw SQL additive patches (`secret_token` backfill/drop) bypass the Drizzle migration journal. | Open |
| C3-113 | MEDIUM | Medium | tracer | (see source review) | DEPLOY-13: Post-deploy Playwright smoke runs after all remote mutations; failure leaves broken state live. | Open |
| C3-114 | MEDIUM | Medium | tracer | (see source review) | DEPLOY-14: `deploy-test-backends.sh` falls back to hard-coded `judgekit_test` password if grep fails. | Open |
| C3-115 | MEDIUM | Medium | tracer | (see source review) | DEPLOY-15: No mutex prevents concurrent deploys to the same host. | Open |
| C3-116 | MEDIUM | High | architect | (see source review) | 8. `system_settings` cache can return stale values during background reload | Open |
| C3-117 | MEDIUM | High | architect | (see source review) | 9. Configuration resolution is scattered across env, DB, and hardcoded defaults | Open |
| C3-118 | MEDIUM | High | architect | (see source review) | 11. Middleware performs DB lookups in the Edge Runtime | Open |
| C3-119 | MEDIUM | High | architect | (see source review) | 12. No API versioning strategy beyond the `/api/v1` path prefix | Open |
| C3-120 | MEDIUM | High | architect | (see source review) | 13. Rate-limiting has two sources of truth (sidecar + DB) | Open |
| C3-121 | MEDIUM | Medium | architect | (see source review) | 14. Function-judging serialization boundary between TypeScript and Rust is implicit | Open |
| C3-122 | MEDIUM | Medium | architect | (see source review) | 15. Role/capability authorization is split across role names and capability strings | Open |
| C3-123 | MEDIUM | High | architect | (see source review) | 16. Distributed request ID is not propagated to all internal services | Open |
| C3-124 | MEDIUM | High | architect | (see source review) | 17. Settings-dependent values captured at module load time | Open |
| C3-125 | MEDIUM | Medium | debugger | (see source review) | 5. Uploads directory created with overly permissive default mode | Open |
| C3-126 | MEDIUM | Medium | debugger | (see source review) | 6. `cleanupOldEvents` batch DELETE may not honor `LIMIT` under PostgreSQL optimization | Open |
| C3-127 | MEDIUM | Medium | debugger | (see source review) | 7. `withTimeout` + `cleanupWithTimeout` can leak timers if callers do not retain the combined signal | Open |
| C3-128 | MEDIUM | Medium | debugger | (see source review) | 8. `normalizeSource` leaks long unclosed string content after `MAX_STRING_LITERAL_LENGTH` | Open |
| C3-129 | MEDIUM | Low | debugger | (see source review) | 11. `AbortSignal.any` availability in the deployed Node.js runtime | Open |
| C3-130 | MEDIUM | Low | debugger | (see source review) | 13. Docker build context includes the entire repo root | Open |
| C3-131 | MEDIUM | High | designer | (see source review) | 3. Missing visible focus indicators on custom interactive elements | Open |
| C3-132 | MEDIUM | High | designer | `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:135-170` | 4. Interactive content nested inside a `role="button"` container | Open |
| C3-133 | MEDIUM | Medium | designer | `src/lib/plugins/chat-widget/chat-widget.tsx:313-411` | 5. Chat widget has no focus trap and header buttons lack explicit type/ring | Open |
| C3-134 | MEDIUM | High | designer | `src/components/contest/code-timeline-panel.tsx:211-221` | 6. Snapshot mini-timeline dots are too small and have no focus indicator | Open |
| C3-135 | MEDIUM | High | designer | (see source review) | 9. Tablists lack accessible names | Open |
| C3-136 | MEDIUM | High | designer | (see source review) | 10. Nested `<Link>` wrapping `<Button>` creates invalid interactive nesting | Open |
| C3-137 | LOW | Medium | code-reviewer | `src/lib/assignments/code-similarity-client.ts:93-97` | `code-similarity-client.ts` casts the sidecar response after parsing | Open |
| C3-138 | LOW | Medium | code-reviewer | `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:51-65` | `similarity-check` route returns HTTP 200 for caller timeout | Open |
| C3-139 | LOW | Medium | code-reviewer | `src/lib/assignments/code-similarity.ts:56-64` | `normalizeSource` discards entire lines starting with `#` that are not C preprocessor directives | Open |
| C3-140 | LOW | Medium | security-reviewer | `scripts/backup-db.sh:44-49,89-96` | Unencrypted database backups by default | Open |
| C3-141 | LOW | Low | security-reviewer | `deploy-docker.sh:143-172` | Deploy script sources per-target env files via shell | Open |
| C3-142 | LOW | Low | security-reviewer | `src/lib/api/api-key-auth.ts:56-67`, `src/lib/security/token-hash.ts:10-12` | API key hash lookup is not constant-time | Open |
| C3-143 | LOW | Low | security-reviewer | `src/app/api/v1/admin/migrate/import/route.ts:145-153,175-190` | Deprecated migrate/import JSON path still accepts password in request body when explicitly enabled | Open |
| C3-144 | LOW | High | verifier | (see source review) | 8. Similarity-check API response is under-documented | Open |
| C3-145 | LOW | Medium | verifier | (see source review) | 11. `ip-allowlist.ts` accepts leading-zero IPv4 octets in allowlist entries | Open |
| C3-146 | LOW | Medium | verifier | (see source review) | 12. Rate limiter runs before auth check in `createApiHandler` | Open |
| C3-147 | LOW | High | test-engineer | (see source review) | 14. LOW: Test file naming is inconsistent, making coverage mapping harder | Open |
| C3-148 | LOW | High | test-engineer | (see source review) | 15. LOW: `source-grep-inventory` baseline is a manual number that requires constant updates | Open |
| C3-149 | LOW | Medium | test-engineer | (see source review) | L3. `consumeApiRateLimit` unit tests mock `execTransaction` to pass the same mock object as tx | Open |
| C3-150 | LOW | Medium | tracer | (see source review) | COMP-3: Language validation runs after the sandbox-quota gate; invalid languages can consume daily quota. | Open |
| C3-151 | LOW | Medium | tracer | (see source review) | COMP-4: Container cleanup is fire-and-forget; `cleanup()` does not await `docker rm`. | Open |
| C3-152 | LOW | Medium | tracer | (see source review) | COMP-5: Workspace cleanup depends on `CAP_CHOWN`/`CAP_DAC_OVERRIDE`; hardened runtimes may still leak. | Open |
| C3-153 | LOW | Medium | tracer | (see source review) | FILES-3: `DELETE` removes the DB row before disk object; disk orphan possible. | Open |
| C3-154 | LOW | Medium | tracer | (see source review) | FILES-4: Upload writes disk before DB insert; crash between the two leaves orphan file. | Open |
| C3-155 | LOW | Medium | tracer | (see source review) | RT-3: `shouldRecordSharedHeartbeat` fetches DB time before acquiring the advisory lock. | Open |
| C3-156 | LOW | Medium | tracer | (see source review) | RT-4: `acquireSharedSseConnectionSlot` computes `expiresAt` from a timestamp fetched before the global lock. | Open |
| C3-157 | LOW | Medium | tracer | (see source review) | DEPLOY-16: Backup retention `find ... -delete` has no lower-bound validation. | Open |
| C3-158 | LOW | High | tracer | (see source review) | DEPLOY-17: `docker builder prune -af` deletes all unused build cache during deploy. | Open |
| C3-159 | LOW | Medium | architect | (see source review) | 18. Test and production Docker networks differ in topology | Open |
| C3-160 | LOW | Medium | architect | (see source review) | 19. Static-site nginx is decoupled from app security headers | Open |
| C3-161 | LOW | Medium | architect | (see source review) | 20. Worker prewarming fires uncontrolled `docker run` commands at startup | Open |
| C3-162 | LOW | Medium | architect | (see source review) | 21. Schema enum columns lack database CHECK constraints | Open |
| C3-163 | LOW | Medium | architect | (see source review) | 22. Build-phase DB connection uses a dummy connection string | Open |
| C3-164 | LOW | Medium | debugger | (see source review) | 9. `normalizeSource` strips line-start `#` lines that are not C preprocessor directives | Open |
| C3-165 | LOW | Medium | debugger | (see source review) | 10. `block_persists_when_system_clock_jumps_backward` logic relies on `Instant`, but `record_failure` recomputes wall-clock expiry | Open |
| C3-166 | LOW | Medium | designer | (see source review) | 7. Some `<Button onClick>` components inside forms lack explicit `type="button"` | Open |
| C3-167 | LOW | High | designer | `src/components/layout/public-footer.tsx:52-59`, `src/components/layout/public-header.tsx:235-244` | 8. Footer and header action links lack focus rings | Open |
| C3-168 | LOW | High | designer | `src/components/code/compiler-client.tsx` (rendered at `/playground`) | 11. Playground shows untranslated i18n keys and unlabeled controls | Open |

## Deduplication Rules

Findings were merged using the following rules:

1. **Key:** primary file path + normalized finding title. Findings that described the same defect in the same code location were merged.
2. **Severity:** the highest severity reported by any reviewer was preserved.
3. **Confidence:** the highest confidence reported by any reviewer was preserved.
4. **Sources:** all reviewers that identified the defect are listed.
5. **Status:** the current working tree was spot-checked for disputed items. Claims of "fixed" were verified against actual source before being moved to **Implemented / Verified**.

## Detailed Findings

### C3-001 — CRITICAL (High) — CRITICAL-1: Production defaults to `AUTH_TRUST_HOST=true` and nginx does not strip `X-Forwarded-Host`

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** `deploy-docker.sh` generates `.env.production` with `AUTH_TRUST_HOST=true` and enforces the literal value during backfill; `docker-compose.production.yml` defaults it to `true`; `shouldTrustAuthHost()` returns `true` whenever the env var is set to `"true"`. The generated nginx templates overwrite `Host` but deliberately do not set or clear `X-Forwarded-Host` because of a comment that it breaks Next.js 16 RSC navigation (`deploy-docker.sh:1598`, `1613`, `1625`, `1638`, `1676`, `1691`, `1703`).
- **Status:** Open

### C3-002 — CRITICAL (High) — CRITICAL-2: Internal service traffic is unencrypted HTTP on a segmented but flat Docker network

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** Network segmentation exists (`frontend/backend/judge/db`), but all inter-service URLs are plaintext HTTP: `COMPILER_RUNNER_URL=http://judge-worker:3001`, `CODE_SIMILARITY_URL=http://code-similarity:3002`, `RATE_LIMITER_URL=http://rate-limiter:3001`, `JUDGE_BASE_URL=http://app:3000/api/v1`.
- **Status:** Open

### C3-003 — CRITICAL (High) — CRITICAL-3: Judge API IP allowlist defaults to allow-all in production

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed()` returns `true` for every IP. The production compose file does not set either variable, and the generated `.env.production` does not populate an allowlist. The code logs a one-time warning, but the open posture ships by default. The file comment explicitly states the unset==allow-all default is deliberately preserved for backward compatibility.
- **Status:** Open

### C3-004 — CRITICAL (High) — CRITICAL-4: Raw SQL additive schema patch bypasses the Drizzle migration journal

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** Step 5b inlines a `psql` backfill/drop for `judge_workers.secret_token` (`UPDATE ... SET secret_token_hash = encode(sha256(secret_token::bytea), 'hex') ...; ALTER TABLE judge_workers DROP COLUMN IF EXISTS secret_token`). This runs before `drizzle-kit push` and is not captured in the Drizzle journal. The file acknowledges that drizzle-kit ignores SQL files in the journal.
- **Status:** Open

### C3-005 — CRITICAL (High) — 2. Generated nginx `location /` lacks `client_max_body_size`, breaking uploads >1 MiB

- **Sources:** verifier
- **Files:** (see source review)
- **Summary:** 2. Generated nginx `location /` lacks `client_max_body_size`, breaking uploads >1 MiB
- **Status:** Open

### C3-006 — CRITICAL (High) — 1. CRITICAL: Integration tests are almost entirely skipped in default CI

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** Five of six integration tests use `describe.skipIf(!hasPostgresIntegrationSupport)`. The helper checks for `INTEGRATION_DATABASE_URL || TEST_DATABASE_URL || DATABASE_URL`. In a fresh CI checkout or contributor environment, `DATABASE_URL` is typically unset, so the entire integration suite is silently skipped.
- **Status:** Open

### C3-007 — CRITICAL (High) — 1. Workspace cleanup still leaks in production — Node.js local fallback relies on impossible `chown`

- **Sources:** debugger
- **Files:** (see source review)
- **Summary:** `cleanupCompilerWorkspace` calls `chownRecursive(workspaceDir, appUid, appGid)` and then `rm(...)`. In production the app runs as `nextjs` (uid 1001). The sandbox container writes files as uid 65534 (`nobody`). A non-root process cannot `chown` files owned by another uid unless it holds `CAP_CHOWN`, which the production `Dockerfile` does not grant. The `chownRecursive` call therefore throws `EPERM`, logs a warning, and the subsequent `rm` fails because it cannot delete files owned by uid 65534.
- **Status:** Open

### C3-008 — CRITICAL (High) — 2. Workspace cleanup still leaks in production — Rust worker `SandboxWorkspace::drop` has the same flaw

- **Sources:** debugger
- **Files:** (see source review)
- **Summary:** `SandboxWorkspace::drop` calls `chown_recursive(&path, uid, gid)` where `uid/gid` come from `libc::getuid/getgid`. The worker image runs as non-root `judge` (uid 1000). Sandbox runs create files owned by uid 65534, so the recursive chown fails with `EPERM` and `remove_dir_all` cannot delete the tree.
- **Status:** Open

### C3-009 — HIGH (Medium) — Database import corrupts exported boolean strings (`"false"` → `true`)

- **Sources:** code-reviewer
- **Files:** `src/lib/db/import.ts:87-89`
- **Summary:** `convertValue` handles boolean columns with `return Boolean(val);`. When a portable export stores a boolean as the string `"false"` (common in JSON/CSV-flavored exports), `Boolean("false")` evaluates to `true`. This silently flips every false-like string during restore.
- **Status:** Open

### C3-010 — HIGH (Medium) — All SSE connection acquisitions are serialized on a single advisory lock

- **Sources:** code-reviewer
- **Files:** `src/lib/realtime/realtime-coordination.ts:101`
- **Summary:** `acquireSharedSseConnectionSlot` uses a single lock key `"realtime:sse:acquire"` for every user/connection. This makes the slot-acquisition path globally serial, creating a concurrency bottleneck and a latency tail under load.
- **Status:** Open

### C3-011 — HIGH (Medium) — File listing endpoint has no rate limiting

- **Sources:** code-reviewer
- **Files:** `src/app/api/v1/files/route.ts:155-208`
- **Summary:** The `GET` handler authenticates and authorizes but does not configure a `rateLimit` key. Because the route supports pagination and a `search` parameter, an authenticated client can repeatedly scrape or search the table without throttling.
- **Status:** Open

### C3-012 — HIGH (Medium) — `createApiHandler` swallows details for unhandled exceptions

- **Sources:** code-reviewer
- **Files:** `src/lib/api/handler.ts:288-310`
- **Summary:** The catch block correctly surfaces `ApiError` instances with `code`, `message`, and `requestId`, but for unexpected `Error` objects it returns only `{ error: "internalServerError", requestId }`. This makes production incidents harder to diagnose because the client receives no error discriminant and the response body omits the `message` even though the error is already logged server-side.
- **Status:** Open

### C3-013 — HIGH (High) — `AUTH_TRUST_HOST` is hardcoded/enforced to `true` in production

- **Sources:** security-reviewer
- **Files:** `src/lib/security/env.ts:260-266`, `src/lib/auth/config.ts:317`, `docker-compose.production.yml:115`, `deploy-docker.sh:750,878,952`
- **Summary:** `shouldTrustAuthHost()` returns `true` in production whenever `AUTH_TRUST_HOST === "true"`. The deploy script generates `.env.production` with `AUTH_TRUST_HOST=true` and actively enforces the literal value during backfill. With NextAuth's `trustHost` enabled, Auth.js derives canonical URLs from the incoming `Host` / `X-Forwarded-Host` headers. The generated nginx template intentionally does not set `X-Forwarded-Host`, but it also does not strip a client-supplied one, and it proxies the client `Host` through to the app.
- **Status:** Open

### C3-014 — HIGH (High) — Judge API IP allowlist defaults to allow-all

- **Sources:** security-reviewer
- **Files:** `src/lib/judge/ip-allowlist.ts:17-25,213-241`; `.env.production.example` (no default `JUDGE_ALLOWED_IPS`); `src/app/api/v1/judge/register/route.ts:27-41`
- **Summary:** When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed()` returns `true` for every IP. The production compose file and generated `.env.production` do not populate an allowlist. The code logs a one-time warning, but the open posture ships by default.
- **Status:** Open

### C3-015 — HIGH (High) — HIGH-1: Real-time coordination serializes every SSE acquisition and heartbeat through PostgreSQL advisory locks

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** `withPgAdvisoryLock("realtime:sse:acquire", ...)` wraps global/user SSE slot acquisition; per-assignment/user heartbeats also take an advisory lock. The module explicitly warns that multi-instance deployments require `REALTIME_COORDINATION_BACKEND=postgresql`, which serializes every SSE acquisition and heartbeat update through `pg_advisory_xact_lock` and a single table.
- **Status:** Open

### C3-016 — HIGH (High) — HIGH-2: Docker socket proxy still grants broad container lifecycle privileges

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** `tecnativa/docker-socket-proxy` is configured with `POST=1 DELETE=1 ALLOW_START=1 ALLOW_STOP=1`. While `BUILD=0` and `IMAGES=0` were removed from the app host, the worker can still create, start, stop, and delete arbitrary containers on the host Docker daemon.
- **Status:** Open

### C3-017 — HIGH (High) — HIGH-3: `deploy-docker.sh` exceeds modularization threshold and couples unrelated concerns

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** A single shell script performs SSH setup, remote architecture detection, env generation, Docker builds (app + worker + ~100 languages), BuildKit recovery, DB migration, raw SQL additive patches, nginx generation, container lifecycle, health checks, artifact pruning, and worker-host reconciliation. Any failure late in the script leaves prior mutations applied with no automated rollback.
- **Status:** Open

### C3-018 — HIGH (High) — HIGH-4: Rate-limiting has two sources of truth (sidecar + DB)

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** API rate limits use the `rate-limiter-rs` sidecar as a fast pre-check, then always hit the DB as the authoritative source. The sidecar is stateful and in-memory; if it restarts, its counters reset, while the DB path continues. The sidecar circuit breaker is process-local, so a multi-instance deployment sees inconsistent sidecar health.
- **Status:** Open

### C3-019 — HIGH (Medium) — HIGH-5: Role/capability authorization is split across role names and capability strings

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** Roles are stored as text in `users.role` with a foreign-key reference to `roles.name`, but capabilities are checked at runtime from the role. There is no database-enforced guarantee that a role's capabilities are consistent with its name, and custom roles can silently lose required capabilities.
- **Status:** Open

### C3-020 — HIGH (High) — HIGH-6: Standalone nginx template still uses `client_max_body_size 1m` in catch-all `location /`

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** While the generated `deploy-docker.sh` nginx now sets 50 MiB in the catch-all `location /`, the committed standalone template `scripts/online-judge.nginx.conf` still sets `client_max_body_size 1m` in the catch-all block (`location /`) and in `/api/v1/judge/`. The aggregate finding was that uploads, restore, and imports larger than 1 MiB would be rejected. The HTTP-only template (`scripts/online-judge.nginx-http.conf`) has 50 MiB already.
- **Status:** Open

### C3-021 — HIGH (High) — HIGH-7: Admin restore/import responses still leak server-side snapshot path

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** The `preRestoreSnapshotPath` filesystem path is returned verbatim in JSON responses to authenticated admin callers and is also included in the durable audit log details sent to the client.
- **Status:** Open

### C3-022 — HIGH (High) — HIGH-8: `GET /api/v1/files` has no rate limit

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** The file-list endpoint is wrapped with `createApiHandler` but omits a `rateLimit` key. It performs a `LEFT JOIN` against `users`, a `COUNT(*) OVER()` window function, pagination, and optional `LIKE` search over filenames.
- **Status:** Open

### C3-023 — HIGH (High) — HIGH-9: Language configuration remains triplicated with only a partial contract test

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** The same language list and command templates are authored in TypeScript, Rust, and the database. The contract test compares the TypeScript `Language` union, Rust `Language` enum, and `JUDGE_LANGUAGE_CONFIGS` map, but does not verify runtime DB `language_configs` rows against the compiled definitions.
- **Status:** Open

### C3-024 — HIGH (Medium) — HIGH-10: Function-judging literal values are not validated against target-language ranges

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** `functionSpecSchema` validates scalar/array types and identifiers, but never checks that test-case literal values fit within the target language's representable range.
- **Status:** Open

### C3-025 — HIGH (High) — 1. Nginx template/config mismatch: committed templates overwrite X-Forwarded-For

- **Sources:** verifier
- **Files:** (see source review)
- **Summary:** 1. Nginx template/config mismatch: committed templates overwrite X-Forwarded-For
- **Status:** Open

### C3-026 — HIGH (High) — 3. `AUTH_TRUST_HOST=true` is the production default

- **Sources:** verifier
- **Files:** (see source review)
- **Summary:** 3. `AUTH_TRUST_HOST=true` is the production default
- **Status:** Open

### C3-027 — HIGH (High) — 4. Judge API IP allowlist defaults to allow-all in production

- **Sources:** verifier
- **Files:** (see source review)
- **Summary:** 4. Judge API IP allowlist defaults to allow-all in production
- **Status:** Open

### C3-028 — HIGH (High) — 2. HIGH: `GET /api/v1/files` has no rate-limit test

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** The file-list endpoint performs a `LEFT JOIN` against `users`, a `COUNT(*) OVER()` window function, pagination, and optional `LIKE` search. It has no `rateLimit` key and no test verifies that it is unthrottled. The aggregate review (SEC M-4) already flags the missing rate limit; the test gap is the same issue from a test-engineering angle.
- **Status:** Open

### C3-029 — HIGH (High) — 3. HIGH: Rust sidecars have no behavioral test harness in the TypeScript suite

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** The only tests referencing the Rust crates are source-grep guards (`language-contract`, `worker-runtime`, `execute-implementation`, `output-limits-implementation`, `ioi-run-all-tests-implementation`). There are no black-box tests that compile and run the Rust binaries, mock the app server, and assert on HTTP responses.
- **Status:** Open

### C3-030 — HIGH (High) — 4. HIGH: Route tests mock `createApiHandler` instead of exercising it

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** Route tests commonly mock `createApiHandler` to a trivial wrapper that bypasses auth, CSRF, rate limiting, and body parsing. This means the route tests verify only the inner handler logic, not the actual middleware ordering, auth/CSRF/rate-limit integration, or error handling of the real wrapper.
- **Status:** Open

### C3-031 — HIGH (High) — 5. HIGH: `forgot-password` and public auth routes have CSRF tests but no rate-limit or abuse tests

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** The public auth routes test verifies CSRF presence and valid request handling, but does not test the per-IP/email rate limits or the `email_not_configured` / `sendFailed` branches. The aggregate review (SEC HIGH) notes that these routes are public and state-changing; without rate-limit tests, abuse protections are unverified.
- **Status:** Open

### C3-032 — HIGH (High) — 6. HIGH: No test verifies the request-ID / correlation-ID behavior on real routes

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** `handler.test.ts` verifies request ID propagation in isolation, but no route test checks that a real API route returns `X-Request-Id` on success/error or propagates an existing header. The aggregate review flags generic 500 responses lacking correlation; request IDs are the mitigation.
- **Status:** Open

### C3-033 — HIGH (High) — 7. HIGH: Source-grep tests dominate infra and security verification

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** Deployment and nginx correctness are verified by string presence in source files, not by rendering the generated config and validating it. The aggregate review (MEDIUM) already notes this. The `judge-report-nginx.test.ts` does execute small bash snippets to test version parsing, but it does not actually render the full nginx config from `deploy-docker.sh` and run `nginx -t`.
- **Status:** Open

### C3-034 — HIGH (Medium) — 8. HIGH: No test exercises `AbortSignal.any` composition in `computeSimilarityRust`

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** The similarity client now composes the caller signal with a 25-second sidecar timeout. The unit test verifies caller-initiated abort, but does not verify that the sidecar timeout fires when the caller does not abort, or that a caller abort before fetch start is respected.
- **Status:** Open

### C3-035 — HIGH (High) — T-JUDGE-2: In-progress reports reset `judgeClaimedAt`, allowing a worker to extend a claim indefinitely.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** In-progress reports reset `judgeClaimedAt`, allowing a worker to extend a claim indefinitely.
- **Status:** Open

### C3-036 — HIGH (High) — T-AUTH-1: `createApiHandler` role check rejects custom roles via `isUserRole()`, breaking `auth.roles` for non-built-in roles.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** `createApiHandler` role check rejects custom roles via `isUserRole()`, breaking `auth.roles` for non-built-in roles.
- **Status:** Open

### C3-037 — HIGH (High) — T-DEPLOY-7: Fresh production deployments set neither `JUDGE_ALLOWED_IPS` nor `JUDGE_STRICT_IP_ALLOWLIST`, so judge API allowlist is open to all IPs.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Fresh production deployments set neither `JUDGE_ALLOWED_IPS` nor `JUDGE_STRICT_IP_ALLOWLIST`, so judge API allowlist is open to all IPs.
- **Status:** Open

### C3-038 — HIGH (High) — T-DEPLOY-4: `AUTH_TRUST_HOST=true` in production; nginx does not strip a client-supplied `X-Forwarded-Host`.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** `AUTH_TRUST_HOST=true` in production; nginx does not strip a client-supplied `X-Forwarded-Host`.
- **Status:** Open

### C3-039 — HIGH (High) — T-FILES-1: `GET /api/v1/files/[id]` loads the entire file into memory and has no rate limit.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** `GET /api/v1/files/[id]` loads the entire file into memory and has no rate limit.
- **Status:** Open

### C3-040 — HIGH (High) — RT-1: SSE connection acquisition uses a single global PostgreSQL advisory lock.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** SSE connection acquisition uses a single global PostgreSQL advisory lock.
- **Status:** Open

### C3-041 — HIGH (Medium) — SIM-1: Rust sidecar `spawn_blocking` task is not cancellable; client disconnect leaves CPU pinned.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Rust sidecar `spawn_blocking` task is not cancellable; client disconnect leaves CPU pinned.
- **Status:** Open

### C3-042 — HIGH (High) — DEPLOY-3: Migration containers run unpinned `npm install --no-save drizzle-kit ...` with full DB secrets.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Migration containers run unpinned `npm install --no-save drizzle-kit ...` with full DB secrets.
- **Status:** Open

### C3-043 — HIGH (Medium) — DEPLOY-5: `deploy-test-backends.sh` can stop the production compose stack without a production guard.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** `deploy-test-backends.sh` can stop the production compose stack without a production guard.
- **Status:** Open

### C3-044 — HIGH (Medium) — DEPLOY-6: `pg-volume-safety-check.sh` auto-migrate uses `rm -rf ${NAMED_SRC}/*` without path validation.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** `pg-volume-safety-check.sh` auto-migrate uses `rm -rf ${NAMED_SRC}/*` without path validation.
- **Status:** Open

### C3-045 — HIGH (Medium) — DEPLOY-7: Legacy `deploy.sh` remains executable and bypasses hardened deploy path.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Legacy `deploy.sh` remains executable and bypasses hardened deploy path.
- **Status:** Open

### C3-046 — HIGH (High) — 1. PostgreSQL advisory locks are used for real-time coordination and similarity-check serialization

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** SSE connection slots, heartbeat deduplication, and similarity-check runs are serialized through `pg_advisory_xact_lock` and a single shared table (`realtimeCoordination`).  Every SSE acquisition runs `DELETE` expired rows, `SELECT count(*)` global + per-user counts, and `INSERT` a new row inside one transaction holding an advisory lock.  Heartbeat dedup uses a per-key advisory lock.  This makes PostgreSQL the real-time coordination bus.
- **Status:** Open

### C3-047 — HIGH (High) — 2. Language configuration is triplicated with no generated contract

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** The language list, file extensions, Docker images, and command templates are authored separately in TypeScript, Rust, and the database schema/sync script.  Adding or renaming a language requires manually keeping three conventions aligned.  The worker reads DB overrides at runtime, but if the Rust enum or TypeScript union drifts, deserialization or UI selection fails.  There is no generated contract or CI test that proves the three sources agree.
- **Status:** Open

### C3-048 — HIGH (High) — 3. `deploy-docker.sh` is a single monolithic script with no per-phase rollback

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** One shell script performs SSH setup, architecture detection, env generation, Docker image builds (app, worker, ~100 language images), BuildKit recovery, DB migration via `drizzle-kit push`, raw SQL additive patches, nginx generation from inline heredocs, container lifecycle, health checks, artifact pruning, and worker-host reconciliation.  A failure late in the script leaves earlier mutations partially applied with no automated rollback path.  The script is also difficult to unit-test, review, and reuse.
- **Status:** Open

### C3-049 — HIGH (High) — 4. Internal service traffic is unencrypted HTTP on shared Docker bridge networks

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** App, worker, rate-limiter, and code-similarity communicate over plain HTTP on Docker bridge networks.  A compromised sidecar or auxiliary container on any of these networks can sniff bearer tokens (`JUDGE_AUTH_TOKEN`, `RUNNER_AUTH_TOKEN`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`), hidden test cases in claim responses, submission source code, and similarity-check payloads.
- **Status:** Open

### C3-050 — HIGH (High) — 5. `AUTH_TRUST_HOST` defaults to `true` in production

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** In production, `shouldTrustAuthHost()` returns `true` unless `AUTH_TRUST_HOST` is explicitly set to something other than `"true"`.  NextAuth's `trustHost` flag disables host/origin validation for callback URLs, CSRF tokens, and session cookies.  This is documented as a deliberate backward-compatibility choice, but it weakens the authentication boundary in the default production configuration.
- **Status:** Open

### C3-051 — HIGH (High) — 6. Judge API IP allowlist defaults to allow-all unless explicitly configured

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed` returns `true` for every client IP.  The code comments explain this is a deliberate backward-compatibility choice, but it means a leaked `JUDGE_AUTH_TOKEN` has no network-layer backstop.
- **Status:** Open

### C3-052 — HIGH (High) — 7. Raw SQL additive patches bypass the Drizzle migration journal

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** The deploy script applies additive schema changes via raw `psql` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) after `drizzle-kit push`.  Because the column already exists, `drizzle-kit push` does not generate a journal entry.  A disaster-recovery replay from the Drizzle journal therefore produces a schema missing those columns.
- **Status:** Open

### C3-053 — HIGH (High) — 10. Docker socket proxy still grants broad container lifecycle privileges

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** `tecnativa/docker-socket-proxy` is configured with `CONTAINERS=1 POST=1 DELETE=1 ALLOW_START=1 ALLOW_STOP=1`, while `BUILD=0` and `IMAGES=0` are correctly disabled.  The worker can still create, start, stop, and delete arbitrary containers on the host Docker daemon.  This is a large blast radius for a component whose only job is to run sandboxed judge containers.
- **Status:** Open

### C3-054 — HIGH (Medium) — 3. `buildDockerImageLocal` leaves a running `docker build` process on timeout

- **Sources:** debugger
- **Files:** (see source review)
- **Summary:** On the 600 s timeout path the code calls `proc.kill()` (no signal argument → `SIGTERM`) and immediately resolves `{ success: false, error: "docker build timed out after 600s" }`. It does not wait for process exit, close stdio, or kill with `SIGKILL`. A `docker build` child may ignore `SIGTERM` for a long time or become orphaned, leaving the build running and consuming CPU/disk on the worker.
- **Status:** Open

### C3-055 — HIGH (Medium) — 4. Backup restore keeps all uploaded files in memory before writing to disk

- **Sources:** debugger
- **Files:** (see source review)
- **Summary:** `parseBackupZip` calls `entry.async("nodebuffer")` for every file in `uploads/` and stores the resulting `Buffer` objects in an in-memory array. The route already read the entire ZIP into memory as `Buffer.from(arrayBuffer)`. For a backup near the 512 MB decompressed limit with many uploaded files, the process can hold well over 1 GB of transient memory (ZIP buffer + extracted buffers + JSZip internal copies), risking OOM before the DB transaction even begins.
- **Status:** Open

### C3-056 — HIGH (Low) — 12. `TRUSTED_PROXY_HOPS` default may be unset in production

- **Sources:** debugger
- **Files:** (see source review)
- **Summary:** `extractClientIp` falls back to `0.0.0.0` (dev sentinel) when `TRUSTED_PROXY_HOPS` is not configured. Several rate-limit and audit paths key off this sentinel. If production nginx is not explicitly setting `TRUSTED_PROXY_HOPS`, rate limits will be keyed on `0.0.0.0`, allowing all clients to share a single bucket and effectively disabling per-IP throttling.
- **Status:** Open

### C3-057 — HIGH (High) — 1. Empty `<SelectValue />` shows raw option values

- **Sources:** designer
- **Files:** (see source review)
- **Summary:** `AGENTS.md` explicitly forbids `<SelectValue />` without static children because `@base-ui/react/select` will render the raw `value` string. In these selects the trigger is empty, so users see raw status IDs, user IDs, `all`, or `general` instead of the localized labels.
- **Status:** Open

### C3-058 — HIGH (High) — 2. Form labels not associated with their controls

- **Sources:** designer
- **Files:** (see source review)
- **Summary:** The project’s `Label` component (`src/components/ui/label.tsx`) renders a plain `<label>`. When it is used as a sibling of an `<Input>`/`<Select>`/`<Textarea>` without `htmlFor` and without wrapping the control, there is no programmatic association. Clicking the label does not focus the field, and screen readers may not reliably announce the label when the user tabs to the control.
- **Status:** Open

### C3-059 — MEDIUM (Medium) — CSRF check performs a database read on every mutation

- **Sources:** code-reviewer
- **Files:** `src/lib/security/csrf.ts:7-30`, `src/lib/security/env.ts:213-252`
- **Summary:** `validateCsrf` calls `getExpectedHosts`, which calls `getTrustedAuthHosts`, which loads `systemSettings.allowedHosts` from the DB on every non-safe request. There is no in-memory cache for this host list.
- **Status:** Open

### C3-060 — MEDIUM (Medium) — Shell validators still wrap commands in `sh -c` and the prefix whitelist is bypassable

- **Sources:** code-reviewer
- **Files:** `src/lib/compiler/execute.ts:187-277`
- **Summary:** `validateShellCommand` / `validateShellCommandStrict` are defense-in-depth over commands that are ultimately executed via `sh -c`. The strict validator only checks the first token of each `&&`/`;` segment against a prefix list, but an allowed prefix such as `python3`, `node`, or `Rscript` can still run arbitrary code supplied as an argument (e.g., `python3 -c '<arbitrary>'`).
- **Status:** Open

### C3-061 — MEDIUM (Medium) — Environment integer parsing accepts malformed strings (`"10abc"` → `10`)

- **Sources:** code-reviewer
- **Files:** `src/lib/system-settings-config.ts:90-109`
- **Summary:** `resolveValue` uses `parseInt(envVal, 10)` and only checks `Number.isFinite(parsed) && parsed >= 0`. `parseInt` stops at the first non-numeric character, so `"10abc"` is accepted as `10`.
- **Status:** Open

### C3-062 — MEDIUM (Medium) — Judge IP allowlist defaults to allow-all when unset

- **Sources:** code-reviewer
- **Files:** `src/lib/judge/ip-allowlist.ts:24-55`, `213-232`
- **Summary:** `JUDGE_ALLOWED_IPS` being empty or unset defaults to allowing all IPs unless `JUDGE_STRICT_IP_ALLOWLIST=1` is set. The code acknowledges this is intentional for backward compatibility.
- **Status:** Open

### C3-063 — MEDIUM (Medium) — `getConfiguredSettings` is synchronous and can return stale values across instances

- **Sources:** code-reviewer
- **Files:** `src/lib/system-settings-config.ts:162-173`
- **Summary:** `getConfiguredSettings` returns the in-process cached value synchronously and triggers a background refresh. In a multi-instance deployment, one instance writes a settings change and invalidates its own cache, but other instances continue serving stale settings for up to `CACHE_TTL_MS` (15 s).
- **Status:** Open

### C3-064 — MEDIUM (Medium) — Unsafe type casts proliferate in boundary layers

- **Sources:** code-reviewer
- **Files:** (see source review)
- **Summary:** Multiple `as unknown as X` casts are used at module boundaries. Most are guarded by adjacent validation, but they make refactors brittle because the compiler no longer enforces the boundary contract.
- **Status:** Open

### C3-065 — MEDIUM (High) — `GET /api/v1/files` has no rate limit

- **Sources:** security-reviewer
- **Files:** `src/app/api/v1/files/route.ts:155-208`
- **Summary:** The file-list endpoint is wrapped with `createApiHandler` but omits a `rateLimit` key. It performs a `LEFT JOIN` against `users`, a `COUNT(*) OVER()` window function, pagination, and optional `LIKE` search over filenames.
- **Status:** Open

### C3-066 — MEDIUM (High) — Admin restore/import responses leak server-side snapshot path

- **Sources:** security-reviewer
- **Files:** `src/app/api/v1/admin/restore/route.ts:170,196,207,229,239`; `src/app/api/v1/admin/migrate/import/route.ts:115,141`
- **Summary:** The `preRestoreSnapshotPath` filesystem path is returned verbatim in JSON responses to authenticated admin callers, in both success and several error paths.
- **Status:** Open

### C3-067 — MEDIUM (High) — Deploy script still contains a raw SQL backfill/drop block

- **Sources:** security-reviewer
- **Files:** `deploy-docker.sh:1208-1291`
- **Summary:** The deploy script executes destructive raw SQL (`UPDATE judge_workers SET secret_token_hash = ...`, `ALTER TABLE ... DROP COLUMN secret_token`) directly against the production database via `docker exec` + `psql`. The block is idempotent and guarded by an `information_schema` check, but it is still a manual DDL repair that lives outside the normal migration tool. The documented sunset criterion is 2026-10-26.
- **Status:** Open

### C3-068 — MEDIUM (Medium) — Internal service traffic is unencrypted HTTP

- **Sources:** security-reviewer
- **Files:** `docker-compose.production.yml:116-118,151`; `judge-worker-rs/src/config.rs`
- **Summary:** The production compose sets `COMPILER_RUNNER_URL=http://judge-worker:3001`, `JUDGE_BASE_URL=http://app:3000/api/v1`, `CODE_SIMILARITY_URL=http://code-similarity:3002`, and `RATE_LIMITER_URL=http://rate-limiter:3001`. Although network segmentation now isolates these services from the frontend and database networks, traffic on the shared `backend`/`judge` bridges is still plaintext. The Rust worker refuses remote HTTP unless `JUDGE_ALLOW_INSECURE_HTTP=1`, but it treats internal hostnames as local and accepts plain HTTP.
- **Status:** Open

### C3-069 — MEDIUM (High) — MEDIUM-1: Deployment/infrastructure tests verify string presence, not rendered behavior

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** Tests assert that `deploy-docker.sh` contains specific substrings (e.g., `add_header X-Content-Type-Options`). They do not render the generated nginx config or validate proxy behavior.
- **Status:** Open

### C3-070 — MEDIUM (High) — MEDIUM-2: Deprecated migrate/import JSON path still accepts password in request body

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** The endpoint still supports a JSON body of `{ password, data }` and validates the admin password from the request body. It logs a deprecation warning and adds `Deprecation`/`Sunset` headers, but the path remains functional until November 2026.
- **Status:** Open

### C3-071 — MEDIUM (Medium) — MEDIUM-3: Unit of work / transaction boundary discipline is inconsistent

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** `execTransaction` wraps callbacks in a Drizzle transaction, but `rawQueryOne`/`rawQueryAll` use the global pool and do not participate in an open transaction. The codebase uses `transactionContext` (AsyncLocalStorage) only to detect this mistake, not to route queries to the transaction client. Many route handlers perform multiple DB operations without an explicit transaction.
- **Status:** Open

### C3-072 — MEDIUM (Medium) — MEDIUM-4: Docker Compose lacks explicit bridge isolation from host networks

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** Networks are segmented (`frontend/backend/judge/db`) but the compose file does not set `internal: true` on the `db` or `judge` networks, and the `frontend` network is implicitly attached to the app. If `ports:` are added later or a service is misconfigured with `network_mode: host`, the segmentation is bypassed.
- **Status:** Open

### C3-073 — MEDIUM (High) — MEDIUM-5: No documented operational rollback runbook for `deploy-docker.sh`

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** The deploy script performs many mutations (image builds, container starts, migrations, nginx reload, worker reconciliation) without a rollback manifest or documented recovery procedure.
- **Status:** Open

### C3-074 — MEDIUM (Medium) — MEDIUM-6: Judge worker IP allowlist auto-population is missing

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** There is no mechanism that auto-detects worker host IPs and seeds `JUDGE_ALLOWED_IPS` during deploy. The variable is left empty, which silently enables allow-all mode.
- **Status:** Open

### C3-075 — MEDIUM (High) — MEDIUM-7: Container lifecycle audit logging is absent

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** The Docker socket proxy does not log which container operations were performed. Worker logs may log high-level actions, but the proxy itself is silent.
- **Status:** Open

### C3-076 — MEDIUM (High) — MEDIUM-8: `AUTH_TRUST_HOST=true` comment conflates reverse-proxy use with trusting arbitrary Host headers

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** The comment states `AUTH_TRUST_HOST` must be `true` "when behind a reverse proxy." This conflates "behind a reverse proxy" with "trust arbitrary Host/X-Forwarded-Host headers."
- **Status:** Open

### C3-077 — MEDIUM (Medium) — MEDIUM-9: Real-time coordination warns but does not fail when multi-instance is undeclared

- **Sources:** critic
- **Files:** (see source review)
- **Summary:** `warnIfSingleInstanceRealtimeOnly` logs a warning when the backend is process-local and no instance count is declared. In production this is treated as a warning, not a startup failure.
- **Status:** Open

### C3-078 — MEDIUM (High) — 5. PID limits do not match the documented phase split

- **Sources:** verifier
- **Files:** (see source review)
- **Summary:** 5. PID limits do not match the documented phase split
- **Status:** Open

### C3-079 — MEDIUM (High) — 6. Judge-container DNS hardening is documented but not implemented

- **Sources:** verifier
- **Files:** (see source review)
- **Summary:** 6. Judge-container DNS hardening is documented but not implemented
- **Status:** Open

### C3-080 — MEDIUM (High) — 7. `roc` language support is inconsistent across the stack

- **Sources:** verifier
- **Files:** (see source review)
- **Summary:** 7. `roc` language support is inconsistent across the stack
- **Status:** Open

### C3-081 — MEDIUM (High) — 9. Deployment/infrastructure tests verify string presence, not behavior

- **Sources:** verifier
- **Files:** (see source review)
- **Summary:** 9. Deployment/infrastructure tests verify string presence, not behavior
- **Status:** Open

### C3-082 — MEDIUM (Medium) — 10. Many env vars are referenced in code but missing from `.env.example`

- **Sources:** verifier
- **Files:** (see source review)
- **Summary:** 10. Many env vars are referenced in code but missing from `.env.example`
- **Status:** Open

### C3-083 — MEDIUM (High) — 9. MEDIUM: Race-condition tests are mostly source-grep

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** Concurrency guards are verified by reading strings like `pg_advisory_xact_lock` from source, not by running concurrent operations. Only `tests/integration/db/judge-claim-reclaim.test.ts` exercises real DB races, and it is skipped without Postgres.
- **Status:** Open

### C3-084 — MEDIUM (High) — 10. MEDIUM: `workspace leak regression` test in `execute.test.ts` is root-gated

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** The test that verifies sandbox-owned workspace cleanup is skipped unless the test runner is root (`if (!isRoot) return;`). In CI and developer laptops the test almost always no-ops, so a regression in `cleanupCompilerWorkspace` can slip through.
- **Status:** Open

### C3-085 — MEDIUM (High) — 11. MEDIUM: No tests for the fallback path when `getTrustedAuthHosts` returns empty in production

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** `validateCsrf` refuses to fall back to request headers in production when `getTrustedAuthHosts()` is empty. The existing CSRF tests cover development fallback and allowedHosts matching, but there is no test asserting that in production with empty trusted hosts, a missing `Origin` is rejected or allowed only for same-origin `Sec-Fetch-Site`.
- **Status:** Open

### C3-086 — MEDIUM (High) — 12. MEDIUM: No behavioral test for token invalidation millisecond precision

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** The aggregate review’s HIGH finding about one-second token revocation grace window was fixed by using millisecond precision. There is no unit test that creates a token at `t-500ms`, revokes at `t`, and asserts the token is rejected.
- **Status:** Open

### C3-087 — MEDIUM (Medium) — 13. MEDIUM: Many API routes without rate-limit keys have no tests explaining why

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** 55 route files have no `rateLimit:` key. Some are intentionally exempt (health, NextAuth, internal cleanup), but many admin routes perform expensive operations (backup, restore, export, build, worker management) and should be rate-limited. There is no test or ADR documenting the exemption list.
- **Status:** Open

### C3-088 — MEDIUM (Medium) — L1. Flaky timing in `similarity-check.route.test.ts`

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** The timeout test uses a real 31-second `setTimeout` and a test timeout of 35 seconds. If the test runner is slow or GC pauses occur, the test can flake. It also does not verify the `clearTimeout` in the `finally` block.
- **Status:** Open

### C3-089 — MEDIUM (Medium) — L2. `waitFor` loops in component tests may be brittle under CI load

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** Component tests rely on `@testing-library/react` `waitFor` with default timeouts. Complex async state can time out on slower CI runners.
- **Status:** Open

### C3-090 — MEDIUM (High) — L4. Property-based/fuzz tests are missing for input validators and serialization

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** The only fuzz-like coverage is manual tables in `serialization.test.ts` and `ip.test.ts`. There are no generative tests for validators, CSV escaping, file-name sanitization, or IP parsing.
- **Status:** Open

### C3-091 — MEDIUM (Medium) — SUB-1: Global pending-queue cap is checked without a global lock, allowing cross-user races to exceed `maxGlobalQueue`.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Global pending-queue cap is checked without a global lock, allowing cross-user races to exceed `maxGlobalQueue`.
- **Status:** Open

### C3-092 — MEDIUM (Medium) — RT-2: `releaseSharedSseConnectionSlot` deletes rows without acquiring the advisory lock used by acquisition.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** `releaseSharedSseConnectionSlot` deletes rows without acquiring the advisory lock used by acquisition.
- **Status:** Open

### C3-093 — MEDIUM (High) — RATE-1: Sidecar `allowed=false` verdict returns 429 without recording the attempt in Postgres.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Sidecar `allowed=false` verdict returns 429 without recording the attempt in Postgres.
- **Status:** Open

### C3-094 — MEDIUM (High) — RATE-2: Sidecar `/check` increments its own counter, duplicating the authoritative DB increment.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Sidecar `/check` increments its own counter, duplicating the authoritative DB increment.
- **Status:** Open

### C3-095 — MEDIUM (Medium) — COMP-1: `/api/v1/compiler/run` has no overall request timeout; runner connect can hang for up to 2 minutes.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** `/api/v1/compiler/run` has no overall request timeout; runner connect can hang for up to 2 minutes.
- **Status:** Open

### C3-096 — MEDIUM (Medium) — COMP-2: Rust runner `/run` does not check `docker_capability_ok` before accepting work.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Rust runner `/run` does not check `docker_capability_ok` before accepting work.
- **Status:** Open

### C3-097 — MEDIUM (High) — JOIN-1: Per-user failure limiter runs before per-code limiter, giving multi-account attackers N independent budgets.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Per-user failure limiter runs before per-code limiter, giving multi-account attackers N independent budgets.
- **Status:** Open

### C3-098 — MEDIUM (High) — JOIN-2: Failure-rate-limit buckets are never reset on a successful redemption.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Failure-rate-limit buckets are never reset on a successful redemption.
- **Status:** Open

### C3-099 — MEDIUM (High) — IP-RL-1: Missing/short XFF collapses traffic into the shared `api:*:unknown` bucket.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Missing/short XFF collapses traffic into the shared `api:*:unknown` bucket.
- **Status:** Open

### C3-100 — MEDIUM (High) — SIM-2: Raw CTE query is not abort-aware and runs inside the 30 s route budget.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Raw CTE query is not abort-aware and runs inside the 30 s route budget.
- **Status:** Open

### C3-101 — MEDIUM (High) — SIM-3: Advisory lock covers only the delete+insert store, not the read+compute phase.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Advisory lock covers only the delete+insert store, not the read+compute phase.
- **Status:** Open

### C3-102 — MEDIUM (Medium) — SIM-4: Capability check precedes group-TA check; pure group TA without the capability is denied.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Capability check precedes group-TA check; pure group TA without the capability is denied.
- **Status:** Open

### C3-103 — MEDIUM (High) — AUTH-3: Role/capability cache is module-local with no cross-instance invalidation.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Role/capability cache is module-local with no cross-instance invalidation.
- **Status:** Open

### C3-104 — MEDIUM (High) — AUTH-4: CSRF check reads `allowedHosts` from the DB on every mutation.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** CSRF check reads `allowedHosts` from the DB on every mutation.
- **Status:** Open

### C3-105 — MEDIUM (High) — AUTH-5: Generic 500 catch-all returns identical `internalServerError` for all unhandled exceptions.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Generic 500 catch-all returns identical `internalServerError` for all unhandled exceptions.
- **Status:** Open

### C3-106 — MEDIUM (High) — FILES-2: `GET /api/v1/files` (list) has no `rateLimit` key and performs expensive `COUNT(*) OVER()` + `LIKE` search.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** `GET /api/v1/files` (list) has no `rateLimit` key and performs expensive `COUNT(*) OVER()` + `LIKE` search.
- **Status:** Open

### C3-107 — MEDIUM (Medium) — T-JUDGE-3: Runner HTTP server handle is aborted during shutdown without draining in-flight `/run` requests.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Runner HTTP server handle is aborted during shutdown without draining in-flight `/run` requests.
- **Status:** Open

### C3-108 — MEDIUM (Medium) — DEPLOY-8: Deploy is not atomic: old containers are stopped before migrations/health checks pass; no auto-rollback.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Deploy is not atomic: old containers are stopped before migrations/health checks pass; no auto-rollback.
- **Status:** Open

### C3-109 — MEDIUM (Medium) — DEPLOY-9: Worker sync excludes `.env*` and only upserts `JUDGE_BASE_URL`; worker tokens may be missing on fresh hosts.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Worker sync excludes `.env*` and only upserts `JUDGE_BASE_URL`; worker tokens may be missing on fresh hosts.
- **Status:** Open

### C3-110 — MEDIUM (High) — DEPLOY-10: Committed `scripts/online-judge.nginx.conf` still sets `client_max_body_size 1m` in catch-all `location /`.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Committed `scripts/online-judge.nginx.conf` still sets `client_max_body_size 1m` in catch-all `location /`.
- **Status:** Open

### C3-111 — MEDIUM (Medium) — DEPLOY-11: No `stop_grace_period` in compose; Docker kills containers after 10 s.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** No `stop_grace_period` in compose; Docker kills containers after 10 s.
- **Status:** Open

### C3-112 — MEDIUM (Medium) — DEPLOY-12: Raw SQL additive patches (`secret_token` backfill/drop) bypass the Drizzle migration journal.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Raw SQL additive patches (`secret_token` backfill/drop) bypass the Drizzle migration journal.
- **Status:** Open

### C3-113 — MEDIUM (Medium) — DEPLOY-13: Post-deploy Playwright smoke runs after all remote mutations; failure leaves broken state live.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Post-deploy Playwright smoke runs after all remote mutations; failure leaves broken state live.
- **Status:** Open

### C3-114 — MEDIUM (Medium) — DEPLOY-14: `deploy-test-backends.sh` falls back to hard-coded `judgekit_test` password if grep fails.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** `deploy-test-backends.sh` falls back to hard-coded `judgekit_test` password if grep fails.
- **Status:** Open

### C3-115 — MEDIUM (Medium) — DEPLOY-15: No mutex prevents concurrent deploys to the same host.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** No mutex prevents concurrent deploys to the same host.
- **Status:** Open

### C3-116 — MEDIUM (High) — 8. `system_settings` cache can return stale values during background reload

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** `getConfiguredSettings()` returns a 15-second in-memory cache.  When the TTL expires, it triggers an asynchronous DB reload and returns the previous cached value (or defaults if none).  For up to one TTL window after `invalidateSettingsCache()` is called, callers still see old values.  Settings-dependent code such as rate limits, queue limits, sandbox timeouts, and SSE limits therefore operates on stale thresholds.
- **Status:** Open

### C3-117 — MEDIUM (High) — 9. Configuration resolution is scattered across env, DB, and hardcoded defaults

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** Operational settings live in three places with overlapping authority.  Only some settings have env overrides; others require a DB write.  There is no generated documentation or runtime endpoint that shows the active source for each value.  New settings are frequently added without corresponding env overrides, making emergency config changes require database access.
- **Status:** Open

### C3-118 — MEDIUM (High) — 11. Middleware performs DB lookups in the Edge Runtime

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** The Next.js Edge Runtime is optimized for short, stateless, CPU-bound work.  The proxy middleware does a JWT decode and then a PostgreSQL query on many requests.  This couples every request to the DB, complicates cold-start behavior, and makes middleware behavior dependent on the same Drizzle/Node stack used by API routes.
- **Status:** Open

### C3-119 — MEDIUM (High) — 12. No API versioning strategy beyond the `/api/v1` path prefix

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** All routes are under `/api/v1/`, but there is no versioning machinery: no version header support, no deprecation markers, no backwards-compatibility tests, and no staged rollout mechanism.  As the UI and external consumers evolve, breaking changes will require global coordination.
- **Status:** Open

### C3-120 — MEDIUM (High) — 13. Rate-limiting has two sources of truth (sidecar + DB)

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** Login/auth rate limits use the `rate-limiter-rs` sidecar as a fast pre-check, then fall back to the DB path when the sidecar is unreachable.  The sidecar is stateful and in-memory; if it restarts, its counters reset, while the DB path continues.  The two stores can disagree during partial outages, and the circuit breaker is process-local, so multi-instance deployments see inconsistent sidecar health.
- **Status:** Open

### C3-121 — MEDIUM (Medium) — 14. Function-judging serialization boundary between TypeScript and Rust is implicit

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** Function-signature problems are judged by assembling `prelude + studentCode + generatedMain` in TypeScript and sending the result to the Rust worker as an ordinary `auto` submission.  The serialization format expected by the generated harness must match what the TypeScript `serialization.ts` emits.  The Rust worker has no knowledge of function judging; if the harness format drifts, verdicts become silently wrong.
- **Status:** Open

### C3-122 — MEDIUM (Medium) — 15. Role/capability authorization is split across role names and capability strings

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** Authorization uses both role names (`admin`, `instructor`, etc.) and capability strings.  Roles are stored as text in `users.role` with a foreign-key reference to `roles.name`, but capabilities are checked at runtime from the role.  There is no database-enforced guarantee that a role's capabilities are consistent with its name, and custom roles can silently lose required capabilities.
- **Status:** Open

### C3-123 — MEDIUM (High) — 16. Distributed request ID is not propagated to all internal services

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** `createApiHandler` generates a `requestId` and returns it in the response, but outgoing calls to the worker Docker API, rate-limiter sidecar, and code-similarity sidecar do not appear to propagate this ID.  Cross-service logs therefore cannot be correlated for a single user request.
- **Status:** Open

### C3-124 — MEDIUM (High) — 17. Settings-dependent values captured at module load time

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** `authConfig.session.maxAge` is evaluated once at module load using `getSessionMaxAgeSeconds()`, which reads the system setting at that moment.  The comment acknowledges that changes to `sessionMaxAgeSeconds` require a server restart.  This is a common pattern elsewhere for env-driven constants.
- **Status:** Open

### C3-125 — MEDIUM (Medium) — 5. Uploads directory created with overly permissive default mode

- **Sources:** debugger
- **Files:** (see source review)
- **Summary:** `ensureUploadsDir()` calls `mkdir(..., { recursive: true })` without an explicit `mode`. The resulting directory permissions depend on the process umask (commonly `0o755`). Files inside are written with `0o600`, but directory listing is world-readable.
- **Status:** Open

### C3-126 — MEDIUM (Medium) — 6. `cleanupOldEvents` batch DELETE may not honor `LIMIT` under PostgreSQL optimization

- **Sources:** debugger
- **Files:** (see source review)
- **Summary:** The pruner uses `DELETE ... WHERE id IN (SELECT id FROM ... WHERE createdAt < cutoff LIMIT 5000)`. PostgreSQL's planner can flatten/simple-unfold the `IN (SELECT ... LIMIT)` subquery, causing the `LIMIT` to be discarded and the entire eligible set to be deleted in one statement. This risks long locks, WAL bloat, and replication lag on large tables.
- **Status:** Open

### C3-127 — MEDIUM (Medium) — 7. `withTimeout` + `cleanupWithTimeout` can leak timers if callers do not retain the combined signal

- **Sources:** debugger
- **Files:** (see source review)
- **Summary:** `withTimeout` stores the timer-cleanup function in a `WeakMap` keyed by the combined `AbortSignal`. `cleanupWithTimeout` needs that signal reference to clear the timer. If a caller obtains the combined signal but passes it directly to `fetch` and never calls `cleanupWithTimeout`, the timer keeps running until it fires. `docker/client.ts` does call `cleanupWithTimeout(signal)` in a `finally`, so the known call sites are safe. Future call sites may forget, and the API design makes the leak easy.
- **Status:** Open

### C3-128 — MEDIUM (Medium) — 8. `normalizeSource` leaks long unclosed string content after `MAX_STRING_LITERAL_LENGTH`

- **Sources:** debugger
- **Files:** (see source review)
- **Summary:** When a string literal exceeds `MAX_STRING_LITERAL_LENGTH`, the inner `while` exits because `stringLength >= MAX`. The code then continues without checking whether it stopped at the closing delimiter. The remaining string characters are processed as ordinary code on subsequent iterations, so long string/blob content appears in the normalized output and pollutes the identifier-renaming map.
- **Status:** Open

### C3-129 — MEDIUM (Low) — 11. `AbortSignal.any` availability in the deployed Node.js runtime

- **Sources:** debugger
- **Files:** (see source review)
- **Summary:** `AbortSignal.any` was added in Node.js 20.3.0 / 18.17.0. The project targets Node.js 24 LTS, but if a production host runs an older interpreter or if a polyfilled environment is used, the similarity route will throw a runtime `TypeError`.
- **Status:** Open

### C3-130 — MEDIUM (Low) — 13. Docker build context includes the entire repo root

- **Sources:** debugger
- **Files:** (see source review)
- **Summary:** `buildDockerImageLocal` passes `.` as the build context. If this function is ever invoked from the app server by mistake (despite `BUILD_WORKER_IMAGE=false`), it would transmit the entire application source tree and possibly secrets to the Docker daemon/buildkit.
- **Status:** Open

### C3-131 — MEDIUM (High) — 3. Missing visible focus indicators on custom interactive elements

- **Sources:** designer
- **Files:** (see source review)
- **Summary:** WCAG 2.2 Focus Visible requires a visible indicator when an element receives keyboard focus. Several hand-rolled controls override or omit the ring.
- **Status:** Open

### C3-132 — MEDIUM (High) — 4. Interactive content nested inside a `role="button"` container

- **Sources:** designer
- **Files:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:135-170`
- **Summary:** The row header is a `<div role="button" tabIndex={0}>` that also contains a student-name `<Link>` and a “View submissions” `<Button>`. Although `stopPropagation` is used on the inner links, the DOM still places focusable interactive children inside an element with button semantics. Screen readers may announce the row as a button while also announcing nested links/buttons, producing a confusing tab order and invalid accessibility tree.
- **Status:** Open

### C3-133 — MEDIUM (Medium) — 5. Chat widget has no focus trap and header buttons lack explicit type/ring

- **Sources:** designer
- **Files:** `src/lib/plugins/chat-widget/chat-widget.tsx:313-411`
- **Summary:** When the chat panel is open it overlays the page, but focus is not trapped inside it. A keyboard user can tab behind the panel. The minimize/close header buttons are plain `<button>` elements without `type="button"` and without visible focus rings, and the launcher button has `aria-label="Chat"` hardcoded in English instead of using the locale key.
- **Status:** Open

### C3-134 — MEDIUM (High) — 6. Snapshot mini-timeline dots are too small and have no focus indicator

- **Sources:** designer
- **Files:** `src/components/contest/code-timeline-panel.tsx:211-221`
- **Summary:** Each snapshot is a `<button>` rendered as a 2 px × 2 px (inactive) or 6 px × 2 px (active) rounded bar. This is far below the 24 × 24 CSS-pixel minimum touch-target size and has no visible focus state.
- **Status:** Open

### C3-135 — MEDIUM (High) — 9. Tablists lack accessible names

- **Sources:** designer
- **Files:** (see source review)
- **Summary:** Multiple tablists on a page are announced only as generic tab groups. Screen-reader users cannot distinguish them, and voice-control users cannot target a tablist by name.
- **Status:** Open

### C3-136 — MEDIUM (High) — 10. Nested `<Link>` wrapping `<Button>` creates invalid interactive nesting

- **Sources:** designer
- **Files:** (see source review)
- **Summary:** The accessibility tree exposes a link with a nested button. HTML does not allow interactive content inside a link, and screen readers may ignore or misreport the nested button. Keyboard activation can behave inconsistently.
- **Status:** Open

### C3-137 — LOW (Medium) — `code-similarity-client.ts` casts the sidecar response after parsing

- **Sources:** code-reviewer
- **Files:** `src/lib/assignments/code-similarity-client.ts:93-97`
- **Summary:** The response is cast to `RustComputeResponse | null`; the follow-up `Array.isArray(responseBody.pairs)` check catches most malformed shapes, but the cast suppresses type narrowing for nested fields.
- **Status:** Open

### C3-138 — LOW (Medium) — `similarity-check` route returns HTTP 200 for caller timeout

- **Sources:** code-reviewer
- **Files:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:51-65`
- **Summary:** On `AbortError`, the route returns `apiSuccess({ status: "timed_out", ... })` with HTTP 200. This is an API design choice, but it deviates from the usual `apiError` pattern and may surprise API consumers expecting a 504/408.
- **Status:** Open

### C3-139 — LOW (Medium) — `normalizeSource` discards entire lines starting with `#` that are not C preprocessor directives

- **Sources:** code-reviewer
- **Files:** `src/lib/assignments/code-similarity.ts:56-64`
- **Summary:** For languages that use `#` for non-comment tokens (e.g., Markdown, shell, some config formats), the normalizer strips the rest of the line. This is irrelevant for similarity on C-family code but could produce misleading results if the normalizer is ever reused for broader text.
- **Status:** Open

### C3-140 — LOW (Medium) — Unencrypted database backups by default

- **Sources:** security-reviewer
- **Files:** `scripts/backup-db.sh:44-49,89-96`
- **Summary:** The backup script supports age encryption and rclone off-host sync, but both are optional. In the default host-exec or container-exec path, the gzip backup contains a full plaintext dump of the database (including password hashes, API keys, submissions, and hidden test cases).
- **Status:** Open

### C3-141 — LOW (Low) — Deploy script sources per-target env files via shell

- **Sources:** security-reviewer
- **Files:** `deploy-docker.sh:143-172`
- **Summary:** `deploy-docker.sh` sources `.env.deploy` and `.env.deploy.<target>` files through the shell. These files can contain arbitrary shell commands, not just variable assignments.
- **Status:** Open

### C3-142 — LOW (Low) — API key hash lookup is not constant-time

- **Sources:** security-reviewer
- **Files:** `src/lib/api/api-key-auth.ts:56-67`, `src/lib/security/token-hash.ts:10-12`
- **Summary:** API keys are hashed with SHA-256 and the hash is looked up via Drizzle/SQL equality. The comparison is not constant-time and the hashing function is not keyed.
- **Status:** Open

### C3-143 — LOW (Low) — Deprecated migrate/import JSON path still accepts password in request body when explicitly enabled

- **Sources:** security-reviewer
- **Files:** `src/app/api/v1/admin/migrate/import/route.ts:145-153,175-190`
- **Summary:** The legacy JSON body path `{ password, data }` is now gated by `ALLOW_JSON_IMPORT_PASSWORD=1` and emits a security alert when used, but the code path remains functional. It also returns the snapshot path leak described above.
- **Status:** Open

### C3-144 — LOW (High) — 8. Similarity-check API response is under-documented

- **Sources:** verifier
- **Files:** (see source review)
- **Summary:** 8. Similarity-check API response is under-documented
- **Status:** Open

### C3-145 — LOW (Medium) — 11. `ip-allowlist.ts` accepts leading-zero IPv4 octets in allowlist entries

- **Sources:** verifier
- **Files:** (see source review)
- **Summary:** 11. `ip-allowlist.ts` accepts leading-zero IPv4 octets in allowlist entries
- **Status:** Open

### C3-146 — LOW (Medium) — 12. Rate limiter runs before auth check in `createApiHandler`

- **Sources:** verifier
- **Files:** (see source review)
- **Summary:** 12. Rate limiter runs before auth check in `createApiHandler`
- **Status:** Open

### C3-147 — LOW (High) — 14. LOW: Test file naming is inconsistent, making coverage mapping harder

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** The `-implementation`/`-behavioral`/`-route` suffixes are not applied consistently. This makes automated route-to-test mapping unreliable and increases maintenance burden.
- **Status:** Open

### C3-148 — LOW (High) — 15. LOW: `source-grep-inventory` baseline is a manual number that requires constant updates

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** The documented baseline of 163 source-grep test files is manually bumped. This creates churn and can mask unintended new source-grep tests because the update is just a number change.
- **Status:** Open

### C3-149 — LOW (Medium) — L3. `consumeApiRateLimit` unit tests mock `execTransaction` to pass the same mock object as tx

- **Sources:** test-engineer
- **Files:** (see source review)
- **Summary:** The `execTransaction` mock runs the callback with the same `dbMock` object used for non-transactional queries. This does not catch bugs where code accidentally uses the global `db` instead of `tx` inside a transaction.
- **Status:** Open

### C3-150 — LOW (Medium) — COMP-3: Language validation runs after the sandbox-quota gate; invalid languages can consume daily quota.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Language validation runs after the sandbox-quota gate; invalid languages can consume daily quota.
- **Status:** Open

### C3-151 — LOW (Medium) — COMP-4: Container cleanup is fire-and-forget; `cleanup()` does not await `docker rm`.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Container cleanup is fire-and-forget; `cleanup()` does not await `docker rm`.
- **Status:** Open

### C3-152 — LOW (Medium) — COMP-5: Workspace cleanup depends on `CAP_CHOWN`/`CAP_DAC_OVERRIDE`; hardened runtimes may still leak.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Workspace cleanup depends on `CAP_CHOWN`/`CAP_DAC_OVERRIDE`; hardened runtimes may still leak.
- **Status:** Open

### C3-153 — LOW (Medium) — FILES-3: `DELETE` removes the DB row before disk object; disk orphan possible.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** `DELETE` removes the DB row before disk object; disk orphan possible.
- **Status:** Open

### C3-154 — LOW (Medium) — FILES-4: Upload writes disk before DB insert; crash between the two leaves orphan file.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Upload writes disk before DB insert; crash between the two leaves orphan file.
- **Status:** Open

### C3-155 — LOW (Medium) — RT-3: `shouldRecordSharedHeartbeat` fetches DB time before acquiring the advisory lock.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** `shouldRecordSharedHeartbeat` fetches DB time before acquiring the advisory lock.
- **Status:** Open

### C3-156 — LOW (Medium) — RT-4: `acquireSharedSseConnectionSlot` computes `expiresAt` from a timestamp fetched before the global lock.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** `acquireSharedSseConnectionSlot` computes `expiresAt` from a timestamp fetched before the global lock.
- **Status:** Open

### C3-157 — LOW (Medium) — DEPLOY-16: Backup retention `find ... -delete` has no lower-bound validation.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** Backup retention `find ... -delete` has no lower-bound validation.
- **Status:** Open

### C3-158 — LOW (High) — DEPLOY-17: `docker builder prune -af` deletes all unused build cache during deploy.

- **Sources:** tracer
- **Files:** (see source review)
- **Summary:** `docker builder prune -af` deletes all unused build cache during deploy.
- **Status:** Open

### C3-159 — LOW (Medium) — 18. Test and production Docker networks differ in topology

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** Local development builds language images via a separate `docker-compose.yml` that does not model the production network segmentation, sidecars, or proxy.  Network-isolation and sidecar behavior are therefore only exercised during deploys.
- **Status:** Open

### C3-160 — LOW (Medium) — 19. Static-site nginx is decoupled from app security headers

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** The static site has its own nginx config.  While the recent hardening added security headers, it is maintained separately from the generated app nginx and Next.js headers.  Any future drift in CSP, HSTS, or X-Content-Type-Options creates a bypass path.
- **Status:** Open

### C3-161 — LOW (Medium) — 20. Worker prewarming fires uncontrolled `docker run` commands at startup

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** On registration, the worker spawns one `docker run --rm <image> true` per prewarm image with a timeout.  These are fire-and-forget tasks with no concurrency limit, error surfacing, or backpressure.  On a worker host with many languages, startup can generate a burst of Docker operations.
- **Status:** Open

### C3-162 — LOW (Medium) — 21. Schema enum columns lack database CHECK constraints

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** Several `text()` columns encode enums without DB `CHECK` constraints.  The `assignments.exam_mode` table does add a check constraint, showing the pattern exists but is not applied consistently.  This allows invalid values to be inserted by migrations, raw SQL, or future bugs.
- **Status:** Open

### C3-163 — LOW (Medium) — 22. Build-phase DB connection uses a dummy connection string

- **Sources:** architect
- **Files:** (see source review)
- **Summary:** During `NEXT_PHASE === "phase-production-build"`, `drizzle()` is initialized with a dummy connection string.  The comment says this is only for type-checking, but the module still constructs a real `Pool`-backed drizzle instance at import time.  If Drizzle ever changes to validate or connect eagerly, builds could fail or leak connections.
- **Status:** Open

### C3-164 — LOW (Medium) — 9. `normalizeSource` strips line-start `#` lines that are not C preprocessor directives

- **Sources:** debugger
- **Files:** (see source review)
- **Summary:** A `#` at the start of a line is preserved only if `startsWithPreprocessorDirective` returns true. For Python, Ruby, Shell, or YAML submissions, `#` comments at line start are discarded, but so are any code tokens on the same line if the line happens to start with `#` and is not a recognized directive. Shebangs and pragma-like comments disappear. This is a latent correctness issue for similarity scoring across non-C languages.
- **Status:** Open

### C3-165 — LOW (Medium) — 10. `block_persists_when_system_clock_jumps_backward` logic relies on `Instant`, but `record_failure` recomputes wall-clock expiry

- **Sources:** debugger
- **Files:** (see source review)
- **Summary:** Internal block decisions use monotonic `Instant`, which is correct. The `blocked_until` timestamp returned to callers is `now_unix_ms + block_duration`, where `now_unix_ms` is captured at the top of the handler. If the system clock is adjusted backward between computing the monotonic block and reading `now_unix_ms`, the returned timestamp can be earlier than it should be. The test only covers the monotonic side.
- **Status:** Open

### C3-166 — LOW (Medium) — 7. Some `<Button onClick>` components inside forms lack explicit `type="button"`

- **Sources:** designer
- **Files:** (see source review)
- **Summary:** The project `Button` does not default to `type="button"`. Inside a `<form>` any button without an explicit type submits the form. Many of these buttons appear inside dialogs or cards, but some (e.g., language-config table actions) are in forms and could trigger an unintended submit if markup shifts.
- **Status:** Open

### C3-167 — LOW (High) — 8. Footer and header action links lack focus rings

- **Sources:** designer
- **Files:** `src/components/layout/public-footer.tsx:52-59`, `src/components/layout/public-header.tsx:235-244`
- **Summary:** These text links only change color on hover; they have no `:focus-visible` outline, so keyboard users cannot see focus.
- **Status:** Open

### C3-168 — LOW (High) — 11. Playground shows untranslated i18n keys and unlabeled controls

- **Sources:** designer
- **Files:** `src/components/code/compiler-client.tsx` (rendered at `/playground`)
- **Summary:** The test-case tab is announced as `"compiler.testCaseLabel"` and the test-case textbox contains that raw key as its value. The language `<Select>` at the top of the page has no associated `<Label>`.
- **Status:** Open

## Implemented / Verified

The following findings from the Cycle 3 reviews and the Cycle 2 aggregate are now addressed in the current working tree. They are listed here rather than in the active register.

| Finding | Status | Evidence |
|---------|--------|----------|
| `createApiHandler` now includes `requestId` in error bodies | Fixed | `src/lib/api/handler.ts:125-133,288-310` |
| Token revocation uses millisecond comparison | Fixed | `src/lib/auth/session-security.ts:36-41` |
| CSRF origin check consults DB `allowedHosts` | Fixed | `src/lib/security/csrf.ts:7-30`, `src/lib/security/env.ts:213-241` |
| `/api/v1/compiler/run` checks capability before quota | Fixed | `src/app/api/v1/compiler/run/route.ts:74-77` |
| Worker `deregister` fails on non-2xx responses | Fixed | `judge-worker-rs/src/api.rs:135-161` |
| Rate-limiter uses monotonic `Instant` for block decisions | Fixed | `rate-limiter-rs/src/main.rs:28-49` |
| `SecretString` zeroizes on drop | Fixed | `judge-worker-rs/src/types.rs` |
| Public auth routes enforce CSRF | Fixed | Public auth routes call `validateCsrf` |
| Generated nginx catch-all has `client_max_body_size 50M` | Fixed | `deploy-docker.sh` generated config |
| X-Forwarded-For chain preserved in nginx | Fixed | `deploy-docker.sh`, static templates use `$proxy_add_x_forwarded_for` |
| Security headers present in generated/static nginx | Fixed | `deploy-docker.sh`, `static-site/nginx.conf` |
| Docker networks segmented | Fixed | `docker-compose.production.yml:62-223` |
| Judge worker runs as non-root `judge` user | Fixed | `Dockerfile.judge-worker:33-49` |
| `sshpass -p` removed from deploy scripts | Fixed | `deploy-docker.sh`, `deploy.sh` |
| Code-similarity store operations serialized per assignment | Fixed | `src/lib/assignments/code-similarity.ts:424-509` |
| Code-similarity client uses `AbortSignal.any` | Fixed | `src/lib/assignments/code-similarity-client.ts:57-58` |
| Similarity route only returns `timed_out` for genuine aborts | Fixed | `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:44-69` |
| Contest join rejects recruiting before rate limit | Fixed | `src/app/api/v1/contests/join/route.ts:20-27` |
| Uploaded files written with mode `0o600` | Fixed | `src/lib/files/storage.ts:29` |
| IPv4 leading-zero octets rejected in allowlist | Fixed | `src/lib/judge/ip-allowlist.ts:139-152` |
| IPv6 canonicalized in `extractClientIp` | Fixed | `src/lib/security/ip.ts:142-205` |
| `roc` language consistent across stack | Fixed | `src/types/index.ts`, `src/lib/judge/languages.ts` |
| PID limits phase-specific | Fixed | `judge-worker-rs/src/docker.rs:323-326` |
| Static-site directory listing disabled | Fixed | `static-site/nginx.conf:45` |
| `deploy-test-backends.sh` uses dedicated migration container | Fixed | `deploy-test-backends.sh` |

## Rejected / Not-New / Accepted Risk

| Finding | Disposition | Evidence |
|---------|-------------|----------|
| `AUTH_TRUST_HOST=true` behind a trusted reverse proxy | Accepted risk, but remains CRITICAL because nginx does not strip client-supplied `X-Forwarded-Host` | `deploy-docker.sh:874-877` comment; `src/lib/auth/trusted-host.ts` |
| `JUDGE_ALLOWED_IPS` unset defaulting to allow-all | Accepted backward-compatibility risk, but remains CRITICAL because no production runbook requires closing it | `src/lib/judge/ip-allowlist.ts:20-22`, `228-229` comments |
| Plaintext access codes in `assignments.accessCode` | Accepted usability trade-off; instructors need to read/distribute codes | `src/lib/assignments/access-codes.ts:31-44` |
| Rate limit falls back to shared `:unknown` bucket when XFF is missing | Accepted fallback for proxy misconfiguration | `src/lib/security/rate-limit.ts:45-47` |
| Per-user failure limiter runs before per-code limiter on contest join | Accepted design to protect legitimate users from brute-force lockout | `src/app/api/v1/contests/join/route.ts:28-42` |

## Agent Failures / Limitations

- **Verifier limitations:** The verifier incorrectly marked several items as fixed in its Cycle 3 review. Direct source inspection shows the raw `secret_token` backfill/drop block still exists in `deploy-docker.sh`, the committed standalone HTTPS nginx template still caps `client_max_body_size` at 1 MiB in the catch-all `location /`, and the workspace cleanup logic added in Cycle 3 only works when the process runs as root (production runs non-root). These discrepancies were resolved by preferring direct source evidence over reviewer claims.
- **No agent failures:** All 11 agents (code-reviewer, perf-reviewer, security-reviewer, critic, verifier, test-engineer, tracer, architect, debugger, document-specialist, designer) produced readable, structured review files. No file was empty or malformed.
- **Coverage gaps:** The performance reviewer identified many unbounded resource hot paths but did not quantify throughput baselines. The test-engineer reviewer identified many test gaps but did not provide a remediation priority order. These limitations are reflected in the findings register.

## Cycle 2 Carry-Forward

The following Cycle 2 aggregate findings remain unaddressed or are only partially addressed in Cycle 3. They are carried forward here so they are not lost.

| ID (Cycle 2) | Severity | Finding | Status |
|--------------|----------|---------|--------|
| C2-Auth-7 | MEDIUM | CSRF Origin check does not honor the database allowed-hosts list | Superseded by C3-001/C3-059/C3-104; implemented but broader host-trust issue remains |
| C2-Auth-11 | MEDIUM | Function-judging literal values are not validated against target-language ranges | Carried forward as C3-024 |
| C2-Other-1 | HIGH | Generic 500 catch-all hides root causes | Carried forward as C3-012/C3-105 |
| C2-Sec-10 | MEDIUM | Generated app nginx lacked security headers | Implemented; see **Implemented / Verified** |
| C2-UI-1 | MEDIUM | Empty `<SelectValue />` shows raw option values | Carried forward as C3-057 |
| C2-UI-2 | MEDIUM | Form labels not associated with their controls | Carried forward as C3-058 |
| C2-UI-3 | MEDIUM | Missing visible focus indicators on custom interactive elements | Carried forward as C3-131 |

No other Cycle 2 findings remain unaddressed; all others are either implemented (see **Implemented / Verified**) or superseded by more specific Cycle 3 findings above.

## Cross-Cutting Themes

1. **Production defaults are insecure-by-default.** `AUTH_TRUST_HOST=true`, empty `JUDGE_ALLOWED_IPS`, and unencrypted internal service traffic are the most cited risks.
2. **Unbounded resource consumption.** File uploads, JSON body parsing, SSE fan-out, compiler queues, and code-similarity payloads all lack hard caps.
3. **Rate-limit and auth gaps.** `GET /api/v1/files` and `GET /api/v1/files/[id]` are repeatedly flagged as unthrottled.
4. **Real-time coordination relies on a single PostgreSQL advisory lock**, creating a global serialization point.
5. **Deployment hygiene.** Raw SQL patches, broad docker-socket-proxy privileges, env-file sourcing, and missing rollback/mutex controls appear across multiple reviews.
6. **Test quality.** Heavy mocking, source-grep assertions, skipped integration tests, and missing behavioral coverage for sidecars/auth/timeouts.
7. **Documentation drift.** API docs, deployment docs, and language docs lag the implemented behavior.

## Notes

- This aggregate merges the outputs of code-reviewer, perf-reviewer, security-reviewer, critic, verifier, test-engineer, tracer, architect, debugger, document-specialist, and designer.
- Deduplication rules, implemented items, rejected risks, agent limitations, and Cycle 2 carry-forward are documented in the dedicated sections above.
- The file should be reviewed by a human before scheduling remediation.

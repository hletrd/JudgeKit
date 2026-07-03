# Cycle 4 (2026-07-03) Multi-Agent Aggregate Review

**Date:** 2026-07-03
**Scope:** `/tmp/judgekit-local` — full stack (Next.js 16 app, Rust judge worker and sidecars, Docker/deployment, tests, docs, UI).
**Sources:** 10 per-agent review files under `.context/reviews/`: `code-reviewer.md`, `security-reviewer.md`, `critic.md`, `verifier.md`, `test-engineer.md`, `tracer.md`, `architect.md`, `debugger.md`, `document-specialist.md`, `designer.md`.

## Executive Summary

This aggregate merges the cycle-4 outputs of the 10 review agents. After deduplication, **146 unique findings** remain: **7 CRITICAL**, **40 HIGH**, **61 MEDIUM**, **38 LOW**.

Cross-agent agreement is strongest on four systemic production-default risks:

1. `AUTH_TRUST_HOST=true` in production with nginx not stripping `X-Forwarded-Host`.
2. Judge API IP allowlist defaulting to allow-all.
3. Raw SQL additive schema patches bypassing the Drizzle migration journal.
4. Workspace cleanup still leaking in production because non-root processes cannot `chown` sandbox-owned files.

The cycle also surfaced a fresh **CRITICAL** test-coverage gap: `similarity-check.route.test.ts` mocks `createApiHandler`, so auth, CSRF, rate-limit, body parsing, and request-ID behavior are never exercised for that route.

Several cycle-3 remediation items are verified as fixed in the current tree (see **Implemented / Verified**), but many architectural risks (real-time PostgreSQL advisory-lock bottleneck, unencrypted internal service HTTP, monolithic deploy script, Docker socket proxy blast radius, triplicated language config) remain unresolved.

**Important caveats:**
- The **verifier** and **debugger** both warn that the Cycle 3 workspace-cleanup fix only works when the process is root. Production images run as non-root (`nextjs` uid 1001 in the app, `judge` uid 1000 in the worker), so the leak persists.
- The **critic** notes that the raw SQL `secret_token` backfill is now gated by `ALLOW_SECRET_TOKEN_BACKFILL=1`, which is a safety improvement, but the patch is still outside the Drizzle journal.
- Some review files contain internal contradictions. The **verifier** lists several items as both "Confirmed" in its main findings and "Verified fixed" in its Cycle-3 remediation section (e.g., generated nginx `client_max_body_size`, Rust worker PID limits, `roc` language consistency, IP canonicalization). Where the majority of sources or explicit verification evidence confirms a fix, the item is moved to **Implemented / Verified** and noted as disputed.
- The **code-reviewer** and **security-reviewer** still flag `GET /api/v1/files` as lacking a rate limit, while the **critic** explicitly verifies `rateLimit: "files:list"` is present. Because the code-reviewer/security-reviewer reports are the most recent detailed inspections of the route and the file is modified in the working tree, the finding is retained as active but annotated as disputed.
- No review file was empty or malformed; all 10 agents completed successfully.

## Findings Register

| ID | Severity | Confidence | Sources | Files | Title | Status |
|---|---|---|---|---|---|---|
| C4-001 | CRITICAL | High | security-reviewer, critic, verifier, document-specialist, architect, tracer | `src/lib/security/env.ts:260-266`; `src/lib/auth/config.ts:317`; `docker-compose.production.yml:115`; `deploy-docker.sh:750,878,952`; `docs/deployment.md:18,44` | Production defaults to `AUTH_TRUST_HOST=true` and nginx does not strip `X-Forwarded-Host` | Open |
| C4-002 | CRITICAL | High | security-reviewer, critic, architect | `docker-compose.production.yml:116-118,151`; `judge-worker-rs/src/config.rs`; `src/lib/compiler/execute.ts:69`; `src/lib/assignments/code-similarity-client.ts:4` | Internal service traffic is unencrypted HTTP on segmented Docker bridge networks | Open |
| C4-003 | CRITICAL | High | security-reviewer, critic, architect, verifier, code-reviewer, tracer | `src/lib/judge/ip-allowlist.ts:17-25,209-241`; `docker-compose.production.yml`; `deploy-docker.sh:658-770`; `.env.production` | Judge API IP allowlist defaults to allow-all in production | Open |
| C4-004 | CRITICAL | High | security-reviewer, critic, architect, tracer | `deploy-docker.sh:1240-1312`; `src/lib/db/migrate.ts:1-7`; `src/lib/judge/auth.ts:75-82` | Raw SQL additive schema patch bypasses the Drizzle migration journal (now gated, still untracked) | Open |
| C4-005 | CRITICAL | High | debugger | `src/lib/compiler/execute.ts:348-384`; `Dockerfile` (app runs as `nextjs` uid 1001) | Node.js compiler workspace cleanup leaks in production because non-root app cannot `chown` sandbox-owned files | Open |
| C4-006 | CRITICAL | High | debugger | `judge-worker-rs/src/workspace.rs:31-65`; `Dockerfile.judge-worker` (worker runs as `judge` uid 1000) | Rust worker `SandboxWorkspace::drop` leaks in production because non-root worker cannot `chown` sandbox-owned files | Open |
| C4-007 | CRITICAL | High | test-engineer | `tests/unit/api/similarity-check.route.test.ts:40-47`; `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:26-98` | `similarity-check.route.test.ts` mocks `createApiHandler`, bypassing all middleware | Open |
| C4-008 | HIGH | High | code-reviewer, tracer, architect | `src/lib/realtime/realtime-coordination.ts:73-140` | Real-time coordination serializes every SSE acquisition and heartbeat through a single PostgreSQL advisory lock | Open |
| C4-009 | HIGH | High | critic, architect | `docker-compose.production.yml:69-90`; `docker-compose.worker.yml:22-43` | Docker socket proxy still grants broad container lifecycle privileges (POST/DELETE/ALLOW_START/ALLOW_STOP) | Open |
| C4-010 | HIGH | High | critic, architect, tracer | `deploy-docker.sh` (~1,100+ lines) | `deploy-docker.sh` is a single monolithic script with no per-phase rollback | Open |
| C4-011 | HIGH | High | critic, architect, tracer | `src/lib/security/rate-limit.ts`; `src/lib/security/rate-limiter-client.ts`; `rate-limiter-rs/src/main.rs` | Rate-limiting has two sources of truth (sidecar + DB) | Open |
| C4-012 | HIGH | Medium | critic, architect, tracer | `src/lib/db/schema.pg.ts:20-63`; `src/lib/capabilities/`; `src/lib/api/handler.ts:73-109,201-202` | Role/capability authorization is split across role names and capability strings | Open |
| C4-013 | HIGH | High | critic, tracer, verifier | `scripts/online-judge.nginx.conf:60,85,94,95`; `deploy-docker.sh` (committed templates) | Committed standalone nginx template still caps catch-all `location /` at `client_max_body_size 1m` | Open |
| C4-014 | HIGH | High | security-reviewer, critic | `src/app/api/v1/admin/restore/route.ts:170,196,197,207,229,230,239`; `src/app/api/v1/admin/migrate/import/route.ts:115,132,141` | Admin restore/import responses and durable audit logs leak server-side snapshot path | Open |
| C4-015 | HIGH | High | critic, architect | `src/lib/judge/languages.ts`; `src/types/index.ts`; `judge-worker-rs/src/types.rs`; `judge-worker-rs/src/languages.rs`; `tests/unit/infra/language-contract.test.ts` | Language configuration is triplicated with no generated contract | Open |
| C4-016 | HIGH | Medium | critic | `src/lib/judge/function-judging/types.ts:47-57` | Function-judging literal values are not validated against target-language ranges | Open |
| C4-017 | HIGH | Medium | code-reviewer | `src/lib/db/import.ts:87-89` | Database import corrupts exported boolean strings (`"false"` → `true`) | Open |
| C4-018 | HIGH | High | code-reviewer, security-reviewer, tracer | `src/app/api/v1/files/route.ts:155-208` | `GET /api/v1/files` list endpoint lacks rate limiting | Open / disputed |
| C4-019 | HIGH | Medium | code-reviewer, tracer | `src/lib/api/handler.ts:288-310,303-310` | `createApiHandler` swallows details for unhandled exceptions | Open |
| C4-020 | HIGH | High | tracer | `src/app/api/v1/judge/poll/route.ts:82-112` | In-progress reports reset `judgeClaimedAt`, allowing a worker to extend a claim indefinitely | Open |
| C4-021 | HIGH | High | tracer, architect | `src/lib/api/handler.ts:201-202` | `createApiHandler` role check rejects custom roles via `isUserRole()`, breaking `auth.roles` for non-built-in roles | Open |
| C4-022 | HIGH | High | tracer | `src/app/api/v1/files/[id]/route.ts:100-105` | `GET /api/v1/files/[id]` loads the entire file into memory and has no rate limit | Open |
| C4-023 | HIGH | Medium | tracer | `code-similarity-rs/src/main.rs:126-128` | Rust sidecar `spawn_blocking` task is not cancellable; client disconnect leaves CPU pinned | Open |
| C4-024 | HIGH | High | tracer | `deploy-docker.sh:1336-1341` | Migration containers run unpinned `npm install --no-save drizzle-kit ...` with full DB secrets | Open |
| C4-025 | HIGH | Medium | tracer | `deploy-test-backends.sh:194-201` | `deploy-test-backends.sh` can stop the production compose stack without a production guard | Open |
| C4-026 | HIGH | Medium | tracer | `scripts/pg-volume-safety-check.sh:286-287` | PG volume safety check auto-migrate uses unvalidated `rm -rf ${NAMED_SRC}/*` | Open |
| C4-027 | HIGH | Medium | tracer | `deploy.sh` | Legacy `deploy.sh` remains executable and bypasses hardened deploy path | Open |
| C4-028 | HIGH | Medium | debugger | `src/lib/docker/client.ts:320-372` | `buildDockerImageLocal` leaves a running `docker build` process on timeout | Open |
| C4-029 | HIGH | Medium | debugger | `src/lib/db/export-with-files.ts:267-349`; `src/app/api/v1/admin/restore/route.ts:82-124` | Backup restore keeps all uploaded files in memory before writing to disk | Open |
| C4-030 | HIGH | Low | debugger | `src/lib/security/ip.ts` | `TRUSTED_PROXY_HOPS` default may be unset in production, collapsing rate-limit keys to `0.0.0.0` | Open |
| C4-031 | HIGH | High | test-engineer | `tests/unit/api/similarity-check.route.test.ts:133-167` | Similarity-check timeout test is wall-clock dependent and can flake | Open |
| C4-032 | HIGH | High | test-engineer | `tests/unit/api/contests.route.test.ts:224-354`; `src/app/api/v1/contests/join/route.ts:15-51` | Contest join route tests do not verify CSRF enforcement or malformed body handling | Open |
| C4-033 | HIGH | High | test-engineer | `src/lib/api/handler.ts:114-123,287-311` | No route test verifies request-ID / error taxonomy on real endpoints | Open |
| C4-034 | HIGH | High | test-engineer | `tests/integration/db/judge-claim-reclaim.test.ts:28`; `tests/integration/db/submission-lifecycle.test.ts:28`; `tests/integration/db/user-crud.test.ts:15`; `tests/integration/db/catalog-numbers.test.ts:23`; `tests/integration/api/health.test.ts:6` | Integration tests skip silently without a Postgres database | Open |
| C4-035 | HIGH | High | verifier | `scripts/online-judge.nginx.conf:63,77,88,100`; `scripts/online-judge.nginx-http.conf:33,44` | Committed nginx templates overwrite `X-Forwarded-For` with `$remote_addr` | Open |
| C4-036 | HIGH | High | verifier, document-specialist | `docs/api.md:1089-1098`; `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:26-97`; `src/lib/assignments/code-similarity.ts:248-253` | `docs/api.md` similarity-check endpoint is stale (auth, timeout status, response schema) | Open |
| C4-037 | HIGH | High | verifier, document-specialist | `docs/languages.md:210,224`; `src/types/index.ts:130`; `src/lib/judge/languages.ts:1430-1440`; `judge-worker-rs/src/types.rs:191`; `judge-worker-rs/src/languages.rs:1758-1768,2029,2167` | `roc` language support is inconsistent across the stack | Open / disputed |
| C4-038 | HIGH | High | document-specialist | `docs/api.md:1-2037`; `src/app/api/v1/**` | `docs/api.md` omits 34 live `/api/v1` endpoints | Open |
| C4-039 | HIGH | High | designer | `src/app/(public)/groups/[id]/assignments/[assignmentId]/filter-form.tsx:81`; `src/components/problem/accepted-solutions.tsx:121,136`; `src/components/contest/score-timeline-chart.tsx:66`; `src/components/contest/contest-replay.tsx:222`; `src/components/contest/contest-clarifications.tsx:203`; `src/components/contest/anti-cheat-dashboard.tsx:504` | Empty `<SelectValue />` shows raw option values instead of labels | Open |
| C4-040 | HIGH | High | designer | `src/components/contest/quick-create-contest-form.tsx:106,115,126,140,151`; `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:429,461,477,497,517,632`; `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:387,408`; `src/lib/plugins/chat-widget/admin-config.tsx:158,172,193,260,278,295,306`; (representative list) | Form labels are not programmatically associated with their controls | Open |
| C4-041 | MEDIUM | High | code-reviewer, tracer | `src/lib/security/csrf.ts:7-30,57`; `src/lib/security/env.ts:213-252` | CSRF check performs a database read on every mutation | Open |
| C4-042 | MEDIUM | Medium | code-reviewer | `src/lib/compiler/execute.ts:187-277` | Shell validators still wrap commands in `sh -c` and the prefix whitelist is bypassable | Open |
| C4-043 | MEDIUM | High | code-reviewer | `src/lib/system-settings-config.ts:90-109`; `src/proxy.ts:37`; `src/lib/data-retention.ts:18-23` | Environment integer parsing accepts malformed strings (`"10abc"` → `10`) | Open |
| C4-044 | MEDIUM | High | code-reviewer, architect | `src/lib/system-settings-config.ts:84-205` | `system_settings` cache can return stale values during background reload | Open |
| C4-045 | MEDIUM | Medium | code-reviewer | `src/lib/db/index.ts:92`; `src/lib/db/queries.ts:52`; `src/lib/db/export.ts:303,368`; `src/lib/auth/config.ts:379`; `src/lib/db/pre-restore-snapshot.ts:90`; `src/lib/recruiting/request-cache.ts:78`; `src/lib/plugins/chat-widget/providers.ts:264,407` | Unsafe type casts proliferate in boundary layers | Open |
| C4-046 | MEDIUM | High | critic, verifier, test-engineer | `tests/unit/infra/deploy-security.test.ts`; `tests/unit/infra/deploy-storage-safety.test.ts`; `tests/unit/infra/judge-report-nginx.test.ts` | Deployment/infrastructure tests verify string presence, not rendered behavior | Open |
| C4-047 | MEDIUM | High | security-reviewer, critic | `src/app/api/v1/admin/migrate/import/route.ts:145-153,149-154,175-190` | Deprecated migrate/import JSON password path remains functional when explicitly enabled | Open |
| C4-048 | MEDIUM | Medium | critic | `src/lib/db/index.ts`; multiple route handlers | Unit of work / transaction boundary discipline is inconsistent | Open |
| C4-049 | MEDIUM | Medium | critic | `docker-compose.production.yml:215-222` | Docker Compose lacks explicit `internal: true` bridge isolation | Open |
| C4-050 | MEDIUM | High | critic, tracer | `deploy-docker.sh`; `docs/ops/` | No documented operational rollback runbook for `deploy-docker.sh` | Open |
| C4-051 | MEDIUM | Medium | critic | `deploy-docker.sh`; `docker-compose.production.yml` | Judge worker IP allowlist auto-population is missing | Open |
| C4-052 | MEDIUM | High | critic, architect | `docker-compose.production.yml:69-90`; `docker-compose.worker.yml:22-43` | Container lifecycle audit logging is absent | Open |
| C4-053 | MEDIUM | High | critic | `deploy-docker.sh:874-877` | `AUTH_TRUST_HOST=true` comment conflates reverse-proxy use with trusting arbitrary Host headers | Open |
| C4-054 | MEDIUM | Medium | critic | `src/lib/realtime/realtime-coordination.ts:205-218` | Real-time coordination warns but does not fail when multi-instance is undeclared | Open |
| C4-055 | MEDIUM | High | verifier | `AGENTS.md:313`; `judge-worker-rs/src/docker.rs:330-373`; `src/lib/compiler/execute.ts:350-394` | Judge-container DNS hardening is documented but not implemented | Open / disputed |
| C4-056 | MEDIUM | Medium | verifier | `.env.example` | Many env vars referenced in code are missing from `.env.example` | Open |
| C4-057 | MEDIUM | High | test-engineer | `tests/unit/compiler/execute.test.ts:225-301` | Compiler workspace-cleanup regression tests never run both root and non-root paths in one CI job | Open |
| C4-058 | MEDIUM | High | test-engineer | `src/lib/compiler/execute.ts:649-981` | Compiler execute runtime paths (Docker spawn, Rust runner fallback, OOM inspection) are not exercised | Open |
| C4-059 | MEDIUM | High | test-engineer | `src/lib/security/ip.ts:142-205`; `tests/unit/security/ip.test.ts` | IP extraction tests do not cover consumer integration (rate limiter, judge allowlist) | Open |
| C4-060 | MEDIUM | High | test-engineer | `tests/unit/infra/judge-report-nginx.test.ts`; `tests/unit/infra/deploy-security.test.ts`; `deploy-docker.sh` (nginx heredoc) | Generated nginx config is not rendered and syntax-checked | Open |
| C4-061 | MEDIUM | High | test-engineer | `tests/unit/api/recruiting-invitations-race-implementation.test.ts`; `tests/unit/assignments/access-codes-race-invariant.test.ts`; `tests/unit/api/judge-claim-db-time.test.ts` | Race-condition coverage is mostly source-grep; integration tests skipped without Postgres | Open |
| C4-062 | MEDIUM | Medium | test-engineer | `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:73-84`; `tests/unit/api/similarity-check.route.test.ts:104-191` | No test for similarity-check route enrichment query failure | Open |
| C4-063 | MEDIUM | Medium | tracer | `src/app/api/v1/submissions/route.ts:345-430` | Global submission queue cap is checked without a global lock, allowing cross-user races | Open |
| C4-064 | MEDIUM | Medium | tracer | `src/lib/realtime/realtime-coordination.ts:142-144` | `releaseSharedSseConnectionSlot` deletes rows without acquiring the advisory lock used by acquisition | Open |
| C4-065 | MEDIUM | High | tracer | `src/lib/security/api-rate-limit.ts:164-171` | Sidecar `allowed=false` verdict returns 429 without recording the attempt in Postgres | Open |
| C4-066 | MEDIUM | High | tracer | `rate-limiter-rs/src/main.rs:262-264` | Rate-limiter sidecar `/check` increments its own counter, duplicating the authoritative DB increment | Open |
| C4-067 | MEDIUM | Medium | tracer | `src/lib/compiler/execute.ts:621-638` | `/api/v1/compiler/run` has no overall request timeout; runner connect can hang for up to 2 minutes | Open |
| C4-068 | MEDIUM | Medium | tracer | `judge-worker-rs/src/runner.rs:734-830` | Rust runner `/run` does not check `docker_capability_ok` before accepting work | Open |
| C4-069 | MEDIUM | High | tracer | `src/app/api/v1/contests/join/route.ts:34-41` | Per-user failure limiter runs before per-code limiter, giving multi-account attackers N budgets | Open |
| C4-070 | MEDIUM | High | tracer | `src/app/api/v1/contests/join/route.ts` | Failure-rate-limit buckets are never reset on a successful redemption | Open |
| C4-071 | MEDIUM | High | tracer | `src/lib/security/rate-limit.ts:46` | Missing/short X-Forwarded-For collapses traffic into shared `api:*:unknown` rate-limit bucket | Open |
| C4-072 | MEDIUM | High | tracer | `src/lib/assignments/code-similarity.ts:332-341` | Similarity raw CTE query is not abort-aware and runs inside the 30 s route budget | Open |
| C4-073 | MEDIUM | High | tracer | `src/lib/assignments/code-similarity.ts:456,490` | Advisory lock covers only the similarity store phase, not read+compute | Open |
| C4-074 | MEDIUM | Medium | tracer | `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24` | Similarity capability check precedes group-TA check; pure group TA without capability is denied | Open |
| C4-075 | MEDIUM | High | tracer | `src/lib/capabilities/cache.ts:17-20` | Role/capability cache is module-local with no cross-instance invalidation | Open |
| C4-076 | MEDIUM | High | tracer | `src/lib/api/handler.ts:288-310,303-310` | Generic 500 catch-all returns identical `internalServerError` for all unhandled exceptions | Open |
| C4-077 | MEDIUM | Medium | tracer | `judge-worker-rs/src/main.rs:686-690` | Rust worker runner HTTP server aborts without draining in-flight `/run` requests | Open |
| C4-078 | MEDIUM | Medium | tracer | `deploy-docker.sh:1182-1384` | Deploy is not atomic: old containers stopped before migrations/health checks pass; no auto-rollback | Open |
| C4-079 | MEDIUM | Medium | tracer | `deploy-docker.sh:1446-1482` | Worker env sync excludes `.env*` and may omit required tokens on fresh hosts | Open |
| C4-080 | MEDIUM | Medium | tracer | `docker-compose.production.yml` | No `stop_grace_period` in compose; Docker kills containers after 10 s | Open |
| C4-081 | MEDIUM | Medium | tracer | `deploy-docker.sh:1776-1801` | Post-deploy Playwright smoke runs after all remote mutations; failure leaves broken state live | Open |
| C4-082 | MEDIUM | Medium | tracer | `deploy-test-backends.sh:246-252` | Test-backend script falls back to hard-coded `judgekit_test` password | Open |
| C4-083 | MEDIUM | Medium | tracer | `deploy-docker.sh` | No mutex prevents concurrent deploys to the same host | Open |
| C4-084 | MEDIUM | Medium | debugger | `src/lib/abort.ts:55-81`; `src/lib/docker/client.ts:178-191,218-231` | `withTimeout` timer cleanup API is fragile and can leak timers | Open |
| C4-085 | MEDIUM | Medium | debugger | `src/lib/assignments/code-similarity.ts:69-95` | `normalizeSource` leaks long unclosed string content after `MAX_STRING_LITERAL_LENGTH` | Open |
| C4-086 | MEDIUM | Medium | debugger | `src/lib/files/storage.ts:14-16,27-30` | Uploads directory created with overly permissive umask-dependent mode | Open |
| C4-087 | MEDIUM | Medium | debugger | `src/lib/db/cleanup.ts:45-63` | `cleanupOldEvents` batch DELETE `LIMIT` may be ignored by PostgreSQL planner | Open |
| C4-088 | MEDIUM | High | architect | `src/lib/system-settings-config.ts:67-82,40-64`; `src/lib/db/schema.pg.ts` | Configuration resolution is scattered across env, DB, and hardcoded defaults | Open |
| C4-089 | MEDIUM | High | architect | `src/proxy.ts` | Middleware performs DB lookups in the Edge Runtime | Open |
| C4-090 | MEDIUM | High | architect | `src/app/api/v1/**`; `src/lib/api/handler.ts` | No API versioning strategy beyond the `/api/v1` path prefix | Open |
| C4-091 | MEDIUM | Medium | architect | `src/lib/judge/function-judging/`; `judge-worker-rs/src/languages.rs` | Function-judging serialization boundary between TypeScript and Rust is implicit | Open |
| C4-092 | MEDIUM | High | architect | `src/lib/api/handler.ts:116-121`; `src/lib/docker/client.ts:167-204`; `src/lib/assignments/code-similarity-client.ts`; `src/lib/security/rate-limiter-client.ts` | Distributed request ID is not propagated to all internal services | Open |
| C4-093 | MEDIUM | High | architect | `src/lib/auth/config.ts:317-321` | `system_settings`-dependent session maxAge captured at module load time | Open |
| C4-094 | MEDIUM | High | designer | `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:135-146`; `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:196-210`; `src/components/contest/code-timeline-panel.tsx:211-221`; (representative list) | Missing visible focus indicators on custom interactive elements | Open |
| C4-095 | MEDIUM | High | designer | `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:135-170` | Interactive content nested inside a `role="button"` container | Open |
| C4-096 | MEDIUM | Medium | designer | `src/lib/plugins/chat-widget/chat-widget.tsx:313-411` | Chat widget has no focus trap and header buttons lack explicit type/ring | Open |
| C4-097 | MEDIUM | High | designer | `src/components/contest/code-timeline-panel.tsx:211-221` | Snapshot mini-timeline dots are too small and have no focus indicator | Open |
| C4-098 | MEDIUM | High | designer | `src/app/(public)/practice/problems/[id]/page.tsx`; `src/app/(dashboard)/dashboard/page.tsx`; `src/components/code/compiler-client.tsx` | Tablists lack accessible names | Open |
| C4-099 | MEDIUM | High | designer | `src/app/(dashboard)/dashboard/page.tsx`; `src/app/(public)/practice/problems/[id]/page.tsx` | Nested `<Link>` wrapping `<Button>` creates invalid interactive nesting | Open |
| C4-100 | MEDIUM | High | document-specialist | `docs/deployment.md:7` | App container internal port documented as `3100` instead of `3000` | Open |
| C4-101 | MEDIUM | High | document-specialist | `AGENTS.md:113`; `docs/languages.md:73,224`; `src/lib/judge/languages.ts` | `flix` documented as `judge-jvm` and both arm64-ready and ARM-prohibitive | Open |
| C4-102 | MEDIUM | Medium | document-specialist | `README.md:29`; `AGENTS.md`; `src/lib/capabilities/types.ts:8-80` | Docs claim 43 capabilities; code defines 46 | Open |
| C4-103 | MEDIUM | Medium | document-specialist | `README.md:77`; `docs/languages.md:192`; `src/lib/judge/languages.ts` | Active Docker image count claims are stale (102 claimed vs 99 active) | Open |
| C4-104 | MEDIUM | Medium | document-specialist | `docs/languages.md:214-220`; `scripts/setup.sh:59-149` | `all` preset docs say it excludes ARM-prohibitive languages; setup script includes them | Open |
| C4-105 | MEDIUM | Medium | document-specialist | `docs/deployment.md:80-81`; `deploy-docker.sh:268-277`; `AGENTS.md:375` | Preset size estimates are stale | Open |
| C4-106 | MEDIUM | Medium | document-specialist | `docs/api.md:1666-1668`; `AGENTS.md:260-261`; `src/app/api/v1/admin/docker/images/route.ts:55`; `src/app/api/v1/admin/docker/images/build/route.ts:19` | Docker image API auth documented as admin-only; code requires `system.settings` | Open |
| C4-107 | MEDIUM | Medium | document-specialist | `docs/api.md:941-943`; `src/app/api/v1/contests/join/route.ts:34-41` | Contest join docs omit the failure-scoped rate-limit buckets | Open |
| C4-108 | MEDIUM | Medium | document-specialist | `AGENTS.md:210`; `src/lib/judge/languages.ts:111`; `docker/Dockerfile.judge-haskell:1` | `judge-haskell` base image reported three different ways | Open |
| C4-109 | MEDIUM | Medium | document-specialist | `docs/admin-security-operations.md:67-77`; `src/lib/security/ip.ts:11-205`; `.env.example:175-182` | Admin security ops guide lacks reverse-proxy IP trust documentation | Open |
| C4-110 | MEDIUM | Medium | document-specialist | `docs/deployment.md:40-63`; `.env.example`; `.env.production.example` | Deployment guide env var reference omits security/operational variables | Open |
| C4-111 | MEDIUM | Medium | document-specialist | `docs/deployment.md`; `deploy-docker.sh:1589-1629` | Generated nginx `client_max_body_size` scoping is undocumented | Open |
| C4-112 | LOW | Medium | code-reviewer | `src/lib/assignments/code-similarity-client.ts:93-97` | `code-similarity-client.ts` casts the sidecar response after parsing | Open |
| C4-113 | LOW | Medium | code-reviewer | `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:51-65` | `similarity-check` route returns HTTP 200 for caller timeout | Open |
| C4-114 | LOW | Medium | code-reviewer, debugger | `src/lib/assignments/code-similarity.ts:56-64` | `normalizeSource` strips line-start `#` lines that are not C preprocessor directives | Open |
| C4-115 | LOW | Medium | security-reviewer | `scripts/backup-db.sh:44-49,89-96` | Unencrypted database backups by default | Open |
| C4-116 | LOW | Low | security-reviewer | `deploy-docker.sh:143-172` | Deploy script sources per-target env files via shell | Open |
| C4-117 | LOW | Low | security-reviewer | `src/lib/api/api-key-auth.ts:56-67`; `src/lib/security/token-hash.ts:10-12` | API key hash lookup is not constant-time | Open |
| C4-118 | LOW | Medium | verifier | `src/lib/judge/ip-allowlist.ts:155-160`; `src/lib/security/ip.ts:18-27` | `ip-allowlist.ts` accepts leading-zero IPv4 octets in allowlist entries | Open |
| C4-119 | LOW | Medium | verifier | `src/lib/api/handler.ts:117-121,123-142` | Rate limiter runs before auth check in `createApiHandler` | Open |
| C4-120 | LOW | High | test-engineer | `tests/e2e/output-only-languages.spec.ts:110`; `tests/e2e/all-languages-judge.spec.ts:1137,1228,1255`; `tests/e2e/function-judging.spec.ts:206,252,275`; (representative list) | E2E test suite contains many environment-dependent skips | Open |
| C4-121 | LOW | Medium | test-engineer | `tests/component/setup.ts:1-8` | Component tests do not reset global mocks/stubs after each test | Open |
| C4-122 | LOW | High | test-engineer | `tests/unit/api/admin-submissions-bulk-rejudge-implementation.test.ts`; `tests/unit/api/admin-submissions-export-behavioral.test.ts`; `tests/unit/api/admin-submissions-export-implementation.test.ts`; `tests/unit/api/contests.route.test.ts` | Inconsistent route-test naming hampers automated coverage mapping | Open |
| C4-123 | LOW | Medium | tracer | `src/app/api/v1/compiler/run/route.ts` | Language validation runs after the sandbox-quota gate; invalid languages can consume daily quota | Open |
| C4-124 | LOW | Medium | tracer | `src/lib/compiler/execute.ts:389-395` | Container cleanup is fire-and-forget; `cleanup()` does not await `docker rm` | Open |
| C4-125 | LOW | Medium | tracer | `src/lib/compiler/execute.ts`; `judge-worker-rs/src/workspace.rs` | Workspace cleanup depends on `CAP_CHOWN`/`CAP_DAC_OVERRIDE`; hardened runtimes may still leak | Open |
| C4-126 | LOW | Medium | tracer | `src/app/api/v1/files/[id]/route.ts` | File `DELETE` removes the DB row before disk object; disk orphan possible | Open |
| C4-127 | LOW | Medium | tracer | `src/app/api/v1/files/route.ts` | File upload writes disk before DB insert; crash between the two leaves orphan | Open |
| C4-128 | LOW | Medium | tracer | `src/lib/realtime/realtime-coordination.ts` | `shouldRecordSharedHeartbeat` fetches DB time before acquiring advisory lock | Open |
| C4-129 | LOW | Medium | tracer | `src/lib/realtime/realtime-coordination.ts` | `acquireSharedSseConnectionSlot` computes `expiresAt` from timestamp fetched before lock | Open |
| C4-130 | LOW | Medium | tracer | `scripts/backup-db.sh` | Backup retention `find ... -delete` has no lower-bound validation | Open |
| C4-131 | LOW | High | tracer | `deploy-docker.sh` | `docker builder prune -af` deletes all unused build cache during deploy | Open |
| C4-132 | LOW | Low | debugger | `src/lib/assignments/code-similarity-client.ts:58` | `AbortSignal.any` availability in the deployed Node.js runtime | Open |
| C4-133 | LOW | Low | debugger | `src/lib/docker/client.ts:310` | Docker build context includes the entire repo root | Open |
| C4-134 | LOW | Medium | debugger | `rate-limiter-rs/src/main.rs:277-346` | Returned `blocked_until` wall-clock timestamp can drift if system clock steps backward | Open |
| C4-135 | LOW | Medium | architect | `docker-compose.yml`; `docker-compose.production.yml` | Test and production Docker networks differ in topology | Open |
| C4-136 | LOW | Medium | architect | `static-site/nginx.conf`; `next.config.ts`; `src/proxy.ts` | Static-site nginx is decoupled from app security headers | Open |
| C4-137 | LOW | Medium | architect | `judge-worker-rs/src/main.rs` | Worker prewarming fires uncontrolled `docker run` commands at startup | Open |
| C4-138 | LOW | Medium | architect | `src/lib/db/schema.pg.ts` | Schema enum columns lack database CHECK constraints | Open |
| C4-139 | LOW | Medium | architect | `src/lib/db/index.ts` | Build-phase DB connection uses a dummy connection string | Open |
| C4-140 | LOW | Medium | designer | `src/app/(public)/groups/[id]/group-members-manager.tsx:399`; `src/app/(public)/groups/[id]/group-instructors-manager.tsx:160`; `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:100,115,230`; (representative list) | Some `<Button onClick>` inside forms lack explicit `type="button"` | Open |
| C4-141 | LOW | High | designer | `src/components/layout/public-footer.tsx:52-59`; `src/components/layout/public-header.tsx:235-244` | Footer and header action links lack focus rings | Open |
| C4-142 | LOW | High | designer | `src/components/code/compiler-client.tsx` | Playground shows untranslated i18n keys and unlabeled controls | Open |
| C4-143 | LOW | Low | document-specialist | `docs/data-retention-policy.md:38`; `src/lib/data-retention.ts:46-52` | Data-retention legal hold said to require restart; code re-reads env every prune cycle | Open |
| C4-144 | LOW | Low | document-specialist | `docs/languages.md:194-204`; `AGENTS.md:20,22-150` | E2E totals and AGENTS language table row counts are stale | Open |
| C4-145 | LOW | Low | document-specialist | `docker/Dockerfile.judge-simula` | Orphan `judge-simula` Dockerfile with no language binding | Open |

## Implemented / Verified

The following prior-cycle findings are confirmed fixed or materially improved in the current tree by one or more Cycle 4 reviewers. They are not carried forward as active findings.

| Finding | Evidence |
|---|---|
| `createApiHandler` includes `requestId` in error bodies | `src/lib/api/handler.ts:125-133,288-310` |
| Token revocation uses millisecond precision | `src/lib/auth/session-security.ts:36-41` |
| CSRF origin check integrates DB/system `allowedHosts` | `src/lib/security/csrf.ts:7-30`; `src/lib/security/env.ts:213-241` |
| Compiler workspace cleanup attempts chown-back before deletion | `src/lib/compiler/execute.ts:cleanupCompilerWorkspace`; `judge-worker-rs/src/workspace.rs:SandboxWorkspace Drop` (Caveat: fails for non-root production user) |
| Code-similarity runs serialized per assignment; sidecar signal handling improved | `src/lib/assignments/code-similarity.ts:424-509`; `src/lib/assignments/code-similarity-client.ts:51-113` |
| `/api/v1/compiler/run` checks capability before quota | `src/app/api/v1/compiler/run/route.ts:74-77` |
| Worker `deregister` fails on non-2xx responses | `judge-worker-rs/src/api.rs:135-161,154-158` |
| Rate-limiter uses monotonic `Instant` for block/window decisions | `rate-limiter-rs/src/main.rs:27-84,277-346` |
| `SecretString` zeroizes on drop | `judge-worker-rs/src/types.rs` |
| Generated nginx `client_max_body_size 50M` in catch-all `location /` | `deploy-docker.sh:1629,1648,1707` |
| Generated nginx preserves full `X-Forwarded-For` chain | `deploy-docker.sh:1596,1611,1623,1636` |
| Generated nginx and static-site configs include baseline security headers | `deploy-docker.sh:1583-1587`; `static-site/nginx.conf:25-29`; `scripts/online-judge.nginx.conf:51-56` |
| Docker networks segmented into `frontend/backend/judge/db` | `docker-compose.production.yml:215-223` |
| Docker socket proxy no longer has `BUILD=1` or `IMAGES=1` on app host | `docker-compose.production.yml:89-90` |
| Judge worker container runs as non-root `judge` user | `Dockerfile.judge-worker:33-49` |
| Rust worker PID limits are phase-specific (`Compile=128`, `Run=64`) | `judge-worker-rs/src/docker.rs:323-326` |
| `roc` language consistency between TypeScript union and Rust worker | `src/types/index.ts:130`; `src/lib/judge/languages.ts:1430-1440` |
| IP canonicalization rejects leading-zero IPv4 octets and canonicalizes IPv6 | `src/lib/judge/ip-allowlist.ts:139-152`; `src/lib/security/ip.ts` |
| Contest join rejects recruiting access before rate-limit consumption | `src/app/api/v1/contests/join/route.ts:20-27` |
| Recruiting-access rejection before rate limit is documented in handler | `src/lib/api/handler.ts` |
| Raw SQL `secret_token` backfill/drop is gated by `ALLOW_SECRET_TOKEN_BACKFILL=1` | `deploy-docker.sh:1251-1253` |
| Restore/import JSON responses return `snapshotId` instead of raw filesystem path | `src/app/api/v1/admin/restore/route.ts`; `src/app/api/v1/admin/migrate/import/route.ts` |
| Static-site directory listing disabled | `static-site/nginx.conf:45` |
| Raw query helpers participate in active transactions | `src/lib/db/queries.ts:55-68` |

## Deduplication Rules

Findings were merged using the following rules:

1. **Key:** primary file path + normalized finding title. Findings describing the same defect in the same code location were merged.
2. **Severity:** the highest severity reported by any reviewer was preserved.
3. **Confidence:** the highest confidence reported by any reviewer was preserved.
4. **Sources:** all reviewers that identified the defect are listed.
5. **Status:** items explicitly verified as fixed by multiple reviewers or by direct evidence were moved to **Implemented / Verified**. Items with conflicting "fixed" vs "open" claims were retained as active and annotated as disputed in the caveats.

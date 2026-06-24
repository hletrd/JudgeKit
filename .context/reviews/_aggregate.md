# Cycle 2 Aggregate Review

Date: 2026-06-24
Repository: `/Users/hletrd/flash-shared/judgekit`
Head: `a8acff5d`

## Fan-Out Status

All 12 review agents completed successfully:
- `code-reviewer` — 10 findings (C1-1 through C1-10)
- `security-reviewer` — 8 findings (S1-1 through S1-8)
- `architect` — 6 findings (ARCH-1 through ARCH-6, plus 3 manual-validation risks)
- `critic` — 9 findings (CRIT-1 through CRIT-9)
- `debugger` — 8 findings (DBG2-1 through DBG2-8)
- `designer` — 8 findings (D2-1 through D2-8)
- `document-specialist` — 12 findings (DOC-P1-1 through DOC-P1-12, plus 2 likely issues and 3 manual-validation risks)
- `perf-reviewer` — 17 findings (PERF2-01 through PERF2-17)
- `test-engineer` — 7 findings (TE-1 through TE-7)
- `tracer` — 4 findings (TR-1 through TR-4)
- `verifier` — 6 findings (V2-1 through V2-6)

No agent failures this cycle.

## Critical Issues (must be fixed this cycle or next)

### AGG2-1 — High — Startup language sync overwrites admin-managed command overrides
**Source agreement:** architect ARCH-1, critic CRIT-2, debugger DBG2-3
**Locations:** `src/lib/judge/sync-language-configs.ts:10-17`, `src/lib/judge/sync-language-configs.ts:23-57`, `src/lib/actions/language-configs.ts:88-119`, `src/instrumentation.ts:32-36`
**The sync code runs on every app boot and updates existing language rows when commands differ from defaults. Admin hotfixes are silently reverted on restart.**

### AGG2-2 — High — Destructive migration detection now aborts but docs still describe warn behavior
**Source agreement:** architect ARCH-2, critic (positive validation), verifier V2-5
**Locations:** `deploy-docker.sh:1011-1064`, `AGENTS.md:377-390`
**Script now calls `die` on destructive prompts, but AGENTS.md still tells operators to look for a warning. This wastes incident time.**

### AGG2-3 — High — Docker image admin falls back to local Docker from Next app
**Source agreement:** architect ARCH-3
**Locations:** `src/lib/docker/client.ts:13-22`, `src/lib/docker/client.ts:40`, `src/lib/security/production-config.ts:11-35`
**When worker URL/token is missing, the app runs local Docker CLI operations, bypassing the intended worker-only boundary.**

### AGG2-4 — High — App-only deploy topology defaults are wrong
**Source agreement:** architect ARCH-4, document-specialist DOC-P1-7
**Locations:** `deploy-docker.sh:15-28`, `deploy-docker.sh:180-186`, `deploy-docker.sh:225-227`
**Script header says defaults are false on app server, but actual defaults are `INCLUDE_WORKER=true`, `BUILD_WORKER_IMAGE=auto`.** 

### AGG2-5 — High — ZIP restore commits database before uploaded files are restored
**Source agreement:** critic CRIT-3, debugger DBG2-1, tracer TR-3, verifier V2-4
**Locations:** `src/app/api/v1/admin/restore/route.ts:149-178`, `src/lib/db/export-with-files.ts:267-348`
**Database is imported first, then files are written. If file writes fail, DB references non-existent files.**

### AGG2-6 — High — Local compiler fallback makes workspaces world-writable
**Source agreement:** critic CRIT-4
**Locations:** `src/lib/compiler/execute.ts:718-746`
**After chown succeeds, workspace is still broadened to 0777 and source to 0666, leaking submitted code.**

### AGG2-7 — High — Per-problem export leaks hidden tests to any user with access
**Source agreement:** tracer TR-1
**Locations:** `src/app/api/v1/problems/[id]/export/route.ts:35-61`
**Students with `canAccessProblem` can export hidden test cases and expected outputs.**

### AGG2-8 — High — Full-fidelity backup docs are false for auth-critical fields
**Source agreement:** critic CRIT-7
**Locations:** `src/lib/db/export.ts:98-106`, `src/lib/security/secrets.ts:36-42`, `docs/data-retention-policy.md:44-50`
**Even "full-fidelity" exports redact password hashes, session tokens, OAuth tokens. Restores are not faithful.**

### AGG2-9 — High — Admin password-length setting is still exposed but no longer affects validation
**Source agreement:** critic CRIT-5, verifier V2-1, debugger DBG2-7
**Locations:** `src/lib/security/password.ts:1-30`, `src/lib/system-settings-config.ts:50-56`, `messages/en.json:1547-1550`
**The configurable `minPasswordLength` setting is ignored by all password validation paths.**

### AGG2-10 — High — Reset-password form lacks client-side length validation
**Source agreement:** verifier V2-2
**Locations:** `src/app/(auth)/reset-password/reset-password-form.tsx:34-51`, `src/app/(auth)/reset-password/reset-password-form.tsx:113-122`
**Form submits without checking password length, violating AGENTS.md client-side validation contract.**

### AGG2-11 — High — Docker admin API throws at import time instead of returning generic error
**Source agreement:** verifier V2-3
**Locations:** `src/lib/docker/client.ts:21-27`, `src/lib/docker/client.ts:145-149`
**Production with worker URL but no token throws at module import, bypassing intended generic error response.**

### AGG2-12 — High — Restore audit records "0 files" before file restore happens
**Source agreement:** critic CRIT-9, debugger DBG2-8, tracer TR-3, verifier V2-4
**Locations:** `src/app/api/v1/admin/restore/route.ts:151-163`, `src/app/api/v1/admin/restore/route.ts:176-178`
**Audit event is recorded before file restoration, so ZIP restore audits always say "0 files".**

### AGG2-13 — High — API CSRF docs tell clients to use wrong mechanism
**Source agreement:** document-specialist DOC-P1-1
**Locations:** `docs/api.md:78-80`, `src/lib/security/csrf.ts:19-45`
**Docs say to use CSRF token header, but implementation requires `X-Requested-With: XMLHttpRequest`.**

### AGG2-14 — High — Authentication docs deny bearer-token support for protected routes
**Source agreement:** document-specialist DOC-P1-2
**Locations:** `docs/authentication.md:8-13`, `src/lib/api/auth.ts:61-83`
**Docs say "not a standalone bearer token" but API keys use `Bearer jk_...` on protected routes.**

### AGG2-15 — High — Privacy retention doc says 30 days for chat logs but runtime default is 5 years
**Source agreement:** document-specialist DOC-P1-3
**Locations:** `docs/privacy-retention.md:20-28`, `src/lib/data-retention.ts:1-34`
**Two current policy docs give materially different AI-chat retention periods.**

### AGG2-16 — High — Queue claim and queue-position queries lack covering indexes
**Source agreement:** perf-reviewer PERF2-01
**Locations:** `src/lib/judge/claim-query.ts:38-52`, `src/lib/db/schema.pg.ts:500-513`
**No partial/composite index for queue scan order, stale-claim predicate, or queue count.**

### AGG2-17 — High — Per-problem export/import round trips silently downgrade function problems
**Source agreement:** tracer TR-2
**Locations:** `src/app/api/v1/problems/[id]/export/route.ts:13-30`, `src/app/api/v1/problems/import/route.ts:23-34`
**Export omits `problemType`, import defaults to `"auto"`, function problems become auto-graded.**

### AGG2-18 — High — Permanent user deletion API records success audit before delete commits
**Source agreement:** tracer TR-4
**Locations:** `src/app/api/v1/users/[id]/route.ts:469-482`, `src/app/api/v1/users/[id]/route.ts:489-501`
**Audit event written before transaction, can show success when delete actually fails.**

## Medium Issues (should be planned for fix)

### AGG2-19 — Medium — Admin language image builds route through proxy that blocks builds
**Source agreement:** critic CRIT-1, architect ARCH-5
**Locations:** `src/lib/docker/client.ts:443-450`, `docker-compose.production.yml:70-79`, `docker-compose.worker.yml:37-39`
**Build button in admin UI cannot succeed in production because proxy has `BUILD=0`.**

### AGG2-20 — Medium — Function harness assembly failure converted to student compile failure
**Source agreement:** architect ARCH-6
**Locations:** `src/app/api/v1/judge/claim/route.ts:374-401`, `src/app/api/v1/judge/claim/route.ts:404-418`
**Malformed functionSpec causes platform fault to be surfaced as student failure.**

### AGG2-21 — Medium — Playwright local webserver can run stale standalone build by default
**Source agreement:** critic CRIT-6, debugger DBG2-4, verifier V2-6
**Locations:** `scripts/playwright-local-webserver.sh:105-107`, `playwright.config.ts:98-119`
**Old `.next/standalone/server.js` is reused without rebuild, testing stale code.**

### AGG2-22 — Medium — Plugin secret encryption makes restored backups dependent on undeclared key
**Source agreement:** critic CRIT-8
**Locations:** `src/lib/plugins/secrets.ts:103-129`, `src/lib/security/derive-key.ts:9-16`, `deploy-docker.sh:541-560`
**Backup docs don't state that `PLUGIN_CONFIG_ENCRYPTION_KEY` must be preserved with backup.**

### AGG2-23 — Medium — Password minimum remains configurable in settings but runtime validation is fixed at 8
**Source agreement:** critic CRIT-5, verifier V2-1, debugger DBG2-7
**Locations:** `src/lib/security/password.ts:1-27`, `src/lib/system-settings-config.ts:52-54`, `src/lib/validators/system-settings.ts:125-128`
**Admin UI still exposes `minPasswordLength` as editable but it's ignored by all validation paths.**

### AGG2-24 — Medium — `RUNNER_AUTH_DISABLED=1` disables auth warnings but runner is never called without token
**Source agreement:** debugger DBG2-5
**Locations:** `src/lib/compiler/execute.ts:61-83`, `src/lib/compiler/execute.ts:530-563`
**Unauthenticated runners are not actually supported despite the env flag.**

### AGG2-25 — Medium — Output-limit-exceeded signals masked by timeout/runtime classification
**Source agreement:** debugger DBG2-6
**Locations:** `judge-worker-rs/src/executor.rs:142-154`, `judge-worker-rs/src/executor.rs:601-609`
**Verdict precedence checks timeout before output limit, so output-overflow-then-timeout shows as TLE.**

### AGG2-26 — Medium — CI does not run Playwright E2E despite changed Playwright behavior
**Source agreement:** test-engineer TE-1
**Locations:** `.github/workflows/ci.yml:78-119`
**No `npm run test:e2e` step in CI, so E2E regressions pass PR gates unchecked.**

### AGG2-27 — Medium — Remote smoke silently drops authenticated specs when credentials missing
**Source agreement:** test-engineer TE-2
**Locations:** `playwright.config.ts:24-52`, `playwright.config.ts:62-70`
**Missing `E2E_PASSWORD` causes smoke to skip admin/auth/contest specs without failing.**

### AGG2-28 — Medium — Compiler workspace permission tests are source-grep false positives
**Source agreement:** test-engineer TE-3
**Locations:** `tests/unit/compiler/execute-implementation.test.ts:6-14`, `tests/unit/compiler/execute.test.ts:81-145`
**Tests check string presence but don't assert actual chmod/chown behavior.**

### AGG2-29 — Medium — Full-fidelity plugin export encryption not behavior-tested
**Source agreement:** test-engineer TE-4
**Locations:** `tests/unit/db/export-sanitization.test.ts:200-206`, `tests/unit/plugins.secrets.test.ts:95-107`
**No test proves `streamDatabaseExport()` applies encryption to plugin rows.**

### AGG2-30 — Medium — Trusted-host production fail-closed branches have no production-mode tests
**Source agreement:** test-engineer TE-5
**Locations:** `tests/unit/auth/trusted-host.test.ts:28-34`, `tests/unit/auth/trusted-host.test.ts:53-59`
**Tests assert development fallbacks, not production rejection behavior.**

### AGG2-31 — Medium — Problem import route changes only have schema tests
**Source agreement:** test-engineer TE-6
**Locations:** `tests/unit/validators/problem-import.test.ts:50-136`
**No API handler tests for route behavior, auth, capability checks, or payload mapping.**

### AGG2-32 — Medium — Successful ZIP restore path is not tested
**Source agreement:** test-engineer TE-7
**Locations:** `src/app/api/v1/admin/restore/route.ts:151-163`, `src/app/api/v1/admin/restore/route.ts:176-177`
**No test covers successful ZIP restore with uploaded files, missing audit-count regression.**

### AGG2-33 — Medium — Flix Docker image documented as `judge-jvm` but runtime uses `judge-flix`
**Source agreement:** document-specialist DOC-P1-5
**Locations:** `docs/languages.md:68-74`, `src/lib/judge/languages.ts:1192-1200`
**Docs point to base JVM image but admin/worker expects distinct `judge-flix`.**

### AGG2-34 — Medium — TypeScript judge version split between 5.9 and 6.0
**Source agreement:** document-specialist DOC-P1-6
**Locations:** `AGENTS.md:35-40`, `src/lib/judge/languages.ts:294-300`, `docker/Dockerfile.judge-node:1-4`
**Compiler/runtime is TS 6.0, but AGENTS and DB metadata advertise 5.9.**

### AGG2-35 — Medium — AGENTS database version says PostgreSQL 17, production uses 18
**Source agreement:** document-specialist DOC-P1-8
**Locations:** `AGENTS.md:289-296`, `docker-compose.production.yml:17-18`
**Agent guide says PG 17 but compose uses `postgres:18-alpine`.**

### AGG2-36 — Medium — Seccomp docs describe default-allow deny-list but profile is default-deny
**Source agreement:** document-specialist DOC-P1-9
**Locations:** `AGENTS.md:298-301`, `docker/seccomp-profile.json:1-4`
**Docs say `SCMP_ACT_ALLOW` default but profile uses `SCMP_ACT_ERRNO`.**

### AGG2-37 — Medium — Docker image counts and examples inconsistent across docs
**Source agreement:** document-specialist DOC-P1-10
**Locations:** `README.md:75-132`, `docs/languages.md:190-200`, `AGENTS.md:318-320`, `deploy-docker.sh:140-176`
**"All" means different things depending on which doc is read.**

### AGG2-38 — Medium — API reference advertised as complete but omits route families
**Source agreement:** document-specialist DOC-P1-11
**Locations:** `README.md:288-290`, `docs/api.md`
**README says "all REST endpoints" but community, forgot-password, admin submissions export are missing.**

### AGG2-39 — Medium — `.context/project/current-state.md` is stale
**Source agreement:** document-specialist DOC-P1-12
**Locations:** `.context/project/current-state.md:176-181`, `.context/project/current-state.md:312-316`
**Presents historical deployment/language/security details as current.**

### AGG2-40 — Medium — Submission creation scans full per-user history under advisory lock
**Source agreement:** perf-reviewer PERF2-02
**Locations:** `src/app/api/v1/submissions/route.ts:345-358`, `src/app/api/v1/submissions/route.ts:373-379`
**Aggregate over all user rows inside serialized lock, blocking concurrent submissions.**

### AGG2-41 — Medium — Judge and playground capture up to 128 MiB per stream before truncation
**Source agreement:** perf-reviewer PERF2-03
**Locations:** `judge-worker-rs/src/docker.rs:352-400`, `judge-worker-rs/src/executor.rs:80-104`, `src/lib/compiler/execute.ts:18`
**Large output capture before truncation can cause worker OOM under concurrent load.**

### AGG2-42 — Medium — Claimed worker capacity consumed before post-claim DB reads and harness assembly
**Source agreement:** perf-reviewer PERF2-04
**Locations:** `src/app/api/v1/judge/claim/route.ts:221-228`, `src/app/api/v1/judge/claim/route.ts:303-418`
**Worker slot marked active while app does several DB round trips and source assembly.**

### AGG2-43 — Medium — Remote Docker image builds bypass runner concurrency and capture unbounded logs
**Source agreement:** perf-reviewer PERF2-05
**Locations:** `judge-worker-rs/src/runner.rs:218-239`, `judge-worker-rs/src/runner.rs:313-333`, `src/lib/docker/client.ts:443-450`
**Builds run outside semaphore, can be concurrent, and return full logs in one string.**

### AGG2-44 — Medium — Function expected-output computation recompiles reference for every test case
**Source agreement:** perf-reviewer PERF2-06
**Locations:** `src/app/api/v1/problems/[id]/compute-expected/route.ts:21-139`, `src/lib/compiler/execute.ts:763-819`
**100 test cases = 100 compile containers + 100 run containers for same source.**

### AGG2-45 — Medium — Live submission fallback polling repeatedly fetches full detail
**Source agreement:** perf-reviewer PERF2-07
**Locations:** `src/hooks/use-submission-polling.ts:151-209`, `src/app/api/v1/submissions/[id]/route.ts:15-40`
**Fallback polling transfers source code and full result data every 3 seconds.**

### AGG2-46 — Medium — Problem and practice progress filters materialize whole catalogs before pagination
**Source agreement:** perf-reviewer PERF2-08
**Locations:** `src/app/(public)/problems/page.tsx:356-405`, `src/app/(public)/practice/page.tsx:423-466`
**All matching problem IDs fetched, all user submissions loaded, then sliced in JS.**

### AGG2-47 — Medium — Assignment and contest status boards build full student-by-problem matrix
**Source agreement:** perf-reviewer PERF2-09
**Locations:** `src/lib/assignments/submissions.ts:636-659`, `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:351-607`
**Full matrix rendered in memory and React tree for all participants x problems.**

### AGG2-48 — Medium — Contest quick stats polling recomputes aggregate CTEs every 15 seconds
**Source agreement:** perf-reviewer PERF2-10
**Locations:** `src/components/contest/contest-quick-stats.tsx:31-36`, `src/app/api/v1/contests/[assignmentId]/stats/route.ts:92-140`
**No caching, every open admin page repeats the same expensive scan.**

### AGG2-49 — Medium — Browser output diff is quadratic on main thread
**Source agreement:** perf-reviewer PERF2-11
**Locations:** `src/lib/diff.ts:26-41`, `src/components/submissions/output-diff-view.tsx:13-132`
**LCS table built synchronously in render-time useMemo.**

### AGG2-50 — Medium — Similarity checks load and serialize all best source code before enforcing limits
**Source agreement:** perf-reviewer PERF2-12
**Locations:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:27-49`, `src/lib/assignments/code-similarity.ts:329-339`
**Full source array serialized to JSON before fallback limit guard runs.**

### AGG2-51 — Medium — Shared SSE poll timer can overlap ticks under slow DB responses
**Source agreement:** perf-reviewer PERF2-13
**Locations:** `src/app/api/v1/submissions/[id]/events/route.ts:180-216`, `src/app/api/v1/submissions/[id]/events/route.ts:223-253`
**No `isPolling` guard, overlapping ticks can query same subscriber map redundantly.**

### AGG2-52 — Medium — PostgreSQL realtime coordination serializes through one lock and prefix scans
**Source agreement:** perf-reviewer PERF2-14
**Locations:** `src/lib/realtime/realtime-coordination.ts:73-139`, `src/lib/db/schema.pg.ts:660-670`
**Single advisory lock, `LIKE` prefix scans for cleanup and counting.**

### AGG2-53 — Medium — Instructor audit-log filtering materializes every scoped submission ID before pagination
**Source agreement:** perf-reviewer PERF2-16
**Locations:** `src/app/api/v1/admin/audit-logs/route.ts:73-147`, `src/app/api/v1/admin/audit-logs/route.ts:270-275`
**All submission IDs for instructor's assignments pulled into memory before audit query.**

### AGG2-54 — Medium — Backup-with-files buffers entire database, uploads, and ZIP in memory
**Source agreement:** perf-reviewer PERF2-17
**Locations:** `src/lib/db/export-with-files.ts:162-249`, `src/lib/db/export-with-files.ts:267-340`
**Streaming export is concatenated, parsed, files loaded into Buffers, ZIP built in memory.**

### AGG2-55 — Medium — XSS potential in ProblemDescription via dangerouslySetInnerHTML
**Source agreement:** code-reviewer C1-1, security-reviewer S1-1
**Locations:** `src/components/problem-description.tsx:67`
**Security depends on unverified `sanitizeHtml` implementation.**

### AGG2-56 — Medium — Docker image validation bypass when no trusted registries configured
**Source agreement:** code-reviewer C1-6, security-reviewer S1-3
**Locations:** `judge-worker-rs/src/validation.rs:52-61`
**Empty `TRUSTED_DOCKER_REGISTRIES` allows non-registry images to pass validation.**

### AGG2-57 — Medium — `createApiHandler` swallows all handler errors as generic 500
**Source agreement:** code-reviewer C1-7
**Locations:** `src/lib/api/handler.ts:204-207`
**Business logic errors that should be exposed to clients are masked as `internalServerError`.**

### AGG2-58 — Medium — API key authentication lacks brute-force rate limiting
**Source agreement:** security-reviewer S1-7
**Locations:** `src/lib/api/auth.ts:61-83`
**Failed API key attempts are not rate-limited, enabling brute-force attacks.**

### AGG2-59 — Medium — Plugin secret encryption key derivation may use static secret
**Source agreement:** security-reviewer S1-5
**Locations:** `src/lib/plugins/secrets.ts:36-50`
**Encryption key derived from domain constant; database breach enables offline decryption.**

### AGG2-60 — Medium — `parse_timestamp_epoch_ms` potential integer overflow
**Source agreement:** code-reviewer C1-2
**Locations:** `judge-worker-rs/src/docker.rs:91-130`
**Days calculation could overflow `i64` for extreme year values.**

### AGG2-61 — Medium — Navigation lacks `aria-current` for active page
**Source agreement:** designer D2-1
**Locations:** `src/components/layout/public-header.tsx:180-195`, `src/components/layout/public-header.tsx:283-301`
**No programmatic indication of current section for screen-reader users.**

### AGG2-62 — Medium — Navigation buttons use invalid link/button composition
**Source agreement:** designer D2-2
**Locations:** `src/app/(public)/dashboard/_components/admin-dashboard.tsx:53-65`, `src/app/(public)/_components/public-home-page.tsx:79-83`
**`Link > Button` nesting creates nested interactive controls.**

### AGG2-63 — Medium — Practice filters expose unlabeled comboboxes
**Source agreement:** designer D2-3
**Locations:** `src/app/(public)/practice/page.tsx:619-631`, `src/components/problem/difficulty-range-filter.tsx:68-92`
**SelectTrigger elements lack accessible names.**

### AGG2-64 — Medium — Public problem list uses wide horizontal table on mobile
**Source agreement:** designer D2-4
**Locations:** `src/app/(public)/_components/public-problem-list.tsx:115-209`
**Eight columns with fixed widths, main decision signals hidden off-canvas on phones.**

### AGG2-65 — Medium — Route skeletons are silent to assistive technology
**Source agreement:** designer D2-5
**Locations:** `src/app/(dashboard)/dashboard/admin/loading.tsx:3-13`, `src/components/ui/skeleton.tsx:3-9`
**Bare animated divs with no status announcement for screen-reader users.**

### AGG2-66 — Medium — Add Language disables primary action without explaining missing requirement
**Source agreement:** designer D2-6
**Locations:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:637-742`
**Create button disabled until five fields are non-empty, no disabled reason exposed.**

## Low Issues (best-effort or defer)

### AGG2-67 — Low — Data retention pruning timer lacks jitter
**Source agreement:** code-reviewer C1-4
**Locations:** `src/lib/data-retention-maintenance.ts:173`
**Multiple instances could trigger simultaneously without jitter.**

### AGG2-68 — Low — `getApiUser` unnecessary DB queries on invalid API key
**Source agreement:** code-reviewer C1-8
**Locations:** `src/lib/api/auth.ts:61-83`
**Invalid API keys trigger 2-3 database lookups unnecessarily.**

### AGG2-69 — Low — Error handler may log sensitive data
**Source agreement:** security-reviewer S1-6
**Locations:** `src/lib/api/handler.ts:204-205`
**Unhandled errors may contain sensitive data in logs.**

### AGG2-70 — Low — `isAdminAsync` uses hardcoded capability names
**Source agreement:** code-reviewer C1-10
**Locations:** `src/lib/api/auth.ts:114-118`
**Capability names should be constants.**

### AGG2-71 — Low — Dead-letter filenames include raw submission IDs
**Source agreement:** security-reviewer S1-4
**Locations:** `judge-worker-rs/src/executor.rs:1034-1039`
**Information leakage if dead-letter directory is accessible.**

### AGG2-72 — Low — Pruning timer stored in global scope
**Source agreement:** security-reviewer S1-8
**Locations:** `src/lib/data-retention-maintenance.ts:166-178`
**Unnecessary global exposure of timer reference.**

### AGG2-73 — Low — Mobile menu tap target smaller than header controls
**Source agreement:** designer D2-7
**Locations:** `src/components/layout/public-header.tsx:255-260`
**32px square target below 44px mobile guidance.**

### AGG2-74 — Low — Global non-Korean letter spacing reduces readability
**Source agreement:** designer D2-8
**Locations:** `src/app/globals.css:131-132`
**Tightened body spacing inherited by English and non-Korean locales.**

### AGG2-75 — Low — Dynamic sitemap accumulates all rows and locale entries in memory
**Source agreement:** perf-reviewer PERF2-15
**Locations:** `src/app/sitemap.ts:21-94`
**All public problems, contests, threads loaded into arrays for every crawler hit.**

## Cross-Agent Agreement Summary

Findings flagged by multiple agents (higher signal):
- AGG2-5 (ZIP restore DB-before-files): critic, debugger, tracer, verifier (4 agents)
- AGG2-9 (password length setting ignored): critic, verifier, debugger (3 agents)
- AGG2-12 (ZIP restore audit 0 files): critic, debugger, tracer, verifier (4 agents)
- AGG2-1 (language sync overwrites): architect, critic, debugger (3 agents)
- AGG2-21 (Playwright stale build): critic, debugger, verifier (3 agents)
- AGG2-55 (XSS potential): code-reviewer, security-reviewer (2 agents)
- AGG2-56 (Docker validation bypass): code-reviewer, security-reviewer (2 agents)

## Summary

Total findings: 75
- High severity: 18
- Medium severity: 47
- Low severity: 10

Cross-agent agreement: 7 findings flagged by multiple agents

## Recommendations

1. Fix AGG2-5, AGG2-9, AGG2-12, AGG2-10, AGG2-11 this cycle (high confidence, contained scope)
2. Plan fixes for AGG2-1, AGG2-2, AGG2-6, AGG2-7, AGG2-13, AGG2-14, AGG2-15 next cycle
3. Defer AGG2-40 through AGG2-54 (performance) as they require significant architectural work
4. Defer AGG2-67 through AGG2-75 (low severity) as best-effort

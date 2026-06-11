# Multi-agent comprehensive repository review — current HEAD `90ec4ae`

Date: 2026-04-13
Reviewer mode: multi-agent critical repo sweep

## Scope, inventory, and review method

I built a fresh inventory from tracked files at the current HEAD before writing findings.

- **Tracked files reviewed/inventoried:** 1090
- **Current HEAD:** `90ec4ae`
- **Top-level tracked-file inventory:**
  - `src/` 428
  - `tests/` 235
  - `docker/` 104
  - `drizzle/` 53
  - `plans/` 29
  - `scripts/` 28
  - `docs/` 17
  - `judge-worker-rs/` 13
  - `rate-limiter-rs/` 9
  - `code-similarity-rs/` 6
  - plus root CI/deploy/config files

### Review coverage

This pass combined:
- direct local inspection of the current code,
- cross-file interaction review,
- a top-level inventory sweep,
- five parallel specialized review agents covering app authorization, security, worker/runtime, architecture/deployment, and test reliability.

### Review-relevant areas explicitly covered

- `src/` application pages, APIs, authz, platform-mode logic, anti-cheat, plugins, compiler runner integration, Docker client, export/backup paths
- `judge-worker-rs/` claim/report flow, runner auth, memory/runtime limits, dead-letter behavior
- `code-similarity-rs/` input validation and deployment integration
- `rate-limiter-rs/` trust boundaries and validation surface
- `docker-compose*.yml`, `Dockerfile*`, `deploy-docker.sh`, systemd/nginx templates, worker/deployment docs
- `tests/`, Vitest configs, Playwright config, CI workflow, integration-test docs
- relevant documentation under `docs/` and `AGENTS.md`

### Explicitly deprioritized as non-review-relevant implementation sources

These were inventoried but not treated as primary implementation sources for detailed findings unless they interacted with runtime behavior:
- vendored/minified assets under `static-site/`
- generated build artifacts (`.next/`, coverage output, local caches)
- untracked scratch files in the worktree
- archived review artifacts under `.context/reviews/_archive/`

## Executive summary

This repository has improved meaningfully since earlier review rounds, but the current head still has **serious authorization gaps, several broken cross-host runtime assumptions, and multiple test/verification blind spots that would let regressions ship undetected**.

The most important themes in this pass:
1. **Object-level authorization is still inconsistent** in several contest/recruiting/problem-set surfaces.
2. **Assessment/exam restrictions still trust client-provided context** in ways that can be bypassed.
3. **Worker/app runtime coordination is still fragile**, especially around stale claims, capacity accounting, split-host deployments, and configuration drift.
4. **The similarity/anti-cheat stack is not behaving as the architecture suggests** in Docker and large-contest conditions.
5. **The test suite still overstates confidence**: CI does not run some important suites, remote E2E is intentionally narrowed, and many “implementation tests” only grep source text.

---

# Detailed findings

## 1. High — Problem-set pages and APIs leak other instructors’ problem sets, problems, and groups
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `src/app/(dashboard)/dashboard/problem-sets/page.tsx:47-68`
  - `src/app/(dashboard)/dashboard/problem-sets/[id]/page.tsx:27-55`
  - `src/app/(dashboard)/dashboard/problem-sets/new/page.tsx:20-26`
  - `src/app/api/v1/problem-sets/route.ts:11-46`
  - `src/app/api/v1/problem-sets/[id]/route.ts:11-48`
- **Why this is a problem:**
  These entry points gate on broad instructor/capability checks, then read **all** problem sets and, on detail/new pages, **all** problems and **all** groups without ownership or scope filtering. Mutation routes already imply “instructors can only edit their own problem sets,” so the read model is looser than the write model.
- **Concrete failure scenario:**
  Instructor A can open the problem-set list/detail UI or hit the API and see Instructor B’s problem-set names, problem IDs/titles, and unrelated group names, including private resources that should not be visible cross-group.
- **Suggested fix:**
  Introduce one capability-aware problem-set visibility helper and apply it consistently to page loaders and API routes. For non-admin/non-global-capability users, scope list/detail/new-form selectable problems/groups to owned or explicitly manageable resources only.

## 2. High — Contest code snapshots are exposed by capability alone, without assignment-level authorization
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `src/app/api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts:8-38`
- **Why this is a problem:**
  The route requires only `contests.view_analytics`, then returns snapshots for any `{assignmentId, userId}` pair. Unlike neighboring contest routes, it does not verify that the caller can manage or view that specific assignment.
- **Concrete failure scenario:**
  A reviewer who legitimately has analytics access for one contest can request another assignment’s snapshot history and retrieve a different participant’s saved source code timeline.
- **Suggested fix:**
  Before reading snapshots, load the assignment and enforce the same assignment-scoped authorization used by contest analytics/export pages (`canViewAssignmentSubmissions` or equivalent contest-scoped helper).

## 3. High — Recruiting invitation APIs are missing assignment-scoped authorization and path consistency checks
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:14-85`
  - `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:13-124`
  - `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/stats/route.ts:6-10`
- **Why this is a problem:**
  These handlers check only `recruiting.manage_invitations`, then operate on invitations/stats directly. The detail route reads by `invitationId` alone and never verifies that the invitation belongs to `params.assignmentId` or that the caller can manage that assignment.
- **Concrete failure scenario:**
  Any role with the generic capability can read, revoke, delete, or password-reset invitations for contests it does not own if it can discover invitation IDs.
- **Suggested fix:**
  Resolve the invitation’s assignment first, verify the caller can manage that specific assignment, and reject any request where the path `assignmentId` and invitation’s real assignment diverge.

## 4. High — AI-assistant restrictions for contests/exams can be bypassed by omitting `assignmentId`
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `src/app/api/v1/plugins/chat-widget/chat/route.ts:231-238`
  - `src/lib/platform-mode-context.ts:36-72, 75-84`
- **Why this is a problem:**
  The server decides whether AI help is allowed using `context?.assignmentId` from the request body. If the client omits that field, assignment-specific exam/contest restrictions are not inferred server-side.
- **Concrete failure scenario:**
  A participant in an assignment-specific contest can call the chat API manually with a valid session, include `problemId`, omit `assignmentId`, and still receive AI help when the UI intended to block it.
- **Suggested fix:**
  Derive restricted context server-side from the actual problem/submission/assignment relationship rather than trusting the client-provided assignment ID. If the request is problem-scoped, resolve the relevant assignment context on the server.

## 5. High — Standalone compiler restrictions can be bypassed the same way by omitting `assignmentId`
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `src/app/api/v1/compiler/run/route.ts:24-35`
  - `src/lib/platform-mode-context.ts:36-72`
- **Why this is a problem:**
  `compiler/run` also uses client-supplied `assignmentId` to determine whether current platform mode restricts standalone compiler access. Missing assignment context means missing restriction.
- **Concrete failure scenario:**
  A user in an assignment-specific exam can manually call the compiler route without `assignmentId` and continue using interactive compile/run assistance that should be disabled.
- **Suggested fix:**
  Resolve restricted assignment context server-side or require a validated assignment binding whenever compiler-run is invoked from an assignment/problem context.

## 6. High — The stale-claim timeout can reclaim legitimately running submissions
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `src/app/api/v1/judge/claim/route.ts:99-123, 167-174`
  - `src/app/api/v1/judge/poll/route.ts:56-67`
  - `judge-worker-rs/src/executor.rs:13-18, 196-200`
- **Why this is a problem:**
  Reclaim logic uses `judge_claimed_at < NOW() - staleClaimTimeoutMs`, but in-progress status updates do **not** refresh that timestamp. The worker allows compile timeouts up to 600,000 ms, while the stale timeout is shorter in normal deployments.
- **Concrete failure scenario:**
  A heavy compile legitimately runs for 7–10 minutes. After 5 minutes, a second worker reclaims the same submission. The first worker later reports its result and gets `invalidJudgeClaim`, wasting compute and creating duplicate judging attempts.
- **Suggested fix:**
  Refresh `judgeClaimedAt` on every in-progress report/heartbeat or make stale detection depend on worker liveness plus claim ownership instead of a fixed old timestamp.

## 7. High — Worker capacity in the database is incremented on claim but not decremented on completion
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `src/app/api/v1/judge/claim/route.ts:151-158`
  - `src/app/api/v1/judge/poll/route.ts:102-133`
- **Why this is a problem:**
  Claim SQL bumps `judge_workers.active_tasks`, but final report handling never decrements it or clears worker ownership in the same transaction. The DB copy of capacity heals only on later heartbeat reconciliation.
- **Concrete failure scenario:**
  With `concurrency=1`, a worker finishes a submission and is locally idle, but the DB still says `active_tasks=1`. Further claims can return `workerAtCapacity` until the next heartbeat, creating artificial idle gaps and misleading admin state.
- **Suggested fix:**
  In terminal result handling, atomically decrement `judge_workers.active_tasks` and clear `submissions.judge_worker_id` when the claim token matches and the submission reaches a terminal state.

## 8. High — Problem memory settings allow 2 GiB, but the worker silently enforces only 1 GiB
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `judge-worker-rs/src/executor.rs:17, 199-200, 272-281`
  - `src/lib/validators/problem-management.ts:17-18`
  - `src/app/api/v1/problems/import/route.ts:14-15`
  - `src/app/api/v1/problems/[id]/route.ts:19-20`
- **Why this is a problem:**
  The app/API accept `memoryLimitMb` up to 2048, but the worker clamps runtime memory to `MAX_MEMORY_LIMIT_MB = 1024`.
- **Concrete failure scenario:**
  An instructor configures a 1536 MiB or 2048 MiB problem. The UI accepts the value, but real submissions still OOM at 1024 MiB and produce confusing judge failures.
- **Suggested fix:**
  Either raise the worker cap to match the app limit or reduce UI/API validation to the worker’s real enforced maximum and document it clearly.

## 9. High — Split-host deployments stop the local worker while the app still points all runner/admin traffic at it
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `docker-compose.production.yml:91-97, 108-143`
  - `deploy-docker.sh:536-551`
  - `src/lib/compiler/execute.ts:50-66`
  - `src/lib/docker/client.ts:6-8, 203-215`
  - `src/app/api/v1/admin/docker/images/route.ts:48-59`
- **Why this is a problem:**
  The app is always configured with `COMPILER_RUNNER_URL=http://judge-worker:3001`, but `deploy-docker.sh` explicitly stops `judge-worker` when `INCLUDE_WORKER=false`. Compiler-run local fallback is disabled whenever a runner URL is set, and Docker admin APIs swallow worker fetch failures by returning empty lists.
- **Concrete failure scenario:**
  On a split-host target, “try code” and worker-admin image inventory/build/remove features fail or look empty because the app is calling a stopped local sidecar instead of a live external runtime.
- **Suggested fix:**
  Make runner/admin endpoints configurable for split-host deployments, or unset `COMPILER_RUNNER_URL` when the local worker is intentionally stopped. Do not convert worker-API failures into empty-success responses.

## 10. High — The code-similarity sidecar is effectively bypassed in Docker and never handles the large contests it exists to accelerate
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `docker-compose.production.yml:145-156`
  - `src/lib/assignments/code-similarity-client.ts:1-3, 31-45`
  - `src/lib/assignments/code-similarity.ts:267-299`
- **Why this is a problem:**
  In Docker, the app defaults `CODE_SIMILARITY_URL` to `http://127.0.0.1:3002`, which points to the app container itself, not the `code-similarity` sidecar. Separately, `runSimilarityCheck()` returns `not_run/too_many_submissions` above 500 rows **before** it ever calls the Rust service.
- **Concrete failure scenario:**
  Small contests silently fall back to the slower TypeScript path because the sidecar is unreachable; large contests return `too_many_submissions` and never use the sidecar at all. The production service exists but does not serve its intended workload.
- **Suggested fix:**
  Set `CODE_SIMILARITY_URL=http://code-similarity:3002` in Docker deployments, and call the Rust service **before** applying the TypeScript `MAX_SUBMISSIONS_FOR_SIMILARITY` bailout.

## 11. High — `deploy-docker.sh` continues after a migration failure and still prints success
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `deploy-docker.sh:485-505`
- **Why this is a problem:**
  The migration step warns on `drizzle-kit push` failure and then immediately prints `success "Database migrated"`, continuing with container start and summary output.
- **Concrete failure scenario:**
  A broken migration leaves the DB schema behind the app. The deploy script still reports “Deployment complete!” and operators only discover the failure after user-facing runtime errors.
- **Suggested fix:**
  Fail the deploy on migration error by default. If a bypass mode is needed, make it explicit and loud, not the default success path.

## 12. High — CI does not run integration tests, component tests, or coverage-threshold enforcement
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `.github/workflows/ci.yml:56-75, 204-259`
  - `package.json:10-25`
  - `vitest.config.ts:10-35`
  - `vitest.config.component.ts:10-18`
- **Why this is a problem:**
  CI runs lint, typecheck, unit tests, Rust tests, build, and Playwright — but never runs `npm run test:integration`, `npm run test:component`, or `npm run test:unit:coverage`.
- **Concrete failure scenario:**
  PostgreSQL-specific route regressions, jsdom component regressions, and dropped coverage on security/auth-critical files all pass CI because the relevant suites are simply not executed.
- **Suggested fix:**
  Add dedicated CI jobs or steps for integration, component, and coverage runs. If runtime is the concern, parallelize rather than omitting them.

## 13. High — Remote Playwright validation intentionally runs only a small allowlist, despite repo guidance that says to run the full suite post-deploy
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `playwright.config.ts:7-23`
  - `AGENTS.md` testing/deployment guidance (post-deploy full E2E expectation)
- **Why this is a problem:**
  When `PLAYWRIGHT_BASE_URL` is set, only eight “remoteSafeSpecs” run. That excludes many high-value judging and submission flows.
- **Concrete failure scenario:**
  A deploy breaks real judging or assignment-context submission handling. Remote validation still goes green because only navigation/health/admin-safe specs ran.
- **Suggested fix:**
  Separate “post-deploy smoke” and “full remote validation” explicitly, then enforce both in docs/automation. Right now the repo claims more verification than it actually performs.

## 14. High — The student submission-flow E2E test can pass even when no real submission flow works
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `tests/e2e/student-submission-flow.spec.ts:143-180`
- **Why this is a problem:**
  The test accepts `409 assignmentContextRequired` as a valid outcome, then skips polling and detail assertions when no `submissionId` exists.
- **Concrete failure scenario:**
  Submission creation or judging is broken. The spec still passes because it treats “submission was rejected before creation” as acceptable and never exercises the actual flow.
- **Suggested fix:**
  Create a real assignment context in test setup and require successful submission creation, terminal judging, and submission-detail verification.

## 15. Medium — Assignment submission visibility still ignores `group_instructors`, blocking co-instructors/TAs from legitimate access
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `src/lib/assignments/submissions.ts:280-320`
  - compare with `src/lib/auth/permissions.ts:35-57`
- **Why this is a problem:**
  `canViewAssignmentSubmissions()` allows admins, assignment owners, and some capability-based roles — but it does not honor the `group_instructors` relationship already used elsewhere for co-instructors/TAs.
- **Concrete failure scenario:**
  A TA/co-instructor can access group resources generally, but cannot open students’ submissions or assignment analytics for that same group.
- **Suggested fix:**
  Reuse the existing group-instructor/group-management access checks inside assignment-submission visibility.

## 16. Medium — Anti-cheat event details are double-encoded and lose structure
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `src/components/exam/anti-cheat-monitor.tsx:91-103`
  - `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:74-76, 111-118`
  - `src/components/contest/anti-cheat-dashboard.tsx:80-85`
- **Why this is a problem:**
  The client serializes details to JSON, then the server wraps that serialized string inside another JSON object as `message` and serializes again.
- **Concrete failure scenario:**
  Dashboard viewers see escaped nested payloads instead of stable structured fields, and downstream analysis can no longer reliably access event metadata such as copied text target or blur context.
- **Suggested fix:**
  Pick one canonical wire/storage shape for anti-cheat details and store that directly.

## 17. Medium — Chat logs persist partial or aborted assistant replies as if they completed successfully
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `src/app/api/v1/plugins/chat-widget/chat/route.ts:60-91`
- **Why this is a problem:**
  `persistAssistantMessage()` runs in `finally`, so an interrupted stream still becomes a normal assistant message in persistent chat history.
- **Concrete failure scenario:**
  A user closes the widget mid-stream or the network breaks; the DB stores a truncated assistant response that later looks authoritative to admins and future replay logic.
- **Suggested fix:**
  Persist only on successful stream completion, or mark partial/aborted assistant messages explicitly and exclude them from normal history semantics.

## 18. Medium — UI privilege logic still hard-codes built-in roles instead of using capabilities
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `src/app/(dashboard)/dashboard/submissions/[id]/page.tsx:61-82, 147-151`
  - `src/app/(dashboard)/layout.tsx:44-45, 82`
- **Why this is a problem:**
  Submission-detail visibility and lecture-mode availability still depend on `admin/super_admin/instructor` string checks even though the rest of the app has moved toward capability-based authorization.
- **Concrete failure scenario:**
  A custom reviewer/instructor-equivalent role is allowed by API capability checks but still sees redacted UI or cannot use lecture mode because its role name is not in the hard-coded allowlist.
- **Suggested fix:**
  Replace built-in role checks with capability-derived booleans aligned with the API and permission helpers.

## 19. Medium — Manual nginx templates and legacy deployment docs are now out of sync with the safer generated deploy configuration
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `scripts/online-judge.nginx.conf:54-104`
  - `scripts/online-judge.nginx-http.conf:14-35`
  - `deploy-docker.sh:613-735`
  - `docs/deployment.md:81, 93-99`
- **Why this is a problem:**
  The deploy script intentionally avoids `X-Forwarded-Host` and gives `/api/v1/judge/poll` a larger body limit. The checked-in manual nginx templates still diverge from those fixes, and the docs still steer operators toward stale manual/systemd paths.
- **Concrete failure scenario:**
  An operator following the checked-in nginx/service docs can reintroduce the Next.js navigation bug or 413 judge-report failures that the deploy script already worked around.
- **Suggested fix:**
  Make the checked-in nginx templates match the generated config, and update docs so manual deployment guidance reflects current known-good behavior.

## 20. Medium — Legacy systemd service files are stale and the worker unit blocks default dead-letter persistence
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `scripts/online-judge.service:9-21`
  - `scripts/online-judge-worker-rs.service:9-19`
  - `scripts/code-similarity-rs.service:7-14`
  - `scripts/online-judge-backup.service:7-9`
  - `judge-worker-rs/src/config.rs:172-177`
- **Why this is a problem:**
  These units still point at `/home/ubuntu/online-judge`, while the current repo/deployment world also uses `/home/ubuntu/judgekit`. The worker unit grants writes only to `/home/ubuntu/online-judge/data`, but the worker defaults dead-letter writes to `<cwd>/dead-letter`, which is outside the allowed writable path.
- **Concrete failure scenario:**
  Under the hardened bare-metal unit, a failed report cannot persist its dead-letter artifact because the configured/default path is unwritable.
- **Suggested fix:**
  Template the repo path during install, standardize docs on one path, and point `DEAD_LETTER_DIR` at an explicitly writable data directory.

## 21. Medium — Admin backup/export downloads include live sensitive secrets because the export redaction set is empty
- **Validation:** Likely issue needing policy confirmation, but code behavior is clear
- **Confidence:** Medium
- **Files / regions:**
  - `src/lib/db/export.ts:95-130, 175-218, 248-254`
  - `src/app/api/v1/admin/backup/route.ts:17-79`
  - `src/app/api/v1/admin/migrate/export/route.ts:15-74`
- **Why this is a problem:**
  `REDACTED_COLUMNS` is explicitly `{}` and the export includes tables such as sessions, accounts, judgeWorkers, plugins, and apiKeys. That means password-confirmed admin downloads can contain live session tokens, OAuth tokens, worker secrets, encrypted API keys, and plugin config.
- **Concrete failure scenario:**
  A backup/export file is mishandled or broadly shared as a “portable export.” It now materially expands compromise scope beyond ordinary data exposure.
- **Suggested fix:**
  Split “restorable full backup” from “sanitized human-downloadable export,” redact or encrypt high-value secrets, and document clearly which artifact types contain live credentials.

## 22. Medium — Recruiting-token validation leaks candidate and assignment metadata to anonymous callers
- **Validation:** Likely issue
- **Confidence:** Medium
- **Files / regions:**
  - `src/app/api/v1/recruiting/validate/route.ts:26-79`
- **Why this is a problem:**
  Anyone with a valid token can retrieve `candidateName`, `assignmentTitle`, `examDurationMinutes`, `expiresAt`, and whether an account already exists.
- **Concrete failure scenario:**
  A leaked token in logs/browser history/email forwarding is enough to query identity-bearing metadata without authentication.
- **Suggested fix:**
  Return only minimal validity/status to anonymous callers and defer richer metadata until authenticated redemption or a one-time consume flow.

## 23. Medium — One shared bearer token authorizes both judging traffic and host-adjacent runner/Docker-admin APIs
- **Validation:** Likely issue / trust-boundary risk
- **Confidence:** Medium
- **Files / regions:**
  - `src/lib/judge/auth.ts:13-21`
  - `judge-worker-rs/src/runner.rs:270-307`
  - `src/lib/docker/client.ts:36-67`
- **Why this is a problem:**
  The same `JUDGE_AUTH_TOKEN` gates worker registration/claim/report and also gates the runner’s `/run` and `/docker/*` management APIs.
- **Concrete failure scenario:**
  If that token leaks from env, logs, SSRF, or a compromised internal caller, the attacker gets both judge impersonation and internal Docker-admin reach with one secret.
- **Suggested fix:**
  Split the token into purpose-scoped credentials (judge protocol vs runner admin), or move runner-admin operations behind a stronger mutually authenticated internal channel.

## 24. Medium — The test suite still contains many source-grep “implementation tests” that create false confidence
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - representative examples:
    - `tests/unit/problem-page-anti-cheat-implementation.test.ts:9-17`
    - `tests/unit/api/contest-analytics-export-authorization-implementation.test.ts:9-21`
    - `tests/unit/infra/judge-report-nginx.test.ts:9-27`
- **Why this is a problem:**
  These tests do not execute handlers/components/scripts. They only assert that particular strings still exist in source files.
- **Concrete failure scenario:**
  A route still contains the expected helper call string but short-circuits before it runs; a component still contains the JSX snippet but never renders due to surrounding logic; a deploy script still contains a stanza but generates malformed output. The tests remain green because only source text was checked.
- **Suggested fix:**
  Replace the highest-risk source-grep tests with executable route/component/script tests. Keep string-shape tests only for genuinely static config-format contracts.

## 25. Medium — Integration-test documentation is materially wrong about the database/runtime actually exercised
- **Validation:** Confirmed issue
- **Confidence:** High
- **Files / regions:**
  - `tests/integration/README.md:3-10, 30-46`
  - `tests/integration/support/test-db.ts:19-42`
- **Why this is a problem:**
  The README still describes SQLite/in-memory flows and `db.sqlite.close()`, while the actual helper provisions isolated PostgreSQL databases and fails without a PostgreSQL URL.
- **Concrete failure scenario:**
  Contributors misunderstand what the integration suite validates and fail to provision the real environment needed to run it, further reducing an already-underused safety net.
- **Suggested fix:**
  Rewrite the README to describe the real PostgreSQL integration flow and cleanup API.

## 26. Medium — High-stakes readiness documentation claims stronger validation than the executable evidence currently supports
- **Validation:** Risk needing manual validation
- **Confidence:** Medium
- **Files / regions:**
  - `docs/high-stakes-validation-matrix.md:9-37`
  - `tests/unit/realtime/realtime-coordination.test.ts:17-102`
  - `tests/unit/realtime/realtime-route-implementation.test.ts:9-45`
- **Why this is a problem:**
  The docs require realistic concurrent SSE validation, anti-cheat dedupe under multi-instance routing, and failover rehearsal. The visible automated evidence is mostly env/config guards and source-shape assertions, not real multi-instance load or failover rehearsal.
- **Concrete failure scenario:**
  A multi-instance assessment deployment still exhibits duplicate heartbeats, connection-slot leaks, or restart/reclaim bugs even though the repository documentation implies the necessary proof exists.
- **Suggested fix:**
  Add a real shared-PostgreSQL multi-instance/load harness and cite actual evidence in the docs, or weaken the readiness wording until that evidence exists.

---

# Final sweep for commonly missed issues

After the main review, I did one extra sweep specifically for commonly missed categories:
- object-level authorization drift,
- client-trusted security context,
- silent fail-open/fail-empty behavior,
- deployment/docs/template drift,
- worker/app coordination mismatches,
- tests that only assert source text rather than behavior.

## Final-sweep conclusions

- I did **not** find evidence that all relevant high-risk review areas were already covered by tests; the opposite is true in several places.
- I did **not** find a convincing end-to-end proof path for split-host runner/admin features, large-contest similarity, or high-stakes multi-instance realtime behavior.
- I did **not** intentionally skip any top-level review-relevant implementation area. The only de-emphasized areas were generated/vendor/minified assets and archived artifacts.

## Recommended next remediation order

1. Fix the **authorization/BOLA** issues first (#1, #2, #3).
2. Fix the **contest/exam bypasses** (#4, #5).
3. Fix the **worker claim/capacity/runtime invariants** (#6, #7, #8).
4. Fix the **split-host runtime assumptions** and similarity service wiring (#9, #10).
5. Fix the **deploy false-success path** (#11).
6. Strengthen **verification quality** (#12, #13, #14, #24, #25, #26).
7. Then clean up remaining correctness/maintainability issues (#15 onward).


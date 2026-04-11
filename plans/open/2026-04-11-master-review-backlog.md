# Master review backlog — deduped from open reviews

## Source reviews
- `.context/reviews/comprehensive-code-review-2026-04-09.md`
- `.context/reviews/comprehensive-review-2026-04-09.md`
- `.context/reviews/comprehensive-code-review-2026-04-10.md`

## Planning rule
Treat every item below as **needs revalidation against `HEAD` before code changes**. These reviews were written at different points in time, and some findings may already be partially fixed.

## Missing tasks still worth planning

### 1. Transactionality and TOCTOU cleanup
**Why first:** this is the biggest repeated theme across the open reviews.

**Findings feeding this track**
- 2026-04-10: C-01, H-01, H-02, H-03, H-04, H-06, M-06, M-10, M-11
- 2026-04-09 comprehensive review: NEW-C03, OPEN-C01, NEW-H01..NEW-H18 (especially invite/role/member/user/judge lifecycles)
- 2026-04-09 code review: items 10 and 13 (email identity + partial import behavior)

**Representative files**
- `src/app/api/v1/users/[id]/route.ts`
- `src/app/api/v1/users/bulk/route.ts`
- `src/app/api/v1/judge/{claim,deregister,poll}/route.ts`
- `src/lib/security/{rate-limit,api-rate-limit}.ts`
- `src/lib/tags/*`, assignment/group/member routes

**Planned output**
- move check-then-act flows into single transactions / locks
- add regression tests for concurrent uniqueness, rate-limit, invite/member, and judge-claim flows

**Progress**
- ✅ bulk group enrollment now reports skips from the actual inserted row count, including duplicate request ids and insert-time conflicts.
- ✅ admin role creation now maps insert-time unique constraint races to a stable `roleNameExists` response instead of a 500.
- ✅ assignment problem-lock checks are now repeated inside the update transaction so new submissions cannot reopen the TOCTOU gap between route preflight and mutation.
- ✅ user creation now maps insert-time unique username/email races to stable conflict responses instead of leaking raw database 500s.
- ✅ user updates now map insert-time unique username/email races to stable conflict responses instead of leaking raw database 500s.
- ✅ server-action create/edit user flows now use transactional uniqueness checks and map insert-time unique races to stable conflict responses too.
- ✅ worker force-removal now locks and reads the worker row inside the final transaction instead of depending on a stale pre-transaction lookup.
- ✅ atomic login/recruit-token throttling and submission-rate limiting were already fixed at `HEAD` and revalidated during plan execution.
- ✅ tag creation now only retries on real unique-constraint races instead of masking arbitrary insert failures.
- ✅ recruiting invitation create/bulk-create now takes assignment/email advisory locks and rechecks duplicates inside the transaction before inserting.
- ✅ group member removal now locks the enrollment row inside the final transaction before deleting it.
- ✅ role deletion now locks and reads the role row inside the final transaction before checking assigned users and deleting it.
- ✅ atomic API-rate-limit consumption and judge claim worker-capacity reservation were revalidated at `HEAD` with existing tests, closing the remaining reviewed transactional concerns in those paths.

### 2. Import/export and schema-truth hardening
**Why next:** multiple reviews still question whether DB import/export is correct, atomic, and aligned with schema/migrations.

**Findings feeding this track**
- 2026-04-10: C-04, C-05, C-06, H-07, H-08, H-09, H-10, M-21
- 2026-04-09 code review: items 1, 7, 13, 14
- 2026-04-09 comprehensive review: NEW-M10, NEW-M11

**Representative files**
- `src/lib/db/import.ts`
- `src/lib/db/export.ts`
- `src/lib/db/schema.pg.ts`
- `src/lib/db/relations.ts`
- `drizzle/pg/*`
- admin backup/restore/migrate routes

**Planned output**
- make import behavior transactionally honest
- align import column coercion sets with schema metadata
- close schema-vs-SQL drift
- add import/export regression coverage for partial failures and migration edges

**Progress**
- ✅ PostgreSQL-only runtime guidance is now consistent across the reviewed backup/health/systemd script surfaces; SQLite branches remain only as explicit historical paths.
- ✅ import timestamp/boolean/json coercion now derives from schema metadata instead of manual column-name sets.
- ✅ import batching now fails honestly: batch insert errors abort the wrapping transaction instead of silently reporting partial success.
- ✅ missing high-value Drizzle relations for users/groups/problems/assignments/files/tags are now defined in `relations.pg.ts`.
- ✅ reverse user relations for `scoreOverrides` and recruiting invitations are now explicit, removing the last ambiguous relation gap from that review thread.
- ✅ PostgreSQL schema parity and migration drift guard tests currently pass at `HEAD`, reducing the remaining schema-truth work to future drift rather than known current mismatches.
- ✅ streamed database export now threads `AbortSignal` cancellation through the export loop, and the reviewed file-request paths are currently locked to async fs APIs only.

### 3. Authorization, secret disclosure, and dangerous fallback removal
**Why next:** several reviews still flag routes that rely on brittle text matching, secret redisclosure, or stale built-in-role checks.

**Findings feeding this track**
- 2026-04-09 code review: items 3, 4, 5, 6
- 2026-04-09 comprehensive review: OPEN-C02, NEW-C01, NEW-H07, OPEN-H02, OPEN-H03, OPEN-M03
- 2026-04-10: M-07

**Representative files**
- `src/app/api/v1/files/[id]/route.ts`
- `src/components/problem-description.tsx`
- admin API-key / bulk-user surfaces
- capability-aware routes still using built-in-role guards
- docker image admin routes

**Planned output**
- replace description-`LIKE` authorization with explicit relations
- remove or quarantine legacy HTML rendering/XSS path
- stop secret redisclosure flows (API keys, generated passwords)
- finish custom-role consistency sweep on routes and actions

**Progress**
- ✅ Explicit file authorization has been moved off description-text scanning for the live `GET /api/v1/files/[id]` path; remaining work in this track is now narrowed to any future legacy-HTML follow-up rather than known secret redisclosure or custom-role gaps.
- ✅ API-key privilege clamping now respects custom role levels instead of silently treating unknown roles as low-rank built-ins.
- ✅ admin API-key create/list flows and bulk-user/user-create flows now keep secrets one-time-only: later management views return masked previews/metadata only, while generated plaintext passwords are no longer re-disclosed in normal success payloads.
- ✅ file deletion is now locked to the intended DB-first / best-effort-disk-cleanup behavior by a focused route regression test.
- ✅ role create/update/delete routes now have explicit regression coverage for role-cache invalidation after successful mutations.
- ✅ backup/export/import/restore routes now have explicit route-level password-reconfirmation coverage for their destructive paths.
- ✅ Docker image build now rejects non-`judge-*` image tags from language configs before looking for a Dockerfile or invoking Docker.
- ✅ reviewed raw-query entrypoints remain parameterized through named placeholders and the PostgreSQL positional-parameter helper, closing the remaining Phase 3 raw-SQL concern for the currently-reviewed routes.
- ✅ legacy HTML sanitization now strips external `<img>` sources by default while preserving first-party root-relative file assets.
- ✅ recruiting invitation APIs now authorize through `recruiting.manage_invitations` capability checks instead of built-in admin-only role gates.
- ✅ contest invite/access-code/leaderboard/export/analytics/similarity/anti-cheat management checks now inherit the async capability/co-instructor-aware contest management helper.
- ✅ admin audit-log and login-log APIs now authorize through `system.audit_logs` / `system.login_logs` capabilities instead of built-in admin-only role gates.
- ✅ problem-set routes and submission comment/rejudge routes now authorize through their matching capabilities instead of built-in role-only gates.
- ✅ admin tag routes, contest quick-create, and contest code-snapshot history now authorize through existing capability flags instead of built-in admin-only role gates.
- ✅ server-action user-management privilege checks and create/edit role validation now resolve custom role levels through async capability-cache lookups instead of the built-in-only ROLE_LEVEL map.
- ✅ group deletion now authorizes through `groups.delete` capability instead of built-in admin/super-admin role checks.
- ✅ group assignment export now uses the shared async group-resource capability check instead of hard-coded admin/instructor logic.
- ✅ problem detail/update/delete now use problem capabilities for the privileged path while still preserving author ownership access.
- ✅ group list/create and problem list/create routes now use the corresponding capability checks instead of built-in admin/instructor branching.
- ✅ user list/create/detail/update/delete routes now gate privileged access through `users.*` capabilities, and their create/update role validation + password-reset privilege checks now honor async custom-role levels instead of built-in-only helpers.
- ✅ group detail email visibility now follows the shared async group-management permission helper instead of only primary-instructor/admin checks.
- ✅ bulk-user creation now honors `users.create` for custom roles via async role-validation checks while preserving the legacy built-in instructor student-only carve-out.
- ✅ exam-session routes now use the shared group-management permission model and `contests.view_analytics` for elevated reads instead of built-in admin-only branching.
- ✅ server-action user-management auth now honors `users.create` / `users.edit` / `users.delete` capabilities instead of relying only on built-in role checks.
- ✅ submissions listing now uses `submissions.view_all` capability instead of a built-in admin-only branch.
- ✅ the only remaining built-in custom-role exceptions are now explicitly documented as intentional carve-outs in code: instructor student-only bulk create access and the built-in-admin-only assignment problem-link override after submissions exist.

### 4. Judge/worker runtime correctness
**Why next:** the latest code review still has critical worker/runtime findings that can corrupt verdicts or mis-measure execution.

**Findings feeding this track**
- 2026-04-10: C-01, C-02, C-03, H-13, M-12, M-14, M-15, M-18
- 2026-04-09 comprehensive review: NEW-H09, NEW-H10, NEW-H11, NEW-H12, OPEN-H01

**Representative files**
- `judge-worker-rs/src/{docker,executor,runner}.rs`
- `src/lib/compiler/execute.ts`
- judge routes around claim/poll/deregister/rejudge

**Planned output**
- correct lifecycle/status filters
- parse full timestamps
- close seccomp retry bug
- validate path/command/image inputs consistently
- regression tests around claim, rejudge, and timing boundaries

**Progress**
- ✅ seccomp retry, timestamp parsing, and verdict-preserving deregistration were already fixed at `HEAD`.
- ✅ the polling worker executor now derives compile timeouts from submission limits instead of using a dead constant.
- ✅ judge-worker dead-letter pruning now uses async filesystem calls instead of blocking `std::fs` in the async executor path.
- ✅ Docker image validation helpers are now centralized in `judge-worker-rs/src/validation.rs` instead of being duplicated inside the runner.
- ✅ runner extension validation, code-similarity panic handling, and empty-run-command protection were revalidated as already fixed at `HEAD`.

### 5. Client/UI correctness and long-tail request-path cleanup
**Why later:** important, but lower blast radius than integrity/security work.

**Findings feeding this track**
- 2026-04-10: H-11, H-14, H-15, M-16, M-17, M-19, M-20
- 2026-04-09 code review: item 2 (group pagination), item 8 (Edge/Node imports), item 9 (`eval`), item 15 (similarity fallback parsing)
- 2026-04-09 comprehensive review: NEW-M14..NEW-M19

**Representative files**
- client hooks/components around polling, code snapshots, fallback language, group pages
- `scripts/setup.sh`
- edge-reachable shared modules
- similarity parsing helpers

**Planned output**
- reduce hydration/render hazards
- make long lists paginated by contract
- remove `eval` from setup wizard
- move blocking sync I/O off request paths where practical

**Progress**
- ✅ `scripts/setup.sh` no longer uses raw `eval`.
- ✅ file storage hot paths already use async `node:fs/promises` helpers.
- ✅ the earlier similarity-normalization complaint about comment markers inside string literals is already covered by regression tests and not reproducible at `HEAD`.
- ✅ `GET /api/v1/groups/[id]` now publishes explicit enrollment metadata so consumers can distinguish a full list from a preview payload.
- ✅ `ContestQuickStats` now pauses polling while the document is hidden and resumes on visibility restore.
- ✅ `useSourceDraft` now preserves unsaved state when parent components recreate the `languages` array with the same values.
- ✅ `CompilerClient` now hydrates the saved language preference after mount instead of touching `localStorage` during render.
- ✅ submission-result dispatch dedupe, stable code-snapshot timers, plugin PATCH null-safety, migrate JSON parse handling, and SSE fallback cleanup are now explicitly guarded as fixed-at-HEAD implementation patterns.

### 6. Ops/testing/documentation truth
**Why last:** some items may be documentation-only, but they still need explicit closure so the backlog doesn't linger.

**Findings feeding this track**
- 2026-04-09 code review: items 1, 11, 12
- 2026-04-10: H-16 and low-summary bucket
- 2026-04-09 comprehensive review: various docs/runtime truth findings

**Representative files**
- `README.md`, `docs/*`, `AGENTS.md`
- deploy/setup scripts
- `rate-limiter-rs` tests
- multi-instance/SSE guardrails

**Planned output**
- make runtime support claims match reality
- add missing sidecar tests
- document or enforce unsupported multi-replica behavior

**Progress**
- ✅ runtime support docs already describe the active runtime as PostgreSQL-only with SQLite/MySQL retained only for historical migration context.
- ✅ `rate-limiter-rs` already has real Rust tests; the old “0 tests” finding is stale.
- ✅ legacy `deploy.sh` no longer relies on a remote nginx heredoc; it now installs the config via temp file + `scp` + `sudo cp`.

## Recommended execution order
1. Transactionality / TOCTOU
2. Import/export + schema truth
3. Authorization / secret disclosure
4. Judge/worker runtime correctness
5. Client/UI correctness
6. Ops/testing/docs

## Shared verification bar for every execution phase
- `pnpm -s tsc --noEmit`
- targeted Vitest suites for touched routes/components/hooks
- relevant Rust tests when touching `judge-worker-rs/`
- schema/migration checks when touching `src/lib/db/**` or `drizzle/pg/**`

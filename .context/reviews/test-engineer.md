# Cycle 3 — test-engineer

Date: 2026-06-27
Repository: `/Users/hletrd/flash-shared/judgekit`
Head: `207623f9` (post cycle-2 remediation).
Prior: cycle-2 review preserved in git history (`ad543e14` baseline).
Method: every cycle-2 fix commit was diff'd (source + test); each cited
test was read in full and traced to the production hunk it claims to lock.
Flaky-pattern scan ran across all `judge-worker-rs`/`code-similarity-rs`/
`rate-limiter-rs` sources and the vitest suite.

Severity scale: **Critical** (silent miss of security/data-loss bug) >
**High** (shipped fix unenforced or gate silently passing) > **Medium**
(defense-in-depth / flake risk) > **Low** (hygiene). LOW findings capped at 8.

---

## REGRESSION — cycle-2 fix commits (14 commits)

Green-but-broken verdict per fix. "Revert-RED" = the existing test fails if
the production hunk of that commit is reverted.

| # | Commit | Fix | Revert-RED? | Evidence |
|---|--------|-----|-------------|----------|
| C2-1 | `51af8537` | preserve tables absent from import (skip-truncate) | **YES** | `tests/unit/db/import-implementation.test.ts:58-94` builds a one-table export (`users`), drives `importDatabase` through a recording mock tx, and asserts `deleteMock` NOT called with `examSessions`, IS called with `users`, AND `result.skippedTables` contains `examSessions`. Reverting the `data.tables` guard on the truncate loop flips all three. **Behavioral, not source-grep.** |
| C2-2 | `c12ce8af` | api-key DELETE canManageRole gate | **YES** | `tests/unit/api/api-keys.route.test.ts:291-333` adds two cases: a manager-tier caller with `system.settings` against a `super_admin`-owned key ⇒ 403 `cannotAssignHigherRole` + `canManageRoleAsyncMock` called with `("manager","super_admin")` + `dbDeleteMock)not.toHaveBeenCalled()`; and the positive path against a manager-owned key ⇒ 200 + `dbDeleteMock)toHaveBeenCalledOnce()`. Exact mirror of the A5 PATCH test. |
| C2-3 | `3ed15bd6` | abort destructive import on pre-restore snapshot fail | **PARTIAL — see NEW-1.** | `admin-backup-security.route.test.ts:347-370` exercises the **restore** route only (`takePreRestoreSnapshotMock.mockResolvedValue(null)` ⇒ 500 `preRestoreSnapshotFailed` + `importDatabaseMock)not.toHaveBeenCalled()`). The **migrate-import** route got the identical gate (`migrate/import/route.ts:102,215`) but NO test imports that route for this case. |
| C2-4 | `c4ef40ab` | language dockerImage allowlist on POST+PATCH | **YES** | `tests/unit/api/admin-languages.route.test.ts:99-158` — three behavioral cases: POST rejects `attacker-registry/pwn:latest` with 422 `invalidDockerImage` + no insert; POST accepts `judge-python:3.12`; PATCH rejects `evil.example.com/root:latest` + no update. |
| C2-5 | `3196e6d1` | strip contest accessCode from assignment GETs | **SOURCE-GREP ONLY — see NEW-2.** | `tests/unit/api/group-assignments-access-code-strip.test.ts:10-30` reads the source files and asserts `canManageGroupResourcesAsync(`, `columns: { id: true, instructorId: true }`, and a regex `if (!canManage)[\s\S]*delete .*accessCode`. No behavioral test calls GET `/api/v1/groups/[id]/assignments` and asserts `accessCode` is undefined in the response. Pins implementation shape, not behavior. |
| C2-6 | `7518a5e1` | centralize community problem-linked scope check | **PARTIAL — see NEW-3.** | `tests/unit/discussions/permissions.test.ts:24-55` behaviorally tests the pure helpers (`PROBLEM_LINKED_SCOPES`, `isProblemLinkedScope`, `canAccessProblemScopedThread`) including editorial-scope denial and `canAccessProblem` delegation. But the **route consumers** (`community-thread-posts.route.test.ts`, `community-votes.route.test.ts`) only fixture `scopeType: "general"`; nothing exercises the editorial-scoped thread through the POST/vote routes, so removing the `canAccessProblemScopedThread` call from a route would pass. |
| C2-7 | `a336de90` | restore+migrate audits durable + post-file-restore | **YES for restore; NO for migrate-import — see NEW-1.** | `admin-backup-security.route.test.ts:402-543` — four cases pin the restore path: durable helper used (not buffered), `importDatabaseMock)toHaveBeenCalledBefore(recordAuditEventDurableMock)`, action `system_settings.database_restored`, post-file-restore ordering (`restoreParsedBackupFilesMock)toHaveBeenCalledBefore(...)`), the dedicated `database_restore_files_failed` audit on ENOSPC, and `recordAuditEventDurableMock)not.toHaveBeenCalled()` when import fails. The migrate-import route's twin `await recordAuditEventDurable(...)` at `migrate/import/route.ts:123,233` is uncovered. **Closes cycle-2 NG-1 for restore only.** |
| C2-8 | `594f89b0` | local compiler workspace 0o700 on chown success | **SOURCE-GREP.** | `execute-implementation.test.ts:5-17` asserts the source contains `chmod(workspaceDir, 0o700)` + `chmod(sourcePath, 0o600)` + the broad fallback strings. Defense-in-depth chmod; source-grep is acceptable but no test asserts the on-disk mode after a compile. |
| C2-9 | `68dc2ad0` | docker inspect/kill/rm wrapped in 10s timeout | **NO — ZERO coverage. See NEW-4.** | The `docker.rs` `#[cfg(test)]` module (only `parse_timestamp_epoch_ms` + `resolve_seccomp_profile` tests) gained nothing for this fix. The three cleanup helpers call `tokio::process::Command::new("docker")` directly with no injection seam, and no source-grep backup exists. |
| C2-10 | `d5b20d3d` | code-similarity sidecar cap at 500 submissions | **PARTIAL — see NEW-5.** | `code-similarity-rs/src/main.rs:246-261` `submission_cap_boundary` tests the pure `exceeds_submission_cap` helper at the boundary (500/499/501/5000). But only the helper, not the route — removing the `if exceeds_submission_cap(...)` call from the `compute` handler still passes the test. |
| C2-11 | `90bcfcff` | problem edit page strict canManageProblem gate | **SOURCE-GREP ONLY.** | `problem-edit-page-strict-gate.test.ts:11-25` asserts source contains the import + the regex `const canEdit = await canManageProblem(...)` + NOT the loose pattern. No test renders the page with an out-of-group `problems.edit` holder and asserts `referenceSolution`/hidden test cases are absent from `initialProblem`. |
| C2-12 | `6b383ff0` | Phase-A side-effect test type fixes | **N/A (no behavior change).** | TS2540/TS2532/TS2345 fixes only; verified by `tsc --noEmit` in CI. Also adds `defaultLanguage` to the export SELECT (`problems-export.route.test.ts`) and corrects the chat-widget tools comment. |
| C2-13 | `1fb1af0f` | cycle-2 test fallout (SEO mock + grep baseline 155→157) | **N/A.** | Bumps the `DOCUMENTED_BASELINE` in `source-grep-inventory.test.ts:211` and spreads `importOriginal` in the discussions/permissions mock so `isProblemLinkedScope` resolves post-centralization. |
| C2-14 | `23851d69` | revert X-Real-IP hops=0 gate | **YES.** | `tests/unit/security/ip.test.ts:81-91` "falls back to X-Real-IP when TRUSTED_PROXY_HOPS=0 and XFF is spoofed" asserts `extractClientIp` returns `198.51.100.20` at hops=0. Re-applying the gate (revert of the revert) flips this red. Behavioral. |

**Cycle-2 verdict: 8/14 behavioral revert-RED, 4/14 source-grep (acceptable
for defense-in-depth chmod, weak for authz leaks), 1/14 zero-coverage
(68dc2ad0), 1/14 partial (durable-audit restore-only).** The strongest
protection is on the data-loss cluster (C2-1, C2-2, C2-7-restore); the
weakest is on the worker and the migrate-import twin.

### Regression caveats (not blockers)

- **R-CAV-1 (C2-5 accessCode source-grep).** The regex
  `if (!canManage)[\s\S]*delete .*accessCode` passes even if the route
  deletes the wrong field, or if the `columns` projection is dropped and the
  delete runs on a fully-populated row that already leaked via the RQB
  default. The behavioral guard at the route layer is the only thing that
  actually proves a non-manager cannot read the code. *Confidence: High.*
- **R-CAV-2 (C2-10 helper-only).** `exceeds_submission_cap` is a one-line
  `count > MAX_SUBMISSIONS` predicate; testing the predicate does not
  exercise the handler's `PAYLOAD_TOO_LARGE` response. *Confidence: High.*
- **R-CAV-3 (C2-11 page-level).** The edit page renders server-side and
  hands `initialProblem` (with `referenceSolution` + hidden test cases) into
  the client. A source-grep on `canManageProblem(...)` proves the gate is
  *written* but not that the props passed to the client omit secrets when
  the gate is false. *Confidence: Medium.*

---

## NEW GAPS (cycle-3)

### NEW-1 — migrate-import route destructive surface is fully untested
- **Severity: High. Confidence: High.**
- **Files:** `src/app/api/v1/admin/migrate/import/route.ts:98-140` (JSON arm)
  and `:214-250` (multipart arm).
- **Gap:** `3ed15bd6` added the snapshot-abort gate, `a336de90` added
  `await recordAuditEventDurable(...)`, and `51af8537` added
  `skippedTables` to the response — all three changes were applied to BOTH
  `restore/route.ts` and `migrate/import/route.ts`. But
  `admin-backup-security.route.test.ts` only tests the restore path for
  these (lines 347-543). The migrate/import route's test titles (L263, L283)
  are password-confirmation tests only. Reverting any of the three
  production hunks in `migrate/import/route.ts` passes every test in the
  suite today. The migrate path performs the SAME destructive
  `importDatabase` call; an unsnapshotted, un-audited destructive import
  ships silently.
- **Suggested test:** mirror the four restore cases (snapshot-null abort,
  durable-audit-after-commit, audit-not-recorded-on-import-fail,
  skippedTables echoed) against the migrate/import route handler. The mock
  scaffolding in `admin-backup-security.route.test.ts` already covers
  every dependency; this is a copy-and-point-at-`admin/migrate/import/route`
  exercise. ~80 lines.

### NEW-2 — accessCode strip is source-grep only (R-CAV-1 escalated)
- **Severity: Medium. Confidence: High.**
- **Files:** `src/app/api/v1/groups/[id]/assignments/route.ts:54-68`,
  `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts`.
- **Gap:** the field-leak fix has no behavioral guard. A refactor that
  drops the `columns` projection but keeps the `delete assign.accessCode`
  line still passes the regex (the delete matches) while leaking every
  other contest column (`freezeLeaderboardAt`) — or leaks `accessCode`
  itself if the delete is reordered after the response is serialized.
- **Suggested test:** a route-level test that mocks
  `canManageGroupResourcesAsync → false`, drives GET through the route
  handler with a fixture row containing `accessCode: "SECRET"`, and
  asserts the response body's assignment objects have
  `accessCode: undefined`. Plus the positive manager case.

### NEW-3 — community route consumers use only "general" fixtures
- **Severity: Medium. Confidence: High.**
- **Files:** `tests/unit/api/community-thread-posts.route.test.ts:87,127`
  (`scopeType: "general"`), `tests/unit/api/community-votes.route.test.ts:157`
  (same).
- **Gap:** `7518a5e1` added the pure-helper test in
  `discussions/permissions.test.ts`, but the route consumers' use of
  `canAccessProblemScopedThread` (posts) and `isProblemLinkedScope`
  (votes/threads/create) is uncovered for the editorial/solution scopes —
  the exact scopes NEW-H6/SEC-9 fixed. Removing the helper call from any
  route passes the suite because every fixture uses `scopeType: "general"`,
  which short-circuits before the helper.
- **Suggested test:** for each of the three route handlers (posts POST,
  votes POST, threads POST), add one case with `scopeType: "editorial"` +
  `canAccessProblem → false` and assert 403. ~15 lines per route.

### NEW-4 — worker docker cleanup timeout has ZERO coverage
- **Severity: High. Confidence: High.**
- **Files:** `judge-worker-rs/src/docker.rs:170-215` (inspect),
  `:240-258` (kill), `:261-285` (rm).
- **Gap:** `68dc2ad0` wrapped the three cleanup helpers in
  `tokio::time::timeout(Duration::from_secs(10), ...)`. The
  `#[cfg(test)]` module in `docker.rs` only tests `parse_timestamp_epoch_ms`
  and `resolve_seccomp_profile`. There is no assertion that the cleanup
  functions time out instead of hanging — the documented 14h fleet sweep
  this fix was written to prevent would recur silently if a future refactor
  drops the `tokio::time::timeout` wrapper. The functions spawn
  `tokio::process::Command::new("docker")` directly (no injection seam),
  which makes a pure-runtime test hard, but a source-grep contract is
  trivial and was skipped.
- **Suggested test (two layers):**
  1. **Source-grep** (cheap, catches removal): assert `docker.rs` contains
     three occurrences of `tokio::time::timeout(` whose body invokes
     `Command::new("docker")` with `"inspect"|"kill"|"rm"`, and that the
     `Err(_)` arm logs and returns/continues rather than panicking.
  2. **Runtime** (harder, real coverage): extract the cleanup helpers
     behind a `trait DockerCli` with a `spawn(args: &[&str]) -> impl Future`
     method; in tests inject a `PendingCli` whose future never resolves;
     assert each helper returns within ~11s. This is the same
     refactor-for-testability pattern cycle-1 A12 used for
     `validate_docker_image_with_config`. If (2) is too large for this
     cycle, ship (1) and file (2) as Phase B.

### NEW-5 — code-similarity submission cap tests the predicate, not the route
- **Severity: Low. Confidence: High.**
- **Files:** `code-similarity-rs/src/main.rs:90-106` (handler),
  `:246-261` (test).
- **Gap:** the test asserts `exceeds_submission_cap` returns the right
  bool at the boundary. Removing the `if exceeds_submission_cap(...)`
  branch from the `compute` handler still passes. The handler is `async`
  and uses `axum::Json`; with no `#[cfg(test)]` router harness, a runtime
  test would need to stand up `axum::Router::new("/compute", post(compute))`
  with a mock token and post a 501-submission body — ~30 lines.

### NEW-6 — `recordAuditEventDurable` awaited at only 4 of 117+ audit sites
- **Severity: Medium. Confidence: High.**
- **Files:** `src/lib/audit/events.ts:275` (definition); callers in
  `restore/route.ts:183,209` + `migrate/import/route.ts:123,233` (the
  4 sites C2-7 added). Every other API route still uses the buffered
  `recordAuditEvent`.
- **Gap:** cycle-2 NG-2 is unchanged. Phase A moved the destructive-site
  audits to durable (good), but the integrity-critical non-destructive
  sites (login, role change, capability grant, password reset, api-key
  create/delete, group instructor add/remove) are still fire-and-forget.
  No test pins which sites MUST be durable.
- **Suggested test:** extend `tests/unit/infra/source-grep-inventory.test.ts`
  with an integrity-critical-route inventory that asserts each named route
  file's source contains `recordAuditEventDurable(` (not just
  `recordAuditEvent(`). Source-grep is the right layer for an inventory
  contract; behavior is covered per-route.

---

## FLAKY TESTS

### Rust parallel-test flake (cycle-1 TE-10 / A12) — CLEAN
- `grep -n 'set_var\|remove_var\|unsafe\b\|std::env::set'
  judge-worker-rs/src/validation.rs` → **no matches.** The pure-function
  refactor (`validate_docker_image_with_config(image, is_production,
  trusted_prefixes)`) holds. Tests inject config structs; no `#[serial]`
  needed. **Verified clean.**
- Repo-wide scan of `judge-worker-rs/`, `code-similarity-rs/`,
  `rate-limiter-rs/` for `set_var|remove_var|env::set_var|unsafe ` →
  **no matches.** No residual Rust env mutation anywhere.

### Vitest `process.env` mutation — latent intra-file order risk (not active flake)
- **Severity: Low. Confidence: Medium.** No active cross-file flake today
  (vitest isolates files into separate worker threads; the mutation does
  not escape the file). The risk is intra-file: a test that runs after an
  env-writing test, in the same file, without its own override sees stale
  values. Files that write `process.env.KEY = "..."` in `it`/`beforeAll`
  without an `afterEach`/`afterAll` restore:
  - `tests/unit/api/metrics.route.test.ts:64,77,92` — sets `CRON_SECRET`
    three times across `it` blocks, no per-test restore. Currently safe
    only because every test sets the same value.
  - `tests/unit/api/admin-docker-images-build.route.test.ts:144` — sets
    `TRUSTED_DOCKER_REGISTRIES` in one `it`; no restore visible. Any later
    test in the file that reads the default would see the override.
  - `tests/unit/files/storage-path-traversal.test.ts:8` — `beforeAll` sets
    `UPLOADS_DIR`; no `afterAll` restore.
  - `tests/unit/compiler/execute.test.ts:49-51,142` — module-level and
    in-test writes; relies on the worker being torn down.
  - `tests/unit/data-retention.test.ts:34-47` and
    `system-settings-config.test.ts:64,75` — env writes inside `it` blocks
    without per-test restore; safe only because `vi.resetModules()` +
    dynamic import re-reads the env each time.
- **Fix pattern (one-shape):** snapshot `process.env` in `beforeEach`,
  restore in `afterEach` — exactly the pattern
  `tests/unit/compiler/execute-implementation.test.ts:79-99` already uses
  (the A8 fix made that file the model citizen). Promoting the others to
  the same shape is a Phase B hygiene task.

### No new timing/network/order flakes introduced by cycle-2
- The restore tests use `toHaveBeenCalledBefore` against synchronous mocks
  (`recordAuditEventDurable` is mocked as a resolved Promise); invocation
  order is stable.
- `validation.rs` pure-function tests are deterministic.
- The `code-similarity-rs` boundary test is pure arithmetic.

---

## PHASE-B GAPS (carry-over)

| ID | Cycle-2 ref | Status | Detail |
|----|-------------|--------|--------|
| **PB-1** | TE-1 / AGG-63 | **STILL OPEN — High.** | `tests/unit/actions/user-management.test.ts:481` test name STILL reads `"deletes a user successfully and records audit before deletion"` (factually wrong post-`76e27d31`). Asserts `toHaveBeenCalledWith` only — NO `toHaveBeenCalledBefore`, NO `invocationCallOrder`. The `"returns deleteUserFailed when db throws"` test (L548-560) does NOT assert `recordAuditEvent)not.toHaveBeenCalled()`. Reverting `76e27d31` (move audit back before the delete) passes every test. The restore path got order + not-called + summary assertions in C2-7; the user-deletion path kept a test name that literally says "before deletion". Single highest-ROI test task in the repo. |
| **PB-2** | TE-4 / AGG-67 | **STILL OPEN — High. Infrastructure now exists.** | `tests/integration/db/` has `catalog-numbers`, `judge-claim-reclaim`, `submission-lifecycle`, `user-crud` — none exercise `importDatabase`. `tests/integration/support/test-db.ts` provides `createTestDb()` (isolated DB + real migrations), so the runtime test is now feasible. A refactor preserving the throw string at `import.ts` but swapping truncate/insert order, or catching the FK error upstream, ships green. |
| **PB-3** | TE-5 / AGG-68 | **STILL OPEN — Medium.** | `tests/unit/api/judge-status-report.route.test.ts:129,191,259` still stubs every `where` with `{ rowCount: 1 }`. No `rowCount: 0` arm, no `invalidJudgeClaim` 403 assertion at the route layer. The SQL guard IS exercised by `judge-claim-reclaim.test.ts:178-193` (real PG), but that does not run under `test:unit`. |

**Carry-forward from cycle 2 (unchanged):** NG-3 (`toHaveBeenCalledBefore`
coupling on durable mocks), NG-4 (env.test.ts FS-semantics assumption),
NG-5 (`validate_docker_image` env-wrapper parity test — still open; pure
fn is tested, the env-reading wrapper at `validation.rs:96` is not).

---

## GATE SOUNDNESS (delta from cycle 2)

| ID | Gate | Finding | Severity |
|----|------|---------|----------|
| **GS-1** | `npm run lint:bash` | **STILL OPEN.** The script is still `bash -n deploy-docker.sh && bash -n deploy.sh` (2 scripts). The 17+ other shell scripts (`install-gvisor.sh`, `monitor-health.sh`, `docker-disk-cleanup.sh`, …) remain unchecked by either path. No change since cycle 2. | **Medium** |
| **GS-2** | `npm run test:e2e` / Playwright | **STILL OPEN.** `playwright.config.ts` still has no `retries`; the CI e2e job's SQLite/`db:push`/`seed`/`build` prelude is still dead work (the runtime DB is the Postgres started by `webServer`). No change since cycle 2. | **Medium** |
| **GS-3** | `test:unit` vs `test:unit:coverage` | **STILL OPEN.** Per-module coverage thresholds in `vitest.config.ts` only fire under `--coverage`. `npm run test:unit` passes regardless of coverage. | **Medium** |
| **GS-4** | test placement | **STILL OPEN.** The A10 GET-gate coverage still lives in `problems-function-spec.route.test.ts` while a separate stale source-grep in `problem-detail-capabilities-implementation.test.ts` asserts strings that only match PATCH/DELETE (R-CAV-2). Navigational trap persists. | **Low** |

**Gates that remain sound:** `npm run lint`, `npx tsc --noEmit`,
`npm run db:check`, `cargo test` (×3 manifests), `cargo audit`,
`npm audit --audit-level=high`, `npm run build`, `docker compose config
--quiet` + `docker build --check`, integration gate against real
`postgres:18-alpine`.

---

## TDD OPPORTUNITIES — Phase B medium queue

Each item below is framed Red-Green-Refactor: the failing test first, then
the minimum code, then cleanup. None require re-architecture.

| # | Item | RED test | GREEN code | Effort |
|---|------|----------|------------|--------|
| T-1 | **PB-1 user-deletion audit order** | Rename the test to `"...records audit AFTER the delete commits"`; add `expect(mocks.recordAuditEvent).toHaveBeenCalledAfter(mocks.dbDeleteWhere)` (or `invocationCallOrder` compare); in the db-throws test add `expect(mocks.recordAuditEvent).not.toHaveBeenCalled()`. Run — FAILS (current order audit may fire before delete mock resolves; the not-called case has no assertion). | Move `recordAuditEvent` to after `await db.delete(...).where(...)` resolves, inside the success branch. | S |
| T-2 | **NEW-1 migrate-import destructive safety** | Add 4 `it(...)` blocks to `admin-backup-security.route.test.ts` mirroring L347-543 but importing `admin/migrate/import/route`. Each FAILS today (route aborts/audits, but no test drives it). | Already green in production — these are characterization + lock tests. Pure test addition. | S |
| T-3 | **NEW-4 worker timeout source-grep** | Add a test reading `docker.rs` and asserting 3× `tokio::time::timeout(` wrapping `Command::new("docker")` with `"inspect"|"kill"|"rm"`. Currently FAILS — no such contract test exists, but the assertion would pass on first run because the source matches. (To make it a true RED, write the assertion to also require the `Err(_)` arm to log+return, then verify by temporarily deleting one timeout wrapper.) | None (lock test). | S |
| T-4 | **PB-2 restore FK ordering (integration)** | New `tests/integration/db/restore-fk-order.test.ts`: `createTestDb`, seed a parent+child row, build an export whose child references a missing parent, call `importDatabase`, assert rejection + sentinel survival + parent-before-child insert order via a tx spy. FAILS on first run (test does not exist). | Already implemented in `import.ts` (`throw new Error("Failed to import ${tableName} batch ${i}")`); the test pins it. | M |
| T-5 | **PB-3 poll-route stale-token unit** | Add two cases to `judge-status-report.route.test.ts` with `where → rowCount: 0` for in-progress and terminal arms; assert `status === 403` + `body.error === "invalidJudgeClaim"` + `where` called with `and(...)` including `judgeClaimToken`. FAILS today (no such case). | Already implemented at `poll/route.ts:78-114`; pure test addition. | S |
| T-6 | **NEW-2 accessCode behavioral** | Route-level GET test with `canManage → false`, fixture `accessCode: "SECRET"`, assert response `accessCode === undefined`. FAILS today (only source-grep exists). | Already implemented; pure test addition. | S |
| T-7 | **NEW-3 community editorial route** | Per route (posts/votes/threads), `scopeType: "editorial"` + `canAccessProblem → false` ⇒ 403. FAILS today (fixtures use "general"). | Already implemented; pure test addition. | S |
| T-8 | **NEW-6 durable-audit inventory** | Source-grep test enumerating integrity-critical route files and asserting each contains `recordAuditEventDurable(`. FAILS today (only 4 sites use it). | Migrate each inventoried site to `recordAuditEventDurable` (mechanical). | M |
| T-9 | **NG-5 validation env-wrapper parity** | Rust test that calls `validate_docker_image(image)` after setting env once via a `OnceLock`/`#[serial]` gate, and compares to `validate_docker_image_with_config` for the same config. FAILS today (no such test). | Already implemented; pure test addition. | S |

---

## FINAL SWEEP

- **Cycle-2 is materially green-protected on the data-loss cluster**
  (C2-1 skip-truncate, C2-2 api-key DELETE, C2-7 restore durable audit).
  These are the fixes that matter most and they have real behavioral
  guards with order, not-called, and summary assertions.
- **The migrate-import route is the asymmetry to fix this cycle (NEW-1).**
  The restore path got 4 tests; the migrate-import path got the same
  production hunks and 0 tests. Cheapest high-ROI win in the file.
- **The worker docker-timeout fix has no guard at all (NEW-4).** A
  source-grep contract is ~15 lines and prevents the regression that
  caused the documented 14h fleet sweep. The runtime version is Phase B.
- **Authz-leak fixes (C2-5 accessCode, C2-11 edit page) are source-grep
  only.** Source-grep catches removal but not silent re-leaks through
  column-projection drift or prop-passing drift. Behavioral route/page
  tests are the actual contract.
- **The Rust parallel-test flake (cycle-1 TE-10) is verified gone.** No
  `set_var`/`remove_var`/`unsafe` anywhere in the Rust workspace. The
  vitest env-mutation patterns are latent intra-file risks, not active
  flakes; the model-citizen restore pattern (`execute-implementation.test.ts`)
  is the template.
- **PB-1 is still the highest-ROI Phase B task.** Three assertions across
  two files (rename, order, not-called) would close the original
  cycle-1 Critical. The asymmetry vs. the restore path (which got the
  full treatment in C2-7) is the strongest argument for doing it now.
- **Overall suite health: HEALTHY, with two targeted high-ROI actions**
  (NEW-1 migrate-import mirror tests, NEW-4 worker timeout source-grep)
  and one structural Phase B carry (PB-1) that closes the oldest open
  Critical in the backlog.

### Priority-ordered action list

| # | ID | Finding | Severity | Effort |
|---|----|---------|----------|--------|
| 1 | NEW-1 | Mirror the 4 restore tests against `admin/migrate/import/route` (snapshot, durable audit, not-on-fail, skippedTables) | High | S |
| 2 | NEW-4 | Source-grep contract for `tokio::time::timeout` wrapping docker inspect/kill/rm (runtime version Phase B) | High | S |
| 3 | PB-1 | User-deletion audit ordering test (rename + `toHaveBeenCalledAfter` + `not.toHaveBeenCalled`) | High | S |
| 4 | NEW-2 | Behavioral GET test for accessCode strip (route-level, not source-grep) | Medium | S |
| 5 | NEW-3 | Community editorial-scope route tests (posts/votes/threads) — fixtures use "general" only | Medium | S |
| 6 | PB-2 | Restore FK-ordering runtime integration test (infrastructure now exists via `createTestDb`) | High | M |
| 7 | PB-3 | Poll-route stale-token unit test (`rowCount: 0` ⇒ 403 `invalidJudgeClaim`) | Medium | S |
| 8 | NEW-6 | Source-grep inventory: integrity-critical routes use `recordAuditEventDurable` | Medium | S |
| 9 | NEW-5 | code-similarity: assert the route (not just the predicate) returns 413 over cap | Low | S |
| 10 | GS-1 | Expand `lint:bash` to all shell scripts; wire into CI `Script validation` | Medium | S |
| 11 | GS-2 | Set Playwright `retries: 1`+; remove dead SQLite setup from CI e2e job | Medium | S |
| 12 | GS-3 | Make `test:unit` enforce coverage (or document `test:unit:coverage` as authoritative) | Medium | S |
| 13 | NG-5 | Env-wrapper-vs-pure-function parity test for `validate_docker_image` | Low | S |
| 14 | GS-4 | Move A10 GET-gate test into a discoverable `problems.route.test.ts` | Low | S |
| 15 | R-CAV-1/2/3 | Tighten the source-grep contracts (or replace with behavioral) for accessCode, similarity cap, edit page | Low | S |

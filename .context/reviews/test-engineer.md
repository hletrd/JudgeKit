# Test Engineer Review — judgekit @ HEAD `0b0ac198`

Scope: critical-path coverage, assertion correctness (green-but-broken), flaky-test
vectors, missing negative/authz tests, migration-drift coverage. Findings are
evidence-based — both source and test were read for every item.

Severity scale: **Critical** (silent miss of a security/data-loss bug) >
**High** (recently shipped fix would not be caught) > **Medium** (defence-in-depth gap)
> **Low** (informational / hygiene).

Confidence: **High** / **Medium** / **Low** — based on how directly the gap was
verified.

---

## Coverage

### Test files examined (representative, not exhaustive)

- Judge queue lifecycle: `tests/integration/db/judge-claim-reclaim.test.ts`,
  `tests/unit/judge/claim-query.test.ts`, `tests/unit/api/judge-poll.route.test.ts`
  (misnamed — actually tests `claim/route.ts`),
  `tests/unit/api/judge-status-report.route.test.ts` (the real poll-route unit test),
  `tests/unit/api/judge-claim-db-time.test.ts`,
  `tests/unit/judge/auth.test.ts`, `tests/unit/judge/worker-staleness*.test.ts`,
  `judge-worker-rs/src/{executor,validation,api}.rs` test modules.
- Restore / export / deletion: `tests/unit/api/admin-backup-security.route.test.ts`,
  `tests/unit/db/{pre-restore-snapshot,export-with-files,export-sanitization,
  export-implementation,import-implementation,import-transfer}.test.ts`,
  `tests/unit/actions/user-management.test.ts`,
  `tests/unit/api/users.route.test.ts`, `tests/unit/audit/{events,serialize-details}.test.ts`,
  `src/app/api/v1/admin/restore/route.ts`, `src/app/api/v1/problems/[id]/export/route.ts`,
  `src/lib/db/{export,export-with-files,import,pre-restore-snapshot}.ts`,
  `src/lib/actions/user-management.ts`, `src/app/api/v1/users/[id]/route.ts`.
- Auth / authz / security: `tests/unit/security/{password,timing,csrf,encryption,
  password-hash,rate-limit,api-rate-limit,ip,sanitize-html,env,constants,timing}.test.ts`,
  `tests/unit/auth/*.test.ts`, `tests/unit/capabilities/*.test.ts`,
  `tests/unit/api/admin-{backup-security,roles,workers,submissions-bulk-rejudge-*,
  submissions-export-behavioral,submissions-export-implementation,chat-logs}.test.ts`.
- Compiler / docker / validation / Rust: `tests/unit/compiler/{execute,execute-implementation,
  output-limits-implementation}.test.ts`, `tests/unit/docker/client.test.ts`,
  `tests/unit/files/{storage-path-traversal,magic-byte-verification,zip-validation}.test.ts`,
  `tests/unit/judge/{docker-image-validation,prompt-sanitization,output-only-runner}.test.ts`,
  `tests/unit/judge/function-judging/**`, `tests/unit/shell-command-validation.test.ts`,
  `tests/unit/validators/problem-import.test.ts`, `judge-worker-rs/src/validation.rs`.
- Migration drift / infra: `scripts/check-migration-drift.sh`,
  `tests/unit/db/pg-migration-drift.test.ts`, `tests/unit/infra/{deploy-security,
  ci-suite-completeness,source-grep-inventory,pgdata-pinning,csp-matcher-coverage,
  host-database-url,retention-coverage,worker-runtime}.test.ts`,
  `.github/workflows/ci.yml`.

### Features lacking coverage (not enumerated elsewhere in detail)

- **No route-level unit test for `src/app/api/v1/problems/[id]/export/route.ts`**
  at all — see TE-3.
- **No e2e coverage of negative authz on per-problem export** (admin-only flow
  covered, but the recently-fixed student-access path is not exercised).
- **No unit test for the staleness sweep** (`worker-staleness-sweep.test.ts` is
  present but the integration link between sweep → reclaim is only exercised
  when a real PG is available).
- **Rust sandbox enforcement** (`setrlimit`, seccomp, `--network=none`,
  `--memory-swap`) has no test that runs a malicious payload through the worker
  and asserts it is contained. Only the classifier functions
  (`classify_test_case_verdict`, `reported_memory_used_kb`,
  `runtime_error_type`) are unit-tested; see TE-9.
- **`createProblemWithTestCases` transactional rollback** — the test at
  `tests/unit/actions/problem-management.test.ts:338` propagates an error but
  does not assert the rollback leaves no partial rows (mock doesn't surface that).

---

## TE-1 — User-deletion audit ordering: test still says "before" and never asserts order

- **Files**:
  - `tests/unit/actions/user-management.test.ts:481` (test name still reads
    `"deletes a user successfully and records audit before deletion"`), body
    lines 481-500.
  - `tests/unit/actions/user-management.test.ts:532-547` ("returns
    `deleteUserFailed` when db throws") — does **not** assert
    `recordAuditEvent` was **not** called.
  - `tests/unit/api/users.route.test.ts:947-1018` — the `DELETE ?permanent=true`
    tests only assert `recordAuditEventMock.toHaveBeenCalled()`; no order check.
- **Behaviour in source (correct)**: `src/lib/actions/user-management.ts:236-257`
  and `src/app/api/v1/users/[id]/route.ts` build the audit context early but
  call `recordAuditEvent` **after** `db.delete(...).where(...)` succeeds —
  commit `76e27d31` explicitly flipped the order so "phantom audit entries"
  are not left behind when deletion fails.
- **Gap**: a future regression that moves `recordAuditEvent` back before the
  delete passes every existing test. The "db throws" test does not verify the
  audit was suppressed, and the happy-path test does not verify the audit ran
  *after* the delete via `vi.mocked(...).mock.invocationCallOrder`.
- **Severity**: **Critical** — the commit being protected is unenforced.
- **Confidence**: **High**.
- **Recommended tests**:
  1. Rename the line-481 test to `"...records audit after deletion"`.
  2. Add
     `expect(mocks.dbDeleteWhere.mock.invocationCallOrder[0])
       .toBeLessThan(mocks.recordAuditEvent.mock.invocationCallOrder[0])`
     to the happy-path test.
  3. In the "db throws" test, assert
     `expect(mocks.recordAuditEvent).not.toHaveBeenCalled()`.
  4. Mirror the same three assertions in
     `tests/unit/api/users.route.test.ts` for the `DELETE ?permanent=true`
     case, including a new test where `db.transaction` rejects and
     `recordAuditEventMock` must not have been called.

## TE-2 — Pre-restore ZIP audit summary uses `pendingUploadedFiles.length`, but the test always passes `uploads: []`

- **File**: `tests/unit/api/admin-backup-security.route.test.ts:147-158`
  (`parseBackupZipMock.mockResolvedValue({ dbExport: {...}, uploads: [] })`).
- **Behaviour in source (correct)**:
  `src/app/api/v1/admin/restore/route.ts:158-163` constructs the audit
  `summary` as `` `Restoring from ZIP backup (... ${pendingUploadedFiles.length} files pending, ...)` ``
  **before** `importDatabase` and `restoreParsedBackupFiles` — at that point
  `filesRestored` is still 0, so the only correct value is the pending count
  (commit `34d27adf`).
- **Gap**: because `uploads` is always `[]`, the audit summary always renders
  `0 files pending`. If a regression swapped `pendingUploadedFiles.length` for
  `filesRestored` (also 0 at this point) every assertion would still pass.
  No test asserts on the `summary` string passed to `recordAuditEvent`.
- **Severity**: **High** — recently shipped fix is unenforced.
- **Confidence**: **High**.
- **Recommended test**: in a focused unit test (not the umbrella
  `admin-backup-security.route.test.ts`), call `POST /api/v1/admin/restore`
  with `parseBackupZipMock` returning
  `{ uploads: [{storedName:"a.bin", buffer:...}, {storedName:"b.bin", buffer:...}] }`,
  then assert the `recordAuditEvent` spy was called with a `summary` matching
  `/2 files pending/`. Add a parallel test for the JSON branch asserting the
  summary contains no `files pending` token.

## TE-3 — Per-problem export route has NO test file at all

- **File (missing)**: there is no `tests/unit/api/problem-export.route.test.ts`
  (or any name) covering `src/app/api/v1/problems/[id]/export/route.ts`.
  `grep -rn "problems/\[id\]/export" tests/` returns nothing.
- **Behaviour in source (correct)**:
  `src/app/api/v1/problems/[id]/export/route.ts:7,35` imports and calls
  `canManageProblem`, returning `forbidden()` when false. The handler emits
  hidden test cases (`testCases.input`, `testCases.expectedOutput`,
  `testCases.isVisible`) — security-critical data, commit `6cc068f0`.
- **Gap**: a regression that swaps the import back to the weaker
  `canAccessProblem` (the exact bug the commit fixed — students with
  assignment access exfiltrating hidden test data) is undetectable by the
  suite. Sibling routes under the same parent
  (`compute-expected.route.test.ts:199`, `problems-function-spec.route.test.ts:199`)
  have the negative path; this one does not.
- **Severity**: **Critical**.
- **Confidence**: **High**.
- **Recommended test**: mirror `compute-expected.route.test.ts`. Cases:
  1. `canManageProblem` → `false`: `GET` returns 403.
  2. `canManageProblem` → `true` and problem has hidden test cases: response
     payload includes `testCases[*].isVisible === false` data.
  3. Source-grep guard that the route imports `canManageProblem` (not
     `canAccessProblem`), same pattern already used in
     `tests/unit/api/group-assignment-export-implementation.test.ts`.

## TE-4 — Restore FK ordering and transactional rollback are source-grep only

- **Files**:
  - `tests/unit/db/import-implementation.test.ts:22-29` asserts the source
    text contains `throw new Error("Failed to import ${tableName} batch ${i}")`.
    It does **not** exercise a runtime rollback.
  - `tests/unit/api/admin-backup-security.route.test.ts:74-76` fully mocks
    `importDatabase` — zero runtime coverage of the transaction.
- **Behaviour in source (correct)**: `src/lib/db/import.ts:75-167` wraps the
  truncate+insert in `db.transaction(async (tx) => {...})`, truncates in
  `getReversedTableOrder()` (children first), inserts in `getTableOrder()`
  (parents first). On batch failure throws → rollback. **No FK is
  DEFERRABLE**, so the parent-before-child order is load-bearing.
- **Gap**: a refactor that keeps the `throw` string but accidentally swaps
  the truncate/insert order, or catches the error somewhere upstream, passes
  the existing tests. No test asserts `getTableOrder()` actually returns
  parents before children at runtime, and no test feeds `importDatabase` a
  poisoned payload (child row referencing a missing parent) and asserts the
  rollback leaves the DB untouched.
- **Severity**: **High** (data-loss class — partial imports into production).
- **Confidence**: **High**.
- **Recommended test**: instantiate an integration PG (the
  `tests/integration/db/helper.ts` `createTestDb` pattern), build a
  `JudgeKitExport` whose `submissions` row references a non-existent
  `userId`, call `importDatabase`, and assert (a) the call rejects /
  returns `success:false`, (b) a sentinel row inserted before the call is
  still present, (c) via a spy on `tx.insert`, parents are inserted before
  children.

## TE-5 — Poll route unit test never exercises the stale-token rejection path

- **File**: `tests/unit/api/judge-status-report.route.test.ts:114-298`. Every
  `where` stub returns `{ rowCount: 1 }` (lines 129, 191, 214, 259, 282).
- **Behaviour in source (correct)**:
  `src/app/api/v1/judge/poll/route.ts:78-114` (in-progress arm) and
  `:149-192` (terminal arm) wrap the `tx.update(...).where(
  and(eq(id), eq(judgeClaimToken)))` call, throwing `"invalidJudgeClaim"`
  when `rowCount === 0` and returning 403.
- **Gap**: the stale-token (zombie-worker) rejection at the route layer is
  not covered. The SQL-level guard *is* exercised by the integration test
  `judge-claim-reclaim.test.ts:178-193`, but only when a PG is available —
  `test:unit` runs without one. The mock chain also elides the `where`
  argument, so a regression that drops `eq(submissions.judgeClaimToken,
  claimToken)` from the WHERE clause is invisible.
- **Severity**: **High** — the route is the second defense line after the SQL.
- **Confidence**: **High**.
- **Recommended tests**:
  1. Add a case where `where: async () => ({ rowCount: 0 })` for the
     in-progress arm; assert `response.status === 403` and body
     `invalidJudgeClaim`.
  2. Same for the terminal arm.
  3. Capture the `where` argument and assert it was called with an `and(...)`
     clause that includes the `judgeClaimToken` field identifier (e.g.,
     `expect(andMock).toHaveBeenCalledWith(eq_id, eq_token)`).

## TE-6 — Poll route test file name is wrong

- **File**: `tests/unit/api/judge-poll.route.test.ts` actually describes
  `POST /api/v1/judge/claim` and imports
  `@/app/api/v1/judge/claim/route` (line 67).
- **Gap**: navigational — anyone searching the suite for poll-route coverage
  is misled into thinking one file covers both. The actual poll-route unit
  tests live in `judge-status-report.route.test.ts` (non-obvious).
- **Severity**: **Low** (hygiene; reviewer false confidence).
- **Confidence**: **High**.
- **Recommended fix**: rename `judge-poll.route.test.ts` →
  `judge-claim.route.test.ts` (or merge its contents into the existing
  claim test if one exists separately). Update
  `tests/unit/infra/source-grep-inventory.test.ts` if it tracks file names.

## TE-7 — `safeTokenCompare` test asserts behaviour, not the constant-time invariant

- **File**: `tests/unit/security/timing.test.ts` (entire file).
- **Behaviour in source (correct)**: `src/lib/security/timing.ts:9-18`
  HMACs both inputs with an ephemeral key and calls `timingSafeEqual` — no
  early length check.
- **Gap**: every test in this file would also pass if `safeTokenCompare`
  were rewritten as `provided === expected`. The whole point of the helper
  (timing-side-channel resistance) is unenforced. Same pattern in
  `tests/unit/security/csrf.test.ts` and others that lean on the comparator.
- **Severity**: **Medium** (the implementation is currently correct; the
  suite just cannot detect a regression to `===`).
- **Confidence**: **High**.
- **Recommended tests**:
  1. Add a source-grep test that the file body contains `timingSafeEqual`
     and does not contain an early `if (provided.length !== expected.length)`
     return. The codebase already uses this pattern
     (`tests/unit/docker/client.test.ts:129` pins
     `validateDockerfilePath` text).
  2. Optionally, a statistical timing test: assert that comparing
     `"a".repeat(N)` vs `"b".repeat(N)` and `"a".repeat(N)` vs
     `"a".repeat(N-1)+"b"` take distributions that overlap (rejects the
     trivial short-circuit). Brittle in CI, so prefer the source-grep guard.

## TE-8 — `serializeDetails` truncation is tested against a re-implementation, not production code

- **File**: `tests/unit/audit/serialize-details.test.ts:16-77`. The header
  comment explicitly says
  *"Since truncateObject and serializeDetails are not exported, we'll test
  the observable contract ... Re-implement the core truncation function
  for testing (matches src/lib/audit/events.ts)."*
- **Gap**: if the production budget calculation drifts (e.g., `keyCost`
  changes, off-by-one on the 4000-byte cap), the test stays green because
  it tests a copy. This is the textbook "green-but-broken" pattern.
- **Severity**: **Medium** — Postgres `TEXT` would silently truncate or
  reject oversized payloads; audit rows could be lost on edge cases.
- **Confidence**: **High**.
- **Recommended fix**: export `serializeDetails` / `truncateObject` from
  `src/lib/audit/events.ts` (or via a `__test__` re-export) and import
  them in the test. Alternatively, drive the check through
  `recordAuditEvent` + `flushAuditBuffer` and inspect the row written via
  `db.insert(auditEvents).values(...)` — the plumbing already exists in
  `tests/unit/audit/events.test.ts`.

## TE-9 — Rust worker sandbox enforcement has no end-to-end test

- **Files**: `judge-worker-rs/src/executor.rs` test module (lines 700-876)
  tests `classify_test_case_verdict`, `reported_memory_used_kb`,
  `runtime_error_type`, `compile_timeout_ms_for_submission`,
  `prune_dead_letter_dir_keeps_only_newest_json_files` — all pure functions.
- **Gap**: nothing in the Rust suite actually runs a submission that tries
  to break the sandbox (fork bomb, `malloc(huge)` for OOM, infinite stdout,
  network egress, `/proc/self/../..` reads, seccomp violation). The
  classifier tests verify *post-hoc* verdict mapping, not *enforcement*.
  Only the harness smoke tests (`tests/harness/adapters-smoke.test.ts`)
  actually invoke Docker, and they assert byte-equal stdout — they do not
  probe containment.
- **Severity**: **High** — sandbox bypass would land verdicts as "accepted"
  and the test suite would not notice.
- **Confidence**: **Medium** (containment may be implicitly tested in
  manual ops; CI does not exercise it).
- **Recommended tests** (each gated by `#[ignore]` or a feature flag so
  plain `cargo test` stays fast):
  1. Fork bomb → `MemoryLimit` or `RuntimeError`, never `Accepted`.
  2. `while true: print("a"*4096)` → `OutputLimitExceeded`.
  3. Network egress attempt (`socket()`) → seccomp `SCMP_ACT_ERRNO` →
     runtime failure.
  4. Process exceeds memory_limit_mb → `OomKilled` → `MemoryLimit`.
  These can live under `judge-worker-rs/tests/sandbox.rs` requiring
  `SANDBOX_IT=Y` to run.

## TE-10 — `validate_docker_image` Rust env-var tests race under parallel test execution

- **File**: `judge-worker-rs/src/validation.rs:101-206`.
- **Behaviour**: `valid_docker_images` (line 105) starts by
  `unsafe { std::env::remove_var("JUDGE_PRODUCTION_MODE"); remove_var("TRUSTED_DOCKER_REGISTRIES"); }`
  — the fix from commit `0b0ac198`. But `production_mode_rejects_images_without_trusted_registry`
  (line 182) still does
  `unsafe { std::env::set_var("JUDGE_PRODUCTION_MODE", "1"); }` and only
  restores at the end of the test body. There is no `#[serial]` attribute
  (no `serial_test` crate in `Cargo.toml`).
- **Gap**: cargo runs `#[test]`s in parallel threads within one process;
  `std::env::set_var` mutates a process-global table. If the OS schedules
  `valid_docker_images` concurrent with `production_mode_rejects...`, the
  former can race and observe `JUDGE_PRODUCTION_MODE=1`, flipping the
  expected `assert!(validate_docker_image("judge-python:latest"))` to
  fail. The commit's cleanup helps when tests run serially, but the
  parallel-window race is still open. If a test panics mid-body (e.g.,
  the trusted-registry assert fails before cleanup) the env stays set
  for every subsequent test in the binary.
- **Severity**: **Medium** — flaky under load (likely culprit behind
  future "Rust validation flaked on CI" reports).
- **Confidence**: **High** on the race, **Medium** that it has actually
  surfaced (no reproduction captured).
- **Recommended fix**:
  - Add `serial_test = "3"` to `[dev-dependencies]` and annotate both
    `valid_docker_images` and `production_mode_rejects_images_without_trusted_registry`
    with `#[serial]`.
  - Or refactor `validate_docker_image` to take an explicit `&ValidationConfig`
    argument (env-free) and have the env-reading wrapper be a thin shim —
    then test the pure function with config structs, no env mutation.

## TE-11 — `plugins.secrets.test.ts` mutates `process.env` at module load (cross-file leak risk)

- **File**: `tests/unit/plugins.secrets.test.ts:13-17`.
  ```ts
  const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;
  const ORIGINAL_PLUGIN_CONFIG_ENCRYPTION_KEY = process.env.PLUGIN_CONFIG_ENCRYPTION_KEY;
  process.env.AUTH_SECRET = "plugin-secret-test-key-material-32chars";
  process.env.PLUGIN_CONFIG_ENCRYPTION_KEY = "plugin-config-encryption-key-test-material-32chars";
  ```
- **Gap**: these mutations run at file-evaluation time (not inside
  `beforeAll`). Vitest isolates module registries per test file but the
  underlying Node process is shared when `pool: 'forks'` reuses a worker.
  If another file in the same worker reads `AUTH_SECRET` during this
  file's evaluation window, it sees the test value, not the real one.
  The `afterAll` restoration is correct in scope but does not defend the
  load-time window.
- **Severity**: **Low** (vitest's default `pool: 'forks'` with one file
  per worker mostly hides this; the risk materialises if `poolOptions`
  is tightened or another file orders itself ahead of this one).
- **Confidence**: **Medium**.
- **Recommended fix**: move the env mutation into a `beforeAll` (and
  restore in `afterAll`), or use `vi.stubEnv("AUTH_SECRET", "...")` which
  vitest tracks and unsets deterministically.

## TE-12 — `password.test.ts` still mocks `minPasswordLength` from settings (stale after removal)

- **File**: `tests/unit/security/password.test.ts:3-7`.
  ```ts
  vi.mock("@/lib/system-settings-config", () => ({
    getConfiguredSettings: () => ({ minPasswordLength: 8 }),
  }));
  ```
- **Behaviour in source**: `src/lib/security/password.ts:1,23` uses
  **only** the constant `FIXED_MIN_PASSWORD_LENGTH = 8` — the commit
  `0b0ac198` removed `minPasswordLength` from `system-settings-config`
  (see `tests/unit/system-settings-config.test.ts` diff in the same
  commit). The mock is now dead code: it returns a value the source no
  longer reads.
- **Gap**: the mock misleads future maintainers into thinking the policy
  is configurable via settings. A test that flips the mocked value to
  `minPasswordLength: 12` to confirm policy is enforced would fail
  silently (the source ignores it).
- **Severity**: **Low**.
- **Confidence**: **High**.
- **Recommended fix**: delete the `vi.mock("@/lib/system-settings-config",
  ...)` block — `password.ts` no longer imports from there. Add an
  assertion that the source file does not import `getConfiguredSettings`
  (source-grep guard, same pattern as TE-7).

## TE-13 — `docker/client.test.ts` is mostly source-grep; runtime behaviour of `validateDockerfilePath` is not exercised

- **File**: `tests/unit/docker/client.test.ts:129-162` explicitly states
  *"The validateDockerfilePath function is not exported, so we test it
  indirectly through the source code assertions"*.
- **Gap**: assertions like `expect(source).toContain('const DOCKERFILE_PREFIX = "docker/Dockerfile.judge-";')`
  catch renaming but not behavioural bugs. If someone leaves the constant
  in place but bypasses the check at runtime (e.g., an early-return
  branch that skips the `startsWith` guard), the test is green.
  `buildDockerImage` itself is only tested when `NODE_ENV !== 'production'`
  via the runner-URL branch.
- **Severity**: **Medium** — path traversal in Docker context selection
  is a known attack class.
- **Confidence**: **High**.
- **Recommended fix**: export `validateDockerfilePath` (or a
  `__validateDockerfilePathForTest` alias) and call it directly with
  attack payloads: `"docker/Dockerfile.judge-python"`,
  `"docker/Dockerfile.judge-../../etc/passwd"`,
  `"docker/Dockerfile.app"`, `"docker/Dockerfile.judge-"` (empty infix),
  `""`, `"../docker/Dockerfile.judge-python"`.

## TE-14 — `validateZipDecompressedSize` has no zip-slip / symlink / nested-directory coverage

- **File**: `tests/unit/files/zip-validation.test.ts` (entire file).
- **Behaviour**: the function only checks decompressed **size**. Path
  traversal inside ZIP entries (`../`) is defended separately by
  `src/lib/files/storage.ts` `resolveStoredPath` and by
  `src/lib/db/export-with-files.ts:208-215`. The zip test never feeds an
  entry whose `name` is `../escape.bin` to verify the layered defence
  actually triggers when called via `parseBackupZip`.
- **Gap**: see TE-3 in the restore/export agent's findings — only one
  pattern (`uploads/../escape.bin`) is tested, only at the manifest
  layer, with `writeUploadedFile` mocked out so the storage regex never
  fires.
- **Severity**: **Medium**.
- **Confidence**: **High**.
- **Recommended tests**: extend `tests/unit/db/export-with-files.test.ts`
  with cases for `uploads/%2e%2e/escape.bin`, `uploads/..././escape.bin`,
  `uploads/.hidden.bin`, `uploads/a/b.bin`, and a literal `..` entry
  name. Add one test that calls the **real** `resolveStoredPath` (pure
  function — no mock needed) with the same payloads.

## TE-15 — `problemImportSchema` test only exercises the Zod schema, not the route handler

- **File**: `tests/unit/validators/problem-import.test.ts` (entire file).
  Every case calls `problemImportSchema.safeParse(...)` directly.
- **Gap**: the route handler at `src/app/api/v1/problems/import/route.ts:63-103`
  does the capability check (`caps.has("problems.create")` → `forbidden()`)
  and calls `createProblemWithTestCases`. Neither is exercised here, and
  there is no `tests/unit/api/problem-import.route.test.ts`. A regression
  that drops the capability gate would not be caught by this file; the
  only safety net is the generic `createApiHandler` wrapper.
- **Severity**: **Medium** — the schema is the most-asserted layer; the
  authz and persistence layers are thin.
- **Confidence**: **High**.
- **Recommended test**: add a route-level test that mocks
  `resolveCapabilities` to return a Set without `problems.create` and
  asserts 403, plus a happy-path test asserting
  `createProblemWithTestCases` was called with the sanitised payload.

## TE-16 — Migration drift *detection* is delegated to a shell script that mutates the working tree

- **Files**:
  - `scripts/check-migration-drift.sh:65-81` — runs
    `npx drizzle-kit generate --name ci_migration_drift_check`, compares
    `git status --porcelain -- drizzle/` before/after, and on detection
    runs `git checkout -- drizzle/pg/meta/_journal.json` and
    `git clean -fdq -- drizzle/` to "leave the CI workspace clean".
  - `tests/unit/db/pg-migration-drift.test.ts` — only verifies the
    *current* state of the SQL/journal (snapshot-style assertions). It
    cannot detect that the drift script itself still works.
- **Gap (correctness)**: the unit test passes even if
  `scripts/check-migration-drift.sh` is deleted or broken. The actual
  drift detection is unverified at the unit layer.
- **Gap (safety)**: `git clean -fdq -- drizzle/` is a **destructive
  operation hidden in a test script** — it deletes any untracked file
  under `drizzle/`. A developer who has just run
  `drizzle-kit generate` locally and then runs `npm run db:check` loses
  their new migration files silently. The project's global rule
  ("Destructive Action Safety") calls this out.
- **Severity**: **Medium** (correctness), **High** (destructive) when
  evaluated against the destructive-action rule.
- **Confidence**: **High**.
- **Recommended fixes**:
  1. Add a guard at the top of the script that aborts if
     `git status --porcelain -- drizzle/` is already non-empty before
     the probe `generate` runs (i.e., refuse to operate on a dirty
     tree).
  2. Replace `git clean -fdq` with a targeted cleanup that only removes
     files matching the probe name (`ci_migration_drift_check`), not
     every untracked file under `drizzle/`.
  3. Add a unit test that actually verifies drift detection by writing a
     junk column into a temp copy of `schema.pg.ts` and asserting the
     script exits non-zero — currently no test would catch a regression
     in the detection logic.

## TE-17 — CI workflow does not gate on `npm run db:check` failing in a pull-request context

- **File**: `.github/workflows/ci.yml:93` runs `npm run db:check` — but
  only inside the `quality` job. The `ci-suite-completeness.test.ts`
  asserts that this step exists (line 13-14 territory), not that the job
  is a required check on PRs.
- **Gap**: the test enforces textual presence, not gating semantics. If
  someone moves `db:check` into an optional job, the test stays green.
- **Severity**: **Low**.
- **Confidence**: **Medium** (depends on branch-protection config which
  is not in the repo).
- **Recommended fix**: document the required status checks in
  `SECURITY.md` or `AGENTS.md` and add a source-grep test that asserts
  the documented list matches the `quality` job steps.

## TE-18 — Source-grep tests make up ~34% of the unit suite (154 / ~450 files)

- **File**: `tests/unit/infra/source-grep-inventory.test.ts:194` pins
  `DOCUMENTED_BASELINE = 154`. The inventory explicitly categorises them
  and is honest about the trade-off — but the absolute number means
  roughly one in three unit tests asserts source text rather than
  runtime behaviour.
- **Risk**: source-grep tests catch renaming and deletion but miss
  behavioural regressions that keep the matched string in place. Several
  findings above (TE-4, TE-7, TE-8, TE-13) are specific instances of
  this class.
- **Severity**: **Low** at the portfolio level (the inventory itself is
  the right tool and is being used).
- **Confidence**: **High**.
- **Recommended action**: keep the baseline ratchet; for each *new*
  source-grep test added, require a paired comment naming the
  behavioural test that would be infeasible to write. Periodically
  convert the oldest source-grep tests in `tests/unit/db/` and
  `tests/unit/infra/` to runtime tests where coverage has since become
  feasible.

---

## Flaky-test vectors (cross-cutting)

| Vector | File / line | Risk | Recommended fix |
|---|---|---|---|
| Filesystem mtime resolution for retention pruning | `tests/unit/db/pre-restore-snapshot.test.ts:142` (`await new Promise(r => setTimeout(r, 25))`) | Sub-second mtime filesystems (NFS, FAT) can keep 4 or 6 files instead of 5 | Replace mtime sort with an explicit sequence-number suffix in test fixtures, or use `vi.useFakeTimers()` with `setSystemTime` per file write |
| Filename millisecond stamp collisions | `src/lib/db/pre-restore-snapshot.ts:79` (ISO ms stamps) | Two snapshots in the same ms overwrite each other | Use `nanoid` suffix or `${ms}-${counter}` |
| Cross-test `process.env.DATA_DIR` mutation | `tests/unit/db/pre-restore-snapshot.test.ts:41-49` | Race if vitest ever runs files in one worker | Use `vi.stubEnv` (auto-restored) instead of direct mutation |
| Rust env-var mutation without `#[serial]` | `judge-worker-rs/src/validation.rs:184-198` | Parallel-test race on `JUDGE_PRODUCTION_MODE` | TE-10 |
| `process.env` mutation at module-load time | `tests/unit/plugins.secrets.test.ts:13-17` | Cross-file leak in shared worker | TE-11 |
| `setSystemTime` not used; tests rely on `new Date()` | `tests/unit/api/judge-poll.route.test.ts` etc. | UK/KST clock differences | Mostly OK because assertions are on `expect.any(Date)`, not values — but `judge-claim-db-time.test.ts` is a source-grep specifically because the team gave up trying to assert runtime DB time. Worth revisiting with `vi.useFakeTimers()` + `setSystemTime`. |
| Fake timers leak across tests if `afterEach` skipped | `tests/unit/audit/events.test.ts:60-79` | Currently OK; `afterEach` clears | Add a lint rule that bans `vi.useFakeTimers` outside a `describe` with an `afterEach` |
| Hardcoded source paths in source-grep tests | `tests/unit/db/export-sanitization.test.ts:10`, etc. | Breaks on file rename | Acceptable for now; the inventory tracks them |
| `tempdir()` cleanup on panic | `judge-worker-rs/src/executor.rs:851-875` (`tempdir().unwrap()`) | Leaks `$TMPDIR/judgekit-*` if assertion panics before `temp.close()` | Use RAII guard or `scopeguard` |
| Unbounded network in e2e | `tests/e2e/*.spec.ts` (Playwright) | External URL fetches can hang | Already gated by Playwright's `timeout` per test; verified in `playwright.config.ts` |

---

## TDD opportunities for known fragile areas

1. **User-deletion audit ordering** (TE-1) — write the failing test first
   (`expect recordAuditEvent NOT called when delete throws`), watch it
   fail, then add the minimal `not.toHaveBeenCalled` assertion. The
   production fix is already in `76e27d31`; this is the missing RED step.
2. **Per-problem export negative authz** (TE-3) — write the 403 test
   first, confirm it fails against `canAccessProblem`, then verify the
   current `canManageProblem` source passes it.
3. **Poll-route stale-token rejection** (TE-5) — write the
   `where: { rowCount: 0 }` test first; current source already returns
   403 so it should pass immediately, documenting the contract.
4. **Restore rollback on poisoned FK** (TE-4) — integration-test RED
   step; current source rolls back, so the test should pass, but writing
   it first forces the team to design the poisoned payload carefully.
5. **`safeTokenCompare` constant-time guard** (TE-7) — write the
   source-grep test asserting `timingSafeEqual` is present; flip the
   source to `===` temporarily to confirm the test fails; revert.

---

## Final sweep

- The **judge claim → reclaim → zombie-finalize** chain is the
  best-tested part of the repo. `tests/integration/db/judge-claim-reclaim.test.ts`
  is exemplary: real production SQL via `buildClaimSql` +
  `namedToPositional`, four scenarios (reclaim, no-double-claim,
  zombie-rejection, self-reclaim active_tasks accounting). The
  source-grep companion in `tests/unit/judge/claim-query.test.ts` is a
  fast pre-check, not a substitute, and the suite is honest about that.
- The **recently-shipped security/audit fixes** (`76e27d31`, `6cc068f0`,
  `34d27adf`, `26cff8e4`) are the weakest-covered area — every one of
  them has either no test (TE-3) or a test that would pass even if the
  fix were reverted (TE-1, TE-2, TE-4). These are the highest-ROI
  targets.
- The **Rust worker** is well-tested at the unit/classifier level but
  has no end-to-end sandbox test (TE-9) and a real parallel-test race
  on env vars (TE-10).
- The **infra/deploy source-grep baseline** (TE-18) is well-governed by
  the inventory test, but the migration-drift script has a destructive
  cleanup step that needs gating (TE-16).
- Overall suite health: **NEEDS ATTENTION** — large and well-organised,
  but several Critical / High severity gaps where a regression would
  ship undetected. None of the gaps require re-architecture; each is
  fixable with 1-3 focused tests.

---

## Priority-ordered action list

| # | Finding | Severity | Effort |
|---|---|---|---|
| TE-1 | User-deletion audit ordering test (rename + order + not-called) | Critical | S (3 assertions, 2 files) |
| TE-3 | Add `problem-export.route.test.ts` with negative authz | Critical | M (new file, ~5 cases) |
| TE-5 | Poll-route stale-token rejection unit test | High | S (2 cases, mock tweak) |
| TE-2 | Pre-restore ZIP audit summary "N files pending" assertion | High | S (1 focused test) |
| TE-4 | Restore rollback integration test on poisoned FK | High | M (needs integration PG) |
| TE-9 | Rust sandbox end-to-end tests (fork/OOM/network/seccomp) | High | L (new test binary) |
| TE-16 | Migration-drift script: gate on dirty tree, scoped cleanup | High (destructive) | S |
| TE-10 | `#[serial]` (or config refactor) for Rust env tests | Medium | S |
| TE-8 | Replace `serializeDetails` re-impl test with real export | Medium | S |
| TE-13 | Export `validateDockerfilePath` + add payload tests | Medium | S |
| TE-14 | Zip-slip / nested-dir coverage in `export-with-files` | Medium | S |
| TE-15 | Add route-level `problem-import.route.test.ts` | Medium | M |
| TE-7 | `safeTokenCompare` source-grep guard for `timingSafeEqual` | Medium | S |
| TE-11 | Move plugins.secrets env mutation into `beforeAll` | Low | S |
| TE-12 | Delete stale `minPasswordLength` mock | Low | S |
| TE-6 | Rename `judge-poll.route.test.ts` → `judge-claim.route.test.ts` | Low | S |
| TE-17 | Document required CI checks; lint against drift | Low | S |
| TE-18 | Continue source-grep baseline ratchet; periodic conversions | Low | ongoing |

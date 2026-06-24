# Debugger Review - Prompt 1, Cycle 2

Findings count: 8

## Inventory

I treated the dirty tree as intentional prior-cycle work and reviewed the changed behavior surfaces rather than reverting or fixing anything.

Review-relevant files inventoried from `git status --short` and `git diff --stat`:

- Deploy/test infrastructure: `deploy-docker.sh`, `playwright.config.ts`, `scripts/playwright-local-webserver.sh`.
- Judge/runtime and Docker: `judge-worker-rs/src/executor.rs`, `judge-worker-rs/src/validation.rs`, `src/lib/compiler/execute.ts`, `src/lib/docker/client.ts`.
- Backup, restore, export, and plugin secrets: `src/app/api/v1/admin/restore/route.ts`, `src/lib/db/export-with-files.ts`, `src/lib/db/export.ts`, `src/lib/db/import-transfer.ts`, `src/lib/db/import.ts`, `src/lib/db/pre-restore-snapshot.ts`, `src/lib/plugins/secrets.ts`.
- Auth/password/host trust: `src/app/api/v1/auth/reset-password/route.ts`, `src/app/change-password/change-password-form.tsx`, `src/lib/actions/public-signup.ts`, `src/lib/actions/user-management.ts`, `src/lib/auth/trusted-host.ts`, `src/lib/security/password.ts`, `src/lib/system-settings-config.ts`, `src/lib/validators/system-settings.ts`, `messages/en.json`, `messages/ko.json`, `docs/authentication.md`.
- Problem/language/realtime validation: `src/app/api/v1/problems/import/route.ts`, `src/lib/problem-management.ts`, `src/lib/judge/sync-language-configs.ts`, `src/lib/realtime/realtime-coordination.ts`, `src/lib/validators/api.ts`.
- UI changes: `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx`, `src/app/(public)/languages/page.tsx`.
- Tests covering the above areas: the modified unit and E2E files under `tests/unit/**` and `tests/e2e/function-judging-responsive.spec.ts`.
- Prior-cycle review/plan artifacts: `.context/reviews/*.md`, `plans/open/2026-06-22-rpf-cycle-1-review-remediation.md`; these were used for context but not treated as runtime behavior.

## Findings

### DBG2-1 - ZIP restore still commits the database before uploaded files are durably restored

- Status: confirmed
- Confidence: High
- Files/regions: `src/app/api/v1/admin/restore/route.ts:149-178`, `src/lib/db/export-with-files.ts:267-348`, `src/lib/db/export-with-files.ts:351-357`

The route parses and validates the ZIP, takes a pre-restore snapshot, imports the database at `restore/route.ts:165`, and only then writes the uploaded files at `restore/route.ts:176-178`. `parseBackupZip()` validates file contents into in-memory buffers, but `restoreParsedBackupFiles()` is the first durable write to the live uploads directory.

Concrete failure scenario: an admin restores a valid ZIP backup, `importDatabase(data)` commits successfully, then `writeUploadedFile()` fails because the uploads volume is full, read-only, missing, or loses connectivity. The route falls into the outer catch and returns `restoreFailed`, but the database has already been replaced and now points at files that were not restored. This is exactly the hard-to-debug "DB says files exist but storage does not" split-brain state.

Suggested fix: stage uploaded files durably before `importDatabase()` commits, preferably into a temp restore directory on the same volume, verify all staged writes and hashes, then after the DB transaction succeeds atomically swap or promote staged files. If durable staging fails, abort before touching the DB. For rollback safety, also decide what to do if promotion fails after commit.

### DBG2-2 - Backups that the app can create can be too large for the restore route to accept

- Status: confirmed
- Confidence: High
- Files/regions: `src/lib/db/import-transfer.ts:3`, `src/app/api/v1/admin/restore/route.ts:68-70`, `src/lib/db/export-with-files.ts:197-214`, `src/lib/db/export-with-files.ts:238-247`

`MAX_IMPORT_BYTES` is 100 MiB and the restore route rejects any uploaded file above that before checking whether it is JSON or ZIP. The ZIP backup exporter, however, includes every uploaded file it finds and then generates a single ZIP buffer; there is no corresponding export cap that guarantees the produced backup is at most 100 MiB.

Concrete failure scenario: production has 150 MiB of uploaded PDFs/images. `streamBackupWithFiles()` succeeds and returns a ZIP backup. During disaster recovery, the same backup is rejected immediately by `restore/route.ts:68-70` with `fileTooLarge`, before the new 512 MiB decompressed ZIP cap is even consulted. Operators are left with a backup artifact produced by JudgeKit that JudgeKit cannot restore.

Suggested fix: split JSON import and ZIP backup limits. Set a backup ZIP upload cap that is at least as large as the maximum backup the exporter is willing to produce, or enforce/export a documented backup-size ceiling. Ideally stream ZIP generation and restore so the compressed outer file limit and decompressed entry limits are part of one coherent contract.

### DBG2-3 - Language sync now preserves every existing command, including stale first-party defaults

- Status: confirmed
- Confidence: High
- Files/regions: `src/lib/judge/sync-language-configs.ts:43-55`, `AGENTS.md` "Adding a New Language" / "After syncing" sections

The dirty change fixes override clobbering by only backfilling missing `runCommand` and `compileCommand`. That also means any existing non-empty command is treated as an admin override forever. The sync code has no provenance bit or default-version comparison, so ordinary rows originally inserted from the TypeScript defaults will not receive future default command fixes.

Concrete failure scenario: a Dockerfile or language config changes because a compiler flag is wrong, for example a Zig output-path flag or a runtime path fix. `src/lib/judge/languages.ts` is updated and `npm run languages:sync` is run as documented, but the DB row already has an old non-null command from the previous default sync. The dirty sync path skips it, the worker reads stale commands from the DB at runtime, and submissions keep failing even though the source-of-truth TypeScript file is fixed.

Suggested fix: track whether a DB command is admin-customized, or store a hash/version of the default command last synced. Update rows that still match the previous default, and preserve only rows marked customized or rows whose value has diverged from known defaults.

### DBG2-4 - Local Playwright can silently test a stale standalone build

- Status: confirmed
- Confidence: High
- Files/regions: `scripts/playwright-local-webserver.sh:102-104`, `playwright.config.ts:114-117`

The webserver helper now skips `npm run build` whenever `.next/standalone/server.js` exists unless `PLAYWRIGHT_REBUILD_APP=1` is set. Playwright still starts that standalone server and the timeout was extended to 600 seconds, so a local full E2E gate can pass against a previous build after source files have changed.

Concrete failure scenario: a developer changes an API route or page component, runs `npx playwright test`, and an old `.next/standalone/server.js` from yesterday is reused. The tests exercise stale code and pass, then the deploy build fails or production regresses. This is especially dangerous in this review-plan-fix workflow because Playwright is the blocking gate and the worktree is intentionally dirty.

Suggested fix: make rebuild the default for local gates and add an explicit `PLAYWRIGHT_REUSE_BUILD=1` opt-in, or compare `.next/standalone/server.js` against source/package/config mtimes. In CI, fail if a preexisting standalone build is reused from cache without an explicit cache key tied to the source tree.

### DBG2-5 - `RUNNER_AUTH_DISABLED=1` disables auth warnings but the runner is never called without a token

- Status: confirmed
- Confidence: High
- Files/regions: `src/lib/compiler/execute.ts:61-83`, `src/lib/compiler/execute.ts:530-563`, `src/lib/compiler/execute.ts:634-657`

The environment comment says `RUNNER_AUTH_DISABLED=1` is an explicit opt-out for local development with an unauthenticated runner. The config error also respects that flag. But `tryRustRunner()` returns `null` whenever `RUNNER_AUTH_TOKEN` is absent, and it unconditionally builds an `Authorization: Bearer ${RUNNER_AUTH_TOKEN}` header. When `COMPILER_RUNNER_URL` is set, local fallback is disabled by default, so the final result is `Compiler runner unavailable`.

Concrete failure scenario: a developer starts an unauthenticated local Rust runner and launches Next with `COMPILER_RUNNER_URL=http://localhost:3001 RUNNER_AUTH_DISABLED=1`. The warning is suppressed, but every compiler run refuses to call the runner and also refuses local fallback, so the playground/judge path fails with a misleading runner-unavailable result.

Suggested fix: change `tryRustRunner()` to allow `!RUNNER_AUTH_TOKEN && RUNNER_AUTH_DISABLED`, omit the `Authorization` header in that mode, and add a unit test that exercises the exact env combination. Alternatively remove `RUNNER_AUTH_DISABLED` if unauthenticated runners are no longer supported.

### DBG2-6 - Output-limit-exceeded signals are masked by timeout/runtime classification

- Status: likely
- Confidence: Medium
- Files/regions: `judge-worker-rs/src/executor.rs:142-154`, `judge-worker-rs/src/executor.rs:601-609`

The worker passes `execution.stdout_truncated || execution.stderr_truncated` into `output_limit_exceeded`, but `classify_test_case_verdict()` checks timeouts, memory, and non-zero exit before it checks the output-limit flag. A program that floods output until truncation and then times out will be classified as `time_limit` or `runtime_error`, not `output_limit_exceeded`.

Concrete failure scenario: a submission loops printing data. Docker output capture hits the output cap, then the process is killed by the timeout. The result persisted for the test case is TLE/RE even though the more actionable cause was output overflow. Students and operators will chase timing/runtime behavior while the real fix is to stop printing.

Suggested fix: define verdict precedence explicitly. If output cap is meant to be authoritative, check `output_limit_exceeded` before timeout and non-zero exit, or record both primary and secondary signals. Add unit tests for `timed_out=true + output_limit_exceeded=true` and `exit_code != 0 + output_limit_exceeded=true`.

### DBG2-7 - Password minimum remains configurable in settings but runtime validation is fixed at 8

- Status: risk
- Confidence: Medium
- Files/regions: `src/lib/security/password.ts:1-28`, `src/lib/system-settings-config.ts:52-54`, `src/lib/validators/system-settings.ts:125-128`, `src/app/api/v1/auth/reset-password/route.ts:31-41`, `docs/authentication.md:16-19`

The runtime validator now enforces exactly `FIXED_MIN_PASSWORD_LENGTH = 8`, and the reset route removed its `getSystemSettings()` lookup. At the same time, `minPasswordLength` is still present in configured settings and remains writable through the system settings validator with a range of 8 to 128. That leaves an apparent hardening knob that no longer hardens password-setting flows.

Concrete failure scenario: an operator sets `minPasswordLength` to 12 or 16 during a high-stakes contest, sees the setting accepted, and assumes new passwords follow that floor. A reset-password request with an 8-character password passes because the route delegates to the fixed validator and passes `FIXED_MIN_PASSWORD_LENGTH` to `resetPassword()`.

Suggested fix: either remove/hide/deprecate `minPasswordLength` from settings and migrations, or restore configured-min enforcement while still honoring the repo-level minimum floor. If the intended policy is truly non-configurable 8, writes above 8 should be rejected or ignored with an explicit admin-facing explanation.

### DBG2-8 - ZIP restore audit logs always report zero files for successful ZIP restores

- Status: confirmed
- Confidence: High
- Files/regions: `src/app/api/v1/admin/restore/route.ts:78-80`, `src/app/api/v1/admin/restore/route.ts:151-160`, `src/app/api/v1/admin/restore/route.ts:176-178`

`filesRestored` is initialized to `0`, the audit event is recorded before file restoration, and the summary interpolates `filesRestored` for ZIP backups. The actual restore count is assigned only after the DB import and after the audit event has already been queued.

Concrete failure scenario: an admin restores a ZIP with 42 uploaded files. The API response returns `filesRestored: 42`, but the audit log summary says `0 files`. During incident review, operators cannot trust the audit trail to determine whether a backup was restored without uploads or whether the summary was stale.

Suggested fix: use `pendingUploadedFiles.length` for the pre-restore audit summary, or record a second completion audit event after `restoreParsedBackupFiles()` returns. If restore can partially fail, log both pending and restored counts.

## Missed-Issue Sweep

I did a final pass over the required bug classes against the inventoried files:

- Null/undefined paths: checked restore file detection, runner auth envs, plugin secret empty/null handling, and password settings drift.
- Race/stale state: language sync stale defaults, restore DB/files split, stale Playwright builds, and stale audit count are covered above.
- Env-dependent failures: runner auth opt-out and production/local Docker behavior were traced; only the auth-disabled path had enough evidence for a finding here.
- Bad fallback/error swallowing: restore snapshot failure still returns `null` and allows restore to continue, but I did not list it separately because DBG2-1 is the larger committed-DB/no-files failure. It should still be considered when fixing restore atomicity.
- Deploy/test flakes: Playwright stale-build reuse is covered; deploy script changes looked fail-closed rather than introducing a confirmed new flaky path.
- Worker/runtime failures: output-limit precedence and runner auth/fallback behavior are covered.

No fixes were implemented as part of this review.

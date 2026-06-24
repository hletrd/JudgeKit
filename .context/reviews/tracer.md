# Tracer Review - review-plan-fix Cycle 2 Prompt 1

Findings count: 4

## Review Note

The repository was dirty before this review. I treated all uncommitted changes as intentional prior-cycle work and did not revert or implement fixes.

I built the inventory from `git status --short`, `rg --files`, targeted `rg -n` searches, and line-numbered source reads captured before the shared workspace began blocking further content reads. The final missed-issue sweep was performed against the captured code paths and file inventory. Findings below cite only captured code regions.

## Inventory

Auth/password reset/change password/public signup/user management:

- `src/app/api/v1/auth/forgot-password/route.ts` - request validation, per-IP/email rate limiting, reset email dispatch.
- `src/app/api/v1/auth/reset-password/route.ts` - token/password validation and reset call (`lines 20-41`).
- `src/lib/email/index.ts` - reset-token creation/validation/password update (`lines 36-97`, `105-191`).
- `src/lib/security/password.ts` and `src/lib/users/core.ts` - shared password policy and hashing (`password.ts:1-27`, `users/core.ts:59-68`).
- `src/lib/actions/change-password.ts` and `src/app/change-password/change-password-form.tsx` - forced/self password change (`change-password.ts:21-107`, form `lines 38-75`).
- `src/lib/actions/public-signup.ts` and `src/lib/validators/public-signup.ts` - public signup gates, hCaptcha, uniqueness, verification email (`public-signup.ts:83-214`).
- `src/lib/actions/user-management.ts`, `src/app/api/v1/users/route.ts`, `src/app/api/v1/users/[id]/route.ts`, `src/app/api/v1/users/bulk/route.ts` - admin/user CRUD and password reset paths.

Problem import/export/restore:

- `src/app/api/v1/problems/import/route.ts` - import schema and create call (`lines 15-60`, `63-101`).
- `src/app/api/v1/problems/[id]/export/route.ts` - per-problem export (`lines 9-63`).
- `src/app/api/v1/problems/route.ts`, `src/app/api/v1/problems/[id]/route.ts`, `src/lib/problem-management.ts`, `src/lib/validators/problem-management.ts` - create/update persistence and validation.
- `src/app/api/v1/admin/backup/route.ts`, `src/app/api/v1/admin/restore/route.ts`, `src/lib/db/export.ts`, `src/lib/db/export-with-files.ts`, `src/lib/db/import.ts` - full backup/restore.

Judge claim/compiler execute/language sync:

- `src/app/api/v1/judge/claim/route.ts`, `src/lib/judge/claim-query.ts`, `src/app/api/v1/judge/poll/route.ts` - claim, stale-claim fencing, final result write.
- `src/lib/compiler/execute.ts`, `src/app/api/v1/compiler/run/route.ts`, `src/app/api/v1/playground/run/route.ts` - standalone compiler execution and runner fallback.
- `src/lib/judge/sync-language-configs.ts`, `scripts/sync-language-configs.ts`, `src/lib/actions/language-configs.ts`, `src/lib/judge/languages.ts` - language config source/sync/admin override surface.
- `judge-worker-rs/src/{api,executor,runner,validation,docker,languages,types}.rs` - Rust worker execution boundary. Working-tree reads for these files blocked during the final pass, so I did not claim Rust-side-only findings.

Docker admin image APIs:

- `src/app/api/v1/admin/docker/images/route.ts`, `src/app/api/v1/admin/docker/images/build/route.ts`, `src/app/api/v1/admin/docker/images/prune/route.ts`, `src/lib/docker/client.ts`, `src/lib/judge/docker-image-validation.ts`, `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx`.

Realtime coordination:

- `src/lib/realtime/realtime-coordination.ts`, `src/lib/db/schema.pg.ts` (`realtimeCoordination` table), and `tests/unit/realtime/realtime-coordination.test.ts`.

Plugin secret encryption:

- `src/lib/plugins/secrets.ts`, `src/lib/db/export.ts` (`plugins.config` export transform at `lines 271-280`), `src/lib/db/import.ts` (row insert path at `lines 187-197`), plugin admin/chat-widget config paths.

Deploy script:

- `deploy-docker.sh`, `deploy.sh`, `scripts/docker-disk-cleanup.sh`, `scripts/playwright-local-webserver.sh`, `playwright.config.ts`, `CLAUDE.md`, `AGENTS.md`.

## Findings

### TR-1. Per-problem export leaks hidden tests to any user who can access the problem

Status: confirmed  
Confidence: High  
Severity: High

Evidence:

- `src/app/api/v1/problems/[id]/export/route.ts:35-36` authorizes export with `canAccessProblem(id, user.id, user.role)`.
- The same handler then fetches every test case for the problem, including `input`, `expectedOutput`, `isVisible`, and `sortOrder`, at `src/app/api/v1/problems/[id]/export/route.ts:38-47`.
- It returns those cases directly in the export payload at `src/app/api/v1/problems/[id]/export/route.ts:55-61`.
- By contrast, the normal problem detail route only returns full test cases to managers; non-managers get the problem row with `referenceSolution` stripped and no test cases (`src/app/api/v1/problems/[id]/route.ts:56-80`).

Causal failure scenario:

A student enrolled in an assignment can satisfy `canAccessProblem` for an assigned/private problem. Even if the UI never exposes an export button, the authenticated student can request `GET /api/v1/problems/:id/export` directly. The response includes hidden test inputs and expected outputs, so the student can solve against the private judge data instead of the problem statement.

Competing hypotheses considered:

- If export were meant to be a student-visible sharing feature, it should not include hidden tests or expected outputs. The payload is import-ready and includes all test-case fields, so it is an author/admin management operation.
- `canAccessProblem` is correct for reading a problem statement, but too broad for exporting judge data.

Suggested fix:

Gate this route with `canManageProblem` or an explicit problem export capability, not `canAccessProblem`. Keep exporting hidden tests only for authors/instructors/admins who can manage that problem. Add a regression test where a student with assignment access receives 403 from the export route.

### TR-2. Per-problem export/import round trips silently downgrade function problems

Status: confirmed  
Confidence: High  
Severity: Medium

Evidence:

- `src/app/api/v1/problems/[id]/export/route.ts:13-30` selects title/description/limits/visibility/comparison/difficulty fields, but omits `problemType`, `defaultLanguage`, `functionSpec`, and `referenceSolution`.
- `src/app/api/v1/problems/import/route.ts:23-34` supports importing `problemType`, `functionSpec`, and `referenceSolution`, defaulting `problemType` to `"auto"` when absent.
- `src/app/api/v1/problems/import/route.ts:89-90` only passes `functionSpec` and `referenceSolution` to persistence when the imported `problemType` is `"function"`.
- `src/lib/problem-management.ts:296-310` persists `problemType`, `defaultLanguage`, `functionSpec`, and `referenceSolution` for new problems.
- `src/lib/problem-management.ts:344-358` persists the same fields on update.

Causal failure scenario:

An instructor exports a function-signature problem for reuse, then imports the JSON into another instance. Because the export omitted `problemType`, the import schema defaults it to `"auto"`. Because the imported problem is now `"auto"`, the import route nulls the function spec and reference solution. The restored problem expects a full stdin/stdout program instead of a function implementation, and all function-judging harness behavior is lost without an explicit error.

Competing hypotheses considered:

- The omission could be intentional to avoid exporting author-only reference code, but omitting `problemType` and `functionSpec` still corrupts the problem type. If `referenceSolution` must stay private, export should either omit it explicitly with metadata or require privileged export.
- Full database backup is table-driven and includes current columns; this bug is specific to per-problem export.

Suggested fix:

Update per-problem export to include `problemType`, `defaultLanguage`, and `functionSpec`. Decide deliberately whether `referenceSolution` belongs in this export; if not, include a clear marker and make import reject function problems that lack a function spec/reference when the workflow requires it. Add function-problem export/import round-trip tests.

### TR-3. Restore audit is recorded before the destructive import, then either disappears or lies

Status: confirmed  
Confidence: High  
Severity: Medium

Evidence:

- `src/app/api/v1/admin/restore/route.ts:151-163` records `system_settings.database_restored` before calling `importDatabase`.
- `src/app/api/v1/admin/restore/route.ts:165-173` runs `importDatabase(data)` and only afterward checks whether restore failed.
- `src/lib/db/import.ts:127-139` deletes every table in reverse dependency order during restore.
- `src/lib/db/export.ts:203-205` includes `auditEvents` in the table order, so restore deletes the audit event that was just recorded and replaces audit rows with whatever the backup contains.
- `src/app/api/v1/admin/restore/route.ts:176-178` restores ZIP files after the database import, but the earlier audit summary at `lines 158-160` interpolates `filesRestored` while it is still `0`.

Causal failure scenario:

On a successful restore, the route inserts a "database_restored" audit event, then `importDatabase` deletes `auditEvents` and imports the backup's audit table. The audit event for the actual restore is gone. On a failed import that passes validation but fails during insertion, the pre-written audit event remains even though the response is `restoreFailed`. For ZIP restores, the event also says `0 files` because files are restored only after import.

Competing hypotheses considered:

- Recording before import might have been intended to preserve actor context before data replacement. However, because `auditEvents` itself is replaced by import, the event is not preserved on success.
- The pre-restore snapshot path is useful, but it does not make the audit timeline accurate.

Suggested fix:

Record an attempted restore event before import using an out-of-band log or pre-restore snapshot metadata, not the table about to be replaced. After successful import and file restore, write a new audit event into the restored database using a stable actor snapshot (or `actorId: null` with actor username/role in details if the original actor row no longer exists). On failure, record `database_restore_failed`, not `database_restored`.

### TR-4. Permanent user deletion API records success audit before the delete transaction commits

Status: confirmed  
Confidence: High  
Severity: Low

Evidence:

- `src/app/api/v1/users/[id]/route.ts:469-482` records `user.permanently_deleted` before the destructive transaction starts.
- `src/app/api/v1/users/[id]/route.ts:489-501` then scrubs recruiting invitation PII and deletes the user inside `execTransaction`.
- The server-action deletion path already documents the safer ordering: it builds context before deletion but records the event only after deletion succeeds (`src/lib/actions/user-management.ts:205-226`).

Causal failure scenario:

An admin permanently deletes a user whose deletion later fails because of a database error, FK edge case, lock timeout, or transaction abort while scrubbing recruiting invitations. The API has already written a `user.permanently_deleted` audit event. Operators later see an audit trail saying the user was deleted even though the account still exists.

Competing hypotheses considered:

- Recording before deletion preserves actor FK before cascade. The server-action path shows a better compromise: capture request context before deletion, then emit the audit after success.
- If the delete succeeds, the pre-delete event may survive because audit actor FK can set-null, but the ordering is still wrong on failure.

Suggested fix:

Mirror the server-action flow: capture audit context and target metadata before the transaction, run the scrub/delete transaction, then record `user.permanently_deleted` only after commit. Add a test that forces the transaction to throw and asserts no success audit event is emitted.

## No New Finding From Captured Trace

- Auth reset/change-password/public-signup: captured routes consistently validate origin or request body, apply rate limits, use shared password validation, hash server-side, and invalidate sessions on password reset/change (`reset-password/route.ts:20-41`, `email/index.ts:141-191`, `change-password.ts:41-83`, `public-signup.ts:83-214`). No additional causal bug was confirmed beyond the user-management audit ordering above.
- Judge claim/compiler execute: captured app-side claim code uses atomic claim SQL, claim-token fencing, cleanup on post-claim errors, function-problem assembly before worker dispatch, and local compiler sandbox validation (`judge/claim/route.ts:211-229`, `303-418`; `compiler/execute.ts:619-838`). Rust worker file reads blocked during final pass, so I did not report Rust-only issues.
- Docker admin image APIs, realtime coordination, plugin secret encryption, and deploy script: included in the inventory and searched, but no additional finding was confirmed from the captured code before the shared mount blocked further content reads.

## Final Missed-Issue Sweep

Sweep focus:

- Looked for routes where broad read access crosses into hidden data export.
- Compared per-problem export fields against import schema and persistence fields.
- Checked destructive restore ordering against full-table import semantics.
- Compared API user deletion audit ordering against the server-action deletion implementation.
- Reviewed app-side judge claim cleanup, function assembly, and compiler-runner fallback for claim-stranding failure modes.
- Checked auth/password reset/change-password/public-signup for token reuse, rate-limit, session invalidation, and cross-surface policy drift.

Residual risk:

- Working-tree content reads under `/Users/hletrd/flash-shared/judgekit` began blocking during the final pass. I cleaned the stuck read processes and avoided claiming findings in files whose contents I could not line-cite. The highest-risk confirmed issues above are all backed by captured line regions.

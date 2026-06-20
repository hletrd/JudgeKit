# Code Review - Cycle 2

Review target: `/Users/hletrd/flash-shared/judgekit` on `main` with the current dirty worktree.

This is a review-only pass. I did not implement fixes. The only file changed by this subagent is this report.

## Inventory And Scope

- Read governing instructions from `AGENTS.md`, `CLAUDE.md`, `.context/development/problem-descriptions.md`, `.context/development/documentation-rules.md`, and `.context/development/open-workstreams.md`.
- Inventoried the repo with `git status --short --branch`, `git diff --stat`, `rg --files`, and targeted `rg` sweeps. The worktree has many in-scope uncommitted changes from the prior cycle, including app/API routes, Rust worker code, deployment scripts, tests, reviews, package metadata, and new root `Cargo.toml` / `Cargo.lock`.
- Reviewed the changed and high-risk paths: submission create/claim/poll, verdict/status normalization, Rust Docker execution, compiler runner fallback, problem file-link syncing, restore/import/export, language command serialization, deployment hardening, seed/setup data, and status-related UI/test helpers.
- Skipped generated or bulk artifacts: `node_modules`, `.next`, coverage output, Rust `target/`, cache directories, generated migration snapshots except as schema context, and solution corpora.
- Did not run the full gate suite or start the app; this pass is static review plus cross-file tracing.

## Findings

### CR2-1 - HIGH - Manual submissions are now stuck as `pending`

Severity: High
Confidence: High
Status: Confirmed

Locations:
- `src/app/api/v1/submissions/route.ts:330-331`
- `src/app/api/v1/submissions/route.ts:351-377`
- `src/lib/judge/claim-query.ts:43-49`
- `src/lib/assignments/participant-status.ts:99-101`

Evidence:
- The submission route still computes `isManualProblem`, but `initialStatus` is unconditionally `"pending"`.
- The judge claim SQL explicitly excludes manual problems with `COALESCE(p.problem_type, 'auto') != 'manual'`.
- Assignment participant status treats active statuses such as `pending` as an in-progress state.
- Pending counts include all pending rows for the user before non-manual queue checks.

Concrete failure scenario:
- A student submits a manual problem. The row is inserted as `pending`.
- Workers never claim it because manual problems are excluded from the claim query.
- The assignment board shows the attempt as pending/in progress indefinitely. Enough manual attempts also inflate the user's pending count, so later auto submissions can hit `tooManyPendingSubmissions`.

Suggested fix:
- Restore a distinct non-judge status for manual submissions, such as `submitted`, and add it consistently to `SubmissionStatus`, `SUBMISSION_STATUSES`, filters, labels, and participant-status logic; or introduce a canonical `manual_pending`/`manual_submitted` status.
- Keep manual rows out of pending/queued/judging queue-count calculations.
- Add a regression test that submits a manual problem and verifies it is not claimable and does not count against automatic judge pending limits.

### CR2-2 - HIGH - ZIP restore still writes files before validating/importing the database

Severity: High
Confidence: High
Status: Confirmed

Locations:
- `src/app/api/v1/admin/restore/route.ts:81-89`
- `src/app/api/v1/admin/restore/route.ts:119-142`
- `src/app/api/v1/admin/restore/route.ts:158-165`
- `src/lib/db/export-with-files.ts:248-292`

Evidence:
- The route calls `restoreFilesFromZip(zipBuffer)` before `validateExport(data)`, before the sanitized-export rejection, before `takePreRestoreSnapshot`, and before `importDatabase`.
- `restoreFilesFromZip` parses `database.json`, then immediately `ensureUploadsDir()` and writes each `uploads/` entry via `writeUploadedFile`.
- If a later manifest check, schema validation, sanitized-export check, or DB import fails, the uploaded-file directory has already changed.

Concrete failure scenario:
- An admin uploads a ZIP whose upload hashes are valid but whose `database.json` is sanitized or no longer matches the runtime schema.
- The uploaded files are written first. The route then rejects the export or the DB import rolls back.
- The database remains unchanged, but `data/uploads` has been overwritten or partially updated. The pre-restore snapshot is taken after this filesystem mutation, so it does not provide a clean pre-restore file state.

Suggested fix:
- Split ZIP handling into parse/verify and commit phases.
- Validate `database.json`, sanitized status, manifest completeness, upload hashes, entry count, and decompressed size before touching `data/uploads`.
- Stage uploads in a temp directory and move them into place only after the DB import succeeds, or implement explicit filesystem rollback on import failure.

### CR2-3 - HIGH - Output-limit results can still force huge judge-report bodies before truncation

Severity: High
Confidence: High
Status: Confirmed

Locations:
- `judge-worker-rs/src/docker.rs:370-400`
- `judge-worker-rs/src/executor.rs:78-89`
- `judge-worker-rs/src/executor.rs:587-611`
- `src/app/api/v1/judge/poll/route.ts:34-40`
- `src/lib/validators/api.ts:27-44`
- `src/lib/judge/verdict.ts:16-27`
- `src/lib/judge/verdict.ts:94-100`

Evidence:
- The worker captures up to the stream cap, defaulting to 128 MiB per stdout/stderr stream, and marks truncation.
- `OutputLimitExceeded` is classified, but `reportable_test_case_output` returns the captured stdout for every non-runtime-error verdict. For output-limit stdout, that can be nearly 128 MiB for one test.
- The poll route calls `request.json()` before any custom size guard, and `judgeStatusReportSchema` has unbounded `actualOutput`, unbounded `compileOutput`, and unbounded `results`.
- The new 16 KiB truncation happens only while building DB rows or setting `compileOutput`, after the full JSON body has already been allocated and parsed.

Concrete failure scenario:
- A submission prints more than 128 MiB on the first IOI test case.
- The Rust worker correctly classifies OLE but serializes a huge `actualOutput` into the report body.
- The Next.js route allocates/parses the full body, then truncates for persistence. Under multiple workers or `runAllTestCases`, the app can still hit memory pressure even though the database write is capped.

Suggested fix:
- Cap worker-reported `actual_output` for OLE/WA/RE to the same small diagnostic limit used by the app, or report an explicit output-limit diagnostic instead of raw captured stdout.
- Add a request-body limit for `/api/v1/judge/poll` before `request.json()`.
- Add schema limits for `compileOutput`, `results.length`, and per-result `actualOutput`.

### CR2-4 - MEDIUM - File-link authorization validates after clearing the state it needs

Severity: Medium
Confidence: High
Status: Confirmed

Locations:
- `src/lib/problem-management.ts:242-276`
- `src/app/api/v1/problems/[id]/route.ts:93-101`
- `src/app/api/v1/problems/[id]/route.ts:132-175`

Evidence:
- `syncProblemFileLinks` first clears every file currently attached to the problem with `set({ problemId: null })`.
- In the same transaction it then selects the newly linked file rows and allows a file only when `row.uploadedBy === actorId` or `row.problemId === problemId`.
- Because the transaction sees its own earlier update, a file that was legitimately attached to the problem no longer has `row.problemId === problemId` by the time the authorization check runs.

Concrete failure scenario:
- Instructor A uploads a file and links it in a problem.
- Admin or co-instructor B, who passes `canManageProblem`, edits the problem without changing that Markdown link.
- The edit route passes B's user id into `updateProblemWithTestCases`. The file row has already been cleared inside `syncProblemFileLinks`, so it is neither uploaded by B nor currently attached to the problem. The update throws `fileLinkNotAllowed`.

Suggested fix:
- Fetch and authorize linked file rows before clearing existing associations, or preserve the previous `problemId` values in memory before the clearing update.
- Treat files already attached to the same problem as valid regardless of uploader.
- Add a unit/integration test for a manager editing a problem that references a file uploaded by another authorized editor.

### CR2-5 - MEDIUM - Local compiler fallback creates a workspace the sandbox user cannot traverse

Severity: Medium
Confidence: High
Status: Confirmed

Locations:
- `src/lib/compiler/execute.ts:360-370`
- `src/lib/compiler/execute.ts:704-722`
- `Dockerfile:62-104`

Evidence:
- Local fallback Docker containers run as `--user 65534:65534`.
- `executeCompilerRun` creates a temp workspace as the app process user and then chmods the directory to `0o770`.
- The source file is `0o644`, but the parent directory has no "other" execute bit. Unless the app process group is also gid 65534 and the host bind mount preserves that mapping, the container user cannot traverse `/workspace`.
- The production app image runs as `nextjs`/gid 1001, not 65534.

Concrete failure scenario:
- A deployment or local environment uses compiler-run local fallback because `COMPILER_RUNNER_URL` is not configured or the runner is unavailable with fallback enabled.
- `/api/v1/compiler/run` creates `/tmp/compiler-*` as the app user, mode 0770.
- The judge container starts as uid/gid 65534 and cannot read `/workspace/solution.py`, producing confusing compile/run failures for otherwise valid code.

Suggested fix:
- Mirror the Rust worker approach: chown the workspace to 65534:65534 and use restrictive permissions when possible, falling back to 0777 only when chown fails.
- If chown is not acceptable in the app container, use mode 0777 for the workspace as the prior sibling-container design requires, and keep file contents bounded.
- Add a local fallback smoke test that asserts a simple Python compiler run can read the generated source file.

### CR2-6 - MEDIUM - TypeScript and Rust runner command validators still have incompatible contracts

Severity: Medium
Confidence: High
Status: Confirmed

Locations:
- `src/lib/compiler/execute.ts:171-176`
- `src/lib/compiler/execute.ts:237-244`
- `judge-worker-rs/src/runner.rs:160-172`
- `src/lib/judge/languages.ts:1420-1426`

Evidence:
- The TypeScript validator rejects `$[A-Za-z0-9_]`, while the Rust runner rejects `$(` and `${` but allows simple `$PATH`, `$1`, `$HOME`, etc.
- TypeScript local fallback adds `validateShellCommandStrict`, which requires every `&&`/`;` segment to start with an allowlisted executable prefix.
- Several built-in language commands are intentionally shell snippets. Clean starts with `export ... PATH=...:$PATH && mkdir ... && cd ... && cp ...`.
- The comments in both validators say they are kept in lock-step, but the accepted command sets are not the same.

Concrete failure scenario:
- With `COMPILER_RUNNER_URL` configured, the Rust runner accepts the Clean compile command and executes it in the sidecar sandbox.
- In local fallback, the same command is rejected because `$PATH` matches the TypeScript denylist and the first segment begins with `export`, which is not an allowed command prefix.
- Operators get topology-dependent behavior for the same DB language config.

Suggested fix:
- Define one command contract and one golden test fixture shared by TypeScript and Rust tests.
- Either allow the shell constructs the built-in language table already requires, or rewrite those language commands to fit the strict validator.
- Remove or relax `validateShellCommandStrict` for admin-owned shell snippets if the Rust runner remains the production authority.

### CR2-7 - MEDIUM - Status migration is incomplete in filters and E2E terminal status sets

Severity: Medium
Confidence: High
Status: Confirmed

Locations:
- `src/app/(public)/submissions/page.tsx:39-43`
- `src/app/(dashboard)/dashboard/admin/submissions/page.tsx:44-55`
- `src/app/api/v1/admin/submissions/export/route.ts:8-18`
- `tests/e2e/support/helpers.ts:147-154`
- `tests/e2e/all-languages-judge.spec.ts:1058-1065`
- `tests/e2e/student-submission-flow.spec.ts:176-180`
- `judge-worker-rs/src/types.rs:44-50`

Evidence:
- The Rust worker now emits canonical `time_limit_exceeded`, `memory_limit_exceeded`, and `output_limit_exceeded`.
- Public/admin submission filters and CSV export allow `time_limit_exceeded` and `memory_limit_exceeded`, but still omit `output_limit_exceeded`.
- E2E polling helpers still treat only legacy `time_limit` and `memory_limit` as terminal and do not include the canonical forms or OLE.

Concrete failure scenario:
- A submission ends in `output_limit_exceeded`. Users cannot filter for it on the public submissions page, the admin submissions page, or admin CSV export.
- A Playwright test that deliberately produces a TLE/MLE/OLE can poll until timeout because the helper is waiting for `time_limit`/`memory_limit`, while the worker and API now use `time_limit_exceeded`/`memory_limit_exceeded`.

Suggested fix:
- Centralize canonical terminal verdict constants for app filters, export routes, and E2E helpers.
- Include `output_limit_exceeded` anywhere terminal statuses are offered as filters.
- Keep UI label mapping free to display short labels (`TLE`, `MLE`) while storing and filtering canonical database values.

### CR2-8 - LOW - Seed problem descriptions violate the repo's mandatory Markdown rule

Severity: Low
Confidence: High
Status: Confirmed

Locations:
- `.context/development/problem-descriptions.md:1-13`
- `scripts/seed.ts:27-43`
- `scripts/seed.ts:53-68`
- `scripts/seed.ts:79-93`

Evidence:
- The repository rule says all problem descriptions must be Markdown, not HTML, and explicitly includes seed scripts.
- The seed script creates sample problems using `<h3>`, `<p>`, `<strong>`, `<code>`, and `<pre>` HTML.

Concrete failure scenario:
- A fresh `scripts/setup.sh` or `npm run seed` environment starts with sample data that violates the project's own authoring contract.
- Markdown preview/editor behavior and any future Markdown-only validation can diverge from seeded data, leaving local development and onboarding examples as exceptions to the rule.

Suggested fix:
- Rewrite seed descriptions to the mandated Markdown template with `###`, fenced code blocks, constraints, and example explanations.
- Add a seed-data validation test or static check that rejects HTML tags in seeded problem descriptions.

## Final Missed-Issues Sweep

- Rechecked previous cycle high-signal areas. Assignment group-access syncing now passes the active transaction at all assignment call sites. Rust exact comparator now matches the documented boundary-trim behavior. Function expected-output computation now rejects disabled language configs.
- Restore remains partially unfixed: file writes still precede validation/import and decompressed ZIP entry sizes are still unbounded.
- Output-limit handling is improved at verdict classification and DB persistence, but not at the worker-report payload boundary.
- Manual-problem handling regressed in the current uncommitted diff: the old `isManualProblem ? "submitted" : "pending"` logic was replaced with unconditional `pending`.
- No files were intentionally skipped within the reviewed risk surface, but I did not perform an exhaustive line-by-line review of every UI component, every Dockerfile, or every historical migration snapshot.

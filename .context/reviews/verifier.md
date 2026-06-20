# Verifier Review

Verifier scope: evidence-based correctness check against repository documentation, tests, and current code, including uncommitted changes. No fixes were implemented.

## Review Inventory

I inventoried the repository with `rg --files`, inspected `git status --short`, `git diff --stat`, and reviewed the uncommitted change surface rather than only committed code.

Review-relevant files examined:

- Repository rules and documented behavior: `CLAUDE.md`, `AGENTS.md`, `.context/development/problem-descriptions.md`, `.context/reviews/*.md`
- Submission and status model: `src/types/index.ts`, `src/lib/submissions/status.ts`, `src/lib/judge/status-labels.ts`, `src/lib/judge/verdict.ts`, `src/lib/security/constants.ts`, `src/components/submission-status-badge.tsx`
- Judge claim/poll lifecycle: `src/app/api/v1/judge/claim/route.ts`, `src/app/api/v1/judge/poll/route.ts`, `src/lib/judge/claim-query.ts`, `judge-worker-rs/src/types.rs`, `judge-worker-rs/src/executor.rs`, `judge-worker-rs/src/docker.rs`, `judge-worker-rs/src/comparator.rs`
- Submission API and UI flows: `src/app/api/v1/submissions/route.ts`, `src/app/api/v1/submissions/[id]/route.ts`, `src/app/api/v1/admin/submissions/route.ts`, `src/components/submissions/_components/submission-result-panel.tsx`, `src/components/submissions/submission-detail-client.tsx`, `src/app/(public)/problems/page.tsx`, `src/app/(public)/contests/manage/[assignmentId]/students/[userId]/page.tsx`
- Import/restore flow: `src/lib/db/import.ts`, `src/app/api/v1/admin/database/import/route.ts`, `src/app/api/v1/admin/database/restore-upload/route.ts`, `tests/unit/cycle-23-remediation.test.ts`
- Admin languages and Docker image management: `src/app/dashboard/admin/languages/page.tsx`, `src/app/dashboard/admin/languages/_components/language-management-client.tsx`, `src/app/api/v1/admin/languages/[language]/route.ts`, `src/app/api/v1/admin/docker/images/build/route.ts`
- Environment/deploy changes: `.npmrc`, `package.json`, `scripts/load-env.ts`, `drizzle.config.ts`, `deploy-docker.sh`, root `Cargo.toml`, Rust crate `Cargo.toml` files
- Gate and behavior tests: `tests/unit/validators/api.test.ts`, `tests/unit/judge/status-labels.test.ts`, `tests/unit/cycle-23-remediation.test.ts`, `tests/component/submission-status-badge.test.tsx`, `tests/e2e/support/helpers.ts`, `tests/e2e/all-languages-judge.spec.ts`, `tests/e2e/student-submission-flow.spec.ts`, `tests/e2e/function-judging.spec.ts`, `tests/e2e/output-only-languages.spec.ts`, `tests/e2e/contest-full-lifecycle.spec.ts`

Verification commands run:

- `npx tsc --noEmit --pretty false` passed.
- `npm run test:unit -- tests/unit/validators/api.test.ts tests/unit/judge/status-labels.test.ts tests/unit/cycle-23-remediation.test.ts` passed, 45 tests.
- `npm run test:component -- tests/component/submission-status-badge.test.tsx` passed, 18 tests.
- `cargo test --quiet --manifest-path judge-worker-rs/Cargo.toml` passed, 65 tests.
- `npm view nodemailer@9.0.1 version` confirmed the package version exists.

## Findings

### V1. Manual submissions now remain `pending` forever

Severity: High
Confidence: High
Status: Confirmed issue

Evidence:

- `AGENTS.md:169-176` documents `manual` problems as judged outside the automatic pipeline.
- `src/app/api/v1/submissions/route.ts:330-331` computes `const isManualProblem = problem.problemType === "manual";` but now sets `const initialStatus = "pending";` unconditionally.
- `src/app/api/v1/submissions/route.ts:367` still says manual problems need no judging: `// Skip judge queue checks for manual problems (no judging needed)`.
- `src/lib/judge/claim-query.ts:46-49` explicitly excludes manual problems from worker claims with `COALESCE(p.problem_type, 'auto') != 'manual'`.

Failure scenario:

When a student submits a manual problem, the row is inserted as `pending`. The judge worker cannot claim it because the claim query excludes manual problems, and the submission route skips queue availability checks because manual submissions are not meant to be judged automatically. The status therefore stays in an active/processing state indefinitely instead of representing a manual-grade-ready submission.

Suggested fix:

Restore a non-queued initial status for manual problems, such as the previous `submitted` status, or introduce a first-class manual-awaiting-grade status across `SubmissionStatus`, labels, filters, terminal-state logic, and UI. Keep manual submissions excluded from judge claims, but ensure UI and metrics do not present them as still processing.

### V2. New worker status names are not fully wired through translations and E2E waiters

Severity: High
Confidence: High
Status: Confirmed issue

Evidence:

- `judge-worker-rs/src/types.rs:44-50` now serializes final statuses as `time_limit_exceeded`, `memory_limit_exceeded`, and `output_limit_exceeded`.
- `src/types/index.ts:19-25` and `src/lib/security/constants.ts:49-61` define the canonical TypeScript status set using those new names.
- `messages/en.json:731-745` and `messages/ko.json:731-745` still define `status.time_limit` and `status.memory_limit`, but not `status.time_limit_exceeded` or `status.memory_limit_exceeded`.
- Several callers still construct translation keys directly from raw status values:
  - `src/components/submissions/_components/submission-result-panel.tsx:81-83`
  - `src/components/submissions/submission-detail-client.tsx:237-240`
  - `src/app/(public)/problems/page.tsx:513`
  - `src/app/(public)/contests/manage/[assignmentId]/students/[userId]/page.tsx:230`
- E2E terminal-state waiters still recognize the old names:
  - `tests/e2e/support/helpers.ts:147-154`
  - `tests/e2e/all-languages-judge.spec.ts:1058-1065`
  - `tests/e2e/student-submission-flow.spec.ts:178`
  - `tests/e2e/function-judging.spec.ts:138-139`
  - `tests/e2e/output-only-languages.spec.ts:79-80`
  - `tests/e2e/contest-full-lifecycle.spec.ts:304`, `:321`, `:374`, `:387`, `:398`

Failure scenario:

A submission that finishes as TLE or MLE under the new worker reaches the app as `time_limit_exceeded` or `memory_limit_exceeded`. UI paths that call `t(\`status.${status}\`)` lack matching message keys, producing missing-message output or runtime i18n errors depending on configuration. Playwright helpers that wait for terminal status strings can also time out because they still check `time_limit` and `memory_limit`.

Suggested fix:

Route all status display through the centralized status label normalizer or add the canonical `status.time_limit_exceeded` and `status.memory_limit_exceeded` message keys in every locale that uses status labels. Update E2E helper terminal sets and assertions to use canonical names, while optionally accepting legacy names only for migration compatibility.

### V3. Poll route rejects legacy worker statuses during app/worker version skew

Severity: High
Confidence: Medium
Status: Likely issue

Evidence:

- `src/lib/security/constants.ts:49-61` accepts only the new canonical names and omits legacy `time_limit` and `memory_limit`.
- `src/app/api/v1/judge/poll/route.ts:48-54` validates both top-level `status` and nested `testResults[].status` using `isSubmissionStatus`, returning `400 invalidSubmissionStatus` for unknown values.
- The current uncommitted Rust worker now returns new names in `judge-worker-rs/src/types.rs:44-50`, implying older deployed workers from the previous schema emitted different names.
- `CLAUDE.md` documents deployment topologies where the app server can be deployed without worker images, including `BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false` for the app-server target.

Failure scenario:

If the Next.js app is deployed before all judge workers are updated, an older worker can report `time_limit` or `memory_limit` to `/api/v1/judge/poll`. The new app rejects the poll payload with `400 invalidSubmissionStatus`, so the submission never finalizes from the app perspective. This is especially plausible in the documented split app/worker deployment topology.

Suggested fix:

Accept legacy status spellings at API boundaries for a transitional period and normalize them before database writes and UI rendering. Add tests for poll payload normalization from both old and new worker versions. If compatibility is intentionally not supported, document and enforce a worker-first deployment gate rather than letting poll fail at runtime.

### V4. Output-limit floods can be classified as timeout instead of output-limit-exceeded

Severity: Medium
Confidence: Medium
Status: Likely issue

Evidence:

- `judge-worker-rs/src/docker.rs:370-383` detects stdout truncation only inside the stdout read task, then drains the rest of stdout to EOF.
- `judge-worker-rs/src/docker.rs:387-400` does the same for stderr.
- `judge-worker-rs/src/docker.rs:406-434` waits for stdin, process completion, and read tasks under the execution timeout.
- `judge-worker-rs/src/docker.rs:455-470` handles timeout by killing/removing the container and returns empty output with `stdout_truncated: false` and `stderr_truncated: false`.
- `judge-worker-rs/src/executor.rs:138-139` classifies `OutputLimitExceeded` only when the execution result reports `output_limit_exceeded`.
- `judge-worker-rs/src/executor.rs:594` derives `output_limit_exceeded` from the truncation flags.

Failure scenario:

A solution that prints indefinitely exceeds `max_output_bytes` quickly. The read task notices the cap but then drains the stream until EOF, while the main wait path keeps waiting for the process to exit or for the time limit. If the process only stops because the time limit expires, the timeout branch discards the truncation state and returns no truncated flag. The submission can be reported as TLE/runtime failure instead of OLE, and the worker spends the full time limit on an output flood.

Suggested fix:

Propagate output-cap detection to the main execution path with an atomic flag or cancellation channel, kill the container when the cap is hit, and preserve the truncation reason in the returned `DockerRunResult`. Classify an output-cap-triggered kill as `output_limit_exceeded` before ordinary timeout handling.

### V5. Import drift test is source-grep based and no longer proves the documented behavior implied by its name

Severity: Low
Confidence: Medium
Status: Confirmed test gap

Evidence:

- `src/lib/db/import.ts:175-180` now throws an error on import column mismatch.
- `src/lib/db/import.ts:219-224` catches the failure, clears `tableResults`, and returns a failed all-or-nothing import result.
- `tests/unit/cycle-23-remediation.test.ts:78-80` still names the behavior as skipping mismatched tables, but only asserts that the source contains `"column mismatch"`.

Failure scenario:

A future regression could change the actual import transaction semantics, rollback handling, or returned error details while preserving the string `"column mismatch"` in source. The test would still pass without proving that corrupted or partial imports are prevented.

Suggested fix:

Replace the source-grep assertion with a behavioral test that feeds a backup containing a mismatched table shape into `importDatabase`, asserts `success: false`, verifies no partial table results are reported after rollback, and checks that the returned error details identify the mismatched table and columns. Rename the test to match the current all-or-nothing policy if that policy is intended.

## Final Missed-Issues Sweep

I did an additional sweep for commonly missed correctness gaps after the main review:

- Searched for legacy and canonical status names across source and tests; the incomplete migration is captured in V2 and V3.
- Rechecked documented manual-problem behavior against submission creation and judge claim filtering; the lifecycle mismatch is captured in V1.
- Reviewed import/restore route changes against the transaction behavior in `src/lib/db/import.ts`; the all-or-nothing route behavior appears internally consistent, with the remaining gap captured as V5.
- Reviewed environment/deploy config changes (`scripts/load-env.ts`, `drizzle.config.ts`, `.npmrc`, root Cargo workspace profile changes) and did not find a verified correctness issue from those changes.
- Ran focused type, unit, component, and Rust worker tests listed above. These passing tests do not cover V1, V2 raw translation callers, V3 rolling-version compatibility, V4 infinite-output behavior, or V5 behavioral import semantics.

# Cycle 2 Critic Review

Scope: whole-repository critique from product correctness, operator safety, security, test-gate, UX consistency, and maintainability perspectives. I reviewed the current dirty worktree and did not implement fixes.

## Inventory And Review Path

Instructions read:
- `AGENTS.md`
- `CLAUDE.md`
- `.context/development/problem-descriptions.md`

Repository inventory built with `rg --files`, `git status --short`, `git diff --stat`, and targeted scans:
- `src/`: 632 files, including 113 App Router API route files and 105 component files.
- Rust services: `judge-worker-rs/src` (10 files), plus `code-similarity-rs` and `rate-limiter-rs` manifests.
- Tests: 508 files across unit, component, integration, harness, and Playwright E2E suites.
- Runtime/deploy: 106 Docker files under `docker/`, production/test compose files, deploy scripts, backup/safety scripts, and root Rust workspace files.
- Documentation/context: `AGENTS.md`, `CLAUDE.md`, `docs/**`, `.context/**` with deeper inspection of mandatory problem-description rules and prior review artifacts.

Uncommitted change surface examined:
- Judge status vocabulary and output-limit changes in `judge-worker-rs/src/{types,executor,docker,comparator}.rs`, `src/app/api/v1/judge/{claim,poll}/route.ts`, `src/lib/judge/{verdict,status-labels}.ts`, `src/lib/security/constants.ts`, and submission UI/pages.
- Manual/function submission flow in `src/app/api/v1/submissions/route.ts` and claim SQL.
- Compiler/playground runner path in `src/lib/compiler/execute.ts`, `src/app/api/v1/{compiler,playground}/run/route.ts`, `judge-worker-rs/src/runner.rs`.
- Deployment/env/test-gate changes in `deploy-docker.sh`, `drizzle.config.ts`, `playwright.config.ts`, `.npmrc`, root `Cargo.toml`, `Cargo.lock`, and ignore/deploy excludes.
- Admin import/restore/export and auth email link changes.
- Secret-bearing scripts and seed data.

## Findings

### 1. Manual submissions now get stuck in `pending` forever

Severity: High
Confidence: High
Status: Confirmed

Locations:
- `AGENTS.md:175` says `manual` problems are judged outside the automatic pipeline.
- `src/app/api/v1/submissions/route.ts:330-331` now sets every submission, including manual problems, to `initialStatus = "pending"`.
- `src/lib/judge/claim-query.ts:46-50` and `src/lib/judge/claim-query.ts:140-144` explicitly exclude manual problems from judge claiming with `COALESCE(p.problem_type, 'auto') != 'manual'`.
- `src/lib/judge/verdict.ts:3` and `src/lib/submissions/status.ts:3` treat `pending` as an in-progress status.

Concrete failure scenario:
A student submits a manual problem. The row is inserted as `pending`, but no worker can claim it because the claim query filters manual problems out. The submission remains in queue/in-progress UI forever, can inflate pending counts, and never reaches a manual-review terminal state.

Suggested fix:
Restore a non-worker status for manual submissions, such as canonical `submitted` or `pending_manual`, and add it consistently to the `SubmissionStatus` union, API validation, filters, labels, and queue metrics. Do not use an auto-judge in-progress status for work that claim SQL intentionally excludes.

### 2. The status migration is still half-applied across E2E waits and filters

Severity: Medium
Confidence: High
Status: Confirmed

Locations:
- `judge-worker-rs/src/types.rs:47-49` now emits `time_limit_exceeded`, `memory_limit_exceeded`, and `output_limit_exceeded`.
- `src/lib/security/constants.ts:49-62` accepts the new canonical statuses.
- `tests/e2e/all-languages-judge.spec.ts:1058-1065`, `tests/e2e/function-judging.spec.ts:135-142`, and `tests/e2e/support/helpers.ts:147-154` still wait for legacy `time_limit` and `memory_limit`, not the new statuses or `output_limit_exceeded`.
- `tests/e2e/student-submission-flow.spec.ts:176-180` and `tests/e2e/contest-full-lifecycle.spec.ts:301-398` still assert legacy `time_limit`.
- `src/app/(public)/submissions/page.tsx:39-43`, `src/app/(dashboard)/dashboard/admin/submissions/page.tsx:44-55`, and `src/app/api/v1/admin/submissions/export/route.ts:8-18` omit `output_limit_exceeded`, `internal_error`, and `cancelled` from filterable statuses.

Concrete failure scenario:
A TLE/MLE/OLE submission finalizes correctly in production, but Playwright helpers keep polling until timeout because their terminal-status sets do not include the canonical names. Separately, admins cannot filter/export OLE or internal-error submissions even though the API can now persist them.

Suggested fix:
Centralize terminal/filterable status lists in one shared module or generated fixture, update all E2E helpers/assertions to the canonical vocabulary, and include every canonical terminal/admin-relevant status in public/admin filter/export surfaces.

### 3. Claim cleanup does not cover schema-parse failures after a row was already claimed

Severity: Medium
Confidence: Medium
Status: Likely

Locations:
- `src/lib/judge/claim-query.ts:54-78` performs the `UPDATE submissions SET status = 'queued', judge_claim_token = ...` and returns the claimed row.
- `src/lib/judge/claim-query.ts:111-128` increments the worker's `active_tasks` for worker claims.
- `src/app/api/v1/judge/claim/route.ts:230-238` parses `claimedRaw`, but assigns `claimedForCleanup = claimed` only after parsing succeeds.
- `src/app/api/v1/judge/claim/route.ts:403-415` cleanup runs only when `claimedForCleanup` was populated.

Concrete failure scenario:
If the raw claim returns an unexpected shape after the DB update already happened, for example due to schema drift, driver type changes, or a malformed timestamp/numeric value, `claimedSubmissionRowSchema.parse()` throws. The route returns `invalidJudgeClaim` at line 237 without clearing `judge_claim_token`, resetting `status`, or decrementing `active_tasks`. The submission is stuck until stale-claim recovery, and the worker slot can remain consumed during that window.

Suggested fix:
Populate cleanup state from minimally validated raw fields immediately after `claimedRaw` is non-null, or run claim plus response validation in a transaction that can roll back on parse failure. Add a unit test where `rawQueryOne` returns a claimed row with one invalid field and assert the claim is released.

### 4. Root Rust workspace creates unignored build artifacts that deploy rsync will upload

Severity: Medium
Confidence: High
Status: Confirmed

Locations:
- `Cargo.toml:1-7` adds a root workspace for the Rust crates.
- `.gitignore:68-70` ignores only `judge-worker-rs/target/` and `rate-limiter-rs/target/`; it does not ignore root `/target/`, `code-similarity-rs/target/`, or `._target`.
- `.dockerignore:15-20` ignores subcrate targets but not root `/target/`.
- `deploy-docker.sh:647-668` excludes subcrate targets from rsync but not root `target/`.
- Current `git status --short` shows untracked `target/` and `._target`.

Concrete failure scenario:
Running `cargo test` from the root workspace creates a large root `target/` directory. Because neither git nor deploy rsync excludes it, a later deploy can sync hundreds of megabytes or gigabytes of build artifacts to production, slowing deploys and consuming disk on hosts that already have tight disk budgets.

Suggested fix:
Ignore `/target/`, `/._target`, and `code-similarity-rs/target/` in `.gitignore`; add root `target/` to `.dockerignore` and `deploy-docker.sh` rsync excludes. Consider setting `CARGO_TARGET_DIR` to an ignored path in gate scripts.

### 5. Production-capable API keys are hardcoded in repository scripts

Severity: High
Confidence: High
Status: Confirmed

Locations:
- `scripts/verify-naive-tle.mjs:14-15` hardcodes `https://algo.xylolabs.com` and `jk_d74b...`.
- `scripts/enhance-svgs.mjs:4-5`, `scripts/naturalize-problems.mjs:4-5`, `scripts/add-svgs.mjs:4-5`, `scripts/tle-verify.mjs:4-5`, and `scripts/restore-svgs.mjs:4-5` hardcode the same key or variable.
- `scripts/verify-naive-tle.mjs:354-360` uses that key as a Bearer token to submit to production.
- `scripts/enhance-svgs.mjs:22-29` uses that key to PATCH production problems.

Concrete failure scenario:
Any clone of the repository or log bundle containing these scripts gives the reader a reusable production API token. Depending on that token's capabilities, an attacker or accidental script run can submit code, patch problem content, or mutate production data.

Suggested fix:
Immediately revoke/rotate the leaked key, remove hardcoded keys from all scripts, require an environment variable, and add secret scanning for `jk_` tokens. If these scripts are still needed, fail fast unless `JUDGEKIT_API_KEY` and an explicit `JUDGEKIT_API_BASE` are provided.

### 6. Interactive compiler/playground still uses a 256 MB compile cap while judged submissions get 2 GB

Severity: Medium
Confidence: High
Status: Confirmed

Locations:
- `src/lib/compiler/execute.ts:15` sets the local compiler path memory cap to 256 MB.
- `src/lib/compiler/execute.ts:351-353` applies that same cap to compile and run containers.
- `judge-worker-rs/src/runner.rs:19` sets the Rust runner cap to 256 MB.
- `judge-worker-rs/src/runner.rs:805-815` applies the 256 MB cap to compile phase.
- `judge-worker-rs/src/executor.rs:13` and `judge-worker-rs/src/executor.rs:420` give judged submission compilation a 2048 MB default.

Concrete failure scenario:
A Java, Rust, TypeScript, C#, or .NET solution compiles successfully as an actual submission but fails in the playground or `/api/v1/compiler/run` due to the lower compile memory ceiling. Students see a false compile failure while the judge would accept the same code.

Suggested fix:
Separate compile and run memory limits for interactive runner paths. Default compile memory to the judged compile budget or a language-configured compile cap, while keeping runtime memory bounded separately. Add a regression case for a compiled language that exceeds 256 MB during compile.

### 7. Exact-output comparison now allocates full normalized buffers in the worker

Severity: Medium
Confidence: Medium
Status: Risk

Locations:
- `judge-worker-rs/src/comparator.rs:67-96` normalizes expected and actual outputs into new `Vec<u8>` buffers before comparing.
- `judge-worker-rs/src/docker.rs:352-362` allows each captured stream to reach 128 MiB by default.
- `judge-worker-rs/src/executor.rs:579-585` compares expected output against captured stdout for every test case in the worker process.

Concrete failure scenario:
A legitimate large-output problem or an adversarial output flood near the 128 MiB cap forces the worker to hold the original expected string, captured stdout, and two normalized copies at once. With concurrent jobs, this can push the worker process into high memory pressure even though the student container itself is memory-limited.

Suggested fix:
Return to a streaming/allocation-light comparator that still matches the documented JavaScript normalization, or cap exact-comparison normalization memory separately. Add a large-output benchmark/regression test that measures worker-side allocation under the configured `JUDGE_MAX_OUTPUT_BYTES`.

### 8. Seeded problem descriptions still violate the mandatory Markdown policy

Severity: Low
Confidence: High
Status: Confirmed

Locations:
- `.context/development/problem-descriptions.md:1-20` says all problem descriptions, including seed scripts, must be Markdown and must not use HTML tags.
- `scripts/seed.ts:30-43` seeds A+B with `<h3>`, `<p>`, `<strong>`, `<code>`, and `<pre>`.
- `scripts/seed.ts:55-68` repeats the same HTML format for A-B.

Concrete failure scenario:
Fresh installs seeded by `npm run seed` start with examples that violate the project's own authoring spec. This weakens tests and admin examples because new operators see HTML descriptions as acceptable even though the policy says Markdown is mandatory.

Suggested fix:
Rewrite seed descriptions in the required Markdown template with fenced input/output examples and constraints. Add a seed/unit check that rejects `<h3>`, `<p>`, and `<pre>` in seeded problem descriptions.

## Missed-Issues Sweep

Final sweep performed:
- Rechecked manual submission lifecycle against claim SQL and the AGENTS problem-type contract.
- Rechecked canonical judge statuses across Rust worker, API validation, labels, public/admin filters, export route, and Playwright wait helpers.
- Rechecked claim cleanup paths for errors after DB mutation and before response serialization.
- Rechecked root Rust workspace side effects against git ignores, Docker ignores, and deploy rsync excludes.
- Rechecked compiler/playground request flow through TypeScript and Rust runner paths after the new `language` field was added.
- Rechecked high-risk admin import/restore/export edits; the pre-restore snapshot and stricter import failure handling look directionally correct from static inspection.
- Rechecked auth email base-url changes; `getPublicBaseUrl` correctly prefers configured `AUTH_URL`, so I did not file host-header link poisoning there.
- Ran a targeted secret scan for `jk_` tokens and found multiple hardcoded production-looking keys in scripts.

Residual risk:
This was a static critic pass. I did not run the full gate list, browser flows, or production deploy command. The highest-value follow-up checks are: manual-problem submission E2E, status-vocabulary Playwright helpers, root workspace deploy artifact exclusion, and a secret-rotation audit for the hardcoded `jk_` token.

# Tracer Review - Cycle 2

Date: 2026-06-20
Scope: causal tracing across app routes, database import/export, judge claim/reporting, judge worker execution, deployment topology, scripts, and tests. This pass reviewed the current worktree, including uncommitted changes, and did not revert or implement fixes.

## Instructions Read

- `AGENTS.md`: project architecture, supported languages source of truth, function judging runtime model, admin Docker API, CSRF header rule, PostgreSQL/Drizzle notes, deployment and backup hardening.
- `CLAUDE.md`: production deployment constraints, secret handling, app-server-only deploy rules for `algo.xylolabs.com`, Docker pruning safety rules.
- `.context/development/problem-descriptions.md`: mandatory Markdown structure for all problem descriptions.
- `.context/development/conventions.md`: repository conventions relevant to review output.

## Inventory

Reviewed areas and representative files:

- Submission intake and lifecycle: `src/app/api/v1/submissions/route.ts`, `src/app/api/v1/submissions/[id]/rejudge/route.ts`, `src/lib/submissions/status.ts`, `src/lib/submissions/visibility.ts`, `src/components/submission-status-badge.tsx`.
- Judge claim and result reporting: `src/app/api/v1/judge/claim/route.ts`, `src/app/api/v1/judge/poll/route.ts`, `src/lib/judge/claim-query.ts`, `src/lib/judge/verdict.ts`, `src/lib/validators/api.ts`.
- Rust judge worker: `judge-worker-rs/src/api.rs`, `judge-worker-rs/src/docker.rs`, `judge-worker-rs/src/executor.rs`, `judge-worker-rs/src/types.rs`, `judge-worker-rs/src/comparator.rs`.
- Function judging: `src/lib/judge/function-judging/types.ts`, `src/lib/judge/function-judging/registry.ts`, `src/lib/judge/function-judging/assemble.ts`, `src/lib/judge/function-judging/adapters/*`, `src/components/problem/problem-submission-form.tsx`, `src/app/api/v1/problems/[id]/compute-expected/route.ts`.
- Problem management and validation: `src/app/api/v1/problems/route.ts`, `src/lib/validators/problem-management.ts`, `src/lib/problem-management.ts`.
- Database restore/import/export: `src/app/api/v1/admin/restore/route.ts`, `src/app/api/v1/admin/migrate/import/route.ts`, `src/lib/db/export-with-files.ts`, `src/lib/db/import.ts`, `src/lib/files/storage.ts`.
- Deployment and worker topology: `deploy-docker.sh`, `docker-compose.production.yml`, `docker-compose.worker.yml`, `.dockerignore`, `.gitignore`.
- Scripts and secrets: `scripts/*.mjs`, ignored root one-off scripts, `.context/solutions/*`, `.env` presence, `scripts/algo-problems/*`.
- Tests touched by the current surface: `tests/unit/api/judge-status-report.route.test.ts`, `tests/unit/actions/language-configs.test.ts`, `tests/component/function-submit-stub.test.tsx`, function-judging unit tests.

Generated artifacts under root `target/` and nested Rust `target/` directories were observed during inventory; those are called out below because they materially affected repository traversal.

## Findings

### T1 - Manual problem submissions are inserted as active `pending` rows that no judge will ever claim

Severity: High
Confidence: High
Status: Confirmed

Evidence:
- Submission creation detects manual problems but still assigns `initialStatus = "pending"`: `src/app/api/v1/submissions/route.ts:328-332`.
- Manual submissions skip queue cap checks because the route knows no judging is needed: `src/app/api/v1/submissions/route.ts:367-382`.
- The insert persists that `pending` status unconditionally: `src/app/api/v1/submissions/route.ts:405-416`.
- The claim query explicitly excludes manual problems in both worker and no-worker modes: `src/lib/judge/claim-query.ts:44-50`, `src/lib/judge/claim-query.ts:139-144`.
- `pending` is an active status, while terminal statuses do not include any manual-grading status: `src/lib/submissions/status.ts:1-20`.
- The UI helper even has a branch for a non-union `"submitted"` value, but the type excludes it and the insert never uses it: `src/lib/submissions/status.ts:1`, `src/lib/submissions/status.ts:38-39`.

Failure scenario:
1. A student submits a manual problem.
2. The API accepts it, writes `status = 'pending'`, and intentionally skips judge queue checks.
3. Judge workers never claim it because manual problems are filtered out at claim time.
4. The row remains active forever. Pending counts, submission lists, contest/assignment progress, and any manual grading workflow see an in-flight submission instead of a ready-to-grade terminal or manual state.

Suggested fix:
- Add a real status for manual submissions, such as `submitted` or `awaiting_manual_grade`, and thread it through the TypeScript status union, status labels, active/terminal sets, filters, scoring code, and UI badges.
- Insert that status for `problemType === "manual"` instead of `pending`.
- Add an API/unit test that a manual submission is accepted but not active/claimable, plus a UI/status regression test for the new label.

### T2 - ZIP restore writes uploaded files before export validation, DB snapshot, and DB import success

Severity: High
Confidence: High
Status: Confirmed

Evidence:
- For ZIP uploads, the restore route calls `restoreFilesFromZip(zipBuffer)` before `validateExport(data)`: `src/app/api/v1/admin/restore/route.ts:81-89`, `src/app/api/v1/admin/restore/route.ts:119-131`.
- The pre-restore DB snapshot is taken only after uploaded files have already been written: `src/app/api/v1/admin/restore/route.ts:133-142`.
- The destructive DB import is also after the file writes: `src/app/api/v1/admin/restore/route.ts:158-166`.
- `restoreFilesFromZip` parses `database.json`, then immediately extracts uploads to disk: `src/lib/db/export-with-files.ts:248-256`.
- Each upload entry is written directly through `writeUploadedFile`: `src/lib/db/export-with-files.ts:266-292`.
- `writeUploadedFile` overwrites the resolved upload path with no staging or rollback: `src/lib/files/storage.ts:27-30`.
- A later missing-upload manifest check can still fail after earlier files have already been written: `src/lib/db/export-with-files.ts:295-297`.
- The DB import itself is now transactional and rolls back on schema drift or insert failures: `src/lib/db/import.ts:121-180`, `src/lib/db/import.ts:214-224`; uploaded files are outside that transaction.

Failure scenario:
1. An admin uploads a ZIP whose `database.json` is syntactically valid but fails `validateExport`, targets the wrong environment, or later fails DB import.
2. `restoreFilesFromZip` has already overwritten files in `data/uploads`.
3. The route returns an error or the DB transaction rolls back, but uploaded files remain partially restored.
4. Existing problems can now point at stale or wrong file bytes, and the DB snapshot cannot recover the file system state because it was taken after file writes.

Suggested fix:
- Split ZIP handling into parse/manifest validation and file application phases.
- Validate `database.json` and take the pre-restore snapshot before any upload write.
- Stage uploads into a temporary directory keyed by restore id, verify the full manifest there, run/import the DB, then atomically promote files or restore previous bytes on failure.
- Add integration tests for invalid export, DB import failure, and late manifest mismatch that assert existing uploads are unchanged.

### T3 - Output-limit submissions can exceed the nginx report limit before the app can truncate diagnostics

Severity: High
Confidence: High
Status: Confirmed for dedicated-worker topology; likely for any proxy-fronted worker path

Evidence:
- The worker captures up to 128 MiB per stream by default: `judge-worker-rs/src/docker.rs:352-362`.
- It stores a full capped stdout buffer and a full capped stderr string before classifying truncation: `judge-worker-rs/src/docker.rs:370-401`.
- Output-limit classification uses those truncation flags: `judge-worker-rs/src/executor.rs:587-597`.
- The per-test `actual_output` is derived from the captured stdout/stderr and pushed into the final result: `judge-worker-rs/src/executor.rs:599-619`.
- Final results are posted as one JSON body to the app: `judge-worker-rs/src/api.rs:216-239`.
- The app route parses the whole JSON body before validation/truncation: `src/app/api/v1/judge/poll/route.ts:36-40`.
- The schema does not bound `actualOutput` or `compileOutput`: `src/lib/validators/api.ts:27-45`.
- Storage truncation to 16 KiB happens only after request parsing and validation: `src/lib/judge/verdict.ts:16-28`, `src/lib/judge/verdict.ts:86-100`.
- The generated nginx config allows only 50 MiB for `/api/v1/judge/poll`: `deploy-docker.sh:1265-1271`, `deploy-docker.sh:1337-1343`.
- Co-located production workers use internal `http://app:3000/api/v1` and bypass nginx: `docker-compose.production.yml:133-140`.
- Dedicated workers use externally configured `JUDGE_BASE_URL`, which commonly points at the app server API URL through nginx: `docker-compose.worker.yml:45-56`.

Failure scenario:
1. A malicious or accidental submission prints more than 50 MiB and less than or equal to the worker's 128 MiB per-stream cap.
2. The worker correctly classifies `output_limit_exceeded`, but includes the large captured output in the final JSON report.
3. A dedicated worker posting through nginx receives `413 Request Entity Too Large`, or the app spends memory parsing a huge body before truncating.
4. The final verdict is not persisted; the worker dead-letters/retries the report while the submission remains in an in-flight state until stale reclaim repeats the same failure.

Suggested fix:
- For `output_limit_exceeded`, report only a small diagnostic string, not the captured output body.
- Align `JUDGE_MAX_OUTPUT_BYTES`, worker report payload limits, app schema limits, and nginx body limits.
- Add zod `.max(...)` limits for `compileOutput` and `actualOutput`, but also reduce the worker payload before transport so proxies are protected.
- Add a worker/app integration test that floods stdout past the configured output cap and still records a final `output_limit_exceeded` verdict.

### T4 - Production API keys are hardcoded across scripts and ignored workspace files

Severity: High
Confidence: High
Status: Confirmed

Evidence:
- `scripts/tle-verify.mjs` hardcodes `https://algo.xylolabs.com` and a `jk_...` bearer key: `scripts/tle-verify.mjs:4-9`.
- `scripts/add-svgs.mjs` hardcodes the same production key and uses it for GET/PATCH requests: `scripts/add-svgs.mjs:4-22`.
- `scripts/algo-problems/runner-boj.mjs`, although ignored by `.gitignore`, exists in the workspace and hardcodes the same production key for problem creation: `scripts/algo-problems/runner-boj.mjs:9-44`.
- A no-ignore scan found the same key in many root one-off scripts and `.context`/`.omc` files, plus another `jk_...` key under `.context/solutions/*`.
- The repository intentionally ignores many of these scratch paths rather than deleting or sanitizing them: `.gitignore:32-33`, `.gitignore:41-44`, `.gitignore:82-100`.

Failure scenario:
1. The workspace, an ignored archive, a review artifact, or an accidental `git add -f` leaks.
2. Anyone with the exposed bearer key can run the included scripts against production endpoints until the key is revoked.
3. Because these scripts include problem PATCH/create/submit flows, compromise can mutate production content or generate submissions under the key's privileges.

Suggested fix:
- Immediately revoke and rotate every exposed `jk_` key, including the secondary key in `.context/solutions/*`.
- Replace hardcoded keys with required environment variables and fail closed when absent.
- Remove real keys from ignored scratch scripts and historical local artifacts where possible.
- Add a secret scan gate that runs with `--no-ignore` but excludes generated dependency/build directories.

### T5 - Function problems can be saved with no supported enabled language, then the student UI offers impossible submissions

Severity: Medium
Confidence: High
Status: Confirmed

Evidence:
- The function spec schema validates only that `enabledLanguages` is a non-empty string array: `src/lib/judge/function-judging/types.ts:47-56`.
- The problem mutation schema imports `supportsFunctionJudging`, but only uses it for `referenceSolution.language`: `src/lib/validators/problem-management.ts:1-24`, `src/lib/validators/problem-management.ts:45-67`, `src/lib/validators/problem-management.ts:74-96`.
- The student submission UI intersects enabled languages with `FUNCTION_JUDGING_LANGUAGES`, then falls back to all languages if the intersection is empty: `src/components/problem/problem-submission-form.tsx:75-89`.
- The submission API rejects function submissions whose language is not both enabled and harness-supported: `src/app/api/v1/submissions/route.ts:254-270`.

Failure scenario:
1. An admin, importer, or direct API client saves a function problem with `enabledLanguages: ["brainfuck"]` or another unsupported language.
2. The save succeeds because `enabledLanguages` is not refined against the function-judging registry.
3. The student page sees an empty supported intersection and falls back to the full language list.
4. Every displayed choice fails at submit time with `languageNotEnabledForProblem`; from the student's perspective the problem is available but unsolvable.

Suggested fix:
- Refine `functionSpec.enabledLanguages` so every value satisfies `supportsFunctionJudging`, and require the supported intersection to be non-empty.
- Remove the full-list fallback; show a clear unavailable/misconfigured state instead.
- Add validator tests for unsupported enabled languages and a component test for the empty-intersection UI path.

### T6 - Mandatory problem description structure is documented but not enforced at create/update time

Severity: Medium
Confidence: High
Status: Confirmed

Evidence:
- Repository rules require Markdown, no HTML, statement, input format, output format, constraints, and examples for every problem created through admin UI, API, or seed scripts: `.context/development/problem-descriptions.md:1-14`, `.context/development/problem-descriptions.md:50-55`.
- The create schema accepts an omitted or empty description and only checks length: `src/lib/validators/problem-management.ts:45-48`, `src/lib/validators/problem-management.ts:74-77`.
- The POST route defaults missing descriptions to an empty string before persistence: `src/app/api/v1/problems/route.ts:150-176`.
- Create/update sanitize Markdown but do not enforce required sections, examples, or no-HTML structure: `src/lib/problem-management.ts:281-324`, `src/lib/problem-management.ts:331-365`.

Failure scenario:
1. A problem is created through API/import/seed/admin UI with `description: ""` or HTML-only text.
2. The server accepts and persists it.
3. Students can see a problem without input/output contracts or examples, despite the mandatory project rule.

Suggested fix:
- Add a server-side description validator shared by create, update, import/seed paths, and any admin UI validation.
- Enforce no raw HTML and required Markdown sections/examples, or create a staged migration/report before hard-failing existing legacy content.
- Add tests covering empty, HTML-only, missing examples, and valid Markdown descriptions.

### T7 - Root Rust `target/` and AppleDouble metadata are unignored, causing review/gate traversal and commit-risk noise

Severity: Medium
Confidence: High
Status: Confirmed

Evidence:
- Current `git status --short --untracked-files=all` lists root `target/.rustc_info.json`, `target/CACHEDIR.TAG`, `target/debug/.cargo-lock`, many `target/debug/.fingerprint/*` entries, and `._target`.
- `.gitignore` ignores `judge-worker-rs/target/` and `rate-limiter-rs/target/`, but not root `/target/`, `code-similarity-rs/target/`, or root `._*`: `.gitignore:68-76`, `.gitignore:102-106`.
- `.dockerignore` already excludes more of this class of artifacts, including `._*`, `code-similarity-rs/target/`, and `rate-limiter-rs/target/`: `.dockerignore:16-21`.
- Repository inventory commands entered root `target/` until explicit exclusions were added.

Failure scenario:
1. A contributor runs root-level Cargo commands or tooling creates AppleDouble metadata.
2. Generated artifacts remain untracked but visible.
3. Broad repository searches, review agents, secret scans, and accidental `git add .` can traverse or stage build artifacts, wasting time and risking noisy commits.

Suggested fix:
- Add `/target/`, `code-similarity-rs/target/`, and `._*` to `.gitignore`.
- Remove the current generated root `target/` and `._target` from the worktree after confirming no source files are inside them.
- Keep secret/review scans configured to exclude generated build directories even after ignore rules are updated.

## Validated Hypotheses That Are Not Current Findings

- Schema-drift DB import rollback appears fixed in this worktree: column mismatches now set `result.success = false` and throw inside the transaction at `src/lib/db/import.ts:160-180`, the catch clears table results and reports rollback at `src/lib/db/import.ts:214-224`, and import routes now fail on `result.errors.length > 0` at `src/app/api/v1/admin/migrate/import/route.ts:109-118` and `src/app/api/v1/admin/migrate/import/route.ts:210-216`.
- Language command serialization reset/seed/fallback drift appears fixed: seed, sync, admin reset, compiler fallback, playground fallback, and compute-expected fallback now call `serializeJudgeCommand`: `scripts/seed.ts:254-265`, `scripts/sync-language-configs.ts:60-71`, `src/lib/actions/language-configs.ts:256-264`, `src/lib/actions/language-configs.ts:304-315`, `src/app/api/v1/compiler/run/route.ts:117-122`, `src/app/api/v1/playground/run/route.ts:86-90`, `src/app/api/v1/problems/[id]/compute-expected/route.ts:103-107`.
- Rejudge capacity leakage for queued/judging submissions appears addressed: the rejudge transaction reads the current worker id and decrements `judge_workers.activeTasks` when resetting a queued/judging submission at `src/app/api/v1/submissions/[id]/rejudge/route.ts:36-70`.
- Migration import pre-snapshot coverage appears addressed: both JSON and multipart import paths take `takePreRestoreSnapshot` before `importDatabase` at `src/app/api/v1/admin/migrate/import/route.ts:109-110` and `src/app/api/v1/admin/migrate/import/route.ts:210-211`.

## Final Missed-Issues Sweep

- Re-ran targeted searches excluding generated output for judge result parsing, function-spec validation, submission statuses, hardcoded `jk_` keys, and untracked artifacts.
- Checked competing explanations for old cycle findings before carrying anything forward; earlier causal failures that are already fixed by current uncommitted changes are documented above as resolved hypotheses.
- Reviewed both local-worker and dedicated-worker deployment topology so the output-limit finding is scoped to the path that actually crosses nginx.
- Confirmed the ZIP restore issue is not covered by the now-transactional DB import because file writes happen outside the DB transaction and before DB validation/import outcome.
- Did not run application tests or gates for this review-only prompt.

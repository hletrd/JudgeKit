# Verifier Review - Prompt 1, Cycle 2

Findings count: 6

## Inventory

Scope built from `git status --short`, `git diff --name-only -- . ':(exclude).context/reviews/*'`, repo instructions, and targeted contract searches. I treated the dirty worktree as intentional prior-cycle work and did not revert or fix anything.

Review-relevant instruction/docs sources:

- `AGENTS.md` password policy, deployment recovery, language/admin behavior, Docker image API, problem-description requirements.
- `CLAUDE.md` deploy topology rules for `algo.xylolabs.com`.
- `.context/development/problem-descriptions.md` mandatory Markdown problem-description contract.
- `docs/authentication.md`, `docs/deployment.md`, `docs/api.md`, `docs/function-judging.md`.
- `plans/open/2026-06-22-rpf-cycle-1-review-remediation.md` prior-cycle intent and remaining gate notes.

Dirty implementation/test files examined:

- Deployment/test harness: `deploy-docker.sh`, `playwright.config.ts`, `scripts/playwright-local-webserver.sh`, `tests/unit/infra/deploy-security.test.ts`, `tests/unit/infra/playwright-profiles.test.ts`.
- Password/auth/settings: `src/lib/security/password.ts`, `src/lib/security/constants.ts`, `src/lib/system-settings-config.ts`, `src/lib/validators/system-settings.ts`, `src/app/api/v1/admin/settings/route.ts`, `src/lib/actions/system-settings.ts`, `src/app/api/v1/auth/reset-password/route.ts`, `src/app/(auth)/reset-password/reset-password-form.tsx`, `src/app/change-password/change-password-form.tsx`, `src/app/(auth)/signup/signup-form.tsx`, `src/app/(auth)/recruit/[token]/recruit-start-form.tsx`, `src/lib/actions/public-signup.ts`, `src/lib/actions/user-management.ts`, `messages/en.json`, `messages/ko.json`, relevant password tests.
- Docker/language/judge: `src/lib/docker/client.ts`, `src/app/api/v1/admin/docker/images/build/route.ts`, `src/lib/judge/docker-image-validation.ts`, `judge-worker-rs/src/validation.rs`, `src/lib/judge/sync-language-configs.ts`, `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx`, `src/app/(public)/languages/page.tsx`, `tests/unit/docker/client.test.ts`, `tests/unit/sync-language-configs-skip-instrumentation.test.ts`, `tests/unit/dashboard-judge-system-implementation.test.ts`.
- Judge report/API validation: `judge-worker-rs/src/executor.rs`, `src/lib/validators/api.ts`, `src/app/api/v1/judge/poll/route.ts`, `src/app/api/v1/judge/claim/route.ts`, `tests/unit/validators/api.test.ts`, judge status/report tests.
- Import/export/restore/problem/realtime/plugins: `src/app/api/v1/admin/restore/route.ts`, `src/lib/db/export-with-files.ts`, `src/lib/db/export.ts`, `src/app/api/v1/problems/import/route.ts`, `src/lib/problem-management.ts`, `src/lib/validators/problem-management.ts`, `src/lib/plugins/secrets.ts`, `src/lib/realtime/realtime-coordination.ts`, and their listed unit/E2E tests.

No issue found in the reviewed language count/sync source of truth, problem import validator reuse, judge-report app-side schema limits, Rust trusted-registry boundary check, SSE LIKE escaping, plugin secret export encryption for newly handled values, or function-problem API contract paths beyond the findings below.

## Findings

### V2-1 - Password minimum remains configurable even though policy is fixed at 8

Status: confirmed  
Confidence: High

Evidence:

- `AGENTS.md:628-634` mandates only a fixed 8-character minimum and says not to change the minimum without explicit approval.
- `src/lib/security/password.ts:1-27` implements that fixed policy with `FIXED_MIN_PASSWORD_LENGTH = 8` and only checks `password.length < 8`.
- The admin settings UI still exposes `minPasswordLength` in `src/app/(dashboard)/dashboard/admin/settings/page.tsx:49-52` and renders it as an editable numeric field via `src/app/(dashboard)/dashboard/admin/settings/config-settings-form.tsx:86-114`.
- The API/action paths still accept and store the key: `src/app/api/v1/admin/settings/route.ts:63-80` and `src/lib/actions/system-settings.ts:21-46`.
- The validator allows values from 8 to 128 in `src/lib/validators/system-settings.ts:126-130`, and settings resolution still reads the DB value in `src/lib/system-settings-config.ts:120-124`.
- UI copy still tells operators this is a configurable requirement: `messages/en.json:1549-1550`, `messages/ko.json:1549-1550`.
- `src/lib/security/constants.ts:6-8` still returns the configured value, creating a second password-minimum source that disagrees with the real validator.

Failure scenario:

An admin sets "Minimum Password Length" to `12` from the settings page. The setting persists and appears effective, but signup/change/reset/recruit password validation still accepts 8-character passwords through `getPasswordValidationError()`. That creates a documented/admin-visible policy that the server does not enforce.

Suggested fix:

Remove `minPasswordLength` from configurable settings, API allowlists, admin UI, i18n, and the `getMinPasswordLength()` helper, or make it a read-only display of `FIXED_MIN_PASSWORD_LENGTH`. Add a regression test that setting payloads cannot change the password minimum.

### V2-2 - Reset-password form does not validate the mandatory 8-character minimum before submission

Status: confirmed  
Confidence: High

Evidence:

- `AGENTS.md:632-633` requires client-side password forms to validate `length >= 8` before submission and show a clear error.
- The reset-password form submits after only checking token and password equality in `src/app/(auth)/reset-password/reset-password-form.tsx:34-51`; there is no length check before `fetch()`.
- The password input at `src/app/(auth)/reset-password/reset-password-form.tsx:113-122` and confirmation input at `src/app/(auth)/reset-password/reset-password-form.tsx:140-149` have `required` but no `minLength`.
- The server does reject short passwords and returns the fixed minimum in `src/app/api/v1/auth/reset-password/route.ts:34-38`, and the client maps that response at `src/app/(auth)/reset-password/reset-password-form.tsx:68-75`. That is post-submission, not the required client-side pre-submit validation.

Failure scenario:

A user enters a matching 7-character password and submits the reset form. The browser sends the request, consumes rate-limit attempts, and only then receives `passwordTooShort`. This violates the repository's explicit client-side validation contract and can make reset-password UX/rate-limiting behavior differ from signup and change-password.

Suggested fix:

Import `FIXED_MIN_PASSWORD_LENGTH`, add `minLength={FIXED_MIN_PASSWORD_LENGTH}` to both reset-password inputs, and add an explicit pre-fetch length check that sets the same localized `passwordTooShort` message. Add a component or route-level test for the short-password pre-submit path.

### V2-3 - Docker admin API contract says generic `configError`, but production URL-without-token throws at module import

Status: confirmed  
Confidence: High

Evidence:

- `src/lib/docker/client.ts:28-41` documents that worker Docker API misconfiguration details are logged server-side and only generic `configError` is returned to API callers.
- `src/lib/docker/client.ts:145-149` implements the generic return helper.
- `tests/unit/docker/client.test.ts:77-97` asserts a runner URL without `RUNNER_AUTH_TOKEN` yields generic `configError`, and `tests/unit/docker/client.test.ts:99-126` asserts production without a runner API also yields generic `configError`.
- But `src/lib/docker/client.ts:21-27` throws at import time when `NODE_ENV === "production"`, a worker URL is configured, and `RUNNER_AUTH_TOKEN` is missing.

Failure scenario:

In production, an operator configures `COMPILER_RUNNER_URL` or `JUDGE_WORKER_URL` but forgets `RUNNER_AUTH_TOKEN`. Any admin Docker image API route importing `@/lib/docker/client` can fail before handler code runs, bypassing the intended `{ error: "configError" }` API response and the admin UI's generic i18n path. The tests miss this exact production combination.

Suggested fix:

Remove the top-level throw and let `WORKER_DOCKER_API_CONFIG_DETAIL` plus `getWorkerDockerApiConfigError()` handle this case, or add a route-level production test for URL-without-token and intentionally document/handle the startup failure path.

### V2-4 - ZIP restore audit summary always records `0 files`

Status: confirmed  
Confidence: High

Evidence:

- `src/app/api/v1/admin/restore/route.ts:78-80` initializes `filesRestored = 0` and `pendingUploadedFiles = []`.
- ZIP parsing fills `pendingUploadedFiles` at `src/app/api/v1/admin/restore/route.ts:82-91`.
- The audit event is recorded before file restoration, and its ZIP summary interpolates `${filesRestored}` at `src/app/api/v1/admin/restore/route.ts:151-163`.
- Files are actually restored later, after successful DB import, at `src/app/api/v1/admin/restore/route.ts:176-178`.
- The HTTP response returns the real restored count after that at `src/app/api/v1/admin/restore/route.ts:180-184`, so the audit trail and API response can disagree.

Failure scenario:

An admin restores a ZIP backup containing uploaded files. The restore succeeds and the API returns a positive `filesRestored`, but the audit log permanently says "0 files". During incident response, operators reading audit logs will think no uploaded files were restored.

Suggested fix:

Use `pendingUploadedFiles.length` in the pre-import audit summary, move the audit event after `restoreParsedBackupFiles()`, or emit a second completion audit event with the actual `filesRestored` count.

### V2-5 - `AGENTS.md` migration-recovery docs still describe a warn path, but the script/tests now abort

Status: confirmed  
Confidence: High

Evidence:

- `AGENTS.md:379-384` says destructive `drizzle-kit push` detection "downgrades the success log to a warn" and shows the operator a `[WARN]` message.
- The same file later says the policy is to "halt and escalate" at `AGENTS.md:430`, so the doc is internally inconsistent.
- `deploy-docker.sh:1011-1020` documents the updated behavior: capture output and abort before new app code starts.
- `deploy-docker.sh:1058-1064` calls `die` when destructive prompt markers are detected.
- `tests/unit/infra/deploy-security.test.ts:31-43` now explicitly expects `die` and rejects the old `warn` behavior.

Failure scenario:

An operator hits a destructive migration prompt during deploy and consults `AGENTS.md`. The recovery section tells them to look for a warning and implies deploy continued, while the actual script exits. This can waste incident time and confuse whether new app code was started.

Suggested fix:

Update `AGENTS.md:377-388` to state that detection aborts the deploy with `die`, not warning-only behavior, and adjust the recovery prose from "When you see the warn" to "When the deploy aborts with this error".

### V2-6 - Playwright local web server can run stale standalone code by default

Status: risk  
Confidence: Medium

Evidence:

- The Playwright local webServer uses `bash scripts/playwright-local-webserver.sh` in `playwright.config.ts:98-119`, with `reuseExistingServer: false`, so this script owns the served app.
- `scripts/playwright-local-webserver.sh:105-107` only runs `npm run build` when `PLAYWRIGHT_REBUILD_APP=1` or `.next/standalone/server.js` is missing.
- It then refreshes static assets and starts the existing standalone server at `scripts/playwright-local-webserver.sh:109-118`.
- `tests/unit/infra/playwright-profiles.test.ts:46-53` locks in this reuse behavior.
- The remediation plan notes the full local Playwright gate is still not green in `plans/open/2026-06-22-rpf-cycle-1-review-remediation.md:181-191`, so false stale-code signals matter for the current cycle.

Failure scenario:

A developer changes app code, has an old `.next/standalone/server.js` from a previous run, and runs `npx playwright test` without `PLAYWRIGHT_REBUILD_APP=1`. The tests can exercise the old server bundle while copying current static assets, producing false passes or misleading failures unrelated to the current source tree.

Suggested fix:

Default to rebuilding for local Playwright runs, or add a freshness check based on source/package timestamps or a build fingerprint. If reuse is required for incident speed, expose it as an opt-in such as `PLAYWRIGHT_REUSE_BUILD=1` and update tests/docs accordingly.

## Final Missed-Issue Sweep

I ran targeted sweeps for the required coverage areas after the initial inventory:

- Password-policy and reset/change/signup/recruit flows: found V2-1 and V2-2.
- Judge report size/result-count validation across Rust worker, app validator, and tests: worker-side truncation and app-side caps align; no additional finding.
- Problem-description/import validation: import now reuses the normal bounded test-case/description/function schema; no finding.
- Deployment docs vs script/tests: found V2-5; worker/nginx fatal paths align with tests.
- Language/judge docs vs config: counted 125 language config entries with no duplicate language ids; startup sync preserves command overrides while explicit `npm run languages:sync` remains source-of-truth sync; no finding.
- Docker image API/admin contract: build route validates local `judge-*` Dockerfiles and Rust/TS trusted registry boundary checks align; found only V2-3.
- Backup/export/restore contracts: ZIP extraction caps and plugin secret export encryption paths are present; found V2-4 audit-count drift.
- Realtime SSE connection counting: SQL LIKE wildcard escaping is present and covered; no finding.

No tests were run as part of this verifier pass; this was an evidence review only.

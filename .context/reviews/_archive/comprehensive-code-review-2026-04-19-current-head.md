# Comprehensive deep code review — 2026-04-19 current HEAD (`ac05282c`)

## Scope and inventory

I started by building a tracked-file inventory from `git ls-files` and then walked every review-relevant area instead of sampling a subset.

Tracked inventory reviewed in this pass:

- `src/` — 563 files
  - `src/app/` — 275
  - `src/components/` — 96
  - `src/lib/` — 178
- `tests/` — 407 files
  - `tests/unit/` — 274
  - `tests/component/` — 68
  - `tests/e2e/` — 40
  - `tests/visual/` — 18
  - `tests/integration/` — 7
- `docker/` — 106 files
- `static-site/` — 101 files
- `drizzle/` — 71 files
- `scripts/` — 35 files
- `docs/` — 24 files
- root tracked configs/docs — 35 files
- `judge-worker-rs/` — 13 files
- `rate-limiter-rs/` — 9 files
- `code-similarity-rs/` — 6 files
- `.github/` — 3 files
- `messages/` — 2 files

Documentation explicitly reviewed in this pass included `README.md`, `AGENTS.md`, `docs/api.md`, `docs/monitoring.md`, `docs/judge-workers.md`, `docs/deployment.md`, `.env.example`, and the relevant docker-compose / deployment files.

Excluded as not review-relevant for this pass:

- build/runtime artifacts (`.next/`, coverage output, `.omx/`, `node_modules/`, `data/`)
- untracked local files (including local `.env*` files and scratch scripts), because they are not part of the repository state under review
- binary assets / diagrams and vendored generated bundles inside exported static-site content, except where an entrypoint/config decision affected runtime behavior

## Method

I used a repo-wide pass plus targeted cross-file sweeps for:

- capability / role enforcement
- monitoring and admin-health paths
- profile editing invariants
- batch semantics and partial-failure handling
- deployment-compose vs runtime-code mismatches
- sidecar auth wiring
- i18n bundle coverage
- CI / typecheck / unit-test health
- dedicated worker deployment contracts

## Verification evidence gathered

- `npx tsc --noEmit` ❌
  - fails in `src/lib/auth/config.ts`, `src/lib/db/migrate.ts`, and `tests/unit/assignments/code-similarity-client.test.ts`
- `npx vitest run` ❌
  - 272 test files ran
  - 1903 tests passed
  - 7 tests failed across 4 files:
    - `tests/unit/ui-i18n-keys-implementation.test.ts`
    - `tests/unit/api/users.bulk.route.test.ts`
    - `tests/unit/compiler/execute-implementation.test.ts`
    - `tests/unit/infra/source-grep-inventory.test.ts`
- `cargo test --quiet` in `judge-worker-rs/` ✅
  - 55 tests passed

## Findings summary

- **Confirmed issues:** 13
- **Likely issues:** 1
- **Risks needing manual validation:** 1

---

## Confirmed issues

### C1. Assistant-scoped roles can browse the global user directory
**Confidence:** High

**Files / regions**
- `src/lib/capabilities/defaults.ts:15-29`
- `src/app/(dashboard)/dashboard/page.tsx:22-35`
- `src/app/(dashboard)/dashboard/admin/users/page.tsx:56-61,120-130`
- `src/app/(dashboard)/dashboard/admin/users/[id]/page.tsx:23-31`

**Why this is a problem**
The built-in `assistant` capability set includes `users.view`. The dashboard treats `users.view` as an “admin workspace” signal, and the users index/detail pages authorize on `users.view` alone. Neither page applies group scoping, enrollment scoping, or manageable-role scoping to the queried users.

**Concrete failure scenario**
A TA / assistant who should only review one course section logs in and is routed into the admin shell. They can open `/dashboard/admin/users` and `/dashboard/admin/users/[id]` to enumerate platform-wide usernames, emails, class names, and roles for unrelated courses.

**Suggested fix**
Split this contract into a global directory capability (for example `users.view_all`) and a scoped user-visibility helper. At minimum:
- remove `users.view` from `ASSISTANT_CAPABILITIES`, or
- scope the admin users index/detail pages to the actor’s manageable groups / users, and
- add behavioural tests proving assistants cannot enumerate unrelated users.

---

### C2. Profile `className` restrictions are enforced only in the UI, not in the server action
**Confidence:** High

**Files / regions**
- `src/app/(dashboard)/dashboard/profile/page.tsx:80-91`
- `src/app/(dashboard)/dashboard/profile/profile-form.tsx:63-77`
- `src/lib/actions/update-profile.ts:61-103`

**Why this is a problem**
The page decides editability with `canEditClassName={session.user.role !== "student"}` and the client form omits `className` only when that prop is false. But the server action accepts `className` from parsed input and always persists it.

**Concrete failure scenario**
A student opens DevTools, replays the server action request, and includes a `className` field manually. The server action updates the DB even though the UI is trying to keep that field read-only for students.

**Suggested fix**
Enforce the rule in `updateProfile(...)` itself:
- derive permission server-side (preferably from capabilities/policy, not `role !== "student"`), and
- ignore or reject `className` changes when the caller lacks permission.

---

### C3. The profile page still cannot render correct role labels for assistant and custom roles
**Confidence:** High

**Files / regions**
- `src/app/(dashboard)/dashboard/profile/page.tsx:30-35,63-68`

**Why this is a problem**
The profile-page `roleLabels` map only contains `student`, `instructor`, `admin`, and `super_admin`. It omits `assistant` and does not fall back to a role record display name.

**Concrete failure scenario**
An assistant or custom-role user opens `/dashboard/profile` and sees an empty badge or raw fallback-less output instead of a human-readable localized role label.

**Suggested fix**
Use the same safer strategy already used by admin user pages:
- add the built-in assistant label,
- resolve custom-role `displayName` from the `roles` table (or a shared helper), and
- render `builtinLabel ?? customDisplayName ?? rawRole`.

---

### C4. The public `/api/health` endpoint computes the full admin-health snapshot before deciding whether the caller can see it
**Confidence:** High

**Files / regions**
- `src/app/api/health/route.ts:7-22`
- `src/lib/ops/admin-health.ts:62-89`

**Why this is a problem**
`/api/health` calls `getAdminHealthSnapshot()` before it checks whether the caller is an admin. `getAdminHealthSnapshot()` does more than a coarse health probe: it hits the DB, counts `judge_workers`, counts queued submissions, and collects audit-pipeline status.

So anonymous/public callers get a redacted response, but still force the expensive admin-only work.

**Concrete failure scenario**
A load balancer or uptime service polls `/api/health` every few seconds. Every poll now runs the heavier admin snapshot path instead of a cheap public health check, increasing DB load and making the public health endpoint more failure-prone than the documented coarse response implies.

**Suggested fix**
Split health collection into:
- a lightweight public probe for coarse `{ status }`, and
- the existing admin-health snapshot only for authorized callers.

At minimum, move auth evaluation ahead of the heavy snapshot call.

---

### C5. `AdminDashboard` fetches health data even for roles that are not allowed to see the health card
**Confidence:** High

**Files / regions**
- `src/app/(dashboard)/dashboard/_components/admin-dashboard.tsx:13-20`
- `src/lib/ops/admin-health.ts:62-89`

**Why this is a problem**
`AdminDashboard` uses `Promise.all([..., getAdminHealthSnapshot()])` before calculating `canViewHealth = caps.has("system.settings")`. That means low-scope admin-shell roles still incur the DB/queue/worker probe path even when the UI hides the health card.

**Concrete failure scenario**
A role that only has `users.view` or `system.chat_logs` lands on the admin shell. Every visit still triggers the health snapshot queries. If those queries are slow or degraded, a role that cannot view system health can still suffer dashboard latency from them.

**Suggested fix**
Compute `caps` / `canViewHealth` first, and only call `getAdminHealthSnapshot()` when `canViewHealth` is true.

---

### C6. Bulk user creation is fail-all on the first disallowed role even though the rest of the endpoint is designed for partial success
**Confidence:** Medium

**Files / regions**
- `src/app/api/v1/users/bulk/route.ts:21-29`
- `src/app/api/v1/users/bulk/route.ts:61-149`

**Why this is a problem**
The route validates role escalation for all rows up front and immediately returns `403` if any row fails `validateRoleChangeAsync(...)`. But the rest of the implementation explicitly supports per-row partial success with password-prep failures, savepoints, and `created[]` / `failed[]` reporting.

**Concrete failure scenario**
An admin uploads 200 rows, 199 valid and 1 with a disallowed role. Instead of creating the 199 safe rows and reporting the bad row in `failed[]`, the API rejects the entire batch.

**Suggested fix**
Treat role-escalation failures like other row-level failures:
- convert them into per-row `failed[]` entries, and
- keep request-level `403` only for the caller lacking `users.create` at all.

---

### C7. Sidecar bearer auth is documented, but the compose files never pass the sidecar tokens into the code-similarity and rate-limiter containers
**Confidence:** High

**Files / regions**
- `docker-compose.production.yml:91-98,153-156,171-174`
- `docker-compose.test-backends.yml:200-203`
- `.env.example:47-59`
- `code-similarity-rs/src/main.rs:163-170`
- `rate-limiter-rs/src/main.rs:379-389`

**Why this is a problem**
The app side is documented/configured to send `CODE_SIMILARITY_AUTH_TOKEN` and `RATE_LIMITER_AUTH_TOKEN`, and both Rust sidecars only enforce auth if their own matching env vars are present.

But the production compose file never passes either token into the `code-similarity` or `rate-limiter` containers, and the test-backends compose file likewise omits the code-similarity token. The result is that the sidecars start in “accept unauthenticated requests” mode even if operators set the app-side token.

**Concrete failure scenario**
An operator sets `RATE_LIMITER_AUTH_TOKEN` and/or `CODE_SIMILARITY_AUTH_TOKEN` in the app environment and assumes the internal services are protected. In reality the sidecars never receive those env vars, so any container on the Docker network can hit `/check`, `/record-failure`, or `/compute` without a valid bearer token.

**Suggested fix**
Pass the tokens into the sidecar containers explicitly:
- `CODE_SIMILARITY_AUTH_TOKEN=${CODE_SIMILARITY_AUTH_TOKEN:-}`
- `RATE_LIMITER_AUTH_TOKEN=${RATE_LIMITER_AUTH_TOKEN:-}`

Then add compose-level tests or docs-contract tests so this cannot drift again.

---

### C8. Dedicated-worker deployments cannot actually use a separate `RUNNER_AUTH_TOKEN`, despite the docs recommending it
**Confidence:** High

**Files / regions**
- `docker-compose.worker.yml:41-53`
- `docs/judge-workers.md:58-60,83-88,114-114`
- `judge-worker-rs/src/config.rs:152-170`

**Why this is a problem**
The docs explicitly recommend passing a separate `RUNNER_AUTH_TOKEN` for runner/docker-admin endpoints. The worker config supports it. But `docker-compose.worker.yml` never forwards `RUNNER_AUTH_TOKEN` into the `judge-worker` container, so dedicated-worker deployments always fall back to `JUDGE_AUTH_TOKEN`.

**Concrete failure scenario**
An operator follows the dedicated-worker docs and exports both `JUDGE_AUTH_TOKEN` and `RUNNER_AUTH_TOKEN` before running `docker compose -f docker-compose.worker.yml up -d`. The compose file forwards only `JUDGE_AUTH_TOKEN`, so the runner/admin endpoints still share the broader judge token. A leaked poll/report token therefore still authorizes runner/admin operations.

**Suggested fix**
Add `RUNNER_AUTH_TOKEN=${RUNNER_AUTH_TOKEN:-}` to `docker-compose.worker.yml` and add a deployment-contract test to lock this behavior.

---

### C9. `isAdmin()` is documented as custom-role-aware, but it is not; custom `system.settings` roles therefore lose admin-only monitoring responses
**Confidence:** High

**Files / regions**
- `src/lib/api/auth.ts:92-106`
- `src/app/api/health/route.ts:8-13`
- `src/app/api/metrics/route.ts:22-36`
- `src/app/(dashboard)/dashboard/admin/settings/page.tsx:112-116`

**Why this is a problem**
The sync `isAdmin()` helper claims to support custom roles, but it only checks the built-in `ROLE_LEVEL` table. The async `isAdminAsync()` is the one that actually looks at capabilities.

That mismatch matters because `/api/health` and `/api/metrics` use the sync helper, while the rest of the admin surface (for example the settings page) uses capability checks like `caps.has("system.settings")`.

**Concrete failure scenario**
A custom role with `system.settings` can open admin settings and see the admin health card, but the same session is treated as non-admin by `/api/health` and `/api/metrics`. The user gets only coarse health or a `401` metrics response unless they also provide `CRON_SECRET`.

**Suggested fix**
Either:
- make `isAdmin()` honest and built-in-only, then stop using it for custom-role-aware routes, or
- switch these routes to `isAdminAsync()` / direct capability checks.

Also fix the misleading doc comment on `isAdmin()`.

---

### C10. The anti-cheat dashboard references a translation key that does not exist in either bundle
**Confidence:** High

**Files / regions**
- `src/components/contest/anti-cheat-dashboard.tsx:305-308`
- `messages/en.json:2057-2124`
- `messages/ko.json:2057-2124`

**Why this is a problem**
The component renders `t("language")` for the flagged-pairs table header, but neither locale bundle defines `contests.antiCheat.language`.

**Concrete failure scenario**
The anti-cheat dashboard renders a missing-translation placeholder / raw key for the language column in both English and Korean, and the repo’s own `ui-i18n-keys-implementation` test fails.

**Suggested fix**
Add the `language` key under `contests.antiCheat` in both `messages/en.json` and `messages/ko.json`, and keep the i18n coverage test green.

---

### C11. The repository currently fails `npx tsc --noEmit` on three separate drifts, so the main TypeScript quality gate is red
**Confidence:** High

**Files / regions**
- `src/lib/auth/config.ts:40-44,122-153`
- `src/lib/auth/recruiting-token.ts:10-17`
- `src/lib/auth/types.ts:6-14`
- `src/types/next-auth.d.ts:6-14`
- `src/lib/db/migrate.ts:1-7`
- `src/lib/assignments/code-similarity-client.ts:5-10`
- `tests/unit/assignments/code-similarity-client.test.ts:21-25`
- `.github/workflows/ci.yml:85-89`

**Why this is a problem**
The current head does not satisfy the repo’s own CI gate:
1. the recruiting-token auth return type still carries `mustChangePassword: boolean | null` through `AuthUserRecord`, which conflicts with NextAuth’s `User.mustChangePassword?: boolean` expectations;
2. `src/lib/db/migrate.ts` casts `db` to `NodePgDatabase` in a way that no longer typechecks under the current Drizzle generic shape;
3. the code-similarity client now requires `language` in `RustSubmission`, but the test fixtures still omit it.

**Concrete failure scenario**
Every CI run that reaches `npx tsc --noEmit` will fail before shipping, and contributors cannot rely on the declared “zero type errors” quality gate.

**Suggested fix**
- normalize the recruiting-token auth return type to a non-null `mustChangePassword` shape (or share the already-normalized login-user type);
- update `src/lib/db/migrate.ts` to the current Drizzle-recommended typing approach;
- update similarity test fixtures to include `language`.

---

### C12. `tests/unit/api/users.bulk.route.test.ts` no longer exercises the wrapped route correctly and now crashes before reaching its assertions
**Confidence:** High

**Files / regions**
- `tests/unit/api/users.bulk.route.test.ts:18-25`
- `src/app/api/v1/users/bulk/route.ts:16-23`

**Why this is a problem**
The test mocks `createApiHandler` and injects `body: undefined as never`, even though the real route now relies on wrapper-parsed `body.users`. The test therefore crashes with `TypeError: Cannot destructure property 'users' of 'body' as it is undefined` before it can validate route behavior.

**Concrete failure scenario**
The suite reports failures for bulk-user creation, but those failures are about the stale harness rather than the endpoint’s real runtime behavior. Regressions in schema/body parsing could also slip by because the test is not exercising the real wrapper contract anymore.

**Suggested fix**
Stop bypassing the wrapper’s parsing contract. Either:
- use the real `createApiHandler` in the test, or
- make the mock parse `req.json()` and pass the schema-validated body through.

---

### C13. `tests/unit/compiler/execute-implementation.test.ts` is stale and now codifies the pre-hardening `0o777` permission model
**Confidence:** High

**Files / regions**
- `tests/unit/compiler/execute-implementation.test.ts:6-11`
- `src/lib/compiler/execute.ts:564-571`

**Why this is a problem**
The test still expects `await chmod(workspaceDir, 0o777);`, but the implementation has already tightened the workspace to `0o770`. This is not just stale bookkeeping: the test is actively asserting the weaker, world-writable workspace mode.

**Concrete failure scenario**
A contributor trying to “fix the tests” by following the assertion could revert the compiler-workspace hardening back to `0o777`, widening local sandbox exposure just to satisfy a stale contract test.

**Suggested fix**
Update the test to assert the intended hardened permission model (`0o770`) and explain why that mode is sufficient for the non-root sandbox user.

---

### C14. `tests/unit/infra/source-grep-inventory.test.ts` is red because its documented baseline was not updated intentionally
**Confidence:** High

**Files / regions**
- `tests/unit/infra/source-grep-inventory.test.ts:81-86`

**Why this is a problem**
The test hardcodes `DOCUMENTED_BASELINE = 114`, but the current inventory is 115. That makes the full unit suite fail for bookkeeping drift rather than product behavior.

**Concrete failure scenario**
Contributors run the full suite and hit a red test that says nothing about runtime correctness. CI trust drops because one of the repo’s declared quality gates is broken by stale inventory metadata.

**Suggested fix**
Either:
- update the documented baseline intentionally, or
- convert the newly added source-grep test to a behavioural test so the baseline does not need to change.

---

## Likely issues

### L1. The dashboard-shell routing is probably too broad for narrow read-only admin roles
**Confidence:** Medium

**Files / regions**
- `src/app/(dashboard)/dashboard/page.tsx:24-35`

**Why this is likely a problem**
The dashboard sends any user with one of several read-only admin-ish capabilities (`users.view`, `system.audit_logs`, `system.login_logs`, `system.chat_logs`, `files.manage`, etc.) into the full admin dashboard shell.

That may be intentional, but it also means a narrowly scoped support role gets an admin-centric landing page even if their only real task is log review.

**Concrete failure scenario**
A chat-log-only or login-log-only role lands in the generic admin shell instead of a task-specific destination, which increases UI clutter and makes role-specific workflows harder to discover.

**Suggested fix**
Validate the intended landing experience for:
- audit-only roles
- login-log-only roles
- chat-log-only roles
- files-only roles

If the broad admin shell is intentional, document it. If not, split “has some admin capability” from “should land on the full admin shell.”

---

## Risks needing manual validation

### R1. Ordinary authenticated students still receive judge-system capacity summaries and the full enabled-language catalog
**Confidence:** Low

**Files / regions**
- `src/app/(dashboard)/dashboard/page.tsx:107-121`
- `src/app/(dashboard)/dashboard/_components/dashboard-judge-system-section.tsx:9-48`
- `src/app/(dashboard)/dashboard/languages/page.tsx:18-31,46-133`

**Why this needs manual validation**
Recruiting candidates are now blocked from these surfaces, but ordinary logged-in students still get:
- online worker count
- worker capacity
- active judge task count
- default execution limits
- full enabled-language catalog

That may be an intentional transparency choice for coursework users, or it may be more infrastructure disclosure than some deployments want.

**Concrete failure scenario**
A stricter classroom / exam deployment expects students to see only coursework data, but the current dashboard also publishes live judge-capacity and runtime-catalog information to any authenticated non-recruiting user.

**Suggested fix if this is not intended**
Put these surfaces behind a dedicated capability or a stricter platform-mode rule instead of exposing them to all authenticated non-recruiting users.

---

## Final missed-issues sweep

I did a final sweep specifically for commonly missed review classes:

- no-wrapper API routes (`src/app/api/**/route.ts`) and their manual auth logic
- capability-vs-role drift (`isAdmin`, `role !== "student"`, `users.view`, `system.settings`)
- deployment compose vs runtime/env expectations for internal sidecars
- i18n bundle coverage against literal `t("...")` usage
- full quality-gate health (`tsc`, unit tests, Rust worker tests, CI workflow expectations)
- static-site deployment/config entrypoints and generated-content boundaries

### Final sweep result

- No additional high-confidence runtime/security issues were found beyond the findings above.
- The remaining high-value follow-ups are concentrated in:
  1. capability / role-boundary consistency,
  2. sidecar/deployment auth wiring,
  3. CI / test contract drift.
- I did not find evidence that any review-relevant tracked source directory was skipped; generated/vendor content was intentionally excluded where it was not repo-authored logic.

## Bottom line

The current head has several real, still-open issues despite strong recent remediation work:

1. **Highest-risk auth bug:** assistant-scoped roles can still browse the global user directory.
2. **Highest-risk invariant bug:** profile `className` restrictions are UI-only.
3. **Highest-risk deployment bug:** sidecar auth tokens are documented but not actually wired into compose for code-similarity / rate-limiter, and dedicated workers cannot receive `RUNNER_AUTH_TOKEN`.
4. **Highest-impact repo-health issue:** the main TypeScript and unit-test quality gates are currently red.


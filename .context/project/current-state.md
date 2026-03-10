# Current State

Last updated: 2026-03-10

## Shipped and deployed

- The public host is `oj.auraedu.me`; the legacy hostname `oj-demo.atik.kr` was retired at nginx during the 2026-03-09 cutover.
- The deployed demo host serves the public login page over HTTP 200, redirects protected dashboard routes through login, and keeps both `online-judge.service` and `online-judge-worker.service` active.
- Admin system settings support a default timezone in addition to the site title and description.
- Rendered timestamps use the configured timezone on student/admin submission pages, admin user pages, and group assignment schedule views.

## Locally verified, not yet deployed

- The `dashboard-rendering-audit-and-editor-upgrades` plan is complete in the local repository.
- Local main now includes the instructor assignment status board and scoped assignment submission drill-down, admin login logs, theme switching, CodeMirror-based code surfaces, markdown-safe problem rendering, source-draft recovery, mixed submission ID support, and guarded user/problem delete flows.
- Local main also includes group membership management, assignment create/edit/delete flows, student assignment detail pages, assignment-linked submission paths, assignment-context enforcement from the generic problem view, synchronized problem-group access for assignment problems, and safety blocks on removing members, deleting assignments, or deleting groups after assignment submissions exist.
- Local main now also includes broader audit/event logging: append-only `audit_events`, an admin audit-log dashboard with request-context visibility, system-actor rendering, resource-ID search, and mutation coverage for settings, user-management, problems, groups, memberships, assignments, submissions, judge updates, profile edits, and password changes.
- Local main now also includes repository-native CI plus an operational-hardening baseline: GitHub Actions CI, a public `/api/health` readiness route, verified SQLite backup/restore scripts, and repo-managed systemd timer artifacts for scheduled backups.
- Local main now also includes the 2026-03-08 security/API hardening batch: SQLite-backed rate limits, shared client-IP extraction, CSRF checks on authenticated mutation APIs, env-gated Auth.js trusted-host handling with explicit auth-route host validation, judge claim-token verification, SQL-level accessible-problem pagination, and CSP-compatible sidebar/toaster/code-surface rendering without inline `style` props.
- Local main now also includes the follow-up auth/sandbox hardening slice from the same remediation set: exact `next-auth` beta pinning with an 8-hour JWT max age, token invalidation timestamps enforced in JWT/proxy/API auth, session revocation on admin password resets and role changes plus self password changes, self-service username/email restrictions, a Zod source-code size cap, timing-equalized invalid login checks, and run-phase seccomp hardening that fails closed instead of silently retrying without the custom profile.
- Local verification passed on 2026-03-08 with directory TypeScript diagnostics, `npm run lint`, `npm run build`, backup/restore script verification, targeted Playwright for `tests/e2e/ops-health.spec.ts`, targeted Playwright for `tests/e2e/admin-audit-logs.spec.ts tests/e2e/group-assignment-management.spec.ts tests/e2e/task12-destructive-actions.spec.ts`, and full `npx playwright test`.
- The current remediation batch was re-verified locally on 2026-03-08 with `npm run db:push`, `npm run lint`, `npm run build`, and `npm run test:e2e -- --grep @smoke`.
- Follow-up cleanup in the same local batch corrected the submission rate-limit timestamp comparison to use a typed Drizzle timestamp comparison, documented `AUTH_TRUST_HOST` in the example/deployment docs, and disabled Playwright local server reuse so `db:push` cannot be skipped by a stale process.
- The auth/sandbox follow-up batch was re-verified locally on 2026-03-09 with `npm run db:push`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `npm run test:e2e -- --grep @smoke`.
- The broader `P1.8` unit-test expansion batch was verified locally on 2026-03-10 with `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, and `npm run build`; direct Vitest coverage now includes permission helpers, assignment submission-access checks, the persisted rate-limit core, and the API mutation rate-limit wrapper.
- Local main now also includes Java 25 and Kotlin 2.3 judge support via a shared JVM image, plus CodeMirror syntax support for both languages in the submission/editor surfaces. Java submissions currently follow the standard `Main` entrypoint convention inside the judge.
- The runtime-expansion batch was verified locally on 2026-03-10 with `npm run languages:sync`, `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, `npm run build`, plus host-side Java/Kotlin compile-run smoke checks using downloaded official Temurin 25.0.2 and Kotlin 2.3.10 toolchains; Docker image build verification remains blocked in this session because no Docker daemon is reachable.

## Operational notes

- The demo host runs from `/home/ubuntu/online-judge`.
- The demo host must keep `JUDGE_POLL_URL=http://localhost:3000/api/v1/judge/poll`.
- The demo host still requires `JUDGE_DISABLE_CUSTOM_SECCOMP=1` because the custom seccomp profile is rejected on its Docker/kernel combination; local main now only applies the custom seccomp profile during run-phase execution and refuses silent fallback when that profile is enabled but unavailable.
- Do not assume the long-lived demo host still accepts the seeded `admin` / `admin123` credentials unless the instance was freshly reset and reseeded.

## Documentation sync points

- `README.md` now treats the classroom-management, audit, CI, and operational-hardening batches as current main capabilities.
- `README.md` and `docs/review.md` now treat assignment CRUD, audit logging, CI, and backup/observability baseline work as current completed batches.
- `README.md`, `.context/development/open-workstreams.md`, and `docs/review.md` now treat broader audit/event logging as locally complete rather than open roadmap work.
- `README.md`, `.context/development/open-workstreams.md`, and `docs/review.md` now treat CI and backup/observability baseline work as locally complete.
- `docs/deployment.md` now captures the deployed revision, the `time_zone` schema requirement, and the shared-host credential/env caveats.
- `docs/review.md` now records the timezone rollout plus the newer classroom/audit/ops and security-hardening status without leaving those batches marked as pending deploy.
- `docs/review-plan.md`, `docs/security-review-2026-03-08.md`, `docs/deployment.md`, and `.context/development/open-workstreams.md` now also record the locally completed security/API hardening batch and its verification state.
- `README.md`, `docs/deployment.md`, `docs/review-plan.md`, `docs/security-review-2026-03-08.md`, and `.context/development/open-workstreams.md` now also record the 2026-03-09 auth/session and seccomp follow-up batch, including the fail-closed run-phase sandbox behavior and self-service identity restrictions.
- `docs/review-plan.md`, `.context/development/open-workstreams.md`, and this file now also record the 2026-03-10 `P1.8` test-expansion follow-up batch and its local verification state.
- `docs/feature-plan.md`, `docs/review-plan.md`, `.context/development/open-workstreams.md`, and this file now also record the 2026-03-10 Java/Kotlin runtime-expansion batch.
- `AGENTS.md` already reflects that `system_settings` carries title, description, and timezone overrides.

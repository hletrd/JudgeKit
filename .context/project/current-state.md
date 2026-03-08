# Current State

Last updated: 2026-03-08

## Shipped and deployed

- `oj-demo.atik.kr` has been reverified on 2026-03-08 after the classroom-management and broader audit rollout.
- The deployed demo host serves the public login page over HTTP 200, redirects protected dashboard routes through login, and keeps both `online-judge.service` and `online-judge-worker.service` active.
- Admin system settings support a default timezone in addition to the site title and description.
- Rendered timestamps use the configured timezone on student/admin submission pages, admin user pages, and group assignment schedule views.

## Locally verified, not yet deployed

- The `dashboard-rendering-audit-and-editor-upgrades` plan is complete in the local repository.
- Local main now includes the instructor assignment status board and scoped assignment submission drill-down, admin login logs, theme switching, CodeMirror-based code surfaces, markdown-safe problem rendering, source-draft recovery, mixed submission ID support, and guarded user/problem delete flows.
- Local main also includes group membership management, assignment create/edit/delete flows, student assignment detail pages, assignment-linked submission paths, assignment-context enforcement from the generic problem view, synchronized problem-group access for assignment problems, and safety blocks on removing members, deleting assignments, or deleting groups after assignment submissions exist.
- Local main now also includes broader audit/event logging: append-only `audit_events`, an admin audit-log dashboard with request-context visibility, system-actor rendering, resource-ID search, and mutation coverage for settings, user-management, problems, groups, memberships, assignments, submissions, judge updates, profile edits, and password changes.
- Local main now also includes repository-native CI plus an operational-hardening baseline: GitHub Actions CI, a public `/api/health` readiness route, verified SQLite backup/restore scripts, and repo-managed systemd timer artifacts for scheduled backups.
- Local verification passed on 2026-03-08 with directory TypeScript diagnostics, `npm run lint`, `npm run build`, backup/restore script verification, targeted Playwright for `tests/e2e/ops-health.spec.ts`, and full `npx playwright test`.

## Operational notes

- The demo host runs from `/home/ubuntu/online-judge`.
- The demo host must keep `JUDGE_POLL_URL=http://localhost:3000/api/v1/judge/poll`.
- The demo host still requires `JUDGE_DISABLE_CUSTOM_SECCOMP=1` because the custom seccomp profile is rejected on its Docker/kernel combination.
- Do not assume the long-lived demo host still accepts the seeded `admin` / `admin123` credentials unless the instance was freshly reset and reseeded.

## Documentation sync points

- `README.md` now treats the classroom-management, audit, CI, and operational-hardening batches as current main capabilities.
- `README.md` and `docs/review.md` now treat assignment CRUD, audit logging, CI, and backup/observability baseline work as current completed batches.
- `README.md`, `.context/development/open-workstreams.md`, and `docs/review.md` now treat broader audit/event logging as locally complete rather than open roadmap work.
- `README.md`, `.context/development/open-workstreams.md`, and `docs/review.md` now treat CI and backup/observability baseline work as locally complete.
- `docs/deployment.md` now captures the deployed revision, the `time_zone` schema requirement, and the shared-host credential/env caveats.
- `docs/review.md` now records the timezone rollout plus the newer classroom/audit/ops status without leaving those batches marked as pending deploy.
- `AGENTS.md` already reflects that `system_settings` carries title, description, and timezone overrides.

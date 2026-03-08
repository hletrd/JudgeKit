# Open Workstreams

Last updated: 2026-03-08

The `dashboard-rendering-audit-and-editor-upgrades` batch is now locally verified and its plan docs are reconciled. The items below remain open outside that completed batch.

## Recently closed locally

- Assignment-aware submission validation, the group-scoped assignment board, and scoped instructor submission drill-down
- Login-event logging plus the admin login-log dashboard/navigation surface
- Theme switching, CodeMirror code surfaces, markdown rendering, draft recovery, mixed submission IDs, and guarded delete flows
- Group membership management plus assignment create/edit/delete flows, assignment-linked student detail pages, and submission guards tied to assignment schedules/history
- Broader audit/event logging across admin mutations, submission/judge lifecycle events, and the admin audit-log page
- GitHub Actions CI plus the operational-hardening baseline: `/api/health`, SQLite backup/restore scripts, and repo-managed backup timer artifacts

## Still open

- Additional language/runtime expansion work

## Safety note

- The demo host was reverified on 2026-03-08 after the classroom/audit rollout; future sessions should still verify the host again after any later deploy.
- Future sessions should isolate the next coherent batch before updating deployment-facing docs again.

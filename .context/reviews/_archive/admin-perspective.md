# Admin Perspective Review

**Reviewer**: System Administrator managing 500+ students across multiple courses
**Date**: 2026-05-04
**Scope**: All admin pages, system settings, worker management, audit/logging, backup/restore, roles, plugins, data management

---

## Executive Summary

JudgeKit delivers a solid, well-structured admin experience with comprehensive user management, granular role-based access control, and thorough audit logging. The capability-based permission system is particularly well-designed -- admins can create custom roles with fine-grained permissions across 13 capability groups. However, the platform lacks a centralized admin dashboard with aggregated metrics, has no in-app controls for data retention policies, and several high-frequency admin workflows (bulk operations, user search, user detail drill-down) have friction points that would slow down an admin managing a 500+ student deployment.

---

## Critical Issues

### 1. No Admin Dashboard / Overview Page

There is no landing page when an admin clicks into the admin section. The admin sidebar has 14 distinct pages but no overview that aggregates key metrics: total users, active users, submissions today, queue depth, worker status, recent audit events. An admin managing 500+ students must visit 4-5 separate pages to understand system health at a glance. The worker stats endpoint (`/api/v1/admin/workers/stats`) returns exactly the kind of data that should be on a dashboard, but it is buried two clicks deep.

**Impact**: High. Daily admin workflow requires visiting multiple pages to assess system health.

### 2. Data Retention Policies Are Not Admin-Configurable

Data retention periods are hardcoded in `/src/lib/data-retention.ts` with environment variable overrides only. An admin cannot adjust retention periods (audit events: 90 days, chat messages: 30 days, anti-cheat events: 180 days, submissions: 365 days) from the UI. For a university deploying this for a semester, the 90-day audit retention may be too short. For a contest platform, 30-day chat retention may be too aggressive. The legal hold mechanism (`DATA_RETENTION_LEGAL_HOLD`) is also env-var only.

**Impact**: High. Admins cannot adapt retention to institutional or regulatory requirements without server access.

### 3. User Detail Page Is Stripped Down

The user detail page at `/dashboard/admin/users/[id]` shows only 7 fields (username, name, email, class, role, status, joined date). There is no submission history, no group/course enrollment, no activity log, no anti-cheat events, no login history for that user. An admin investigating a specific student's behavior must manually cross-reference audit logs, submission lists, and login logs separately.

**Impact**: High. Troubleshooting individual users is a multi-page, multi-search exercise.

### 4. No User List Export

There is no way to export the user list (CSV/JSON) from the admin UI. The bulk import accepts CSV but there is no corresponding export. An admin who needs to generate a roster report, verify enrollment, or share user data with another system has no export path. The submissions and audit logs both have CSV export -- user management should too.

**Impact**: Medium-High. Blocks common administrative workflows like roster verification and handoff.

### 5. No Bulk User Operations Beyond CSV Import

Once users exist, there is no way to bulk-deactivate a section, bulk-change roles, or bulk-assign classes. The only bulk operation is CSV-based user creation. For a 500-student deployment where an entire section needs to be deactivated at semester end, the admin must click through each user one by one.

**Impact**: Medium-High. Semester-end cleanup and section management are painfully manual.

---

## Minor Issues

### 6. User Search Limited to Username and Name

The user list search (`/dashboard/admin/users`) filters on `username` and `name` only. Email and class name are not searchable. An admin trying to find "all students in section 3B" or searching by email address has no direct path.

### 7. No User Sorting Options

The user list is sorted by `createdAt desc` only. There is no ability to sort by role, status, class, or name. With 500+ users, finding all inactive students or all instructors requires the role filter (which exists) combined with manual scanning.

### 8. Settings Page Has 10 Tabs But No Search

The settings page groups 20+ configurable values across 10 tabs (general, security, submissions, judge, session, advanced, uploads, database, homepage, footer). There is no search or filter. An admin looking for "session timeout" must guess which tab it is in (session). The URL hash-based tab navigation (`#security`) helps for bookmarking but not for discovery.

### 9. No Scheduled Backup Mechanism

Backup and restore is manual-only through the settings page. There is no scheduled backup, no backup retention policy, and no notification when backups fail. The export and full backup both require password re-entry, which is good for security but means no automated backup pipeline can be built without the API.

### 10. No Email/Notification for Critical Events

When judge workers go offline, the submission queue backs up, or audit write failures occur, there is no notification mechanism. The admin health endpoint and metrics exist but require external monitoring to be useful. An admin who is not actively watching the workers page will not learn about worker failures until students report problems.

### 11. Role Editor Custom Role Level Cap at 2

Custom roles are capped at level 0-2 in the role editor dialog (`max={2}` on the level input). Built-in roles use levels 0-4 (student=0, assistant=1, instructor=2, admin=3, super_admin=4). This means custom roles can never exceed instructor level. While this is a reasonable security boundary, it is not explained in the UI -- the admin sees a number input with no rationale for the cap.

### 12. Health Endpoint vs. Admin Health Snapshot Disconnect

There are two health mechanisms: the public `/api/v1/health` endpoint (minimal DB check) and the internal `admin-health.ts` snapshot (comprehensive: DB, workers, queue depth, audit health, uptime, response time, app version, Prometheus metrics). The rich admin health data is not exposed through any admin UI or dedicated admin API endpoint. It exists as internal library code only.

### 13. Worker Stats View Logged as Audit Event

Every time an admin views the worker stats page, a `worker_stats.viewed` audit event is recorded. This is excessive -- read-only dashboard views should not generate audit noise. Over time, this will pollute the audit log with thousands of no-op entries.

### 14. Password Entry for Backup Is Not Masked Consistently

The backup password field uses a plain `<input type="password">` but it is styled differently from the standard UI `Input` component (no border-radius consistency with the rest of the form). The restore flow uses a similar pattern. Minor visual inconsistency.

### 15. Bulk Import Preview Limited to 50 Rows

The CSV bulk import shows only the first 50 rows in the preview table. For a 200-student import, the admin cannot verify the last 150 rows before submitting. The count is shown but scrolling would be more useful.

---

## Suggestions for Improvement

### High Priority

1. **Admin Dashboard**: Add an overview page at `/dashboard/admin` showing: total users (by role), active workers, queue depth, submissions today, recent audit events, and system health status. Use the existing `admin-health.ts` and `admin-metrics.ts` infrastructure.

2. **User Detail Enrichment**: Expand the user detail page to include: recent submissions (last 10), group/course enrollment, login history, and a link to filtered audit logs for that user. The data is already queryable.

3. **Data Retention Admin UI**: Add a "Data Retention" section in settings (or a dedicated tab) exposing the retention periods with clear labels, legal hold toggle, and a "run prune now" button. The underlying system is already built.

4. **User List Export**: Add CSV export to the user management page, mirroring the pattern already used in audit logs and submissions.

5. **Bulk User Actions**: Add multi-select with bulk deactivate, bulk role change, and bulk class assignment to the user list.

### Medium Priority

6. **User Search Expansion**: Extend user search to include email and className fields.

7. **User List Sorting**: Add sortable column headers (name, role, status, class, created date).

8. **Expose Admin Health API**: Create an authenticated `/api/v1/admin/health` endpoint returning the full `AdminHealthSnapshot` for external monitoring tools.

9. **Settings Search**: Add a search/filter input at the top of the settings page that highlights matching fields across all tabs.

10. **Scheduled Backups**: Add a simple backup scheduling mechanism (daily/weekly) with configurable retention, stored to disk or S3-compatible storage.

### Low Priority

11. **Worker Audit Noise**: Remove or downgrade the `worker_stats.viewed` audit event, or add a `suppressAudit` option for read-only dashboard endpoints.

12. **Role Level Documentation**: Add inline help text in the role editor explaining the level system and why custom roles are capped at 2.

13. **Bulk Import Preview**: Allow scrolling through all parsed rows in the CSV preview, not just the first 50.

14. **User Activity Timeline**: For the user detail page, consider a unified timeline showing submissions, logins, and audit events for that user in chronological order.

---

## What Works Well

- **Capability-based RBAC**: The 44-capability system with 13 groups is thorough and well-organized. The capability matrix in the role editor with select-all/deselect-all per group is excellent UX.
- **Audit Logging**: Comprehensive event tracking with resource type/action filters, date ranges, full-text search, CSV export, IP/user-agent tracking, and collapsible detail sections. The instructor-scoped filtering (only seeing their own groups' events) is a thoughtful design.
- **Login Logging**: Outcome-based filtering (success, invalid_credentials, rate_limited, policy_denied) with IP and user-agent tracking is exactly what security auditing needs.
- **Worker Management**: Stats dashboard, inline alias editing, heartbeat monitoring, add/remove workers, and the visibility-based polling are all well-implemented.
- **Language Management**: The Docker image lifecycle (build, remove, prune stale, reset to defaults, disk usage bar) is comprehensive. The recommended images datalist is a nice touch.
- **Backup/Restore**: Password-protected, two modes (portable export vs. full backup with files), restore confirmation flow, and audit logging of all operations.
- **Platform Modes**: The homework/exam/contest/recruiting mode system with policy implications (AI restriction, compiler restriction) is a smart abstraction for different deployment contexts.
- **i18n**: Full Korean and English localization across all admin pages.
- **Security Hygiene**: CSRF protection on all mutations, server-action origin validation, rate limiting, session invalidation on role/password changes, password re-entry for exports, and encrypted secret storage for hCaptcha.

---

## Overall Grade

**B+**

The admin experience is functional, secure, and well-structured. The permission system and audit logging are production-grade. The critical gap is the lack of an admin dashboard and the limited user detail/user bulk operation support, which would create real friction for an admin managing a multi-course deployment with 500+ students. The data retention gap (env-var only, no UI) is a compliance risk for institutional deployments. These are addressable issues -- the foundation is strong.
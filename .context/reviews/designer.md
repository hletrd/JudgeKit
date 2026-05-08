# Designer Review — Cycle 4/100

**Date:** 2026-05-08
**Scope:** Production browser review of https://algo.xylolabs.com (logged in as admin)
**Approach:** agent-browser skills for navigation, interaction, snapshot, and accessibility query

---

## Findings

### D1 — Breadcrumb shows raw i18n key on Discussion Moderation page
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/layout/breadcrumb.tsx:27`, `messages/en.json`, `messages/ko.json`
- **Problem:** The breadcrumb on `/dashboard/admin/discussions` displays `nav.discussions` as raw text instead of the translated label. This happens in BOTH English and Korean locales because the `nav.discussions` key is missing from the `nav` namespace in both message files.
- **Failure scenario:** Admin navigates to Discussion Moderation. The breadcrumb trail shows "Home > Dashboard > Administration > nav.discussions" instead of "Home > Dashboard > Administration > Discussion Moderation" (or Korean equivalent).
- **Fix:** Add `"discussions": "Discussion Moderation"` to `messages/en.json` under `nav` namespace, and `"discussions": "토론 관리"` to `messages/ko.json` under `nav` namespace.
- **Cross-agent agreement:** Also flagged by code-reviewer as missing i18n key.

### D2 — Missing nav i18n keys for workspace and control segments
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/layout/breadcrumb.tsx:23-24`
- **Problem:** The breadcrumb maps `workspace: "workspace"` and `control: "home"` to nav namespace keys that do not exist. If routes containing these segments ever appear in the dashboard layout breadcrumb, they will show raw keys.
- **Failure scenario:** Any future route under `/dashboard/workspace` or `/dashboard/control` would show raw i18n keys.
- **Fix:** Add `"workspace"` and `"home"` (or `"control"`) keys to the `nav` namespace in both locales, OR remove the mappings if these segments are never used in the dashboard breadcrumb context.

### D3 — Settings database tab renders connection string with masked credentials
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/(dashboard)/dashboard/admin/settings/database-info.tsx`
- **Problem:** The Database settings tab displays the connection string as `postgres://***:***@db:5432/***`. While the credentials are masked, exposing even the hostname (`db`) and port confirms internal infrastructure details that could aid reconnaissance.
- **Failure scenario:** An attacker with admin access (or XSS) learns the internal DB hostname is `db:5432`.
- **Fix:** Consider showing only the database type and version, not the connection string at all. The connection string is not actionable for admins via the UI.

---

## Verified Fixes from Prior Cycles

- Locale switcher (cycle 2): Korean locale works correctly across all tested pages
- Empty settings (cycle 2): System Settings renders with all tabs functional
- Empty audit logs (cycle 2): Audit Logs renders with filters and data
- Date formatting (cycle 2): Dates respect locale
- API Keys duplicate text (cycle 2): Fixed
- Role Management nested buttons (cycle 2): Fixed
- Uptime display (cycle 2): Shows actual process uptime (155s observed)

---

## Pages Tested

**Admin pages:** dashboard, admin, users, roles, audit-logs, login-logs, files, languages, settings (all tabs), workers, submissions, plugins, plugin chat-logs, tags, discussions
**Public pages:** problems, contests, groups, community, rankings, submissions, profile, playground, practice
**Interactive elements tested:** locale switcher (EN/KO), theme toggle (light/dark/system), add-user dialog, create-group dialog, create-contest form, create-problem form, settings tabs, filters

---

## No Other UI/UX Issues Found

All tested pages rendered correctly in both locales. Dark/light mode toggled properly. Form dialogs opened and displayed correct labels. No console errors observed during navigation.

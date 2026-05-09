# Cycle 2 Review Remediation Plan

**Date:** 2026-05-08
**Review source:** `.context/reviews/_aggregate.md` (cycle 2/100)
**HEAD:** main / c6dc70b5
**Goal:** Fix actionable findings from production browser review and code analysis.

---

## Items to implement this cycle

### 1. D1/C1 — Fix Korean locale switcher 404 bug
- **File:** `src/components/layout/locale-switcher.tsx`
- **Task:** Change `forceNavigate(nextUrl)` to `window.location.reload()` after setting the locale cookie. The app router does not support `/ko/` path prefix; locale is cookie-only.
- **Status:** DONE (commit a553e313)

### 2. D2/C2 — Fix empty System Settings page
- **File:** `src/app/(dashboard)/dashboard/admin/settings/settings-tabs.tsx`
- **Task:** Fix `useState` initializer accessing `window.location.hash` during hydration. Use `useEffect` to read hash after mount, or remove hash-based tab persistence.
- **Status:** DONE (commit 4b27ed7d — removed hash persistence entirely to avoid cascading renders)

### 3. D3 — Fix empty Audit Logs page
- **File:** `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx`
- **Task:** Investigate why server-rendered content is not appearing. Likely hydration/serialization issue with `Collapsible` or `Table` components. Consider simplifying or adding error boundary logging.
- **Status:** DONE (commit 5973fa7d — CollapsibleContent renders hidden div instead of null; error boundary logs in production)

### 4. D5/C5 — Fix date formatting to respect locale
- **File:** `src/lib/datetime.ts` (or equivalent)
- **Task:** Ensure `formatDateTimeInTimeZone` uses the passed locale parameter for formatting, not hardcoded `en-US`.
- **Status:** DONE (commit 1b0f5c1a — changed DEFAULT_LOCALE from "en-US" to "en")

### 5. D8/C6 — Fix File Management untranslated keys
- **File:** `messages/en.json`, `messages/ko.json` and/or `src/app/(dashboard)/dashboard/admin/files/page.tsx`
- **Task:** Add missing `apply` and `reset` keys to `common` namespace, or update page to use correct key names.
- **Status:** DONE (commit 60645706)

### 6. D9/C7 — Fix API Keys duplicate text
- **File:** `src/app/(dashboard)/dashboard/admin/api-keys/page.tsx`
- **Task:** Remove duplicate heading/description markup.
- **Status:** DONE (commit c7a193d4)

### 7. D10/C8 — Fix Role Management nested buttons
- **File:** `src/app/(dashboard)/dashboard/admin/roles/page.tsx`
- **Task:** Flatten nested button pattern in action column. Add aria-labels.
- **Status:** DONE (commit 7384c2be)

### 8. D7 — Fix Dashboard uptime display
- **File:** Dashboard health API (investigate `src/app/api/` or server action)
- **Task:** Find uptime data source and fix "0s" display bug.
- **Status:** DONE (commit 8992b6b5 — replaced Date.now() - PROCESS_STARTED_AT_MS with process.uptime())

---

## Deferred items (must record exit criteria)

| ID | Severity | File/Line | Reason for deferral | Exit criterion |
|---|---|---|---|---|
| D4 | MEDIUM | `/playground`, `/rankings`, `/submissions`, `/problem-sets` | Client-side loading delays require architecture change to SSR/Suspense. Out of scope for single-cycle fix. | Re-open when pages are refactored to use server components or streaming Suspense |
| D6 | MEDIUM | `/dashboard` | "Degraded" DB health is operational/infrastructure issue, not code bug. | Re-open if DB connection pool or health check logic has code-level defects |
| C3 | MEDIUM | `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:142-153` | JSON LIKE pattern is fragile but functional. Refactoring requires DB schema change. | Re-open when audit logs are refactored to use jsonb operators |
| C4 | MEDIUM | `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:325-359` | Heavy queries are functional for current data volume. Optimization requires query redesign. | Re-open when audit log query performance degrades (>2s observed) |
| P3 | MEDIUM | `src/app/(dashboard)/dashboard/admin/settings/page.tsx` | Large RSC payload is acceptable for admin-only page. | Re-open when settings page load time exceeds 3s |
| S1 | MEDIUM | `src/components/layout/locale-switcher.tsx` | Open redirect via locale switcher is theoretical; `pathname` comes from trusted navigation. | Re-open if `forceNavigate` is shown to accept external URLs |
| S3 | LOW | `/dashboard` | Health data exposure is by design for admin dashboard. | Re-open if non-admin users can view detailed worker stats |
| S4 | LOW | `/dashboard/admin/login-logs` | IP/UA exposure is by design for audit purposes. | Re-open if access controls need tightening |
| D11 | LOW | `/dashboard/admin/workers` | Stale worker cleanup is operational maintenance. | Re-open when auto-cleanup is scheduled |
| T1-T5 | LOW-MEDIUM | Various | Test coverage gaps are best-effort. | Re-open when test suite is expanded |

---

## Implementation order

1. D1 (locale switcher 404) — CRITICAL user-facing bug
2. D2 (empty settings) — HIGH admin functionality broken
3. D3 (empty audit logs) — HIGH admin functionality broken
4. D5 (date formatting) — MEDIUM i18n bug
5. D8 (untranslated keys) — LOW quick fix
6. D9 (duplicate text) — LOW quick fix
7. D10 (nested buttons) — LOW quick fix
8. D7 (uptime 0s) — MEDIUM operational display bug

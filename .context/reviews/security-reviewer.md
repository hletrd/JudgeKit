# Security Reviewer Review — Cycle 4/100

**Date:** 2026-05-08
**Scope:** Authentication, authorization, input validation, and data exposure in API routes and UI
**Approach:** Static analysis of API handlers, auth middleware, and admin-facing pages

---

## Findings

### S1 — Database connection string partially exposed in admin settings
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/(dashboard)/dashboard/admin/settings/database-info.tsx`
- **Problem:** The Database tab in System Settings displays the connection string as `postgres://***:***@db:5432/***`. While credentials are masked, the hostname (`db`) and port (`5432`) are visible to any admin user.
- **Impact:** LOW — requires admin access already. The information confirms internal network topology which aids reconnaissance if combined with other vulnerabilities.
- **Fix:** Display only database type, version, size, and table count. Remove the connection string entirely from the UI.
- **Cross-agent agreement:** Also noted by designer as D3.

---

## No Other Security Issues Found

API routes reviewed use `createApiHandler` with appropriate auth checks. Backup/restore routes require password re-confirmation and capability checks. CSRF protection is enforced for non-API-key auth. Rate limiting is applied to sensitive endpoints. No SQL injection vectors (Drizzle ORM parameterized queries). No XSS in rendered HTML (sanitizeHtml used). No IDOR vulnerabilities in tested routes — all resource access checks the user's capabilities and group membership.

**Routes verified for proper auth:**
- `/api/v1/users/[id]` — capability checks for view/edit/delete
- `/api/v1/groups/[id]` — ownership + capability checks
- `/api/v1/admin/workers/[id]` — system.settings capability required
- `/api/v1/admin/backup` — system.backup + password re-auth
- `/api/v1/admin/restore` — system.backup + password re-auth + integrity validation
- `/api/v1/contests/[id]/code-snapshots` — contests.view_analytics capability
- `/api/v1/contests/[id]/anti-cheat` — canManageContest check
- `/api/v1/contests/[id]/participant-timeline` — contests.view_analytics + submission view check

# Security Review — RPF Cycle 8

**Date:** 2026-04-22
**Reviewer:** security-reviewer
**Base commit:** 55ce822b

## Findings

### SEC-1: `file-management-client.tsx` uses `window.location.origin` for file URL construction — carried from DEFER-24 [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:96`

**Description:** Carried forward from prior cycles (DEFER-24). The `copyUrl` function constructs a file download URL using `window.location.origin`. Behind a misconfigured reverse proxy (e.g., Nginx not setting X-Forwarded-Host), the URL could point to the wrong host. Combined with `access-code-manager.tsx:134` and `workers-client.tsx:147`, there are now 3 instances of this pattern.

**Fix:** Use a server-provided `appUrl` config value.

**Confidence:** MEDIUM

---

### SEC-2: `comment-section.tsx` POST silently fails on `!response.ok` — no error feedback to user [MEDIUM/LOW]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:70-74`

**Description:** When a comment submission returns a non-OK response (e.g., 403 Forbidden due to permission change, or 413 Payload Too Large), the code does nothing — no toast, no error message. The user believes the comment was not submitted, but they also don't know *why* it failed. This is a security concern because a 403 response could indicate that the user's session was invalidated or their permissions were revoked, which they should be made aware of.

**Fix:** Add an `else` branch to show a toast error when `!response.ok`.

**Confidence:** HIGH

---

### SEC-3: `database-backup-restore.tsx` restore success path consumes response body without validation [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:150`

**Description:** After a successful restore, line 150 calls `await response.json()` and discards the result. If the response body is unexpectedly large or malformed, this could throw an uncaught error in the catch block, showing a generic error even though the restore actually succeeded. The user might believe the restore failed and retry it.

**Fix:** Either remove the unnecessary `await response.json()` call, or use `.json().catch(() => ({}))` to handle non-JSON bodies.

**Confidence:** LOW

---

## Final Sweep

The cycle 7 fixes are correctly applied. CSRF protection, auth config, session security, password hashing, Docker sandbox, shell command validation, and rate-limiter circuit breaker remain solid. The `safeJsonForScript` function in `json-ld.tsx` properly escapes `</script` and `<!--` sequences. The `sanitizeHtml` function is used for legacy HTML problem descriptions. The hCaptcha verification properly checks `response.ok` before parsing JSON. No new critical security findings.

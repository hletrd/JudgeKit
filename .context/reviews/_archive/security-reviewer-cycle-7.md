# Security Review — Cycle 7

**Reviewer:** security-reviewer (orchestrator direct)
**Date:** 2026-05-08
**Scope:** OWASP-style security audit of API routes, auth flows, and data handling

---

## Findings

### C7-SEC-1 [LOW, MEDIUM confidence] Admin error boundary logs full error object including potential stack traces

- **File:** `src/app/(dashboard)/dashboard/admin/error.tsx`, line 19
- **Code:** `console.error("[admin-error-boundary]", error.digest ?? error.message, error)`
- **Problem:** The third argument `error` passes the full Error object to console.error. While the comment states "The digest field is safe to log (no stack traces)", the full `error` object may include a `stack` property in some browser environments, leaking internal file paths and implementation details to the client console in production.
- **Impact:** Low — client-side only, requires already-compromised admin access to view console.
- **Fix:** Remove the third `error` argument; log only `error.digest` (server-safe) and `error.message` (user-facing).

### C7-SEC-2 [LOW, LOW confidence] File upload dialog timeout could leak callback reference after unmount

- **File:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx`, line 127
- **Problem:** The `setTimeout(() => { setQueue([]); onComplete(); }, 500)` closure captures `onComplete` from props. If the parent unmounts the dialog and its own cleanup is incomplete, the stale callback reference could execute against freed resources. This is theoretical — the parent is likely still mounted.
- **Impact:** Negligible — requires specific race condition timing.
- **Fix:** Store timeout ID and clear on unmount (same fix as C7-CR-3).

---

## Verified Security Posture

- All API routes use `createApiHandler` with proper auth/capability checks (219 routes verified)
- CSRF protection present on all mutating POST/DELETE/PATCH routes
- Rate limiting active on upload, delete, analytics, recruiting validate, and chat endpoints
- File uploads validate MIME type, magic bytes, ZIP decompressed size, and image dimensions
- SQL queries use parameterized Drizzle ORM; no dynamic SQL construction from user input
- Docker commands use `execFile` (array args) not shell execution; image tags validated with regex
- No secrets or credentials exposed in client-side bundles

---

## No Agent Failures

All review work performed directly by the orchestrator due to absence of registered Agent tools in this environment.

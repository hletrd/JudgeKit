# Security Reviewer — Cycle 9

**Date:** 2026-05-11
**HEAD reviewed:** `06f74d76`
**Change surface:** 0 new commits since cycle 8.

---

## Finding C9-SR-1: Auth forms vulnerable to false-positive success on non-JSON 200 responses (LOW)

**Files:**
- `src/app/(auth)/verify-email/page.tsx:38-50`
- `src/app/(auth)/forgot-password/forgot-password-form.tsx:34-55`
- `src/app/(auth)/reset-password/reset-password-form.tsx:52-73`
- `src/app/(public)/problems/create/create-problem-form.tsx:343-356`
**Confidence:** High

These components parse JSON with `.catch(() => fallback)` and branch on `res.ok` alone. If a reverse proxy or WAF returns an HTML success page with HTTP 200 (a common misconfiguration), the component treats it as a successful API response. For auth flows, this could mislead users into believing an action succeeded when it did not (e.g., password reset email not actually sent, email not verified).

**Security impact:** UX-level deception, not direct data breach. Could cause users to miss critical security events.

**Suggested fix:** Use `apiFetchJson` which validates both `res.ok` and parse success.

---

## Finding C9-SR-2: SIGINT forced exit prevents audit buffer flush completion (LOW)

**File:** `src/lib/audit/node-shutdown.ts:48-50`
**Confidence:** Medium

The SIGINT handler uses `.finally(() => { processLike.exit?.(130); })`. If `flushAuditBuffer()` is still in flight when the process receives a second SIGINT, the first `.finally()` may race with the second signal handler. More importantly, calling `exit(130)` immediately terminates the process, which could truncate in-flight audit events that haven't been written to the buffer yet.

**Suggested fix:** Remove forced exit, matching SIGTERM behavior.

---

## Final Sweep

No SQL injection vectors, auth bypasses, XSS sinks, or secret leaks were found in new or existing code. The `sanitizeHtml` usage in `problem-description.tsx` remains properly scoped. The `safeJsonForScript` usage in `json-ld.tsx` correctly escapes script-breakout sequences. File upload validation (magic bytes, ZIP bomb protection, image processing) remains robust.

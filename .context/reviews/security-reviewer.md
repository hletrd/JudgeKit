# Security Reviewer — Cycle 27

**Date:** 2026-05-09
**Cycle:** 27 of 100
**Base commit:** 5771402a
**Current HEAD:** 5771402a (clean working tree)

---

## New Findings

### C27-SEC-1: Type-unsafe cast in Docker inspect consumption

- **File:** `src/app/api/v1/admin/docker/images/route.ts:30`
- **Severity:** Low
- **Confidence:** High
- **Summary:** `info.Created as string` trusts the remote worker/local Docker API to return a well-formed string. A compromised or buggy worker could return a non-string, causing `NaN` propagation and logic bypass (stale detection fails). While the admin Docker API requires `system.settings` capability, defense-in-depth validation is warranted for external-system data.
- **Fix:** Validate `typeof info.Created === "string"` before calling `new Date()`.

### C27-SEC-2: DELETE Docker image audit gap

- **File:** `src/app/api/v1/admin/docker/images/route.ts:129-135`
- **Severity:** Low
- **Confidence:** High
- **Summary:** Missing audit log for rejected DELETE operations means an admin with `system.settings` capability could attempt to delete non-judge images without leaving an audit trail. The POST handler logs rejections.
- **Fix:** Add `recordAuditEvent` for DELETE rejections.

### C27-SEC-3: Prompt injection sanitization gap

- **File:** `src/lib/judge/prompt-sanitization.ts:12`
- **Severity:** Low
- **Confidence:** Medium
- **Summary:** The `<<>>` empty delimiter is not matched by the current regex. Additionally, several modern prompt injection patterns are absent: ChatML format (`<|im_start|>`, `|>`, `<|im_end|>`), XML-style system tags, and template injection (`{{...}}`). The sanitization is best-effort but should be expanded.
- **Fix:** Expand pattern coverage for modern LLM delimiter formats.

---

## Verified Secure (no change)

- SQL parameterization: All raw queries use named parameters with validation
- Auth tokens: Constant-time comparison via `safeTokenCompare`
- Docker build: Path validation + array-based spawn (no shell injection)
- File upload: MIME validation, magic bytes, ZIP bomb protection
- Rate limiting: Two-tier DB-backed with sidecar fast-path
- CSRF: Validated on all mutation methods

---

## Carry-Forward

- C26-1 (LLM prompt injection): FIXED in cycle 26. Sanitization active.

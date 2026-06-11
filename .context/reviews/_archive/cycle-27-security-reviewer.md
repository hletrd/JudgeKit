# Cycle 27 Security Reviewer

**Date:** 2026-04-22
**Base commit:** 14025d58

## Findings

### SEC-1: Ungated `console.error` leaks error details in production across 14 client components [MEDIUM/MEDIUM]

**Files:** (see code-reviewer CR-1, CR-2, CR-3, CR-4 for full list)

**Description:** 14 client-side `console.error()` calls across discussion, admin, dialog, and compiler components write unstructured error data to browser DevTools in production. While the user-facing toasts use i18n keys (safe), the console output may include raw API error messages, stack traces, or internal paths. The error boundary components were already fixed to gate behind `process.env.NODE_ENV === "development"`, but the API-consuming components were not.

**Concrete failure scenario:** A failed API call to `POST /api/v1/community/threads` returns `{ "error": "Internal server error: column 'foo' not found at query.ts:42" }`. The `console.error` writes this to the browser console, exposing the SQL column name and file path to any user who opens DevTools.

**Fix:** Gate all client-side `console.error` calls behind `process.env.NODE_ENV === "development"`.

**Confidence:** HIGH

### SEC-2: `bulk-create-dialog.tsx:194` leaks `err.message` to user via i18n interpolation [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:194`

**Description:** `setParseError(t("bulkCsvParseError", { message: err.message }))` interpolates the raw `err.message` from papaparse into a translated string shown to the user. While papaparse errors are typically benign (e.g., "Quoted field not terminated"), this pattern of interpolating raw error messages into user-visible strings is inconsistent with the codebase's convention of never showing raw error details to users.

**Concrete failure scenario:** A papaparse internal error message containing file path details is shown to the user. Low likelihood but inconsistent with security posture.

**Fix:** Replace `err.message` with a sanitized version or a generic fallback.

**Confidence:** LOW

### SEC-3: `admin-config.tsx` double `.json()` pattern -- security consistency [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:99+103`

**Description:** Same anti-pattern as identified in code-reviewer CR-5. While not directly exploitable (the `return` prevents double consumption), the pattern is inconsistent with the documented security convention in `src/lib/api/client.ts:44-52` which marks this as "DO NOT USE".

**Confidence:** LOW

## Verified Safe

- Auth flow robust with Argon2id, timing-safe dummy hash, rate limiting, token invalidation.
- No `dangerouslySetInnerHTML` without sanitization.
- CSRF protection via `X-Requested-With` header in `apiFetch`.
- Rate limiting has two-tier strategy preventing TOCTOU races.
- Recruiting token flow uses atomic SQL transactions.
- Environment variables properly validated in production.
- No `as any` type casts.
- No `@ts-ignore` or `@ts-expect-error`.
- Server actions properly gated with auth checks.
- Encryption key handling uses `requireNonEmptyEnv` with production enforcement.
- `safeJsonForScript` prevents `</script>` injection in JSON-LD.
- `sanitizeHtml` with DOMPurify prevents XSS in problem descriptions.
- Anti-cheat heartbeat uses recursive `setTimeout` (not `setInterval`).

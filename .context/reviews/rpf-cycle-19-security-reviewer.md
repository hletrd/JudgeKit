# Security Review — RPF Cycle 19

**Date:** 2026-04-20
**Reviewer:** security-reviewer
**Base commit:** 77da885d

## Findings

### SEC-1: `document.execCommand("copy")` is deprecated and has inconsistent security behavior across browsers [LOW/MEDIUM]

**Files:** `src/components/code/copy-code-button.tsx:29`, `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:224`
**Description:** Both files use `document.execCommand("copy")` as a fallback when `navigator.clipboard.writeText()` fails. `execCommand("copy")` is deprecated in the HTML specification and browsers are progressively removing support. In some browser versions, `execCommand("copy")` can be silently blocked by the browser's security model (e.g., Firefox in certain configurations) without throwing an error, meaning the code proceeds as if the copy succeeded.
**Concrete failure scenario:** On Firefox 130+, `execCommand("copy")` silently returns `true` without actually copying to the clipboard when triggered from a non-user-initiated context. The `copy-code-button.tsx` now shows an error toast when `execCommand` returns `false`, but the silent-failure case is not handled.
**Fix:** Add a note documenting the known limitation. Consider adding a `document.queryCommandSupported("copy")` check before attempting the fallback, and warn the user that clipboard access may be restricted in their browser.

### SEC-2: No new security regressions found [INFO/N/A]

**Description:** The codebase continues to maintain strong security practices:
- HTML sanitization uses DOMPurify with strict allowlists (2 `dangerouslySetInnerHTML` uses, both properly sanitized)
- No `as any`, `@ts-ignore`, or `@ts-expect-error` in the codebase
- Only 2 eslint-disable directives, both with justification comments
- No `innerHTML` assignments
- Auth flow remains robust with Argon2id, timing-safe dummy hash, rate limiting, and proper token invalidation
- CSRF protection is consistent across all mutation routes
- All `new Date()` in API routes have been migrated to `getDbNowUncached()` where temporal consistency matters

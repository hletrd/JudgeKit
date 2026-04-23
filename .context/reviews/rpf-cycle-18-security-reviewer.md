# Security Reviewer — RPF Cycle 18

**Date:** 2026-04-20
**Base commit:** 2b415a81

## SEC-1: `document.execCommand("copy")` creates hidden textarea — minor DOM injection surface [LOW/LOW]

**Files:** `src/components/code/copy-code-button.tsx:21-31`, `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:217-228`
**Description:** Both components create a hidden `<textarea>` element, set its value to the copy content, append it to `document.body`, select it, call `document.execCommand("copy")`, then remove it. The value is set via `textarea.value` (not `innerHTML`), so there is no XSS risk. The only concern is that the textarea briefly exists in the DOM, which could be read by malicious browser extensions.
**Concrete failure scenario:** A malicious browser extension could read the temporary textarea's value during the brief window it exists in the DOM. This is a very low severity issue since such an extension could also intercept clipboard events directly.
**Fix:** No action required — the risk is negligible and equivalent to the Clipboard API's own exposure to extensions.

## SEC-2: CSRF header present on all mutation routes — verified consistent [VERIFIED]

All mutation API routes either use `createApiHandler` (which adds CSRF validation) or manually include the `X-Requested-With: XMLHttpRequest` header check. The `apiFetch` client wrapper automatically adds this header when not present. All direct `fetch()` calls in admin components also include the header manually. No gaps found.

## SEC-3: HTML sanitization is comprehensive — verified safe [VERIFIED]

- JSON-LD uses `safeJsonForScript()` which runs `JSON.stringify()` + replaces `</script` sequences.
- Legacy HTML problem descriptions use DOMPurify with a strict allowlist of tags and attributes, `ALLOW_DATA_ATTR: false`, and a restrictive URI regex.
- Markdown content is rendered by `react-markdown` with `skipHtml`, which is inherently XSS-safe.

## Verified Safe

- No secrets or credentials hardcoded in source code.
- Rate limiting is in place with two-tier strategy (sidecar + PostgreSQL with SELECT FOR UPDATE).
- Recruiting token flow uses atomic SQL transactions.
- Judge worker Docker access goes through a proxy, not direct socket mount.

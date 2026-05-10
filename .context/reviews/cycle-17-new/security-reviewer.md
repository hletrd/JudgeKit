# Cycle 17 Security Review

**Date:** 2026-05-08
**Base commit:** 919c8ba3
**Reviewer angle:** Security, OWASP, auth/authz, data handling

## Scope
- API routes (`src/app/api/`)
- Auth layer (`src/lib/auth/`)
- Security utilities (`src/lib/security/`)
- Data handling patterns

## Findings

### C17-SEC-1 — [LOW] `JsonLd` component does not escape U+2028/U+2029 in JSON

- **Severity:** LOW (defense-in-depth XSS)
- **Confidence:** MEDIUM
- **Files:** `src/components/seo/json-ld.tsx:11-15`
- **Evidence:** The `safeJsonForScript` function escapes `</script` and `<!--` sequences but does not handle Unicode line separator (U+2028) and paragraph separator (U+2029) characters. In older browsers (pre-ES2019), these characters are valid in JSON but invalid in JavaScript string literals, which could break the JSON parsing inside the script tag. While modern browsers handle this correctly per ES2019, defense-in-depth suggests escaping them.
- **Failure scenario:** A JSON-LD data object contains user-contributed text with U+2028 or U+2029. In an older browser or strict parser, the script tag content breaks, potentially exposing the page to script injection if fallback parsing is unsafe.
- **Suggested fix:** Add `.replace(/ /g, "\\u2028").replace(/ /g, "\\u2029")` to `safeJsonForScript`.

### C17-SEC-2 — [LOW] `locale-switcher.tsx` sets cookie without `Secure` flag on HTTP

- **Severity:** LOW (cookie security)
- **Confidence:** HIGH
- **Files:** `src/components/layout/locale-switcher.tsx:43`
- **Evidence:** The cookie is set with `${location.protocol === "https:" ? "Secure; " : ""}` which omits the `Secure` flag on HTTP connections. While the `SameSite=Lax` flag provides some protection, the locale cookie could be sent over unencrypted connections if the site is accessed via HTTP.
- **Failure scenario:** User accesses the site over HTTP (e.g., local development or misconfigured reverse proxy). The locale cookie is sent unencrypted and could be read by a network attacker.
- **Suggested fix:** Always include `Secure` flag (sites should always run behind HTTPS in production). Or document that HTTP mode is development-only.

## Verified Safe

- `dangerouslySetInnerHTML` in `problem-description.tsx` is guarded by `sanitizeHtml`
- `dangerouslySetInnerHTML` in `json-ld.tsx` is guarded by `safeJsonForScript`
- All API routes have proper auth checks via `createApiHandler` or manual guards
- No raw SQL injection vectors found (all parameterized or module-level constants)
- CSRF tokens validated on state-changing POST endpoints

## Final Sweep

- Checked all API routes for missing auth — none found
- Checked for secrets in code — none found
- Checked for unsafe eval/exec — none found
- No relevant files were skipped.

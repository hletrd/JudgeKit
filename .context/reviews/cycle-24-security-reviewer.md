# Security Reviewer — Cycle 24

**Date:** 2026-04-20
**Base commit:** f1b478bc

## Findings

### SEC-1: Silent error handlers hide API failures from admin users [MEDIUM/MEDIUM]

**Files:**
- `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:61-62,75-76`
- `src/components/lecture/submission-overview.tsx:101-102`
- `src/components/contest/invite-participants.tsx:49-50`

**Description:** Multiple `catch { // ignore }` blocks in admin and instructor-facing components silently swallow API errors. While not directly a security vulnerability, this can mask service degradation or interception. An admin who cannot see chat logs (due to a MITM or API failure) has no indication that something is wrong.
**Concrete failure scenario:** A network interceptor blocks admin API calls. The admin sees empty lists instead of error messages, unaware that data is being suppressed.
**Fix:** Replace silent catch blocks with toast.error feedback. This aligns with the project convention in `src/lib/api/client.ts`.
**Confidence:** MEDIUM

### SEC-2: `ContestsLayout` click interception bypasses Next.js navigation security [LOW/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/contests/layout.tsx:16-28`
**Description:** The contests layout intercepts all internal `<a>` clicks and forces `window.location.href = href`. This bypasses Next.js router's security checks (e.g., same-origin validation) and could potentially be exploited if a malicious href is injected into the DOM. However, since the href comes from the `getAttribute("href")` of an `<a>` element in the React virtual DOM, the risk is low.
**Concrete failure scenario:** An XSS vulnerability in contest page content injects an `<a href="javascript:alert(1)">` element. The layout's handler would call `me.preventDefault()` but then `window.location.href = "javascript:alert(1)"` would not execute (browsers block javascript: URLs set via location.href), so this specific vector is safe. But the pattern of bypassing Next.js navigation is a defense-in-depth concern.
**Fix:** Add an explicit check for `javascript:` and `data:` scheme URLs before setting `window.location.href`.
**Confidence:** MEDIUM

## Verified Safe

- All API routes use `apiFetch` for client-side calls (except server-side routes which use `fetch` directly — correct).
- CSRF protection via `X-Requested-With` header is centralized in `apiFetch`.
- Secret values (AUTH_SECRET, JUDGE_AUTH_TOKEN) are validated for minimum length and against placeholder values.
- `dangerouslySetInnerHTML` uses `sanitizeHtml()` for problem descriptions and `safeJsonForScript()` for JSON-LD.
- No secrets in client-side code (all `process.env` references for secrets are server-only).
- Security headers (CSP, HSTS, X-Frame-Options, etc.) are properly configured in `next.config.ts` and `proxy.ts`.

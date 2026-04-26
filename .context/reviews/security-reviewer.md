# Security-Reviewer Pass — RPF Cycle 2/100

**Date:** 2026-04-26
**Lane:** security-reviewer
**Scope:** OWASP Top 10, secrets, auth/authz, CSP, cookies

## Summary

No new security regressions from cycle-1 changes. The new `getAuthSessionCookieNames` factory makes cookie clearing more maintainable — both variants are cleared on logout regardless of current security context, which is a security positive. Working-tree changes preserve these improvements.

## Findings

### SEC2-1: [LOW] `__Secure-` cookie cleared with `secure: true` over HTTP — browser silently ignores
**File:** `src/proxy.ts:94`
**Confidence:** MEDIUM

`response.cookies.set(secureName, "", { maxAge: 0, path: "/", secure: true })` is called unconditionally on every clear. If the request arrived over HTTP (e.g., dev mode or behind a misconfigured proxy without HTTPS), the browser ignores `Set-Cookie` with `Secure`, leaving the `__Secure-` cookie in place. In production this is correct (HTTPS guaranteed).

**Fix:** Either condition `secure: true` on `request.url.startsWith("https://")` or accept this is dev-only nuisance and document it. Defer — production unaffected.

### SEC2-2: [LOW] CSRF protection relies on cookie clearing during invalidation; brief race window
**File:** `src/proxy.ts:294-318`
**Confidence:** LOW

If a request arrives with a token that no longer maps to an active user (`!activeUser`), the proxy clears cookies and redirects/401s. During the next-immediately-fired request, the old cookie may still be sent (browser hasn't processed Set-Cookie yet) and trigger another full DB lookup before being rejected. Not a vulnerability per se — wasted DB roundtrip.

**Fix:** Defer; benign.

### SEC2-3: [INFO] `aria-hidden="true"` on ShieldAlert is correct and doesn't impact security
Verified via `git show 5cde234e`.

### SEC2-4: [INFO] Anti-cheat localStorage stores event timestamps and types but **not** problem text — verified
Comment at line 249 confirms text content is intentionally NOT captured to avoid storing copyrighted exam problem text in audit logs. Good privacy hygiene.

### SEC2-5: [INFO] CSP correctly uses nonce-based script-src; no `unsafe-inline` for scripts
File: `src/proxy.ts:206-222`. Style-src has `unsafe-inline` (Tailwind requirement). Dev includes `unsafe-eval` for HMR. Signup page allows hCaptcha. All correct.

### SEC2-6: [INFO] `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` set
File: `src/proxy.ts:218,225,226`. OWASP-recommended headers all present.

## Carried Items

- AGG-11 from cycle 1 (password.ts dictionary/similarity vs AGENTS.md doc) remains DEFERRED pending policy decision per `AGENTS.md:517-521`.

## Confidence

No HIGH severity findings. SEC2-1 is the only marginal one (MEDIUM, dev-only nuisance).

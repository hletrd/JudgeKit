# Cycle 13 Security Reviewer Report

**Date:** 2026-04-19
**Base commit:** e8340da5
**Reviewer angle:** OWASP top 10, secrets, unsafe patterns, auth/authz

---

## CR13-SR1 — [MEDIUM] `getDropdownItems` fallback role checks create authorization inconsistency

- **File:** `src/components/layout/public-header.tsx:70-72`
- **Confidence:** HIGH
- **Evidence:** When `capabilities` is undefined, the function falls back to hardcoded role name checks (`role === "instructor" || role === "admin" || role === "super_admin"`). This is a client-side UI concern (which nav items to show), not a security boundary — all actual access control is enforced server-side. However, the inconsistency means custom roles with equivalent capabilities may not see navigation items they should, potentially leading to confusion or support tickets. The real risk is that a developer might copy this pattern for server-side authorization.
- **Scenario:** Custom role "grader" with `problems.create` capability doesn't see "Problems" in the dropdown.
- **Suggested fix:** Remove the fallback. Make `capabilities` required when user is logged in. Navigation should never guess from role names.

## CR13-SR2 — [LOW] `validateExport` does not check for duplicate table names

- **File:** `src/lib/db/export.ts:307`
- **Confidence:** LOW
- **Evidence:** Already deferred as D19/D20. No change since last review.

## CR13-SR3 — [LOW] CSP `style-src 'unsafe-inline'` still present

- **Confidence:** LOW
- **Evidence:** Already deferred as D25. Required for Tailwind/component libraries. No change.

## CR13-SR4 — [LOW] `npm_package_version` exposed in export metadata

- **File:** `src/lib/db/export.ts:64`
- **Confidence:** LOW
- **Evidence:** Already deferred as D26. Admin-gated feature. No change.

## CR13-SR5 — [LOW] `(control)` layout does not use `PublicHeader` — separate header without CSRF-visible nav consistency

- **File:** `src/app/(control)/layout.tsx:60-63`
- **Confidence:** LOW
- **Evidence:** The control layout has its own header (ThemeToggle + LocaleSwitcher) without the unified PublicHeader. This means control panel users don't see the same navigation as dashboard users. Not a security issue per se, but the divergence means security-related UI patterns (like the sign-out button placement) are inconsistent.
- **Suggested fix:** Part of Phase 3 migration — merge control into dashboard layout.

---

## Final Sweep

- Auth module (`config.ts`, `recruiting-token.ts`, `session-security.ts`, `types.ts`) is well-structured after cycle 12 remediation. The `mapUserToAuthFields` centralization eliminates the inline field list anti-pattern.
- Rate limiting is comprehensive with exponential backoff and multi-key support.
- SSE route has proper re-auth checks with early `closed` guards.
- `dangerouslySetInnerHTML` usage is limited to two locations: `json-ld.tsx` (uses `safeJsonForScript`) and `problem-description.tsx` (uses `sanitizeHtml`). Both are properly sanitized.
- No `eval()` or `new Function()` patterns found.
- No Supabase usage — all DB access is through Drizzle ORM with parameterized queries. Raw `sql` template usage properly uses Drizzle's parameterized interpolation.
- LIKE queries consistently use `escapeLikePattern()` with `ESCAPE '\\'` clause.

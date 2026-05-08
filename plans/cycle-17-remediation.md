# Cycle 17 Remediation Plan

**Date:** 2026-05-08
**Based on:** `.context/reviews/cycle-17-new/_aggregate.md` (Cycle 17)

---

## Active Tasks

### C17-1: Fix `DropdownMenuShortcut` unconditional `tracking-widest`
- **File:** `src/components/ui/dropdown-menu.tsx:247`
- **Severity:** LOW
- **Status:** DONE
- **Commit:** `7d700bef`
- **Description:** `DropdownMenuShortcut` applies `tracking-widest` unconditionally. Per CLAUDE.md, Korean text must use default letter spacing.
- **Fix:** Since `DropdownMenuShortcut` is used for keyboard shortcut text (ASCII-only), document the ASCII-only requirement in a code comment. The component is a UI primitive for shortcut labels, not general text.

### C17-2: Add U+2028/U+2029 escaping to `safeJsonForScript`
- **File:** `src/components/seo/json-ld.tsx:11-15`
- **Severity:** LOW
- **Status:** DONE
- **Commit:** `6fdf3e3c`
- **Description:** `safeJsonForScript` does not escape Unicode line/paragraph separators, which could break JSON parsing in pre-ES2019 environments.
- **Fix:** Add `.replace(/ /g, "\\u2028").replace(/ /g, "\\u2029")` to the escape chain.

### C17-3: Add `.catch()` to `beforeExit` audit flush handler
- **File:** `src/lib/audit/node-shutdown.ts:29`
- **Severity:** LOW
- **Status:** DONE
- **Commit:** `d75041f3`
- **Description:** The `beforeExit` handler calls `void flushAuditBuffer()` without error handling.
- **Fix:** Add `.catch(() => {})` for consistency with other fire-and-forget patterns.

### C17-4: Always set `Secure` flag on locale cookie
- **File:** `src/components/layout/locale-switcher.tsx:43`
- **Severity:** LOW
- **Status:** DONE
- **Commit:** `19e7ddc2`
- **Description:** Cookie omits `Secure` flag on HTTP connections.
- **Fix:** Always include `Secure;` in the cookie string. Production deployments should always use HTTPS.

### C17-5: Fix `public-footer.tsx` year SSR/hydration risk
- **File:** `src/components/layout/public-footer.tsx:20`
- **Severity:** LOW
- **Status:** DONE
- **Commit:** `99ec0351`
- **Description:** `new Date().getFullYear()` computed at SSR time could mismatch client during year boundary.
- **Fix:** Use a stable year or suppress hydration mismatch for the copyright element.

---

## Deferred Items

### D-C17-1: Missing test for `handleSignOutWithCleanup` error path
- **File:** `src/lib/auth/sign-out.ts:75-89`
- **Severity:** LOW (test gap)
- **Confidence:** HIGH
- **Reason for deferral:** Test gap, not security/correctness/data-loss. Implementing tests is valuable but lower priority than fixing active code issues.
- **Exit criterion:** When component test coverage for auth utilities is expanded.

### D-C17-2: Missing component tests for mobile menu focus trap
- **File:** `src/components/layout/public-header.tsx:105-129`
- **Severity:** LOW (test gap)
- **Confidence:** HIGH
- **Reason for deferral:** Test gap, not security/correctness/data-loss. Focus trap testing requires complex DOM simulation.
- **Exit criterion:** When accessibility-focused component tests are added.

---

## Gate Requirements

- [x] eslint passes
- [x] tsc --noEmit passes
- [x] next build passes
- [x] vitest run passes (314 files, 2338 tests)
- [x] vitest run --config vitest.config.component.ts passes (66 files, 179 tests)

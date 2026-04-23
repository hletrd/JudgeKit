# Security Review — RPF Cycle 24

**Date:** 2026-04-22
**Base commit:** dbc0b18f

## SEC-1: Raw `error.message` leaked to users in discussion components [MEDIUM/MEDIUM]

**Files:**
- `src/components/discussions/discussion-post-form.tsx:54`
- `src/components/discussions/discussion-thread-form.tsx:61`
- `src/components/discussions/discussion-post-delete-button.tsx:36`
- `src/components/discussions/discussion-thread-moderation-controls.tsx:83,104`

**Description:** These components use `toast.error(error instanceof Error ? error.message : errorLabel)`. When unexpected errors occur (e.g., a SyntaxError from a non-JSON response body), the raw JavaScript error message is displayed to the user. This can leak internal implementation details (file paths, stack fragments, API structure) to attackers.

**Concrete failure scenario:** A proxy returns HTML on a 502 error. The `.json()` parse fails with `SyntaxError: Unexpected token < in JSON at position 0`. This exact message is shown in the toast, revealing that the app uses JSON APIs and that a reverse proxy is in front.

**Fix:** Always display i18n labels in toasts. Log raw errors to console only.

---

## SEC-2: `group-members-manager.tsx` default error handler leaks raw error messages [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:102`

**Description:** The `getErrorMessage` default case returns `error.message || tCommon("error")`. Any unexpected error has its raw message displayed to the user.

**Fix:** Return `tCommon("error")` always in the default case.

---

## SEC-3: `window.location.origin` used for URL construction — carried as DEFER-24 [LOW/MEDIUM]

**Files:**
- `src/components/contest/access-code-manager.tsx:137`
- `src/components/contest/recruiting-invitations-panel.tsx:99`

**Description:** Already tracked as DEFER-24. Still present. The `access-code-manager.tsx:137` constructs a share link using `window.location.origin`. If the page is served over HTTP or on an unexpected host, the invitation link uses the wrong origin.

---

## Summary

- MEDIUM: 2 (SEC-1, SEC-2)
- LOW: 1 (SEC-3, carried)
- Total new findings: 2

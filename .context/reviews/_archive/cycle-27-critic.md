# Cycle 27 Critic

**Date:** 2026-04-22
**Base commit:** 14025d58

## Findings

### CRI-1: Inconsistent `console.error` gating -- half-measure security pattern [MEDIUM/MEDIUM]

**Description:** The codebase fixed error boundary components to gate `console.error` behind `process.env.NODE_ENV === "development"`, but left 14+ other client-side `console.error` calls ungated. This is a half-measure that sends a mixed signal: developers may assume that `console.error` is acceptable in production for non-error-boundary code, even though the convention says otherwise. The security benefit of gating the error boundaries is undermined if the same sensitive error data leaks through other `console.error` calls in the same request flow.

**Failure scenario:** An API error occurs. The error boundary catches the resulting React render error and correctly suppresses the `console.error` in production. But the original API-consuming component already logged the raw error body to the console before the error boundary was triggered. The security gate is bypassed.

**Fix:** Gate all client-side `console.error` calls behind dev-only checks. Create a shared utility if needed.

**Confidence:** HIGH

### CRI-2: `admin-config.tsx` double `.json()` -- incomplete cycle 26 migration [LOW/MEDIUM]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:99+103`

**Description:** The cycle 26 AGG-1 fix migrated 3 files from the double `.json()` anti-pattern to "parse once, then branch". The `admin-config.tsx` was missed because it lives in the plugins directory. This is a pattern consistency issue: the codebase convention documents this as "DO NOT USE", but the plugin code violates it.

**Fix:** Migrate to "parse once, then branch" pattern.

**Confidence:** MEDIUM

### CRI-3: `bulk-create-dialog.tsx` interpolates raw `err.message` into user-visible string [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:194`

**Description:** `setParseError(t("bulkCsvParseError", { message: err.message }))` passes raw error message text from papaparse into an i18n string that is displayed to the user. While papaparse errors are generally benign, this pattern contradicts the codebase's principle of never showing raw error details to users.

**Fix:** Sanitize or replace with a generic fallback.

**Confidence:** LOW

## Verified Safe

- The codebase is in excellent shape overall after 26+ review cycles.
- All prior cycle-27 findings (clock-skew, toLocaleString, non-null assertion) are confirmed fixed.
- Security posture is strong: Argon2id passwords, timing-safe comparisons, CSRF protection, rate limiting, DOMPurify sanitization, SQL parameterization.
- The `createApiHandler` middleware pattern is well-designed and consistently applied.
- Korean letter-spacing is properly locale-conditional throughout.

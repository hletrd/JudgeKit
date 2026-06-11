# Cycle 27 Verifier

**Date:** 2026-04-22
**Base commit:** 14025d58

## Findings

### V-1: 14 client-side `console.error` calls violate documented "dev-only" logging convention [MEDIUM/MEDIUM]

**Evidence:**
- Convention documented in `src/lib/api/client.ts:23`: "Log errors in development only"
- Error boundary components (4 files) correctly gate `console.error` behind `process.env.NODE_ENV === "development"`
- 14 other client-side `console.error` calls do NOT gate behind dev-only check
- Files include: `discussion-post-form.tsx` (2 calls), `discussion-thread-form.tsx` (2 calls), `discussion-post-delete-button.tsx` (2 calls), `discussion-thread-moderation-controls.tsx` (3 calls), `edit-group-dialog.tsx` (1 call), `create-group-dialog.tsx` (1 call), `role-editor-dialog.tsx` (1 call), `role-delete-dialog.tsx` (1 call), `comment-section.tsx` (1 call)

**Verification:** Confirmed by grep for `console.error\(` in `src/` excluding error boundary files. All 14 calls are ungated.

**Fix:** Add `if (process.env.NODE_ENV === "development")` guard to all 14 calls.

**Confidence:** HIGH

### V-2: `admin-config.tsx:99+103` double `.json()` pattern violates documented convention [LOW/MEDIUM]

**Evidence:**
- Convention documented in `src/lib/api/client.ts:44-52`: "DO NOT USE" double `.json()` pattern
- `admin-config.tsx` line 99: `const errorBody = await response.json().catch(() => ({}))` in error branch
- `admin-config.tsx` line 103: `const data = await response.json().catch(() => ({...}))` in success branch
- Cycle 26 AGG-1 migrated 3 similar files; this one was missed

**Verification:** Confirmed by reading the file. The error branch returns at line 101, so the second `.json()` is never reached. Not a current runtime bug, but violates the documented convention.

**Fix:** Parse once before branching.

**Confidence:** MEDIUM

### V-3: `compiler-client.tsx:292` ungated `console.error` in catch block [LOW/MEDIUM]

**File:** `src/components/code/compiler-client.tsx:292`

**Verification:** Confirmed that line 292 has `console.error("Compiler run failed:", err)` without a dev-only guard. The user-facing error display at line 295 correctly uses `t("networkError")`, but the raw error is still logged.

**Fix:** Gate behind `process.env.NODE_ENV === "development"`.

**Confidence:** MEDIUM

## Verified Safe

- All prior cycle-27 findings confirmed fixed: clock-skew (getDbNow), toLocaleString (formatDateTimeInTimeZone), non-null assertion (removed).
- Error boundary components properly gate `console.error`.
- `create-problem-form.tsx:228` properly gates `console.warn`.
- No `as any`, `@ts-ignore`, or `@ts-expect-error` in production code.
- `dangerouslySetInnerHTML` only used with proper sanitization.
- All test files pass.

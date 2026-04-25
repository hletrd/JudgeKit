# Code Reviewer — Cycle 27b

**Date:** 2026-04-25
**Base commit:** 4c4c2c9e

## Previously Fixed (Verified)

- AGG-1 (14 ungated console.error): FIXED — confirmed gated behind `process.env.NODE_ENV === "development"` in discussion-post-form, discussion-thread-form, discussion-post-delete-button, discussion-thread-moderation-controls, edit-group-dialog, create-group-dialog, role-editor-dialog, role-delete-dialog, create-problem-form, problem-set-form, bulk-create-dialog, compiler-client, comment-section
- AGG-2 (admin-config double .json()): FIXED — single parse before branching
- AGG-3 (bulk-create err.message): FIXED — truncated/sanitized

## New Findings

### CR-1: Ungated `console.error` in `assignment-form-dialog.tsx:206` [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:206`

The `default` branch of `getErrorMessage()` calls `console.error("Unmapped error in assignment-form-dialog:", error)` without a dev-only guard. This is the same convention violation fixed in 14 other files in the previous cycle.

**Concrete failure scenario:** An unmapped API error containing internal details (e.g., SQL column name) is logged to the browser console in production.

**Fix:** Wrap with `if (process.env.NODE_ENV === "development")`.

### CR-2: Ungated `console.error` in `group-instructors-manager.tsx:73` [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-instructors-manager.tsx:73`

`console.error(data)` in the error branch of the add-instructor handler has no dev-only guard. The `data` object could contain internal error messages.

**Fix:** Wrap with `if (process.env.NODE_ENV === "development")`.

### CR-3: Ungated `console.error` in `language-config-table.tsx:137,161,189` [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:137,161,189`

Three `console.error(data.error)` calls (build, remove, prune error handlers) have no dev-only guards.

**Fix:** Wrap each with `if (process.env.NODE_ENV === "development")`.

### CR-4: Ungated `console.error` in `problem-import-button.tsx:38` [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:38`

`console.error(err)` in the import error handler has no dev-only guard. The `err` object is the raw API response body.

**Fix:** Wrap with `if (process.env.NODE_ENV === "development")`.

### CR-5: Ungated `console.error` in `database-backup-restore.tsx:146` [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:146`

`console.error(data)` in the restore error handler has no dev-only guard. This is particularly sensitive since it involves database operations.

**Fix:** Wrap with `if (process.env.NODE_ENV === "development")`.

## Final Sweep

- No `as any`, `@ts-ignore`, `eval()`, or `new Function()` in server code
- DOMPurify sanitization properly configured with narrow allowlists
- Rate limiting uses DB server time consistently
- Late penalty scoring now correctly applied in analytics
- Docker client validates image references before shell execution
- All `dangerouslySetInnerHTML` uses go through `sanitizeHtml` or `safeJsonForScript`

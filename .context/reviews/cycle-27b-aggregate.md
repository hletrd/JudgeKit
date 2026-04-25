# Aggregate Review — Cycle 27b

**Date:** 2026-04-25
**Base commit:** 4c4c2c9e
**Reviewers:** code-reviewer, security-reviewer
**Total findings:** 5 (deduplicated to 1)

---

## Deduplicated Findings (sorted by severity)

### AGG-1: Ungated `console.error` in 7 client-side call sites across 5 files — convention violation and information leak [MEDIUM/MEDIUM]

**Sources:** CR-1, CR-2, CR-3, CR-4, CR-5, SEC-1 | **Confidence:** HIGH
**Cross-agent signal:** 2 of 2 review perspectives

The codebase convention (documented in `src/lib/api/client.ts:23`) says "Log errors in development only". The previous cycle (cycle 27 AGG-1) fixed 14 ungated `console.error` calls, but these 7 call sites across 5 files were missed:

1. `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:206` — default branch of getErrorMessage
2. `src/app/(dashboard)/dashboard/groups/[id]/group-instructors-manager.tsx:73` — add-instructor error
3. `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:137` — build error
4. `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:161` — remove error
5. `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:189` — prune error
6. `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:38` — import error
7. `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:146` — restore error

**Concrete failure scenario:** A failed API call returns `{"error": "Internal: column 'foo' not found at query.ts:42"}`. The ungated `console.error` writes this to the browser console, exposing the SQL column name and server file path to any user who opens DevTools.

**Fix:** Gate all 7 `console.error` calls behind `if (process.env.NODE_ENV === "development")`, matching the pattern used in the 14 files fixed in the previous cycle and the 4 error boundary components.

---

## Carried Forward from Prior Cycles

All prior DEFER items (DEFER-1 through DEFER-21) remain unchanged. See cycle 27 plan for the full deferred list.

## Previously Fixed (Verified in Current Code)

- Cycle 26 AGG-1 (rateLimitedResponse Date.now()): FIXED — `nowMs` is required param, sidecar paths call `getDbNowMs()`
- Cycle 26 AGG-2 (analytics late penalty): FIXED — `mapSubmissionPercentageToAssignmentPoints` applied with windowed exam support
- Cycle 27 AGG-1 (14 ungated console.error): FIXED — all 14 gated behind dev-only check
- Cycle 27 AGG-2 (admin-config double .json()): FIXED — single parse before branching
- Cycle 27 AGG-3 (bulk-create err.message): FIXED — truncated/sanitized

## Positive Observations

- No `eval()`, `new Function()`, `as any`, or `@ts-ignore` in server code
- All rate-limiting uses DB server time consistently
- DOMPurify sanitization properly configured
- Docker image references validated before shell execution
- Late penalty scoring now consistent between SQL and TypeScript
- All 4 error boundary components properly gate `console.error`
- All 14 previously-identified console.error calls now gated

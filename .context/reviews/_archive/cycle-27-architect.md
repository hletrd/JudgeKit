# Cycle 27 Architect Review

**Date:** 2026-04-22
**Base commit:** 14025d58

## Findings

### ARCH-1: Inconsistent `console.error` pattern across client components -- convention violation [MEDIUM/MEDIUM]

**Description:** The codebase established a convention in `src/lib/api/client.ts:23` that errors should be logged in development only. The error boundary components follow this convention (gated behind `process.env.NODE_ENV === "development"`). However, 14+ client-side `console.error` calls in API-consuming components do not follow this convention. This is a cross-cutting consistency issue that affects maintainability -- developers seeing mixed patterns may not know which to follow.

**Fix:** Apply the dev-only gate consistently across all client-side `console.error` calls. Consider a `devLog` utility function to make the convention explicit.

**Confidence:** HIGH

### ARCH-2: `admin-config.tsx` double `.json()` -- incomplete migration from cycle 26 [LOW/MEDIUM]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:99+103`

**Description:** Cycle 26 (AGG-1) migrated `assignment-form-dialog.tsx`, `create-group-dialog.tsx`, and `create-problem-form.tsx` from the double `.json()` anti-pattern to the "parse once, then branch" pattern. The `admin-config.tsx` test-connection handler was missed because it is in the plugins directory, which may not have been included in the original sweep.

**Fix:** Migrate to "parse once, then branch" pattern.

**Confidence:** MEDIUM

## Verified Safe

- API route architecture is well-structured with `createApiHandler` for standard routes.
- Raw route handlers (SSE, judge, cron) have legitimate reasons to avoid the abstraction.
- Plugin system properly encapsulated in `src/lib/plugins/`.
- i18n architecture is consistent with next-intl.
- Navigation architecture uses both client-side (next/navigation) and full-page (window.location) navigation as appropriate.

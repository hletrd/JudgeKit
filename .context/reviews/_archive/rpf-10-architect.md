# Cycle 10 Architecture Review

**Date:** 2026-04-20
**Reviewer:** architect
**Base commit:** fae77858

## Findings

### ARCH-1: `withUpdatedAt()` defaulting to `new Date()` is a systemic architectural gap [LOW/MEDIUM]

**Files:** `src/lib/db/helpers.ts:20`
**Description:** The `withUpdatedAt()` helper defaults to `new Date()`, creating an architectural inconsistency: the codebase has invested significant effort in migrating to DB-sourced time (cycles 7-9), but the primary update helper still defaults to app server time. This means every new call site that forgets to pass `now` silently reintroduces the clock-skew pattern. The docstring warns about this, but docstrings are not enforcement.
**Fix:** Make `now` a required parameter, or have `withUpdatedAt` internally use `getDbNowUncached()`. If the latter, the function becomes async and all call sites need `await`. The former is simpler and makes the decision explicit at each call site.
**Confidence:** Medium

### ARCH-2: Inconsistent DB-time migration coverage — `access-codes.ts`, `problem-management.ts`, `assignments/management.ts` missed [LOW/MEDIUM]

**Files:** `src/lib/assignments/access-codes.ts`, `src/lib/problem-management.ts`, `src/lib/assignments/management.ts`
**Description:** The DB-time migration in cycles 7-9 covered API routes and server actions but missed several library modules that write timestamps. These modules (`access-codes.ts`, `problem-management.ts`, `assignments/management.ts`) still use `new Date()` for `createdAt`, `updatedAt`, `enrolledAt`, and `redeemedAt`. The `access-codes.ts` case is particularly notable because it uses DB time for the deadline check but app time for the write timestamps within the same transaction.
**Fix:** Complete the DB-time migration for these modules.
**Confidence:** High

### ARCH-3: Client-side locale-agnostic date formatting is inconsistent — some components use next-intl, others don't [LOW/MEDIUM]

**Files:** Multiple client components (see CR-6 from code-reviewer)
**Description:** Some client components correctly use `useLocale()` from next-intl for date formatting (e.g., `recruiting-invitations-panel.tsx` was fixed in a prior cycle), while others use `toLocaleString()` without locale (e.g., `participant-anti-cheat-timeline.tsx`, `anti-cheat-dashboard.tsx`, `code-timeline-panel.tsx`, `api-keys-client.tsx`). This creates an inconsistent i18n experience.
**Fix:** Systematically audit and fix all client-side date formatting to use next-intl locale.
**Confidence:** Medium

## Verified Safe

- Route handler middleware pattern (`createApiHandler`) is well-structured.
- Schema design follows consistent patterns with proper relations.
- React.cache() usage for server-side deduplication is correct.
- CSP and security headers are properly configured in the proxy.

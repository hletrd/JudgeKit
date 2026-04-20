# Code Reviewer

**Date:** 2026-04-20
**Base commit:** 52d81f9d
**Angle:** Code quality, logic, SOLID, maintainability

## Inventory
- Reviewed the public route entry points in `src/app/page.tsx`, `src/app/not-found.tsx`, `src/app/(public)/**`
- Reviewed shared UI infrastructure used by the failing pages: `src/components/pagination-controls.tsx`, `src/components/layout/public-header.tsx`, `src/lib/navigation/public-nav.ts`
- Reviewed test coverage around these surfaces: `tests/component/pagination-controls.test.tsx`, `tests/component/home-page.test.tsx`, `tests/component/not-found-page.test.tsx`, `tests/e2e/public-shell.spec.ts`

## F1: `PaginationControls` is an async client component that imports a server-only translation API
- **File:** `src/components/pagination-controls.tsx:1-60`
- **Severity:** HIGH
- **Confidence:** HIGH
- **Status:** confirmed issue
- **Description:** The file is marked `"use client"`, then exports `async function PaginationControls(...)` and awaits `getTranslations` from `next-intl/server`. That is an invalid client/server boundary: client components cannot be async server functions, and they must not import server-only translation helpers.
- **Concrete failure scenario:** Any route that renders `PaginationControls` can blow up at runtime with the standard Next.js client-boundary failure (`async/await is not yet supported in Client Components` / server-only import violation). The live browser audit reproduced the exact symptom on `/practice` and `/rankings`, both of which render this component.
- **Suggested fix:** Keep the component client-side but make it synchronous and switch to `useTranslations` from `next-intl`.

## F2: The public home and 404 pages bypass the shared nav helpers and still hard-code the stale workspace label path
- **File:** `src/app/page.tsx:88-103`, `src/app/not-found.tsx:45-60`, `src/lib/navigation/public-nav.ts:18-36`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** confirmed issue
- **Description:** `src/app/(public)/layout.tsx` already centralizes public nav labels and uses `tShell("nav.dashboard")` for the logged-in dashboard label, but `src/app/page.tsx` and `src/app/not-found.tsx` duplicate the header config and still use `tShell("nav.workspace")` in both `actions` and `loggedInUser.label`. That duplication created drift.
- **Concrete failure scenario:** The deployed home page still renders the literal `publicShell.nav.workspace` label in the header while the rest of the public shell uses the newer dashboard wording. Any future nav or locale change now has to be fixed in three places.
- **Suggested fix:** Reuse the shared nav builders and align the home / 404 pages with `nav.dashboard` instead of the old workspace label path.

## Final sweep
- No broader confirmed logic bug surfaced in the inspected public-shell code beyond the invalid pagination boundary and the duplicated header configuration.

# Critic

**Date:** 2026-04-20
**Base commit:** 52d81f9d
**Angle:** Multi-perspective critique of the whole change surface

## Inventory
- Public entry points: `src/app/page.tsx`, `src/app/not-found.tsx`, `src/app/(public)/**`
- Shared UI primitives used by the broken routes: `src/components/pagination-controls.tsx`, `src/components/layout/public-header.tsx`
- Supporting tests: `tests/component/pagination-controls.test.tsx`, `tests/e2e/public-shell.spec.ts`

## F1: A shared primitive shipped an invalid client/server boundary and took down multiple public routes at once
- **File:** `src/components/pagination-controls.tsx:1-60`
- **Severity:** HIGH
- **Confidence:** HIGH
- **Status:** confirmed issue
- **Description:** A single shared component mixes `"use client"` with an async server translation call. Because `/practice`, `/rankings`, and many other pages all depend on that primitive, one boundary mistake breaks an entire cross-section of the app.
- **Concrete failure scenario:** `/practice` and `/rankings` both render the public server-error shell on the live site even though the underlying page modules are otherwise unrelated.
- **Suggested fix:** Remove the invalid boundary in the shared primitive and add regression coverage at the component and route level.

## F2: Public-header configuration is duplicated in the highest-traffic entry points, so fixes are landing inconsistently
- **File:** `src/app/page.tsx:88-103`, `src/app/not-found.tsx:45-60`, `src/app/(public)/layout.tsx:22-31`, `src/lib/navigation/public-nav.ts:18-36`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** confirmed issue
- **Description:** The public layout already has a shared navigation path, but the home page and 404 page still inline their own header items/actions. That is exactly why the header label fix did not land uniformly.
- **Concrete failure scenario:** Live home still shows `publicShell.nav.workspace` while the regular public layout does not.
- **Suggested fix:** Collapse the duplicated header config onto shared helpers / one source of truth.

## Final sweep
- The two confirmed issues reinforce each other: one shared primitive caused a crash, while duplicated entry-point wiring let an earlier translation cleanup remain half-applied.

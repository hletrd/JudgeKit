# Architect

**Date:** 2026-04-20
**Base commit:** 52d81f9d
**Angle:** Architectural/design risks, coupling, layering

## Inventory
- Public shell entry points and shared layout helpers
- Shared pagination primitive consumed by multiple dashboard and public pages
- Shared navigation helper in `src/lib/navigation/public-nav.ts`

## F1: `PaginationControls` collapses server-only i18n and client-only interactivity into one invalid boundary
- **File:** `src/components/pagination-controls.tsx:1-60`
- **Severity:** HIGH
- **Confidence:** HIGH
- **Status:** confirmed issue
- **Description:** The component mixes client hooks (`useState`) with a server translation import (`next-intl/server`) and an async function boundary. This is an architectural layering violation, not just a syntax issue.
- **Concrete failure scenario:** Every route depending on the primitive inherits the broken boundary and can fail the same way.
- **Suggested fix:** Split responsibilities correctly: keep interactivity in a synchronous client component and use `useTranslations` on the client.

## F2: Public-header configuration is not actually centralized for the home and 404 entry points
- **File:** `src/app/page.tsx:88-103`, `src/app/not-found.tsx:45-60`, `src/lib/navigation/public-nav.ts:18-36`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** confirmed issue
- **Description:** The repo already has shared public-nav helpers, but the two most visible public entry points bypass them. This is an architecture drift bug.
- **Concrete failure scenario:** Nav labels and route inventory diverge between the home page and the normal public layout.
- **Suggested fix:** Reuse shared navigation builders / constants everywhere the public header is rendered.

## Final sweep
- No deeper architectural issue outweighed these two shared-boundary problems in the inspected public-shell surface.

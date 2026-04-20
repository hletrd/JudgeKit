# Cycle 22 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/_aggregate.md` / `.context/reviews/cycle-22-aggregate.md`

---

## Scope
This cycle only plans work for the new cycle-22 findings:
- AGG-1 `PaginationControls` invalid async client boundary causing live `/practice` and `/rankings` failures
- AGG-2 Home / 404 public-header drift still exposing the stale workspace label path
- AGG-3 Missing regression coverage around the broken pagination contract and public-shell failures

No cycle-22 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Repair the shared pagination component boundary
- **Source:** AGG-1
- **Severity / confidence:** HIGH / HIGH
- **Citations:** `src/components/pagination-controls.tsx:1-60`, `src/app/(public)/practice/page.tsx:701`, `src/app/(public)/rankings/page.tsx:312`
- **Problem:** The shared pagination primitive is declared as an async client component and imports `next-intl/server`, which matches the live failures on `/practice` and `/rankings`.
- **Plan:**
  1. Convert `PaginationControls` into a synchronous client component.
  2. Replace `getTranslations` from `next-intl/server` with `useTranslations` from `next-intl`.
  3. Keep the existing `GoToPage` interactivity client-side.
  4. Run route-level verification against public pages that render pagination.
- **Status:** DONE (commit f5251f3a)

### M1: Remove home / 404 public-header drift and align the label path with the shared public shell
- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/page.tsx:88-103`, `src/app/not-found.tsx:45-60`, `src/app/(public)/layout.tsx:22-31`, `src/lib/navigation/public-nav.ts:1-36`
- **Problem:** The home and 404 pages bypass the shared public-nav wiring and still use the stale `nav.workspace` label path instead of the dashboard path used by the shared layout.
- **Plan:**
  1. Reuse the shared public-nav helpers where possible.
  2. Replace the stale workspace label path with the dashboard label path on the home / 404 entry points.
  3. Update any affected component tests.
  4. Re-verify the browser-visible label on the home page.
- **Status:** DONE (commit 97c4544b)

### M2: Add regression coverage for the real pagination/public-shell contract
- **Source:** AGG-3
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `tests/component/pagination-controls.test.tsx:34-68`, `tests/e2e/public-shell.spec.ts:24-45`
- **Problem:** Tests encoded the broken async API and did not cover the public `/rankings` failure or assert absence of the public server-error shell.
- **Plan:**
  1. Update the component test to render `<PaginationControls />` as a normal client component.
  2. Add assertions that public pagination routes do not render the server-error shell.
  3. Extend public-shell browser coverage to include `/rankings`.
- **Status:** DONE (commit 743dddf0)

---

## Deferred items
None. Every cycle-22 finding above is planned for implementation in this cycle.

---

## Audit blockers / follow-up notes
- Same-host authenticated browser audit was attempted using `.env` credentials but blocked because the live login form returned `Invalid username or password`.
- This blocker does not defer a review finding; it only limits live authenticated-page validation for this cycle.

---

## Progress log
- 2026-04-20: Plan created from cycle-22 aggregate review.
- 2026-04-20: H1, M1, M2 all DONE. All cycle-22 findings resolved. Quality gates pass (tsc, unit, component, build).

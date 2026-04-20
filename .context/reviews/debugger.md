# Debugger

**Date:** 2026-04-20
**Base commit:** 52d81f9d
**Angle:** Latent bug surface, failure modes, regressions

## Inventory
- Live failing pages: `/practice`, `/rankings`
- Shared code used by both pages: `src/components/pagination-controls.tsx`
- Header label regression surface: `src/app/page.tsx`, `src/app/not-found.tsx`, `src/app/(public)/layout.tsx`

## F1: Most plausible root cause for both public-page crashes is the invalid async client pagination component
- **File:** `src/components/pagination-controls.tsx:1-60`
- **Severity:** HIGH
- **Confidence:** HIGH
- **Status:** confirmed issue
- **Description:** `/practice` and `/rankings` are otherwise very different pages, but they both render `PaginationControls`. The shared component is the clean common denominator and contains a known-invalid pattern (`"use client"` + `export async function` + `next-intl/server`).
- **Concrete failure scenario:** Both pages enter the same React/Next boundary failure path and render the public server-error shell.
- **Suggested fix:** Remove the async server import pattern from the client component.

## F2: The home-page label regression is caused by config drift, not by the login flow or missing translation keys at HEAD
- **File:** `src/app/page.tsx:98-103`, `src/app/not-found.tsx:55-60`, `messages/en.json:2616-2624`, `messages/ko.json:2616-2624`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** confirmed issue
- **Description:** The translation keys exist in the repo, but the home / 404 pages still wire the older workspace path instead of the shared dashboard path used elsewhere.
- **Concrete failure scenario:** The deployed home page keeps showing `publicShell.nav.workspace` even though the repo has already moved the regular public layout to `nav.dashboard`.
- **Suggested fix:** Remove the duplicated header config and align the entry points with the shared nav helper.

## Final sweep
- No evidence pointed to the improved invalid-login path as a reopened regression.

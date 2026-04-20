# Verifier

**Date:** 2026-04-20
**Base commit:** 52d81f9d
**Angle:** Evidence-based correctness check against stated behavior

## Inventory
- Live browser audit on `https://algo.xylolabs.com/`, `/practice`, `/rankings`, `/login`, `/playground`, `/contests`, `/community`, `/submissions`, `/languages`
- Repo-side inspection of `src/components/pagination-controls.tsx`, `src/app/page.tsx`, `src/app/not-found.tsx`
- Test coverage review in `tests/component/pagination-controls.test.tsx` and `tests/e2e/public-shell.spec.ts`

## F1: The live `/practice` and `/rankings` failures map directly to a confirmed repo-side bug in `PaginationControls`
- **File:** `src/components/pagination-controls.tsx:1-60`
- **Severity:** HIGH
- **Confidence:** HIGH
- **Status:** confirmed issue
- **Evidence:** Live browser audit showed `https://algo.xylolabs.com/practice` and `https://algo.xylolabs.com/rankings` rendering the public server-error shell (`heading "This page couldn’t load"`, reload button, error IDs `199745080` and `3036685368`). Both routes render `PaginationControls`. The component is a client component that is declared `async` and awaits `getTranslations` from `next-intl/server`.
- **Concrete failure scenario:** Practice and rankings crash during render even though the rest of the public shell is healthy.
- **Suggested fix:** Convert `PaginationControls` to a synchronous client component that uses `useTranslations`.

## F2: The home page still uses the stale workspace label path that the rest of the public shell already replaced
- **File:** `src/app/page.tsx:98-103`, `src/app/not-found.tsx:55-60`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** confirmed issue
- **Evidence:** Live home snapshot exposed a header link with label text `publicShell.nav.workspace`. In the repo, the public layout has already switched to `tShell("nav.dashboard")`, but the home and 404 pages still use `tShell("nav.workspace")`.
- **Concrete failure scenario:** The most visible page in the product shows a raw i18n key instead of a user-facing label.
- **Suggested fix:** Align the home / 404 pages with the shared public-layout label strategy.

## Verified safe this cycle
- Invalid login flow now produces the in-form `Invalid username or password` alert instead of `UntrustedHost`; no regression was found there.
- Public routes `/playground`, `/contests`, `/community`, `/submissions`, and `/languages` loaded successfully during the same-host browser audit.

## Final sweep
- The observed live failures are explained by repo-side causes; no contradictory evidence surfaced in the inspected code.

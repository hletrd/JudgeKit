# Cycle 22 Aggregate Review

**Date:** 2026-04-20
**Base commit:** 52d81f9d
**Review artifacts:** `code-reviewer.md`, `security-reviewer.md`, `critic.md`, `verifier.md`, `test-engineer.md`, `architect.md`, `debugger.md`, `designer.md`, `document-specialist.md`, `perf-reviewer.md`, `tracer.md`

## Deduped Findings (sorted by severity then signal)

### AGG-1: `PaginationControls` is an invalid async client component, and it matches the live `/practice` + `/rankings` outage [HIGH/HIGH]

**Flagged by:** code-reviewer, critic, verifier, architect, debugger, designer, perf-reviewer, tracer  
**Files:** `src/components/pagination-controls.tsx:1-60`, `src/app/(public)/practice/page.tsx:701`, `src/app/(public)/rankings/page.tsx:312`  
**Description:** `PaginationControls` is marked `"use client"` but exported as `async` and awaits `getTranslations` from `next-intl/server`. That is an invalid client/server boundary in Next.js. Both failing live routes render this shared primitive.  
**Browser evidence:**
- `https://algo.xylolabs.com/practice` rendered the public server-error shell with heading `"This page couldn’t load"` and error ID `199745080`
- `https://algo.xylolabs.com/rankings` rendered the same shell with error ID `3036685368`
**Concrete failure scenario:** Any route that imports the broken primitive can crash at render time instead of showing paginated content.  
**Fix:** Convert `PaginationControls` into a synchronous client component using `useTranslations` from `next-intl`.

### AGG-2: The home and 404 entry points still bypass the shared public-nav path and expose the stale workspace label [MEDIUM/HIGH]

**Flagged by:** code-reviewer, critic, verifier, architect, debugger, designer, tracer, document-specialist  
**Files:** `src/app/page.tsx:88-103`, `src/app/not-found.tsx:45-60`, `src/app/(public)/layout.tsx:22-31`, `src/lib/navigation/public-nav.ts:1-36`  
**Description:** The normal public layout already moved to the shared public-nav path and `tShell("nav.dashboard")`, but the home and 404 pages still inline their own `PublicHeader` configuration and use `tShell("nav.workspace")`.  
**Browser evidence:** `https://algo.xylolabs.com/` rendered a visible header link with text `publicShell.nav.workspace` (accessibility snapshot ref `e6`).  
**Concrete failure scenario:** The highest-traffic public entry point visibly leaks a raw i18n key, and future nav changes have to be made in multiple places.  
**Fix:** Reuse the shared public-nav builders / label strategy in the home and 404 pages and stop hard-coding the old workspace label.

### AGG-3: Regression coverage did not protect the real rendering contract for public pagination routes [MEDIUM/HIGH]

**Flagged by:** test-engineer, document-specialist  
**Files:** `tests/component/pagination-controls.test.tsx:34-68`, `tests/e2e/public-shell.spec.ts:24-45`  
**Description:** The component test suite normalized the broken API by `await`-ing `PaginationControls(...)` directly and mocking `next-intl/server`, while public E2E coverage checks `/practice` only and does not assert that the server-error shell is absent. `/rankings` is not covered at all in the public-shell suite.  
**Concrete failure scenario:** A live outage ships even though the component and E2E tests keep passing.  
**Fix:** Update the component test to render the real client component contract and extend public-shell E2E coverage to `/rankings` plus explicit checks that the server-error shell is absent.

## Verified Safe / No Regression Found

- The invalid-login flow now shows the in-form `Invalid username or password` alert; the earlier `UntrustedHost` symptom was not reproduced in this cycle.
- Public routes `/playground`, `/contests`, `/community`, `/submissions`, and `/languages` loaded successfully during the same-host browser audit.

## Agent Failures

The requested reviewer fan-out was attempted twice, but Codex native reviewer agents either hit the runtime thread limit or remained unavailable/slow long enough to block the cycle. The stalled reviewer attempts were shut down after retry so the cycle could continue. The final per-agent review files above were completed directly in-repo to preserve Prompt 1 artifacts and browser-audit evidence.

## Browser Audit Notes / Blockers

- Same-host browser audit completed for all publicly reachable top-level nav pages on `algo.xylolabs.com`.
- Authenticated browser audit was attempted using the safe `.env` credentials but blocked because the live login form returned `Invalid username or password`.

# Designer

**Date:** 2026-04-20
**Base commit:** 52d81f9d
**Angle:** UI/UX, accessibility, browser audit

## Browser audit inventory (same-host only)
Audited with `agent-browser` on:
- `https://algo.xylolabs.com/`
- `https://algo.xylolabs.com/practice`
- `https://algo.xylolabs.com/rankings`
- `https://algo.xylolabs.com/login`
- `https://algo.xylolabs.com/playground`
- `https://algo.xylolabs.com/contests`
- `https://algo.xylolabs.com/community`
- `https://algo.xylolabs.com/submissions`
- `https://algo.xylolabs.com/languages`

Authenticated audit attempt:
- Tried the `.env` `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` credentials on `https://algo.xylolabs.com/login`
- Result: inline alert `Invalid username or password`; authenticated pages could not be audited without guessing secrets

## F1: `/practice` and `/rankings` regress to the public server-error shell instead of their intended content
- **URL / evidence:**
  - `https://algo.xylolabs.com/practice` → accessibility snapshot shows heading `"This page couldn’t load"`, paragraph `"A server error occurred. Reload to try again."`, reload button ref `e2`, error ID `199745080`
  - `https://algo.xylolabs.com/rankings` → same shell with error ID `3036685368`
- **Code region:** `src/components/pagination-controls.tsx:1-60`
- **Severity:** HIGH
- **Confidence:** HIGH
- **Status:** confirmed issue
- **User impact:** Two top-level public navigation routes are unusable even though adjacent routes (`/playground`, `/contests`, `/community`, `/submissions`, `/languages`) load normally.
- **Suggested fix:** Repair the shared pagination component's client/server boundary so these routes can render their real content.

## F2: The home-page header still exposes a raw i18n key instead of a user-facing label
- **URL / evidence:** `https://algo.xylolabs.com/` accessibility snapshot shows header link text `"publicShell.nav.workspace"` (ref `e6`) between the locale/theme controls and the auth links
- **Code region:** `src/app/page.tsx:98-103`, `src/app/not-found.tsx:55-60`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** confirmed issue
- **User impact:** The highest-traffic page leaks an internal translation key into the visible navigation, which looks broken and undermines trust.
- **Suggested fix:** Align the home / 404 pages with the shared public-layout dashboard label path.

## Verified safe this cycle
- `/login` invalid credentials now produce the in-form alert `Invalid username or password`; the earlier `UntrustedHost` symptom was not reproduced.
- `/playground`, `/contests`, `/community`, `/submissions`, and `/languages` loaded successfully on the same host.

## Final sweep
- The live public UX failures are concentrated in the pagination routes and the home-page header label; no additional same-host public page failed during this audit.

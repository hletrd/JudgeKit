# Designer — Cycle 16 Review

**Date:** 2026-05-09
**HEAD:** 64de91dd
**Scope:** UI/UX — accessibility, responsive design, form validation, loading/error states, dark/light mode, i18n

## Summary

No new UI/UX findings. The codebase continues to show strong accessibility and design patterns. The apiFetch timeout issue has UX implications noted below.

## UX Impact of apiFetch Timeout Issue

### UX-1: Hanging fetches degrade perceived performance and responsiveness [MEDIUM]

- **Related to:** CR-1, DB-1, DB-2
- **Confidence:** High
- **Impact:** When apiFetch requests hang because the caller provided a signal without a timeout:
  - Chat widget: Assistant shows "thinking" spinner indefinitely. User has no feedback about whether the system is working or broken.
  - File upload: Progress indicator shows "uploading" forever. Admin cannot tell if the upload is slow or stalled.
  - Language config: Image status loading spinner spins indefinitely.
- **Recommendation:** Fixing CR-1 (always applying timeout) also fixes these UX issues. A 30s timeout with appropriate error messaging ("Request timed out — please retry") is much better than an indefinite spinner.

## Verified UI/UX Patterns

- **Accessibility:** ARIA labels present on interactive elements. Keyboard navigation works in dialogs and pagination. Focus trapping is implemented.
- **Responsive:** Pagination controls adapt to screen size. Layout uses flex/grid appropriately.
- **Loading/Error States:** Async components handle loading and error states. Skeleton loaders used where appropriate.
- **Dark/Light Mode:** `next-themes` is used consistently. No hardcoded colors that break theme switching.
- **i18n:** All user-facing strings use `next-intl`. Locale-aware formatting for dates and numbers.
- **Korean Letter Spacing:** All `tracking-*` utilities are conditionally applied only for non-Korean locales, per CLAUDE.md rule.

## Prior Fixes Verified

| Finding | Status |
|---|---|
| C14 copy-code-button visual feedback | Fixed — timer now properly managed |
| C14 language-config-table admin confusion | Fixed — separate operation controllers |

## Final Sweep

No missing ARIA attributes, no inaccessible color combinations, no form validation UX gaps found.

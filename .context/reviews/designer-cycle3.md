# Designer — Cycle 3 Deep Review (2026-05-01)

**HEAD reviewed:** `894320ff` (main)

## UI/UX review

The repo contains a Next.js web frontend with TSX components, public pages, and dashboard UI. Korean/English i18n support is present. Review focuses on accessibility, responsiveness, and UX patterns.

## Findings

### C3-UX-1: Client-side `console.error` usage in error handlers (LOW, confidence: High)

**Files:** 27 client-side `console.error`/`console.warn` calls in dashboard components (confirmed by grep).

This was previously tracked as C1-AGG-3 (24 sites, now 27). These `console.error` calls in React components are invisible to users — they only appear in the browser dev console. When an API call fails, the user sees no feedback if the error handler only logs to console. Some handlers do show toast notifications (via Sonner), but others silently log.

**Failure scenario:** A user clicks "Delete Role" and the API returns an error. The handler logs to console.error but doesn't show a toast. The user has no feedback that the action failed.

**Fix:** Replace bare `console.error` calls in user-facing components with toast notifications or visible error states. Keep console.error as a supplement, not the primary feedback mechanism.

### C3-UX-2: Korean text letter-spacing concern — verified compliance (N/A, confidence: High)

Per CLAUDE.md rule: "Keep Korean text at the browser/font default letter spacing. Do not apply custom `letter-spacing` (or `tracking-*` Tailwind utilities) to Korean content."

**Verified:** Searched for `tracking-` and `letter-spacing` usage across the codebase. No violations found in Korean-text-bearing components. The i18n system (`messages/en.json`, `messages/ko.json`) properly separates locale content. The `korean-naturalizer` skill is available for checking AI-written Korean text.

### Accessibility observations

- `skip-to-content.tsx` component exists for keyboard navigation
- `aria-*` attributes are used in some components (e.g., `SelectValue` in `select.tsx`)
- Dark/light mode is supported via `theme-provider.tsx`
- Error boundaries exist for dashboard sections

### Responsive design

- `use-mobile.ts` hook for mobile detection
- `mobile-layout.spec.ts` E2E test for mobile layouts
- `sidebar.tsx` with sheet-based mobile navigation

## Final sweep

The UI is well-structured. The primary UX finding is the console.error gap (C3-UX-1), which is a carry-forward of C1-AGG-3 with updated count (27 sites). Korean typography compliance is verified.

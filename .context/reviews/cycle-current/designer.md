# UI/UX Review — Cycle 1/100

**Date:** 2026-05-08
**HEAD:** main / 5cec65e8
**Reviewer:** designer (consolidated single-pass, browserless — no local dev server running)

---

## Findings

### D1 — MEDIUM — Production CSP `unsafe-inline` weakens XSS protection

- **File:** `next.config.ts:159-172`
- **Description:** The production CSP includes `script-src 'self' 'unsafe-inline'`, which allows any inline script to execute. This means a reflected/stored XSS vulnerability that injects `<script>` tags would bypass CSP protection entirely. The dev proxy (`proxy.ts`) already implements nonce-based CSP correctly. The production baseline should match.
- **Confidence:** HIGH
- **Suggested fix:** Investigate using `headers()` in next.config.ts to generate dynamic CSP with nonce, or use a custom server/Edge function for CSP generation.

### D2 — LOW — `viewport` export missing `themeColor`

- **File:** `src/app/layout.tsx:23-26`
- **Description:** The `viewport` export does not include `themeColor`, which means mobile browsers show a default gray/white address bar instead of matching the app's theme. With `next-themes` supporting dark mode, the theme color should adapt.
- **Confidence:** LOW
- **Suggested fix:** Add dynamic `themeColor` based on current theme, or use `media="(prefers-color-scheme: dark)"` meta tags.

### D3 — LOW — Admin page cards lack loading skeleton

- **File:** `src/app/(dashboard)/dashboard/admin/page.tsx:40-78`
- **Description:** The admin landing page renders cards based on capability checks. During the async capability resolution, the page shows Next.js default loading state (or nothing). There is no skeleton or progressive enhancement for the card grid.
- **Confidence:** MEDIUM
- **Suggested fix:** Add a `loading.tsx` for the admin section with a card-grid skeleton.

### D4 — LOW — Breadcrumb home link uses hidden text instead of aria-label

- **File:** `src/components/layout/breadcrumb.tsx` (assumed)
- **Description:** From prior cycle finding (F10): the breadcrumb home link uses `sr-only` text but no `aria-label`. Screen readers should work, but `aria-label` is more explicit.
- **Confidence:** LOW
- **Suggested fix:** Already noted in prior cycle. Add `aria-label` if not already fixed.

### D5 — LOW — No focus trap on modal dialogs

- **File:** Various dialog components
- **Description:** The `destructive-action-dialog.tsx` component may not implement focus trapping. When a destructive dialog opens, focus should be contained within the dialog and returned to the trigger on close.
- **Confidence:** MEDIUM
- **Suggested fix:** Verify Radix UI Dialog (or equivalent) is configured with `modal={true}` and focus trapping enabled.

### D6 — LOW — Korean letter-spacing in `recruit/[token]/results/page.tsx`

- **File:** Prior cycle finding F1
- **Description:** From prior cycle: Korean text may have `tracking-wide` or similar Tailwind utilities applied. Per CLAUDE.md, Korean must use default letter spacing.
- **Confidence:** HIGH
- **Suggested fix:** Already flagged in prior cycle. Verify fix is complete.

---

## UI/UX Verdict

The UI is well-structured with proper component composition. Prior IA cycles addressed major navigation issues. Remaining concerns are around CSP hardening (security-UX intersection) and minor accessibility improvements.

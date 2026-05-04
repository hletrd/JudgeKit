# Designer (UI/UX) Review — RPF Cycle 3 (2026-05-04)

**Reviewer:** designer (source-level)
**HEAD reviewed:** `4cd03c2b`
**Method:** Source-level review. No live browser session. Findings based on grep + manual inspection.
**Scope:** UI/UX changes since `988435b5`.

---

## UI/UX verification of recent changes

### ConditionalHeader (commit `767b1fee`)

- The ConditionalHeader renders a minimal header with only `SidebarTrigger` on admin pages, and the full `PublicHeader` on non-admin pages.
- Dark mode: Uses `bg-background/95` and `backdrop-blur` which are theme-aware. Correct.
- Accessibility: The `SidebarTrigger` button inherits ARIA from shadcn/ui. Correct.
- The component is clean and well-structured.

### Login/signup card width fix (commit `9b87eeee`)

- Changed from `max-w-md` to `max-w-lg`. This is a minor responsive improvement.

### i18n fixes (commit `95cbcf6a`)

- Replaced hardcoded strings with translations in contest and community pages. Good improvement for Korean locale support.

---

## Findings

### C3-DS-1: [LOW] Hardcoded "Loading..." in loading.tsx affects screen readers in non-English locales

- **File:** `src/app/(dashboard)/loading.tsx:3,5` and `src/app/(public)/loading.tsx:3,5`
- **Confidence:** MEDIUM
- **Description:** The `aria-label="Loading"` and `<span className="sr-only">Loading...</span>` are hardcoded in English. Screen reader users in Korean locale will hear "Loading..." instead of the translated equivalent. The `common.loading` key exists in the i18n files.
- **Fix:** Use `getTranslations("common")` to get the translated loading string.

### C3-DS-2: [LOW] Hardcoded "chars" in CodeTimelinePanel

- **File:** `src/components/contest/code-timeline-panel.tsx:199`
- **Confidence:** HIGH
- **Description:** The character count label `{current.charCount} chars` is hardcoded in English. Should use i18n for consistency.
- **Fix:** Add a translation key and use it.

---

## No-issue confirmations

- Dark mode coverage remains at 100% for new components.
- Korean letter-spacing rule not violated by recent changes.
- ARIA attributes present on all interactive elements in new code.
- Responsive behavior intact.

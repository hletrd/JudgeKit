# Designer — RPF Cycle 18

**Date:** 2026-04-20
**Base commit:** 2b415a81

## DES-1: Access code share link does not include locale prefix [LOW/MEDIUM]

**File:** `src/components/contest/access-code-manager.tsx:126`
**Description:** The share URL `const url = `${window.location.origin}/dashboard/contests/join?code=${code}`;` does not include the locale prefix (e.g., `/ko/`). All other navigation links in the app use locale-aware path builders. When a Korean user shares this link, the recipient lands on the default (English) locale instead of Korean.
**Concrete failure scenario:** A Korean instructor generates an access code and shares the link with students. Students click the link and see the page in English instead of Korean.
**Fix:** Use `buildLocalizedHref()` from `@/lib/locale-paths` or at minimum prepend `/${locale}/` to the path.

## DES-2: Practice page success-rate column uses color-coded icons without ARIA description [LOW/LOW]

**File:** `src/app/(public)/_components/public-problem-list.tsx:158-163`
**Description:** The success rate column uses color-coded icons (green CircleCheck for >=60%, yellow CircleAlert for 30-60%, red CircleX for <30%) with `aria-hidden="true"`. The color conveys information that is not available to screen readers or users with color vision deficiency. However, the numerical percentage is shown right next to the icon (line 164), which provides the same information in text form.
**Concrete failure scenario:** A screen reader user hears "60.0%" but does not get the "good/medium/poor" semantic that the color conveys. However, the percentage is sufficient to understand the rating.
**Fix:** No action required — the numerical value provides equivalent information. The icons are decorative, and `aria-hidden="true"` is correct.

## DES-3: Mobile PublicHeader focus trap and keyboard navigation — working correctly [VERIFIED]

**File:** `src/components/layout/public-header.tsx:106-149`
**Description:** The mobile menu implements:
- Focus trap (Tab/Shift+Tab wraparound) at lines 122-145
- Escape key closes the menu and restores focus at lines 116-119
- Route change auto-closes the menu at lines 86-103
- Focus moves into panel on open at lines 110-113
- Focus restores to toggle button on close at lines 98-99, 155
All keyboard navigation patterns are correctly implemented.

## DES-4: Korean letter-spacing handling — comprehensive and correct [VERIFIED]

**Description:** All `tracking-tight` and `tracking-wide` classes in the codebase are conditional on `locale !== "ko"`. Specific instances verified:
- `public-header.tsx:303` — mobile menu dashboard label
- `not-found.tsx:60` — heading
- `public-problem-list.tsx:98` — catalog title
- `public-contest-list.tsx:53-54` — heading and labels
- `public-home-page.tsx:70` — heading
- `public-preview-page.tsx:15` — heading
- `public-problem-set-detail.tsx:55` — heading
- `public-problem-set-list.tsx:35` — heading
- `community/new/page.tsx:19` — heading
- `dashboard-judge-system-tabs.tsx:59` — heading
- `my-discussions-list.tsx:24` — heading
The `tracking-widest` on `access-code-manager.tsx:143` is for `font-mono` alphanumeric codes — safe for Korean.

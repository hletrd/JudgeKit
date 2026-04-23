# UI/UX Review — RPF Cycle 25

**Date:** 2026-04-22
**Base commit:** ac51baaa

## DES-1: `submission-overview.tsx` Dialog has correct semantics -- confirmed from V-3 fix [VERIFIED]

**File:** `src/components/lecture/submission-overview.tsx:145-148`

The component now uses the shared `Dialog` component which provides proper `role="dialog"`, `aria-modal`, and focus trap. Verified correct.

---

## DES-2: `compiler-client.tsx` error alert has `role="alert"` -- confirmed [VERIFIED]

**File:** `src/components/code/compiler-client.tsx:498-505`

The error display div has `role="alert"`:
```tsx
<div role="alert" className="mb-3 flex items-start gap-2 ...">
```

This is correct. The error will be announced by screen readers when it appears. No fix needed.

---

## DES-3: `contest-replay.tsx` slider accessibility -- confirmed via native input [VERIFIED]

**File:** `src/components/contest/contest-replay.tsx:159-169`

The range input has `aria-valuetext` and the `value` attribute on `<input type="range">` sets `aria-valuenow` implicitly for native range inputs. Verified correct.

---

## DES-4: `recruiting-invitations-panel.tsx` table has poor responsive behavior on narrow screens [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:522-634`

The table is wrapped in `overflow-x-auto`, which allows horizontal scrolling. On narrow screens, the action column (with multiple icon buttons) may be clipped or require scrolling. This is a minor UX issue -- the table is usable but not ideal on mobile.

**Fix:** Consider hiding less important columns on mobile or using a card layout for small screens. Low priority since this is primarily an admin feature used on desktop.

---

## DES-5: `active-timed-assignment-sidebar-panel.tsx` uses correct Korean letter-spacing handling [VERIFIED]

**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:49-50`

```ts
const labelTracking = locale !== "ko" ? " tracking-[0.16em]" : "";
const smallLabelTracking = locale !== "ko" ? " tracking-wide" : "";
```

This correctly follows the CLAUDE.md rule: "Keep Korean text at the browser/font default letter spacing." Verified correct.

---

## DES-6: `compiler-client.tsx` test case tabs lack distinguishing `aria-label` [LOW/LOW]

**File:** `src/components/code/compiler-client.tsx:439-443`

The tab labels show test case names like "TC 1", "TC 2". When a user renames a test case, the tab label updates. This is correct behavior. However, there's no `aria-label` distinguishing the tabs as "test case" tabs vs other tab groups on the page.

**Fix:** Add an `aria-label` to the `Tabs` component like `aria-label={t("testCaseLabel")}`. Low priority.

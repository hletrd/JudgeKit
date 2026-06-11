# Designer Review — RPF Cycle 36

**Date:** 2026-04-23
**Reviewer:** designer
**Base commit:** 601ff71a

## Inventory of Files Reviewed

- Chat widget (`src/lib/plugins/chat-widget/chat-widget.tsx`)
- Contest pages (dashboard/contests/)
- Problem pages (dashboard/problems/)
- Global CSS (`src/app/globals.css`)
- UI component library (`src/components/ui/`)

## Findings

### DES-1: Chat widget textarea lacks explicit aria-label [LOW/LOW — carry-over]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:363`

**Description:** The textarea has a `placeholder` attribute but no `aria-label`. WCAG 2.2 SC 1.3.1 recommends programmatic labels over placeholder text for accessibility. This is a carry-over from prior cycles (DES-2). The global CSS has a `prefers-reduced-motion: reduce` override that is functional.

**Fix:** Add `aria-label={t("placeholder")}` to the textarea element.

**Confidence:** High

---

### DES-2: Chat widget entry animation not using motion-safe prefix [LOW/LOW — carry-over]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:294`

**Description:** The chat widget container uses `animate-in fade-in slide-in-from-bottom-4 duration-200` without `motion-safe:` prefix. The global CSS override at `globals.css:138` effectively disables animations for `prefers-reduced-motion: reduce` users, so this is not a functional accessibility issue. However, using `motion-safe:` prefix would be the idiomatic approach.

**Fix:** Either add `motion-safe:` prefix or rely on the global CSS override (current state is functional).

**Confidence:** Medium

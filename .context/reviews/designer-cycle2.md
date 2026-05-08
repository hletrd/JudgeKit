# Designer Review — Cycle 2

**Reviewer:** designer
**Date:** 2026-04-28
**Scope:** UI/UX review of public contest and practice pages

---

## Cycle 1 Fix Verification

The dark mode badge fix in the contest detail page is correct. However, it was not applied consistently across all pages.

---

## New Findings

### DES-C2-1: [MEDIUM] My Contests section badge lacks dark mode variants — inconsistent with catalog section

**File:** `src/app/(public)/contests/page.tsx:188`
**Confidence:** HIGH

```tsx
<Badge className={`text-xs ${contest.examMode === "scheduled" ? "bg-blue-500 text-white" : "bg-purple-500 text-white"}`}>
```

The "My Contests" section uses badges without dark mode variants, while the catalog section below (rendered by `public-contest-list.tsx:105`) has proper dark mode variants. This creates a visual inconsistency on the same page — the same badge type looks different in dark mode depending on which section it's in.

**Fix:** Add dark mode classes: `bg-blue-500 text-white dark:bg-blue-500` / `bg-purple-500 text-white dark:bg-purple-500`.

---

### DES-C2-2: [LOW] Contest listing page border-left status indicator missing dark mode variants

**File:** `src/app/(public)/contests/page.tsx:26-37`
**Confidence:** LOW

The `getContestStatusBorderClass` function in the My Contests section uses `border-l-blue-500`, `border-l-green-500`, `border-l-gray-400` without dark mode variants. The catalog section has dark variants. In dark mode, the status border colors in the My Contests section will have lower contrast.

**Fix:** Add dark mode variants matching `public-contest-list.tsx`.

---

### DES-C2-3: [LOW] Virtual Practice section loses exam context on navigation

**File:** `src/app/(public)/contests/[id]/page.tsx:665`
**Confidence:** LOW

Already flagged as AGG-14 and DBG-C2-1. From a UX perspective, clicking a Virtual Practice link and landing on a contextless problem page is disorienting — the student expected to be "in" the contest but the page shows no contest affiliation, no timer, and no anti-cheat notice.

---

## Summary

The main UI/UX issue this cycle is the inconsistent dark mode support between the My Contests section and the catalog section on the same page.

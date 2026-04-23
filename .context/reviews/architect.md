# Architectural Review — RPF Cycle 22

**Date:** 2026-04-22
**Reviewer:** architect
**Base commit:** 88abca22

## ARCH-1: `create-problem-form.tsx` stores numeric fields as string state — inconsistent with established pattern [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:92,108`
**Confidence:** MEDIUM

The form stores `sequenceNumber` and `difficulty` as `string` state, converting to numbers only at submit time. Other numeric form inputs in the codebase store numeric state and use `parseInt(e.target.value, 10) || defaultValue` in their `onChange` handlers. The string-state approach works for partially-typed values but silently falls back to `null` on invalid input (no user feedback).

**Concrete failure scenario:** A user types "abc" in the sequence number field. The form submits successfully with `sequenceNumber: null`. No validation error is shown. The user may not realize the value was discarded.

**Fix:** Either (a) add inline validation to show an error when the current value is non-empty and non-numeric, or (b) switch to numeric state with `parseInt` and fallback defaults, matching the established pattern.

---

## ARCH-2: `ContestsLayout` uses event delegation with hardcoded DOM queries — fragile pattern (carried from cycle 18) [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/contests/layout.tsx:40-43`
**Confidence:** MEDIUM

Carried from cycle 18. The layout uses `document.getElementById("main-content")` and `document.querySelector("[data-slot='sidebar']")` to attach click handlers. These DOM queries are fragile — if the IDs or data-slot attributes change, the handlers silently stop working.

**Fix:** Add a defensive check and console warning if the elements are not found. No immediate action needed.

---

## Previously Fixed — Verified

- ARCH-1 from cycle 21 (formatDetailsJson DRY violation in anti-cheat-dashboard): Fixed — now uses i18n `t()` function
- ARCH-3 from cycle 21 (inconsistent Number() vs parseInt()): Fixed — all form inputs now use `parseInt()`

---

## Verified Safe

- `apiFetchJson` adoption is comprehensive across contest components and admin panels
- `useVisibilityPolling` is the standard polling pattern
- `copyToClipboard` utility properly centralizes clipboard logic
- Formatting utilities are well-consolidated in `src/lib/formatting.ts`
- Navigation patterns are centralized via `forceNavigate` and `public-nav`
- Auth flow uses proper session handling with `createApiHandler`

# RPF Cycle 2 — Designer (UI/UX)

**Date:** 2026-04-22
**Base commit:** 14218f45

## Findings

### DES-1: `contest-clarifications.tsx` shows raw UUID `userId` to participants — poor UX [LOW/MEDIUM]

**File:** `src/components/contest/contest-clarifications.tsx:257`
**Description:** When a non-admin participant views clarifications from other users, the component displays `clarification.userId` (a raw UUID like `550e8400-e29b-41d4-a716-446655440000`). This is meaningless to users and breaks the mental model of "who asked this question." The current user's own clarifications show "Asked by me" which is good, but all other users' questions show a UUID.
**Fix:** Requires backend change to include `userName` in the API response. Frontend should then display the resolved name.

### DES-2: `contest-clarifications.tsx` uses native `<select>` element instead of project's `Select` component — inconsistent styling [LOW/LOW]

**File:** `src/components/contest/contest-clarifications.tsx:204-217`
**Description:** The problem selector in the clarification form uses a native `<select>` element with Tailwind classes instead of the project's `Select`/`SelectTrigger`/`SelectContent`/`SelectItem` components used everywhere else (e.g., in `recruiting-invitations-panel.tsx`). This creates visual inconsistency — the native select has a different appearance, focus ring, and dropdown behavior compared to the Radix-based Select.
**Fix:** Replace the native `<select>` with the project's `Select` component family.

### DES-3: `recruiting-invitations-panel.tsx` date input has no aria-label [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:403-408`
**Description:** The custom expiry date `<Input type="date">` has no `aria-label` or associated `<Label htmlFor>` attribute. Screen readers will announce it as "date" without context about what date it represents.
**Fix:** Add `aria-label={t("expiryDate")}` or use a `Label` with `htmlFor`.

## Verified Safe

- Anti-cheat privacy notice now uses `<Button>` component (cycle 1 fix verified)
- All form inputs in compiler-client have proper labels and aria attributes
- Focus management in dialogs uses proper component patterns
- Korean letter spacing rule is correctly applied — no custom tracking on Korean text

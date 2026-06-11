# Designer — RPF Cycle 5

**Reviewer:** designer
**Base commit:** 00002346
**Date:** 2026-04-22

## Findings

### DES-1: `discussion-post-delete-button.tsx` — unhelpful error message shown to user on non-JSON error [MEDIUM/MEDIUM]

**File:** `src/components/discussions/discussion-post-delete-button.tsx:25-33`
**Confidence:** HIGH

When `.json()` throws on a non-JSON error, the SyntaxError message is shown in the toast. The message "Unexpected token < in JSON at position 0" is meaningless to users. The error toast should show a localized, user-friendly message.

**Fix:** Check `response.ok` first, show localized error message.

---

### DES-2: `accepted-solutions.tsx` — native `<select>` elements have inconsistent styling [LOW/LOW]

**File:** `src/components/problem/accepted-solutions.tsx:104-117,122-137`
**Confidence:** HIGH

Two native `<select>` elements for sort and language filter. They don't match the project's design system:
- Inconsistent border radius and padding
- No focus ring styling
- Different dropdown appearance across browsers
- Poor dark mode support

**Fix:** Replace with project's `Select` component.

---

### DES-3: `anti-cheat-dashboard.tsx` — native `<select>` for student filter [LOW/LOW]

**File:** `src/components/contest/anti-cheat-dashboard.tsx:419-432`
**Confidence:** HIGH

Same issues as DES-2.

**Fix:** Replace with project's `Select` component.

---

### DES-4: `anti-cheat-dashboard.tsx` — stale data without visual indicator [MEDIUM/LOW]

**File:** `src/components/contest/anti-cheat-dashboard.tsx`
**Confidence:** MEDIUM

Unlike the leaderboard and quick-stats components which show a refresh spinner during polling, the anti-cheat dashboard has no visual indication that data is being refreshed. When polling is added, a subtle refresh indicator should be included.

**Fix:** Add refresh indicator when implementing `useVisibilityPolling`.

---

### DES-5: `code-timeline-panel.tsx` — no error or empty state feedback [LOW/MEDIUM]

**File:** `src/components/contest/code-timeline-panel.tsx:47-61`
**Confidence:** MEDIUM

When the fetch fails, the user sees an empty timeline with "No snapshots" — indistinguishable from a legitimate empty state. A clear error state with a retry button is needed.

**Fix:** Add error state with retry button, consistent with other components like `leaderboard-table.tsx`.

## Summary

5 findings: 1 MEDIUM/MEDIUM, 1 MEDIUM/LOW, 1 LOW/MEDIUM, 2 LOW/LOW.

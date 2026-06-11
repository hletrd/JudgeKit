# Cycle 45 — Designer

**Date:** 2026-04-23
**Base commit:** d96a984f

## UI/UX Review

This project contains a substantial web frontend with React components, Tailwind CSS, and i18n support (Korean/English). Reviewing UI/UX concerns.

### DES-1: Contest list page uses hardcoded badge colors without design tokens [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/contests/page.tsx:226-230`

```tsx
<Badge className={`text-xs ${contest.examMode === "scheduled" ? "bg-blue-500 text-white" : "bg-purple-500 text-white"}`}>
<Badge className={`text-xs ${contest.scoringModel === "ioi" ? "bg-teal-500 text-white" : "bg-orange-500 text-white"}`}>
```

The badge colors are hardcoded Tailwind utility classes rather than using design tokens or semantic color variables. This makes it harder to maintain consistent theming (e.g., dark mode adjustments). However, the project uses Tailwind's default color palette, so this is consistent with the existing approach.

**Fix:** Low priority — extract to semantic color tokens if the project adopts a design system.

---

### DES-2: Resubmit button fails silently when problem is deleted [MEDIUM/LOW]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:83-96`

If `submission.problem` is null (e.g., problem was deleted), `handleResubmit()` throws on `submission.problem!.id` and the user gets no feedback. The button appears functional but does nothing.

**Fix:** Guard the resubmit button with a check for `submission.problem`, or show a disabled state with a tooltip explaining the problem was deleted.

---

### DES-3: Countdown timer uses `Date.now()` for client-side deadline — acceptable trade-off [LOW/LOW]

**File:** `src/components/exam/countdown-timer.tsx:46-47`

The countdown timer uses `Date.now()` for client-side time. This is acceptable because:
1. The timer includes a server-time sync mechanism (lines 69-82) that measures round-trip time
2. The actual deadline enforcement is server-side (using DB time)
3. Client-side countdown is display-only

No fix needed.

---

## Summary

| ID | Severity/Confidence | Description |
|----|----|----|
| DES-1 | LOW/LOW | Hardcoded badge colors without design tokens |
| DES-2 | MEDIUM/LOW | Resubmit button fails silently when problem is deleted |
| DES-3 | LOW/LOW | Countdown timer Date.now() is acceptable (server-synced) |

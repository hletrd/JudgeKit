# Designer (UI/UX) Review — Cycle 1 (New Session)

**Reviewer:** designer
**Date:** 2026-04-28
**Scope:** UI/UX review of public contest and problem detail pages

---

## Findings

### DES-1: [LOW] Enrolled contest detail page has inconsistent badge colors for exam modes

**File:** `src/app/(public)/contests/[id]/page.tsx:236-237`
**Confidence:** MEDIUM

```tsx
<Badge className={contest.examMode === "scheduled" ? "bg-blue-500 text-white" : "bg-purple-500 text-white"}>
```

The exam mode badge uses hardcoded Tailwind color classes (`bg-blue-500`, `bg-purple-500`) that do not adapt to dark mode. While `text-white` provides contrast in light mode, in dark mode these saturated backgrounds may not have sufficient contrast against dark backgrounds. The project uses `next-themes` for dark mode support.

**Fix:** Use the Badge component's built-in variant system with appropriate dark-mode variants, or use `dark:` prefixed Tailwind classes.

---

### DES-2: [LOW] "Virtual Practice" section for expired contests could confuse students

**File:** `src/app/(public)/contests/[id]/page.tsx:660-677`

When a contest is expired/closed and has public problems, a "Virtual Practice" section is shown. This links directly to `/practice/problems/[id]` without the `assignmentId` parameter, so the student enters a different context (standalone practice vs. contest context). The transition is not clearly communicated.

**Fix:** Add a brief note that virtual practice problems are outside the original contest context, or add the `assignmentId` parameter if the problems should retain contest context.

---

### DES-3: [INFO] Contest detail page has good responsive design

The enrolled contest view uses proper responsive patterns:
- `flex-wrap` for badge groups
- `text-2xl sm:text-3xl` for responsive heading
- `overflow-x-auto` for tables
- `grid grid-cols-1 lg:grid-cols-2` in the problem detail page

No significant responsive design issues found.

---

### DES-4: [INFO] Anti-cheat privacy notice dialog properly blocks interaction

**File:** `src/components/exam/anti-cheat-monitor.tsx:274-299`

The privacy notice dialog:
- Cannot be dismissed without clicking "Accept" (`onOpenChange` is a no-op, `showCloseButton={false}`)
- Lists specific data collection activities
- Uses proper `DialogDescription` for screen readers
- Follows accessibility best practices

No accessibility issues found.

# Code Review — Cycle 2

**Reviewer:** code-reviewer
**Date:** 2026-04-28
**Scope:** Verification of cycle 1 fixes + new deep review

---

## Cycle 1 Fix Verification

### VERIFIED: AGG-1 (totalPoints reduce initial value)
- **File:** `src/app/(public)/contests/[id]/page.tsx:184`
- Code now reads `sortedProblems.reduce((sum, p) => sum + p.points, 0)` — correct.
- However, the `points` property comes from `public-contests.ts:349` which uses `ap.points ?? 100`. If `ap.points` is null/undefined, 100 is used as a default, inflating the total. This is a separate but related concern — see CR-6 below.

### VERIFIED: AGG-2 (examDurationMinutes on problem detail page)
- **File:** `src/app/(public)/practice/problems/[id]/page.tsx:158,184,207,481`
- `assignmentContext` type now includes `examDurationMinutes: number | null`.
- DB query includes `examDurationMinutes: true`.
- `StartExamButton` receives `assignmentContext.examDurationMinutes ?? 0` — correct.

### VERIFIED: AGG-9 (redundant getExamSession fallback removed)
- **File:** `src/app/(public)/contests/[id]/page.tsx:173`
- Now uses `contest.examSession` directly from `getEnrolledContestDetail` — correct.

### VERIFIED: AGG-13 (badge colors dark mode)
- **File:** `src/app/(public)/contests/[id]/page.tsx:233-237`
- Badges now include dark mode classes (`dark:bg-blue-600`, `dark:bg-purple-600`, etc.) — correct.

### VERIFIED: AGG-15 (layout comment)
- **File:** `src/app/(public)/contests/[id]/layout.tsx:17`
- Comment now includes "An upstream issue should be filed/linked here if not already tracked." — correct.

---

## New Findings

### CR-6: [MEDIUM] Inconsistent dark-mode badge styling between contest list and contest detail

**File:** `src/app/(public)/contests/page.tsx:188`
**Confidence:** HIGH

```tsx
<Badge className={`text-xs ${contest.examMode === "scheduled" ? "bg-blue-500 text-white" : "bg-purple-500 text-white"}`}>
```

The "My Contests" section in the contests listing page still uses hardcoded `bg-blue-500`/`bg-purple-500` without dark mode variants. This is the same pattern that was fixed in AGG-13 for the contest detail page, but the fix was not applied consistently to the listing page.

Meanwhile, `public-contest-list.tsx:105` already has dark mode variants (`dark:bg-purple-500`, `dark:bg-blue-500`).

**Failure scenario:** In dark mode, the My Contests section badges have poor contrast while the catalog section badges look fine.

**Fix:** Add dark mode variants to the badge in `contests/page.tsx:188`.

---

### CR-7: [LOW] `getContestStatusBorderClass` in contests page missing dark mode variants

**File:** `src/app/(public)/contests/page.tsx:26-37`
**Confidence:** LOW

The `getContestStatusBorderClass` function uses `border-l-blue-500`, `border-l-green-500`, `border-l-gray-400` without dark mode variants. The same function in `public-contest-list.tsx:32-42` includes dark variants (`dark:border-l-blue-400`, etc.).

**Fix:** Add dark mode border variants to match the public contest list implementation.

---

### CR-8: [MEDIUM] `points ?? 100` default in `public-contests.ts` inflates displayed total when points is null

**File:** `src/lib/assignments/public-contests.ts:349`
**Confidence:** HIGH

```tsx
points: ap.points ?? 100,
```

When `ap.points` is null (e.g., points not set for an assignment problem), the default is 100. This default flows into `sortedProblems` and then into `totalPoints`. While this matches the dashboard behavior (`dashboard/contests/[assignmentId]/page.tsx:166` uses `p.points ?? 100`), the issue is that the `totalPoints` displayed to students in the enrolled view could be misleading if any problem has null points — the student sees 100 points for a problem that may have no assigned point value.

The `AssignmentOverview` component also renders `problem.points ?? 100` in the table (line 272). This is a consistent pattern across the codebase but could confuse students if the assignment creator left points unset.

**Failure scenario:** An instructor creates a contest with 3 problems but forgets to set points. Students see "Total: 300 points" when the actual scoring is undefined.

**Fix:** Either require `points` to be non-null in the assignment creation flow, or display a warning/placeholder when points is null rather than defaulting to 100.

---

### CR-9: [LOW] Import route still has unsafe `as JudgeKitExport` cast in JSON path

**File:** `src/app/api/v1/admin/migrate/import/route.ts:164-166`
**Confidence:** HIGH (carried from AGG-6)

The JSON body path still contains:
```tsx
const data: JudgeKitExport = parsedBody.data.data
  ? parsedBody.data.data as JudgeKitExport
  : restFields as unknown as JudgeKitExport;
```

The Zod schema validates `data: z.unknown().optional()`, which provides no type safety. While `validateExport(data)` runs afterward, the cast itself is unsound. This is a carried-over finding that hasn't been addressed.

**Fix:** Create a proper Zod schema for `JudgeKitExport` and use it as the `data` field type.

---

## File Inventory

All recently modified files were re-examined:
- `src/app/(public)/contests/[id]/page.tsx` — verified cycle 1 fixes
- `src/app/(public)/practice/problems/[id]/page.tsx` — verified cycle 1 fixes
- `src/app/(public)/contests/[id]/layout.tsx` — verified cycle 1 fixes
- `src/app/(public)/contests/page.tsx` — new finding (CR-6, CR-7)
- `src/lib/assignments/public-contests.ts` — new finding (CR-8)
- `src/components/assignment/assignment-overview.tsx` — related to CR-8
- `src/app/api/v1/admin/migrate/import/route.ts` — carried finding (CR-9)

# Cycle 7 Review Remediation Plan

**Date:** 2026-04-28
**Source:** `.context/reviews/_aggregate.md` (cycle 7)
**Status:** DONE

---

## Tasks

### Task A: [MEDIUM] Pass locale to formatDifficulty in dashboard problems page

- **Source:** C7-AGG-1 (C7-CR-1)
- **Files:**
  - `src/app/(dashboard)/dashboard/problems/page.tsx:649` — pass `locale` to `formatDifficulty`
- **Fix:**
  1. Change `formatDifficulty(problem.difficulty)` to `formatDifficulty(problem.difficulty, locale)` on line 649
  2. The `locale` variable is already available (line 131: `const locale = await getLocale()`)
- **Exit criteria:** `formatDifficulty` call passes `locale` argument, consistent with all other call sites
- [x] Done (commit 02be3574)

### Task B: [MEDIUM] Add contest status badge to enrolled contest detail view

- **Source:** C7-AGG-2 (C7-CR-2)
- **Files:**
  - `src/app/(public)/contests/[id]/page.tsx:229-236` — add status badge before exam mode badge
- **Fix:**
  1. Import `getContestStatusBadgeVariant` from `../_components/contest-status-styles`
  2. Add a status badge as the first badge in the flex container:
     ```
     <Badge variant={getContestStatusBadgeVariant(contest.status)} className="text-xs">
       {statusLabels[contest.status]}
     </Badge>
     ```
  3. Both `contest.status` and `statusLabels` are already available in this component scope
- **Exit criteria:** Enrolled contest view shows a status badge consistent with dashboard and public views
- [x] Done (commit 02be3574)

### Task C: [LOW] Extract inline badge class strings to shared utility

- **Source:** C7-AGG-3 (C7-CR-3)
- **Files:**
  - `src/app/(public)/_components/contest-status-styles.ts` — add `getExamModeBadgeClass` and `getScoringModelBadgeClass`
  - `src/app/(public)/contests/[id]/page.tsx:230-234` — use shared utilities
  - `src/app/(public)/contests/page.tsx:155-159` — use shared utilities
  - `src/app/(public)/_components/public-contest-list.tsx:93,96,136,139` — use shared utilities
  - `src/app/(dashboard)/dashboard/contests/page.tsx:197-201` — use shared utilities
  - `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:339-342` — use shared utilities (discovered during implementation)
- **Fix:**
  1. Add to `contest-status-styles.ts`:
     ```ts
     export type ExamModeKey = "none" | "scheduled" | "windowed";
     export type ScoringModelKey = "ioi" | "icpc";

     export function getExamModeBadgeClass(mode: ExamModeKey): string {
       return mode === "scheduled"
         ? "text-xs bg-blue-500 text-white dark:bg-blue-600 dark:text-white"
         : "text-xs bg-purple-500 text-white dark:bg-purple-600 dark:text-white";
     }

     export function getScoringModelBadgeClass(model: ScoringModelKey): string {
       return model === "icpc"
         ? "text-xs bg-orange-500 text-white dark:bg-orange-600 dark:text-white"
         : "text-xs bg-teal-500 text-white dark:bg-teal-600 dark:text-white";
     }
     ```
     Note: `ExamModeKey` includes `"none"` to match the `ExamMode` type from `src/types/index.ts`.
     The `"none"` value falls through to the windowed style as a safe default.
  2. Replace inline class strings in all 5 files with the shared function calls
  3. Verify visual consistency across all contest pages
- **Exit criteria:** All contest badge class strings use shared utilities; no inline badge color duplication
- [x] Done (commit 02be3574)

---

## Deferred Items

The following findings from the cycle 7 review are deferred this cycle with reasons:

| C7-AGG ID | Description | Severity | Reason for deferral | Exit criterion |
|-----------|-------------|----------|---------------------|----------------|
| (none) | | | | |

---

## Notes

- C7-AGG-1 (formatDifficulty missing locale) is the same bug class as C4-B/C (formatScore missing locale), which was fixed in cycles 4-5. This instance was missed during the earlier review because it uses `formatDifficulty` rather than `formatScore`.
- C7-AGG-2 (missing status badge in enrolled view) is a consistency gap between the enrolled contest rendering path and all other contest views.
- C7-AGG-3 (inline badge class duplication) is the same class of issue as C2-AGG-8/C5-AGG-1/C6-AGG-1 where utility functions were progressively extracted to shared modules.
- During implementation of Task C, an additional file with inline badge duplication was discovered: `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx`. This was also updated to use the shared utilities.
- `ExamModeKey` was widened to include `"none"` to match the `ExamMode` type, preventing TypeScript errors when the contest data type is `ExamMode`.

# Cycle 6 Review Remediation Plan

**Date:** 2026-04-28
**Source:** `.context/reviews/_aggregate.md` (cycle 6)
**Status:** DONE

---

## Tasks

### Task A: [MEDIUM] Extract `getStatusBadgeVariant` to shared utility

- **Source:** C6-AGG-1 (C6-CR-1)
- **Files:**
  - `src/app/(public)/_components/contest-status-styles.ts` — add `getStatusBadgeVariant` export
  - `src/app/(dashboard)/dashboard/contests/page.tsx:35-48` — remove local function, import from shared
  - `src/app/(public)/contests/page.tsx:20-33` — remove local function, import from shared
- **Fix:**
  1. Add `getStatusBadgeVariant(status: ContestStatusKey)` to `contest-status-styles.ts`, returning `"secondary" | "success" | "default" | "outline"` per the existing mapping
  2. Update the `ContestStatusKey` type or import it alongside the new function
  3. Delete both local `getStatusBadgeVariant` definitions
  4. Import from shared utility in both pages
  5. Verify `ContestStatus` type is compatible (both use the same union from `@/lib/assignments/contests`)
- **Exit criteria:** Both pages import `getStatusBadgeVariant` from shared utility; no local duplicate definitions
- [x] Done (commit 1638e285)

### Task B: [MEDIUM] Add scoring model badge to public contests "My Contests" section

- **Source:** C6-AGG-2 (C6-CR-2)
- **Files:**
  - `src/app/(public)/contests/page.tsx:166-173` — add scoring model badge after exam mode badge
- **Fix:**
  1. Add a scoring model badge `<Badge>` after the exam mode badge in the "My Contests" section (around line 172)
  2. Use the same pattern as the dashboard contests page:
     ```
     <Badge className={`text-xs ${contest.scoringModel === "ioi" ? "bg-teal-500 text-white dark:bg-teal-600 dark:text-white" : "bg-orange-500 text-white dark:bg-orange-600 dark:text-white"}`}>
       {contest.scoringModel === "ioi" ? tContests("scoringModelIoi") : tContests("scoringModelIcpc")}
     </Badge>
     ```
  3. Also add `dark:text-white` to the existing exam mode badge on line 170 (fixes Task C for this file)
- **Exit criteria:** "My Contests" section shows IOI/ICPC scoring model badge; visual consistency with dashboard
- [x] Done (commit 1638e285)

### Task C: [LOW] Add `dark:text-white` to 5 public contest badges missing it

- **Source:** C6-AGG-3 (C6-CR-3)
- **Files:**
  - `src/app/(public)/contests/page.tsx:170` — exam mode badge (may be fixed by Task B)
  - `src/app/(public)/_components/public-contest-list.tsx:93` — active contest exam mode badge
  - `src/app/(public)/_components/public-contest-list.tsx:96` — active contest scoring badge
  - `src/app/(public)/_components/public-contest-list.tsx:136` — archived contest exam mode badge
  - `src/app/(public)/_components/public-contest-list.tsx:139` — archived contest scoring badge
- **Fix:**
  1. Add `dark:text-white` to each badge's className string
  2. Verify the badge pattern matches the dashboard versions (which all have `dark:text-white`)
- **Exit criteria:** All colored badges in public contest pages include `dark:text-white`, consistent with dashboard pages
- [x] Done (commit 1638e285)

---

## Deferred Items

The following findings from the cycle 6 review are deferred this cycle with reasons:

| C6-AGG ID | Description | Severity | Reason for deferral | Exit criterion |
|-----------|-------------|----------|---------------------|----------------|
| (none) | | | | |

---

## Notes

- C6-AGG-1 (duplicate `getStatusBadgeVariant`) is the same bug class as C2-AGG-8/C5-AGG-1 (duplicate `getStatusBorderClass`). The pattern of duplicating contest styling functions across dashboard/public pages keeps recurring and should be consolidated.
- C6-AGG-2 (missing scoring badge) is a feature gap discovered while verifying C5-AGG-1 — the "My Contests" section was added to the public page but was not given the same badges as the dashboard and catalog views.
- C6-AGG-3 (missing `dark:text-white`) is a minor consistency issue that could become a real bug if Badge base styles change. Task B partially addresses it for `contests/page.tsx`.

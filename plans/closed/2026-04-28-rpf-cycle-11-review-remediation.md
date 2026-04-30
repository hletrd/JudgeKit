# Cycle 11 Review Remediation Plan

**Date:** 2026-04-28
**Source:** `.context/reviews/_aggregate.md` (cycle 11)
**Status:** DONE

---

## Tasks

### Task A: [MEDIUM] Add dark mode variants to leaderboard rank 2 and 3 trophy icons

- **Source:** C11-AGG-1 (C11-CR-1)
- **Files:**
  - `src/components/contest/leaderboard-table.tsx:85` — `text-slate-400` missing dark variant
  - `src/components/contest/leaderboard-table.tsx:86` — `text-amber-600` missing dark variant
- **Fix:**
  1. Change `text-slate-400` to `text-slate-400 dark:text-slate-300` (line 85)
  2. Change `text-amber-600` to `text-amber-600 dark:text-amber-400` (line 86)
- **Exit criteria:** Both rank 2 and rank 3 trophy icons have dark mode text variants
- [x] Done

### Task B: [MEDIUM] Add dark mode variant to contest join CheckCircle2 icon

- **Source:** C11-AGG-2 (C11-CR-2)
- **Files:**
  - `src/app/(public)/contests/join/contest-join-client.tsx:91` — `text-green-500` missing dark variant
- **Fix:**
  1. Change `text-green-500 animate-pulse` to `text-green-500 dark:text-green-400 animate-pulse`
- **Exit criteria:** Large success icon has dark mode variant
- [x] Done

### Task C: [LOW] Add dark mode variants to API keys and copy-code-button check icons

- **Source:** C11-AGG-3 (C11-CR-3, C11-CR-4)
- **Files:**
  - `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:483` — `text-green-500` missing dark variant
  - `src/components/code/copy-code-button.tsx:39` — `text-green-500` missing dark variant
- **Fix:**
  1. Change `text-green-500` to `text-green-500 dark:text-green-400` in api-keys-client.tsx
  2. Change `text-green-500` to `text-green-500 dark:text-green-400` in copy-code-button.tsx
- **Exit criteria:** Both "copied" check icons have dark mode variants
- [x] Done

### Task D: [LOW] Add dark mode variants to status board override icons

- **Source:** C11-AGG-4 (C11-CR-5)
- **Files:**
  - `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/status-board.tsx:219` — `text-amber-500` missing dark variant
  - `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/status-board.tsx:464` — `text-amber-500` missing dark variant
- **Fix:**
  1. Change both instances of `text-amber-500` to `text-amber-500 dark:text-amber-400`
- **Exit criteria:** Override indicator icons have dark mode variants
- [x] Done

### Task E: [LOW] Add dark mode variants to compiler client status labels and output

- **Source:** C11-AGG-5 (C11-CR-6)
- **Files:**
  - `src/components/code/compiler-client.tsx:524` — `text-yellow-600` missing dark variant
  - `src/components/code/compiler-client.tsx:529` — `text-red-600` missing dark variant
  - `src/components/code/compiler-client.tsx:566` — `text-red-600` missing dark variant
  - `src/components/code/compiler-client.tsx:577` — `text-red-600` missing dark variant
- **Fix:**
  1. Change `text-yellow-600` to `text-yellow-600 dark:text-yellow-400` (line 524)
  2. Change `text-red-600` to `text-red-600 dark:text-red-400` (lines 529, 566, 577)
- **Exit criteria:** All compiler status text colors have dark mode variants
- [x] Done

### Task F: [LOW] Add dark mode variants to problems page stat icons and labels

- **Source:** C11-AGG-6 (C11-CR-7)
- **Files:**
  - `src/app/(dashboard)/dashboard/problems/page.tsx:436` — `text-emerald-600` missing dark variant
  - `src/app/(dashboard)/dashboard/problems/page.tsx:456` — `text-amber-600` missing dark variant
  - `src/app/(dashboard)/dashboard/problems/page.tsx:493` — `text-emerald-600` missing dark variant
  - `src/app/(dashboard)/dashboard/problems/page.tsx:500` — `text-amber-600` missing dark variant
- **Fix:**
  1. Change `text-emerald-600` to `text-emerald-600 dark:text-emerald-400` (lines 436, 493)
  2. Change `text-amber-600` to `text-amber-600 dark:text-amber-400` (lines 456, 500)
- **Exit criteria:** Problems page stat colors have dark mode variants
- [x] Done

### Task G: [LOW] Add dark mode variants to create-problem and assignment-form locked notices

- **Source:** C11-AGG-7 (C11-CR-8)
- **Files:**
  - `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:802` — `text-amber-600` missing dark variant
  - `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:565` — `text-amber-600` missing dark variant
- **Fix:**
  1. Change both instances of `text-amber-600` to `text-amber-600 dark:text-amber-400`
- **Exit criteria:** Locked notice text has dark mode variants
- [x] Done

### Task H: [LOW] Add dark mode variants to chat widget admin config success text

- **Source:** C11-AGG-8 (C11-CR-9)
- **Files:**
  - `src/lib/plugins/chat-widget/admin-config.tsx:179` — `text-green-600` missing dark variant
  - `src/lib/plugins/chat-widget/admin-config.tsx:242` — `text-green-600` conditional missing dark variant
- **Fix:**
  1. Change `text-green-600 font-medium` to `text-green-600 dark:text-green-400 font-medium` (line 179)
  2. Change `"text-green-600"` to `"text-green-600 dark:text-green-400"` (line 242)
- **Exit criteria:** Chat widget admin green text has dark mode variant
- [x] Done

### Task I: [LOW] Add dark mode variants to change password alert box border/background

- **Source:** C11-AGG-9 (C11-CR-10)
- **Files:**
  - `src/app/change-password/change-password-form.tsx:86` — `border-amber-500/40 bg-amber-500/10` missing dark variants
- **Fix:**
  1. Change `border-amber-500/40 bg-amber-500/10` to `border-amber-500/40 bg-amber-500/10 dark:border-amber-400/30 dark:bg-amber-500/5`
- **Exit criteria:** Alert box border and background have dark mode variants
- [x] Done

---

## Deferred Items

The following findings from the cycle 11 review are deferred this cycle with reasons:

| C11-AGG ID | Description | Severity | Reason for deferral | Exit criterion |
|-----------|-------------|----------|---------------------|----------------|
| (none) | | | | |

All findings are scheduled for implementation this cycle.

---

## Notes

- All 9 findings this cycle are dark mode consistency issues, the same bug class progressively fixed in cycles 4-10. The review scope is expanding to cover more files each cycle.
- The compiler-client.tsx (Task E) accounts for 4 color instances in a single file, making it efficient to fix together.
- The problems page (Task F) accounts for 4 color instances, also efficient to fix together.
- Tasks C and D each affect 2 instances across 2 files or within 1 file.
- The change password alert (Task I) is the first `border-` level finding — border opacity values need adjustment for dark mode.

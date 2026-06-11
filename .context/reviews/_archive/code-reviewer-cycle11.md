# Code Reviewer — Cycle 11

**Date:** 2026-04-28
**Scope:** Full repository deep review, focusing on cycle 1-10 fix verification and new/remaining issues

---

## Cycle 1-10 Fix Verification

All cycle 1-10 fixes were re-verified in source code. Key confirmations:

- C10-AGG-1: `formatNumber` in sidebar panel now passes `locale` — confirmed at `active-timed-assignment-sidebar-panel.tsx:179`
- C10-AGG-2: Sidebar progress bar has `bg-red-500 dark:bg-red-600` — confirmed at line 185
- C10-AGG-3: Submission overview icons all have `dark:text-*-400` variants — confirmed at lines 177, 181, 185, 190
- C10-AGG-4: Anti-cheat dashboard user icon has `text-orange-500 dark:text-orange-400` — confirmed at line 399
- C10-AGG-5: Leaderboard trophy rank 1 has `text-yellow-500 dark:text-yellow-400` — confirmed at line 84
- C10-AGG-6: Language config table badges all have dark mode variants — confirmed at lines 328, 424, 429, 430
- C10-AGG-7: File upload dialog success text has `text-green-600 dark:text-green-400` — confirmed at line 189
- C10-AGG-8: Contest join success text has `text-green-600 dark:text-green-400` — confirmed at line 92
- C9 Tasks A-F: All confirmed applied (analytics charts fills, legend swatches, progress bar, text colors, anti-cheat icon bg, SVG palette)
- C8 Tasks A-E: All confirmed applied (formatBytes locale, formatNumber comment, contest status labels, badge dark mode, progress bar)

No regressions found in any prior cycle fixes.

---

## New Findings

### C11-CR-1: [MEDIUM] Leaderboard rank 2 and 3 trophy icons missing dark mode variants

**File:** `src/components/contest/leaderboard-table.tsx:85-86`
**Confidence:** HIGH

Rank 1 trophy was fixed in C10-AGG-5, but rank 2 and 3 were missed:
- Line 85: `text-slate-400` without dark mode — in dark mode, slate-400 may be too bright against dark backgrounds
- Line 86: `text-amber-600` without dark mode — inconsistent with rank 1's dark mode treatment

**Fix:** Change `text-slate-400` to `text-slate-400 dark:text-slate-300`; change `text-amber-600` to `text-amber-600 dark:text-amber-400`.

---

### C11-CR-2: [MEDIUM] Contest join CheckCircle2 icon missing dark mode variant

**File:** `src/app/(public)/contests/join/contest-join-client.tsx:91`
**Confidence:** HIGH

`<CheckCircle2 className="h-14 w-14 text-green-500 animate-pulse" />` — the large success icon uses `text-green-500` without dark mode. The adjacent text was fixed in C10-AGG-8 (`text-green-600 dark:text-green-400`) but the icon was missed. This is a prominent 56x56px icon — very visible in dark mode.

**Fix:** Change to `text-green-500 dark:text-green-400`.

---

### C11-CR-3: [LOW] API keys page copy-check icon missing dark mode variant

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:483`
**Confidence:** MEDIUM

`<Check className="h-3.5 w-3.5 text-green-500" />` — small icon indicating copied state. Same pattern as copy-code-button but in admin section.

**Fix:** Change to `text-green-500 dark:text-green-400`.

---

### C11-CR-4: [LOW] Copy-code-button check icon missing dark mode variant

**File:** `src/components/code/copy-code-button.tsx:39`
**Confidence:** MEDIUM

`<Check className="h-3.5 w-3.5 text-green-500" />` — same pattern as C11-CR-3. Small confirmation icon.

**Fix:** Change to `text-green-500 dark:text-green-400`.

---

### C11-CR-5: [LOW] Status board override icons missing dark mode variants

**File:** `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/status-board.tsx:219,464`
**Confidence:** MEDIUM

`<PenLine className="size-3 shrink-0 text-amber-500" />` — override indicator icon without dark mode. Appears in two locations.

**Fix:** Change both instances to `text-amber-500 dark:text-amber-400`.

---

### C11-CR-6: [LOW] Compiler client status labels missing dark mode variants

**File:** `src/components/code/compiler-client.tsx:524,529,566,577`
**Confidence:** MEDIUM

- Line 524: `text-yellow-600` (timed out label) — missing dark mode
- Line 529: `text-red-600` (compile error label) — missing dark mode
- Lines 566, 577: `text-red-600` on stderr/compile output blocks — missing dark mode

**Fix:** Add `dark:text-yellow-400` for line 524, `dark:text-red-400` for lines 529, 566, 577.

---

### C11-CR-7: [LOW] Problems page stat icons and labels missing dark mode variants

**File:** `src/app/(dashboard)/dashboard/problems/page.tsx:436,456,493,500`
**Confidence:** MEDIUM

- Line 436: `text-emerald-600` on solved span — missing dark mode
- Line 456: `text-amber-600` on attempted span — missing dark mode
- Line 493: `text-emerald-600` on CheckCircle2 icon — missing dark mode
- Line 500: `text-amber-600` on XCircle icon — missing dark mode

The parent containers already have dark mode backgrounds (`dark:bg-emerald-950/20`, `dark:bg-amber-950/20`) but the text/icons themselves lack variants.

**Fix:** Add `dark:text-emerald-400` and `dark:text-amber-400` respectively.

---

### C11-CR-8: [LOW] Create problem form and assignment form locked notice missing dark mode variants

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:802`
**File:** `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:565`
**Confidence:** LOW

Both use `text-amber-600` for locked/warning notices without dark mode variants.

**Fix:** Change both to `text-amber-600 dark:text-amber-400`.

---

### C11-CR-9: [LOW] Chat widget admin config success text missing dark mode variant

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:179`
**Confidence:** LOW

`<p className="text-xs text-green-600 font-medium">` — missing dark mode. Also line 242 with `text-green-600` in test result status.

**Fix:** Change to `text-green-600 dark:text-green-400`. For line 242, the `text-destructive` already has dark mode support via the design system, so only the green variant needs fixing.

---

### C11-CR-10: [LOW] Change password alert box border/background missing dark mode variants

**File:** `src/app/change-password/change-password-form.tsx:86`
**Confidence:** LOW

`border-amber-500/40 bg-amber-500/10` — the border and background use amber-500 with opacity but lack dark mode variants. The inner text already has `dark:text-amber-200`, so the box styling is the only missing piece.

**Fix:** Add `dark:border-amber-400/30 dark:bg-amber-500/5` for slightly adjusted dark mode styling.

---

## Summary

| Severity | Count |
|----------|-------|
| MEDIUM   | 2     |
| LOW      | 8     |
| **Total** | **10** |

All findings are the same dark mode consistency bug class that has been progressively fixed across cycles 4-10, but in files not previously reached by the review. The pattern is: color utility classes (text-*, bg-*, border-*) at the 500 or 600 level without corresponding `dark:` variants.

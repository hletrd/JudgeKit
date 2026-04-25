# RPF Cycle 32 Review Remediation Plan

**Date:** 2026-04-25
**Base commit:** f9b878c1
**Review artifacts:** `.context/reviews/rpf-cycle-32-comprehensive-review.md` + `.context/reviews/_aggregate-cycle-32.md`

## Previously Completed Tasks (Verified in Current Code)

All cycle 31 tasks are complete:
- [x] Task A: API keys auto-dismiss timer migration — commit 4bba6390
- [x] Task B: start-exam-button throw-then-match fix — commit 1a9f1aab
- [x] Task C: problem-set-form throw-then-match fix — commit c62668f0
- [x] Task D: contest-scoring.ts timestamps — false positive (already correct)
- [x] Task E: KNOWN_BACKUP_ERRORS hoisted to module scope — commit 3cda35af
- [x] Task F: edit-group-dialog/group-members-manager throws — not needed (centralized getErrorMessage)

## Tasks (priority order)

### Task A: Gate ungated `console.error` calls in discussion client components behind dev-only checks [MEDIUM/HIGH]

**From:** AGG-1 (NEW-1)
**Severity / confidence:** MEDIUM / HIGH
**Files:**
- `src/components/discussions/discussion-post-form.tsx:48,57`
- `src/components/discussions/discussion-thread-form.tsx:54,64`
- `src/components/discussions/discussion-post-delete-button.tsx:30,39`
- `src/components/discussions/discussion-thread-moderation-controls.tsx:78,86,103,112`

**Problem:** 10 `console.error()` calls in discussion client components are not gated behind `process.env.NODE_ENV === "development"`. This is the same class of issue fixed in commit a8c41095 (cycle 29). Some of these calls leak raw API error strings via the `as { error?: string }` cast pattern.

**Plan:**
1. Wrap each `console.error()` call with `if (process.env.NODE_ENV === "development")` guard
2. Keep the error handling logic (toast.error) unchanged
3. Verify all gates pass
4. Verify the discussion features still work correctly

**Status:** DONE (commit f8f3d659)

---

### Task B: ~~Gate ungated `console.error` calls in admin and group management client components~~ — FALSE POSITIVE

**From:** AGG-2 (NEW-2)
**Severity / confidence:** MEDIUM / HIGH (false positive upon re-inspection)

**Resolution:** Upon detailed re-inspection, all 14 `console.error`/`console.warn` calls listed in the original finding are already gated behind `process.env.NODE_ENV === "development"` checks. The initial review's grep-based audit incorrectly flagged these as ungated. Each was verified individually to already have the dev-only guard.

---

### Task C: Remove unnecessary throw-then-match in discussion and contest components [LOW/LOW]

**From:** AGG-3, AGG-4, AGG-5 (NEW-3, NEW-4, NEW-5, NEW-6)
**Severity / confidence:** LOW / LOW
**Files:**
- `src/components/discussions/discussion-post-form.tsx:50`
- `src/components/discussions/discussion-thread-form.tsx:56`
- `src/components/contest/contest-clarifications.tsx:120,146,164,178`
- `src/components/contest/contest-announcements.tsx:97,118,141`

**Problem:** 9 handlers across discussion and contest components use `throw new Error(i18nKey)` followed by a catch that shows `toast.error(...)`. The throw is stylistically redundant — inline error handling would be simpler and more consistent with the direction established in cycles 30-31. These all use i18n keys (not raw API errors), so this is not a security concern.

**Plan:**
1. For each handler, replace `throw new Error(...)` with direct `toast.error(...); return;`
2. Remove the try/catch where it becomes unnecessary
3. Verify all gates pass

**Status:** DONE (commits f8f3d659, 6a1ca812)

---

## Deferred Items

### DEFER-45: [MEDIUM] Anti-cheat monitor captures user text snippets in copy/paste event details (AGG-6 / NEW-7)

- **File+line:** `src/components/exam/anti-cheat-monitor.tsx:206-209`
- **Original severity/confidence:** MEDIUM / MEDIUM
- **Reason for deferral:** This is a design decision, not a bug. The text snippet capture is intentional for anti-cheat monitoring. Changing it requires product decision about the trade-off between anti-cheat effectiveness and data minimization. The text snippets help instructors understand what students were copying (e.g., problem text vs. their own code). Removing them reduces anti-cheat effectiveness.
- **Exit criterion:** Product decision is made about whether to (a) remove text snippets and keep only element type context, or (b) document text capture in the student privacy notice. Either approach requires stakeholder input.

### DEFER-22 through DEFER-44: Carried from cycle 31

See cycle 31 plan (now archived) for full details. All carry forward unchanged.

---

## Progress log

- 2026-04-25: Plan created with 3 tasks (A-C) and 1 new deferred item (DEFER-45).
- 2026-04-25: Task A DONE — gated 5 console.error calls in discussion components behind dev-only checks, also replaced throw-then-match with inline error handling in 2 discussion components (commit f8f3d659).
- 2026-04-25: Task B FALSE POSITIVE — all 14 admin/group console.error calls were already gated behind dev-only checks. No changes needed.
- 2026-04-25: Task C DONE — replaced throw-then-match with inline error handling in 7 contest handlers (commit 6a1ca812).
- 2026-04-25: All gates green (eslint 0, tsc clean, vitest 302/302 pass 2197 tests, next build success).

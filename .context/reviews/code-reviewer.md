# Code Quality Review — RPF Cycle 22

**Date:** 2026-04-22
**Reviewer:** code-reviewer
**Base commit:** 88abca22

## CR-1: `create-problem-form.tsx` stores `sequenceNumber` and `difficulty` as string state — no inline validation for invalid numeric input [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:92,108,469,483`
**Confidence:** MEDIUM

Unlike other numeric form inputs in the codebase which use `parseInt(e.target.value, 10) || defaultValue` in their `onChange` handlers and store numeric state, `create-problem-form.tsx` stores `sequenceNumber` and `difficulty` as `string` state (`useState<string>`) and passes `e.target.value` directly. The conversion to number only happens at submit time (lines 394, 411-413). While this works for controlled inputs that may be partially typed, the `sequenceNumber` input at line 469 sets `setSequenceNumber(e.target.value)` without any guard — a user could type "abc" and the form would still attempt submission (though `parseInt` at line 394 would produce `NaN`, caught by `Number.isFinite` at line 401, and silently set to `null`).

**Concrete failure scenario:** A user types "abc" into the sequence number field. The form shows no inline validation error. On submit, `parseInt("abc", 10)` returns `NaN`, `Number.isFinite(NaN)` is false, so `sequenceNumber` is set to `null`. The submission succeeds with a null sequence number. No user-facing error is shown about the invalid input.

**Fix:** Add inline validation feedback (e.g., mark the field with error styling when the current value is non-empty and not a valid number) or show a toast.warning when submitting with invalid numeric input before the silent null fallback.

---

## CR-2: `contest-join-client.tsx` uses manual `apiFetch` + two-branch `.json()` instead of `apiFetchJson` [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:38-49`
**Confidence:** LOW

The component uses `apiFetch` with manual two-branch `.json()` parsing (error branch at line 45, success at line 49) instead of the `apiFetchJson` utility. Other recently-migrated components use `apiFetchJson` for cleaner code.

**Concrete failure scenario:** No failure — the code is correct. It is a style consistency issue only.

**Fix:** Consider migrating to `apiFetchJson` for consistency with other recently-migrated components. Low priority.

---

## CR-3: `recruiting-invitations-panel.tsx` mutation handlers use `apiFetch` while read handlers use `apiFetchJson` — inconsistent API client usage [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:195,133`
**Confidence:** LOW

The `fetchInvitations` function was migrated to `apiFetchJson` (line 133) but `handleCreate` (line 195), `handleRevoke`, and other mutation handlers still use `apiFetch` with manual `.json().catch()`. This is a style consistency issue, not a bug.

**Fix:** Migrate mutation handlers to `apiFetchJson` for consistency. Low priority.

---

## Verified Safe

- All `Number()` -> `parseInt()` migrations from cycle 21 are in place and correct
- `anti-cheat-dashboard.tsx` `formatDetailsJson` properly uses i18n `t()` function (cycle 21 AGG-1 fix confirmed)
- `role-editor-dialog.tsx` uses `parseInt(e.target.value, 10) || 0` correctly (cycle 21 AGG-3 fix confirmed)
- `quick-create-contest-form.tsx` uses `parseInt(e.target.value, 10) || 60/100` correctly (cycle 21 AGG-5 fix confirmed)
- `contest-replay.tsx` slider uses `parseInt(event.target.value, 10)` correctly (cycle 21 AGG-5 fix confirmed)
- All client-side `.json()` calls have `.catch()` guards
- `active-timed-assignment-sidebar-panel.tsx` `aria-valuenow` uses `progressPercent` (not rounded, cycle 21 AGG-8 fix confirmed)
- `contest-replay.tsx` has `aria-valuetext` (cycle 21 AGG-7 fix confirmed)
- `anti-cheat-dashboard.tsx` expand/collapse buttons have `aria-controls` (cycle 21 AGG-6 fix confirmed)
- No `as any` or `@ts-ignore` found in production code
- No `innerHTML` assignments (only `dangerouslySetInnerHTML` with sanitizers)
- Korean letter-spacing properly conditional throughout

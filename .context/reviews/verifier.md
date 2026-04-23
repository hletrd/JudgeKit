# Verifier Review — RPF Cycle 22

**Date:** 2026-04-22
**Reviewer:** verifier
**Base commit:** 88abca22

## V-1: `create-problem-form.tsx` sequence number silently defaults to null on invalid input [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:394,401`
**Confidence:** HIGH

Verified the data flow:
1. User types "abc" in sequence number field
2. `setSequenceNumber("abc")` is called (line 469)
3. On submit, `parseInt("abc", 10)` returns `NaN` (line 394)
4. `Number.isFinite(NaN) && NaN > 0` is false (line 401)
5. `parsedSeqNum` is set to `null`
6. Problem is created with `sequenceNumber: null`
7. No error toast, no inline validation warning

The server-side Zod schema accepts `null` for sequence number, so the submission succeeds. But the user receives no feedback that their input was discarded.

**Fix:** Add a toast.warning or inline error when the value is non-empty and non-numeric before the silent null fallback.

---

## Previously Fixed — Verified

- `anti-cheat-dashboard.tsx` `formatDetailsJson` now uses i18n `t()` function (cycle 21 AGG-1 fix confirmed)
- `role-editor-dialog.tsx` uses `parseInt(e.target.value, 10) || 0` (cycle 21 AGG-3 fix confirmed)
- `quick-create-contest-form.tsx` uses `parseInt(e.target.value, 10) || 60/100` (cycle 21 AGG-5 fix confirmed)
- `contest-replay.tsx` slider uses `parseInt(event.target.value, 10)` (cycle 21 AGG-5 fix confirmed)
- `active-timed-assignment-sidebar-panel.tsx` `aria-valuenow` uses `progressPercent` (cycle 21 AGG-8 fix confirmed)
- `contest-replay.tsx` has `aria-valuetext` (cycle 21 AGG-7 fix confirmed)
- `anti-cheat-dashboard.tsx` expand/collapse buttons have `aria-controls` (cycle 21 AGG-6 fix confirmed)
- All cycle-20 `.catch()` guards confirmed in place
- All cycle-20 `parseInt` fixes confirmed

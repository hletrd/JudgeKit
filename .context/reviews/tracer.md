# Tracer Review — RPF Cycle 22

**Date:** 2026-04-22
**Reviewer:** tracer
**Base commit:** 88abca22

## TR-1: `create-problem-form.tsx` sequence number silent null — causal trace [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:394,401,469`
**Confidence:** MEDIUM

**Trace:**
1. User types "abc" into the sequence number field (line 469: `setSequenceNumber(e.target.value)`)
2. `sequenceNumber` state is now `"abc"`
3. User clicks "Create" button
4. `handleSubmit` is called (line 387)
5. `parseInt("abc", 10)` returns `NaN` (line 394)
6. `Number.isFinite(NaN) && NaN > 0` is `false` (line 401)
7. `parsedSeqNum` is set to `null`
8. Problem is submitted with `sequenceNumber: null`
9. Server accepts `null` as valid (Zod schema allows nullable)
10. Problem created without a sequence number — no error shown to user

**Hypothesis:** The silent null fallback was intended as a convenience (empty = no sequence number), but it also catches truly invalid input that should provide feedback.

**Fix:** Add a check: if `sequenceNumber` is non-empty and `parsedSeqNum` is null, show a toast.warning before proceeding with the submission.

---

## TR-2: `forceNavigate` call sites — confirmed safe (carried from cycle 21) [NO ISSUE]

**File:** `src/lib/navigation/client.ts:3-5`

Re-traced. Both call sites remain justified:
- `src/app/(dashboard)/dashboard/contests/layout.tsx:37` — opt-in data attribute
- `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:23` — RSC streaming bug workaround

---

## Previously Fixed — Verified

- `anti-cheat-dashboard.tsx` `formatDetailsJson` now uses i18n `t()` — trace from cycle 21 TR-1 no longer applies
- `role-editor-dialog.tsx` level input uses `parseInt(e.target.value, 10) || 0` — trace from cycle 21 TR-2 no longer applies

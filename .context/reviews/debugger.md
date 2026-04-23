# Debugger Review — RPF Cycle 22

**Date:** 2026-04-22
**Reviewer:** debugger
**Base commit:** 88abca22

## DBG-1: `create-problem-form.tsx` sequence number silently null on invalid input — user-unfriendly [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:394,401,469`
**Confidence:** MEDIUM

**Trace:**
1. User types "abc" in the sequence number field
2. `setSequenceNumber("abc")` — state is string "abc"
3. User clicks submit
4. `parseInt("abc", 10)` returns `NaN` (line 394)
5. `Number.isFinite(NaN) && NaN > 0` is false (line 401)
6. `parsedSeqNum` is set to `null`
7. Problem is created with `sequenceNumber: null`
8. No user-facing error about the invalid input

**Alternative trace (if using parseInt with inline validation):**
1. User types "abc" — input shows red border or error message
2. User corrects to "3" before submitting
3. `parseInt("3", 10)` = 3, valid
4. Problem created with `sequenceNumber: 3`

**Fix:** Add inline validation or a toast.warning when the sequence number or difficulty fields contain non-numeric, non-empty input.

---

## DBG-2: `contest-replay.tsx` playback `setInterval` drifts in background tabs (carried from cycle 21) [LOW/LOW]

**File:** `src/components/contest/contest-replay.tsx:77-87`
**Confidence:** LOW

Carried from cycle 21 (DBG-3). The replay playback uses `setInterval` without visibility awareness. When the tab is hidden, browsers throttle intervals. On tab return, the replay may have skipped frames or finished unexpectedly. Low severity since this is a cosmetic playback feature.

---

## Verified Safe

- All `res.json()` calls have `.catch()` guards
- No unguarded `innerHTML` assignments
- `apiFetchJson` safely handles both ok and non-ok responses
- Anti-cheat monitor properly uses refs for stable event handlers
- Countdown timer validates `Number.isFinite(data.timestamp)` before using
- `participant-anti-cheat-timeline.tsx` polling correctly resets to first page (no more offset drift)
- `anti-cheat-dashboard.tsx` `formatDetailsJson` now uses i18n `t()` function (cycle 21 fix confirmed)

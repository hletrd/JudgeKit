# Critic Review — RPF Cycle 22

**Date:** 2026-04-22
**Reviewer:** critic
**Base commit:** 88abca22

## CRI-1: `create-problem-form.tsx` silently discards invalid numeric input without feedback [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:394,401,469`
**Confidence:** MEDIUM

The sequence number and difficulty inputs store raw string state and only convert to numbers at submit time. Invalid input (e.g., "abc") is silently converted to `null` via `parseInt` + `Number.isFinite` check. No inline validation or toast warning is shown. This differs from the explicit feedback pattern used elsewhere (e.g., toast.error on submission failure).

**Concrete failure scenario:** A user enters "abc" in the sequence number field. The form shows no error. On submit, the field is silently set to `null` and the problem is created without a sequence number. The user may not notice the omission.

**Fix:** Add inline validation feedback or a toast.warning when submitting with invalid numeric input that gets silently discarded.

---

## CRI-2: Stale plan files continue to accumulate — process debt (carried from cycle 18) [LOW/HIGH]

**Files:** `plans/open/` directory
**Confidence:** HIGH

Carried from cycle 18 (CRI-3). Multiple plan files in `plans/open/` have been present since cycles 8-17 and may have items already implemented. This wastes review effort and creates confusion about what remains.

**Fix:** Audit all open plan files and archive those where all items are DONE.

---

## CRI-3: `recruiter-candidates-panel.tsx` uses export endpoint for display — architectural mismatch (carried) [MEDIUM/MEDIUM]

**File:** `src/components/contest/recruiter-candidates-panel.tsx:50-53`
**Confidence:** HIGH

Carried from cycle 18 (CRI-4). Same finding as PERF-1 and DEFER-29.

---

## Verified Safe

- All cycle-21 fixes confirmed working (formatDetailsJson i18n migration, parseInt fixes, aria-controls, aria-valuetext, aria-valuenow precision)
- Korean letter-spacing compliance maintained
- No new `as any` or `@ts-ignore` introduced
- i18n keys used consistently in new code

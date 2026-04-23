# Test Engineer Review — RPF Cycle 22

**Date:** 2026-04-22
**Reviewer:** test-engineer
**Base commit:** 88abca22

## TE-1: No unit tests for `create-problem-form.tsx` numeric input validation behavior [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:394,401,469`
**Confidence:** HIGH

The sequence number and difficulty inputs have no test coverage for the edge case where non-numeric input is silently discarded (set to null). This is the same finding pattern as CR-1/V-1/DBG-1 but from the test perspective.

**Fix:** Add unit tests for the form's submit handler: valid number, empty string, non-numeric string ("abc"), partial number ("12abc"). Verify the behavior for each case.

---

## TE-2: No component tests for `anti-cheat-dashboard.tsx` (carried from cycle 21) [LOW/MEDIUM]

**File:** `src/components/contest/anti-cheat-dashboard.tsx`
**Confidence:** MEDIUM

Carried from cycle 21 (TE-2). The anti-cheat dashboard component has no component tests. Key interactions to test: event loading, type/student filtering, expand/collapse details, load more pagination, similarity check trigger.

---

## TE-3: No component tests for `role-editor-dialog.tsx` (carried from cycle 21) [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx`
**Confidence:** MEDIUM

Carried from cycle 21 (TE-3). The role editor dialog has no component tests. Key interactions to test: role creation, role editing, level input validation, capability selection.

---

## TE-4: No component tests for `contest-replay.tsx` (carried from cycle 21) [LOW/LOW]

**File:** `src/components/contest/contest-replay.tsx`
**Confidence:** MEDIUM

Carried from cycle 21 (TE-4). The contest replay component has no component tests.

---

## TE-5: `formatDetailsJson` in both anti-cheat components — tests should cover i18n rendering (carried from cycle 21) [LOW/MEDIUM]

**Files:**
- `src/components/contest/anti-cheat-dashboard.tsx` (now i18n-aware)
- `src/components/contest/participant-anti-cheat-timeline.tsx` (i18n-aware since cycle 18)

Carried from cycle 21 (TE-1/TE-11). Both `formatDetailsJson` implementations should have unit tests covering: valid JSON with target field, valid JSON without target field, malformed JSON fallback, empty object.

---

## Carried Forward Test Gaps

- TE-6: `apiFetchJson` helper untested — carried from DEFER-56
- TE-7: Encryption module untested — carried from DEFER-50
- TE-8: `compiler-client.tsx` untested — carried from cycle 16
- TE-9: `invite-participants.tsx` untested — carried from cycle 16
- TE-10: `recruiter-candidates-panel.tsx` untested — carried from cycle 16
- TE-11: `access-code-manager.tsx` untested — carried from cycle 16

---

## Verified Safe

- Unit test suite passes all tests
- Component tests for `contest-quick-stats`, `contest-clarifications`, `contest-announcements` exist and pass
- `formatting.test.ts` covers `formatNumber`, `formatBytes`, `formatScore`, `formatDuration`
- `apiFetch` unit tests exist and pass

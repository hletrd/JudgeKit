# Test Engineer Review — RPF Cycle 18

**Date:** 2026-04-22
**Reviewer:** test-engineer
**Base commit:** d32f2517

## TE-1: No unit tests for `formatDetailsJson` in `participant-anti-cheat-timeline.tsx` [LOW/MEDIUM]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:45-63`
**Confidence:** HIGH

The `formatDetailsJson` helper function has no test coverage. It handles JSON parsing, target field mapping, and fallback behavior. Edge cases (malformed JSON, empty objects, non-target fields) should be tested.

**Fix:** Add unit tests for `formatDetailsJson` covering: valid JSON with target field, valid JSON without target field, malformed JSON fallback, empty object.

---

## TE-2: No unit tests for `formatDuration` in `countdown-timer.tsx` and `active-timed-assignment-sidebar-panel.tsx` [LOW/MEDIUM]

**Files:**
- `src/components/exam/countdown-timer.tsx:17-24`
- `src/components/layout/active-timed-assignment-sidebar-panel.tsx:16-23`

**Confidence:** HIGH

The `formatDuration` function handles edge cases (NaN, negative, zero) but has no test coverage. If consolidated into `formatting.ts` (per ARCH-4), tests should be added at that time.

**Fix:** Add unit tests when consolidating into shared utility.

---

## TE-3: No component tests for `quick-create-contest-form.tsx` [LOW/MEDIUM]

**File:** `src/components/contest/quick-create-contest-form.tsx`
**Confidence:** MEDIUM

The quick-create contest form has no component tests. It handles form state, problem selection, and API submission. The form validation (empty title, no problems) should be tested.

---

## TE-4: No component tests for `api-keys-client.tsx` [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx`
**Confidence:** MEDIUM

The API keys admin component has no component tests. Key interactions to test: key creation, key toggling, key deletion, clipboard copy of masked key preview.

---

## Carried Forward Test Gaps

- TE-5: `apiFetchJson` helper untested — carried from DEFER-56
- TE-6: Encryption module untested — carried from DEFER-50
- TE-7: `compiler-client.tsx` untested — carried from cycle 16
- TE-8: `invite-participants.tsx` untested — carried from cycle 16
- TE-9: `recruiter-candidates-panel.tsx` untested — carried from cycle 16
- TE-10: `access-code-manager.tsx` untested — carried from cycle 16

## Verified Safe

- Unit test suite passes all tests
- Component tests for `contest-quick-stats`, `contest-clarifications`, `contest-announcements` exist and pass
- `discussion-vote-buttons` component test exists and passes
- `formatting.test.ts` covers `formatNumber`, `formatBytes`, `formatScore`
- `apiFetch` unit tests exist and pass

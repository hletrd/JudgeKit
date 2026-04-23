# Document Specialist Review — RPF Cycle 22

**Date:** 2026-04-22
**Reviewer:** document-specialist
**Base commit:** 88abca22

## DOC-1: `create-problem-form.tsx` sequence number and difficulty fields lack JSDoc on state management [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:92,108`
**Confidence:** LOW

The `sequenceNumber` and `difficulty` state variables are stored as strings, which is intentional for partially-typed controlled inputs. However, there is no comment explaining why string state is used instead of numeric state (which is the established pattern in other form inputs). This could lead future developers to "fix" the inconsistency by converting to numeric state without understanding the partial-input use case.

**Fix:** Add a brief comment explaining the design choice: "Stored as string to handle partial input during typing; converted to number at submit time."

---

## DOC-2: `anti-cheat-dashboard.tsx` `formatDetailsJson` now documented via i18n keys — adequate [NO ISSUE]

**File:** `src/components/contest/anti-cheat-dashboard.tsx`

The cycle 21 AGG-1 fix migrated `formatDetailsJson` to use i18n keys. The function signature now accepts `t` and the i18n key pattern (`detailTargets.*`) is consistent with the timeline version. Documentation is adequate via the i18n key structure.

---

## DOC-3: `apiFetchJson` JSDoc is comprehensive and accurate [NO ISSUE]

**File:** `src/lib/api/client.ts:87-123`

Carried from cycle 21 (DOC-2). The JSDoc for `apiFetchJson` was updated in cycle 20 to explicitly mention both-path `.catch()` protection. The documentation is thorough and up-to-date.

---

## Verified Safe

- `apiFetch` JSDoc is accurate and up-to-date
- `copyToClipboard` utility has proper JSDoc
- Error handling convention table in `client.ts` is accurate
- `useVisibilityPolling` JSDoc accurately describes its behavior
- `formatting.ts` functions have proper JSDoc

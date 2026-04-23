# Document Specialist Review — RPF Cycle 30

**Date:** 2026-04-23
**Reviewer:** document-specialist
**Base commit:** 31afd19b

## Previously Fixed Items (Verified)

- useVisibilityPolling doc comment: Updated (commit 60f24288). Now correctly states "Uses recursive `setTimeout` instead of `setInterval`"
- Clarification i18n: Fixed (commit 7e0b3bb8)
- Provider error sanitization: Fixed (commit 93beb49d)

## DOC-1: `countdown-timer.tsx` comment says "browser throttling of setInterval" but does not note the architectural inconsistency [LOW/LOW]

**File:** `src/components/exam/countdown-timer.tsx:119-121`

The comments on lines 119-121 say:
```
// timer drift caused by browser throttling of setInterval in
// background tabs. Students rely on accurate countdown during exams.
```

This acknowledges the `setInterval` issue but does not note that the rest of the codebase has migrated to recursive `setTimeout`. A future developer reading this code might not realize the timer is the last holdout.

**Fix:** Minor doc improvement — note that this timer should be migrated to `setTimeout` for consistency.

---

## DOC-2: `apiFetchJson` JSDoc is excellent — no changes needed [NO ISSUE]

**File:** `src/lib/api/client.ts:88-101`

The JSDoc for `apiFetchJson` thoroughly documents the `.json()` safety pattern, including:
- Always check `response.ok` before calling `.json()`
- Use `.catch()` on `.json()` calls
- Never call `.json()` twice on the same response

This is well-documented and no changes are needed.

---

## Document Specialist Findings (carried/deferred)

### DOC-CARRIED-1: SubmissionStatus type split — carried from DEFER-32
### DOC-CARRIED-2: CSRF documentation mismatch — carried from DEFER-35

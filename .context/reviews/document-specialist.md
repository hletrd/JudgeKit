# Document Specialist Review — RPF Cycle 44

**Date:** 2026-04-23
**Reviewer:** document-specialist
**Base commit:** e2043115

## Inventory of Documentation Reviewed

- `CLAUDE.md` — Project rules
- `src/lib/assignments/submissions.ts` — Missing comment about Date.now clock-skew risk
- `src/lib/assignments/active-timed-assignments.ts` — Good example of clock-skew documentation
- `src/lib/datetime.ts` — Date formatting utilities
- `src/lib/assignments/participant-status.ts` — Injectable `now` parameter documented

## Previously Fixed Items (Verified)

- Import TABLE_MAP drift warning comment: Fixed
- Recruiting-constants JSDoc: Present
- Submission route rate-limit comment: Present (added in cycle 43)

## New Findings

### DOC-1: `validateAssignmentSubmission` uses `Date.now()` without comment about clock-skew risk [LOW/LOW]

**File:** `src/lib/assignments/submissions.ts:208`

**Description:** The `validateAssignmentSubmission` function uses `Date.now()` at line 208 without any comment explaining the inconsistency with the codebase convention of using `getDbNowUncached()`. The `active-timed-assignments.ts` module has an excellent comment: "IMPORTANT: The `now` parameter should come from `getDbNow()` in server components to avoid clock skew." A similar comment should exist here, or preferably the code should be fixed.

**Fix:** If the clock-skew issue is fixed, add a comment:
```typescript
// Use DB server time for deadline checks to avoid clock skew
// between app and DB servers, consistent with other schedule checks.
const now = (await getDbNowUncached()).getTime();
```

**Confidence:** Low

---

### Carry-Over Items

- **DOC-1 (from prior cycles):** SSE route ADR (LOW/LOW, deferred)
- **DOC-2 (from prior cycles):** Docker client dual-path behavior documentation (LOW/LOW, deferred)

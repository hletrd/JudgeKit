# Document Specialist Review — RPF Cycle 47

**Date:** 2026-04-23
**Reviewer:** document-specialist
**Base commit:** f8ba7334

## Inventory of Documentation Reviewed

- `src/lib/realtime/realtime-coordination.ts` — Clock-skew comment (verified)
- `src/lib/security/api-rate-limit.ts` — Missing clock-skew comment for checkServerActionRateLimit
- `src/lib/assignments/submissions.ts` — Clock-skew comment (verified)

## Previously Fixed Items (Verified)

- `validateAssignmentSubmission` clock-skew comment: Present (added in cycle 45)
- `realtime-coordination.ts` clock-skew comments: Present (added in cycle 46)

## New Findings

### DOC-1: `checkServerActionRateLimit` uses `Date.now()` without comment about clock-skew risk [LOW/LOW]

**File:** `src/lib/security/api-rate-limit.ts:215`

**Description:** The function uses `Date.now()` at line 215 to compare against DB-stored timestamps without any comment explaining the inconsistency with the codebase convention of using `getDbNowUncached()`. If the clock-skew issue is fixed, a comment similar to those in `realtime-coordination.ts` should be added.

**Fix:** If fixed, add a comment. If deferred, add a `// TODO(clock-skew)` comment for visibility.

**Confidence:** Low

---

### Carry-Over Items

- **DOC-1 (from prior cycles):** SSE route ADR (LOW/LOW, deferred)
- **DOC-2 (from prior cycles):** Docker client dual-path behavior documentation (LOW/LOW, deferred)

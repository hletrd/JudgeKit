# Cycle 28 Critic Review

**Date:** 2026-04-20
**Reviewer:** critic
**Base commit:** d4489054

## Summary

The codebase is in good shape after 27 prior review cycles. The workspace-to-public migration is complete across all 5 phases. The remaining findings are low-severity, mostly around missing try/catch on two localStorage calls and a duplicated polling pattern.

## Findings

### CRIT-1: localStorage crash in two components — real user-facing bug [MEDIUM/MEDIUM]

**Files:**
- `src/components/code/compiler-client.tsx:183`
- `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:94`

**Assessment:** This is the most impactful finding this cycle. Safari private browsing users will experience crashes on the playground and broken resubmit functionality. The fix is trivial (wrap in try/catch) and consistent with the codebase convention. This should be addressed this cycle.

### CRIT-2: Clarifications show raw userId instead of username [LOW/MEDIUM]

**File:** `src/components/contest/contest-clarifications.tsx:257`
**Assessment:** Displaying a UUID to users is a UX bug. However, fixing it requires a backend API change (including `userName` in the clarifications response), which makes it a larger scope than a simple try/catch fix. Should be tracked but may need to be deferred.

### CRIT-3: compiler-client defaultValue pattern suggests incomplete i18n [LOW/LOW]

**File:** `src/components/code/compiler-client.tsx` (multiple)
**Assessment:** The `defaultValue` pattern is unusual for this codebase. It may indicate missing translation keys. Low priority but worth verifying.

## Positive Observations

- The workspace-to-public migration was executed methodically across 5 phases with clear tracking.
- Error boundary console gating (cycle 27) is properly implemented.
- Korean letter-spacing compliance is comprehensive.
- CSP, HSTS, and CSRF protections are robust.
- The `sign-out.ts` storage cleanup is well-designed (prefix-based instead of destructive `clear()`).

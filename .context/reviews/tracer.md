# Tracer Review — RPF Cycle 47

**Date:** 2026-04-23
**Reviewer:** tracer
**Base commit:** f8ba7334

## Causal Tracing of Suspicious Flows

### TR-1: `checkServerActionRateLimit` uses `Date.now()` for DB-timestamp comparisons — clock-skew in server action rate limiting [MEDIUM/MEDIUM]

**File:** `src/lib/security/api-rate-limit.ts:215-234`

**Causal trace:**
1. User invokes a server action (e.g., role edit)
2. `checkServerActionRateLimit` is called
3. Line 215: `const now = Date.now();` — app-server wall clock
4. Line 234: `existing.windowStartedAt + windowMs <= now` — DB-stored `windowStartedAt` compared against app-server time
5. Line 252: `windowStartedAt: now` — app-server time written to DB

Steps 4-5 cross a trust boundary: app-server time is compared against and then written to DB-stored timestamps, mixing clock sources within a transaction.

**Competing hypotheses:**
- H1: Clock skew is negligible in production. **Rejected:** The codebase has fixed clock-skew bugs in at least 7 previous cycles.
- H2: Server actions are low-frequency, so the impact is minimal. **Partially accepted:** Server actions are called less frequently than API endpoints, but role/group management actions are security-sensitive — an extra allowance could permit unauthorized privilege escalation within the window.

**Fix:** Use `getDbNowUncached()` for `now` inside the transaction, consistent with the pattern in `realtime-coordination.ts` and `validateAssignmentSubmission`.

**Confidence:** Medium

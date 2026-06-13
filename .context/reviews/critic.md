# Critic — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72.

## Theme: cycle-7 finished two of three token-lifecycle mutation points; the
THIRD creation point was never enumerated.
Cycle-6 fixed the validity rule and roster-removal revoke. Cycle-7 fixed the
schedule-edit sync and the invite re-issue refresh. Both cycles framed the work
as "propagate the canonical rule to every sibling." Yet the access-code
**redemption** insert — arguably the single most common way a participant
acquires a contest token — was never in the enumerated set. The cycle-7 aggregate
lists "invite re-issue" and "schedule edit" as the two unmaintained points; it
silently omitted "redeem." That omission is the cycle-8 finding (CR8-1/SEC8-1).

This is a recurring failure mode of incremental hardening: each cycle fixes the
sites it happened to grep for, and the grep that would have caught all three
(`insert(contestAccessTokens)`) was never run until now. The structural
remedy (A8-1: a single values-constructor) is what actually closes the class.

## Severity honesty
CR8-1 is MEDIUM not HIGH because the auto-enrollment row incidentally rescues
*submission* access; only the token-keyed *catalog/platform-mode visibility*
breaks. I am explicitly NOT downgrading it to LOW: it is an access-control
predicate inconsistency on the recruiting/exam surface the owner cares about
(candidates seeing the wrong availability), and it is trivially fixable. Not
deferrable.

## Credit where due
The cycle-7 fixes are genuinely correct and well-tested (3 component tests for
the dashboard, red-first sync/refresh tests, listing-order arity pins). No
cosmetic churn, no over-engineering. The codebase is mature; cycle-8 finds one
real thing, which is the expected yield at this stage.

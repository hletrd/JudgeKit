# Perspective: Job Applicant (recruiting coding test) — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72. Seat: a candidate in a timed recruiting test, joining by code.

## JA8-1 — A late/grace window may not apply to me if I joined by code (MEDIUM via CR8-1)
**File:** `access-codes.ts:191`. If a recruiter gives a grace/late window and I
entered via an access code, my token expires at the hard deadline, so the test
could drop out of my view during the grace period I was told I had. For a
candidate, "the assessment disappeared while the clock said I still had time" is
a maximally trust-destroying, potentially disqualifying experience — and it would
hit only the code-join cohort, which is unfair and invisible to the recruiter.
The fix makes the access lifetime identical to invited candidates.

## First-run / fairness experience (otherwise solid)
- The access-code gate gives clear errors (invalid / closed / not-a-contest)
  instead of silent failures (access-codes.ts:126-138). ✅
- Concurrent/double redemption is handled gracefully (already-enrolled path), so
  a nervous double-click won't error me out. ✅
- Anti-cheat is opt-in per assignment and its evidence view is now stable.

## Carried (owner-gated): JA-clarity (no pre-test language-availability preview).
Carried — no candidate test-info page added this cycle.

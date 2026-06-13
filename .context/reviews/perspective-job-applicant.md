# Perspective — Job Applicant (recruiting coding test) — RPF Cycle 9 (2026-06-13)

**HEAD:** da6179f3. Seat: candidate in a recruiting coding test.

## JA9-1 — accidental-disqualification risk from incomplete snapshot evidence (MEDIUM, via CR9-1)
If a recruiter reviews my code-snapshot timeline to judge whether I cheated, the
listing dropping or duplicating a snapshot at a page seam
(`code-snapshots/[userId]/route.ts:54`) could make my organic problem-solving look
like a paste-in (a missing intermediate snapshot) — an accidental-disqualification
risk that lands on ME. Deterministic, complete evidence (the `id`-tiebreak fix)
protects candidates from being misjudged on a rendering artifact. This is the
candidate-trust reason the fix matters.

## First-run / environment / time-pressure
- Token expiry now spans the configured late window (cycle-8), so I don't lose
  access mid-test on a contest with a grace period — good.
- JA-clarity (no pre-test language-availability preview) remains a carried
  product item; exit criterion (owner decision on a candidate test-info page) not
  fired. No new first-run defect surfaced.

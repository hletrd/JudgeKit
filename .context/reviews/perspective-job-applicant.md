# perspective-job-applicant — RPF Cycle 10 (2026-06-13)

Seat: a candidate in a recruiting coding test — first-run experience, environment clarity, time-pressure UX, fairness perception, accidental-disqualification risk.

## Assessment
**No new actionable findings.**
- Invitation redemption: `redeemRecruitingToken` returns truthful, distinct errors (`tokenExpired`, `alreadyRedeemed`) so a candidate sees a clear reason, not a generic failure.
- Time-pressure fairness: windowed-exam personal deadline is computed once and survives reconnect (idempotent session); staff extensions compose correctly — a candidate is not penalized by a transient disconnect.
- Trust/fairness: the candidate's submission evidence (code snapshots) is recorded and paged deterministically; the recruiter cannot accidentally see a corrupted (dropped/duped) timeline that misrepresents the candidate (cycle-9 AGG9-1).
- Accidental disqualification: anti-cheat events are recorded, but the integrity-evidence surfaces are now consistent, reducing the risk of a false misconduct read from shuffled evidence.

## Carried
JA-clarity: no pre-test language-availability preview page — a candidate cannot confirm their language is supported before starting. LOW/Medium, owner decision on a candidate test-info page. Carry.

# Perspective: Job Applicant (recruiting coding test) — RPF Cycle 7 (2026-06-13)

Seat: a candidate invited to a recruiting coding test via a token link.
Reviewed first-run experience, environment clarity, time-pressure UX, and
accidental-disqualification risk. **HEAD 0472b007.**

## JA7-1 — Token-only candidate can be locked out if the recruiter extends the window (LOW-MEDIUM, Medium, CONFIRMED — candidate face of SEC7-1)
A recruiting candidate's access is the `contest_access_token` minted at
redemption (`recruiting-invitations.ts:682-692`). If the recruiter extends the
deadline (a kindness — "take another 30 minutes"), my token still expires at
the old close and every token gate denies me during the bonus window. Today a
parallel enrollment row rescues me, but that is incidental. From the
candidate seat, being told "you have extra time" and then hitting a
forbidden/contest-ended error is exactly the kind of accidental
disqualification that destroys trust in the employer's process. Fix: sync
token expiry on schedule edit (SEC7-1). This is the highest-trust item from my
seat.

## JA7-2 — My submission history can look duplicated/missing near the deadline (LOW, High, CONFIRMED — candidate face of CR7-1)
Same defect class as the student seat: same-second submissions can shuffle
across pages on timestamp-only ordering. Near a hard recruiting deadline this
reads as "did it submit?" and pushes me to re-submit under pressure. Fix:
id tiebreak (CR7-1).

## Works well from the candidate seat (verified)
- **Brute-force fairness:** password FORMAT errors during account setup do NOT
  increment the failed-redeem counter (recruiting-invitations.ts:652-661) — I
  can't lock my own token by mistyping a too-short password; only real wrong-
  password attempts count.
- **Concurrent-claim race:** an "alreadyRedeemed" race does NOT count against
  my brute-force budget (recruiting-invitations.ts:741-748) — fair.
- **Resilience:** the anti-cheat monitor queues events locally first, so a
  flaky home connection during the test doesn't silently flag me or lose my
  activity (queue-first, cycle-6).
- **Late window preserved:** token expiry is set to the EFFECTIVE close
  (`lateDeadline ?? deadline`) at redemption, so a configured late window
  doesn't cut me off — the only gap is the post-edit case (JA7-1).

## Carried (product)
- JA-clarity: no pre-test language-availability preview — I can't see which
  languages are offered before starting. Owner decision on a candidate
  test-info page. Carry.

## Net
The dominant candidate concern is JA7-1 (extend-window token lockout — a trust
and accidental-DQ risk), with JA7-2 (deadline paging anxiety) secondary; both
map to scheduled fixes. The recruiting brute-force/race fairness is genuinely
well handled.

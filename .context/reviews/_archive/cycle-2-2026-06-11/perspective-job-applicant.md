# Persona: Job Applicant (recruiting coding test) — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035. Seat: external candidate with an emailed
invitation, first contact with the platform, timed assessment.

## First-run experience (re-walked at HEAD)
- Invitation → validate → scoped problem access works; my catalog and tag
  list are invitation-scoped (`recruitingAccess.problemIds` paths in
  /problems) so I can't wander into the company's other content, and they
  can't see me wandering.
- Language support is honest: the language picker only offers what the
  judge actually runs (registry-driven), so no "submitted in X, judged
  never" trap.
- The recovered-draft toast (cycle-1 F9) matters MOST in this seat: code
  appearing in my editor on a fresh login at a recruiting test would read as
  a planted-code integrity trap; the timestamped "your own saved work" note
  defuses it.

## Trust/fairness findings

### JA2-1 — Mid-test extension invisibility hits candidates hardest (LOW-MEDIUM, shared V2-1)
If my recruiter extends my window after a platform hiccup, my countdown
still dies at the old time. A student can ask the instructor in the room; I
am remote with no back-channel and will assume I am done. The live
deadline-refetch fix is a fairness fix in this seat, not a convenience.

### JA2-2 (carried — IN3/JA2) — Judging-delay blindness
If the worker fleet stalls during my one-shot assessment, "Queued" with no
ETA reads as "my submission is being judged against me". Carried banner
work; from this seat a simple "judging is slower than usual, your timer is
unaffected / will be compensated" note is the minimum viable trust repair —
note that today the timer is NOT automatically compensated (extension is a
manual staff action).

### JA2-3 — Accidental-disqualification audit: acceptable at HEAD
Probed disqualification vectors: tab-switch logging (signals only, no
auto-action), copy/paste (logged, not blocked), disconnect (windowed session
survives), double-submit (rate-limited, not penalized), wrong language
(blocked at submit with a clear 400, no attempt consumed). No path found
where an innocent mistake silently zeroes a candidate. The anti-cheat model
is signals-for-humans, which is the right posture for recruiting.

## Re-checked, fine
- Invitation expiry windows enforced (`expires_at` checks in validate +
  redeem paths); failed-redeem counters rate-limit brute force.
- Candidate sees per-test results with failed-case index — feedback quality
  comparable to the student seat.

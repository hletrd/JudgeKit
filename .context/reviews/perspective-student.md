# Perspective — Student (assignments/exams) — RPF Cycle 9 (2026-06-13)

**HEAD:** da6179f3. Seat: a student taking a timed assignment/exam.

## ST9-1 — fairness of misconduct review depends on complete snapshot evidence (MEDIUM, via CR9-1)
If I'm ever flagged for misconduct, the instructor reviews my code-snapshot
timeline. Because that listing can drop or duplicate a snapshot at a page seam
(`code-snapshots/[userId]/route.ts:54`, no `id` tiebreak), the evidence shown
about MY work could be incomplete or misordered — a fairness risk that cuts
against the student. I want the evidence trail to be deterministic and complete.
The `id`-tiebreak fix addresses this. This is the student-facing reason CR9-1 is
not a cosmetic nicety.

## Otherwise no NEW student-facing defect
- Submission flow, deadline/late-window handling, exam disconnect/timeout: the
  token-expiry fix (cycle-8) means an access-code joiner no longer loses contest
  visibility during a configured late window — a real student-facing improvement
  already shipped. No regression.
- Countdown-timer client-clock trust (ST5-5) remains carried (needs a server-time
  sync indicator; exit criterion not fired this cycle).

No new anxiety-inducing failure mode surfaced.

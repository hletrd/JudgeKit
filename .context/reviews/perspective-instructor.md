# Perspective: Instructor (authoring / grading / proctoring) — RPF Cycle 7 (2026-06-13)

Seat: an instructor authoring problems/exams, managing rosters, proctoring
live exams, reviewing similarity/anti-cheat evidence, and exporting results.
**HEAD 0472b007.**

## IN7-1 — The live anti-cheat dashboard drops and duplicates evidence rows (MEDIUM, High, CONFIRMED — instructor face of CR7-2)
This is my primary proctoring surface during a live exam. After I click "Load
more," the 30 s auto-refresh can make already-loaded evidence rows VANISH
(seam loss) and can DUPLICATE rows (no id-dedupe). If I'm deciding whether to
intervene on a suspected cheater, an evidence list I can't trust is worse than
no list — I might miss a paste event that scrolled out, or over-count a
duplicated tab-switch. The participant timeline was hardened in cycle-6; the
dashboard must match. Fix: AGG7-1.

## IN7-2 — Editing a contest's deadline silently leaves access tokens stale (LOW-MEDIUM, High, CONFIRMED — instructor face of SEC7-1)
When I extend an exam (a routine accommodation), I expect everyone who had
access to keep it through the new deadline. The schedule edit doesn't
re-derive `contest_access_tokens.expiresAt`, so token-based participants rely
on a parallel enrollment row to not be locked out — fragile and invisible to
me. I want "extend deadline" to Just Work for all participants. Fix: sync
token expiry inside the schedule-edit transaction.

## IN7-3 — Exported audit/result CSVs are nondeterministic at the row cap (LOW, High, CONFIRMED — instructor face of CR7-1)
When I export audit logs or login logs near the cap, the truncation boundary
shuffles for same-timestamp rows, so two exports of the same window can
differ. For anything I might hand to an academic-integrity committee, the
export must be reproducible. Fix: id tiebreak on the export queries (CR7-1).

## Works well (verified from the instructor seat)
- Roster removal now actually revokes contest access tokens (cycle-6) with an
  audit count — removing a student mid-course no longer leaves a backdoor.
- Similarity evidence carries the language bucket (cycle-6 G5) — I can tell
  which language a flagged pair was in.
- IP-overlap report (shared-IP / multi-IP) gives me a collusion-hunting view
  over data I already collect — no eyeballing hundreds of rows.
- Leaderboard freeze auto-unfreezes after the contest closes — students aren't
  stuck on a frozen board forever.
- Filter chips on both proctoring views are keyboard-accessible (cycle-6).

## Net
Two real proctoring/grading-integrity items (IN7-1 dashboard evidence
fidelity, IN7-2 extend-deadline token sync) plus the export determinism
(IN7-3). All map to scheduled fixes; authoring and roster management are
solid.

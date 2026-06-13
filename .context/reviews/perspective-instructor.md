# Perspective — Instructor (authoring/grading/integrity) — RPF Cycle 9 (2026-06-13)

**HEAD:** da6179f3. Seat: instructor authoring + grading + reviewing integrity.

## IN9-1 — code-snapshot evidence table can mislead at page boundaries (MEDIUM, via CR9-1)
When I review a student's code-snapshot timeline to judge whether code was pasted
in or developed organically, I page through the snapshots. Today that listing
(`code-snapshots/[userId]/route.ts:54`) orders by timestamp only, so on a busy
session two snapshots sharing a millisecond can swap, duplicate, or drop across
pages — I might miss the very snapshot that shows a sudden full-solution paste, or
see a duplicate and miscount. For a defensible academic-integrity decision I need
the timeline to be deterministic and complete. The `id`-tiebreak fix gives me
that. Highest-priority of the three for my workflow.

## IN9-2 — recruiting/candidate-roster paging (MEDIUM, via CR9-2)
When I page the recruiting-invitation list (`recruiting-invitations.ts:272`),
bulk-imported candidates created in the same instant can shuffle across pages —
I could overlook a candidate or double-count. Same tiebreak fix.

## Otherwise
Grouping/roster, grading, similarity reports, exporting results: no NEW defect.
The schedule-edit token-expiry sync (cycle-7) + access-code expiry (cycle-8) mean
extending/shortening a deadline now keeps every joiner's access consistent — a
real authoring-side improvement. Extension-event timeline enrichment
(TA3-1-followup) remains a carried product item awaiting your scheduling.

# perspective-instructor — RPF Cycle 10 (2026-06-13)

Seat: an instructor authoring problems/assignments/exams, grading, managing rosters, reviewing similarity, exporting results.

## Assessment
**No new actionable findings.** The instructor-facing integrity surfaces are sound:
- Reviewing a candidate's code-snapshot evidence timeline: now paginates deterministically (cycle-9 AGG9-1) — no dropped/duplicated snapshot at a page seam, so a misconduct finding is defensible.
- Recruiting-invitation roster (bulk CSV import): list now paginates deterministically (cycle-9 AGG9-2) — no invitation dropped/duped across pages.
- Similarity report: capped at 500 submissions with a truthful skip reason and language-carrying evidence; the comparison phase is abort-able.
- Exporting results: the export engine is snapshot-isolated and id-ordered, redaction maps apply correctly — a consistent, complete export.
- Grading/overrides: IOI score overrides overlay both the full board and the live rank consistently (presence test, override of 0 zeroes the problem).

## Carried
IN2-2 (pre-start accommodations / per-student duration overrides) — owner decision, carry. Extension audit events in the participant timeline (TA3-1-followup/DES4-4) — owner schedules timeline enrichment, carry.

# Persona review — Instructor (RPF cycle 4, 2026-06-11)

**HEAD reviewed:** 7c0a4bd4. Seat: authoring problems/assignments/exams,
grading, rosters, similarity reports, exports. Static walkthrough.

## IN4-1 — My escalate tier is polluted; I will either over-accuse or tune it out (MEDIUM-HIGH, High; AGG4-1/AGG4-2)
The integrity doc tells me to review `submission_stale_heartbeat` before
trusting results. Today that list contains one guaranteed false entry per
student (first problem open) plus entries from editor autosaves — and,
inversely, a student actually submitting from outside the browser is flagged
at most once per 90 s because flags refresh their own freshness. I cannot
currently distinguish any of these cases from the dashboard (no source marker
in `details`). Both fixes are scheduled this cycle; after they land, an
escalate entry will once again mean "a submission with no live monitor".

## IN4-2 — Extension workflow is now coherent end-to-end (positive)
Granting a mid-exam extension: composes correctly under concurrent staff
clicks (SQL interval add), reaches the student within 60 s with toast +
status note, keeps their telemetry and submissions accepted past the close,
and applies late-penalty scoring against the personal deadline. Audit event
`exam_session.extend` recorded. Remaining gap is the carried TA3-1-followup:
the participant timeline doesn't yet render extension grants, so
heartbeat-gap review still needs cross-referencing the audit log by hand.

## IN4-3 — Authoring guardrails verified (positive)
Cross-field rules can't be bypassed via partial edits: PATCH re-validates the
merged document (`[assignmentId]/route.ts:129`), so exam modes always clear
late windows, windowed mode demands duration + window, and the leaderboard
freeze must sit inside the contest. Anti-cheat defaults ON for new exams in
the general form (48856f17, verified still in place).

## IN4-4 — Smaller seat-specific notes
- Similarity check: 30 s abort guard, manage-gated, timeout surfaces as
  `timed_out` rather than a 500 — usable mid-contest. Flagged pairs land as
  escalate events for BOTH students; note they also (today) refresh those
  students' heartbeat freshness — AGG4-2 covers this.
- IP-overlap report (shared-IP / multi-IP) remains the right first tool for
  duplicate-account hunting; read-only and capped (LIMIT 100).
- Exports/CSV: `escapeCsvField` in use (cycle-1 hardening) — unchanged, no
  regression found.
- Pre-start accommodations (per-student duration overrides before the exam
  begins) remain an owner product decision — IN2-2 carry unchanged;
  workaround (extend after start) documented.

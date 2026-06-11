# Persona review — Teaching assistant (RPF cycle 4, 2026-06-11)

**HEAD reviewed:** 7c0a4bd4. Seat: TA with partial permissions — roster
visibility, exam supervision, grading support. Static walkthrough of the
capability boundaries.

## TA4-1 — Supervision surfaces I can use (verified)
- Anti-cheat GET is monitor-gated via `canMonitorContest` (route.ts:199),
  which by design extends to group TAs WITHOUT write power — I can watch a
  live exam, view heartbeat gaps, and pull the IP-overlap report, but cannot
  extend sessions or change scores.
- Exam-session cross-reads: I can read a participant's timing only with
  `canViewAssignmentSubmissions` standing (group instructor role) — the
  cycle-3 lazy resolution preserved the boundary (no bare analytics-capability
  cross-read; pinned by tests).

## TA4-2 — The noise problem hits me hardest (MEDIUM-HIGH as workflow impact; AGG4-1)
Live supervision means watching the escalate feed. With every participant
generating a false `submission_stale_heartbeat` at first problem open, the
feed I'm told to act on starts 100% noise at exam start — exactly when I
should be confirming everyone's monitor came up. After this cycle's fix the
feed will only fire on actual unmonitored submissions.

## TA4-3 — "Was this gap a granted extension?" still needs the audit log (carry)
TA3-1-followup unchanged: heartbeat-gap rows don't annotate staff-granted
extensions, so I either ask the instructor or cross-reference
`exam_session.extend` audit events myself. Exit criterion (timeline
enrichment bundled with TA2) stands; severity LOW(product)/High preserved.

## TA4-4 — Permission-boundary sweep (no new gaps found)
Spot-checked the TA-relevant routes this cycle: anti-cheat GET (monitor),
exam-sessions list (manage-gated — I cannot list everyone's sessions without
instructor standing), overrides (manage-gated), participant timeline
(analytics + group-scoped). Consistent with the cycle-2 manager-gated roster
test updates (3dfc2c75). No route was found this cycle where a TA's
capability set leaks write access.

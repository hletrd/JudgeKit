# Persona: TA / Assistant (partial permissions) — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035. Seat: teaching assistant on a group (monitor
capability, no org-wide admin), proctoring a live exam and grading after.

## Boundary check on the NEW surfaces (this cycle's focus)
- **Exam extension (PATCH exam-sessions/[userId])**: gated by
  `canManageGroupResourcesAsync` — the same WRITE-power gate as score
  overrides. As a monitor-only TA I get 403 (pinned by a route test). As a
  manager-TA I can extend, and the durable audit names me. Boundary correct:
  changing time is grading-relevant power and is grouped with it.
- **IP-overlap report (GET ?report=ipOverlap)**: gated by
  `canMonitorContest` — I can SEE duplicate-account signals while
  proctoring without write power. Correct split (read for monitors, write
  for managers).
- **Status board**: the extend icon renders only when `canManageOverrides`;
  monitor-only TAs see the session badges without the control. UI matches
  the API gate — no "button that 403s" frustration.

## Carried gaps (unchanged, register-tracked)
- **TA1**: a TA with `problems.edit` can read exam problem content before
  the exam (capability model documents this; separation-of-duties split
  `problems.edit_exam` remains a product decision).
- **TA2**: no per-assignment grading assignment for multi-TA courses.
- **IN2-2 (new, shared with instructor)**: pre-start accommodations need a
  manager anyway; as a TA I additionally can't pre-grant — same product
  decision bucket as TA2.

## Workflow notes
- Roster: manager-gated roster views (3dfc2c75) mean monitor-TAs see
  participation state without PII-heavy roster export power — good.
- Grading: score-override dialog + audit works for manager-TAs; my override
  reasons are recorded verbatim — appeals-friendly.
- Nothing in this cycle's diff widened TA reach; nothing narrowed legitimate
  monitor workflows.

## Verdict
Permission boundaries at HEAD are coherent: monitor = read-everything-
exam-related, manager = mutate. The two carried items are deliberate model
choices, not leaks.

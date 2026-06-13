# Perspective: Teaching Assistant — RPF Cycle 7 (2026-06-13)

Seat: a TA with PARTIAL permissions — can proctor and view evidence on
assigned groups, but must not have org-wide manage power. Reviewed the
permission boundaries and the proctoring workflows from the TA seat.
**HEAD 0472b007.**

## TA7-1 — Same evidence-fidelity bug affects the TA's proctoring view (MEDIUM, High, CONFIRMED — TA face of CR7-2)
A TA assigned to a group can open the anti-cheat dashboard
(`canMonitorContest` admits group TAs + scoped `anti_cheat.view_events`). So
the dashboard poll-merge seam loss + loadMore duplication (CR7-2) hits TAs
exactly as it hits instructors — and TAs are often the ones doing the live
watching. Fix: AGG7-1.

## Permission boundary — verified CORRECT (no finding, but worth recording)
- `canMonitorContest` (contests.ts:237-251) is a READ-ONLY gate: it admits
  the owning instructor, group TAs (`group_instructors.role='ta'`), and users
  with `anti_cheat.view_events` — but ONLY scoped to the actor's assigned
  groups (`getAssignedTeachingGroupIds(...).includes(groupId)`). It does NOT
  grant write power. The STUDENT-ingest POST in the same file is
  enrollment/token-gated, and the WRITE surfaces (similarity runs, exam-session
  extensions, invites) stay behind `canManageContest`. The cycle-6 comment
  correction (cc15c4d5) made this boundary truthful in-code.
- A `submissions.view_all` capability (cross-group review) does NOT promote a
  TA/instructor into a MANAGE view on another instructor's private contest —
  only `groups.view_all` does (public-contests.ts:211-215). Correct least-
  privilege.

## TA7-2 — Extend-deadline token staleness affects TA-assisted accommodations (LOW, Medium, CONFIRMED — surfaces SEC7-1)
If a TA helps run an accommodation by asking the instructor to extend a
deadline, token-only participants can be denied during the new window
(SEC7-1). From the TA seat this is a "the student says they can't submit and I
can't see why" support burden. Fix folds into SEC7-1.

## Carried (product)
- TA3-1-followup / DES4-4: extension audit events surfaced in the participant
  timeline; contest-list status nuance — new feature surface, owner-scheduled.
  Carry.

## Net
The TA seat reuses the instructor proctoring surface, so the dashboard fidelity
fix (TA7-1) is the main item; the permission boundaries themselves are sound
and were made truthful in cycle-6.

# Persona: Instructor (authoring, grading, groups, exams, exports) — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035. Seat: group instructor running a windowed exam
and weekly assignments; flows: authoring → roster → live monitoring →
extensions → similarity → grading → export.

## What improved since cycle 1 (verified at HEAD)
- **Time extensions exist and are audit-trailed** (F12): timer icon next to
  each in-progress session on the status board (mobile + desktop), 1–600 min,
  composes under concurrent grants, recorded with who/whom/how much. This
  closes the accommodation gap that previously required DB surgery.
- **IP-overlap report** (F11): shared-IP and many-IP participants surface as
  an advisory panel on the anti-cheat dashboard with benign-explanation
  guidance — the duplicate-account hunt no longer means eyeballing raw rows.
- **Anti-cheat defaults ON for new exams** (48856f17 pre-cycle), and the
  numbering hint on /problems means my class stops citing per-viewer numbers.

## Pain points found this cycle

### IN2-1 — I can extend a student's time, but the student can't see it (LOW-MEDIUM)
The natural workflow — outage, grant +20 min, tell the class "keep working" —
breaks because each student's countdown still shows the old deadline until
they reload (V2-1). During an incident I should not have to broadcast
"everyone refresh your page" as a workaround. Same fix as the student-seat
finding: live deadline refetch.

### IN2-2 — No extension affordance before the student starts (LOW, product note)
The extend control renders only when a session exists (status-board guards on
`examSession`). A documented accommodation (×1.5 time) currently requires
waiting for the student to click Start, then extending. Correct workaround
exists, but a pre-grant (per-student duration override at roster level) would
match how accommodations are actually issued. Defer as product decision —
note it next to TA2 in the register.

### IN2-3 (carried) — Judging-delay visibility (IN3/JA2)
Unchanged: when the worker fleet stalls, instructors have no banner; students
ask "is it just me?". Carried with original exit criterion (ops-surface
feature cycle).

## Re-checked, fine
- Roster management (members/bulk, instructors routes) gated by
  `canManageGroupResourcesAsync`; monitor-only staff cannot mutate.
- Similarity reports: staff-gated, assignment-scoped, with pair views;
  export route covers submissions + scores; contest export includes
  anti-cheat columns where appropriate.
- Score overrides + extensions both land in the durable audit trail — my
  grading decisions are reconstructable for appeals.
- Exam-mode integrity: the new DB CHECK on `exam_mode` (F6) means a corrupt
  value can no longer make my exam silently behave as a non-exam.

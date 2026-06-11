# Perspective: Teaching Assistant — RPF Cycle 5 (2026-06-11)

**HEAD:** 04b8c1ec. Walked the TA seat: monitoring permissions, roster
visibility, grading support, permission boundaries.

## TA5-1 — As the live-exam supervisor I'm blind to absence (MEDIUM, High, CONFIRMED)
TAs typically ARE the live supervision layer (`canMonitorContest` grants me
the read-only anti-cheat GET — `anti-cheat/route.ts:190-199`). But the view I
get suffers IN5-1/IN5-2 exactly: the escalate flag is an unlabeled raw-key
badge, and absence periods/ongoing gaps are invisible. The supervision duty
delegated to TAs cannot be performed from the TA's screen. G2+G3 fix the TA
seat and the instructor seat together (same components).

## TA5-2 — Permission boundaries: verified holding (provenance)
- Read vs write split is correct and deliberate: anti-cheat GET requires
  only `canMonitorContest` (TA), POST-side staff actions (similarity run —
  `canManageContest`, exam-session extension — group-manager gate) stay
  above me. Probed: similarity-check route rejects TA-level callers (403).
- Roster: group-detail roster is manager-gated (3dfc2c75 lineage) — as a TA
  I see what I supervise, not bulk member PII export paths.
- Code snapshots viewer requires `contests.view_analytics` capability AND
  per-assignment `canViewAssignmentSubmissions` — the double gate held when
  traced (`code-snapshots/[userId]/route.ts:11-17`).
- I cannot grant myself extensions or rerun similarity to wash evidence
  (delete+reinsert is manager-gated; noted in IN5-3/AGG5-10 for managers).

## TA5-3 — Carried TA asks (unchanged)
TA3-1-followup: `exam_session.extend` audit events still do not render in
the participant timeline (I see the longer deadline but not who granted it —
I have to ask the instructor). Owner-scheduled; bundle with DES4-4's status
label nuance. TA1/TA2 origin-register items: preconditions unchanged.

## TA5-4 — Workflow note (not a defect)
When G1 lands, flag rows will carry `submissionId` — that turns the TA
triage loop (flag → find submission → open code timeline) into one click;
worth mentioning in whatever short staff-facing how-to the owner writes
next (no in-repo doc change required this cycle beyond DOC5-1).

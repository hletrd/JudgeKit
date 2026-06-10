# Persona: TA / Assistant (partial permissions) — RPF Cycle 1 (2026-06-11)

**Seat:** a TA added to one group with instructor-role capabilities scoped to
taught groups (problems.edit, submissions view, anti-cheat monitor) but not
groups.view_all / org-admin. **HEAD:** f977ef4c.

## What I can do (verified against the permission code, not the UI)
- View/grade submissions in my taught group (`canViewAssignmentSubmissions`).
- Query another participant's exam session timing in MY group — the new gate
  (e7e905ca) is exactly `canViewAssignmentSubmissions`, so my group-staff
  relationship grants it; my `contests.view_analytics` capability alone no
  longer does. This is the right boundary: as a TA-participant in someone
  ELSE'S contest I can no longer read co-participants' timing.
- Monitor anti-cheat events for my groups only (1d40297a).
- Edit problems linked to my taught group (`canManageProblem` path 3:
  problem_group_access ∩ getAssignedTeachingGroupIds).

## What I cannot do (boundary checks — all verified holding)
- Transfer or steal group ownership (b6e38593: owner-or-admin only).
- Touch problems of groups I don't teach — read (canAccessProblem), pick
  (285f637a), duplicate (82afa260), or write (8b6affdd).
- Read rosters of unmanaged groups (manager-gated roster, 3dfc2cf5 tests).
- Flip platform-wide settings (admin-only; durable-audited).

## Findings from this seat

### TA1 (LOW→policy question, confidence High)
`canManageProblem` treats every member of `getAssignedTeachingGroupIds` —
including TA-grade staff — as a full problem editor for group-linked
problems, INCLUDING replacing hidden test cases on an upcoming exam. Many
institutions want TAs to grade but not author/alter exam content
(separation-of-duties: a TA is often a student in an adjacent course). Today
the only lever is giving the TA a role without `problems.edit`, which also
removes their ability to fix their OWN practice problems. If finer separation
is wanted, it needs a distinct capability (e.g. `problems.edit_exam` vs
`problems.edit`). Recording as a product/policy decision, NOT a bug — the
current behavior matches the documented capability model.

### TA2 (LOW, workflow, confidence Medium)
Grading workflows that TAs typically own (manual-judge problems, comment on
submissions) exist and are capability-gated, but there is no per-assignment
"grading assignment" concept (e.g. TA X grades problems 1–3). All-staff-see-
everything within the group is fine at seminar scale; flagged for large
courses. Feature note only.

## Permission-boundary regression sweep
Re-ran the cross-role probes from the 2026-05-30 assistant review against the
current permission code (permissions.ts, management.ts, submissions.ts):
no boundary that previously denied now allows. The remediation wave only
TIGHTENED TA-adjacent surfaces (analytics-only override removed, roster
manager-gated). No regression.

## Verdict
TA boundaries are in the best state they've been; the one open question (TA1)
is a deliberate policy choice to make, not a leak.

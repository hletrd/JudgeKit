# Perspective — Teaching Assistant (partial permissions) — RPF Cycle 9 (2026-06-13)

**HEAD:** da6179f3. Seat: TA with scoped grading/roster permissions.

## TA9-1 — snapshot evidence completeness within my scope (MEDIUM, via CR9-1)
As a TA reviewing flagged submissions, I rely on the code-snapshot timeline being
complete and stable across pages. The missing `id` tiebreak
(`code-snapshots/[userId]/route.ts:54`) means a snapshot can drop/duplicate at a
page boundary — I could escalate or clear a case on incomplete evidence. The
fix benefits my workflow identically to the instructor's. Access to the route is
correctly gated by `contests.view_analytics` + `canViewAssignmentSubmissions`
(`route.ts:11,14`), so the permission boundary itself is intact — this is a
correctness issue inside an already-authorized view, not an authz gap.

## Permission-boundary pass — no NEW gap
Re-checked the capability gates on the snapshot, recruiting-invitation, and
accepted-solution routes: each enforces the expected capability/role before
returning data. No over-broad TA access introduced this cycle. The group-detail
manager-gated roster (recent commit) keeps TA roster actions correctly scoped.

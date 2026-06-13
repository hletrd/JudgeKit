# Perspective: Teaching Assistant — RPF Cycle 6 (2026-06-12)

**HEAD reviewed:** 22e1510f. Walked the TA seat: assigned-group scoping, proctoring read access, grading-support workflows, permission boundaries (what I can and cannot do).

## Boundary verification (probed in code)
- **Read-only proctoring works as promised:** `canMonitorContest` (`contests.ts:235-249`) admits me via `group_instructors.role='ta'` OR a scoped `anti_cheat.view_events` capability — but ONLY for groups I'm assigned to (`getAssignedTeachingGroupIds` scope check at `:247-248`). I verified the GET surfaces (anti-cheat events, ipOverlap report, heartbeat gaps, participant timeline) all route through it.
- **Write power stays withheld:** similarity POST, score overrides, leaderboard freeze, invite, member-removal all gate on `canManageContest`/`canManageGroupMembersAsync` — a TA in my role cannot trigger or destroy evidence (similarity rerun's delete+reinsert is instructor-only; relevant given AGG5-8's open retention policy).
- **Cross-group probe:** with `anti_cheat.view_events` but no assignment to group G, the capability path returns false (assigned-group scope). No org-wide proctoring leak.

## Pain points / gaps from my seat

### TA6-1 — The authz comment in the code would mis-train me (LOW, High — CR6-5/V6-7)
The anti-cheat route's comment says POST keeps `canManageContest`. As the person most likely to be reading code to learn my own boundaries, a false comment about who can write integrity events is exactly the wrong place for drift.

### TA6-2 — Mouse-only filter chips slow down live review (MEDIUM a11y, High — DES6-1)
Triaging hundreds of events during an exam is keyboard work. The type-filter chips on both proctoring views aren't focusable.

### TA6-3 — Roster ≠ access (MEDIUM, High — SEC6-1, shared)
When an instructor tells me "I removed them, watch that they're gone," the platform doesn't make that true (token re-grants submit). I'm the one staring at the timeline confused about why a removed student still produces submissions.

### TA6-4 — Duplicate timeline rows under live polling (LOW, Medium — D6-2) — evidence views must not visibly duplicate; it undermines my notes' credibility.

## Workflow gaps (carried, owner-scheduled)
- Extension audits don't appear in the participant timeline (TA3-1-followup) — when the instructor extends mid-incident, my timeline shows nothing; I reconstruct from chat. Carried.
- No TA-grade partial permission for score ANNOTATION (comment-only, no override) — would let me pre-grade without write risk. Existing register item (TA2 family) — carried, owner decision.

## Verdict
My permission envelope is correctly drawn and correctly enforced at this HEAD; the work left from my seat is evidence-view trustworthiness (duplicates, keyboard) and making roster removal mean removal.

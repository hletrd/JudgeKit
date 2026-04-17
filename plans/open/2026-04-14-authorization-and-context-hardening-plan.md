# Implementation plan — authorization and trusted-context hardening (2026-04-14)

## Source review lines
Primary sources:
- `.context/reviews/multi-agent-comprehensive-review-2026-04-13-current-head.md`
  - findings 1, 2, 3, 4, 5, 15, 18, 22
- `.context/reviews/comprehensive-code-review-2026-04-13-current-head.md`
  - remaining custom-role/page-flow concerns not already closed
- `.context/reviews/adversarial-security-review-2026-04-12-current-head.md`
  - candidate/privacy boundary concerns that still have repo-local authz surface area
- `.context/reviews/multi-perspective-review-2026-04-12-current-head.md`
  - recruiting isolation and instructor/admin usability criticisms that still map to access-control UX

## Goal
Close the remaining object-level authorization gaps and remove the last places where sensitive behavior depends on caller-supplied context or built-in-role-only assumptions.

## Progress
- 🚧 in progress
- implemented in the current pass:
  - problem-set list/detail/new/API reads now route through a shared visibility helper
  - contest code-snapshot reads now require assignment-level submission visibility
  - recruiting invitation list/detail/stats routes now enforce assignment-scoped contest management and reject path/invitation mismatches
  - platform-mode resolution now derives restricted assignment context from problem/user state when the client omits `assignmentId`
  - assignment submission visibility now honors group-instructor roles instead of only assignment ownership
  - submission detail + lecture mode now use capability-aware privilege checks instead of built-in-role-only allowlists
  - anonymous recruiting validation payloads are reduced to minimal validity metadata
  - dashboard/problem editing affordances now use capabilities instead of built-in admin/instructor role-name checks
  - problem detail contest-start access now honors custom privileged roles via capability checks
  - admin user-management affordances now derive create/edit/delete options from capabilities and manageable role levels instead of built-in admin role-name checks
  - bulk user creation now preserves valid custom requested roles instead of narrowing inserts to built-in student/instructor values
  - admin API-key creation UI now lists manageable custom roles instead of only hard-coded built-in admin/instructor targets
  - capability-cache bootstrap now restores the built-in assistant role even when the roles table is empty or stale
  - problem-set dashboard pages now gate on problem-set capabilities instead of instructor-only role checks, and the edit form degrades to read-only when the actor lacks edit/delete/group-assignment permissions
  - problem-set create/update/group-assignment routes now reject out-of-scope problem/group IDs and reuse a shared object-level management helper instead of built-in instructor ownership checks
  - platform-mode context resolution now records server-derived assignment mismatches, the chat API rejects forged problem/assignment combinations explicitly, and compiler runs derive their effective mode from the server-resolved assignment context instead of trusting the request body
  - assignment submission visibility and generic permission helpers now rely on capabilities instead of built-in admin/instructor role-name checks, while still honoring group-instructor scope for roles that only have `assignments.view_status`
  - server-side user-management actions now require `users.*` capabilities directly and compare actor/target role levels instead of relying on built-in instructor shortcuts

## Workstream A — Problem-set visibility and scope isolation
**Targets**
- `src/app/(dashboard)/dashboard/problem-sets/page.tsx`
- `src/app/(dashboard)/dashboard/problem-sets/[id]/page.tsx`
- `src/app/(dashboard)/dashboard/problem-sets/new/page.tsx`
- `src/app/api/v1/problem-sets/route.ts`
- `src/app/api/v1/problem-sets/[id]/route.ts`
- any shared helper needed under `src/lib/problem-sets/`

**Implementation intent**
- add one capability-aware visibility helper for problem sets;
- scope list/detail/new-form resource selection to owned/authorized problem sets, problems, and groups;
- keep admin/global-capability paths explicit.

**Acceptance criteria**
- instructors cannot browse or enumerate other instructors’ problem sets by default;
- problem/group pickers on create/edit pages only include resources the actor can legitimately attach;
- API and page loaders use the same visibility contract.

**Verification expectations**
- route/page tests for owner vs non-owner instructor visibility;
- regression coverage for admin/global-capability bypasses.

## Workstream B — Contest/recruiting object-level authorization
**Targets**
- `src/app/api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts`
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts`
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts`
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/stats/route.ts`
- any shared contest/recruiting auth helper under `src/lib/assignments/` or `src/lib/auth/`

**Implementation intent**
- enforce assignment-scoped authorization, not just global capability possession;
- validate that `params.assignmentId` matches the invitation’s real assignment;
- use the same scoped authorization helper across analytics/export/code-snapshots/recruiting surfaces.

**Acceptance criteria**
- code snapshots cannot be fetched cross-assignment with only a generic analytics capability;
- recruiting invitation reads/writes/resets/deletes are limited to assignments the actor can actually manage;
- cross-assignment path/invitation mismatches are rejected.

**Verification expectations**
- route tests for owner, allowed reviewer, unrelated privileged user, and cross-assignment mismatch cases.

## Workstream C — Server-derived restricted context for AI/compiler routes
**Targets**
- `src/app/api/v1/plugins/chat-widget/chat/route.ts`
- `src/app/api/v1/compiler/run/route.ts`
- `src/lib/platform-mode-context.ts`
- any helper needed to derive assignment/problem context from server-side state

**Implementation intent**
- stop trusting request-body `assignmentId` as the only indicator of restricted assessment context;
- derive or validate assignment context from the actual problem/submission/assignment relation when the request is problem-scoped or contest-scoped.

**Acceptance criteria**
- omitting `assignmentId` no longer bypasses contest/exam AI restrictions;
- omitting `assignmentId` no longer bypasses standalone-compiler restrictions;
- failures are explicit and auditable rather than silent fallbacks.

**Verification expectations**
- request tests that prove the bypass no longer works with omitted/forged assignment IDs.

## Workstream D — Capability-aware assignment visibility and UI privilege cleanup
**Targets**
- `src/lib/assignments/submissions.ts`
- `src/lib/auth/permissions.ts`
- `src/app/(dashboard)/dashboard/submissions/[id]/page.tsx`
- `src/app/(dashboard)/layout.tsx`
- any remaining page-level built-in-role privilege branches touched by these flows

**Implementation intent**
- honor `group_instructors`/co-instructor access consistently in assignment-submission visibility;
- replace remaining built-in-role privilege decisions with capability-derived flags where the product already supports custom roles.

**Acceptance criteria**
- co-instructors/TAs with intended access can view assignment submissions;
- custom roles do not see artificially redacted submission detail just because their role name is not built-in;
- lecture-mode access and similar UI gating no longer rely on fixed role-name allowlists where capability logic exists.

**Verification expectations**
- targeted permission tests for owner, co-instructor/TA, custom privileged role, and learner paths;
- page-level regression tests for capability-driven rendering.

## Workstream E — Recruiting validation metadata minimization
**Targets**
- `src/app/api/v1/recruiting/validate/route.ts`
- downstream recruiting UI that consumes the validation payload

**Implementation intent**
- reduce the anonymous validation response to the minimum needed to continue the recruiting flow;
- move richer candidate/assignment details behind a later authenticated or redeem-bound step.

**Acceptance criteria**
- leaked tokens no longer reveal unnecessary candidate or assignment metadata via the anonymous validation endpoint;
- recruiting UX still remains workable with the reduced payload.

**Verification expectations**
- route tests for valid/revoked/expired tokens and response-shape minimization.

## Completion bar
This plan is ready to archive only when the above flows share one consistent object-level authorization model and the contest/exam restriction bypasses are demonstrably closed.

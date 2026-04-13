# Implementation plan — `.context/reviews/multi-perspective-review-2026-04-12-current-head.md`

## Source review status
Open plan. No implementation is included here.

## Planning scope
This plan addresses the still-open criticism in:
- `.context/reviews/multi-perspective-review-2026-04-12-current-head.md`

## Review themes to address
1. Recruiting identity is better, but still not high-assurance.
2. Exams/public contests are still blocked by realtime/ops architecture.
3. Anti-cheat remains telemetry, not proctoring.
4. Retention automation is real but may still be a policy mismatch for institutions/employers.
5. Instructor/admin usability is still power-user oriented.

## Workstream A — External-recruiting identity assurance
**Problem**
The invite-link + resume-code model is materially better than before, but it still does not strongly bind the assessment session to a verified real-world candidate identity.

**Representative files / surfaces**
- recruiting invitation/auth/recovery flows
- candidate recovery UX
- recruiter/admin recovery workflows
- recruiting docs/policy text

**Plan**
- design a stronger identity-bound recovery path (for example mailbox-verified reset, recruiter-mediated verified recovery, or a stronger second factor)
- preserve the current claim-only and non-replay guarantees
- keep candidate recovery usable while making secret-sharing less sufficient
- add tests for recovery, reset, and identity edge cases

**Acceptance criteria**
- candidate recovery no longer relies only on shared secrets under candidate/admin control
- recruiting re-entry has a stronger identity assurance story than the current claim-only + standard-login flow

**Progress**
- ✅ first-claim recruiting flows now create a real account password and persist the candidate email for later standard sign-in
- ✅ admins can now reset recruiting account passwords for redeemed candidates through the recruiting invitation workflow

## Workstream B — Exam / contest architecture truth
**Problem**
The product is still honestly not ready for formal exams or serious public contests because the current realtime coordination story is not strong enough.

**Representative files / surfaces**
- realtime coordination helper
- SSE / anti-cheat / contest routes
- deployment docs and high-stakes operations guide

**Plan**
- decide whether to implement real shared coordination or make the unsupported topology rules even stricter
- define what evidence would be required before changing the current NO-GO stance
- add the necessary tests and deployment checks to support that evidence

**Acceptance criteria**
- there is a concrete technical path from current single-instance assumptions to supported high-stakes deployment behavior
- the docs and runtime behavior stay truthful while the work is incomplete

**Progress**
- ✅ a PostgreSQL-backed coordination path now exists for the realtime-sensitive routes most directly called out in the review
- ✅ deployment and worker docs now describe the supported process-local vs shared-coordination modes explicitly
- ✅ a high-stakes validation matrix and runtime-check script now define the remaining performance/load/recovery proof bar more explicitly

## Workstream C — Exam-integrity model beyond telemetry
**Problem**
The product is correct to describe anti-cheat as telemetry, but that also means there is still no exam-grade integrity model.

**Representative files / surfaces**
- anti-cheat monitor and dashboards
- participant/instructor notices
- high-stakes docs and checklists

**Plan**
- decide whether the platform will remain “telemetry + human review” for exams, or whether stronger proctoring-adjacent controls are actually desired
- define the evidence standard for suspicious behavior review
- align all user/operator-facing copy with the chosen integrity model

**Acceptance criteria**
- the exam-integrity story is explicit and consistent across product, docs, and operator expectations
- no one has to guess whether anti-cheat is merely advisory or intended as stronger enforcement

**Progress**
- ✅ published `docs/exam-integrity-model.md` and exposed the evidence model more explicitly in the anti-cheat dashboard
- ✅ anti-cheat events now carry explicit context / signal / escalate review tiers in the dashboard layer

## Workstream D — Retention policy as a product/ops control surface
**Problem**
The system now prunes several data classes, but the current 365-day defaults may not match all schools or employers.

**Representative files / surfaces**
- retention maintenance code
- privacy/retention docs
- any future settings/admin control surfaces
- export/archive workflows

**Plan**
- decide whether retention windows should remain hard-coded or become configurable by deployment
- define whether long-lived archival/export workflows are required before deletion for certain customers
- tighten transcript/evidence access and handling workflows where appropriate

**Acceptance criteria**
- retention behavior is an explicit product-policy choice, not just a code default
- operators have a supported path for longer retention or export-before-delete needs

**Progress**
- ✅ the default retention windows can now be overridden per deployment through explicit environment variables
- ✅ chat-log list and transcript access now create audit events so privileged review is more accountable

## Workstream E — Instructor/admin workflow simplification
**Problem**
The platform is more usable than before, but still feels like a technical power tool.

**Representative files / surfaces**
- instructor dashboard
- key admin/instructor management pages
- readiness/help surfaces

**Plan**
- identify the highest-friction instructor/admin tasks still requiring too much hidden system knowledge
- add guided shortcuts or workflow grouping where it lowers real friction
- keep the UX improvements narrow and role-specific rather than attempting a full redesign

**Acceptance criteria**
- common instructor/admin workflows become more discoverable without needing deep internal knowledge

**Progress**
- ✅ instructor and admin dashboards now surface quick links for common operational tasks

## Suggested execution order
1. Workstream A — external-recruiting identity assurance
2. Workstream B — exam/contest architecture truth
3. Workstream C — exam-integrity model
4. Workstream D — retention policy controls
5. Workstream E — workflow simplification

## Verification targets
- `pnpm -s tsc --noEmit`
- targeted auth/recovery tests for recruiting changes
- targeted realtime/deployment tests for architecture changes
- targeted docs/readiness review for any launch-policy change

## Non-goals
- No implementation in this planning pass
- No attempt to re-open already archived 2026-04-12 remediation work except where the new current-HEAD review explicitly says a higher bar is still missing

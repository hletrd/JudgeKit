# Implementation plan — `.context/reviews/multi-perspective-review-2026-04-12.md`

## Source review status
Open plan. No implementation is included here.

## Planning scope
This plan addresses the still-open criticisms from:
- `.context/reviews/multi-perspective-review-2026-04-12.md`

## Review themes to address
1. Recruiting identity is too weak for serious hiring use.
2. Recruiting privacy/fairness boundaries are not hard enough.
3. Anti-cheat is useful telemetry, not exam-grade integrity.
4. Contest/exam realtime still has a single-app-instance ceiling.
5. Privacy/retention policy is incomplete for chat logs, anti-cheat, submissions, and candidate data.
6. Product modes remain too implicit for a high-stakes multi-use platform.
7. Instructor/admin/candidate UX still feels more like a powerful internal system than a purpose-built assessment product.

## Workstreams by perspective

## Workstream A — Student / learner experience boundaries
**Problem**
Students currently interact with a system that can act like homework platform, contest system, exam platform, and recruiting tool. The boundaries are real in code, but they are not always obvious in UX.

**Representative files**
- `src/lib/platform-mode.ts`
- `src/lib/platform-mode-context.ts`
- student-facing dashboard/problem/contest pages
- release/help docs for platform modes

**Plan**
- surface the effective mode more clearly on student-facing pages
- tighten the UI distinction between homework, contest, and exam states
- remove or demote cross-mode affordances that create confusion during assessments
- add tests that prove the right surfaces appear/disappear per effective mode

**Acceptance criteria**
- a student can tell which assessment context they are in without reading docs
- mode-specific restrictions are visible and tested, not just implicit in route behavior

**Progress**
- ✅ the dashboard header now shows the effective platform mode as a visible badge

## Workstream B — Instructor workflow simplification
**Problem**
The platform is powerful but dense. Too much of the real workflow is hidden behind deep navigation and implicit rules.

**Representative files**
- instructor dashboard and assignment/contest management pages
- admin/instructor settings and labels
- candidate/recruiting invitation panels where instructors operate

**Plan**
- add clearer instructor entry points for the most common actions (assignment/contest setup, recruiting invites, analytics, review)
- surface mode-specific implications directly in instructor workflows
- add guided warnings when an instructor configures a high-stakes scenario with unsupported assumptions
- decide whether some recruiting flows deserve separate instructor UI rather than being nested inside contest management

**Acceptance criteria**
- instructors do not need hidden system knowledge to understand mode-specific behavior
- high-stakes caveats appear inline where configuration happens

**Progress**
- ✅ instructor dashboard now surfaces quick links for groups, contests, submissions, and problem sets so common workflows are one click away

## Workstream C — Admin / operator guardrails
**Problem**
The admin surface is broad and powerful, but the system still expects a technically strong operator. That is acceptable only if the product makes the sharp edges explicit.

**Representative files**
- admin settings / workers / logs / plugin pages
- deployment docs, go/no-go memo, release-readiness docs

**Plan**
- add stronger readiness and deployment guardrails for high-stakes modes
- surface unsupported-topology warnings more prominently in admin/operator docs and UI where feasible
- make the launch/readiness docs reflect the current real confidence level by use case
- add a dedicated operator checklist for recruiting/exam/contest launches

**Acceptance criteria**
- admin/operator docs clearly state what is and is not ready today
- high-stakes launches require explicit operator acknowledgment of current limits

**Progress**
- ✅ published `docs/high-stakes-operations.md` with current launch posture, operator checks, and the single-instance/high-stakes caveats
- ✅ admin system settings now show a mode-specific operational summary block inline

## Workstream D — Assistant governance and data lifecycle
**Problem**
The assistant is useful, but it carries unresolved governance debt: stored chat logs, privileged transcript access, third-party provider exposure, and incomplete retention policy.

**Representative files**
- `src/app/api/v1/plugins/chat-widget/chat/route.ts`
- `src/app/api/v1/admin/chat-logs/route.ts`
- plugin/admin docs and policy docs

**Plan**
- define retention windows for chat logs, anti-cheat events, submissions, candidate data, and audit logs
- implement pruning where sensitive records are stored indefinitely today
- define who can access transcripts and when
- add user-facing notice text where the platform stores or reviews sensitive data
- keep AI disabled by default in exam/contest/recruiting contexts unless policy explicitly changes

**Acceptance criteria**
- retention/access rules are documented and implemented
- stored chat data has a bounded lifecycle
- candidate/student notice text exists where needed

**Progress**
- ✅ published `docs/privacy-retention.md` with current platform retention windows and operator rules
- ✅ automated pruning now covers AI chat logs and anti-cheat events in addition to existing audit-log pruning
- ✅ admin chat-log UI now displays retention and access-boundary guidance inline

## Workstream E — Job applicant / candidate hardening
**Problem**
The candidate flow exists, but it still feels like a contest/classroom system wearing a recruiting skin. Identity and privacy are the weakest points.
**Status (2026-04-12):** ✅ Substantially implemented. Recruiting invite links are claim-only, candidates create/use a resume code for new-session recovery, same-session resume remains intact, and candidate-facing standings/rankings are now blocked.

**Representative files**
- `src/lib/assignments/recruiting-invitations.ts`
- `src/lib/auth/recruiting-token.ts`
- candidate dashboard + recruit entry flow
- contest/leaderboard/ranking routes used by candidates
- recruiting E2E coverage

**Plan**
- replace reusable bearer-token login with claim-once + stronger re-entry
- remove recruiting candidate access to shared standings and per-problem rankings unless deliberately anonymous and justified
- harden candidate-visible routing so privacy is enforced at the route/API level
- continue moving candidate language and navigation away from classroom terminology where it leaks through

**Acceptance criteria**
- a recruiting invite URL is no longer enough to impersonate a candidate indefinitely
- candidates cannot inspect peer standings or per-problem rankings during recruiting flows
- recruiting UX no longer depends on classroom-only assumptions

## Workstream F — Security-researcher / attacker concerns made product-truthful
**Problem**
The review correctly highlights that the remaining weaknesses are concentrated in identity, privacy, fairness, and event integrity.

**Plan**
- fix recruiting identity and privacy first
- keep anti-cheat wording honest: telemetry, not proctoring
- decide whether high-stakes readiness requires real shared coordination before exams/public contests are reconsidered
- explicitly document the current trust boundary around the judge worker and what operators must do about it

**Progress**
- ✅ published `docs/high-stakes-operations.md` with explicit anti-cheat telemetry language and a judge-worker trust-boundary section

## Recommended execution order
1. Workstream E — candidate identity/privacy
2. Workstream D — assistant/data governance
3. Workstream C — admin/operator readiness guardrails
4. Workstream A — student boundary clarity
5. Workstream B — instructor workflow simplification
6. Workstream F — remaining high-stakes trust/ops truth

## Verification targets for future implementation
- `pnpm -s tsc --noEmit`
- targeted Vitest suites for auth, mode-resolution, recruiting access, and chat governance surfaces
- Playwright recruiting flow coverage, including route-level privacy checks
- doc/checklist updates reviewed together with any policy-sensitive code change

## Non-goals
- No code implementation in this planning pass
- No attempt to re-open already archived 2026-04-09 / 2026-04-10 review backlogs unless a future revalidation proves a regression

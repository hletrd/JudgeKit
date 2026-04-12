# Implementation plan — `.context/reviews/adversarial-security-review-2026-04-12.md`

> Archived on 2026-04-12 after the planned remediation slices landed at `HEAD`.


## Source review status
Open plan. No implementation is included here.

## Planning scope
This plan addresses the still-open attack-surface findings from:
- `.context/reviews/adversarial-security-review-2026-04-12.md`

## Findings covered by this plan
### HIGH
1. Recruiting tokens are replayable bearer credentials.
2. Recruiting participants can still learn identities and standings they should not see.

### MEDIUM
3. Exam/contest integrity still depends on a single web app instance.
4. Anti-cheat signals are easy to evade and should not be treated as proctoring.
5. Chat logs are stored and readable by privileged users, but retention/policy is unfinished.
6. Mode resolution is still policy-heavy and easy to misunderstand.
7. The judge worker remains a privileged trust boundary.

## Execution order
1. Recruiting authentication hardening
2. Recruiting candidate-isolation enforcement
3. Sensitive-data minimization and transcript governance
4. High-stakes deployment/integrity hardening
5. Mode/misconfiguration hardening
6. Privileged-worker operational controls

## Phase 0 — Revalidate the cited attack paths against `HEAD`
Before any future code change, re-check these exact surfaces:
- `src/lib/assignments/recruiting-invitations.ts`
- `src/lib/auth/recruiting-token.ts`
- `src/app/(auth)/recruit/[token]/page.tsx`
- `src/app/(auth)/recruit/[token]/recruit-start-form.tsx`
- `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx`
- `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts`
- `src/app/(dashboard)/dashboard/problems/[id]/page.tsx`
- `src/app/(dashboard)/dashboard/problems/[id]/rankings/page.tsx`
- `src/app/api/v1/plugins/chat-widget/chat/route.ts`
- `src/app/api/v1/admin/chat-logs/route.ts`
- realtime/deployment docs and worker/deploy docs

If any of these change before implementation starts, update the plan first.

## Phase 1 — Eliminate replayable recruiting-token login
### Track 1A — Make the invite URL claim-only
**Severity:** HIGH
**Status (2026-04-12):** ✅ Implemented. The invite URL is claim-only, first claim now creates a resume code, and redeemed links require either the existing authenticated session or that resume code instead of raw token replay.

**Files**
- recruiting invitation/token redemption/auth surfaces
- recruiting E2E coverage

**Plan**
- stop treating the invitation token as a reusable login secret
- make first redemption claim the invite and transition to a stronger re-entry mechanism
- ensure replay of the original invite token does not silently recreate access
- preserve auditability: who claimed, when, from what client context

**Acceptance criteria**
- the original recruit URL cannot be used indefinitely as a bearer credential
- candidate re-entry is traceable and stronger than raw URL possession

**Tests**
- first claim succeeds
- replayed token no longer grants direct session access
- legitimate candidate re-entry flow still works
- concurrent redemption/re-entry race tests where applicable

## Phase 2 — Enforce recruiting candidate isolation at route/API level
### Track 2A — Remove recruiting candidate access to shared standings
**Severity:** HIGH

**Files**
- contest page / leaderboard route
- problem page / problem rankings route
- candidate/recruiting UI tests

**Plan**
- remove leaderboard exposure for recruiting candidates unless an intentionally anonymous mode is designed and approved
- block recruiting candidates from the problem rankings route server-side
- ensure UI hiding is backed by route/API enforcement
- verify candidate dashboard and contest pages show only self-scoped progress data

**Acceptance criteria**
- recruiting candidates cannot enumerate peers through leaderboards or rankings
- route-level enforcement blocks direct URL navigation

**Progress**
- ✅ leaderboard API returns 403 for recruiting candidates
- ✅ recruiting candidates no longer see the shared contest leaderboard
- ✅ direct navigation to per-problem rankings redirects recruiting candidates back to the problem page

**Tests**
- Playwright coverage for candidate contest/problem/ranking paths
- API tests for leaderboard/ranking restrictions under recruiting mode

## Phase 3 — Minimize and govern stored sensitive data
### Track 3A — Add retention and pruning for chat / anti-cheat / candidate data
**Severity:** MEDIUM

**Files**
- chat log storage + admin retrieval
- anti-cheat event storage/retrieval
- policy docs/checklists
- any pruning jobs introduced for sensitive data classes

**Plan**
- define and implement retention windows for chat logs, anti-cheat events, submissions, candidate data, and audit logs
- reduce transcript access to the smallest legitimate admin audience
- add explicit handling guidance for privileged users
- add user-facing notices where the platform stores/reviews sensitive records

**Acceptance criteria**
- sensitive data classes have documented retention/access rules
- pruning exists for any currently unbounded high-sensitivity store
- recruiting and exam contexts have explicit privacy language

**Progress**
- ✅ published `docs/privacy-retention.md` with the current retention windows and operator handling rules
- ✅ AI chat logs and anti-cheat events are now pruned automatically in the app runtime
- ✅ admin chat-log surfaces now disclose retention and access expectations inline

**Tests / verification**
- targeted tests for any new pruning helpers/jobs
- route tests for tightened access control if capabilities/filters change
- docs/checklist review alongside code changes

## Phase 4 — High-stakes deployment integrity
### Track 4A — Resolve the single-instance realtime ceiling for serious events
**Severity:** MEDIUM

**Files**
- realtime coordination/runtime guard surfaces
- deployment docs/compose/readiness docs

**Plan**
Choose one explicit path:
1. implement real shared coordination for high-stakes routes, or
2. keep the single-instance model but make high-stakes launch gates even harder and clearer

**Acceptance criteria**
- the platform is explicit about whether exams/public contests are supported
- unsupported deployment topologies cannot be mistaken for supported high-stakes setups

**Progress**
- ✅ published `docs/high-stakes-operations.md` with the current launch truth for recruiting, exams, and serious contests

**Tests / verification**
- runtime guard tests or shared-coordination tests, depending on chosen path
- docs/readiness artifacts updated in lockstep

## Phase 5 — Reduce policy/mode misconfiguration risk
### Track 5A — Make effective mode and restrictions explicit to operators
**Severity:** MEDIUM

**Files**
- platform mode helpers
- admin/instructor settings and dashboards
- docs/checklists

**Plan**
- make effective mode visible where admins/instructors configure or launch assessments
- reduce hidden/implicit mode transitions where feasible
- add tests for recruiting/exam/contest/homework boundary cases

**Acceptance criteria**
- operators can see the active/effective mode and its restrictions without reverse-engineering the code
- high-stakes restrictions are verified by tests

**Progress**
- ✅ the dashboard header now shows the effective mode visibly
- ✅ admin system settings now explain the operational effects of the currently selected mode inline

## Phase 6 — Treat the judge worker as privileged infrastructure
### Track 6A — Harden ops expectations around the worker boundary
**Severity:** MEDIUM

**Files / artifacts**
- worker deployment docs
- runbooks/checklists/monitoring notes
- any worker-side logging/alerting changes if later implemented

**Plan**
- document the worker as a privileged trust boundary, not just another app service
- define monitoring and incident expectations around worker compromise/misbehavior
- make the separation between app-tier and worker-tier responsibilities explicit in ops docs

**Acceptance criteria**
- worker trust assumptions are written down and easy for operators to find
- high-consequence worker events have a runbook/monitoring story

**Progress**
- ✅ `docs/high-stakes-operations.md` now documents the judge worker as a privileged trust boundary and calls out operator responsibilities

## Verification targets for future implementation
- `pnpm -s tsc --noEmit`
- targeted Vitest suites for auth, access control, and mode gating
- Playwright recruiting/candidate isolation coverage
- docs/readiness/runbook review with every policy-sensitive implementation slice
- any relevant Rust/worker verification only if a future slice actually changes worker behavior

## Non-goals
- No implementation in this planning pass
- No attempt to rewrite the judge-worker architecture wholesale as part of the recruiting/privacy fixes

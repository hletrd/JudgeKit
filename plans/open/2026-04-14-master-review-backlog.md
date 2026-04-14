# Master review backlog — 2026-04-14

## Source review set read in this pass
- all current review artifacts under `.context/reviews/*.md`
- existing plan/archive notes under `plans/README.md` and `plans/archive/`
- current repository state at `HEAD` plus the latest current-head review artifacts

## Revalidation conclusion from the full review set
After re-reading the full review inventory and comparing it against the existing archive notes and the current repository state:

- the **older 2026-04-07 / 2026-04-09 / 2026-04-10 / 2026-04-12 broad review sets** remain **implemented**, **superseded**, or **historical** and do not need reopened implementation plans right now;
- the currently actionable work is concentrated in the **current-head review set**;
- several findings from `.context/reviews/comprehensive-code-review-2026-04-13-current-head.md` were already closed by later work and are **not** reopened here (for example production upload persistence, docker-proxy image-management support, TS/Rust similarity parity, inline `#` comment normalization, and the `get_assignment_info` access check);
- the remaining still-actionable criticism now clusters into four plan lanes below.

## Archival result of this planning pass
- `plans/open/` contained no active implementation plans before this pass, so **no additional open plan files needed to be moved to archive**.
- previously completed plan sets remain in `plans/archive/`.
- the old “no open plans” note is now superseded by the new 2026-04-14 open backlog below.

## Current actionable review drivers
Primary open drivers:
- `.context/reviews/multi-agent-comprehensive-review-2026-04-13-current-head.md`
- `.context/reviews/comprehensive-code-review-2026-04-13-current-head.md` (only the still-open / partially revalidated lines)
- `.context/reviews/adversarial-security-review-2026-04-12-current-head.md`
- `.context/reviews/multi-perspective-review-2026-04-12-current-head.md`

## Open backlog by workstream

### 1. Authorization and trusted-context hardening
**Plan:** `plans/open/2026-04-14-authorization-and-context-hardening-plan.md`
**Status:** in progress
**Progress note:** started implementation of the repo-local authorization lane; current work covers problem-set visibility scoping, contest code-snapshot and recruiting-invitation object checks, server-derived restricted assignment context, co-instructor/TA submission visibility, capability-aware lecture/submission privilege cleanup, and reduced anonymous recruiting-validation payloads.

Open review lines folded here:
- problem-set visibility leaks across instructors/groups
- contest code-snapshot object-level authorization gap
- recruiting-invitation assignment-scope authorization gap
- AI-assistant and standalone-compiler contest/exam bypass via omitted `assignmentId`
- assignment-submission visibility still ignoring `group_instructors`
- remaining built-in-role/capability mismatches in page/UI privilege logic
- recruiting-token validation metadata minimization

### 2. Judge runtime, worker coordination, and deployment hardening
**Plan:** `plans/open/2026-04-14-judge-runtime-and-deployment-hardening-plan.md`

Open review lines folded here:
- stale-claim timeout reclaiming legitimate long-running jobs
- `judge_workers.active_tasks` not released on terminal reports
- problem memory-limit mismatch between app and worker
- split-host runner/admin features pointing at a stopped local worker
- code-similarity sidecar not actually serving Docker production and not handling large contests
- deploy script continuing after migration failure
- nginx/systemd/deploy-doc truth drift
- shared judge token / worker trust-boundary hardening follow-up

### 3. Verification, E2E, and readiness evidence hardening
**Plan:** `plans/open/2026-04-14-verification-and-readiness-plan.md`

Open review lines folded here:
- CI not running integration/component/coverage suites
- remote Playwright running only a small safe allowlist
- student-submission E2E passing without a real submission/judging path
- worker/admin E2E depth still too shallow for lifecycle confidence
- source-grep “implementation tests” overstating runtime confidence
- integration README drifting from the actual PostgreSQL harness
- high-stakes readiness docs claiming more evidence than the test harness currently proves
- remaining env/README/runtime-truth synchronization tasks

### 4. Privacy, governance, and high-stakes hardening
**Plan:** `plans/open/2026-04-14-privacy-governance-and-high-stakes-plan.md`

Open review lines folded here:
- anti-cheat details double-encoding
- partial/aborted assistant outputs being persisted as if complete
- backup/export streams containing live sensitive secrets
- privileged staff access to chat transcripts still needing tighter governance/break-glass handling
- recruiting-token validation leaking candidate/assignment metadata
- higher-assurance recruiting identity/re-entry still missing
- retention/export/legal-hold policy configurability
- anti-cheat telemetry vs proof guardrails for high-stakes use
- instructor/admin “power-user only” UX criticism that still needs concrete simplification work

## Recommended execution order
1. Authorization / trusted-context hardening
2. Judge runtime / deployment hardening
3. Verification and readiness hardening
4. Privacy / governance / high-stakes hardening

## Global acceptance condition for archiving this backlog
This backlog can move to `plans/archive/` only when:
- each child plan is either implemented and verified, or explicitly accepted/deferred by the owner,
- `plans/open/README.md` and `plans/README.md` are updated to reflect the new status,
- the current-head review set is either closed by code or reduced to explicit external prerequisites.

# Master review backlog — 2026-04-17 refresh

## Source review set re-read in this pass
- all current review artifacts under `.context/reviews/*.md`
- existing root plan/archive notes under `plans/`
- the latest current-head review artifacts from 2026-04-13 and 2026-04-17

## Revalidation summary
- older 2026-04-07 / 2026-04-09 / 2026-04-10 / 2026-04-12 broad review sets remain implemented, superseded, or historical;
- the current repository-level backlog is still concentrated in current-head authorization/runtime issues plus newly documented test-contract drift;
- privacy/high-stakes wording work and verification/readiness documentation lanes remain archived because they were already completed before this pass.

## Open backlog by workstream

### 1. Authorization and trusted-context hardening
**Plan:** `plans/open/2026-04-14-authorization-and-context-hardening-plan.md`  
**Status:** partially implemented / still open

Remaining driver lines include:
- custom-role consistency across user CRUD and page flows
- assignment- and contest-scoped authorization edges
- capability-vs-built-in-role cleanup that still affects real routes/pages

### 2. Judge runtime, worker coordination, and deployment hardening
**Plan:** `plans/open/2026-04-14-judge-runtime-and-deployment-hardening-plan.md`  
**Status:** partially implemented / still open

Remaining driver lines include:
- claim freshness vs stale reclaim
- worker-boundary token scope and dedicated-worker compose hardening
- compile sandbox hardening and split-host runtime truth

### 3. Test, docs, and contract alignment
**Plan:** `plans/archive/2026-04-17-test-contract-alignment-plan.md`  
**Status:** implemented and archived

Completed in this pass:
- full unit suite passes from a clean tracked state
- TypeScript check passes from a clean tracked state
- built-in role, judge auth, backup docs, i18n, source-grep, metadata, and guest-playground contract drift were all re-aligned

### 4. Product / UX / security feature planning tracked under `.context/plans/`
**Status:** open in the feature-plan surface, not duplicated here

This pass also created or refreshed feature-focused plans under `.context/plans/` for:
- student UX
- instructor workflow
- TA/group-scope permissions
- recruiting integrity/privacy
- admin observability/backup hardening
- contest-operations gap closure
- updated security/auth and judge-worker remediation

## Global acceptance condition for archiving this backlog
This backlog can move to `plans/archive/` only when:
- each root open plan is either implemented and verified, or explicitly deferred as an external prerequisite;
- `plans/README.md` and `plans/open/README.md` reflect the new status;
- the current-head review set no longer has unplanned repository-local criticism.

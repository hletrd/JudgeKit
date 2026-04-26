# Open review remediation plans

This directory contains **planning only** for repository-level findings that are still open at the current `HEAD`.

## Active plan set
- `2026-04-17-execution-roadmap.md`
- `2026-04-17-full-review-plan-index.md`
- `2026-04-14-master-review-backlog.md`

## Repository-level implementation lanes
- no remaining root implementation lanes are open at the current `HEAD`
- the completed root stabilization lanes now live in:
  - `plans/archive/2026-04-14-authorization-and-context-hardening-plan.md`
  - `plans/archive/2026-04-14-judge-runtime-and-deployment-hardening-plan.md`
  - `plans/archive/2026-04-17-test-contract-alignment-plan.md`
  - `plans/archive/2026-04-19-current-head-followup.md`
- remaining open work otherwise lives primarily under `.context/plans/`

## Source review set driving the backlog
- `.context/reviews/multi-agent-comprehensive-review-2026-04-13-current-head.md`
- `.context/reviews/comprehensive-code-review-2026-04-13-current-head.md`
- `.context/reviews/comprehensive-code-review-2026-04-17-current-head.md`
- `.context/reviews/comprehensive-security-review-2026-04-17-current-head.md`
- `.context/reviews/adversarial-security-review-2026-04-12-current-head.md` (only repo-local hardening lines)
- `.context/reviews/multi-perspective-review-2026-04-12-current-head.md` (only repo-local hardening lines)

## Archived lanes
The 2026-04-14 privacy/high-stakes and verification/readiness plans remain archived because they were already completed or intentionally reduced to external prerequisites before this pass.

## Planned execution order
1. Repository-level stabilization lanes ✅ all archived
2. Feature/domain plans under `.context/plans/`

## RPF Per-Cycle Plan Convention

The review-plan-fix loop adds a new plan per cycle named
`YYYY-MM-DD-rpf-cycle-N-review-remediation.md`. Once **every** task in such a
plan is `[x]` (or `[d]` with a recorded deferral exit criterion), the plan must
be moved to `plans/done/` in the next cycle's housekeeping pass — typically by
the cycle that follows it. Standing/master plans (workspace migration,
execution roadmap, master backlog, comprehensive remediation) stay here.

If two plans for the same cycle number end up in `plans/open/`, the older one
goes to `plans/open/_archive/` and the newer continuation supersedes it.

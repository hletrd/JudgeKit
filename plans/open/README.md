# Open review remediation plans

This directory contains **planning only** for repository-level findings that are still open at the current `HEAD`.

## Active plan set
- `2026-04-17-execution-roadmap.md`
- `2026-04-17-full-review-plan-index.md`
- `2026-04-14-master-review-backlog.md`
- `2026-04-14-authorization-and-context-hardening-plan.md`
- `2026-04-14-judge-runtime-and-deployment-hardening-plan.md`

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
1. Authorization / trusted-context hardening
2. Judge runtime / deployment hardening
3. Test, docs, and contract alignment ✅ archived after full suite + typecheck recovery

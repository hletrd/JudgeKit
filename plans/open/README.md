# Open review remediation plans

This directory contains **planning only** for review findings that are still open at the current repository head.

Current active plan set:
- `2026-04-14-master-review-backlog.md`
- `2026-04-14-authorization-and-context-hardening-plan.md`
- `2026-04-14-judge-runtime-and-deployment-hardening-plan.md`
- `2026-04-14-verification-and-readiness-plan.md`
- `2026-04-14-privacy-governance-and-high-stakes-plan.md`

These plans supersede the earlier “no open plans” state. The previous repository-local remediation sets remain archived under `plans/archive/` because they were already implemented or intentionally closed before this fresh review-planning pass.

## Source review set driving the current backlog
- `.context/reviews/multi-agent-comprehensive-review-2026-04-13-current-head.md`
- `.context/reviews/comprehensive-code-review-2026-04-13-current-head.md` (only the still-open / partially revalidated lines)
- `.context/reviews/adversarial-security-review-2026-04-12-current-head.md`
- `.context/reviews/multi-perspective-review-2026-04-12-current-head.md`

## Older review status
Older 2026-04-07 / 2026-04-09 / 2026-04-10 / 2026-04-12 broad reviews remain covered by `plans/archive/` and were **not** reopened as fresh implementation plans in this pass.

## Planned execution order
1. Authorization / trusted-context hardening
2. Judge runtime / deployment hardening
3. Verification / readiness hardening
4. Privacy / governance / high-stakes hardening

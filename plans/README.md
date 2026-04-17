# Review planning index — 2026-04-17

This directory contains **planning only**. No implementation is included here.

## Goal
- read the review artifacts under `.context/reviews/`
- separate implemented/superseded criticism from still-open work
- keep finished plan artifacts in `plans/archive/`
- keep only the currently actionable repository-hardening backlog in `plans/open/`

## Current repository-level open plans
- `plans/open/2026-04-17-execution-roadmap.md`
- `plans/open/2026-04-17-full-review-plan-index.md`
- `plans/open/2026-04-14-master-review-backlog.md`
- `plans/open/2026-04-14-authorization-and-context-hardening-plan.md`
- `plans/open/2026-04-14-judge-runtime-and-deployment-hardening-plan.md`

## Review inventory and status

| Review artifact | Status | Plan / archive note | Why |
| --- | --- | --- | --- |
| `.context/reviews/comprehensive-code-review-2026-04-07.md` | Archived (superseded) | `plans/archive/2026-04-12-review-status.md` | Older broad review superseded by later current-head passes |
| `.context/reviews/comprehensive-code-review-2026-04-09*.md` | Archived (implemented) | `plans/archive/2026-04-11-*.md` | Archived remediation plans already record closure |
| `.context/reviews/comprehensive-review-2026-04-09.md` | Archived (implemented) | `plans/archive/2026-04-11-comprehensive-review-2026-04-09-plan.md` | Closed in later heads |
| `.context/reviews/comprehensive-security-review-2026-04-09.md` | Archived (superseded) | `plans/archive/2026-04-12-review-status.md` | Superseded by later security passes |
| `.context/reviews/comprehensive-security-review-2026-04-10.md` | Archived (implemented) | `plans/archive/2026-04-12-review-status.md` | Review addendum + later repo evidence close the concrete lines |
| `.context/reviews/deep-code-review-2026-04-12*.md` | Archived (implemented) | `plans/archive/2026-04-12-*-review-plan.md` | Remediation already archived |
| `.context/reviews/multi-perspective-review-2026-04-12-current-head.md` | Open (repo-local subset) | `plans/open/2026-04-14-master-review-backlog.md` + `.context/plans/review-gap-index-2026-04-17.md` | Repo-local hardening remains, but external high-assurance prerequisites stay documented as non-code dependencies |
| `.context/reviews/adversarial-security-review-2026-04-12-current-head.md` | Open (repo-local subset) | `plans/open/2026-04-14-judge-runtime-and-deployment-hardening-plan.md` + `.context/plans/review-gap-index-2026-04-17.md` | Remaining worker/integrity issues still actionable |
| `.context/reviews/comprehensive-code-review-2026-04-13-current-head.md` | Open (partially revalidated) | `plans/open/2026-04-14-authorization-and-context-hardening-plan.md` | Some findings were fixed; remaining custom-role/current-head defects stay open |
| `.context/reviews/multi-agent-comprehensive-review-2026-04-13-current-head.md` | Open plan | `plans/open/2026-04-14-master-review-backlog.md` | Main current-head defect inventory |
| `.context/reviews/comprehensive-code-review-2026-04-17-current-head.md` | Archived (implemented) | `plans/archive/2026-04-17-test-contract-alignment-plan.md` | Suite/doc/contract stabilization completed with green full-suite evidence |
| `.context/reviews/comprehensive-security-review-2026-04-17-current-head.md` | Archived (implemented) | `plans/archive/2026-04-17-test-contract-alignment-plan.md` | Verification-contract drift was burned down and reverified with a green full suite |

## Archived in this pass
- `plans/archive/2026-04-17-test-contract-alignment-plan.md` — archived after `npx vitest run` and `npx tsc --noEmit` both passed from a clean tracked state

## Archival note for this pass
The test-contract alignment plan was moved into `plans/archive/` after full-suite verification succeeded. The earlier `.context/plans/` contest-workflow archival remains valid as well.

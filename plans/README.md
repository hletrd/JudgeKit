# Review planning index — 2026-04-14

This directory contains **planning only**. No implementation is included here.

## Goal
- read the review artifacts under `.context/reviews/`
- separate already-implemented or superseded review lines from still-open criticism
- keep finished plan artifacts in `plans/archive/`
- keep only the currently actionable planning backlog in `plans/open/`

## Directory layout
- `plans/open/` — currently actionable implementation plans
- `plans/archive/` — finished or historical plan artifacts plus review-status notes

## Status legend
- **Open plan** — still actionable; execution should start by revalidating the cited files against `HEAD`
- **Archived (implemented)** — later repo evidence or archived plan artifacts show the review line was already completed
- **Archived (superseded)** — an older review is covered by later review/plan artifacts and should not get a fresh implementation plan
- **Historical** — old review/archive context retained for reference only
- **Open (partially revalidated)** — some lines from the review were already closed, but remaining criticism is still actionable and has been merged into the current open plan set
- **Open (hardening / prerequisite backlog)** — the review is broader than pure code defects; remaining repo-local hardening work is planned, and any non-repo prerequisites are called out explicitly

## Current review inventory and plan mapping

| Review artifact | Status | Plan / archive note | Why |
| --- | --- | --- | --- |
| `.context/reviews/comprehensive-code-review-2026-04-07.md` | Archived (superseded) | `plans/archive/2026-04-12-review-status.md` | Older broad review; later 2026-04-09/10 reviews plus archived remediation plans cover the same surfaces with fresher evidence |
| `.context/reviews/comprehensive-code-review-2026-04-09-worktree.md` | Archived (implemented) | `plans/archive/2026-04-12-review-status.md` | Its concrete findings were already remediated and previously archived |
| `.context/reviews/comprehensive-code-review-2026-04-09.md` | Archived (implemented) | `plans/archive/2026-04-11-comprehensive-code-review-2026-04-09-plan.md` | Archived plan records completion at later heads |
| `.context/reviews/comprehensive-code-review-2026-04-10.md` | Archived (implemented) | `plans/archive/2026-04-11-comprehensive-code-review-2026-04-10-plan.md` | Archived plan records completion at later heads |
| `.context/reviews/comprehensive-review-2026-04-09.md` | Archived (implemented) | `plans/archive/2026-04-11-comprehensive-review-2026-04-09-plan.md` | Archived plan records completion at later heads |
| `.context/reviews/comprehensive-security-review-2026-04-09.md` | Archived (superseded) | `plans/archive/2026-04-12-review-status.md` | Superseded by the fresher 2026-04-10 security review and later remediation evidence |
| `.context/reviews/comprehensive-security-review-2026-04-10.md` | Archived (implemented) | `plans/archive/2026-04-12-review-status.md` | The review itself includes a remediation addendum and later repo evidence confirmed closure |
| `.context/reviews/deep-code-review-2026-04-12.md` | Archived (implemented) | `plans/archive/2026-04-12-deep-code-review-remediation-plan.md` | Archived remediation plan records completion |
| `.context/reviews/deep-code-review-2026-04-12-post-remediation.md` | Archived (implemented) | `plans/archive/2026-04-12-post-remediation-review-plan.md` | Archived follow-up plan records completion |
| `.context/reviews/multi-perspective-review-2026-04-12.md` | Archived (implemented) | `plans/archive/2026-04-12-multi-perspective-readiness-plan.md` | The 2026-04-12 multi-perspective remediation slices were completed and archived |
| `.context/reviews/adversarial-security-review-2026-04-12.md` | Archived (implemented) | `plans/archive/2026-04-12-adversarial-security-plan.md` | The 2026-04-12 adversarial-security remediation slices were completed and archived |
| `.context/reviews/multi-perspective-review-2026-04-12-current-head.md` | Open (hardening / prerequisite backlog) | `plans/open/2026-04-14-master-review-backlog.md`, `plans/open/2026-04-14-privacy-governance-and-high-stakes-plan.md`, `plans/open/2026-04-14-verification-and-readiness-plan.md` | Earlier acceptance is superseded by this fresh planning pass; remaining repo-local hardening, operator-clarity, and readiness work is now explicitly planned |
| `.context/reviews/adversarial-security-review-2026-04-12-current-head.md` | Open (hardening / prerequisite backlog) | `plans/open/2026-04-14-master-review-backlog.md`, `plans/open/2026-04-14-judge-runtime-and-deployment-hardening-plan.md`, `plans/open/2026-04-14-privacy-governance-and-high-stakes-plan.md` | The remaining current-head security criticism is now tracked as a mix of repo-local hardening and explicit external prerequisites |
| `.context/reviews/comprehensive-code-review-2026-04-13-current-head.md` | Open (partially revalidated) | `plans/open/2026-04-14-master-review-backlog.md` and sibling open plans | Several of its cited defects were already fixed, but remaining current-head auth/capability/docs concerns are still actionable and are merged into the 2026-04-14 open backlog |
| `.context/reviews/comprehensive-code-review-2026-04-13-e1051e9.md` | Archived (implemented) | `plans/archive/2026-04-13-e1051e9-master-review-backlog.md` and sibling archive plans | All repository-local findings from the `e1051e9` review set were implemented in later commits |
| `.context/reviews/multi-agent-comprehensive-review-2026-04-13-current-head.md` | Open plan | `plans/open/2026-04-14-master-review-backlog.md` and sibling open plans | This is now the main current-head defect inventory driving the new backlog |
| `.context/reviews/_archive/*` | Historical | source archive | Already archived review context only |

## Current active plan set
- `plans/open/2026-04-14-master-review-backlog.md`
- `plans/open/2026-04-14-authorization-and-context-hardening-plan.md`
- `plans/open/2026-04-14-judge-runtime-and-deployment-hardening-plan.md`
- `plans/open/2026-04-14-verification-and-readiness-plan.md`
- `plans/open/2026-04-14-privacy-governance-and-high-stakes-plan.md`

## Archival note for this pass
No additional open implementation plan files needed to be moved into `plans/archive/` during this pass because `plans/open/` contained only its README before the new 2026-04-14 backlog was created. Previously completed plan sets remain archived.

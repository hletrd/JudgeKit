# Review planning index — 2026-04-11

This directory contains **planning only**. No implementation is included here.

## Goal
- read the repository review artifacts under `.context/reviews/`
- identify what still looks actionable vs already implemented/superseded
- write implementation plans for the reviews that still need work
- archive older completed plan artifacts for reference

## Status legend
- **Open plan** — no later closure evidence was found; execution should start by revalidating the findings against `HEAD`
- **Archived (implemented)** — later repo evidence says the review's actionable items were already fixed
- **Archived (superseded)** — older review is covered by later reviews or already archived upstream

## Review inventory and plan mapping

| Review artifact | Status | Plan / archive note | Why |
| --- | --- | --- | --- |
| `.context/reviews/comprehensive-code-review-2026-04-10.md` | Open plan | `plans/open/2026-04-11-comprehensive-code-review-2026-04-10-plan.md` | Latest broad code review; no later addendum closes it |
| `.context/reviews/comprehensive-review-2026-04-09.md` | Open plan | `plans/open/2026-04-11-comprehensive-review-2026-04-09-plan.md` | Still contains unclosed race/auth/access-control backlog |
| `.context/reviews/comprehensive-code-review-2026-04-09.md` | Open plan | `plans/open/2026-04-11-comprehensive-code-review-2026-04-09-plan.md` | Still contains unclosed data/export/auth/runtime truth backlog |
| `.context/reviews/comprehensive-security-review-2026-04-10.md` | Archived (implemented) | `plans/archive/2026-04-11-implemented-or-superseded-reviews.md` | The review itself has a remediation addendum saying all actionable findings were addressed |
| `.context/reviews/comprehensive-code-review-2026-04-09-worktree.md` | Archived (implemented) | `plans/archive/2026-04-11-implemented-or-superseded-reviews.md` | The 2026-04-09/10 remediation notes match its findings (backup/import, code snapshots, capability drift, compiler workspace, docs) |
| `.context/reviews/comprehensive-security-review-2026-04-09.md` | Archived (superseded) | `plans/archive/2026-04-11-implemented-or-superseded-reviews.md` | Superseded by the fresher 2026-04-10 security review plus addendum |
| `.context/reviews/comprehensive-code-review-2026-04-07.md` | Archived (superseded) | `plans/archive/2026-04-11-implemented-or-superseded-reviews.md` | Older broad review; later 2026-04-09/10 reviews cover the same surfaces in more detail |
| `.context/reviews/_archive/*` | Archived (historical) | source archive | Already archived by the repo |

## New planning artifacts
- `plans/open/2026-04-11-master-review-backlog.md` — deduped execution backlog across the still-open reviews
- `plans/open/2026-04-11-comprehensive-code-review-2026-04-09-plan.md`
- `plans/open/2026-04-11-comprehensive-review-2026-04-09-plan.md`
- `plans/open/2026-04-11-comprehensive-code-review-2026-04-10-plan.md`

## Archived plan artifacts
Historical completed plan artifacts were copied from `.omx/plans/` into `plans/archive/` so they can be referenced without touching OMX runtime state.

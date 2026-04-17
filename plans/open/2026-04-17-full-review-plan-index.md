# Full review-to-plan index — 2026-04-17

## Purpose
Track how the full review corpus maps to current implementation plans, including feature-focused plans kept under `.context/plans/`.

## Reviews covered
- `.context/reviews/00-overall-verdict.md`
- `.context/reviews/01-student.md`
- `.context/reviews/02-instructor.md`
- `.context/reviews/03-admin.md`
- `.context/reviews/04-assistant.md`
- `.context/reviews/05-applicant.md`
- `.context/reviews/06-contest-organizer.md`
- `.context/reviews/07-security.md`
- `.context/reviews/security-api-auth.md`
- `.context/reviews/security-judge-worker.md`
- `.context/reviews/seo-review-2026-04-15-current-head.md`
- `.context/reviews/competitive-programmer-review-2026-04-17.md`
- current-head repository reviews already tracked in `plans/open/`

## Revalidated closed or stale criticisms
- contest clarifications are implemented: `src/components/contest/contest-clarifications.tsx`
- contest announcements are implemented: `src/components/contest/contest-announcements.tsx`
- worker health endpoint exists: `judge-worker-rs/src/runner.rs:766`
- the seccomp profile exists in-repo: `docker/seccomp-profile.json`
- backup UI already keys off `system.backup` capability at the page boundary: `src/app/(dashboard)/dashboard/admin/settings/page.tsx:210`
- public post-contest practice links exist, but they are not equivalent to a real timed virtual contest mode: `src/app/(public)/contests/[id]/page.tsx:289-304`

## Active plan ownership
| Review | Plan owner |
| --- | --- |
| `00-overall-verdict.md` | `.context/plans/ops-plan-01-admin-observability-and-backup-hardening.md`, `.context/plans/role-plan-01-ta-and-group-scope.md`, `.context/plans/recruit-plan-01-candidate-integrity-and-privacy.md`, `.context/plans/cp-plan-13-contest-operations-gap-closure.md`, `.context/plans/sec-plan-01-api-auth.md`, `.context/plans/sec-plan-02-judge-worker.md` |
| `01-student.md` | `.context/plans/ux-plan-01-student-coursework-experience.md` |
| `02-instructor.md` | `.context/plans/edu-plan-01-instructor-authoring-and-assignment-ops.md`, `.context/plans/role-plan-01-ta-and-group-scope.md`, `.context/plans/ops-plan-01-admin-observability-and-backup-hardening.md` |
| `03-admin.md` | `.context/plans/ops-plan-01-admin-observability-and-backup-hardening.md`, `.context/plans/sec-plan-01-api-auth.md`, `.context/plans/sec-plan-02-judge-worker.md` |
| `04-assistant.md` | `.context/plans/role-plan-01-ta-and-group-scope.md` |
| `05-applicant.md` | `.context/plans/recruit-plan-01-candidate-integrity-and-privacy.md`, `.context/plans/sec-plan-01-api-auth.md` |
| `06-contest-organizer.md` | `.context/plans/cp-plan-13-contest-operations-gap-closure.md`, `.context/plans/cp-plan-01-special-judge-subtask.md`, `.context/plans/cp-plan-04-interactive-problems.md`, `.context/plans/cp-plan-06-rating-progress.md`, `.context/plans/cp-plan-08-team-contests.md` |
| `07-security.md` | `.context/plans/sec-plan-01-api-auth.md`, `.context/plans/sec-plan-02-judge-worker.md`, `.context/plans/ops-plan-01-admin-observability-and-backup-hardening.md`, `.context/plans/recruit-plan-01-candidate-integrity-and-privacy.md` |
| `security-api-auth.md` | `.context/plans/sec-plan-01-api-auth.md` |
| `security-judge-worker.md` | `.context/plans/sec-plan-02-judge-worker.md` |
| `seo-review-2026-04-15-current-head.md` | `.context/plans/seo-plan-01-indexability-locale.md` |
| `competitive-programmer-review-2026-04-17.md` | `.context/plans/cp-plan-01-special-judge-subtask.md`, `.context/plans/cp-plan-04-interactive-problems.md`, `.context/plans/cp-plan-06-rating-progress.md`, `.context/plans/cp-plan-08-team-contests.md`, `.context/plans/cp-plan-13-contest-operations-gap-closure.md` |
| repository current-head code/security reviews | `plans/open/2026-04-14-authorization-and-context-hardening-plan.md`, `plans/open/2026-04-14-judge-runtime-and-deployment-hardening-plan.md`, `plans/open/2026-04-17-test-contract-alignment-plan.md` |

## Archive action taken in this pass
- archived the fully implemented `.context/plans/cp-plan-03-contest-workflow.md` into `.context/plans/_archive/`
- archived `plans/archive/2026-04-17-test-contract-alignment-plan.md` after full-suite and typecheck verification succeeded
- left the remaining active plans open because they still contain unresolved work or need revalidation before closure

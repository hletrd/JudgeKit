# Execution roadmap — 2026-04-17

## Purpose
This is the single prioritized roadmap across the root `plans/open/` backlog and the feature/domain plans under `.context/plans/`.

## Planning boundaries
- **Root `plans/open/`** = repository-level remediation required to make the current head safe/truthful to build on.
- **`.context/plans/`** = product/domain implementation plans derived from the broader review corpus.

## Phase 0 — Current-head repository stabilization (do first)
1. `plans/open/2026-04-14-authorization-and-context-hardening-plan.md`
2. `plans/open/2026-04-14-judge-runtime-and-deployment-hardening-plan.md`
3. `plans/archive/2026-04-17-test-contract-alignment-plan.md` ✅

**Why first:** these three lanes close the current-head correctness/security gaps and restore trust in the repo-level quality gates. The test-contract lane is now complete; the remaining Phase 0 work is the authorization and runtime lanes.

## Phase 1 — Security and operational hardening
4. `.context/plans/sec-plan-01-api-auth.md`
5. `.context/plans/sec-plan-02-judge-worker.md`
6. `.context/plans/ops-plan-01-admin-observability-and-backup-hardening.md`
7. `.context/plans/role-plan-01-ta-and-group-scope.md`
8. `.context/plans/recruit-plan-01-candidate-integrity-and-privacy.md`

**Dependency notes**
- `SEC-01` should precede most recruiter/admin export work.
- `SEC-02` should precede heavy judge-feature expansion (`CP-01`, `CP-04`, `CP-08`).
- `ROLE-01` unblocks several instructor/TA workflow improvements.

## Phase 2 — Workflow and user-surface improvements
9. `.context/plans/edu-plan-01-instructor-authoring-and-assignment-ops.md`
10. `.context/plans/ux-plan-01-student-coursework-experience.md`
11. `.context/plans/seo-plan-01-indexability-locale.md`
12. `.context/plans/per-problem-timeline.md`

**Dependency notes**
- `ROLE-01` should land before the TA-sensitive parts of `EDU-01`.
- `UX-01` and `EDU-01` can run partly in parallel once Phase 0 is stable.
- `SEO-01` is independent of most judge-runtime work and can run in parallel with UX/admin lanes.

## Phase 3 — Contest platform gap closure
13. `.context/plans/cp-plan-13-contest-operations-gap-closure.md`
14. `.context/plans/cp-plan-06-rating-progress.md`
15. `.context/plans/cp-plan-07-judging-feedback-queue.md`
16. `.context/plans/cp-plan-11-practice-search-polish.md`
17. `.context/plans/cp-plan-09-competitive-polish.md`

**Dependency notes**
- `CP-13` should come before broader contest/community rollout because it closes the highest-impact organizer gaps.
- `CP-06`, `CP-07`, `CP-11`, and `CP-09` are product-polish lanes that benefit from the earlier security/runtime cleanup but do not strictly block each other.

## Phase 4 — Major judge-engine feature expansion
18. `.context/plans/cp-plan-01-special-judge-subtask.md`
19. `.context/plans/cp-plan-04-interactive-problems.md`
20. `.context/plans/cp-plan-08-team-contests.md`

**Dependency notes**
- `SEC-02` and the root judge-runtime plan should be materially complete before this phase.
- `CP-01` and `CP-04` both touch the Rust judge worker and should be sequenced carefully.
- `CP-08` depends on contest lifecycle/admin work from `CP-13`.

## Suggested batching / parallel lanes
- **Lane A:** root repo stabilization (`plans/open/*`)
- **Lane B:** security/ops (`SEC-01`, `SEC-02`, `OPS-01`)
- **Lane C:** permissions/workflow (`ROLE-01`, `EDU-01`, `UX-01`)
- **Lane D:** recruiting/privacy (`RECRUIT-01`, parts of `OPS-01`, parts of `SEC-01`)
- **Lane E:** CP feature expansion (`CP-*` plans)
- **Lane F:** SEO (`SEO-01`) can run with Lane C after Phase 0

## Archive rules
A plan should move to archive only when:
- its acceptance criteria are verified,
- related README/index entries are updated,
- and no still-open review criticism is relying on that plan for ownership.

# Implementation plan — verification, E2E, and readiness hardening (2026-04-14)

## Source review lines
Primary sources:
- `.context/reviews/multi-agent-comprehensive-review-2026-04-13-current-head.md`
  - findings 12, 13, 14, 24, 25, 26
- `.context/reviews/comprehensive-code-review-2026-04-13-current-head.md`
  - remaining docs/test-truth drift items
- `.context/reviews/adversarial-security-review-2026-04-12-current-head.md`
  - L1 and operational-readiness concerns
- `.context/reviews/multi-perspective-review-2026-04-12-current-head.md`
  - exam/contest readiness criticism that needs stronger evidence, not only docs

## Goal
Make the repo’s verification story match its claims by running the right suites in CI, deepening the highest-value E2E checks, and replacing source-shape assertions with runtime evidence.

## Workstream A — CI suite completeness
**Targets**
- `.github/workflows/ci.yml`
- `package.json`
- `vitest.config.ts`
- `vitest.config.component.ts`
- `vitest.config.integration.ts`

**Implementation intent**
- add missing integration/component/coverage runs to CI;
- keep job split/runtime manageable without silently dropping whole safety nets.

**Acceptance criteria**
- CI runs `test:integration`, `test:component`, and coverage-threshold enforcement;
- failures in those suites block merge the same way unit/build failures already do.

**Verification expectations**
- green CI config validation plus at least one local dry run of the new job graph.

## Workstream B — Honest remote validation profiles
**Targets**
- `playwright.config.ts`
- deployment/test docs
- any helper scripts used for remote validation

**Implementation intent**
- separate “remote smoke after deploy” from “full remote regression” explicitly;
- stop letting a small allowlist masquerade as the whole post-deploy E2E promise.

**Acceptance criteria**
- the repo has a clear, documented, executable distinction between smoke and full remote validation;
- operators can intentionally run either path without ambiguity.

**Verification expectations**
- config tests and docs updates that prove the profile selection behavior.

## Workstream C — Real submission and worker lifecycle E2E coverage
**Targets**
- `tests/e2e/student-submission-flow.spec.ts`
- `tests/e2e/admin-workers.spec.ts`
- any shared helpers/fixtures needed to create assignment-aware submissions and worker expectations

**Implementation intent**
- make the student submission flow create a real assignment-scoped submission and assert judged completion;
- deepen admin-workers coverage so it checks real worker state transitions rather than only 200 responses.

**Acceptance criteria**
- the student submission flow fails if no real judged submission occurs;
- admin worker coverage exercises at least one meaningful lifecycle change (registration/active task/final report/staleness/reclaim path).

**Verification expectations**
- deterministic E2E setup/teardown plus one documented remote-safe subset for worker-state assertions.

## Workstream D — Replace brittle source-grep tests with executable coverage
**Targets**
- the highest-value implementation-only tests under `tests/unit/**`
- deploy/config tests that currently only regex-match source text
- route/component areas called out in the latest reviews

**Implementation intent**
- convert the most safety-critical string-presence tests into real executable tests first;
- keep source-shape assertions only where the behavior is genuinely static and text-contract based.

**Acceptance criteria**
- auth, deploy, realtime, and UI-contract regressions are tested by behavior, not only by `readFileSync(...).toContain(...)`;
- the count of safety-critical source-grep tests is materially reduced.

**Verification expectations**
- targeted test replacements plus a short inventory note of what remains intentionally text-based.

## Workstream E — Integration/readiness docs must match the actual harness
**Targets**
- `tests/integration/README.md`
- README/env/deployment docs that still overstate or misstate the current evidence
- `docs/high-stakes-validation-matrix.md` and any linked readiness docs

**Implementation intent**
- update docs so they describe the real PostgreSQL integration harness and the real high-stakes evidence bar;
- ensure “exam/public contest ready” claims stay behind actual load/failover evidence rather than code shape alone.

**Acceptance criteria**
- integration docs no longer describe SQLite when the harness is PostgreSQL;
- readiness docs point to actual executable evidence lanes or clearly call out missing prerequisites.

**Verification expectations**
- docs review plus any small contract tests that enforce key examples remain truthful.

## Workstream F — High-stakes runtime evidence harness
**Targets**
- realtime coordination tests/harnesses
- worker/app restart and failover rehearsal scripts/tests
- deployment/readiness docs that consume that evidence

**Implementation intent**
- add a real multi-instance/load/failover validation lane for the specific high-stakes claims the docs currently make;
- cover SSE slot behavior, anti-cheat heartbeat dedupe, and judging continuity under restart/failure.

**Acceptance criteria**
- the repo has executable evidence for the high-stakes lanes it names, or the docs are explicitly narrowed until such evidence exists;
- exam/public-contest guidance is backed by concrete reproducible validation steps.

**Verification expectations**
- at least one new integration/load harness path and documentation of how to run it.

## Completion bar
This plan is ready to archive only when CI, E2E, docs, and readiness claims all tell the same truth about what is and is not actually verified.

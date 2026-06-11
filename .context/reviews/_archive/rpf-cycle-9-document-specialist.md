# RPF Cycle 9 — Document Specialist

**Date:** 2026-04-29
**HEAD reviewed:** `1bcdd485`.

## Documentation inventory at HEAD

- `README.md` — main entry; cycle-8 added "Time Synchronization" section.
- `AGENTS.md` — agent-coordination doc (38KB); orientation for AI agents.
- `CLAUDE.md` — project-level rules (1.5KB); deploy preserves config.ts; Korean letter-spacing rule.
- `docs/api.md` — REST API reference (linked from README).
- `docs/` — extensive (configs, deploy hardening, etc.).
- `plans/` — cycle plans, including newly archived `plans/done/2026-04-29-rpf-cycle-7-review-remediation.md`.
- `.context/reviews/` — RPF review artifacts.

## Findings

**0 NEW HIGH/MEDIUM.**

## LOW-severity gaps

### LOW-DS-1: README does not list `npm run lint:bash` (cycle-5 added)

- File: `README.md`.
- Severity: LOW.
- Reason: `package.json` script `lint:bash` was added cycle 5 (commit `08991d54`) to lint `deploy-docker.sh` + `deploy.sh`. README does not document this script or its purpose in the development/CI workflow section. New contributors who run `npm run lint` won't know there's a parallel bash linter.
- Failure scenario: a contributor edits `deploy-docker.sh`, runs `npm run lint` (clean), pushes, then learns from CI (or the review-plan-fix cycle gates) that `lint:bash` reports issues. Friction.
- Exit criterion: README documents the `lint:bash` script alongside `lint`/`tsc`/`build` in the development section.
- Suggested cycle-9 pick: yes, ≤6 lines.

### LOW-DS-2: README missing `npm run test:e2e` documentation

- File: `README.md`.
- Severity: LOW.
- Reason: README mentions `npm test` and similar but does not enumerate the full vitest configurations (`test:unit`, `test:integration`, `test:component`, `test:security`, `test:e2e`). The orchestrator gates run all 5; a contributor running locally would benefit from a quick reference.
- Failure scenario: contributor pushes after running only `npm test`, then PR check fails on `test:component` worker pool. Friction.
- Exit criterion: README has a brief "Tests" section enumerating all 5 vitest configs and what each covers (with a note about env-blocked harness).
- Suggested cycle-9 pick: optional, doc-only, ≤15 lines.

### LOW-DS-3: AGENTS.md SSH-helpers refactor trigger not yet documented

- File: `AGENTS.md` or `deploy-docker.sh` head comment.
- Severity: LOW.
- Reason: The cycle-8 plan's Task D documents the SSH-helpers touch counter at 3, meaning the next touch triggers the refactor. This invariant is not reflected in any project-level documentation; it lives only in cycle plan files which a future contributor (or a future cycle) might miss.
- Failure scenario: cycle 11 modifies `_initial_ssh_check` (e.g., adds another env knob) without scheduling the refactor; the C3-AGG-5 trigger is silently bypassed.
- Exit criterion: top-of-file comment in `deploy-docker.sh` notes the touch counter at 3 + refactor trigger met, OR an AGENTS.md section documents the rule.
- Suggested cycle-9 pick: yes, ≤8 lines.

## Carry-forward documentation items

| ID | Description | Status | Notes |
|---|---|---|---|
| C7-DS-1 | README `/api/v1/time` doc | RESOLVED cycle 8 (commit `1cdf79ed`) | Closed. |

## Confidence

Medium on the gaps above being worth documenting (they're real onboarding friction points). High that none are HIGH/MEDIUM. The refactor-trigger documentation gap (LOW-DS-3) is the most consequential of the three — it directly risks bypassing a deferred-item exit criterion.

## Recommendation

For cycle 9, recommend picking:
1. **LOW-DS-3** — document the SSH-helpers refactor trigger in `deploy-docker.sh` head comment (≤8 lines, doc-only, prevents future cycles from silently bypassing the trigger).
2. **LOW-DS-1** — document `npm run lint:bash` in README (≤6 lines, doc-only, contributor-onboarding).

These are both ≤10-line doc-only fixes and address real backlog gaps. Total ≤14 lines.

LOW-DS-2 (test scripts enumeration) is a slightly larger doc addition; could fit if cycle 9 wants 3 picks, but not required.

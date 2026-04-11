# PRD — 2026-04-09 review remediation

## Goal
Eliminate the current high/medium findings from `./.context/reviews/comprehensive-code-review-2026-04-09.md`, then safely commit, push, and deploy.

## Scope
- secret disclosure paths
- file authorization/storage safety
- group page correctness for large groups
- DB import/export correctness and docs/runtime truth
- runtime-boundary/build warnings where feasible
- email identity normalization
- setup script safety
- rate-limiter test coverage

## Non-goals
- introducing new infrastructure like Redis unless strictly required
- redesigning product flows beyond what is required to remove the current findings

## Constraints
- preserve current production behavior where not directly related to the findings
- keep diffs reviewable and covered by tests
- deploy to configured environments from `.env`

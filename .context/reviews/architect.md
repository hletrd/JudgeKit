# Architecture Review: JudgeKit

**Reviewer:** architect
**Date:** 2026-05-11
**Scope:** Architectural/design risks, coupling, layering — Cycle 1 of RPF loop

---

## New Findings Summary

| Severity | Count |
|----------|-------|
| MEDIUM   | 1     |
| **Total**| **1** |

---

## MEDIUM

### A1: Deploy Script Env Injection Ordering Is Fragile
- **File:** `deploy-docker.sh:419-520`
- **Confidence:** Medium
- **Description:** The deployment script has a subtle ordering dependency: `ensure_env_literal` helpers run before `.env.production` is transferred to the remote. This means target-specific overrides (like `COMPILER_RUNNER_URL` for algo targets) are not reliably injected on first deploy. The architecture assumes `.env.production` already exists on the remote, which is only true for redeploys.
- **Design issue:** The env-injection phase and the file-transfer phase are not properly sequenced. Target-specific config files (`.env.deploy.algo`) exist but are not integrated into the backfill logic.
- **Fix:** Restructure the deploy script so that env backfill always runs AFTER the `.env.production` file is guaranteed to exist on the remote. Consider sourcing `.env.deploy.*` files into the script's own environment and using them as defaults for `ensure_env_literal`.

---

## No Critical, High, or Additional Medium Findings

The codebase architecture remains sound. Recent refactors (api client type-safe helpers, modular auth config) improved maintainability. No new coupling or layering regressions introduced in the recent commits.

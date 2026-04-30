# Security Reviewer — RPF Cycle 5 (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `2626aab6`
**Cycle change surface vs cycle-4 close-out:** EMPTY.

## Inventory

- `deploy-docker.sh`: 1032 lines (cycle-4 hardening text added). Reviewed env-var handling, secrets handling, SSH ControlMaster paths, sudo-password decoupling, drizzle-force escalation policy.
- `src/lib/auth/`: unchanged since cycle 3. `config.ts` preserved per project rule.
- `src/lib/api-rate-limit.ts`: unchanged.
- `.env.production` write path in `deploy-docker.sh:277, 283`: chmod 0600 in both fresh-generation and existing-file paths.

## NEW findings this cycle

**None.** No source-code or deploy-script changes since cycle-4 close-out. All cycle-4 security-related work verified intact.

## Resolution of prior cycle-5 (stale base 4c2769b2) findings

- F1 (Group export route lacks rate limiting): subsumed by ARCH-CARRY-1 (createApiHandler migration). DEFERRED.
- F2 (`scripts/deploy-worker.sh` sed injection risk in `ensure_env_var`): not in cycle-4 scope. RE-EXAMINING below.
- F4 (SSE 30s auth-recheck window): documented tradeoff; DEFERRED.
- F5 (CSRF bypass for API key consistency): subsumed by ARCH-CARRY-1. DEFERRED.

## Re-examination of `scripts/deploy-worker.sh` `ensure_env_var` sed safety (cycle-5 stale F2)

`scripts/deploy-worker.sh` is the WORKER deploy script (not `deploy-docker.sh`). Per CLAUDE.md project rule, the worker is built on `worker-0.algo.xylolabs.com`, not on `algo.xylolabs.com`. The stale F2 raised a sed-injection concern about `ensure_env_var` accepting an unsanitized value via `--app-url`. At HEAD `2626aab6`, this script remains as it was at cycle-3/4 close-out. Severity reassessed: **LOW** (operator-supplied `APP_URL` is trusted input — operator runs the deploy with their own URL; not external attacker input). DEFER with exit criterion: untrusted-source `APP_URL` becomes a possibility OR an operator reports a sed-pattern collision with a real URL.

- **C5-SR-1 (DEFERRED)**: `scripts/deploy-worker.sh:101-107` sed delimiter collision with shell metacharacters in `APP_URL`. LOW. Exit criterion as above.

## Carry-forward DEFERRED security items

- **C3-AGG-2** (LOW) `deploy-docker.sh:204-214` — `remote_sudo` SSH/sudo password coupling.
- **C3-AGG-6** (LOW) `deploy-docker.sh:151` — ControlMaster socket dir path-predictability.
- **D1** (MEDIUM) `src/lib/auth/` JWT clock-skew.
- **D2** (MEDIUM) `src/lib/auth/` JWT DB query per request.
- **C5-SR-1** (LOW, this cycle) `scripts/deploy-worker.sh:101-107` sed delimiter collision.

No HIGH security findings open. No security/correctness/data-loss findings deferred without explicit repo-rule justification.

## Repo-rule check

Per orchestrator directive: cycle-5 must NOT preemptively set `DRIZZLE_PUSH_FORCE=1`. Verified.

## Confidence

**High.** Direct inspection.

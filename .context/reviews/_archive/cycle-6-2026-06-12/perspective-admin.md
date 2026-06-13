# Perspective: Platform Admin / Operator — RPF Cycle 6 (2026-06-12)

**HEAD reviewed:** 22e1510f. Walked: deploy story, judge fleet health, backup/restore, capacity controls, incident response surfaces, ops registers.

## What works well
- **Deploy story:** three-target `deploy-docker.sh` self-heals BuildKit history corruption, builds languages sequentially by default, enforces the algo app-only policy from `.env.deploy.algo`, refuses to overwrite remote `.env*`, auto-injects `COMPILER_RUNNER_URL`/`AUTH_TRUST_HOST` for app-only targets, and warns on local-default drift (`deploy-docker.sh:657-666`). Four consecutive clean three-target runs recorded.
- **Judge fleet resilience:** the background staleness sweep (`worker-staleness-sweep.ts`) reaps a dead single-worker fleet without depending on any surviving heartbeat, zeroes leaked `active_tasks`, and emits alertable one-shot log transitions; the claim SQL self-heals orphaned claims with token fencing. Peak-load behavior is bounded by per-user pending caps + the global queue cap with honest 429/503 + Retry-After.
- **Backups:** restore-test exists (RESTORE_DATABASE_URL full restore-test documented and wired — cycle-3/era work verified still present in `docs/`/ops scripts).

## Pain points / risks found

### AD6-1 — The ops register I'd consult first is stale (MEDIUM-doc, High — V6-6/DOC6-1)
`plans/open/user-injected/pending-next-cycle.md` still advertises a HIGH-priority migration as ONGOING (completed 2026-04-29) and a deploy fix as pending (implemented at `deploy-docker.sh:657`). During an incident, stale registers cost exactly the minutes you don't have. Update with resolution evidence.

### AD6-2 — A diagnostic string describes an impossible state (LOW, High — CR6-2/DOC6-3)
If a similarity scan is skipped on a big contest, the UI can never truthfully say "Rust service unavailable" anymore — yet the string (and its code branch) remain. An operator chasing that message would audit the wrong service. Remove the dead state.

### AD6-3 — Token lifecycle is an admin liability too (MEDIUM, High — SEC6-1)
"Remove the user from the group" is the documented operator remediation for participant problems; it silently doesn't revoke contest access. Whatever the incident runbook says about removing a misbehaving participant mid-contest is currently wrong one layer down.

## Capacity / monitoring spot-checks (no new issues)
- Rate-limit families exist on every surface touched this cycle; submission caps are settings-driven (`security/constants.ts` getters) so they can be tuned without deploy.
- Heartbeat ingest is one INSERT/60 s/participant with an LRU (or shared coordination on multi-instance) — a 500-seat live exam ≈ 8 writes/s worst case; fine.
- The opt-in gap scan keeps dashboard polling cheap (AGG4-5 resolution verified).
- Prometheus worker-status metrics + log-transition alerts cover the "fleet dead" page-out path.

## Carried (register unchanged)
- AGG3-7 — `run_remote_build` retry overwrites the first failure log; exit: next `run_remote_build` edit.
- DEFER-ENV-GATES — login-gated E2E needs the provisioned staging browser/user.
- AGG5-7 — judge-worker-rs cosmetics await a behavioral Rust edit.

## Verdict
Operationally the platform is in its best shape of the loop. This cycle's admin work is hygiene: fix the registers (AD6-1), delete the impossible diagnostic (AD6-2), and make roster removal mean what the runbook thinks it means (AD6-3).

# Persona: Platform Admin (settings, users, capacity, ops) — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97 — the tree currently serving all three production targets.

## What got better since cycle 2 (verified)
- **Deploys no longer fail on BuildKit history corruption**: sequential language builds by default, targeted self-heal (`run_remote_build`), runbook scenario, and the cycle-2 deploy proved the path end-to-end (~80 auraedu language builds, zero corruption events). DEFERRED-OPS-1 is genuinely closed.
- **A dead judge worker is now detected without traffic** (background staleness sweep, unref'd 60 s interval) — the single-worker-topology blind spot is gone; reap events log loudly for alerting.
- **Backups can be PROVEN restorable** (`verify-db-backup.sh` full restore-test into a throwaway DB).
- `NODE_ENCRYPTION_KEY` is now required at startup (a5e66736) — no more silently-unencrypted column risk after a botched env copy; all three targets came up healthy post-change, confirming the envs carry it.
- Restricted-mode overrides now show a visible warning banner while active (f5fb088b).

## AD3-1 — The deploy smoke cries wolf on branded instances (LOW-MEDIUM, High; V3-3)
My deploy verification for oj.auraedu.me reports a FAILED hero-heading check on a healthy instance (h1 is instance-branded via `homePageContent`). Every red-but-actually-fine smoke teaches me to skim past red. Make the expected heading env-configurable per target this cycle — it is the difference between a smoke I trust and one I rationalize.

## AD3-2 — The restore-test exists but no doc tells me to use it (LOW, High; DOC3-3)
`RESTORE_DATABASE_URL` appears nowhere in docs/. My backup timer runs the script WITHOUT it, so I get the weak gzip-only check and a NOTE line nobody reads in a timer log. Document it in deployment.md + runbook, including the role-match caveat (D3-3) so my first scratch-instance attempt doesn't false-alarm.

## AD3-3 — Accommodation incidents now generate support load by design flaw (MEDIUM; CR3-1 from the ops seat)
When an instructor escalates "my extended student is flagged as suspicious", the on-call path today ends in "known bug, ignore the flags" — an answer that erodes trust in every other flag. Fix lands this cycle; nothing for the runbook afterward.

## Capacity / monitoring spot-checks
- New steady load: exam-session polling (~1 req/min/examinee; PERF3-1 trims its query cost), anti-cheat heartbeats (unchanged 60 s server dedup), staleness sweep (negligible). No new unbounded tables: the retention class-closer test now structurally guarantees every growing table is pruned or explicitly allowlisted — as an admin this is the single best ops guarantee added this quarter.
- Worker-host guardrails (never `docker image prune -a` on workers) are documented in CLAUDE.md/AGENTS.md and now ALSO encoded in the script's recovery path (history-store-only clearing). Good defense in depth.
- Incident response: runbook gained the deploy-build-failure scenario with signature/remedy/non-remedy — matches what the script actually does.

Carried: monitoring-stack items and capacity headroom analyses from the register, unchanged. Net: ops posture at this HEAD is the strongest so far; the two actionables are smoke trust (AD3-1) and restore-test documentation (AD3-2).

# Persona review — Platform admin (RPF cycle 4, 2026-06-11)

**HEAD reviewed:** 7c0a4bd4. Seat: system settings, users, capacity,
monitoring, backup/restore, deploy, incident response.

## AD4-1 — Dead-worker detection now traffic-independent (positive, verified)
The background staleness sweep (`worker-staleness-sweep.ts`, started from
`instrumentation.ts:28`) reaps a crashed single worker without needing another
worker's heartbeat — closing the cycle-2 era gap for the documented
single-worker prod topology. Reap transitions log exactly once (WHERE on prior
status), giving me an alertable signal ahead of the Prometheus scrape.

## AD4-2 — Backup story complete on paper; restore-test documented (carry-positive)
`RESTORE_DATABASE_URL` full restore-test documented with the role-match caveat
and skip-notice meaning (cycle-3 G6); verification now actually restores
(abfa90f5). My remaining operational duty: run it against a scratch instance
periodically — the docs now tell me exactly how.

## AD4-3 — Capacity view for a live contest (no change, watch item)
P4-1 (anti-cheat GET count(*) + 5000-row gap scans per dashboard poll) is the
only new capacity note this cycle; it's read-path-only and indexed. Watch
during the first 100+ seat live contest; the deferred row carries an explicit
exit criterion.

## AD4-4 — Deploy/upgrade story (unchanged, healthy)
Two consecutive clean three-target deploys (cycle-2, cycle-3) with the
sequential language-build strategy and BuildKit self-heal; app-only constraint
for algo.xylolabs.com encoded in `.env.deploy.algo`. The smoke now accepts
branded heroes via `E2E_HOME_HEADING`. Known residuals: login-gated smoke
specs skip without E2E_PASSWORD (DEFER-ENV-GATES carry); auraedu cold-start
transient on tablet rankings (watch on this cycle's deploy).

## AD4-5 — Incident-response relevance of this cycle's findings
AGG4-1/2 are not availability issues, but as admin I own the data: false
escalate rows are PII-adjacent integrity records (`anti_cheat_events` carries
IP + UA). Until the fix deploys, any export or retention decision based on
escalate counts is skewed. Data-retention pruning
(`startSensitiveDataPruning`) is unaffected (prunes by age, not tier).

## AD4-6 — Settings/permissions sweep
`NODE_ENCRYPTION_KEY` startup requirement (a5e66736) verified still enforced
via `assertProductionConfig` chain; system-settings init precedes background
jobs that read it (`instrumentation.ts:20-28`). No new admin-surface gaps
found this cycle.

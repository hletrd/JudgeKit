# Perspective — Platform Admin — RPF Cycle 9 (2026-06-13)

**HEAD:** da6179f3. Seat: platform admin (settings, capacity, backup, deploy, IR).

## AD9-1 — listing determinism on audit-style surfaces (LOW→MEDIUM, via CR9 cluster)
Admin/instructor evidence and roster tables must be deterministic for incident
review. The three CR9 routes (code-snapshots, recruiting-invitations,
accepted-solutions) lack the `id` tiebreak that the admin audit-logs / login-logs
exports already have (those were fixed in cycle-7 and verified at
`audit-logs/route.ts:221,273` and `login-logs/route.ts:95,133`). Bringing the
three stragglers up to the same contract closes the gap. Low operational risk,
additive fix, no migration, no capacity impact.

## Backup/restore / deploy / monitoring
- DB backup verification with real restore-test is in place (recent ops commit).
  CI-RESTORE (wire `RESTORE_DATABASE_URL` into CI's postgres service) remains a
  carried ops item — exit criterion (next CI workflow edit touching the db
  service) not fired this cycle.
- Deploy story (worv + algo app-only per .env.deploy.*, auraedu out-of-band)
  unchanged; `deploy-docker.sh` self-heals BuildKit history corruption.
- No new capacity / monitoring / IR gap surfaced.

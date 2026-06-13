# perspective-admin — RPF Cycle 10 (2026-06-13)

Seat: platform admin — settings, users, capacity, monitoring, backup/restore, deploy, incident response.

## Assessment
**No new actionable findings.**
- Deploy story: per-cycle worv + algo deploy is app-only and ~5-10 min; `deploy-docker.sh` self-heals BuildKit history corruption (`docker buildx history rm --all` + retry once) and builds language images sequentially by default. `.env.production` chmod 0600, SSH multiplexing, drizzle-push destructive-change escalation — all intact.
- Backup/restore: PostgreSQL backup verification now includes a real restore-test (recent commit abfa90f5). `NODE_ENCRYPTION_KEY` required at startup (a5e66736).
- Audit/login logs paginate deterministically (cycle-7) — incident forensics are stable across pages.
- Step 5b backfill (secret_token_hash) runs unconditionally and is idempotent; sunset gated on 2026-10-26 + column-absence check.

## Carried (ops, exit criteria did not fire)
- CI-RESTORE: wire `RESTORE_DATABASE_URL` into CI's postgres service — needs a CI workflow edit touching the db service. Carry.
- C3-AGG-5: deploy-docker.sh SSH-helper extraction — needs an SSH/remote-exec edit. Carry.
- auraedu lags at an earlier HEAD intentionally (orchestrator re-syncs out of band).

# Perspective: Platform Admin — RPF Cycle 5 (2026-06-11)

**HEAD:** 04b8c1ec. Walked: settings, user management, workers, backup/
restore, monitoring, deploy/upgrade, incident response.

## AD5-1 — Backup/restore: operationally serious (verified-good)
`system.backup` capability + password re-confirmation + CSRF + rate limit +
audit events on both routes; restore takes a pre-restore snapshot before
import; ZIP/file restores validated and size-capped (MAX_IMPORT_BYTES). The
documented restore-test in CI (commit abfa90f5) closes the classic
"backups never restored" gap. No new findings.

## AD5-2 — Capacity: a polled instructor view pays for an unused 5000-row scan (MEDIUM, High, CONFIRMED)
Every participant-timeline poll triggers the per-user heartbeat-gap scan
server-side and discards it client-side (P5-1). One instructor watching one
candidate is fine; a recruiting screen with several reviewers polling
several candidates multiplies an indexed-but-real read load for zero value.
G3's `includeGaps` gating makes the cost opt-in and consumed. The
unconditional dashboard `count(*)` stays (feeds pagination; indexed,
assignment-scoped) — recording that as the explicit resolution of the
deferred AGG4-5 once the GET is edited this cycle.

## AD5-3 — Judge fleet lifecycle: healthy (verified)
online→stale→offline sweep runs in the background (7e198b51), counter
repair is sweep-owned, per-worker token hashes with no plaintext fallback,
claim refuses unsandboxed retries on seccomp-init failure (fails closed).
Worker images build on worker-0 only; algo stays app-only per policy —
encoded in `.env.deploy.algo`, confirmed untouched.

## AD5-4 — Upgrade/deploy story (verified, with standing cautions)
Three consecutive clean sequential-language deploys (cycle-4 record);
BuildKit history self-heal in-script. Standing cautions remain accurate and
binding: never `docker system prune --volumes` anywhere; never
`docker image prune -a`/`system prune -a` on worker hosts (~80 language
images); preserve `src/lib/auth/config.ts` during deploys. Carried AGG3-7
(retry log overwrite in `run_remote_build`) — unchanged, fires only when
that function is next edited; this cycle does not plan to edit the deploy
script.

## AD5-5 — Incident response docs (verified)
`operator-incident-runbook.md` + `judge-worker-incident-runbook.md` +
`admin-security-operations.md` cover worker loss, queue stalls, credential
handling; `examSessionUnavailable` (cycle-4) maps to a retryable 500 — the
right shape for status-page triage. The admin-bypass paragraph in the
integrity doc correctly names the residual risk (admin compromise defeats
the integrity model) with credential guidance. No new findings.

## Wishlist registered (not defects)
Multi-instance shared rate-limit/heartbeat coordination is configuration-
gated (`usesSharedRealtimeCoordination`) — fine at current single-instance
scale; revisit only when an instance count change is planned.

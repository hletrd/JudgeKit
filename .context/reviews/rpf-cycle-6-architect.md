# RPF Cycle 6 — architect (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `a18302b8`
**Diff vs cycle-5 base:** 0 lines.

## Methodology

Re-validated architectural carry-forwards (ARCH-CARRY-1, ARCH-CARRY-2). Audited the stale prior cycle-6 ARCH findings.

## Stale prior cycle-6 ARCH findings audit

- **Stale ARCH-1 (recruiting-invitations-panel.tsx 613-line component is too large)** — Still applicable as a "maintainability concern, not a bug" (per the stale aggregate's own classification). NOT promoted to a NEW finding because (a) it's a maintainability concern, not a bug, and (b) splitting the component is in scope for a dedicated UI refactor cycle, not RPF backlog drawdown. Status: NOT injected.
- Stale ARCH-2 (handleCreate missing catch) — RESOLVED at HEAD.

## Carry-forward architectural items — status at HEAD

### ARCH-CARRY-1 — raw API handlers not using `createApiHandler` (MEDIUM, DEFERRED)

- **Population at HEAD:** `find src/app/api -name 'route.ts' | wc -l` = 104. `grep -rl 'createApiHandler' src/app/api | wc -l` = 84. Raw count = **20** (down from 22+ when the item was first opened).
- **Sample raw routes (subset):** `src/app/api/auth/[...nextauth]/route.ts`, `src/app/api/health/route.ts`, `src/app/api/metrics/route.ts`, `src/app/api/internal/cleanup/route.ts`, `src/app/api/v1/admin/backup/route.ts`, `src/app/api/v1/admin/migrate/{export,import,validate}/route.ts`, `src/app/api/v1/files/[id]/route.ts`, `src/app/api/v1/judge/{claim,deregister,heartbeat,poll,register}/route.ts`, `src/app/api/v1/recruiting/validate/route.ts`, `src/app/api/v1/test/seed/route.ts`, `src/app/api/v1/time/route.ts`.
- **Why several stay raw:** `next-auth` route is owned by next-auth's helper. `judge/*` endpoints use a token-based auth path with a different validator. `time` is intentionally minimal. `health`/`metrics` are public probes and intentionally bypass schema/auth wrappers. `internal/cleanup` is the cron entrypoint with its own auth header.
- **Severity:** MEDIUM (architecture inconsistency). Not a bug. Deferred to a dedicated handler-refactor cycle.
- **Status:** DEFERRED. Population shrinking organically (down 2 since first observation).

### ARCH-CARRY-2 — SSE eviction O(n) in `src/lib/realtime/realtime-coordination.ts` (LOW, DEFERRED)

- File still active. No diff this cycle.
- Status: DEFERRED.

### ARCH-DUP — `deploy-docker.sh` + `deploy.sh` helper duplication (LOW, DEFERRED, was C3-AGG-5)

- Status: DEFERRED. Exit criterion: `deploy-docker.sh` >1500 lines OR `deploy.sh` invoked again OR 3 indep cycles modify SSH-helpers.

## Cross-cutting observations

1. **Backlog is shrinking organically.** Two carry-forward items (C1-AGG-3, ARCH-CARRY-1) measured below their original "X+" thresholds without a dedicated cycle targeting them — incidental refactors are eating the population.
2. **Path drift is real.** AGG-2 and PERF-3 both had path drift (file moved or directory contents reduced). Cycle-6 plan should record updated paths in the deferred entries.
3. **Deploy-script complexity is the dominant LOW source.** 6 of the 17 carry-forwards (C3-AGG-2/3/4/5/6, C5-SR-1, plus C3-AGG-8 done cycle-5) involve deploy scripts. A future "deploy-refactor" cycle would retire several at once; in the meantime, fine-grained draw-down is correct.

## NEW findings this cycle

**0 HIGH, 0 MEDIUM, 0 LOW NEW.** Empty change surface; no new architectural risks introduced.

## Recommendation

Three LOW draw-down candidates for cycle 6:

1. **C5-SR-1** (deploy-worker.sh sed delimiter) — small, security-flavored, low-risk.
2. **C3-AGG-3** (ControlSocket cleanup ordering in `deploy-docker.sh:165-178`) — small, deploy-reliability-flavored.
3. **C3-AGG-2** (SSH credential-rotation footgun in `deploy-docker.sh:204-214`) — small, deploy-reliability-flavored, additive validation.

Together: deploy-script-only diff < 50 lines, all naturally aligned exit criteria, retire 3 carry-forwards.

Confidence: H.

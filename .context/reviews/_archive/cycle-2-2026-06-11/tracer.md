# Tracer (causal flows, competing hypotheses) — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035 (main)

## Trace 1 — auraedu BuildKit failure (DEFERRED-OPS-1): root cause CONFIRMED
Hypotheses from cycle 1: (a) disk pressure, (b) image-store corruption,
(c) BuildKit history-store corruption, (d) compose-bake race.
Orchestrator evidence (Docker 29.1.3 / buildx v0.20.0, verified on host):
- `docker builder prune -af` did NOT clear the failure → not (a)/(b) cache.
- `docker buildx history rm --all` DID clear it (metadata-only, zero
  downtime) → corrupted reference lives in the HISTORY store → (c).
- Two consecutive full-parallel `docker compose build` runs (~90 targets,
  cold cache) re-corrupted fresh history stores (judge-powershell, then
  judge-lua) → trigger is the parallel bake (history/GC race) → (d) as the
  *re-trigger* mechanism on top of (c).
- Sequential per-language builds (`LANGUAGE_FILTER=all` loop,
  `deploy-docker.sh:645-648`) completed both deploys cleanly at 4cf01035.
**Causal chain:** one parallel bake solve of ~90 targets → buildx history
write/GC race → dangling blob ref in history store → every subsequent build
solve fails "unknown blob ... in history" until the history store is
cleared. **Remedy chain (to encode in deploy-docker.sh):** detect signature →
`docker buildx history rm --all` on the remote → retry once; and stop
triggering it: serialize or cap the all-languages build.

## Trace 2 — Can a non-extended student submit past assignment close after F12?
Path: submit → `validateAssignmentSubmission` → close check
(`submissions.ts:259-267`) honors `examSession.personalDeadline >= now`.
Could personalDeadline exceed close WITHOUT staff action?
- `startExamSession` clamps to `assignment.deadline` (`exam-sessions.ts:83-86`). 
- `extendExamSession` is the only writer that moves it later; route gated by
  `canManageGroupResourcesAsync`.
- Edge probed: assignment has `lateDeadline > deadline`. Close uses
  `lateDeadline ?? deadline`; session clamp uses `deadline` — personal
  deadline ≤ deadline ≤ effectiveClose, no bypass. **No path found.**

## Trace 3 — First-request storm on a fresh rate-limit key
Two concurrent requests, same new key: both `SELECT...FOR UPDATE` (no row →
no lock) → both INSERT → unique violation aborts one txn →
`consumeApiRateLimit` throws → handler 500. Competing hypothesis — drizzle
retries or the PK differs — rejected: `rateLimits.key` is the PK and no
onConflict clause exists at any of the four insert sites
(`api-rate-limit.ts:84,244,353`; `rate-limit-core.ts:96`). CONFIRMED
(Medium confidence on real-world frequency, High on mechanism).

## Trace 4 — Where does a staff extension become visible?
Server: immediately (submit validation + scoring key on the session row).
Staff UI: on `router.refresh()` after the dialog. Student UI: **only on full
page reload** — countdown deadline and `isExamExpired` are server-render
props (`page.tsx:168-201`). Confirms V2-1.

## No-finding traces
- ipOverlap CTE under monitor-only TA: gated by `canMonitorContest` (GET),
  cannot reach PATCH extend (different gate). Boundary holds.
- Poll finalize decrement vs claim reclaim: token fence prevents the stale
  worker's decrement (WHERE claimToken match fails → 403 before the
  decrement's transaction commits). Holds.

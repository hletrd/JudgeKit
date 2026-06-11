# Performance review — RPF cycle 4 (2026-06-11)

**HEAD reviewed:** 7c0a4bd4 · baseline gates green.
**Lens:** performance, concurrency, CPU/memory, responsiveness.

## Method
Profile-by-reading of the hot paths the cycle-3 changes touch (anti-cheat POST,
exam-session GET poll, submission validator) plus the monitoring read paths
(anti-cheat GET, IP-overlap report) and client timers (anti-cheat monitor,
snapshot autosave, deadline sync).

## Findings

### P4-1 — Anti-cheat GET recomputes `count(*)` + scans up to 5000 heartbeats per poll (LOW, Medium, RISK)
`anti-cheat/route.ts:283-286` runs an unconditional `count(*)` over the
assignment's events on every monitor-dashboard fetch, and the per-user
heartbeat-gap report (`:296-325`) pulls up to 5000 rows then scans in JS, with
no time-window parameter. For a live 200-seat contest with staff dashboards
polling per-student views this multiplies. Indexes
(`ace_assignment_created_idx`, `ace_assignment_type_idx`) keep it from being
quadratic, and current deployments are small — no observed incident. Suggest
(deferred-eligible): window the gap scan to the contest window and reuse the
paginated total only when `offset === 0`.

### P4-2 — Validator now does an extra write on flagged paths every 10–60 s (MEDIUM as correctness, perf side noted)
The misplaced `submission_stale_heartbeat` inserts (CR4-1) also mean each
stale-state autosave is a DB INSERT amplified at the snapshot cadence
(`problem-submission-form.tsx:175`: 10 s while typing). Fixing CR4-1 removes
the write amplification; no separate perf work needed.

### P4-3 — Concurrency: pending-queue flush races (LOW-MEDIUM, Medium, LIKELY)
`anti-cheat-monitor.tsx`: `performFlush` (`:90-105`) holds an in-memory copy of
the localStorage queue across `await sendEvent(...)` boundaries; `reportEvent`
(`:163-172`) does a synchronous load-push-save in between. The final
`savePendingEvents(remaining)` clobbers the concurrent append → telemetry
loss. Also nothing prevents two concurrent flush loops (mount + online +
visibilitychange all call it) from double-sending the same event. Fix: claim
events one-at-a-time (load → save-minus-first → send → maybe re-append) plus an
`isFlushing` guard ref.

## Verified-clean notes
- Cycle-3 AGG3-1 fix keeps the anti-cheat POST hot path query-free pre-close;
  the extra `getExamSession` lookup runs only on the past-close windowed branch
  (route.ts:110-118) — confirmed by test `anti-cheat-post-extension.test.ts`
  ("hot path before the close never pays the session lookup").
- Cycle-3 AGG3-4 made the 60 s exam-session poll skip staff resolution for
  plain student polls — confirmed; the poll is now: assignment lookup,
  enrollment/access check, session fetch.
- `getAssignmentStatusRows` pushes aggregation into one SQL pass with window
  functions (`submissions.ts:651-700`) — O(students × problems) rows; fine.
- `shouldRecordSharedHeartbeat` advisory-lock + cleanup per heartbeat is one
  short transaction per 30 s per participant; the cleanup DELETE is bounded by
  the LIKE-prefix index pattern. Acceptable.
- Background staleness sweep (60 s unref'd interval) is two indexed UPDATEs;
  no lock contention risk found.

Confidence labels inline. No memory-growth hazards found this cycle
(`lastHeartbeatTime` is an LRU max 10k; pending queue capped at 200).

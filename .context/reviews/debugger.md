# Debugger — RPF Cycle 5 (2026-06-11)

**HEAD:** 04b8c1ec. Latent-bug surface and failure-mode hunt across the
cycle-4 changes and the anti-cheat evidence chain.

## D5-1 — Multiple false escalate flags from one deadline submit-burst (MEDIUM-HIGH, High, CONFIRMED)
Reproduction (code-trace): anti-cheat exam, monitor tab dead >90 s, student
clicks submit 4× in quick succession at the deadline. Request 1 inserts the
submission; requests 2–4 hit `submissionRateLimited`/`tooManyPendingSubmissions`
inside the transaction (`submissions/route.ts:321-340`) — but the validator
already inserted a `submission_stale_heartbeat` escalate row for EACH request
(`submissions.ts:343-392` runs before the transaction). Result: 4 escalate
flags, 1 accepted submission; the reviewer sees a fabricated pattern of
"repeated out-of-monitor submissions". Same applies to
`assignmentProblemMismatch` (flag inserted before the check at `:395`),
`canAccessProblem` 403, `judgeQueueFull` 503, and in-tx `examTimeExpired`.
Root cause: a write side-effect placed mid-validator instead of after the
accept point. Fix: probe in the validator, record in the route after the
successful insert (one flag per accepted submission, with its id).

## D5-2 — Claimed event vanishes if the page unloads mid-send (LOW-MEDIUM, Medium, LIKELY)
`anti-cheat-monitor.tsx:110-123`: claim (`savePendingEvents(rest)`) →
`await sendEvent(event)`. Unload in that window = the event exists nowhere.
Window is small (~RTT) but recurs every flush; over a semester of exams the
loss is nonzero and biased toward navigation-adjacent events. See SEC5-2 for
the recovery-slot fix.

## D5-3 — Live-absence blind spot in heartbeat-gap detection (MEDIUM, Medium → HIGH product impact, CONFIRMED)
`anti-cheat/route.ts:307-321` iterates pairs of *recorded* heartbeats only.
Two failure modes: (a) participant left 30 min ago → no trailing pair → no
gap reported, ever, until they return; (b) no UI consumes the data anyway
(see P5-1). For live exam supervision the ongoing gap is the actionable
signal. Append a synthetic boundary at DB NOW() (flag it `ongoing`) and
render it.

## D5-4 — `describeElement` TypeError on SVG copy targets (LOW, Medium, LIKELY)
`anti-cheat-monitor.tsx:289-291`: `className.split` on `SVGAnimatedString`
throws inside the copy/paste listener → that telemetry event is dropped.
Hard to hit (needs a classed SVG ancestor of an `A`/text tag target) but
trivially guarded.

## D5-5 — Flag timestamp clock-mix can misorder the evidence timeline (LOW, High, CONFIRMED)
Flag rows take app-server `new Date()` (schema default); heartbeat/event/
similarity rows take DB NOW(). With app/DB skew of a few seconds, a flag can
sort *before* the heartbeat that proves the monitor was alive, confusing the
reviewer timeline. Pass DB `now` into the flag insert.

## Hypotheses tested and CLEARED
- `startExamSession` re-fetch race → `examSessionUnavailable` (cycle-4 G4):
  route mapping confirmed to fall through to retryable 500; no
  `assignmentClosed` false verdict remains.
- Claim-loop double-send under overlapping flush triggers: `isFlushingRef` +
  per-iteration claim verified against the component tests; queue cap (200)
  bounds pathological storage.
- `extendExamSession` SQL-composed `make_interval` under concurrent PATCH:
  composes additively, no clobber.
- Heartbeat LRU dedup (`lastHeartbeatTime`) across multi-instance app: only
  used when shared realtime coordination is NOT configured; per-instance
  worst case is one extra heartbeat row per 60 s per instance — harmless.

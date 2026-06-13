# Debugger — RPF Cycle 6 (2026-06-12)

**HEAD reviewed:** 22e1510f. **Method:** failure-mode walkthroughs of the cycle-5 surface + latent-bug hunt on the interacting flows (monitor ↔ ingest ↔ probe ↔ flag; poll ↔ loadMore; token gates).

## Findings

### D6-1 — `reportEvent` direct send: tab close mid-send silently loses the event (MEDIUM, High, CONFIRMED — fired residual from cycle-5 G4)
`anti-cheat-monitor.tsx:195-225`. Repro: candidate copies problem text → `handleCopy` → `reportEvent("copy", …)` → `sendEvent` awaited with the event in NEITHER the pending queue NOR the in-flight slot → user closes the tab before the response → event gone with no trace. Cycle-5's in-flight slot only protects the *flush* path (`performFlush:129-145`); the *first* transmission of every event goes through this unprotected direct send. This is exactly the loss window the cycle-5 plan recorded as "out of AGG5-4 scope… for the next monitor pass" — that pass is now. Fix: queue-first — append to the pending queue (retries:0) synchronously, then trigger `flushPendingEvents()`; the claim loop's slot+claim ordering then covers every event. The single-flight guard + `scheduleRetryRef` already handle the "flush already running" case (backoff timer picks the event up ≤1 s later).

### D6-2 — Timeline poll-reset vs loadMore append → duplicated rows and duplicate React keys (LOW, Medium, LIKELY)
`participant-anti-cheat-timeline.tsx`: `fetchEvents` (poll, `:104-113`) unconditionally `setEvents(firstPage)` + `setOffset(firstPage.length)`; `loadMore` (`:126-144`) appends `prev => [...prev, ...page]` from an offset captured before the reset. Interleaving (poll completes while loadMore in flight) renders the same event ids twice — `TableRow key={event.id}` duplicates. The dashboard variant already reconciles; the timeline needs the seq-counter guard (see perf P6-2).

### D6-3 — Heartbeat LRU set-before-insert: one failed insert silences heartbeats for 60 s (LOW, Medium, RISK)
`anti-cheat/route.ts:139-158`. Failure scenario: pool exhaustion blip at insert time → 500 to the client → client's `sendEvent` sees 5xx → "retry" → requeued; but the server LRU already recorded the attempt, so every retry inside the 60 s window hits `shouldRecord=false` → `apiSuccess({logged:true})` while NO row exists. Worst case the participant's recorded coverage gets a 60–90 s hole through no fault of theirs (it then takes only one more lost event to cross the 90 s probe threshold at submit time). Fix: `delete` the LRU key on insert failure.

### D6-4 — Expired/orphaned token gates (shared with SEC6-1) — divergent verdicts are themselves a bug
The same user at the same instant gets: contest list 404-equivalent (list omits it), platform-mode restriction lifted/absent, but submit 201. Any support ticket arising from this state is undiagnosable without reading six call sites. Root cause and fix recorded in SEC6-1/CR6-1.

## Checked, not bugs
- `performFlush` orphan recovery cannot double-recover (slot cleared synchronously after re-queue, before any await).
- `heartbeats[i].createdAt` is a Drizzle Date; `new Date(Date)` copies safely; reverse-then-scan ordering correct; the 5000-row DESC window truncates at the OLD end, never the live end.
- `startExamSession` insert-vanish path returns `examSessionUnavailable` → generic retryable 500 (AGG4-4 still honored).
- Admin-level submit path: `now=0` short-circuits all schedule checks BUT the probe stays un-run (probe is inside `!isAdminLevel`) — admins never self-flag. Confirmed intentional per review-model doc.
- `formatAntiCheatDetails` discriminates stale payloads by `thresholdMs` number — copy/paste `{target}` payloads can't collide (string field).

## Final sweep
Walked every `setTimeout`/`setInterval` on the changed surface for leak-on-unmount: monitor timers cleared in effect cleanup (`:261-267`, `:351-366`); sweep interval unref'd and idempotent (`worker-staleness-sweep.ts:99-107`); similarity route timer cleared in `finally`. No unhandled-rejection paths found on the touched routes (flag insert has `.catch`, audit fire-and-forget is internally guarded).

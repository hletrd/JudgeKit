# Debugger (latent bug surface) — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035 (main)

## Latent failure modes found

### D2-1 — Rate-limit unique-violation on first concurrent use (CONFIRMED mechanism, Medium real-world frequency)
See code-reviewer CR2-2 / tracer Trace 3. Reproduction recipe (env-gated
integration): truncate `rate_limits`, fire two simultaneous
`consumeUserApiRateLimit(req, sameUser, "source-draft")` — one returns null,
the other throws `duplicate key value violates unique constraint`.
User-visible symptom: sporadic 500 on draft autosave / snapshot POST right
after a window reset, typically logged as "Unhandled error" with a
unique-violation cause. If you have ever seen that log line in production,
this is the mechanism.

### D2-2 — Student-side countdown desync after extension (CONFIRMED)
See verifier V2-1. Additional debugger note: the same render-time snapshot
means a student who keeps the tab open across the ORIGINAL deadline and gets
no extension also keeps an editable editor (carried ST2) — the new wrinkle
F12 adds is the inverse: a student WITH an extension sees a dead countdown.
Both resolve with the same live-refetch fix.

### D2-3 — Heartbeat dedup LRU is per-process (verified acceptable, INFO)
`anti-cheat/route.ts:17` dedups heartbeats in a process-local LRU when shared
coordination is off. Multi-instance deployments without the shared
coordinator would write up to N× heartbeats — but
`usesSharedRealtimeCoordination()` gates exactly that case and the
deployment targets run single app instances. No action; do not "fix"
speculatively.

### D2-4 — Snapshot retry loop can outlive navigation (INFO, verified bounded)
`problem-submission-form.tsx:153-171` retries up to 3 times with backoff and
checks `isMountedRef` only for the timer re-arm, not the in-flight retry
chain. Worst case after unmount: ≤2 extra fetches over ≤3 s, then the chain
dies. Harmless; noted so a future reviewer doesn't escalate it.

## Regression scan of cycle-1 diff
- `validateAssignmentSubmission` reorder: enrollment/examSession now fetched
  before the schedule checks — reject paths do one extra read (commented,
  accepted). No behavior change for non-exam flows (pinned by tests).
- `status-board.tsx` desktop cell IIFE still null-guards `examSession`
  before dereferencing `personalDeadline`. No NPE path.
- `getCatalogNumbersForIds` with an empty page returns early; `.where(undefined)`
  on the CTE is valid drizzle (= no filter) for the org-admin case. No
  runtime SQL hazard.

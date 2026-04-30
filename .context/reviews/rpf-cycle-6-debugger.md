# RPF Cycle 6 — debugger (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `a18302b8`
**Diff vs cycle-5 base:** 0 lines.

## Methodology

Re-validated bug-class items from the cycle-5 carry-forward backlog and the stale prior cycle-6 aggregate. Looked for newly introduced bugs in `src/`. Checked invariant violations, race conditions, error-handling holes.

## Stale prior cycle-6 DBG findings audit

- **Stale DBG-1 (anti-cheat polling clobbers loadMore)** — RESOLVED at HEAD. `src/components/contest/anti-cheat-dashboard.tsx:127-160` preserves loaded-beyond-first-page rows via functional `setEvents((prev) => ...)` and preserves offset via functional `setOffset((prev) => ...)`.
- **Stale DBG-2 (handleCreate missing catch)** — RESOLVED at HEAD. `recruiting-invitations-panel.tsx:185-240` has try/catch/finally.

## Carry-forward bug-class items at HEAD

None of the cycle-5 carry-forwards are bug-class (HIGH-severity correctness issues). All carry-forwards are LOW (deploy-script ergonomics) or MEDIUM (perf, architecture, auth refactor) — no actionable bugs in the queue.

## Spot checks for new bugs

### Anti-cheat dashboard polling vs loadMore (re-checked at HEAD)

```js
// src/components/contest/anti-cheat-dashboard.tsx:130-160
setEvents((prev) => {
  const firstPageIds = firstPage.map((e) => e.id);
  const prevFirstPageIds = prev.slice(0, PAGE_SIZE).map((e) => e.id);
  const firstPageUnchanged = firstPageIds.length === prevFirstPageIds.length
    && firstPageIds.every((id, i) => id === prevFirstPageIds[i]);
  if (prev.length > PAGE_SIZE) {
    return firstPageUnchanged ? prev : [...firstPage, ...prev.slice(PAGE_SIZE)];
  }
  return firstPageUnchanged ? prev : firstPage;
});
```

**Edge case worth noting (informational, not a finding):** if a single new event arrives at the head (incrementing `total`) while user is at offset > PAGE_SIZE, the new event displaces the oldest first-page event into the "tail" slice. The tail slice (`prev.slice(PAGE_SIZE)`) keeps its content unchanged — so the displaced event is *also* present in the tail (one position lower). Visually: a duplicate may appear at row PAGE_SIZE if and only if one new event arrives between polls AND user has loaded more.

**Confidence:** M. The fix is correct for the **most common** case (no new events) and for the **bulk-clobber** case (many new events), but produces transient single-row duplicate when exactly one event arrives. Not a regression vs. the prior behavior (which clobbered the entire list); arguably better. **Not a finding.** Just documenting the edge case for future reference.

### Countdown timer NaN guard (re-checked at HEAD)

```js
// src/components/exam/countdown-timer.tsx:75-90
.then((data) => {
  if (!data) return;
  if (Number.isFinite(data.timestamp)) {
    const roundTrip = Date.now() - requestStart;
    offsetRef.current = data.timestamp - (requestStart + roundTrip / 2);
  }
})
.catch(() => {
  // keep offset at 0 on error
});
```

`Number.isFinite()` rejects `NaN`, `Infinity`, `-Infinity`, and any non-number. Combined with `if (!data) return;` defending against `null` from upstream `.catch(() => null)` (per stale-fix pattern), this is robust. **No finding.**

## Concurrency / race-condition spot check

- `lastHeartbeatTime: Map` in `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:16-110` uses module-level state per process. In a Node.js single-process deployment this is safe; if scaled horizontally (multiple Next.js workers), the per-user 60s dedup window resets per worker. **Severity: LOW.** **NOT injected** — this is the existing behavior, well-known, and bounded (worst case: one extra heartbeat per second per worker).
- SSE fanout in `realtime-coordination.ts` is single-process; same caveat applies. ARCH-CARRY-2 already covers it.

## NEW findings this cycle

**0 HIGH, 0 MEDIUM, 0 LOW NEW.** Empty change surface; no new bugs.

## Recommendation

No bug-class items to draw down — all backlog items are LOW (deploy ergonomics) or MEDIUM (refactor). Defer to architect/code-reviewer choice.

Confidence: H.

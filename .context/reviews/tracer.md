# Tracer — RPF Cycle 7 (2026-06-13)

**HEAD reviewed:** 0472b007. Lens executed directly by the cycle agent (fallback per cycles 1–6).
Causal traces of the cycle's suspicious flows with competing hypotheses.

## Trace 1 — "Evidence row disappears from the proctor dashboard mid-exam"
**Observed (constructed) symptom:** an instructor watching the live anti-cheat
dashboard sees a copy/paste event, loads more, and on the next 30 s refresh
that event is gone — but it is still in the DB.
- H1 (server deleted it): rejected — anti-cheat events are append-only; no DELETE path for client events.
- H2 (filter changed): rejected — symptom reproduces with no filter change.
- **H3 (client merge seam loss): CONFIRMED.** `anti-cheat-dashboard.tsx:136-138` keeps `firstPage ++ prev.slice(PAGE_SIZE)`; when N new events push the old first-page tail below index PAGE_SIZE, the `PAGE_SIZE-N..PAGE_SIZE-1` rows fall out of both slices. Causal chain ends at the merge logic. → AGG7-1 / CR7-2 / D7-1.

## Trace 2 — "Same evidence row appears twice (React key warning in console)"
- H1 (server returned a dup): unlikely — the query is a single ordered select.
- **H2 (loadMore appends a row already in state): CONFIRMED.** `anti-cheat-dashboard.tsx:170` appends with no id-dedupe; after a poll merge shifts the server list under a preserved `offset`, the next page overlaps rendered rows. The timeline guards this (cycle-6); the dashboard does not. → AGG7-1 / D7-2.

## Trace 3 — "Recruiting candidate locked out after the instructor extended the contest"
**Symptom:** instructor pushes the deadline back to give more time; a
token-only candidate is denied at the ingest/catalog gate during the new
window.
- H1 (schedule gate denies): rejected — the schedule check uses the NEW deadline (NOW() vs assignment.deadline), which is open.
- **H2 (token validity denies on stale expiry): CONFIRMED as the mechanism.** The token's `expires_at` still holds the OLD effective close; `CONTEST_ACCESS_TOKEN_VALIDITY_SQL` (`cat.expires_at > NOW()`) is now false, so the token branch fails. Today the `enrollments` branch rescues access (both creation sites write enrollment), so the lockout is latent, not live — but for pre-cycle-6 `deadline`-stamped rows, or if enrollment is ever removed independently, it becomes a real lockout that is hard to diagnose (the token EXISTS). Causal fix: sync token expiry on schedule edit. → SEC7-1 / A7-1 / D7-3.

## Trace 4 (negative) — "Could a tab close still lose the first anti-cheat event?"
Traced the queue-first path: `reportEvent` enqueues to localStorage
synchronously (anti-cheat-monitor.tsx:224-226) BEFORE any await, then flushes.
A tab close between enqueue and flush leaves the event in `pending` →
recovered on next mount. A close mid-send leaves it in the in-flight slot →
recovered by the crash-recovery unshift (performFlush:116-122). **No loss
window remains.** Cycle-6 AGG6-2 is genuinely closed.

## Competing-hypothesis discipline
The three confirmed traces all bottom out in client-merge logic or
token-lifecycle completeness — no server-side data corruption hypothesis
survived. This points cycle-7 squarely at the paging glue and the
mutate-side token sync.

# Performance Review — RPF Cycle 38

**Date:** 2026-04-23
**Reviewer:** perf-reviewer
**Base commit:** 4dd3d951

## Inventory of Files Reviewed

- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE connection management, shared polling
- `src/lib/realtime/realtime-coordination.ts` — Shared coordination with advisory locks
- `src/lib/assignments/contest-analytics.ts` — Analytics queries
- `src/lib/data-retention-maintenance.ts` — Batched deletion
- `src/components/exam/anti-cheat-monitor.tsx` — Client-side event batching
- `src/components/exam/countdown-timer.tsx` — Timer precision
- `src/lib/plugins/chat-widget/chat-widget.tsx` — Streaming UI updates
- `src/lib/assignments/recruiting-invitations.ts` — Invitation creation

## Findings

### PERF-1: Contest analytics `entryProblemMaps` creates a Map per entry — O(n*m) memory for n entries, m problems [LOW/LOW]

**File:** `src/lib/assignments/contest-analytics.ts:125-128`

**Description:** For each analytics calculation, a new `Map` is created for every entry (participant). If there are 1000 participants and 10 problems, that's 1000 Maps with 10 entries each. This is functionally correct but could be optimized by using a single flat lookup structure.

**Concrete failure scenario:** A contest with 5000 participants and 50 problems creates 5000 Maps with 50 entries each — 250,000 Map entries total. This is a moderate allocation spike but is bounded by the contest size and is a one-time calculation.

**Fix:** Consider a single `Map<string, Map<string, ProblemResult>>` (entryId -> problemId -> result) for O(1) lookup without per-entry Map construction.

**Confidence:** Low (bounded by contest size, one-time calculation)

---

### PERF-2: Anti-cheat event retry flush reads from localStorage on every retry cycle [LOW/LOW]

**File:** `src/components/exam/anti-cheat-monitor.tsx:96-108`

**Description:** The `flushPendingEvents` function reads pending events from `localStorage`, sends each one, then writes back the remaining events. If multiple events fail and retries overlap, there's a risk of double-sending because the read-modify-write cycle is not atomic. Additionally, reading from localStorage on every retry is unnecessary I/O.

**Concrete failure scenario:** Two events fail simultaneously. Both trigger separate retry timers. Each timer's `flushPendingEvents` reads the same list, sends the same events, and writes back overlapping results. One event gets sent twice.

**Fix:** Use an in-memory queue as the primary source, with localStorage only for persistence across page reloads. Or use a single debounced flush timer instead of per-event retries.

**Confidence:** Low (practical impact is minimal — events are idempotent on the server side)

---

## Previously Deferred Items (Still Present)

- SSE O(n) eviction scan (deferred — bounded by 1000 cap)
- Shared poll timer reads config on restart (deferred)

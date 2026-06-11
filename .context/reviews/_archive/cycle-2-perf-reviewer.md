# Performance Review — Cycle 2 (Fresh)

**Base commit:** 31049465
**Reviewer:** perf-reviewer
**Focus:** Performance, concurrency, CPU/memory efficiency, DB query patterns

---

## C2-PERF-1 — 8 parallel DB queries without transaction wrapper
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/lib/assignments/participant-timeline.ts:94-184`

`getParticipantTimeline` fires 8 parallel queries via `Promise.all`. While parallelization is good for latency, the lack of a transaction means data can drift between queries (e.g., a new submission inserted between the `submissions` query and the `codeSnapshots` query). More critically, 8 concurrent queries per request can spike connection pool usage under load.

**Failure scenario:** Under high load, connection pool exhaustion causes subsequent requests to queue. Each timeline request consumes 8 connections simultaneously.

**Fix:** Wrap in a single transaction or reduce query count by joining related tables. Consider using Drizzle's relational query builder with `with` clauses.

---

## C2-PERF-2 — `hashtext()` collision in advisory lock causes cross-user blocking
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/app/api/v1/submissions/route.ts:272`

```typescript
await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${user.id})::bigint)`);
```

`hashtext()` returns a 32-bit signed integer. With a large user base, hash collisions are inevitable (birthday paradox: ~50% collision chance with ~77,000 users). When two users hash to the same value, one blocks the other unnecessarily during submission.

**Fix:** Use `hashtextextended(${user.id}, 0)::bigint` (PostgreSQL 14+) which produces a 64-bit hash, reducing collision probability to negligible levels.

---

## C2-PERF-3 — `getParticipantTimeline` re-fetches anti-cheat data that may already exist
**Severity:** LOW | **Confidence:** Medium
**File:** `src/lib/assignments/participant-timeline.ts:176-184`

Anti-cheat events are queried and aggregated in the timeline function. If the caller already has this data (e.g., from the anti-cheat dashboard), it's fetched twice.

**Fix:** Accept optional anti-cheat summary as a parameter, or memoize the query.

---

## C2-PERF-4 — Timeline bar re-computes `percentFromStart` for every render
**Severity:** LOW | **Confidence:** Medium
**File:** `src/components/contest/participant-timeline-bar.tsx:139-142`

The `percentFromStart` closure is recreated on every render. While not expensive, the `flatEvents` array is also rebuilt and re-sorted on every render even when props haven't changed.

**Fix:** Memoize `flatEvents`, `startTime`, `endTime`, and `totalDurationMs` with `useMemo`.

---

## C2-PERF-5 — `.limit(5000)` without early termination on large datasets
**Severity:** LOW | **Confidence:** Medium
**File:** `src/lib/assignments/participant-timeline.ts:163`

Fetching 5000 submission rows and then processing them all in JavaScript is memory-intensive. For a typical contest, most participants won't have this many submissions, but edge cases exist.

**Fix:** Consider streaming or chunked processing for very large result sets.

---

## C2-PERF-6 — `ParticipantTimelineView` blocks on 6 sequential translation fetches
**Severity:** LOW | **Confidence:** Medium
**File:** `src/components/contest/participant-timeline-view.tsx:54-62`

Six `getTranslations()` calls are parallelized via `Promise.all`, but each one may incur a separate filesystem read. On cold starts, this adds latency.

**Fix:** Combine related translation keys into fewer namespaces, or use a single namespace for the participant audit view.

---

## Commonly Missed Sweep

- The `submissions` API route uses cursor-based pagination for large result sets — good.
- The claim endpoint uses `FOR UPDATE SKIP LOCKED` — correct for contention reduction.
- The timeline queries use indexed columns (`assignment_id`, `user_id`) — good.

# Debugger Review — Cycle 2 (Fresh)

**Base commit:** 31049465
**Reviewer:** debugger
**Focus:** Latent bugs, failure modes, regressions, edge cases

---

## C2-DEBUG-1 — Worker capacity leak after missing problem reset
**Severity:** HIGH | **Confidence:** High
**File:** `src/app/api/v1/judge/claim/route.ts:328-341`

**Hypothesis:** When a claimed submission's problem is missing, the worker's `active_tasks` count leaks.
**Evidence:**
1. The SQL CTE `worker_bump` increments `active_tasks` (line 204-209).
2. The problem existence check is AFTER the claim (line 318-327).
3. The reset branch (line 328-341) does NOT decrement `active_tasks`.

**Failure scenario:** A problem is deleted while submissions are queued. Workers claim those submissions, get 422, and their active_tasks increments but never decrements. After repeated claims, the worker reports being at capacity and stops accepting new claims even though it's idle.

**Fix:** Decrement `active_tasks` in the reset branch, or validate problem existence BEFORE the claim CTE.

---

## C2-DEBUG-2 — `percentFromStart` can return >100% with edge dates
**Severity:** LOW | **Confidence:** Medium
**File:** `src/components/contest/participant-timeline-bar.tsx:139-142`

```typescript
function percentFromStart(at: Date) {
  const elapsed = at.getTime() - startTime.getTime();
  return Math.max(0, Math.min(100, (elapsed / totalDurationMs) * 100));
}
```

If `endTime` is computed from `participant.personalDeadline` but an event occurs AFTER the deadline (e.g., a late submission), `elapsed` exceeds `totalDurationMs` and `Math.min(100, ...)` clamps it. The function is safe.

However, if `totalDurationMs` is 1 (the minimum from line 137), then `elapsed` for any event is either 0 or >=1, so every event after start maps to exactly 100%. This means all events pile up at the far right edge.

**Failure scenario:** A participant starts an exam and immediately makes a submission. The default `endTime` is `startTime + 1 hour`, but if `personalDeadline` equals `startTime` (expired exam), `totalDurationMs = 1`, and all markers stack at 100%.

**Fix:** Add a minimum meaningful duration (e.g., 60 seconds) before clamping to 1ms.

---

## C2-DEBUG-3 — `z.coerce.number()` on `submittedAt` produces NaN for invalid strings
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/app/api/v1/judge/claim/route.ts:38`

```typescript
submittedAt: z.coerce.number().nullable(),
```

If PostgreSQL returns a non-numeric value for `submittedAt` (e.g., due to a type mismatch in the raw query), `z.coerce.number()` produces `NaN`. The code then spreads `claimed` into the API response. Downstream, the judge worker receives `NaN` as a submission timestamp, which could cause timing calculations to fail.

**Fix:** Reject NaN in schema validation.

---

## C2-DEBUG-4 — `flatEvents` key collision on identical timestamps
**Severity:** LOW | **Confidence:** Medium
**File:** `src/components/contest/participant-timeline-bar.tsx:208`

The key `${ev.problemId}-${ev.type}-${i}` uses array index. If two events from different problems have the same type and the array is reordered (e.g., due to a new submission arriving), React may misidentify elements.

**Failure scenario:** Two snapshots at the exact same millisecond for different problems. After a re-render with new data, the index-based keys shift and React reuses wrong DOM nodes.

**Fix:** Include timestamp in key.

---

## C2-DEBUG-5 — Anti-cheat event type translation fallback missing
**Severity:** LOW | **Confidence:** Medium
**File:** `src/components/contest/participant-timeline-view.tsx:293-298`

```typescript
tAntiCheat(`eventTypes.${eventType}` as Parameters<typeof tAntiCheat>[0])
```

If an unknown event type is recorded (e.g., from a future anti-cheat feature), the translation returns the raw key string instead of a human-readable label. No fallback is provided.

**Fix:** Add a fallback: `tAntiCheat(`eventTypes.${eventType}`) || eventType`.

---

## Commonly Missed Sweep

- The `toSecondsBetween` helper correctly prevents negative values.
- The `sortTimeline` correctly handles null timestamps by treating them as epoch 0.
- The `getParticipantTimeline` returns `null` for missing participants — correct.

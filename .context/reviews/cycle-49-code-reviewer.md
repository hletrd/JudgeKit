# Cycle 49 — Code Reviewer

**Date:** 2026-05-12
**HEAD reviewed:** `17a35892`
**Scope:** All changes since cycle 48 (`c1326f3a`) + full codebase sweep

---

## Findings

### C49-CODE-1: [MEDIUM] `judge/claim/route.ts` — orphaned queued submission when problem missing

**File:** `src/app/api/v1/judge/claim/route.ts:329-331`
**Confidence:** HIGH

The route was fixed to return 422 instead of 500 when a claimed submission's problem no longer exists. However, the submission remains in `status = 'queued'` with `judge_worker_id` set and `judge_claim_token` populated. No cleanup or status reversion happens. The submission will be stuck in queued state until the stale claim timeout expires, at which point another worker will claim it and encounter the same 422 error. This creates a claim-failure loop for orphaned submissions.

**Fix:** Before returning 422, reset the submission status to `'pending'` (or `'failed'`) and clear the claim fields so it doesn't keep getting re-claimed:

```typescript
if (!problem) {
  await db.update(submissions)
    .set({ status: 'pending', judge_worker_id: null, judge_claim_token: null })
    .where(eq(submissions.id, claimed.id));
  return apiError("problemNotFound", 422);
}
```

---

### C49-CODE-2: [LOW] `participant-timeline-bar.tsx` — `formatDuration` lacks hour formatting

**File:** `src/components/contest/participant-timeline-bar.tsx:142-146`
**Confidence:** HIGH

```typescript
function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
```

For contests lasting > 60 minutes, this displays "125m 30s" instead of "2h 5m 30s". This is used in both the timeline axis label and the tooltip relative-time display.

**Fix:** Add hour formatting:
```typescript
function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
```

---

### C49-CODE-3: [LOW] `participant-timeline-view.tsx` — mixed Date/number types with non-null assertion

**File:** `src/components/contest/participant-timeline-view.tsx:216-224`
**Confidence:** HIGH

```tsx
{timeline?.summary.firstAcAt ?? ranking?.firstAcAt ? (
  formatDateTimeInTimeZone(
    new Date(
      (timeline?.summary.firstAcAt ?? ranking?.firstAcAt)!
    ),
    locale,
    timeZone
  )
) : (
  "-"
)}
```

`timeline?.summary.firstAcAt` is `Date | null` while `ranking?.firstAcAt` is `number | null` (epoch ms). Both work in `new Date()` but mixing types is fragile. The `!` non-null assertion is unnecessary because the ternary already guarantees non-null.

**Fix:** Normalize before constructing Date:
```typescript
const firstAcTimestamp = timeline?.summary.firstAcAt ?? ranking?.firstAcAt;
// ...
firstAcTimestamp ? formatDateTimeInTimeZone(
  typeof firstAcTimestamp === 'number' ? new Date(firstAcTimestamp) : firstAcTimestamp,
  locale, timeZone
) : "-"
```

---

### C49-CODE-4: [LOW] `participant-timeline-bar.tsx` — bare index as React key in mini timeline

**File:** `src/components/contest/participant-timeline-bar.tsx:324-325`
**Confidence:** MEDIUM

```tsx
{problemEvents.map((ev, i) => {
  // ...
  return (
    <div key={i} ...>
```

The per-problem mini timeline uses bare array index as React key. While this is scoped to a single problem's events, using a composite key with the event type and timestamp would be more stable.

**Fix:** Use a composite key: `key={`${ev.type}-${ev.at?.getTime() ?? i}-${i}`}`

---

### C49-CODE-5: [LOW] `participant-timeline.ts` — submissions query has no LIMIT

**File:** `src/lib/assignments/participant-timeline.ts:149-162`
**Confidence:** MEDIUM

The submissions query for a participant's timeline fetches all submissions for an assignment without a LIMIT:
```typescript
db.select({...}).from(submissions)
  .where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.userId, userId)))
  .orderBy(asc(submissions.submittedAt))
```

In a long contest with many submissions, this could return thousands of rows. The snapshot query already has `.limit(1000)` but submissions don't.

**Fix:** Add `.limit(5000)` or similar reasonable cap, and document what happens when the limit is exceeded.

---

## Verified Fixes (cycle 48 and earlier)

- **AGG-1 (cycle 48)**: `analytics/route.ts` thundering-herd bug — FIXED. Uses `Date.now()` for staleness check and `Date.now()` in catch block.
- **AGG-2 (cycle 48)**: `anti-cheat-monitor.tsx` retry duplication — FIXED. Uses `scheduleRetryRef` pattern.
- **AGG-3 (cycle 48)**: `proxy.ts` hardcoded cookie names — FIXED. Uses `getAuthSessionCookieNames()`.
- All prior cycle fixes (C1 through C48) verified intact.

---

## No Agent Failures

Single-agent comprehensive review (subagent fan-out unavailable).

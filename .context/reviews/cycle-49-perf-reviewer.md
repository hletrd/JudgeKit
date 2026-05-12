# Cycle 49 — Performance Reviewer

**Date:** 2026-05-12
**HEAD reviewed:** `17a35892`
**Scope:** Performance analysis of changes since cycle 48

---

## Findings

### C49-PERF-1: [LOW] `participant-timeline-bar.tsx` — O(n log n) computation on every render

**File:** `src/components/contest/participant-timeline-bar.tsx:89-127`
**Confidence:** MEDIUM

The component:
1. Iterates all assignment problems and their timeline events (O(n))
2. Sorts flatEvents by timestamp (O(n log n))
3. Re-computes percentFromStart for every event marker and mini-timeline dot (O(n))

With typical usage (hundreds of events), this is negligible on the server. But for contestants with thousands of submissions/code snapshots, the sorting and repeated Date arithmetic could add latency to the timeline page render.

**Mitigation:** The parent `getParticipantTimeline` already limits snapshots to 1000. Adding a similar limit to submissions (see C49-CODE-5) would bound the worst case.

---

### C49-PERF-2: [LOW] `participant-timeline-view.tsx` — redundant Map construction

**File:** `src/components/contest/participant-timeline-view.tsx:65-71`
**Confidence:** LOW

```typescript
const timelineByProblem = new Map(
  timelineProblems.map((problem) => [problem.problemId, problem])
);
const problemRankingMap = new Map(
  auditData?.entry.problems.map((p) => [p.problemId, p]) ?? []
);
```

Both Maps are constructed from arrays that are already available. This is O(n) and not a real performance concern, but the `timelineByProblem` Map is also reconstructed inside `ParticipantTimelineBar` (line 93-95). The data could be passed pre-mapped to avoid double construction.

**Fix:** Pass `timelineByProblem` directly from parent to child, or accept it as a prop in `ParticipantTimelineBar` instead of re-mapping.

---

### C49-PERF-3: [LOW] `contest-scoring.ts` — `Date.now()` / `getDbNowMs()` mixing in cache

**File:** `src/lib/assignments/contest-scoring.ts:101-151`
**Confidence:** LOW

The cache uses `Date.now()` for staleness checks (client clock) but `getDbNowMs()` for cache-write timestamps (DB clock). The comment explains this is intentional and the 15s staleness tolerance absorbs 1-2s clock skew. This is a known trade-off documented in the code. No action needed unless clock skew exceeds ~10s in production.

**Status:** Already deferred as DEFER-51 in prior aggregates. Remains LOW priority.

---

## No New MEDIUM/HIGH Performance Findings

The analytics route cache was fixed (cycle 48 AGG-1). The anti-cheat retry deduplication was fixed (cycle 48 AGG-2). No new N+1 queries, missing pagination, or unbounded memory growth detected.

---

## No Agent Failures

Single-agent comprehensive review (subagent fan-out unavailable).

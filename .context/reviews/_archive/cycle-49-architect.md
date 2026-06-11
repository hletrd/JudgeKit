# Cycle 49 — Architect

**Date:** 2026-05-12
**HEAD reviewed:** `17a35892`
**Scope:** Architectural and design risk analysis

---

## Findings

### C49-ARCH-1: [LOW] Timeline component receives large translations prop object

**File:** `src/components/contest/participant-timeline-bar.tsx:49-76`
**Confidence:** LOW

The `ParticipantTimelineBar` receives translations as an inline object with 11 properties including functions:
```typescript
translations: {
  noSubmissions: string;
  pointsValue: (value: number) => string;
  attempts: (count: number) => string;
  // ... 9 more
}
```

This is a server-to-server component prop, so serialization is not an issue. But the pattern of passing translation functions as props creates tight coupling between the parent and child. If a new translation is needed, both files must change.

**Alternative:** Pass the `t` function (or a scoped translator) directly and let the component use translation keys internally. This is the pattern used elsewhere in the codebase.

**Assessment:** LOW. The current approach works and is type-safe. The coupling is within the same feature module.

---

### C49-ARCH-2: [LOW] `participant-timeline.ts` mixes data fetching with presentation logic

**File:** `src/lib/assignments/participant-timeline.ts`
**Confidence:** LOW

The `getParticipantTimeline` function:
1. Fetches raw data from 8 DB queries
2. Computes derived metrics (bestScore with late penalties, wrongBeforeAc count)
3. Sorts and structures events for display

This combines data access, business logic, and presentation structuring in one function. The late penalty calculation duplicates logic from `contest-scoring.ts` (SQL-level) and `mapSubmissionPercentageToAssignmentPoints`.

**Assessment:** LOW. The function is ~320 lines but well-organized. The duplication is documented and intentional ("consistency with the leaderboard").

---

### C49-ARCH-3: [LOW] `judge/claim` raw SQL is complex and hard to test

**File:** `src/app/api/v1/judge/claim/route.ts:152-251`
**Confidence:** LOW

The claim SQL is a 100-line CTE chain with `FOR UPDATE SKIP LOCKED`, worker capacity gating, and stale claim detection. This is inherently complex and cannot be easily unit tested without a full PostgreSQL instance.

**Mitigation:** The integration test suite covers the claim flow end-to-end. The SQL is well-commented. No structural issue.

---

## No MEDIUM/HIGH Architectural Risks

The overall architecture remains sound:
- Server Components for data fetching + Client Components for interactivity
- API handlers wrapped in `createApiHandler` for consistent auth/rate-limit/error handling
- Drizzle ORM for type-safe queries, raw SQL only where CTEs/locking are needed
- LRU caches with stale-while-revalidate pattern (now correctly implemented in both scoring and analytics)

---

## No Agent Failures

Single-agent comprehensive review (subagent fan-out unavailable).

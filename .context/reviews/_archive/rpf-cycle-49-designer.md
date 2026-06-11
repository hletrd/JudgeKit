# Cycle 49 — Designer

**Date:** 2026-04-23
**Base commit:** b6daa282

## Findings

### DES-1: ICPC leaderboard visual flicker on ties [LOW/LOW]

**File:** `src/lib/assignments/contest-scoring.ts:346-357`

**Description:** When ICPC users are tied on all sort criteria, non-deterministic sort order can cause visual flicker on the leaderboard between page loads or re-renders. This is a UX polish issue rather than a functional bug.

**Fix:** Add `userId` tie-breaker for deterministic ordering (matches the IOI fix from cycle 46).

---

### DES-2: Anti-cheat privacy notice accessibility — carry-over [LOW/LOW]

**File:** `src/components/exam/anti-cheat-monitor.tsx:261`

**Status:** Already deferred from cycle 48. Requires manual keyboard testing.

---

### DES-3: Chat widget button badge lacks ARIA announcement — carry-over [LOW/LOW]

**Status:** Already deferred from prior cycles.

---

### DES-4: Contests page badge hardcoded colors — carry-over [LOW/LOW]

**Status:** Already deferred from cycle 46.

---

## Sweep Notes

No new UI/UX findings beyond the ICPC tie-breaker, which is primarily a code-quality/consistency issue with a minor UX impact.

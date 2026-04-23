# Security Review — RPF Cycle 44

**Date:** 2026-04-23
**Reviewer:** security-reviewer
**Base commit:** e2043115

## Inventory of Files Reviewed

- `src/lib/assignments/submissions.ts` — Assignment submission validation (clock-skew analysis)
- `src/lib/assignments/leaderboard.ts` — Leaderboard freeze logic
- `src/lib/realtime/realtime-coordination.ts` — SSE connection management
- `src/app/api/v1/judge/claim/route.ts` — Judge claim (Date.now usage)
- `src/lib/security/rate-limit.ts` — In-memory rate limiting
- `src/lib/security/api-rate-limit.ts` — API rate limiting
- `src/lib/security/in-memory-rate-limit.ts` — In-memory rate limiting
- `src/lib/auth/config.ts` — Auth configuration
- `src/proxy.ts` — Auth proxy cache
- `src/lib/docker/client.ts` — Docker client (env var handling)

## Previously Fixed Items (Verified)

- Submission route rate-limit uses `getDbNowUncached()`: PASS
- Contest join route explicit `auth: true`: PASS
- Access-code capability auth: PASS
- LIKE pattern escaping: PASS

## New Findings

### SEC-1: `validateAssignmentSubmission` uses `Date.now()` for deadline enforcement — clock-skew allows post-deadline submissions [MEDIUM/MEDIUM]

**File:** `src/lib/assignments/submissions.ts:208-226,268`

**Description:** The submission validation function compares app-server `Date.now()` against DB-stored assignment deadlines (`startsAt`, `deadline`, `lateDeadline`, `examSession.personalDeadline`). This is the same clock-skew class previously fixed in the assignment PATCH route and submission rate-limit. The difference is this is a more impactful boundary: it controls whether users can submit at all, not just rate-limiting.

**Concrete failure scenario:** App server clock is 60 seconds behind DB. A contest with a deadline of 10:00:00 (DB time) will still accept submissions until 10:01:00 DB time, because the app server doesn't see the deadline as passed until its clock reaches 10:00:00. Users gain 60 extra seconds to submit solutions.

**Fix:** Use `getDbNowUncached()` for all deadline comparisons in `validateAssignmentSubmission`.

**Confidence:** Medium

---

### SEC-2: `leaderboard.ts` freeze check uses `Date.now()` — freeze boundary is approximate [LOW/LOW]

**File:** `src/lib/assignments/leaderboard.ts:52-53`

**Description:** The leaderboard freeze decision compares `Date.now()` against the DB-stored `freezeLeaderboardAt` timestamp. Under clock skew, the freeze boundary is slightly inaccurate. This is a display-only concern — the frozen leaderboard data itself is correct. Students might see the leaderboard frozen slightly early or late (seconds).

**Fix:** Low priority — use `getDbNowUncached()` for consistency if the function is refactored.

**Confidence:** Low

---

### Carry-Over Items

- **SEC-2 (from cycle 43):** Anti-cheat heartbeat dedup uses `Date.now()` for LRU cache (LOW/LOW, deferred — approximate by design)
- **Prior SEC-3:** Anti-cheat copies text content (LOW/LOW, deferred)
- **Prior SEC-4:** Docker build error leaks paths (LOW/LOW, deferred)

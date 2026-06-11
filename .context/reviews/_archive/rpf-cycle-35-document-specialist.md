# RPF Cycle 35 — Document Specialist

**Date:** 2026-04-23
**Base commit:** 218a1a93

## DOC-1: Import route JSDoc does not mention deprecated JSON body path [LOW/MEDIUM]

**File:** `src/app/api/v1/admin/migrate/import/route.ts`

**Description:** The route has no module-level JSDoc or inline documentation explaining the dual-path behavior (multipart vs JSON body). The deprecation comment at line 113 is a `logger.warn` call, not a structural documentation entry. Developers reading only the route handler signature would not know about the deprecated path or its planned removal timeline.

**Fix:** Add a JSDoc block above the `POST` function documenting both paths, the deprecation status, and the planned removal date.

**Confidence:** MEDIUM

---

## DOC-2: Contest stats endpoint JSDoc mentions leaderboard but not the double-scan concern [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:1-18`

**Description:** The endpoint has excellent documentation (lines 1-18) explaining the stats returned, access control, and rate limit. However, it does not mention the performance characteristics or the fact that the query scans the submissions table twice. This could be useful for future maintainers considering optimization.

**Fix:** Add a brief note about the query structure in the comments.

**Confidence:** LOW

---

## DOC-3: Anti-cheat event types documented in code but not in user-facing docs [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:19-26`

**Description:** The `CLIENT_EVENT_TYPES` array defines the event types, but there is no documentation about what each event type means or when it is triggered. The privacy notice dialog lists high-level categories but not the specific `eventType` strings. This makes it harder for instructors to interpret the anti-cheat dashboard.

**Fix:** Add a comment block above `CLIENT_EVENT_TYPES` explaining each event type.

**Confidence:** LOW

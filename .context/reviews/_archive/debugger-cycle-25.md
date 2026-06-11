# Debugger — Cycle 25

**Date:** 2026-04-24
**Scope:** Latent bug surface and failure mode analysis

---

## D-1: [MEDIUM] Windowed-exam late-penalty divergence in `getAssignmentStatusRows` — confirmed latent bug

**Confidence:** HIGH
**Citations:** `src/lib/assignments/submissions.ts:568-578`

Traced the execution path for a windowed exam with late penalty:
1. Instructor opens assignment status page
2. `getAssignmentStatusRows` runs the SQL CTE
3. The inline CASE only checks `s.submitted_at > @deadline::timestamptz`
4. For windowed exams where `@examMode::text != 'windowed'` is FALSE, the first branch is skipped
5. The ELSE branch returns the unpenalized score
6. Student sees a higher score on the status page than on the leaderboard

This is a confirmed latent bug, not a theoretical risk. It manifests for every windowed exam that has a late penalty and a student who submitted after their personal deadline but before the global deadline.

**Failure mode:** Instructor relies on the status page to monitor student progress during a windowed exam. The status page shows unpenalized scores, while the leaderboard shows penalized scores. The instructor may make incorrect decisions based on the wrong data (e.g., not intervening with a student who appears to be doing well but is actually submitting late).

**Fix:** Replace inline CASE with `buildIoiLatePenaltyCaseExpr()`, add LEFT JOIN to exam_sessions.

---

## D-2: [LOW] SSE connection tracking cleanup timer uses `Date.now()` — potential stale connection accumulation under clock adjustments

**Confidence:** LOW
**Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:90-111, 358`

The SSE connection tracking uses `Date.now()` for both `createdAt` timestamps and the cleanup timer's `now` comparison. If the system clock is adjusted backwards (NTP correction), connections created just before the adjustment could have a `createdAt` in the "future" relative to the cleanup timer's `now`, causing them to never be cleaned up until the clock catches up. This is a minor issue because NTP adjustments are typically small (milliseconds to seconds) and the stale threshold is 30+ minutes.

**Fix:** Low priority — the stale threshold is large enough to absorb minor clock adjustments.

---

## Positive Observations

- SSE error handling is thorough: connection slot release on both success and error paths
- Shared poll timer properly cleans up when no subscribers remain
- Request abort signal is properly listened to in the SSE stream

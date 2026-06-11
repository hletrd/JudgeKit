# Cycle 20 Comprehensive Deep Code Review

**Date:** 2026-04-19
**Reviewer:** Multi-angle review (code quality, security, performance, architecture, correctness, data integrity, UI/UX)
**Base commit:** 486d056f

---

## Findings

### F1: `computeSingleUserLiveRank` IOI branch missing windowed exam mode late penalty — rank uses different scoring than main leaderboard
- **File**: `src/lib/assignments/leaderboard.ts:150-186`
- **Severity**: HIGH
- **Confidence**: HIGH
- **Description**: The IOI branch of `computeSingleUserLiveRank` computes `total_score` per user by summing `ROUND((LEAST(GREATEST(s.score, 0), 100) / 100.0 * COALESCE(ap.points, 100))::numeric, 2)`. This query does NOT join `exam_sessions` and does NOT apply the windowed exam mode late penalty case. Compare with `contest-scoring.ts:151-182` which joins `LEFT JOIN exam_sessions es ON es.assignment_id = s.assignment_id AND es.user_id = s.user_id` and includes a `WHEN @examMode::text = 'windowed' AND @latePenalty::double precision > 0 AND personal_deadline IS NOT NULL AND submitted_at IS NOT NULL AND submitted_at > personal_deadline` branch.

  The result: for IOI contests with `examMode = 'windowed'` and a non-zero `latePenalty`, a student who submits after their personal deadline will have their live rank computed using the raw score (no penalty), while the main leaderboard applies the penalty. The student sees a live rank that does not match their actual position on the leaderboard.

- **Concrete failure scenario**: An IOI contest with windowed exam mode and a 20% late penalty. A student submits after their personal deadline. Their raw score is 100, adjusted score on the leaderboard is 80. Their live rank badge (shown when the leaderboard is frozen) says #1 because the live rank query used raw 100, but the main leaderboard has them at #5 after penalty adjustment. The student is confused by the discrepancy.

- **Fix**: In the IOI branch SQL query in `computeSingleUserLiveRank`, add a `LEFT JOIN exam_sessions es ON es.assignment_id = s.assignment_id AND es.user_id = s.user_id` and add the same windowed late penalty CASE logic from `contest-scoring.ts`. The query parameters already include `examMode` and `latePenalty` — only the join and CASE branch are missing.

### F2: `participant-timeline.ts` `wrongBeforeAc` counts submissions after first AC for IOI when multiple submissions have score >= problemPoints
- **File**: `src/lib/assignments/participant-timeline.ts:216-225`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The `wrongBeforeAc` calculation at line 216-225 filters `submission !== firstAccepted && !isFirstAc(submission)`. For IOI, `isFirstAc` checks `score >= problemPoints`. If a student has multiple submissions that achieve full score, only the first one is marked as `firstAccepted`. The remaining full-score submissions are counted as "wrong before AC" even though they also solved the problem. This inflates the `wrongBeforeAc` count for IOI contests.

  However, the `submission.submittedAt < firstAccepted.submittedAt` timestamp check should filter these out since later full-score submissions happen AFTER the first one, not before. On closer inspection, the condition `submission !== firstAccepted && !isFirstAc(submission) && submittedAt < firstAccepted.submittedAt` means only submissions that are NOT full-score AND that happened before the first full-score submission are counted. The check `!isFirstAc(submission)` ensures that later full-score submissions are excluded from the wrong count. This is actually correct — the logic works as intended.

- **Reclassified**: No issue found on deeper analysis. The `!isFirstAc(submission)` guard prevents full-score submissions from being counted as "wrong".

### F3: `code-similarity.ts` `runAndStoreSimilarityCheck` deletes then re-inserts all similarity events — brief window with zero events
- **File**: `src/lib/assignments/code-similarity.ts:417-429`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The function deletes all `code_similarity` events for the assignment, then inserts the new ones, all within a transaction. During the transaction, a concurrent read query could see zero similarity events (depending on isolation level). In PostgreSQL's default READ COMMITTED, the delete is visible to the same transaction immediately but not to other transactions until commit. Since this is wrapped in `db.transaction()`, the delete+insert is atomic from the perspective of other transactions — they'll either see the old events or the new events, never zero. This is actually safe.

- **Reclassified**: No issue found on deeper analysis. The transaction ensures atomicity.

### F4: Chat widget route uses `as unknown as NextResponse` cast for streaming responses — type safety bypass
- **File**: `src/app/api/v1/plugins/chat-widget/chat/route.ts:95,377,481`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The chat widget route returns `new Response(...)` (the Web API Response) cast to `NextResponse` via `as unknown as NextResponse`. This is because `createApiHandler` expects the handler to return `NextResponse`, but streaming responses use the raw `Response` constructor for `ReadableStream` support. The cast works at runtime because Next.js treats `Response` and `NextResponse` interchangeably for route handlers, but it bypasses TypeScript's type checking. If a future Next.js version adds methods to `NextResponse` that don't exist on `Response`, this would silently fail.

- **Concrete failure scenario**: No runtime issue currently. The cast is a code smell but not a bug.

- **Fix**: Either (a) change `createApiHandler`'s handler return type to `NextResponse | Response` (wider type), or (b) use `NextResponse.json()` for non-streaming responses and document that streaming handlers should not use `createApiHandler`. Option (a) is the least disruptive. This is tracked in existing plan 019 item 1.

### F5: `contest-analytics.ts` `firstAcMap` query uses `ROUND(s.score, 2) = 100` — misses IOI submissions with score exactly 100.00 that were late-penalized
- **File**: `src/lib/assignments/contest-analytics.ts:181`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The `firstAcMap` query filters `ROUND(s.score, 2) = 100` to find first AC submissions. For IOI contests, this checks the raw submission score. However, if a late penalty is applied, the adjusted score would be less than 100. The comment at lines 168-176 already documents this behavior — "first AC" here means "first full raw score", not "first full adjusted score". This is intentional and documented, but the solve timeline chart may show an "AC" event for a student whose leaderboard-adjusted score is not full score.

- **Concrete failure scenario**: In an IOI contest with a 10% late penalty, a student submits after the deadline and gets raw score 100. The analytics timeline shows this as an "AC" event (first AC). The leaderboard shows the student at 90 adjusted score. An instructor comparing the timeline and leaderboard may be confused, but the existing documentation explains the discrepancy.

- **Fix**: Already documented. No action needed beyond the existing comment.

### F6: `LeaderboardTable` `entry.liveRank` only shown for `entry.isCurrentUser` — `isCurrentUser` flag may not be set by the API
- **File**: `src/components/contest/leaderboard-table.tsx:380-386`
- **Severity**: MEDIUM
- **Confidence**: MEDIUM
- **Description**: The leaderboard table shows the live rank badge only when `data.frozen && entry.isCurrentUser && entry.liveRank != null`. The `isCurrentUser` field is a client-side property on `LeaderboardEntry` that must be set by the API route that serves the leaderboard data. If the API does not set `isCurrentUser: true` for the current user's entry, the live rank badge will never appear. The table also checks `currentUserId && entry.userId === currentUserId` for the row highlight (line 366), which is a separate check. The live rank badge depends solely on `entry.isCurrentUser`, not on the `currentUserId` prop match.

  Looking at the leaderboard table component, there are TWO ways a row can be identified as the current user: (1) `entry.isCurrentUser` from the API, and (2) `currentUserId && entry.userId === currentUserId` from the component props. The row highlighting uses BOTH (OR), but the live rank badge only uses `entry.isCurrentUser`. If the API doesn't set `isCurrentUser`, the row will be highlighted (via `currentUserId`) but the live rank badge won't appear.

- **Concrete failure scenario**: A student views a frozen leaderboard. Their row is highlighted (correct). But the "Live Rank: #5" badge does not appear below their rank number, even though the API returned `liveRank: 5` for their entry. The student must scroll through the frozen leaderboard to estimate their actual position.

- **Fix**: Change the live rank badge condition to also check `currentUserId`: `data.frozen && (entry.isCurrentUser || (currentUserId && entry.userId === currentUserId)) && entry.liveRank != null`. This makes the live rank badge condition consistent with the row highlight condition.

---

## Verified Safe (No Issue)

### VS1: Cycle 19 fixes are correctly implemented
- **Files**: `leaderboard.ts`, `contest-analytics.ts`, `participant-timeline.ts`, `leaderboard-table.tsx`
- **Description**: All four fixes from cycle 19 (M1, L2, L3, L4) have been correctly implemented:
  - M1: `computeSingleUserLiveRank` returns `null` when user has no submissions
  - L2: `participant-timeline.ts` uses score-based first AC detection for IOI (`score >= problemPoints`)
  - L3: `leaderboard-table.tsx` pre-builds `entryProblemMap` for O(1) lookup
  - L4: `code-similarity.ts` `new Date()` clock skew — already deferred as A19

### VS2: `contest-scoring.ts` windowed exam mode late penalty is correctly implemented
- **Files**: `src/lib/assignments/contest-scoring.ts:151-182`
- **Description**: The main leaderboard scoring query correctly handles both non-windowed (global deadline) and windowed (personal_deadline) late penalties. The `LEFT JOIN exam_sessions` provides the `personal_deadline` column needed for the windowed case.

### VS3: `recruiting-invitations.ts` bcrypt-to-argon2 rehash on re-entry is correctly implemented
- **Files**: `src/lib/assignments/recruiting-invitations.ts:375-389`
- **Description**: When a recruiting candidate re-enters the contest, `verifyPassword` is called which returns `needsRehash` for bcrypt hashes. If true, the password is rehashed with argon2id and updated in the same transaction.

### VS4: Encryption key handling is safe
- **Files**: `src/lib/security/encryption.ts`
- **Description**: Production throws if `NODE_ENCRYPTION_KEY` is missing. The dev-only fallback key is clearly documented as insecure. The `decrypt` function has a plaintext fallback for pre-encryption data that checks `!encoded.startsWith("enc:")` — this is necessary for backward compatibility.

### VS5: SSE connection tracking with per-user counts is correctly maintained
- **Files**: `src/app/api/v1/submissions/[id]/events/route.ts:29-63`
- **Description**: `addConnection` increments the user count, `removeConnection` decrements it and deletes the key when it reaches 0. The stale cleanup timer correctly calls `removeConnection`. The shared coordination path (PostgreSQL) uses advisory locks for atomicity.

---

## Previously Deferred Items (Still Active)

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| A19 | `new Date()` clock skew risk | LOW | Deferred -- only affects distributed deployments with unsynchronized clocks |
| A7 | Dual encryption key management | MEDIUM | Deferred -- consolidation requires migration |
| A12 | Inconsistent auth/authorization patterns | MEDIUM | Deferred -- existing routes work correctly |
| A2 | Rate limit eviction could delete SSE slots | MEDIUM | Deferred -- unlikely with heartbeat refresh |
| A17 | JWT contains excessive UI preference data | LOW | Deferred -- requires session restructure |
| A25 | Timing-unsafe bcrypt fallback | LOW | Deferred -- bcrypt-to-argon2 migration in progress |
| A26 | Polling-based backpressure wait | LOW | Deferred -- no production reports |
| L2(c13) | Anti-cheat LRU cache single-instance limitation | LOW | Deferred -- already guarded by getUnsupportedRealtimeGuard |
| L5(c13) | Bulk create elevated roles warning | LOW | Deferred -- server validates role assignments |
| D16 | `sanitizeSubmissionForViewer` unexpected DB query | LOW | Deferred -- only called from one place, no N+1 risk |
| D17 | Exam session `new Date()` clock skew | LOW | Deferred -- same as A19 |
| D18 | Contest replay top-10 limit | LOW | Deferred -- likely intentional, requires design input |

# RPF Cycle 28 — Tracer Report

**Reviewer:** tracer
**Date:** 2026-04-23
**Base commit:** ca62a45d
**Scope:** Causal tracing of suspicious flows with competing hypotheses across five domains

---

## Executive Summary

Causal tracing across five flow domains (auth, SSE/realtime, judge pipeline, data mutations, contest state transitions) identified **21 confirmed or likely findings**. The most critical are: (1) `proxy.ts` is dead middleware, disabling CSP nonces, mustChangePassword enforcement, and session cleanup; (2) a status-string mismatch between the canonical `SubmissionStatus` type and the `SUBMISSION_STATUSES` validation list causes judge results to be rejected or submissions to be invisible to scoring; (3) clock skew between app-server and DB time creates inconsistent late-submission enforcement; (4) rejudge during active judging permanently inflates the worker `activeTasks` counter; (5) score overrides are not reflected in the leaderboard.

---

## Domain 1: Auth Flows

### A1 — CRITICAL: proxy.ts Is Dead Middleware

**File:** `src/proxy.ts` (340 lines), `src/app/layout.tsx:97`
**Confidence:** High

`src/middleware.ts` was deleted in commit `6bc64eef`. The replacement `src/proxy.ts` exports a function named `proxy` instead of `middleware` and is not recognized by Next.js. No code imports it. The middleware manifest is empty.

**Hypothesis A:** proxy.ts was intended to replace middleware.ts but was never properly wired. **Confirmed** — proxy.ts received active bug fixes after middleware.ts was deleted, and its CSP nonce is consumed by RootLayout at `layout.tsx:97` (reading `x-nonce` header that is never set).

**Hypothesis B:** It was deliberately abandoned and layout-level auth is the intended enforcement. **Ruled out** — no layout or page-level code replicates the five proxy functions.

**Five disabled functions:**
1. CSP nonce generation (degrades CSP from nonce-based to origin-only)
2. `mustChangePassword` enforcement before page load
3. Invalid session cookie cleanup (`clearAuthSessionCookies`)
4. User-Agent mismatch auditing
5. Dynamic HSTS adjustment based on `x-forwarded-proto`

**Concrete failure:** Any user with `mustChangePassword = true` can access the full dashboard without changing their password. The CSP is weaker than designed. Stale session cookies are never cleaned up.

**Fix:** Create `src/middleware.ts`: `export { proxy as middleware } from "./proxy"; export { config } from "./proxy";`

---

### A2 — MEDIUM-HIGH: Dashboard Layout Skips mustChangePassword Check

**File:** `src/app/(dashboard)/layout.tsx:31-32`
**Confidence:** High

The layout only checks `if (!session?.user) redirect("/login")`. It never checks `session.user.mustChangePassword`. The proxy middleware (if running) would redirect to `/change-password`, but without it, no enforcement exists at any level. No grep evidence of mustChangePassword checks in any dashboard page or component.

**Fix:** Add after the auth check: `if (session.user.mustChangePassword) redirect("/change-password");`

---

### A3 — MEDIUM: CSP Degraded From Nonce-Based to Origin-Only

**File:** `src/proxy.ts:186-204` (intended), `next.config.ts:86-98` (actual)
**Confidence:** High

The static CSP in next.config.ts uses `script-src 'self'` without nonces. The intended CSP from proxy.ts uses `script-src 'self' 'nonce-<value>'`. Without the proxy running, all pages get the weaker static CSP. This is a direct consequence of A1.

**Fix:** Same as A1 — wire proxy.ts as active middleware.

---

### A4 — LOW: Auth Cache Window in Proxy (if activated)

**File:** `src/proxy.ts:19-27`
**Confidence:** Low

The proxy caches auth user lookups for up to 2 seconds (`AUTH_CACHE_TTL_MS`). A revoked user could pass the proxy check within this window. The JWT callback at `config.ts:391-404` provides a second enforcement layer. Negative results (user not found / inactive) are NOT cached. Acceptable trade-off.

---

## Domain 2: SSE Connection Lifecycle

### S1 — MEDIUM: SSE `status` Events Emitted But Never Consumed

**File:** `src/hooks/use-submission-polling.ts:136-148`, `src/app/api/v1/submissions/[id]/events/route.ts:352`
**Confidence:** Medium

The server emits `event: status` with the current judge status string on every poll tick, but the client hook only registers listeners for `result` and `timeout`. The `status` event is silently discarded by the browser's EventSource (unhandled named events are not dispatched to `onmessage`).

**Hypothesis A:** The `status` event was designed for UI feedback but the client never wired a listener. **Moderate evidence** — the server explicitly sends it; the client has no handler.

**Hypothesis B:** The `status` event is redundant because the submission detail page polls `/queue-status` separately. **Moderate evidence** — the separate 5s poll at `submission-detail-client.tsx:131` covers the same use case.

**Concrete failure:** 500 concurrent SSE connections each trigger a DB poll + `status` event emission every 2 seconds — 250 wasted `enqueue` calls per second with zero client benefit.

**Fix:** Add `es.addEventListener("status", ...)` handler or remove server-side `status` emission.

---

### S2 — MEDIUM-HIGH: Shared Coordination Slot Leak on Fire-and-Forget Release

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:292-293`, `src/lib/realtime/realtime-coordination.ts:134-136`
**Confidence:** Medium-High

When the SSE stream closes, `void releaseSharedSseConnectionSlot(sharedConnectionKey)` discards the Promise. If the DB delete fails (transient outage), the slot row persists in `rate_limits` until `blockedUntil` expires (~5.5 minutes). The compensating cleanup at acquisition time (`realtime-coordination.ts:92-97`) only cleans expired entries, so slots that haven't expired yet remain occupied.

**Concrete failure:** During a PostgreSQL restart, 200 SSE connections close simultaneously. All 200 release calls fail silently. For 5.5 minutes, 200 slots are "occupied," reducing the 500-slot global ceiling to 300.

**Fix:** Wrap `releaseSharedSseConnectionSlot` in try/catch with retry. Add a scheduled cleanup for orphaned shared-coordination rows.

---

### S3 — MEDIUM-HIGH: Per-User Connection Limits Are Per-Process When Shared Coordination Is Disabled

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:26-29`, `src/lib/realtime/realtime-coordination.ts:28`
**Confidence:** Medium-High

Connection tracking uses process-local in-memory data structures. If `REALTIME_SINGLE_INSTANCE_ACK=1` is set while running multiple instances, per-user limits are enforced per-process. A user with a 5-connection limit can open 5 connections per instance, exceeding the intended limit.

**Concrete failure:** 3 Next.js instances behind a load balancer with `REALTIME_SINGLE_INSTANCE_ACK=1`. A student opens 5 SSE tabs routed to instance 1, 5 to instance 2, and 5 to instance 3 — 15 total connections, far exceeding the 5-connection limit.

**Fix:** Add monitoring/logging when per-instance connection counts are high, or enforce shared coordination for multi-instance deployments.

---

### S4 — MEDIUM-HIGH: Chat Widget Streaming Lacks Abort Handling

**File:** `src/app/api/v1/plugins/chat-widget/chat/route.ts:338-377`
**Confidence:** Medium-High

The chat streaming route has no `request.signal.addEventListener("abort", ...)` handler. When a client disconnects, the upstream LLM provider stream continues generating tokens that no one reads, wasting API credits. The SSE route at `events/route.ts:305` has proper abort handling, showing the authors are aware of the need.

**Concrete failure:** Student asks the AI chat assistant a question and immediately navigates away. The LLM provider continues generating the full response (hundreds of tokens), all discarded. At scale, this represents significant wasted API costs.

**Fix:** Add `request.signal.addEventListener("abort", ...)` to cancel the provider stream reader.

---

### S5 — LOW: No SSE Reconnection — Falls Back to Polling

**File:** `src/hooks/use-submission-polling.ts:158-164`
**Confidence:** High (by design)

The `onerror` handler immediately closes SSE and falls back to fetch polling. This is intentional design — the server doesn't send `id:` fields (so EventSource reconnection can't provide gap-free delivery), and the fetch-polling fallback is a complete, working alternative with retry and backoff.

---

## Domain 3: Judge Execution Pipeline

### J1 — HIGH: Status String Mismatch Between `SubmissionStatus` Type and `SUBMISSION_STATUSES` Validation List

**File:** `src/lib/submissions/status.ts:1`, `src/lib/security/constants.ts:49-60,95-97`, `src/app/api/v1/judge/poll/route.ts:40-44`
**Confidence:** High

The canonical `SubmissionStatus` type includes: `time_limit_exceeded`, `memory_limit_exceeded`, `output_limit_exceeded`. The `SUBMISSION_STATUSES` validation array includes: `time_limit`, `memory_limit` (short forms). Three long-form statuses are **missing** from validation, and two short-form statuses appear only in validation.

**Hypothesis A:** The judge worker returns `time_limit_exceeded`/`memory_limit_exceeded` (long forms per the canonical type), and the poll endpoint's `isSubmissionStatus()` check rejects them, returning 400 with `"invalidSubmissionStatus"`. The submission remains stuck until the stale claim timeout (5 minutes).

**Hypothesis B:** The worker sends short forms (`time_limit`, `memory_limit`) matching the validation list. These are stored, but `TERMINAL_SUBMISSION_STATUSES` and `TERMINAL_SUBMISSION_STATUSES_SQL_LIST` use only long forms. Submissions stored with short-form statuses become **invisible to leaderboards and scoring**.

**Both hypotheses lead to data loss.** If the worker sends long forms → poll rejects results → submission stuck. If the worker sends short forms → stored successfully → invisible to scoring queries. Full synchronization is the only safe path.

**Concrete failure:** Worker judges a solution that exceeds memory limit, sends `status: "memory_limit_exceeded"`. Poll endpoint returns 400. Submission is stuck for 5 minutes in `judging` state with no feedback.

**Fix:** Synchronize `SUBMISSION_STATUSES` in `constants.ts` with the `SubmissionStatus` type in `status.ts`.

---

### J2 — HIGH: Rejudge Does Not Reset `failedTestCaseIndex` or `runtimeErrorType`

**File:** `src/app/api/v1/submissions/[id]/rejudge/route.ts:38-51`, `src/app/api/v1/admin/submissions/rejudge/route.ts:46-63`
**Confidence:** High

Both rejudge handlers reset the submission to `pending` and clear many fields, but `failedTestCaseIndex` and `runtimeErrorType` are absent from both SET clauses. During the window between rejudge and new judgment, the API returns `status: pending` with `failedTestCaseIndex: 3` and `runtimeErrorType: "segfault"` from the old judgment.

**Concrete failure:** Admin rejudges a submission that previously had `runtime_error` with `runtimeErrorType: "segfault"`. The API returns inconsistent data: `status: pending` + `runtimeErrorType: "segfault"`. If the rejudged submission is never reclaimed (all workers offline), the stale data persists indefinitely.

**Fix:** Add `failedTestCaseIndex: null, runtimeErrorType: null` to both rejudge SET clauses.

---

### J3 — HIGH: Dead States `internal_error` and `cancelled` Are Never Set and Would Be Rejected If Sent

**File:** `src/lib/security/constants.ts:49-60`, `src/lib/submissions/status.ts:1`
**Confidence:** High

`isSubmissionStatus()` excludes `internal_error` and `cancelled`. No code path in the pipeline sets either status. If a judge worker encounters a Docker crash, it has no way to mark the submission as `internal_error`. The submission stays in `judging` until the 5-minute stale timeout — the student sees "judging" for up to 5 minutes with no feedback.

**Fix:** Add `internal_error` and `cancelled` to `SUBMISSION_STATUSES`. Add a worker error path that sets `internal_error` on infrastructure failures.

---

### J4 — HIGH: Rejudge During Active Judging Leaks Worker `activeTasks` Counter

**File:** `src/app/api/v1/submissions/[id]/rejudge/route.ts:35-51`, `src/app/api/v1/judge/poll/route.ts:131-167`
**Confidence:** High

When a rejudge resets a submission's `judgeClaimToken` to `null`, an actively-judging worker's claim is invalidated. When that worker finishes and POSTs results to `/api/v1/judge/poll`, the claim token check fails, returning `"invalidJudgeClaim"`. The `activeTasks` decrement at `poll/route.ts:159-166` is inside the same conditional block and is never reached. The worker's `activeTasks` counter is permanently inflated by 1.

**Concrete failure:** Admin rejudges 10 submissions currently being judged by Worker-1. All 10 claim tokens are invalidated. Worker-1's poll results are all rejected. Worker-1's `activeTasks` stays at 10 (its concurrency limit). It can no longer claim new submissions. The system's judging capacity is reduced until Worker-1 is deregistered.

**Fix:** In the rejudge handler, check if the submission is in `judging`/`queued` state and decrement the `judgeWorkerId`'s `activeTasks` before clearing the claim. Add a heartbeat reconciliation step that corrects the `activeTasks` counter.

---

### J5 — MEDIUM: Deregister/Claim Race Causes Unnecessary Re-queue Delay

**File:** `src/app/api/v1/judge/deregister/route.ts:63-97`, `src/app/api/v1/judge/claim/route.ts:139-148`
**Confidence:** Medium

The deregister route uses a non-transactional pattern — first selects submissions (line 66-73), then updates them (line 77-85). Between SELECT and UPDATE, a claim can succeed via `FOR UPDATE SKIP LOCKED`. Worker B reclaims submission S, then worker A deregisters and resets S to `pending`, clearing B's claim token. Worker B's results are rejected. The poll endpoint's claim-token validation prevents data corruption but causes an unnecessary re-queue delay.

**Fix:** Use `SELECT FOR UPDATE` in the deregister query, or wrap the select+update in a single transaction.

---

### J6 — MEDIUM: Code Snapshot Cascade Delete Destroys Audit Trail

**File:** `src/lib/db/schema.pg.ts:983`
**Confidence:** Low-Medium

The `codeSnapshots` table has `references(() => assignments.id, { onDelete: "cascade" })` on `assignmentId`. Deleting an assignment cascades to delete all code snapshots. Submissions use `onDelete: "set null"` (preserving submissions), but snapshots are destroyed.

**Concrete failure:** Admin deletes an assignment by mistake. All submission data survives (with `assignmentId` set to null), but all code snapshot timelines are permanently destroyed.

**Fix:** Change `onDelete: "cascade"` to `onDelete: "set null"` for `codeSnapshots.assignmentId`, matching the submissions table behavior.

---

### J7 — LOW: IP Allowlist Module-Level Cache Never Invalidated Without Restart

**File:** `src/lib/judge/ip-allowlist.ts:9-11`
**Confidence:** Low

The allowlist is cached in a module-level variable, populated on first call, and never invalidated in production. Changing `JUDGE_ALLOWED_IPS` at runtime has no effect until the server restarts. Acceptable since env var changes typically require restart anyway.

---

## Domain 4: Data Mutation Paths

### D1 — HIGH: Assignment/Problem Update Delete-Replace Pattern Loses Concurrent Edits

**File:** `src/lib/assignments/management.ts:306-308`, `src/lib/problem-management.ts:287-321`
**Confidence:** High

`updateAssignmentWithProblems` deletes all `assignmentProblems` rows and re-inserts them. `updateProblemWithTestCases` and `syncProblemTags` use the same pattern. No optimistic concurrency control, no `SELECT FOR UPDATE`, no `updatedAt` comparison. Two concurrent admin edits will result in last-write-wins with silent data loss.

**Concrete failure:** Instructor A adds Problem 5. Instructor B simultaneously adjusts point values of Problems 1-4. B's save deletes all assignment problems and re-inserts with new point values but without Problem 5. Problem 5 submissions become orphaned.

**Fix:** Add OCC using `updatedAt` as a version token: `WHERE id = :id AND updatedAt = :expectedTimestamp`. Return 409 Conflict on mismatch.

---

### D2 — MEDIUM-HIGH: File Upload Creates Orphaned Disk Files on DB Insert Failure

**File:** `src/app/api/v1/files/route.ts:96-110`
**Confidence:** Medium-High

The upload writes the file to disk first (`writeUploadedFile` at line 96), then inserts the DB metadata row (lines 98-110). If the DB insert fails, the file remains on disk with no DB reference — it will never be served or cleaned up. No try/catch around the insert that cleans up the disk file on failure.

**Concrete failure:** Database connection pool exhaustion causes intermittent insert failures. 50 users upload images during this window. 30 DB inserts fail. 30 orphaned files accumulate on disk with no way to detect or clean them.

**Fix:** Wrap write-then-insert in try/catch that deletes the disk file on DB failure. Add a periodic garbage collection for orphaned files.

---

### D3 — MEDIUM: User Profile Update Last-Write-Wins Without OCC

**File:** `src/lib/actions/update-profile.ts:96-108`
**Confidence:** Medium-High

`updateProfile` reads the current user, computes changed fields for audit, but writes all normalized fields (not just changed ones) with no `WHERE updatedAt = :previousValue` guard. Two concurrent sessions can silently overwrite each other's changes.

**Concrete failure:** User sets `shareAcceptedSolutions = false` in Tab A. Simultaneously changes `editorTheme` in Tab B. Tab B's write includes `shareAcceptedSolutions = true` (stale default). User's accepted solutions become visible again without their intent.

**Fix:** Add OCC using `updatedAt` as a version token. Alternatively, switch to partial-field updates writing only changed fields.

---

### D4 — MEDIUM: Bulk File Delete Has DB-Disk Consistency Gap

**File:** `src/app/api/v1/files/bulk-delete/route.ts:28-39`
**Confidence:** Medium

Bulk delete removes DB rows first, then attempts disk cleanup. If the process crashes between DB commit and disk cleanup, files remain on disk with no DB reference. The code explicitly acknowledges this trade-off (comment at line 28).

**Fix:** Add a periodic garbage collection job that scans the upload directory for files not referenced in the `files` table.

---

### D5 — LOW: Community Vote Toggle Has TOCTOU Gap (Mitigated by DB Constraints)

**File:** `src/app/api/v1/community/votes/route.ts:80-128`
**Confidence:** Low

The vote handler reads existing vote with a plain `findFirst` (not `SELECT FOR UPDATE`), then conditionally deletes/updates/inserts. The `cv_target_user_idx` unique index and `onConflictDoUpdate` prevent data corruption. The TOCTOU gap only affects the returned score in the response, which is ephemeral.

---

## Domain 5: Contest State Transitions

### C1 — HIGH: Clock Skew Between App Server and DB Causes Inconsistent Late-Submission Enforcement

**File:** `src/lib/assignments/submissions.ts:208-209`, `src/app/api/v1/submissions/route.ts:291-306,318`
**Confidence:** High

The deadline gate at `submissions.ts:208` uses `Date.now()` (app server clock). The `submittedAt` is recorded using `getDbNowUncached()` (DB server clock). The scoring SQL compares `submitted_at` (DB time) against `@deadline`. The windowed exam path correctly uses DB time (`sql\`${examSessions.personalDeadline} < NOW()\``), but the scheduled/homework path uses app-server time for the gate and DB time for the record.

**Hypothesis A:** App server clock is 3 seconds ahead of DB. Student submits at what the app thinks is `deadline - 2s`. Submission is accepted. DB records `submittedAt = deadline + 1s`. Leaderboard applies late penalty. Student sees score reduced with no explanation. **Confirmed by code.**

**Hypothesis B:** App clock is behind DB, allowing truly late submissions to avoid penalty.

**Concrete failure:** Student submits 2 seconds after deadline (DB time) but the app server clock is 3 seconds ahead, so the app accepts it. The leaderboard applies the late penalty anyway. Student sees a discrepancy between "accepted" UI and "late penalty" leaderboard.

**Fix:** Replace `Date.now()` at `submissions.ts:208` with `await getDbNowUncached()`, or move the deadline check inside the transaction using `NOW()`, matching the windowed exam pattern.

---

### C2 — HIGH: Score Overrides Not Reflected in Leaderboard

**File:** `src/lib/assignments/contest-scoring.ts:136-377`, `src/lib/assignments/submissions.ts:633-645`
**Confidence:** High

`computeContestRanking()` computes `bestScore` from `submissions.score` with late-penalty adjustments but does NOT join or reference the `score_overrides` table. `getAssignmentStatusRows()` DOES apply overrides. Two views of the same student's score disagree.

**Concrete failure:** Judge worker crash marks a correct submission as `internal_error` (score: 0). Instructor overrides the score from 0 to 100. Instructor view shows 100. Leaderboard shows 0. Student's official rank is wrong.

**Fix:** Add `LEFT JOIN score_overrides` to the SQL in `_computeContestRankingInner` and use `COALESCE(override_score, computed_adjusted_score)` as the effective score.

---

### C3 — HIGH: Rejudge Does Not Invalidate Leaderboard Cache

**File:** `src/lib/assignments/contest-scoring.ts:57`, `src/app/api/v1/submissions/[id]/rejudge/route.ts:35-51`
**Confidence:** High

The `rankingCache` is an in-memory LRU cache with 30-second TTL and 15-second staleness window. Neither rejudge endpoint invalidates it. After rejudge, the leaderboard shows stale scores for up to 15 seconds. During this window, the submission transitions from old score → absent (status `pending`) → new score, causing a visible score dip.

**Concrete failure:** Instructor rejudges a submission that was incorrectly marked `wrong_answer` (score: 0). For up to 15 seconds, leaderboard shows 0. When the background refresh fires and the submission is now `pending`, the student's total score drops further. When rejudge completes (maybe 10 seconds later), the leaderboard shows the correct score. Student sees rank drop then jump back up.

**Fix:** Export `invalidateContestRankingCache(assignmentId)` from `contest-scoring.ts` and call it from both rejudge endpoints.

---

### C4 — HIGH: Windowed Exam Can Be Started With Zero Effective Time

**File:** `src/lib/assignments/exam-sessions.ts:58-64,86-89`
**Confidence:** High

`startExamSession()` creates a session if `now` is between `startsAt` and `deadline`. The `personalDeadline` is clamped to `assignment.deadline`. Starting near the deadline gives almost no time, and by the time the page renders, the submission path rejects with `examTimeExpired`.

**Concrete failure:** Student arrives 30 seconds before the global deadline. They click "Start Exam." They get a 30-second window. If the page takes more than 30 seconds to load (slow network), the session is expired before they see a single problem.

**Fix:** Add a minimum-time-remaining check in `startExamSession`: if `deadline - now < Math.min(examDurationMinutes * 60_000, 5 * 60_000)`, reject with `examTooLateToStart` error.

---

### C5 — HIGH: `showResultsToCandidate` Can Be Toggled Mid-Contest

**File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:98-103`, `src/lib/db/schema.pg.ts:348-349`
**Confidence:** High

The PATCH API blocks problem-list changes during active exam-mode contests but places no guard on `showResultsToCandidate` or `hideScoresFromCandidates`. An instructor can toggle these at any time. If toggled to `true` mid-contest, all students immediately see detailed test case results, compile output, and scores.

**Concrete failure:** During an active ICPC contest, an instructor accidentally toggles `showResultsToCandidate` to `true`. All students immediately see detailed results including which test cases their solutions pass/fail. The playing field is no longer level.

**Fix:** Add a guard: if exam mode is not `"none"` and status is `"open"` or `"in_progress"`, block changes to `showResultsToCandidate`.

---

### C6 — MEDIUM-HIGH: Problem Visibility Changes Mid-Contest Are Unguarded

**File:** `src/lib/auth/permissions.ts:107-145`
**Confidence:** Medium-High

Changing a problem's `visibility` from `"public"` to `"private"` mid-contest blocks new submissions via `canAccessProblem()` even though the problem is still in `assignmentProblems`. Students who could submit moments ago get a 403 with no clear explanation.

**Concrete failure:** Instructor changes a contest problem's visibility from `"public"` to `"private"` to prevent future students from seeing it. Active contest participants who try to submit get a 403, even though the problem is still listed in the assignment.

**Fix:** Add a contest-active check in the problem visibility API. If the problem is in any active assignment, block visibility changes.

---

### C7 — MEDIUM: No Guard Against Timestamp Changes That Regress Contest Status

**File:** `src/lib/assignments/management.ts:260-284`
**Confidence:** Medium

`updateAssignmentWithProblems()` blocks timing changes for windowed exams with existing sessions. But for scheduled exams with submissions, there is no guard against changing `startsAt` or `deadline` in ways that change the computed status. The code at line 260 only checks `if (assignment.examMode === "windowed")`.

**Concrete failure:** Instructor changes `deadline` from Friday to Thursday after some students have already submitted. Students who submitted between Thursday and Friday suddenly see their submissions marked as late. The leaderboard retroactively penalizes them.

**Fix:** Extend the guard to cover all exam modes (not just windowed) when submissions exist. Reject changes to `startsAt` or `deadline` that would shorten the contest window.

---

## Consolidated Findings by Severity

| # | ID | Finding | Confidence | Severity |
|---|-----|---------|------------|----------|
| 1 | A1 | proxy.ts is dead middleware — CSP/mustChangePassword/session cleanup all disabled | High | Critical |
| 2 | J1 | Status string mismatch — poll rejects canonical long-form statuses OR short-form statuses invisible to scoring | High | High |
| 3 | C1 | Clock skew in deadline enforcement — app-server `Date.now()` vs DB `NOW()` | High | High |
| 4 | J4 | Rejudge during active judging leaks worker `activeTasks` counter permanently | High | High |
| 5 | C2 | Score overrides not reflected in leaderboard | High | High |
| 6 | C3 | Rejudge does not invalidate leaderboard cache — stale/incorrect scores for 15+ seconds | High | High |
| 7 | J2 | Rejudge does not reset `failedTestCaseIndex`/`runtimeErrorType` | High | High |
| 8 | D1 | Assignment/problem update delete-replace pattern loses concurrent edits | High | High |
| 9 | C4 | Windowed exam can be started with zero effective time | High | Medium |
| 10 | C5 | `showResultsToCandidate` can be toggled mid-contest | High | Medium |
| 11 | A2 | Dashboard layout skips `mustChangePassword` check | High | Medium |
| 12 | C6 | Problem visibility changes mid-contest are unguarded | Med-High | Medium |
| 13 | S2 | Shared coordination slot leak on fire-and-forget release | Med-High | Medium |
| 14 | S4 | Chat widget streaming lacks abort handling — wasted API credits | Med-High | Medium |
| 15 | D2 | File upload creates orphaned disk files on DB insert failure | Med-High | Medium |
| 16 | J3 | Dead states `internal_error`/`cancelled` never set and would be rejected | High | Medium |
| 17 | J5 | Deregister/claim race causes unnecessary re-queue delay | Medium | Medium |
| 18 | A3 | CSP degraded from nonce-based to origin-only | High | Low |
| 19 | C7 | No guard against timestamp changes that regress contest status | Medium | Low |
| 20 | D3 | User profile update last-write-wins without OCC | Med-High | Low |
| 21 | S3 | Per-user connection limits are per-process when shared coordination disabled | Med-High | Low |

---

## Cross-Cutting Patterns

1. **Dead middleware cascade** (A1→A2→A3): The proxy.ts issue is the root cause of three separate findings. Fixing A1 resolves A2 and A3 as well.

2. **Status string split-brain** (J1→J3): The `SUBMISSION_STATUSES` validation list is out of sync with the canonical type. This causes both rejected judge results AND missing leaderboard entries, depending on which form the worker uses. J3 (dead states) is a consequence of the same root cause.

3. **Time-source inconsistency** (C1): The app server uses `Date.now()` while the DB uses `NOW()` for deadline enforcement. The windowed exam path is correct (uses DB time inside the transaction), but the scheduled/homework path is inconsistent.

4. **Delete-replace without OCC** (D1): A pattern reused in `management.ts`, `problem-management.ts`, and `syncProblemTags`. All are vulnerable to silent data loss from concurrent edits.

5. **Leaderboard consistency** (C2→C3): Score overrides are not reflected (C2), and the ranking cache is not invalidated on mutations (C3). Together, they mean the leaderboard can show stale AND incorrect data after any scoring change.

---

## Critical Unknowns

1. **Does the deployed Rust worker (`judge-worker-rs`) send long-form (`time_limit_exceeded`) or short-form (`time_limit`) statuses?** This determines whether J1 manifests as rejected results or invisible submissions. A `SELECT DISTINCT status FROM submissions` query against production DB would collapse this uncertainty.

2. **What is the actual clock skew between the app server and DB server?** If they run on the same host or NTP-synchronized, C1 is latent. `SELECT EXTRACT(EPOCH FROM NOW()) * 1000` vs `Date.now()` reveals the actual delta.

3. **Does nginx on algo.xylolabs.com replicate the proxy.ts CSP nonces, mustChangePassword redirects, and session cleanup?** If so, A1/A2/A3 are externally mitigated.

4. **Is there a worker `activeTasks` reconciliation mechanism in the heartbeat handler?** If the heartbeat reconciles the counter, J4 is self-healing rather than permanent.

---

## Discriminating Probes

| Unknown | Probe Method |
|---------|-------------|
| Worker status strings | `SELECT DISTINCT status FROM submissions` on production DB |
| App-DB clock skew | Run `SELECT EXTRACT(EPOCH FROM NOW()) * 1000` from app, compare with `Date.now()` |
| Nginx proxy mitigation | Read nginx config on algo.xylolabs.com via `~/git/nas-ops` |
| Worker activeTasks reconciliation | Read `src/app/api/v1/judge/heartbeat/route.ts` for counter correction logic |
| `REALTIME_SINGLE_INSTANCE_ACK` in production | Check production env config |

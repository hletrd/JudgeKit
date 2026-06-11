# Code Reviewer — Cycle 3 Deep Review (2026-05-01)

**HEAD reviewed:** `894320ff` (main)

## Inventory of review-relevant files

567 TypeScript/TSX source files in `src/`, 10 Rust source files in `judge-worker-rs/src/`, 343 test files. All critical paths examined: security modules, API routes, judge worker, auth, scoring, data retention, compiler execution, realtime coordination.

## Findings

### C3-CR-1: `participant-status.ts:99` — null status treated as "submitted" (MEDIUM, confidence: High)

**File:** `src/lib/assignments/participant-status.ts:99`

When `latestStatus === null` and `attemptCount > 0`, the function returns `"submitted"`. This is semantically wrong: a null status with attempts means the submission exists but its status was never set (or was cleared). Returning `"submitted"` gives the false impression the submission was explicitly submitted and judged, when in reality it may be in an indeterminate state.

**Failure scenario:** A submission that was interrupted mid-judge (e.g., worker crash before status update) could have `status = null` in the DB. The participant table would show "submitted" instead of a more accurate "pending" or "queued", misleading the instructor about the submission state.

**Fix:** Change `latestStatus === "accepted" || latestStatus == null` to only match `"accepted"`, and handle the null case separately by returning `"pending"` or `"queued"` depending on the context.

### C3-CR-2: `scoring.ts:78-99` — SQL injection risk via string interpolation in `buildIoiLatePenaltyCaseExpr` (MEDIUM, confidence: Medium)

**File:** `src/lib/assignments/scoring.ts:78-99`

The function `buildIoiLatePenaltyCaseExpr` accepts column name parameters (`scoreCol`, `pointsCol`, `submittedAtCol`, `personalDeadlineCol`) and interpolates them directly into a SQL string template. While these are currently called with string literal defaults like `"score"` and `"points"`, the function signature accepts arbitrary strings. If any caller passes user-influenced input, it becomes a SQL injection vector.

**Failure scenario:** A future developer calls this function with a column name derived from user input, creating a SQL injection. Current callers are safe, but the API design is inherently dangerous.

**Fix:** Either (a) change the parameter type to a union of allowed column names, or (b) add a runtime validation that the column names match `^[a-zA-Z_][a-zA-Z0-9_]*$`, or (c) use Drizzle's column reference API instead of raw string interpolation.

### C3-CR-3: `in-memory-rate-limit.ts:129` — exponential backoff overflow (LOW, confidence: High)

**File:** `src/lib/security/in-memory-rate-limit.ts:129`

The block duration calculation `blockMs * Math.pow(2, entry.consecutiveBlocks)` has no cap on the exponent. While the `MAX_BLOCK` of 24 hours provides a cap on the result, `consecutiveBlocks` itself is unbounded, meaning `Math.pow(2, N)` for very large N produces `Infinity`, and `Math.min(Infinity, MAX_BLOCK)` correctly returns `MAX_BLOCK`. However, the `MAX_BLOCK` cap only exists in `recordFailureInMemory` — the `consumeInMemoryRateLimit` function (line 155-160) computes `retryAfter` from `entry.blockedUntil - Date.now()`, which would be `Infinity - Date.now() = Infinity` if the cap were absent. The cap is present and working, but there is no `BACKOFF_CAP` constant (unlike the DB-backed `rate-limit.ts` which has `BACKOFF_CAP = 5`). This inconsistency could cause issues if someone copies the in-memory version for a new use case without noticing the missing cap.

**Failure scenario:** A developer copies the in-memory rate limiter for a new use case, removes the MAX_BLOCK cap (intending to allow longer blocks), and the exponent grows unbounded causing `Infinity` block durations.

**Fix:** Add an explicit `BACKOFF_CAP` constant (matching the DB-backed module's `BACKOFF_CAP = 5`) and apply it in the `Math.pow(2, ...)` call for consistency with the DB-backed module.

### C3-CR-4: `find-session-user.ts:37` — case-insensitive username lookup uses raw SQL (LOW, confidence: Medium)

**File:** `src/lib/auth/find-session-user.ts:37`

The query uses `sql\`lower(${users.username}) = lower(${sessionUser.username})\`` which is a raw SQL template. While Drizzle's `sql` tag does parameterize values, the column reference is safe here because it uses the `users.username` Drizzle column object. However, the pattern bypasses Drizzle's query builder and is harder to audit for SQL injection across the codebase.

**Failure scenario:** No immediate risk, but this pattern could be cargo-culted by developers who don't understand the `sql` tag's safety boundaries.

**Fix:** Consider using Drizzle's `ilike` or a `where` clause with `eq(sql`lower(${users.username})`, sessionUser.username.toLowerCase())` to be more explicit about the parameterization boundary.

### C3-CR-5: `visibility.ts:90-99` — N+1 DB query in sanitizeSubmissionForViewer (LOW, confidence: High)

**File:** `src/lib/submissions/visibility.ts:90-99`

When `assignmentVisibility` is not provided and the submission has an `assignmentId`, this function makes an individual DB query per submission. When called in a loop (e.g., bulk submission list), this creates N+1 queries. The JSDoc documents this, but the function signature doesn't enforce passing `assignmentVisibility`.

**Failure scenario:** A developer calls `sanitizeSubmissionForViewer` in a loop for 100 submissions, resulting in 100 individual DB queries instead of 1 batch query.

**Fix:** Consider making `assignmentVisibility` required (or at least logging a performance warning when it's not provided for calls with an `assignmentId`).

## Cross-file interactions examined

- `createApiHandler` -> `consumeApiRateLimit` -> `atomicConsumeRateLimit` (rate limiting pipeline)
- `isJudgeAuthorizedForWorker` -> `hashToken` -> `safeTokenCompare` (judge auth chain)
- `executeCompilerRun` -> `tryRustRunner` -> fallback `runDocker` (compiler execution pipeline)
- `startExamSession` -> `rawQueryOne` (DB time consistency)
- `sanitizeSubmissionForViewer` -> `db.query.assignments` (N+1 pattern)
- `buildIoiLatePenaltyCaseExpr` -> raw SQL interpolation (column name injection risk)

## Final sweep

No additional files skipped. All critical paths reviewed. All findings are new relative to prior cycle aggregates.

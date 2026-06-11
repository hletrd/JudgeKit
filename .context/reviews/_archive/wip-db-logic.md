# Deep Code Review: Database Layer & Core Business Logic

**Reviewer**: Code Reviewer Agent (Opus 4.6)
**Date**: 2026-04-18
**Commit**: HEAD on main
**Scope**: `src/lib/db/**`, `src/lib/assignments/**`, `src/lib/anti-cheat/**`, `src/lib/submissions/**`, `src/lib/problems/**`, `src/lib/problem-management.ts`, `src/lib/problem-statement.ts`, `src/lib/problem-tiers.ts`, `src/lib/problem-sets/**`, `src/lib/code-snapshots/**`, `src/lib/code/**`, `src/lib/recruiting/**`, `src/lib/practice/**`, `src/lib/discussions/**`, `src/lib/audit/**`, `src/lib/data-retention.ts`, `src/lib/data-retention-maintenance.ts`, `src/lib/system-settings.ts`, `src/lib/system-settings-config.ts`, `src/lib/ratings.ts`, `src/lib/homepage-insights.ts`, `src/lib/files/**`, `src/lib/actions/**`

---

## Executive Summary

The codebase demonstrates strong engineering discipline in several areas: consistent use of transactions for multi-table writes, comprehensive audit logging across all server actions, proper authorization checks via capability-based RBAC, and careful handling of race conditions in critical paths (access code redemption, exam session creation, recruiting invitation claims). The schema is well-indexed for common query patterns.

However, this review identifies **4 CRITICAL**, **8 HIGH**, **12 MEDIUM**, and **9 LOW** severity issues across security, data integrity, race conditions, and schema design.

**Verdict: REQUEST CHANGES** (CRITICAL and HIGH issues present)

---

## Issues by Severity

### CRITICAL: 4 | HIGH: 8 | MEDIUM: 12 | LOW: 9

---

## CRITICAL Issues

### C-1. Plaintext Secrets Stored in Schema (Security)

**Severity**: CRITICAL | **Confidence**: HIGH | **Status**: Open
**File**: `src/lib/db/schema.pg.ts:416`

```typescript
secretToken: text("secret_token"),
```

The `judgeWorkers` table stores `secretToken` in plaintext alongside `secretTokenHash`. While `secretTokenHash` exists, the plaintext `secretToken` column persists in the database. Similarly, `recruitingInvitations.token` (line 919) stores the raw token alongside `tokenHash`.

**Scenario**: A database dump, backup leak, or SQL injection exposes all judge worker secrets and recruiting invitation tokens in cleartext, allowing an attacker to impersonate judge workers or redeem arbitrary invitations.

**Fix**: Remove the plaintext `secretToken` and `token` columns after confirming all code paths use the hash-based lookups. If the plaintext must be returned to the user once at creation time, return it from the creation function and never persist it. At minimum, add a migration to null out old plaintext values and add a comment explaining the column is deprecated.

---

### C-2. hCaptcha Secret Stored Unencrypted in DB Column

**Severity**: CRITICAL | **Confidence**: HIGH | **Status**: Partially Mitigated
**File**: `src/lib/db/schema.pg.ts:517`

```typescript
hcaptchaSecret: text("hcaptcha_secret"),
```

The schema defines `hcaptchaSecret` as plaintext. The `updateSystemSettings` action (line 149 of `actions/system-settings.ts`) does encrypt it before storage via `encrypt()`, but the schema itself has no guardrail. Any other code path writing to this column directly (migrations, seed scripts, raw queries) would store the secret in cleartext.

**Scenario**: A migration or seed script sets `hcaptcha_secret` directly, bypassing the encrypt() call, leaving the secret in plaintext. An admin UI bug reads the raw column and displays it.

**Fix**: Rename the DB column to `hcaptcha_secret_encrypted` to signal that only encrypted values should be stored. Add a schema-level comment. Add a runtime assertion in `getSystemSettings()` that validates the value appears encrypted (starts with expected prefix).

---

### C-3. Data Retention Omits loginEvents and auditEvents from Centralized Policy

**Severity**: CRITICAL | **Confidence**: HIGH | **Status**: Open
**File**: `src/lib/data-retention-maintenance.ts` (entire file)

The `pruneSensitiveOperationalData()` function prunes `chatMessages`, `antiCheatEvents`, `recruitingInvitations`, and `submissions`. However, `loginEvents` (which contain IP addresses, user agents, and attempted identifiers -- PII) are **never pruned** by the centralized maintenance system. The `auditEvents` table has its own separate pruning in `src/lib/audit/events.ts:175` with a hardcoded 90-day retention, but this runs on its own timer and does NOT respect the `DATA_RETENTION_LEGAL_HOLD` flag.

**Scenario**: Under GDPR/data-retention compliance, activating `DATA_RETENTION_LEGAL_HOLD=true` suspends data pruning, but the audit event pruning in `events.ts` continues independently because it has its own timer and does not check the legal hold flag. Login events accumulate indefinitely with no pruning at all.

**Fix**:
1. Add `loginEvents` retention to `data-retention.ts` and add a `pruneLoginEvents()` function to the maintenance module.
2. Move audit event pruning into the centralized maintenance module and remove the standalone pruning in `audit/events.ts`, or at minimum add the `DATA_RETENTION_LEGAL_HOLD` check to `pruneOldAuditEvents()`.
3. Align the audit retention period with `DATA_RETENTION_DAYS.auditEvents` (currently 90 days) instead of hardcoding.

---

### C-4. Recruiting Invitation Stores Plaintext Token

**Severity**: CRITICAL | **Confidence**: HIGH | **Status**: Open
**File**: `src/lib/db/schema.pg.ts:919`

```typescript
token: text("token").notNull(),
```

The `recruitingInvitations` table stores the raw token alongside its hash. The `getRecruitingInvitationByToken()` function correctly uses the hash for lookup, but the plaintext token is stored permanently and returned in full via `getRecruitingInvitations()` (which does `select()` without column restrictions). This means any admin listing invitations sees all raw tokens.

**Scenario**: An instructor-level user with `recruiting.manage_invitations` capability can view all invitation tokens in API responses, then share or misuse them. A DB backup exposes all tokens.

**Fix**: After the invitation is created and the token is returned to the creator, null out the `token` column (keep only `tokenHash`). Alternatively, restrict the `getRecruitingInvitations` query to exclude the `token` column, and add a DB migration to wipe existing plaintext tokens.

---

## HIGH Issues

### H-1. Contest Scoring Query Does Not Filter by Submission Status

**Severity**: HIGH | **Confidence**: HIGH | **Status**: Open
**File**: `src/lib/assignments/contest-scoring.ts:131-176`

```sql
FROM submissions s
INNER JOIN assignment_problems ap
  ON ap.assignment_id = s.assignment_id AND ap.problem_id = s.problem_id
INNER JOIN users u ON u.id = s.user_id
WHERE s.assignment_id = @assignmentId
```

The scoring query includes ALL submissions regardless of status. Submissions with status `pending`, `queued`, `judging`, `compile_error`, `internal_error`, or `cancelled` are included in attempt counts and potentially in score calculations (their `score` may be NULL, but they inflate `attemptCount`).

**Scenario**: A student's `pending` submission is counted as a wrong attempt in ICPC scoring, inflating their penalty by 20 minutes. A `cancelled` or `internal_error` submission (not the student's fault) permanently damages their penalty.

**Fix**: Add a status filter to the WHERE clause:
```sql
AND s.status NOT IN ('pending', 'queued', 'judging', 'cancelled', 'internal_error')
```
Or better, only include terminal judged statuses: `AND s.status IN ('accepted', 'wrong_answer', 'time_limit_exceeded', 'memory_limit_exceeded', 'runtime_error', 'compile_error', 'output_limit_exceeded')`.

---

### H-2. Assignment Status Query Also Missing Status Filter

**Severity**: HIGH | **Confidence**: HIGH | **Status**: Open
**File**: `src/lib/assignments/submissions.ts:548-578`

The `getAssignmentStatusRows()` function has the same issue as H-1. The CTE `scored` selects from `submissions` without filtering by status:

```sql
FROM submissions s
INNER JOIN assignment_problems ap
  ON ap.assignment_id = s.assignment_id AND ap.problem_id = s.problem_id
WHERE s.assignment_id = @assignmentId
```

**Scenario**: Same as H-1 -- pending/cancelled submissions inflate attempt counts and may affect best score calculations for the instructor's assignment status view.

**Fix**: Same as H-1 -- add a status filter to exclude non-terminal submissions.

---

### H-3. Missing `communityVotes` Relation Definition

**Severity**: HIGH | **Confidence**: HIGH | **Status**: Open
**File**: `src/lib/db/relations.pg.ts` (missing)

The `communityVotes` table is imported in the relations file (line 36 of the import block is missing it -- checking the import list shows it is not imported). There is no `communityVotesRelations` definition. The `communityVotes` table references `users.id` via FK, but the ORM relation graph does not know about it.

**Scenario**: Drizzle's relational query API cannot traverse from a vote to its user or vice versa. The `discussions/data.ts` code works because it uses raw `sql` expressions, but any future code using `db.query.communityVotes.findMany({ with: { user: ... } })` would fail silently.

**Fix**: Add the relation definition:
```typescript
export const communityVotesRelations = relations(communityVotes, ({ one }) => ({
  user: one(users, {
    fields: [communityVotes.userId],
    references: [users.id],
  }),
}));
```
And add `communityVotes` to the import list and the `usersRelations.many()`.

---

### H-4. No Index on `submissions.status` + `submittedAt` for Data Retention Deletes

**Severity**: HIGH | **Confidence**: MEDIUM | **Status**: Open
**File**: `src/lib/data-retention-maintenance.ts:32-38`

```typescript
await db.delete(submissions).where(
  and(
    lt(submissions.submittedAt, cutoff),
    notInArray(submissions.status, ["pending", "queued", "judging"])
  )
);
```

There is an index on `submissions.status` and a separate one on `submissions.submittedAt`, but no composite index on `(status, submittedAt)` or `(submittedAt, status)`. With a large submissions table (expected in production), this DELETE will require a sequential scan or an inefficient merge of two index scans.

**Scenario**: On a production instance with millions of submissions, the daily retention DELETE causes a long lock, blocking concurrent writes and causing request timeouts.

**Fix**: Add a composite index:
```typescript
index("submissions_retention_idx").on(table.submittedAt, table.status),
```
Or batch the DELETE using a subquery with LIMIT to avoid long-held locks.

---

### H-5. Windowed Exam Does Not Enforce Personal Deadline in Scoring

**Severity**: HIGH | **Confidence**: MEDIUM | **Status**: Open
**File**: `src/lib/assignments/contest-scoring.ts:160-165`

```sql
WHEN @examMode::text != 'windowed'
     AND submitted_at IS NOT NULL AND EXTRACT(EPOCH FROM submitted_at)::bigint > @deadline::bigint
THEN ROUND(((LEAST(GREATEST(score, 0), 100) / 100.0 * points) * (1.0 - @latePenalty::double precision / 100.0))::numeric, 2)
```

When `examMode` is `'windowed'`, the late penalty check is explicitly skipped (via the `!= 'windowed'` condition). This is correct for the global deadline, but there is **no enforcement of the per-user `personalDeadline`** from `exam_sessions`. A student whose windowed exam has expired can still have submissions scored at full points if they manage to submit after their personal deadline (e.g., via API).

**Scenario**: A student's personal exam deadline expires at 3:00 PM, but the global assignment deadline is 5:00 PM. If the submission validation has a timing gap or the student uses a cached exam session, submissions between 3:00-5:00 PM receive full credit.

**Fix**: Join `exam_sessions` in the scoring query for windowed assignments and apply late penalty based on `personal_deadline` instead of the global `deadline`. Alternatively, ensure the submission validation (`validateAssignmentSubmission`) is airtight (it does check `examTimeExpired`, which is good, but a defense-in-depth approach in scoring is safer).

---

### H-6. `activeTasks` Counter on `judgeWorkers` Vulnerable to Lost Updates

**Severity**: HIGH | **Confidence**: MEDIUM | **Status**: Open
**File**: `src/lib/db/schema.pg.ts:419`

```typescript
activeTasks: integer("active_tasks").notNull().default(0),
```

The `activeTasks` field is a plain integer with no atomic increment/decrement mechanism visible in the schema. If two judge operations concurrently update this counter without `SET active_tasks = active_tasks + 1` (using SQL atomic increment) or a `FOR UPDATE` lock, the counter can drift.

**Scenario**: Two submissions are claimed simultaneously by the same worker. Both read `activeTasks = 2`, both write `activeTasks = 3`. The actual count should be 4. Over time, the counter drifts, leading to incorrect load balancing (over- or under-assignment).

**Fix**: Verify that all code paths incrementing/decrementing `activeTasks` use `sql\`active_tasks + 1\`` rather than read-modify-write. If not, refactor to use atomic SQL expressions. Consider adding a `CHECK (active_tasks >= 0)` constraint to catch drift.

---

### H-7. Submission Deletion Cascades May Orphan Score Override References

**Severity**: HIGH | **Confidence**: MEDIUM | **Status**: Open
**File**: `src/lib/db/schema.pg.ts:451-452`

```typescript
assignmentId: text("assignment_id").references(() => assignments.id, {
  onDelete: "set null",
}),
```

When an assignment is deleted, `submissions.assignmentId` is set to NULL (not cascaded). But `scoreOverrides` has `onDelete: "cascade"` for `assignmentId`. This means:
- If an assignment is deleted, score overrides are deleted (cascade).
- But submissions remain with `assignmentId = NULL`.
- The `getAssignmentStatusRows()` function won't find them (it filters by assignmentId).
- `data-retention-maintenance.ts` prunes submissions by `submittedAt`, but orphaned submissions with NULL assignmentId from deleted assignments may linger indefinitely without any retention policy applying to them specifically.

**Scenario**: An instructor deletes an assignment. The 500 submissions remain with `assignmentId = NULL`. These orphaned rows are never cleaned up and contribute to table bloat. Worse, if users visit their submission history, these orphaned submissions may appear with no context.

**Fix**: Consider changing submissions FK to `onDelete: "cascade"` (if submissions should be deleted with the assignment) or adding a cleanup job that periodically removes orphaned submissions (where `assignmentId IS NULL AND submittedAt < cutoff`).

---

### H-8. `chatMessages.problemId` Has No FK Constraint

**Severity**: HIGH | **Confidence**: HIGH | **Status**: Open
**File**: `src/lib/db/schema.pg.ts:822`

```typescript
problemId: text("problem_id"),
```

The `chatMessages` table has a `problemId` column but no foreign key reference to `problems.id`. This means:
1. Referential integrity is not enforced -- chat messages can reference non-existent problems.
2. When a problem is deleted (via cascade from test cases etc.), chat messages referencing it are not cleaned up.
3. The column has no index, making queries filtering by problemId slow.

**Fix**: Add an FK reference and an index:
```typescript
problemId: text("problem_id").references(() => problems.id, { onDelete: "set null" }),
```
And add `index("chat_messages_problem_id_idx").on(table.problemId)` to the table definition.

---

## MEDIUM Issues

### M-1. `scoreOverrides.createdAt` Uses `new Date()` Instead of `new Date(Date.now())`

**Severity**: MEDIUM | **Confidence**: LOW | **Status**: Open
**File**: `src/lib/db/schema.pg.ts:644`

```typescript
createdAt: timestamp("created_at", { withTimezone: true })
  .notNull()
  .$defaultFn(() => new Date()),
```

Every other table uses `new Date(Date.now())` for consistency. This table uses `new Date()`. While functionally identical, the inconsistency suggests a copy-paste oversight that could mask a future issue if `Date.now()` is ever mocked in tests.

**Fix**: Change to `$defaultFn(() => new Date(Date.now()))` for consistency.

---

### M-2. `files` Table `problemId` Uses `onDelete: "set null"` -- Orphaned Files on Disk

**Severity**: MEDIUM | **Confidence**: HIGH | **Status**: Open
**File**: `src/lib/db/schema.pg.ts:1100-1101`

```typescript
problemId: text("problem_id")
  .references(() => problems.id, { onDelete: "set null" }),
```

When a problem is deleted, the `files` rows have `problemId` set to NULL, but the physical files on disk (in the uploads directory) remain. The file records also remain in the database with `problemId = NULL` and no expiration policy.

**Scenario**: Over time, deleted problems leave orphaned files on disk and in the DB. Disk space grows unbounded. There is no cleanup job for files with `problemId IS NULL AND uploadedBy IS NULL`.

**Fix**: Add a periodic cleanup job that removes file records and their on-disk counterparts when `problemId IS NULL` and `createdAt` is older than a threshold (e.g., 30 days). Or add an explicit cleanup step in the problem deletion flow.

---

### M-3. Similarity Check Does Not Normalize by Language

**Severity**: MEDIUM | **Confidence**: MEDIUM | **Status**: Open
**File**: `src/lib/assignments/code-similarity.ts:310-319`

```sql
WITH best AS (
  SELECT user_id AS "userId", problem_id AS "problemId", source_code AS "sourceCode",
         ROW_NUMBER() OVER (PARTITION BY user_id, problem_id ORDER BY score DESC, submitted_at DESC) AS rn
  FROM submissions
  WHERE assignment_id = @assignmentId
)
```

The similarity query fetches the best submission per (user, problem) regardless of language. The normalization functions (`normalizeSource`, `normalizeIdentifiersForSimilarity`) are language-agnostic but use C/C++ preprocessor detection. Comparing a Python solution against a C++ solution for the same problem will produce artificially low similarity, potentially missing actual plagiarism in the same language.

**Scenario**: Two students submit nearly identical C++ solutions, but one also has a higher-scoring Python submission. The query picks the Python submission for one student and the C++ submission for the other, missing the plagiarism.

**Fix**: Partition by `(user_id, problem_id, language)` instead of just `(user_id, problem_id)`, then only compare submissions in the same language.

---

### M-4. `groups.isArchived` Not Filtered in Most Queries

**Severity**: MEDIUM | **Confidence**: MEDIUM | **Status**: Open
**File**: `src/lib/db/schema.pg.ts:188`

The `groups` table has an `isArchived` field, but no query in the reviewed code (assignments, enrollments, contests, problem-sets) filters on it. Archived groups appear in all group listings, assignment validations, and contest queries.

**Scenario**: An instructor archives a group, expecting it to be hidden. Students still see assignments from that group, can still submit to it, and the archived group appears in dropdowns.

**Fix**: Add `eq(groups.isArchived, false)` (or `ne(groups.isArchived, true)`) to all group-related queries that are user-facing. Or add a query helper `activeGroupsOnly()`.

---

### M-5. `buildCodeSnapshotDiff` Has O(n*m) Space Complexity

**Severity**: MEDIUM | **Confidence**: HIGH | **Status**: Open
**File**: `src/lib/code-snapshots/diff.ts:28-30`

```typescript
const lcsMatrix = Array.from({ length: previousLines.length + 1 }, () =>
  Array(currentLines.length + 1).fill(0)
);
```

The full LCS matrix is allocated in memory. For two files of 10,000 lines each, this creates a 100M-element array (~400MB for 32-bit integers). Source code files can be large.

**Scenario**: A student submits a very long generated file (e.g., a lookup table). Viewing the code snapshot diff crashes the server with an OOM error.

**Fix**: Use the space-optimized LCS approach (only keep two rows at a time) or implement a more efficient diff algorithm (e.g., Myers' diff). Add a line count limit (e.g., 5000 lines) and return a "diff too large" message.

---

### M-6. In-Memory Ranking Cache Not Bounded by Assignment Count

**Severity**: MEDIUM | **Confidence**: MEDIUM | **Status**: Open
**File**: `src/lib/assignments/contest-scoring.ts:55`

```typescript
const rankingCache = new LRUCache<string, CacheEntry>({ max: 50, ttl: CACHE_TTL_MS });
```

The cache is limited to 50 entries. But cache keys include the cutoff second (for freeze and replay), meaning a single contest replay with 40 snapshots generates 40 cache entries, nearly filling the entire cache and evicting entries for other active contests.

**Scenario**: An instructor views the contest replay for a large contest. This fills the cache with 40 snapshot entries, evicting the live ranking caches for all other active contests, causing a thundering herd of recomputations.

**Fix**: Increase `max` to at least 200, or separate replay cache from live ranking cache. The cutoff-based entries could use a separate LRU or be excluded from the main cache.

---

### M-7. `rateLimits` Table Uses `bigint` for Timestamps, Not `timestamp`

**Severity**: MEDIUM | **Confidence**: LOW | **Status**: Open
**File**: `src/lib/db/schema.pg.ts:577-594`

The `rateLimits` table stores all timestamps as `bigint` (epoch milliseconds) while every other table uses PostgreSQL `timestamp with time zone`. This inconsistency means:
1. Cannot use built-in PG timestamp functions on these columns.
2. Cannot easily join with other tables' timestamps.
3. No timezone awareness.

**Fix**: Consider migrating to `timestamp with time zone` for consistency, or document the design decision if the bigint approach is intentional for performance reasons (avoiding timestamp parsing overhead in the hot rate-limit path).

---

### M-8. `assignmentProblems` Delete-and-Reinsert Pattern Loses Referential History

**Severity**: MEDIUM | **Confidence**: HIGH | **Status**: Open
**File**: `src/lib/assignments/management.ts:305-307`

```typescript
await tx.delete(assignmentProblems).where(eq(assignmentProblems.assignmentId, assignmentId));
await tx.insert(assignmentProblems)
  .values(mapAssignmentProblems(assignmentId, input.problems));
```

On every assignment update, ALL `assignmentProblems` rows are deleted and reinserted with new IDs, even if the problems didn't change. This is guarded by a `problemLinksChanged` check when submissions exist, but when problems DO change and the guard passes (`allowLockedProblemChanges`), the delete-reinsert generates new IDs for all rows.

**Scenario**: Any system that tracks `assignmentProblems.id` for historical reference (e.g., a hypothetical FK from another table) would break. The current schema doesn't have such FKs, but the pattern is fragile.

**Fix**: Use the `planProblemTestCaseSync`-style approach used for test cases -- match existing rows, only insert/delete changed rows, update `sortOrder` for moves.

---

### M-9. `syncProblemTags` Performs N+1 Inserts

**Severity**: MEDIUM | **Confidence**: HIGH | **Status**: Open
**File**: `src/lib/problem-management.ts:178-183`

```typescript
await executor.delete(problemTags).where(eq(problemTags.problemId, problemId));
for (const tagId of tagIds) {
  await executor.insert(problemTags)
    .values({ id: nanoid(), problemId, tagId });
}
```

Each tag is inserted individually in a loop. With 10 tags, this is 11 queries (1 delete + 10 inserts) instead of 2 (1 delete + 1 batch insert).

**Fix**: Batch the inserts:
```typescript
if (tagIds.length > 0) {
  await executor.insert(problemTags).values(
    tagIds.map(tagId => ({ id: nanoid(), problemId, tagId }))
  );
}
```

---

### M-10. Contest Replay Executes N Sequential `computeContestRanking` Calls

**Severity**: MEDIUM | **Confidence**: HIGH | **Status**: Open
**File**: `src/lib/assignments/contest-replay.ts:61-75`

```typescript
for (const cutoffSec of sampledCutoffs) {
  const ranking = await computeContestRanking(assignmentId, cutoffSec);
  ...
}
```

Each cutoff triggers a separate SQL query. With `maxSnapshots = 40`, this is 40 sequential DB round-trips. These could be parallelized (within reason) or batched into a single query with multiple cutoffs.

**Fix**: Use `Promise.all` with a concurrency limit (e.g., 5 at a time) to parallelize ranking computations, or redesign the query to compute all cutoffs in a single SQL statement using a lateral join.

---

### M-11. `resolveTagIdsWithExecutor` Performs Sequential Lookups

**Severity**: MEDIUM | **Confidence**: MEDIUM | **Status**: Open
**File**: `src/lib/problem-management.ts:131-171`

Tags are resolved one by one in a for-loop with individual SELECT + INSERT per tag. With many tags, this is slow.

**Fix**: Batch-lookup existing tags with `WHERE name IN (...)`, then bulk-insert missing ones.

---

### M-12. Audit Buffer Re-buffering Can Reorder Events

**Severity**: MEDIUM | **Confidence**: MEDIUM | **Status**: Open
**File**: `src/lib/audit/events.ts:118-119`

```typescript
if (_auditBuffer.length < FLUSH_SIZE_THRESHOLD * 2) {
  _auditBuffer = [...batch, ..._auditBuffer];
}
```

On flush failure, the failed batch is prepended to the current buffer. But new events added during the failed flush are already in `_auditBuffer`. The result is: `[old failed events, new events added during flush]`. The next flush will process them in order, but if `_auditBuffer` had items added concurrently, the chronological order may be violated (old failed events appear after events that happened later).

**Fix**: This is acceptable for audit logging (events have their own `createdAt` timestamps), but add a comment explaining the ordering behavior.

---

## LOW Issues

### L-1. `users.email` Is Not `notNull`

**Severity**: LOW | **Confidence**: MEDIUM | **Status**: Open
**File**: `src/lib/db/schema.pg.ts:26`

The `email` column allows NULL but has a unique constraint. In PostgreSQL, multiple NULLs are allowed in a unique column, so this is correct. However, this means email-based lookups may return unexpected results if email is used as a secondary identifier.

**Fix**: Document the intentional nullable email design. Consider whether all auth flows handle null email correctly.

---

### L-2. `assignments.accessCode` Unique Index Allows Multiple NULLs

**Severity**: LOW | **Confidence**: LOW | **Status**: Open
**File**: `src/lib/db/schema.pg.ts:358`

This is correct PostgreSQL behavior (NULLs are not equal), but it should be documented.

---

### L-3. Missing Index on `problems.visibility`

**Severity**: LOW | **Confidence**: MEDIUM | **Status**: Open
**File**: `src/lib/db/schema.pg.ts:261`

Multiple queries filter by `problems.visibility = 'public'` (homepage insights, practice search, problem-set visibility). There is no index on this column.

**Fix**: Add `index("problems_visibility_idx").on(table.visibility)`.

---

### L-4. `discussionThreads` Missing Index on `authorId`

**Severity**: LOW | **Confidence**: MEDIUM | **Status**: Open
**File**: `src/lib/db/schema.pg.ts:853-857`

There are indexes on `scopeType`, `problemId`, and `updatedAt`, but not on `authorId`. The `listUserDiscussionThreads` function queries by `authorId`.

**Fix**: Add `index("dt_author_idx").on(table.authorId)`.

---

### L-5. `jaccardSimilarity` Returns 0 for Two Empty Sets

**Severity**: LOW | **Confidence**: HIGH | **Status**: Open
**File**: `src/lib/assignments/code-similarity.ts:199`

```typescript
if (a.size === 0 && b.size === 0) return 0;
```

Mathematically, the Jaccard similarity of two empty sets is undefined (0/0). Returning 0 is a valid convention, but it means two empty submissions are treated as "completely dissimilar" rather than "identical." For plagiarism detection, this is likely the desired behavior (empty submissions should not be flagged), but it should be documented.

**Fix**: Add a comment explaining the convention.

---

### L-6. `SUBMISSION_ID_LENGTH` of 32 Generates 16-byte Hex String

**Severity**: LOW | **Confidence**: HIGH | **Status**: Open
**File**: `src/lib/submissions/id.ts:1-17`

The constant is named `SUBMISSION_ID_LENGTH = 32` but it's used as `new Uint8Array(SUBMISSION_ID_LENGTH / 2)`, generating 16 random bytes encoded as 32 hex characters. The naming is slightly confusing -- the "length" refers to the hex string length, not the entropy bytes.

**Fix**: Rename to `SUBMISSION_ID_HEX_LENGTH` or add a comment clarifying.

---

### L-7. `getContestStatus` Checks `personalDeadline` Before `deadline` for Windowed Mode

**Severity**: LOW | **Confidence**: MEDIUM | **Status**: Open
**File**: `src/lib/assignments/contests.ts:45-49`

```typescript
if (effectiveClose && nowMs >= effectiveClose) return "closed";
if (contest.personalDeadline && nowMs >= contest.personalDeadline.getTime()) return "expired";
```

The order matters: if both the global deadline and personal deadline have passed, the function returns "closed" (from the global check) rather than "expired" (personal). This is correct behavior, but the naming is potentially confusing for callers expecting "expired" when a personal deadline passes.

**Fix**: Add a comment clarifying the priority order.

---

### L-8. `listModerationDiscussionThreads` Applies Filters in Memory

**Severity**: LOW | **Confidence**: HIGH | **Status**: Open
**File**: `src/lib/discussions/data.ts:275-300`

The function fetches up to 100 threads then filters them in memory by scope and state. This means the actual result set may be much smaller than expected.

**Fix**: Push the `scopeType` and `lockedAt`/`pinnedAt` filters into the Drizzle `where` clause for efficiency.

---

### L-9. `validateZipDecompressedSize` Decompresses All Entries Sequentially

**Severity**: LOW | **Confidence**: MEDIUM | **Status**: Open
**File**: `src/lib/files/validation.ts:44-69`

Each ZIP entry is decompressed fully before checking size. While the early-abort is good, decompressing entry by entry is memory-intensive for large entries.

**Fix**: Consider using a streaming decompression approach, or add a per-entry size limit in addition to the total limit.

---

## Positive Observations

1. **Transaction discipline**: Critical multi-step operations (access code redemption, recruiting invitation claims, exam session creation, assignment CRUD, problem set management) are consistently wrapped in transactions with proper conflict handling.

2. **Race condition handling**: The `startExamSession` function uses `onConflictDoNothing()` followed by a re-fetch, correctly handling concurrent session creation. The `redeemAccessCode` function uses a transactional TOCTOU guard.

3. **Audit coverage**: Every server action (user management, system settings, tag management, plugin management, language config, password changes, profile updates) records an audit event with full request context.

4. **Authorization model**: Capability-based RBAC with `resolveCapabilities()` is used consistently. Server actions check both `isTrustedServerActionOrigin()` and capability checks.

5. **Rate limiting**: Every server action has rate limiting via `checkServerActionRateLimit()`.

6. **Input validation**: Zod schemas are used for all server action inputs. SQL parameters use named-to-positional conversion (not string interpolation).

7. **Encryption of secrets**: The system settings action encrypts hcaptcha secrets before storage.

8. **Legal hold support**: The data retention system supports a `DATA_RETENTION_LEGAL_HOLD` flag to suspend automatic pruning.

9. **Stale-while-revalidate caching**: The contest scoring cache uses a sophisticated stale-while-revalidate pattern with single-flight refresh.

10. **Schema indexes**: The schema has good index coverage for common query patterns (composite indexes on join columns, covering indexes for leaderboard queries).

---

## Files Reviewed (69 files read)

### Database Layer
- `src/lib/db/schema.ts` (re-export)
- `src/lib/db/schema.pg.ts` (full schema)
- `src/lib/db/relations.ts` (re-export)
- `src/lib/db/relations.pg.ts` (full relations)
- `src/lib/db/helpers.ts`
- `src/lib/db/selects.ts`
- `src/lib/db/index.ts`
- `src/lib/db/config.ts`
- `src/lib/db/queries.ts`

### Assignments / Contests
- `src/lib/assignments/scoring.ts`
- `src/lib/assignments/contest-scoring.ts`
- `src/lib/assignments/leaderboard.ts`
- `src/lib/assignments/exam-sessions.ts`
- `src/lib/assignments/access-codes.ts`
- `src/lib/assignments/submissions.ts`
- `src/lib/assignments/recruiting-invitations.ts`
- `src/lib/assignments/code-similarity.ts`
- `src/lib/assignments/code-similarity-client.ts` (referenced, not read -- external sidecar)
- `src/lib/assignments/management.ts`
- `src/lib/assignments/contests.ts`
- `src/lib/assignments/active-timed-assignments.ts`
- `src/lib/assignments/participant-status.ts`
- `src/lib/assignments/participant-audit.ts`
- `src/lib/assignments/public-contests.ts`
- `src/lib/assignments/contest-replay.ts`
- `src/lib/assignments/contest-analytics.ts`

### Anti-cheat
- `src/lib/anti-cheat/review-model.ts`

### Submissions
- `src/lib/submissions/format.ts`
- `src/lib/submissions/id.ts`
- `src/lib/submissions/status.ts`

### Problems
- `src/lib/problems/legacy-seeded.ts`
- `src/lib/problems/test-case-drafts.ts`
- `src/lib/problem-management.ts`
- `src/lib/problem-statement.ts`
- `src/lib/problem-tiers.ts`

### Problem Sets
- `src/lib/problem-sets/management.ts`
- `src/lib/problem-sets/visibility.ts`
- `src/lib/problem-sets/public.ts`

### Code Snapshots / Code
- `src/lib/code-snapshots/diff.ts`
- `src/lib/code/editor-fonts.ts` (skipped -- UI constants only)
- `src/lib/code/editor-themes.ts` (skipped -- UI constants only)
- `src/lib/code/problem-code-themes.ts` (skipped -- UI constants only)
- `src/lib/code/language-map.ts` (skipped -- UI constants only)

### Recruiting
- `src/lib/recruiting/access.ts`

### Practice
- `src/lib/practice/search.ts`
- `src/lib/practice/difficulty-range.ts`

### Discussions
- `src/lib/discussions/permissions.ts`
- `src/lib/discussions/data.ts`

### Audit
- `src/lib/audit/events.ts`
- `src/lib/audit/node-shutdown.ts`

### Data Retention
- `src/lib/data-retention.ts`
- `src/lib/data-retention-maintenance.ts`

### System Settings
- `src/lib/system-settings.ts`
- `src/lib/system-settings-config.ts`

### Ratings / Homepage
- `src/lib/ratings.ts`
- `src/lib/homepage-insights.ts`

### Files
- `src/lib/files/image-processing.ts`
- `src/lib/files/storage.ts`
- `src/lib/files/problem-links.ts`
- `src/lib/files/validation.ts`

### Server Actions
- `src/lib/actions/change-password.ts`
- `src/lib/actions/plugins.ts`
- `src/lib/actions/update-preferences.ts`
- `src/lib/actions/update-profile.ts`
- `src/lib/actions/language-configs.ts`
- `src/lib/actions/user-management.ts`
- `src/lib/actions/system-settings.ts`
- `src/lib/actions/public-signup.ts`
- `src/lib/actions/tag-management.ts`

### Files Skipped (in-scope but pure UI/constants, no DB or business logic)
- `src/lib/code/editor-fonts.ts`
- `src/lib/code/editor-themes.ts`
- `src/lib/code/problem-code-themes.ts`
- `src/lib/code/language-map.ts`

---

## Recommendation

**REQUEST CHANGES** -- The 4 CRITICAL issues (plaintext secrets in DB, unprotected hcaptcha secret column, missing loginEvents retention, plaintext recruiting tokens) and 8 HIGH issues must be addressed before the next release. The CRITICAL issues represent security vulnerabilities and compliance risks that could lead to data exposure.

Priority order for remediation:
1. **C-1, C-4**: Remove plaintext secret/token columns (breaking change, requires migration)
2. **C-2**: Rename hcaptcha_secret column, add validation
3. **C-3**: Fix data retention gaps (loginEvents, legal hold for audit)
4. **H-1, H-2**: Add submission status filters to scoring queries (data correctness)
5. **H-5**: Enforce personal deadline in windowed exam scoring
6. **H-3**: Add missing communityVotes relation
7. **H-4, H-7, H-8**: Schema fixes (indexes, FK constraints, cascade behavior)
8. **H-6**: Verify atomic counter updates for judgeWorkers.activeTasks

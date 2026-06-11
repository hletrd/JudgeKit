# Comprehensive Code Review — JudgeKit

**Date:** 2026-04-09
**Scope:** Full repository (`src/`, `rate-limiter-rs/`, `judge-worker-rs/`, `code-similarity-rs/`, `scripts/`, `tests/`, `docs/`, deployment configs)
**Reviewers:** Multi-agent parallel review (8 lanes: admin/contest routes, judge/submission system, core API/business logic, DB/frontend/infra, security/auth/capabilities, scripts/config/infra, plus 2 prior review passes)
**Method:** Exhaustive file-by-file review, cross-file interaction analysis, deployment config audit

---

## Executive Summary

**Overall Assessment: REQUEST CHANGES**

The codebase has strong foundational security: Argon2id password hashing, timing-safe token comparison, Docker sandboxing with seccomp/capabilities, parameterized SQL via Drizzle ORM, nonce-based CSP headers, and comprehensive audit logging. A prior remediation pass addressed ~20 critical/high findings.

This review identifies **remaining** issues organized by severity. Many issues are TOCTOU race conditions in check-then-act patterns that should be wrapped in transactions.

| Severity | New in This Review | Previously Known (Open) | Total |
|----------|-------------------|--------------------------|-------|
| CRITICAL | 4 | 2 | 6 |
| HIGH | 22 | 5 | 27 |
| MEDIUM | 23 | 6 | 29 |
| LOW | 12 | 3 | 15 |
| **Total** | **61** | **16** | **77** |

### Previously Remediated (Not Repeated Here)
The following were identified in prior reviews (2026-04-07/08) and confirmed fixed in the current codebase:
- Audit shutdown handlers (C-05), Connection pool config (C-08), Password in response (H-01)
- Token replay protection (H-03), SSE cleanup guards (H-13), User update atomic (H-18)
- Cache refresh lock (M-05), Content-type check (M-09), Timer cleanup (M-18, M-19)
- IP spoofing fix (nginx XFF), Co-instructor group access, TA role restriction
- Export ordering + snapshot consistency, Import JSON body size limits
- Deploy SSH/AUTH_URL fixes, Worker heartbeat interval + orphan cleanup
- Docker build context fix, CI tsc + Rust test gates

---

## CRITICAL Issues

### NEW-C04. Password Rehash Race Condition (Fire-and-Forget)
**File:** `src/lib/auth/config.ts:203-214`
**Confidence:** High

Password rehash uses `.then()` fire-and-forget pattern. Login completes immediately without waiting for rehash. If DB update fails (caught only in `.catch()`), the user's password remains as a weak bcrypt hash indefinitely.

**Exploit:** Attacker gains session during rehash window. Or DB update failure leaves weak hash permanently — user never forced to re-auth, admin never notified.

**Fix:** Await the rehash with proper error handling. Track rehash failures and force re-auth on next login if failed.

---

### NEW-C01. Docker Image DELETE Allows Removing Arbitrary Images
**File:** `src/app/api/v1/admin/docker/images/route.ts:92-114`
**Confidence:** High

The DELETE handler accepts any `imageTag` without restricting to `judge-*` prefix. The POST (pull) handler validates `imageTag.startsWith("judge-")`, but DELETE passes the value directly to `removeDockerImage()`.

**Exploit:** Admin or compromised session sends `DELETE { imageTag: "postgres:16" }`, destroying the production database container image.

**Fix:** Add the same `judge-` prefix check: `if (!body.imageTag.startsWith("judge-") && !body.imageTag.includes("/judge-"))` return 400.

---

### NEW-C02. Fire-and-Forget Staleness Sweep Can Corrupt Worker State
**File:** `src/app/api/v1/judge/heartbeat/route.ts:66-73`
**Confidence:** High

The staleness sweep uses `void db.update(...)` — fires without `await`, discards errors. Under load, worker A's sweep can race with worker B's heartbeat that just set `status='online'`, flipping B back to "stale" because the sweep's WHERE clause uses a timestamp threshold.

**Exploit:** Under sustained load, legitimate workers get marked stale and stop receiving work, causing submission processing to stall.

**Fix:** Await the staleness sweep. Use a dedicated periodic job instead of piggybacking on heartbeats. Add `WHERE status = 'online'` condition.

---

### NEW-C03. User PATCH Update Non-Atomic (TOCTOU on Unique Fields)
**File:** `src/app/api/v1/users/[id]/route.ts:264-314`
**Confidence:** High

PATCH reads user, validates uniqueness via `ensureUniqueIdentityFields`, then updates — all outside a transaction. Two concurrent PATCHes renaming different users to the same username both pass the check.

**Exploit:** Admins A and B simultaneously rename users X and Y to "bob". Both pass `isUsernameTaken`. If DB unique constraint exists, one gets a 500. If not, duplicate usernames.

**Fix:** Wrap the entire PATCH in a transaction.

---

### OPEN-C01. TOCTOU Race in Submission Rate Limit Check
**File:** `src/app/api/v1/submissions/route.ts:213-281`
**Confidence:** High (from prior review)

Rate limit check queries submission counts without `SELECT FOR UPDATE`. Concurrent submissions from the same user both read the same count and pass the limit.

**Fix:** Add advisory lock: `tx.execute(sql\`SELECT pg_advisory_xact_lock(hashtext(${user.id}))\`)` before rate limit check.

---

### OPEN-C02. XSS via dangerouslySetInnerHTML in Problem Descriptions
**File:** `src/components/problem-description.tsx:37-44`
**Confidence:** High (from prior review)

Legacy HTML descriptions rendered with `dangerouslySetInnerHTML`. DOMPurify allows `href` attribute which can carry `javascript:` protocol in certain configurations.

**Fix:** Remove the `legacyHtmlDescription` branch. Always render through `ReactMarkdown` with `skipHtml`.

---

## HIGH Issues

### NEW-H19. Recruiting Token Auth Bypasses Rate Limiting
**File:** `src/lib/auth/config.ts:138-141`
**Confidence:** High

When `recruitToken` is provided, the function calls `authorizeRecruitingToken` immediately without any rate limiting check. Regular password login is rate-limited by IP and username, but recruiting token auth has no such protection.

**Exploit:** Attacker brute-forces recruiting tokens without rate limiting. If tokens are predictable, recruitment sessions can be compromised.

**Fix:** Apply the same rate limiting to recruiting token auth as password auth.

---

### NEW-H20. Missing SELECT FOR UPDATE in Rate-Limit Entry Lookup
**File:** `src/lib/security/rate-limit.ts:62-100`
**Confidence:** High

`getEntry` reads rate limit entries without row locking. Concurrent requests both read the same count and both increment, allowing rate limit bypass. The `api-rate-limit.ts` correctly uses `SELECT FOR UPDATE`, but this lower-level function does not.

**Exploit:** Two simultaneous login attempts from same IP both read `attempts=4` when limit is 5. Both proceed. The second should have been blocked.

**Fix:** Add `.for("update")` to the select query in `getEntry`, or ensure it's always called within a transaction that locks rows.

---

### NEW-H21. Role Cache Loading Race Returns Stale/Empty Data
**File:** `src/lib/capabilities/cache.ts:61-75`
**Confidence:** Medium

`ensureLoaded` sets `roleCache = null` before starting async reload. Any caller during this window gets an empty cache, potentially granting zero capabilities or causing errors. The old cache should be retained until new data is ready.

**Fix:** Hold reference to old cache until new one is loaded. Return old cache during refresh.

---

### NEW-H22. Unbounded Retry Loop in syncLanguageConfigsOnStartup
**File:** `src/lib/judge/sync-language-configs.ts:74-84`
**Confidence:** High

Retry loop uses unbounded `setTimeout` chain that never stops on persistent failures. If DB is permanently unavailable, retries continue indefinitely without backoff ceiling or max attempts.

**Fix:** Add max retry count with exponential backoff. Stop retrying after threshold and log critical error.

---

### NEW-H01. User Creation Double Hash + Missing 23505 Error Catch
**File:** `src/app/api/v1/users/route.ts:77-89`
**Confidence:** Medium

Password is hashed at line 78 via `validateAndHashPassword`, then thrown away and re-hashed at line 86. More critically, the error handling (lines 131-139) only catches custom `Error` messages, not PostgreSQL `23505` unique constraint violations that can still occur.

**Fix:** Catch `23505` errors explicitly in user creation, matching the pattern used in bulk route.

---

### NEW-H02. TOCTOU Race in Contest Invite
**File:** `src/app/api/v1/contests/[assignmentId]/invite/route.ts:95-136`
**Confidence:** High

Four separate queries (check token, insert token, check enrollment, insert enrollment) with no transaction. Concurrent invites for the same user cause unique constraint violations surfacing as 500.

**Fix:** Wrap in transaction, or use `onConflictDoNothing`.

---

### NEW-H03. TOCTOU Race in Role Creation
**File:** `src/app/api/v1/admin/roles/route.ts:67-91`
**Confidence:** High

Name uniqueness check and insert are separate queries. Concurrent role creation with same name creates duplicates if no DB unique constraint on `roles.name`.

**Fix:** Add DB unique constraint on `roles.name`, use `onConflictDoUpdate`.

---

### NEW-H04. TOCTOU Race in Role Deletion
**File:** `src/app/api/v1/admin/roles/[id]/route.ts:108-156`
**Confidence:** Medium

User count check and role DELETE are separate queries. Between them, users can be assigned the role.

**Fix:** Wrap in transaction with `SELECT ... FOR UPDATE`.

---

### NEW-H05. TOCTOU Race in Member Enrollment
**File:** `src/app/api/v1/groups/[id]/members/route.ts:98-117`
**Confidence:** High

Enrollment existence check and insert are separate. Concurrent adds cause unhandled unique constraint violation (500).

**Fix:** Use `onConflictDoNothing()` and check affected rows.

---

### NEW-H06. TOCTOU Race in Member Removal
**File:** `src/app/api/v1/groups/[id]/members/[userId]/route.ts:44-55`
**Confidence:** Medium

Submission check and enrollment DELETE are separate. Student can submit between check and delete, creating orphaned submissions.

**Fix:** Wrap in transaction with locking.

---

### NEW-H07. Missing CSRF on Migrate Export Endpoint
**File:** `src/app/api/v1/admin/migrate/export/route.ts:10-44`
**Confidence:** Medium

GET endpoint exports entire database. Uses `getApiUser` directly, not `createApiHandler`. Unlike backup/restore routes, no CSRF check. Cross-origin request from malicious site could trigger export.

**Fix:** Add CSRF check, or convert to POST.

---

### NEW-H08. Recruiting Invitation Allows Arbitrary Status Transitions
**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:23-57`
**Confidence:** Medium

PATCH accepts any status value. No state machine validation. "redeemed" can be changed back to "pending", allowing invitation reuse.

**Fix:** Validate transitions: pending→revoked/redeemed, revoked→pending, but redeemed cannot go back.

---

### NEW-H09. Rejudge Does Not Clear judgeWorkerId
**File:** `src/app/api/v1/submissions/[id]/rejudge/route.ts:37-52`
**Confidence:** High

Resets status, score, claimToken, etc. but NOT `judgeWorkerId`. The previous worker's ID persists until the next claim, confusing monitoring/audit.

**Fix:** Add `judgeWorkerId: null` to the rejudge SET clause.

---

### NEW-H10. Worker Can Claim Unlimited Submissions (No Concurrency Check)
**File:** `src/app/api/v1/judge/claim/route.ts`
**Confidence:** Medium

`workerId` is never validated against `judgeWorkers` table. No check that worker exists, is online, or has capacity. No FK from `submissions.judge_worker_id` to `judge_workers.id`.

**Fix:** Validate workerId, check status="online", verify `activeTasks < concurrency`.

---

### NEW-H11. In-Progress Poll Update Not in Transaction
**File:** `src/app/api/v1/judge/poll/route.ts:57-68`
**Confidence:** High

In-progress status updates use UPDATE + separate SELECT outside a transaction. Terminal statuses correctly use a transaction. Between UPDATE and SELECT, another worker can claim the submission.

**Fix:** Wrap in-progress path in transaction, matching terminal status pattern.

---

### NEW-H12. Deregister Does Not Release In-Progress Claims
**File:** `src/app/api/v1/judge/deregister/route.ts:42-53`
**Confidence:** High

Sets worker offline but does NOT release submissions claimed by this worker. They remain stuck in "queued"/"judging" for up to `staleClaimTimeoutMs` (default 300s).

**Fix:** On deregister, release all claimed submissions: `status='pending'`, `judgeClaimToken=null`, `judgeClaimedAt=null`.

---

### NEW-H13. File DELETE Non-Atomic (Disk Before DB)
**File:** `src/app/api/v1/files/[id]/route.ts:151-152`
**Confidence:** High

Disk delete happens before DB delete. If DB delete fails, file is gone but DB row persists (orphan record → 404 on access). Same pattern in bulk-delete.

**Fix:** Delete from DB first, then disk. Log disk failures for cleanup.

---

### NEW-H14. Bulk User Create Error Parsing Fragile
**File:** `src/app/api/v1/users/bulk/route.ts:121`
**Confidence:** Medium

Error handling parses PostgreSQL error message string to determine username vs email conflict. Message format can change across PG versions/locales.

**Fix:** Parse constraint name from `err.constraint` instead of string-matching `err.message`.

---

### NEW-H15. Seed Endpoint LIKE Wildcard Injection
**File:** `src/app/api/v1/test/seed/route.ts:177-188`
**Confidence:** High

`like(users.username, '${prefix}%')` doesn't escape LIKE metacharacters. `_` in prefix acts as single-char wildcard. `e2e-_` matches `e2e-a`, `e2e-b`, etc.

**Fix:** Escape `%`, `_`, `\` in prefix before passing to `like()`.

---

### NEW-H16. Recruiting Token Creates Unrecoverable Passwordless User
**File:** `src/lib/assignments/recruiting-invitations.ts:256-266`
**Confidence:** Medium

Creates user with `passwordHash: null` and `mustChangePassword: true`. User has no way to log in if session is lost — no known username, no password.

**Fix:** Generate temporary password or ensure redemption returns a session token.

---

### NEW-H17. rawQueryOne/rawQueryAll Bypass SQL Injection Protection
**File:** `src/lib/db/queries.ts:31-52`
**Confidence:** Medium

These functions accept raw SQL with `@param` substitution. If any caller concatenates user input into the SQL string (not via `@param`), injection occurs. The functions bypass Drizzle's query builder protections.

**Fix:** Audit all callers. Add doc warning. Consider restricting to internal admin-only use.

---

### NEW-H18. Problem PATCH Test Case Sort-Order Matching Fragile
**File:** `src/app/api/v1/problems/[id]/route.ts:126-134`
**Confidence:** High

PATCH merges test cases by positional index after sorting by `sortOrder`. If two test cases share the same `sortOrder`, sort is non-deterministic, causing cross-contamination (TC-A's input with TC-B's expected output).

**Fix:** Match by `id` field instead of positional index.

---

### OPEN-H01. Container Escape via Workspace Directory
**File:** `src/lib/compiler/execute.ts:44, 530`
**Confidence:** High (from prior review)

`WORKSPACE_BASE` defaults to `tmpdir()`, chmod `0o777`. Symlink attack from compromised container.

**Fix:** Use dedicated isolated base directory. Restrict to `0o755`.

---

### OPEN-H02. API Key Partially Exposed in Client
**File:** `src/lib/plugins/chat-widget/admin-config.tsx:85-88`
**Confidence:** High (from prior review)

API key first 3 + last 4 chars sent to client via React DevTools accessible data.

**Fix:** Replace with boolean `hasKey` status only.

---

### OPEN-H03. Weak Encryption Key Fallback for Plugin Secrets
**File:** `src/lib/plugins/secrets.ts:8-16`
**Confidence:** High (from prior review)

Falls back to `AUTH_SECRET` if `PLUGIN_CONFIG_ENCRYPTION_KEY` not set. Violates cryptographic separation.

**Fix:** Require `PLUGIN_CONFIG_ENCRYPTION_KEY` as separate env var.

---

### OPEN-H04. TOCTOU Race in User Creation (Username/Email)
**File:** `src/app/api/v1/users/route.ts:85-90`
**Confidence:** High (from prior review)

Uniqueness checks outside transaction. Concurrent creates can produce duplicates.

**Fix:** Move into transaction, catch `23505`.

---

### OPEN-H05. Missing Index on lower(username)
**File:** `src/lib/db/schema.pg.ts`
**Confidence:** High (from prior review)

No functional index on `lower(username)` for case-insensitive lookups. Sequential scan at scale.

**Fix:** Add `CREATE INDEX users_lower_username_idx ON users (lower(username))`.

---

## MEDIUM Issues

### NEW-M21. Missing parseInt Validation for Security-Critical Env Vars
**File:** `src/lib/system-settings-config.ts:88-95`
**Confidence:** Medium

`resolveValue` uses `parseInt(envVal, 10)` without checking for NaN, Infinity, or negative values. Environment variables like `RATE_LIMIT_MAX_ATTEMPTS=-1` or `999999999` could bypass rate limiting entirely or cause integer overflow.

**Fix:** Validate: `if (!Number.isFinite(parsed) || parsed < 0)` skip and use default.

---

### NEW-M22. Auth Cache Eviction Not Thread-Safe (proxy.ts)
**File:** `src/proxy.ts:30-36`
**Confidence:** Medium

FIFO cache eviction between size check and delete is not atomic. Under high concurrency, cache can exceed `AUTH_CACHE_MAX_SIZE`. Also, cache key uses `userId:authenticatedAtSeconds` which could collide if tokens are issued at the exact same second.

**Fix:** Use a proper LRU cache library with atomic operations.

---

### NEW-M23. Timing-Safe Comparison Length Side-Channel
**File:** `src/lib/security/timing.ts:9-14`
**Confidence:** Medium

`safeTokenCompare` doesn't check length equality first. HMAC computation time varies with input length, creating a timing side-channel for token length discovery.

**Fix:** Add early length check: `if (provided.length !== expected.length) return false;` — length is public information, so this doesn't leak.

---

### NEW-M01. Unbounded configValues Spread in Settings PUT
**File:** `src/app/api/v1/admin/settings/route.ts:25-41`
**Confidence:** Medium

`...configValues` spreads unknown keys into DB write. If schema is permissive with extra keys, arbitrary column names could cause DB errors.

**Fix:** Explicitly enumerate allowed config value keys.

---

### NEW-M02. Docker Build Path from DB-Derived Value
**File:** `src/app/api/v1/admin/docker/images/build/route.ts:22-43`
**Confidence:** Low (defense-in-depth)

`dockerfilePath` derived from `langConfig.dockerImage` (DB column). Path traversal check is present but subtle.

**Fix:** Add explicit check that resolved real path starts with `docker/` prefix.

---

### NEW-M03. Quick-Create Contest No Problem ID Validation
**File:** `src/app/api/v1/contests/quick-create/route.ts:21-89`
**Confidence:** Medium

`problemIds` validated as string array but not checked against DB. Non-existent IDs create broken assignment references.

**Fix:** Query DB to verify all problem IDs exist before inserting.

---

### NEW-M04. LRU Cache Per-Process (Anti-Cheat)
**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:14-15`
**Confidence:** Medium

In-memory LRU cache local to each process. Multi-instance deployment causes duplicate heartbeat rows (up to Nx frequency).

**Fix:** Use shared cache (Redis/DB) for heartbeat dedup, or document single-instance requirement.

---

### NEW-M05. Anti-Cheat GET No Lower Bound on limit Parameter
**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:135-136`
**Confidence:** Medium

`Math.min(Number(limit), 500)` caps upper bound but no lower bound. Negative limit causes unexpected behavior.

**Fix:** Clamp: `Math.max(1, Math.min(Number(limit), 500))`.

---

### NEW-M06. Unbounded Test Case Fetch in Claim Response
**File:** `src/app/api/v1/judge/claim/route.ts:138-142`
**Confidence:** High

Fetches ALL test cases including input/output blobs. 10K test cases × 50KB = ~500MB per claim.

**Fix:** Paginate test case delivery, or enforce max test case count at problem level.

---

### NEW-M07. SSE Poll Timer No Minimum Interval
**File:** `src/app/api/v1/submissions/[id]/events/route.ts:107-112`
**Confidence:** High

Config-driven poll interval with no minimum. Misconfigured `ssePollIntervalMs=0` hammers DB.

**Fix:** Clamp to minimum 1000ms. Use setTimeout-based recursive pattern.

---

### NEW-M08. SSE Connection Tracking Memory Accumulation
**File:** `src/app/api/v1/submissions/[id]/events/route.ts:23-24`
**Confidence:** High

Module-level globals `activeConnectionSet`/`connectionInfoMap` accumulate if cleanup doesn't fire. Under sustained load with SSE connections opening faster than cleanup, memory grows unbounded. The 500-connection global cap helps but may be insufficient.

**Fix:** Add Map size cap in cleanup timer. Consider WeakRef pattern.

---

### NEW-M09. cleanupOldEvents Race Condition (TOCTOU)
**File:** `src/lib/db/cleanup.ts:14-26`
**Confidence:** High

SELECT count + separate DELETE not in transaction. Inaccurate reported counts, concurrent cleanup overlap.

**Fix:** Use `DELETE ... RETURNING` or `WITH deleted AS (DELETE ... RETURNING *) SELECT count(*)`.

---

### NEW-M10. exportDatabase() Memory Accumulation
**File:** `src/lib/db/export.ts:258-287`
**Confidence:** High

Non-streaming variant accumulates entire table in memory despite pagination. Can OOM on large datasets.

**Fix:** Document memory implications, recommend `streamDatabaseExport()` for large datasets.

---

### NEW-M11. importDatabase() Reports Success on Failed Batches
**File:** `src/lib/db/import.ts:183-201`
**Confidence:** Medium

Failed batch inserts counted as "skipped". `success` flag remains `true` even with data loss.

**Fix:** Set `success = false` when any rows are skipped.

---

### NEW-M12. Missing Index on submissions(assignmentId, userId, submittedAt)
**File:** `src/lib/db/schema.pg.ts:460-469`
**Confidence:** Medium

No composite index for leaderboard queries needing `ORDER BY submittedAt`. Large contests cause slow queries.

**Fix:** Add index on `(assignmentId, userId, submittedAt DESC)`.

---

### NEW-M13. Contest Ranking Error Swallowed Silently
**File:** `src/lib/assignments/contest-scoring.ts:100-113`
**Confidence:** Medium

Stale-while-revalidate uses `.catch(() => {})`. Repeated failures invisible in logs; stale cache served indefinitely.

**Fix:** Log the error inside `.catch()`.

---

### NEW-M14. Group Member Listing Unpaginated
**File:** `src/app/api/v1/groups/[id]/members/route.ts:19-34`
**Confidence:** High

Returns all enrollment rows in one response. Large groups cause memory/latency issues.

**Fix:** Add pagination parameters.

---

### NEW-M15. Group Page Fetches All Users Without Pagination
**File:** `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:157-194`
**Confidence:** High

Fetches ALL active students and non-student users for instructor dropdowns. 10K+ users causes slow page loads.

**Fix:** Use search/autocomplete pattern instead of loading all users.

---

### NEW-M16. use-source-draft Recreates Store on Language Array Reference Change
**File:** `src/hooks/use-source-draft.ts:213-216`
**Confidence:** Medium

`createDraftStore` in `useMemo` with `availableLanguages` dependency. New array reference discards current draft state.

**Fix:** Use deep-equality comparison or stable reference for language identifiers.

---

### NEW-M17. use-unsaved-changes-guard Monkey-Patches window.history
**File:** `src/hooks/use-unsaved-changes-guard.ts:234-268`
**Confidence:** High (acknowledged tech debt)

Patches `pushState`/`replaceState` — fragile with Next.js App Router internal usage.

**Fix:** Migrate to Navigation API when browser support is sufficient.

---

### NEW-M18. File Upload Client Limit Not Synced with Server
**File:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:38`
**Confidence:** High

Hardcoded 50MB client limit independent of server `uploadMaxFileSizeBytes` setting.

**Fix:** Pass configured limits from server component as props.

---

### NEW-M19. Problem Page Metadata Leaks Private Problem Titles
**File:** `src/app/(dashboard)/dashboard/problems/[id]/page.tsx:32-48`
**Confidence:** Medium

`generateMetadata` always includes problem title in `<title>` and `og:title`, even for private problems. Description is gated but title is not.

**Fix:** Return generic title for non-public problems.

---

### NEW-M20. Missing Index on rate_limits.lastAttempt
**File:** `src/lib/db/schema.pg.ts:537-554`
**Confidence:** High (from prior review)

No index on `lastAttempt`. Eviction cleanup triggers full table scans.

**Fix:** Add `index("rate_limits_last_attempt_idx").on(table.lastAttempt)`.

---

### OPEN-M01. Auth Cache TTL Allows Stale Access
**File:** `src/proxy.ts:16-36`
**Confidence:** High (from prior review)

2s FIFO cache serves stale auth results after session invalidation.

**Fix:** Make TTL configurable via env var, reduce for production.

---

### OPEN-M02. CSP Contains unsafe-inline for Styles
**File:** `src/proxy.ts:66-77`, `next.config.ts:46-59`
**Confidence:** High (from prior review)

`style-src 'self' 'unsafe-inline'` enables style injection.

**Fix:** Migrate to nonce-based style CSP or CSP level 3 `strict-dynamic`.

---

### OPEN-M03. LIKE-Based File Access Check
**File:** `src/app/api/v1/files/[id]/route.ts:31-39`
**Confidence:** High (from prior review)

File access determined by LIKE pattern match on `problems.description`. O(n) full table scan, false positives.

**Fix:** Quote the pattern or maintain explicit `problem_files` join table.

---

### OPEN-M04. Missing Plugin Error Isolation
**File:** `src/lib/plugins/data.ts:22-61`
**Confidence:** Medium (from prior review)

One corrupted plugin row causes `getPluginState` to fail for all plugins.

**Fix:** Wrap each plugin's config retrieval in try-catch.

---

### OPEN-M05. Missing Retry-After Header on Chat Rate Limit
**File:** `src/app/api/v1/plugins/chat-widget/chat/route.ts:289-297`
**Confidence:** Medium (from prior review)

429 response without `Retry-After` header.

**Fix:** Add `Retry-After` header.

---

### OPEN-M06. Multi-Instance SSE/Anti-Cheat Incompatibility
**File:** SSE events route, anti-cheat route
**Confidence:** Medium (from prior review)

SSE connection tracking and anti-cheat heartbeat dedupe use process-local memory. Breaks in horizontal scaling.

**Fix:** Document single-instance requirement, or move to shared backend.

---

## LOW Issues

### NEW-L01. ValidateShellCommand Incomplete Blocking
**File:** `src/lib/compiler/execute.ts:127-133`
**Confidence:** High

Blocks `<(...)` and `$(...)` but allows bare `>` and `|`. Limited blast radius due to Docker isolation.

**Fix:** Add `|` and bare `>`/`<` to blocked pattern, or remove validation and document commands as trusted.

---

### NEW-L02. Compiler Workspace No Process-Specific Prefix
**File:** `src/lib/compiler/execute.ts:535-537`
**Confidence:** Medium

UUID for uniqueness but no process PID prefix in shared workspace environments.

**Fix:** Add `compiler-${process.pid}-${randomUUID()}` prefix.

---

### NEW-L03. SSE Never Reconnects on Transient Failure
**File:** `src/hooks/use-submission-polling.ts:128-174`
**Confidence:** Low

Falls back to fetch polling permanently on any SSE error, even transient ones.

**Fix:** Retry SSE once or twice before permanent fallback.

---

### NEW-L04. Problem Description Links Open Arbitrary URLs
**File:** `src/components/problem-description.tsx:40-47`
**Confidence:** Medium

`skipHtml` prevents XSS but links have no URL protocol validation. Phishing links possible.

**Fix:** Add `rel="noreferrer noopener"` explicitly. Optionally validate URL starts with `http(s)://`.

---

### NEW-L05. Contest Page Wasteful Query When No Problems
**File:** `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:456`
**Confidence:** High

`hasExistingSubmissions` queries with empty string if `sortedProblems` is empty. Wastes a DB query.

**Fix:** Skip check when `sortedProblems` is empty.

---

### NEW-L06. Contest Access Code No Lower Bound on limit
**File:** `src/app/api/v1/contests/[assignmentId]/access-code/route.ts`
**Confidence:** Medium

Same negative-limit issue as anti-cheat.

**Fix:** Clamp to `Math.max(1, ...)`.

---

### NEW-L07. importDatabase Batch Size Not Configurable
**File:** `src/lib/db/import.ts`
**Confidence:** Low

Hardcoded batch size of 100. Large rows may need smaller batches.

**Fix:** Make configurable or auto-adjust based on row size.

---

### NEW-L08. systemSettings `$defaultFn` Misleading
**File:** `src/lib/db/schema.pg.ts:492-494`
**Confidence:** High

`$defaultFn(() => "global")` suggests dynamic ID but value is always static "global".

**Fix:** Use `.default("global")` for clarity.

---

### NEW-L09. tags Table Uses uniqueIndex Instead of .unique()
**File:** `src/lib/db/schema.pg.ts:840-858`
**Confidence:** High

Functionally equivalent in PG but inconsistent with other tables.

**Fix:** Use column-level `.unique()` for consistency.

---

### NEW-L10. validateProfileFields Discards Parsed Result
**File:** `src/app/api/v1/users/[id]/route.ts:51-66`
**Confidence:** Medium

Validates profile fields but returns null on success. Subsequent code uses raw body values, bypassing schema transformations (e.g., trimming).

**Fix:** Return parsed data and use it for updates.

---

### NEW-L11. Docker Image Build Verification Suppressed
**File:** `Dockerfile.judge-worker:17-22`
**Confidence:** High

Worker binary verification failures suppressed with `|| true`.

**Fix:** Remove `|| true` to catch build issues.

---

### NEW-L12. CDN Scripts Without Subresource Integrity
**File:** `static-site/html/*/index.html`
**Confidence:** Medium (from prior review)

External CDN scripts (MathJax, polyfills) without `integrity` attribute.

**Fix:** Add SRI hashes.

---

### OPEN-L01. Rate Limit Eviction Interval Too Long
**File:** `src/lib/security/rate-limit.ts:43-60`
**Confidence:** Medium (from prior review)

60s eviction interval allows memory accumulation under high traffic.

---

### OPEN-L02. Verdict Score Floating Point Precision
**File:** `src/lib/judge/verdict.ts:13-42`
**Confidence:** High (from prior review)

`(passed / results.length) * 100` produces floating point scores.

**Fix:** `Math.round((passed * 10000) / results.length) / 100` for 2-decimal precision.

---

### OPEN-L03. Missing Service Dependencies in Systemd Unit
**File:** `scripts/online-judge.service`
**Confidence:** High (from prior review)

No `After=postgresql.service` or `Wants=docker.service`.

**Fix:** Add service dependencies.

---

## Positive Observations

1. **Argon2id password hashing** with OWASP-compliant parameters
2. **Timing-safe token comparison** using HMAC + `timingSafeEqual`
3. **Docker sandboxing** with seccomp profiles, dropped capabilities, noexec tmpfs
4. **CSRF protection** on most API routes via `X-Requested-With` header
5. **CSP headers** with nonce-based script-src
6. **SQL injection prevention** via Drizzle ORM parameterized queries
7. **Session invalidation** via `tokenInvalidatedAt` timestamp
8. **Comprehensive audit logging** with batch insertion
9. **Path traversal prevention** in file storage
10. **Open redirect prevention** in auth redirects
11. **Good test coverage** with strict per-module thresholds for security/auth
12. **Proper cascade delete** on most foreign keys
13. **Timing-safe dummy password hash** preventing user enumeration
14. **Idempotent language config sync** with upsert
15. **Systemd hardening** with `ProtectSystem=strict`, `NoNewPrivileges=true`

---

## Priority Remediation Plan

### Phase 1 — Immediate (Security-Critical)

| ID | Description | Effort |
|----|-------------|--------|
| NEW-C01 | Docker image DELETE prefix restriction | Small |
| NEW-C02 | Fix staleness sweep race | Medium |
| NEW-C03 | Wrap user PATCH in transaction | Small |
| OPEN-C01 | Submission rate limit advisory lock | Small |
| OPEN-C02 | Remove dangerouslySetInnerHTML | Small |

### Phase 2 — This Sprint (Data Integrity)

| ID | Description | Effort |
|----|-------------|--------|
| NEW-H01 | Catch 23505 in user creation | Small |
| NEW-H02 | Wrap contest invite in transaction | Small |
| NEW-H03 | Add unique constraint on roles.name | Small |
| NEW-H05 | Use onConflictDoNothing for enrollment | Small |
| NEW-H09 | Clear judgeWorkerId on rejudge | Trivial |
| NEW-H12 | Release claims on deregister | Small |
| NEW-H13 | Fix file delete ordering | Small |
| NEW-H15 | Escape LIKE wildcards in seed | Small |
| NEW-H18 | Match test cases by ID not position | Small |
| OPEN-H01 | Workspace directory isolation | Small |
| OPEN-H05 | Add lower(username) index | Small |

### Phase 3 — Next Sprint (Hardening)

| ID | Description | Effort |
|----|-------------|--------|
| NEW-H04 | Role deletion transaction | Small |
| NEW-H06 | Member removal transaction | Small |
| NEW-H07 | CSRF on migrate export | Small |
| NEW-H08 | Invitation state machine validation | Small |
| NEW-H10 | Worker concurrency validation | Medium |
| NEW-H11 | In-progress poll transaction | Small |
| NEW-H16 | Recruiting token password handling | Medium |
| NEW-H17 | Audit rawQuery callers | Medium |
| NEW-M06 | Bound test case fetch | Medium |
| NEW-M07 | SSE poll interval minimum | Trivial |
| NEW-M14 | Paginate group members | Medium |
| OPEN-M01 | Auth cache TTL configurable | Small |

---

## Files Requiring Immediate Attention

1. `src/app/api/v1/admin/docker/images/route.ts` — Arbitrary image deletion
2. `src/app/api/v1/judge/heartbeat/route.ts` — Staleness sweep race
3. `src/app/api/v1/users/[id]/route.ts` — Non-atomic PATCH
4. `src/app/api/v1/users/route.ts` — Missing 23505 catch
5. `src/app/api/v1/submissions/route.ts` — Rate limit TOCTOU
6. `src/components/problem-description.tsx` — XSS
7. `src/app/api/v1/judge/deregister/route.ts` — Claims not released
8. `src/app/api/v1/files/[id]/route.ts` — Delete ordering + LIKE access
9. `src/app/api/v1/submissions/[id]/rejudge/route.ts` — judgeWorkerId leak
10. `src/lib/compiler/execute.ts` — Container isolation

---

## Review Coverage Confirmation

- [x] Admin API routes (settings, backup, restore, api-keys, roles, migrate, docker)
- [x] Contest API routes (leaderboard, similarity, anti-cheat, invitations, join, quick-create)
- [x] Group API routes (CRUD, members, assignments, overrides, instructors)
- [x] Judge system (claim, poll, heartbeat, register, deregister)
- [x] Submission system (CRUD, events SSE, rejudge, comments)
- [x] Compiler/execution (Docker sandboxing, workspace, command validation)
- [x] User management (create, update, bulk, profile)
- [x] Problem management (CRUD, test cases, import/export)
- [x] File management (upload, download, delete, bulk-delete)
- [x] Authentication (login, session, password, recruiting tokens)
- [x] Authorization (roles, capabilities, permissions, group access)
- [x] Security layer (rate limiting, CSRF, CSP, sanitization, timing-safe, IP extraction)
- [x] Database layer (schema, indexes, export, import, cleanup, queries)
- [x] Plugin system (chat widget, secrets encryption, providers)
- [x] Frontend components (server + client, hooks, state management)
- [x] Deployment scripts (Docker, systemd, nginx, SSH)
- [x] CI/CD configuration
- [x] Rust services (judge-worker-rs, code-similarity-rs, rate-limiter-rs)
- [x] Documentation (README, AGENTS.md, language docs)
- [x] Non-relevant artifacts (node_modules, .next, migration metadata) explicitly excluded

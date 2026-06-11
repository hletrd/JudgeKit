# Comprehensive Code Review — JudgeKit

**Date:** 2026-04-10
**Scope:** Full repository — 190+ files across TypeScript/Next.js app, 3 Rust microservices, Docker infrastructure, CI/CD, tests, deployment scripts, and documentation.
**Method:** 6 parallel Opus-tier review agents covering: (1) auth/security/API framework, (2) judge/submission system, (3) database/data layer, (4) admin/user/group/plugin routes, (5) frontend/components/hooks, (6) Rust services/infrastructure/tests.
**Baseline verification:** `tsc --noEmit` ✅, `npm run lint` ✅, `cargo check` ✅ (all 3 Rust crates), `cargo test` ✅ (29 passed, judge-worker)

---

## Executive Summary

**Overall Assessment: REQUEST CHANGES**

The codebase demonstrates strong engineering: Argon2id hashing, timing-safe comparisons, Docker sandboxing with seccomp, advisory locks on submissions, capability-based authorization, streaming exports with backpressure, and comprehensive audit logging. However, this review identified **6 CRITICAL**, **16 HIGH**, **21 MEDIUM**, and **16 LOW** findings across correctness, edge cases, data integrity, and maintainability.

The most urgent issues are:
1. **Data corruption** — worker deregistration releases already-judged submissions; import metadata sets are incorrect
2. **Logic bugs** — seccomp retry uses `.all()` instead of `.any()`; Docker timestamps break across midnight
3. **Schema drift** — missing migrations for indexes/columns defined in schema but not in SQL
4. **Race conditions** — uniqueness checks running outside transactions; bulk create aborts on first constraint violation

| Severity | Count |
|----------|-------|
| CRITICAL | 6 |
| HIGH | 16 |
| MEDIUM | 21 |
| LOW | 16 |
| **Total** | **59** |

---

## CRITICAL Issues (Fix Immediately)

### C-01. Worker deregistration releases already-judged submissions back to `pending`

**File:** `src/app/api/v1/judge/deregister/route.ts:59-76`
**Confidence:** High
**Lane:** Judge/Submission

The deregistration handler finds all submissions with `judgeWorkerId = workerId` and resets them to `pending`. But `judgeWorkerId` is set at claim time and never cleared on final verdict. This means fully judged submissions (accepted, wrong_answer, etc.) are also reset, causing data corruption — verdicts, scores, and test results get wiped.

**Failure:** Worker judges 50 submissions, then deregisters. All 50 are reset to pending and re-judged.

**Fix:** Add status filter: `inArray(submissions.status, ['pending', 'queued', 'judging'])`.

---

### C-02. `should_retry_without_seccomp` uses `.all()` instead of `.any()`

**File:** `judge-worker-rs/src/docker.rs:159-161`
**Confidence:** High
**Lane:** Infra/Rust

The function requires ALL three error snippets to be present simultaneously. Docker only emits one. Seccomp failures are never detected, and the broken result is passed through as a runtime error.

**Fix:** Change `.all()` to `.any()`.

---

### C-03. Docker timestamp duration calculation breaks across midnight

**File:** `judge-worker-rs/src/docker.rs:73-96, 119-127`
**Confidence:** High
**Lanes:** Infra/Rust + Judge/Submission

`parse_timestamp_nanos_since_midnight` discards the date. Container runs spanning midnight produce incorrect durations, falling back to wall-clock timing that includes Docker overhead. The same issue exists in `src/lib/compiler/execute.ts:139-172`.

**Failure:** Correct solution at midnight boundary reported as TLE due to inflated execution time.

**Fix:** Parse full ISO 8601 timestamps including date.

---

### C-04. `SET CONSTRAINTS ALL DEFERRED` is a no-op — all FK constraints are NOT DEFERRABLE

**File:** `src/lib/db/import.ts:150`
**Confidence:** High
**Lane:** Database

PostgreSQL's `SET CONSTRAINTS ALL DEFERRED` silently does nothing for non-deferrable constraints. Currently masked by TABLE_ORDER inserting parents first, but provides false safety.

**Fix:** Either make constraints DEFERRABLE via migration or remove the misleading call and document the ordering dependency.

---

### C-05. `recruitingInvitations.createdBy` has no `onDelete` — blocks user deletion

**File:** `src/lib/db/schema.pg.ts:748-750`
**Confidence:** High
**Lane:** Database

The FK defaults to `NO ACTION`. Deleting a user who created invitations fails with unhandled FK violation. `deleteUserPermanently` does not clean up invitations.

**Fix:** Change to `onDelete: "set null"` (requires dropping `notNull`), add migration.

---

### C-06. Import `BOOLEAN_COLUMNS` contains non-boolean column and is missing actual boolean columns

**File:** `src/lib/db/import.ts:70-75`
**Confidence:** High
**Lane:** Database

`"lectureMode"` is a `text` column, not boolean — `Boolean("dark")` → `true`, corrupting data. Missing: `showCompileOutput`, `showDetailedResults`, `showRuntimeErrors`, `allowAiAssistant`, `enableAntiCheat`, `anonymousLeaderboard`, `showResultsToCandidate`, `hideScoresFromCandidates`, `enabled`.

**Fix:** Remove `lectureMode`, add all actual boolean columns. Consider deriving from schema metadata.

---

## HIGH Issues

### H-01. User PATCH uniqueness check runs outside transaction scope

**Files:** `src/app/api/v1/users/[id]/route.ts:312-330`
**Confidence:** High | **Lanes:** Auth + Routes

`ensureUniqueIdentityFields` queries the main `db` connection, not the `tx`. Concurrent PATCH requests can both pass uniqueness checks.

**Fix:** Pass `tx` to the uniqueness check functions.

---

### H-02. Bulk user create transaction aborts on first constraint violation

**File:** `src/app/api/v1/users/bulk/route.ts:124-159`
**Confidence:** Medium | **Lane:** Routes

PostgreSQL aborts the entire transaction after a failed INSERT (code `23505`). Without SAVEPOINTs, users 4-10 all fail even if valid.

**Fix:** Use SAVEPOINTs, `ON CONFLICT DO NOTHING`, or pre-validate all entries.

---

### H-03. Worker deletion not in transaction (TOCTOU)

**File:** `src/app/api/v1/admin/workers/[id]/route.ts:80-96`
**Confidence:** High | **Lanes:** Routes + Judge

Submission reclaim and worker delete are separate operations. Race between two admin DELETE calls can leave submissions stuck.

**Fix:** Wrap in `execTransaction`.

---

### H-04. Worker capacity check is racy — no atomic decrement

**File:** `src/app/api/v1/judge/claim/route.ts:50-67`
**Confidence:** High | **Lane:** Judge

`activeTasks` check is not locked. Two concurrent claims from the same worker both pass the check.

**Fix:** Atomic increment inside the claim CTE or document as best-effort.

---

### H-05. `syncLanguageConfigsOnStartup` retry has double-stacked delays

**File:** `src/lib/judge/sync-language-configs.ts:66-92`
**Confidence:** High | **Lane:** Judge

Nested `setTimeout` calls create parallel retry chains on persistent failures.

**Fix:** Simplify to single async loop with `await`.

---

### H-06. `recordRateLimitFailureMulti` is not atomic across keys

**File:** `src/lib/security/rate-limit.ts:160-164`
**Confidence:** High | **Lane:** Auth

Each key is recorded in a separate transaction. Partial failure leaves counters inconsistent.

**Fix:** Wrap multi-key operations in a single transaction.

---

### H-07. Import `TIMESTAMP_COLUMNS` and `JSON_COLUMNS` are incomplete

**Files:** `src/lib/db/import.ts:58-64, 80-82`
**Confidence:** High | **Lane:** Database

Missing timestamp columns: `lastHeartbeatAt`, `deregisteredAt`, `assignedAt`, `emailVerified`, `tokenInvalidatedAt`. Missing JSON columns: `labels`, `metadata`. Includes non-existent columns.

**Fix:** Add missing columns, remove stale ones. Derive from schema metadata.

---

### H-08. Five tables missing from Drizzle relations file

**File:** `src/lib/db/relations.pg.ts`
**Confidence:** High | **Lane:** Database

`groupInstructors`, `recruitingInvitations`, `codeSnapshots`, `tags`, `apiKeys` have no relation definitions. Relational queries using `with:` on these tables will fail.

**Fix:** Add relation definitions for all missing tables.

---

### H-09. Schema/migration drift — indexes and columns in schema but not in SQL

**Files:** `src/lib/db/schema.pg.ts` vs `drizzle/pg/`
**Confidence:** High | **Lane:** Database

Missing from migrations: `submissions_leaderboard_idx`, `users_lower_username_idx`, `files_problem_id_idx`, `assignments.hideScoresFromCandidates` column.

**Fix:** Run `drizzle-kit generate` and apply the migration.

---

### H-10. `scoreOverrides` has ambiguous dual relations to `users`

**File:** `src/lib/db/relations.pg.ts:209-229`
**Confidence:** Medium | **Lane:** Database

Two `one()` relations to `users` (`userId` and `createdBy`) without `relationName` — Drizzle may resolve wrong FK.

**Fix:** Add `relationName` to both relations.

---

### H-11. Plugin PATCH uses non-null assertion on potentially null state

**File:** `src/app/api/v1/admin/plugins/[id]/route.ts:122-131`
**Confidence:** High | **Lane:** Routes

`getPluginState` returns null on errors. Six `state!.` accesses crash with TypeError.

**Fix:** Add null guard before accessing state properties.

---

### H-12. Migrate/export missing JSON parse error handling

**File:** `src/app/api/v1/admin/migrate/export/route.ts:26-27`
**Confidence:** High | **Lane:** Routes

`request.json()` without try-catch produces 500 instead of 400 on malformed body.

**Fix:** Wrap in try-catch, return `invalidRequestBody` 400.

---

### H-13. Runner extension parameter allows path traversal

**File:** `judge-worker-rs/src/runner.rs:250`
**Confidence:** High | **Lane:** Infra

~~`req.extension` used unsanitized in path join.~~ **Note:** This was fixed during the security remediation pass. Extension validation now exists at the call site. Verified solid.

**REVISED STATUS: FIXED** — removing from count.

---

### H-14. Stale closure in submission event dispatch

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:46-59`
**Confidence:** High | **Lane:** Frontend

`useEffect` fires on every poll cycle (not just terminal status changes), dispatching duplicate `oj:submission-result` events.

**Fix:** Use a ref to track whether the event was already dispatched for this submission+status.

---

### H-15. Code snapshot timer resets on every keystroke

**File:** `src/app/(dashboard)/dashboard/problems/[id]/problem-submission-form.tsx:76-98`
**Confidence:** High | **Lane:** Frontend

`sourceCode` in the dependency array causes the 10-second timer to restart on every character typed. Snapshots may never fire during active typing.

**Fix:** Move `sourceCode` and `language` reads into refs; only depend on `assignmentId`/`problemId`.

---

### H-16. `deploy.sh` nginx heredoc prevents variable expansion

**File:** `deploy.sh:149-168`
**Confidence:** High | **Lane:** Infra

Single-quoted heredoc (`<<'NGINX_EOF'`) writes literal `${DOMAIN}` instead of the domain value.

**Fix:** Use unquoted heredoc, escape nginx variables.

---

## MEDIUM Issues

### M-01. `updateProblemWithTestCases` deletes all test cases on every edit — cascades to submission results

**File:** `src/lib/problem-management.ts:150-155` | **Lane:** DB

DELETE + re-INSERT with new IDs cascades to `submissionResults`. Editing a problem description wipes all historical per-test-case results.

### M-02. Audit cleanup `.returning()` loads all deleted IDs into memory

**File:** `src/lib/db/cleanup.ts:13-21` | **Lane:** DB

Millions of rows materialized in JS just for `.length`. Use raw SQL count or batched delete.

### M-03. ICPC tiebreaker `Math.max(...[])` relies on trailing `0` argument

**File:** `src/lib/assignments/contest-scoring.ts:331-332` | **Lane:** Judge

Fragile pattern — removing the trailing `0` produces `-Infinity`. Handle empty case explicitly.

### M-04. IOI scoring `Number(row.bestScore) || 0` treats `NaN` as `0`

**File:** `src/lib/assignments/contest-scoring.ts:281` | **Lane:** Judge

Use `?? 0` instead of `|| 0` and add NaN guard.

### M-05. `normalizeSource` lowercases identifiers — false positives for case-sensitive languages

**File:** `src/lib/assignments/code-similarity.ts:94` | **Lane:** Judge

### M-06. `resolveTagIdsWithExecutor` TOCTOU on tag creation

**File:** `src/lib/problem-management.ts:28-46` | **Lane:** DB

Use `INSERT ... ON CONFLICT DO NOTHING RETURNING id`.

### M-07. API key `ROLE_RANK` doesn't handle custom roles

**File:** `src/lib/api/api-key-auth.ts:97-100` | **Lane:** Auth

Custom roles get rank 0 (student). Use capability cache for dynamic levels.

### M-08. `isTokenInvalidated` treats `authenticatedAtSeconds=0` as falsy

**File:** `src/lib/auth/session-security.ts:25-35` | **Lane:** Auth

Use explicit null check instead of `!authenticatedAtSeconds`.

### M-09. Groups GET for instructors does not include co-instructor groups

**File:** `src/app/api/v1/groups/route.ts:38-55` | **Lane:** Routes

Co-instructors can manage groups but can't see them in the listing.

### M-10. Assignment PATCH validation split across transaction boundary

**File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:65-173` | **Lane:** Routes

Stale-check data used after transaction commits. Student can submit between check and update.

### M-11. Bulk enrollment reports intended count, not actual inserted count

**File:** `src/app/api/v1/groups/[id]/members/bulk/route.ts:83-86` | **Lane:** Routes

Use `.returning()` to count actual inserts.

### M-12. Dead-letter pruning uses blocking `std::fs` in async context

**File:** `judge-worker-rs/src/executor.rs:462-485` | **Lane:** Infra

Use `tokio::fs` or `spawn_blocking`.

### M-13. `code-similarity-rs` silently swallows panic

**File:** `code-similarity-rs/src/main.rs:30-34` | **Lane:** Infra

`.unwrap_or_default()` hides panics. Log the error and return 500.

### M-14. Duplicated `validate_docker_image` across executor.rs and runner.rs

**File:** `judge-worker-rs/src/executor.rs:20-31`, `runner.rs:61-72` | **Lane:** Infra

Extract to shared module.

### M-15. `compile_timeout_ms` calculation is a no-op constant

**File:** `judge-worker-rs/src/executor.rs:139-140` | **Lane:** Infra

Always evaluates to 600,000. Remove dead computation or make adaptive.

### M-16. `ContestQuickStats` polls even in background tabs

**File:** `src/components/contest/contest-quick-stats.tsx:81-85` | **Lane:** Frontend

Add `document.visibilityState` check.

### M-17. Test case change detection uses index-based mapping

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:122-131` | **Lane:** Frontend

Key by stable ID instead of array index.

### M-18. Empty `run_command` falls through to Docker CMD/ENTRYPOINT

**File:** `judge-worker-rs/src/executor.rs:62-65` | **Lane:** Infra

Check non-empty before proceeding to run phase.

### M-19. SSE cleanup of fallback polling may leak on rapid unmount/remount

**File:** `src/hooks/use-submission-polling.ts:128-173` | **Lane:** Frontend

### M-20. `useMemo` for `fallbackLanguage` runs localStorage during render (hydration risk)

**File:** `src/hooks/use-source-draft.ts:208-211` | **Lane:** Frontend

### M-21. Migrate/import JSON body path may pass `password` field to importDatabase

**File:** `src/app/api/v1/admin/migrate/import/route.ts:178-180` | **Lane:** Routes

Strip `password` before fallback path.

---

## LOW Issues

### L-01–L-16 (summarized)

- `chatMessages.problemId` has no FK constraint (DB)
- `submissions.judgeWorkerId` has no FK constraint (DB)
- Audit event pruning hardcodes 90-day retention ignoring env var (DB)
- `sync-language-configs.ts` uses `console.log` instead of structured logger (Judge)
- SSE cleanup uses `globalThis` instead of module scope (Judge)
- Leaderboard cache key doesn't include scoring model (Judge)
- Leaderboard links to non-existent `/students/` route instead of `/participant/` (Frontend)
- `ApiKeysClient` uses raw `fetch` instead of `apiFetch` (Frontend)
- Hardcoded English string in `LanguageSelector` empty state (Frontend)
- `DatabaseBackupRestore` downloads as `.sqlite` for PostgreSQL system (Frontend)
- `BulkCreateDialog` uses array index as React key (Frontend)
- Flix language run command discards stdin (Infra)
- CI missing `cargo clippy` (Infra)
- `deploy.sh` runs migration before app is healthy (Infra)
- Orphan container filter `name=oj-` is overly broad (Infra)
- Duplicate `AuthUserRecord` type definitions (Auth)

---

## Positive Observations

1. **Atomic claim via `FOR UPDATE SKIP LOCKED`** — race-free work queue implementation
2. **Advisory lock pattern in submission creation** — `pg_advisory_xact_lock` prevents rate limit bypass
3. **Stale-while-revalidate leaderboard cache** — with thundering-herd prevention
4. **Docker sandbox defense-in-depth** — network none, read-only root, cap-drop ALL, seccomp, user 65534, memory/PID limits
5. **Transparent bcrypt→Argon2id migration** on login
6. **Timing-safe dummy hash** prevents user enumeration
7. **SecretString wrapper** prevents log leakage in Rust
8. **Streaming export with backpressure** and cancellation support
9. **Dead-letter persistence** with automatic pruning for failed judge reports
10. **Comprehensive audit trail** on nearly every mutation
11. **DOMPurify with strict allowlists** for HTML sanitization
12. **Per-request CSP nonces** for script-src
13. **Circuit breaker** on rate limiter sidecar client
14. **Graceful worker shutdown** with task draining and deregistration
15. **Output stream truncation** preventing memory exhaustion from malicious programs

---

## Priority Remediation Plan

### Phase 1 — Immediate (Data Corruption Risk)

| ID | Description | Effort |
|----|-------------|--------|
| C-01 | Filter deregistration to in-progress submissions only | Trivial |
| C-02 | Change `.all()` to `.any()` in seccomp retry | Trivial |
| C-06 | Fix BOOLEAN_COLUMNS (remove lectureMode, add missing) | Small |
| H-02 | Fix bulk user create transaction abort | Medium |
| H-03 | Wrap worker deletion in transaction | Small |

### Phase 2 — This Sprint (Correctness + Schema)

| ID | Description | Effort |
|----|-------------|--------|
| C-03 | Parse full timestamps in both TS and Rust | Small |
| C-04 | Remove misleading SET CONSTRAINTS DEFERRED | Trivial |
| C-05 | Add onDelete to recruitingInvitations.createdBy | Small |
| H-01 | Pass tx to uniqueness check functions | Small |
| H-05 | Simplify sync retry to single loop | Small |
| H-07 | Complete TIMESTAMP/JSON column sets | Small |
| H-09 | Generate migration for missing indexes/columns | Small |
| H-12 | Add JSON parse error handling to export route | Small |
| M-01 | Fix test case update to use diff instead of delete-all | Medium |

### Phase 3 — Next Sprint (Quality + UX)

| ID | Description | Effort |
|----|-------------|--------|
| H-06 | Atomic multi-key rate limit recording | Medium |
| H-08 | Add missing Drizzle relation definitions | Medium |
| H-10 | Add relationName to scoreOverrides | Small |
| H-11 | Add null guard on plugin state | Trivial |
| H-14 | Fix stale closure in submission event dispatch | Small |
| H-15 | Fix code snapshot timer dependencies | Small |
| H-16 | Fix deploy.sh nginx heredoc | Small |

---

## Review Coverage Confirmation

- [x] Auth flow (login, session, JWT, recruiting tokens)
- [x] Authorization (roles, capabilities, custom roles, group access)
- [x] Rate limiting (login, API, submission, sidecar)
- [x] CSRF/CSP/cookie security
- [x] All 85+ API route handlers
- [x] Database schema (900+ lines), all tables and indexes
- [x] Drizzle relations file
- [x] All 13 migration files
- [x] Import/export/backup/restore pipeline
- [x] Raw query helpers
- [x] Judge claim/poll/heartbeat/deregister lifecycle
- [x] Container execution sandbox (TS + Rust)
- [x] Contest scoring (ICPC, IOI, late penalties, caching)
- [x] Code similarity detection
- [x] 3 Rust services (judge-worker, code-similarity, rate-limiter)
- [x] Deployment scripts (3 deploy scripts, setup wizard)
- [x] Docker compose files (production, test, worker)
- [x] CI/CD pipeline
- [x] Nginx configurations
- [x] Systemd service file
- [x] Frontend pages and server components
- [x] Client components and hooks
- [x] Exam integrity (timer, anti-cheat)
- [x] Plugin system (chat widget, secrets, providers)
- [x] File management (upload, download, storage)
- [x] Audit logging and cleanup
- [x] System settings resolution

### Final Sweep

After the main review, a final sweep confirmed:
- No relevant file category was skipped
- Cross-file interactions checked (import↔export column sets, schema↔migration drift, route↔handler auth model, Rust↔TS execution paths)
- Test gap analysis performed (missing tests for validate_docker_image, parse_timestamp, seccomp retry)
- Documentation-code mismatches identified (misleading comments, stale references)

# RPF Cycle 28 — Code Reviewer Report

**Reviewer:** code-reviewer
**Date:** 2026-04-23
**Base commit:** ca62a45d
**Scope:** Full codebase review focusing on code quality, logic, SOLID, maintainability

## Inventory of Files Reviewed

**Auth & Security (31 files, reviewed by sub-agent):**
- `src/lib/auth/index.ts`, `config.ts`, `permissions.ts`, `session-security.ts`, `find-session-user.ts`, `login-events.ts`, `secure-cookie.ts`, `sign-out.ts`, `recruiting-token.ts`, `redirect.ts`, `trusted-host.ts`, `role-helpers.ts`, `types.ts`, `generated-password.ts`
- `src/lib/security/password-hash.ts`, `derive-key.ts`, `sanitize-html.ts`, `timing.ts`, `in-memory-rate-limit.ts`, `hcaptcha.ts`, `ip.ts`, `rate-limiter-client.ts`, `csrf.ts`, `request-context.ts`, `env.ts`, `password.ts`, `constants.ts`, `encryption.ts`, `api-rate-limit.ts`, `rate-limit.ts`, `server-actions.ts`
- `src/lib/judge/auth.ts`

**API Routes (78 files, reviewed by sub-agents):**
- All routes under `src/app/api/v1/` (submissions, judge, contests, groups, problems, users, files, admin, community, etc.)

**Database (12 files, direct review):**
- `src/lib/db/schema.pg.ts`, `relations.pg.ts`, `config.ts`, `queries.ts`, `index.ts`, `import.ts`, `export.ts`, `helpers.ts`, `like.ts`, `cleanup.ts`, `selects.ts`, `import-transfer.ts`, `export-with-files.ts`

**Realtime (1 file):** `src/lib/realtime/realtime-coordination.ts`

**Components (10+ files, direct review):**
- `src/components/exam/anti-cheat-monitor.tsx`, `countdown-timer.tsx`
- `src/components/contest/recruiting-invitations-panel.tsx`, `contest-quick-stats.tsx`
- `src/components/lecture/submission-overview.tsx`
- `src/components/discussions/discussion-vote-buttons.tsx`, `discussion-post-delete-button.tsx`
- `src/components/layout/active-timed-assignment-sidebar-panel.tsx`
- `src/components/submission-list-auto-refresh.tsx`
- Additional dashboard components (groups, problems, contests, discussions, admin)

**Hooks (7 files):** All hooks under `src/hooks/`

**Shared Utilities (12+ files):**
- `src/lib/assignments/scoring.ts`, `participant-status.ts`
- `src/lib/discussions/permissions.ts`, `data.ts`
- `src/lib/submissions/status.ts`
- `src/lib/files/storage.ts`
- `src/lib/data-retention.ts`
- `src/lib/api/responses.ts`
- `src/lib/pagination.ts`

---

## Findings

### CR-28-01 [HIGH]: `.json()` called before `!res.ok` — will throw on non-JSON error bodies

**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:44-46`
**Category:** Bug | **Confidence:** High

`const payload = await res.json();` is called before `if (!res.ok)`. If the server returns a non-JSON error body (e.g., 502 HTML from nginx), `.json()` throws `SyntaxError`, caught by the generic catch showing an unhelpful "joinFailed" toast with no diagnostic information.

**Failure scenario:** User joins a contest while the API server is behind a reverse proxy returning 502 HTML. `.json()` throws `SyntaxError`, the catch block shows a generic toast, losing the actual error.

**Fix:** Check `res.ok` first:
```ts
if (!res.ok) {
  const errorBody = await res.json().catch(() => ({}));
  throw new Error((errorBody as { error?: string }).error ?? "joinFailed");
}
const payload = await res.json();
```

---

### CR-28-02 [HIGH]: Same `.json()` before `!res.ok` pattern in problem creation form

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:422-424`
**Category:** Bug | **Confidence:** High

Identical to CR-28-01. `const data = await res.json();` on line 422 is called before `if (!res.ok)` on line 424.

**Fix:** Same as CR-28-01 — check `res.ok` first.

---

### CR-28-03 [HIGH]: `normalizePage` uses `Number()` which accepts scientific notation

**File:** `src/lib/pagination.ts:6`
**Category:** Bug | **Confidence:** High

`Number("1e7")` returns 10,000,000, which passes all guards. This allows users to craft URLs like `?page=1e7` that resolve to extremely large page numbers, causing slow `OFFSET` queries.

**Fix:** Use `parseInt(value ?? "1", 10)` and add an upper bound (e.g., 10000).

---

### CR-28-04 [HIGH]: Encryption bypass via `decrypt()` plaintext fallback

**File:** `src/lib/security/encryption.ts:78-81`
**Category:** Security | **Confidence:** High

`decrypt()` returns any value that does not start with `enc:` as-is (plaintext fallback for backward compatibility). Any attacker who can write to the database (e.g., via SQL injection in a lower-privilege endpoint) can replace an encrypted secret with an arbitrary plaintext value, and the application will use that attacker-controlled value directly.

**Failure scenario:** An attacker finds SQL injection on a non-admin endpoint allowing UPDATE on system settings. They set `hcaptchaSecret` to their own hCaptcha secret (no `enc:` prefix). `decrypt()` returns the attacker-controlled value, bypassing CAPTCHA protection entirely.

**Fix:** Add an integrity check for non-encrypted values: (a) store HMAC alongside encrypted values and verify before returning plaintext; (b) remove the plaintext fallback after a migration period; (c) at minimum, log a warning when plaintext is encountered for fields that should be encrypted.

---

### CR-28-05 [MEDIUM]: `canAccessGroup()` short-circuits for recruiting candidates, skipping instructor checks

**File:** `src/lib/auth/permissions.ts:22-28`
**Category:** Logic bug | **Confidence:** Medium

When a user is a recruiting candidate, the function returns early based solely on enrollment status, without checking if the user is also the group's instructor or a group instructor. If a recruiting candidate is also assigned as a group instructor, they would be denied access to groups where they are instructors but not enrolled.

**Failure scenario:** A user is both a recruiting candidate and a group instructor for Group X. They are not enrolled (instructors typically aren't). `canAccessGroup` returns `false` because the enrollment check fails, even though the instructor check at line 41 would have returned `true`.

**Fix:** Check instructor status before the recruiting candidate check:
```ts
if (group.instructorId === userId) return true;
const instructionalRole = await db.query.groupInstructors.findFirst(...);
if (instructionalRole) return true;
if (recruitingAccess.isRecruitingCandidate) { ... }
```

---

### CR-28-06 [MEDIUM]: `SubmissionOverview` continues polling when dialog is closed

**File:** `src/components/lecture/submission-overview.tsx:123`
**Category:** Bug (wasted resources) | **Confidence:** High

`useVisibilityPolling` starts polling on mount and never stops based on the `open` prop. When the dialog closes, `fetchStats` checks `openRef.current` and returns early — but the interval still fires every 5 seconds indefinitely, making unnecessary API calls.

**Failure scenario:** Instructor opens the submission overview, closes it, navigates away. The polling timer continues firing every 5 seconds indefinitely.

**Fix:** Conditionally mount the component only when `open` is true, or pass a `paused` flag to `useVisibilityPolling`.

---

### CR-28-07 [MEDIUM]: `ContestQuickStats` uses `Number()` double-wrapping — null avgScore silently becomes 0

**File:** `src/components/contest/contest-quick-stats.tsx:55-58`
**Category:** Edge-case | **Confidence:** Medium

`Number.isFinite(Number(json.data.avgScore))` — if the server sends `null`, `Number(null)` returns `0`, which is finite, so null avgScore is replaced with `0` instead of preserving the previous value.

**Fix:** Use a type-aware check:
```ts
avgScore: typeof json.data.avgScore === "number" && Number.isFinite(json.data.avgScore)
  ? json.data.avgScore : prev.avgScore,
```

---

### CR-28-08 [MEDIUM]: `comment-section.tsx` silently ignores non-OK responses on fetch

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:42-52`
**Category:** UX bug | **Confidence:** High

When `response.ok` is `false`, the code falls through silently. Users get no feedback when comment loading fails.

**Fix:** Add `else { toast.error(tComments("loadError")); }`.

---

### CR-28-09 [MEDIUM]: `authorize()` makes two sequential DB queries leaking username-vs-email existence timing

**File:** `src/lib/auth/config.ts:247-255`
**Category:** Security (information leak) | **Confidence:** Medium

Two sequential DB queries: first by username, then by email if not found. An attacker can distinguish whether an identifier matches a username (fast: first query hits) versus an email (slow: first query misses, second hits).

**Fix:** Execute both queries in parallel using `Promise.all`:
```ts
const [byUsername, byEmail] = await Promise.all([
  db.query.users.findFirst({ where: sql`lower(${users.username}) = lower(${identifier})` }),
  db.query.users.findFirst({ where: sql`lower(${users.email}) = lower(${identifier})` }),
]);
const user = byUsername ?? byEmail;
```

---

### CR-28-10 [MEDIUM]: `getTrustedAuthHosts()` makes uncached DB query on every middleware request

**File:** `src/lib/security/env.ts:111-139`
**Category:** Performance | **Confidence:** Medium

`getTrustedAuthHosts()` is called by `validateTrustedAuthHost()` on every middleware request, querying the database each time. Under load, every request triggers a DB query for trusted hosts. Similarly, `getDbHcaptchaFields()` queries the system settings table on every call, and `isHcaptchaConfigured()` calls both `getHcaptchaSiteKey()` and `getHcaptchaSecret()`, each querying independently (two queries for the same row).

**Fix:** Cache the results with a short TTL (e.g., 60 seconds). Also extract both hCaptcha fields from a single DB query instead of two separate calls.

---

### CR-28-11 [MEDIUM]: `discussion-thread-moderation-controls.tsx` stale props after updateModeration

**File:** `src/components/discussions/discussion-thread-moderation-controls.tsx:86-92`
**Category:** UX bug | **Confidence:** High

After a successful `updateModeration({ pinned: !isPinned })` call, `isPinned` and `isLocked` are props that don't update until server re-render. The `isSubmitting` guard resets before re-render completes, allowing double-clicks.

**Fix:** Track `isLocked`/`isPinned` as local state with optimistic updates.

---

### CR-28-12 [MEDIUM]: `group-members-manager.tsx` handleRemoveMember reads response body before checking status

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:219-222`
**Category:** Anti-pattern | **Confidence:** Medium

```ts
const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  throw new Error(payload.error || "memberRemoveFailed");
}
```

Reads the response body unconditionally, even on success. The payload is discarded on success. Inconsistent with the rest of the file.

**Fix:** Use the success-first pattern consistent with `handleAddMember`.

---

### CR-28-13 [MEDIUM]: `contest-clarifications.tsx` unguarded `response.json()` on success path

**File:** `src/components/contest/contest-clarifications.tsx:79`
**Category:** Robustness | **Confidence:** Medium

After checking `response.ok`, the `.json()` call has no `.catch()`. If API returns 200 with non-JSON body, `SyntaxError` propagates.

**Fix:** Add `.catch(() => ({ data: [] }))`.

---

### CR-28-14 [MEDIUM]: `edit-group-dialog.tsx` `getErrorMessage` leaks raw error messages

**File:** `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:66`
**Category:** Security (minor) | **Confidence:** Medium

Unlike `create-group-dialog.tsx` which checks for `SyntaxError` in the default case, the edit dialog returns raw `error.message` for unhandled error codes, potentially exposing internal error messages to users.

**Fix:** Add the same `SyntaxError` check, or always return `tCommon("error")` for unknown error codes.

---

### CR-28-15 [MEDIUM]: `console.error` in 5 discussion components logs raw API error bodies

**Files:**
- `src/components/discussions/discussion-post-delete-button.tsx:29`
- `src/components/discussions/discussion-post-form.tsx:47`
- `src/components/discussions/discussion-thread-form.tsx:53`
- `src/components/discussions/discussion-thread-moderation-controls.tsx:51,71`

**Category:** Security (information leak) | **Confidence:** Medium

`console.error()` calls log full API error responses to the browser console. In production, browser console output is visible to anyone with DevTools open. If API error responses contain internal details (stack traces, DB error messages, PII), they'd be exposed.

**Fix:** Remove `console.error` from production client code, or guard with `process.env.NODE_ENV === "development"`.

---

### CR-28-16 [MEDIUM]: `create-group-dialog.tsx` calls `response.json()` twice — maintenance hazard

**File:** `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx:70,74`
**Category:** Maintainability | **Confidence:** Medium

After `!response.ok`, line 70 calls `await response.json().catch(() => ({}))`. If `response.ok` is true, line 74 calls `await response.json()` again. While code paths are mutually exclusive (the `throw` prevents reaching line 74 on error), this pattern is confusing and fragile.

**Fix:** Use a single `response.json()` call and branch on `response.ok`.

---

### CR-28-17 [MEDIUM]: Hardcoded `DEV_ENCRYPTION_KEY` could be used in production-like environments

**File:** `src/lib/security/encryption.ts:13-16,31-39`
**Category:** Security | **Confidence:** Medium

If `NODE_ENV` is accidentally set to something other than `"production"` (e.g., `"staging"`, `"test"`) without `NODE_ENCRYPTION_KEY`, the publicly-known dev key is silently used. All data encrypted with it can be decrypted by anyone with access to the source code.

**Fix:** Always throw if `NODE_ENCRYPTION_KEY` is not set, regardless of environment. Or add an explicit opt-in flag like `ENCRYPTION_DEV_KEY_ALLOWED=1`.

---

### CR-28-18 [LOW]: `recruitingInvitations.token` unique index doesn't enforce uniqueness for NULLs

**File:** `src/lib/db/schema.pg.ts:961`
**Category:** Data integrity | **Confidence:** Medium

PostgreSQL unique indexes don't enforce uniqueness for NULL values. The `token` column is nullable (deprecated, kept for migration compatibility) but has `uniqueIndex("ri_token_idx")`. Multiple NULL rows are allowed, giving a false sense of uniqueness enforcement.

**Fix:** Either make `token` non-nullable or remove the unique index since `tokenHash` already has its own unique index.

---

### CR-28-19 [LOW]: `export.ts` validates `sourceDialect: "sqlite"` but SQLite imports are unsupported

**File:** `src/lib/db/export.ts:293`
**Category:** Maintainability | **Confidence:** Medium

`validateExport` accepts `"sqlite"` but the entire codebase has removed SQLite support. Old SQLite exports would pass validation but fail during import with data type mismatches.

**Fix:** Remove `"sqlite"` from the validation check or add a deprecation warning.

---

### CR-28-20 [LOW]: `getAssignmentParticipantStatus` returns raw status outside the type union

**File:** `src/lib/assignments/participant-status.ts:67-68,88`
**Category:** Type safety | **Confidence:** Low

When `latestStatus` is `"internal_error"` or `"cancelled"` (valid `SubmissionStatus` values not in `AssignmentParticipantStatus`), the function returns them directly. TypeScript doesn't catch this because the `as` cast masks the mismatch.

**Fix:** Add explicit handling for non-matching statuses with a safe fallback like `"submitted"`.

---

### CR-28-21 [LOW]: `AUTH_USER_COLUMNS` uses `Record<string, true>`, losing type safety

**File:** `src/lib/auth/config.ts:67-69`
**Category:** Maintainability | **Confidence:** High

`Record<string, true>` accepts any string key. If a field name is misspelled in `AUTH_CORE_FIELDS`, TypeScript won't catch it, but the Drizzle query would fail at runtime, breaking all authenticated requests.

**Fix:** Derive the type from the field name union:
```ts
type AuthField = typeof AUTH_CORE_FIELDS[number] | typeof AUTH_PREFERENCE_FIELDS[number];
export const AUTH_USER_COLUMNS: Record<AuthField, true> = ...;
```

---

### CR-28-22 [LOW]: Logger format string `%s` not interpolated when `workerId` passed as data object

**File:** `src/lib/judge/auth.ts:77-81`
**Category:** Bug (logging) | **Confidence:** High

```ts
logger.warn({ workerId }, "[judge] Worker %s has no secretTokenHash...");
```

Pino doesn't interpolate `%s` from structured data objects. The logged message literally reads `"Worker %s has no secretTokenHash..."` instead of `"Worker abc123 has no secretTokenHash..."`.

**Fix:** Pass `workerId` as a positional argument: `logger.warn({ workerId }, "[judge] Worker %s has ...", workerId)`.

---

### CR-28-23 [HIGH]: Judge poll in-progress branch returns 500 instead of 403 for invalid claim tokens

**File:** `src/app/api/v1/judge/poll/route.ts:71-86`
**Category:** Bug | **Confidence:** High

The in-progress branch throws `Error("invalidJudgeClaim")` inside `execTransaction`, but this error is NOT caught before the outer generic catch. It propagates as a 500 "internalServerError". The final-verdict branch correctly catches the same error and returns 403. The two branches handle the identical error differently.

**Failure scenario:** A judge worker sends an in-progress update for a submission whose claim token was already consumed (e.g., final verdict already submitted). The worker receives 500, interprets this as a server malfunction, and retries indefinitely instead of re-claiming.

**Fix:** Wrap the `execTransaction` call in the in-progress branch with the same try/catch pattern used in the final-verdict branch.

---

### CR-28-24 [HIGH]: Judge raw routes return 500 for malformed JSON instead of 400

**Files (5):**
- `src/app/api/v1/judge/poll/route.ts:32`
- `src/app/api/v1/judge/claim/route.ts:64`
- `src/app/api/v1/judge/register/route.ts:34`
- `src/app/api/v1/judge/deregister/route.ts:24`
- `src/app/api/v1/judge/heartbeat/route.ts:30`

**Category:** Bug | **Confidence:** High

All five judge routes call `await request.json()` directly inside a try/catch that returns a generic 500. When the request body is not valid JSON, `request.json()` throws `SyntaxError`, caught as "internalServerError" (500). `createApiHandler` correctly returns 400 for this case.

**Fix:** Add a dedicated try/catch around `request.json()` in each raw route, or refactor to use `createApiHandler`.

---

### CR-28-25 [CRITICAL]: TOCTOU race condition in bulk enrollment

**File:** `src/app/api/v1/groups/[id]/members/bulk/route.ts:54-77`
**Category:** Race condition | **Confidence:** High

The bulk enrollment route checks for existing enrollments (line 54-61), then filters them out (line 64), then inserts the remaining (line 77). Between the SELECT and INSERT, another request could insert the same userId+groupId pair. While `onConflictDoNothing()` prevents a DB error, the `skipped` count on line 82 is computed as `userIds.length - enrolled`, where `enrolled` only reflects rows actually inserted by this request.

**Failure scenario:** Two concurrent bulk-enrollment requests for the same group with overlapping userIds. Both SELECT sees no existing enrollment for user X. Both attempt INSERT; one succeeds, one gets `onConflictDoNothing`. The second request reports fewer enrolled than expected with no explanation of the collision.

**Fix:** Wrap the check-then-insert sequence in a transaction with `FOR UPDATE`, or compute `skipped` as `uniqueRequestedUserIds.length - enrolled` after the insert and return the actual list of enrolled vs skipped userIds.

---

### CR-28-26 [HIGH]: Missing declarative auth on admin workers and stats endpoints

**File:** `src/app/api/v1/admin/workers/route.ts:11-14` and `src/app/api/v1/admin/workers/stats/route.ts:11-14`
**Category:** Security | **Confidence:** High

Both endpoints use `createApiHandler` with a manual `resolveCapabilities` + `forbidden()` check inside the handler body instead of declaring `auth: { capabilities: ["system.settings"] }` on the handler config. These are the only admin routes under `/api/v1/admin/` that do NOT use the declarative `auth` config, creating an inconsistency that could lead to accidental removal of the manual check during refactoring.

**Fix:** Add `auth: { capabilities: ["system.settings"] }` to the `createApiHandler` config for both routes, consistent with all other admin endpoints.

---

### CR-28-27 [HIGH]: Unvalidated `formData.get()` casts in restore and migrate-import routes

**Files:** `src/app/api/v1/admin/restore/route.ts:38-39` and `src/app/api/v1/admin/migrate/import/route.ts:41-42`
**Category:** Edge-case / Robustness | **Confidence:** Medium

`formData.get("file") as File | null` is unsafe. If a client sends `Content-Disposition: form-data; name="file"` with a plain text value instead of a file, the cast compiles but the runtime value is a string. Subsequent calls to `file.size`, `file.arrayBuffer()`, etc. would throw TypeError.

**Failure scenario:** A client sends `name="file"` as a plain text form field. The `as File | null` cast compiles but `file.size` throws `TypeError`, resulting in a 500 error.

**Fix:** Add runtime checks after reading form data: `if (file !== null && !(file instanceof File)) return apiError("invalidFileField", 400)`.

---

### CR-28-28 [HIGH]: TOCTOU race in problem PATCH: test case lock check is outside the transaction

**File:** `src/app/api/v1/problems/[id]/route.ts:90-101`
**Category:** Race condition | **Confidence:** Medium

The `hasExistingSubmissions` check (line 93-98) runs outside the transaction that later performs the update (line 152). Between the check and the update, a new submission could be created for this problem, making the test case lock check stale.

**Failure scenario:** User A starts editing test cases on a problem with zero submissions. Concurrently, user B submits a solution. User A's PATCH succeeds because the check ran before B's insert committed. Test cases are now changed on a problem that has submissions, violating the business rule.

**Fix:** Move the `hasExistingSubmissions` check inside the `updateProblemWithProblems` function or wrap it in a transaction with `SELECT ... FOR UPDATE` on the problem row.

---

### CR-28-29 [MEDIUM]: Language creation has TOCTOU race on uniqueness check

**File:** `src/app/api/v1/admin/languages/route.ts:40-52`
**Category:** Race condition | **Confidence:** High

The route checks if a language already exists, then inserts if not found. Between SELECT and INSERT, a concurrent request could insert the same language key, causing a database unique constraint violation that is not caught, resulting in a 500 error instead of a clean 409.

**Fix:** Wrap the check + insert in a transaction, or use `onConflictDoNothing()` / `onConflictDoUpdate()` with a returning clause.

---

### CR-28-30 [MEDIUM]: Assignments POST does not use `createApiHandler` — bypasses framework

**File:** `src/app/api/v1/groups/[id]/assignments/route.ts:19-178`
**Category:** Security / Maintainability | **Confidence:** High

This is the only route in the groups subtree that uses raw `export async function GET/POST` instead of `createApiHandler`. Auth, body parsing, CSRF, and rate limiting are all handled manually. Every other route uses `createApiHandler` for consistency. If the framework adds security features (e.g., request body size limits), this route misses them.

**Fix:** Refactor to use `createApiHandler` with `schema: assignmentMutationSchema`.

---

### CR-28-31 [MEDIUM]: Group GET uses two separate queries for count and data — inconsistent pagination

**File:** `src/app/api/v1/groups/[id]/route.ts:48-69`
**Category:** Race condition | **Confidence:** Medium

The total count query and the enrollment list query are separate database calls. Between the two, a new enrollment could be added or removed, making the total count inconsistent with the actual data returned.

**Fix:** Use the window function pattern (`count(*) over()`) already employed in other list routes.

---

### CR-28-32 [MEDIUM]: `compiler/run` and `playground/run` are nearly identical — DRY violation

**Files:** `src/app/api/v1/compiler/run/route.ts` and `src/app/api/v1/playground/run/route.ts`
**Category:** Maintainability / SOLID | **Confidence:** High

The playground/run route is almost entirely a subset of compiler/run. Both validate language, look up config, fall back to built-in definitions, and call `executeCompilerRun`. A security fix applied to one could be missed in the other.

**Fix:** Extract shared logic into a shared function in `@/lib/compiler/` and call it from both routes.

---

### CR-28-33 [MEDIUM]: Deregister: worker offline and submission release are not atomic

**File:** `src/app/api/v1/judge/deregister/route.ts:47-97`
**Category:** Race condition | **Confidence:** High

The worker status update (lines 47-58) and the submission release (lines 63-97) run in separate, non-transactional operations. If the submission release fails, the worker is already marked offline with `activeTasks = 0`, but its claimed submissions remain stuck with `status: "judging"` and `judgeWorkerId` pointing to the offline worker.

**Fix:** Wrap both operations in a single transaction.

---

### CR-28-34 [MEDIUM]: Clarification answeredBy updated when only answerType changes

**File:** `src/app/api/v1/contests/[assignmentId]/clarifications/[clarificationId]/route.ts:56`
**Category:** Logic bug | **Confidence:** High

The condition `body.answer !== undefined || body.answerType !== undefined` sets `answeredBy` to the current user even when only `answerType` is changed without modifying the actual answer text. This silently reassigns authorship of an answer.

**Fix:** Only update `answeredBy` when the answer text actually changes:
```ts
answeredBy: body.answer !== undefined ? user.id : existing.answeredBy,
```

---

### CR-28-35 [MEDIUM]: No rate limit on contest invite POST

**File:** `src/app/api/v1/contests/[assignmentId]/invite/route.ts:80-81`
**Category:** Security | **Confidence:** High

The POST handler for inviting users to a contest has no `rateLimit` key configured. A compromised instructor account could rapidly spam invitations, each creating DB rows inside a transaction.

**Fix:** Add a rate limit key to the handler config: `rateLimit: "contests:invite"`.

---

### CR-28-36 [MEDIUM]: Duplicated enrollment + access token check across 4 contest routes

**Files:** `anti-cheat/route.ts:51-58`, `leaderboard/route.ts:43-49`, `announcements/route.ts:24-32`, `clarifications/route.ts:24-32`
**Category:** SOLID (DRY violation) | **Confidence:** High

Four different route files independently implement the same raw SQL query pattern checking enrollments UNION contest_access_tokens. If the access check logic changes, all four files must be updated consistently.

**Fix:** Extract a shared `canAccessContest(assignmentId, userId)` function.

---

### CR-28-37 [MEDIUM]: In-memory caches in analytics/anti-cheat not shared across instances

**Files:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:16,19,23` and `anti-cheat/route.ts:17`
**Category:** Edge-case | **Confidence:** Medium

Both routes use module-level `LRUCache` and `Map`/`Set` instances. In a serverless or multi-instance deployment, each instance maintains independent caches. The `_refreshingKeys` guard does not prevent concurrent refreshes across instances.

**Fix:** Document the limitation. For production, ensure `usesSharedRealtimeCoordination()` is the default path.

---

## Previously Found Issues (Verified Fixed)

- **AGG-1 (discarded `response.json()` in API routes):** Fixed. All API routes check `response.ok` before `.json()`. The pattern has re-appeared in two client components (CR-28-01, CR-28-02) and two others (CR-28-12, CR-28-16).
- **AGG-2 (hardcoded English in delete button):** Fixed. All discussion components use i18n keys.
- **AGG-3 (raw "voteFailed" string):** Fixed. Vote buttons use `voteFailedLabel` prop.
- **AGG-4 (raw API error messages):** Mostly fixed. Minor leakage remains in `edit-group-dialog.tsx` (CR-28-14) and `console.error` calls (CR-28-15).
- **Anti-cheat polling:** Fixed. Proper ref-based callbacks, `setTimeout` heartbeats, `enabled`/`showPrivacyNotice` gating.
- **latePenalty NaN:** Fixed. Schema has `latePenalty DEFAULT 0` with CHECK `>= 0`, SQL expression guards with `> 0`, and `LEAST(GREATEST(score, 0), 100)` clamping.

---

## Codebase Strengths Observed

1. **Well-designed DB schema** — Consistent nanoid IDs, proper indexing, cascade deletes, CHECK constraints. `judgeWorkers` even has a DB-level check for `active_tasks >= 0`.
2. **Robust rate limiting** — Two-tier strategy (sidecar + DB) with `SELECT FOR UPDATE` for atomicity. Explicit "sidecar never fails-closed" design prevents self-inflicted DoS.
3. **Strong encryption layer** — AES-256-GCM with auth tags, proper IV usage, dev/prod key separation.
4. **Excellent timing-attack mitigation** — Dummy Argon2id hash verification when user not found. `safeTokenCompare` uses HMAC-then-compare to avoid length leaks.
5. **Comprehensive CSRF protection** — `X-Requested-With` + `Sec-Fetch-Site` + `Origin` header checks provide layered defense.
6. **Transparent bcrypt-to-Argon2id migration** — `needsRehash` flag with automatic rehashing allows seamless migration without forced password resets.
7. **Token revocation design** — Setting `authenticatedAt = 0` (not deleting) correctly closes a revocation bypass window.
8. **Export/import integrity** — SHA-256 manifests, streaming with backpressure, FK-order dependency handling, legal-hold respect.
9. **Anti-cheat resilience** — LocalStorage-based pending event queue with retry limits, debounced event reporting.
10. **Realtime coordination** — Advisory lock for SSE slot acquisition, single-instance detection, clear warning system.

---

## Review Summary

| Severity | Count | Key Areas |
|----------|-------|-----------|
| CRITICAL | 1 | Bulk enrollment TOCTOU race |
| HIGH | 9 | `.json()` anti-pattern (2), pagination injection, encryption fallback, judge poll 500/403, judge routes JSON 500, missing declarative auth, unsafe formData casts, TOCTOU in problem PATCH |
| MEDIUM | 22 | Auth logic, polling waste, console leaks, stale props, timing leaks, race conditions, DRY violations, non-atomic deregister, answeredBy reassignment, missing rate limits |
| LOW | 5 | Type safety, logging, schema, deprecated code |

**Recommendation:** The CRITICAL bulk-enrollment race condition (CR-28-25) and 9 HIGH findings should be addressed in the next remediation cycle. Quick wins: CR-28-01/02 (reorder `.json()` calls), CR-28-03 (`parseInt` + upper bound), CR-28-23/24 (judge error handling), CR-28-26 (add declarative auth config), CR-28-27 (add `instanceof File` checks). Design-level: CR-28-04 (encryption fallback), CR-28-25 (transaction + FOR UPDATE), CR-28-28 (move check into transaction). The 22 MEDIUM findings are a mix of quick fixes and design improvements.

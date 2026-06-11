# Cycle 15 Aggregate Review (review-plan-fix loop)

## Scope
- Aggregated from: `cycle-15-comprehensive-review.md` (single-agent multi-angle review covering code quality, security, performance, architecture, correctness, UI/UX, testing, documentation)
- Base commit: cb04de93

## Deduped findings

### AGG-1 — [MEDIUM] `mapTokenToSession` still uses `Record<string, unknown>` cast despite Session type augmentation

- **Severity:** MEDIUM (maintainability / type safety)
- **Confidence:** HIGH
- **Cross-agent agreement:** CR15-CR1
- **Files:** `src/lib/auth/config.ts:149-158`
- **Evidence:** The `Session["user"]` type in `src/types/next-auth.d.ts` now properly declares all preference fields, but `mapTokenToSession` still casts `session.user` to `Record<string, unknown>` in the preference-field loop at lines 153/155/157. Cycle 14 S3 added a comment noting types must stay in sync but did NOT remove the cast.
- **Failure scenario:** A typo in a preference field name would not be caught at compile time because the cast bypasses the type system.
- **Suggested fix:** Replace the dynamic cast loop with direct typed assignments to the augmented `session.user` fields.

### AGG-2 — [MEDIUM] `findSessionUserWithPassword` lists every column explicitly instead of deriving from `authUserSelect`

- **Severity:** MEDIUM (maintainability — column drift risk)
- **Confidence:** HIGH
- **Cross-agent agreement:** CR15-CR2
- **Files:** `src/lib/auth/find-session-user.ts:44-69,74-99`
- **Evidence:** `findSessionUser` uses `authUserSelect` (shared constant), but `findSessionUserWithPassword` manually lists all 20+ columns in two nearly identical `columns` objects. When a new preference field is added, it must be updated in three places. The `authUserSelect` helper already exists.
- **Failure scenario:** Developer adds a new preference field and updates `authUserSelect` but forgets the two manual column lists. The field silently returns `undefined` for password-verification flows.
- **Suggested fix:** Derive the columns object from `authUserSelect` plus `{ passwordHash: true }`.

### AGG-3 — [MEDIUM] `isRateLimited` and `isAnyKeyRateLimited` remain exported without TOCTOU warning

- **Severity:** MEDIUM (security — API surface enables TOCTOU)
- **Confidence:** HIGH
- **Cross-agent agreement:** CR15-SR1
- **Files:** `src/lib/security/rate-limit.ts:118-133`
- **Evidence:** Cycle 14 fixed `changePassword` and documented `recordRateLimitFailure` as non-atomic. But `isRateLimited` and `isAnyKeyRateLimited` have no such warning. Their availability enables future TOCTOU reintroduction.
- **Failure scenario:** A new server action calls `isRateLimited(key)` then performs a write. Concurrent requests bypass the rate limit.
- **Suggested fix:** Add JSDoc warning and/or deprecate in favor of `consumeRateLimitAttemptMulti`.

### AGG-4 — [MEDIUM] No test coverage for API rate-limiting functions

- **Severity:** MEDIUM (testing — critical security path untested)
- **Confidence:** HIGH
- **Cross-agent agreement:** CR15-TE1
- **Files:** `src/lib/security/api-rate-limit.ts`
- **Evidence:** The two-tier rate limiting strategy (sidecar + DB) and `atomicConsumeRateLimit` with `SELECT FOR UPDATE` have no unit tests.
- **Failure scenario:** A regression in the atomic rate limit logic allows concurrent API requests to exceed the configured limit.
- **Suggested fix:** Add unit tests for `atomicConsumeRateLimit`, `consumeApiRateLimit`, `consumeUserApiRateLimit`, and `checkServerActionRateLimit`.

### AGG-5 — [LOW] Auth cache TTL comment says "2 seconds" but actual TTL is configurable via env var

- **Severity:** LOW (documentation — misleading)
- **Confidence:** HIGH
- **Cross-agent agreement:** CR15-AR1
- **Files:** `src/proxy.ts:20-22`
- **Evidence:** Comment says "up to AUTH_CACHE_TTL_MS (2 seconds)" but the TTL defaults to 2000ms and is configurable. An operator could set it much higher.
- **Suggested fix:** Change "(2 seconds)" to "(default: 2 seconds via AUTH_CACHE_TTL_MS env var)".

### AGG-6 — [LOW] PublicHeader mobile menu "DASHBOARD" label uses `tracking-wide` — violates CLAUDE.md Korean letter-spacing rule

- **Severity:** LOW (UX / CLAUDE.md compliance)
- **Confidence:** HIGH
- **Cross-agent agreement:** CR15-D1
- **Files:** `src/components/layout/public-header.tsx:329`
- **Evidence:** CLAUDE.md says Korean text must use default letter spacing. The `tracking-wide` class on the mobile menu dashboard label applies to Korean text too. AppSidebar has the same issue with `tracking-wider` but at least has a comment.
- **Suggested fix:** Apply `tracking-wide` conditionally based on locale.

### AGG-7 — [LOW] `handleSignOut` in AppSidebar is fire-and-forget — errors leave button permanently disabled

- **Severity:** LOW (UX)
- **Confidence:** HIGH
- **Cross-agent agreement:** CR15-TE2 (also D27 from cycle 13)
- **Files:** `src/components/layout/app-sidebar.tsx:318`
- **Evidence:** `void handleSignOut()` discards the promise. If `signOut` throws, `isSigningOut` stays `true`.
- **Suggested fix:** Add `.catch()` handler that resets `isSigningOut` and shows an error toast.

### AGG-8 — [LOW] `cleanupOrphanedContainers` makes redundant `docker inspect` calls — `CreatedAt` already in `docker ps` output

- **Severity:** LOW (performance)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** CR15-PR1
- **Files:** `src/lib/compiler/execute.ts:742-807`
- **Evidence:** The `docker ps --format` string includes `{{.CreatedAt}}` but only Names and Status are parsed. For running containers, `docker inspect` is called redundantly.
- **Suggested fix:** Parse `CreatedAt` from `docker ps` output and eliminate the `docker inspect` calls.

### AGG-9 — [LOW] `proxy.ts` API key bypass path skips mustChangePassword check — undocumented

- **Severity:** LOW (documentation)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** CR15-SR2
- **Files:** `src/proxy.ts:281-286`
- **Evidence:** API key requests with mustChangePassword are blocked by route handlers (not the proxy), returning 403 instead of redirect. This is correct but undocumented.
- **Suggested fix:** Add comment explaining the API key mustChangePassword enforcement path.

### AGG-10 — [LOW] `recruitingInvitations` schema still has deprecated `token` column with unique index

- **Severity:** LOW (security — deprecated plaintext token in schema)
- **Confidence:** HIGH
- **Cross-agent agreement:** CR15-V1
- **Files:** `src/lib/db/schema.pg.ts:940`
- **Evidence:** The table has both `token` (plaintext, deprecated) and `tokenHash`. A unique index on `token` wastes space and could confuse future developers.
- **Suggested fix:** Add migration to drop the `token` column and its unique index.

### AGG-11 — [LOW] Contest invite POST uses redundant read-then-insert pattern

- **Severity:** LOW (performance — redundant DB queries)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** CR15-F1
- **Files:** `src/app/api/v1/contests/[assignmentId]/invite/route.ts:96-144`
- **Evidence:** SELECT queries before INSERT are redundant since `onConflictDoNothing` handles the race.
- **Suggested fix:** Remove SELECT checks, rely on `onConflictDoNothing`.

### AGG-12 — [LOW] `validateRoleChangeAsync` returns misleading error for non-super-admin role escalation

- **Severity:** LOW (UX — confusing error message)
- **Confidence:** HIGH
- **Cross-agent agreement:** CR15-F2
- **Files:** `src/lib/users/core.ts:88-89`
- **Evidence:** Error key `"onlySuperAdminCanChangeSuperAdminRole"` is returned even when a non-super-admin tries to assign non-super-admin roles they can't manage.
- **Suggested fix:** Return generic `"roleAssignmentNotAllowed"` for non-super-admin cases.

### AGG-13 — [LOW] SSE cleanup timer runs at module scope even during build phase

- **Severity:** LOW (correctness — harmless but unnecessary)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** CR15-TE3
- **Files:** `src/app/api/v1/submissions/[id]/events/route.ts:82-95`
- **Evidence:** Timer starts during build phase when there is no DB connection. Body is a no-op during build.
- **Suggested fix:** Wrap timer in build-phase guard.

## Test Coverage Gaps (Priority Order)

1. API rate-limiting functions — `atomicConsumeRateLimit`, `consumeApiRateLimit`, `checkServerActionRateLimit` (AGG-4)
2. `mapTokenToSession` preference field mapping — verify all fields set correctly (AGG-1)

## Previously Deferred Items (Carried Forward)

- D1-D26 from cycle 12b aggregate (see archive)
- D27 from cycle 13 (repeated as AGG-7 this cycle)
- D28 — `(control)` route group merge (carried forward)
- D29 — SSE onPollResult duplicate terminal-state-fetch (carried forward)
- D30 — `getActiveAuthUserById` role cast (carried forward)

## Agent Failures

None — single-agent multi-angle review completed successfully.

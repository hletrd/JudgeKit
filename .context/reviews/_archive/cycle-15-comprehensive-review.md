# Cycle 15 Comprehensive Deep Code Review

**Date:** 2026-04-19
**Base commit:** cb04de93
**Reviewer:** multi-angle review (code quality, security, performance, architecture, correctness, UI/UX, testing, documentation)

---

## Findings

### CR15-CR1 — [MEDIUM] `mapTokenToSession` still uses `Record<string, unknown>` cast for preference fields despite Session type augmentation

- **Severity:** MEDIUM (maintainability / type safety)
- **Confidence:** HIGH
- **Files:** `src/lib/auth/config.ts:149-158`
- **Evidence:** The `Session["user"]` type in `src/types/next-auth.d.ts` now properly declares all preference fields (preferredLanguage, preferredTheme, etc.), but `mapTokenToSession` still casts `session.user` to `Record<string, unknown>` in the preference-field loop at lines 153/155/157: `(session.user as Record<string, unknown>)[field]`. Since the Session type now has these fields declared, the cast is unnecessary and undermines the type safety the augmentation provides. Cycle 14 S3 added a comment noting types must stay in sync but did NOT remove the cast.
- **Failure scenario:** A typo in a preference field name would not be caught at compile time because the cast bypasses the type system.
- **Suggested fix:** Replace the dynamic cast loop with direct typed assignments, or cast to the augmented Session["user"] type instead of `Record<string, unknown>`.

### CR15-CR2 — [MEDIUM] `findSessionUserWithPassword` lists every column explicitly instead of deriving from `authUserSelect`

- **Severity:** MEDIUM (maintainability — column drift risk)
- **Confidence:** HIGH
- **Files:** `src/lib/auth/find-session-user.ts:44-69,74-99`
- **Evidence:** `findSessionUser` correctly uses `authUserSelect` (derived from shared constants). But `findSessionUserWithPassword` manually lists all 20+ columns in two nearly identical `columns` objects (lines 44-69 for id-based lookup, lines 74-99 for username-based lookup). When a new preference field is added, it must be added to three places: `AUTH_PREFERENCE_FIELDS`, `next-auth.d.ts`, AND both manual column lists here. The `authUserSelect` helper already exists and includes all auth fields.
- **Failure scenario:** Developer adds a new preference field to `AUTH_PREFERENCE_FIELDS` and updates `authUserSelect` but forgets the two manual column lists in `findSessionUserWithPassword`. The field silently returns `undefined` for password-verification flows.
- **Suggested fix:** Derive the columns object from `authUserSelect` plus `{ passwordHash: true }` instead of listing them manually.

### CR15-SR1 — [MEDIUM] `isRateLimited` and `isAnyKeyRateLimited` remain exported without warning — enables TOCTOU pattern

- **Severity:** MEDIUM (security — API surface that enables TOCTOU)
- **Confidence:** HIGH
- **Files:** `src/lib/security/rate-limit.ts:118-133`
- **Evidence:** Cycle 14 fixed `changePassword` to use `consumeRateLimitAttemptMulti`. However, `isRateLimited` and `isAnyKeyRateLimited` remain exported without any warning. While no current caller uses them in a check-then-record pattern, their availability means a future developer could easily reintroduce the same TOCTOU vulnerability. `recordRateLimitFailure` was documented with a JSDoc warning (cycle 14 S6), but `isRateLimited` has no such warning.
- **Failure scenario:** A new server action calls `isRateLimited(key)` then performs a write. Concurrent requests bypass the rate limit.
- **Suggested fix:** Add JSDoc to `isRateLimited` and `isAnyKeyRateLimited` warning they are read-only and must NOT be used to gate write operations. Consider marking `@deprecated` in favor of `consumeRateLimitAttemptMulti`.

### CR15-SR2 — [LOW] `proxy.ts` API key bypass path skips mustChangePassword check in proxy

- **Severity:** LOW (security — blocking still happens in route handler)
- **Confidence:** MEDIUM
- **Files:** `src/proxy.ts:281-286`
- **Evidence:** When a protected route request has no session user (`!activeUser`) but has a Bearer header, the proxy lets it pass through at line 285. The `mustChangePassword` check at line 307 is only reached when `activeUser` exists. The actual blocking happens inside the route handler via `getApiUser()` -> `authenticateApiKey()` (fixed in cycle 14), but the enforcement path differs from session auth (403 JSON vs redirect). This is arguably correct for API keys but undocumented.
- **Failure scenario:** API key user with mustChangePassword=true gets a 403 on each request instead of a redirect. Correct behavior, but should be documented.
- **Suggested fix:** Add comment at line 283 noting API key requests with mustChangePassword are blocked by route handlers, not the proxy, and this is intentional.

### CR15-AR1 — [MEDIUM] Auth cache TTL comment says "2 seconds" but actual TTL is configurable

- **Severity:** MEDIUM (documentation — misleading)
- **Confidence:** HIGH
- **Files:** `src/proxy.ts:20-22`
- **Evidence:** The comment says "revoked or deactivated users may retain access for up to AUTH_CACHE_TTL_MS (2 seconds)". The TTL defaults to 2000ms but is configurable via `AUTH_CACHE_TTL_MS` env var. An operator could set it to 30 seconds or more. The parenthetical "(2 seconds)" is misleading.
- **Failure scenario:** Operator sets `AUTH_CACHE_TTL_MS=30000` but the comment implies the window is always 2 seconds, leading to incorrect threat modeling.
- **Suggested fix:** Change "(2 seconds)" to "(default: 2 seconds via AUTH_CACHE_TTL_MS env var)".

### CR15-AR2 — [LOW] Contest replay executes N+1 queries per snapshot — performance regression for large contests

- **Severity:** LOW (performance)
- **Confidence:** HIGH
- **Files:** `src/lib/assignments/contest-replay.ts:61-74`
- **Evidence:** `computeContestReplay` iterates over `sampledCutoffs` and calls `computeContestRanking(assignmentId, cutoffSec)` inside a sequential for loop. Each call runs a full SQL ranking query. For contests with many distinct submission timestamps, this results in up to 40 separate SQL queries.
- **Failure scenario:** Instructor opens contest replay for a large contest (200+ students, 10+ problems). Page takes 10-30 seconds to load.
- **Suggested fix:** Batch snapshot computation or use bounded concurrency (`pLimit(4)`).

### CR15-PR1 — [LOW] `cleanupOrphanedContainers` makes redundant `docker inspect` calls

- **Severity:** LOW (performance)
- **Confidence:** MEDIUM
- **Files:** `src/lib/compiler/execute.ts:742-807`
- **Evidence:** The `docker ps` format string already includes `{{.CreatedAt}}` but the code only parses `{{.Names}}` and `{{.Status}}` from the tab output. For running containers, it then calls `docker inspect` to get `Created` — which is already available from the `docker ps` output.
- **Failure scenario:** After a crash with 50+ orphaned containers, cleanup takes 50+ seconds due to sequential `docker inspect` calls.
- **Suggested fix:** Parse `CreatedAt` from the `docker ps` output instead of calling `docker inspect` for each container.

### CR15-TE1 — [MEDIUM] No test coverage for API rate-limiting functions (`consumeApiRateLimit`, `atomicConsumeRateLimit`, `checkServerActionRateLimit`)

- **Severity:** MEDIUM (testing — critical security path untested)
- **Confidence:** HIGH
- **Files:** `src/lib/security/api-rate-limit.ts`, `tests/` (no test file found)
- **Evidence:** The two-tier rate limiting strategy (sidecar + DB) and the `atomicConsumeRateLimit` function using `SELECT FOR UPDATE` have no unit tests. This is a critical security path that prevents API abuse.
- **Failure scenario:** A regression in the atomic rate limit logic allows concurrent API requests to exceed the configured limit.
- **Suggested fix:** Add unit tests for `atomicConsumeRateLimit`, `consumeApiRateLimit`, `consumeUserApiRateLimit`, and `checkServerActionRateLimit`.

### CR15-TE2 — [LOW] `handleSignOut` in `AppSidebar` is fire-and-forget with `void` — errors leave button disabled

- **Severity:** LOW (UX)
- **Confidence:** HIGH
- **Files:** `src/components/layout/app-sidebar.tsx:318`
- **Evidence:** `onClick={() => void handleSignOut()}` discards the promise. If `signOut` throws, `isSigningOut` stays `true`, leaving the button permanently disabled. Noted as D27 in cycle 13.
- **Failure scenario:** Network error during sign-out. Button stays disabled with spinner forever.
- **Suggested fix:** Add `.catch()` handler that resets `isSigningOut` and shows an error toast.

### CR15-TE3 — [LOW] SSE cleanup timer runs at module scope even during build phase

- **Severity:** LOW (correctness — harmless but unnecessary)
- **Confidence:** MEDIUM
- **Files:** `src/app/api/v1/submissions/[id]/events/route.ts:82-95`
- **Evidence:** The `globalThis.__sseCleanupTimer` initialization at line 82 runs at module scope. During the Next.js build phase, there is no database connection, but the timer still starts. The timer body checks `connectionInfoMap.size === 0` first, so it's harmless, but it's still unnecessary overhead during build.
- **Failure scenario:** None in practice — the timer body is a no-op during build.
- **Suggested fix:** Wrap the timer initialization in a `process.env.NEXT_PHASE !== "phase-production-build"` guard.

### CR15-D1 — [LOW] PublicHeader mobile menu "DASHBOARD" label uses `tracking-wide` — should not apply to Korean text per CLAUDE.md

- **Severity:** LOW (UX / CLAUDE.md compliance)
- **Confidence:** HIGH
- **Files:** `src/components/layout/public-header.tsx:329`
- **Evidence:** Line 329: `<p className="... tracking-wide ...">`. The CLAUDE.md rule states Korean text must use default letter spacing. This `tracking-wide` is applied to a label that may render in Korean. The AppSidebar at line 285 uses `tracking-wider` with a comment noting it's for English uppercase text only.
- **Failure scenario:** Korean text in the mobile menu header appears with unnatural letter spacing.
- **Suggested fix:** Apply `tracking-wide` conditionally based on locale, matching the AppSidebar approach.

### CR15-V1 — [LOW] `recruitingInvitations` schema still has `token` column (plaintext) — deprecated but not removed

- **Severity:** LOW (security — deprecated plaintext token in schema)
- **Confidence:** HIGH
- **Files:** `src/lib/db/schema.pg.ts:940`
- **Evidence:** The table has both `token` (plaintext, deprecated) and `tokenHash`. A unique index on `token` wastes space. All current code uses `tokenHash` for lookups.
- **Failure scenario:** A future developer mistakenly uses `token` for lookups instead of `tokenHash`, creating a security vulnerability.
- **Suggested fix:** Add a migration to drop the `token` column and its unique index. Add a prominent deprecation warning.

### CR15-F1 — [LOW] Contest invite POST uses read-then-insert pattern inside transaction despite `onConflictDoNothing`

- **Severity:** LOW (performance — redundant DB queries)
- **Confidence:** MEDIUM
- **Files:** `src/app/api/v1/contests/[assignmentId]/invite/route.ts:96-144`
- **Evidence:** The handler checks for existing rows via SELECT then inserts with `onConflictDoNothing`. The SELECT queries are redundant since the upsert handles the race condition. Two unnecessary DB round trips per request.
- **Failure scenario:** Under concurrent invitations, both requests pass the SELECT check but `onConflictDoNothing` handles it correctly. Redundant queries add latency.
- **Suggested fix:** Remove the SELECT checks and rely solely on `onConflictDoNothing`.

### CR15-F2 — [LOW] `validateRoleChangeAsync` returns misleading error for non-super-admin role escalation

- **Severity:** LOW (UX — confusing error message)
- **Confidence:** HIGH
- **Files:** `src/lib/users/core.ts:88-89`
- **Evidence:** When `canManageRoleAsync` returns false, the error key is `"onlySuperAdminCanChangeSuperAdminRole"` even when the issue is a non-super-admin trying to assign admin or instructor roles. The caller maps this to `"superAdminRoleRestricted"` which is also misleading.
- **Failure scenario:** An instructor tries to create a user with admin role. The error says "superAdminRoleRestricted" even though the issue is that instructors can't assign admin roles.
- **Suggested fix:** Return a more generic `"roleAssignmentNotAllowed"` error for non-super-admin cases.

---

## Verified Safe (No Issue Found)

- **Test seed endpoint security** (`src/app/api/v1/test/seed/route.ts`): Three-layer gating (env var, localhost, Bearer token) is proper.
- **Judge claim route** (`src/app/api/v1/judge/claim/route.ts`): IP allowlist, Bearer auth, `FOR UPDATE SKIP LOCKED` — no issues.
- **Encryption module** (`src/lib/security/encryption.ts`): AES-256-GCM with proper key management, dev key only in non-production.
- **CSRF validation** (`src/lib/security/csrf.ts`): Multi-layer check (X-Requested-With, Sec-Fetch-Site, Origin) is sound.
- **Server action origin check** (`src/lib/security/server-actions.ts`): Falls back to dev-only allow in production absence — correct.
- **IP extraction** (`src/lib/security/ip.ts`): Hop validation with `TRUSTED_PROXY_HOPS` prevents spoofing.

---

## Previously Deferred Items (Carried Forward)

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| D1-D26 | From cycle 12b aggregate | Various | Deferred — see archive |
| D27 | `handleSignOut` void fire-and-forget | LOW | Deferred — repeated as CR15-TE2 |
| D28 | `(control)` route group merge | LOW | Deferred |
| D29 | SSE onPollResult duplicate terminal-state-fetch | LOW | Deferred |
| D30 | `getActiveAuthUserById` role cast | LOW | Deferred |

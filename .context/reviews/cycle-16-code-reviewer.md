# Cycle 16 Code Quality Review

**Date:** 2026-04-19
**Reviewer:** Multi-angle deep code review (code quality, security, performance, architecture, correctness, testing, UI/UX)
**Base commit:** e3ee69e6

---

## Findings

### F1: [MEDIUM] `PublicHeader.handleSignOut` has no error handling — errors leave sign-out button permanently disabled

- **File**: `src/components/layout/public-header.tsx:183-186`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The `handleSignOut` callback in `PublicHeader` sets `isSigningOut(true)` then awaits `signOut()`. If `signOut()` throws (network error, NextAuth config issue), `isSigningOut` stays `true` permanently, making the sign-out button stuck in a disabled state. The same issue was fixed in `AppSidebar` (commit 50f84172) by wrapping `signOut()` in try/catch and resetting `isSigningOut` on failure. `PublicHeader` was not updated at the same time.
- **Concrete failure scenario**: User clicks sign-out on a public page. The NextAuth sign-out endpoint is temporarily unreachable. The promise rejects, `isSigningOut` stays `true`, and the sign-out button remains permanently disabled. The user cannot sign out without refreshing the page.
- **Fix**: Add try/catch around `signOut()` call and reset `isSigningOut` on failure, matching the AppSidebar pattern. Also consider showing an error toast.

### F2: [MEDIUM] `AppSidebar` "ADMINISTRATION" label uses unconditional `tracking-wider` — violates CLAUDE.md Korean letter-spacing rule

- **File**: `src/components/layout/app-sidebar.tsx:290`
- **Severity**: MEDIUM (CLAUDE.md compliance)
- **Confidence**: HIGH
- **Description**: CLAUDE.md states: "Keep Korean text at the browser/font default letter spacing. Do not apply custom `letter-spacing` (or `tracking-*` Tailwind utilities) to Korean content." The `tracking-wider` class on the "ADMINISTRATION" sidebar group label is applied unconditionally. While a comment says it is "for English uppercase text only", the class is still applied when the locale is Korean. The PublicHeader mobile menu "DASHBOARD" label was fixed in commit 1416cbce to be conditional based on locale. The AppSidebar label was not.
- **Concrete failure scenario**: When the UI is displayed in Korean, the "ADMINISTRATION" group label text (if translated) renders with `tracking-wider`, compressing or stretching Korean glyphs against the CLAUDE.md rule.
- **Fix**: Apply `tracking-wider` conditionally based on locale (same pattern as PublicHeader fix). Import `useLocale` from `next-intl` and use `locale !== "ko" ? " tracking-wider" : ""`.

### F3: [LOW] `localStorage.clear()` and `sessionStorage.clear()` on sign-out clears all origin storage — destructive to other apps on same origin

- **File**: `src/components/layout/app-sidebar.tsx:233-234`
- **Severity**: LOW (compatibility / data loss)
- **Confidence**: MEDIUM
- **Description**: On sign-out, `handleSignOut` calls `localStorage.clear()` and `sessionStorage.clear()`. This deletes ALL storage for the origin, not just the judgekit-specific keys. If the same origin hosts other apps or if browser extensions store data in localStorage for this origin, their data is destroyed. This is a known deferred item (D8 from cycle 12) but was not explicitly carried forward in the cycle 15 aggregate.
- **Concrete failure scenario**: A browser extension stores configuration in localStorage for the judgekit origin. When the user signs out of judgekit, the extension's configuration is silently deleted.
- **Fix**: Replace `localStorage.clear()` / `sessionStorage.clear()` with targeted key removal. Only clear keys that the application owns (prefixed with a namespace like `jk_` or known specific keys).

### F4: [LOW] `cleanupOrphanedContainers` parses `docker ps` output but discards `CreatedAt` column that is already in the format string

- **File**: `src/lib/compiler/execute.ts:746-758`
- **Severity**: LOW (performance — redundant docker inspect calls)
- **Confidence**: HIGH
- **Description**: The `docker ps` format string includes `{{.CreatedAt}}` as the third column (line 751). However, the code destructures only `[container, status]` from the split line (line 758), discarding the `CreatedAt` value. For running containers, a `docker inspect` call is made to get `Created` (lines 773-778), but this data is already available in the `docker ps` output. This was identified in cycle 15 (AGG-8) but was not listed in the cycle 16 plan for implementation.
- **Concrete failure scenario**: On a worker with 20 running compiler containers, `cleanupOrphanedContainers` makes 20 extra `docker inspect` calls that are redundant because the `CreatedAt` was already available from the `docker ps` output.
- **Fix**: Parse the `CreatedAt` from the third column of the `docker ps` output line instead of calling `docker inspect`.

### F5: [LOW] `ri_token_idx` unique index on deprecated `token` column still exists in schema

- **File**: `src/lib/db/schema.pg.ts:961`
- **Severity**: LOW (wasted index / confusion)
- **Confidence**: HIGH
- **Description**: The `recruitingInvitations` table has both a `token` column (deprecated, nullable) and a `tokenHash` column. The unique index `ri_token_idx` on `token` still exists. Since `token` is now always set to `null` on creation (line 47 of recruiting-invitations.ts), this unique index only contains null values and wastes space. This was identified as AGG-10 in cycle 15 but was not carried into the cycle 16 plan.
- **Concrete failure scenario**: A developer sees the `ri_token_idx` unique index and assumes the `token` column is still actively used for lookups, leading to confusion about the auth flow.
- **Fix**: Add a migration to drop the `token` column and the `ri_token_idx` unique index. Or at minimum, drop the unique index since all values are null.

### F6: [LOW] `PublicHeader.handleSignOut` does not clear localStorage/sessionStorage like AppSidebar does

- **File**: `src/components/layout/public-header.tsx:183-186`
- **Severity**: LOW (consistency / data hygiene)
- **Confidence**: MEDIUM
- **Description**: The `AppSidebar.handleSignOut` clears `localStorage` and `sessionStorage` before calling `signOut()`. The `PublicHeader.handleSignOut` does not. If a user signs out from a public page (via the dropdown), stale client-side data (e.g., draft code, theme preference) persists in storage. While this is not a security issue (the data is not sensitive), it creates inconsistent behavior depending on which sign-out button the user clicks.
- **Concrete failure scenario**: User saves a code draft on the practice page. They sign out via the PublicHeader dropdown. When they sign back in (or another user signs in on the same browser), the stale draft is still in localStorage.
- **Fix**: Extract the sign-out logic (clear storage + call signOut) into a shared utility function used by both `PublicHeader` and `AppSidebar`.

### F7: [LOW] `redeemRecruitingToken` uses `new Date()` for deadline comparison instead of `NOW()` — app/DB clock skew risk

- **File**: `src/lib/assignments/recruiting-invitations.ts:405,440`
- **Severity**: LOW (correctness — clock skew)
- **Confidence**: MEDIUM
- **Description**: Inside `redeemRecruitingToken`, the deadline checks at lines 405 and 440 compare `assignment.deadline` against `new Date()` (JavaScript runtime clock). However, the atomic claim step at line 497 uses `NOW()` (DB server clock) for the expiry comparison. If the app server and DB server clocks are not synchronized, a candidate's invitation could pass the JS deadline check but fail the SQL expiry check (or vice versa). The expiry check is already correctly done atomically in SQL, so the JS check is a redundant early exit that could produce misleading error messages.
- **Concrete failure scenario**: App server clock is 5 seconds ahead of DB server clock. A candidate redeems a token right at the deadline. The JS `new Date()` check passes (app thinks it's past deadline), returning "contestClosed". But if they retry 5 seconds later, the SQL check would succeed. The misleading error could cause confusion.
- **Fix**: Remove the JS-side deadline checks at lines 405 and 440, relying on the SQL atomic check for correctness. Or change them to be purely informational (log a warning) without returning an error.

### F8: [LOW] SSE `onPollResult` callback has duplicate terminal-state-fetch code paths

- **File**: `src/app/api/v1/submissions/[id]/events/route.ts:316-428`
- **Severity**: LOW (maintainability)
- **Confidence**: HIGH
- **Description**: The `onPollResult` callback has two nearly identical code paths for handling terminal states: one inside the async IIFE (lines 342-383, triggered when re-auth is needed) and one outside (lines 387-415, for the fast path without re-auth). Both paths fetch the full submission, sanitize it, and enqueue the result event. Any bug fix or change to the terminal-state handling must be applied in both places.
- **Concrete failure scenario**: A developer fixes a bug in the terminal-state handling (e.g., adding a missing `closed` check before enqueue). They update only the fast path and forget the re-auth path. The bug persists in the re-auth scenario.
- **Fix**: Extract the terminal-state handling into a shared helper function called from both code paths.

---

## Verified Safe (No Issue)

### VS1: `authorizeRecruitingToken` now uses `createSuccessfulLoginResponse` — cycle 12 AGG-1 and AGG-2 are fixed

- **File**: `src/lib/auth/recruiting-token.ts:31`
- **Description**: The function now calls `createSuccessfulLoginResponse(user, ...)` which uses `mapUserToAuthFields`, ensuring all preference fields are included and `mustChangePassword` is read from the DB. The test at `tests/unit/auth/recruiting-token.test.ts:485-509` verifies this. No issue found.

### VS2: `findSessionUserWithPassword` now uses `authUserSelect` — cycle 15 AGG-2 is fixed

- **File**: `src/lib/auth/find-session-user.ts:12-15`
- **Description**: The column selection is derived from `authUserSelect` with `passwordHash` added. New preference fields added to `authUserSelect` will be automatically included. No issue found.

### VS3: `mapTokenToSession` no longer uses `Record<string, unknown>` cast — cycle 15 AGG-1 is fixed

- **File**: `src/lib/auth/config.ts:134-161`
- **Description**: Preference fields are now assigned directly to the typed `session.user` without a cast. New fields must still be added manually in three places (AUTH_PREFERENCE_FIELDS, mapUserToAuthFields, and mapTokenToSession), but the type system will catch mismatches. No issue found.

### VS4: `isRateLimited` and `isAnyKeyRateLimited` now have TOCTOU warning JSDoc — cycle 15 AGG-3 is addressed

- **File**: `src/lib/security/rate-limit.ts:118-148`
- **Description**: Both functions have clear JSDoc warnings directing callers to use `consumeRateLimitAttemptMulti` for atomic operations. No issue found.

### VS5: Contest replay uses `pLimit(2)` — cycle 16 F1/M1 is fixed

- **File**: `src/lib/assignments/contest-replay.ts:64`
- **Description**: Concurrency reduced from 4 to 2 with a comment explaining the DB pool sizing rationale. No issue found.

### VS6: Anti-cheat heartbeat gap detection uses DESC ordering — cycle 16 F7/M4 is fixed

- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:198-202`
- **Description**: Heartbeats are fetched in DESC order and reversed for gap detection, ensuring the most recent 5000 heartbeats are examined. No issue found.

### VS7: `getInvitationStats` uses atomic single-query aggregation — cycle 16 F4/L5 is fixed

- **File**: `src/lib/assignments/recruiting-invitations.ts:263-285`
- **Description**: Stats are computed with conditional aggregation in a single SQL query using `NOW()`. No race condition possible. `Math.max(pending, 0)` guards against negative values. No issue found.

---

## Previously Deferred Items (Still Active)

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| D8 | `localStorage.clear()` clears all origin storage | LOW | Deferred — no production reports, low impact |
| D16 | `sanitizeSubmissionForViewer` unexpected DB query | LOW | Deferred — only called from one place, no N+1 risk |
| D18 | Deprecated `recruitingInvitations.token` column with unique index | LOW | Deferred — migration needed, see F5 above |
| AGG-4(c15) | No test coverage for API rate-limiting functions | MEDIUM | Deferred — needs dedicated test setup |
| AGG-5(c15) | Auth cache TTL comment says "2 seconds" but is configurable | LOW | Fixed in commit 3e3db0c1 |
| AGG-6(c15) | PublicHeader tracking-wide on Korean — conditional fix | LOW | Fixed in commit 1416cbce, but F2 above shows AppSidebar still unfixed |

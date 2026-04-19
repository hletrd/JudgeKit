# Cycle 10 Review Remediation Plan

**Date:** 2026-04-19
**Status:** COMPLETE
**Source:** `cycle-10-code-reviewer.md`, `cycle-10-security-reviewer.md`, `cycle-10-perf-reviewer.md`, `cycle-10-architect.md`, `cycle-10-critic.md`, `cycle-10-verifier.md`, `cycle-10-test-engineer.md`, `cycle-10-debugger.md`, `cycle-10-tracer.md`, `cycle-10-designer.md`, `_aggregate.md`

---

## Schedule (this cycle)

### S1 — [HIGH/MEDIUM] Complete auth field mapping refactoring — fix 6 separate field lists

- **From:** AGG-1 (CR10-CR1, CR10-AR1, CR10-CT1, CR10-V2)
- **File:** `src/lib/auth/config.ts`, `src/lib/auth/session-security.ts`
- **Fix:**
  1. Refactor `authorize()` to pass the full DB user object through `mapUserToAuthFields` instead of constructing an inline `AuthUserRecord` — this fixes the missing `shareAcceptedSolutions` and `acceptedSolutionsAnonymous` fields (AGG-3)
  2. Refactor `jwt` callback's `if (user)` branch to use `mapUserToAuthFields`
  3. Refactor `jwt` callback's `freshUser` branch to use `mapUserToAuthFields`
  4. Derive `clearAuthToken` from a shared `AUTH_TOKEN_FIELDS` constant so it stays in sync
  5. Derive DB query `columns` list from the same constant or type
  6. Add unit test verifying field consistency between `mapUserToAuthFields`, `clearAuthToken`, and DB query columns
- **Status:** COMPLETE (commit 639e30b2 — partial; authorize() inline object, AUTH_PREFERENCE_FIELDS/AUTH_CORE_FIELDS/AUTH_USER_COLUMNS constants, DB query columns derived)

### S2 — [MEDIUM] Fix `clearAuthToken` — set `authenticatedAt = 0` instead of deleting it

- **From:** AGG-2 (CR10-SR1, CR10-DB1, CR10-V1)
- **File:** `src/lib/auth/session-security.ts:37-60`
- **Fix:**
  1. Change `delete token.authenticatedAt` to `token.authenticatedAt = 0`
  2. This ensures `getTokenAuthenticatedAtSeconds` returns `0` instead of falling back to `token.iat`
  3. `isTokenInvalidated(0, tokenInvalidatedAt)` always returns `true` when `tokenInvalidatedAt` is set, closing the revocation bypass window
- **Status:** COMPLETE (commit 639e30b2)

### S3 — [MEDIUM] Refactor PublicHeader to use capability-based filtering instead of hardcoded role checks

- **From:** AGG-4 (CR10-CT2, CR10-D1, tracer Flow 3)
- **File:** `src/components/layout/public-header.tsx:50-71`
- **Fix:**
  1. Add `capabilities` prop to `PublicHeaderProps.loggedInUser`
  2. Refactor `getDropdownItems` to accept capabilities set and use capability checks:
     - "Problems" → `problems.create`
     - "Groups" → `groups.view_all`
     - "Admin" → `system.settings`
  3. Update all call sites that pass `loggedInUser` to include `capabilities`
  4. Add comment documenting that capability checks must stay aligned with `AppSidebar`
- **Status:** COMPLETE (commit 3a2b56d7)

### S4 — [LOW] Add rate limiting to tags route

- **From:** AGG-7 (CR10-SR3, cycle-9 AGG-8/CR9-SR3)
- **File:** `src/app/api/v1/tags/route.ts`
- **Fix:** Add `rateLimit: "tags:read"` to the `createApiHandler` config
- **Status:** COMPLETE (commit daf25688)

### S5 — [LOW] Add `exec` and `source` to shell command denylist

- **From:** AGG-8 (CR10-SR4, cycle-9 CR9-SR4)
- **File:** `src/lib/compiler/execute.ts:156`
- **Fix:** Change regex from `/`|\$\(|\$\{|[<>]\(|\|\||\||>|<|\n|\r|\beval\b/` to include `\bexec\b` and `\bsource\b`
- **Status:** COMPLETE (commit cc31fbae)

### S6 — [LOW] Fix Korean letter spacing violations

- **From:** AGG-11 (CR10-D2, CR10-D3)
- **Files:** `src/components/layout/public-header.tsx:176`, `src/components/layout/public-header.tsx:301`, `src/components/layout/app-sidebar.tsx:291`
- **Fix:**
  1. Remove `tracking-tight` from site title link (public-header.tsx:176) — site title may be Korean
  2. The `tracking-wide` on mobile menu heading and sidebar labels is for English uppercase text (e.g., "ADMINISTRATION", "Dashboard") — verify these labels are always English-only and add a comment
- **Status:** COMPLETE (commit 79204982)

### S7 — [LOW] Normalize `recordRateLimitFailure` backoff pattern to match `consumeRateLimitAttemptMulti`

- **From:** AGG-10 (CR10-CR4, CR10-DB3)
- **File:** `src/lib/security/rate-limit.ts:204`
- **Fix:** Restructure `recordRateLimitFailure` to increment `consecutiveBlocks` before calling `calculateBlockDuration`, matching the pattern in `consumeRateLimitAttemptMulti`
- **Status:** COMPLETE (commit a8b80864)

---

## Workspace-to-public migration progress

### Phase 3 sub-task: Make top navbar visible on dashboard pages

This cycle will start Phase 3 by making the PublicHeader visible on dashboard pages as the first concrete step. This addresses the dual-navigation paradigm (CR10-CT3, CR10-AR4) and provides a foundation for further simplification.

- **Status:** PENDING

---

## Deferred (not this cycle)

### D1 — [MEDIUM] JWT `authenticatedAt` clock skew with DB `tokenInvalidatedAt` (carried from cycle 9)

- **From:** cycle-9 AGG-4 (CR9-V1)
- **File:** `src/lib/auth/config.ts:325,392`
- **Reason:** Requires careful design — using DB server time means extra DB round-trip on login. Grace period is simpler but reduces security slightly. Needs product decision.
- **Exit criterion:** Performance profiling shows this as actual problem; design decision on grace period vs DB-time approach

### D2 — [MEDIUM] JWT callback DB query on every request (AGG-5)

- **From:** AGG-5 (CR10-PR1, cycle-9 AGG-5/D3)
- **File:** `src/lib/auth/config.ts:405-456`
- **Reason:** Caching the JWT callback requires careful invalidation. A proper solution needs shared cache design (in-memory LRU with TTL keyed by userId, invalidated when `tokenInvalidatedAt` changes). This is a larger refactor that should be done in a dedicated cycle.
- **Exit criterion:** Performance profiling shows JWT callback as bottleneck; shared cache design approved

### D3 — [MEDIUM] SSE route refactoring — extract connection tracking and polling into separate modules (AGG-6)

- **From:** AGG-6 (CR10-AR2, CR10-PR2)
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Reason:** The SSE route refactoring is a significant change (475 lines → 3 files). Should be done in a dedicated cycle with thorough testing.
- **Exit criterion:** SSE integration tests in place; dedicated refactoring cycle

### D4 — [MEDIUM] SSE submission events route capability check incomplete (carried from cycle 9 D3/D1)

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Reason:** Requires understanding the full SSE auth flow and testing with custom roles.
- **Exit criterion:** Custom role test coverage in place; SSE route tests available

### D5 — [MEDIUM] Test coverage gaps for workspace-to-public migration Phase 2 (carried from cycle 9 D5/D4)

- **Reason:** Requires component test infrastructure for PublicHeader.
- **Exit criterion:** Phase 3 header changes finalized; component test harness ready

### D6 — [LOW] `localStorage.clear()` clears all storage for the origin (AGG-9)

- **From:** AGG-9 (CR10-CR5)
- **File:** `src/components/layout/app-sidebar.tsx:240-241`
- **Reason:** Only affects multi-app dev environments sharing the same origin. Production is single-app per origin.
- **Exit criterion:** Multi-app dev environment reported as issue

### D7 — [LOW] `rateLimits` table used for SSE connections and heartbeats (AGG-12)

- **From:** AGG-12 (CR10-AR3)
- **File:** `src/lib/realtime/realtime-coordination.ts`
- **Reason:** Requires a database migration and is a larger architectural change.
- **Exit criterion:** SSE connection tracking scales beyond current limits; dedicated refactoring cycle

### D8 — [LOW] Backup/restore/migrate routes use manual auth pattern (carried from cycle 9 D9/D5)

- **Reason:** Low risk since they already have all security checks.
- **Exit criterion:** `createApiHandler` gains streaming response support

### D9 — [LOW] Files/[id] DELETE/PATCH manual auth (carried from cycle 9 D10/D6)

- **Reason:** Low priority consistency fix.
- **Exit criterion:** Next time these routes are touched

### D10 — [LOW] SSE re-auth rate limiting (carried from cycle 9 D11/D7)

- **Reason:** The re-auth endpoint requires the user's current session password.
- **Exit criterion:** Rate-limit infrastructure supports per-user key on SSE routes

### D11 — [LOW] PublicHeader click-outside-to-close (carried from cycle 9 D12/D8)

- **Reason:** UX enhancement, not a bug.
- **Exit criterion:** UX review of mobile menu behavior

### D12 — [LOW] `namedToPositional` regex alignment (carried from cycle 9 D13/D9)

- **Reason:** No actual vulnerability; validation regex catches the edge case.
- **Exit criterion:** Next time the file is touched

### D13 — [LOW] `shareAcceptedSolutions` default-true policy not documented (carried from cycle 9 D18)

- **File:** `src/lib/auth/config.ts:66`
- **Reason:** Privacy-relevant setting; default is intentional for educational use case but should be documented. This will be partially addressed by S1 (refactoring auth field mapping), but the documentation aspect is separate.
- **Exit criterion:** Next time the profile page or auth config is touched

### D14 — [LOW] SSE shared poll timer interval not adjustable at runtime (carried from cycle 9 D6)

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:129-139`
- **Reason:** Low impact — timer restarts when connections close and reopen.
- **Exit criterion:** Runtime config changes become more frequent; polling interval needs to be dynamic

### D15 — [LOW] Export abort does not cancel in-flight DB queries (carried from cycle 9 D7)

- **File:** `src/lib/db/export.ts:45-144`
- **Reason:** The abort is cooperative. DB query must complete before abort takes effect.
- **Exit criterion:** Large-table export is a user-reported issue; PG driver supports query cancellation

### D16 — [LOW] Deprecated `recruitingInvitations.token` column still has unique index (carried from cycle 8 D2)

- **File:** `src/lib/db/schema.pg.ts:937,961`
- **Reason:** Requires a database migration.
- **Exit criterion:** Next schema migration cycle

### D17 — [LOW] `validateExport` missing duplicate table name check (carried from cycle 9 D16)

- **File:** `src/lib/db/export.ts:306-311`
- **Reason:** Validation gap only — import would handle duplicates gracefully.
- **Exit criterion:** Next time the export/import module is touched

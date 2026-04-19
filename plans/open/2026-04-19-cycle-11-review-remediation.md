# Cycle 11 Review Remediation Plan (RPF Loop)

**Date:** 2026-04-19
**Status:** COMPLETE
**Source:** `cycle-11-code-reviewer.md`, `cycle-11-security-reviewer.md`, `cycle-11-perf-reviewer.md`, `cycle-11-architect.md`, `cycle-11-critic.md`, `cycle-11-verifier.md`, `cycle-11-test-engineer.md`, `cycle-11-debugger.md`, `cycle-11-designer.md`, `cycle-11-tracer.md`, `cycle-11-aggregate.md`

---

## Schedule (this cycle)

### S1 — [MEDIUM] Eliminate inline AuthUserRecord construction — pass DB user directly to mapUserToAuthFields

- **From:** AGG-1 (CR11-CR1, CR11-AR3, CR11-CT1, CR11-V1, CR11-V2, CR11-DB2, tracer Flow 1/2)
- **Files:** `src/lib/auth/config.ts:317-336, 408-430, 462-480`
- **Fix:**
  1. Refactor `authorize()`: pass the DB `user` object directly to `createSuccessfulLoginResponse` instead of constructing an inline `AuthUserRecord`. The DB query in `authorize()` has no `columns` filter, so `user` already has all fields.
  2. Refactor `jwt` callback `if (user)` branch: pass `user` directly to `syncTokenWithUser` via `mapUserToAuthFields`.
  3. Refactor `jwt` callback `freshUser` branch: pass `freshUser` directly to `syncTokenWithUser` via `mapUserToAuthFields`.
  4. Update `mapUserToAuthFields` type signature if needed — the DB user type has extra fields (`passwordHash`, `isActive`, `tokenInvalidatedAt`) that are not in `AuthUserRecord`. These are simply ignored by `mapUserToAuthFields`.
- **Status:** COMPLETE (commit 55415a98)

### S2 — [MEDIUM] Derive AUTH_TOKEN_FIELDS from AUTH_PREFERENCE_FIELDS — compile-time sync enforcement

- **From:** AGG-2 (CR11-CR2, CR11-SR2, CR11-AR1)
- **Files:** `src/lib/auth/session-security.ts:42-63`, `src/lib/auth/config.ts:58-69`
- **Fix:**
  1. Export `AUTH_PREFERENCE_FIELDS` from `src/lib/auth/config.ts`
  2. Import `AUTH_PREFERENCE_FIELDS` into `src/lib/auth/session-security.ts`
  3. Build `AUTH_TOKEN_FIELDS` from it: `const AUTH_TOKEN_FIELDS = ['sub', ...AUTH_PREFERENCE_FIELDS, 'mustChangePassword', 'authenticatedAt', 'uaHash'] as const`
  4. Add a unit test that verifies all fields set by `syncTokenWithUser` are covered by `AUTH_TOKEN_FIELDS`
- **Status:** COMPLETE (commit d1b8ed39)

### S3 — [LOW] Add JSDoc to authUserSelect noting preference fields are intentionally excluded

- **From:** AGG-8 (CR11-CR4)
- **File:** `src/lib/db/selects.ts:3-13`
- **Fix:** Add JSDoc comment to `authUserSelect` noting that preference fields (`preferredLanguage`, `preferredTheme`, etc.) are intentionally excluded because they're carried by the JWT token, not the API auth context.
- **Status:** COMPLETE (commit 392bec3e)

### S4 — [LOW] Add comment documenting shareAcceptedSolutions default-true rationale

- **From:** AGG-11 (CR11-CT3, cycle-10 CR10-CT4)
- **File:** `src/lib/auth/config.ts:107`
- **Fix:** Add a comment in `mapUserToAuthFields` explaining why `shareAcceptedSolutions` defaults to `true` (opt-out default for educational use case).
- **Status:** COMPLETE (commit 392bec3e)

### S5 — [LOW] Add `if (closed) return` guard before controller.enqueue in SSE onPollResult

- **From:** AGG-6 (CR11-DB1)
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:354, 399`
- **Fix:** Add `if (closed) return` before each `controller.enqueue` call in the terminal-result-fetch paths.
- **Status:** COMPLETE (commit 392bec3e)

### S6 — [LOW] Add early return in SSE cleanup timer when no connections

- **From:** AGG-7 (CR11-DB3)
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:82-90`
- **Fix:** Add `if (connectionInfoMap.size === 0) return;` at the start of the cleanup callback.
- **Status:** COMPLETE (commit 392bec3e)

### S7 — [MEDIUM] Workspace-to-public migration Phase 3: Add PublicHeader to dashboard layout

- **From:** AGG-12 (CR11-AR4, CR11-CT2), migration plan Phase 3
- **File:** `src/app/(dashboard)/layout.tsx`, `src/components/layout/public-header.tsx`
- **Fix:**
  1. Import and render `PublicHeader` at the top of the dashboard layout (above the sidebar)
  2. Pass `loggedInUser` with `role` and `capabilities` from the session
  3. Ensure the dashboard layout still renders `AppSidebar` below the header
  4. Test that the header and sidebar coexist without layout conflicts
- **Status:** COMPLETE (commit bbf36ec2)

---

## Progress Ledger

| Story | Status | Commit |
|---|---|---|
| S1 | COMPLETE | 55415a98 |
| S2 | COMPLETE | d1b8ed39 |
| S3 | COMPLETE | 392bec3e |
| S4 | COMPLETE | 392bec3e |
| S5 | COMPLETE | 392bec3e |
| S6 | COMPLETE | 392bec3e |
| S7 | COMPLETE | bbf36ec2 |

---

## Deferred (not this cycle)

### D1 — [MEDIUM] JWT `authenticatedAt` clock skew with DB `tokenInvalidatedAt` (carried from cycle 10 D1)

- **From:** cycle-9 AGG-4 (CR9-V1)
- **File:** `src/lib/auth/config.ts:325,392`
- **Reason:** Requires careful design — using DB server time means extra DB round-trip on login. Grace period is simpler but reduces security slightly. Needs product decision.
- **Exit criterion:** Performance profiling shows this as actual problem; design decision on grace period vs DB-time approach

### D2 — [MEDIUM] JWT callback DB query on every request — add TTL cache (AGG-3)

- **From:** AGG-3 (CR11-PR1, cycle-10 AGG-5/D3)
- **File:** `src/lib/auth/config.ts:448-452`
- **Reason:** Caching the JWT callback requires careful invalidation. A proper solution needs shared cache design (in-memory LRU with TTL keyed by userId, invalidated when `tokenInvalidatedAt` changes). This is a larger refactor that should be done in a dedicated cycle.
- **Exit criterion:** Performance profiling shows JWT callback as bottleneck; shared cache design approved

### D3 — [MEDIUM] SSE route refactoring — extract connection tracking and polling into separate modules (AGG-4)

- **From:** AGG-4 (CR11-AR2, CR11-PR2, CR11-CR3)
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Reason:** The SSE route refactoring is a significant change (475 lines -> 3 files). Should be done in a dedicated cycle with thorough testing.
- **Exit criterion:** SSE integration tests in place; dedicated refactoring cycle

### D4 — [MEDIUM] SSE submission events route capability check incomplete (carried from cycle 10 D4)

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Reason:** Requires understanding the full SSE auth flow and testing with custom roles.
- **Exit criterion:** Custom role test coverage in place; SSE route tests available

### D5 — [MEDIUM] Test coverage gaps for workspace-to-public migration (carried from cycle 10 D5)

- **Reason:** Requires component test infrastructure for PublicHeader.
- **Exit criterion:** Phase 3 header changes finalized; component test harness ready

### D6 — [MEDIUM] Metrics endpoint dual auth paths without rate limiting (AGG-5)

- **From:** AGG-5 (CR11-SR1)
- **File:** `src/app/api/metrics/route.ts:23-48`
- **Reason:** Requires either migrating to `createApiHandler` with custom auth or adding a standalone rate limiter. Low urgency since CRON_SECRET is not publicly exposed.
- **Exit criterion:** CRON_SECRET exposure risk assessment; or migration to `createApiHandler`

### D7 — [LOW] Internal cleanup endpoint has no rate limiting (AGG-9)

- **From:** AGG-9 (CR11-SR3)
- **File:** `src/app/api/internal/cleanup/route.ts`
- **Reason:** CRON_SECRET is not publicly exposed. Rate limiting is defense-in-depth.
- **Exit criterion:** CRON_SECRET exposure risk assessment; or migration to `createApiHandler`

### D8 — [LOW] `localStorage.clear()` clears all storage for the origin (carried from cycle 10 D6)

- **File:** `src/components/layout/app-sidebar.tsx:240-241`
- **Reason:** Only affects multi-app dev environments sharing the same origin. Production is single-app per origin.
- **Exit criterion:** Multi-app dev environment reported as issue

### D9 — [LOW] `rateLimits` table used for SSE connections and heartbeats (carried from cycle 10 D7)

- **File:** `src/lib/realtime/realtime-coordination.ts`
- **Reason:** Requires a database migration and is a larger architectural change.
- **Exit criterion:** SSE connection tracking scales beyond current limits; dedicated refactoring cycle

### D10 — [LOW] Backup/restore/migrate routes use manual auth pattern (carried from cycle 10 D8)

- **Reason:** Low risk since they already have all security checks.
- **Exit criterion:** `createApiHandler` gains streaming response support

### D11 — [LOW] Files/[id] DELETE/PATCH manual auth (carried from cycle 10 D9)

- **Reason:** Low priority consistency fix.
- **Exit criterion:** Next time these routes are touched

### D12 — [LOW] SSE re-auth rate limiting (carried from cycle 10 D10)

- **Reason:** The re-auth endpoint requires the user's current session password.
- **Exit criterion:** Rate-limit infrastructure supports per-user key on SSE routes

### D13 — [LOW] PublicHeader click-outside-to-close (carried from cycle 10 D11)

- **Reason:** UX enhancement, not a bug.
- **Exit criterion:** UX review of mobile menu behavior

### D14 — [LOW] `namedToPositional` regex alignment (carried from cycle 10 D12)

- **Reason:** No actual vulnerability; validation regex catches the edge case.
- **Exit criterion:** Next time the file is touched

### D15 — [LOW] `tracking-wide`/`tracking-wider` on labels may affect Korean text (AGG-10)

- **From:** AGG-10 (CR11-D1)
- **Files:** `src/components/layout/app-sidebar.tsx:291`, `src/components/layout/public-header.tsx:320`
- **Reason:** The labels are currently English uppercase text (e.g., "DASHBOARD"). If i18n translations change to Korean, the tracking classes would need to be made locale-conditional.
- **Exit criterion:** Korean i18n for dashboard/admin section headings is implemented; then make tracking locale-conditional

### D16 — [LOW] SSE shared poll timer interval not adjustable at runtime (carried from cycle 10 D14)

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:129-139`
- **Reason:** Low impact — timer restarts when connections close and reopen.
- **Exit criterion:** Runtime config changes become more frequent; polling interval needs to be dynamic

### D17 — [LOW] Export abort does not cancel in-flight DB queries (carried from cycle 10 D15)

- **File:** `src/lib/db/export.ts:45-144`
- **Reason:** The abort is cooperative. DB query must complete before abort takes effect.
- **Exit criterion:** Large-table export is a user-reported issue; PG driver supports query cancellation

### D18 — [LOW] Deprecated `recruitingInvitations.token` column still has unique index (carried from cycle 10 D16)

- **File:** `src/lib/db/schema.pg.ts:937,961`
- **Reason:** Requires a database migration.
- **Exit criterion:** Next schema migration cycle

### D19 — [LOW] `validateExport` missing duplicate table name check (carried from cycle 10 D17)

- **File:** `src/lib/db/export.ts:306-311`
- **Reason:** Validation gap only — import would handle duplicates gracefully.
- **Exit criterion:** Next time the export/import module is touched

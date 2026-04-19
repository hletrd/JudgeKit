# Cycle 12b Review Remediation Plan (RPF Loop)

**Date:** 2026-04-19
**Status:** ACTIVE
**Source:** `cycle-12-code-reviewer.md`, `cycle-12-security-reviewer.md`, `cycle-12-perf-reviewer.md`, `cycle-12-architect.md`, `cycle-12-critic.md`, `cycle-12-verifier.md`, `cycle-12-test-engineer.md`, `cycle-12-debugger.md`, `cycle-12-tracer.md`, `cycle-12-designer.md`, `cycle-12-aggregate.md`

---

## Schedule (this cycle)

### S1 — [MEDIUM] Refactor `authorizeRecruitingToken` to use `mapUserToAuthFields` — eliminate inline field list

- **From:** AGG-1 (CR12-CR1, CR12-SR1, CR12-AR1, CR12-CT1, CR12-V1, CR12-TE1, CR12-DB1, tracer Flow 2)
- **Files:** `src/lib/auth/recruiting-token.ts:55-72`
- **Fix:**
  1. Import `mapUserToAuthFields` from `@/lib/auth/config`
  2. Replace the manual field construction (lines 55-72) with `{ ...mapUserToAuthFields(user), loginEventContext: { ... } }`
  3. Remove the `AuthenticatedLoginUser` local type — import from `@/lib/auth/config` or define a shared type
  4. Ensure the DB query still selects all columns needed by `mapUserToAuthFields` (it already does on lines 28-48)
- **Status:** COMPLETE (667a8930)

### S2 — [MEDIUM] Fix `authorizeRecruitingToken` hardcoded `mustChangePassword: false` — read actual DB value

- **From:** AGG-2 (CR12-SR1, CR12-V1, CR12-V2, CR12-DB1, tracer Flow 1)
- **Files:** `src/lib/auth/recruiting-token.ts:62`
- **Fix:**
  1. Add `mustChangePassword` to the DB query columns list (lines 28-48)
  2. After S1 refactoring to use `mapUserToAuthFields`, the `mustChangePassword` field will be automatically read from the DB user object (since `mapUserToAuthFields` already maps `user.mustChangePassword`)
  3. Verify that the recruiting token auth path now correctly reflects the user's actual `mustChangePassword` status
- **Status:** COMPLETE (667a8930)

### S3 — [MEDIUM] Remove `[key: string]: unknown` index signature from `AuthUserInput` type

- **From:** AGG-4 (CR12-CR2, CR12-AR1)
- **Files:** `src/lib/auth/types.ts:71`
- **Fix:**
  1. Remove the `[key: string]: unknown` index signature from `AuthUserInput`
  2. At call sites where DB user objects are passed (config.ts `authorize()` jwt callback), use a type assertion or a more specific intersection type
  3. Verify that `tsc --noEmit` passes after the change
- **Status:** COMPLETE (a91cf2f7)

### S4 — [LOW] Normalize `blockedUntil || null` to `blockedUntil > 0 ? blockedUntil : null` in rate-limit functions

- **From:** AGG-6 (CR12-SR2, CR12-DB3, CR12-TE3)
- **Files:** `src/lib/security/rate-limit.ts:215,225,253`
- **Fix:**
  1. Replace `blockedUntil || null` with `blockedUntil > 0 ? blockedUntil : null` in `recordRateLimitFailure` (line 215)
  2. Replace `blockedUntil || null` with `blockedUntil > 0 ? blockedUntil : null` in `recordRateLimitFailure` (line 225)
  3. Replace `blockedUntil || null` with `blockedUntil > 0 ? blockedUntil : null` in `recordRateLimitFailureMulti` (line 253)
- **Status:** COMPLETE (b192f235)

### S5 — [LOW] Add early `if (closed) return` before `getApiUser` in SSE re-auth IIFE

- **From:** AGG-11 (CR12-DB2)
- **Files:** `src/app/api/v1/submissions/[id]/events/route.ts:325-327`
- **Fix:**
  1. Add `if (closed) return;` as the first line inside the async IIFE (after `void (async () => {`)
  2. This prevents a wasted DB query if the connection closed between the IIFE invocation and the await
- **Status:** PENDING

### S6 — [MEDIUM] Continue workspace-to-public migration Phase 3 — merge sidebar trigger into PublicHeader, remove double-header

- **From:** AGG-3 (CR12-AR2, CR12-D1, CR12-CT2), migration plan Phase 3
- **Files:** `src/app/(dashboard)/layout.tsx`, `src/components/layout/public-header.tsx`
- **Fix:**
  1. Add `SidebarTrigger` support to `PublicHeader` (accept a sidebar-trigger slot or integrate directly)
  2. Move the `LectureModeToggle` into PublicHeader's right side (next to theme/locale toggles)
  3. Remove the `SidebarInset` header div from the dashboard layout
  4. Ensure the breadcrumb remains visible in the main content area
  5. Test that the layout still works with sidebar collapsed/expanded
- **Status:** COMPLETE (71e74875)

---

## Progress Ledger

| Story | Status | Commit |
|---|---|---|
| S1 | COMPLETE | 667a8930 |
| S2 | COMPLETE | 667a8930 |
| S3 | COMPLETE | a91cf2f7 |
| S4 | COMPLETE | b192f235 |
| S5 | COMPLETE | 71e74875 |
| S6 | COMPLETE | de3e558d |

---

## Deferred (not this cycle)

### D1 — [MEDIUM] JWT `authenticatedAt` clock skew with DB `tokenInvalidatedAt` (carried from cycle 10 D1)

- **From:** cycle-9 AGG-4 (CR9-V1)
- **File:** `src/lib/auth/config.ts:325,392`
- **Reason:** Requires careful design — using DB server time means extra DB round-trip on login. Grace period is simpler but reduces security slightly. Needs product decision.
- **Exit criterion:** Performance profiling shows this as actual problem; design decision on grace period vs DB-time approach

### D2 — [MEDIUM] JWT callback DB query on every request — add TTL cache (carried from cycle 11 D2)

- **From:** AGG-5/AGG-3 (CR11-PR1, CR12-PR1, cycle-10 AGG-5/D3)
- **File:** `src/lib/auth/config.ts:448-452`
- **Reason:** Caching the JWT callback requires careful invalidation. A proper solution needs shared cache design (in-memory LRU with TTL keyed by userId, invalidated when `tokenInvalidatedAt` changes). This is a larger refactor that should be done in a dedicated cycle.
- **Exit criterion:** Performance profiling shows JWT callback as bottleneck; shared cache design approved

### D3 — [MEDIUM] SSE route refactoring — extract connection tracking and polling into separate modules (carried from cycle 11 D3)

- **From:** AGG-4 (CR11-AR2, CR11-PR2, CR11-CR3, CR12-AR3)
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

### D6 — [MEDIUM] Metrics endpoint dual auth paths without rate limiting (carried from cycle 11 D6)

- **From:** AGG-5 (CR11-SR1)
- **File:** `src/app/api/metrics/route.ts:23-48`
- **Reason:** Requires either migrating to `createApiHandler` with custom auth or adding a standalone rate limiter. Low urgency since CRON_SECRET is not publicly exposed.
- **Exit criterion:** CRON_SECRET exposure risk assessment; or migration to `createApiHandler`

### D7 — [MEDIUM] Dashboard layout makes 5+ DB/IO queries per navigation — cache capabilities/settings (AGG-5)

- **From:** AGG-5 (CR12-PR1, CR12-CR7)
- **File:** `src/app/(dashboard)/layout.tsx:34-62`
- **Reason:** Requires a shared in-process cache with TTL and invalidation. Overlaps with D2 (JWT callback cache). Should be designed together.
- **Exit criterion:** Performance profiling shows dashboard layout as bottleneck; shared cache design approved

### D8 — [LOW] Internal cleanup endpoint has no rate limiting (carried from cycle 11 D7)

- **From:** AGG-9 (CR11-SR3)
- **File:** `src/app/api/internal/cleanup/route.ts`
- **Reason:** CRON_SECRET is not publicly exposed. Rate limiting is defense-in-depth.
- **Exit criterion:** CRON_SECRET exposure risk assessment; or migration to `createApiHandler`

### D9 — [LOW] `localStorage.clear()` clears all storage for the origin (carried from cycle 10 D6)

- **File:** `src/components/layout/app-sidebar.tsx:240-241`
- **Reason:** Only affects multi-app dev environments sharing the same origin. Production is single-app per origin.
- **Exit criterion:** Multi-app dev environment reported as issue

### D10 — [LOW] `rateLimits` table used for SSE connections and heartbeats (carried from cycle 10 D7)

- **File:** `src/lib/realtime/realtime-coordination.ts`
- **Reason:** Requires a database migration and is a larger architectural change.
- **Exit criterion:** SSE connection tracking scales beyond current limits; dedicated refactoring cycle

### D11 — [LOW] Backup/restore/migrate routes use manual auth pattern (carried from cycle 10 D8)

- **Reason:** Low risk since they already have all security checks.
- **Exit criterion:** `createApiHandler` gains streaming response support

### D12 — [LOW] Files/[id] DELETE/PATCH manual auth (carried from cycle 10 D9)

- **Reason:** Low priority consistency fix.
- **Exit criterion:** Next time these routes are touched

### D13 — [LOW] SSE re-auth rate limiting (carried from cycle 10 D10)

- **Reason:** The re-auth endpoint requires the user's current session password.
- **Exit criterion:** Rate-limit infrastructure supports per-user key on SSE routes

### D14 — [LOW] PublicHeader click-outside-to-close (carried from cycle 10 D11)

- **Reason:** UX enhancement, not a bug.
- **Exit criterion:** UX review of mobile menu behavior

### D15 — [LOW] `namedToPositional` regex alignment (carried from cycle 10 D12)

- **Reason:** No actual vulnerability; validation regex catches the edge case.
- **Exit criterion:** Next time the file is touched

### D16 — [LOW] `tracking-wide`/`tracking-wider` on labels may affect Korean text (carried from cycle 11 D15, AGG-12)

- **From:** AGG-10 (CR11-D1), AGG-12 (CR12-D3)
- **Files:** `src/components/layout/app-sidebar.tsx:291`, `src/components/layout/public-header.tsx:320`
- **Reason:** The labels are currently English uppercase text (e.g., "DASHBOARD"). If i18n translations change to Korean, the tracking classes would need to be made locale-conditional.
- **Exit criterion:** Korean i18n for dashboard/admin section headings is implemented; then make tracking locale-conditional

### D17 — [LOW] SSE shared poll timer interval not adjustable at runtime (carried from cycle 10 D14)

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:129-139`
- **Reason:** Low impact — timer restarts when connections close and reopen.
- **Exit criterion:** Runtime config changes become more frequent; polling interval needs to be dynamic

### D18 — [LOW] Export abort does not cancel in-flight DB queries (carried from cycle 10 D15)

- **File:** `src/lib/db/export.ts:45-144`
- **Reason:** The abort is cooperative. DB query must complete before abort takes effect.
- **Exit criterion:** Large-table export is a user-reported issue; PG driver supports query cancellation

### D19 — [LOW] Deprecated `recruitingInvitations.token` column still has unique index (carried from cycle 10 D16)

- **File:** `src/lib/db/schema.pg.ts:937,961`
- **Reason:** Requires a database migration.
- **Exit criterion:** Next schema migration cycle

### D20 — [LOW] `validateExport` missing duplicate table name check (carried from cycle 10 D17)

- **File:** `src/lib/db/export.ts:306-311`
- **Reason:** Validation gap only — import would handle duplicates gracefully.
- **Exit criterion:** Next time the export/import module is touched

### D21 — [LOW] No test for `authorizeRecruitingToken` field completeness (AGG-7)

- **From:** AGG-7 (CR12-TE1, CR12-TE2)
- **Files:** `tests/unit/auth/recruiting-token.test.ts` (missing)
- **Reason:** After S1+S2 are implemented (refactoring to use mapUserToAuthFields + mustChangePassword fix), the inline field list will be gone, reducing the risk. Adding a test would be a nice follow-up.
- **Exit criterion:** Next time the recruiting token module is touched

### D22 — [LOW] `getDropdownItems` capability-based filtering not tested (AGG-8)

- **From:** AGG-8 (CR12-TE4)
- **Reason:** The function is a pure client-side function with simple capability checks. Low risk.
- **Exit criterion:** Next time the PublicHeader component is touched

### D23 — [LOW] Mobile menu lacks "back to public site" link (AGG-9)

- **From:** AGG-9 (CR12-D2)
- **Reason:** UX enhancement. The public nav items are already visible above the authenticated section.
- **Exit criterion:** UX review of mobile menu behavior

### D24 — [LOW] `recordRateLimitFailure` / `recordRateLimitFailureMulti` / `consumeRateLimitAttemptMulti` near-duplicate implementations (AGG-10)

- **From:** AGG-10 (CR12-CT3)
- **Reason:** After S4 normalizes the `blockedUntil` handling, the remaining duplication is cosmetic. A full refactor is low priority.
- **Exit criterion:** Next time the rate-limit module is significantly changed

### D25 — [LOW] CSP `style-src 'unsafe-inline'` (CR12-SR4)

- **Reason:** Common for Tailwind/component libraries. Lower risk than script-src unsafe-inline.
- **Exit criterion:** Component library migration or CSP nonce support for styles

### D26 — [LOW] `npm_package_version` in export metadata (CR12-SR3)

- **Reason:** Low risk — admin-gated feature. Version info aids debugging.
- **Exit criterion:** Security audit recommends version hiding

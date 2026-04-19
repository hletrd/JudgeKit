# Cycle 9 Review Remediation Plan

**Date:** 2026-04-19
**Status:** COMPLETE (all scheduled items done)
**Source:** `cycle-9-code-reviewer.md`, `cycle-9-security-reviewer.md`, `cycle-9-perf-reviewer.md`, `cycle-9-architect.md`, `cycle-9-critic.md`, `cycle-9-verifier.md`, `cycle-9-test-engineer.md`, `cycle-9-debugger.md`, `cycle-9-tracer.md`, `cycle-9-designer.md`, `_aggregate.md`

---

## Schedule (this cycle)

### S1 — [MEDIUM] Extract shared auth field mapping function to eliminate triple mapping

- **From:** AGG-1 (CR9-CR1, CR9-AR1, CR9-CT1, CR9-TE1)
- **File:** `src/lib/auth/config.ts:52-104, 327-345, 397-415`
- **Fix:**
  1. Create `mapUserToAuthFields(user: AuthUserRecord)` that returns an object with all ~15 auth fields
  2. Update `createSuccessfulLoginResponse` to use it
  3. Update `syncTokenWithUser` to use it
  4. Update the `jwt` callback's inline object to use it
  5. Create `mapTokenToSession(token: JWT)` for the session callback
  6. Add unit test that verifies `mapUserToAuthFields` output matches `mapTokenToSession` input for all fields
- **Status:** DONE (commit 71df1c30)

### S2 — [MEDIUM] Fix SSE re-auth race condition — make re-auth check blocking before processing status events

- **From:** AGG-2 (CR9-CR2, CR9-SR1, CR9-CT2, tracer Flow 2)
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:302-317`
- **Fix:**
  1. Convert the fire-and-forget re-auth IIFE to an awaited check
  2. If re-auth fails (user deactivated), close immediately without processing the status event
  3. Ensure `close()` is only called once by keeping the existing `closed` guard
- **Status:** DONE (commit 908b12a1)

### S3 — [MEDIUM] Fix SSE connection tracking eviction to remove oldest-by-age, not oldest-by-insertion-order

- **From:** AGG-3 (CR9-V2, CR9-DB1)
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:41-45`
- **Fix:**
  1. Change eviction logic to find the entry with the oldest `createdAt` timestamp
  2. When evicting, call `removeConnection(connId)` to properly decrement `userConnectionCounts`
  3. This prevents permanent connection count inflation
- **Status:** DONE (commit 832f9902)

### S4 — [LOW] Add BigInt handling to `normalizeValue` in export

- **From:** AGG-6 (CR9-V3, CR9-TE3)
- **File:** `src/lib/db/export.ts:215-222`
- **Fix:** Add `if (typeof val === "bigint") return val.toString()` before the final return
- **Status:** DONE (commit 434b94ba)

### S5 — [LOW] Remove `mysql` from valid `sourceDialect` list in `validateExport`

- **From:** AGG-7 (CR9-V4)
- **File:** `src/lib/db/export.ts:286`
- **Fix:** Change `["sqlite", "postgresql", "mysql"]` to `["sqlite", "postgresql"]`
- **Status:** DONE (commit 434b94ba)

### S6 — [LOW] Fix playground `stdin` off-by-one with newline append

- **From:** AGG-9 (CR9-CR4)
- **File:** `src/app/api/v1/playground/run/route.ts:13-17`
- **Fix:** Change `MAX_STDIN_LENGTH = 64 * 1024` to `MAX_STDIN_LENGTH = 64 * 1024 - 1` to account for the appended newline
- **Status:** DONE (commit 1ca7a88c)

---

## Workspace-to-public migration Phase 3 progress

Phase 3 (Dashboard layout refinement) is still PENDING. This cycle focuses on code quality fixes. Phase 3 is deferred pending design review.

Key remaining Phase 3 tasks:
1. Make the top navbar visible on dashboard pages
2. Consider converting AppSidebar to a slimmer icon rail
3. Move breadcrumb to top navbar area
4. Evaluate merging (control) into (dashboard)/admin

---

## Deferred (not this cycle)

### D1 — [MEDIUM] JWT `authenticatedAt` clock skew with DB `tokenInvalidatedAt`

- **From:** AGG-4 (CR9-V1)
- **File:** `src/lib/auth/config.ts:325,392`
- **Reason:** Requires careful design — using DB server time for `authenticatedAt` means an extra DB round-trip on login. A grace period is simpler but reduces security slightly. Needs product decision on the acceptable clock-skew window.
- **Exit criterion:** Performance profiling shows this as an actual problem; design decision on grace period vs DB-time approach

### D2 — [MEDIUM] JWT callback DB query on every request (carried from cycle 8 D6/D3)

- **From:** AGG-5 (CR9-PR1)
- **File:** `src/lib/auth/config.ts:364-387`
- **Reason:** Caching the JWT callback requires careful invalidation. A proper solution needs a shared cache design (e.g., in-memory LRU with TTL keyed by userId, invalidated when `tokenInvalidatedAt` changes).
- **Exit criterion:** Performance profiling shows JWT callback as a bottleneck; shared cache design approved

### D3 — [MEDIUM] SSE submission events route capability check incomplete (carried from cycle 8 D4/D1)

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Reason:** Requires understanding the full SSE auth flow and testing with custom roles. Needs careful validation to avoid breaking SSE connections.
- **Exit criterion:** Custom role test coverage in place; SSE route tests available

### D4 — [MEDIUM] Compiler workspace directory mode 0o770 (carried from cycle 8 D5/D2)

- **File:** `src/lib/compiler/execute.ts:635`
- **Reason:** Affects Docker-in-Docker deployment only. Current deployment uses root user in Docker.
- **Exit criterion:** Deployed on non-root Docker setup; workspace access confirmed

### D5 — [MEDIUM] Test coverage gaps for workspace-to-public migration Phase 2 (carried from cycle 8 D7/D4)

- **Reason:** Requires setting up component test infrastructure for PublicHeader.
- **Exit criterion:** Phase 3 header changes finalized; component test harness ready

### D6 — [LOW] SSE shared poll timer interval not adjustable at runtime

- **From:** AGG-10 (CR9-PR2)
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:129-139`
- **Reason:** Low impact — the interval is only read once when the timer starts. The timer restarts when all connections close and new ones open, picking up the new interval naturally.
- **Exit criterion:** Runtime config changes become more frequent; polling interval needs to be dynamic

### D7 — [LOW] Export abort does not cancel in-flight DB queries

- **From:** AGG-11 (CR9-DB3, tracer Flow 3)
- **File:** `src/lib/db/export.ts:45-144`
- **Reason:** The abort is cooperative, not preemptive. The DB query in flight must complete before the abort takes effect. For most tables, queries complete in <100ms. Only very large tables (>1M rows) would have noticeable delay.
- **Exit criterion:** Large-table export is a user-reported issue; PG driver supports query cancellation

### D8 — [LOW] Tags route lacks rate limiting (carried from cycle 6b AGG-6, cycle 9 AGG-8/CR9-SR3)

- **File:** `src/app/api/v1/tags/route.ts`
- **Reason:** Low risk since tags are read-only and non-sensitive. Wrapping in createApiHandler would also add auth checks which may not be desired for public tag listing.
- **Exit criterion:** Tags endpoint shows up in traffic analysis as an abuse vector

### D9 — [LOW] Backup/restore/migrate routes use manual auth pattern (carried from cycle 8 D8/D5)

- **Reason:** Low risk since they already have all security checks.
- **Exit criterion:** `createApiHandler` gains streaming response support

### D10 — [LOW] Files/[id] DELETE/PATCH manual auth (carried from cycle 8 D9/D6)

- **Reason:** Low priority consistency fix.
- **Exit criterion:** Next time these routes are touched

### D11 — [LOW] SSE re-auth rate limiting (carried from cycle 8 D10/D7)

- **Reason:** The re-auth endpoint requires the user's current session password, limiting brute-force risk.
- **Exit criterion:** Rate-limit infrastructure supports per-user key on SSE routes

### D12 — [LOW] PublicHeader click-outside-to-close (carried from cycle 8 D11/D8)

- **Reason:** UX enhancement, not a bug.
- **Exit criterion:** UX review of mobile menu behavior

### D13 — [LOW] `namedToPositional` regex alignment (carried from cycle 8 D12/D9)

- **Reason:** No actual vulnerability; validation regex catches the edge case.
- **Exit criterion:** Next time the file is touched

### D14 — [LOW] Community `scopeType: "solution"` thread creation lacks solved-problem check (carried from cycle 8 D1)

- **File:** `src/app/api/v1/community/threads/route.ts:17-30`
- **Reason:** Requires adding a DB query to check for accepted submissions. The community feature is not yet heavily used.
- **Exit criterion:** Community feature gains traction; product decision needed

### D15 — [LOW] Deprecated `recruitingInvitations.token` column still has unique index (carried from cycle 8 D2)

- **File:** `src/lib/db/schema.pg.ts:937,961`
- **Reason:** Requires a database migration.
- **Exit criterion:** Next schema migration cycle

### D16 — [LOW] `validateExport` missing duplicate table name check (carried from cycle 8 D3)

- **File:** `src/lib/db/export.ts:306-311`
- **Reason:** Validation gap only — import would handle duplicates gracefully.
- **Exit criterion:** Next time the export/import module is touched

### D17 — [LOW] `cleanup.ts` env var discrepancy (carried from cycle 8 D13)

- **File:** `src/lib/db/cleanup.ts:5`
- **Reason:** The cleanup endpoint is superseded by `data-retention-maintenance.ts`.
- **Exit criterion:** Remove `cleanup.ts` entirely when the cleanup endpoint is deprecated

### D18 — [LOW] `shareAcceptedSolutions` default-true policy not documented (CR9-SR2, CR9-CT4)

- **File:** `src/lib/auth/config.ts:66`
- **Reason:** Privacy-relevant setting; the default is intentional for educational use case but should be documented.
- **Exit criterion:** Next time the profile page or auth config is touched

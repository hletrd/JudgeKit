# Cycle 9 Aggregate Review (review-plan-fix loop)

## Scope
- Aggregated from: `cycle-9-code-reviewer.md`, `cycle-9-security-reviewer.md`, `cycle-9-perf-reviewer.md`, `cycle-9-architect.md`, `cycle-9-critic.md`, `cycle-9-verifier.md`, `cycle-9-test-engineer.md`, `cycle-9-debugger.md`, `cycle-9-tracer.md`, `cycle-9-designer.md`
- Base commit: 63a31dc0

## Deduped findings

### AGG-1 — [MEDIUM] Triple auth field mapping violates DRY — silent regression risk

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR9-CR1, architect CR9-AR1, critic CR9-CT1, test-engineer CR9-TE1
- **File:** `src/lib/auth/config.ts:52-104, 327-345, 397-415`
- **Evidence:** ~15 user fields are mapped in three separate code blocks: `createSuccessfulLoginResponse`, `syncTokenWithUser`, and the `jwt` callback inline. The `session` callback also mirrors these fields. Adding a new user preference requires coordinated changes in 4 places. A missed update breaks auth silently (no compile error, no test failure).
- **Failure scenario:** A developer adds a new preference field to `createSuccessfulLoginResponse` and `syncTokenWithUser` but forgets the `jwt` callback. The field is present on login but lost on JWT refresh.
- **Suggested fix:** Extract a shared `mapUserToAuthFields(user: AuthUserRecord)` function and a `mapTokenToSession(token)` function. All four locations should call the shared function. Add a unit test that verifies field consistency.

### AGG-2 — [MEDIUM] SSE re-auth check is fire-and-forget — deactivated user can receive one more status event, and terminal result can be lost in race

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR9-CR2, security-reviewer CR9-SR1, critic CR9-CT2, tracer (Flow 2)
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:302-317`
- **Evidence:** The re-auth check is initiated with `void (async () => { ... })()` and does not block the current status event. If the re-auth fails and `close()` runs before a terminal result is enqueued, the submission result is silently lost. Conversely, if a terminal result is being enqueued, the deactivated user receives it.
- **Failure scenario:** User account is deactivated while a submission is being judged. The re-auth check fires `close()`, but the terminal status is also reached. The `close()` from re-auth wins the race, and the client never receives the submission result.
- **Suggested fix:** Await the re-auth check before processing the status event. If re-auth fails, close immediately without processing. Alternatively, set a `revoked` flag and check it before enqueuing events.

### AGG-3 — [MEDIUM] SSE connection tracking eviction removes oldest tracking entry, not the oldest actual connection — userConnectionCounts can become permanently inflated

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** verifier CR9-V2, debugger CR9-DB1
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:41-45`
- **Evidence:** When `connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS` (2000), eviction takes `connectionInfoMap.keys().next().value` (first in insertion order). This evicts the tracking entry for the first-inserted connection, which may still be active. When that connection later closes, `removeConnection` skips the `userConnectionCounts` decrement because the info is already gone. The user's connection count becomes permanently inflated.
- **Failure scenario:** Under heavy SSE load, a user's tracking entry is evicted while their connection is still active. Their `userConnectionCounts` is permanently inflated. They can never open another SSE connection until the server restarts.
- **Suggested fix:** Evict the entry with the oldest `createdAt` from `ConnectionInfo`. When evicting, also call `removeConnection` to properly decrement counts.

### AGG-4 — [MEDIUM] JWT `authenticatedAt` uses app-server clock but `tokenInvalidatedAt` uses DB-server clock — potential clock skew mismatch

- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **Cross-agent agreement:** verifier CR9-V1
- **File:** `src/lib/auth/config.ts:325,392`
- **Evidence:** `authenticatedAtSeconds` is computed as `Math.trunc(Date.now() / 1000)` (app server time). `isTokenInvalidated` compares against `freshUser.tokenInvalidatedAt` (DB server time). If clocks are not synchronized, a newly authenticated user could have their token incorrectly invalidated on the next request.
- **Failure scenario:** App server clock is 5 seconds ahead of DB clock. A new login sets `authenticatedAt` to a future time from the DB's perspective. The `isTokenInvalidated` check could incorrectly invalidate the token.
- **Suggested fix:** Use the DB server's `NOW()` for `authenticatedAt` comparisons, or add a small grace period (e.g., 5s) to the `isTokenInvalidated` comparison.

### AGG-5 — [MEDIUM] JWT callback DB query on every authenticated request (deferred D3 — still present)

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** perf-reviewer CR9-PR1
- **File:** `src/lib/auth/config.ts:364-387`
- **Evidence:** The `jwt()` callback queries `db.query.users.findFirst` on every request to refresh the token with the latest user data. At moderate traffic (100 req/s), this is 100 DB queries/s just for auth refresh.
- **Suggested fix:** Cache user data for a short TTL (e.g., 30s) keyed by userId. Only re-query when the cache expires or when `tokenInvalidatedAt` changes.

### AGG-6 — [LOW] `normalizeValue` does not handle BigInt values from PostgreSQL

- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** verifier CR9-V3, test-engineer CR9-TE3
- **File:** `src/lib/db/export.ts:215-222`
- **Evidence:** PostgreSQL BIGINT columns may be returned as `BigInt` by some PG drivers. `JSON.stringify` throws a TypeError for BigInt values. The function has no BigInt handling.
- **Suggested fix:** Add `typeof val === "bigint"` check that converts to `Number` or `String`.

### AGG-7 — [LOW] `validateExport` accepts `mysql` as valid `sourceDialect` but no MySQL support exists

- **Severity:** LOW
- **Confidence:** LOW
- **Cross-agent agreement:** verifier CR9-V4
- **File:** `src/lib/db/export.ts:286`
- **Suggested fix:** Remove `"mysql"` from the valid dialect list.

### AGG-8 — [LOW] Tags route still lacks rate limiting (carried forward from cycle 6b AGG-6)

- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** security-reviewer CR9-SR3
- **File:** `src/app/api/v1/tags/route.ts`
- **Suggested fix:** Wrap in `createApiHandler` with `rateLimit: "tags:read"`.

### AGG-9 — [LOW] Playground `stdin` length off-by-one with newline append

- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** code-reviewer CR9-CR4
- **File:** `src/app/api/v1/playground/run/route.ts:13-17`
- **Suggested fix:** Reduce Zod max by 1 byte or add Buffer.byteLength check after appending.

### AGG-10 — [LOW] SSE shared poll timer interval not adjustable at runtime

- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** perf-reviewer CR9-PR2
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:129-139`
- **Suggested fix:** On each poll tick, check if the configured interval has changed and restart the timer if needed.

### AGG-11 — [LOW] Export abort does not cancel in-flight DB queries

- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** debugger CR9-DB3, tracer (Flow 3)
- **File:** `src/lib/db/export.ts:45-144`
- **Suggested fix:** Pass abort signal to DB queries or set a statement timeout.

## Deferred items carried forward from prior cycles

- D1: SSE submission events route capability check incomplete (MEDIUM)
- D2: Compiler workspace directory mode 0o770 (MEDIUM)
- D3: JWT callback DB query on every request (MEDIUM) — same as AGG-5
- D4: Test coverage gaps for workspace-to-public migration Phase 2 (MEDIUM)
- D5: Backup/restore/migrate routes use manual auth pattern (LOW)
- D6: Files/[id] DELETE/PATCH manual auth (LOW)
- D7: SSE re-auth rate limiting (LOW)
- D8: PublicHeader click-outside-to-close (LOW)
- D9: `namedToPositional` regex alignment (LOW)

## Prior-cycle findings verified as fixed

- AGG-2 (cycle 8): Backup `body` shadowing — FIXED (commit 8217a80d)
- AGG-3 (cycle 8): Encryption key caching — FIXED (commit d6497263)
- AGG-4 (cycle 8): Export polling interval — FIXED (commit 55d9cd3f)
- AGG-6 (cycle 8): `processImage` 500 error — FIXED (commit 9e654740)
- AGG-10 (cycle 8): `bytesToBase64` Edge Runtime comment — FIXED (commit 66290994)

## Agent failures
- No agent failures — all reviews completed successfully

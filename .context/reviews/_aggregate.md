# Cycle 10 Aggregate Review (review-plan-fix loop)

## Scope
- Aggregated from: `cycle-10-code-reviewer.md`, `cycle-10-security-reviewer.md`, `cycle-10-perf-reviewer.md`, `cycle-10-architect.md`, `cycle-10-critic.md`, `cycle-10-verifier.md`, `cycle-10-test-engineer.md`, `cycle-10-debugger.md`, `cycle-10-tracer.md`, `cycle-10-designer.md`
- Base commit: 56e78d62

## Deduped findings

### AGG-1 — [HIGH/MEDIUM] Auth field mapping has 6 separate field lists with no compile-time enforcement

- **Severity:** HIGH (maintenance hazard with silent failure mode)
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR10-CR1, architect CR10-AR1, critic CR10-CT1, verifier CR10-V2
- **Files:** `src/lib/auth/config.ts`, `src/lib/auth/session-security.ts`, `src/lib/db/selects.ts`
- **Evidence:** Six locations must be updated when adding a new auth preference field:
  1. `mapUserToAuthFields` (line 58-78) — centralized mapping
  2. `authorize()` inline object (line 280-296) — **MISSING `shareAcceptedSolutions` and `acceptedSolutionsAnonymous`**
  3. `jwt` callback `if (user)` branch (line 368-386)
  4. `jwt` callback `freshUser` branch (line 438-456)
  5. `clearAuthToken` (session-security.ts line 37-60)
  6. `jwt` callback DB query `columns` list (line 407-427)
  
  The `mapUserToAuthFields` extraction partially addressed this but the root cause remains. Two fields (`shareAcceptedSolutions`, `acceptedSolutionsAnonymous`) are already missing from the `authorize()` inline object, causing their DB values to be replaced by defaults on login.

### AGG-2 — [MEDIUM] `clearAuthToken` fallback to `token.iat` could bypass token revocation

- **Severity:** MEDIUM (security — token revocation bypass)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** security-reviewer CR10-SR1, debugger CR10-DB1, verifier CR10-V1
- **File:** `src/lib/auth/session-security.ts:37-60`
- **Evidence:** `clearAuthToken` deletes `authenticatedAt`, causing `getTokenAuthenticatedAtSeconds` to fall back to `token.iat`. If `iat > tokenInvalidatedAt`, the token would not be detected as invalidated.
- **Suggested fix:** Set `token.authenticatedAt = 0` instead of deleting it.

### AGG-3 — [MEDIUM] `authorize()` function missing `shareAcceptedSolutions` and `acceptedSolutionsAnonymous` — DB values lost on login

- **Severity:** MEDIUM (correctness — user preferences silently lost)
- **Confidence:** HIGH
- **Cross-agent agreement:** verifier CR10-V4, tracer Flow 2
- **File:** `src/lib/auth/config.ts:280-296`
- **Evidence:** The inline `AuthUserRecord` in `authorize()` (line 280-296) is missing `shareAcceptedSolutions` and `acceptedSolutionsAnonymous`. These fields default to `true` and `false` respectively via `mapUserToAuthFields`, overwriting whatever the user had set in the DB. This means:
  - A user who sets `shareAcceptedSolutions = false` will have it reset to `true` on every login
  - A user who sets `acceptedSolutionsAnonymous = true` will have it reset to `false` on every login
- **Suggested fix:** Add the missing fields to the inline object, or refactor `authorize()` to use `mapUserToAuthFields`.

### AGG-4 — [MEDIUM] PublicHeader uses hardcoded role checks while AppSidebar uses capability-based filtering

- **Severity:** MEDIUM (UX inconsistency that will worsen with custom roles)
- **Confidence:** HIGH
- **Cross-agent agreement:** critic CR10-CT2, designer CR10-D1, tracer Flow 3
- **File:** `src/components/layout/public-header.tsx:50-71`, `src/components/layout/app-sidebar.tsx:198-233`
- **Evidence:** `PublicHeader.getDropdownItems()` uses `role === "instructor"` checks. `AppSidebar.filterItems()` uses `capsSet.has(capability)`. Custom roles will see different navigation items.
- **Suggested fix:** Refactor `getDropdownItems` to accept capabilities and use capability-based filtering.

### AGG-5 — [MEDIUM] JWT callback DB query on every request — no TTL cache

- **Severity:** MEDIUM (performance)
- **Confidence:** HIGH
- **Cross-agent agreement:** perf-reviewer CR10-PR1, cycle-9 findings D3
- **File:** `src/lib/auth/config.ts:405-456`
- **Evidence:** The `jwt()` callback queries the DB on every authenticated request. At 100 req/s, this is 100 DB queries/s for auth alone. The proxy middleware already has a 2s TTL cache but it's not shared.
- **Suggested fix:** Add a short TTL cache (5-10s) keyed by userId inside the jwt callback, or share the proxy's auth cache.

### AGG-6 — [MEDIUM] SSE route is 475 lines with duplicated terminal-result-fetch logic

- **Severity:** MEDIUM (maintainability)
- **Confidence:** HIGH
- **Cross-agent agreement:** architect CR10-AR2, perf-reviewer CR10-PR2
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Evidence:** The file has two nearly-identical terminal-result-fetch blocks (lines 346-366 and 389-410). Connection tracking, polling, and route handler logic are all in one file.
- **Suggested fix:** Extract connection tracking and polling into separate modules. Deduplicate the terminal-result-fetch logic.

### AGG-7 — [LOW] Tags route lacks rate limiting

- **Severity:** LOW (security — no rate limiting)
- **Confidence:** HIGH
- **Cross-agent agreement:** security-reviewer CR10-SR3, cycle-9 CR9-SR3
- **File:** `src/app/api/v1/tags/route.ts`
- **Suggested fix:** Add `rateLimit: "tags:read"`.

### AGG-8 — [LOW] `validateShellCommand` denylist does not block `exec` and `source`

- **Severity:** LOW (defense-in-depth)
- **Confidence:** LOW
- **Cross-agent agreement:** security-reviewer CR10-SR4, cycle-9 CR9-SR4
- **File:** `src/lib/compiler/execute.ts:156`
- **Suggested fix:** Add `\bexec\b` and `\bsource\b` to the denylist.

### AGG-9 — [LOW] `localStorage.clear()` in sign-out clears all storage for the origin

- **Severity:** LOW (data loss in multi-app dev environments)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** code-reviewer CR10-CR5
- **File:** `src/components/layout/app-sidebar.tsx:240-241`
- **Suggested fix:** Remove only namespaced keys instead of clearing all storage.

### AGG-10 — [LOW] `recordRateLimitFailure` backoff exponent pattern differs from `consumeRateLimitAttemptMulti`

- **Severity:** LOW (code clarity)
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR10-CR4, debugger CR10-DB3
- **File:** `src/lib/security/rate-limit.ts:204, 166`
- **Suggested fix:** Normalize both functions to use the same pattern.

### AGG-11 — [LOW] Korean letter spacing violation — `tracking-tight` on site title, `tracking-wide` on labels

- **Severity:** LOW (CLAUDE.md rule violation)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** designer CR10-D2, CR10-D3
- **File:** `src/components/layout/public-header.tsx:176, 301`, `src/components/layout/app-sidebar.tsx:291`
- **Suggested fix:** Remove `tracking-tight`/`tracking-wide` from elements that may contain Korean text, or make them locale-conditional.

### AGG-12 — [LOW] `rateLimits` table used for SSE connections and heartbeats — semantic mismatch

- **Severity:** LOW (architectural)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** architect CR10-AR3, cycle-9 CR9-AR3
- **File:** `src/lib/realtime/realtime-coordination.ts`
- **Suggested fix:** Consider a dedicated `realtimeConnections` table.

## Previously Deferred Items (Carried Forward)

- D1: SSE submission events route capability check incomplete (MEDIUM)
- D3: JWT callback DB query on every request (MEDIUM) — now AGG-5
- D4: Test coverage gaps for workspace-to-public migration Phase 2 (MEDIUM)
- D5: Backup/restore/migrate routes use manual auth pattern (LOW)
- D6: Files/[id] DELETE/PATCH manual auth (LOW)
- D7: SSE re-auth rate limiting (LOW)
- D8: PublicHeader click-outside-to-close (LOW)
- D9: `namedToPositional` regex alignment (LOW)

## Previously Fixed (Verified This Cycle)

- Cycle-9 AGG-2: SSE re-auth race — FIXED (commit 908b12a1)
- Cycle-9 AGG-3: SSE eviction by insertion — FIXED (commit 832f9902)
- Cycle-9 CR9-V3: BigInt in normalizeValue — FIXED (commit 434b94ba)
- Cycle-9 CR9-V4: MySQL in validDialects — VERIFIED FIXED
- Cycle-9 CR9-CR4: Playground stdin length — FIXED (commit 1ca7a88c)
- Cycle-9 AGG-6: BigInt normalizeValue — FIXED (commit 434b94ba)

## Test Coverage Gaps (Priority Order)

1. `clearAuthToken` vs `syncTokenWithUser` field consistency test (AGG-1)
2. `mapUserToAuthFields` vs `authorize()` inline object field consistency test (AGG-3)
3. SSE re-auth integration test (from cycle 9)
4. Playground run route tests (from cycle 9)
5. PublicHeader vs AppSidebar capability consistency test (AGG-4)
6. Internal cleanup endpoint auth tests (CR10-TE4)

## Agent Failures

None — all reviews completed successfully.

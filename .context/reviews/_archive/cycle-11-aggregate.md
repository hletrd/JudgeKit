# Cycle 11 Aggregate Review (review-plan-fix loop)

## Scope
- Aggregated from: `cycle-11-code-reviewer.md`, `cycle-11-security-reviewer.md`, `cycle-11-perf-reviewer.md`, `cycle-11-architect.md`, `cycle-11-critic.md`, `cycle-11-verifier.md`, `cycle-11-test-engineer.md`, `cycle-11-debugger.md`, `cycle-11-designer.md`, `cycle-11-tracer.md`
- Base commit: 6c99b15c

## Deduped findings

### AGG-1 — [MEDIUM] Auth field mapping: 3 inline `AuthUserRecord` construction sites remain despite AUTH_PREFERENCE_FIELDS

- **Severity:** MEDIUM (correctness — DB values silently lost if field is missed)
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR11-CR1, architect CR11-AR3, critic CR11-CT1, verifier CR11-V1, CR11-V2, debugger CR11-DB2, tracer Flow 1, Flow 2
- **Files:** `src/lib/auth/config.ts:317-336, 408-430, 462-480`
- **Evidence:** Three locations still construct `AuthUserRecord` objects with hardcoded field lists:
  1. `authorize()` inline object (line 317-336) — passes to `createSuccessfulLoginResponse` → `mapUserToAuthFields`
  2. `jwt` callback `if (user)` branch inline object (line 408-430) — passes to `syncTokenWithUser`
  3. `jwt` callback `freshUser` branch inline object (line 462-480) — passes to `syncTokenWithUser`
  
  All three are redundant: the DB queries already fetch all columns (authorize uses no columns filter, freshUser uses AUTH_USER_COLUMNS). The inline objects must be manually kept in sync with `mapUserToAuthFields`. The `acceptedSolutionsAnonymous` bug was caused by exactly this pattern.
- **Suggested fix:** Refactor all three sites to pass the DB user object directly to `mapUserToAuthFields`/`syncTokenWithUser` instead of constructing intermediate inline objects.

### AGG-2 — [MEDIUM] `AUTH_TOKEN_FIELDS` (session-security.ts) and `AUTH_PREFERENCE_FIELDS` (config.ts) are maintained independently — no compile-time enforcement of sync

- **Severity:** MEDIUM (security — stale JWT fields after token revocation)
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR11-CR2, security-reviewer CR11-SR2, architect CR11-AR1
- **Files:** `src/lib/auth/session-security.ts:42-63`, `src/lib/auth/config.ts:58-69`
- **Evidence:** `AUTH_TOKEN_FIELDS` (session-security.ts) lists 21 fields. `AUTH_PREFERENCE_FIELDS` (config.ts) lists 10 preference fields. These two arrays must stay in sync: every preference field must appear in both. There is no import relationship or compile-time check. If a new field is added to `AUTH_PREFERENCE_FIELDS` but not `AUTH_TOKEN_FIELDS`, `clearAuthToken` would not clear it.
- **Suggested fix:** Import `AUTH_PREFERENCE_FIELDS` into session-security.ts and build `AUTH_TOKEN_FIELDS` from it: `const AUTH_TOKEN_FIELDS = ['sub', ...AUTH_PREFERENCE_FIELDS, 'authenticatedAt', 'uaHash'] as const`.

### AGG-3 — [MEDIUM] JWT callback DB query on every request — no TTL cache (deferred D3)

- **Severity:** MEDIUM (performance)
- **Confidence:** HIGH
- **Cross-agent agreement:** perf-reviewer CR11-PR1, cycle-10 AGG-5
- **File:** `src/lib/auth/config.ts:448-452`
- **Evidence:** The `jwt()` callback queries the DB on every authenticated request. At 100 req/s, this is 100 DB queries/s for auth alone. The proxy middleware already has a 2s TTL cache but it's not shared.
- **Suggested fix:** Add a short TTL cache (5-10s) keyed by userId inside the jwt callback, or share the proxy's auth cache.

### AGG-4 — [MEDIUM] SSE route is 475 lines with duplicated terminal-result-fetch logic

- **Severity:** MEDIUM (maintainability + potential concurrent double-query)
- **Confidence:** HIGH
- **Cross-agent agreement:** architect CR11-AR2, perf-reviewer CR11-PR2, code-reviewer CR11-CR3
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Evidence:** The file has two nearly-identical terminal-result-fetch blocks (lines 346-366 and 389-410). Connection tracking, polling, and route handler logic are all in one file.
- **Suggested fix:** Extract connection tracking and polling into separate modules. Deduplicate the terminal-result-fetch logic into a shared helper.

### AGG-5 — [MEDIUM] Metrics endpoint allows dual auth paths without rate limiting

- **Severity:** MEDIUM (security — unthrottled DB access via CRON_SECRET)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** security-reviewer CR11-SR1
- **File:** `src/app/api/metrics/route.ts:23-48`
- **Evidence:** The GET `/api/metrics` endpoint has two auth paths: session auth with `system.settings` capability, or CRON_SECRET bearer token. Neither path is rate-limited. An attacker who obtains the CRON_SECRET could make unlimited requests.
- **Suggested fix:** Wrap the CRON_SECRET path in a rate limiter, or migrate the endpoint to use `createApiHandler`.

### AGG-6 — [LOW] SSE `onPollResult` can enqueue on closed stream — noisy error logs

- **Severity:** LOW (robustness)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** debugger CR11-DB1
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:315-424`
- **Suggested fix:** Add `if (closed) return` before each `controller.enqueue` call.

### AGG-7 — [LOW] SSE cleanup timer runs even when there are no connections

- **Severity:** LOW (performance — unnecessary CPU wake)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** debugger CR11-DB3
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:82-90`
- **Suggested fix:** Add early return when `connectionInfoMap.size === 0`.

### AGG-8 — [LOW] `authUserSelect` does not include preference fields — latent risk

- **Severity:** LOW (latent risk — no active bug)
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR11-CR4
- **File:** `src/lib/db/selects.ts:3-13`
- **Suggested fix:** Add JSDoc noting that preference fields are intentionally excluded.

### AGG-9 — [LOW] Internal cleanup endpoint has no rate limiting

- **Severity:** LOW (security — unthrottled cleanup)
- **Confidence:** LOW
- **Cross-agent agreement:** security-reviewer CR11-SR3
- **File:** `src/app/api/internal/cleanup/route.ts`
- **Suggested fix:** Add in-memory rate limiter (one cleanup per 60s).

### AGG-10 — [LOW] `tracking-wide`/`tracking-wider` on labels may affect Korean text

- **Severity:** LOW (CLAUDE.md rule violation)
- **Confidence:** LOW
- **Cross-agent agreement:** designer CR11-D1
- **Files:** `src/components/layout/app-sidebar.tsx:291`, `src/components/layout/public-header.tsx:320`
- **Suggested fix:** Make tracking classes locale-conditional or verify labels are always English.

### AGG-11 — [LOW] `shareAcceptedSolutions` default-true not documented

- **Severity:** LOW (documentation)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** critic CR11-CT3, cycle-10 CR10-CT4
- **File:** `src/lib/auth/config.ts:107`
- **Suggested fix:** Add comment explaining privacy rationale for opt-out default.

### AGG-12 — [LOW] Workspace-to-public migration Phase 3 still not started

- **Severity:** LOW (architectural debt)
- **Confidence:** HIGH
- **Cross-agent agreement:** architect CR11-AR4, critic CR11-CT2
- **File:** `plans/open/2026-04-19-workspace-to-public-migration.md`
- **Suggested fix:** Start Phase 3 this cycle: add PublicHeader to dashboard layout.

## Test Coverage Gaps (Priority Order)

1. `AUTH_TOKEN_FIELDS` vs `syncTokenWithUser` field consistency test (AGG-2)
2. `mapUserToAuthFields` vs `authorize()` inline object field consistency test (AGG-1)
3. SSE re-auth integration test (from cycle 9)
4. Playground run route tests (from cycle 9)
5. Internal cleanup endpoint auth tests (AGG-9)
6. PublicHeader vs AppSidebar capability consistency test

## Previously Deferred Items (Carried Forward)

- D1: SSE submission events route capability check incomplete (MEDIUM)
- D3: JWT callback DB query on every request (MEDIUM) — now AGG-3
- D4: Test coverage gaps for workspace-to-public migration Phase 2 (MEDIUM)
- D5: Backup/restore/migrate routes use manual auth pattern (LOW)
- D6: Files/[id] DELETE/PATCH manual auth (LOW)
- D7: SSE re-auth rate limiting (LOW)
- D8: PublicHeader click-outside-to-close (LOW)
- D9: `namedToPositional` regex alignment (LOW)

## Previously Fixed (Verified This Cycle — Since Cycle 10 Base)

- AGG-2 (CR10-SR1): `clearAuthToken` fallback to `iat` — FIXED (sets `authenticatedAt = 0`)
- AGG-3 (CR10-V4): `authorize()` missing `shareAcceptedSolutions`/`acceptedSolutionsAnonymous` — FIXED
- AGG-4 (CR10-CT2): PublicHeader uses hardcoded role checks — FIXED (now capability-based)
- AGG-7 (CR10-SR3): Tags route lacks rate limiting — FIXED
- AGG-8 (CR10-SR4): Shell command denylist missing `exec`/`source` — FIXED
- AGG-10 (CR10-CR4): `recordRateLimitFailure` backoff exponent inconsistency — FIXED
- AGG-11 (CR10-D2/D3): Korean letter spacing violations — FIXED

## Agent Failures

None — all reviews completed successfully.

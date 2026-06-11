# Cycle 12 Aggregate Review (review-plan-fix loop)

## Scope
- Aggregated from: `cycle-12-code-reviewer.md`, `cycle-12-security-reviewer.md`, `cycle-12-perf-reviewer.md`, `cycle-12-architect.md`, `cycle-12-critic.md`, `cycle-12-verifier.md`, `cycle-12-test-engineer.md`, `cycle-12-debugger.md`, `cycle-12-tracer.md`, `cycle-12-designer.md`
- Base commit: 2339c7ea

## Deduped findings

### AGG-1 — [MEDIUM] `authorizeRecruitingToken` bypasses `mapUserToAuthFields` — inline field list that will silently miss new preference fields

- **Severity:** MEDIUM (correctness — new preference fields silently missed)
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR12-CR1, security-reviewer CR12-SR1 (partial), architect CR12-AR1, critic CR12-CT1, verifier CR12-V1/V2, test-engineer CR12-TE1, debugger CR12-DB1, tracer Flow 2
- **Files:** `src/lib/auth/recruiting-token.ts:55-72`
- **Evidence:** The function manually constructs the return value with an inline field list (id, username, email, name, className, role, preferredLanguage, etc.) instead of using `mapUserToAuthFields`. This is the exact same anti-pattern that was fixed in `config.ts` during cycle 11 (AGG-1). If a new preference field is added to AUTH_PREFERENCE_FIELDS and mapUserToAuthFields, the recruiting token path will silently miss it, applying defaults instead of DB values. This already caused the `shareAcceptedSolutions` bug in cycle 10.
- **Suggested fix:** Refactor to use `mapUserToAuthFields(user)` and spread the result, adding `loginEventContext` on top.

### AGG-2 — [MEDIUM] `authorizeRecruitingToken` hardcodes `mustChangePassword: false` — bypasses forced password change for recruiting token users

- **Severity:** MEDIUM (security — forced password change bypass)
- **Confidence:** HIGH
- **Cross-agent agreement:** security-reviewer CR12-SR1, verifier CR12-V1/V2, debugger CR12-DB1, tracer Flow 1
- **Files:** `src/lib/auth/recruiting-token.ts:62`
- **Evidence:** The function hardcodes `mustChangePassword: false` regardless of the actual DB value. If an admin has set `mustChangePassword = true` for a user, that user can bypass the forced password change by authenticating via a recruiting token. The DB query (lines 28-48) does not select `mustChangePassword` at all. The proxy layer checks `activeUser.mustChangePassword` but only sees the JWT value, which was set to `false` by this function.
  - Scenario: Admin flags user for password change -> User opens recruiting link -> Logs in with `mustChangePassword: false` -> Never redirected to `/change-password`.
- **Suggested fix:** (1) Add `mustChangePassword` to the DB query columns. (2) Pass the actual DB value instead of hardcoding `false`.

### AGG-3 — [MEDIUM] Dashboard layout has double-header pattern — PublicHeader + SidebarInset header — wastes vertical space and confuses navigation

- **Severity:** MEDIUM (UX — navigation confusion)
- **Confidence:** HIGH
- **Cross-agent agreement:** architect CR12-AR2, designer CR12-D1, critic CR12-CT2
- **Files:** `src/app/(dashboard)/layout.tsx:72-93, 104-110`
- **Evidence:** The dashboard layout renders both `PublicHeader` (full-width top nav) and a `SidebarInset` header (hamburger + lecture toggle). This creates two horizontal bars consuming ~96px of vertical space. The sidebar trigger is separated from the top nav, which is confusing for users. This is a known Phase 3 intermediate state from the workspace-to-public migration plan.
- **Suggested fix:** Move the sidebar trigger and lecture mode toggle into PublicHeader. Remove the SidebarInset header. This is the next step in the workspace-to-public migration Phase 3.

### AGG-4 — [MEDIUM] `AuthUserInput` type has `[key: string]: unknown` index signature — weakens type safety across auth module

- **Severity:** MEDIUM (maintainability — type safety erosion)
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR12-CR2, architect CR12-AR1
- **Files:** `src/lib/auth/types.ts:71`
- **Evidence:** The index signature `[key: string]: unknown` allows any arbitrary key-value pair to be assigned to `AuthUserInput` without TypeScript flagging it. This defeats the purpose of having typed fields. Typos like `user.preferrdLanguage` would not be caught. The signature was added so DB user objects (which have extra fields like passwordHash, isActive) can be passed to `mapUserToAuthFields` without type errors.
- **Suggested fix:** Remove the index signature from `AuthUserInput`. Use an explicit intersection type (e.g., `AuthUserInput & Record<string, unknown>`) only at call sites where DB user objects are passed.

### AGG-5 — [MEDIUM] Dashboard layout makes 5+ DB/IO queries per navigation — capabilities and settings not cached

- **Severity:** MEDIUM (performance)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** perf-reviewer CR12-PR1, code-reviewer CR12-CR7
- **Files:** `src/app/(dashboard)/layout.tsx:34-62`
- **Evidence:** The layout calls `resolveCapabilities`, `isPluginEnabled`, `isAiAssistantEnabled`, `getResolvedSystemSettings`, `isInstructorOrAboveAsync`, `getActiveTimedAssignmentsForSidebar` on every dashboard page navigation. Capabilities are per-role and never change between requests. System settings rarely change. These could be cached with short TTLs.
- **Suggested fix:** Cache `resolveCapabilities` results per role with a 60s TTL. Cache plugin/AI status with a 30s TTL. (This overlaps with the deferred JWT callback cache item D2/D3.)

### AGG-6 — [LOW] `recordRateLimitFailure` uses `blockedUntil || null` while `consumeRateLimitAttemptMulti` uses `blockedUntil > 0 ? blockedUntil : null` — inconsistency

- **Severity:** LOW (correctness — no practical impact, but code smell)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** security-reviewer CR12-SR2, debugger CR12-DB3, test-engineer CR12-TE3
- **Files:** `src/lib/security/rate-limit.ts:175,215,225,253`
- **Evidence:** `|| null` treats `0` as falsy, converting it to `null`. `> 0 ? x : null` is explicit. While `blockedUntil = 0` never occurs in practice, the inconsistent patterns across the same module increase cognitive load and risk of bugs if the calculation changes.
- **Suggested fix:** Normalize all three functions to use `blockedUntil > 0 ? blockedUntil : null`.

### AGG-7 — [LOW] No test for `authorizeRecruitingToken` field completeness or mustChangePassword bypass

- **Severity:** LOW (test gap)
- **Confidence:** HIGH
- **Cross-agent agreement:** test-engineer CR12-TE1, CR12-TE2
- **Files:** `tests/unit/auth/recruiting-token.test.ts` (missing)
- **Evidence:** There are no unit tests for `authorizeRecruitingToken`. Given that this function has two confirmed bugs (hardcoded mustChangePassword, inline field list), tests are needed to prevent regression.
- **Suggested fix:** Add unit tests verifying: (1) returned fields match `mapUserToAuthFields` output keys, (2) `mustChangePassword` is read from DB, not hardcoded.

### AGG-8 — [LOW] `getDropdownItems` capability-based filtering not tested

- **Severity:** LOW (test gap)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** test-engineer CR12-TE4
- **Files:** No test file for `getDropdownItems` in `src/components/layout/public-header.tsx`
- **Evidence:** The dropdown items are filtered by capabilities, but there's no test verifying the filtering logic produces correct results for different capability sets.
- **Suggested fix:** Add a unit test for `getDropdownItems` covering various capability combinations.

### AGG-9 — [LOW] Mobile menu lacks "back to public site" link for dashboard users

- **Severity:** LOW (UX)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** designer CR12-D2
- **Files:** `src/components/layout/public-header.tsx:317-343`
- **Evidence:** When logged in, the mobile menu only shows dashboard navigation items. There's no link back to public pages (Practice, Playground, etc.) in the authenticated section. Users must scroll up to the top navigation items, which are less prominent in the mobile menu.
- **Suggested fix:** Add a "Public Site" or "Home" link at the top of the authenticated mobile menu section.

### AGG-10 — [LOW] `recordRateLimitFailure` / `recordRateLimitFailureMulti` / `consumeRateLimitAttemptMulti` near-duplicate implementations

- **Severity:** LOW (maintainability)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** critic CR12-CT3
- **Files:** `src/lib/security/rate-limit.ts:144-269`
- **Evidence:** Three functions implement the same block-duration calculation with subtle differences. Any change to the calculation must be applied in three places.
- **Suggested fix:** Extract a shared `incrementAndMaybeBlock` helper.

### AGG-11 — [LOW] SSE re-auth IIFE fires DB query even if connection already closed

- **Severity:** LOW (performance — wasted DB query)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** debugger CR12-DB2
- **Files:** `src/app/api/v1/submissions/[id]/events/route.ts:325-381`
- **Evidence:** The async IIFE starts `await getApiUser(request)` before checking `if (closed) return`. The check happens after the DB query completes, wasting a DB round-trip if the connection closed in the meantime.
- **Suggested fix:** Add `if (closed) return` at the start of the async IIFE before `getApiUser`.

### AGG-12 — [LOW] `tracking-wide` on mobile menu "DASHBOARD" label — Korean i18n risk (carried from cycle 11 D15)

- **Severity:** LOW (CLAUDE.md rule — future risk)
- **Confidence:** LOW
- **Cross-agent agreement:** designer CR12-D3
- **Files:** `src/components/layout/public-header.tsx:320`
- **Evidence:** The tracking class is acceptable for current English uppercase text but would violate CLAUDE.md if translated to Korean.
- **Suggested fix:** Make locale-conditional when Korean i18n is implemented for this label.

## Test Coverage Gaps (Priority Order)

1. `authorizeRecruitingToken` field completeness vs `mapUserToAuthFields` (AGG-7)
2. `mustChangePassword` bypass via recruiting token (AGG-7)
3. `getDropdownItems` capability-based filtering (AGG-8)
4. Rate limit function parity test (AGG-6)
5. JWT callback DB query TTL cache (deferred from cycle 9)
6. SSE re-auth integration test (deferred from cycle 9)

## Previously Deferred Items (Carried Forward)

- D1: JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2: JWT callback DB query on every request — add TTL cache (MEDIUM)
- D3: SSE route refactoring — extract connection tracking and polling (MEDIUM)
- D4: SSE submission events route capability check incomplete (MEDIUM)
- D5: Test coverage gaps for workspace-to-public migration (MEDIUM)
- D6: Metrics endpoint dual auth paths without rate limiting (MEDIUM)
- D7: Internal cleanup endpoint has no rate limiting (LOW)
- D8: `localStorage.clear()` clears all storage for origin (LOW)
- D9: `rateLimits` table used for SSE connections and heartbeats (LOW)
- D10: Backup/restore/migrate routes use manual auth pattern (LOW)
- D11: Files/[id] DELETE/PATCH manual auth (LOW)
- D12: SSE re-auth rate limiting (LOW)
- D13: PublicHeader click-outside-to-close (LOW)
- D14: `namedToPositional` regex alignment (LOW)
- D15: `tracking-wide`/`tracking-wider` Korean text risk (LOW)
- D16: SSE shared poll timer interval not adjustable at runtime (LOW)
- D17: Export abort does not cancel in-flight DB queries (LOW)
- D18: Deprecated `recruitingInvitations.token` column still has unique index (LOW)
- D19: `validateExport` missing duplicate table name check (LOW)

## Agent Failures

None — all reviews completed successfully.

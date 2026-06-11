# Cycle 14 Aggregate Review (review-plan-fix loop)

## Scope
- Aggregated from: `cycle-14-code-reviewer.md`, `cycle-14-security-reviewer.md`, `cycle-14-perf-reviewer.md`, `cycle-14-architect.md`, `cycle-14-critic.md`, `cycle-14-verifier.md`, `cycle-14-test-engineer.md`, `cycle-14-debugger.md`, `cycle-14-tracer.md`, `cycle-14-designer.md`, `cycle-14-doc-specialist.md`
- Base commit: 74d403a6

## Deduped findings

### AGG-1 — [MEDIUM] `changePassword` TOCTOU race — `isRateLimited` + `recordRateLimitFailure` is not atomic

- **Severity:** MEDIUM (security — concurrent wrong-password attempts can exceed rate limit)
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR14-CR1, security-reviewer CR14-SR1/SR2, critic CR14-CT1, debugger CR14-DB1, test-engineer CR14-TE1, tracer Flow 1
- **Files:** `src/lib/actions/change-password.ts:40-53`, `src/lib/security/rate-limit.ts:118-123,195-232`
- **Evidence:** The `changePassword` server action calls `isRateLimited(key)` (check) then `recordRateLimitFailure(key)` (increment) as two separate transactions. Between them, the row lock from `isRateLimited` is released. Concurrent requests can both pass the check before any increment is recorded, allowing the max attempts to be exceeded. The auth login path correctly uses `consumeRateLimitAttemptMulti` for atomic check+increment. The change-password path was likely written before this atomic pattern was introduced.
- **Failure scenario:** User has 4/5 rate limit attempts. Two concurrent wrong-password requests both pass `isRateLimited` (4 < 5). Both increment to 5. Neither gets blocked. The attacker gets double the allowed attempts.
- **Suggested fix:** Replace the `isRateLimited` + `recordRateLimitFailure` pair with `consumeRateLimitAttemptMulti(rateLimitKey)`, which atomically checks and increments in a single transaction. On success, call `clearRateLimit`. On failure, the rate limit is already consumed — return the appropriate error.

### AGG-2 — [MEDIUM] API key auth hardcodes `mustChangePassword: false` — admin-forced password change bypassed via API key

- **Severity:** MEDIUM (security — forced password change policy bypass)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** security-reviewer CR14-SR3, architect CR14-AR3, tracer Flow 2
- **Files:** `src/lib/api/api-key-auth.ts:121`
- **Evidence:** `authenticateApiKey` hardcodes `mustChangePassword: false` in the returned user object. The middleware checks `activeUser.mustChangePassword` and blocks access when true. But API key-authenticated requests always get `mustChangePassword: false`, bypassing the forced-password-change check. The DB query at lines 89-93 already fetches `authUserSelect` which includes `mustChangePassword`, so the actual value is available.
- **Failure scenario:** Admin flags user for password change. User has an active API key. User continues making API requests without changing their password.
- **Suggested fix:** Read `mustChangePassword` from the fetched user object instead of hardcoding `false`. If there's a legitimate reason to bypass forced password changes for API keys (e.g., automated services), document this explicitly with a comment.

### AGG-3 — [MEDIUM] `mapTokenToSession` uses `(session.user as Record<string, unknown>)` — unsafe cast bypasses TypeScript session type

- **Severity:** MEDIUM (maintainability — type safety erosion)
- **Confidence:** HIGH
- **Cross-agent agreement:** verifier CR14-V1
- **Files:** `src/lib/auth/config.ts:148-158`
- **Evidence:** The preference fields loop in `mapTokenToSession` casts `session.user` to `Record<string, unknown>` to set fields dynamically. This bypasses the TypeScript `DefaultSession` type. Downstream code accessing these fields (e.g., `session.user.preferredLanguage`) must also use type casts. Extending the NextAuth `Session` type declaration would make all preference fields properly typed.
- **Suggested fix:** Add a NextAuth module augmentation that extends `Session["user"]` with all preference fields from `AUTH_PREFERENCE_FIELDS`. Then the cast can be removed and `session.user.preferredLanguage` would be properly typed.

### AGG-4 — [LOW] `recordRateLimitFailureMulti` insert uses `windowStartedAt: now` while other functions use `entry.windowStartedAt` — inconsistency

- **Severity:** LOW (correctness — currently equivalent, but inconsistent)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** code-reviewer CR14-CR2, critic CR14-CT2, debugger CR14-DB3, tracer Flow 3
- **Files:** `src/lib/security/rate-limit.ts:261`
- **Evidence:** `recordRateLimitFailureMulti` uses `windowStartedAt: now` for inserts (line 261). `recordRateLimitFailure` and `consumeRateLimitAttemptMulti` use `windowStartedAt: entry.windowStartedAt`. For new entries, `getEntry` returns `entry.windowStartedAt = now`, so the values are identical. But the inconsistency means any change to `getEntry`'s logic could create a behavioral divergence.
- **Suggested fix:** Normalize `recordRateLimitFailureMulti` to use `entry.windowStartedAt` like the other functions.

### AGG-5 — [LOW] Sync role-helper functions are dead code — `isAtLeastRole`, `canManageUsers`, `isInstructorOrAbove` never called

- **Severity:** LOW (maintainability — dead code)
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR14-CR3/CR4, architect CR14-AR2
- **Files:** `src/lib/auth/role-helpers.ts:11-13,30-32,46-48`
- **Evidence:** Grep confirms these sync functions are never called outside their definitions. They were superseded by async versions that support custom roles via the capability cache. `canManageRole` was already removed in cycle 14 for the same reason.
- **Suggested fix:** Remove `isAtLeastRole`, `canManageUsers`, and `isInstructorOrAbove` sync functions. Keep only the async versions.

### AGG-6 — [LOW] `api-rate-limit.ts` never increments `consecutiveBlocks` — no backoff escalation for API abusers

- **Severity:** LOW (correctness — no practical impact currently, but inconsistent with login rate limiter)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** code-reviewer CR14-CR6, critic CR14-CT3, test-engineer CR14-TE4, doc-specialist CR14-DOC3
- **Files:** `src/lib/security/api-rate-limit.ts:70-109`
- **Evidence:** The API rate limiter always uses `consecutiveBlocks: 0` on insert and never updates it. The login rate limiter tracks `consecutiveBlocks` for exponential backoff. This may be intentional (API rate limits may not need backoff), but it's not documented.
- **Suggested fix:** Add a comment explaining that API rate limits use fixed blocking without exponential backoff, and why.

### AGG-7 — [LOW] `api-rate-limit.ts` inserts include `id: nanoid()` while `rate-limit.ts` relies on schema default — inconsistent pattern

- **Severity:** LOW (maintainability — double nanoid pattern)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** debugger CR14-DB2
- **Files:** `src/lib/security/api-rate-limit.ts:71`, `src/lib/security/rate-limit.ts:222-229`
- **Evidence:** `api-rate-limit.ts` explicitly provides `id: nanoid()` in inserts. `rate-limit.ts` does NOT include `id` in inserts, relying on the schema's `$defaultFn`. Both work, but the inconsistency is a maintenance risk — if one pattern changes without the other, inserts could fail.
- **Suggested fix:** Normalize to one pattern. Preferably use the schema default consistently and remove explicit `id` from `api-rate-limit.ts` inserts.

### AGG-8 — [LOW] `AUTH_PREFERENCE_FIELDS` comment doesn't explain why `mustChangePassword` is excluded

- **Severity:** LOW (documentation)
- **Confidence:** HIGH
- **Cross-agent agreement:** verifier CR14-V2, doc-specialist CR14-DOC1
- **Files:** `src/lib/auth/types.ts:1-7`
- **Evidence:** The comment says to add new preference fields here, but doesn't explain that `mustChangePassword` is intentionally excluded because it's a security field, not a user preference. A developer might mistakenly add security fields here.
- **Suggested fix:** Add a note: "Security fields (mustChangePassword, isActive, tokenInvalidatedAt) are NOT preference fields and are handled separately in AUTH_CORE_FIELDS."

### AGG-9 — [LOW] `recordRateLimitFailure` has no JSDoc — callers may not realize it's not atomic

- **Severity:** LOW (documentation)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** doc-specialist CR14-DOC2
- **Files:** `src/lib/security/rate-limit.ts:195`
- **Evidence:** `recordRateLimitFailure` has no JSDoc. Unlike `consumeRateLimitAttemptMulti` which documents its atomic nature, `recordRateLimitFailure` is a non-atomic operation that should not be used in check-then-record patterns.
- **Suggested fix:** Add JSDoc: "Record a failed attempt for the given key. NOTE: This function is not atomic — callers that need check+increment in one transaction should use `consumeRateLimitAttemptMulti` instead."

### AGG-10 — [LOW] PublicHeader dropdown missing "contests" link — navigation gap

- **Severity:** LOW (UX — extra navigation step for students)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** designer CR14-D1, verifier CR14-V4
- **Files:** `src/components/layout/public-header.tsx:68-93`
- **Evidence:** The dropdown menu includes dashboard, problems, groups, submissions, profile, admin — but not "contests". The AppSidebar includes contests. A student on a public page must navigate to the dashboard first to access contests.
- **Suggested fix:** Add a "contests" entry to `getDropdownItems` (no capability check needed — all authenticated users can see contests).

## Test Coverage Gaps (Priority Order)

1. `changePassword` TOCTOU race test — concurrent wrong-password attempts (AGG-1)
2. API key auth `mustChangePassword` behavior test (AGG-2)
3. Rate-limit function `windowStartedAt` consistency test (AGG-4)
4. API rate limit `consecutiveBlocks` behavior test (AGG-6)

## Previously Deferred Items (Carried Forward)

- D1-D26 from cycle 12b aggregate (all carried forward unchanged — see `cycle-12-aggregate.md`)
- D27-D28 from cycle 13 aggregate (carried forward unchanged — see `cycle-13-aggregate.md`)

## Agent Failures

None — all 11 reviews completed successfully (code-reviewer, security-reviewer, perf-reviewer, architect, critic, verifier, test-engineer, debugger, tracer, designer, doc-specialist).

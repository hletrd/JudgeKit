# Cycle 14 Document Specialist Report

**Base commit:** 74d403a6
**Reviewer:** document-specialist
**Scope:** Doc/code mismatches, comment accuracy, type documentation

---

## CR14-DOC1 — [LOW] `AUTH_PREFERENCE_FIELDS` comment doesn't explain why `mustChangePassword` is excluded

- **Confidence:** HIGH
- **Files:** `src/lib/auth/types.ts:1-7`
- **Evidence:** The comment says "Central definition shared by config.ts and session-security.ts. When adding a new preference field, add it HERE and to AuthUserRecord." But it doesn't explain that `mustChangePassword` is intentionally excluded because it's a security field, not a user preference. A developer adding new fields might wonder whether security fields like `mustChangePassword` should be added here.
- **Suggested fix:** Add a note: "Security fields (mustChangePassword, isActive, tokenInvalidatedAt) are NOT preference fields and are handled separately in AUTH_CORE_FIELDS."

## CR14-DOC2 — [LOW] `rate-limit.ts` `recordRateLimitFailure` JSDoc doesn't mention it's not atomic (check-then-record)

- **Confidence:** MEDIUM
- **Files:** `src/lib/security/rate-limit.ts:195`
- **Evidence:** `recordRateLimitFailure` has no JSDoc comment. Unlike `consumeRateLimitAttemptMulti` which clearly documents its atomic nature, `recordRateLimitFailure` is a non-atomic operation. Callers (like `changePassword`) may not realize they need to use `isRateLimited` + `recordRateLimitFailure` together in a way that creates a TOCTOU race.
- **Suggested fix:** Add a JSDoc comment: "Record a failed attempt for the given key. NOTE: This function is not atomic — callers that need check+increment in one transaction should use `consumeRateLimitAttemptMulti` instead."

## CR14-DOC3 — [LOW] `api-rate-limit.ts` `checkServerActionRateLimit` doesn't set `consecutiveBlocks` — no documentation

- **Confidence:** LOW
- **Files:** `src/lib/security/api-rate-limit.ts:203-267`
- **Evidence:** `checkServerActionRateLimit` inserts entries with `consecutiveBlocks: 0` and never updates it. There is no comment explaining whether this is intentional or an oversight.
- **Suggested fix:** Add a comment: "Server action rate limits use fixed blocking without exponential backoff (consecutiveBlocks is always 0)."

## Final Sweep

- `mapUserToAuthFields` comment is accurate after the cycle 13 refactor.
- `syncTokenWithUser` comment accurately describes the Object.assign pattern.
- `mapTokenToSession` comment accurately describes the preference fields loop.
- `public-nav.ts` comment accurately describes the shared navigation config.
- `session-security.ts` comment about `AUTH_TOKEN_FIELDS` derivation is accurate.

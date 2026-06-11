# Code Reviewer — Cycle 14

**Date:** 2026-04-24
**Base commit:** ca6b7d84

## CR14-CR1: `mapTokenToSession` still uses manual field assignments despite `syncTokenWithUser` being fixed with `Object.assign`

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/auth/config.ts:142-168`
- **Evidence:** `syncTokenWithUser` was fixed in cycle 13 to use `Object.assign(token, fields)` (line 122), which automatically picks up new preference fields. However, `mapTokenToSession` (lines 142-168) still manually assigns each preference field one by one (e.g., `session.user.preferredLanguage = token.preferredLanguage ?? null`). This is the same class of bug that caused the `shareAcceptedSolutions` issue in cycle 10 — if a developer adds a new field to `AUTH_PREFERENCE_FIELDS` and `mapUserToAuthFields`, they must remember to also add it to `mapTokenToSession`. The comment on line 157 even acknowledges this: "When adding a new preference field: add it to AUTH_PREFERENCE_FIELDS, AuthUserRecord, next-auth.d.ts (Session["user"] and JWT), AND here."
- **Failure scenario:** Developer adds `preferredEditorLayout` to `AUTH_PREFERENCE_FIELDS` and `mapUserToAuthFields`. They update `syncTokenWithUser` (which now auto-includes via `Object.assign`). They forget to add the manual line in `mapTokenToSession`. The JWT contains the field but the session object does not — the user's editor layout preference never takes effect until next login.
- **Suggested fix:** Iterate over `AUTH_PREFERENCE_FIELDS` in `mapTokenToSession` and assign each field programmatically, or use a similar `Object.assign` pattern for preference fields. Core fields (id, role, username, name, className, mustChangePassword) should remain explicit since they have non-standard defaults.

## CR14-CR2: `evictStaleEntries` in rate-limit.ts uses `Date.now()` for DB comparison while other rate-limit code uses DB time

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/security/rate-limit.ts:39`
- **Evidence:** `evictStaleEntries()` computes `const cutoff = Date.now() - RATE_LIMIT_EVICTION_AGE_MS` and then compares against `rateLimits.lastAttempt` in the database. The `lastAttempt` values are written by both `atomicConsumeRateLimit` (which now uses `getDbNowMs()` — DB time) and `checkServerActionRateLimit` (which uses `getDbNowUncached()` — also DB time). But eviction uses `Date.now()` (app-server time). If the DB and app server clocks differ by more than a few seconds, entries could be evicted too early or too late. The same pattern exists in `getEntry()` at line 77 which also uses `Date.now()` for comparisons against DB-stored values.
- **Failure scenario:** DB server is 30 seconds behind the app server. An entry with `lastAttempt` set to DB-now (30s behind) is compared against `Date.now()` for eviction. The entry appears 30 seconds older than it actually is, causing premature eviction. Rate limit state is lost, allowing a user under a block to be unblocked early.
- **Suggested fix:** Use `await getDbNowMs()` in `evictStaleEntries()` and `getEntry()`. The eviction timer runs every 60 seconds so the extra DB query is negligible. For `getEntry()`, the caller already runs inside a transaction so the DB query overhead is minimal.

## CR14-CR3: `in-memory-rate-limit.ts` FIFO eviction sorts the entire map on every overflow

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/lib/security/in-memory-rate-limit.ts:41-47`
- **Evidence:** When `store.size > MAX_ENTRIES` (10,000), the second-pass eviction sorts all entries: `const sorted = [...store.entries()].sort(...)`. This creates a copy of the entire map as an array, then sorts it — O(n log n) on every insertion that pushes past the limit. Under a burst of 10,000+ unique IPs, this could cause a noticeable CPU spike.
- **Suggested fix:** Use a LinkedHashMap or track insertion order. Or increase the eviction frequency so the map rarely exceeds the limit. The current design already evicts stale entries in the first pass, so the sort only fires when all 10,000 entries are recent — an unlikely scenario.

## CR14-CR4: `ContestsLayout` uses `javascript:` and `data:` scheme checks but does not handle blob: URLs

- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/app/(dashboard)/dashboard/contests/layout.tsx:33`
- **Evidence:** The click handler checks `href.startsWith("javascript:")` and `href.startsWith("data:")` to prevent XSS, but doesn't check for `blob:` or `vbscript:` schemes. While these are extremely unlikely in this codebase (all links are Next.js route-based), it's a defense-in-depth gap.
- **Suggested fix:** Add a positive allowlist check instead of a blocklist. For example, only allow hrefs starting with `/` (relative) or `https?://`.

## CR14-CR5: `recruiting-invitations-panel.tsx` uses `window.location.origin` for invitation URLs

- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/contest/recruiting-invitations-panel.tsx:99`
- **Evidence:** `const baseUrl = typeof window !== "undefined" ? window.location.origin : ""` is used to construct invitation URLs. This is the same `window.location.origin` pattern tracked as DEFER-24 and DEFER-49 from prior cycles. If the app is accessed via a different hostname than the canonical one (e.g., via IP address instead of domain), the invitation link will contain the wrong host.
- **Suggested fix:** Use a server-provided `appUrl` setting, consistent with the fix needed for DEFER-24.

## Verified Prior Fixes

- `syncTokenWithUser` now uses `Object.assign(token, fields)` (verified in `src/lib/auth/config.ts:122`)
- `atomicConsumeRateLimit` now uses `getDbNowMs()` (verified in `src/lib/security/api-rate-limit.ts:59`)
- `validateZipDecompressedSize` now has per-entry size cap (verified in `src/lib/files/validation.ts:44,72-73`)
- `getPublicNavItems` and `getPublicNavActions` are centralized in `src/lib/navigation/public-nav.ts` (verified)

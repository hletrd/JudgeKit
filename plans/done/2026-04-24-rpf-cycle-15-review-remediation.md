# RPF Cycle 15 — Review Remediation Plan

**Date:** 2026-04-24
**Source:** `.context/reviews/_aggregate.md`
**Status:** In Progress (H1-H3, L1 done)

## Scope

This cycle addresses findings from the RPF cycle 15 multi-agent review:
- AGG-1: Plaintext `recruitingInvitations.token` column (data-at-rest security)
- AGG-2: Audit buffer data loss on process crash
- AGG-3: In-memory rate limiter FIFO eviction is O(n log n) (also DEFER-54)
- AGG-4: Dual rate limiting systems without unified interface
- AGG-5: Proxy mixing auth, CSP, locale, and caching logic

Plus lower-severity items (AGG-6 through AGG-14) that will be addressed as time permits or deferred.

No cycle-15 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Drop plaintext `recruitingInvitations.token` column (AGG-1)

- **Source:** AGG-1 (CR-3, S-1)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/db/schema.pg.ts:940-941, 961`
- **Cross-agent signal:** 2 of 4 review perspectives
- **Problem:** The `recruitingInvitations` table retains both `token` (plaintext, nullable) and `tokenHash` (varchar(64)) columns. A unique index `ri_token_idx` on the plaintext `token` column is still active. If a database backup or read-only compromise occurs, all active recruiting tokens are exposed in cleartext.
- **Plan:**
  1. Verify no code path reads `recruitingInvitations.token` from the DB (grep for all references)
  2. Remove `token` column definition from `src/lib/db/schema.pg.ts`
  3. Remove `ri_token_idx` unique index definition from the schema
  4. Create a Drizzle migration for the column/index drop
  5. Update any code that references `token` field on the table type
  6. Verify all gates pass
- **Status:** DONE — Commit `7cd2c983`

### H2: Fix audit event JSON truncation to produce valid output (AGG-10)

- **Source:** AGG-10 (CR-4, P-5)
- **Severity / confidence:** LOW / HIGH
- **Citations:** `src/lib/audit/events.ts:49-59`
- **Cross-agent signal:** 2 of 4 review perspectives
- **Problem:** `serializeDetails` truncates the JSON string at 4000 characters via `JSON.stringify(details).slice(0, MAX_JSON_LENGTH)`, which can produce invalid JSON. Downstream consumers that try to parse this will get a SyntaxError.
- **Plan:**
  1. Replace the string-slice truncation with object-level truncation
  2. Implement a recursive `truncateObject` that trims string values to fit within the budget
  3. If the truncated object still exceeds the budget after string trimming, fall back to `{"_truncated":true}`
  4. Add a unit test verifying that `serializeDetails` always produces valid JSON
  5. Verify all gates pass
- **Status:** DONE — Commit `35613021`

### H3: Fix in-memory rate limiter eviction to O(1) FIFO (AGG-3 / DEFER-54)

- **Source:** AGG-3 (P-1), carries DEFER-54
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/lib/security/in-memory-rate-limit.ts:41-47`
- **Cross-agent signal:** 1 of 4 review perspectives
- **Problem:** When `store.size > MAX_ENTRIES`, the eviction code sorts all entries to find the oldest. This is O(n log n) and allocates on every call that exceeds capacity.
- **Plan:**
  1. Replace the sorted eviction with simple FIFO eviction from Map's insertion order
  2. Since `Map` preserves insertion order, evicting the first N entries via `keys().next()` is O(1)
  3. Remove the `sorted` allocation entirely
  4. Add a unit test verifying that eviction works correctly under capacity pressure
  5. Verify all gates pass
- **Status:** DONE — Commit `88c721a8`

### L1: Add build-phase guard to auth config (AGG-11)

- **Source:** AGG-11 (CR-5)
- **Severity / confidence:** LOW / HIGH
- **Citations:** `src/lib/auth/config.ts:171-175`
- **Problem:** `validateAuthUrl()` and `getValidatedAuthSecret()` are called at module scope with no build-phase guard. If misconfigured, the import throws and prevents the application from starting, including during build.
- **Plan:**
  1. Add a `isBuildPhase` check (similar to `db/index.ts`) before calling the validation functions
  2. If in build phase, use placeholder values instead of throwing
  3. Verify all gates pass
- **Status:** DONE — Commit `6e32ee89`

---

## Deferred items

### Carried from prior cycle plans

All DEFER-1 through DEFER-56 from prior cycle plans carry forward unchanged. DEFER-57 through DEFER-60 were resolved in cycle 14.

### DEFER-61: Audit buffer data loss on process crash (AGG-2)

- **Source:** AGG-2 (CR-1)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/audit/events.ts:105-128`
- **Reason for deferral:** The existing graceful shutdown handler (registered in `src/lib/audit/node-shutdown.ts`) already covers normal SIGTERM/SIGINT/beforeExit scenarios. Adding write-ahead logging is a significant architectural change that could affect audit write performance. The buffer size and flush interval are already tuned (5s/50 events) to minimize data loss window.
- **Exit criterion:** When a dedicated audit-hardening pass is scheduled, or when an audit gap incident is reported from a hard crash.

### DEFER-62: Unified rate limiter interface (AGG-4)

- **Source:** AGG-4 (A-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/lib/security/in-memory-rate-limit.ts`, `src/lib/security/rate-limit.ts`
- **Reason for deferral:** Creating a unified interface is a refactor that touches every rate-limited route handler. The existing dual system works correctly (different use cases justify different backends). Unification is an architectural improvement, not a bug fix.
- **Exit criterion:** When a rate-limiting architecture review is scheduled, or when a third backend (e.g., Redis) needs to be added.

### DEFER-63: Split proxy into composable middleware functions (AGG-5)

- **Source:** AGG-5 (A-2)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/proxy.ts`
- **Reason for deferral:** The proxy function works correctly and is well-tested. Splitting it is a refactor that could introduce regressions in the critical auth path. The function is documented and its concerns are clearly delineated with comments.
- **Exit criterion:** When a middleware refactor pass is scheduled, or when a new concern needs to be added to the proxy.

### DEFER-64: Remove RUNNER_AUTH_TOKEN fallback to JUDGE_AUTH_TOKEN (AGG-6)

- **Source:** AGG-6 (S-2)
- **Severity / confidence:** LOW / HIGH
- **Citations:** `src/lib/docker/client.ts:8`
- **Reason for deferral:** The fallback is partially mitigated by execute.ts:58-63 which already requires RUNNER_AUTH_TOKEN in production when COMPILER_RUNNER_URL is set. Removing the fallback in client.ts requires auditing all deployment configurations to ensure RUNNER_AUTH_TOKEN is always set. Low risk since the token is only used for internal service communication.
- **Exit criterion:** When a credential-hygiene pass is scheduled, or when deploying a new judge worker that uses the client.ts module.

### DEFER-65: Replace hardcoded dev encryption key (AGG-7)

- **Source:** AGG-7 (S-3)
- **Severity / confidence:** LOW / HIGH
- **Citations:** `src/lib/security/encryption.ts:14-17`
- **Reason for deferral:** The hardcoded key is only used when `NODE_ENV !== "production"` AND `NODE_ENCRYPTION_KEY` is unset. In development, the data encrypted with this key is test/dev data. Production deployments must set `NODE_ENCRYPTION_KEY` (enforced by the `getKey()` function). Changing this requires a migration strategy for existing dev data encrypted with the old key.
- **Exit criterion:** When a dev-environment security hardening pass is scheduled, or when a developer reports accidental use of the dev key in a staging environment.

### DEFER-66: Drop judgeWorkers.secretToken column (AGG-8)

- **Source:** AGG-8 (S-4)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/db/schema.pg.ts:419`
- **Reason for deferral:** Similar to AGG-1 but for the `judgeWorkers` table. The auth logic already rejects workers that have no `secretTokenHash`. Dropping the column requires verifying all production workers have been migrated. Lower priority than AGG-1 because judge workers are internal services, not user-facing tokens.
- **Exit criterion:** When all production judge workers have `secretTokenHash` set, or when a DB schema cleanup pass is scheduled.

### DEFER-67: Document or remove SEC-FETCH-SITE "none" CSRF exception (AGG-9)

- **Source:** AGG-9 (S-5)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/security/csrf.ts:49-51`
- **Reason for deferral:** The CSRF check already requires `X-Requested-With: XMLHttpRequest` which prevents cross-origin form submissions. The `sec-fetch-site: none` exception is a secondary check that is safe given the primary X-Requested-With requirement. Removing it could break legitimate use cases (browser extensions, certain API clients).
- **Exit criterion:** When a CSRF hardening review is scheduled, or when a CSRF bypass is reported.

### DEFER-68: Consolidate encryption key management (AGG-13)

- **Source:** AGG-13 (A-3)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/security/encryption.ts`, `src/lib/security/derive-key.ts`
- **Reason for deferral:** The two key mechanisms serve different purposes (general encryption vs. plugin config encryption) and read from different env vars intentionally. Consolidation is a code organization improvement, not a security fix. Changing the env var names would break existing deployments.
- **Exit criterion:** When a key management architecture review is scheduled.

### DEFER-69: Add TTL-based eviction to auth user cache (AGG-14)

- **Source:** AGG-14 (P-2)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/proxy.ts:23-71`
- **Reason for deferral:** The cache already has a 2-second TTL per entry and FIFO eviction at 500 entries. Expired entries are cleaned up on read. Adding a periodic sweep is an optimization that adds complexity for minimal practical benefit given the small cache size and short TTL.
- **Exit criterion:** When a proxy performance optimization pass is scheduled, or when cache bloat is observed in production.

### DEFER-70: Combine in-memory rate limiter check+record into single function (AGG-12)

- **Source:** AGG-12 (CR-2)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/security/in-memory-rate-limit.ts:51-92`
- **Reason for deferral:** No actual race condition exists in the current single-threaded Node.js runtime. The API design concern is valid but theoretical. Combining the functions would require changing all call sites.
- **Exit criterion:** When a rate-limiting API refactor is scheduled, or when async operations are introduced between check and record.

---

## Progress log

- 2026-04-24: Plan created from RPF cycle 15 aggregate review. 4 new tasks (H1, H2, H3, L1). 10 new deferred items (DEFER-61 through DEFER-70). All findings from the aggregate review are either scheduled for implementation or explicitly deferred.
- 2026-04-24: H1 DONE (7cd2c983 — drop plaintext recruitingInvitations.token column + Drizzle migration), H2 DONE (35613021 — recursive truncateObject for audit details + 7 unit tests), H3 DONE (88c721a8 — O(1) FIFO eviction in in-memory rate limiter, resolves DEFER-54), L1 DONE (6e32ee89 — build-phase guard in auth config). All gates pass: eslint (0 errors), tsc (0 errors), vitest (298/298 files, 2130/2130 tests), next build (success).

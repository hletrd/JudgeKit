# Debugger — Cycle 12 Deep Review

**Date:** 2026-04-24
**Reviewer:** debugger
**Scope:** Latent bug surface, failure modes, regressions, edge cases

## Findings

### DB12-1: `enc:v1:malformed` values stored via `preparePluginConfigForStorage` cause silent secret loss on read

**File:** `src/lib/plugins/secrets.ts:132-136`
**Severity:** LOW / Confidence: HIGH

After the CR11-1 fix, if an admin submits a value like `enc:v1:garbage`, `isEncryptedPluginSecret` returns true (prefix match only), and the value is stored without encryption. On read, `decryptPluginSecret` splits the value and finds `!ivRaw || !tagRaw || !ciphertextRaw` is false for some positions (they'll be empty strings from the split, not undefined), so it tries to decrypt with both keys, both fail, and it throws. The error is caught in `decryptPluginConfigForUse` and the key falls back to `""`. The plugin silently loses its API key.

**Reproduction:** As admin, update a plugin config with a secret value of `enc:v1:test`. Save. Read back — the secret key is empty. The plugin can no longer authenticate to its external service.

**Fix:** Validate the full `enc:v1:base64url:base64url:base64url` structure in `isEncryptedPluginSecret` or add a dedicated `isValidEncryptedPluginSecret()`.

### DB12-2: `checkServerActionRateLimit` uses DB time while `consumeApiRateLimit` uses app time — inconsistent window calculation

**Files:** `src/lib/security/api-rate-limit.ts:55-56` vs `src/lib/security/api-rate-limit.ts:219-223`
**Severity:** LOW / Confidence: MEDIUM

`atomicConsumeRateLimit` (used by `consumeApiRateLimit`) uses `Date.now()` (app server time) for rate-limit window comparisons, while `checkServerActionRateLimit` uses `getDbNowUncached()` (DB server time). If there is clock skew between app and DB servers, the two rate-limit paths will compute different windows for the same conceptual time period. This could cause a request to be rate-limited by one path but not the other.

**Failure scenario:** App server clock is 5 seconds ahead of DB. A request hits `consumeApiRateLimit` and the window is computed as starting 5 seconds earlier than `checkServerActionRateLimit` would compute. The windows diverge by up to the clock skew.

**Fix:** Standardize on one time source for all rate-limiting. Given that the DB is the source of truth for `windowStartedAt`, use DB time consistently. Alternatively, use app time consistently and accept the skew risk.

### DB12-3: SSE `onPollResult` callback can fire after connection close due to async IIFE

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:397-438`
**Severity:** LOW / Confidence: LOW

The `onPollResult` callback, when the re-auth interval triggers, spawns an async IIFE (`void (async () => { ... })()`). If the connection closes between the IIFE being scheduled and the async block starting, the `if (closed) return` guard catches it. However, if the connection closes after the async block starts but before `sendTerminalResult()` completes, the `if (closed) return` inside `sendTerminalResult` catches it. This is well-guarded, but the flow is complex and hard to reason about.

**Risk:** LOW — the `closed` flag is checked at multiple points. But the complexity of this async flow could lead to subtle bugs in future modifications.

**Fix:** Consider restructuring the re-auth path to use a more linear async flow (e.g., with async iterators) rather than nested IIFEs and closures.

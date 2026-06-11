# Code Reviewer — Cycle 12 Deep Review

**Date:** 2026-04-24
**Reviewer:** code-reviewer
**Scope:** Full repository — src/lib, src/app, src/components, tests

## Findings

### CR12-1: `in-memory-rate-limit.ts` FIFO eviction sorts entire Map on every overflow

**File:** `src/lib/security/in-memory-rate-limit.ts:41-46`
**Severity:** MEDIUM / Confidence: HIGH

When `store.size > MAX_ENTRIES` after the first pass, the code creates a sorted copy of all entries: `const sorted = [...store.entries()].sort(...)`. With `MAX_ENTRIES = 10000`, this is an O(n log n) operation triggered during an already hot path. Under sustained load this causes GC pressure and latency spikes.

**Failure scenario:** A burst of 10k+ distinct IPs hitting rate-limited endpoints causes the eviction sort to fire repeatedly, degrading response times.

**Fix:** Use an ordered data structure (e.g., a min-heap by `lastAttempt`) or track insertion order to evict the oldest entry in O(1) instead of sorting.

### CR12-2: `rate-limit.ts` `getEntry()` uses `.for("update")` for read-only `isRateLimited` check

**File:** `src/lib/security/rate-limit.ts:83`
**Severity:** LOW / Confidence: HIGH

`getEntry()` always acquires a `FOR UPDATE` row lock, even when called from the read-only `isRateLimited()` and `isAnyKeyRateLimited()` functions. These read-only checks do not modify the row, so the exclusive lock is unnecessarily blocking concurrent writes to the same key.

**Failure scenario:** Under high concurrency, read-only rate-limit status checks contend with legitimate write transactions on the same key, increasing DB wait time.

**Fix:** Add an optional `forUpdate` parameter to `getEntry()`, defaulting to `true` for backward compatibility. Have `isRateLimited`/`isAnyKeyRateLimited` pass `forUpdate: false` to use a regular `SELECT` without the row lock.

### CR12-3: `encrypt()` in `encryption.ts` produces non-constant-time comparison vulnerability on decrypt failure path

**File:** `src/lib/security/encryption.ts:79-110`
**Severity:** LOW / Confidence: MEDIUM

The `decrypt()` function in `encryption.ts` falls back to returning plaintext if the value doesn't start with `enc:`, with only a production warning log. While this is intentional for backward compatibility, an attacker who can inject a non-encrypted value into the database (via a compromised admin or SQL injection) can bypass encryption at read time. The `decryptPluginSecret()` in `secrets.ts` uses a safer approach (try both keys, throw on failure). The general `decrypt()` should follow suit.

**Failure scenario:** If an attacker manages to write a plaintext value to a column that should contain encrypted data, `decrypt()` will return it without any error, silently bypassing the encryption layer.

**Fix:** In production, consider throwing or at least returning a sentinel value instead of the raw plaintext when `decrypt()` encounters a non-`enc:` prefixed value in a column that is expected to be encrypted. Alternatively, add a strict mode parameter.

### CR12-4: `preparePluginConfigForStorage` `enc:v1:` bypass is fixed but `isEncryptedPluginSecret` allows attacker-controlled prefix passthrough

**File:** `src/lib/plugins/secrets.ts:132-136`
**Severity:** LOW / Confidence: MEDIUM (residual risk from CR11-1 fix)

The CR11-1 fix correctly checks `isEncryptedPluginSecret(incomingValue)` before encrypting. However, `isEncryptedPluginSecret` only checks for the `enc:v1:` prefix — it does not validate the structure (iv, tag, ciphertext). A value like `enc:v1:garbage` would pass `isEncryptedPluginSecret` and be stored as-is. When `decryptPluginSecret` later processes it, it will fail the format check (`!ivRaw || !tagRaw || !ciphertextRaw`) and throw. This is caught by the try/catch in `decryptPluginConfigForUse` and the key falls back to empty string.

**Failure scenario:** An admin or compromised admin account submits `enc:v1:malformed` as a secret config value. It passes through `preparePluginConfigForStorage` and is stored. On read, decryption fails and the plugin gets an empty secret — effectively a denial-of-service on that plugin's API key.

**Fix:** In `preparePluginConfigForStorage`, after checking `isEncryptedPluginSecret`, also validate the structure by splitting and checking that all three components (iv, tag, ciphertext) are present and valid base64url. Reject malformed `enc:v1:` values.

## Verified Prior Fixes

All prior fixes from cycles 7-11 remain present and verified:
- F1: `json_extract()` in PostgreSQL path — no matches
- F2: `DELETE ... LIMIT` — uses `ctid IN (SELECT ctid ... LIMIT)`
- CR9-CR1: `mapUserToAuthFields()` centralization — present
- CR9-SR1: SSE re-auth race — re-auth awaits before processing
- CR9-SR3: Tags route rate limiting — uses `createApiHandler`
- CR11-1: `enc:v1:` prefix bypass — checks before encrypting

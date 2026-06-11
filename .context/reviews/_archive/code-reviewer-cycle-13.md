# Code Reviewer — Cycle 13

**Date:** 2026-04-24
**HEAD:** main branch (cycle 13)

## Findings

### CR13-1: `atomicConsumeRateLimit` uses `Date.now()` while `checkServerActionRateLimit` uses DB server time — inconsistent clock source for the same `rateLimits` table

**File:** `src/lib/security/api-rate-limit.ts:56` vs `src/lib/security/api-rate-limit.ts:223`

**Severity:** MEDIUM / HIGH

The `atomicConsumeRateLimit()` function (line 56) uses `Date.now()` for rate-limit window comparisons, while `checkServerActionRateLimit()` (line 223) uses `(await getDbNowUncached()).getTime()`. Both read and write to the same `rateLimits` table. If the app server and DB server clocks diverge, a rate-limit window computed with `Date.now()` could be inconsistent with entries written by `checkServerActionRateLimit` using DB time. This means a window reset that should have happened might not, or vice versa, causing either under-limiting or over-limiting.

**Failure scenario:** App server clock is 5 seconds ahead of DB. `atomicConsumeRateLimit` writes `windowStartedAt` using `Date.now()`, then `checkServerActionRateLimit` reads that entry and compares against DB time. The window appears 5 seconds older than it is, potentially allowing more requests than configured.

**Fix:** Replace `Date.now()` with `(await getDbNowUncached()).getTime()` in `atomicConsumeRateLimit` (or pass `nowMs` from the caller which already fetches DB time).

---

### CR13-2: `validateZipDecompressedSize` decompresses every entry fully even when only checking size — denial-of-service via ZIP bomb with many small entries

**File:** `src/lib/files/validation.ts:44-69`

**Severity:** MEDIUM / MEDIUM

The `validateZipDecompressedSize` function decompresses each ZIP entry into a `Uint8Array` in memory just to count its size. For a ZIP containing 10,000 entries (just under the 10,000 entry limit), each decompressed to ~1 MB, this would allocate ~10 GB of memory sequentially, crashing the server with an OOM. JSZip does not expose `uncompressedSize` without decompressing, but the `entry._data.uncompressedSize` internal property or switching to a streaming library like `yauzl` would avoid full decompression.

**Failure scenario:** An attacker uploads a ZIP with 9,999 entries, each compressed to a few bytes but expanding to 1 MB. The server decompresses all 9,999 entries in sequence, allocating ~10 GB before the cumulative size check triggers.

**Fix:** Either (a) add a per-entry decompressed size cap (e.g. 50 MB per entry) and bail out immediately, or (b) use a streaming ZIP parser that exposes uncompressed sizes from the local file headers without decompressing.

---

### CR13-3: `deriveEncryptionKey` reads `process.env.PLUGIN_CONFIG_ENCRYPTION_KEY` on every call — no caching, redundant string parsing

**File:** `src/lib/security/derive-key.ts:10-16` and `src/lib/security/derive-key.ts:24-30`

**Severity:** LOW / MEDIUM

Both `deriveEncryptionKey()` and `legacyEncryptionKey()` read `process.env.PLUGIN_CONFIG_ENCRYPTION_KEY` on every invocation, and then pass it to `hkdfSync` or `createHash`. Since environment variables don't change at runtime, the result should be cached. This is especially impactful during `decryptPluginSecret` which tries both keys sequentially, resulting in 2 HKDF/SHA-256 derivations per secret decryption. With many plugin secrets, this is unnecessary CPU overhead.

**Fix:** Cache the derived keys at module level after first computation (similar to how `encryption.ts` caches `_cachedKey`).

---

### CR13-4: `getRetentionCutoff` uses `Date.now()` by default — inconsistent with DB-stored timestamps used for pruning comparisons

**File:** `src/lib/data-retention.ts:38-40`

**Severity:** LOW / HIGH

`getRetentionCutoff(days)` defaults to `Date.now()` when computing the cutoff date used for data pruning. However, the pruning queries in `data-retention-maintenance.ts` compare this cutoff against DB-stored timestamps (e.g., `chatMessages.createdAt`, `submissions.submittedAt`). If the app server and DB server clocks diverge, rows that should be pruned may survive (or rows that should be kept may be deleted prematurely). The rest of the codebase (rate limits, contest scoring, JWT timestamps) consistently uses `getDbNowUncached()` for comparisons against DB-stored data, but this module does not.

**Failure scenario:** App server clock is 1 hour ahead. `getRetentionCutoff` computes a cutoff 1 hour into the future, causing 1 hour of data to be deleted early. If the clock is behind, 1 hour of data that should be pruned will survive.

**Fix:** Change `getRetentionCutoff` to accept a `Date` parameter and have the callers pass `(await getDbNowUncached())` instead of defaulting to `Date.now()`. The `now` parameter already supports this but all callers use the default.

---

### CR13-5: `computeLeaderboard` uses `Date.now()` for freeze-time comparison — potential premature/unfreeze with clock skew

**File:** `src/lib/assignments/leaderboard.ts:52-53`

**Severity:** LOW / MEDIUM

`computeLeaderboard` compares `Date.now()` against `freezeAt` (a DB-stored timestamp) to determine whether the leaderboard should be frozen. If the app server clock is ahead of the DB server, the leaderboard could freeze prematurely. If behind, it could remain unfrozen after the configured freeze time. This affects contest fairness.

**Fix:** Use `(await getDbNowUncached()).getTime()` instead of `Date.now()` for the freeze-time comparison, consistent with other time-sensitive contest operations.

---

### CR13-6: SSE connection tracking cleanup iterates entire `connectionInfoMap` with `for...of` and calls `removeConnection` mid-iteration — potential concurrent modification

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:102-110`

**Severity:** LOW / MEDIUM

The cleanup timer at line 102-110 iterates `connectionInfoMap` using `for...of` and calls `removeConnection()` which mutates the map by deleting entries. In JavaScript, modifying a `Map` during `for...of` iteration is defined behavior (the spec says deleted entries won't be visited if not yet reached, and new entries may or may not be visited), so this is technically safe. However, the pattern is fragile and could lead to subtle bugs if the iteration or removal logic changes. A safer approach is to collect keys to remove first, then delete them in a second pass.

**Fix:** Collect stale connection IDs into an array during iteration, then remove them in a separate loop after iteration completes.

## Verified Prior Fixes

All prior fixes (F1, F2, CR9-CR1, CR9-SR1, CR9-SR3, CR11-1, CR12-1, CR12-2) remain intact and verified:
- `isEncryptedPluginSecret` prefix check is present
- `isValidEncryptedPluginSecret` structural validation is present
- `preparePluginConfigForStorage` uses `isValidEncryptedPluginSecret` (not the prefix-only check)
- `decrypt()` in `encryption.ts` has `allowPlaintextFallback` option with production-safe defaults
- `mapUserToAuthFields()` centralizes auth field mapping
- SSE re-auth awaits before processing
- Tags route has rate limiting

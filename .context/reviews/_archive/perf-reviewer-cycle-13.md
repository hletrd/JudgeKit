# Performance Reviewer — Cycle 13

**Date:** 2026-04-24
**HEAD:** main branch (cycle 13)

## Findings

### CR13-3: `deriveEncryptionKey` and `legacyEncryptionKey` perform redundant HKDF/SHA-256 on every call

**File:** `src/lib/security/derive-key.ts:9-16, 23-30`

**Severity:** LOW / MEDIUM

Both functions read `process.env.PLUGIN_CONFIG_ENCRYPTION_KEY` and derive a key on every invocation. `decryptPluginSecret` calls both sequentially (trying HKDF-derived key first, then legacy key), meaning every plugin secret decryption performs 2 key derivations. The `encryption.ts` module already caches its key in `_cachedKey`; this module should do the same.

**Impact:** Negligible for single calls, but with many plugin secrets being decrypted on startup or batch operations, this adds unnecessary CPU overhead. HKDF with SHA-256 is not trivially cheap.

**Fix:** Cache both derived keys at module level after first computation. Environment variables don't change at runtime.

---

### CR13-2: `validateZipDecompressedSize` fully decompresses every ZIP entry just to count bytes

**File:** `src/lib/files/validation.ts:44-69`

**Severity:** MEDIUM / MEDIUM

The function decompresses each ZIP entry into a `Uint8Array` using `entry.async("uint8array")` just to measure its size. For a ZIP with many entries close to the decompressed size limit, this creates large temporary allocations. A per-entry size cap (e.g., 50 MB) would allow early bailout without full decompression.

**Fix:** Add a per-entry decompressed size cap and abort early if any single entry exceeds it, before summing across all entries.

---

### CR13-7: SSE cleanup timer iterates entire `connectionInfoMap` to find stale connections — O(n) per tick

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:102-110`

**Severity:** LOW / LOW

The cleanup timer runs every 60 seconds and iterates the entire `connectionInfoMap` to find stale connections. With MAX_TRACKED_CONNECTIONS=1000, this is at most 1000 iterations per minute, which is trivially cheap. Not a real performance concern.

**No action needed.**

## Verified Prior Fixes

All prior performance-related deferred items remain accurately characterized.

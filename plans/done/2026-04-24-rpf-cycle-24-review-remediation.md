# RPF Cycle 24 Review Remediation Plan

**Date:** 2026-04-24
**Source:** `.context/reviews/_aggregate-cycle-24.md`
**Status:** Complete

## Scope

This cycle addresses new findings from the cycle-24 multi-perspective review:
- AGG-1: Missing `Referrer-Policy` and `X-Content-Type-Options` security headers
- AGG-2: `getRetentionCutoff` uses app-server time while data uses DB-server time
- AGG-3: ZIP bomb validation decompresses all entries instead of reading metadata
- AGG-4: Argon2 `needsRehash` not implemented for parameter changes
- AGG-5: `rateLimits` table overloaded for realtime coordination — schema coupling risk

No cycle-24 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Add missing security headers to proxy (AGG-1)

- **Source:** AGG-1 (S-1, S-2, CR-1, C-1)
- **Severity / confidence:** MEDIUM / HIGH
- **Cross-agent signal:** 4 of 7 review perspectives
- **Citations:** `src/proxy.ts:144-229`
- **Problem:** The proxy sets CSP and HSTS but omits `Referrer-Policy` and `X-Content-Type-Options`. Without `Referrer-Policy`, contest access tokens in URLs leak in Referer headers to cross-origin destinations. Without `nosniff`, browsers may MIME-sniff API responses.
- **Plan:**
  1. Add `response.headers.set("X-Content-Type-Options", "nosniff");` in `createSecuredNextResponse` after the CSP header.
  2. Add `response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");` in `createSecuredNextResponse` after the CSP header.
  3. Add source-grep tests verifying both headers are set.
  4. Verify all gates pass.
- **Status:** DONE

### H2: Fix `getRetentionCutoff` to use DB server time (AGG-2)

- **Source:** AGG-2 (CR-4, P-2, V-1, C-2)
- **Severity / confidence:** MEDIUM / HIGH
- **Cross-agent signal:** 4 of 7 review perspectives
- **Citations:** `src/lib/data-retention.ts:38-40`, `src/lib/data-retention-maintenance.ts`, `src/lib/db/cleanup.ts`
- **Problem:** `getRetentionCutoff` uses `Date.now()` (app-server time) while the data it compares against uses DB-server time. The function already accepts an optional `nowMs` parameter, but no caller passes DB time.
- **Plan:**
  1. Update `data-retention-maintenance.ts` to pass `await getDbNowMs()` as the `nowMs` parameter to `getRetentionCutoff`.
  2. Update `db/cleanup.ts` to pass `await getDbNowMs()` as the `nowMs` parameter to `getRetentionCutoff`.
  3. Add a unit test for `getRetentionCutoff` verifying the `nowMs` parameter override works correctly.
  4. Verify all gates pass.
- **Status:** DONE

### M1: Improve ZIP bomb validation to use metadata instead of decompression (AGG-3)

- **Source:** AGG-3 (CR-2, P-1, C-3, TE-1)
- **Severity / confidence:** MEDIUM / HIGH
- **Cross-agent signal:** 4 of 7 review perspectives
- **Citations:** `src/lib/files/validation.ts:55-85`
- **Problem:** `validateZipDecompressedSize` decompresses every ZIP entry to measure size instead of reading the `uncompressedSize` metadata from the ZIP headers. This is wasteful and causes GC pressure. Additionally, there are no unit tests for the function.
- **Plan:**
  1. Check if JSZip exposes `uncompressedSize` via entry metadata without requiring decompression. If available, use it for the size check.
  2. Fall back to full decompression only when metadata is unavailable (data descriptors without sizes).
  3. Add unit tests for `validateZipDecompressedSize` covering: valid ZIP, oversized ZIP, per-entry cap, entry count cap, corrupt ZIP, empty ZIP.
  4. Verify all gates pass.
- **Status:** DONE

### L1: Implement Argon2 `needsRehash` for parameter changes (AGG-4)

- **Source:** AGG-4 (S-3, V-2, C-4)
- **Severity / confidence:** LOW / MEDIUM
- **Cross-agent signal:** 3 of 7 review perspectives
- **Citations:** `src/lib/security/password-hash.ts:30-41`
- **Problem:** `verifyPassword` returns `needsRehash: false` for Argon2 hashes even when hash parameters differ from current policy. The `argon2.needsRehash()` function is not called.
- **Plan:**
  1. After successful Argon2 verification, call `argon2.needsRehash(storedHash, ARGON2_OPTIONS)` and return the result as `needsRehash`.
  2. Update the `verifyAndRehashPassword` function to handle rehashing triggered by Argon2 parameter changes (not just bcrypt migration).
  3. Add a unit test verifying that `verifyPassword` returns `needsRehash: true` when the stored hash has different parameters.
  4. Verify all gates pass.
- **Status:** DONE

---

## Deferred items

### DEFER-1 through DEFER-13: Carried from cycle 23 plan

All prior deferred items (DEFER-1 through DEFER-13 from cycle 23 plan) remain unchanged. See the cycle 23 plan for full details.

### DEFER-14: `rateLimits` table overloaded for realtime coordination — schema coupling (AGG-5)

- **Source:** AGG-5 (A-1)
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/lib/realtime/realtime-coordination.ts:75-136`, `src/lib/db/schema.pg.ts` (rateLimits table)
- **Reason for deferral:** Refactor-only work that requires a schema migration and touches multiple files. The current overloaded design works correctly. The global advisory lock on SSE acquisition serializes connection setups, but this is only a bottleneck under very high concurrent SSE connections (200+ simultaneous). The fix requires creating new tables and migrating existing data, which is a significant change with migration risk.
- **Exit criterion:** When SSE connection setup latency under load is measured and found to exceed acceptable thresholds, or when a dedicated schema-decoupling cycle is scheduled.

---

## Progress log

- 2026-04-24: Plan created from cycle-24 aggregate review. 5 findings, 4 fix tasks, 1 deferred.
- 2026-04-24: H1 DONE -- Added Referrer-Policy and X-Content-Type-Options headers to proxy middleware.
- 2026-04-24: H2 DONE -- Fixed getRetentionCutoff to use DB server time in data-retention-maintenance.ts and db/cleanup.ts.
- 2026-04-24: M1 DONE -- ZIP validation now uses entry._data.uncompressedSize metadata (fast path) instead of decompressing all entries. Added unit tests.
- 2026-04-24: L1 DONE -- verifyPassword now calls argon2.needsRehash() for Argon2 hashes. verifyAndRehashPassword handles parameter-change rehashing.
- 2026-04-24: All gates green (tsc, eslint, vitest, next build).

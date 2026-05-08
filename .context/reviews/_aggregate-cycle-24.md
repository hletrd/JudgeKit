# Aggregate Review — Cycle 24

**Date:** 2026-04-24
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, architect, test-engineer, verifier, critic
**Total findings:** 13 (deduplicated to 5)

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] Missing `Referrer-Policy` and `X-Content-Type-Options` Security Headers

**Sources:** S-1, S-2, CR-1, C-1 | **Confidence:** HIGH
**Cross-agent signal:** 4 of 7 review perspectives

The proxy middleware at `src/proxy.ts:144-229` sets CSP, HSTS, and `frame-ancestors 'none'` but omits two OWASP-recommended security headers:

1. **`Referrer-Policy: strict-origin-when-cross-origin`** — Browsers default to `no-referrer-when-downgrade`, which sends the full URL (including query parameters) in the `Referer` header to same-origin and HTTPS-to-HTTPS navigations. Contest access codes appear in URLs (e.g., `?code=ACCESS_CODE`). Without `Referrer-Policy`, these tokens leak in Referer headers to cross-origin destinations.

2. **`X-Content-Type-Options: nosniff`** — Currently only set on the file download route (`src/app/api/v1/files/[id]/route.ts:115`). All other responses lack this header. While CSP provides defense-in-depth, `nosniff` prevents MIME-sniffing attacks on API responses.

**Concrete failure scenario:** A student navigates to a contest page with `?code=SECRET_CODE` in the URL. The page contains an external link. The full URL with the access code is sent in the `Referer` header to the external site.

**Fix:** Add both headers in `createSecuredNextResponse`:
```typescript
response.headers.set("X-Content-Type-Options", "nosniff");
response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
```

---

### AGG-2: [MEDIUM] `getRetentionCutoff` Uses App-Server Time While Data Uses DB-Server Time

**Sources:** CR-4, P-2, V-1, C-2 | **Confidence:** HIGH
**Cross-agent signal:** 4 of 7 review perspectives

`getRetentionCutoff` at `src/lib/data-retention.ts:38-40` uses `Date.now()` (app-server time) to compute the retention cutoff date, while the data it compares against (e.g., `submittedAt`, `createdAt`) is stored using DB-server time. All other time-sensitive operations in the codebase (contest boundaries, anti-cheat, SSE coordination, rate limiting) consistently use `getDbNowMs()` or `getDbNowUncached()`.

The function already accepts an optional `nowMs` parameter, but no caller passes DB time. The `data-retention-maintenance.ts` and `db/cleanup.ts` callers use the default.

**Concrete failure scenario:** App server clock is 5 minutes ahead of DB server clock. A submission with `submittedAt` 364d 23h 55m ago (DB time) is within the 365-day retention window, but `getRetentionCutoff` computes the cutoff using the advanced app clock, placing the submission just outside the window. The submission is deleted one full day early.

**Fix:** Update `data-retention-maintenance.ts` and `db/cleanup.ts` to pass `await getDbNowMs()` as the `nowMs` parameter to `getRetentionCutoff`.

---

### AGG-3: [MEDIUM] ZIP Bomb Validation Decompresses All Entries Instead of Reading Metadata

**Sources:** CR-2, P-1, C-3, TE-1 | **Confidence:** HIGH
**Cross-agent signal:** 4 of 7 review perspectives

`validateZipDecompressedSize` at `src/lib/files/validation.ts:55-85` decompresses every ZIP entry via `entry.async("uint8array")` to measure the decompressed size. For large ZIPs, this causes significant memory allocation and GC pressure. JSZip stores `uncompressedSize` in the local file header for most ZIPs — reading this metadata is O(1) vs O(decompressed size) for the current approach.

Additionally, there are no unit tests for the ZIP validation function (TE-1).

**Concrete failure scenario:** A user uploads a ZIP with 200 entries, one of which decompresses to 40 MB. The validation function decompresses all 201 entries (potentially hundreds of MB) just to check sizes, delaying the upload by seconds and causing GC pressure.

**Fix:**
1. Read `uncompressedSize` from ZIP metadata when available instead of decompressing.
2. Add unit tests for `validateZipDecompressedSize`.

---

### AGG-4: [LOW] Argon2 `needsRehash` Not Implemented for Parameter Changes

**Sources:** S-3, V-2, C-4 | **Confidence:** MEDIUM
**Cross-agent signal:** 3 of 7 review perspectives

`verifyPassword` at `src/lib/security/password-hash.ts:30-41` returns `needsRehash: false` for Argon2 hashes even when the hash parameters differ from the current `ARGON2_OPTIONS`. The `argon2.needsRehash()` function exists in the library but is not called. The bcrypt-to-argon2 migration path works correctly (returns `needsRehash: true`), but the argon2-parameter-change path does not.

**Concrete failure scenario:** Admin increases `ARGON2_OPTIONS.memoryCost` from 19456 to 65536. Existing users with old hashes continue using the weaker parameters indefinitely because `needsRehash` always returns `false` for Argon2 hashes.

**Fix:** After successful Argon2 verification, add:
```typescript
if (valid && !isBcryptHash(storedHash)) {
  return { valid, needsRehash: argon2.needsRehash(storedHash, ARGON2_OPTIONS) };
}
```

---

### AGG-5: [LOW] `rateLimits` Table Overloaded for Realtime Coordination — Schema Coupling Risk

**Sources:** A-1 | **Confidence:** MEDIUM
**Cross-agent signal:** 1 of 7 review perspectives

The `rateLimits` table is used for three distinct purposes: rate limiting, SSE connection tracking, and anti-cheat heartbeat dedup. The `acquireSharedSseConnectionSlot` function acquires a global advisory lock (`"realtime:sse:acquire"`) that serializes all SSE connection setups globally. During high-traffic contests, this creates a bottleneck causing connection setup latency to grow linearly with concurrent connections.

**Fix:** Long-term: separate SSE connections and heartbeat dedup into dedicated tables. Short-term: defer until performance becomes an issue under production load.

---

## Carried Forward from Prior Cycles

All prior DEFER items (DEFER-1 through DEFER-13 from cycle 23 plan) remain unchanged.

## Positive Observations

- All clock-skew-sensitive paths (contest boundaries, anti-cheat, rate limiting, SSE coordination) consistently use `getDbNowMs()`
- `createApiHandler` correctly awaits `params` for Next.js 16 compatibility
- `escapeLikePattern` is used correctly with `ESCAPE '\\'` clauses throughout
- `resolveStoredPath` properly prevents path traversal in file operations
- `namedToPositional` validates parameter names and prevents SQL injection
- CSP is well-configured with nonce-based script-src and proper frame-ancestors
- Password hashing uses Argon2id with OWASP-recommended parameters
- Dummy password hash prevents user-enumeration via timing
- No `eval()`, `new Function()`, or `Math.random()` in security contexts
- No `as any` type casts in server code

## No Agent Failures

All 7 review perspectives completed successfully.

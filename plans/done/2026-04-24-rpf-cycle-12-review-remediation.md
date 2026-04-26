# RPF Cycle 12 (Loop 12/100) — Review Remediation Plan

**Date:** 2026-04-24
**Cycle:** 12/100 (current RPF loop)
**Base commit:** d13c700b (cycle 11 — CR11-1 fix)
**HEAD commit:** d13c700b

## Findings to Address

This cycle found **2 new findings** across 10 review agents. Both are MEDIUM severity with HIGH confidence and represent real correctness/security risks.

## Scheduled Implementation Tasks

### TASK-1: Strengthen `isEncryptedPluginSecret` to validate full structure, not just prefix [MEDIUM]

**Source:** CR12-1 (flagged by 7 agents: code-reviewer, security-reviewer, critic, debugger, verifier, tracer, test-engineer)
**File:** `src/lib/plugins/secrets.ts:10-12, 132-136`
**Severity:** MEDIUM / Confidence: HIGH

**Current behavior:** `isEncryptedPluginSecret()` only checks for the `enc:v1:` prefix. After the CR11-1 fix, `preparePluginConfigForStorage` trusts this function as the gatekeeper for the "already encrypted" path. A malformed value like `enc:v1:garbage` passes the check, is stored as-is, and fails on read — causing the plugin secret to silently fall back to empty string.

**Expected behavior:** `isEncryptedPluginSecret()` should validate that the value has the full `enc:v1:base64url:base64url:base64url` structure. Malformed `enc:v1:` values should be treated as non-encrypted (i.e., they should be encrypted before storage).

**Implementation:**
1. Add a new `isValidEncryptedPluginSecret()` function in `secrets.ts` that validates:
   - Starts with `enc:v1:`
   - Has exactly 5 colon-separated parts: `enc:v1:iv:tag:ciphertext`
   - Each of `iv`, `tag`, `ciphertext` is a non-empty string
2. Update `preparePluginConfigForStorage` to use `isValidEncryptedPluginSecret()` instead of `isEncryptedPluginSecret()`
3. Keep `isEncryptedPluginSecret()` as-is for the decryption path (it's used in `decryptPluginSecret` to decide whether to attempt decryption — a malformed value should still reach the decryption path so the error is properly handled)
4. Add JSDoc to both functions explaining the difference

**Code change in `src/lib/plugins/secrets.ts`:**

```typescript
// After isEncryptedPluginSecret (keep as-is for decrypt path):
export function isEncryptedPluginSecret(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${ENCRYPTION_VERSION}:`);
}

// New function for storage gating:
export function isValidEncryptedPluginSecret(value: string): boolean {
  if (!isEncryptedPluginSecret(value)) return false;
  const parts = value.split(":");
  // enc:v1:iv:tag:ciphertext — exactly 5 parts, each non-empty
  if (parts.length !== 5) return false;
  return parts.slice(2).every((part) => part.length > 0);
}
```

In `preparePluginConfigForStorage`, change line 132:
```typescript
// BEFORE:
if (isEncryptedPluginSecret(incomingValue)) {

// AFTER:
if (isValidEncryptedPluginSecret(incomingValue)) {
```

### TASK-2: Add strict mode to `decrypt()` — reject plaintext values in production [MEDIUM]

**Source:** CR12-2 (flagged by 3 agents: code-reviewer, security-reviewer, critic)
**File:** `src/lib/security/encryption.ts:79-88`
**Severity:** MEDIUM / Confidence: HIGH

**Current behavior:** `decrypt()` silently returns plaintext when the value doesn't start with `enc:`. In production, only a `logger.warn` is emitted. This creates a silent bypass path for encrypted data.

**Expected behavior:** In production, `decrypt()` should throw when encountering a non-encrypted value, unless explicitly opted out. This prevents silent encryption bypass if an attacker manages to write plaintext to an encrypted column.

**Implementation:**
1. Add an `allowPlaintextFallback` option to `decrypt()` (default: `false` in production, `true` for backward compatibility during migration)
2. When `allowPlaintextFallback` is `false` (default in production) and the value doesn't start with `enc:`, throw an error instead of returning plaintext
3. Update existing callers that rely on the plaintext fallback to explicitly pass `allowPlaintextFallback: true` during the migration period
4. Add JSDoc documenting the migration path

**Code change in `src/lib/security/encryption.ts`:**

```typescript
export function decrypt(encoded: string, options?: { allowPlaintextFallback?: boolean }): string {
  const allowPlaintext = options?.allowPlaintextFallback ??
    (process.env.NODE_ENV !== "production");

  if (!encoded.startsWith("enc:")) {
    if (!allowPlaintext) {
      throw new Error(
        "decrypt() called on non-encrypted value. " +
        "If this is expected during migration, pass allowPlaintextFallback: true. " +
        "Otherwise, investigate possible data tampering or incomplete migration."
      );
    }
    if (process.env.NODE_ENV === "production") {
      logger.warn(
        { prefix: encoded.slice(0, 10) },
        "[encryption] decrypt() called on non-encrypted value — possible data tampering or incomplete migration"
      );
    }
    return encoded;
  }
  // ... rest unchanged
}
```

Then update callers that need the fallback:
- `src/lib/security/hcaptcha.ts:23` — `decrypt(hcaptchaSecret)` → `decrypt(hcaptchaSecret, { allowPlaintextFallback: true })` (system settings may not yet be migrated)
- Any other callers that read from the `system_settings` table where values may not yet be encrypted

## Deferred Items (carried from cycle 4 + cycle 12 additions)

All deferred-fix rules obeyed: file+line citation, original severity/confidence preserved (no downgrade), concrete reason, and exit criterion recorded. No security, correctness, or data-loss findings are in the deferred list — all are performance/UX/cosmetic/doc items explicitly allowed under `CLAUDE.md` and `.context/development/conventions.md`.

### Cycle 4 Deferred Registry (21 items — UNCHANGED)

(Carried forward from cycle 11 plan, unchanged)

| # | Finding | File+Line | Severity / Confidence | Reason for Deferral | Exit Criterion |
|---|---------|-----------|-----------------------|---------------------|----------------|
| 1 | `atomicConsumeRateLimit` uses `Date.now()` in hot path | `src/lib/security/rate-limit.ts` | MEDIUM / MEDIUM | DB round-trip costlier than clock-skew risk | Architecture review for rate-limit strategy |
| 2 | Leaderboard freeze uses `Date.now()` | `src/lib/assignments/leaderboard.ts:52` | LOW / LOW | Sub-second inaccuracy only | Module refactoring cycle |
| 3 | `console.error` in client components | multiple client files | LOW / MEDIUM | Client-side only; no security/correctness impact | Module refactoring cycle |
| 4 | SSE O(n) eviction scan | `src/app/api/v1/submissions/[id]/events/route.ts:44-55` | LOW / LOW | Bounded at 1000 entries | Performance optimization cycle |
| 5 | Manual routes duplicate `createApiHandler` boilerplate | SSE route, judge routes | MEDIUM / MEDIUM | Stable pattern; refactor risk exceeds benefit | API framework redesign |
| 6 | Global timer HMR pattern duplication | multiple route files | LOW / MEDIUM | Works correctly; cosmetic improvement | Module refactoring cycle |
| 7 | Anti-cheat copies user text content | `src/components/exam/anti-cheat-monitor.tsx:206-209` | LOW / LOW | Captures <=80 chars; privacy notice acknowledged | Privacy review cycle |
| 8 | Docker build error leaks paths | Docker client | LOW / LOW | Only visible to admin-level users | Infrastructure hardening cycle |
| 9 | Anti-cheat heartbeat gap query transfers up to 5000 rows | `src/app/api/v1/submissions/[id]/anti-cheat/route.ts:195-204` | MEDIUM / MEDIUM | Currently functional | Performance optimization cycle |
| 10 | Chat widget button badge lacks ARIA announcement | chat widget | LOW / LOW | Screen reader may not announce badge count | Accessibility audit cycle |
| 11 | Contests page badge hardcoded colors | contests page | LOW / LOW | Visual only | Design system migration |
| 12 | SSE route ADR | documentation | LOW / LOW | Useful but not urgent | Documentation cycle |
| 13 | Docker client dual-path docs | documentation | LOW / LOW | Useful but not urgent | Documentation cycle |
| 14 | Stale-while-revalidate cache pattern duplication | `contest-scoring.ts`, `analytics/route.ts` | LOW / LOW | Stable, well-documented duplication | Module refactoring cycle |
| 15 | Anti-cheat heartbeat dedup uses `Date.now()` for LRU cache | `src/app/api/v1/submissions/[id]/anti-cheat/route.ts:92` | LOW / LOW | In-memory only | Module refactoring cycle |
| 16 | Practice page unsafe type assertion | `src/app/(dashboard)/dashboard/practice/page.tsx:420` | LOW / LOW | Runtime-validated | Module refactoring cycle |
| 17 | Anti-cheat privacy notice accessibility | `src/components/exam/anti-cheat-monitor.tsx:261` | LOW / LOW | Requires manual keyboard testing | Manual a11y audit |
| 18 | Missing integration test for concurrent recruiting token redemption | `src/lib/assignments/recruiting-invitations.ts:304-543` | LOW / MEDIUM | Atomic SQL UPDATE well-tested in production | Test coverage cycle |
| 19 | `messages/ja.json` referenced but absent | `messages/ja.json` | LOW / LOW | Aspirational; needs PM scoping | PM scoping decision |
| 20 | DES-RUNTIME-{1..5} sandbox-blocked runtime UI checks | (runtime UI / a11y) | LOW..HIGH-if-violated / LOW | Sandbox has no Docker/Postgres | Sandbox with Docker or Postgres sidecar |
| 21 | Unit-suite `submissions.route.test.ts` fails under parallel vitest workers | `tests/unit/api/submissions.route.test.ts:212-228` | LOW / MEDIUM | Not a code regression; sandbox CPU/IO contention | Tune vitest pool or higher-CPU sandbox |

### Cycle 12 New Deferred Items (16 items)

| # | Finding | File+Line | Severity / Confidence | Reason for Deferral | Exit Criterion |
|---|---------|-----------|-----------------------|---------------------|----------------|
| 22 | In-memory rate limiter FIFO eviction O(n log n) on overflow | `src/lib/security/in-memory-rate-limit.ts:41-46` | LOW / HIGH | Performance; in-memory limiter is fallback path | Performance optimization cycle |
| 23 | `getEntry()` uses `FOR UPDATE` for read-only checks | `src/lib/security/rate-limit.ts:83` | LOW / HIGH | Performance; lock is correctly scoped | Performance optimization cycle |
| 24 | SSE connection cleanup linear scan for oldest | `src/app/api/v1/submissions/[id]/events/route.ts:44-55` | LOW / HIGH | MAX_TRACKED_CONNECTIONS=1000 limits impact | Performance optimization cycle |
| 25 | `sharedPollTick` no batch-size limit on IN clause | `src/app/api/v1/submissions/[id]/events/route.ts:172-203` | LOW / MEDIUM | Bounded by MAX_GLOBAL_SSE_CONNECTIONS=500 | Performance optimization cycle |
| 26 | `getTrustedAuthHosts()` queries DB on every call without caching | `src/lib/security/env.ts:111-139` | LOW / MEDIUM | Server action calls not high-frequency | Performance optimization cycle |
| 27 | Dual encryption modules diverge in key derivation and error handling | `src/lib/security/encryption.ts`, `src/lib/plugins/secrets.ts` | LOW / HIGH | Both work correctly; architectural refactor | Encryption module consolidation |
| 28 | Three rate-limiting modules with overlapping responsibilities | `src/lib/security/rate-limit.ts`, `api-rate-limit.ts`, `in-memory-rate-limit.ts` | LOW / MEDIUM | All work correctly; architectural smell | Rate-limit module consolidation |
| 29 | `atomicConsumeRateLimit` uses `Date.now()` vs `checkServerActionRateLimit` uses DB time | `src/lib/security/api-rate-limit.ts:56 vs 223` | LOW / MEDIUM | Clock skew typically sub-second | Rate-limit time source standardization |
| 30 | Missing test for `isEncryptedPluginSecret` prefix-only validation | `src/lib/plugins/secrets.ts:10-12` | LOW / HIGH | Addressed by CR12-1 TASK-1 fix | Test added as part of fix |
| 31 | Missing test for `decrypt()` plaintext fallback in production | `src/lib/security/encryption.ts:79-88` | LOW / MEDIUM | Addressed by CR12-2 TASK-2 fix | Test added as part of fix |
| 32 | SSE connection tracking module lacks unit tests | `src/app/api/v1/submissions/[id]/events/route.ts` | LOW / MEDIUM | Tested via component/integration tests | Test extraction cycle |
| 33 | `isEncryptedPluginSecret` lacks JSDoc | `src/lib/plugins/secrets.ts:10-12` | LOW / HIGH | Addressed by CR12-1 TASK-1 fix | JSDoc added as part of fix |
| 34 | `decrypt()` plaintext fallback has no migration deadline or disable mechanism | `src/lib/security/encryption.ts:75-78` | LOW / HIGH | Addressed by CR12-2 TASK-2 fix | Documented as part of fix |
| 35 | `api-rate-limit.ts` lacks TOCTOU documentation for two-tier strategy | `src/lib/security/api-rate-limit.ts` | LOW / MEDIUM | Inherent design; function comments suffice | Documentation cycle |
| 36 | SSE `onPollResult` async IIFE flow complexity | `src/app/api/v1/submissions/[id]/events/route.ts:397-438` | LOW / LOW | Multiple `closed` guards prevent bugs | Code quality review cycle |
| 37 | In-memory rate limiter is per-instance, not multi-instance safe | `src/lib/security/in-memory-rate-limit.ts:17` | LOW / MEDIUM | By design; primary rate limiting uses PostgreSQL module | Documentation/multi-instance architecture |

**Total:** 37 entries (21 carried + 16 new).

### Deferral Policy Compliance

Per `CLAUDE.md` and `.context/development/conventions.md`:
- No security, correctness, or data-loss findings are deferred.
- All deferred items have file+line citation, original severity preserved, concrete reason, and exit criterion.
- No `--no-verify`, `--no-gpg-sign`, `Co-Authored-By`, or force-push anticipated.

## Progress Log

- 2026-04-24: Plan created. 2 tasks scheduled (MEDIUM severity). 37-item deferred registry (21 carried + 16 new).
- 2026-04-24: TASK-1 COMPLETED — Added `isValidEncryptedPluginSecret()` with full structural validation. Updated `preparePluginConfigForStorage` to use it, preventing malformed `enc:v1:` values from bypassing encryption. Commit `6a313f39`.
- 2026-04-24: TASK-2 COMPLETED — Added `allowPlaintextFallback` option to `decrypt()`. In production, plaintext values now throw instead of being silently returned. Updated `hcaptcha.ts` caller to explicitly opt in to the legacy fallback during migration. Commit `f3a47690`.
- 2026-04-24: ALL GATES PASS — eslint: 0 errors. tsc --noEmit: 0 errors. vitest: 2116 passed, 5 flaky timeouts (known deferred item #21). next build: success. All commits pushed.

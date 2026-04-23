# Security Review — RPF Cycle 30

**Date:** 2026-04-23
**Reviewer:** security-reviewer
**Base commit:** 31afd19b

## Previously Fixed Items (Verified)

- Chat widget provider error sanitization (commit 93beb49d): Verified. All 6 provider error sites now use `throw new Error(`...API error ${response.status}`)` without `${text}`. Full response body logged server-side via `logger.warn()`.
- console.error gating (14 components): Verified
- bulk-create raw err.message truncation: Verified
- SSRF via test-connection endpoint: Mitigated (uses stored keys, model validation)
- `sanitizeHtml` root-relative img src: Deferred (LOW/LOW)

## SEC-1: `rate-limiter-client.ts` has unguarded `.json()` on success path [LOW/MEDIUM]

**File:** `src/lib/security/rate-limiter-client.ts:79`

The `callRateLimiter` function calls `response.json()` without a `.catch()` guard on line 79:

```typescript
const data = (await response.json()) as T;
```

If the rate-limiter sidecar returns a non-JSON body (e.g., an HTML error page from a reverse proxy), this will throw a `SyntaxError`. The surrounding try/catch (line 63-89) catches this, but it increments `consecutiveFailures` and opens the circuit breaker as a result. A transient proxy error (returning HTML) would trip the circuit breaker, degrading the rate limiter for 30 seconds.

This is the same class of issue tracked as DEFER-38 (unguarded `.json()` on success paths). The server-side API route handlers in `createApiHandler` already wrap `req.json()` in try/catch. The rate-limiter client is server-side code calling an internal sidecar, so the risk is lower than client-side `.json()` calls, but it still produces incorrect circuit-breaker behavior.

**Fix:** Add `.catch()` to the `.json()` call:
```typescript
const data = (await response.json().catch(() => null)) as T | null;
if (data === null) {
  consecutiveFailures++;
  circuitOpenUntil = Date.now() + RECOVERY_WINDOW_MS;
  return null;
}
```

---

## Security Findings (carried/deferred)

### SEC-CARRIED-1: `window.location.origin` for URL construction — covered by DEFER-24
### SEC-CARRIED-2: Encryption plaintext fallback — MEDIUM/MEDIUM, carried from DEFER-39
### SEC-CARRIED-3: `AUTH_CACHE_TTL_MS` has no upper bound — LOW/MEDIUM, carried from DEFER-40
### SEC-CARRIED-4: Anti-cheat localStorage persistence — LOW/LOW, carried from DEFER-48
### SEC-CARRIED-5: `sanitizeHtml` root-relative img src — LOW/LOW, carried from DEFER-49

# Security Review — Cycle 34

**Reviewer:** security-reviewer
**Date:** 2026-05-10
**Scope:** Auth flows, API security, rate limiting, data exposure

---

## Findings

### C34-SR-1: [MEDIUM] `apiFetchJson` parse failures silently swallowed

**File:** `src/lib/api/client.ts:138-144`
**Confidence:** HIGH

When `res.json()` throws (non-JSON body), `apiFetchJson` silently falls back to the fallback value with no logging. In development, this makes debugging JSON parse errors impossible — developers cannot distinguish between a network error, a server 500 returning HTML, or actual malformed JSON.

This was raised in cycle 33 (C33-SR-4) but not yet addressed.

**Fix:** Add development-only `console.warn` in the catch block, citing the endpoint URL and HTTP status.

---

### C34-SR-2: [LOW] `extractClientIp` localhost spoofing still present

**File:** `src/lib/security/ip.ts:39-74`
**Confidence:** HIGH

The X-Forwarded-For processing at line 54-59:

```typescript
const clientIndex = Math.max(0, parts.length - (TRUSTED_PROXY_HOPS + 1));
const candidate = parts[clientIndex];
```

With `TRUSTED_PROXY_HOPS=1` (default), a client sending `X-Forwarded-For: 127.0.0.1` results in nginx appending the real IP: `127.0.0.1, <real_ip>`. The function returns `parts[0]` = `127.0.0.1`, bypassing the localhost check in `test/seed/route.ts`.

**Status:** CRITICAL deferred item C-1, still present. Requires infrastructure-level fix (nginx config to strip untrusted XFF).

---

### C34-SR-3: [LOW] Rate limit key falls back to `"unknown"` when IP extraction fails

**File:** `src/lib/security/rate-limit.ts:46-47`
**Confidence:** MEDIUM

```typescript
export function getRateLimitKey(action: string, headers: Headers) {
  return `${action}:${extractClientIp(headers) ?? "unknown"}`;
}
```

When `extractClientIp` returns `null` (no XFF in production), all requests from different clients share the `"unknown"` rate limit bucket. A single attacker can exhaust the limit for all users behind the same condition.

**Fix:** In production, require XFF and return a distinct key (e.g., include User-Agent hash) when IP is unavailable.

---

## Previously Deferred Security Items (re-validated)

- C-1 (Test/Seed localhost spoofable): **STILL PRESENT** — CRITICAL
- C-2 (Accepted solutions unauthenticated): **FIXED** — requires `auth: true`
- C-3 (File DELETE CSRF ordering): **FIXED** — auth resolved before CSRF with API key bypass
- H-1 (SSE result visibility bypass): Needs re-check — no SSE routes found in current scan
- H-2 (Problem-Set PATCH bypasses createApiHandler): **FIXED** — uses `createApiHandler`
- H-3 (Overrides route doesn't use createApiHandler): Needs re-check
- H-4 (In-memory rate limiter): **FIXED** — removed, DB-backed only
- H-5 (Accepted solutions exposes userId): **FIXED** — properly anonymizes
- DEFER-30 (Recruiting validate token brute-force): Needs re-check
- DEFER-32 (Admin settings exposes DB host/port): Needs re-check

## Positive Observations

1. All error boundaries gate `console.error` behind development checks.
2. File upload validates magic bytes before accepting.
3. ZIP uploads have decompressed size validation.
4. Judge claim uses atomic SQL with `FOR UPDATE SKIP LOCKED`.
5. DOMPurify sanitization is comprehensive with custom hooks.

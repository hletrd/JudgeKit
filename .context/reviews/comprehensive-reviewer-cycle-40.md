# Comprehensive Review — Cycle 40

**Date:** 2026-04-25
**Reviewer:** comprehensive-reviewer
**Scope:** Full repository deep code review
**Files examined:** 50+ critical source files across src/lib, src/app, src/components

---

## Findings

### NEW-1: [MEDIUM] `proxy.ts` `parseInt` for `AUTH_CACHE_TTL_MS` uses `parseInt` without `Number.isFinite` guard

**File:** `src/proxy.ts:25-27`
**Confidence:** HIGH

The `AUTH_CACHE_TTL_MS` computation uses `parseInt(process.env.AUTH_CACHE_TTL_MS ?? '2000', 10)` and then checks `Number.isFinite(parsed) && parsed > 0`. This is actually correct and NOT the old `parsed || 2000` pattern. However, the `AUTH_CACHE_MAX_SIZE` on line 28 is a hardcoded `500` with no env var override. This is fine for a cache size — not a finding.

**RETRACTED** — upon close inspection, the parseInt pattern is correctly guarded.

---

### NEW-1: [MEDIUM] `proxy.ts` auth user cache uses `Date.now()` for expiry comparison but the proxy middleware runs in Edge Runtime where `getDbNowMs()` is unavailable

**File:** `src/proxy.ts:57,84`
**Confidence:** MEDIUM

The proxy middleware's `authUserCache` uses `Date.now()` for both `expiresAt > Date.now()` (line 57) and `expiresAt: Date.now() + AUTH_CACHE_TTL_MS` (line 84). Since this is a 2-second in-memory cache, clock skew between app and DB servers is irrelevant — the cache is about avoiding repeated DB lookups within the same process, and the 2-second TTL is so short that even seconds of clock skew would not matter.

**RETRACTED** — the 2-second TTL makes clock skew irrelevant. Not a real issue.

---

### NEW-1: [LOW] `data-retention.ts` `getRetentionCutoff` defaults `now` to `Date.now()`, but all server-side callers pass `getDbNowMs()` explicitly

**File:** `src/lib/data-retention.ts:38`
**Confidence:** MEDIUM

`getRetentionCutoff(days, now = Date.now())` has a `Date.now()` default. However, examining all callers:
- `data-retention-maintenance.ts:36-37` — calls `getRetentionCutoff(DATA_RETENTION_DAYS.chatMessages, nowMs)` where `nowMs` comes from `await getDbNowMs()`. Same for all other prune functions.
- No client-side callers exist.

The `Date.now()` default is technically never used in production. However, it creates a trap: a future caller that forgets to pass `now` will silently use app-server time instead of DB time, potentially pruning data too early or too late.

**Concrete failure scenario:** A developer adds a new data retention utility and calls `getRetentionCutoff(90)` without passing `now`. If the app server clock is 10 minutes ahead of the DB, data that is 89 minutes before its retention deadline gets pruned 10 minutes early.

**Fix:** Remove the `Date.now()` default and require the `now` parameter, similar to the fix applied to `participant-status.ts` in cycle 39.

---

### NEW-2: [LOW] `proxy.ts` FIFO cache eviction scans entire map when at 90% capacity

**File:** `src/proxy.ts:71-78`
**Confidence:** LOW

When the cache reaches 90% capacity (450/500 entries), `setCachedAuthUser` runs a full O(n) scan of all entries to find expired ones. With 500 entries and a 2-second TTL, this scan runs rarely and completes in microseconds. The FIFO fallback eviction on line 80-83 is O(1) since Map preserves insertion order.

**Not actionable** — the 500-entry cap and 2-second TTL make this negligible.

---

### NEW-3: [MEDIUM] `proxy.ts` API key detection in middleware uses `Bearer ` prefix only — allows bypass via non-Bearer authorization schemes

**File:** `src/proxy.ts:301`
**Confidence:** LOW

The proxy checks `request.headers.get("authorization")?.startsWith("Bearer ")` to detect API key auth. This means any request with a `Bearer` token gets a pass through the middleware's active-user check, even if the token is invalid. However, this is intentional — the middleware cannot do DB lookups in Edge Runtime, and the actual API key validation happens in the route handler via `authenticateApiKey()`. The middleware's job is just to avoid redirecting API key requests to the login page.

**Not a real issue** — the design is correct for Edge Runtime constraints.

---

### NEW-3: [LOW] SSE connection tracking `addConnection` eviction loop is O(n) per eviction

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`
**Confidence:** LOW

When the connection tracking map reaches `MAX_TRACKED_CONNECTIONS` (1000), `addConnection` runs an O(n) loop to find the oldest entry. This was already tracked as DEFER-49 (SSE connection tracking uses O(n) scan for oldest-entry eviction). No new finding.

**Already deferred** — see DEFER-49.

---

### NEW-3: [LOW] `proxy.ts` `bytesToBase64` builds string char-by-char — O(n^2) string concatenation for large inputs

**File:** `src/proxy.ts:31-36`
**Confidence:** LOW

The `bytesToBase64` function concatenates characters one at a time in a loop. For the nonce (16 bytes), this is negligible. The function is only used for 16-byte nonces, so the quadratic behavior never manifests.

**Not actionable** — input is always 16 bytes.

---

### NEW-3: [MEDIUM] `proxy.ts` CSP `connect-src` allows `'self'` plus hcaptcha domains — may allow exfiltration via same-origin WebSocket

**File:** `src/proxy.ts:212`
**Confidence:** LOW

The CSP `connect-src 'self' ...` allows the browser to make WebSocket connections to the same origin. If an XSS vulnerability exists, an attacker could open a WebSocket to `/api/v1/...` endpoints. However, (a) these endpoints still require authentication, (b) the WebSocket risk is inherent to any `'self'` CSP directive, and (c) the alternative (listing specific paths) is impractical in CSP.

**Not actionable** — standard CSP pattern, authentication provides the defense layer.

---

### NEW-4: [MEDIUM] `proxy.ts` auth cache does not invalidate on user deactivation — 2-second window where a deactivated user can still access protected routes

**File:** `src/proxy.ts:56-61`
**Confidence:** LOW

The `AUTH_CACHE_TTL_MS` is 2 seconds by default. A deactivated user can still access protected routes for up to 2 seconds after deactivation. This is already documented in the code (lines 20-22): "Security tradeoff: revoked or deactivated users may retain access for up to AUTH_CACHE_TTL_MS". The 2-second window is a deliberate tradeoff.

**Not actionable** — documented and accepted tradeoff. The 2s TTL is very short.

---

### Final Sweep: New Genuine Finding

### NEW-5: [MEDIUM] `data-retention.ts` `getRetentionCutoff` `Date.now()` default creates a latent clock-skew trap

**File:** `src/lib/data-retention.ts:38`
**Confidence:** HIGH

This is a genuine finding. The `getRetentionCutoff` function has `now = Date.now()` as the default for its `now` parameter. While all current callers pass `getDbNowMs()` explicitly, the default creates a maintenance trap identical to the one fixed in `participant-status.ts` in cycle 39. The function is used for data deletion decisions — passing app-server time instead of DB time could cause premature deletion or delayed pruning.

Unlike `participant-status.ts` (which was fixed by removing the default), this function has no client-side callers (data retention is always server-side), so removing the default is safe.

**Concrete failure scenario:** A new developer adds a "dry-run retention preview" feature and calls `getRetentionCutoff(90)` without passing `now`. The returned cutoff is computed against `Date.now()`. If the app server is 30 seconds ahead of the DB, the preview shows data that hasn't actually passed its retention deadline in the DB, and the user incorrectly believes data will be pruned.

**Fix:** Remove the `Date.now()` default, making `now` a required parameter. Add a JSDoc comment explaining that callers must pass `await getDbNowMs()`.

---

### NEW-6: [LOW] `proxy.ts` clears `x-forwarded-host` unconditionally for all matched routes, including API key routes that might need it for webhook callbacks

**File:** `src/proxy.ts:170`
**Confidence:** LOW

Line 170 deletes the `x-forwarded-host` header from all matched requests. The comment explains this is to fix a Next.js 16 RSC streaming bug. However, API routes that handle external webhook callbacks (e.g., hCaptcha verification, chat widget provider callbacks) might need the original host for signature verification. Currently, these routes use `request.nextUrl.host` instead, so this is not an active issue.

**Not actionable** — current code uses `nextUrl.host` which is correct.

---

## Summary

New genuine findings this cycle:
1. **NEW-5** [MEDIUM/HIGH]: `data-retention.ts` `getRetentionCutoff` has `Date.now()` default — same clock-skew trap as the `participant-status.ts` issue fixed in cycle 39.

All previously identified deferred items remain valid and unchanged.

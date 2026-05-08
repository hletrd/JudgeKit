# Debugger — Cycle 26

**Date:** 2026-04-25
**Scope:** Latent bug surface, failure modes, regressions

---

## D-1: [HIGH] `rateLimitedResponse` sidecar path uses `Date.now()` — latent clock-skew bug

**File:** `src/lib/security/api-rate-limit.ts:123, 162, 196`
**Confidence:** HIGH

(Duplicates CR-1 from a failure-mode angle.) The failure mode is:

1. App server clock is N seconds ahead of DB server clock
2. User hits rate limit via sidecar rejection
3. `X-RateLimit-Reset` header is computed as `Date.now() + windowMs`
4. Client waits until `X-RateLimit-Reset` and retries
5. DB rate-limit window started at `getDbNowMs()` (N seconds behind), so the client retries N seconds too early
6. Client gets a 429 from the DB path (window not yet expired in DB time)

The converse failure (app clock behind DB clock) causes the client to wait too long, which is less harmful but still incorrect.

This was cycle 25 AGG-3, marked DONE but never applied.

---

## No other latent bugs found

The codebase has robust error handling throughout. The SSE connection cleanup, data retention batched deletes, and exam session idempotency all handle failure modes correctly.

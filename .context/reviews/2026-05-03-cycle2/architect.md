# Architect Review — Cycle 2 (2026-05-03)

**Reviewer:** architect
**HEAD:** `689cf61d`

---

## C2-ARCH-1 (MEDIUM, MEDIUM confidence) — Auth layer has no caching boundary between JWT and DB

**Files:** `src/lib/auth/config.ts:394-407`, `src/lib/api/auth.ts:61-74`

The architecture has the JWT callback querying the DB on every token refresh (every API request). This creates a tight coupling between the auth layer and the database, with no caching boundary. If the DB goes down, all authenticated requests fail immediately, even for valid JWTs.

The `tokenInvalidatedAt` field on the user row is the reason for the per-request query, but it could be cached in the JWT itself with a short TTL.

**Fix:** Add a `lastCheckedAt` field to the JWT. Skip the DB query if `lastCheckedAt` is within the TTL window (e.g., 60 seconds). Only query when the TTL expires. This creates a bounded staleness window that is acceptable for most use cases and dramatically reduces DB load.

---

## C2-ARCH-2 (LOW, HIGH confidence) — Rate limiting is split across two modules with divergent patterns

**Files:** `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`

These two modules write to the same `rateLimits` table but have different patterns:
- `rate-limit.ts`: uses exponential backoff on consecutive blocks, clearable on success
- `api-rate-limit.ts`: uses fixed blocking, no backoff, idempotency via WeakMap

The code comments reference a "C7-AGG-9 consolidation cycle" but it hasn't happened. The divergence means bug fixes in one module may not be applied to the other.

**Fix:** Track as a known tech debt item. When either module is next touched for a bug fix, apply the same fix to the other and add a shared test.

---

## C2-ARCH-3 (LOW, MEDIUM confidence) — Recruiting access context loads all invitation assignments eagerly

**File:** `src/lib/recruiting/access.ts:54-73`

`loadRecruitingAccessContext` loads ALL assignment IDs for a user's redeemed invitations, then ALL problem IDs for those assignments. For a candidate with many invitations, this could return hundreds of assignment IDs and thousands of problem IDs, all loaded into memory on every request.

**Fix:** Add pagination or a limit. In practice, a candidate rarely has more than 5-10 active invitations, so this is low risk.

---

## Final Sweep

Architecture is sound overall. The Next.js App Router pattern with `createApiHandler` provides consistent auth/CSRF/rate-limit/body-validation middleware. The Drizzle ORM usage prevents SQL injection. The recruiting flow is well-isolated from the main auth flow. Main risk is the per-request DB query in the JWT callback.

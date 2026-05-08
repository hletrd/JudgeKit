# Architect Review — Cycle 3 (2026-05-03)

**HEAD reviewed:** `ae528d9b`

---

## C3-ARCH-1 (MEDIUM, HIGH) — Per-invitation brute-force counter stored in metadata JSONB — architectural concern

**File:** `src/lib/assignments/recruiting-invitations.ts:26,34-55`

The `_failedRedeemAttempts` counter was added to `metadata` JSONB to avoid a schema migration. This creates several architectural problems:
1. **Non-atomic updates** (C3-SEC-1) — JSONB read-modify-write in JS is inherently racy.
2. **Namespace collisions** — user-supplied metadata keys share the same namespace as internal system keys.
3. **No index** — the counter is not queryable or indexable without full JSONB parsing.
4. **Coupling** — the counter is "best-effort" with try/catch that swallows errors, making it a soft gate rather than a hard security boundary.

**Recommendation:** When a schema migration is next feasible, add a `failedRedeemAttempts integer DEFAULT 0` column and a `lockedOutAt timestamptz` column to `recruitingInvitations`. This enables atomic `SET failed_redeem_attempts = failed_redeem_attempts + 1` updates and indexed queries. Short-term: replace the JS read-modify-write with atomic SQL `jsonb_set` (addresses C3-SEC-1 without a migration).

---

## C3-ARCH-2 (LOW, MEDIUM) — `hashToken` duplicated across recruiting and judge modules

**Files:** `src/lib/assignments/recruiting-invitations.ts:65`, `src/lib/judge/auth.ts:21`

Two independent modules define identical `hashToken` functions. This violates DRY and creates a risk of divergence if one is updated without the other.

**Fix:** Extract to `src/lib/security/token-hash.ts` and import in both consumers.

---

## C3-ARCH-3 (LOW, MEDIUM) — Audit event buffer is a module-level mutable singleton

**File:** `src/lib/audit/events.ts:141-142`

`_auditBuffer` and `_flushTimer` are module-level mutable state. In a serverless or multi-instance environment, each process has its own buffer — events are not shared across instances. The buffer is also unbounded above `FLUSH_SIZE_THRESHOLD * 2` (100 entries). If the DB is down for an extended period, the buffer grows until it hits the overflow threshold, then drops events.

This is a known architectural limitation, not a bug. The dropped-events counter (added in cycle 2) mitigates the observability gap. Documenting this more clearly in the module's JSDoc would help future maintainers.

---

## C3-ARCH-4 (INFO, LOW) — JWT callback DB query per request (carry-forward)

Agrees with C3-PERF-1. The architectural tradeoff is clear: correctness (immediate revocation) vs. performance (caching). The fix (TTL-based cache in the JWT) is deferred to a dedicated auth-perf cycle.

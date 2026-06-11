# Architect — Cycle 12 Deep Review

**Date:** 2026-04-24
**Reviewer:** architect
**Scope:** System design, coupling, layering, module boundaries, data flow

## Findings

### AR12-1: Dual encryption modules (`encryption.ts` and `secrets.ts`) with divergent behavior

**Files:** `src/lib/security/encryption.ts`, `src/lib/plugins/secrets.ts`
**Severity:** MEDIUM / Confidence: HIGH

The codebase has two independent encryption implementations:
1. `encryption.ts` — general-purpose AES-256-GCM with `enc:iv:ciphertext:authTag` format, using `NODE_ENCRYPTION_KEY`
2. `secrets.ts` — plugin-specific with `enc:v1:iv:tag:ciphertext` format, using HKDF-derived key from `PLUGIN_CONFIG_ENCRYPTION_KEY`

They have different key derivation, different output formats, and different error handling (plaintext fallback vs. throw). This violates DRY and increases the attack surface — a bug in one encryption path doesn't benefit from fixes in the other. Additionally, `hcaptcha.ts` uses the general `decrypt()`, while plugin config uses `decryptPluginSecret()`.

**Risk:** A developer might use the wrong encrypt/decrypt pair for a new feature, leading to data that can't be decrypted or that silently falls back to plaintext.

**Fix:** Consolidate to a single encryption module with domain-separated keys via HKDF (which `secrets.ts` already uses). The general `encrypt()/decrypt()` should also use HKDF-derived keys. Remove the plaintext fallback in production.

### AR12-2: SSE connection tracking uses module-level mutable state — not multi-instance safe

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:26-29`
**Severity:** LOW / Confidence: HIGH

The `activeConnectionSet`, `connectionInfoMap`, and `userConnectionCounts` are module-level Maps. This means SSE connection limits are per-process, not global. The code already has `realtime-coordination.ts` with PostgreSQL-backed shared coordination for multi-instance, but when `useSharedCoordination` is false (single instance), these in-memory structures are used. The issue is that the in-memory structures and the shared coordination are two completely different code paths with different semantics.

**Risk:** If someone enables multi-instance without enabling shared coordination, the in-memory connection tracking will undercount, allowing more than `MAX_GLOBAL_SSE_CONNECTIONS` total across instances.

**Fix:** The `getUnsupportedRealtimeGuard()` already blocks SSE routes when multi-instance is detected without shared coordination. This is adequate. No code change needed, but document the architectural decision that SSE is single-instance-only without PostgreSQL coordination.

### AR12-3: `rate-limit.ts` and `api-rate-limit.ts` have overlapping responsibilities

**Files:** `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`, `src/lib/security/in-memory-rate-limit.ts`
**Severity:** LOW / Confidence: MEDIUM

There are three rate-limiting implementations with overlapping functionality:
1. `rate-limit.ts` — PostgreSQL-backed with exponential backoff, login-focused
2. `api-rate-limit.ts` — PostgreSQL-backed with sidecar pre-check, API endpoint-focused
3. `in-memory-rate-limit.ts` — Map-based fallback

Both PostgreSQL-backed modules use the same `rateLimits` table and schema but have different logic (backoff vs. fixed blocking, sidecar vs. no sidecar). This increases maintenance burden and the risk of divergence.

**Fix:** Consider consolidating into a single rate-limiting module with configurable strategies (login vs. API). At minimum, document the intended usage scope of each module.

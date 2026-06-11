# Cycle 18 Architect Reviewer Findings (Updated)

**Date:** 2026-05-09
**Reviewer:** Architectural/design risks, coupling, layering
**Base commit:** 75d82a17
**Previous review:** cycle-18-architect.md (2026-04-19, commit 7c1b65cc)

---

## Previous Finding Status

| ID | Previous Finding | Status |
|----|-----------------|--------|
| F1 | `getRecruitingAccessContext` no caching layer | **PARTIALLY ADDRESSED** — `withRecruitingContextCache` added |
| F2 | Admin routes duplicated auth logic | **STILL OPEN** — unchanged |
| F3 | Workspace-to-public migration Phase 3 stalled | **STILL OPEN** — unchanged |

---

## New Findings

### N1: Dual Rate-Limit Implementations with Divergent Logic

- **Files**: `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: Two modules implement similar DB-backed token bucket logic with different semantics. Both write to the same `rateLimits` table. Consolidation is acknowledged as deferred in comments.
- **Fix**: Extract shared `DbRateLimiter` class.

### N2: Plugin Secret Encryption Uses Different Format from Column Encryption

- **Files**: `src/lib/plugins/secrets.ts`, `src/lib/security/encryption.ts`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: Plugin secrets use `enc:v1:base64url` format. Column encryption uses `enc:hex` format. Both AES-256-GCM but incompatible.
- **Fix**: Unify on single ciphertext format.

### N3: Chat Widget Tightly Coupled to Provider Config

- **File**: `src/app/api/v1/plugins/chat-widget/chat/route.ts:315-326`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: Hardcoded `switch` mapping provider names to model fields. Adding a provider requires modifying route, schema, and UI.
- **Fix**: Store active model name in provider config or use dynamic registry.

### N4: `execTransaction` Build-Phase Fallback Violates Atomicity Contract

- **File**: `src/lib/db/index.ts:67-75`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: Function promises transactions but silently falls back to non-transactional during build.
- **Fix**: Rename or throw during build for transaction-required operations.

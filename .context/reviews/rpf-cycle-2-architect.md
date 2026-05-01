# RPF Cycle 2 (2026-05-01) — Architect

**Date:** 2026-05-01
**HEAD reviewed:** `70c02a02`

## Findings

### C2-AR-1: [MEDIUM] encryption.ts doc-code mismatch

- **Source:** Concur with C2-CR-1, C2-SR-1, C2-CT-1
- **File:** `src/lib/security/encryption.ts:5-6`
- **Description:** Module-level JSDoc says "base64" but code uses "hex". Architectural risk: any external tool built against the documented format will fail silently. This violates the principle that security-critical module documentation must be accurate.
- **Confidence:** HIGH

### C2-AR-2: [LOW] Dead _context parameter in validateAndHashPassword

- **Source:** Concur with C2-CR-2
- **File:** `src/lib/users/core.ts:57`
- **Description:** The `_context` parameter is dead code after cycle 1's password policy simplification. While not an architectural issue, it represents an API surface that no longer has a purpose and should be cleaned up.
- **Confidence:** HIGH

## Architectural Observations (Re-verified at HEAD)

1. Layered access control: capabilities (coarse) -> group membership (medium) -> object ownership (fine)
2. Dual-path Docker API: local/remote abstraction is clean
3. Compiler sandbox: multi-layered defense
4. Encryption module: two separate encryption systems (encryption.ts for columns, secrets.ts for plugins) with different encoding formats. This is intentional (column-level uses `enc:` hex, plugin-level uses `enc:v1:` base64url)
5. The `createApiHandler` wrapper pattern is well-adopted (84 of 104 routes)

## Carry-forward

All carry-forward items unchanged at HEAD. ARCH-CARRY-1 (20 raw API handlers) still DEFERRED.

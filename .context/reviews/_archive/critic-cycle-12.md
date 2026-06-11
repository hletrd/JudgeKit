# Critic — Cycle 12 Deep Review

**Date:** 2026-04-24
**Reviewer:** critic
**Scope:** Multi-perspective critique of change surface, design choices, and operational risks

## Findings

### CT12-1: `encrypt()/decrypt()` plaintext fallback is a ticking time bomb for silent data integrity violations

**File:** `src/lib/security/encryption.ts:79-88`
**Severity:** MEDIUM / Confidence: HIGH

The plaintext fallback in `decrypt()` is architecturally wrong for a system that claims encrypted storage. The comment says "plaintext fallback for data that was stored before encryption was enabled" — but there is no migration deadline, no flag to disable it, and no audit when it triggers in production beyond a `logger.warn`. This is a footgun that will remain until someone adds a strict mode.

**Cross-reference:** Flagged by code-reviewer (CR12-3) and security-reviewer (SR12-1). Three reviewers agree this is a real issue.

### CT12-2: `isEncryptedPluginSecret()` prefix-only check is insufficient after CR11-1 fix

**File:** `src/lib/plugins/secrets.ts:10-12`
**Severity:** LOW / Confidence: HIGH

The CR11-1 fix made `preparePluginConfigForStorage` trust `isEncryptedPluginSecret` as the gatekeeper. But the function only checks a prefix — not structure. This is the same class of bug as CR11-1 (trusting user-controlled string prefixes) but at a lower severity because it requires admin access. The fix should validate the full structure.

**Cross-reference:** Flagged by code-reviewer (CR12-4) and security-reviewer (SR12-2). Two reviewers agree.

### CT12-3: Dual encryption modules are a maintenance hazard

**Files:** `src/lib/security/encryption.ts`, `src/lib/plugins/secrets.ts`
**Severity:** MEDIUM / Confidence: HIGH

Two encryption modules with different key derivation, different output formats, and different error handling is a textbook example of the "two clocks" anti-pattern. When one module gets a security fix, the other may not. The plaintext fallback in `encryption.ts` exists precisely because the two modules diverged and no one consolidated them.

**Cross-reference:** Flagged by architect (AR12-1). The architectural and security perspectives align.

### CT12-4: Rate-limit module proliferation (3 implementations) increases cognitive load and bug surface

**Files:** `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`, `src/lib/security/in-memory-rate-limit.ts`
**Severity:** LOW / Confidence: MEDIUM

Three rate-limiting modules sharing the same DB table but with different logic. A developer adding a new rate-limited endpoint must choose between three modules, each with subtly different semantics (backoff vs. fixed, sidecar vs. no sidecar, in-memory vs. DB). This is an architectural smell that will get worse over time.

**Cross-reference:** Flagged by architect (AR12-3) and perf-reviewer (PR12-1).

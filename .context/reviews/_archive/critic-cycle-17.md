# Critic — Cycle 17

## Findings

### C-1: [MEDIUM] `hcaptchaSecret` Logger Redaction Gap — Multi-Perspective Signal
**Sources:** CR-1, S-1, A-1, D-1, V-1
**Confidence:** High
**Cross-agent signal:** 5 of 6 review perspectives

This is the strongest signal from this cycle's review. Five independent review angles converged on the same finding: `hcaptchaSecret` is missing from the logger's `REDACT_PATHS`. The inconsistency is clear — `encryptedKey` is in the list but `hcaptchaSecret` is not, despite both being encrypted-at-rest secrets that are handled in plaintext before encryption.

---

### C-2: [LOW] Duplicate Audit Event Pruning — Architectural Consistency
**Sources:** A-2, D-2, V-2
**Confidence:** High
**Cross-agent signal:** 3 of 6 review perspectives

Two independent systems prune from `auditEvents`. This is not a bug but an architectural concern — future retention policy changes must update both systems, and the double execution wastes cycles.

---

### C-3: [LOW] Access Code Plaintext Storage — Accepted Design Tradeoff
**Sources:** S-2
**Confidence:** Medium
**Cross-agent signal:** 1 of 6 review perspectives

The access code is stored in plaintext. While this is a security weakness, it is an accepted design tradeoff given the limited blast radius (contest access only, short-lived, no account takeover). This finding is noted for the record but does not require immediate action.

---

### C-4: [LOW] No Automated Check for Logger Redaction Completeness
**Sources:** T-1
**Confidence:** High
**Cross-agent signal:** 1 of 6 review perspectives

The same systemic gap that existed for `SANITIZED_COLUMNS` (fixed in cycle 16) exists for `REDACT_PATHS`. Without a test, new secret columns can be silently missed.

---

### Positive Observations

The codebase continues to demonstrate strong engineering:
- All cycle 16 fixes are correctly implemented and verified
- Timing-safe comparison used consistently for all token comparisons
- Atomic SQL with advisory locks prevents TOCTOU races in submissions, recruiting, and access code redemption
- DOMPurify with strict allowlist and `ALLOWED_URI_REGEXP` for HTML sanitization
- AES-256-GCM with auth tags for encryption, HKDF for key derivation
- CSP with nonces, CSRF with Origin + Sec-Fetch-Site + X-Requested-With
- DB server time used consistently across all temporal comparisons
- Comprehensive audit logging with truncation and redaction

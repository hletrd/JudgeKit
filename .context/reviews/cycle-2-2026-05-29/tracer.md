# Tracer — Cycle 2 (2026-05-29)

Causal tracing of the highest-signal net-new finding, competing hypotheses.

## Trace: "admin sets SMTP password" → where does the secret end up?
1. UI submits `smtpPass` → `updateSystemSettings(input)`
   (`src/lib/actions/system-settings.ts:52`).
2. Zod-validated (`system-settings.ts:73`), `smtpPass` is `string<=500`.
3. Line 173-175: `if (hasOwnInput("smtpPass")) baseValues.smtpPass =
   smtpPass ? encrypt(smtpPass) : null;` → ciphertext stored in `baseValues`.
4. Line 205-214: `baseValues` UPSERTed into `systemSettings` (encrypted at rest
   — correct).
5. Line 218-224: `auditDetails` built from `baseValues`, redacting ONLY
   `hcaptchaSecret`. `smtpPass` ciphertext flows through unredacted.
6. Line 227-237: `recordAuditEvent({ details: auditDetails })`.
7. `audit/events.ts:121 serializeDetails` → `:244 details: serializeDetails(...)`
   → `:191 db.insert(auditEvents)`. **Ciphertext persisted to audit table.**

Competing hypotheses for "why was smtpPass missed":
- H1 (LEADING, confirmed): the redaction predicate is a single-key literal
  written when `hcaptchaSecret` was the only secret; the SMTP feature
  (871e3583) added a second secret column but never extended the predicate.
  Git shows `system-settings.ts` last touched by 871e3583 (SMTP) and 7c663364
  (community toggles) — the SMTP commit is exactly where the gap was born.
- H2 (rejected): "smtpPass is fine because it's encrypted" — rejected: the
  sibling `hcaptchaSecret` is ALSO encrypted (line 186 `encrypt(hcaptchaSecret)`)
  yet is still redacted, so encryption-at-rest was never deemed sufficient for
  the audit log. The two must be treated identically.

Conclusion: SEC-C2-1 is real, root cause is the literal-key allowlist (CR-C2-2),
fix is data (redact smtpPass) + shape (shared secret-key set).

## Secondary trace: `sendEmail` exception escape (DBG-C2-1)
`sendEmail` (index.ts:42) → line 43 `await activeProvider.isConfigured()`
(SMTP) → `getSmtpConfig` → `decrypt(smtpPass, {allowPlaintextFallback:true})`.
Fallback handles plaintext; a malformed *ciphertext* still throws → escapes line
43 (not inside any try/catch) → rejects the caller's promise. Low frequency,
real. The `detectProvider` guard (lines 23-32) would have caught it had line 43
routed through it.

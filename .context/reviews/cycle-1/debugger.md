# Debugger / Failure-Mode Review — Cycle 1 (2026-05-29)

## Findings

### DBG-C1-1 — Production decrypt throw breaks all email (latent crash) [Medium / High confidence]
Duplicate of SEC-C1-1 from the failure-mode angle. The throw path in
`src/lib/security/encryption.ts:103-108` is reachable from
`src/lib/email/providers/smtp.ts:47` because that caller omits
`allowPlaintextFallback`. Failure mode: a single legacy-plaintext `smtpPass` row turns
every `isEmailConfigured()`/`sendEmail()` into a thrown exception in production.
`detectProvider()` (index.ts:16-23) does NOT wrap `provider.isConfigured()` in
try/catch, so the throw escapes `isEmailConfigured()` to its callers (e.g. the
recruiting route's `await isEmailConfigured()` guard, settings test-send). High signal:
two angles independently flag it.
Fix: pass `{ allowPlaintextFallback: true }` (primary) AND consider wrapping
`provider.isConfigured()` in `detectProvider` with a try/catch that logs + treats a
throwing provider as "not configured" (defense-in-depth so one bad provider can't nuke
detection).

### DBG-C1-2 — `getActiveProviderName()` can return a stale provider name [Low / Low confidence]
File: `src/lib/email/providers/index.ts:14,42-44`. `activeProvider` is module-global and
only re-detected when null or when `isConfigured()` returns false. If an admin switches
from SMTP to (hypothetically) a configured API provider without the SMTP becoming
"unconfigured", `getActiveProviderName()` keeps reporting the old provider until a send
fails detection. Minor/observability-only. Confidence Low.

## Confirmed-robust
- `verifyEmail` / `resetPassword` use in-transaction read + conditional UPDATE WHERE
  (...usedAt IS NULL) so concurrent token consumption is serialized under READ COMMITTED
  (email/index.ts:142-205, 285-335). Correct TOCTOU handling.
- Recruiting POST guards Invalid Date (`Number.isFinite`) and past/too-far expiry.

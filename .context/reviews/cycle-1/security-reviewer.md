# Security Review — Cycle 1 (2026-05-29)

Scope: full repo with emphasis on the recently-changed surface (email subsystem,
public signup, recruiting invitations, system settings / SMTP secrets).

## Methodology
Built an inventory of secret-handling and email files:
- `src/lib/email/providers/smtp.ts`, `index.ts`, `templates.ts`, `src/lib/email/index.ts`
- `src/lib/security/encryption.ts`, `src/lib/security/hcaptcha.ts`
- `src/lib/actions/public-signup.ts`, `src/lib/actions/system-settings.ts`
- `src/lib/validators/system-settings.ts`
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts`

## Findings

### SEC-C1-1 — SMTP secret decrypt lacks plaintext fallback (inconsistent with hcaptcha) [Medium / High confidence]
File: `src/lib/email/providers/smtp.ts:47`
```ts
const pass = raw.smtpPass ? decrypt(raw.smtpPass as string) : null;
```
`decrypt()` (src/lib/security/encryption.ts:98-117) defaults `allowPlaintextFallback`
to `false` in production. If `smtpPass` was ever written as legacy plaintext (e.g.
configured before column encryption, or restored from an older backup), this call
THROWS in production. The exception propagates out of `getSmtpConfig()` →
`smtpProvider.isConfigured()` / `send()`, which are invoked from `isEmailConfigured()`
and every transactional-email path (password reset, email verification, recruiting
invitations). Result: a single un-migrated row silently breaks ALL email and can
500 the settings/email flows.
The sibling secret reader `src/lib/security/hcaptcha.ts:23` already passes
`{ allowPlaintextFallback: true }`. The SMTP reader should match for consistency
and migration safety.
Failure scenario: admin upgrades JudgeKit; the pre-existing plaintext smtpPass row
is not re-encrypted; in production `decrypt()` throws; password-reset emails stop
working and the error is opaque.
Fix: `decrypt(raw.smtpPass as string, { allowPlaintextFallback: true })` — mirroring
hcaptcha. (encryption.ts already emits a production warn-log on plaintext, preserving
the audit trail per its documented C7-AGG-7 policy.)

### SEC-C1-2 — Email subject lines interpolate unescaped user-controlled data [Low / Medium confidence]
File: `src/lib/email/templates.ts:59,75` and indirectly recruiting route.
`renderRecruitingInvitationEmail` subject = `` `You're invited: ${data.assessmentTitle}` ``
and `renderSiteEventEmail` subject = `` `[${severity}] ${data.title}` ``.
The HTML bodies correctly escape these values (good — that was this cycle's fix),
but subjects use raw values. Subjects are not HTML, so XSS is not the risk; the real
risk is header/newline injection if `assessmentTitle`/`title` could contain CR/LF.
Nodemailer sanitizes header newlines, and `assessmentTitle` comes from a validated
assignment title, so exploitability is Low. Recorded for completeness: prefer
stripping CR/LF from any value placed in a subject as defense-in-depth.
Confidence Medium that it is non-exploitable today; Low severity.

## Confirmed-safe (checked, no action)
- SMTP password masking round-trip: settings form only resubmits `smtpPass` when it
  differs from the `••••••••` placeholder (system-settings-form.tsx:169, page.tsx:135),
  so editing other fields does NOT overwrite the stored secret. Correct.
- `updateSystemSettings` encrypts `smtpPass`/`hcaptchaSecret` via `encrypt()` and
  redacts secrets in the audit log (system-settings.ts:174,186,222). Correct.
- HTML escaping in templates.ts covers all interpolated body values. Correct.
- TLS verification on by default; `SMTP_SKIP_TLS_VERIFY` is an explicit opt-out
  (smtp.ts:82). Acceptable.

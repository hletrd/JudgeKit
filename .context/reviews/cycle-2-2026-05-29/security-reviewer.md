# Security Review — Cycle 2 (2026-05-29)

Scope: OWASP-lens sweep of the cycle-1 surface (email/SMTP, system-settings
secrets, public signup, recruiting invitations) for issues NOT already in
cycle-1 reviews/plans. Cycle-1 F1 (plaintext SMTP decrypt) and F8 (subject
CR/LF) are already recorded; not re-flagged.

## SEC-C2-1 — Encrypted `smtpPass` ciphertext written to persisted audit log — Low-Medium / High
`src/lib/actions/system-settings.ts:218-224`
```ts
const auditDetails = JSON.parse(JSON.stringify(
  Object.fromEntries(
    Object.entries(baseValues)
      .filter(([key]) => key !== "updatedAt")
      .map(([key, val]) => [key, key === "hcaptchaSecret" && typeof val === "string" && val.length > 0 ? "••••••••" : val])
  )
));
```
The redaction allowlist masks `hcaptchaSecret` but NOT `smtpPass`. On line 174,
`baseValues.smtpPass = smtpPass ? encrypt(smtpPass) : null;` — so when an admin
sets/changes the SMTP password, its **encrypted ciphertext** is serialized into
`auditDetails` and persisted to the `auditEvents` DB table
(`src/lib/audit/events.ts:191 db.insert(auditEvents)`).
- Why a problem: (1) Inconsistent with the sibling `hcaptchaSecret`, redacted on
  the SAME line — the intent was clearly to redact all secrets. (2)
  Defense-in-depth: an actor with audit-log read access who also obtains the
  `ENCRYPTION_KEY` can recover the SMTP password; secrets (even encrypted)
  should not be duplicated into general-purpose logs. (3) The ciphertext bloats
  every settings-update audit row.
- Severity: Low-Medium. It is ciphertext, not plaintext — not directly readable
  — but it is a clear secret-handling regression introduced with the SMTP
  feature (871e3583) that the existing `hcaptchaSecret` redaction was meant to
  prevent. Per repo/global policy ("writing secrets to unencrypted files or
  logs") this should be fixed, not deferred.
FIX: extend the redaction to a secret-key set:
```ts
const SECRET_KEYS = new Set(["hcaptchaSecret", "smtpPass"]);
... [key, SECRET_KEYS.has(key) && typeof val === "string" && val.length > 0 ? "••••••••" : val]
```
NOT in any cycle-1 file. Net-new.

## SEC-C2-2 (info, DUP of cycle-1 F4) — Outbound base URL trusts client Host header — Low / High
`public-signup.ts:192-195`, `recruiting-invitations/route.ts:122-124` build the
email link base URL from request `Host` / `X-Forwarded-Proto`. Already recorded
as cycle-1 F4 (OPEN in `plans/open/2026-05-29-cycle-1-rpf-review-remediation.md`).
Not re-counted as a new finding; noted for completeness. The token is
unguessable and the link host is cosmetic for the recipient, so impact is low.

## SEC-C2-3 (info) — `SMTP_SKIP_TLS_VERIFY` is a truthiness flag — Low / High
`src/lib/email/providers/smtp.ts:89` `rejectUnauthorized:
!process.env.SMTP_SKIP_TLS_VERIFY`. ANY non-empty value (including `"false"`)
disables cert verification — a footgun inconsistent with line 25's
`SMTP_SECURE === "true"` convention. Informational; suggest `=== "true"` or
documenting it as a presence flag. Net-new but informational (intentional dev
escape hatch).

## Final sweep
- `encrypt`/`decrypt` usage across signup, recruiting, hcaptcha, smtp is
  consistent post-cycle-1 except the audit-redaction gap above (SEC-C2-1).
- No new injection sinks: `templates.ts` escaping present; recruiting/bulk
  routes use parameterized drizzle + `pg_advisory_xact_lock` correctly.
- No new secrets committed to the repo.

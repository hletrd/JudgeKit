# Code-Reviewer — Cycle 2 (2026-05-29)

Scope: code quality / logic / maintainability over the cycle-1-touched surface.
Only issues NOT already recorded in cycle-1.

## CR-C2-1 — `hashConfig` still embeds the cleartext SMTP password (cycle-1 F7, OPEN) — Low / High (DUP)
`src/lib/email/providers/smtp.ts:11-13,108` — `hashConfig` is `JSON.stringify`
of the full config including the decrypted `pass`, and the result is held for the
process lifetime in `lastConfigHash`. Already recorded as cycle-1 F7 (OPEN in
the cycle-1 plan). Not re-counted. Restating because the same code is also the
transporter-cache key for the retry path (lines 145-155) and any future fix must
preserve cache-invalidation-on-config-change semantics.

## CR-C2-2 — Audit-redaction allowlist should be a shared constant — Low / Medium
`src/lib/actions/system-settings.ts:222`. The inline `key === "hcaptchaSecret"`
redaction is brittle: every new secret column must remember to extend this
literal (it already failed to — see SEC-C2-1 for `smtpPass`). FIX: hoist a
`const SECRET_SETTING_KEYS = new Set([...])` near `CONFIG_KEYS` (top of file) and
use it both for redaction and as the single source of truth, so adding a secret
column forces a conscious decision. Net-new (maintainability root-cause of
SEC-C2-1).

## CR-C2-3 — Duplicated base-URL construction (cycle-1 F4, OPEN) — Low / Medium (DUP)
`public-signup.ts:192-195` and `recruiting-invitations/route.ts:122-124` are
copy-pasted `proto`/`host`/`baseUrl` blocks. Already cycle-1 F4. Not re-counted;
the suggested `getPublicBaseUrl(headers)` helper (cycle-1) would also be the
natural home to stop trusting the Host header.

## CR-C2-4 — Bulk vs single recruiting feature divergence — Low / High
See debugger DBG-C2-2: the two sibling routes implement the same feature with
different behavior (single auto-emails, bulk does not). From a code-org angle
the email-send block should be a shared helper (`sendRecruitingInvitationEmail`)
called by both routes, eliminating the divergence by construction. Net-new.

## Final sweep
- `system-settings.ts` correctly uses `hasOwnInput()` (own-property) to
  distinguish "absent" from "null", and `encrypt()` only when a value is
  present — write logic is sound.
- `templates.ts` `escapeHtml` ordering (& first) is correct.
- No dead imports remain (cycle-1 F2 fixed in b1d408ba); lint is clean.

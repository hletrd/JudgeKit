# Document Specialist — Doc/Code Consistency — Cycle 1 (2026-05-29)

## Findings

### DOC-C1-1 — encryption.ts docstring vs. SMTP usage mismatch [Low / Medium confidence]
`src/lib/security/encryption.ts:84-94` documents that callers reading
mixed encrypted/plaintext columns during migration "should pass
`{ allowPlaintextFallback: true }` explicitly." `hcaptcha.ts` follows this guidance;
`smtp.ts:47` does not, despite reading the same class of migratable secret column.
The code contradicts its own documented usage contract. Resolving SEC-C1-1 also
resolves this doc mismatch.

## Confirmed-consistent
- i18n: `messages/en.json` and `messages/ko.json` both define the full `smtp*` key set
  (lines 1341-1348) with matching shape. No missing-key drift between locales.
- The `smtpSecureLabel` UI string ("port 465 / STARTTLS auto-negotiated") matches the
  authoritative code comment in `smtp.ts:66-70`. Consistent.
- Korean SMTP strings use browser/font-default spacing (no custom letter-spacing),
  complying with the CLAUDE.md Korean typography rule.
- `smtpHint` correctly states the password is stored encrypted, which matches
  `encrypt(smtpPass)` at system-settings.ts:174.
- `docs/judge-workers.md` crun additions (recent commits) reviewed — consistent with
  `scripts/install-crun-runtime.sh`; no doc/code drift found.

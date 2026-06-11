# Document-Specialist — Cycle 2 (2026-05-29)

Doc/code-mismatch sweep over the cycle-1 surface, net-new only.

## DOC-C2-1 — `.env.example` SMTP/STARTTLS documentation vs code — Low / Medium
Verify `.env.example` / `.env.production.example` document `SMTP_SKIP_TLS_VERIFY`
as a *presence* flag (any non-empty value disables verification; see SEC-C2-3),
not a `true/false` flag — otherwise an operator setting `SMTP_SKIP_TLS_VERIFY=false`
would unexpectedly DISABLE verification. If the example files imply boolean
semantics, either fix the code to `=== "true"` or fix the doc. Action: grep the
env example files for `SMTP_SKIP_TLS_VERIFY` and reconcile. Net-new (low).

## DOC-C2-2 — Recruiting bulk-import email behavior undocumented — Low / Medium
Backs DBG-C2-2. If the decision is "bulk import does not send emails", that
divergence from single-create must be documented (admin UI helper text and/or
`docs/`), since it is non-obvious and silent. If the decision is "bulk should
send", this becomes a code fix instead. Net-new.

## Final sweep
- `smtp.ts` STARTTLS comment (lines 73-77) accurately describes nodemailer
  `secure:false` auto-upgrade behavior — code matches comment. No mismatch.
- Cycle-1 plan/aggregate docs are internally consistent with the implemented
  commits (F1–F12 mapped to 845162a2 / b1d408ba / 5ef18a36). No drift.

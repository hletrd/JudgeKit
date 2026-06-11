# Critic — Multi-Perspective Critique — Cycle 1 (2026-05-29)

The latest commit (6e1ea706) advertises "escape HTML in templates + add SMTP
retry/timeout + STARTTLS hint". The escaping and retry work is solid. Critique of
what the change set left incomplete:

1. Asymmetry with the sibling secret reader. The same commit family added SMTP secret
   storage mirroring hCaptcha, but the READ path diverged: hcaptcha.ts decrypts with
   `allowPlaintextFallback: true`, smtp.ts decrypts with the strict default. Either both
   should be strict (and a migration must guarantee no plaintext) or both lenient. The
   current split is the worst of both: strict where it most easily breaks (email infra)
   and lenient where the same risk exists (captcha). → SEC-C1-1.

2. Security logic shipped without a regression test. `escapeHtml` is a security control;
   shipping it with zero unit coverage means the next refactor can silently regress it.
   → TE-C1-1.

3. Copy-pasted, header-trusting base-URL construction. The auto-send feature was added
   in two places with identical, header-trusting URL logic rather than a shared helper.
   → CR-C1-2 / ARCH-C1-1.

4. Lint warning shipped. The repo's only lint warning (dead `canManageContest` import)
   should have been caught by the gate before merge. → CR-C1-1.

Net: the change is a net security improvement, but it under-tests its own security
control and introduces a robustness regression (strict decrypt on the email hot path).
None of these are release-blocking, but SEC-C1-1 should be fixed promptly because it can
silently disable all email in a legacy-data production environment.

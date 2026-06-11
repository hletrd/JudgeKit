# Critic — Cycle 2 (2026-05-29)

Multi-perspective critique of the cycle-1 change surface, net-new only.

1. **Secret-redaction allowlist is a foot-gun pattern** (SEC-C2-1 / CR-C2-2).
   The strongest net-new signal this cycle. A per-key string literal
   (`key === "hcaptchaSecret"`) is exactly the kind of allowlist that silently
   fails to cover the next secret — and it already did, for `smtpPass`, added in
   the very next feature. Cross-agent agreement: security, code-reviewer,
   test-engineer all flag the same root cause. Fix the data, then fix the shape
   (shared `SECRET_SETTING_KEYS` set).

2. **Defense added in `detectProvider` but not in the parallel `sendEmail`
   re-check** (DBG-C2-1). Cycle-1 hardened one of two structurally-identical
   `isConfigured()` call sites. Half-fixes that leave a symmetric sibling
   unguarded are a recurring smell; the try/catch belongs on both.

3. **Two routes, one feature, two behaviors** (DBG-C2-2 / CR-C2-4). The
   single-create recruiting route auto-emails; the bulk route doesn't. This is a
   product-correctness gap dressed as "different endpoints". The honest fix is a
   shared `sendRecruitingInvitationEmail` helper so the behavior cannot diverge.

4. **Silent empty catch** (DBG-C2-3) — minor, but the asymmetry with the
   documented sibling catch in `public-signup.ts` shows the empty catch was
   copy-edited without carrying the rationale.

No High/Critical net-new. No data-loss. The cycle-1 fixes themselves are sound;
this cycle's findings are the second-order gaps those fixes left behind.

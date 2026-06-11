# Designer (UI/UX + a11y) — Cycle 9 (RPF)

**Date:** 2026-05-29 · **HEAD:** 24939e42 (main)

## Scope
Net-new UI this cycle: the SMTP configuration block in the admin system-settings
form (commit 871e3583) and the verify-email page. Reviewed at the code/markup +
accessibility-contract level. A full live-browser pass via agent-browser is not
run because the app requires a running Next.js dev server + provisioned Postgres;
prior cycles documented live-browser a11y as a provisioned-host task. The markup
contract is reviewed statically here.

## SMTP settings form (`admin/settings/system-settings-form.tsx`)
- **Label association**: every SMTP `Input` has a matching `<Label htmlFor>` ↔ `id`
  (smtp-host/port/user/pass/from). WCAG 2.2 1.3.1 / 4.1.2 satisfied.
- **Password field**: `type="password"` with masked `••••••••` placeholder; the
  state is seeded with `initialSmtpPassMasked` and only re-submitted when changed
  (`smtpPass !== initialSmtpPassMasked`) — avoids resubmitting the mask. Good UX +
  avoids leaking the real secret to the client.
- **Secure toggle**: labeled `Checkbox` (`smtp-secure`) with adjacent text via the
  i18n key `smtpSecureLabel`. Keyboard-operable (shadcn/radix checkbox).
- **i18n**: all field labels use `t(...)` keys — no hardcoded strings, so the
  Korean-letter-spacing rule is not violated (no custom tracking applied).

## verify-email page
116 lines; status-driven (verifying / success / error) — standard
loading/success/error states present. No custom `letter-spacing`/`tracking-*`
applied to any Korean content (grep clean).

## Carried deferred UI items (re-defer, preconditions unchanged)
C1-AGG-3 (client console.error count observability), C2-AGG-5 (visibility-aware
polling hook — 7th-instance trigger unmet), C2-AGG-6 (practice filter).

## Verdict
No net-new UI/UX or a11y finding. New SMTP form follows the established
accessible-form pattern.

# Verifier — Cycle 2 (2026-05-29)

Evidence-based correctness check. Each claim verified against code, not comments.

## Verified true
- VER-C2-1: `system-settings.ts:222` redacts ONLY `hcaptchaSecret`; `smtpPass`
  is written through (set encrypted on line 174, not in the redaction map).
  `grep` of all reviews/plans confirms no prior finding covers this — net-new.
  Sink confirmed persisted: `audit/events.ts:191 db.insert(auditEvents)`.
  → SEC-C2-1 CONFIRMED.
- VER-C2-2: `sendEmail` (providers/index.ts:43) calls
  `activeProvider.isConfigured()` outside the `detectProvider` try/catch.
  Re-read lines 42-52 directly; the guard is only in `detectProvider` (lines
  23-32). → DBG-C2-1 CONFIRMED (Low: common plaintext path fixed by 845162a2).
- VER-C2-3: `recruiting-invitations/bulk/route.ts` has NO `sendEmail` /
  `renderRecruitingInvitationEmail` import or call; single-create route lines
  118-140 does. → DBG-C2-2 CONFIRMED. Also confirms cycle-1 F10 (bulk concurrent
  send) is moot.
- VER-C2-4: recruiting route line 139 is `.catch(() => {});` with no log; the
  `public-signup.ts` sibling (196-198) carries a "logged inside" comment.
  → DBG-C2-3 CONFIRMED.

## Verified NOT an issue / already handled
- The recruiting route's `@/lib/email/smtp` import resolves
  (`src/lib/email/smtp.ts` re-exports `sendEmail`, `isEmailConfigured` from
  `./providers`). No broken module.
- `templates.ts` escaping present on all HTML interpolations
  (candidateName/title/url/details). F3 closed.
- Gates green at baseline: lint 0, tsc 0, unit 2434/2434, bash 0.

## Needs manual validation
- None this cycle. All four net-new findings are code-confirmed.

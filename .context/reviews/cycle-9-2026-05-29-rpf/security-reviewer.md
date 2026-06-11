# Security Reviewer — Cycle 9 (RPF)

**Date:** 2026-05-29
**HEAD:** 24939e42 (main)
**Scope:** Email subsystem (freshest net-new code since cycle-8 review baseline:
commits 6e1ea706 HTML escape + SMTP retry, efbd9e2e auto-send verification +
recruiting invite, 871e3583 SMTP settings UI). Cross-checked against OWASP
injection + the leaderboard ranking fix from cycle-8.

## Files examined
- `src/lib/email/templates.ts` (subject + HTML/text rendering, escapeHtml)
- `src/lib/email/providers/{smtp,resend,sendgrid,ses}.ts`
- `src/lib/email/index.ts` (sendEmailVerification, notifySiteEvent, verifyEmail)
- `src/lib/actions/public-signup.ts` (auto-send verification dispatch)
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts`
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts`
- `node_modules/nodemailer/lib/mime-node/index.js` (header encoding behavior)

## Investigated hypothesis: email-subject CRLF / header injection — FALSE POSITIVE (verified)
**Hypothesis:** `renderRecruitingInvitationEmail` (templates.ts:59) and
`renderSiteEventEmail` (templates.ts:75) interpolate attacker-/operator-influenced
data (`data.assessmentTitle` = `assignment.title`; `data.title`) into the email
**subject** WITHOUT the `escapeHtml()` applied to the HTML body. If the subject
reached an SMTP header verbatim, a CRLF in the title could inject extra headers
(Bcc/header-split). The recruiting invitation title is instructor-controlled
(`recruiting-invitations/route.ts:134`).

**Verification (decisive, evidence-backed):**
- **SMTP path:** nodemailer 7.0.13. `Subject` is NOT a structured/address header,
  so it falls into the `default` case of `_encodeHeaderValue`
  (`mime-node/index.js:1151-1154`): `value = value.toString().replace(/\r?\n|\r/g, ' ')`
  then `_encodeWords`. **All CR/LF are stripped to spaces before the header is
  emitted.** Header injection via subject is not possible through nodemailer.
- **HTTP-API providers (resend/sendgrid/ses):** each passes `subject` as a JSON
  body field (`resend.ts:29`, `sendgrid.ts:29`, `ses.ts:31`), never as a raw
  header. JSON encoding neutralizes structural injection in transit; the
  provider builds and sanitizes headers server-side.

**Conclusion:** No header-injection vector exists in any of the four providers.
NOT a finding. (Recorded so a future reviewer does not re-flag it.)

## Observation (cosmetic, NOT a finding)
The two subjects above are not HTML-escaped while their HTML bodies are. This is
a stylistic inconsistency only — the subject is plaintext (no HTML context) and
the transport strips CR/LF, so there is no XSS or injection surface. Escaping the
subject would have no security effect (an email client renders the subject as
text, and `&amp;`-style entities would actually look *worse*). No action.

## Confirmed-sound items
- **verifyEmail TOCTOU** (`index.ts:285-326`): token read inside the transaction;
  conditional `UPDATE ... WHERE verifiedAt IS NULL` with `rowCount` check
  serializes concurrent redemptions under READ COMMITTED. Token stored as SHA-256
  hash only. Sound.
- **sendEmailVerification** (`index.ts:244-256`): atomic delete+insert of the
  token in one transaction — an insert failure never leaves the user token-less.
- **public-signup auto-send** (`public-signup.ts:193-209`): fire-and-forget with
  `.catch()` (no unhandled rejection); signup still succeeds on send failure;
  base URL is canonical-first (does not trust client Host). Sound.
- **SMTP plaintext-fallback decrypt** (`providers/smtp.ts:54`): mirrors the
  hcaptcha sibling reader; prevents a legacy plaintext `smtpPass` from throwing
  and silently disabling ALL transactional email. Production warn-log preserved.
- **SMTP_SKIP_TLS_VERIFY** (`providers/smtp.ts:92`): strict `!== "true"` so
  `rejectUnauthorized` defaults to true and only an explicit opt-in disables it.
- **overrides route** (`overrides/route.ts`): authz (canManageGroupResourcesAsync)
  → validation (Zod, max-points clamp, enrollment check) → transactional upsert
  → cache invalidation → audit. Sound.

## Verdict
No net-new security finding this cycle. Carried deferred security-adjacent items
(AGG-7 encryption plaintext fallback — documented; F3/F4 worker trust) unchanged.

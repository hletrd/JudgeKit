# Tracer — Cycle 9 (RPF)

**Date:** 2026-05-29 · **HEAD:** 24939e42 (main)

## Causal trace: "could an attacker-controlled assessment title corrupt an email?"
Competing hypotheses for the recruiting-invitation subject
(`templates.ts:59` = raw `data.assessmentTitle`):
- H1 (header injection): title with `\r\nBcc: x@evil` splits headers.
- H2 (neutralized in transport): the library sanitizes before emitting headers.

Trace `assignment.title` → `renderRecruitingInvitationEmail.assessmentTitle`
(`recruiting-invitations/route.ts:134`) → `template.subject` → `sendEmail({subject})`
→ provider `.send`:
- SMTP: `transporter.sendMail({subject})` → nodemailer mime-node
  `_encodeHeaderValue('Subject', value)` → `default` branch
  (`mime-node/index.js:1152`): `value.replace(/\r?\n|\r/g, ' ')`. **H2 confirmed,
  H1 refuted.** CR/LF gone before the header line is built.
- Resend/SendGrid/SES: subject is a JSON field, not a header. H1 refuted.

Conclusion: no causal path from a malicious title to a corrupted email header.
The earlier-cycle HTML-escape fix (6e1ea706) already closed the only real
(body-XSS) path. No finding.

## Causal trace: live-rank vs full-board divergence (cycle-8 fix)
Followed both query plans to the shared `buildIoiLatePenaltyCaseExpr`. The two
aggregation shapes now match (MAX per user+problem → SUM per user). The only
remaining intentional divergence is the score_overrides overlay (documented
deferred). No unexplained divergence.

## Verdict
No net-new finding.

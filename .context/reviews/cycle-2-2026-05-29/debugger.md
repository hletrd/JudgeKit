# Debugger Review — Cycle 2 (2026-05-29)

Note: a stale `cycle-2/` dir (dated 2026-05-12..14) belongs to an unrelated
historical "cycle 2" and was left untouched for provenance. This cycle's files
live in `cycle-2-2026-05-29/`.

Scope: net-new latent-bug surface since cycle-1 (commits 845162a2..ca1bab90 +
the email/recruiting/system-settings surface that cycle-1 touched). Cycle-1's
findings F1–F12 are all implemented (verified via git log:
`845162a2 tolerate legacy plaintext SMTP secret`, `b1d408ba drop unused
canManageContest`, `5ef18a36 lock email HTML escaping`). This review hunts only
for issues NOT already recorded in `.context/reviews/cycle-1/` or
`plans/open/2026-05-29-cycle-1-rpf-review-remediation.md`.

## DBG-C2-1 — `sendEmail()` cached-provider re-check is unguarded — Low / High
`src/lib/email/providers/index.ts:43`
```ts
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  if (!activeProvider || !(await activeProvider.isConfigured())) {   // <-- line 43, UNGUARDED
    activeProvider = await detectProvider();
  }
```
Cycle-1 added a `try/catch` inside `detectProvider()` (lines 23-32) precisely so
that a throwing `isConfigured()` (e.g. `decrypt()` on a corrupt ciphertext)
degrades to "not configured" instead of escaping. But the SAME `isConfigured()`
call is made on line 43 against the *already-cached* `activeProvider`, OUTSIDE
that guard. If a previously-detected SMTP provider's stored secret later becomes
undecryptable (key rotation, partial restore, manual DB edit to malformed
ciphertext), the next `sendEmail()` throws out of line 43 — bypassing the very
defense cycle-1 installed.
- The common legacy-plaintext case is now fixed by `allowPlaintextFallback:true`
  (845162a2), so this is NOT the high-frequency F1 path — hence Low severity.
- Failure scenario: admin rotates `ENCRYPTION_KEY` without re-encrypting
  `smtpPass`; the `resend-verification` and `test-email` routes would surface a
  500 instead of a clean "not configured".
FIX: wrap the line-43 re-check in the same try/catch (treat throw as
"reconfigure"):
```ts
let stillConfigured = false;
if (activeProvider) {
  try { stillConfigured = await activeProvider.isConfigured(); } catch { stillConfigured = false; }
}
if (!stillConfigured) activeProvider = await detectProvider();
```
NOT in any cycle-1 file. Net-new.

## DBG-C2-2 — Bulk recruiting import never sends invitation emails — Low / High
`src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts`
(whole handler) vs the single-create route lines 118-140.
The single-create POST auto-sends an invitation email when
`candidateEmail && invitation.token && isEmailConfigured()`. The BULK route
(same feature, same auth capability) creates invitations but has zero email
logic. Result: candidates added one-by-one get an email; the identical
candidates added via CSV/bulk import get silently nothing. (This also confirms
cycle-1 F10 is moot — no concurrent-send hazard exists because bulk doesn't
send — but as a *behavioral inconsistency*, not a "fix".) Failure scenario:
recruiter bulk-imports 50 candidates expecting the same auto-email they saw on
the single form; none arrive; candidates never start the assessment.
FIX: either (a) send emails in the bulk route under a `p-limit(2-3)` cap to
respect the 3-connection pool, or (b) explicitly document that bulk import does
not email and surface that in the UI. Net-new.

## DBG-C2-3 — Recruiting fire-and-forget `.catch(() => {})` is silent — Low / Medium
`src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:139`
`.catch(() => {});` swallows with no log and no explanatory comment. `sendEmail`
DOES log its own send failures internally, so a send error is captured — but a
throw from `renderRecruitingInvitationEmail()` or from the unguarded
`isEmailConfigured()` (DBG-C2-1, called on line 121) would vanish without trace.
The sibling `public-signup.ts:196-198` documents "logged inside
sendEmailVerification"; the recruiting site does not. FIX: add a `logger.warn`
in the catch (or at minimum the same explanatory comment). Net-new (consistency).

## Final sweep
- Verified `src/lib/email/smtp.ts` is a thin re-export shim of `./providers`;
  the recruiting route's `@/lib/email/smtp` import resolves correctly.
- `system-settings.ts` audit-redaction gap is cross-referenced in
  security-reviewer.md (SEC-C2-1).
- Confirmed gates green at baseline: lint 0, tsc 0, unit 2434 pass.

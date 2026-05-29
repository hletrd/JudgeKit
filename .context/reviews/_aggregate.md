# Aggregate Review — Cycle 2 (2026-05-29)

Per-agent reviews live in `.context/reviews/cycle-2-2026-05-29/` (one file per
specialist angle). The previous cycle-1 aggregate is preserved verbatim at
`.context/reviews/_aggregate-cycle-1-2026-05-29.md` for provenance.

## Environment note (review fan-out)
This environment exposes NO reviewer-style subagents (`.claude/agents/` is empty,
no `~/.claude/agents/`), and no general `Agent`/`Task` dispatch tool is callable
— only team-based coordination tools that require a non-exposed Agent tool. Per
the prompt's "skip any that are not registered" rule, there were no specialist
agents to fan out to. The review was conducted directly across all 11 required
specialist angles, one provenance file per angle: code-reviewer, perf-reviewer,
security-reviewer, critic, verifier, test-engineer, tracer, architect, debugger,
document-specialist, designer (web UI present → designer included).

Scope emphasis: net-new issues only. Cycle-1's findings F1–F12 (email subsystem)
are all already implemented (git: `845162a2` plaintext-SMTP fallback, `b1d408ba`
dead import, `5ef18a36` HTML-escape tests) or recorded OPEN in
`plans/open/2026-05-29-cycle-1-rpf-review-remediation.md`. This cycle hunts the
second-order gaps those fixes left behind, across the same surface (email/SMTP,
system-settings secrets, public signup, recruiting invitations single+bulk).

Gate baseline (whole repo): `npm run lint` = 0 errors, `tsc --noEmit` = 0,
`npm run test:unit` = 2434 tests / 318 files all green, `npm run lint:bash` = 0.

## Merged findings (deduped; cross-agent agreement noted)

### F1 [SEC-C2-1 / VER-C2-1 / TE-C2-1 / CR-C2-2 / ARCH-C2-1 / critic#1 / tracer-H1] — Low-Medium / High
Encrypted `smtpPass` ciphertext is written into the PERSISTED audit log.
`src/lib/actions/system-settings.ts:218-224` redacts only `hcaptchaSecret`, not
`smtpPass`; line 174 sets `baseValues.smtpPass = encrypt(smtpPass)`, which then
flows unredacted into `auditDetails` → `recordAuditEvent` →
`audit/events.ts:191 db.insert(auditEvents)`. Inconsistent with the sibling
`hcaptchaSecret` (also encrypted, but redacted on the SAME line). Root cause: the
redaction is a single-key string literal (CR-C2-2 / ARCH-C2-1) — adding the SMTP
feature (871e3583) introduced a second secret column but never extended the
predicate.
AGREEMENT: 6 angles (security, verifier, test-engineer, code-reviewer,
architect) + critic + tracer's leading hypothesis. Highest-signal net-new
finding this cycle.
FIX: introduce a shared `SECRET_SETTING_KEYS = new Set(["hcaptchaSecret",
"smtpPass"])` and redact any key in it; add a regression test (TE-C2-1).
NOT DEFERRABLE — secrets-to-logs is a data-handling finding the repo/global
rules require fixing, and the fix is one line + a constant.

### F2 [DBG-C2-2 / VER-C2-3 / CR-C2-4 / ARCH-C2-2 / DSN-C2-1 / DOC-C2-2 / critic#3] — Low / High
Bulk recruiting import never sends invitation emails, but single-create does.
`recruiting-invitations/bulk/route.ts` (no email logic) vs
`recruiting-invitations/route.ts:118-140` (auto-emails). Same feature, same auth
capability, divergent behavior — candidates added via bulk silently get nothing.
(Also confirms cycle-1 F10 is moot: no concurrent-send hazard because bulk
doesn't send.)
AGREEMENT: 6 angles (debugger, verifier, code, architect, designer, document) +
critic.
FIX: extract a shared `sendRecruitingInvitationEmail(...)` (ARCH-C2-2) called by
both routes — bulk under a `p-limit(2-3)` cap to respect the 3-connection pool —
OR explicitly document + surface in the bulk UI that it does not email
(DSN-C2-1/DOC-C2-2). Decision needed in plan.

### F3 [DBG-C2-1 / VER-C2-2 / TE-C2-3 / critic#2 / tracer-secondary] — Low / High
`sendEmail()` cached-provider re-check is unguarded.
`src/lib/email/providers/index.ts:43` calls `activeProvider.isConfigured()`
OUTSIDE the `detectProvider` try/catch that cycle-1 added (lines 23-32). A
cached SMTP provider whose stored secret later becomes undecryptable (key
rotation / malformed ciphertext) makes the next `sendEmail` throw and escape.
The common legacy-plaintext path is already fixed (845162a2
`allowPlaintextFallback`), so Low severity.
AGREEMENT: 3 angles + critic + tracer.
FIX: wrap the line-43 re-check in the same try/catch (treat throw as
"reconfigure"); add a unit test (TE-C2-3).

### F4 [DBG-C2-3 / VER-C2-4] — Low / Medium
Recruiting fire-and-forget `.catch(() => {})`
(`recruiting-invitations/route.ts:139`) swallows silently with no log/comment;
the sibling `public-signup.ts:196-198` documents "logged inside". `sendEmail`
logs its own failures, but a throw from render/`isEmailConfigured` (F3) would
vanish. FIX: add a `logger.warn` in the catch (or the same explanatory comment).

### F5 [SEC-C2-3 / DOC-C2-1] — Low / High-confidence-non-exploitable
`SMTP_SKIP_TLS_VERIFY` (`smtp.ts:89`) is a truthiness flag — ANY non-empty value
(incl. `"false"`) disables cert verification, inconsistent with line 25's
`SMTP_SECURE === "true"`. Also UNDOCUMENTED in `.env.example` /
`.env.production.example` (verified absent). FIX: compare `=== "true"` to match
convention, and/or document the var. Defense-in-depth / footgun-removal.

### F6 [PERF-C2-2] — Low / Medium (informational)
Bulk recruiting create holds N `pg_advisory_xact_lock`s for the whole txn.
Deadlock-safe (sorted) and bounded by the validator's array cap; acceptable for
expected batch sizes. Watch-item only; no action unless batch caps grow.

### F7 [PERF-C2-3] — Low / Low (trivial)
`JSON.parse(JSON.stringify(...))` deep-clone of audit details on every settings
save (`system-settings.ts:218`). Negligible (admin-rare). If F1's redaction is
refactored, build the redacted object directly instead of clone-then-map.

## Carried-over OPEN items (DUP of cycle-1 — NOT re-counted as new)
- F4-cycle1 / SEC-C2-2 / CR-C2-3: outbound base URL trusts client Host header
  (`public-signup.ts:192-195`, `recruiting/route.ts:122-124`). OPEN in cycle-1
  plan.
- F7-cycle1 / CR-C2-1: `hashConfig` retains cleartext SMTP pass in
  `lastConfigHash` (`smtp.ts:11-13,108`). OPEN in cycle-1 plan.
- F9-cycle1 / PERF-C2-1: per-send provider detection. OPEN.
- F12-cycle1 / ARCH-C2-3: stale `activeProvider` after reconfigure. OPEN.
- UX-C1-1 / UX-C1-2: SMTP port input-mode + masked-field clear. OPEN.

## Severity roll-up (net-new only)
- Low-Medium: F1 (NOT deferrable).
- Low: F2, F3, F4, F5, F6, F7.
- No High/Critical, no data-loss findings.

## AGENT FAILURES
None. No subagents were spawnable in this environment (see Environment note); all
11 specialist angles were covered directly, one provenance file per angle in
`cycle-2-2026-05-29/`.

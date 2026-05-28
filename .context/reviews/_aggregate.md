# Aggregate Review — Cycle 1 (2026-05-29)

Per-agent reviews live in `.context/reviews/cycle-1/` (one file per specialist angle).

## Environment note (review fan-out)
This environment exposes NO reviewer-style subagents (`.claude/agents/` is empty, no
`~/.claude/agents/`), and no general `Agent`/`Task` dispatch tool is callable — only
team-based coordination tools that require a non-exposed Agent tool. Per the prompt's
"skip any that are not registered" rule, there were no specialist agents to fan out to.
The review was therefore conducted directly across all 11 required specialist angles,
one provenance file per angle: code-reviewer, perf-reviewer, security-reviewer, critic,
verifier, test-engineer, tracer, architect, debugger, document-specialist, designer
(SMTP UI; a prior menu/IA `designer.md` was preserved untouched as `designer-smtp-ui.md`
holds this cycle's UI review).

Scope emphasis: the recently-changed surface (commits up to 6e1ea706) — email subsystem
(SMTP transport/templates), public signup auto-verify, recruiting invitations, system
settings / SMTP secrets — plus cross-file interactions and the repo's gate state.

## Merged findings (deduped; cross-agent agreement noted)

### F1 [SEC-C1-1 / DBG-C1-1 / VER-C1-1 / DOC-C1-1 / critic#1 / tracer-H3] — Medium / High
SMTP secret decrypt omits `allowPlaintextFallback`, will THROW in production on a legacy
plaintext `smtpPass`, breaking ALL transactional email (and 500-ing the recruiting POST
guard). `src/lib/email/providers/smtp.ts:47`. Inconsistent with the sibling
`src/lib/security/hcaptcha.ts:23` (which passes `{ allowPlaintextFallback: true }`) and
contradicts the documented usage contract in `encryption.ts:84-94`.
AGREEMENT: 5 angles (security, debugger, verifier, document, critic) + tracer's leading
hypothesis. Highest-signal finding this cycle.
FIX: `decrypt(raw.smtpPass as string, { allowPlaintextFallback: true })`. Optionally wrap
`detectProvider`'s `isConfigured()` call in try/catch so a throwing provider degrades to
"not configured" rather than escaping (defense-in-depth, DBG-C1-1).
NOT DEFERRABLE (correctness/robustness on a prod path).

### F2 [CR-C1-1 / VER-C1-4 / critic#4] — Low / High
Dead import `canManageContest` — the repo's only lint warning.
`src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:12`.
FIX: remove `canManageContest` from the import list. This is also the GATE warning to
fix this cycle.

### F3 [TE-C1-1 / critic#2] — Medium / High
No unit tests for `src/lib/email/templates.ts` `escapeHtml` (a security control shipped
in 6e1ea706 with zero coverage). A future refactor could silently re-introduce email
HTML injection.
FIX: add `tests/unit/email/templates.test.ts` asserting HTML escaping of
candidateName/assessmentTitle/title/details in `html`, raw values in `text`, and the
recruiting expiry-branch formatting.

### F4 [CR-C1-2 / ARCH-C1-1 / tracer] — Low / Medium
Outbound-email base URL is built from request `Host`/`X-Forwarded-Proto` in two
copy-pasted sites (`public-signup.ts:192-195`, recruiting `route.ts:122-124`), trusting
client-influenced headers and duplicating logic.
AGREEMENT: 2 angles (code, architect) + tracer.
FIX: centralize as `getPublicBaseUrl(headers)` in `src/lib/security/env.ts`, preferring
the configured canonical URL; use in both sites.

### F5 [TE-C1-2] — Low / Medium
No tests for the SMTP provider retry loop / config-decrypt precedence in
`src/lib/email/providers/smtp.ts`. (Add alongside the F1 fix to lock the fallback.)

### F6 [TE-C1-3] — Low / Medium
`tests/unit/actions/public-signup.test.ts` mocks `sendEmailVerification` as
always-resolving and never asserts: (a) signup still succeeds when the send rejects,
(b) verification is invoked only when `email && createdUserId`.

### F7 [CR-C1-3] — Low / High
`hashConfig` (`smtp.ts:11-13,101`) retains the decrypted SMTP password in cleartext in
the process-lifetime `lastConfigHash` string and is misnamed (not hashed). Never logged,
so low risk. FIX: sha256 the serialized config or key the transporter cache on
non-secret fields + a hash of the pass.

### F8 [SEC-C1-2] — Low / Medium-confidence-non-exploitable
Email subjects interpolate unescaped values (`templates.ts:59,75`). Subjects are not
HTML (no XSS); residual risk is CR/LF header injection, which nodemailer sanitizes and
the source values are validated. Defense-in-depth: strip CR/LF before placing in a
subject.

### F9 [PERF-C1-1] — Low / Medium
`isEmailConfigured()` + `sendEmail()` re-run provider detection (settings read + decrypt)
per send; the recruiting route adds a redundant `isEmailConfigured()` before send.
FIX: cache resolved SMTP config keyed on settings-cache version, or drop the redundant
guard.

### F10 [PERF-C1-2] — Low / Low (needs manual validation)
Confirm the bulk recruiting-invitation route uses `p-limit` rather than firing N
concurrent sends against a 3-connection pool. Not confirmed as a defect.

### F11 [UX-C1-1 / UX-C1-2] — Low
SMTP port field is free-text (no `inputMode="numeric"`); masked-password field can be
accidentally cleared. Minor admin-UX polish.

### F12 [DBG-C1-2] — Low / Low
`getActiveProviderName()` can report a stale provider after a config switch. Observability
-only.

## Severity roll-up
- Medium: F1, F3.  (F1 not deferrable.)
- Low: F2 (gate warning — fix this cycle), F4, F5, F6, F7, F8, F9, F10, F11, F12.
- No High/Critical, no data-loss findings.

## AGENT FAILURES
None. (No subagents were spawnable in this environment; see Environment note. All 11
specialist angles were covered directly and a per-angle file written.)

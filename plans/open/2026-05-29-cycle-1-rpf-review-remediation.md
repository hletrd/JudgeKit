# Cycle 1 RPF Review Remediation Plan

**Date:** 2026-05-29
**Cycle:** 1/100 of this RPF loop (orchestrator-numbered)
**Aggregate:** `.context/reviews/_aggregate.md`
**Per-agent reviews:** `.context/reviews/cycle-1/{code-reviewer,perf-reviewer,security-reviewer,critic,verifier,test-engineer,tracer,architect,debugger,document-specialist,designer-smtp-ui}.md`

---

## Summary

Cycle 1 starts from a near-green baseline: `npm run lint` passes with **0 errors, 1
warning** (dead `canManageContest` import). The review focused on the recently-changed
email/SMTP/signup/recruiting surface. No CRITICAL/HIGH findings. Two MEDIUM findings
(F1 robustness, F3 test gap) plus the gate warning (F2) are the actionable, low-risk
work this cycle.

Scheduled for implementation:
1. **F1 — SMTP decrypt plaintext fallback** (Medium): make `smtp.ts` decrypt match
   `hcaptcha.ts` so a legacy plaintext `smtpPass` cannot throw and disable all email in
   production. Add defense-in-depth try/catch in `detectProvider`.
2. **F2 — remove dead `canManageContest` import** (gate warning): clears the repo's only
   lint warning.
3. **F3 — email template escaping tests** (Medium): regression-lock `escapeHtml`.
4. **F6 — public-signup auto-verify test** (Low): assert signup succeeds when the
   verification email send rejects, and that it is only invoked with an email.

Deferred (recorded in ledger below): F4, F5, F7, F8, F9, F10, F11, F12.

---

## Implementation tasks

| # | Task | Severity | Status |
|---|---|---|---|
| 1 | In `src/lib/email/providers/smtp.ts:47`, pass `{ allowPlaintextFallback: true }` to `decrypt(raw.smtpPass)` to mirror `hcaptcha.ts:23` and the documented `encryption.ts` contract. | MEDIUM (F1 / SEC-C1-1) | [x] |
| 2 | In `src/lib/email/providers/index.ts` `detectProvider`, wrap `await provider.isConfigured()` in try/catch: a throwing provider logs and is treated as not-configured (defense-in-depth so one bad provider cannot escape `isEmailConfigured()`). | MEDIUM (F1 / DBG-C1-1) | [x] |
| 3 | Remove the unused `canManageContest` from the import on `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:12`. | LOW — GATE WARNING (F2 / CR-C1-1) | [x] |
| 4 | Add `tests/unit/email/templates.test.ts`: assert `<`, `>`, `&`, `"`, `'`, and a `<script>` payload are escaped in the `html` of `renderRecruitingInvitationEmail` (candidateName, assessmentTitle), `renderEmailVerificationEmail`/`renderPasswordResetEmail` (url), and `renderSiteEventEmail` (title/eventType/details); assert `text` output keeps raw values; assert the recruiting expiry-branch (null vs Date) renders/omits the expiry line. | MEDIUM (F3 / TE-C1-1) | [x] |
| 5 | Extend `tests/unit/actions/public-signup.test.ts`: (a) when the mocked `sendEmailVerification` rejects, `registerPublicUser` still returns `{ success: true }`; (b) `sendEmailVerification` is NOT called when `email` is undefined. | LOW (F6 / TE-C1-3) | [x] |
| 6 | Run all gates: `npm run lint`, `tsc --noEmit`, `npm run build`, `npm run test:unit`, `npm run lint:bash`. | — | [x] |
| 7 | Commit + push fine-grained per-topic, GPG-signed, conventional + gitmoji. | — | [x] |
| 8 | Run per-cycle `DEPLOY_CMD`. | — | [ ] |

---

## Quality gates

- [x] `npm run lint` — 0 errors, 0 warnings (the dead-import warning is cleared by task 3)
- [x] `tsc --noEmit` — PASS
- [x] `npm run build` — PASS
- [x] `npm run test:unit` — PASS (318 files, 2434 tests; +6 templates, +2 public-signup)
- [x] `npm run lint:bash` — PASS

---

## Deferred ledger (cycle 1)

Per `plans/open/README.md` and the orchestrator deferred-fix rules, every still-open
finding is either implemented above or recorded here with severity preserved (NOT
downgraded) and a stated exit criterion. No security/correctness/data-loss item is
deferred. F4 and F8 touch security adjacency but are Low/non-exploitable hardening, not
confirmed vulnerabilities — deferred with concrete exit criteria, not silently dropped.

| ID | Severity | Confidence | File | Reason for deferral | Exit criterion |
|---|---|---|---|---|---|
| F4 (CR-C1-2 / ARCH-C1-1) | LOW | MEDIUM | `public-signup.ts:192-195`, recruiting `route.ts:122-124` | Centralizing base-URL derivation into `lib/security/env.ts` is a cross-cutting refactor touching auth-link generation; doing it in the same cycle as the F1 email fix risks coupling unrelated changes. Header trust is mitigated by trusted-proxy Host rewriting in the standard deployment. | Implement when a third email-link call site appears, OR when `lib/security/env.ts` is next touched — add `getPublicBaseUrl(headers)` preferring the configured canonical URL. |
| F5 (TE-C1-2) | LOW | MEDIUM | `src/lib/email/providers/smtp.ts` | SMTP retry-loop/transport tests require mocking nodemailer's pooled transport; lower priority than the template-escaping tests (F3) which lock a security control. | Add alongside any future change to the retry logic or transport config, or in a dedicated email-coverage cycle. |
| F7 (CR-C1-3) | LOW | HIGH | `smtp.ts:11-13,101` | Decrypted password retained in the in-memory `lastConfigHash` string; never logged, low disclosure risk. Reworking the transporter cache key is a non-trivial change with no functional payoff this cycle. | Implement when the transport cache is next touched: sha256 the serialized config or key on non-secret fields + a pass hash. |
| F8 (SEC-C1-2) | LOW | MEDIUM (non-exploitable today) | `templates.ts:59,75` | Subjects are non-HTML; CR/LF header injection is sanitized by nodemailer and source values are validated. No confirmed vulnerability. | Re-open if a subject ever interpolates a value not passing through Zod validation, or add CR/LF stripping when templates.ts is next edited. |
| F9 (PERF-C1-1) | LOW | MEDIUM | `email/providers/index.ts`, recruiting `route.ts:121` | Per-send re-detection cost is bounded by the cached `getSystemSettings`; only the decrypt repeats. Not measurable at current email volumes. | Re-evaluate if bulk-invite volume grows or profiling shows decrypt cost; then cache resolved config keyed on settings-cache version. |
| F10 (PERF-C1-2) | LOW | LOW (needs manual validation) | recruiting `recruiting-invitations/bulk/route.ts` | Not confirmed as a defect; requires reading the bulk route to verify `p-limit` usage. | Confirm next cycle; if N concurrent sends against the 3-connection pool is found, gate with `p-limit`. |
| F11 (UX-C1-1 / UX-C1-2) | LOW | MEDIUM/LOW | `system-settings-form.tsx:358,366` | Admin-only configuration polish (numeric inputmode; masked-password clear affordance). No functional defect; masking round-trip is already correct. | Bundle into the next admin-settings UX pass. |
| F12 (DBG-C1-2) | LOW | LOW | `email/providers/index.ts:14,42-44` | `getActiveProviderName()` staleness is observability-only and only manifests on a live provider switch without the old one becoming unconfigured. | Re-open if a second email provider is actually enabled in production and provider-name reporting matters. |

---

## Progress

- [x] Per-agent reviews written (`.context/reviews/cycle-1/`)
- [x] Aggregate written (`.context/reviews/_aggregate.md`)
- [x] Plan written
- [x] F1 implemented (smtp decrypt fallback + detectProvider guard)
- [x] F2 implemented (dead import removed — gate warning cleared)
- [x] F3 implemented (template escaping tests)
- [x] F6 implemented (public-signup auto-verify tests)
- [x] Gates green (lint 0/0, tsc, build, 2434 unit tests, lint:bash)
- [x] Committed and pushed (fine-grained, GPG-signed)
- [ ] Deployed (per-cycle)

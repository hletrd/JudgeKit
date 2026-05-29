# Cycle 2 RPF Review Remediation Plan

**Date:** 2026-05-29
**Cycle:** 2/100 of this RPF loop (orchestrator-numbered)
**Aggregate:** `.context/reviews/_aggregate.md` (cycle-2)
**Per-agent reviews:** `.context/reviews/cycle-2-2026-05-29/{code-reviewer,perf-reviewer,security-reviewer,critic,verifier,test-engineer,tracer,architect,debugger,document-specialist,designer}.md`
**Prior-cycle aggregate preserved:** `.context/reviews/_aggregate-cycle-1-2026-05-29.md`

---

## Summary

Cycle 2 starts from a fully-green baseline (`npm run lint` 0/0, `tsc --noEmit` 0,
`npm run test:unit` 2434/2434, `npm run lint:bash` 0). Cycle 1's findings F1–F12
are all implemented or deferred-with-ledger; cycle 1's plan is fully done and is
archived in this cycle's housekeeping pass.

This cycle's review found **7 net-new findings**, all Low / Low-Medium, no
High/Critical, no data-loss. The actionable, low-risk work is:

1. **F1 — redact `smtpPass` in the settings audit log** (Low-Medium, NOT
   deferrable): the SMTP password ciphertext is currently persisted to the audit
   table; only `hcaptchaSecret` is redacted. Fix the data + the shape (shared
   secret-key set). Add a regression test.
2. **F3 — guard the cached-provider `isConfigured()` re-check in `sendEmail`**
   (Low): extend cycle-1's `detectProvider` try/catch to the symmetric call site
   on `index.ts:43`. Add a unit test.
3. **F4 — log the recruiting fire-and-forget email failure** (Low): replace the
   silent `.catch(() => {})` with a `logger.warn` + comment, matching the
   `public-signup` sibling.
4. **F5 — `SMTP_SKIP_TLS_VERIFY` truthiness footgun** (Low): compare `=== "true"`
   to match the `SMTP_SECURE` convention; document the var in `.env.example`.

Deferred (recorded in ledger below, severity preserved): **F2** (bulk-recruiting
email divergence — needs a product decision, see ledger), **F6**, **F7**.

---

## Implementation tasks

| # | Task | Severity | Status |
|---|---|---|---|
| 1 | In `src/lib/actions/system-settings.ts`, hoist `const SECRET_SETTING_KEYS = new Set(["hcaptchaSecret", "smtpPass"])` near `CONFIG_KEYS`, and change the audit-redaction map (lines ~222) to redact any key in `SECRET_SETTING_KEYS` (currently only `hcaptchaSecret`). | LOW-MEDIUM (F1 / SEC-C2-1) — NOT DEFERRABLE | [x] |
| 2 | Add a regression test asserting `updateSystemSettings` records `details.smtpPass === "••••••••"` and `details.hcaptchaSecret === "••••••••"` when those fields are submitted (spy on `recordAuditEvent`), and that non-secret fields pass through. | LOW-MEDIUM (F1 / TE-C2-1) | [x] |
| 3 | In `src/lib/email/providers/index.ts` `sendEmail` (line 43), wrap the cached-provider `await activeProvider.isConfigured()` re-check in try/catch so a throw (undecryptable secret) degrades to re-detect instead of escaping — mirroring the `detectProvider` guard cycle-1 added. | LOW (F3 / DBG-C2-1) | [x] |
| 4 | Add a unit test: a stubbed `activeProvider.isConfigured()` that rejects causes `sendEmail` to return `{success:false}` (or re-detect), not reject. | LOW (F3 / TE-C2-3) | [x] |
| 5 | In `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:139`, replace `.catch(() => {})` with `.catch((e) => logger.warn({ err: ... }, "recruiting invitation email dispatch failed"))` (import `logger`), or add the same "logged inside sendEmail" comment as `public-signup.ts:196-198`. | LOW (F4 / DBG-C2-3) | [x] |
| 6 | In `src/lib/email/providers/smtp.ts:89`, change `rejectUnauthorized: !process.env.SMTP_SKIP_TLS_VERIFY` to `rejectUnauthorized: process.env.SMTP_SKIP_TLS_VERIFY !== "true"` (presence→explicit-true), matching line 25's `SMTP_SECURE === "true"`. Document `SMTP_SKIP_TLS_VERIFY` in `.env.example`. | LOW (F5 / SEC-C2-3 / DOC-C2-1) | [x] |
| 7 | Run all gates: `npm run lint`, `tsc --noEmit`, `npm run build`, `npm run test:unit`, `npm run lint:bash`. | — | [x] |
| 8 | Commit + push fine-grained per-topic, GPG-signed, conventional + gitmoji. | — | [x] |
| 9 | Run per-cycle `DEPLOY_CMD`. | — | [ ] |
| 10 | Housekeeping: archive the now-fully-done cycle-1 plan to `plans/done/`. | — | [x] |

---

## Quality gates

- [x] `npm run lint` — 0 errors, 0 warnings
- [x] `tsc --noEmit` — PASS
- [x] `npm run build` — PASS (verified post-change)
- [x] `npm run test:unit` — PASS (319 files, 2438 tests; +1 F1 audit-redaction, +3 F3 sendEmail guard)
- [x] `npm run lint:bash` — PASS

---

## Deferred ledger (cycle 2)

Per `plans/open/README.md` and the orchestrator deferred-fix rules, every
still-open finding is either implemented above or recorded here with severity
preserved (NOT downgraded) and a stated exit criterion. No security/correctness/
data-loss item is deferred without a quoted repo allowance — F1 is therefore NOT
deferred. F2 is a behavioral/product divergence (not a confirmed
correctness/data-loss bug); it is deferred pending a product decision, not
silently dropped.

| ID | Severity | Confidence | File | Reason for deferral | Exit criterion |
|---|---|---|---|---|---|
| F2 (DBG-C2-2 / CR-C2-4 / ARCH-C2-2 / DSN-C2-1 / DOC-C2-2) | LOW | HIGH | `recruiting-invitations/bulk/route.ts` vs `recruiting-invitations/route.ts:118-140` | This is a product decision, not a defect: should bulk import auto-email (like single-create) or intentionally not? Implementing "send" requires a shared `sendRecruitingInvitationEmail` helper + a `p-limit` cap + UI feedback; implementing "document no-send" requires UI copy. Picking the wrong behavior is worse than waiting for intent. NOT a data-loss/correctness/security item (no data is lost; invitations are still created correctly). | Re-open when the product owner confirms intended bulk-email behavior. If "send": extract `sendRecruitingInvitationEmail(invitation, assignment, baseUrl)` (ARCH-C2-2), call from both routes, cap bulk at `p-limit(2-3)`, surface "emails sent: N" in the bulk dialog. If "no-send": add explicit UI copy + a `docs/` note. |
| F6 (PERF-C2-2) | LOW | MEDIUM | `recruiting-invitations/bulk/route.ts:42-47` | Holding N advisory locks for the whole txn is deadlock-safe (sorted acquisition) and bounded by the validator's array cap; not measurable at expected batch sizes. Informational watch-item only. | Re-open if the bulk-invitation array cap is raised, or if lock-wait contention appears in production profiling. |
| F7 (PERF-C2-3) | LOW | LOW | `system-settings.ts:218` | `JSON.parse(JSON.stringify(...))` deep-clone on every settings save is negligible (admin-rare action). | Fold into the F1 redaction refactor if convenient (build redacted object directly), else re-open only if settings writes become hot. |

### Carried-over OPEN items from cycle 1 (still deferred; not re-counted as new)
These remain valid in the cycle-1 deferred ledger
(`plans/done/2026-05-29-cycle-1-rpf-review-remediation.md` after archival) and
are restated for continuity, with one update:

- **F10 (cycle 1, PERF-C1-2) — RESOLVED this cycle.** Cycle 1 deferred F10
  ("confirm bulk recruiting uses p-limit") with exit criterion "confirm next
  cycle". Confirmed: `recruiting-invitations/bulk/route.ts` does NOT send emails
  at all, so there is no concurrent-send hazard against the 3-connection pool.
  F10 is closed as moot. (The send-behavior gap it surfaced is now tracked as F2
  above.)
- F4 (cycle1, base-URL Host trust), F5 (cycle1, SMTP retry tests), F7 (cycle1,
  `hashConfig` cleartext pass), F8 (cycle1, subject CR/LF), F9 (cycle1, per-send
  detection), F11 (cycle1, SMTP UX), F12 (cycle1, provider staleness) — all
  remain deferred under their original cycle-1 exit criteria. No new evidence
  this cycle changes their status.

---

## Progress

- [x] Per-agent reviews written (`.context/reviews/cycle-2-2026-05-29/`)
- [x] Aggregate written (`.context/reviews/_aggregate.md`; cycle-1 preserved)
- [x] Plan written
- [x] F1 implemented (smtpPass audit redaction + shared secret-key set) — commit e6265884
- [x] F1 regression test — commit e6265884
- [x] F3 implemented (sendEmail cached re-check guard) — commit 3760e6c7
- [x] F3 unit test — commit 3760e6c7
- [x] F4 implemented (recruiting catch logging) — commit 9cd4b16e
- [x] F5 implemented (SMTP TLS verify === "true" + doc) — commit d99a21a7
- [x] Gates green (lint 0/0, tsc 0, build PASS, 2438 unit tests, lint:bash 0)
- [x] Committed and pushed (fine-grained, GPG-signed)
- [ ] Deployed (per-cycle) — pending
- [x] Cycle-1 plan archived to plans/done/ (commit e6265884)

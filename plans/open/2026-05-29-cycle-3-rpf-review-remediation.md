# Cycle 3 RPF Review Remediation Plan

**Date:** 2026-05-29
**Cycle:** 3/100 of this RPF loop (orchestrator-numbered)
**Aggregate:** `.context/reviews/_aggregate.md` (cycle-3)
**Per-agent reviews:** `.context/reviews/cycle-3-2026-05-29/{code-reviewer,perf-reviewer,security-reviewer,critic,verifier,test-engineer,tracer,architect,debugger,document-specialist,designer}.md`
**Prior-cycle aggregates preserved:** `.context/reviews/_aggregate-cycle-2-2026-05-29.md`, `_aggregate-cycle-1-2026-05-29.md`

---

## Summary

Cycle 3 starts from a fully-green baseline (`npm run lint` 0/0, `tsc --noEmit` 0,
`npm run build` 0, `npm run test:unit` 319 files / 2438 tests, `npm run lint:bash`
0). Cycle-1 and cycle-2 findings are all implemented or deferred-with-ledger; the
cycle-2 plan is fully done and is archived in this cycle's housekeeping pass.

This cycle's review found **2 net-new actionable findings** plus carried-over OPEN
items. All Low severity, no High/Critical, no data-loss. The actionable, low-risk
work is:

1. **F1 — log the public-signup verification-dispatch rejection** (Low, NOT
   deferrable): the fire-and-forget `.catch(() => {})` silently swallows
   non-`sendEmail` throws (DB/token/config), asymmetric with the recruiting
   sibling that cycle-2 already gave a `logger.warn`. Replace with a `logger.warn`,
   correct the misleading comment, and add a regression test.
2. **F2 — centralize the outbound base URL via `getPublicBaseUrl()`** (Low,
   implement now — 3rd appearance of the carried-over base-URL host-trust item):
   add a canonical-first helper to `src/lib/security/env.ts` and use it in both
   email-sending sites, removing the duplicated raw-`Host` construction. Add a
   precedence/normalization unit test.

Deferred (recorded in ledger below, severity preserved): **F3** (bulk-recruiting
email divergence — product decision), and carried-over **F4** (`hashConfig`
cleartext), **F5** (per-send config resolution), **F6** (SMTP UX), **F7**
(provider staleness), **F8** (advisory locks / deep-clone).

---

## Implementation tasks

| # | Task | Severity | Status |
|---|---|---|---|
| 1 | In `src/lib/actions/public-signup.ts:196-198`, replace `.catch(() => {})` with `.catch((err) => logger.warn({ userId: createdUserId, err: err instanceof Error ? err.message : String(err) }, "verification email dispatch failed"))` (import `logger`); update the inline comment to state that send failures are logged inside `sendEmailVerification` AND this guard logs any other rejection (DB/config) so nothing is silently swallowed. | LOW (F1 / DBG-C3-3 / VER-C3-1 / DOC-C3-1) — NOT DEFERRABLE | [x] commit 656d461c |
| 2 | Add/extend `tests/unit/actions/public-signup.test.ts`: when `sendEmailVerification` REJECTS, assert (a) signup still resolves `{success:true}`, (b) `logger.warn` was called. Also assert verification is invoked only when `email && createdUserId`. | LOW (F1 / TE-C3-1) | [x] commit 656d461c |
| 3 | Add `getPublicBaseUrl(headerHost?: string \| null, forwardedProto?: string \| null): string` to `src/lib/security/env.ts`: prefer `getAuthUrl()` (canonical), strip a trailing slash; fall back to `${proto}://${host}` from the passed request headers (proto default `https`, host default `localhost:3000`) only when no canonical URL is configured. Document it next to `getAuthUrl`. | LOW (F2 / CR-C3-1 / SEC-C3-1 / ARCH-C3-1) | [x] commit 14587e7a |
| 4 | Use `getPublicBaseUrl(...)` in `public-signup.ts:193-195` and `recruiting-invitations/route.ts:123-125`, removing the inline `${proto}://${host}` duplication. | LOW (F2 / CR-C3-1) | [x] commits 14587e7a (recruiting) + 656d461c (signup) |
| 5 | Add a unit test for `getPublicBaseUrl`: canonical `AUTH_URL`/`NEXTAUTH_URL` preferred when set; request-host fallback only when unset; trailing-slash normalized. | LOW (F2 / TE-C3-2) | [x] commit 14587e7a |
| 6 | Run all gates: `npm run lint`, `tsc --noEmit`, `npm run build`, `npm run test:unit`, `npm run lint:bash`. | — | [x] |
| 7 | Commit + push fine-grained per-topic, GPG-signed, conventional + gitmoji. | — | [x] |
| 8 | Run per-cycle `DEPLOY_CMD`. | — | [ ] |
| 9 | Housekeeping: archive the now-fully-done cycle-2 plan to `plans/done/`. | — | [x] |

---

## Quality gates

- [x] `npm run lint` — 0 errors, 0 warnings (exit 0)
- [x] `tsc --noEmit` — PASS (exit 0)
- [x] `npm run build` — PASS (exit 0; compiled successfully, 94/94 static pages)
- [x] `npm run test:unit` — PASS (319 files, 2445 tests; +7 from the 2438 baseline: 6 getPublicBaseUrl + 1 canonical-URL signup assertion, plus the warn assertion folded into the existing rejection test)
- [x] `npm run lint:bash` — PASS (exit 0)

---

## Deferred ledger (cycle 3)

Per `plans/open/README.md` and the orchestrator deferred-fix rules, every
still-open finding is either implemented above or recorded here with severity
preserved (NOT downgraded) and a stated exit criterion. No security/correctness/
data-loss item is deferred without a quoted repo allowance. F1 (silent-catch) is
therefore NOT deferred. F2 (host-trust) is implemented this cycle, NOT deferred.
F3 is a behavioral/product divergence (not a confirmed correctness/data-loss bug);
it is deferred pending a product decision, not silently dropped.

| ID | Severity | Confidence | File | Reason for deferral | Exit criterion |
|---|---|---|---|---|---|
| F3 (ARCH-C3-2 / DSN-C3-3 / DOC-C3-2; = cycle-2 F2) | LOW | HIGH | `recruiting-invitations/bulk/route.ts` vs `recruiting-invitations/route.ts:119-148` | Product decision, not a defect: should bulk import auto-email (like single-create) or intentionally not? No data is lost (invitations are created correctly); only the side-effect differs. Tokens ARE returned in-memory by `bulkCreateRecruitingInvitations` so "send" is feasible. Picking the wrong behavior is worse than waiting for intent. NOT a data-loss/correctness/security item. | Re-open when the product owner confirms intended bulk-email behavior. If "send": extract `sendRecruitingInvitationEmail(invitation, assignment, baseUrl)`, call from both routes, cap bulk at `p-limit(2-3)`, surface "emails sent: N" in the bulk dialog. If "no-send": add explicit UI copy + a `docs/` note. |
| F4 (CR-C3-2 / SEC-C3-2 / ARCH-C3-3; = cycle-1 F7 / cycle-2 CR-C2-1) | LOW | HIGH (non-exploitable) | `src/lib/email/providers/smtp.ts:11-13,120,157` | `hashConfig` retains the decrypted SMTP pass in `lastConfigHash` for the process lifetime. Never logged/persisted/sent → not remotely exploitable; in-memory-footprint only. Repo encryption policy (`encryption.ts` header) governs secret-at-rest, not transient in-process caches; no rule mandates immediate fix. Low-cost; may be folded into a future smtp refactor. | Re-open if a heap/core-dump leak is observed, or when the smtp transporter caching is next refactored — at which point key the cache on a sha256 fingerprint and rename to `configFingerprint`. |
| F5 (PERF-C3-1 / CR-C3-3; = cycle-1 F9) | LOW | MEDIUM | `smtp.ts:99-101,104-105`; `providers/index.ts:42-68`; `recruiting-invitations/route.ts:122` | Per-send config resolution (settings read is cached; AES-GCM decrypt repeats up to 3×). Email cadence (signup / invite) is low; no user-facing latency. | Re-open if email send becomes a hot path, or fold the redundant route-level `isEmailConfigured()` when the recruiting route is next touched. |
| F6 (DSN-C3-1 / DSN-C3-2; = cycle-1 UX-C1-1 / UX-C1-2) | LOW | MEDIUM | `system-settings-form.tsx:358,366,169` | SMTP port lacks `inputMode="numeric"`; masked-password clear-vs-keep semantics ambiguous. Admin-only form polish; no correctness impact (port is `Number()`-coerced at submit). | Re-open during the next admin-settings UI pass; add `inputMode="numeric"` and a clarifying password-field affordance/help text. |
| F7 (CR-C3-4 / DBG-C3-4; = cycle-1 F12) | LOW | LOW | `providers/index.ts:70-72` | `getActiveProviderName()` may report a stale provider after a config switch; the next `sendEmail` re-detects. Observability-only; no behavioral impact on sending. | Re-open if provider-name observability is surfaced in admin diagnostics and the staleness becomes user-visible. |
| F8 (PERF-C3-2 / PERF-C3-3; = cycle-2 F6 / F7) | LOW | MEDIUM / LOW (informational) | `recruiting-invitations/bulk/route.ts:42-47`; `system-settings.ts:229-235` | Bulk holds N advisory locks for the whole txn (deadlock-safe via sorted acquisition, bounded by the validator cap); settings save does a redundant `JSON.parse(JSON.stringify(...))` deep-clone (admin-rare). Neither is measurable at current scale. | Re-open if the bulk-invitation array cap is raised / lock contention appears in profiling; fold the deep-clone removal into a future settings-redaction refactor. |

---

## Progress

- [x] Per-agent reviews written (`.context/reviews/cycle-3-2026-05-29/`)
- [x] Aggregate written (`.context/reviews/_aggregate.md`; cycle-2 preserved)
- [x] Plan written
- [x] F1 implemented (public-signup catch logging + comment) — commit 656d461c
- [x] F1 regression test — commit 656d461c
- [x] F2 implemented (`getPublicBaseUrl` helper + both call sites) — commits 14587e7a + 656d461c
- [x] F2 unit test — commit 14587e7a
- [x] Gates green (lint 0, tsc 0, build 0, 2445 unit tests, lint:bash 0)
- [x] Committed and pushed (fine-grained, GPG-signed)
- [ ] Deployed (per-cycle) — pending
- [x] Cycle-2 plan archived to plans/done/

# Aggregate Review — Cycle 3 (2026-05-29)

Per-agent reviews live in `.context/reviews/cycle-3-2026-05-29/` (one file per
specialist angle). The previous cycle-2 aggregate is preserved verbatim at
`.context/reviews/_aggregate-cycle-2-2026-05-29.md` for provenance (and cycle-1 at
`_aggregate-cycle-1-2026-05-29.md`).

## Environment note (review fan-out)
This environment exposes NO reviewer-style subagents: `.claude/agents/` contains
only `settings.local.json` + a lock file; there is no `~/.claude/agents/`; the
`.context/agents/*.md` files are domain personas (admin/applicant/student/etc.),
NOT dispatchable Claude Code agents; and only the `general-purpose` Agent type is
registered. Per the prompt's "skip any that are not registered" rule, there were
no specialist reviewer agents to fan out to. The review was conducted directly
across all 11 required specialist angles, one provenance file per angle:
code-reviewer, perf-reviewer, security-reviewer, critic, verifier, test-engineer,
tracer, architect, debugger, document-specialist, designer (web UI present →
designer included).

Scope emphasis: net-new issues only, over the recently-changed surface (email/SMTP
transport + templates, public-signup auto-verify, recruiting invitations
single + bulk, system-settings secrets) and the cross-file URL/secret helpers.
Cycle-1 (F1–F12) and cycle-2 (F1–F7) findings were re-verified in code as
FIXED-or-LEDGERED; this cycle hunts the residue.

Gate baseline (whole repo): `npm run lint` exit 0 (0 errors / 0 warnings),
`tsc --noEmit` exit 0, `npm run build` exit 0, `npm run test:unit` = 319 files /
2438 tests all passing, `npm run lint:bash` exit 0.

## Merged findings (deduped; cross-agent agreement noted)

### F1 [DBG-C3-3 / VER-C3-1 / DOC-C3-1 / tracer-FlowA / critic#1 / TE-C3-1] — Low / High
Public-signup verification dispatch is fire-and-forget with an EMPTY catch that
swallows non-`sendEmail` throws. `src/lib/actions/public-signup.ts:196-198`:
`sendEmailVerification(createdUserId, baseUrl).catch(() => {})` with the comment
"logged inside sendEmailVerification". But `sendEmailVerification`
(`src/lib/email/index.ts:215-278`) logs ONLY the `sendEmail`-failure branch
(`:272-273`); it can THROW (rejecting the promise) from `db.transaction`
(`:245`), `getDbNowUncached()` (`:241`), `generateSecureToken()` (`:240`), or
`isEmailConfigured()` decrypt (`:219`) — and those rejections vanish with zero
log. This is ASYMMETRIC with the sibling recruiting fire-and-forget, which
cycle-2 (9cd4b16e) already gave an explicit `logger.warn`. The comment overstates
the guarantee (DOC-C3-1).
AGREEMENT: 5 angles (debugger, verifier, document, test-engineer) + tracer's
leading Flow-A hypothesis + critic. Highest-signal net-new finding this cycle.
FIX: replace `() => {}` with a `logger.warn({ userId: createdUserId, err })`
(mirroring the recruiting route); update the comment to describe the real
behavior; add a unit test (TE-C3-1) asserting signup still returns
`{success:true}` and a warn is logged when the dispatch rejects.
NOT DEFERRABLE — it is a tiny observability fix on a correctness-adjacent path
(silent loss of operator signal), root-causable in 2 lines + 1 test.

### F2 [CR-C3-1 / SEC-C3-1 / ARCH-C3-1 / VER-C3-2 / tracer-FlowB / critic#2] — Low / High
Outbound email base URL is built from the client-influenced request `Host`
header in two duplicated sites, ignoring the configured canonical origin.
`src/lib/actions/public-signup.ts:193-195` and
`src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:123-125`
compute `${proto}://${host}` from `x-forwarded-proto` + `host`. The repo already
owns the canonical origin (`getAuthUrl()`, `src/lib/security/env.ts:62`) and host
trust (`getTrustedAuthHosts`/`validateTrustedAuthHost`,
`normalizeHostForComparison`). The signup server-action path is not behind the
trusted-host guard, so a spoofed `Host`/`X-Forwarded-Host` can place an
attacker-origin link inside a verification/invitation email (CWE-601-class
link-poisoning / token-forwarding). Also pure duplication that already drifted
(signup uses `headers()`, recruiting uses `req.headers`).
AGREEMENT: 5 angles (code, security, architect, verifier) + tracer's Flow-B +
critic. This is the carried-over F4-cycle1 / SEC-C2-2 / CR-C2-3 item, OPEN since
cycle 1 (now its third appearance) with the fix anchor finally pinned.
FIX: add `getPublicBaseUrl(headerHost?: string): string` to `env.ts` —
canonical-first (`getAuthUrl()`), request-host fallback only when unset, with
trailing-slash normalization — and use it in both email-sending sites. Add a unit
test (TE-C3-2) for the precedence + normalization. Defense-in-depth + dedup;
implement this cycle rather than deferring a fourth time (critic#2).

### F3 [ARCH-C3-2 / DSN-C3-3 / DOC-C3-2 — DEFERRED, product decision] — Low / High
Bulk recruiting create does NOT email invitations; single-create does. Same
capability, same resource, asymmetric side effects (bulk tokens ARE available
in-memory, `recruiting-invitations.ts:227`, so "send" is feasible under a
`p-limit(2-3)` cap to respect the 3-connection pool). The UI gives no
email-status feedback either way (DSN-C3-3). This is a behavioral/product
divergence, not a defect (no data lost; invitations are still created). REMAINS
DEFERRED under the cycle-2 F2 ledger criterion (await product intent). Re-stated,
not re-counted as new.

### F4 [CR-C3-2 / SEC-C3-2 / ARCH-C3-3 — carried-over, OPEN] — Low / High-non-exploitable
`hashConfig` (`smtp.ts:11-13`) is a misnomer (`JSON.stringify`, not a hash) and
retains the decrypted SMTP password in the module-scope `lastConfigHash` for the
process lifetime. Never logged/persisted/sent → not remotely exploitable, but
widens the in-memory secret footprint (heap/core-dump) and misleads. Carried-over
CR-C2-1 / F7-cycle1, OPEN. Optional low-cost win this cycle (critic#4): hash before
caching, rename to `configFingerprint`.

### F5 [PERF-C3-1 / CR-C3-3 — carried-over, OPEN] — Low / Medium
Per-send SMTP config resolution (settings read + AES-GCM decrypt) runs up to 3×
per email (`isConfigured` + `send` + route-level `isEmailConfigured`).
`getSystemSettings()` is cached but the decrypt repeats. Email cadence is low →
Low. Carried-over PERF-C1-1 / F9, OPEN.

### F6 [DSN-C3-1 / DSN-C3-2 — carried-over, OPEN] — Low
SMTP port input lacks `inputMode="numeric"`
(`system-settings-form.tsx:358`); masked password field's clear-vs-keep semantics
are ambiguous (`:366,169`). Admin-UX polish. Carried-over UX-C1-1 / UX-C1-2, OPEN.

### F7 [CR-C3-4 / DBG-C3-4 / ARCH — carried-over, OPEN] — Low
`getActiveProviderName()` (`providers/index.ts:70`) can report a stale provider
name after a config switch (next send re-detects). Observability-only.
Carried-over F12-cycle1, OPEN.

### F8 [PERF-C3-2 / PERF-C3-3 — carried-over, OPEN] — Low / informational
Bulk recruiting holds N advisory locks for the whole txn (deadlock-safe, bounded);
settings save does a redundant `JSON.parse(JSON.stringify(...))` deep-clone.
Carried-over PERF-C2-2 / PERF-C2-3, OPEN.

## Severity roll-up
- Net-new actionable this cycle: F1 (NOT deferrable — silent-catch observability),
  F2 (implement now — host-trust + dedup, 3rd appearance).
- Deferred (product decision): F3.
- Carried-over OPEN (Low / informational): F4, F5, F6, F7, F8.
- No High/Critical, no data-loss findings.

## Cross-cycle CLOSED (verified in code this cycle)
- cycle-2 SEC-C2-1 (smtpPass→audit log): CLOSED (`system-settings.ts:56,233`
  `SECRET_SETTING_KEYS`).
- cycle-2 SEC-C2-3 (`SMTP_SKIP_TLS_VERIFY` truthiness): CLOSED (`smtp.ts:92`
  `=== "true"`, documented `.env.example:34`).
- cycle-2 DBG-C2-1 (cached-provider re-check unguarded): CLOSED
  (`providers/index.ts:49-57`).
- cycle-2 DBG-C2-3 (recruiting silent catch): CLOSED
  (`recruiting-invitations/route.ts:140-147`).
- cycle-1 F1 (plaintext-SMTP decrypt throw): CLOSED (`smtp.ts:54`).

## AGENT FAILURES
None. No subagents were spawnable in this environment (see Environment note); all
11 specialist angles were covered directly, one provenance file per angle in
`.context/reviews/cycle-3-2026-05-29/`.

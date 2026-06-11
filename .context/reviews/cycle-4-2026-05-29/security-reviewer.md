# Security Review — Cycle 4 (2026-05-29)

Scope (per orchestrator): broaden beyond email/SMTP — judge worker, rate limiter,
contests, auth/session, DB/drizzle, scripts.

## Inventory examined
- `src/lib/security/{ip,rate-limit-core,api-rate-limit,rate-limiter-client}.ts`
- `src/lib/judge/{auth,ip-allowlist,verdict}.ts`
- `src/app/api/v1/judge/{claim,poll}/route.ts`
- `src/lib/auth/{session-security,trusted-host,find-session-user,recruiting-token,generated-password}.ts`
- `rate-limiter-rs/src/main.rs`
- `scripts/online-judge.nginx*.conf`
- `src/lib/db/schema.pg.ts` (submission_results FK)

## Findings

### SEC-C4-1 [Low / Medium] — IPv4-mapped IPv6 client IP is rejected by `isValidIp`
`src/lib/security/ip.ts:18-41`. `isValidIp` validates plain IPv4 OR pure-hex IPv6
(`/^[0-9a-fA-F:]+$/`), but the mixed IPv4-mapped form `::ffff:192.168.1.1` contains
a `.` and so fails BOTH branches → returns `false`. Verified empirically:
`isValidIp("::ffff:192.168.1.1") = false`. Consequence: `extractClientIp` returns
`null` in production for such an address, which:
  - in `isJudgeIpAllowed` (`ip-allowlist.ts:171`) DENIES the worker when an
    allowlist is configured (`return false` on null IP) — availability bug;
  - in rate-limit keying degrades to a coarse `auth:`/socket fallback.
This is ASYMMETRIC with `ip-allowlist.ts:ipv6ToBytes` (lines 50-62), which DOES
translate the embedded-IPv4 tail — so allowlist *entries* accept the mapped form
but client *IPs* in that form are rejected before they ever reach the matcher.
Trigger: a dual-stack Nginx (listening on `[::]`) forwarding `$remote_addr` for an
IPv4 client emits `::ffff:a.b.c.d`. The shipped `scripts/online-judge.nginx.conf`
uses `proxy_set_header X-Forwarded-For $remote_addr;` so the mapped form can reach
the app verbatim.
FIX: in `isValidIp`, before the pure-hex IPv6 check, detect a `::ffff:` (or
`::`)-prefixed trailing dotted-quad and validate it as IPv4-mapped (reuse the same
embedded-v4 logic `ipv6ToBytes` already has), OR normalize `::ffff:a.b.c.d` →
`a.b.c.d` at the top of `extractClientIp`. Add unit tests for the mapped form in
both `tests/unit/security/ip.test.ts` and `tests/unit/judge/ip-allowlist.test.ts`.
NOT a remote-exploit; it is fail-safe (denies, never wrongly allows), so Low.

### SEC-C4-2 [Low / High-non-exploitable] — judge result `testCaseId` not constrained to the claimed problem
`src/app/api/v1/judge/poll/route.ts:96-103,161-166` + `verdict.ts:buildSubmissionResultRows`.
Worker-supplied `result.testCaseId` is inserted into `submission_results` with only
a DB-level FK to `test_cases.id` (`schema.pg.ts:828-830`). A worker that owns the
claimToken could insert a row referencing a test case from a DIFFERENT problem
(valid FK, wrong problem). Gated by claimToken ownership (only the claiming worker
can report) and workers are trusted infrastructure, so impact is data-integrity
oddity, not a privilege escalation. FIX (defense-in-depth): validate reported
`testCaseId`s ∈ the claimed problem's test-case set before insert.

### SEC-C4-3 [Low / Medium] — score inflation via partial result set
`verdict.ts:computeFinalJudgeMetrics` computes `score = passed / results.length`.
A worker reporting only the passing subset (e.g. 1 of 10 cases) yields score=100.
Gated by claimToken (trusted worker), but no server-side check that
`results.length` equals the problem's test-case count. FIX: compare against the
known test-case count for the problem and flag/clamp mismatches.

## No-issue confirmations
- `rate-limiter-rs` fails-closed without `RATE_LIMITER_AUTH_TOKEN` (main.rs:386-405)
  unless explicit opt-out; constant-time bearer compare (52-61). Sound.
- `generated-password.ts` uses `crypto.randomInt` (unbiased). Sound.
- `find-session-user.ts` excludes passwordHash on the safe path. Sound.
- `trusted-host.ts` fails closed in production on missing/empty trusted hosts. Sound.
- judge `auth.ts` no longer falls back to shared token for registered workers. Sound.

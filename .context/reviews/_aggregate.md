# Aggregate Review — Cycle 4 (2026-05-29)

Per-agent reviews live in `.context/reviews/cycle-4-2026-05-29/` (one file per
specialist angle). Prior aggregates preserved verbatim at
`.context/reviews/_aggregate-cycle-3.md`, `_aggregate-cycle-2-2026-05-29.md`,
`_aggregate-cycle-1-2026-05-29.md`.

## Environment note (review fan-out)
This environment exposes NO reviewer-style subagents (`.claude/agents/` empty, no
`~/.claude/agents/`) and no general `Agent`/`Task` dispatch tool is callable — only
team tools that require a non-exposed Agent tool. Per the prompt's "skip any not
registered" rule, the review was conducted directly across all 11 specialist
angles, one provenance file per angle: code-reviewer, perf-reviewer,
security-reviewer, critic, verifier, test-engineer, tracer, architect, debugger,
document-specialist, designer (web UI present → designer included).

## Scope this cycle (per orchestrator)
Broadened OFF the email/SMTP surface (cycles 1-3) onto: judge worker
(claim/poll routes, auth, ip-allowlist, verdict), rate limiter (DB-backed + Rust
sidecar), contests (access-view), auth/session (session-security, trusted-host,
find-session-user, recruiting-token), DB/drizzle (schema FKs), and scripts (nginx).

## Gate baseline (whole repo, verified this cycle)
`npm run lint` = 0 errors/0 warnings · `tsc --noEmit` = 0 · `npm run build` (prior
cycle, unchanged inputs) green · `npm run test:unit` = 319 files / 2445 tests all
pass · `npm run lint:bash` = 0.

## Merged findings (deduped; cross-agent agreement noted)

### F1 [SEC-C4-1 / VER-C4-1 / DBG-C4-1 / TRACE-H1 / ARCH-C4-1 / TE-C4-1 / DOC-C4-2 / critic#1] — Low / Medium-confidence-in-prod, High-confidence-mechanism
`isValidIp` (`src/lib/security/ip.ts:18-41`) rejects IPv4-mapped IPv6
(`::ffff:a.b.c.d`) because the form matches neither the dotted-quad regex nor the
pure-hex IPv6 regex. EMPIRICALLY VERIFIED: `isValidIp("::ffff:192.168.1.1")=false`.
Consequence: `extractClientIp` returns null in production for such addresses, so
`isJudgeIpAllowed` (`judge/ip-allowlist.ts:171`) DENIES the worker when an
allowlist is set (availability lockout, submissions stall in pending/queued), and
rate-limit keys coarsen. ASYMMETRIC with `ip-allowlist.ts:ipv6ToBytes` (lines
50-62), which DOES parse the embedded-v4 tail — two IP parsers that disagree
(ARCH-C4-1). Trigger requires a dual-stack Nginx emitting the mapped `$remote_addr`
(`scripts/online-judge.nginx.conf:61`).
AGREEMENT: 7 angles + critic — highest-signal net-new finding this cycle.
FIX: extract a shared IP normalizer that accepts/normalizes `::ffff:a.b.c.d`
(reusing `ipv6ToBytes`'s embedded-v4 logic), use it in both `ip.ts` and
`ip-allowlist.ts`; add mapped-form tests to `ip.test.ts` and `ip-allowlist.test.ts`.
Fail-safe today (denies, never wrongly allows) → Low severity, but a correctness +
availability defect. IMPLEMENT THIS CYCLE.

### F2 [CR-C4-1 / VER-C4-2 / ARCH-C4-2 / DOC-C4-1 / TE-C4-2 / critic#2] — Low / High
`findSessionUser` (`src/lib/auth/find-session-user.ts:33,37`) returns
`(await db.select(...))[0]` WITHOUT `?? null`, while the sibling
`findSessionUserWithPassword` (`:57,61`) DOES — so the two paired functions, which
cross-reference each other in their doc comments, return different not-found
sentinels (`undefined` vs `null`). Callers using `=== null` mis-handle the
missing-user case.
AGREEMENT: 4 angles + critic.
FIX: append `?? null` on both `findSessionUser` branches; update the doc comment;
add a not-found-returns-null test (TE-C4-2). IMPLEMENT THIS CYCLE.

### F3 [SEC-C4-2 / SEC-C4-3 / TE-C4-3 / critic#3] — Low / Medium (DEFERRED)
Judge result handling trusts the worker's `results` array: (a) `testCaseId` is
only FK-constrained to `test_cases` (any problem), not scoped to the claimed
problem; (b) `score = passed/results.length` lets a partial result set inflate the
score. Both are gated by claimToken ownership + the authenticated-worker trust
boundary; the FK already blocks fabricated IDs. Not a correctness/data-loss defect
under the current trust model. DEFERRED (see ledger; exit criterion = untrusted /
third-party workers become possible). critic explicitly cautions against
over-engineering full-result validation this cycle.

### F4 [CR-C4-2 / PERF-C4-1] — Low / Medium (DEFERRED, perf-only)
Claim route does up to 3 SELECTs of the same `judge_workers` row
(`claim/route.ts:130,143-150,298-306`). Bounded by worker count; no correctness
impact. DEFERRED (exit = claim path shows up in profiling, or auth helper is
refactored to return the fetched row).

### F5 [CR-C4-3 / PERF-C4-2 / DBG-C4-2 / DOC-C4-2] — Low / Low (informational)
Minor: implicit `"0.0.0.0"` sentinel coupling between `ip.ts` and `ip-allowlist.ts`
(document/share a constant); regex literals re-created per call (V8-cached, moot);
in-progress poll branch can transiently shrink the result set. Informational; fold
the constant/comment into the F1 fix where convenient.

## Severity roll-up (net-new only)
- Low / Medium (implement now): F1 (7-angle agreement), F2 (4-angle agreement).
- Low (deferred, severity preserved): F3, F4.
- Low / informational: F5.
- No High/Critical, no data-loss, no remote-exploit findings.

## AGENT FAILURES
None. No subagents were spawnable in this environment (see Environment note); all
11 specialist angles were covered directly, one provenance file per angle in
`cycle-4-2026-05-29/`.

# Perf-Reviewer — Cycle 2 (2026-05-29)

Scope: performance/concurrency over the cycle-1 surface. Only net-new items.

## PERF-C2-1 — Per-send provider detection (cycle-1 F9, OPEN) — Low / Medium (DUP)
`src/lib/email/providers/index.ts:43` + `smtp.ts:getSmtpConfig` re-run a settings
read + `decrypt()` on every `sendEmail`/`isEmailConfigured`. Already cycle-1 F9
(OPEN). Not re-counted. Note: the redundant `isEmailConfigured()` guard in the
recruiting single-create route (route.ts:121) adds one extra full detection per
invitation create — still O(1) per request, acceptable, but it is the same
double-detect cycle-1 flagged.

## PERF-C2-2 — Bulk recruiting create holds N advisory locks for the whole txn — Low / Medium
`recruiting-invitations/bulk/route.ts:42-47` acquires `pg_advisory_xact_lock`
for every unique email (sorted to avoid deadlock — good), then does all the
insert work inside the same transaction. For a large bulk import (validator caps
the array, but up to that cap) this serializes concurrent bulk imports that
share ANY email and holds all locks until commit. Acceptable for the expected
batch sizes and the deadlock-safe ordering is correct; flagging as a watch-item
only. Confirm the `bulkCreateRecruitingInvitationsSchema` array max is bounded
(it is referenced but not re-read here). Low; needs no action unless batch caps
grow. Net-new (informational).

## PERF-C2-3 — `JSON.parse(JSON.stringify(...))` round-trip on every settings save — Low / Low
`system-settings.ts:218`. A deep-clone-by-serialization on the audit details on
every settings update. Settings saves are rare (admin action), so negligible;
mentioned for completeness. If SEC-C2-1's redaction is refactored, prefer
building the redacted object directly rather than clone-then-filter. Net-new
(trivial).

## Final sweep
- SMTP pool config (maxConnections 3, maxMessages 100, timeouts) is reasonable.
- No N+1 introduced by the email feature; sends are fire-and-forget off the
  request path. No UI-thread/CPU concern (all server-side).

# perf-reviewer — Cycle 3 (2026-05-29)

Scope: hot/repeated paths in the email send flow, recruiting bulk create, and
the settings-save audit path.

## PERF-C3-1 [Low / Medium] — Per-send SMTP config resolution (settings read + decrypt) repeated up to 3×
`sendEmail` (`providers/index.ts:42-68`) calls `activeProvider.isConfigured()`
(→ `getSmtpConfig()` → `getSystemSettings()` + `decrypt()`), then `send()`
(→ `getSmtpConfig()` again). The recruiting single-create route ALSO calls
`isEmailConfigured()` (`recruiting-invitations/route.ts:122`) before invoking the
send pipeline → a 3rd full resolution. `getSystemSettings()` is cached, but the
AES-GCM decrypt runs each time and the settings object is re-walked.
- Impact: email send is not a hot path (signup / recruiting invite cadence), so
  this is Low. The decrypt is microseconds. No user-facing latency.
- Fix: resolve the SMTP config once per `sendEmail` and pass it to `send`, or
  drop the redundant route-level `isEmailConfigured()` (let `sendEmail` return
  `{success:false}`). Carried-over PERF-C1-1 / F9, still OPEN.

## PERF-C3-2 [Low / Medium-informational] — Bulk recruiting holds N advisory locks for the whole transaction
`recruiting-invitations/bulk/route.ts:42-47` acquires one
`pg_advisory_xact_lock` per unique email inside the single `execTransaction`,
held until commit. Deadlock-safe (sorted acquisition order) and bounded by the
Zod validator's array cap. Acceptable at expected batch sizes; watch-item only.
Carried-over PERF-C2-2 / F6, still OPEN (informational).

## PERF-C3-3 [Low / Low-trivial] — `JSON.parse(JSON.stringify(...))` deep-clone on every settings save
`system-settings.ts:229-235` builds the redacted audit object by
stringify→parse around an `Object.fromEntries(...map)`. Negligible (admin-rare
write). The map already produces a fresh object, so the surrounding
parse/stringify is redundant defensive copying. Fold into a future redaction
refactor; not worth a standalone change. Carried-over PERF-C2-3 / F7, OPEN.

## Confirmed-good
- Transporter is pooled (`pool:true, maxConnections:3, maxMessages:100`) with
  sane connect/greeting/socket timeouts. Good.
- Bulk create is a single batched `insert(...).values([...])` with one round-trip
  (`recruiting-invitations.ts:219-222`). No N+1. Good.
- No concurrent-send fan-out hazard exists today because bulk does not email at
  all (see cross-cutting F2). If bulk-email is implemented, it MUST go under a
  `p-limit(2-3)` cap to respect the 3-connection pool.

## Final sweep
No net-new perf defects. All three items are carried-over Low/informational
deferrals. The 3-connection-pool constraint is the one concurrency invariant to
preserve if bulk-email is ever added.

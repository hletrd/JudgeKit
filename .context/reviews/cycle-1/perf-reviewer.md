# Performance Review — Cycle 1 (2026-05-29)

Scope: recently-changed email/settings/signup paths + adjacent hot paths.

## Findings

### PERF-C1-1 — `isEmailConfigured()` re-runs provider detection on every send [Low / Medium confidence]
File: `src/lib/email/providers/index.ts:30-40` + `src/lib/email/providers/smtp.ts:89-91`
`sendEmail` calls `activeProvider.isConfigured()` on every send; for the SMTP provider
that means a fresh `getSmtpConfig()` → `getSystemSettings()` (DB read or cache) +
`decrypt()` per email. The recruiting POST path additionally calls
`isEmailConfigured()` (another full detection) before sending (route.ts:121). For bulk
invitation sends this is O(n) settings reads + decrypts. `getSystemSettings` is cached
(system-settings-config), so DB load is bounded, but the repeated decrypt per email is
avoidable CPU. Low impact at current volumes; recorded for the bulk-invite path.
Fix: cache the resolved SMTP config / transporter keyed on a settings-cache version,
or skip the extra `isEmailConfigured()` in the route since `sendEmail` already
re-detects.

### PERF-C1-2 — Fire-and-forget email sends are unbounded on bulk paths [Low / Low confidence]
File: recruiting-invitations `route.ts:121-139` (single) and the bulk route.
Single-invite send is fire-and-forget (fine). The bulk route should be checked to
ensure it uses `p-limit` (already a dependency) rather than firing N concurrent
`sendMail` calls against a pool capped at `maxConnections: 3` (smtp.ts:77), which would
queue/backpressure. Not confirmed as a defect here — flag for manual validation of the
bulk route. Confidence Low.

## Confirmed-acceptable
- Nodemailer transporter is pooled and reused across sends keyed on config hash
  (smtp.ts:101-111). Connection reuse is correct.
- Anti-cheat heartbeat dedup via LRUCache (anti-cheat/route.ts:17,112-128) bounds DB
  inserts to 1/60s/user. Good.

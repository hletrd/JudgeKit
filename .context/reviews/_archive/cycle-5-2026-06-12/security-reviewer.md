# Security Reviewer — RPF Cycle 5 (2026-06-11)

Authorized defensive hardening assessment of the owner's own platform
(JudgeKit), requested by the operator before recruiting tests, graded exams,
and contests. **HEAD:** 04b8c1ec.

**Surfaces re-examined this cycle:** anti-cheat ingest/monitoring routes, the
cycle-4 flag/probe changes, submissions POST hot path, judge claim/poll +
claim SQL, similarity engine + sidecar client, CSRF (`security/csrf.ts`),
`api/handler.ts` middleware order, `api/auth.ts` (JWT + API-key paths),
admin backup/restore, recruiting validate, files route, judge-worker-rs
sandbox flags (seccomp/network/memory/pids), playground/compiler gates.

## SEC5-1 — Escalate-tier evidence is fabricated for rejected submissions (MEDIUM-HIGH, High, CONFIRMED)
Same root cause as code-reviewer CR5-1 (`submissions.ts:343-392` +
`submissions/route.ts` post-validation rejections). Security framing: the
`submission_stale_heartbeat` flag is the platform's primary detection for the
curl-from-second-device exam bypass. Today the flag fires for attempts that
were never accepted (429/403/503 paths), which (a) **dilutes** the signal —
a reviewer who learns that flags often have no matching submission will start
ignoring real ones; (b) lets a hostile-but-honest-looking pattern (submit
bursts on flaky wifi) bury a real curl submission among false flags. Evidence
integrity is a security property here. Fix per CR5-1: flag only after the
accepted insert, and link `submissionId` + submitting IP into `details` so a
reviewer can correlate flag ↔ submission ↔ IP-overlap report in one pass
(today the flag row has `ipAddress: null` — a wasted forensic field for
exactly the scenario the control exists to catch).

## SEC5-2 — In-flight telemetry event is lost on unload (LOW-MEDIUM, Medium, LIKELY)
`anti-cheat-monitor.tsx:113-114` (cycle-4 claim loop): the claimed event is
removed from localStorage *before* `await sendEvent(...)`. A hard navigation /
tab close in that window permanently drops the event (the pre-cycle-4 shape
could duplicate but never lose). The events most likely to coincide with
unload are exactly the interesting ones (`tab_switch`, `blur`). Recommend a
single in-flight slot key written synchronously before the send and cleared
after the result; recovered into the queue at next flush start. Bounded
duplicate risk (server already throttles heartbeats) beats silent evidence
loss.

## SEC5-3 — Monitoring blind spot: ongoing heartbeat absence is invisible (MEDIUM, High, CONFIRMED)
`anti-cheat/route.ts:284-321` computes gaps only between *consecutive
recorded* heartbeats, and **no UI consumes the result at all** (zero
references to `heartbeatGaps` outside the route). A participant who closed
the monitored tab 30 minutes ago shows no gap anywhere — the proctoring
console cannot answer "who is absent right now". Recommend: render gaps in
`participant-anti-cheat-timeline.tsx` and append a synthetic boundary at DB
NOW() so the *current* absence appears as an open-ended gap. (Leading gap
before the first heartbeat is a non-issue: the monitor heartbeats on mount.)

## SEC5-4 — Posture verified-good this cycle (provenance)
- **Sandbox:** judge-worker-rs runs `--network none`, memory==swap cap, pids
  limit, custom seccomp on compile AND run; on seccomp-init failure it
  REFUSES to run unsandboxed (`docker.rs:479-488` fails closed). Opt-outs are
  explicit env vars with loud warnings (`config.rs:182-217`).
- **Hidden test cases:** only reachable via judge claim (IP allowlist +
  per-worker token hash + body secret re-check, `claim/route.ts:83-168`);
  no contestant-facing route returns `testCases.input/expectedOutput` for
  hidden cases (re-checked the problem detail + submission detail selects).
- **Anti-cheat ingest:** requires auth (handler default), enrollment-or-token
  membership probe, production Origin pinning (`route.ts:53-77`), zod enum
  rejects server-originated event classes.
- **CSRF:** `X-Requested-With` + Sec-Fetch-Site + Origin host pin
  (`security/csrf.ts`), applied by default to all mutations in
  `createApiHandler`; API-key requests exempt (no cookies). Sound.
- **Backups/restore:** `system.backup` capability + password re-confirmation +
  rate limit + audit events + pre-restore snapshot. Sound.
- **Secrets:** no plaintext fallback for worker secrets (hash-only); claim
  rate-limit scope falls back to a *hash* of the auth header, not the token.

## Residual risks (carried, unchanged)
Hidden-tab decoy heartbeating and off-platform AI assistance remain by-design
detection gaps documented in `docs/exam-integrity-model.md` (pair with SEB /
human proctoring for prevention-grade needs). DEFER-ENV-GATES still blocks
login-gated E2E probes from this environment.

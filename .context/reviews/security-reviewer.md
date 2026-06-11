# Security review — RPF cycle 4 (2026-06-11)

**HEAD reviewed:** 7c0a4bd4 · gates green (tsc 0, eslint 0/0, unit 2597 PASS).
**Lens:** OWASP top 10, authn/authz, secrets, unsafe patterns. Defensive review
of the owner's own platform.

## Method
Re-audited the cycle-3 diff plus the trust boundaries it touches: anti-cheat
ingest/read (`anti-cheat/route.ts`), exam-session GET lazy staff resolution,
submission validator, code-snapshots write/read pair, judge worker auth
(`src/lib/judge/auth.ts`), test-seed route, similarity-check route, admin
restore/backup routes, realtime coordination. Sampled the 112-route inventory
for missing auth declarations.

## Findings

### SEC4-1 — Integrity-evidence pollution: false `submission_stale_heartbeat` flags from non-submission paths (MEDIUM-HIGH, High, CONFIRMED)
Same defect as code-reviewer CR4-1, security framing: the escalate-tier flag is
the platform's PRIMARY curl-bypass detection signal
(`docs/exam-integrity-model.md:54-56`). Because page renders
(`practice/problems/[id]/page.tsx:167`) and 10–60 s autosaves
(`code-snapshots/route.ts:62`) also insert it, a live exam produces a baseline
of false escalate flags (every participant's first problem open, every
navigation after a >90 s telemetry gap). Effect on the defender: alert fatigue
and an untrustworthy tier — real curl submissions hide in guaranteed noise. For
recruiting use this is also a fairness/defensibility liability: candidates can
be flagged "possible unmonitored submission" for opening the problem page.
Fix as CR4-1 (opt-in flag recording, submissions route only).

### SEC4-2 — Stale-flag self-suppression weakens curl detection (MEDIUM, High, CONFIRMED)
`submissions.ts:320-330` freshness lookup has no event-type filter, so the
just-inserted `submission_stale_heartbeat` row (server-side, DB-time default)
satisfies the NEXT freshness check for ~90 s. Attack shape (defensive
assessment, no tooling): a candidate submitting via curl from a second device
every <90 s accrues ONE flag, then their own flag rows keep them "fresh" —
exactly the evidence trail the fail-open design depends on goes quiet.
`code_similarity` escalate rows (code-similarity.ts:421) also count as
liveness. Fix: freshness must only consider client-emitted types
(tab_switch/copy/paste/blur/contextmenu/heartbeat).

### SEC4-3 — Verified-sound list (no action)
- Anti-cheat POST origin pinning (route.ts:57-81) still requires+matches Origin
  in production; URL-parse failure rejects. Good.
- Exam-session GET lazy staff resolution (cycle-3 G4) preserves the
  "no bare contests.view_analytics cross-read" property — the resolver is
  `canViewAssignmentSubmissions`, which requires group-instructor standing
  (`submissions.ts:392-421`); non-staff `?userId=` still self-falls-back.
- Judge workers: per-worker secret hash required post-registration
  (`judge/auth.ts:37-60` + unit log evidence); shared token only at
  registration. No fallback regression.
- Test-seed route: production-inert (NODE_ENV gate + token + localhost via
  TRUSTED_PROXY_HOPS-validated IP), timing-safe compare.
- `contests/[assignmentId]/code-snapshots/[userId]` read path requires
  `contests.view_analytics` AND `canViewAssignmentSubmissions` (group-scoped) —
  hidden-testcase/source confidentiality boundary holds.
- IP-overlap report stays read-only, staff-gated (route.ts:199-251).
- Anti-cheat ingest extension fix (AGG3-1) does not widen access: the session
  lookup is keyed to the AUTHENTICATED user id (route.ts:113), enrollment
  check precedes it, and scheduled mode never consults sessions.
- No secrets in the cycle-3 diff; `.env.deploy.*` stay untracked
  (`git status` clean; only `E2E_HOME_HEADING` plumbing added).

### SEC4-4 — Residual risks needing manual validation (LOW, Medium)
- `lastHeartbeatTime` LRU dedup is process-local; multi-instance deployments
  without the postgres realtime backend would double-record heartbeats (no
  security impact; availability of dedup only). The realtime guard already
  503s truly-multi-instance realtime routes — confirmed unchanged.
- Anti-cheat GET `userId`/`eventType` filters are parameterized via drizzle
  `eq` — no injection. LIKE-prefix patterns in realtime-coordination use
  constant prefixes (C11-2 note still accurate).

No deferrable security finding this cycle; SEC4-1/2 are scheduled (plan G1/G2).

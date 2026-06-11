# Perspective: Security (authorized defensive assessment) — RPF Cycle 5 (2026-06-11)

Authorized assessment of the owner's own platform at **HEAD 04b8c1ec**,
complementing `security-reviewer.md`. Structured per the requested coverage.

## 1. Academic-dishonesty vectors during exams/contests
- **Collusion / shared seats / duplicate accounts:** IP-overlap report
  (shared-IP groups + multi-IP users, `anti-cheat/route.ts:208-247`) gives
  staff the correlation view; exam-session IPs feed it. Adequate detection
  for the threat tier the doc claims. No new gap.
- **Answer sharing:** similarity engine groups by (problem, language),
  normalizes identifiers/comments/strings, Rust sidecar for scale. Two
  integrity weaknesses found: rerun destroys prior evidence timestamps
  (delete+reinsert — a manager can also legitimately "refresh away" history;
  AGG5-10, owner decision) and the >500-row fallback misreports its reason
  (CR5-3, scheduled).
- **Unauthorized AI assistance:** honestly documented as out of telemetry
  reach (`docs/exam-integrity-model.md` boundaries section); containment is
  snapshot-replay (one big paste delta) + similarity. Posture unchanged and
  truthfully stated — no false-assurance drift found.
- **Curl-from-second-device:** the heartbeat-freshness flag is the control —
  and its evidence integrity is this cycle's headline weakness (flags on
  rejected attempts dilute the signal; no submissionId/IP linkage in the
  row). See SEC5-1; scheduled as G1 with concrete hardening.

## 2. Sandbox isolation for judged code (re-verified at this HEAD)
`--network none`; memory==swap caps (compile no longer gets 4 GiB swap);
pids-limit; custom seccomp on BOTH phases with explicit, warned opt-outs;
read-only workspace option; on seccomp-init failure the worker REFUSES to
run rather than degrading (`docker.rs:479-488`). Cosmetic: vestigial
pids_limit conditional + misleading `should_retry_without_seccomp` name
(AGG5-9, register w/ exit criterion — Rust edit + worker rebuild out of this
cycle's gate surface).

## 3. Authorization boundaries between roles/groups
Spot-probed this cycle: anti-cheat GET (monitor) vs POST staff actions
(manage) split holds; code-snapshot viewer double-gate holds; TA seat cannot
extend sessions, rerun similarity, or bulk-read rosters (see
perspective-assistant). Admin bypass of integrity checks remains documented
and capability-scoped (`isAdminLevel` = `system.settings`). No privilege
regression found.

## 4. Confidentiality of hidden test cases & others' submissions
Hidden test cases flow only through the worker claim path (IP allowlist +
per-worker hashed token + body-secret recheck). Submission listings scope to
self without `submissions.view_all`; source code is excluded from judge-poll
reads and from list selects; compile output respects `showCompileOutput`
for non-staff. No leak path found this cycle.

## 5. Scoreboard / grading integrity
Judge writes are claim-token-fenced (stale zombies cannot overwrite a
reclaimed submission); final metrics computed server-side from reported
per-case results validated against `isSubmissionStatus`; ranking cache
invalidated post-verdict; IOI mode forces full test-case runs so partial
scores use the true denominator. The grading-evidence weakness is the flag
chain (G1/G2/G3), not the score chain.

## 6. Resilience/availability of judging under peak load
Per-user advisory-lock rate limit + pending caps + global queue cap (503 +
Retry-After) shed load before the queue melts; claim is single-row
SKIP LOCKED (no herd); worker death self-heals via stale-claim reclaim with
counter compensation + background sweep. The monitoring read-path cost item
is now scheduled (P5-1/G3 `includeGaps` gating) rather than deferred.

## Hardening recommendations (this cycle's actionable set)
G1 flag-on-accept + submissionId/IP/DB-time in the flag row; G2 make the
flag legible (labels/colors/details, both locales); G3 absence visibility
(gaps + ongoing boundary, opt-in compute); G4 in-flight telemetry recovery
slot; G5 similarity reason truthfulness. Registered: AGG5-9 (Rust cosmetics),
AGG5-10 (similarity-evidence history policy — owner).

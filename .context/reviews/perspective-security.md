# Persona: Authorized Defensive Security Assessment (owner's own platform) — RPF Cycle 1 (2026-06-11)

**Seat:** the platform owner red-teaming their own deployment before using it
for recruiting tests, graded exams, and contests. **HEAD:** f977ef4c.
Complements (does not replace) `security-reviewer.md`; overlapping findings are
cross-referenced, not duplicated. Defensive review only — weaknesses + fixes,
no exploit tooling.

## 1. Academic-dishonesty vectors during exams/contests

**What the platform detects today (verified in code):**
- In-browser telemetry: `CLIENT_EVENT_TYPES = tab_switch, copy, paste, blur,
  contextmenu, heartbeat` (`contests/[assignmentId]/anti-cheat/route.ts:20-27`),
  recorded with client IP, surfaced per-participant with IP column in the
  dashboard (`anti-cheat-dashboard.tsx:523,587`).
- The event-log endpoint REQUIRES a matching `Origin` header in production
  (route.ts:58-80, SEC M-8) — "curl a heartbeat every 30 s while a confederate
  takes the exam" needs full browser-environment spoofing, not one header.
- Keystroke-history review: `code_snapshots` (append-only), staff-gated by
  `contests.view_analytics` + `canViewAssignmentSubmissions`
  (`code-snapshots/[userId]/route.ts:10-17`).
- Collusion/answer-sharing: post-hoc similarity check, gated on
  `canManageContest` (`similarity-check/route.ts:21-25`), 30 s abort guard.
- Unauthorized AI: exam/contest platform modes block the AI assistant and
  standalone compiler; the global admin override is default-OFF and
  durable-audited (tracer Trace 2 — by-design, flagged to admin persona).
- Anti-cheat defaults ON for new exams in the general form (48856f17), so the
  telemetry is actually armed for typical exam creation paths.

**Weaknesses found from this seat:**

### PS1 — Duplicate-account / shared-IP collusion data is captured but never correlated (MEDIUM product gap, confidence High)
`exam_sessions.ip_address` (`schema.pg.ts:385`) and per-event IPs are stored,
and the dashboard shows a per-event IP column — but there is **no aggregation**
that flags "participants X and Y share an IP during the window" or "one user
has sessions from N distinct IPs". An instructor hunting a duplicate-account
or shoulder-pair scheme must eyeball hundreds of rows. The detection data
already exists; only the query/report is missing.
**Fix:** add a staff-only "IP overlap" section to the anti-cheat dashboard:
GROUP BY ip over exam_sessions + recent events for the assignment, listing IPs
used by >1 participant and participants with >2 IPs. Pure read query, no new
collection, no privacy expansion beyond what staff already see per-row.

### PS2 — No fullscreen-presence signal in the telemetry set (LOW, product decision, confidence High)
`CLIENT_EVENT_TYPES` has no fullscreen-enter/exit event and the exam UI does
not request fullscreen. blur/visibilitychange partially covers app-switching,
but a side-by-side second window on the same screen generates NO events.
Commercial proctoring treats fullscreen-exit as a primary signal. Recording as
a product decision (forced fullscreen is hostile UX and trivially evaded by a
second device anyway), not a defect — but it should be a *decision*, not an
accident. Document the chosen posture in `docs/` anti-cheat notes.

### Honest limitation statement (no fix exists)
Client-side telemetry cannot see a second device, a phone running an LLM, or a
human helper off-screen. The platform's real containment for those is post-hoc:
similarity check + code-snapshot replay (a paste of a full solution shows as a
single large snapshot delta + paste event). That is the correct, honest design;
instructors should be told (docs) that telemetry is deterrence + evidence, not
prevention.

## 2. Sandbox isolation for judged code (verified at `judge-worker-rs/src/docker.rs:254-331`)
Every judged execution runs with: `--network none`, `--memory`+`--memory-swap`
hard caps (compile swap tightened to = mem this wave), `--cpus` cap,
`--pids-limit 128`, `--read-only` rootfs + size-capped tmpfs, `--cap-drop=ALL`,
`--security-opt=no-new-privileges`, `--ulimit nofile=1024`, `--user 65534:65534`
(nobody), custom seccomp profile (compile phase included by default),
`--init`, and optional `--runtime=runsc` (gVisor, env-gated, doc shipped).
Output volume is env-capped (`JUDGE_MAX_OUTPUT_BYTES`).
**Assessment: strong.** Residual risk is the classic one: the worker drives the
host docker daemon, so a container/kernel escape = worker-host compromise. The
deployment topology already contains this (dedicated worker-0 host; app+DB
never co-located per CLAUDE.md), and gVisor is one env var away for syscall
filtering defense-in-depth. **Recommendation:** schedule the gVisor validation
run on worker-0 (docs/judge-worker-gvisor.md) rather than leaving it
indefinitely opt-in; no code change needed.

## 3. Authorization boundaries (student → instructor/admin data)
Re-verified the remediation wave rather than re-deriving it: private-problem
read/pick/duplicate/write scoping (091f7fac, 285f637a, 82afa260, 8b6affdd),
owner-only group transfer (b6e38593), manager-gated rosters (3dfc2cf5),
exam-session `?userId` now `canViewAssignmentSubmissions`-gated (e7e905ca).
The TA-seat boundary sweep (`perspective-assistant.md`) found no
previously-denied probe that now passes. **No student→staff crossing found.**
Open policy question stays TA1 (TAs can edit exam hidden tests —
separation-of-duties decision, not a leak).

## 4. Confidentiality: hidden test cases & other users' submissions
- Submission detail route fetches ONLY `{ sortOrder, isVisible }` from
  `testCase` (`submissions/[id]/route.ts:32-33`) — hidden input/expected
  output never leave the DB for non-staff viewers; not a sanitizer
  responsibility but a query-shape guarantee. Verified.
- `sanitizeSubmissionForViewer` (`visibility.ts:69-150`): strips
  `actualOutput` for non-visible cases, strips `sourceCode` for non-owners
  without `submissions.view_source`, honors `hideResults`/`hideScores` with
  the documented compile-error exception (own-code info only). Verified sound.
- Problem export/duplicate (hidden tests included) gated by `canManageProblem`
  (problems/[id]/route.ts:92 comment + permissions.ts:186-217). Verified.
**No confidentiality finding.**

## 5. Scoreboard / grading integrity
- IOI partial scores now computed over ALL test cases server-flagged per claim
  (claim/route.ts:326-338 + executor.rs:617-622) — the one CRITICAL integrity
  bug from the prior pass is genuinely fixed and rejudge-safe (tracer Trace 5).
- Leaderboard freeze validated inside the contest window; cache invalidated on
  assignment PATCH; overrides overlay into self-rank. Verified by verifier #7/#9.
- Remaining integrity-adjacent risk: **examMode lacks a DB CHECK constraint**
  (security-reviewer S3) — a corrupt value makes exam/not-exam readers
  disagree, which IS a grading-integrity hazard if it recurs during a term.
  Endorse S3's constraint fix at MEDIUM-leaning-LOW.

## 6. Judging-pipeline resilience under contest load
- Worker death mid-contest: staleness sweep (60 s, DB-clock) + stale-claim
  reclaim + dead-worker slot release — the pipeline now self-heals from the
  scenario that previously needed an admin (verified end-to-end by
  verifier #2/#4). Alertable reap log line exists (AD4 wants it in the runbook).
- **CR1 self-reclaim `active_tasks` leak is the live availability item from
  this seat too:** under exactly contest-day pathology (long compiles → stale
  claims on a busy-but-alive worker) capacity silently shrinks by one slot per
  occurrence and never returns without restart. Endorse CR1 as this cycle's
  top fix (MEDIUM).
- Floods: submission creation is per-user rate-limited
  (`submissions/route.ts:201`), judge claim is token-fenced + SKIP LOCKED,
  `/register` rate limit ordered after token auth (L1, verified). The new
  draft-autosave PUT stream is the one NEW write source at contest start —
  bounded (3 s debounce + rate limit) but monitor it (perf P3); and S1's
  junk-language upsert rows should be closed this cycle to keep the draft
  table from becoming an amplification surface.

## Verdict
No HIGH finding from this seat. The platform's exam/contest security posture is
materially credible for the owner's three use cases. This cycle's actionable
list from this persona: **PS1** (IP-overlap report — cheap, high investigative
value), endorse **CR1 / S1 / S3** for immediate fix, **PS2** + telemetry-limits
documentation as LOW notes.

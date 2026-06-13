# Perspective: Security (authorized defensive assessment) — RPF Cycle 7 (2026-06-13)

Authorized, defensive hardening assessment of the owner's own platform
(complements `security-reviewer.md`). Focus: academic-dishonesty detection,
sandbox isolation, authorization boundaries, confidentiality of hidden tests
and other users' submissions, scoreboard/grading integrity, and judging-
pipeline resilience under peak contest load. **HEAD 0472b007.**

## §1 — Academic-dishonesty vectors & detection coverage
- **Collusion / shared seat / duplicate accounts:** the IP-overlap report
  (anti-cheat GET `report=ipOverlap`, route.ts:225-263) correlates shared IPs
  and multi-IP users over data already collected — good detection surface. The
  curl-only bypass ("confederate takes the exam, script sends heartbeats") is
  meaningfully raised by (a) the production Origin pin on the ingest POST
  (route.ts:63-79) and (b) the submit-time heartbeat-freshness correlation
  (submissions.ts:374-402) requiring a recent BROWSER event before accepting a
  submission. **Weakness (LOW, surfaces CR7-2):** the proctor's PRIMARY
  evidence view (dashboard) drops/duplicates rows, degrading the analyst's
  ability to act on the very signals the platform collects. Hardening: fix the
  dashboard paging fidelity (AGG7-1) so evidence is a faithful, stable list.
- **Server-originated event forgery:** the POST schema is
  `z.enum(CLIENT_EVENT_TYPES)`, so a contestant cannot inject `ip_change` /
  `code_similarity` / `submission_stale_heartbeat` to pollute or mask the
  timeline — verified intact. (The doc oversells this: DOC7-1/V7-2 — fix the
  doc, the control is correct.)

## §2 — Authorization boundaries between roles/groups
- `canMonitorContest` is read-only and group-scoped; `canManageContest` gates
  all writes; `submissions.view_all` does not promote to manage on another
  instructor's private contest. Verified correct (see perspective-assistant).
- **Token lifecycle gap (MEDIUM, CONFIRMED):** the access-token validity rule
  is now uniform, but expiry is not maintained across schedule edits
  (SEC7-1/A7-1). A SHORTENED contest leaves tokens that OUTLIVE the new close,
  re-granting ingest/catalog visibility past the close the instructor set
  (submissions are still schedule-bound, so grading integrity holds). Hardening:
  sync token expiry on edit — closes both the over-grant (shorten) and the
  under-grant lockout (extend).

## §3 — Confidentiality of hidden tests & other users' submissions
- Submission detail (`submissions/[id]/route.ts`) gates on
  `canAccessSubmission` then runs `sanitizeSubmissionForViewer`, which respects
  per-problem `showCompileOutput`/`showDetailedResults`/`showRuntimeErrors` and
  test-case `isVisible`. Verified: a student cannot read hidden-test details or
  another user's source via this route. No finding.

## §4 — Scoreboard / grading integrity
- Leaderboard freeze + auto-unfreeze, per-assignment ranking cache with
  explicit invalidation on every score-affecting edit (judge/rejudge/override/
  PATCH), single-user live-rank that overlays `score_overrides` to agree with
  the board. Listing-order nondeterminism (CR7-1) does NOT affect computed
  ranks (ranking is a GROUP BY aggregate, not a paged list). No grading-
  integrity finding this cycle.

## §5 — Sandbox isolation & judging-pipeline resilience
- The judge claim CTE uses `FOR UPDATE SKIP LOCKED` + a fresh claim-token fence
  so a zombie worker cannot double-write, and stale claims are reclaimable
  (self-healing). The background staleness sweep reaps dead workers and
  reconciles `active_tasks` even in the single-worker topology. Under peak
  contest load this is the right shape; no new resilience weakness found.
  (Sandbox image/seccomp hardening lives in the Rust worker, outside this
  cycle's configured gates — carried, unchanged.)

## Net (security persona)
One MEDIUM hardening item — complete the token-expiry lifecycle (SEC7-1) — and
one LOW that improves DETECTION usability (dashboard evidence fidelity,
AGG7-1). Plus the doc-control mismatch (DOC7-1). Core authz, confidentiality,
grading integrity, and pipeline resilience are sound at this HEAD.

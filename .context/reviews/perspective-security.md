# Persona review — Authorized defensive security assessment (RPF cycle 4, 2026-06-11)

**HEAD reviewed:** 7c0a4bd4. Scope: academic-dishonesty vectors, sandbox
isolation, role/group authorization boundaries, hidden-testcase and
submission confidentiality, scoreboard/grading integrity, judging-pipeline
resilience. Owner-authorized defensive review; weaknesses cited with fixes,
no exploit tooling.

## 1. Academic-dishonesty detection — TWO weaknesses this cycle (the headline)
**W1 (MEDIUM-HIGH, High, CONFIRMED).** Evidence fabrication by the platform
itself: `submission_stale_heartbeat` escalate flags are inserted on problem
page renders and editor autosaves (`page.tsx:167`,
`code-snapshots/route.ts:62` → `submissions.ts:343-354`). Detection value of
the tier collapses under guaranteed false positives. Hardening: record the
flag ONLY on the submit path (explicit opt-in parameter); red-first tests on
the non-submit paths.
**W2 (MEDIUM, High, CONFIRMED).** Detection evasion via self-suppression: the
freshness probe (`submissions.ts:320-330`) accepts ANY event type, so
server-inserted rows (the flag itself; `code_similarity`) count as browser
liveness. A second-device submitter is flagged at most once per 90 s.
Hardening: probe must filter to client-emitted types (move
`CLIENT_EVENT_TYPES` to lib, `inArray` filter).
Coverage of the remaining vectors re-confirmed unchanged: collusion (IP
overlap report + similarity engine), duplicate accounts (shared-IP report),
unauthorized AI assistance (out of band — owner accepts; code snapshots
provide keystroke-growth evidence), curl bypass (origin pinning + W1/W2
fixes restore the flag trail).

## 2. Sandbox isolation — no change since cycle-1/2 review
`judge-worker-rs` untouched since the last deep review (git log verified); the
per-worker token model (`judge/auth.ts`) prevents a leaked shared token from
forging results for registered workers. No new findings; carry the standing
posture (container isolation + image catalog managed on worker-0 only).

## 3. Authorization boundaries — probed, held
- Student → staff data: exam-session cross-reads require group-instructor
  standing even with analytics capability (cycle-3 G4 kept the gate; tests
  pin it). Anti-cheat GET requires monitor standing; snapshots read path
  requires analytics + group-scoped review rights.
- Student → other students: no route found returning another participant's
  events/code without the above gates; the self-fallback on `?userId=`
  prevents enumeration responses.
- TA: read-only supervision confirmed (see perspective-assistant TA4-4).

## 4. Hidden test cases / submission confidentiality
No regression: testcase storage and submission read gates unchanged this
cycle; accepted-solutions route remains gated by solve-status (cycle-1/2
review). Nothing in the cycle-3 diff touches these.

## 5. Scoreboard/grading integrity
Late-penalty scoring keys on `personal_deadline` consistently with the new
effective-close contract; score overrides require manage rights; leaderboard
freeze validation rejects out-of-window freezes including via PATCH (merged
revalidation). No integrity gap found this cycle beyond W1/W2's effect on
human review of contested results.

## 6. Judging-pipeline resilience under contest load
Background staleness sweep removes the silent-dead-worker mode; submission
admission control (per-user rate, pending caps, global queue cap inside one
advisory-locked transaction, `submissions/route.ts:287-330`) holds the line at
the API; queue-status endpoint gives users feedback rather than retries.
Watch item only: P4-1 monitoring-read cost during a large live contest
(deferred with exit criterion).

## Verdict
Fix W1+W2 this cycle (scheduled as plan G1/G2). No other security-relevant
deltas since cycle 3; previously-verified controls re-confirmed at this HEAD.

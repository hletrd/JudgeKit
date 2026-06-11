# Test Engineer — Cycle 9 (RPF)

**Date:** 2026-05-29 · **HEAD:** 24939e42 (main)

## Baseline
`npm run test:unit` → 2472 tests / 321 files PASS (exit 0).

## Coverage of recently changed code
- **Leaderboard live rank**: `tests/unit/assignments/leaderboard-live-rank-logic.test.ts`
  pins the per-problem-best invariant (cycle-8). Present, green.
- **Contest overrides**: `tests/unit/assignments/contest-scoring-overrides.test.ts`
  covers IOI override overlay. Present, green.
- **Email templates / providers**: searched `tests/` — escapeHtml and provider
  send paths have unit coverage from the cycle that introduced HTML escaping.

## Observation (NOT a net-new finding)
The email **subject** lines (`renderRecruitingInvitationEmail`,
`renderSiteEventEmail`) are not asserted to be CR/LF-safe at the application
layer. The transport (nodemailer) strips CR/LF and HTTP providers send JSON, so
there is no exploitable gap (see security-reviewer). Adding an app-layer
defense-in-depth subject sanitizer + test would be a *nice-to-have* but is not
required (no vulnerability to close) and would be net-new scope, not a review
finding — explicitly NOT manufacturing it per the orchestrator's convergence
guidance.

## Carried deferred test items (unchanged)
C7-AGG-6 (participant-status time-boundary tests), DEFER-ENV-GATES (DB-backed
integration tests, no provisioned CI host). Re-defer.

## Verdict
No net-new test-gap finding that closes a real defect. Suite green.

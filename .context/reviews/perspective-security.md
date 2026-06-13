# Perspective — Security (authorized defensive assessment) — RPF Cycle 9 (2026-06-13)
*(Owner-authorized hardening review of the owner's own platform.)*

**HEAD:** da6179f3.

## §1 Academic-dishonesty / integrity-evidence completeness (MEDIUM, via CR9-1)
The code-snapshot timeline is a primary collusion/paste-detection evidence
surface. Its paged read (`code-snapshots/[userId]/route.ts:54`) orders by
`created_at` only with offset paging — same-millisecond snapshots can drop or
duplicate at page seams, so the integrity evidence an instructor/recruiter acts on
may be incomplete. **Hardening:** add the `id` tiebreak so the evidence listing is
deterministic and complete; a contested misconduct finding must rest on a stable
record. Complements (does not reopen) the deferred AGG8-2 heartbeat-gap-scan order.

## §2 Authorization boundaries between roles/groups
Re-audited the snapshot, recruiting-invitation, and accepted-solutions routes:
capability gates (`contests.view_analytics`, `canViewAssignmentSubmissions`) and
the `assignmentId IS NULL` + anonymity filters on accepted-solutions are intact.
No cross-role / cross-group leak introduced this cycle.

## §3 Confidentiality of hidden tests & other users' submissions
accepted-solutions still excludes assignment-tied submissions and nulls the
author id for anonymous shares — no peer-code or hidden-test leak. No change.

## §4 Token/access lifecycle
The effective-close expiry invariant holds at all 4 token sites after AGG8-1 — no
over-grant past close, no dishonesty window. Converged.

## §5 Sandbox isolation / scoreboard / peak-load resilience
No NEW weakness vs the cycle-8 assessment. Judge claim/heartbeat reaping, worker
secret-token auth, and rate limiting unchanged and sound.

## Not deferrable
§1 is correctness on an integrity-evidence surface; repo rules permit no deferral
of correctness/security findings.

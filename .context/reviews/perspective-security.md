# Persona: Authorized Defensive Security Assessment (owner's platform) — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035. Defensive review of the owner's own system for
exam/contest/recruiting use. No exploit tooling; weaknesses + fixes only.

## 1. Academic-dishonesty vectors
- **Collusion/duplicate accounts:** materially improved this cycle — the
  ipOverlap report (F11) correlates exam-session + event IPs per assignment
  (staff-gated, advisory framing). Residual: VPN-split collusion remains
  detectable only via similarity analysis (code-similarity-rs pipeline,
  which exists and is staff-triggered) — acceptable layered posture.
- **Scripted client / curl-while-confederate-works:** the anti-cheat POST
  requires a present AND matching Origin in production
  (`anti-cheat/route.ts:63-79`), heartbeats dedup to 60 s, and contest
  boundaries are checked on DB time. Evasion requires deliberate browser
  spoofing — within the documented threat model (signals, not prevention).
- **Unauthorized AI assistance:** restricted platform modes force AI off
  unless an admin override is active; the override is now LOUD in the
  settings UI (F10) and single-sourced in code (F8). Second-device AI use
  is out of technical scope by documented decision (PS2 carried,
  exam-integrity-model.md).
- **Answer sharing pre-exam:** hidden test cases are not exposed by any
  student-reachable route (problem GET strips test data; export route is
  staff-gated; accepted-solutions gated on having solved). Re-verified the
  draft/snapshot surfaces don't leak others' rows (keyed to user.id).

## 2. Sandbox isolation (judge)
Re-checked judge-worker-rs at HEAD: custom seccomp by default (compile AND
run containers), per-language images, cgroup memory caps + OOM detection,
explicit retry-without-seccomp only on profile-load failure signatures.
JUDGE_DISABLE_CUSTOM_SECCOMP=0 in generated env. No changes this cycle; no
new findings. Worker hosts isolated from app server (algo app-only per
CLAUDE.md).

## 3. Authorization boundaries
- New PATCH extend endpoint: write-gate + chain validation correct (see
  security-reviewer SEC2 "audited and found sound").
- Student → instructor/admin data: probed the new surfaces; ipOverlap is
  monitor-gated; status board is server-gated by board capability; problems
  catalog scoping (taught-groups vs enrolled) verified intact after the F3
  rewrite (scope filter still applied inside the ranking CTE).

## 4. Confidentiality of submissions/drafts/snapshots
- Drafts and snapshots are user-keyed; snapshot READ route
  (`contests/[assignmentId]/code-snapshots/[userId]`) is staff-gated.
- **WEAKNESS (SEC2-2, MEDIUM):** snapshots are retained FOREVER — every
  candidate's/student's in-progress code accumulates indefinitely. For a
  recruiting deployment this is a data-protection liability (candidate code
  + IP correlation with no expiry). Fix: 180 d retention aligned with
  anti-cheat events + policy doc row. (Also SEC2-1: unvalidated language
  string on the same table's write path.)

## 5. Scoreboard/grading integrity
- exam_mode CHECK constraint (F6) closes the corrupt-value desync between
  exam gates. Extensions and score overrides are durably audited. Claim
  token fence prevents zombie-worker double-finalize (re-traced). Ranking
  cache invalidated on finalize. No new findings.

## 6. Judging pipeline resilience under contest load
- Claim accounting verified sound at HEAD (see verifier F1 verdict);
  stale-claim reclaim is self-healing; worker reap sweep runs in background.
- **WEAKNESS (CR2-2/D2-1, LOW-MEDIUM):** the rate-limit layer itself can
  500 on first-use key races — under a contest-start stampede this is noise
  in the security control exactly when load is highest. Fix scheduled.
- **WEAKNESS (ops, HIGH — DEFERRED-OPS-1):** the deploy path's BuildKit
  corruption delays shipping judge-image fixes to the fleet; hardening
  scheduled this cycle with the confirmed remedy.

## Priority fixes from this seat
1. Deploy hardening (availability of the judge fleet's update path).
2. code_snapshots retention + language gate (confidentiality/minimization).
3. Rate-limit race fix (robustness of a security control).

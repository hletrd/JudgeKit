# Perspective: Authorized Defensive Security Assessment — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72. Owner-authorized hardening review of JudgeKit's exam/contest
integrity and judging pipeline.

## 1. Authorization boundaries between join paths — ONE inconsistency (MEDIUM)
The contest access-token expiry — a security-relevant access predicate — is
canonical at the invite and schedule-edit paths but NOT at the **access-code
redemption** path (`access-codes.ts:191`, bare `deadline`). The defect is
*restrictive* (expiry set earlier than the rule), so it cannot over-grant access
past the close — there is no privilege-escalation here. It does create
inconsistent access lifetimes across join paths and prematurely de-provisions
token-keyed visibility during a configured late window. **Fix:** canonical
`contestAccessTokenExpiry(assignment)`. Structural hardening (A8-1): funnel all
token inserts through one values-constructor so a future grant site cannot
diverge.

## 2. Hidden test cases & other users' submissions — confidentiality intact
- Submission listing/access goes through the enrollment-or-valid-token gate;
  hidden test cases are server-side only. No new leak path introduced. ✅

## 3. Sandbox isolation for judged code — unchanged, healthy
- Optional gVisor (runsc) runtime available (b3497c75); compile time/memory
  limits configurable to bound compiler-bomb DoS (86999c13). No regressions this
  cycle (judge-worker-rs not edited). ✅

## 4. Scoreboard / grading integrity — unchanged, healthy
- IOI live-rank uses per-problem best with override overlay (f0d79935/15b37782);
  ranking aggregates are GROUP-BY and unaffected by the listing-order tiebreak
  work. Leaderboard freeze preserved across edits. ✅

## 5. Academic-dishonesty detection — intact
- IP-overlap (duplicate-account/shared-seat), similarity (Rust default + TS
  fallback), anti-cheat telemetry with server-only event classes rejected from
  client POST. Dashboard evidence no longer drops rows (cycle-7). ✅

## 6. Availability under peak contest load — one early-de-provision risk (the
CR8-1 expiry) aside, no new bottleneck. Listing-order change is index-friendly;
poll/loadMore merges are O(page). ✅

## Carried deferral (security/evidence policy): AGG5-8 (similarity rerun resets
first-flagged timestamps) — owner evidence-retention decision; carried.

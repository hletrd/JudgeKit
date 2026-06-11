# Perspective: Authorized Defensive Security Assessment — RPF Cycle 6 (2026-06-12)

Owner-requested defensive review of the owner's own platform (JudgeKit) ahead of recruiting tests, graded exams, and contests. Complements `security-reviewer.md`; organized by threat surface with detection/defense verdicts.

**HEAD reviewed:** 22e1510f.

## 1. Academic-dishonesty vectors during exams/contests
- **Curl-only bypass (decoy tab + second device):** DEFENDED + DETECTED. Origin-pinned ingest (`anti-cheat/route.ts:54-78`) raises scripting cost; the submit-time freshness probe attaches an escalate flag with submission linkage to every accepted out-of-monitor submission. Verified no rejected-attempt flag pollution remains (tracer Trace 4).
- **Collusion / shared seat / duplicate accounts:** DETECTED (reviewer-driven). ipOverlap report correlates event+session IPs both directions (shared IP ↔ many users; one user ↔ many IPs); similarity scan (language-bucketed, identifier-normalized) covers answer sharing. GAPS: stored similarity evidence lacks the language dimension (SEC6-3 → fix), and the rerun's delete+reinsert resets first-flagged timestamps (AGG5-8 — open owner policy, carried).
- **Unauthorized AI assistance:** PARTIALLY out of scope by design — platform states this honestly to reviewers (`reviewNoticeAiUndetectable`). Behavioral signals (paste bursts into the editor, coverage gaps) are the available proxies; both now render legibly. No overclaim found.
- **Access after disqualification:** **WEAK — the cycle's main finding (SEC6-1).** Roster removal doesn't revoke `contest_access_tokens`; the submit and contest-detail gates skip the expiry check three sibling gates enforce. Hardening: shared expiry-checked predicate + revocation in the member-removal tx + effective-close expiry at creation. Until fixed, "removed" participants can keep submitting.

## 2. Sandbox isolation of judged code
Not re-traced this cycle (no Rust/worker changes since the cycle-4/5 validations; AGG5-7 cosmetics pending a behavioral edit). Standing posture from prior cycles' validation holds: pids-limit/seccomp fail-closed gating, no-network containers, per-language images on the dedicated worker host. Exit criterion to re-trace: any judge-worker-rs behavioral edit or a new language image class.

## 3. Authorization boundaries between roles/groups
- TA/assistant proctoring is read-only and assigned-group-scoped (verified by probe — see perspective-assistant).
- `submissions.view_all` deliberately does NOT open the contest catalog (`getContestsForUser:135-140`) — cross-role leak checked, holds.
- The one drifted boundary is the token gate family (SEC6-1).

## 4. Confidentiality of hidden test cases & others' submissions
No changes on these surfaces this cycle; spot-checks: submission GET scopes non-`view_all` users to their own rows (`submissions/route.ts:48`); compile-output redaction respects `showCompileOutput` consistently incl. the create response (`:466-469`). Hidden-test-case routes untouched since their last hardening pass.

## 5. Scoreboard / grading integrity
Score overrides, IOI late-penalty SQL, and leaderboard freeze were not modified this cycle; the single-source case-expr (`buildIoiLatePenaltyCaseExpr`) is consumed by status/leaderboard/stats alike (consistency verified at the call-site level). Recommend cycle-7 rotate a deep lens here (critic §4 concurs).

## 6. Judging pipeline resilience under live-contest peak
- Claim path: token-fenced, `SKIP LOCKED`, stale-reclaim with counter reconciliation; deadlock between mutual reclaims documented as self-recovering retry.
- Dead-fleet detection no longer depends on surviving heartbeats (background sweep).
- Backpressure: per-user pending cap + global queue cap return honest 429/503 + Retry-After BEFORE insert — the DB doesn't bloat under flood; advisory per-user lock serializes burst submitters.
- Telemetry ingest at 500 concurrent examinees ≈ single-digit writes/s. PASS.

## Hardening recommendations (this cycle)
1. SEC6-1 token lifecycle (predicate + revocation + creation expiry) — MEDIUM, do first.
2. AGG6-2 queue-first `reportEvent` — closes the last silent evidence-loss window.
3. D6-3 LRU eviction on insert failure — protects the freshness margin the escalate flag depends on.
4. SEC6-3 language in similarity evidence — dispute-grade evidence quality.

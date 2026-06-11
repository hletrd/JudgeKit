# Persona: Authorized Defensive Security Assessment (owner's platform) — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97. Scope per the owner's brief: academic-dishonesty vectors and anti-cheat coverage, sandbox isolation, role/group authorization boundaries, hidden-test-case and submission confidentiality, scoreboard/grading integrity, judging-pipeline resilience. Defensive review; weaknesses + fixes, no exploit tooling. Focus this cycle: the cycle-1/2 delta; standing areas re-checked at the gate level.

## 1. Academic-dishonesty vectors / anti-cheat coverage
- **WEAKNESS (MEDIUM-HIGH, High, CONFIRMED) — accommodation blackout = unmonitored exam time + fabricated flags.** `anti-cheat/route.ts:102-104` vs `extendExamSession`. Adversarial framing: a participant who knows the platform (or observes the 403s in devtools) learns that the extension window is UNMONITORED — tab-switching, copy/paste, and the second-device decoy pattern are all invisible there; simultaneously honest extended users accrue false `submission_stale_heartbeat` flags, polluting the very evidence stream a reviewer would use. Fix: honor `personal_deadline` at the ingest boundary (CR3-1) + regression tests. This is the only NEW dishonesty-vector regression found this cycle.
- **Duplicate accounts / collusion:** the IP-overlap report closes the correlation gap flagged in cycle 1 (PS1); gate verified (`canMonitorContest`), parameterized SQL, LIMIT-bounded. Residual: VPN-split collusion remains out of scope by design (documented telemetry boundary).
- **Unauthorized AI assistance:** posture unchanged and honestly documented (similarity + snapshot replay as post-hoc containment). The stale doc claim about hard-blocking (DOC3-1) must be fixed so reviewers know the curl path is flag-only — an owner reading the current doc would over-trust the control.
- **Heartbeat-correlation gate:** fail-open by design (fairness rationale in code). Verified the flag write cannot itself block submission (`.catch` + warn). Acceptable; document it (DOC3-1).

## 2. Sandbox isolation (judged code)
No changes to `judge-worker-rs` execution, seccomp/gvisor posture, or language images in cycles 1–2 (verified by commit file lists). Standing posture (gvisor/crun, no-network judge containers, resource caps) carries; no re-audit trigger fired. Carried items (PS2 runtime-hardening follow-ups) unchanged in the register.

## 3. Authorization boundaries (roles/groups)
New-surface checks, all verified at the route level this cycle: extension PATCH (manage-gated), ipOverlap (monitor-gated), cross-user session GET (submissions.view-gated + enrollment check + silent self-fallback for non-staff), code-snapshots POST (problem access + assignment-context validation + per-user limit). No student→staff or cross-group reach found through the new endpoints. The `/api/v1/test/seed` endpoint remains production-inert (NODE_ENV gate ahead of the token gate).

## 4. Hidden test cases & submission confidentiality
Untouched by cycles 1–2 (no route changes in problems/test-cases/submissions read paths). Standing gates re-skimmed: hidden-case payloads stay server-side; cross-user submission reads remain capability-gated. No new findings.

## 5. Scoreboard / grading integrity
- Extensions are durably audited with actor/target/amount/new-deadline — grading-relevant time changes are reconstructable (good).
- Late-penalty scoring keys on `personal_deadline` (`submissions.ts:641-655`) so an extension cannot create an un-penalized late path beyond what staff granted; concurrent extensions compose in SQL (no lost update).
- Leaderboard freeze / hide-scores logic untouched this cycle.

## 6. Judging-pipeline resilience under live-contest load
- Crashed-worker detection no longer depends on surviving workers' heartbeats (background sweep) — the documented single-worker prod topology now has a watchdog. Reap signals log loudly for alerting ahead of the Prometheus scrape.
- The first-insert rate-limit race (a 500 inside a security control, reachable under burst load on fresh keys — exactly contest-start conditions) is fixed conflict-safely at all four sites and the shared core; verified + tested.
- Deploy self-heal removes the operational class most likely to leave a fleet half-built mid-contest-week (BuildKit history corruption).
- New steady-state poll load (exam-session GET) is modest but trims further with PERF3-1.

## Summary for the owner
One new MEDIUM-HIGH weakness (accommodation blackout — fix this cycle, before any live exam that might need an extension), one MEDIUM documentation-integrity fix (fail-open posture must be stated truthfully), and a set of verified hardening wins from cycles 1–2 that materially improve live-exam operability. No Critical findings at this HEAD.

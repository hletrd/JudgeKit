# RPF Cycle 3 — Critic (multi-perspective)

**Date:** 2026-04-29
**HEAD reviewed:** 66146861

## Multi-perspective critique of the cycle-2 → cycle-3 transition

### From the operator's perspective

Cycle-2 deploy failed at the nginx step due to sshpass MaxStartups throttling. Cycle-2 plan deferred Task B (SSH ControlMaster) but the cycle's own exit criterion ("a third sshpass-related deploy failure") was met during the cycle's deploy attempts (#1 fatal, #2 recovery-blocked). Cycle 2 then deployed the ControlMaster fix in commits `21125372` and `66146861` *after* the plan was authored — meaning the plan said "DEFERRED" but the implementation actually happened.

This is a process inconsistency, not a code bug. The cycle-2 plan-vs-implementation drift should have been reconciled before the cycle closed. From the operator's view: the deploy works now, but the plan history reads "Task B deferred this cycle" when in reality it was implemented this cycle. Future planners reading the plan timeline would underestimate cycle-2's effort.

**C3-CT-1 [INFO] Cycle-2 plan Task B claims "DEFERRED" but implementation landed in commits 21125372 + 66146861.**
- File/lines: `plans/open/2026-04-29-rpf-cycle-2-review-remediation.md:30-44`.
- Severity: INFO (not a deferrable finding — it's a meta-process observation).
- Suggested fix: Cycle-3 plan should add a one-line note: "Task B from cycle-2 plan was implemented in cycle-2 commits 21125372 + 66146861 (between plan-write and cycle-close); cycle-2 plan claims DEFERRED but the actual status was DONE."
- This is non-blocking. No code change required.

### From the reviewer's perspective

The cycle-2 reviewers (per the per-agent files) had already drafted findings at HEAD `fab30962` — a stale base — and the aggregate noted this and re-verified each finding at `c449405d`. That's good provenance handling. But the cycle-2 plan's Task B exit criterion ("a third sshpass-related deploy failure") was already met *during* the cycle (#1 fatal, #2 recovery-blocked) — the criterion should have triggered a re-plan to "IMPLEMENT THIS CYCLE", not "DEFER TO NEXT CYCLE". The "Roll forward to cycle 3" note at line 44 acknowledges this; the work then *did* happen mid-cycle but in commits authored to fix the deploy, not as plan-tracked work.

**C3-CT-2 [LOW] No automated check catches "deferred this cycle" + "implemented this cycle" double-counting.**
- File: process-level (no code).
- Severity: LOW.
- Suggested fix: PROMPT 2 boilerplate could include "If a deferred task's exit criterion is met DURING the same cycle's PROMPT 3 work, update the task's status to DONE in the cycle's plan before the cycle report." Process change only.

### From the auditor's perspective

The plan-tracked deferred-fix register currently lists `C2-AGG-2` as DEFERRED. Anyone auditing "what's the LOW-severity backlog" would see this as open. In reality the deploy-blocker is fixed; only the SSH/sudo-password decoupling remains (C3-CR-2). The auditor would benefit from clearer status.

**C3-CT-3 [LOW] `C2-AGG-2` should be split into `C2-AGG-2A` (deploy-blocker, DONE in 21125372 + 66146861) and `C2-AGG-2B` (SSH/sudo password decoupling, still DEFERRED).**
- File/lines: `plans/open/2026-04-29-rpf-cycle-2-review-remediation.md:30-44`.
- Severity: LOW.
- Suggested fix: cycle-3 plan splits the finding and marks A as DONE in this cycle's plan crossover note.

### From the production-incident-responder perspective

If the next deploy fails, the operator's first move is `tail -f` of deploy-docker.sh output. The script has no "deploy ID" in its log lines, so multi-deploy logs interleave. Adding a `DEPLOY_ID=$(date +%s)` and prefixing every log line with `${DEPLOY_ID}` would help post-hoc analysis. Not new for cycle 3 but worth noting.

**C3-CT-4 [LOW] Deploy log lines lack a deploy-instance prefix; multi-deploy log analysis is harder than necessary.**
- File: `deploy-docker.sh` (whole file).
- Severity: LOW.
- Suggested fix: One-time `DEPLOY_ID=$(date -u +%Y%m%dT%H%M%SZ)` at the top, then update `info()`, `success()`, `warn()`, `error()` to prefix `[${DEPLOY_ID}]`. Backwards-compatible (doesn't change exit codes or behavior).

## Carry-forward critic notes

**C2-CT-INFO-1 (carry):** "Deploy hardening is under-served." The cycle-2 critic flagged this. Cycles 1+2 have started addressing it (SKIP_LANGUAGES env-honor, chmod 0600, ControlMaster, retry loop). The trend is positive. No new deferred finding this cycle.

## Summary

- 4 new findings: 1 INFO (C3-CT-1, process), 3 LOW (C3-CT-2, C3-CT-3, C3-CT-4).
- All are process / observability concerns; no production code defects.

**Total new findings this cycle:** 3 LOW + 1 INFO.

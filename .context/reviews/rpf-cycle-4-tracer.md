# RPF Cycle 4 — tracer perspective (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `e61f8a91`

## Causal traces

### Trace 1: cycle-3 deploy success → no `src/` regression

**Hypothesis A:** Cycle-3 deploy succeeded on first attempt because the SSH ControlMaster fix from cycle 2 stably handles the auth flake.

**Evidence:**
- Orchestrator history: "Cycle 3 had clean deploy (0 Permission-denied lines)."
- Code at HEAD `e61f8a91`: `deploy-docker.sh:153` still includes `ControlMaster=auto -o ControlPath=${SSH_CONTROL_DIR}/cm-%C -o ControlPersist=60`.
- `deploy-docker.sh:151` still uses `mktemp -d /tmp/judgekit-ssh.XXXXXX` (the cycle-2 macOS path-length fix).

**Hypothesis A confirmed.**

**Competing hypothesis B:** Cycle-3 deploy succeeded because the target sshd was less loaded that day.
- **Counter-evidence:** Cycle-1 / cycle-2 deploys against the same target failed at the rapid-fire-auth boundary (the nginx config heredoc step). If the target were just less loaded, we'd expect non-deterministic behavior across cycles, not a clean transition from "always-failing" to "always-succeeding".
- **Verdict:** Hypothesis A supported by deterministic transition; Hypothesis B refuted.

### Trace 2: cycle-3 plan reads "deferred to cycle 3 IN-PROGRESS" but commits show DONE in cycle-2 (resolved)

This is C3-AGG-1 from cycle-3, already addressed by the cycle-3 closure note in `plans/open/2026-04-29-rpf-cycle-2-review-remediation.md`. Tracer notes the closure note is correct and present at HEAD.

### Trace 3: Are there latent SSH ControlMaster failure modes the trace missed?

**Hypothesis A:** The current ControlMaster setup is robust on the target.

**Evidence:**
- `ControlPersist=60` keeps the master alive 60 s past the last child connection. Long-running deploy steps (e.g. `docker build` >5 min) re-use the master while it is alive, but if the master times out *during* a long step and a subsequent `remote*` call fires, the call must auth fresh — which is the cycle-2 sshpass flake recurring under a different timing pattern.
- `ServerAliveInterval=30` + `ServerAliveCountMax=3` = 90 s of idle tolerance. This is shorter than a typical `docker build` that waits on a slow APT mirror.

**Hypothesis A partially refuted.** The fix is robust *for short, sequential remote calls* but has a known failure mode for long-idle waits between calls. C3-AGG-3 already names this. No new tracer finding.

## Confidence

High that no new tracer findings exist this cycle. Cycle-3's traces remain valid at HEAD.

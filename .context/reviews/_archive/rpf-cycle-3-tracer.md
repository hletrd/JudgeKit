# RPF Cycle 3 — Tracer (causal tracing of suspicious flows)

**Date:** 2026-04-29
**HEAD reviewed:** 66146861

## Trace 1: Cycle-2 sshpass MaxStartups throttling → ControlMaster resolution

**Hypothesis A (cycle-2 working hypothesis, kept):** Repeated sshpass-driven SSH handshakes against `platform@10.50.1.116` triggered sshd `MaxStartups` rate-limiting and/or fail2ban throttling, causing intermittent "Permission denied" with valid credentials.

**Hypothesis B (alternative):** PAM throttling on the target host. Equally consistent with the symptom.

**Hypothesis C (alternative):** sshpass tty allocation race — sshpass writes the password before sshd's prompt is fully ready, causing the prompt to swallow a partial input.

**Evidence collected this cycle:**
- Cycle-2 deploy log shows "Permission denied (publickey,password)" at the nginx step on attempt #1 and at `docker info` pre-flight on attempt #2 (recovery).
- Cycle-3 deploy log shows 0 "Permission denied" lines.
- Cycle-2 commits add SSH ControlMaster (single auth + reuse) AND ServerAliveInterval=30 (keepalive on the master). Either of these alone would mitigate Hypothesis A; both together would also mitigate Hypothesis B (PAM also resets per-connection state, so multiplexing skips it). Hypothesis C is mitigated by reducing the count of password-fed handshakes from N to 1.

**Causal verdict:** All three hypotheses are mitigated by the cycle-2 fix. The fix is correct regardless of which root cause was primary. No further trace-level investigation needed.

**No finding** — the trace converges on a working fix.

## Trace 2: Cycle-1 deploy-script SKIP_LANGUAGES regression

**Hypothesis:** Cycle-1's `bdfc79e1` fix to honor `SKIP_LANGUAGES=true` env var added `${VAR:-default}` parameter expansion. Future regressions could revert to unconditional `SKIP_LANGUAGES=false`.

**Evidence at HEAD 66146861:**
- `deploy-docker.sh:78-82` — `SKIP_BUILD="${SKIP_BUILD:-false}"`, `SKIP_LANGUAGES="${SKIP_LANGUAGES:-false}"`, `LANGUAGE_FILTER="${LANGUAGE_FILTER:-}"`, `INCLUDE_WORKER="${INCLUDE_WORKER:-true}"`, `BUILD_WORKER_IMAGE="${BUILD_WORKER_IMAGE:-auto}"`. CONFIRMED.
- The `for arg in "$@"` loop (lines 83-114) only sets `SKIP_LANGUAGES=true` (never `=false`). CONFIRMED — the env-var precedence is preserved.

**Causal verdict:** Cycle-1's fix is intact. No regression. C2-AGG-4 (deploy regression test) remains as deferred guardrail-type finding.

**No finding.**

## Trace 3: Cycle-2 chmod 0600 .env.production fix

**Hypothesis:** The chmod-0600 fix (`ab31a40f`) might be effective only on the fresh-generation path, not on existing-file deploys.

**Evidence at HEAD 66146861:**
- `deploy-docker.sh:277` — chmod 0600 after fresh heredoc. CONFIRMED.
- `deploy-docker.sh:283` — `chmod 0600 "${SCRIPT_DIR}/.env.production" 2>/dev/null || true` on existing-file path. CONFIRMED defense-in-depth.

**Causal verdict:** Both paths are covered. No bypass. No finding.

## Trace 4: Cycle-3 — does the ControlMaster fix interact with the chmod-0600 fix or the SKIP_LANGUAGES fix?

**Hypothesis:** Combinatorial regressions could exist. E.g., the ControlMaster trap fires on EXIT and `rm -rf` the socket dir; if `set -e` is active and a subsequent step fails, the trap fires. Could it interact with the `.env.production` chmod path?

**Evidence:**
- The chmod 0600 happens at lines 277 and 283 — before any `remote*` call (those start at line 232 with `_initial_ssh_check`). So the trap firing later cannot disturb the local chmod.
- The trap only operates on `$SSH_CONTROL_DIR` (a `/tmp` mktemp dir), never on `.env.production`. No path collision.

**Causal verdict:** No combinatorial regressions. No finding.

## Summary

- 4 traces run; 0 new findings.
- The cycle-2 fix is causally consistent with the observed cycle-3 deploy success (0 Permission-denied lines).
- All carry-forward fixes are intact.

**Total new findings this cycle:** 0.

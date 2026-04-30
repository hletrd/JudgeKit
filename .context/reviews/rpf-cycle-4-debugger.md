# RPF Cycle 4 — debugger perspective (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `e61f8a91`

## Latent bug surface

### C4-DB-1: [LOW, High confidence] `_initial_ssh_check` emits no output when retry count = 1 and succeeds (carry-forward)

**File/lines:** `deploy-docker.sh:165-178`

If the very first `remote "echo ok"` succeeds, the function returns 0 without any log line. That's fine for the happy path. But if attempt 1 fails and attempt 2 succeeds, the operator sees a `[WARN]` line for the failure, then nothing — no "succeeded on attempt 2" confirmation. Cycle-3's C3-AGG-10 already names this. No new finding; carry-forward.

### C4-DB-2: [LOW, Medium confidence] `trap _cleanup_ssh_master EXIT` may run before async backgrounded sshpass-child output is flushed (future-risk)

**File/lines:** `deploy-docker.sh:163`

If a deploy step backgrounded an SSH operation (it does not currently) and the script's main flow hit `exit`, the trap could tear down the ControlMaster while the backgrounded child is still using it. Currently no backgrounded SSH calls exist, so this is a future-risk note only.

**Status:** Future-risk note only. Not a current bug. Not actionable this cycle.

### C4-DB-3: [INFO] No active failure modes in cycle-3 deploy log

Per orchestrator history: "Cycle 3 had clean deploy (0 Permission-denied lines)." No new failure-mode evidence to mine.

## Confidence

High that no new debugger findings exist this cycle.

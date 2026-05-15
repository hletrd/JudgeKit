# Tracer Review — Cycle 6

**Date:** 2026-05-14
**Scope:** JudgeKit — causal tracing of suspicious flows
**Base commit:** db6378c8
**Agent:** tracer (manual single-pass)

---

## Executive Summary

**0 new suspicious flows identified**. All cycle-5 fixes traced through their execution paths and verified correct.

---

## Traced Flows

### Heartbeat cleanup flow
1. `shouldRecordSharedHeartbeat` called → acquires advisory lock
2. Updates/creates heartbeat entry with `blockedUntil = nowMs + minIntervalMs`
3. Deletes entries where `blockedUntil < nowMs - minIntervalMs`
4. The just-updated entry has `blockedUntil = nowMs + minIntervalMs`, which is `> nowMs - minIntervalMs`, so it is NOT deleted
5. **Conclusion:** Correct. No leak, no accidental deletion.

### Shell validator flow
1. Command passes to `validateShellCommand`
2. Regex `/\$[A-Za-z0-9_]/` matches `$0`, `$1`, `$a`, etc.
3. Commands without `$` (or with only `$` not followed by alphanum/underscore) pass
4. **Conclusion:** Correct. `$0-$9` blocked, legitimate commands unaffected.

### Byte length validation flow
1. Client sends source code
2. Zod schema validates `Buffer.byteLength(v, "utf8") <= 64KB`
3. Execution layer (`executeCompilerRun`) re-validates with same limit
4. **Conclusion:** Consistent. No discrepancy between API and execution.

---

## Deferred Traces (Stable)

- SSE-RACE: `stopSharedPollTimer` vs `sharedPollTick` in-progress — still possible if timer fires between `clearInterval` and tick completion. Mitigated by catch block.

---

## New Findings

None.

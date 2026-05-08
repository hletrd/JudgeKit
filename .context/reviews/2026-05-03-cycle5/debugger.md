# Debugger Review — Cycle 5 (2026-05-03)

**HEAD reviewed:** `eb4429a5`

---

## C5-DBG-1 (HIGH, HIGH confidence) — Guest compileOutput leak is a real bug with concrete failure scenario

**Scenario:** A guest visits `/submissions` and sees a `compile_error` badge. Hovering over it shows the compiler error in a tooltip, which in languages like C++/Java often includes lines like `error: 'int x = secretValue' was not declared in this scope`. The guest sees partial source code.

This is not theoretical — compiler errors in C/C++ routinely include the line of code that caused the error. The `compileOutput` field captures `stderr` from the compiler, which includes these code fragments.

**Fix:** Same as C5-CR-1/C5-SEC-1.

---

## C5-DBG-2 (LOW, MEDIUM confidence) — `getPeriodStart` timezone-dependent period boundary

If the server runs in KST (UTC+9) and `getDbNow()` returns a UTC Date, then `new Date(now).setHours(0, 0, 0, 0)` sets midnight in KST, not UTC. The "today" period would start at 15:00 UTC the previous day. Most deployments run in UTC, so this is low risk but a real bug in non-UTC environments.

---

## No other latent bugs found

The atomic counter, namespace validation, and hash consolidation from prior cycles are all working correctly at HEAD.

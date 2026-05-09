# Cycle 17 Remediation Plan

**Date:** 2026-05-09
**Based on:** `.context/reviews/_aggregate.md` (Cycle 17)
**HEAD:** 32464e55

---

## Active Tasks

### C17-1: Fix `withTimeout` to handle already-aborted signals [MEDIUM]

- **File:** `src/lib/api/client.ts:94-102`, `src/lib/docker/client.ts:104-112`
- **Severity:** MEDIUM
- **Status:** DONE
- **Commit:** (to be recorded)
- **Description:** Fixed by extracting `withTimeout` to shared module with `signal.aborted` early-return guard.
- **Description:** When `withTimeout` receives an already-aborted signal, the combined AbortSignal does not immediately abort. Instead, it waits for the timeout to fire (up to 30s for API, 60s for docker worker). This can cause fetches to hang unexpectedly.
- **Implementation steps:**
  1. Add early-abort guard in `withTimeout`:
     ```typescript
     if (signal.aborted) {
       combined.abort();
       return combined.signal;
     }
     ```
  2. Apply fix in both `src/lib/api/client.ts` and `src/lib/docker/client.ts`
- **Test updates:**
  - Add test in `tests/unit/api/client.test.ts` verifying that passing an already-aborted signal produces an immediately-aborted composite signal

### C17-2: Fix `withTimeout` abort listener leak [LOW]

- **File:** `src/lib/api/client.ts:94-102`, `src/lib/docker/client.ts:104-112`
- **Severity:** LOW
- **Status:** DONE
- **Commit:** (to be recorded)
- **Description:** Fixed by restructuring `withTimeout` to remove the abort listener in the timeout handler before aborting the combined signal.
- **Description:** When the timeout fires before the abort event, the abort listener (registered with `{ once: true }`) is never removed because the event never fires. For long-lived AbortControllers, this accumulates listeners.
- **Implementation steps:**
  1. Restructure `withTimeout` to remove the listener in the timeout handler:
     ```typescript
     let timer: ReturnType<typeof setTimeout>;
     function onAbort() {
       clearTimeout(timer);
       combined.abort();
     }
     timer = setTimeout(() => {
       signal.removeEventListener("abort", onAbort);
       combined.abort();
     }, ms);
     signal.addEventListener("abort", onAbort, { once: true });
     ```
  2. Apply fix in both files
- **Test updates:**
  - No direct test possible without DOM API introspection; rely on code review

### C17-3: Extract `withTimeout` and `createTimeoutSignal` to shared module [LOW]

- **File:** `src/lib/api/client.ts`, `src/lib/docker/client.ts`
- **Severity:** LOW
- **Status:** DONE
- **Commit:** (to be recorded)
- **Description:** Created `src/lib/abort.ts` with exported `createTimeoutSignal` and `withTimeout`. Updated both `api/client.ts` and `docker/client.ts` to import from the shared module.
- **Description:** The `withTimeout` and `createTimeoutSignal` functions are duplicated verbatim in two modules. This is a DRY violation.
- **Implementation steps:**
  1. Create `src/lib/abort.ts` (or add to `src/lib/utils.ts`)
  2. Export `withTimeout(signal, ms)` and `createTimeoutSignal(ms)` from the shared module
  3. Update `src/lib/api/client.ts` to import from shared module
  4. Update `src/lib/docker/client.ts` to import from shared module
  5. Remove duplicate definitions from both files
- **Note:** Should be done together with C17-1 and C17-2 to avoid fixing the same code in two places.

---

## Deferred Items

None. All findings are fixable within this cycle. No security/correctness findings require deferral.

---

## Gate Requirements

- [x] eslint passes
- [x] tsc --noEmit passes
- [x] next build passes
- [x] vitest run passes (314 files, 2343 tests)
- [x] vitest run --config vitest.config.component.ts passes (66 files, 179 tests)

---

## Dependencies

- C17-1, C17-2, and C17-3 should be implemented together in a single commit (or a small sequence) since they all touch the same functions
- Recommended order:
  1. Extract shared module (C17-3) + fix both bugs (C17-1, C17-2) in the extracted module
  2. Update imports in api/client.ts and docker/client.ts
  3. Add test for C17-1
  4. Run gates

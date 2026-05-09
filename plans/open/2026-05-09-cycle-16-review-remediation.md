# Cycle 16 Remediation Plan

**Date:** 2026-05-09
**Based on:** `.context/reviews/_aggregate.md` (Cycle 16)
**HEAD:** 64de91dd

---

## Active Tasks

### C16-1: Complete the apiFetch timeout fix — combine with caller-provided signals [MEDIUM]

- **File:** `src/lib/api/client.ts:88`
- **Cross-file impact:**
  - `src/lib/plugins/chat-widget/chat-widget.tsx:197`
  - `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:93`
  - `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:117`
- **Severity:** MEDIUM
- **Status:** PENDING
- **Description:** The cycle-15 fix added `AbortSignal.timeout(30_000)` only when `init?.signal` is undefined. When callers pass their own `AbortController.signal`, the default timeout is completely bypassed. Chat widget streaming, file uploads, and language config fetches can hang indefinitely.
- **Implementation steps:**
  1. Add a `withTimeout(signal, ms)` helper in `src/lib/api/client.ts` that creates a composite AbortSignal
  2. Modify `apiFetch` to always apply the default timeout:
     - If caller provides signal: `withTimeout(init.signal, 30_000)`
     - If no signal: `AbortSignal.timeout(30_000)` (or fallback for older browsers)
  3. Ensure the combined signal aborts when EITHER the caller's signal aborts OR the timeout fires
  4. Clean up the timeout timer when the caller's signal aborts to avoid dangling timers
- **Test updates:**
  - Update `tests/unit/api/client.test.ts:81-88` to verify composite behavior instead of pass-through
  - Add test verifying that aborting the caller's controller also aborts the fetch
  - Add test verifying that timeout fires when caller signal doesn't abort

### C16-2: Add browser fallback for AbortSignal.timeout [MEDIUM]

- **File:** `src/lib/api/client.ts:88`
- **Severity:** MEDIUM
- **Status:** PENDING
- **Description:** `AbortSignal.timeout()` is not supported in Safari < 16.4, Chrome < 103, Firefox < 100. This is the only client-side use in the entire codebase. Users on older browsers will see a `TypeError` and all API calls will fail.
- **Implementation steps:**
  1. Add a `createTimeoutSignal(ms)` helper in `src/lib/api/client.ts`:
     - Uses `AbortSignal.timeout(ms)` when available
     - Falls back to `new AbortController()` + `setTimeout(..., ms)` when not available
  2. Use `createTimeoutSignal` everywhere `AbortSignal.timeout` was used in client-side code
  3. Verify no other client-side files use `AbortSignal.timeout` directly
- **Test updates:**
  - Add test that mocks absence of `AbortSignal.timeout` and verifies fallback works
  - Add test verifying the signal actually aborts after the timeout period

### C16-3: Update tests to reflect corrected apiFetch behavior [LOW]

- **File:** `tests/unit/api/client.test.ts`
- **Severity:** LOW
- **Status:** PENDING
- **Description:** The existing test "preserves caller-provided signal instead of default timeout" documents the buggy behavior. It must be updated.
- **Implementation steps:**
  1. Rename test to "combines caller-provided signal with default timeout"
  2. Assert that the signal passed to `fetch` is NOT the same instance as `controller.signal`
  3. Assert that aborting `controller` causes the fetch signal to abort
  4. Assert that the timeout also causes the fetch signal to abort

### C16-4: Apply same timeout strategy to docker/client.ts for consistency [LOW]

- **Files:** `src/lib/docker/client.ts:112`, `:144`
- **Severity:** LOW
- **Status:** PENDING
- **Description:** Server-side wrappers have the same `signal = init?.signal ?? AbortSignal.timeout(N)` pattern. While the impact is lower (Node.js always supports AbortSignal.timeout), applying the composite timeout strategy ensures consistency and protects against server-side callers that pass signals without timeouts.
- **Implementation steps:**
  1. Extract shared timeout helpers to a utility module (or keep in client.ts and import from docker/client.ts)
  2. Apply composite timeout to `callWorkerJson` and `callWorkerNoContent`

---

## Deferred Items

None. Both findings are correctness issues affecting user experience. Per repo policy, correctness and security findings are not deferrable.

---

## Gate Requirements

- [ ] eslint passes
- [ ] tsc --noEmit passes
- [ ] next build passes
- [ ] vitest run passes (integration tests)
- [ ] vitest run --config vitest.config.component.ts passes (component tests)

---

## Dependencies

- C16-1 and C16-2 can be implemented together in a single commit since they both modify `api/client.ts`
- C16-3 (test updates) should be in the same commit as C16-1/C16-2
- C16-4 can be a separate commit after C16-1/C16-2 is complete

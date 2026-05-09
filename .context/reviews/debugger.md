# Debugger — Cycle 16 Review

**Date:** 2026-05-09
**HEAD:** 64de91dd
**Scope:** Latent bug surface, failure modes, regressions

## Summary

Three failure modes were identified, all stemming from the same root cause: the incomplete apiFetch timeout fix introduced in commit 64de91dd.

## Findings

### DB-1: Chat widget can enter unrecoverable hanging state [MEDIUM]

- **Related to:** CR-1 (code-reviewer)
- **File:** `src/lib/plugins/chat-widget/chat-widget.tsx:197-214`
- **Confidence:** High
- **Severity:** Medium
- **Failure Mode:**
  1. User submits a message in the chat widget
  2. `apiFetch` is called with `signal: controller.signal` where `controller` has no timeout
  3. The server endpoint `/api/v1/plugins/chat-widget/chat` stalls (e.g., slow LLM provider, network partition)
  4. The request hangs indefinitely
  5. The UI shows `isStreaming = true` forever
  6. The user cannot cancel the request (there is no timeout-based auto-cancel)
  7. The only recovery is to close/reopen the widget or refresh the page
- **Root Cause:** `apiFetch` passes the caller's signal verbatim without adding a default timeout.
- **Fix:** Combine caller signal with default timeout in `apiFetch`.

### DB-2: File upload dialog can hang indefinitely on stalled server [MEDIUM]

- **Related to:** CR-1
- **File:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:93-115`
- **Confidence:** High
- **Severity:** Medium
- **Failure Mode:**
  1. Admin selects files and clicks upload
  2. `apiFetch` is called with `signal: abortControllerRef.current.signal`
  3. Server stalls (e.g., disk full, virus scanner blocking)
  4. Request hangs indefinitely
  5. UI shows "uploading" state forever
  6. Admin can click "Cancel" to abort, but without a timeout, the upload could hang for hours
- **Note:** The dialog does have manual abort via the close button, but the lack of automatic timeout means the user must manually intervene.

### DB-3: AbortSignal.timeout compatibility regression in older browsers [MEDIUM]

- **Related to:** CR-2
- **File:** `src/lib/api/client.ts:88`
- **Confidence:** Medium
- **Severity:** Medium
- **Failure Mode:**
  1. User on Safari 15 visits the site
  2. Any client component calls `apiFetch` without passing a signal
  3. `AbortSignal.timeout(30_000)` throws `TypeError: AbortSignal.timeout is not a function`
  4. The `apiFetch` call throws synchronously before `fetch` is invoked
  5. The calling component's error handling (if any) may not catch this synchronous throw
  6. The UI breaks — loading spinners spin forever, forms don't submit, data doesn't load
- **Impact:** Complete client-side API failure for users on older browsers.

## Prior Fixes Verified

| Fix | Status |
|---|---|
| C15 apiFetch timeout (partial) | PARTIAL — timeout added but incomplete |
| C14 copy-code-button timer leak | Fixed |
| C14 language-config-table cross-operation abort | Fixed |
| C13 AbortController cleanup (4 files) | No regression |
| C12 countdown timer fixes | No regression |

## Regressions Checked

No regressions from prior fixes identified beyond DB-3 (compatibility regression introduced by the C15 fix).

## Final Sweep

No latent bugs in timer handling, event listener management, async flow, or state mutation found beyond the three documented above.

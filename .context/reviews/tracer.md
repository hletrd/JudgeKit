# Tracer — Cycle 16 Review

**Date:** 2026-05-09
**HEAD:** 64de91dd
**Scope:** Causal tracing of data flows, state transitions, and async flows

## Summary

One suspicious flow identified related to the apiFetch timeout issue. All other traced flows show consistent state management and proper error handling.

## Findings

### TR-1: Chat widget streaming flow can get stuck indefinitely [MEDIUM]

- **Entry:** `src/lib/plugins/chat-widget/chat-widget.tsx:197-214`
- **Flow:**
  1. User sends message → `sendMessage` sets `isStreaming = true`
  2. Creates `new AbortController()` with NO timeout
  3. Calls `apiFetch` with `signal: controller.signal`
  4. apiFetch passes signal verbatim → `fetch` with caller's signal
  5. Server stalls → fetch Promise never resolves
  6. `isStreaming` remains `true` forever
  7. UI shows assistant "thinking" spinner indefinitely
  8. No automatic recovery — user must close widget or refresh
- **Root Cause:** apiFetch does not combine caller signal with default timeout.
- **Fix:** Ensure apiFetch always applies a timeout, even when caller provides a signal.

### TR-2: File upload batch flow can stall on hung individual upload [MEDIUM]

- **Entry:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:90-128`
- **Flow:**
  1. Admin clicks upload → `handleUpload` starts
  2. Creates `new AbortController()` with NO timeout
  3. Iterates through queue, uploading files one by one
  4. Each upload calls `apiFetch` with shared abort controller signal
  5. If ONE upload hangs, the entire batch waits forever
  6. `isUploading` remains `true`
  7. Admin can click Cancel to abort all, but no automatic timeout
- **Note:** This is less severe than TR-1 because the admin has a manual abort option, but in a large batch upload (e.g., 50 files), one stalled upload blocks the rest.

## Verified Safe Flows

### Submission Flow (user → judge → result)
- All state transitions are atomic within transactions. No inconsistent states found.

### Auth Flow (login → session → validation)
- Session created with JWT + cookie. Cache TTL capped at 10s. Proper.

### File Upload Flow
- DB write precedes disk write. Delete removes DB first, then disk best-effort. Proper.

### Anti-Cheat Flow
- Events batched in localStorage. Flushed with exponential backoff. Bounded by MAX_RETRIES. Proper.

## Final Sweep

No additional suspicious flows identified.

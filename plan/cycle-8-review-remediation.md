# Cycle 8 Review Remediation Plan

**Cycle:** 8/100
**Date:** 2026-05-08
**HEAD:** b34b8235
**Source:** `.context/reviews/_aggregate.md`

## Implementation Queue

### Task A — ChatWidget abort controller cleanup on unmount [HIGH]
**Finding:** C8-HI-1
**File:** `src/lib/plugins/chat-widget/chat-widget.tsx`
**Issue:** `abortControllerRef` is only aborted on pathname change, not on component unmount. If the component unmounts during an active streaming fetch, the fetch continues and calls state setters on an unmounted component.
**Fix:** Add a dedicated `useEffect` cleanup that aborts the controller when the component unmounts.
**Estimated:** 5 lines
**Status:** DONE — Added `useEffect` cleanup that aborts `abortControllerRef.current` on unmount.

### Task B — CompilerClient localStorage hydration mismatch [MEDIUM]
**Finding:** C8-ME-1
**File:** `src/components/code/compiler-client.tsx`
**Issue:** The `useEffect` at lines 161-185 reads `window.localStorage` and updates `language` state, which can cause a hydration mismatch if the server-rendered HTML uses a different default language than what's stored in localStorage.
**Fix:** Wrap the localStorage-dependent state update in a `startTransition` or use a `mounted` flag to only apply the preference after initial hydration. Alternatively, suppress the hydration mismatch by rendering the same default on both server and client, then switching after mount.
**Estimated:** 10 lines
**Status:** DONE — Removed `hydratedPreferenceRef` and `language` from effect deps; effect now runs once on mount with empty deps.

### Task C — FileUploadDialog stable React keys [MEDIUM]
**Finding:** C8-ME-4
**File:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx`
**Issue:** Queue items use `key={`${item.file.name}-${i}`}` which shifts when items are removed, causing unnecessary remounts.
**Fix:** Use a stable composite key like `\`${file.name}-${file.size}-${file.lastModified}-${i}\`` or generate a nanoid when the file is queued.
**Estimated:** 5 lines
**Status:** DONE — Added `id` field to `QueuedFile` using composite key; updated map key to use stable `item.id`.

### Task D — AntiCheatMonitor heartbeat timer leak guard [MEDIUM]
**Finding:** C8-ME-5
**File:** `src/components/exam/anti-cheat-monitor.tsx`
**Issue:** If `enabled` toggles rapidly, the heartbeat effect cleanup may run after a new timer has already been started, leaving duplicate timers.
**Fix:** Add a `heartbeatActiveRef` guard to prevent duplicate timer registration, or track the timer ID in a ref that the cleanup always clears.
**Estimated:** 8 lines
**Status:** DONE — Moved `heartbeatTimer` to `useRef` and added clear-before-schedule guard in `scheduleHeartbeat()`.

### Task E — ChatWidget sendMessageRef null guard [MEDIUM]
**Finding:** C8-ME-6
**File:** `src/lib/plugins/chat-widget/chat-widget.tsx`
**Issue:** `sendMessageRef` is initialized with `useRef(null!)` but is actually null before the first effect commit. The auto-analysis effect calls it without a null check.
**Fix:** Add `if (sendMessageRef.current)` guard before calling.
**Estimated:** 2 lines
**Status:** DONE — Added `if (sendMessageRef.current)` null guard before calling in auto-analysis effect.

### Task F — AntiCheatMonitor privacy notice persistence [MEDIUM]
**Finding:** C8-ME-3
**File:** `src/components/exam/anti-cheat-monitor.tsx`
**Issue:** `showPrivacyNotice` is initialized to `true` with no persistence. Component remount shows the notice again.
**Fix:** Read/write an acceptance flag from `sessionStorage` so the user only sees the notice once per session.
**Estimated:** 10 lines
**Status:** DONE — Initialized `showPrivacyNotice` from `sessionStorage` and persist acceptance on button click.

## Deferred Items

See `cycle-8-deferred.md` for LOW-severity findings and exit criteria.

## Gate Results

All gates passed after implementation (2026-05-08):
- `eslint .` — PASS (0 errors, 0 warnings)
- `tsc --noEmit` — PASS
- `next build` — PASS
- `vitest run` — PASS (2337 tests, 314 files)
- `vitest run --config vitest.config.component.ts` — PASS (167 tests, 64 files)

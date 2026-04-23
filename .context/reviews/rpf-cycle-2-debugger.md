# RPF Cycle 2 — Debugger

**Date:** 2026-04-22
**Base commit:** 14218f45

## Findings

### DBG-1: `recruiting-invitations-panel.tsx` custom expiry date `min` attribute uses UTC date — blocks valid local dates [MEDIUM/HIGH]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:407`
**Description:** The `min` attribute on the custom expiry date input is computed as `new Date().toISOString().split("T")[0]`, which produces a UTC date. The native `<input type="date">` renders in the user's local timezone. This creates a mismatch where users in timezones ahead of UTC may be blocked from selecting the current local date, and users behind UTC may be allowed to select yesterday's date.
**Concrete failure scenario:** A Korean user (UTC+9) at 2 AM local time on April 22 runs `new Date().toISOString().split("T")[0]` — this returns `2026-04-21` (UTC). The date picker's `min` is set to April 21, but the user's local date is April 22. When they try to select April 22, the browser may not allow it because the min constraint says April 21 is the earliest, and April 22 should be selectable — but the real issue is the reverse: a user in UTC-5 at 11 PM on April 21 gets `min=2026-04-22` (UTC), which blocks April 21 in their local time even though it's still their current date.
**Fix:** Use local date: `new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split("T')[0]` or format with `toLocaleDateString('sv-SE')`.

### DBG-2: `workers-client.tsx` `AliasCell` does not handle save errors — silently drops failed edits [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:91-101`
**Description:** The `handleSave` function in `AliasCell` calls `apiFetch` to update the alias but only checks `res.ok` to close the editing state. When the request fails, the edit UI closes and the old alias is shown, but no error feedback is given to the user. The user might assume the save succeeded.
**Concrete failure scenario:** Admin edits a worker alias, presses Enter, the API returns 403 (permission denied). The editing UI closes, the old alias is displayed, and no error toast is shown. The admin assumes the rename worked.
**Fix:** Add an `else` branch showing `toast.error(t("saveFailed"))` or similar.

### DBG-3: `workers-client.tsx` `AliasCell` keyboard handler calls `handleSave` without awaiting — potential double-fire [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:112-113`
**Description:** The `onKeyDown` handler calls `handleSave()` without `await` or `void`. Since `handleSave` is async, pressing Enter rapidly could trigger multiple concurrent API requests. The UI does not disable the save button during the request.
**Fix:** Add `void handleSave()` and disable the input during save.

## Verified Safe

- Cycle 1 fixes (clipboard, layout, localStorage, defaultValue) are working correctly
- Anti-cheat monitor properly cleans up timers and event listeners on unmount
- `use-source-draft.ts` properly handles edge cases (empty drafts, version mismatch, TTL expiry)
- Submission polling cleanup works correctly in both SSE and fetch fallback paths

# RPF Cycle 2 — Tracer

**Date:** 2026-04-22
**Base commit:** 14218f45

## Findings

### TR-1: Invitation link construction flow — `window.location.origin` trust chain [LOW/MEDIUM]

**Trace path:**
1. `recruiting-invitations-panel.tsx:95` — `const baseUrl = typeof window !== "undefined" ? window.location.origin : ""`
2. `recruiting-invitations-panel.tsx:181` — `const link = \`${baseUrl}/recruit/${token}\``
3. `recruiting-invitations-panel.tsx:207` — `const url = \`${baseUrl}/recruit/${invitation.token}\``
4. User copies link and shares it externally

**Hypothesis 1 (confirmed):** In normal deployments, `window.location.origin` returns the correct origin and links are valid.
**Hypothesis 2 (potential):** If the app is behind a misconfigured reverse proxy that doesn't properly override `X-Forwarded-Host`, `window.location.origin` could reflect an incorrect value. This is unlikely but not impossible given the existing RSC streaming bug workaround in `contests/layout.tsx` (which exists precisely because proxy header handling has been problematic).
**Verdict:** Low risk in current deployment, but the trust chain is fragile. The server should be the authoritative source for the app's base URL.

### TR-2: Expiry date min-value flow — timezone mismatch confirmed [MEDIUM/HIGH]

**Trace path:**
1. `recruiting-invitations-panel.tsx:407` — `min={new Date().toISOString().split("T")[0]}`
2. Browser renders `<input type="date">` in local timezone
3. User selects a date that may be blocked or allowed incorrectly

**Hypothesis (confirmed):** `new Date().toISOString()` returns UTC, but `<input type="date">` compares against local time. Users in timezones ahead of UTC may be blocked from selecting the current local date; users behind UTC may be allowed to select yesterday's date.
**Verdict:** This is a concrete bug affecting Korean users (UTC+9) between midnight and 9 AM local time.

## Verified Safe

- Clipboard copy flow: all components now go through shared `copyToClipboard` utility with fallback
- Contest layout navigation flow: only `data-full-navigate` links trigger hard navigation
- Draft persistence flow: debounced writes + visibility-aware flushing + try/catch on removeItem

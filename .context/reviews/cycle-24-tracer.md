# Tracer — Cycle 24

**Date:** 2026-04-20
**Base commit:** f1b478bc

## Findings

### TR-1: Silent catch blocks in fetch flows hide error propagation [MEDIUM/MEDIUM]

**Files:**
- `src/components/lecture/submission-overview.tsx:101-102`
- `src/components/contest/invite-participants.tsx:49-50`
- `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:61-62,75-76`
- `src/components/contest/participant-anti-cheat-timeline.tsx:120-121`

**Description:** Traced the error flow: `apiFetch` -> response handling -> catch block -> `// ignore`. The `apiFetch` wrapper adds the `X-Requested-With` header but does not throw on non-ok responses (it returns the Response object). The individual components are responsible for checking `res.ok` and handling errors. When they catch exceptions and silently ignore them, the error is completely lost — no console log, no toast, no error state.

Causal trace for `submission-overview.tsx`:
1. `fetchStats()` calls `apiFetch("/api/v1/submissions?...")`
2. If `res.ok` is false, the function returns early (line 76) — no error feedback
3. If `apiFetch` throws (network error), the catch block ignores it (line 101-102)
4. `setLoading(false)` runs in finally, hiding any loading indicator
5. The UI shows the previous (stale) stats with no indication of failure

**Fix:** Add toast.error in catch blocks and consider showing an error indicator when `!res.ok`.
**Confidence:** MEDIUM

### TR-2: `ContestsLayout` click handler capture phase intercepts before React's delegation [MEDIUM/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/contests/layout.tsx:32-33`
**Description:** Traced the event flow:
1. User clicks an `<a>` element inside `#main-content`
2. The capture-phase listener fires first (before React's synthetic event system)
3. `me.preventDefault()` prevents the default navigation
4. `me.stopPropagation()` prevents the event from reaching any React onClick handlers
5. `window.location.href = href` triggers full page navigation
6. The page reloads, destroying all React state

The `stopPropagation()` in capture phase is the key issue: it prevents React's delegation system from ever seeing the event. This means any `onClick` handlers on child elements will never fire.
**Fix:** Remove `stopPropagation()` and rely only on `preventDefault()`.
**Confidence:** MEDIUM

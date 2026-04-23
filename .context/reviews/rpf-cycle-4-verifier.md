# RPF Cycle 4 — Verifier

**Date:** 2026-04-22
**Base commit:** 5d89806d

## Findings

### V-1: `invite-participants.tsx` `res.json()` on error path — verified same class of issue as cycle 3 fixes [MEDIUM/MEDIUM]

**File:** `src/components/contest/invite-participants.tsx:78`
**Confidence:** HIGH

Verified: On line 78, `const data = await res.json();` is called inside the `else` block (when `!res.ok`). If the response body is not valid JSON (e.g., HTML from a proxy), this throws a SyntaxError. The outer `catch` on line 81 handles it generically but loses the specific error information. This is the same class of issue that was fixed in cycle 3 for `discussion-vote-buttons.tsx`, `problem-submission-form.tsx`, and others.

**Fix:** Add `.catch(() => ({}))` after `res.json()` on line 78.

---

### V-2: `access-code-manager.tsx` `res.json()` without `.catch()` — verified on both paths [MEDIUM/MEDIUM]

**File:** `src/components/contest/access-code-manager.tsx:42,88`
**Confidence:** HIGH

Verified: In `fetchCode` (line 42) and `handleGenerate` (line 88), `res.json()` is called after `res.ok` check. While a 200 response is unlikely to have non-JSON body, the pattern is inconsistent with the project convention. More importantly, in `handleGenerate`, if the `json.data.accessCode` field is missing or `undefined` (due to a `.catch(() => ({}))` fallback not being present), the code would set `code` to `undefined` which is technically `string | undefined` but the component later uses `code` in a truthy check which handles it.

**Fix:** Add `.catch(() => ({}))` for consistency, or use `apiJson` helper.

---

### V-3: `countdown-timer.tsx` timer drift — verified by reading Next.js `setInterval` throttling behavior [MEDIUM/HIGH]

**File:** `src/components/exam/countdown-timer.tsx:100`
**Confidence:** HIGH

Verified: Browsers throttle `setInterval` in background tabs to at most once per second (Chrome), or even less frequently in some cases. When the tab becomes visible again, the `remaining` state is stale because the interval hasn't been firing at the expected rate. Since `remaining` is derived from `deadline - (Date.now() + offsetRef.current)`, the correct value is always available — the component just needs to trigger a recalculation when visibility changes.

**Concrete failure scenario:** Student switches away from exam tab for 5 minutes. Browser throttles interval. When they switch back, the timer shows a stale value (e.g., 25:00 remaining) that jumps to the correct value (e.g., 20:00) on the next interval tick. This creates a jarring UX in an exam context where every second matters.

**Fix:** Add a `visibilitychange` listener in the `useEffect` that calls `setRemaining(deadline - (Date.now() + offsetRef.current))` when the tab becomes visible.

---

### V-4: `access-code-manager.tsx` dynamic clipboard import — verified same pattern as cycle 3 fix [LOW/MEDIUM]

**File:** `src/components/contest/access-code-manager.tsx:61`
**Confidence:** HIGH

Verified: Line 61 uses `const { copyToClipboard } = await import("@/lib/clipboard")` (dynamic import). This is the same pattern that was fixed to a static import in `recruiting-invitations-panel.tsx` during cycle 3. The `@/lib/clipboard` module is small (~20 lines) and always available on the client side — there's no code-splitting benefit from dynamic import.

**Fix:** Replace with static `import { copyToClipboard } from "@/lib/clipboard"`.

---

## Verified Safe

- `submission-list-auto-refresh.tsx` — fetch-based error detection works correctly (cycle 3 fix verified)
- `contest-clarifications.tsx` — uses `useVisibilityPolling` correctly (cycle 3 fix verified)
- `recruiting-invitations-panel.tsx` — functional state update pattern prevents infinite loops (cycle 3 fix verified)
- `leaderboard-table.tsx` — validates `json.data` shape before setting state
- `contest-quick-stats.tsx` — validates numeric fields with `Number.isFinite`
- `anti-cheat-monitor.tsx` — `loadPendingEvents` validates with `isValidPendingEvent` and `Array.isArray`
- SSE events route — excludes `sourceCode` from query, uses shared polling, validates auth
- CSRF protection works via `apiFetch` + `validateCsrf` on all mutation endpoints

# RPF Cycle 20 — Critic

**Date:** 2026-04-22
**Base commit:** 4182e529

## Findings

### CRI-1: Unguarded `.json()` on success paths — still 5+ locations despite repeated cycle fixes [MEDIUM/HIGH]

**Files:**
- `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx:74`
- `src/lib/plugins/chat-widget/admin-config.tsx:103`
- `src/lib/plugins/chat-widget/providers.ts:138,258,398`
- `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:45`

**Description:** Despite cycles 18-19 fixing the same anti-pattern in 5+ components, 4+ new locations are discovered this cycle. The codebase has a clear convention documented in `src/lib/api/client.ts:25-48` and a helper `apiFetchJson` that eliminates the footgun entirely. The persistent recurrence suggests the convention is not being enforced proactively — new code is written with raw `.json()` and caught later in review.

**Critique:** The root cause is that `apiFetchJson` is optional and developers naturally reach for `apiFetch` + `.json()`. Consider making `apiFetch` private and exposing only `apiFetchJson` as the public API, or adding a lint rule that flags `response.json()` calls not preceded by `.catch()`.

**Fix:** Fix the 4+ locations. Then add an ESLint rule or codebase convention to prevent future regressions.

---

### CRI-2: `Number()` for numeric inputs still inconsistent — admin-config uses `Number()` while assignment-form uses `parseFloat()` [LOW/MEDIUM]

**Files:**
- `src/lib/plugins/chat-widget/admin-config.tsx:294,305` — uses `Number(e.target.value)`
- `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:454,651` — uses `parseFloat()` or `Number()` (mixed)

**Description:** The codebase has an inconsistent pattern for parsing numeric input values. The `assignment-form-dialog.tsx` points field was fixed to use `parseFloat() || 0`, but the exam duration field at line 454 still uses `Number()`, and the admin-config maxTokens/rateLimitPerMinute also use `Number()`. This creates a NaN risk in all three locations.

**Fix:** Standardize on `parseInt(value, 10) || fallback` for integer inputs and `parseFloat(value) || fallback` for decimal inputs.

---

### CRI-3: `contest-replay.tsx:166` — `Number()` on range slider is safe but inconsistent [LOW/LOW]

**File:** `src/components/contest/contest-replay.tsx:166`

**Description:** `<input type="range">` always returns valid numeric strings, so `Number(event.target.value)` is functionally safe here. However, it's inconsistent with the codebase convention of `parseInt`/`parseFloat`. Purely a style concern.

**Fix:** Use `parseInt(event.target.value, 10)` for consistency.

---

## Verified Safe (No Issue Found)

- All discussion components properly sanitize error display (use localized labels, log raw errors)
- Anti-cheat monitor properly uses recursive setTimeout for heartbeat (not setInterval)
- Comment section properly logs server errors before showing localized toast
- `invite-participants.tsx` correctly whitelists `userNotFound` error key
- All bulk-create-dialog error paths use `console.error` + localized toast pattern
- No raw server error strings leaked to users (confirmed across all newly reviewed files)

# RPF Cycle 34 Review Remediation Plan

**Date:** 2026-04-25
**Base commit:** 3a4e1f25
**Review artifacts:** `.context/reviews/cycle-34-comprehensive-reviewer.md` + `.context/reviews/_aggregate-cycle-34.md`

## Previously Completed Tasks (Verified in Current Code)

All cycle 33 tasks are complete:
- [x] Task A: Fix chat widget "Test Connection" button — commit 38dc241e
- [x] Task B: Replace useLayoutEffect with isomorphic layout effect — commit 7cbc97b5
- [x] Task C: `parseInt || fallback` in chat widget — FALSE POSITIVE

## Tasks (priority order)

### Task A: Add try/catch around `request.json()` in assignments POST route [MEDIUM/HIGH]

**From:** AGG-1 (NEW-1)
**Severity / confidence:** MEDIUM / HIGH
**Files:**
- `src/app/api/v1/groups/[id]/assignments/route.ts:109`

**Problem:** The POST handler calls `const body = await request.json()` without a try/catch. If the client sends invalid JSON (or an empty body), this throws an unhandled `SyntaxError` that results in a 500 instead of a 400. All other non-`createApiHandler` admin routes (backup, restore, migrate/export, migrate/import) properly wrap `request.json()` in try/catch.

**Plan:**
1. Wrap `request.json()` in try/catch, returning a 400 with `apiError("invalidJson", 400)` on parse failure
2. Verify the error is properly handled by adding a test or manual verification
3. Verify all gates pass

**Status:** DONE (commit 2522bcea)

---

### Task B: Fix `parseInt || fallback` in `ip.ts` — use `??` instead of `||` [MEDIUM/MEDIUM]

**From:** AGG-2 (NEW-2)
**Severity / confidence:** MEDIUM / MEDIUM
**Files:**
- `src/lib/security/ip.ts:9`

**Problem:** `parseInt(process.env.TRUSTED_PROXY_HOPS || "1", 10) || 1` uses `||` which treats 0 as falsy. If someone explicitly sets `TRUSTED_PROXY_HOPS=0` (meaning "no trusted proxies"), it silently defaults to 1, which is a security misconfiguration that would trust the first proxy's `X-Forwarded-For` header when it shouldn't.

**Plan:**
1. Change `parseInt(process.env.TRUSTED_PROXY_HOPS || "1", 10) || 1` to `parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1` — the `|| 1` at the end is still needed because `parseInt` can return `NaN`, but the `|| "1"` should be `?? "1"` so that `TRUSTED_PROXY_HOPS=""` (empty string) still falls back to "1" (since `"" ?? "1"` returns `""`, we actually need `||` for the string default, but the outer `|| 1` for NaN is correct). Let me think again...
   - `process.env.TRUSTED_PROXY_HOPS` is `string | undefined`
   - If set to `"0"`, `|| "1"` would treat `"0"` as falsy and use `"1"` — this is the bug
   - With `?? "1"`, `"0"` is not nullish so it stays as `"0"` — correct
   - Then `parseInt("0", 10)` returns `0`, and `|| 1` would treat `0` as falsy and use `1` — this is ALSO the bug
   - Need to change BOTH: `(parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1)` should become `const parsed = parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10); return Number.isNaN(parsed) ? 1 : parsed;`
2. Verify that `TRUSTED_PROXY_HOPS=0` now results in 0 (not 1)
3. Verify that `TRUSTED_PROXY_HOPS=undefined` (unset) still defaults to 1
4. Verify all gates pass

**Status:** DONE (commit f1bcca05)

---

### Task C: Add error boundary for contests route segment [LOW/LOW]

**From:** AGG-4 (NEW-4)
**Severity / confidence:** LOW / LOW
**Files:**
- New file: `src/app/(dashboard)/dashboard/contests/error.tsx`

**Problem:** The contest segment lacks its own `error.tsx`. The parent dashboard error boundary catches errors, but contests is complex (real-time polling, replay, analytics) and would benefit from context-specific recovery options (e.g., "Return to contest list" instead of generic "Back to dashboard").

**Plan:**
1. Create `src/app/(dashboard)/dashboard/contests/error.tsx` modeled after the existing `src/app/(dashboard)/dashboard/problems/error.tsx` or `src/app/(dashboard)/dashboard/groups/error.tsx`
2. Use i18n translations with contest-specific messages
3. Provide "Return to contest list" button instead of generic dashboard
4. Verify all gates pass

**Status:** DONE (commit 2acab2f7)

---

### Task D: Add explicit column select to `admin/languages` list route [LOW/LOW]

**From:** AGG-6 (NEW-6)
**Severity / confidence:** LOW / LOW
**Files:**
- `src/app/api/v1/admin/languages/route.ts:27`

**Problem:** The GET handler uses `.select()` (no explicit column list) from `languageConfigs`, which exposes all columns including the `dockerfile` column (up to 10,000 chars). This bloats the list response unnecessarily.

**Plan:**
1. Replace `.select()` with explicit column selection, omitting `dockerfile`
2. Keep `dockerfile` in the individual language GET route (`/admin/languages/[language]`)
3. Verify the admin languages page still renders correctly (it likely doesn't use `dockerfile` in the table)
4. Verify all gates pass

**Status:** DONE (commit 123ad7cf)

---

## Deferred Items

### AGG-3: Chat widget `response.json()` error key coupling [LOW/MEDIUM]

**Reason for deferral:** Low severity, cosmetic maintainability concern. The current implementation works correctly and the error key `"rateLimit"` is stable. Changing this would require coordinating server and client changes simultaneously.

**Exit criterion:** If the server error key changes and causes user-facing regressions.

### AGG-5: `useSearchParams` without Suspense boundary [LOW/LOW]

**Reason for deferral:** Build-log-only warning, no runtime impact. The pages using these components already have Suspense boundaries.

**Exit criterion:** If Next.js makes this a hard error in a future version.

### DEFER-22 through DEFER-45: Carried from cycle 33

See cycle 33 plan for full details. All carry forward unchanged, with the following notes:
- DEFER-29 (Admin routes bypass `createApiHandler`): assignments POST route now also identified (AGG-1, Task A). After Task A is fixed, the remaining routes in DEFER-29 are the 5 manually-authenticated admin routes (backup, restore, migrate/export, migrate/import, migrate/validate) which already have proper try/catch.
- DEFER-33 (Missing error boundaries): contests segment now identified (AGG-4, Task C). After Task C is fixed, the remaining gap is smaller.

---

## Progress log

- 2026-04-25: Plan created with 4 tasks (A-D). 2 findings deferred (AGG-3, AGG-5).
- 2026-04-25: Task A DONE — add try/catch around request.json() in assignments POST route (commit 2522bcea).
- 2026-04-25: Task B DONE — fix TRUSTED_PROXY_HOPS parsing to respect 0 with ?? and NaN check (commit f1bcca05).
- 2026-04-25: Task C DONE — add error boundary for contests route segment with i18n (commit 2acab2f7).
- 2026-04-25: Task D DONE — use explicit column select in languages list route, omit dockerfile (commit 123ad7cf).
- 2026-04-25: All gates green (eslint 0, tsc clean, vitest 302/302 pass 2197 tests, next build success).

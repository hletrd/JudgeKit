# Cycle 3 Review Remediation Plan (review-plan-fix loop — current iteration)

**Date:** 2026-04-19
**Source:** `.context/reviews/cycle-3-aggregate.md`, per-agent reviews under `.context/reviews/cycle-3-*.md`
**Status:** COMPLETE

## Planning notes
- This pass re-read repo rules first: `CLAUDE.md`, `AGENTS.md`, `.context/development/*.md`.
- Cycle 1 and cycle 2 remediation plans are fully implemented and archived to `plans/archive/`.
- The prior cycle 3 plan (from an earlier review-plan-fix iteration) is also complete and archived.
- Review findings from this cycle's fresh reviews are mapped below to either implementation stories or explicit deferred / invalidated items. No review finding is intentionally dropped.
- User-injected TODO from `plans/open/2026-04-19-workspace-to-public-migration.md` — Phase 1 implementation is prioritized this cycle.

---

## Implementation stories for this pass

### CSV-02 — Add row limit to admin submissions CSV export
**Sources:** AGG-1, code-reviewer F2, security-reviewer F1, perf-reviewer F1, debugger F2, critic F1, verifier F3
**Severity:** HIGH | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/app/api/v1/admin/submissions/export/route.ts:95-111`
- Also: `src/app/api/v1/admin/submissions/export/route.ts:37-46` (replace local `escapeCsvField` with shared import)

**Problem:** The admin submissions export route has no `.limit()` on its query. All matching submissions are loaded into memory and serialized to CSV. On a deployment with 100K+ submissions, this can exhaust memory and crash the server. This route was missed by cycle 2's CSV-01 fix which covered only audit-logs and login-logs.

**Fix:**
1. Replace the local `escapeCsvField` function with an import from `@/lib/csv/escape-field`.
2. Add `.limit(10000)` to the Drizzle query as a hard cap.
3. If the result hits the limit, include a `truncated: true` indicator or note in the CSV.

**Verification:**
- `npx vitest run` (unit tests)
- Manual check that CSV export is bounded

---

### NAFIX-02 — Migrate admin chat-logs and anti-cheat routes to use `parsePositiveInt`
**Sources:** AGG-2, AGG-4, code-reviewer F1, debugger F1, critic F3, architect F3
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/app/api/v1/admin/chat-logs/route.ts:19`
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:148-149`

**Problem:** These routes use bare `parseInt` for query parameters instead of the shared `parsePositiveInt` utility created in cycle 2. The chat-logs route has a confirmed NaN bug: `Math.max(1, parseInt("abc", 10))` returns `NaN`.

**Fix:**
1. In `chat-logs/route.ts:19`: Replace `Math.max(1, parseInt(url.searchParams.get("page") || "1", 10))` with `parsePositiveInt(url.searchParams.get("page"), 1)`.
2. In `anti-cheat/route.ts:148-149`: Replace the `parseInt` calls with `parsePositiveInt`.
3. Add import for `parsePositiveInt` from `@/lib/validators/query-params`.

**Verification:**
- `npx vitest run` (unit tests)
- `npx tsc --noEmit`

---

### CHAT-LOG-01 — Optimize chat-logs session list to use single query with COUNT(*) OVER()
**Sources:** AGG-5, perf-reviewer F2, security-reviewer F2
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Medium

**Files:**
- `src/app/api/v1/admin/chat-logs/route.ts:56-119`

**Problem:** The session list endpoint runs two separate queries — one for paginated data and one for total count. Same pattern that was fixed for rankings in cycle 2 (RANK-01).

**Fix:**
1. Add `COUNT(*) OVER() AS total` to the main CTE query.
2. Remove the separate count query.
3. Extract `total` from the first row of results (or 0 if empty).

**Verification:**
- Visual check on admin chat-logs page
- `npx vitest run` (unit tests)

---

### WS-PHASE1 — Implement workspace-to-public migration Phase 1
**Sources:** AGG-6, AGG-8, user-injected TODO, architect F1, critic F4, designer F1, code-reviewer F6
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Medium

**Files:**
- `src/app/(workspace)/layout.tsx`
- `src/app/(workspace)/workspace/page.tsx`
- `src/app/(workspace)/workspace/discussions/page.tsx`
- `src/components/layout/workspace-nav.tsx`
- `src/app/(public)/community/page.tsx` (add "My Discussions" filter)
- `src/components/discussions/my-discussions-list.tsx`
- `src/proxy.ts` (redirect routes, update matcher)
- `messages/en.json`, `messages/ko.json` (i18n keys)

**Problem:** The workspace route group has only 2 pages and duplicates dashboard navigation. The user wants workspace-only pages moved to public with a new top navbar, deprecating the workspace layout.

**Fix (Phase 1 — eliminate workspace route group):**
1. Move `/workspace/discussions` functionality into `/community` as a "My Discussions" filter tab.
2. Update `PublicHeader` nav items: add "My Discussions" link when authenticated.
3. Add redirect routes: `/workspace` -> `/dashboard`, `/workspace/discussions` -> `/community?filter=mine`.
4. Remove `src/app/(workspace)/layout.tsx`, `src/app/(workspace)/workspace/page.tsx`, `src/app/(workspace)/workspace/discussions/page.tsx`.
5. Remove `src/components/layout/workspace-nav.tsx`.
6. Audit and remove `workspaceShell.*` i18n keys from `messages/en.json` and `messages/ko.json`, merging any unique ones into `community` or `publicShell`.
7. Update `src/proxy.ts` workspace route matcher entries (remove `/workspace/:path*` from matcher since the layout is gone).

**Verification:**
- `npm run build` (no broken imports)
- `npx tsc --noEmit`
- Manual check: `/workspace` redirects to `/dashboard`
- Manual check: `/workspace/discussions` redirects to `/community?filter=mine`
- Manual check: `/community` shows "My Discussions" filter when authenticated

---

### TEST-01 — Add tests for admin submissions export, chat-logs, and anti-cheat GET
**Sources:** AGG-10, test-engineer F1, F2, F3
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Medium

**Files:**
- New: `tests/unit/api/admin-submissions-export.route.test.ts`
- New: `tests/unit/api/admin-chat-logs.route.test.ts`
- New: `tests/unit/api/anti-cheat-get.route.test.ts`

**Problem:** Three admin/instructor endpoints have no test coverage. The unbounded CSV export and parseInt NaN bugs would have been caught by basic tests.

**Fix:**
1. Add tests for admin submissions export: CSV format, row limit enforcement, escapeCsvField behavior, date/status filtering.
2. Add tests for admin chat-logs: session list pagination, NaN page parameter, transcript access audit event.
3. Add tests for anti-cheat GET: pagination, eventType filtering, heartbeat gap detection.

**Verification:**
- `npx vitest run` (all new tests pass)

---

## Deferred / invalidated review register

| Bucket | Source finding IDs | File + line citation | Original severity / confidence | Disposition | Reason | Exit criterion |
| --- | --- | --- | --- | --- | --- | --- |
| CRYPTO-01 | AGG-11 | `src/app/api/v1/plugins/chat-widget/chat/route.ts:176-189` | MEDIUM / HIGH | Deferred (reconfirmed from cycle 2) | Chat widget API key encryption is a broader auth/crypto architecture concern requiring coordinated migration. The keys are only accessible to admin users via the plugin config UI, and the DB access itself requires server compromise. | Re-open when a dedicated plugin secrets encryption plan is approved. |
| EDITOR-CODE-01 | AGG-9 | `src/app/api/v1/plugins/chat-widget/chat/route.ts:39` | LOW / MEDIUM | Deferred | Chat widget editorCode 100KB limit is a cost/UX concern, not a bug. Current behavior is documented and accepted. | Re-open when AI API costs are shown to be problematic. |
| UX-SKIP-01 | designer F3 | `src/components/layout/public-header.tsx` | LOW / MEDIUM | Deferred | Skip-to-content link is a worthwhile accessibility improvement but lower priority than correctness and security fixes. | Re-open when a dedicated accessibility pass is scheduled. |
| UX-MOBILE-01 | designer F4 | `src/components/layout/public-header.tsx:200-259` | LOW / MEDIUM | Deferred | Mobile menu outside-click dismiss is a UX improvement but not a bug. | Re-open when a dedicated mobile UX pass is scheduled. |
| SSE-CLEANUP-TEST | test-engineer F4 | `src/app/api/v1/submissions/[id]/events/route.ts:66-84` | LOW / MEDIUM | Deferred | SSE cleanup timer test is worthwhile but low priority. | Re-open when SSE connection tracking issues are observed. |
| EXAM-SESSION-COMMENT | debugger F3 | `src/lib/assignments/exam-sessions.ts:87-94` | LOW / MEDIUM | Deferred | The onConflictDoNothing + re-fetch pattern is correct but should have a comment documenting the unique constraint dependency. | Re-open when exam sessions are next modified. |
| DEF-01 (carried) | — | Production-only failures on `/practice` and `/rankings` | MEDIUM / HIGH | Deferred (carried from cycle 1) | Browser audit confirms live failures, but current-head static review has not yet isolated a repo-side root cause. | Reproduce the failure against current HEAD with production-like data/config. |
| SSE-EVICT (carried) | AGG-5 (cycle 1) | `src/app/api/v1/submissions/[id]/events/route.ts:41-44` | LOW / MEDIUM | Deferred (carried from cycle 1) | SSE connection eviction edge case only matters under extreme load. | User reports of connection limit violations. |
| RATE-DUAL (carried) | AGG-6 (cycle 1) | `src/lib/realtime/realtime-coordination.ts` | LOW / MEDIUM | Deferred (carried from cycle 1) | rateLimits table dual-purpose is an architectural concern, not a bug. | Performance reports of table bloat or query plan issues. |
| CHAT-HOLD (carried) | AGG-8 (cycle 1) | `src/app/api/v1/plugins/chat-widget/chat/route.ts:386-430` | MEDIUM / MEDIUM | Deferred (carried from cycle 1) | Chat widget HTTP connection hold time is an architectural improvement. | User reports of chat timeout or server resource exhaustion. |
| DEAD-01 (carried) | AGG-12 (cycle 2) | `src/lib/security/rate-limit.ts:183-258` | LOW / HIGH | Deferred (carried from cycle 2) | Unused dead code, safe to remove but not urgent. | Re-open when a rate-limit cleanup pass is scheduled. |
| ENV-01 (carried) | AGG-10 (cycle 2) | `src/lib/compiler/execute.ts:56-57`, `src/lib/docker/client.ts:6-7` | MEDIUM / HIGH | Deferred (carried from cycle 2) | Empty-string fallbacks for env vars provide implicit fail-fast. | Re-open when a startup validation pass is scheduled. |
| PERF-SCORING (carried) | perf-reviewer F4 | `src/lib/assignments/contest-scoring.ts:153-154` | LOW / LOW | Deferred | Window function optimization is correct but marginal improvement. | Re-open when contest scoring performance is a reported issue. |
| PERF-ANTICHEAT (carried) | perf-reviewer F3 | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:189-201` | LOW / MEDIUM | Deferred | Anti-cheat heartbeat gap detection caching would help under high concurrent load. | Re-open when anti-cheat page performance is a reported issue. |
| USER-DELETE-RATE (carried) | security-reviewer F5 | `src/app/api/v1/users/[id]/route.ts:461` | LOW / LOW | Deferred | Stale rate-limit entries after user deletion are cleaned by TTL. | Re-open if rate-limit table bloat is observed. |

---

## Revalidated non-actions from prior cycles

### CLOSED-01: Password-complexity escalation requests are invalid under repo policy
- `AGENTS.md` explicitly forbids adding complexity requirements

### CLOSED-02: JSON-LD script-escaping is already fixed on current HEAD
- `src/components/seo/json-ld.tsx` uses `safeJsonForScript()`

### CLOSED-03: Shell-command prefix-bypass is already fixed on current HEAD
- `src/lib/compiler/execute.ts` uses `isValidCommandPrefix()`

### CLOSED-04: WorkspaceNav tracking on Korean text is safe
- `tracking-[0.18em]` applies only to English uppercase section label

---

## Progress ledger

| Story | Status | Commit |
| --- | --- | --- |
| CSV-02 | DONE | `4ae85b95` |
| NAFIX-02 | DONE | `4ae85b95` |
| CHAT-LOG-01 | DONE | `de7c72ef` |
| WS-PHASE1 | DONE | `effd7c74` |
| TEST-01 | DONE | `6c37b244` |

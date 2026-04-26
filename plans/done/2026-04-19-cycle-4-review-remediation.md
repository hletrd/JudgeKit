# Cycle 4 Review Remediation Plan (review-plan-fix loop — current iteration)

**Date:** 2026-04-19
**Source:** `.context/reviews/cycle-4-aggregate.md` (via `_aggregate.md`), per-agent reviews under `.context/reviews/cycle-4-*.md`
**Status:** IN PROGRESS

## Planning notes
- This pass re-read repo rules first: `CLAUDE.md`, `AGENTS.md`, `.context/development/*.md`.
- Cycle 3 remediation plan is COMPLETE — all stories implemented.
- Review findings from this cycle's fresh reviews are mapped below to either implementation stories or explicit deferred / invalidated items. No review finding is intentionally dropped.
- User-injected TODOs from `plans/open/user-injected/pending-next-cycle.md` are prioritized: workspace-to-public migration Phase 2 and deploy script fixes.

---

## Implementation stories for this pass

### CONTEST-CSV-01 — Add row limit to contest export and unify CSV escape function
**Sources:** AGG-1, AGG-2, code-reviewer F6, security-reviewer F1, perf-reviewer F1, debugger F1, debugger F4, critic F1, verifier F1, verifier F2
**Severity:** HIGH | **Confidence:** HIGH | **Effort:** Medium

**Files:**
- `src/app/api/v1/contests/[assignmentId]/export/route.ts:11-21` (delete local `escapeCsvCell`, import shared)
- `src/app/api/v1/contests/[assignmentId]/export/route.ts:67` (add row limit)
- `src/lib/assignments/contest-scoring.ts` (verify `computeContestRanking` behavior)

**Problem:** The contest export route has no row limit and uses a local `escapeCsvCell` with a weaker formula-injection mitigation (single-quote prefix instead of tab prefix). This is the same OOM bug class as the admin submissions export fixed in cycle 3, but missed because the contest export uses `computeContestRanking` instead of a direct Drizzle query.

**Fix:**
1. Replace local `escapeCsvCell` with an import from `@/lib/csv/escape-field`.
2. Add a `MAX_EXPORT_ENTRIES = 10_000` constant and truncate `entries` if it exceeds the limit.
3. If truncated, add a `truncated: true` field to the JSON response or a comment line in the CSV.

**Verification:**
- `npm run build` (no broken imports)
- `npx tsc --noEmit`
- Manual check: CSV export is bounded
- `npx vitest run` (unit tests)

---

### GROUP-CSV-01 — Replace local `escapeCsvField` in group assignment export with shared utility
**Sources:** AGG-3, code-reviewer F3, critic F2
**Severity:** LOW | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:12-25` (delete local `escapeCsvField`, import shared)
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:24` (update `buildCsvRow`)

**Problem:** The group assignment export has a local `escapeCsvField` that duplicates the shared utility. While the implementation matches (tab prefix), it could diverge in the future.

**Fix:**
1. Import `escapeCsvField` from `@/lib/csv/escape-field`.
2. Delete the local `escapeCsvField` and `buildCsvRow` (inline the `.map(escapeCsvField).join(",")` pattern).

**Verification:**
- `npm run build`
- `npx tsc --noEmit`

---

### DEPLOY-01 — Fix deploy-worker.sh to preserve remote `.env` customizations
**Sources:** AGG-4, security-reviewer F2, debugger F2, critic F4, user-injected TODO #2
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `scripts/deploy-worker.sh:99-110`

**Problem:** The worker deploy script creates a new `.env` locally with 5 variables and uploads via `scp`, replacing any existing `.env`. Custom settings like `DOCKER_HOST` or custom `RUST_LOG` are silently lost.

**Fix:**
1. Instead of `scp`-ing a full `.env` file, write each required variable individually via SSH.
2. Use `ssh ... 'grep -q "^KEY=" .env || echo "KEY=value" >> .env'` for each variable.
3. For variables that should always be updated (e.g., `JUDGE_BASE_URL`, `JUDGE_AUTH_TOKEN`), use `ssh ... 'sed -i "s|^KEY=.*|KEY=value|" .env'` (update in place).
4. Preserve any remote-only keys that are not in the generated set.

**Verification:**
- Manual: deploy worker to a test host with a customized `.env`, verify custom keys survive
- Script runs without error

---

### DEPLOY-02 — Auto-inject COMPILER_RUNNER_URL when INCLUDE_WORKER=false
**Sources:** AGG-5, security-reviewer F3, critic F4, user-injected TODO #3
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `deploy-docker.sh:335-341`

**Problem:** When `INCLUDE_WORKER=false`, the deploy script dies if `COMPILER_RUNNER_URL` is not set in the remote `.env.production`. The correct URL should be auto-injected, similar to how `AUTH_TRUST_HOST` is handled via `ensure_env_secret`.

**Fix:**
1. Add an `ensure_env_secret COMPILER_RUNNER_URL http://host.docker.internal:3001` call after the existing `ensure_env_secret AUTH_TRUST_HOST true` line, gated on `INCLUDE_WORKER != "true"`.
2. Remove the die-on-missing-COMPILER_RUNNER_URL check (lines 335-341) since the auto-injection will handle it.
3. Keep a warning if the URL is still the default `http://judge-worker:3001` after injection (which would indicate a misconfiguration).

**Verification:**
- `bash -n deploy-docker.sh` (syntax check)
- Manual: deploy with `--no-worker` and verify `COMPILER_RUNNER_URL` is set in remote `.env.production`

---

### PAGINATION-01 — Refactor `parsePagination` to use `parsePositiveInt`
**Sources:** AGG-7, code-reviewer F1, debugger F3, verifier F3
**Severity:** LOW | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/lib/api/pagination.ts`

**Problem:** `parsePagination` uses bare `parseInt` with `||` fallback instead of the project-standard `parsePositiveInt`. The `||` fallback works correctly today but is fragile against future refactoring.

**Fix:**
1. Import `parsePositiveInt` from `@/lib/validators/query-params`.
2. Replace `parseInt(searchParams.get("page") || "1", 10) || 1` with `parsePositiveInt(searchParams.get("page"), 1)`.
3. Replace `parseInt(searchParams.get("limit") || String(defaultLimit), 10) || defaultLimit` with `parsePositiveInt(searchParams.get("limit"), defaultLimit)`.
4. Simplify the `Math.max`/`Math.min` logic accordingly.
5. Also fix `parseCursorParams` to use `parsePositiveInt`.

**Verification:**
- `npx tsc --noEmit`
- `npx vitest run` (existing tests should pass unchanged)

---

### ANTICHEAT-01 — Replace bare `parseInt` for offset in anti-cheat GET route
**Sources:** AGG-8, code-reviewer F4
**Severity:** LOW | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:150`

**Problem:** The `rawOffset` parameter uses `parseInt` instead of a shared utility. Add a `parseNonNegativeInt` utility for offset parameters, or just use `parsePositiveInt` with a `Math.max(0, ...)` wrapper.

**Fix:**
1. Add `parseNonNegativeInt` to `src/lib/validators/query-params.ts` (same as `parsePositiveInt` but returns 0 for invalid/missing values instead of the default, and accepts 0 as valid).
2. Replace `parseInt(searchParams.get("offset") ?? "0", 10)` with `parseNonNegativeInt(searchParams.get("offset"), 0)`.
3. Remove the `Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0)` guard line.

**Verification:**
- `npx tsc --noEmit`
- `npx vitest run`

---

### PROXY-01 — Remove dead `/workspace/:path*` from proxy matcher
**Sources:** AGG-9, security-reviewer F5, architect F3, critic F5
**Severity:** LOW | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/proxy.ts:311`

**Problem:** The proxy matcher includes `/workspace/:path*` which is dead code after the Phase 1 workspace migration in cycle 3.

**Fix:**
1. Remove `/workspace/:path*` from the `config.matcher` array.
2. Remove the `isWorkspaceRoute` variable and its usage in the `isProtectedRoute` computation.

**Verification:**
- `npm run build`
- Manual: `/workspace` and `/workspace/discussions` still redirect correctly (handled by Next.js route-level redirects)

---

### SUBMISSIONS-01 — Optimize submissions GET route to use COUNT(*) OVER()
**Sources:** AGG-11, perf-reviewer F2
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Medium

**Files:**
- `src/app/api/v1/submissions/route.ts:111-134`

**Problem:** The offset-based pagination path runs two separate queries — one for `count(*)` and one for the data page. Same pattern that was fixed for rankings (RANK-01) and chat-logs (CHAT-LOG-01).

**Fix:**
1. Add `COUNT(*) OVER() AS total` to the main query's select.
2. Remove the separate count query.
3. Extract `total` from the first row of results (or 0 if empty).

**Verification:**
- `npx tsc --noEmit`
- `npx vitest run`
- Manual: submissions list page works correctly

---

### WS-PHASE2 — Implement workspace-to-public migration Phase 2 (PublicHeader authenticated dropdown)
**Sources:** AGG-6, architect F1, critic F3, designer F1, designer F2, user-injected TODO #1
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Medium

**Files:**
- `src/components/layout/public-header.tsx` (add dropdown menu)
- `src/app/(public)/layout.tsx` (pass session data to PublicHeader)
- `messages/en.json`, `messages/ko.json` (add dropdown i18n keys)

**Problem:** The `PublicHeader` shows only a single "Dashboard" link when the user is logged in. The migration plan calls for a "Dashboard" dropdown with role-appropriate links (Problems, Groups, Submissions, Profile, Admin). Mobile menu also lacks authenticated navigation items.

**Fix:**
1. Extend `PublicHeader` to accept a `loggedInUser` object with role and a list of dashboard navigation items.
2. When authenticated, render a "Dashboard" dropdown menu (using shadcn DropdownMenu) with role-appropriate links.
3. Add dropdown items: Dashboard, Problems (instructor+), Groups (instructor+), My Submissions, Profile, Admin (admin only), Sign Out.
4. Add corresponding mobile menu items.
5. Update i18n keys for dropdown labels.
6. Keep `(dashboard)` route group and `AppSidebar` as-is — Phase 2 only changes the top nav on public pages.

**Verification:**
- `npm run build`
- `npx tsc --noEmit`
- Manual: dropdown appears when logged in with role-appropriate items
- Manual: mobile menu shows authenticated navigation items
- Manual: unauthenticated view unchanged

---

### TEST-02 — Add tests for contest export and group assignment export routes
**Sources:** AGG-10, test-engineer F1, test-engineer F2
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Medium

**Files:**
- New: `tests/unit/api/contest-export.route.test.ts`
- New: `tests/unit/api/group-assignment-export.route.test.ts`

**Problem:** Two export endpoints have no test coverage. The unbounded data loading and CSV escape divergence would have been caught by basic tests.

**Fix:**
1. Add tests for contest export: CSV format with shared `escapeCsvField`, JSON format, anonymization, row limit enforcement.
2. Add tests for group assignment export: CSV format, auth checks, student status data.

**Verification:**
- `npx vitest run` (all new tests pass)

---

## Deferred / invalidated review register

| Bucket | Source finding IDs | File + line citation | Original severity / confidence | Disposition | Reason | Exit criterion |
| --- | --- | --- | --- | --- | --- | --- |
| CRYPTO-01 | AGG-11 (cycle 3) | `src/app/api/v1/plugins/chat-widget/chat/route.ts:176-189` | MEDIUM / HIGH | Deferred (carried from cycle 2) | Chat widget API key encryption requires coordinated migration. Keys are only accessible to admin users via the plugin config UI. | Re-open when a dedicated plugin secrets encryption plan is approved. |
| EDITOR-CODE-01 | AGG-9 (cycle 3) | `src/app/api/v1/plugins/chat-widget/chat/route.ts:39` | LOW / MEDIUM | Deferred (carried from cycle 3) | Chat widget editorCode 100KB limit is a cost/UX concern, not a bug. | Re-open when AI API costs are shown to be problematic. |
| UX-SKIP-01 | designer F3 | `src/components/layout/public-header.tsx` | LOW / MEDIUM | Deferred | Skip-to-content link is a worthwhile accessibility improvement but lower priority than correctness and security fixes. | Re-open when a dedicated accessibility pass is scheduled. |
| UX-MOBILE-01 | designer F4 | `src/components/layout/public-header.tsx:200-259` | LOW / MEDIUM | Deferred | Mobile menu outside-click dismiss is a UX improvement but not a bug. | Re-open when a dedicated mobile UX pass is scheduled. |
| SSE-CLEANUP-TEST | test-engineer F4 (cycle 3) | `src/app/api/v1/submissions/[id]/events/route.ts:66-84` | LOW / MEDIUM | Deferred (carried from cycle 3) | SSE cleanup timer test is worthwhile but low priority. | Re-open when SSE connection tracking issues are observed. |
| EXAM-SESSION-COMMENT | debugger F3 (cycle 3) | `src/lib/assignments/exam-sessions.ts:87-94` | LOW / MEDIUM | Deferred (carried from cycle 3) | The onConflictDoNothing + re-fetch pattern is correct but should have a comment. | Re-open when exam sessions are next modified. |
| DEF-01 (carried) | — | Production-only failures on `/practice` and `/rankings` | MEDIUM / HIGH | Deferred (carried from cycle 1) | Browser audit confirms live failures, but current-head static review has not yet isolated a repo-side root cause. | Reproduce the failure against current HEAD with production-like data/config. |
| SSE-EVICT (carried) | AGG-5 (cycle 1) | `src/app/api/v1/submissions/[id]/events/route.ts:41-44` | LOW / MEDIUM | Deferred (carried from cycle 1) | SSE connection eviction edge case only matters under extreme load. | User reports of connection limit violations. |
| RATE-DUAL (carried) | AGG-6 (cycle 1) | `src/lib/realtime/realtime-coordination.ts` | LOW / MEDIUM | Deferred (carried from cycle 1) | rateLimits table dual-purpose is an architectural concern, not a bug. | Performance reports of table bloat or query plan issues. |
| CHAT-HOLD (carried) | AGG-8 (cycle 1) | `src/app/api/v1/plugins/chat-widget/chat/route.ts:386-430` | MEDIUM / MEDIUM | Deferred (carried from cycle 1) | Chat widget HTTP connection hold time is an architectural improvement. | User reports of chat timeout or server resource exhaustion. |
| DEAD-01 (carried) | AGG-12 (cycle 2) | `src/lib/security/rate-limit.ts:183-258` | LOW / HIGH | Deferred (carried from cycle 2) | Unused dead code, safe to remove but not urgent. | Re-open when a rate-limit cleanup pass is scheduled. |
| ENV-01 (carried) | AGG-10 (cycle 2) | `src/lib/compiler/execute.ts:56-57`, `src/lib/docker/client.ts:6-7` | MEDIUM / HIGH | Deferred (carried from cycle 2) | Empty-string fallbacks for env vars provide implicit fail-fast. | Re-open when a startup validation pass is scheduled. |
| PERF-SCORING (carried) | perf-reviewer F4 | `src/lib/assignments/contest-scoring.ts:153-154` | LOW / LOW | Deferred | Window function optimization is correct but marginal improvement. | Re-open when contest scoring performance is a reported issue. |
| PERF-ANTICHEAT (carried) | perf-reviewer F3 | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:189-201` | LOW / MEDIUM | Deferred | Anti-cheat heartbeat gap detection caching would help under high concurrent load. | Re-open when anti-cheat page performance is a reported issue. |
| USER-DELETE-RATE (carried) | security-reviewer F5 | `src/app/api/v1/users/[id]/route.ts:461` | LOW / LOW | Deferred | Stale rate-limit entries after user deletion are cleaned by TTL. | Re-open if rate-limit table bloat is observed. |
| SSE-LARGE-IN | perf-reviewer F4 | `src/app/api/v1/submissions/[id]/events/route.ts:141-172` | LOW / MEDIUM | Deferred | Large `inArray` clause only matters under extreme load (>500 concurrent SSE connections). | Re-open when SSE performance issues are reported under high load. |
| API-HANDLER-MIGRATE | AGG-12 | 11 route files | LOW / HIGH | Deferred | Migrating 11 routes to `createApiHandler` is a consistency improvement but not a bug fix. Routes with legitimate reasons (SSE, file upload) should remain manual. | Re-open when a dedicated API consistency pass is scheduled. |

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
| CONTEST-CSV-01 | PENDING | — |
| GROUP-CSV-01 | PENDING | — |
| DEPLOY-01 | PENDING | — |
| DEPLOY-02 | PENDING | — |
| PAGINATION-01 | PENDING | — |
| ANTICHEAT-01 | PENDING | — |
| PROXY-01 | PENDING | — |
| SUBMISSIONS-01 | PENDING | — |
| WS-PHASE2 | PENDING | — |
| TEST-02 | PENDING | — |

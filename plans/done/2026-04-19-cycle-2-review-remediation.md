# Cycle 2 Review Remediation Plan (review-plan-fix loop)

**Date:** 2026-04-19  
**Source:** `.context/reviews/cycle-2-aggregate.md`, per-agent reviews under `.context/reviews/cycle-2-*.md`  
**Status:** IN PROGRESS

## Planning notes
- This pass re-read repo rules first: `CLAUDE.md`, `AGENTS.md`, `.context/development/*.md`.
- The prior `plans/open/2026-04-19-cycle-2-review-remediation.md` was partially complete (AUTH-01 and UX-01 done). It has been archived to `plans/archive/2026-04-19-cycle-2-review-remediation-initial.md`.
- Review findings from cycle 2 are mapped below to either implementation stories or explicit deferred / invalidated items. No review finding is intentionally dropped.
- User-injected TODOs from `plans/open/user-injected/pending-next-cycle.md` are incorporated as stories.

---

## Implementation stories for this pass

### AUTH-02 — Verify and ensure AUTH_TRUST_HOST=true in production deployment config
**Sources:** AGG-4, user-injected TODO #1  
**Severity:** HIGH | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `.env.deploy.algo` (deployment env file, not in repo)
- `deploy-docker.sh`
- `docker-compose.production.yml`

**Problem:** The UntrustedHost fix (commit 5353f41f) added `shouldTrustAuthHost()` to `validateTrustedAuthHost()`, but the production deployment on algo.xylolabs.com still shows `{"error":"UntrustedHost"}`. The code fix only works if `AUTH_TRUST_HOST=true` is set in the production environment. Either the env var is not set, or the nginx/reverse-proxy is stripping `x-forwarded-host` before it reaches the auth route.

**Fix:**
1. Verify that `.env.deploy.algo` includes `AUTH_TRUST_HOST=true`. If not, add it.
2. Verify that nginx passes `x-forwarded-host` to the Next.js app on auth routes (`/api/auth/`).
3. If the env var was missing, redeploy after adding it.
4. Add a deployment check in `deploy-docker.sh` that warns if `AUTH_TRUST_HOST` is not set in production.

**Verification:**
- Test login on algo.xylolabs.com after deploy
- Verify `validateTrustedAuthHost` returns `null` in production logs when `AUTH_TRUST_HOST=true`

---

### LANG-01 — Add grading server hardware and OS info to languages page
**Sources:** AGG-7, user-injected TODO #3  
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Medium

**Files:**
- `src/app/(public)/languages/page.tsx`
- `src/lib/judge/dashboard-data.ts`
- `src/lib/system-info.ts`
- `messages/ko.json`, `messages/en.json` (i18n keys)

**Problem:** The languages page shows language variants and commands but does not display the grading server hardware/OS info. Users need to know what environment their code runs on.

**Fix:**
1. Extend `getJudgeSystemSnapshot()` to include grading server system info (CPU, architecture, OS) from `getRuntimeSystemInfo()`.
2. Add i18n keys for the grading environment card.
3. Add a "Grading Environment" card above the language table showing: CPU model, architecture, OS, default time limit, default memory limit.
4. Ensure the system info is fetched from the judge worker host, not the app server (the worker runs on a different machine in production).

**Verification:**
- `npx vitest run` (unit tests)
- Visual check on the languages page

---

### NAFIX-01 — Fix NaN propagation in admin audit-logs and login-logs query params
**Sources:** AGG-1  
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/app/api/v1/admin/audit-logs/route.ts:47-48`
- `src/app/api/v1/admin/login-logs/route.ts:34-35`
- New: `src/lib/validators/query-params.ts` (shared utility)
- Tests: `tests/unit/api/admin-audit-logs.route.test.ts`, `tests/unit/api/admin-login-logs.route.test.ts`

**Problem:** `Number(searchParams.get("page") ?? "1")` produces `NaN` for non-numeric strings. `Math.max(1, NaN)` returns `NaN`, causing invalid offset computation. Same bug class as the tags route NaN fix in cycle 1.

**Fix:**
1. Create a shared `parsePositiveInt(value: string | null | undefined, defaultValue: number): number` utility in `src/lib/validators/query-params.ts`.
2. Replace all `Number(searchParams.get(...))` patterns in audit-logs and login-logs with `parsePositiveInt`.
3. Also update the tags route to use the shared utility.
4. Add tests for non-numeric, negative, zero, and decimal inputs.

**Verification:**
- `npx vitest run tests/unit/api/admin-audit-logs.route.test.ts`
- `npx vitest run tests/unit/api/admin-login-logs.route.test.ts`

---

### CSV-01 — Add row limit to admin CSV exports
**Sources:** AGG-2  
**Severity:** HIGH | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/app/api/v1/admin/audit-logs/route.ts:127-175`
- `src/app/api/v1/admin/login-logs/route.ts:98-132`
- New: `src/lib/csv/escape-field.ts` (extracted shared utility)
- Tests: corresponding test files

**Problem:** CSV export paths omit `.limit().offset()`, potentially returning millions of rows and causing memory exhaustion DoS.

**Fix:**
1. Extract `escapeCsvField` to shared utility `src/lib/csv/escape-field.ts`.
2. Apply the same `limit`/`offset` to CSV exports as JSON exports.
3. Add a maximum CSV export row count (e.g., 10000) as a safeguard.
4. Add tests verifying CSV export is bounded.

**Verification:**
- `npx vitest run` (all unit tests)

---

### PRACTICE-01 — Optimize practice page Path B to not load all problems into memory
**Sources:** AGG-3  
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Medium

**Files:**
- `src/app/(public)/practice/page.tsx:410-447`

**Problem:** Path B (progress filter active) fetches all problem IDs and user submissions into memory, then filters in JS. Scales poorly with problem count.

**Fix:**
1. In the initial `allProblemRows` query, only select `{ id: true }` instead of `{ id, sequenceNumber, title, description }`.
2. Consider moving progress filtering into SQL using a CTE or subquery (longer-term).
3. Add a comment documenting the scaling concern.

**Verification:**
- Manual check that progress filtering still works after column reduction
- `npx vitest run` (unit tests)

---

### RANK-01 — Optimize rankings page to use single query with window function
**Sources:** AGG-5  
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Medium

**Files:**
- `src/app/(public)/rankings/page.tsx:115-172`

**Problem:** The `first_accepts` CTE is computed twice (count + data), doubling query cost and allowing race conditions.

**Fix:**
1. Refactor to use `COUNT(*) OVER()` window function in a single query.
2. Remove the separate count query.
3. Add a test verifying pagination consistency.

**Verification:**
- Visual check on rankings page
- `npx vitest run` (unit tests)

---

### WS-MIGRATE-01 — Plan workspace-to-public page migration
**Sources:** AGG-13, user-injected TODO #2  
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Planning only (no implementation this cycle)

**Files:**
- New plan: `plans/open/2026-04-19-workspace-to-public-migration.md`

**Problem:** User wants to deprecate workspace-only pages and bring menus to public with new top navbar layout. This is a large architectural change that requires careful planning before implementation.

**Fix (plan only):**
1. Inventory all workspace-only pages and control pages.
2. Categorize each page: can move to public, must stay in authenticated area (with reason).
3. Design the new top navbar layout.
4. Define phased migration order.
5. Write the plan document for review in a future cycle.

**Verification:**
- Plan reviewed and approved before any implementation

---

## Deferred / invalidated review register

| Bucket | Source finding IDs | File + line citation | Original severity / confidence | Disposition | Reason | Exit criterion |
| --- | --- | --- | --- | --- | --- | --- |
| CRYPTO-01 | AGG-8 | `src/app/api/v1/plugins/chat-widget/chat/route.ts:176-189` | MEDIUM / HIGH | Deferred | Chat widget API key encryption is a broader auth/crypto architecture concern requiring coordinated migration. The keys are only accessible to admin users via the plugin config UI, and the DB access itself requires server compromise. | Re-open when a dedicated plugin secrets encryption plan is approved. |
| CHAT-01 | AGG-9 | `src/app/api/v1/plugins/chat-widget/chat/route.ts:428` | LOW / MEDIUM | Deferred | Tool result truncation is a low-risk improvement. Current LLM APIs have their own context limits that effectively bound tool result sizes. | Re-open when chat widget tool result sizes are shown to cause issues. |
| ENV-01 | AGG-10 | `src/lib/compiler/execute.ts:56-57`, `src/lib/docker/client.ts:6-7` | MEDIUM / HIGH | Deferred | Empty-string fallbacks for `COMPILER_RUNNER_URL` and `RUNNER_AUTH_TOKEN` are a code-quality concern, but the existing behavior (connection refused on empty URL) provides an implicit fail-fast. A proper startup validation would require understanding the deployment topology (some deployments may not use the compiler runner at all). | Re-open when a startup validation pass is scheduled. |
| SSE-01 | AGG-11 | `src/app/api/v1/submissions/[id]/events/route.ts:41-49` | LOW / MEDIUM | Deferred | SSE connection eviction is a low-risk edge case that only matters under extreme load approaching 1000 concurrent SSE connections. The `MAX_TRACKED_CONNECTIONS = 1000` cap is generous for the current deployment. | Re-open when SSE connection tracking issues are observed in production or load testing. |
| DEAD-01 | AGG-12 | `src/lib/security/rate-limit.ts:183-258` | LOW / HIGH | Deferred | `recordRateLimitFailure` and `recordRateLimitFailureMulti` are unused dead code. Safe to remove but not urgent. | Re-open when a rate-limit cleanup pass is scheduled. |
| REVIEW-INVALID-01 | — | `src/lib/security/password.ts` | HIGH / HIGH | Invalidated by repo policy | `AGENTS.md` explicitly requires password validation to check only minimum length (8 chars) and forbids complexity/similarity/dictionary rules. | Re-open only if the repository's password policy changes. |
| REVIEW-STALE-01 | — | `src/components/seo/json-ld.tsx:19` | LOW / MEDIUM | Invalidated as stale | Current HEAD already uses `safeJsonForScript(data)`. | Re-open if `safeJsonForScript` is removed or bypassed. |
| REVIEW-STALE-02 | — | `src/lib/compiler/execute.ts` | MEDIUM / CONFIRMED | Invalidated as stale | Current HEAD already uses `isValidCommandPrefix()`. | Re-open if strict command-prefix validation regresses. |
| UX-LOW-01 | designer F1, F5 | `src/components/layout/public-header.tsx`, `src/app/(public)/practice/page.tsx` | LOW / MEDIUM | Deferred | Skip-to-content link and loading state are worthwhile UX improvements but lower priority than the correctness and security fixes in this cycle. | Re-open when a dedicated UX/accessibility pass is scheduled. |
| UX-LOW-02 | designer F3 | `src/components/layout/workspace-nav.tsx:31` | LOW / LOW | Closed / pass | The `tracking-[0.18em]` applies to an English uppercase section label, not Korean text. Confirmed compliance with CLAUDE.md rule. | Re-open only if the section label becomes Korean. |
| SECURITY-LOW-01 | security-reviewer F5 | `src/app/api/v1/admin/audit-logs/route.ts:171`, `src/app/api/v1/admin/login-logs/route.ts:129` | LOW / MEDIUM | Closed / pass | CSV filenames are hardcoded; no user-controlled input in filenames. | Re-open if filenames become dynamic. |
| SQL-01 | code-reviewer F5 | `src/app/(public)/rankings/page.tsx:31-39` | LOW / HIGH | Deferred | Raw SQL string interpolation in `getPeriodClause` is currently safe due to validation, but the pattern is fragile. | Re-open when the rankings page query is refactored (covered by RANK-01). |

---

## Progress ledger

| Story | Status | Commit |
| --- | --- | --- |
| AUTH-02 | Done | c803ee1d |
| CSV-01 | Done | ed01e45f |
| NAFIX-01 | Done | ed01e45f |
| LANG-01 | Done | 60cecf3e |
| PRACTICE-01 | Done | 5eeb680d |
| RANK-01 | Done | 2e3cadd6 |
| WS-MIGRATE-01 | Done (plan only) | 38d3e3cf |

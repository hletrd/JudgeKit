# Cycle 2 Aggregate Review (review-plan-fix loop)

## Scope
- Aggregated from: `cycle-2-code-reviewer.md`, `cycle-2-security-reviewer.md`, `cycle-2-perf-reviewer.md`, `cycle-2-critic.md`, `cycle-2-test-engineer.md`, `cycle-2-architect.md`, `cycle-2-debugger.md`, `cycle-2-verifier.md`, `cycle-2-designer.md`
- Base commit: b91dac5b

## Deduped findings

### AGG-1 — Admin audit-logs and login-logs use `Number()` for query params, producing NaN
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer F1, security-reviewer (implicit), critic F4, debugger F1, test-engineer F1, verifier F2
- **Evidence:**
  - `src/app/api/v1/admin/audit-logs/route.ts:47-48`: `Number(searchParams.get("page") ?? "1")` produces NaN for non-numeric strings
  - `src/app/api/v1/admin/login-logs/route.ts:34-35`: identical pattern
  - Same bug class as tags route NaN issue fixed in cycle 1 (AGG-1) and anti-cheat NaN fix (commit 88391c26)
- **Why it matters:** Non-numeric `page`/`limit` query params produce NaN, causing invalid offset computation and SQL errors or empty results
- **Suggested fix:** Use `parseInt` with `||` fallback, or create a shared `parsePositiveInt` utility

### AGG-2 — Admin CSV exports have no row limit (DoS risk)
- **Severity:** HIGH
- **Confidence:** HIGH
- **Cross-agent agreement:** security-reviewer F1, test-engineer F2
- **Evidence:**
  - `src/app/api/v1/admin/audit-logs/route.ts:127-175`: CSV export path omits `.limit().offset()`
  - `src/app/api/v1/admin/login-logs/route.ts:98-132`: identical pattern
- **Why it matters:** Admin user can request CSV export of millions of rows, causing memory exhaustion
- **Suggested fix:** Apply limit/offset to CSV exports, or impose a maximum export row count (e.g., 10000)

### AGG-3 — Practice page Path B loads all problems into memory for progress filtering
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer F3, perf-reviewer F1, debugger F3, test-engineer F3
- **Evidence:**
  - `src/app/(public)/practice/page.tsx:410-447`: fetches all problem IDs and user submissions, then filters in JS
  - Initial query fetches unnecessary columns (title, description) when only id is needed
- **Why it matters:** Memory and DB load scale with total problem count, not just page size
- **Suggested fix:** Move progress filtering to SQL, or at minimum only select `id` in the initial query

### AGG-4 — UntrustedHost fix deployed but production env may not have AUTH_TRUST_HOST=true
- **Severity:** HIGH
- **Confidence:** HIGH
- **Cross-agent agreement:** critic F1, verifier F1
- **Evidence:**
  - `plans/open/2026-04-19-cycle-2-review-remediation.md:86`: AUTH-01 marked Done
  - User-injected TODO still reports `{"error":"UntrustedHost"}` on algo.xylolabs.com
  - Code fix (commit 5353f41f) is correct but requires `AUTH_TRUST_HOST=true` in production env
- **Why it matters:** Users cannot log in on the production site
- **Suggested fix:** Verify production `.env.deploy.algo` has `AUTH_TRUST_HOST=true`; if not, add it and redeploy

### AGG-5 — Rankings page runs full CTE twice (count + data)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** perf-reviewer F2, debugger F4, verifier F4
- **Evidence:**
  - `src/app/(public)/rankings/page.tsx:115-172`: `first_accepts` CTE computed in `rawQueryOne` (count) and `rawQueryAll` (data)
  - Race condition possible between the two queries
- **Why it matters:** Doubles query cost on every page load; stale counts cause pagination inconsistency
- **Suggested fix:** Use `COUNT(*) OVER()` window function in a single query

### AGG-6 — Duplicate `escapeCsvField` function across audit-logs and login-logs
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer F2, critic F3
- **Evidence:**
  - `src/app/api/v1/admin/audit-logs/route.ts:32-41`
  - `src/app/api/v1/admin/login-logs/route.ts:19-28`
- **Why it matters:** CSV injection fixes must be applied in both places
- **Suggested fix:** Extract to shared utility `src/lib/csv/escape-field.ts`

### AGG-7 — Languages page lacks grading server hardware/OS info (user TODO #4)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** designer F2
- **Evidence:**
  - `src/app/(public)/languages/page.tsx`: shows languages but not grading environment
  - `src/lib/system-info.ts`: already provides `getRuntimeSystemInfo()` with CPU, architecture, OS
  - `src/lib/judge/dashboard-data.ts`: already returns `architectureSummary`, `defaultTimeLimitMs`, `defaultMemoryLimitMb`
- **Why it matters:** Users need to know what environment their code runs on
- **Suggested fix:** Add a "Grading Environment" card to the languages page using existing data sources

### AGG-8 — Chat widget API keys stored as plaintext in database
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** security-reviewer F4, architect F2
- **Evidence:**
  - `src/app/api/v1/plugins/chat-widget/chat/route.ts:176-189`: `config.openaiApiKey`, `config.claudeApiKey`, `config.geminiApiKey` loaded from DB
- **Why it matters:** DB compromise exposes all AI provider API keys
- **Suggested fix:** Encrypt at rest using existing `derive-key.ts`/`encryption.ts`, or move to env-var-only config

### AGG-9 — Chat widget tool results not truncated before being added to message array
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** critic F5, test-engineer F5
- **Evidence:**
  - `src/app/api/v1/plugins/chat-widget/chat/route.ts:428`: `toolResult` is used directly without size check
- **Why it matters:** Very large tool results could cause memory issues in subsequent LLM API calls
- **Suggested fix:** Truncate tool results to a maximum length (e.g., 4000 characters)

### AGG-10 — `COMPILER_RUNNER_URL` and `RUNNER_AUTH_TOKEN` have empty-string fallbacks
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** security-reviewer F2
- **Evidence:**
  - `src/lib/compiler/execute.ts:56-57`: `process.env.COMPILER_RUNNER_URL || ""`
  - `src/lib/docker/client.ts:6-7`: `process.env.COMPILER_RUNNER_URL || ""`
- **Why it matters:** Misconfigured env vars silently default to empty strings instead of failing fast
- **Suggested fix:** Validate at startup rather than falling back to empty string

### AGG-11 — SSE connection eviction decrements active user connection counts
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** debugger F2, test-engineer F4
- **Evidence:**
  - `src/app/api/v1/submissions/[id]/events/route.ts:41-49`: eviction calls `removeConnection` which decrements `userConnectionCounts`
  - If the evicted connection is still active, the user's count is incorrectly decremented
- **Why it matters:** Users could exceed `maxSseConnectionsPerUser` limit after eviction
- **Suggested fix:** Check if the connection is still in `activeConnectionSet` before decrementing, or increase `MAX_TRACKED_CONNECTIONS`

### AGG-12 — `recordRateLimitFailure` and `recordRateLimitFailureMulti` appear unused
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer F4
- **Evidence:**
  - `src/lib/security/rate-limit.ts:183-258`: all call sites use `consumeRateLimitAttemptMulti`
- **Why it matters:** Dead code increases maintenance burden
- **Suggested fix:** Remove or mark as deprecated

### AGG-13 — Workspace-to-public migration (user TODO #3) is underspecified
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** critic F2, architect F1
- **Evidence:**
  - `src/app/(workspace)/`, `src/app/(control)/`, `src/app/(dashboard)/`: three separate route groups with overlapping purposes
  - User wants to deprecate workspace-only pages and bring menus to public layout
- **Why it matters:** Large architectural change with high risk of breaking existing workflows if done hastily
- **Suggested fix:** Create detailed migration plan before implementing

## Lower-signal / validation-needed findings
- designer F1 (skip-to-content in mobile header): valid but low priority
- designer F3 (workspace nav tracking on Korean text): likely safe since section labels are English/uppercase
- designer F5 (practice page loading state): valid UX improvement but low priority
- security-reviewer F5 (CSV filename sanitization): currently safe since filenames are hardcoded
- code-reviewer F5 (rankings raw SQL pattern): valid concern but currently safe due to validation
- code-reviewer F6 (nanoid id inconsistency in rate-limit inserts): needs verification of DB schema default

## Revalidated non-actions from prior cycles

### CLOSED-01: Password-complexity escalation requests remain invalid under repo policy
- `AGENTS.md` explicitly forbids adding complexity requirements

### CLOSED-02: JSON-LD script-escaping is already fixed on current HEAD
- `src/components/seo/json-ld.tsx` uses `safeJsonForScript()`

### CLOSED-03: Shell-command prefix-bypass is already fixed on current HEAD
- `src/lib/compiler/execute.ts` uses `isValidCommandPrefix()`

### CLOSED-04: Proxy x-forwarded-host deletion is documented with safety constraint
- `src/proxy.ts:144-155` now has detailed comment about the dependency

## Agent failures
- No agent failures this cycle — all reviews completed successfully

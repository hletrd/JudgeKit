# Cycle 1 Aggregate Review (review-plan-fix loop)

## Scope
- Aggregated from: `code-reviewer.md`, `perf-reviewer.md`, `security-reviewer.md`, `critic.md`, `verifier.md`, `test-engineer.md`, `architect.md`, `debugger.md`, `designer.md`
- Base commit: b91dac5b

## Deduped findings

### AGG-1 — Tags API `limit` NaN passes undefined value to Drizzle `.limit()`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer F1, debugger F1, verifier F1, test-engineer F1, critic F1
- **Evidence:**
  - `src/app/api/v1/tags/route.ts:17`: `Math.min(Number(searchParams.get("limit") ?? "50"), 100)` produces `NaN` when `limit` is a non-numeric string
  - Same bug class as anti-cheat endpoint NaN issue fixed in cycle 21 (commit 88391c26)
- **Why it matters:** Non-numeric `limit` query param produces undefined Drizzle/PG behavior — may return 0 results or cause a SQL error
- **Suggested fix:** Change to `parseInt` with fallback: `Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 100)`. Critic F1 suggests a shared `parsePositiveInt` helper to prevent recurrence.

### AGG-2 — Chat widget tool-calling loop has no error handling for individual tool failures
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** code-reviewer F2, critic F4, test-engineer F2
- **Evidence:**
  - `src/app/api/v1/plugins/chat-widget/chat/route.ts:425-428`: `executeTool` called without try/catch in the agent loop
- **Why it matters:** A single tool failure (e.g., DB timeout) crashes the entire chat request with a 500 error, giving the user no partial response
- **Suggested fix:** Wrap each `executeTool` call in try/catch and return an error string as the tool result, allowing the agent loop to continue with available information

### AGG-3 — `sanitizeSubmissionForViewer` hidden DB query is a recurring maintainability trap
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer F3, perf-reviewer F2, critic F2, test-engineer F3
- **Evidence:**
  - `src/lib/submissions/visibility.ts:74`: queries `assignments` table per invocation without documenting the DB query in JSDoc
  - Previously flagged as D16 and in cycle 21 but never structurally fixed
- **Why it matters:** The function signature hides a DB query, making it easy for a future developer to introduce N+1 by calling it in a loop
- **Suggested fix:** Accept `showResultsToCandidate` and `hideScoresFromCandidates` as optional parameters to skip the DB query when the caller already has the data. Add JSDoc.

### AGG-4 — Proxy `x-forwarded-host` deletion is safe but fragile — undocumented dependency on auth-route exclusion
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** security-reviewer F1, critic F3, verifier F2, test-engineer F4
- **Evidence:**
  - `src/proxy.ts:148`: unconditionally deletes `x-forwarded-host` from ALL proxied requests
  - Auth routes (`/api/auth/`) are excluded from the proxy matcher, making this safe by construction
  - `src/lib/auth/trusted-host.ts:4-21`: uses `x-forwarded-host` to determine request host for auth validation
  - Cycle 2 aggregate AGG-1 documented live `UntrustedHost` failures on algo.xylolabs.com
- **Why it matters:** If auth routes are ever added to the proxy matcher, the deletion will break auth callbacks with `UntrustedHost` errors
- **Suggested fix:** Add a code comment at proxy.ts:148 documenting the dependency. Consider adding a rule to AGENTS.md.

### AGG-5 — SSE connection tracking map eviction may decrement per-user counts for active connections
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** debugger F2, verifier F3, designer F2
- **Evidence:**
  - `src/app/api/v1/submissions/[id]/events/route.ts:41-44`: `addConnection` evicts oldest entry by Map insertion order when `connectionInfoMap` reaches `MAX_TRACKED_CONNECTIONS`
  - `removeConnection` (line 51-63) decrements `userConnectionCounts` unconditionally
- **Why it matters:** Evicting an active connection's tracking entry decrements the per-user count, potentially allowing users to exceed `maxSseConnectionsPerUser`
- **Suggested fix:** Before evicting, check if the connection is still active. Alternatively, increase `MAX_TRACKED_CONNECTIONS` to reduce eviction frequency.

### AGG-6 — `rateLimits` table multiplexed for rate limiting and SSE connection tracking
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** code-reviewer F4, architect F2
- **Evidence:**
  - `src/lib/realtime/realtime-coordination.ts`: uses `rateLimits` table for SSE slot tracking
  - `src/lib/security/api-rate-limit.ts`: uses same table for API rate limiting
  - Different `blockedUntil` semantics for each use case
- **Why it matters:** Schema changes to optimize one use case affect the other; cleanup operations must handle both entry types
- **Suggested fix:** Consider separating SSE connection tracking into a dedicated table. This is an architectural improvement, not an immediate bug.

### AGG-7 — Proxy matcher missing `/languages` public route — no CSP/security headers
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** code-reviewer F5, designer F1
- **Evidence:**
  - `src/proxy.ts:301-319`: matcher includes `/practice/:path*`, `/rankings` but not `/languages`
  - `src/app/(public)/languages/page.tsx`: public page exists
- **Why it matters:** The `/languages` page loads without CSP headers, making it slightly less protected than other public pages
- **Suggested fix:** Add `/languages` to the proxy matcher config

### AGG-8 — Chat widget tool-calling loop holds HTTP connection open for extended duration
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **Cross-agent agreement:** architect F1
- **Evidence:**
  - `src/app/api/v1/plugins/chat-widget/chat/route.ts:386-430`: synchronous for-loop with up to 5 iterations, each making an HTTP request to AI provider
- **Why it matters:** If the AI provider is slow (10s per iteration), the connection is held for up to 50 seconds. Under concurrent load, this consumes server resources.
- **Suggested fix:** Consider streaming intermediate results via SSE instead of waiting for the full loop to complete

## Lower-signal / validation-needed findings
- Security-reviewer F2 (chat widget streaming bypasses error normalization): plausible but low risk since streaming responses have their own error handling via `persistChatMessage`
- Security-reviewer F3 (`getAllowedHostsFromDb` returns empty on DB failure): reasonable fail-closed behavior; low risk if `AUTH_URL` is correctly configured
- Perf-reviewer F1 (SSE cleanup timer synchronous iteration): minimal impact for typical connection counts

## Revalidated non-actions from prior cycles

### CLOSED-01: Password-complexity escalation requests are invalid under repo policy
- Repo policy explicitly forbids adding complexity requirements (`AGENTS.md`)

### CLOSED-02: JSON-LD script-escaping finding is already fixed on current HEAD
- `src/components/seo/json-ld.tsx` already uses `safeJsonForScript()`

### CLOSED-03: Shell-command prefix-bypass finding is already fixed on current HEAD
- `src/lib/compiler/execute.ts` now routes through `isValidCommandPrefix()`

### CLOSED-04: Deprecated rate-limit constant finding is stale
- Current files no longer expose the deprecated module-level constants

## Agent failures
- No agent failures this cycle — all reviews completed successfully

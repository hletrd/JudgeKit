# Cycle 3 Aggregate Review (review-plan-fix loop)

## Scope
- Aggregated from: `cycle-3-code-reviewer.md`, `cycle-3-security-reviewer.md`, `cycle-3-perf-reviewer.md`, `cycle-3-architect.md`, `cycle-3-test-engineer.md`, `cycle-3-debugger.md`, `cycle-3-critic.md`, `cycle-3-verifier.md`, `cycle-3-designer.md`
- Base commit: f637c590

## Deduped findings

### AGG-1 — Admin submissions CSV export has no row limit (DoS / OOM risk)
- **Severity:** HIGH
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer F2, security-reviewer F1, perf-reviewer F1, debugger F2, critic F1, verifier F3
- **Evidence:**
  - `src/app/api/v1/admin/submissions/export/route.ts:95-111`: Drizzle query has no `.limit()`
  - All matching rows are fetched into memory and serialized to CSV in a single response
  - Cycle 2 CSV-01 fixed audit-logs and login-logs CSV exports but missed this route
- **Why it matters:** On a deployment with 100K+ submissions, the server could exhaust memory and crash. A compromised admin account could intentionally trigger this.
- **Suggested fix:** Apply `.limit(10000)` as a hard cap. If larger exports are needed, implement streaming CSV via ReadableStream.

### AGG-2 — Admin chat-logs route uses bare `parseInt` instead of shared `parsePositiveInt` (NaN bug)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer F1, debugger F1, critic F3
- **Evidence:**
  - `src/app/api/v1/admin/chat-logs/route.ts:19`: `Math.max(1, parseInt(url.searchParams.get("page") || "1", 10))`
  - `parseInt("abc", 10)` returns `NaN`; `Math.max(1, NaN)` returns `NaN` (not 1)
  - NaN propagates into `offset = (page - 1) * limit = NaN`, causing SQL errors or empty results
  - The shared `parsePositiveInt` utility was created in cycle 2 (NAFIX-01) specifically to prevent this class of bug
- **Suggested fix:** Replace with `parsePositiveInt(url.searchParams.get("page"), 1)`.

### AGG-3 — Admin submissions CSV export has local `escapeCsvField` instead of shared utility
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer F3, critic F2
- **Evidence:**
  - `src/app/api/v1/admin/submissions/export/route.ts:37-46`: local `escapeCsvField` function
  - `src/lib/csv/escape-field.ts`: shared utility extracted in cycle 2
  - The two implementations are currently identical but could diverge
- **Suggested fix:** Import from `@/lib/csv/escape-field` and delete the local copy.

### AGG-4 — Anti-cheat route uses bare `parseInt` instead of shared `parsePositiveInt`
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer F4, architect F3
- **Evidence:**
  - `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:148-149`: `parseInt(searchParams.get("limit") ?? "100", 10) || 100`
  - The `|| 100` fallback handles NaN correctly, but the pattern is inconsistent with the project-wide fix
- **Suggested fix:** Replace with `parsePositiveInt(searchParams.get("limit"), 100)`.

### AGG-5 — Chat-logs session list query runs two separate queries (dual CTE)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** perf-reviewer F2, security-reviewer F2
- **Evidence:**
  - `src/app/api/v1/admin/chat-logs/route.ts:56-119`: data query (lines 69-110) + count query (lines 114-119)
  - Same pattern that was fixed for rankings in cycle 2 (RANK-01) using `COUNT(*) OVER()`
- **Suggested fix:** Use `COUNT(*) OVER()` window function in a single query.

### AGG-6 — Workspace-to-public migration Phase 1 should be implemented this cycle
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** architect F1, critic F4, designer F1, user-injected TODO
- **Evidence:**
  - `plans/open/2026-04-19-workspace-to-public-migration.md`: detailed migration plan exists
  - The workspace group has only 2 pages and duplicates dashboard navigation
  - Phase 1 (eliminate workspace route group) is low-risk
- **Suggested fix:** Implement Phase 1 of the migration plan this cycle.

### AGG-7 — PublicHeader lacks authenticated dropdown menu (prerequisite for migration Phase 2)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** designer F1, architect F1
- **Evidence:**
  - `src/components/layout/public-header.tsx:154-160`: shows only a single link when logged in
  - The migration plan calls for a "Dashboard" dropdown with role-appropriate links
- **Suggested fix:** Implement the authenticated dropdown as part of Phase 2 (or as a preparatory step for Phase 1).

### AGG-8 — `workspaceShell` i18n keys will become orphaned when workspace layout is removed
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer F6
- **Evidence:**
  - `src/app/(workspace)/layout.tsx:21`: uses `workspaceShell` translation keys
  - `messages/en.json`, `messages/ko.json`: contain `workspaceShell.*` keys
  - These keys become dead weight after the workspace-to-public migration
- **Suggested fix:** Audit and remove `workspaceShell.*` keys as part of Phase 1 migration.

### AGG-9 — Chat widget `editorCode` accepts up to 100KB per request
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** security-reviewer F4, critic F5
- **Evidence:**
  - `src/app/api/v1/plugins/chat-widget/chat/route.ts:39`: `editorCode: z.string().max(100000).nullish()`
  - Large code payloads increase AI API costs per request
- **Suggested fix:** Consider reducing max to 20KB or truncating before sending to AI provider.

### AGG-10 — No tests for admin submissions export, chat-logs, and anti-cheat GET endpoints
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** test-engineer F1, F2, F3
- **Evidence:**
  - `src/app/api/v1/admin/submissions/export/route.ts`: no tests
  - `src/app/api/v1/admin/chat-logs/route.ts`: no tests
  - `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (GET): no tests
- **Why it matters:** The unbounded CSV export and parseInt NaN bugs would have been caught by basic tests
- **Suggested fix:** Add unit tests for these endpoints.

### AGG-11 — Plugin API keys still stored as plaintext in DB (reconfirmed from cycle 2)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** security-reviewer F3, architect F4
- **Evidence:**
  - Already deferred as CRYPTO-01 in cycle 2
  - Re-confirming: `src/app/api/v1/plugins/chat-widget/chat/route.ts:171-189`
  - `src/lib/security/encryption.ts` and `src/lib/security/derive-key.ts` already exist for field-level encryption
- **Suggested fix:** (Deferred from cycle 2) Encrypt API key fields before storage.

## Verification results from prior-cycle fixes

| Fix | Status |
|---|---|
| Cycle 1 M1: Tags API NaN | CONFIRMED FIXED |
| Cycle 2 NAFIX-01: Audit/login-logs NaN | CONFIRMED FIXED |
| Cycle 2 CSV-01: CSV export limits | PARTIALLY FIXED (submissions export missed) |
| Cycle 1 M2: Proxy x-forwarded-host comment | CONFIRMED FIXED |
| Cycle 1 M3: sanitizeSubmissionForViewer optional param | CONFIRMED FIXED |
| Cycle 1 L1: Chat widget tool error handling | CONFIRMED FIXED |
| Cycle 2 RANK-01: Rankings dual-CTE | CONFIRMED FIXED |
| Cycle 2 PRACTICE-01: Practice page memory | CONFIRMED FIXED |
| Cycle 1 L2: `/languages` in proxy matcher | CONFIRMED FIXED |

## Lower-signal / validation-needed findings

- designer F3: skip-to-content link in PublicHeader — valid accessibility improvement but low priority
- designer F4: mobile menu outside-click dismiss — valid UX improvement but low priority
- debugger F3: exam session race condition documented via `onConflictDoNothing` — correct pattern, just needs a comment
- debugger F4: ICPC `Math.floor` for penalty — correct by ICPC convention, no fix needed
- perf-reviewer F4: contest scoring window function optimization — low impact, correct as-is

## Revalidated non-actions from prior cycles

### CLOSED-01: Password-complexity escalation requests are invalid under repo policy
- `AGENTS.md` explicitly forbids adding complexity requirements

### CLOSED-02: JSON-LD script-escaping is already fixed on current HEAD
- `src/components/seo/json-ld.tsx` uses `safeJsonForScript()`

### CLOSED-03: Shell-command prefix-bypass is already fixed on current HEAD
- `src/lib/compiler/execute.ts` uses `isValidCommandPrefix()`

### CLOSED-04: WorkspaceNav tracking on Korean text is safe
- `tracking-[0.18em]` applies only to English uppercase section label

## Agent failures
- No agent failures this cycle — all reviews completed successfully

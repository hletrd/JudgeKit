# Cycle 3 Security Review

**Date:** 2026-04-19
**Base commit:** f637c590
**Reviewer:** security-reviewer

## Findings

### F1 — Admin submissions CSV export is unbounded (DoS vector)
- **Severity:** HIGH
- **Confidence:** HIGH
- **File:** `src/app/api/v1/admin/submissions/export/route.ts:95-111`
- **Evidence:** Query has no `.limit()` / `.offset()`. All matching submission rows are fetched into memory, serialized to CSV, and returned in a single response.
- **Attack scenario:** An admin (or compromised admin account) requests `/api/v1/admin/submissions/export` on a deployment with hundreds of thousands of submissions. The server constructs the entire CSV in memory, exhausting RAM and potentially crashing the process.
- **Suggested fix:** Apply a maximum row limit (e.g., 10000). Return an error if the result would exceed the limit, or stream results.

### F2 — Chat-logs session list query has dual-query race condition
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/admin/chat-logs/route.ts:56-119`
- **Evidence:** The session list endpoint runs two separate queries — one for the paginated data (lines 56-112) and one for the total count (lines 114-119). New messages can be inserted between the two queries, causing the total count to be inconsistent with the displayed page.
- **Why it matters:** Minor data inconsistency in an admin tool. No security impact since both queries are read-only.
- **Suggested fix:** Use `COUNT(*) OVER()` window function in the main query (same pattern applied to rankings in cycle 2, RANK-01).

### F3 — Chat widget exposes AI provider API key configuration to admin via `getPluginState`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/plugins/chat-widget/chat/route.ts:171`
- **Evidence:** `const pluginState = await getPluginState("chat-widget", { includeSecrets: true });` — The `includeSecrets: true` flag retrieves API keys from the DB. These are then destructured into `config.openaiApiKey`, etc. at line 176-189.
- **Why it matters:** Already flagged in cycle 2 as CRYPTO-01 (deferred). Re-confirming the finding is still present. The API keys are only used server-side and never sent to the client, but a DB compromise would expose them in plaintext.
- **Suggested fix:** (Deferred from cycle 2 — see CRYPTO-01) Encrypt at rest using `derive-key.ts`/`encryption.ts`.

### F4 — Chat widget `editorCode` context parameter accepts up to 100KB
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/plugins/chat-widget/chat/route.ts:39`
- **Evidence:** `editorCode: z.string().max(100000).nullish()` — A 100KB editor code payload is included in every chat API request and forwarded to the AI provider, consuming tokens and potentially increasing cost.
- **Why it matters:** While the schema validates the max length, 100KB of code in a chat context is excessive and could cause unexpectedly high API costs per request.
- **Suggested fix:** Consider reducing the max to 20KB or truncating before sending to the AI provider.

### F5 — User deletion does not cascade-clean related rate-limit entries
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/app/api/v1/users/[id]/route.ts:461`
- **Evidence:** `await db.delete(users).where(eq(users.id, id))` — permanent user deletion does not clean up rate-limit entries keyed by user ID.
- **Why it matters:** Stale rate-limit entries accumulate, but they are already periodically cleaned by `inMemoryRateLimit` TTL. Low impact.
- **Suggested fix:** Consider adding cleanup in the deletion transaction, or rely on TTL-based expiry.

## Summary

Found 5 issues: 1 HIGH (unbounded CSV export — same as code-reviewer F2), 1 MEDIUM (plaintext API keys — reconfirmed from cycle 2), 3 LOW. The unbounded CSV export is the most critical new finding.

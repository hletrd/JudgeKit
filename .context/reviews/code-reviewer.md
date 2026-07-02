# Code Review — JudgeKit (/tmp/judgekit-local)

**Reviewer:** code-reviewer agent  
**Scope:** Next.js 16 app/API (`src/`), Rust judge worker and sidecars (`judge-worker-rs/`, `code-similarity-rs/`, `rate-limiter-rs/`), deployment scripts, static-site nginx, and unit tests.  
**Date:** 2026-07-03  

---

## Summary

This review focused on **code quality, logic correctness, edge-case handling, error taxonomy, state/data-flow, and maintainability** across the repository. The Cycle 2 aggregate review (`_aggregate.md`) contained a number of CRITICAL/HIGH findings; this report first validates the status of those fixes and then raises the remaining and newly-discovered issues.

**Overall verdict:** The large remediation passes (workspace cleanup, token revocation precision, CSRF origin check, monotonic rate-limiter clock, worker deregister semantics) are solid. However, several logic bugs and maintainability risks remain, the most important being a boolean-import corruption bug, a global PostgreSQL advisory lock that serializes all SSE connection attempts, missing rate limiting on a file-listing endpoint, and weak env-var integer parsing that accepts malformed values.

**Static checks run:**
- `npx tsc --noEmit` — **passes**.
- `cargo test` in `judge-worker-rs/` — **93 passed**.
- `cargo test` in `code-similarity-rs/` — **49 passed**.
- `cargo test` in `rate-limiter-rs/` — **3 passed**.

---

## Validation of Prior Aggregate Findings

| Aggregate issue | Status | Evidence |
|---|---|---|
| `createApiHandler` did not include `requestId` in error bodies | **Fixed** | `src/lib/api/handler.ts:125-133`, `288-310` |
| Token revocation used second-level comparison (one-second grace window) | **Fixed** | `src/lib/auth/session-security.ts:25-41` |
| CSRF origin check only consulted `AUTH_URL`, ignoring `allowedHosts` | **Fixed** | `src/lib/security/csrf.ts:7-30`, `src/lib/security/env.ts:213-241` |
| Compiler workspace leaked after `chown` to sandbox uid | **Fixed** | `src/lib/compiler/execute.ts` uses `cleanupCompilerWorkspace`; `judge-worker-rs/src/workspace.rs` implements `SandboxWorkspace` Drop |
| Code-similarity runs were not serialized; sidecar signal handling was weak | **Fixed** | `src/lib/assignments/code-similarity.ts:424-509`, `src/lib/assignments/code-similarity-client.ts:51-113` |
| `/compiler/run` consumed quota before capability check | **Fixed** | `src/app/api/v1/compiler/run/route.ts` (capability check runs before `gateSandboxEndpoint`) |
| Worker `deregister` did not fail on non-2xx responses | **Fixed** | `judge-worker-rs/src/api.rs:135-161` and unit tests `312-355` |
| Rate-limiter used wall-clock `SystemTime` for block decisions | **Fixed** | `rate-limiter-rs/src/main.rs:27-84`, `277-346` |
| `SecretString` did not zeroize on drop | **Fixed** | `judge-worker-rs/src/types.rs` (zeroize tests pass) |
| `/files` GET lacked a `rateLimit` config | **Still open** | `src/app/api/v1/files/route.ts:155-208` |
| `JUDGE_ALLOWED_IPS` unset defaulted to allow-all | **Still open by design** | `src/lib/judge/ip-allowlist.ts:24-55`, `213-232` |
| All SSE acquisitions shared one advisory lock key | **Still open** | `src/lib/realtime/realtime-coordination.ts:101` |
| `import.ts` boolean conversion was wrong | **Still open** | `src/lib/db/import.ts:87-89` |
| `system-settings-config.ts` accepted partial integer strings | **Still open** | `src/lib/system-settings-config.ts:90-109` |

---

## Findings

### HIGH

#### 1. Database import corrupts exported boolean strings (`"false"` → `true`)
- **File:** `src/lib/db/import.ts:87-89`
- **Problem:** `convertValue` handles boolean columns with `return Boolean(val);`. When a portable export stores a boolean as the string `"false"` (common in JSON/CSV-flavored exports), `Boolean("false")` evaluates to `true`. This silently flips every false-like string during restore.
- **Impact:** Restored booleans can be inverted, corrupting feature flags, exam modes, anti-cheat settings, etc.
- **Recommendation:** Use an explicit, case-insensitive string mapper:
  ```ts
  if (BOOLEAN_COLUMNS.has(colName)) {
    if (typeof val === "boolean") return val;
    if (typeof val === "string") {
      const s = val.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(s)) return true;
      if (["false", "0", "no", "off"].includes(s)) return false;
    }
    return Boolean(val);
  }
  ```
- **Test:** Add an import round-trip case that asserts `false`, `"false"`, `0`, `"0"`, `true`, `"true"`, and `1` all round-trip correctly.

#### 2. All SSE connection acquisitions are serialized on a single advisory lock
- **File:** `src/lib/realtime/realtime-coordination.ts:101`
- **Problem:** `acquireSharedSseConnectionSlot` uses a single lock key `"realtime:sse:acquire"` for every user/connection. This makes the slot-acquisition path globally serial, creating a concurrency bottleneck and a latency tail under load.
- **Impact:** With many concurrent SSE clients, connection setup queues behind a single PostgreSQL advisory lock; the DB is used as a global mutex rather than a per-user coordinator.
- **Recommendation:** Use a **per-user** advisory lock key for the user-level limit and an atomic query for the global limit, or partition the global lock key (e.g., by user-id hash). At minimum, document the intentional global serialization and add a metric/alert on lock-wait time.

#### 3. File listing endpoint has no rate limiting
- **File:** `src/app/api/v1/files/route.ts:155-208`
- **Problem:** The `GET` handler authenticates and authorizes but does not configure a `rateLimit` key. Because the route supports pagination and a `search` parameter, an authenticated client can repeatedly scrape or search the table without throttling.
- **Impact:** Enumeration, search abuse, and incidental DB load are unbounded.
- **Recommendation:** Add `rateLimit: "files:list"` to `createApiHandler`. If the limit should be user-keyed rather than IP-keyed, consume `consumeUserApiRateLimit` inside the handler after auth.

#### 4. `createApiHandler` swallows details for unhandled exceptions
- **File:** `src/lib/api/handler.ts:288-310`
- **Problem:** The catch block correctly surfaces `ApiError` instances with `code`, `message`, and `requestId`, but for unexpected `Error` objects it returns only `{ error: "internalServerError", requestId }`. This makes production incidents harder to diagnose because the client receives no error discriminant and the response body omits the `message` even though the error is already logged server-side.
- **Impact:** Operational debugging relies entirely on server logs; API consumers cannot correlate user reports with logged errors using a stable code.
- **Recommendation:** Consider a conservative taxonomy for well-known unexpected errors (e.g., Drizzle foreign-key violations, connection timeouts) and map them to operational codes, or include a safe `message` field for generic errors when `NODE_ENV !== "production"` and a generic code in production.

---

### MEDIUM

#### 5. CSRF check performs a database read on every mutation
- **File:** `src/lib/security/csrf.ts:7-30`, `src/lib/security/env.ts:213-252`
- **Problem:** `validateCsrf` calls `getExpectedHosts`, which calls `getTrustedAuthHosts`, which loads `systemSettings.allowedHosts` from the DB on every non-safe request. There is no in-memory cache for this host list.
- **Impact:** Extra DB round-trip and latency on every POST/PUT/PATCH/DELETE; the DB becomes a dependency of the CSRF gate.
- **Recommendation:** Cache the resolved host set for a short TTL (e.g., the same 15 s used by `getConfiguredSettings`) or load it through the existing settings cache. Invalidate on admin settings changes.

#### 6. Shell validators still wrap commands in `sh -c` and the prefix whitelist is bypassable
- **File:** `src/lib/compiler/execute.ts:187-277`
- **Problem:** `validateShellCommand` / `validateShellCommandStrict` are defense-in-depth over commands that are ultimately executed via `sh -c`. The strict validator only checks the first token of each `&&`/`;` segment against a prefix list, but an allowed prefix such as `python3`, `node`, or `Rscript` can still run arbitrary code supplied as an argument (e.g., `python3 -c '<arbitrary>'`).
- **Impact:** The comment correctly states the Docker sandbox is the primary boundary, but the validator gives a false sense of strictness. A compromised `language_configs` row can still execute arbitrary interpreted code inside the sandbox.
- **Recommendation:** Either (a) drop the misleading strict prefix check and rely on the documented sandbox boundary, or (b) move to a true allow-list of full command templates/arguments. If keeping the current model, add a comment that the prefix check is **not** a code-execution barrier.

#### 7. Environment integer parsing accepts malformed strings (`"10abc"` → `10`)
- **File:** `src/lib/system-settings-config.ts:90-109`
- **Problem:** `resolveValue` uses `parseInt(envVal, 10)` and only checks `Number.isFinite(parsed) && parsed >= 0`. `parseInt` stops at the first non-numeric character, so `"10abc"` is accepted as `10`.
- **Impact:** Operator typos such as `API_RATE_LIMIT_MAX=100x` are silently accepted as `100`, masking configuration errors.
- **Recommendation:** Validate the full string before parsing:
  ```ts
  if (!/^\d+$/.test(envVal)) { /* log warning and ignore */ }
  ```
  Apply the same fix to `src/proxy.ts:37` (`AUTH_CACHE_TTL_MS`) and `src/lib/data-retention.ts:18-23` for consistency.

#### 8. Judge IP allowlist defaults to allow-all when unset
- **File:** `src/lib/judge/ip-allowlist.ts:24-55`, `213-232`
- **Problem:** `JUDGE_ALLOWED_IPS` being empty or unset defaults to allowing all IPs unless `JUDGE_STRICT_IP_ALLOWLIST=1` is set. The code acknowledges this is intentional for backward compatibility.
- **Impact:** A leaked `JUDGE_AUTH_TOKEN` has no network-layer backstop in the default configuration.
- **Recommendation:** (Already documented, but worth repeating in onboarding/runbooks.) Schedule a future breaking change to flip the default to strict and require explicit `JUDGE_ALLOWED_IPS` or the strict opt-in flag.

#### 9. `getConfiguredSettings` is synchronous and can return stale values across instances
- **File:** `src/lib/system-settings-config.ts:162-173`
- **Problem:** `getConfiguredSettings` returns the in-process cached value synchronously and triggers a background refresh. In a multi-instance deployment, one instance writes a settings change and invalidates its own cache, but other instances continue serving stale settings for up to `CACHE_TTL_MS` (15 s).
- **Impact:** Brief inconsistency across instances after admin changes; acceptable for most settings, but problematic for security-relevant settings that are env-overridable anyway.
- **Recommendation:** Document the stale-window contract. For settings that must be strongly consistent across instances, read directly from the DB in the relevant route rather than relying on the cache.

#### 10. Unsafe type casts proliferate in boundary layers
- **Files/lines:** `src/lib/db/index.ts:92`, `src/lib/db/queries.ts:52`, `src/lib/db/export.ts:303,368`, `src/lib/auth/config.ts:379`, `src/lib/db/pre-restore-snapshot.ts:90`, `src/lib/recruiting/request-cache.ts:78`, `src/lib/plugins/chat-widget/providers.ts:264,407`
- **Problem:** Multiple `as unknown as X` casts are used at module boundaries. Most are guarded by adjacent validation, but they make refactors brittle because the compiler no longer enforces the boundary contract.
- **Impact:** A change in a downstream type can introduce runtime mismatches that TypeScript will not flag.
- **Recommendation:** Replace the highest-risk casts with runtime validators (Zod schemas or narrow predicate functions). Start with `src/lib/db/import.ts` and `src/lib/auth/config.ts`, where the casts protect auth input and DB restore data.

---

### LOW

#### 11. `code-similarity-client.ts` casts the sidecar response after parsing
- **File:** `src/lib/assignments/code-similarity-client.ts:93-97`
- **Problem:** The response is cast to `RustComputeResponse | null`; the follow-up `Array.isArray(responseBody.pairs)` check catches most malformed shapes, but the cast suppresses type narrowing for nested fields.
- **Recommendation:** Remove the cast and validate the shape explicitly (e.g., with a Zod schema or a recursive `Array.isArray` + field-type check).

#### 12. `similarity-check` route returns HTTP 200 for caller timeout
- **File:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:51-65`
- **Problem:** On `AbortError`, the route returns `apiSuccess({ status: "timed_out", ... })` with HTTP 200. This is an API design choice, but it deviates from the usual `apiError` pattern and may surprise API consumers expecting a 504/408.
- **Recommendation:** Document the behavior in the API contract. Consider returning 408/504 while still including the structured `timed_out` payload so retries/backoffs can be driven by the status code.

#### 13. `normalizeSource` discards entire lines starting with `#` that are not C preprocessor directives
- **File:** `src/lib/assignments/code-similarity.ts:56-64`
- **Problem:** For languages that use `#` for non-comment tokens (e.g., Markdown, shell, some config formats), the normalizer strips the rest of the line. This is irrelevant for similarity on C-family code but could produce misleading results if the normalizer is ever reused for broader text.
- **Recommendation:** Add a comment documenting that the normalizer is C/C++/JavaScript-oriented, or gate the preprocessor rule behind a language hint.

---

## Files Reviewed

- `src/lib/api/handler.ts`
- `src/lib/auth/session-security.ts`
- `src/lib/security/csrf.ts`
- `src/lib/security/env.ts`
- `src/lib/security/ip.ts`
- `src/lib/compiler/execute.ts`
- `src/lib/assignments/code-similarity.ts`
- `src/lib/assignments/code-similarity-client.ts`
- `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`
- `src/app/api/v1/contests/join/route.ts`
- `src/app/api/v1/files/route.ts`
- `src/app/api/v1/admin/restore/route.ts`
- `src/app/api/v1/admin/migrate/import/route.ts`
- `src/lib/db/import.ts`
- `src/lib/system-settings-config.ts`
- `src/lib/realtime/realtime-coordination.ts`
- `src/lib/judge/ip-allowlist.ts`
- `src/lib/db/index.ts`
- `src/lib/db/queries.ts`
- `src/lib/data-retention.ts`
- `src/proxy.ts`
- `judge-worker-rs/src/api.rs`
- `judge-worker-rs/src/workspace.rs`
- `code-similarity-rs/src/main.rs`
- `rate-limiter-rs/src/main.rs`

---

## Recommendations (Prioritized)

1. **Fix the boolean import bug** (`src/lib/db/import.ts`) and add a round-trip test before any production restore operation.
2. **Add rate limiting** to `GET /api/v1/files` (`src/app/api/v1/files/route.ts`).
3. **Re-evaluate the global SSE advisory lock** (`src/lib/realtime/realtime-coordination.ts`) to avoid a single lock key for all users.
4. **Harden integer env-var parsing** in `system-settings-config.ts`, `proxy.ts`, and `data-retention.ts` to reject partial strings.
5. **Cache or remove the DB read in CSRF validation** to reduce per-mutation latency.
6. **Clarify the trust boundary** in the shell-command validators or tighten them to a true template allow-list.
7. **Reduce unsafe casts** at auth and DB boundaries by introducing runtime validators.

---

*End of code-reviewer review.*

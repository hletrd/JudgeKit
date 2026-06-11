# Deep Code Quality Review — 2026-04-18

**Scope:** Type safety, error handling, database integrity, memory/performance, architecture, frontend quality, testing gaps
**Method:** Dedicated opus-grade code-reviewer agent, 64 tool calls across 25+ core files
**Files Reviewed:** src/lib/db/*, src/lib/auth/*, src/lib/compiler/*, src/lib/plugins/*, src/hooks/*, src/components/*, src/app/api/*

---

## Verdict: NEEDS CHANGES → REMEDIATION IN PROGRESS

**Remediation status as of 2026-04-19:** Both Critical and most High/Medium findings have been fixed. See commits `f0fcf27e` through `b542838e`.

2 Critical, 6 High, 9 Medium, 5 Low = **22 findings**

The codebase shows strong architectural instincts (centralized API handler, dual-mode SSE coordination, sophisticated draft persistence). Issues are concentrated in error handling discipline (systemic bare catches), type safety gaps in integration code, and data integrity gaps in the schema.

---

## Critical

### Q-CR1. Pervasive Bare `catch { }` Blocks Silently Swallowing Errors (120+ Sites)

**Files (representative):**
- `src/hooks/use-source-draft.ts:63,70,213`
- `src/components/problem/problem-submission-form.tsx:114`
- `src/components/exam/anti-cheat-monitor.tsx:31,43,72`
- `src/lib/security/env.ts:73,85,142`
- `src/lib/db/import.ts:119,248`
- `src/app/api/v1/users/[id]/route.ts:434`
- (and 110+ more)

Over 120 bare `catch {}` blocks across the codebase silently swallow errors with no logging, no rethrow, and no comment explaining why suppression is safe. The worst instances are in security-critical paths (`env.ts`) and data-handling paths (`import.ts`).

**Impact:** Production bugs become invisible. Security failures (encryption key validation, DB host parsing) are silently ignored, potentially allowing degraded security states to go undetected.

**Remediation:** For each catch block, either (a) log the error, (b) rethrow, or (c) add an `/* intentional: <reason> */` comment:
```typescript
// Before
} catch {
  return [];
}

// After
} catch (err) {
  logger.debug({ err }, "[env] Failed to load allowed hosts from DB, returning empty");
  return [];
}
```

---

### Q-CR2. Plaintext Recruiting Token Column with Active Unique Index

**File:** `src/lib/db/schema.pg.ts:939-960`

The `recruitingInvitations` table has a `token` column stored in plaintext with an active unique index `ri_token_idx`. The comment says "Plaintext token is deprecated" but the column is still nullable, still queryable via the index. A DB breach would leak all recruiting tokens alongside their hashes.

**Remediation:**
1. Drop `ri_token_idx` unique index on the plaintext `token` column
2. Migration to null-out existing plaintext values: `UPDATE recruiting_invitations SET token = NULL WHERE token IS NOT NULL`
3. Ensure all lookups use `tokenHash` exclusively (`ri_token_hash_idx` already exists)

---

## High

### Q-H1. `as any` Casts in Export Engine Bypass Type Safety

**File:** `src/lib/db/export.ts:182`

```typescript
const TABLE_ORDER: { name: string; table: any; orderColumns: string[] }[] = [
```

The `table` property typed as `any` means schema regressions (renamed columns, dropped tables) produce runtime errors instead of compile-time catches. The `any` propagates to `normalizeValue((row as any)[col])` at lines 134 and 344.

**Remediation:** Use a mapped type from the schema:
```typescript
import type * as Schema from "./schema";
type SchemaTable = typeof Schema[keyof typeof Schema];
const TABLE_ORDER: { name: string; table: SchemaTable; orderColumns: (keyof typeof table._.columns)[] }[] = [
```

---

### Q-H2. AI Chat Provider Response Parsing Uses `any` Casts Instead of Typed Schemas

**File:** `src/lib/plugins/chat-widget/providers.ts:114,227-228,233,244,365-366,371,382`

All three AI providers parse API responses with `(tc: any)`, `(b: any)`, `(p: any)` callbacks. No Zod validation or TypeScript interfaces for raw API response shapes.

**Remediation:** Define Zod schemas for each provider's response shape:
```typescript
import { z } from "zod";
const OpenAIToolCallSchema = z.object({
  id: z.string(),
  function: z.object({ name: z.string(), arguments: z.string() }),
});
const parsed = OpenAIToolCallSchema.parse(tc);
```

---

### Q-H3. `rateLimits` Table Uses `bigint` with `mode: "number"` Risking Precision Loss

**File:** `src/lib/db/schema.pg.ts:599-603`

```typescript
windowStartedAt: bigint("window_started_at", { mode: "number" }).notNull(),
blockedUntil: bigint("blocked_until", { mode: "number" }),
```

JavaScript `number` can only safely represent integers up to 2^53. Silent precision loss in rate-limit timestamps could cause incorrect rate-limit checks.

**Remediation:** Use `mode: "bigint"` and convert at the application boundary, or switch to `integer` (Unix epoch in seconds is sufficient for rate-limiting).

---

### Q-H4. SSE Connection Tracking — Unbounded In-Memory State Without Process-Exit Cleanup

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:25-26`

```typescript
const activeConnectionSet = new Set<string>();
const connectionInfoMap = new Map<string, ConnectionInfo>();
```

Module-level Sets/Maps accumulate connection metadata for the process lifetime. The periodic cleanup timer only evicts connections older than `sseTimeoutMs + 30s`. If the timer stalls, entries accumulate without bound.

**Remediation:**
1. Add a maximum size cap on `connectionInfoMap`
2. Register a `SIGTERM` handler that clears the maps
3. Consider `process.on("beforeExit", ...)` cleanup

---

### Q-H5. Export Engine Uses Offset-Based Pagination — Can Miss/Duplicate Rows Under Concurrent Writes

**File:** `src/lib/db/export.ts:295-318`

The non-streaming `exportDatabase()` collects all rows into a single array in memory via `selectTableChunks()`. For large tables (millions of submissions), this causes unbounded memory consumption and potential OOM.

**Remediation:** Remove or refactor the non-streaming path to use cursor-based (keyset) pagination. The streaming variant already does this correctly — consider deprecating the non-streaming path.

---

### Q-H6. `let created: any` in User Creation Route

**File:** `src/app/api/v1/users/route.ts:95`

The variable holding the newly created user is typed as `any`, losing all type safety.

**Remediation:** Type it explicitly with the expected return shape.

---

## Medium

### Q-M1. `db as any` Cast in Migration Script Suppresses Type Errors

**File:** `src/lib/db/migrate.ts:5`
```typescript
await migrate(db as any, { migrationsFolder: "./drizzle/pg" });
```

**Remediation:**
```typescript
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
await migrate(db as NodePgDatabase, { migrationsFolder: "./drizzle/pg" });
```

---

### Q-M2. Busy-Wait Polling in `waitForReadableStreamDemand`

**File:** `src/lib/db/export.ts:64-75`

```typescript
while (!isCancelled() && controller.desiredSize !== null && controller.desiredSize <= 0) {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
```

Creates a hot loop yielding with `setTimeout(resolve, 0)`, wasting CPU cycles under backpressure.

**Remediation:** `await new Promise((resolve) => setTimeout(resolve, 10));` — minimum 10ms yield.

---

### Q-M3. Duplicate `AuthUserRecord` Type Definition Across Auth Modules

**Files:** `src/lib/auth/config.ts:41-59`, `src/lib/auth/recruiting-token.ts:10-28`

Same type defined twice with a `mustChangePassword` nullability difference. Adding a new preference field to one and not the other causes stale JWT tokens.

**Remediation:** Extract `AuthUserRecord` to a shared `src/lib/auth/types.ts` and import from both locations.

---

### Q-M4. Uncontrolled Form Inputs with `defaultValue` Lose Sync with Server State

**Files:**
- `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:392,403,418,435,447`
- `src/app/(dashboard)/dashboard/problems/page.tsx:532,544,560`
- `src/app/(dashboard)/dashboard/admin/login-logs/page.tsx:268,279,299,311`
- `src/app/(dashboard)/dashboard/groups/page.tsx:227,237`
- `src/app/(dashboard)/dashboard/submissions/page.tsx:163`

Filter/search inputs use `defaultValue` instead of `value`. After navigation or param changes, inputs show stale values while filtered results reflect the new params.

**Remediation:** Use controlled inputs with `value` and `onChange`, deriving value from URL params or component state.

---

### Q-M5. Code Snapshot Fire-and-Forget Silently Swallows Errors

**File:** `src/components/problem/problem-submission-form.tsx:110-114`

```typescript
void apiFetch("/api/v1/code-snapshots", { ... }).catch(() => {});
```

**Remediation:** `.catch((err) => { logger.debug({ err }, "[snapshot] Failed to save code snapshot"); })`

---

### Q-M6. `RUNNER_AUTH_TOKEN` Logged as Error but Not Enforced at Startup

**File:** `src/lib/compiler/execute.ts:58-59`

(See S-H1 in security review — missing token is logged as error but app continues. Should be fatal in production.)

---

### Q-M7. `validateShellCommand` Regex Provides False Sense of Security

**File:** `src/lib/compiler/execute.ts:126-127`

`\beval\b` only catches standalone `eval`. Shell tricks like `bash -c eval` bypass. The sandbox is the true boundary.

**Remediation:** Remove regex and document sandbox as security boundary, or switch to an allowlist.

---

### Q-M8. No CHECK Constraints on Score and Penalty Ranges

**File:** `src/lib/db/schema.pg.ts:339,646`

`latePenalty` can be negative (becomes a bonus). `overrideScore` has no range constraint. The codebase already uses CHECK constraints elsewhere.

**Remediation:**
```typescript
check("assignments_late_penalty_nonneg", sql`late_penalty >= 0`),
```

---

### Q-M9. `Date.now()` Used for `$defaultFn` on Timestamp Columns — Redundant and Not Monotonic

**File:** `src/lib/db/schema.pg.ts:50-56`

```typescript
.$defaultFn(() => new Date(Date.now())),
```

**Remediation:** Simplify to `$defaultFn(() => new Date())`. Consider a Drizzle middleware or trigger for `updatedAt` automation.

---

## Low

### Q-L1. `console.log`/`console.warn` Used Instead of Structured Logger

**Files:** `src/lib/db/migrate.ts:4,6`, `src/lib/security/encryption.ts:36,70`, `src/lib/judge/sync-language-configs.ts:58,61,77`

**Remediation:** Replace with `logger.info/warn/error` calls.

---

### Q-L2. `better-sqlite3.d.ts` Declares `Database: any`

**File:** `src/types/better-sqlite3.d.ts:2`

Legacy type declaration. If SQLite is fully deprecated, remove it.

---

### Q-L3. SSE `generateConnectionId` Uses `Math.random()`

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:32`

Not collision-resistant. Use `crypto.randomUUID()`.

---

### Q-L4. Error Boundary Components Use `console.error`

**Files:** `src/app/(dashboard)/dashboard/submissions/error.tsx:17`, and 3 other error.tsx files

Client-side React error boundaries where `console.error` is acceptable. Consider a client-side error reporting service for production visibility.

---

### Q-L5. Default Password `"password"` in Bulk-Create Dialog

**File:** `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:43`

**Remediation:** Set default to empty string `""` and validate non-empty before submission.

---

## Testing Gaps (Critical Paths Without Coverage)

| Path | Risk | Missing Test |
|------|------|-------------|
| `src/lib/compiler/execute.ts` | **Critical** — most security-sensitive path | No test for Docker sandbox execution logic |
| `src/lib/plugins/chat-widget/providers.ts` | High — `any`-heavy parsing | No test for AI provider response parsing |
| `src/lib/db/export.ts` | Medium — streaming & chunking | `selectTableChunks` and streaming path untested |
| SSE route (`events/route.ts`) | Medium — connection tracking | Connection tracking and shared poll logic untested |

---

## Positive Observations

1. **Schema design is thorough**: 30+ indexes, cascade deletes, unique constraints, CHECK constraint on `active_tasks >= 0`.
2. **Security posture is strong**: Timing-safe dummy hashes, transparent Argon2id rehashing, CSRF, DOMPurify, HKDF key derivation.
3. **`createApiHandler` wrapper is excellent**: Centralized auth, CSRF, rate limiting, Zod validation, error handling — eliminates entire classes of route handler mistakes.
4. **SSE coordination is well-architected**: Dual-mode (in-memory vs. PostgreSQL advisory lock) with proper multi-instance warnings.
5. **Draft persistence is sophisticated**: `use-source-draft` properly handles SSR hydration, debounced persistence, visibility-change flushing, TTL-based expiry.
6. **Accessibility is good**: `aria-invalid`, `aria-describedby`, `role="alert"`, `aria-live="polite"`, `aria-current="page"`.
7. **Compiler sandbox is defense-in-depth**: Docker `--network=none`, `--cap-drop=ALL`, `--read-only`, seccomp, `--pids-limit`, `--user 65534`, output size capping.

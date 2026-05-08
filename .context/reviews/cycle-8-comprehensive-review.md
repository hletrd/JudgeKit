# Cycle 8 Comprehensive Review — JudgeKit (Current Run)

**Date:** 2026-05-09
**HEAD:** 871de9c4
**Reviewer:** Manual comprehensive pass
**Scope:** Full TypeScript/TSX source review focusing on:
1. Unvalidated `as` casts on `.json().catch()` patterns (same family fixed in cycles 6-7)
2. Sidecar client contracts
3. Stream resource management
4. API route correctness and auth checks

---

## Total NEW Findings

**2 HIGH, 0 MEDIUM, 0 LOW**

---

## Findings

### C8-1: [HIGH] `tryRustRunner` unvalidated `as` cast returns malformed `CompilerRunResult`

**Confidence:** HIGH
**File+line:** `src/lib/compiler/execute.ts:563`
**Pattern:** Same unvalidated-cast-after-json-catch family as C6/C7 fixes

```typescript
const data = (await response.json().catch(() => null)) as CompilerRunResult | null;
if (!data) {
  logger.warn(...);
  return null;
}
return data;
```

If the Rust compiler runner sidecar returns valid JSON but without the expected fields (e.g., `{}`, `{ error: "..." }`, or a future API version with renamed fields), `data` is truthy and passes the `!data` check. The caller at `executeCompilerRun:590-591` does:

```typescript
const rustResult = await tryRustRunner(options);
if (rustResult !== null) return rustResult;
```

This returns the malformed result directly to callers. The `playground/run` route returns it to the client, and any other caller that invokes `executeCompilerRun` directly receives an object with `undefined` fields where strings/booleans/numbers are expected.

**Concrete failure scenario:** A deployment misconfiguration or sidecar upgrade causes the Rust runner to return `{}` instead of the expected `{ stdout, stderr, exitCode, executionTimeMs, timedOut, oomKilled, compileOutput }` shape. A user runs code in the playground and receives an object with all fields undefined, causing downstream UI crashes when rendering output.

**Fix:** Add runtime shape validation before returning:
```typescript
if (!data || typeof data.stdout !== "string" || typeof data.stderr !== "string" || typeof data.timedOut !== "boolean" || typeof data.oomKilled !== "boolean") {
  logger.warn(...);
  return null;
}
return data;
```

---

### C8-2: [HIGH] `callWorkerJson` generic unvalidated `as T` cast returns wrong-typed data to all callers

**Confidence:** HIGH
**File+line:** `src/lib/docker/client.ts:114-117`
**Pattern:** Same unvalidated-cast-after-json-catch family

```typescript
const data = await response.json().catch(() => {
  throw new Error("Worker returned non-JSON response");
}) as T;
return data;
```

This generic function is used by multiple callers:
- `listDockerImages()` expects `DockerImage[]`
- `inspectDockerImage()` expects `Record<string, unknown>`
- `buildDockerImage()` expects `{ logs: string }`
- `getDiskUsage()` expects disk usage object

If the worker returns valid JSON with an unexpected shape (e.g., `{}`, error envelope, renamed fields), all callers receive wrong-typed data. For example, `buildDockerImage` does:

```typescript
const response = await callWorkerJson<{ logs: string }>("/docker/build", ...);
return { success: true, logs: response.logs };  // response.logs is undefined
```

**Concrete failure scenario:** The judge worker sidecar is upgraded and changes its response envelope shape. An admin triggers a Docker image build from the language config UI. The app receives unexpected JSON, `response.logs` is `undefined`, and the UI displays an empty log or crashes when accessing undefined as string.

**Fix:** Since `callWorkerJson` is generic and used for multiple shapes, add runtime validation at each call site that consumes the data. For `buildDockerImage`, verify `typeof response.logs === "string"`. For `listDockerImages`, validate the returned array elements have the required string fields.

Alternatively, change `callWorkerJson` to accept an optional validator function (same pattern already adopted in `rate-limiter-client.ts` in cycle 7).

---

## Areas Verified (No Issues Found)

- `rate-limiter-client.ts` correctly uses the `validate` parameter (cycle 7 fix verified at HEAD).
- `code-similarity-client.ts` correctly validates `Array.isArray(data.pairs)` (cycle 7 fix verified at HEAD).
- `export-with-files.ts` stream reader lock properly released in finally block (cycle 6 fix verified).
- `chat-widget.tsx` stream reader lock properly released in finally block (cycle 6 fix verified).
- `use-submission-polling.ts` correctly handles SSE JSON parse failures (cycle 6 fix verified).
- `locale-switcher.tsx` correctly wraps cookie ops in try/catch (cycle 5 fix verified).
- `export.ts` abort signal listener properly removed in finally block.
- `api-key-auth.ts` fire-and-forget lastUsedAt update properly catches errors.
- `proxy.ts` auth cache eviction and redirect sanitization look correct.
- `csrf.ts` validation covers all required headers.
- `createApiHandler` wrapper correctly enforces auth, CSRF, rate limiting, and Zod validation.
- Judge claim/poll/heartbeat routes have proper auth, input validation, and atomic DB operations.
- File upload route has proper MIME validation, magic-byte checks, ZIP bomb protection, and size limits.
- File delete route has proper authz checks (files.manage or own file + files.upload).
- Backup/restore routes have password re-confirmation, CSRF checks, and integrity manifest validation.
- `data-retention-maintenance.ts` timer properly unref'd and cleanup function correctly clears global.
- `audit/events.ts` flush timer properly unref'd and buffer overflow handling is correct.
- `hcaptcha.ts` response parsing properly handles optional fields with safe defaults.
- `import-transfer.ts` generic `as T` casts are mitigated by downstream `validateExport()` calls.
- `system-settings-config.ts` env-var parsing has NaN/Infinity guards.

---

## Commonly Missed Issue Sweep

- No additional unvalidated `as` casts after `.json().catch(() => null)` were found in newly-reviewed files beyond C8-1 and C8-2.
- All stream reader locks are properly managed.
- No missing auth checks on non-public API routes.
- No SQL injection vectors in newly-reviewed code.
- No XSS vulnerabilities in newly-reviewed code.

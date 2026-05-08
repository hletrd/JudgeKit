# Comprehensive Code Review — Cycle 5 (2026-05-01 RPF loop)

**Reviewer:** comprehensive-reviewer
**Scope:** Full codebase deep review, focusing on code quality, logic, security, performance, architecture
**HEAD at review:** `5e2c9f75`
**Diff since cycle 4 close:** `6789b0d6..5e2c9f75` (4 source commits + 1 plan archive)

---

## Review Summary

The codebase is mature and well-structured. Cycle 4 fixes (stopSensitiveDataPruning globalThis cleanup, countdown-timer stagger, batchedDelete JSDoc, apiFetch Accept header) are correctly implemented. No new HIGH-severity findings this cycle. Two new MEDIUM findings and one LOW finding identified.

---

## New Findings

### C5-CR-1: `docker/client.ts` `callWorkerJson` calls `response.json()` after `response.ok` check but `readError` helper does not [MEDIUM]

**File:** `src/lib/docker/client.ts:32-38`
**Confidence:** Medium

The `readError()` helper (line 32-38) calls `response.json()` without `.catch()`:
```ts
async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json() as { error?: string };
    return data.error ?? `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}
```

This is actually fine because `readError` is only called when `!response.ok` and it has a try-catch. However, `callWorkerJson` (line 57) calls `response.json()` after `response.ok` is confirmed true, but if the response Content-Type is not JSON (e.g., the worker returns HTML on some error path that happens to return 200), this would throw an unhandled error.

**Failure scenario:** A misconfigured judge worker returns 200 with HTML body. `callWorkerJson` would throw a SyntaxError that propagates to the caller.

**Suggested fix:** Wrap `response.json()` in `callWorkerJson` with `.catch()`:
```ts
return response.json().catch(() => { throw new Error("Worker returned non-JSON response") }) as Promise<T>;
```

**Severity:** MEDIUM — A misconfigured worker could cause unhandled exceptions in admin API routes. The existing callers have try-catch, but the error message would be confusing.

### C5-CR-2: `docker/client.ts` `JUDGE_WORKER_URL` aliased from `COMPILER_RUNNER_URL` creates naming confusion [MEDIUM]

**File:** `src/lib/docker/client.ts:7`
**Confidence:** Medium

```ts
const JUDGE_WORKER_URL = process.env.COMPILER_RUNNER_URL || "";
```

The variable name `JUDGE_WORKER_URL` reads from `COMPILER_RUNNER_URL`. In `src/lib/compiler/execute.ts:56`, the same env var is read as `COMPILER_RUNNER_URL`. This dual naming creates a maintenance risk: a developer looking for "judge worker" configuration would not think to check `COMPILER_RUNNER_URL`.

**Failure scenario:** An operator sets `JUDGE_WORKER_URL` env var thinking it configures the Docker client, but the actual env var needed is `COMPILER_RUNNER_URL`. The Docker API calls silently use the empty string, falling back to local Docker operations.

**Suggested fix:** Add a comment or JSDoc at line 7 noting the alias, or add `JUDGE_WORKER_URL` as a fallback:
```ts
const JUDGE_WORKER_URL = process.env.JUDGE_WORKER_URL || process.env.COMPILER_RUNNER_URL || "";
```

**Severity:** MEDIUM — Configuration confusion risk for operators. No runtime bug since the code works with `COMPILER_RUNNER_URL`.

### C5-CR-3: `docker/client.ts` `buildDockerImageLocal` does not validate `dockerfilePath` against directory traversal before `spawn` [LOW]

**File:** `src/lib/docker/client.ts:148-149, 163`
**Confidence:** High

```ts
if (/\.\.|[/\\]/.test(dockerfilePath.replace(/^docker\/Dockerfile\./, ""))) {
  return { success: false, error: "Invalid dockerfile path" };
}
```

The validation strips the `docker/Dockerfile.` prefix before checking for `..` and `/`/`\`. This means a path like `docker/Dockerfile../etc/passwd` would pass because after stripping the prefix, the remaining `./etc/passwd` contains a `/`. But the regex also checks for `/`, so this is actually caught.

However, the `docker/Dockerfile.` prefix is stripped with a simple string replacement, not anchored. A value like `xdocker/Dockerfile.test` would strip to `xtest`, which would pass validation but `spawn("docker", ["build", "-t", imageName, "-f", "xdocker/Dockerfile.test", "."])` would use a path that doesn't exist (harmless — Docker would fail to find the Dockerfile).

**Actual risk:** Low. The validation is sufficient for preventing directory traversal attacks. The worst case is a non-existent Dockerfile path, which Docker itself would reject.

**Suggested fix:** Anchor the prefix check more strictly or use path.resolve + check that the resolved path starts with the expected directory.

**Severity:** LOW — No exploitable vulnerability, but defense-in-depth improvement.

---

## Previously Fixed Issues Verified as Correctly Fixed

### Cycle 4 fixes verified at HEAD:

1. **C4-AGG-1** (`stopSensitiveDataPruning` globalThis cleanup) — Verified at `src/lib/data-retention-maintenance.ts:127-137`. Both `pruneTimer` and `globalThis.__sensitiveDataPruneTimer` are now cleared on stop. Correct.

2. **C4-AGG-2** (Countdown timer stagger) — Verified at `src/components/exam/countdown-timer.tsx:95-147`. `recalculate(staggerToasts)` parameter works correctly. `handleVisibilityChange` calls `recalculate(true)`. Stagger uses 2-second delays. Correct.

3. **C4-AGG-3** (batchedDelete JSDoc) — Verified at `src/lib/data-retention-maintenance.ts:12-19`. JSDoc documents PostgreSQL-specific `ctid` and non-portable nature. Correct.

4. **C4-AGG-4** (apiFetch Accept header) — Verified at `src/lib/api/client.ts:84-86`. `Accept: application/json` added with `!headers.has("Accept")` guard. Correct.

---

## Carry-Forward Registry — Status Verified at HEAD

All previously deferred items remain valid and unchanged. No severity downgrades. No security/correctness/data-loss findings deferred.

---

## Areas Reviewed with No New Findings

- `src/lib/security/encryption.ts` — Plaintext fallback properly documented (C7-AGG-7), warn-log in place.
- `src/lib/plugins/secrets.ts` — `isValidEncryptedPluginSecret()` fix verified (CR11-1, CR12-1).
- `src/lib/security/in-memory-rate-limit.ts` — BACKOFF_CAP matching, eviction logic correct.
- `src/lib/security/sanitize-html.ts` — DOMPurify properly configured with strict allowlists.
- `src/components/seo/json-ld.tsx` — `safeJsonForScript` properly escapes `</script` and `<!--`.
- `src/lib/auth/recruiting-token.ts` — Token fingerprint uses SHA-256, AUTH_USER_COLUMNS restricts query.
- `src/lib/assignments/exam-sessions.ts` — DB server time used for temporal comparisons, idempotent start.
- `src/hooks/use-visibility-polling.ts` — Proper cleanup, recursive setTimeout, jitter for thundering herd.
- `src/app/api/v1/admin/backup/route.ts` — Password re-confirmation, try-catch on request.json().
- `src/app/api/v1/admin/migrate/export/route.ts` — Same pattern as backup. Correct.
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE connection tracking, stale entry cleanup, shared polling, slot release in error path. Well-structured.
- `src/lib/realtime/realtime-coordination.ts` — PostgreSQL advisory lock, DB server time.
- `src/lib/docker/client.ts` — Input validation on image references, auth token handling.
- `src/lib/security/env.ts` — Auth secret validation, placeholder detection, allowed hosts from DB.

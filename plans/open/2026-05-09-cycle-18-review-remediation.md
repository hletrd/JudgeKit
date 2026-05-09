# Cycle 18 Remediation Plan

**Date:** 2026-05-09
**Based on:** `.context/reviews/cycle-18-aggregate.md` and per-agent reviews
**HEAD:** a102df09 (post-cycle-17)
**Review base:** 75d82a17

---

## Verification of Prior Findings

Several findings from the cycle-18 aggregate review were **already resolved** between the review base (75d82a17) and current HEAD. These are recorded below so they are not double-fixed.

| ID | Finding | Status | Evidence |
|----|---------|--------|----------|
| B2 | Admin routes discard `needsRehash` | **ALREADY FIXED** | All four routes (`backup`, `restore`, `migrate/export`, `migrate/import`) use `verifyAndRehashPassword()` which transparently rehashes internally (see `src/lib/security/password-hash.ts:63-83`) |
| B4 | Internal cleanup endpoint lacks rate limiting | **ALREADY FIXED** | `src/app/api/internal/cleanup/route.ts:44` already calls `consumeApiRateLimit(request, "internal:cleanup")` |
| B8 | Import-transfer string concat OOM | **ALREADY FIXED** | `src/lib/db/import-transfer.ts:18-30` uses `Uint8Array[]` accumulation, not string concat |
| B10 | Git index phantom files | **ALREADY FIXED** | `git status` at HEAD no longer lists non-existent component files; entries were cleaned up |

---

## Active Tasks

### C18-1: Add Production Guard to `decryptPluginSecret` Plaintext Fallback [MEDIUM]

- **Files:** `src/lib/plugins/secrets.ts:52-55`, `tests/unit/plugins.secrets.test.ts`
- **Severity:** MEDIUM
- **Status:** DONE
- **Commit:** `0d6c5b33`
- **Source:** Security N1, Architect N2, Critic N2, Test N1
- **Description:** `decryptPluginSecret()` returns raw value unchanged if it lacks the `enc:v1:` prefix. Unlike `decrypt()` in `encryption.ts:98-117` which throws in production, the plugin function has NO safeguard. An attacker with DB write access can bypass AES-GCM authenticity by writing plaintext to a plugin config column.
- **Fix:** Add production-safe fallback matching `encryption.ts` pattern:
  1. In `decryptPluginSecret`, check `process.env.NODE_ENV === "production"` before returning plaintext
  2. If production and not encrypted, throw an error with a message similar to `encryption.ts`
  3. If non-production, log a warning and return as-is (for migration/debugging)
  4. Add a new option parameter `{ allowPlaintextFallback?: boolean }` for callers that explicitly need the old behavior during migration
- **Test updates:**
  - Add test: valid encrypted secret decrypts correctly (already implicitly covered, but add direct `decryptPluginSecret` test)
  - Add test: non-encrypted value throws in production (`NODE_ENV=production`)
  - Add test: non-encrypted value returns as-is with warning in non-production
  - Add test: `{ allowPlaintextFallback: true }` bypasses the production check

---

### C18-2: Extend Recruiting Context Caching Beyond API Routes [MEDIUM]

- **Files:** `src/lib/recruiting/access.ts:34-91`, `src/lib/api/handler.ts:109`
- **Severity:** MEDIUM
- **Status:** DONE
- **Commit:** `67bd5241`
- **Note:** Verified all call sites are covered by React `cache()` (RSC pages) or `withRecruitingContextCache` (API routes via `createApiHandler`). No server actions call recruiting functions. Updated JSDoc to document coverage and warn about server-action gap.
- **Source:** Code F1, Perf F1, Architect F1, Security F2, Critic N1, Test F1
- **Description:** `getRecruitingAccessContext` performs 2 DB queries per call. `withRecruitingContextCache` in `api/handler.ts:109` only covers routes using `createApiHandler`. Page components (RSC) and server actions that call `getRecruitingAccessContext` directly are NOT covered by the AsyncLocalStorage cache, though they ARE covered by React `cache()`.
- **Analysis:** The function already uses `React cache()` at line 102-108, which deduplicates within a single RSC render. The AsyncLocalStorage cache at lines 38-39, 88 handles API routes. The concern is server actions — do they use React `cache()`? Server actions run outside the RSC render tree, so they would not benefit from React `cache()`.
- **Fix:** Wrap `getRecruitingAccessContext` with React `cache()` AND ensure server actions also use `withRecruitingContextCache`. Alternatively, verify whether server actions are a real call site.
  1. Audit all call sites of `getRecruitingAccessContext` to identify which ones are in server actions vs RSC vs API routes
  2. If server actions call it directly, add `withRecruitingContextCache` wrapper to server action entry points
  3. Consider adding `React.cache()` at a higher level if not already present
- **Test updates:**
  - Add test verifying that multiple calls to `getRecruitingAccessContext` within the same request only execute 2 DB queries total (already partially tested via `withRecruitingContextCache` tests, but extend to cover direct calls)

---

### C18-3: Consolidate Dual Rate-Limit Implementations [MEDIUM]

- **Files:** `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`, `src/lib/security/rate-limit-core.ts`
- **Severity:** MEDIUM
- **Status:** DONE
- **Commit:** `7084f899`
- **Note:** Extracted `fetchRateLimitEntry` shared helper into `rate-limit-core.ts`. Both modules now delegate SELECT FOR UPDATE reads to the shared core, preventing bug-fix drift while preserving each module's specific semantics (exponential backoff vs fixed window). Updated `rate-limit.test.ts` mock to support both query-builder chaining orders.
- **Source:** Architect N1, Perf N2
- **Description:** Two modules implement similar DB-backed token bucket logic with different semantics on the same `rateLimits` table. Both use `SELECT ... FOR UPDATE` row locking. Bug fixes may not propagate between implementations, and row locking causes contention under burst load.
- **Fix:** Extract a shared `DbRateLimiter` class or utility that both modules use.
  1. Analyze the two implementations to identify shared logic:
     - `rate-limit.ts`: `atomicConsumeRateLimit`, `getDbNowMs`, `getApiRateLimitConfig`
     - `api-rate-limit.ts`: `atomicConsumeRateLimit`, `getDbNowMs`, request deduplication, `consumeApiRateLimit` wrapper
  2. Extract shared core (token bucket algorithm, DB write) into `src/lib/security/rate-limit-core.ts`
  3. Keep `rate-limit.ts` as the server-action rate limiter and `api-rate-limit.ts` as the API route wrapper, both delegating to the shared core
  4. Ensure the shared core handles both `NextRequest`-based and server-action-based callers
- **Note:** This is a medium-complexity refactor. Do not change rate-limit semantics or table schema.

---

### C18-4: Add `.catch()` to Auto Code Review Trigger [LOW]

- **File:** `src/app/api/v1/judge/poll/route.ts:206-208`
- **Severity:** LOW
- **Status:** DONE
- **Commit:** `df133c98` (initial), `a0f14070` (Promise.resolve safety fix)
- **Source:** Security N2, Debugger N1
- **Description:** `void triggerAutoCodeReview(submissionId)` creates a floating promise. If the function throws (DB timeout, AI provider error), the unhandled rejection may crash the process when `--unhandled-rejections=strict`.
- **Fix:** Add `.catch()` with structured logging:
  ```typescript
  void triggerAutoCodeReview(submissionId).catch((err) => {
    logger.warn({ err, submissionId }, "[auto-review] trigger failed");
  });
  ```
- **Test updates:** Mock `triggerAutoCodeReview` to reject and verify no unhandled rejection occurs.

---

### C18-5: Strengthen `resolveStoredPath` Path Traversal Defense [LOW]

- **File:** `src/lib/files/storage.ts:18-27`, `tests/unit/files/storage-path-traversal.test.ts`
- **Severity:** LOW
- **Status:** DONE
- **Commit:** `e396240e`
- **Source:** Security N3, Test N2
- **Description:** `resolveStoredPath()` only checks for `/`, `\`, and `..`. It does not explicitly reject null bytes, control characters, or names starting with `.` (hidden files). While current callers use `nanoid()`-generated names, future reuse could be vulnerable.
- **Fix:** Replace the ad-hoc check with a strict allowlist:
  ```typescript
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]+$/.test(storedName)) {
    throw new Error("Invalid stored file name");
  }
  ```
  This rejects: leading `.`, null bytes, control characters, path separators, and empty strings.
- **Test updates:**
  - Add test for leading dot: `.hidden`, `..`, `.gitignore`
  - Add test for null byte: `file\x00.txt`
  - Add test for control characters: `file\x01.txt`
  - Add test for empty string: `""`
  - Verify existing tests still pass

---

### C18-6: Validate Docker Repository in Prune Route Path Construction [LOW]

- **File:** `src/app/api/v1/admin/docker/images/prune/route.ts:18-21`
- **Severity:** LOW
- **Status:** DONE
- **Commit:** `ac8db895`
- **Source:** Security N5
- **Description:** `join("docker", \`Dockerfile.${img.repository}\`)` constructs a path from Docker image repository names without validation. If `img.repository` contains `/` (e.g., a registry-prefixed image like `registry.example.com/judge-cpp`), the join creates an unexpected subdirectory path `docker/Dockerfile.registry.example.com/judge-cpp`.
- **Fix:** Validate `img.repository` with `isAllowedJudgeDockerImage(img.repository)` before path construction, or extract the base image name (last segment after `/`) for the Dockerfile name. Given the filter is `judge-*`, repositories with `/` are unlikely but not impossible if a registry-prefixed judge image exists.
  ```typescript
  if (!isAllowedJudgeDockerImage(img.repository)) return;
  const dockerfilePath = join("docker", `Dockerfile.${img.repository}`);
  ```
- **Note:** The `isAllowedJudgeDockerImage` import is already available at `src/lib/judge/docker-image-validation.ts`.

---

## Deferred Items

| ID | Finding | Severity | Justification | Exit Criteria |
|----|---------|----------|---------------|---------------|
| D-B5 | Chat widget `editorCode` sent unfiltered to AI | LOW | Performance/cost concern, not security or correctness. Truncation may degrade UX for users with large codebases. | Deferred until token-cost monitoring is in place or provider imposes hard limits |
| D-B6 | `execTransaction` build-phase non-atomic fallback | LOW | Already extensively documented with inline warning at `src/lib/db/index.ts:60-66`. Build-phase fallback is required for type-checking. No production impact. | Deferred until build-phase can be eliminated (e.g., separate build-time DB) |
| D-B7 | Contest analytics progression not parallelized | LOW | The progression query (lines 241-284) is already behind `includeTimeline` flag and only runs when explicitly requested. Adding to `Promise.all` would parallelize with other queries but the overall endpoint is already multi-query. | Deferred until status-board latency is reported as a user-visible issue |
| D-B9 | Docker build output buffer unbounded | LOW | Buffer is capped at 2MB (`MAX_TOTAL`) with head/tail truncation. Not unbounded. | Deferred until concurrent build volume increases beyond current levels |
| D-B12 | WeakMap request deduplication fragile | LOW | Comment at line 57-60 already documents the limitation. Next.js request object boundary behavior is a framework constraint. AsyncLocalStorage migration is nontrivial and may not fully solve middleware dedup. | Deferred until rate-limit token duplication causes measurable quota issues |
| D-B13 | API key auth detection fragile | LOW | `"_apiKeyAuth" in user` is a convention used consistently. Symbol migration would require changing the auth user type and all consumers. No known exploit path. | Deferred until auth system undergoes broader refactoring |
| D-B14 | Chat route type casts mask design issue | LOW | Three `as unknown as NextResponse` casts exist because streaming `Response` objects are returned from a function typed as `NextResponse`. Refactoring to `Promise<Response>` is a type-only change with no runtime impact. | Deferred until Next.js streaming types stabilize or route is refactored |
| D-B15 | Workspace-to-public migration Phase 3 | LOW | Already archived in `plans/archive/2026-04-29-archived-workspace-to-public-migration.md`. No active work. | Deferred indefinitely until product priority changes |

---

## Carry-Forward Deferred (from Prior Cycles)

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| A19 | `new Date()` clock skew risk | LOW | Deferred |
| A7 | Dual encryption key management | MEDIUM | Deferred |
| A12 | Inconsistent auth/authorization patterns | MEDIUM | Deferred |
| A25 | Timing-unsafe bcrypt fallback | LOW | Deferred — bcrypt-to-argon2 migration in progress (transparent via `verifyAndRehashPassword`) |
| A26 | Polling-based backpressure wait | LOW | Deferred |
| D17 | Exam session `new Date()` clock skew | LOW | Deferred |
| F7 | Contest analytics first-AC IOI mismatch | LOW | Documented, deferred |
| F4 | Leaderboard frozen double computation | LOW | Deferred |

---

## Gate Results

- [x] `npx eslint .` passes (0 errors, 0 warnings)
- [x] `npx tsc --noEmit` passes
- [x] `npx next build` passes
- [x] `npx vitest run` passes (314 files, 2352 tests)
- [x] `npx vitest run --config vitest.config.component.ts` passes (66 files, 179 tests)

---

## Implementation Order

Recommended order to minimize conflicts and maximize safety:

1. **C18-4** (unhandled promise) — trivial one-liner, no dependencies
2. **C18-5** (path traversal) — self-contained, touches one file + tests
3. **C18-6** (prune route validation) — self-contained, touches one file
4. **C18-1** (plugin secret plaintext fallback) — security-critical, requires new tests
5. **C18-2** (recruiting context caching) — may affect multiple call sites, test thoroughly
6. **C18-3** (rate limit consolidation) — most complex, leave for last to avoid destabilizing other fixes

---

## Dependencies

- C18-1 depends on understanding `encryption.ts` plaintext fallback pattern
- C18-2 may depend on C18-3 if recruiting routes use rate limiting (unlikely — separate concerns)
- C18-3 should be implemented independently after all other fixes to isolate any regressions
- No other cross-dependencies

# Cycle 1 Review Remediation Plan

**Date:** 2026-05-08
**Review source:** `.context/reviews/_aggregate.md` (cycle 1/100)
**HEAD:** main / 5cec65e8
**Goal:** Fix actionable findings from the deep code review; defer items that require architecture changes or are out of scope.

---

## Items to implement this cycle

### 1. C1 — `execTransaction` build-phase fallback documentation
- **File:** `src/lib/db/index.ts`
- **Task:** Add prominent JSDoc warning that the build-phase fallback does NOT use transactions. Ensure callers that require atomicity (rate limits, submissions) are aware.
- **Status:** OPEN

### 2. C5 — `cleanupOrphanedContainers` uses `docker ps` JSON format
- **File:** `src/lib/compiler/execute.ts`
- **Task:** Switch from tab-delimited parsing to `--format '{{json .}}'` parsing, consistent with `listDockerImagesLocal`.
- **Status:** OPEN

### 3. C6 — `WeakMap` deduplication comment clarification
- **File:** `src/lib/security/api-rate-limit.ts`
- **Task:** Update comment to clarify that the deduplication is best-effort and may not trigger in practice.
- **Status:** OPEN

### 4. C9 — `proxy.ts` env validation error handling
- **File:** `src/proxy.ts`
- **Task:** Wrap `getValidatedAuthSecret()` and `getAuthUrlObject()` calls in try/catch to return graceful 500 instead of unhandled exception.
- **Status:** OPEN

### 5. S2 — `sql.raw()` documentation in recruiting invitations
- **File:** `src/lib/assignments/recruiting-invitations.ts`
- **Task:** Add JSDoc warning on `FAILED_REDEEM_ATTEMPTS_KEY` declaring it must remain a compile-time constant. Add inline comment explaining `sql.raw()` safety.
- **Status:** OPEN

### 6. S5 — `RUNNER_AUTH_TOKEN` empty string treatment
- **File:** `src/lib/compiler/execute.ts`
- **Task:** Treat empty string `""` as missing token in all environments when `COMPILER_RUNNER_URL` is set. Require explicit opt-in to disable auth.
- **Status:** OPEN

### 7. S6 — Server action origin dev bypass narrowing
- **File:** `src/lib/security/server-actions.ts`
- **Task:** Restrict the development-mode origin bypass to localhost/127.0.0.1 origins only, rather than any origin.
- **Status:** OPEN

### 8. T1 — Test proxy auth cache
- **File:** New test file
- **Task:** Add unit tests for `getCachedAuthUser`, `setCachedAuthUser`, and FIFO eviction logic.
- **Status:** OPEN

### 9. T2 — Test container cleanup
- **File:** New test file
- **Task:** Add unit tests for `cleanupOrphanedContainers` with mocked `docker ps` output.
- **Status:** OPEN

### 10. T3 — Test rate-limit eviction timer
- **File:** New test file
- **Task:** Add unit tests for `startRateLimitEviction` and `stopRateLimitEviction` timer behavior.
- **Status:** OPEN

---

## Deferred items (must record exit criteria)

| ID | Severity | File/Line | Reason for deferral | Exit criterion |
|---|---|---|---|---|
| S1 | MEDIUM | `next.config.ts:162` | Production CSP `unsafe-inline` requires Next.js architecture change to dynamic nonce generation. Large scope. | AGG1-17 deferred; re-open when Next.js 16 stable supports dynamic CSP in config headers OR when proxy middleware runs in production |
| S3 | MEDIUM | `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:150` | JSON LIKE pattern is fragile but functional. Refactoring to JSON operators is out of scope for this cycle. | Re-open when audit-logs page is refactored to use `jsonb_extract_path_text()` |
| S4 | LOW | `src/lib/files/storage.ts` | Path validation gaps require lstat symlink checks. Low risk (nanoid-generated names). | Re-open if file storage is refactored to support admin-uploaded custom filenames |
| S7 | LOW | `src/lib/docker/client.ts` | Docker build context restriction requires build system changes. | Re-open when Dockerfile build context is restricted to `docker/build-context/` |
| C2 | MEDIUM | `src/lib/judge/auto-review.ts` | Queue size race is low-impact (pLimit internal). | Re-open if auto-review queue overflows are observed in production |
| C3 | MEDIUM | `src/lib/compiler/execute.ts` | Container stop/remove leak is best-effort cleanup. | Re-open if orphaned container accumulation is observed |
| C4 | LOW | `src/lib/compiler/execute.ts` | Timestamp parsing laxness is defensive against Docker format changes. | Re-open if Docker changes timestamp format |
| C7 | LOW | `src/proxy.ts` | FIFO vs LRU is a minor optimization. | Re-open if auth cache miss rate is measured >20% under load |
| P1 | MEDIUM | `src/lib/assignments/submissions.ts` | Cartesian product requires pagination of status board. | Re-open when status board pagination is designed |
| P2 | MEDIUM | `src/proxy.ts` | Auth cache eviction requires `lru-cache` adoption. | Re-open when auth cache is refactored to use `lru-cache` |
| P3 | MEDIUM | `src/lib/security/api-rate-limit.ts` | Dual DB calls require rate-limit consolidation (A1). | Re-open when rate-limit modules are consolidated per AGG1-4 |
| P4 | LOW | `src/lib/compiler/execute.ts` | Serial cleanup is acceptable for background task. | Re-open if cleanup takes >5s observed |
| A1 | MEDIUM | `src/lib/security/rate-limit.ts`, `api-rate-limit.ts` | Triple rate-limit implementation requires consolidation cycle. | AGG1-4 deferred; re-open when rate-limit consolidation is scheduled |
| A2 | MEDIUM | `src/lib/recruiting/access.ts` | Dual cache complexity is functional. | Re-open when recruiting context is refactored to unified request storage |
| A3 | LOW | `src/lib/compiler/execute.ts` | Compiler path complexity is manageable. | Re-open when execution mode selection is refactored |
| A5 | LOW | `src/proxy.ts` | Responsibility overload is manageable at current size. | Re-open when proxy exceeds 500 lines OR middleware is split |
| B1 | MEDIUM | `src/lib/docker/client.ts` | Docker build spawn error handling requires timeout restructuring. | Re-open when Docker build is refactored |
| B2 | LOW | `src/lib/compiler/execute.ts` | Stream destroy race is harmless (minor overshoot). | Re-open if output truncation is observed to be inaccurate |
| B3 | MEDIUM | `src/lib/security/rate-limit.ts` | Window behavior on block is intentional but undocumented. | Re-open when rate-limit documentation is updated |
| B5 | LOW | `src/app/api/v1/judge/claim/route.ts` | Rust runner validation is authoritative. | Re-open if Rust-side validation gaps are found |
| T4 | LOW | `src/lib/docker/client.ts` | Docker build paths covered by integration tests. | Re-open when Docker build unit tests are added |
| T5 | LOW | `src/lib/files/validation.ts` | Magic-byte tests exist but may lack negative cases. | Re-open when file upload test suite is expanded |
| T6 | LOW | `src/lib/assignments/submissions.ts` | Anti-cheat tests require mock DB setup. | Re-open when anti-cheat test harness is built |
| D2 | LOW | `src/app/layout.tsx` | Missing themeColor is cosmetic. | Re-open when viewport metadata is enhanced |
| D3 | LOW | `src/app/(dashboard)/dashboard/admin/page.tsx` | Loading skeleton is cosmetic. | Re-open when admin section UX is refreshed |
| D5 | LOW | Various dialogs | Focus trap requires Radix UI verification. | Re-open when dialog accessibility audit is scheduled |

---

## Prior cycle deferred items (still valid)

All items from `_aggregate.md` prior cycle deferred list remain valid. See that file for full inventory.

---

## Implementation order

1. C9 (proxy env validation) — correctness, low risk
2. C5 (docker ps JSON parsing) — reliability, matches existing pattern
3. C6 (WeakMap comment) — documentation, trivial
4. C1 (execTransaction docs) — documentation, trivial
5. S6 (server action origin) — security, low risk
6. S5 (RUNNER_AUTH_TOKEN) — security, low risk
7. S2 (sql.raw docs) — security, trivial
8. T1-T3 (tests) — test coverage

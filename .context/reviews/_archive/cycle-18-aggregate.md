# Cycle 18 Aggregate Review

**Date:** 2026-05-09
**Cycle:** 18 of 100
**Base commit:** 75d82a17
**Agents:** security-reviewer, code-reviewer, perf-reviewer, architect, debugger, critic, test-engineer

---

## Methodology

This aggregate deduplicates findings across all per-agent reviews. Where multiple agents flagged the same issue, the highest severity/confidence is preserved. Cross-agent agreement strengthens signal. Previously deferred items are tracked separately.

---

## Critical / High Priority

None identified this cycle. The codebase maintains strong overall security and correctness posture.

---

## Medium Priority

### A1: Plugin Secret Decryption Has Silent Plaintext Fallback (Security N1, Architect N2, Critic N2)

- **File**: `src/lib/plugins/secrets.ts:54`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: `decryptPluginSecret()` returns raw value unchanged if it lacks `enc:v1:` prefix. Unlike `decrypt()` in `encryption.ts` which throws in production, the plugin function has NO safeguard. Attacker with DB write access bypasses AES-GCM authenticity.
- **Fix**: Add production rejection matching `encryption.ts` pattern. Add unit tests for the new behavior.

### A2: `getRecruitingAccessContext` N+1 Queries — Caching Only Partial (Code F1, Perf F1, Architect F1, Security F2, Critic N1, Test F1)

- **File**: `src/lib/recruiting/access.ts:14-66`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: Called from 15+ locations, performs 2 DB queries per call. `withRecruitingContextCache` in `api/handler.ts:109` only covers `createApiHandler` routes. Page components and server actions still cause redundant queries.
- **Fix**: Extend caching to all entry points (pages, server actions) or use React `cache()` wrapper.

### A3: Rate Limit Dual Implementation with Divergent Logic (Architect N1)

- **Files**: `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: Two modules implement similar token bucket logic with different semantics on the same `rateLimits` table. Bug fixes may not propagate. Row locking contention under load.
- **Fix**: Extract shared `DbRateLimiter` class. Deferred per comments but should be scheduled.

---

## Low Priority

### B1: Unhandled Promise in Auto Code Review Trigger (Security N2, Debugger N1)

- **File**: `src/app/api/v1/judge/poll/route.ts:206`
- **Severity**: LOW
- **Confidence**: HIGH
- **Fix**: Add `.catch()` with logging.

### B2: Admin Routes Still Discard `needsRehash` (Security F1, Critic N3, Test F2)

- **Files**: `src/app/api/v1/admin/backup/route.ts`, `restore/route.ts`, `migrate/export/route.ts`, `migrate/import/route.ts`
- **Severity**: LOW
- **Confidence**: HIGH
- **Fix**: Add rehash logic after successful password verification.

### B3: `resolveStoredPath` Incomplete Path Traversal Defense (Security N3, Test N2)

- **File**: `src/lib/files/storage.ts:18-27`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Fix**: Restrict to `[a-zA-Z0-9._-]+`, reject leading `.`.

### B4: Internal Cleanup Endpoint Lacks Rate Limiting (Security F3)

- **File**: `src/app/api/internal/cleanup/route.ts:7-24`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Fix**: Add `consumeApiRateLimit(request, "internal:cleanup")` or restrict to internal IPs.

### B5: Chat Widget `editorCode` Sent Unfiltered to AI (Perf N4)

- **File**: `src/app/api/v1/plugins/chat-widget/chat/route.ts:54`
- **Severity**: LOW
- **Confidence**: HIGH
- **Fix**: Truncate or summarize before sending to provider.

### B6: `execTransaction` Build-Phase Non-Atomic Fallback (Code N3, Architect N4)

- **File**: `src/lib/db/index.ts:67-75`
- **Severity**: LOW
- **Confidence**: HIGH
- **Fix**: Add warning or throw for transaction-required ops during build.

### B7: Contest Analytics Progression Not Parallelized (Perf F2)

- **File**: `src/lib/assignments/contest-analytics.ts:241-276`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Fix**: Add progression query to `Promise.all` batch.

### B8: Import-Transfer String Concatenation OOM Risk (Code F2, Debugger F1)

- **File**: `src/lib/db/import-transfer.ts:20`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Fix**: Use `file.arrayBuffer()` or `Uint8Array` accumulation.

### B9: Docker Build Output Buffer Unbounded (Perf N3, Debugger N2)

- **File**: `src/lib/docker/client.ts:239-292`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Fix**: Stream to logs instead of buffering.

### B10: Git Index Reports Non-Existent Untracked Files (Debugger N4, Test N4)

- **Evidence**: `git status` lists phantom component files and tests
- **Severity**: LOW
- **Confidence**: HIGH
- **Fix**: `git rm --cached` phantom entries.

### B11: Prune Route Unvalidated Docker Repository in Path (Security N5)

- **File**: `src/app/api/v1/admin/docker/images/prune/route.ts:21`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Fix**: Validate `img.repository` before path construction.

### B12: WeakMap Request Deduplication Fragile (Security N4)

- **File**: `src/lib/security/api-rate-limit.ts:61-71`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Fix**: Use AsyncLocalStorage for reliable deduplication.

### B13: API Key Auth Detection Fragile (Code N1)

- **File**: `src/lib/api/handler.ts:141`
- **Severity**: LOW
- **Confidence**: HIGH
- **Fix**: Use Symbol or branded type.

### B14: Chat Route Type Casts Mask Design Issue (Code N2)

- **File**: `src/app/api/v1/plugins/chat-widget/chat/route.ts:126,419,523`
- **Severity**: LOW
- **Confidence**: HIGH
- **Fix**: Return `Response` or refactor to `NextResponse`.

### B15: Workspace-to-Public Migration Phase 3 Stalled (Architect F3, Critic F3)

- **File**: `plans/open/2026-04-19-workspace-to-public-migration.md`
- **Severity**: LOW
- **Confidence**: HIGH
- **Fix**: Slim down AppSidebar to icon-only; defer breadcrumb and control merge.

---

## Previously Fixed (Since April 19)

| Finding | Status | Evidence |
|---------|--------|----------|
| F1: Conflicting audit retention env vars | FIXED | `db/cleanup.ts` now imports from `data-retention.ts` |
| F3: `cleanupOldEvents` ignores legal hold | FIXED | `isDataRetentionLegalHold()` check added |
| F5: SSE O(n) connection counting | FIXED | `userConnectionCounts` Map added |
| F6: `cleanupOldEvents` redundant with in-process pruner | FIXED | Marked deprecated, uses canonical config |
| SSE re-auth IIFE unhandled rejections | FIXED | `.catch()` handlers present |
| `recruiting-token.ts` column restriction | FIXED | Uses `AUTH_USER_COLUMNS` |

---

## Previously Deferred (Still Active)

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| A19 | `new Date()` clock skew risk | LOW | Deferred |
| A7 | Dual encryption key management | MEDIUM | Deferred |
| A12 | Inconsistent auth/authorization patterns | MEDIUM | Deferred |
| A25 | Timing-unsafe bcrypt fallback | LOW | Deferred — bcrypt-to-argon2 migration in progress |
| A26 | Polling-based backpressure wait | LOW | Deferred |
| D17 | Exam session `new Date()` clock skew | LOW | Deferred |
| F7 | Contest analytics first-AC IOI mismatch | LOW | Documented, deferred |
| F4 | Leaderboard frozen double computation | LOW | Deferred |

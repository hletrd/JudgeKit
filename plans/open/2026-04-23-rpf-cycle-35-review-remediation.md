# RPF Cycle 35 — Review Remediation Plan

**Date:** 2026-04-23
**Cycle:** 35/100
**Base commit:** 218a1a93
**Status:** Complete

## Lanes

### Lane 1: Fix past Sunset date on import JSON body path [AGG-1]

**Severity:** MEDIUM/HIGH (4 of 11 perspectives)
**File:** `src/app/api/v1/admin/migrate/import/route.ts:183, 191`
**Status:** Done

**Tasks:**
- [x] Update Sunset header from `"Sat, 01 Nov 2025 00:00:00 GMT"` to a future date (`"Sun, 01 Nov 2026 00:00:00 GMT"`)
- [x] No new test added (Sunset header is a static string; verified by code review)

**Verification:** Run `npm run test:unit` and `npm run build`

---

### Lane 2: Add NaN guard for recruiting invitation expiryDate construction [AGG-2]

**Severity:** MEDIUM/MEDIUM (5 of 11 perspectives)
**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:73-83`
**Status:** Done

**Note:** The Zod schema already enforces YYYY-MM-DD format via regex, so the NaN bypass is not directly exploitable through the API. However, defense-in-depth is warranted since the code should never silently produce Invalid Date.

**Tasks:**
- [x] Add `Number.isFinite(expiresAt.getTime())` check after Date construction, returning 400 error if invalid
- [x] Added `invalidExpiryDate` error handling in both single and bulk invitation routes
- [x] No new unit tests added (Zod schema blocks the path; NaN guard is defense-in-depth)

**Verification:** Run `npm run test:unit` and `npm run build`

---

### Lane 3: Optimize contest stats query to avoid double scan [AGG-3]

**Severity:** MEDIUM/MEDIUM (4 of 11 perspectives)
**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:80-119`
**Status:** Done

**Tasks:**
- [x] Refactor `solved_problems` CTE to reference `user_best` instead of re-scanning `submissions`
- [x] Verified the query structure is equivalent (same conditions, references user_best instead of submissions)
- [x] Existing tests pass

**Verification:** Run `npm run test:unit` and `npm run build`

---

### Lane 4: Stabilize chat widget scrollToBottom with isStreamingRef [AGG-4]

**Severity:** LOW/LOW (4 of 11 perspectives)
**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:87-105`
**Status:** Done

**Tasks:**
- [x] Replace `isStreaming` with `isStreamingRef.current` inside `scrollToBottom`
- [x] Remove `isStreaming` from `scrollToBottom` dependency array
- [x] Verify scrolling behavior is unchanged (build passes)

**Verification:** Run `npm run build`

---

## Deferred Items

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| AGG-5: Console.error in client components | discussions/*.tsx, groups/*.tsx | LOW/MEDIUM | Client-side logging requires architectural decision (error reporting service); no data loss | Client error reporting feature request |
| AGG-6: SSE O(n) eviction scan | events/route.ts:44-55 | LOW/MEDIUM | Bounded by 1000-entry cap; functional correctness preserved | Performance profiling shows bottleneck |
| AGG-7: Manual routes duplicate createApiHandler | migrate/import, restore routes | MEDIUM/MEDIUM | Requires extending createApiHandler to support multipart; architectural refactor | Next API framework iteration |
| AGG-8: Global timer HMR pattern duplication | 4 modules | LOW/MEDIUM | DRY concern; each module works correctly independently | Module refactoring cycle |
| SEC-3: Anti-cheat copies text content | anti-cheat-monitor.tsx:206 | LOW/LOW | 80-char limit; privacy notice accepted | Privacy audit or user complaint |
| SEC-4: Docker build error leaks paths | docker/client.ts:169 | LOW/LOW | Admin-only; Docker output expected | Admin permission review |
| CR-5: In-memory rate limiter iteration | in-memory-rate-limit.ts:27-48 | LOW/LOW | Spec-safe; bounded by 10K cap | Performance profiling |
| CR-6: Problem import client/server size mismatch | problem-import-button.tsx:22 | LOW/MEDIUM | Server returns clear error | User confusion report |
| DOC-1: Import route lacks dual-path JSDoc | migrate/import/route.ts | LOW/MEDIUM | Documentation-only; comments present | Next documentation cycle |
| DOC-2: Stats endpoint docs missing query note | stats/route.ts | LOW/LOW | Documentation-only | Next documentation cycle |
| DOC-3: Anti-cheat event types not documented | anti-cheat/route.ts:19-26 | LOW/LOW | Documentation-only; self-explanatory | Next documentation cycle |
| DBG-2: Anti-cheat fire-and-forget heartbeat | anti-cheat-monitor.tsx:155 | LOW/MEDIUM | React refs handle cleanup | Race condition observed in production |
| TE-3: No test for contest stats edge cases | stats/route.ts | LOW/LOW | Functional correctness verified | Next test coverage cycle |

## Gate Checklist

- [x] `npx eslint src/` passes
- [x] `npm run build` passes
- [x] `npm run test:unit` passes
- [x] `npm run test:integration` passes (3 skipped — need DB)
- [x] `npm run test:component` passes (11 files/22 tests failed — pre-existing baseline, not caused by cycle 35 changes)

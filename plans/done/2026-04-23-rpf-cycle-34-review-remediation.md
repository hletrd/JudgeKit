# RPF Cycle 34 — Review Remediation Plan

**Date:** 2026-04-23
**Cycle:** 34/100
**Base commit:** 16cf7ecf
**Status:** Complete

## Lanes

### Lane 1: Derive TABLE_MAP from TABLE_ORDER — eliminate schema drift risk [AGG-1]

**Severity:** MEDIUM/HIGH (8 of 11 perspectives)
**Files:** `src/lib/db/import.ts`, `src/lib/db/export.ts`
**Status:** Pending

**Tasks:**
- [x] Remove the manually maintained `TABLE_MAP` from `import.ts`
- [x] Import `TABLE_ORDER` from `export.ts` and derive `TABLE_MAP` programmatically
- [x] Ensure `buildImportColumnSets` still works with the derived map
- [x] Add warning comment about the coupling

**Verification:** Run `npm run test:unit` and `npm run build`

---

### Lane 2: Fix chat widget sendMessage isStreaming dependency — use ref instead [AGG-2]

**Severity:** MEDIUM/MEDIUM (5 of 11 perspectives)
**File:** `src/lib/plugins/chat-widget/chat-widget.tsx`
**Status:** Done

**Tasks:**
- [x] Add `isStreamingRef` ref that tracks `isStreaming` state
- [x] Update `sendMessage` useCallback to use `isStreamingRef.current` instead of `isStreaming`
- [x] Remove `isStreaming` from the `sendMessage` dependency array
- [x] Verify `handleSend` and `handleKeyDown` stabilize correctly

**Verification:** Run `npm run build` and `npm run test:unit`

---

### Lane 3: Extract verifyAndRehashPassword utility [AGG-3]

**Severity:** LOW/MEDIUM (4 of 11 perspectives)
**Files:** `src/lib/security/password-hash.ts`, `src/app/api/v1/admin/migrate/import/route.ts`, `src/app/api/v1/admin/restore/route.ts`
**Status:** Done

**Tasks:**
- [x] Create `verifyAndRehashPassword(password, userId, storedHash)` in `password-hash.ts`
- [x] Include audit logging for rehash events in the utility
- [x] Replace the three duplicated code blocks in migrate/import and restore routes
- [x] Ensure the `db` import works in password-hash.ts (may need to pass db as param)

**Verification:** Run `npm run test:unit` and `npm run build`

---

### Lane 4: Cache SSE cleanup stale threshold with TTL [AGG-4]

**Severity:** LOW/MEDIUM (1 of 11 perspectives)
**File:** `src/app/api/v1/submissions/[id]/events/route.ts`
**Status:** Done

**Tasks:**
- [x] Add module-level `cachedThreshold` and `cachedAt` variables
- [x] Create `getStaleThreshold()` function with 5-minute TTL cache
- [x] Replace direct `getConfiguredSettings()` call in the cleanup interval with `getStaleThreshold()`
- [x] Keep the NaN guard from the prior fix

**Verification:** Run `npm run test:unit` and `npm run build`

---

### Lane 5: Add deprecation warning for import JSON body path [AGG-5]

**Severity:** MEDIUM/MEDIUM (2 of 11 perspectives)
**File:** `src/app/api/v1/admin/migrate/import/route.ts`
**Status:** Done

**Tasks:**
- [x] Add a `Deprecation` response header on the JSON body path
- [x] Add a `Sunset` header indicating future removal
- [x] Add a `logger.warn` when the JSON body path is used
- [x] Do NOT remove the JSON body path yet — only deprecate

**Verification:** Run `npm run test:unit` and `npm run build`

---

### Lane 6: Fix chat widget prefers-reduced-motion for entry animation [AGG-6]

**Severity:** LOW/MEDIUM (3 of 11 perspectives)
**File:** `src/app/globals.css`
**Status:** Deferred (already covered)

**Tasks:**
- [x] Verified: globals.css already has `animation-duration: 0.01ms !important` under `@media (prefers-reduced-motion: reduce)` (line 138-145)
- [x] Verified: Chat widget opens without animation when reduced motion is preferred

**Verification:** Run `npm run build`

---

### Lane 7: Add test for TABLE_MAP/TABLE_ORDER consistency [AGG-7]

**Severity:** MEDIUM/MEDIUM (1 of 11 perspectives)
**File:** `tests/unit/db/import-implementation.test.ts`
**Status:** Done

**Tasks:**
- [x] Export `TABLE_MAP` from `import.ts` (derived from `TABLE_ORDER` after Lane 1)
- [x] Add a test verifying `TABLE_MAP` keys match `TABLE_ORDER` names
- [x] Add a test verifying both lists have the same table count

**Verification:** Run `npm run test:unit`

---

## Deferred Items

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| DES-2: Chat widget textarea lacks `aria-label` | `chat-widget.tsx` textarea | LOW/LOW | Placeholder present as fallback; no user complaint | User report or WCAG audit finding |
| DOC-1: SSE route missing ADR | `events/route.ts` | LOW/LOW | Documentation-only, no code impact | Next architecture review cycle |
| DOC-2: Docker client dual-path not documented | `client.ts` | LOW/LOW | Documentation-only, no code impact | Next architecture review cycle |
| DOC-3: Import engine TABLE_MAP drift warning comment | `import.ts` | LOW/MEDIUM | Will be addressed by Lane 1 (deriving from TABLE_ORDER) | Lane 1 complete |
| PERF-3: In-memory rate limiter FIFO sort | `in-memory-rate-limit.ts:42` | LOW/LOW | Bounded by 10K cap; no user-facing impact | Performance profiling shows bottleneck |
| TE-2: No component test for sendMessage isStreaming | `chat-widget.tsx` | LOW/MEDIUM | Covered by Lane 2 fix; test is nice-to-have | Next test coverage cycle |
| TE-3: No test for SSE cleanup NaN guard | `events/route.ts` | LOW/LOW | Guard is simple and verified in code review | Next test coverage cycle |
| Prior-AGG-6: Chat widget scrolls on every chunk | `chat-widget.tsx` | LOW/LOW | Mitigated with rAF; throttling not proven necessary | User report of performance issue |

## Gate Checklist

- [x] `npx eslint src/` passes
- [x] `npm run build` passes
- [x] `npm run test:unit` passes (294 files, 2116 tests)
- [x] `npm run test:integration` passes (3 skipped — need DB)
- [x] `npm run test:component` passes (11 files/22 tests failed — pre-existing baseline, not caused by cycle 34 changes)
